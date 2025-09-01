/**
 * keen API Gateway - WebSocket Management
 * Real-time streaming and admin monitoring with authentication
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedWebSocket, StreamingEvent } from '../types.js';
import { keen } from '../../index.js';
import { AuditLogger } from '../services/AuditLogger.js';
import { AuthenticationService } from '../services/AuthenticationService.js';

interface WebSocketConnection {
  ws: WebSocket;
  userId: string;
  isAdmin: boolean;
  adminPrivileges: Record<string, any> | null;
  sessionFilters: string[];
  connectionId: string;
  connectedAt: Date;
  lastPingAt: Date;
  subscriptions: Set<string>;
}

export class WebSocketManager {
  private connections: Map<string, WebSocketConnection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map(); // userId -> connectionIds
  private sessionSubscriptions: Map<string, Set<string>> = new Map(); // sessionId -> connectionIds
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private wss: WebSocketServer,
    private keenDB: keen,
    private auditLogger: AuditLogger
  ) {
    this.setupWebSocketServer();
    this.startHeartbeat();
    this.startCleanup();
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      try {
        await this.handleConnection(ws, req);
      } catch (error) {
        console.error('WebSocket connection error:', error);
        ws.close(1008, 'Authentication failed');
      }
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    console.log('✅ WebSocket server event handlers configured');
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const connectionId = uuidv4();
    const url = new URL(req.url!, `ws://localhost:3000`);
    
    // Extract authentication token
    const token = url.searchParams.get('token') || 
                 req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      ws.close(1008, 'Authentication token required');
      return;
    }

    try {
      // Verify JWT token (simplified - normally use AuthenticationService)
      // TODO: Integrate proper authentication
      const mockUser = {
        id: 'user_123',
        isAdmin: token.includes('admin'),
        adminPrivileges: token.includes('admin') ? { view_all_sessions: true } : null
      };

      // Get session filters from query params
      const sessionFilters = url.searchParams.get('sessions')?.split(',') || [];

      const connection: WebSocketConnection = {
        ws,
        userId: mockUser.id,
        isAdmin: mockUser.isAdmin,
        adminPrivileges: mockUser.adminPrivileges,
        sessionFilters,
        connectionId,
        connectedAt: new Date(),
        lastPingAt: new Date(),
        subscriptions: new Set()
      };

      // Store connection
      this.connections.set(connectionId, connection);
      
      // Track user connections
      if (!this.userConnections.has(mockUser.id)) {
        this.userConnections.set(mockUser.id, new Set());
      }
      this.userConnections.get(mockUser.id)!.add(connectionId);

      // Setup connection event handlers
      this.setupConnectionHandlers(connection);

      // Send welcome message
      this.sendToConnection(connectionId, {
        event_type: 'connection_established',
        timestamp: new Date().toISOString(),
        session_id: 'system',
        data: {
          connection_id: connectionId,
          user_id: mockUser.id,
          admin_access: mockUser.isAdmin,
          session_filters: sessionFilters,
          privileges: mockUser.adminPrivileges,
          features: {
            real_time_streaming: true,
            admin_monitoring: mockUser.isAdmin,
            session_filtering: true,
            heartbeat: true
          }
        }
      });

      // Log connection
      await this.auditLogger.logAdminAction({
        adminUserId: mockUser.id,
        action: 'websocket_connect',
        details: {
          connection_id: connectionId,
          is_admin: mockUser.isAdmin,
          session_filters: sessionFilters,
          client_ip: this.getClientIP(req)
        }
      });

      console.log(`🔗 WebSocket connected: ${connectionId} (user: ${mockUser.id}, admin: ${mockUser.isAdmin})`);

    } catch (error) {
      console.error('WebSocket authentication failed:', error);
      ws.close(1008, 'Authentication failed');
      
      // Log failed connection
      await this.auditLogger.logSecurityEvent({
        type: 'invalid_token',
        ip: this.getClientIP(req),
        details: {
          reason: 'websocket_auth_failed',
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Setup event handlers for a specific connection
   */
  private setupConnectionHandlers(connection: WebSocketConnection): void {
    const { ws, connectionId } = connection;

    ws.on('message', async (data) => {
      try {
        await this.handleMessage(connectionId, data);
      } catch (error) {
        console.error(`Message handling error for ${connectionId}:`, error);
      }
    });

    ws.on('close', async (code, reason) => {
      await this.handleDisconnection(connectionId, code, reason?.toString());
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${connectionId}:`, error);
    });

    ws.on('pong', () => {
      this.handlePong(connectionId);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(connectionId: string, data: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          await this.handleSubscribe(connectionId, message.session_id);
          break;
          
        case 'unsubscribe':
          await this.handleUnsubscribe(connectionId, message.session_id);
          break;
          
        case 'ping':
          this.sendToConnection(connectionId, {
            event_type: 'pong',
            timestamp: new Date().toISOString(),
            session_id: 'system',
            data: { connection_id: connectionId }
          });
          break;
          
        case 'admin_command':
          if (connection.isAdmin) {
            await this.handleAdminCommand(connectionId, message);
          } else {
            this.sendToConnection(connectionId, {
              event_type: 'error',
              timestamp: new Date().toISOString(),
              session_id: 'system',
              data: {
                error: 'INSUFFICIENT_PRIVILEGES',
                message: 'Admin privileges required'
              }
            });
          }
          break;
          
        default:
          console.log(`Unknown message type: ${message.type}`);
      }
      
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      this.sendToConnection(connectionId, {
        event_type: 'error',
        timestamp: new Date().toISOString(),
        session_id: 'system',
        data: {
          error: 'INVALID_MESSAGE_FORMAT',
          message: 'Invalid JSON message'
        }
      });
    }
  }

  /**
   * Handle session subscription
   */
  private async handleSubscribe(connectionId: string, sessionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Add to session subscriptions
    if (!this.sessionSubscriptions.has(sessionId)) {
      this.sessionSubscriptions.set(sessionId, new Set());
    }
    this.sessionSubscriptions.get(sessionId)!.add(connectionId);
    connection.subscriptions.add(sessionId);

    this.sendToConnection(connectionId, {
      event_type: 'subscription_confirmed',
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      data: {
        session_id: sessionId,
        subscribed: true,
        admin_access: connection.isAdmin
      }
    });

    console.log(`📡 ${connectionId} subscribed to session ${sessionId}`);
  }

  /**
   * Handle session unsubscription
   */
  private async handleUnsubscribe(connectionId: string, sessionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from session subscriptions
    const sessionSubs = this.sessionSubscriptions.get(sessionId);
    if (sessionSubs) {
      sessionSubs.delete(connectionId);
      if (sessionSubs.size === 0) {
        this.sessionSubscriptions.delete(sessionId);
      }
    }
    connection.subscriptions.delete(sessionId);

    this.sendToConnection(connectionId, {
      event_type: 'subscription_cancelled',
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      data: {
        session_id: sessionId,
        subscribed: false
      }
    });

    console.log(`📡 ${connectionId} unsubscribed from session ${sessionId}`);
  }

  /**
   * Handle admin commands
   */
  private async handleAdminCommand(connectionId: string, message: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.isAdmin) return;

    switch (message.command) {
      case 'get_active_sessions':
        const activeSessions = Array.from(this.sessionSubscriptions.keys());
        this.sendToConnection(connectionId, {
          event_type: 'admin_response',
          timestamp: new Date().toISOString(),
          session_id: 'system',
          data: {
            command: 'get_active_sessions',
            active_sessions: activeSessions,
            total_connections: this.connections.size,
            admin_connections: Array.from(this.connections.values()).filter(c => c.isAdmin).length
          }
        });
        break;
        
      case 'broadcast_message':
        if (message.target_session) {
          await this.broadcastToSession(message.target_session, {
            event_type: 'admin_broadcast',
            timestamp: new Date().toISOString(),
            session_id: message.target_session,
            data: {
              message: message.broadcast_message,
              from_admin: connection.userId
            }
          });
        }
        break;
    }

    // Log admin command
    await this.auditLogger.logAdminAction({
      adminUserId: connection.userId,
      action: 'websocket_admin_command',
      details: {
        connection_id: connectionId,
        command: message.command,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Handle connection disconnection
   */
  private async handleDisconnection(connectionId: string, code: number, reason?: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from all tracking maps
    this.connections.delete(connectionId);
    
    const userConnections = this.userConnections.get(connection.userId);
    if (userConnections) {
      userConnections.delete(connectionId);
      if (userConnections.size === 0) {
        this.userConnections.delete(connection.userId);
      }
    }

    // Remove from all session subscriptions
    connection.subscriptions.forEach(sessionId => {
      const sessionSubs = this.sessionSubscriptions.get(sessionId);
      if (sessionSubs) {
        sessionSubs.delete(connectionId);
        if (sessionSubs.size === 0) {
          this.sessionSubscriptions.delete(sessionId);
        }
      }
    });

    // Log disconnection
    await this.auditLogger.logAdminAction({
      adminUserId: connection.userId,
      action: 'websocket_disconnect',
      details: {
        connection_id: connectionId,
        code,
        reason,
        duration_ms: Date.now() - connection.connectedAt.getTime(),
        was_admin: connection.isAdmin
      }
    });

    console.log(`🔌 WebSocket disconnected: ${connectionId} (code: ${code}, reason: ${reason})`);
  }

  /**
   * Handle pong response
   */
  private handlePong(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastPingAt = new Date();
    }
  }

  /**
   * Send message to specific connection
   */
  private sendToConnection(connectionId: string, event: StreamingEvent): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      connection.ws.send(JSON.stringify(event));
    } catch (error) {
      console.error(`Failed to send message to ${connectionId}:`, error);
      // Connection is probably broken, remove it
      this.handleDisconnection(connectionId, 1006, 'Send failed');
    }
  }

  /**
   * Broadcast to all connections for a specific user
   */
  async broadcastToUser(
    userId: string,
    event: StreamingEvent,
    adminOnly: boolean = false
  ): Promise<void> {
    const userConnections = this.userConnections.get(userId);
    if (!userConnections) return;

    for (const connectionId of userConnections) {
      const connection = this.connections.get(connectionId);
      if (!connection) continue;

      // If admin-only event, filter for admin connections
      if (adminOnly && !connection.isAdmin) continue;

      // Check if connection is interested in this session
      if (connection.sessionFilters.length === 0 ||
          connection.sessionFilters.includes(event.session_id) ||
          (connection.isAdmin && connection.adminPrivileges?.view_all_sessions)) {
        this.sendToConnection(connectionId, event);
      }
    }
  }

  /**
   * Broadcast to all subscribers of a specific session
   */
  async broadcastToSession(sessionId: string, event: StreamingEvent): Promise<void> {
    const sessionSubs = this.sessionSubscriptions.get(sessionId);
    if (!sessionSubs) return;

    for (const connectionId of sessionSubs) {
      this.sendToConnection(connectionId, event);
    }
  }

  /**
   * Broadcast to all admin connections
   */
  async broadcastToAdmins(event: StreamingEvent): Promise<void> {
    for (const [connectionId, connection] of this.connections) {
      if (connection.isAdmin) {
        this.sendToConnection(connectionId, event);
      }
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const staleThreshold = 30000; // 30 seconds
      
      for (const [connectionId, connection] of this.connections) {
        if (now.getTime() - connection.lastPingAt.getTime() > staleThreshold) {
          // Send ping
          if (connection.ws.readyState === WebSocket.OPEN) {
            connection.ws.ping();
            connection.lastPingAt = now;
          } else {
            // Connection is dead, remove it
            this.handleDisconnection(connectionId, 1006, 'Stale connection');
          }
        }
      }
    }, 15000); // Check every 15 seconds
  }

  /**
   * Start cleanup of dead connections
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const deadConnections: string[] = [];
      
      for (const [connectionId, connection] of this.connections) {
        if (connection.ws.readyState === WebSocket.CLOSED ||
            connection.ws.readyState === WebSocket.CLOSING) {
          deadConnections.push(connectionId);
        }
      }
      
      // Remove dead connections
      deadConnections.forEach(connectionId => {
        this.handleDisconnection(connectionId, 1006, 'Connection cleanup');
      });
    }, 60000); // Check every minute
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    adminConnections: number;
    activeConnections: number;
    sessionSubscriptions: number;
    userConnections: number;
  } {
    const adminConnections = Array.from(this.connections.values())
      .filter(c => c.isAdmin).length;
    
    const activeConnections = Array.from(this.connections.values())
      .filter(c => c.ws.readyState === WebSocket.OPEN).length;

    return {
      totalConnections: this.connections.size,
      adminConnections,
      activeConnections,
      sessionSubscriptions: this.sessionSubscriptions.size,
      userConnections: this.userConnections.size
    };
  }

  /**
   * Get client IP address
   */
  private getClientIP(req: IncomingMessage): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           (req.headers['x-real-ip'] as string) ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           'unknown';
  }

  /**
   * Shutdown WebSocket manager
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down WebSocket manager...');
    
    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Close all connections
    for (const [connectionId, connection] of this.connections) {
      connection.ws.close(1001, 'Server shutting down');
    }
    
    // Clear all maps
    this.connections.clear();
    this.userConnections.clear();
    this.sessionSubscriptions.clear();
    
    console.log('✅ WebSocket manager shutdown complete');
  }
}
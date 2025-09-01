/**
 * WebSocketDAO - WebSocket connection management
 * Handles real-time streaming connections with admin monitoring
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager, UserContext } from '../DatabaseManager.js';

export interface WebSocketConnection {
  id: string;
  user_id: string;
  session_id?: string;
  connection_id: string;
  client_ip: string;
  user_agent?: string;
  client_type: 'dashboard' | 'cli' | 'mobile' | 'api';
  connected_at: Date;
  last_ping_at: Date;
  disconnected_at?: Date;
  subscribed_events: string[];
  session_filters: string[]; // UUID array for specific sessions
  connection_status: 'active' | 'inactive' | 'closed';
  created_at: Date;
  updated_at: Date;
}

export interface CreateConnectionRequest {
  connectionId: string;
  sessionId?: string;
  clientIp: string;
  userAgent?: string;
  clientType: WebSocketConnection['client_type'];
  subscribedEvents?: string[];
  sessionFilters?: string[];
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  connectionsByType: Record<string, number>;
  avgConnectionDuration: number;
  topUsers: Array<{
    userId: string;
    connectionCount: number;
    totalDuration: number;
  }>;
}

export class WebSocketDAO {
  constructor(private db: DatabaseManager) {}

  /**
   * Create new WebSocket connection
   */
  async createConnection(
    userId: string,
    request: CreateConnectionRequest,
    context?: UserContext
  ): Promise<WebSocketConnection> {
    const connectionDbId = uuidv4();

    const [connection] = await this.db.query<WebSocketConnection>(
      `
      INSERT INTO websocket_connections (
        id, user_id, session_id, connection_id, client_ip,
        user_agent, client_type, connected_at, last_ping_at,
        subscribed_events, session_filters, connection_status,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW(), NOW(),
        $8, $9, 'active', NOW(), NOW()
      )
      RETURNING *
      `,
      [
        connectionDbId,
        userId,
        request.sessionId || null,
        request.connectionId,
        request.clientIp,
        request.userAgent || null,
        request.clientType,
        request.subscribedEvents || [],
        request.sessionFilters || [],
      ],
      context
    );

    return connection;
  }

  /**
   * Update connection ping/activity
   */
  async updateConnectionActivity(
    connectionId: string,
    context?: UserContext
  ): Promise<boolean> {
    const result = await this.db.query(
      `
      UPDATE websocket_connections 
      SET last_ping_at = NOW(), updated_at = NOW()
      WHERE connection_id = $1 AND connection_status = 'active'
      RETURNING id
      `,
      [connectionId],
      context
    );

    return result.length > 0;
  }

  /**
   * Close WebSocket connection
   */
  async closeConnection(
    connectionId: string,
    context?: UserContext
  ): Promise<boolean> {
    const result = await this.db.query(
      `
      UPDATE websocket_connections 
      SET connection_status = 'closed', 
          disconnected_at = NOW(),
          updated_at = NOW()
      WHERE connection_id = $1 AND connection_status IN ('active', 'inactive')
      RETURNING id
      `,
      [connectionId],
      context
    );

    return result.length > 0;
  }

  /**
   * Get active connections for user
   */
  async getUserConnections(
    userId: string,
    context?: UserContext
  ): Promise<WebSocketConnection[]> {
    const connections = await this.db.query<WebSocketConnection>(
      `
      SELECT * FROM websocket_connections 
      WHERE user_id = $1 AND connection_status = 'active'
      ORDER BY connected_at DESC
      `,
      [userId],
      context
    );

    return connections;
  }

  /**
   * Get all active connections (admin only)
   */
  async getAllActiveConnections(
    context?: UserContext
  ): Promise<WebSocketConnection[]> {
    if (!context?.isAdmin) {
      throw new Error('Admin privileges required to view all connections');
    }

    const connections = await this.db.query<WebSocketConnection>(
      `
      SELECT * FROM websocket_connections 
      WHERE connection_status = 'active'
      ORDER BY connected_at DESC
      `,
      [],
      context
    );

    return connections;
  }

  /**
   * Get connections for specific session
   */
  async getSessionConnections(
    sessionId: string,
    context?: UserContext
  ): Promise<WebSocketConnection[]> {
    const connections = await this.db.query<WebSocketConnection>(
      `
      SELECT * FROM websocket_connections 
      WHERE session_id = $1 AND connection_status = 'active'
      ORDER BY connected_at DESC
      `,
      [sessionId],
      context
    );

    return connections;
  }

  /**
   * Update connection subscriptions
   */
  async updateConnectionSubscriptions(
    connectionId: string,
    subscribedEvents: string[],
    sessionFilters: string[],
    context?: UserContext
  ): Promise<boolean> {
    const result = await this.db.query(
      `
      UPDATE websocket_connections 
      SET subscribed_events = $1,
          session_filters = $2,
          updated_at = NOW()
      WHERE connection_id = $3 AND connection_status = 'active'
      RETURNING id
      `,
      [subscribedEvents, sessionFilters, connectionId],
      context
    );

    return result.length > 0;
  }

  /**
   * Get connection metrics (admin only)
   */
  async getConnectionMetrics(
    startDate?: Date,
    endDate?: Date,
    context?: UserContext
  ): Promise<ConnectionMetrics> {
    if (!context?.isAdmin) {
      throw new Error('Admin privileges required for connection metrics');
    }

    const whereClause = startDate && endDate 
      ? 'WHERE connected_at BETWEEN $1 AND $2'
      : '';
    const params = startDate && endDate ? [startDate, endDate] : [];

    const [metrics] = await this.db.query(
      `
      SELECT 
        COUNT(*) as total_connections,
        COUNT(*) FILTER (WHERE connection_status = 'active') as active_connections,
        COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(disconnected_at, NOW()) - connected_at))), 0) as avg_duration
      FROM websocket_connections
      ${whereClause}
      `,
      params,
      context
    );

    const connectionsByType = await this.db.query(
      `
      SELECT 
        client_type,
        COUNT(*) as count
      FROM websocket_connections
      ${whereClause}
      GROUP BY client_type
      `,
      params,
      context
    );

    const topUsers = await this.db.query(
      `
      SELECT 
        user_id,
        COUNT(*) as connection_count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(disconnected_at, NOW()) - connected_at))), 0) as total_duration
      FROM websocket_connections
      ${whereClause}
      GROUP BY user_id
      ORDER BY connection_count DESC
      LIMIT 10
      `,
      params,
      context
    );

    const connectionsByTypeMap: Record<string, number> = {};
    connectionsByType.forEach((row: any) => {
      connectionsByTypeMap[row.client_type] = parseInt(row.count);
    });

    return {
      totalConnections: parseInt(metrics.total_connections || '0'),
      activeConnections: parseInt(metrics.active_connections || '0'),
      connectionsByType: connectionsByTypeMap,
      avgConnectionDuration: parseFloat(metrics.avg_duration || '0'),
      topUsers: topUsers.map((user: any) => ({
        userId: user.user_id,
        connectionCount: parseInt(user.connection_count),
        totalDuration: parseFloat(user.total_duration),
      })),
    };
  }

  /**
   * Cleanup inactive connections
   */
  async cleanupInactiveConnections(
    inactiveThresholdMinutes: number = 30,
    context?: UserContext
  ): Promise<number> {
    if (!context?.isAdmin) {
      throw new Error('Admin privileges required for connection cleanup');
    }

    // Validate and sanitize the input parameter
    const validThreshold = Number(inactiveThresholdMinutes);
    if (!Number.isInteger(validThreshold) || validThreshold < 1 || validThreshold > 1440) {
      throw new Error('Invalid threshold: must be a positive integer between 1 and 1440 minutes');
    }

    const result = await this.db.query(
      `
      UPDATE websocket_connections 
      SET connection_status = 'inactive',
          disconnected_at = NOW(),
          updated_at = NOW()
      WHERE last_ping_at < NOW() - INTERVAL '1 minute' * $1
        AND connection_status = 'active'
      RETURNING id
      `,
      [validThreshold],
      context
    );

    return result.length;
  }

  /**
   * Get connection by connection ID
   */
  async getConnectionById(
    connectionId: string,
    context?: UserContext
  ): Promise<WebSocketConnection | null> {
    const [connection] = await this.db.query<WebSocketConnection>(
      'SELECT * FROM websocket_connections WHERE connection_id = $1',
      [connectionId],
      context
    );

    return connection || null;
  }

  /**
   * Get connections that should receive specific events
   */
  async getEventSubscribers(
    eventType: string,
    sessionId?: string,
    context?: UserContext
  ): Promise<WebSocketConnection[]> {
    let query = `
      SELECT * FROM websocket_connections 
      WHERE connection_status = 'active'
        AND ($1 = ANY(subscribed_events) OR 'all' = ANY(subscribed_events))
    `;
    const params = [eventType];

    if (sessionId) {
      query += ` AND ($2 = ANY(session_filters) OR array_length(session_filters, 1) IS NULL)`;
      params.push(sessionId);
    }

    query += ` ORDER BY connected_at DESC`;

    const connections = await this.db.query<WebSocketConnection>(
      query,
      params,
      context
    );

    return connections;
  }
}

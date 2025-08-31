# Phase 4: WebSocket Streaming Implementation

## Mission

Implement keen's **real-time streaming infrastructure** that provides live updates of agent progress, recursive spawning trees, git operations, and system metrics to the dashboard. This creates the "live coding" experience that makes keen's recursive agents visible and manageable.

## Success Criteria

- [ ] **Real-time agent tree visualization** showing recursive spawning hierarchy
- [ ] **Live progress streaming** with phase transitions and completion status
- [ ] **Git operation streaming** with commits, branches, merges, and conflicts
- [ ] **Multi-tenant WebSocket management** with complete user isolation
- [ ] **Scalable connection handling** supporting thousands of concurrent users
- [ ] **Event-driven architecture** with reliable message delivery
- [ ] **Connection state management** with heartbeat and reconnection
- [ ] **Security validation** ensuring users only see their own data
- [ ] **80%+ test coverage** including load and concurrency tests
- [ ] **Performance optimization** with sub-100ms message latency

## Architecture Overview

### Real-time Data Flow

```
Agent Core                WebSocket Gateway           Dashboard Client
│                          │                         │
├─ Phase Transition         ├── Route to User WS        ├── Live Phase Updates
├─ Agent Spawned           ├── Update Agent Tree       ├── Agent Tree Viz
├─ Git Commit              ├── Stream Git Ops          ├── Git Activity Feed
├─ Progress Update         ├── Broadcast Progress      ├── Progress Indicators
├─ Error/Warning           ├── Alert Routing           ├── Error Notifications
└─ Tool Execution          └── Activity Tracking       └── Tool Usage Display
```

### Event Types and Routing

```typescript
// Core streaming events from agents
interface StreamingEvent {
  event_type: 'phase_transition' | 'agent_spawned' | 'git_operation' | 
              'progress_update' | 'tool_execution' | 'error' | 'completion';
  session_id: string;
  timestamp: string;
  user_id: string; // Used for routing, never sent to client
  data: any;
}

// Client-facing event (user_id stripped)
interface ClientEvent {
  event_type: string;
  session_id: string;
  timestamp: string;
  data: any;
}
```

## WebSocket Gateway Implementation

### Connection Management

**Study Pattern:** `src/conversation/StreamingManager.ts` - Real-time progress streaming

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { EventEmitter } from 'events';

export class WebSocketGateway extends EventEmitter {
  private wss: WebSocketServer;
  private connections: Map<string, AuthenticatedConnection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map(); // userId -> connectionIds
  private heartbeatInterval: NodeJS.Timeout;
  
  constructor(
    private authService: AuthenticationService,
    private eventRouter: EventRouter,
    private connectionLimiter: ConnectionLimiter
  ) {
    super();
    this.setupWebSocketServer();
    this.startHeartbeat();
  }
  
  private setupWebSocketServer(): void {
    this.wss = new WebSocketServer({
      port: parseInt(process.env.WEBSOCKET_PORT || '3001'),
      verifyClient: this.verifyClient.bind(this),
      clientTracking: true,
      perMessageDeflate: true, // Enable compression
      maxPayload: 16 * 1024   // 16KB max message size
    });
    
    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', this.handleServerError.bind(this));
    
    Logger.info('WebSocket server started', {
      port: process.env.WEBSOCKET_PORT || '3001',
      compression: true
    });
  }
  
  private async verifyClient(
    info: { origin: string; secure: boolean; req: IncomingMessage }
  ): Promise<boolean> {
    try {
      // Extract authentication from query params or headers
      const url = new URL(info.req.url!, 'ws://localhost');
      const token = url.searchParams.get('token') || 
                   info.req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        Logger.warn('WebSocket connection rejected: no token');
        return false;
      }
      
      // Verify JWT token
      const payload = await this.authService.verifyAccessToken(token);
      
      // Check connection limits for this user
      const connectionCheck = await this.connectionLimiter.checkUserLimit(
        payload.sub,
        payload.subscription_tier
      );
      
      if (!connectionCheck.allowed) {
        Logger.warn('WebSocket connection rejected: user limit exceeded', {
          userId: payload.sub,
          currentConnections: connectionCheck.current,
          limit: connectionCheck.limit
        });
        return false;
      }
      
      // Attach user info to request
      (info.req as any).userId = payload.sub;
      (info.req as any).subscriptionTier = payload.subscription_tier;
      (info.req as any).sessionFilters = this.parseSessionFilters(url);
      
      return true;
      
    } catch (error) {
      Logger.warn('WebSocket authentication failed', {
        error: error.message,
        origin: info.origin
      });
      return false;
    }
  }
  
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const connectionId = this.generateConnectionId();
    const userId = (req as any).userId;
    const sessionFilters = (req as any).sessionFilters;
    const subscriptionTier = (req as any).subscriptionTier;
    
    const connection: AuthenticatedConnection = {
      id: connectionId,
      userId,
      subscriptionTier,
      ws,
      sessionFilters,
      connectedAt: new Date(),
      lastPingAt: new Date(),
      isAlive: true,
      messagesSent: 0,
      bytesTransferred: 0
    };
    
    // Store connection
    this.connections.set(connectionId, connection);
    
    // Track user connections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);
    
    // Setup event handlers
    ws.on('message', (data) => this.handleMessage(connectionId, data));
    ws.on('close', (code, reason) => this.handleDisconnection(connectionId, code, reason));
    ws.on('error', (error) => this.handleConnectionError(connectionId, error));
    ws.on('pong', () => this.handlePong(connectionId));
    
    // Send welcome message
    this.sendToConnection(connectionId, {
      event_type: 'connection_established',
      timestamp: new Date().toISOString(),
      data: {
        connectionId,
        sessionFilters,
        serverTime: new Date().toISOString()
      }
    });
    
    Logger.info('WebSocket connection established', {
      connectionId,
      userId,
      sessionFilters: sessionFilters.length
    });
  }
  
  // Route events to appropriate user connections
  async routeEventToUser(
    userId: string,
    event: StreamingEvent
  ): Promise<void> {
    const userConnectionIds = this.userConnections.get(userId);
    if (!userConnectionIds || userConnectionIds.size === 0) {
      return; // No active connections for this user
    }
    
    // Convert to client event (remove sensitive data)
    const clientEvent: ClientEvent = {
      event_type: event.event_type,
      session_id: event.session_id,
      timestamp: event.timestamp,
      data: event.data
    };
    
    // Send to all user connections that match filter criteria
    const sendPromises = Array.from(userConnectionIds).map(async (connectionId) => {
      const connection = this.connections.get(connectionId);
      if (!connection || !this.shouldReceiveEvent(connection, event)) {
        return;
      }
      
      try {
        await this.sendToConnection(connectionId, clientEvent);
        
        // Track message statistics
        connection.messagesSent++;
        connection.bytesTransferred += JSON.stringify(clientEvent).length;
        
      } catch (error) {
        Logger.warn('Failed to send event to connection', {
          connectionId,
          userId,
          error: error.message
        });
      }
    });
    
    await Promise.allSettled(sendPromises);
  }
  
  private shouldReceiveEvent(
    connection: AuthenticatedConnection,
    event: StreamingEvent
  ): boolean {
    // Check if connection is interested in this session
    if (connection.sessionFilters.length > 0) {
      return connection.sessionFilters.includes(event.session_id);
    }
    
    // No filters = receive all events for this user
    return true;
  }
  
  private async sendToConnection(
    connectionId: string,
    event: ClientEvent
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const message = JSON.stringify(event);
    connection.ws.send(message);
  }
}
```

### Event Router and Processor

```typescript
export class EventRouter {
  constructor(
    private webSocketGateway: WebSocketGateway,
    private eventPersistence: EventPersistence,
    private eventValidator: EventValidator
  ) {}
  
  async routeEvent(event: StreamingEvent): Promise<void> {
    try {
      // 1. Validate event structure
      const validationResult = await this.eventValidator.validate(event);
      if (!validationResult.valid) {
        Logger.warn('Invalid streaming event', {
          event,
          errors: validationResult.errors
        });
        return;
      }
      
      // 2. Process event for routing
      const processedEvent = await this.processEvent(event);
      
      // 3. Persist event for replay/audit
      await this.eventPersistence.storeEvent(processedEvent);
      
      // 4. Route to user's WebSocket connections
      await this.webSocketGateway.routeEventToUser(
        event.user_id,
        processedEvent
      );
      
      // 5. Handle special event types
      await this.handleSpecialEventTypes(processedEvent);
      
    } catch (error) {
      Logger.error('Event routing failed', {
        event,
        error: error.message
      });
    }
  }
  
  private async processEvent(event: StreamingEvent): Promise<StreamingEvent> {
    switch (event.event_type) {
      case 'agent_spawned':
        return this.processAgentSpawnedEvent(event);
        
      case 'git_operation':
        return this.processGitOperationEvent(event);
        
      case 'phase_transition':
        return this.processPhaseTransitionEvent(event);
        
      default:
        return event;
    }
  }
  
  private processAgentSpawnedEvent(event: StreamingEvent): StreamingEvent {
    // Enhance agent spawned events with hierarchy context
    const spawnData = event.data;
    
    return {
      ...event,
      data: {
        ...spawnData,
        agent_tree_path: this.buildAgentTreePath(spawnData),
        estimated_completion: this.calculateEstimatedCompletion(spawnData),
        resource_allocation: this.getResourceAllocation(spawnData)
      }
    };
  }
  
  private processGitOperationEvent(event: StreamingEvent): StreamingEvent {
    // Enhance git events with branch context and file diffs
    const gitData = event.data;
    
    return {
      ...event,
      data: {
        ...gitData,
        branch_hierarchy: this.getBranchHierarchy(gitData.branch),
        commit_summary: this.generateCommitSummary(gitData),
        file_change_stats: this.calculateFileChangeStats(gitData)
      }
    };
  }
}
```

### Agent Progress Streaming Integration

**Study Pattern:** `src/agent/AgentSession.ts` - Agent execution with streaming

```typescript
export class AgentProgressStreamer {
  constructor(
    private eventRouter: EventRouter,
    private sessionManager: SessionManager
  ) {}
  
  async streamPhaseTransition(
    sessionId: string,
    userId: string,
    transition: PhaseTransition
  ): Promise<void> {
    const event: StreamingEvent = {
      event_type: 'phase_transition',
      session_id: sessionId,
      user_id: userId,
      timestamp: new Date().toISOString(),
      data: {
        from_phase: transition.fromPhase,
        to_phase: transition.toPhase,
        summary: transition.summary,
        confidence: transition.confidence,
        key_findings: transition.keyFindings,
        next_actions: transition.nextActions,
        estimated_time_remaining: transition.estimatedTimeRemaining,
        progress_percentage: this.calculateProgressPercentage(
          transition.toPhase,
          transition.confidence
        )
      }
    };
    
    await this.eventRouter.routeEvent(event);
  }
  
  async streamAgentSpawned(
    parentSessionId: string,
    childSessionId: string,
    userId: string,
    spawnDetails: AgentSpawnDetails
  ): Promise<void> {
    const event: StreamingEvent = {
      event_type: 'agent_spawned',
      session_id: parentSessionId,
      user_id: userId,
      timestamp: new Date().toISOString(),
      data: {
        parent_session: parentSessionId,
        child_session: childSessionId,
        git_branch: spawnDetails.gitBranch,
        purpose: spawnDetails.purpose,
        sub_vision: spawnDetails.subVision,
        estimated_duration: spawnDetails.estimatedDuration,
        resource_limits: spawnDetails.resourceLimits,
        agent_depth: spawnDetails.depth,
        spawn_reason: spawnDetails.reason
      }
    };
    
    await this.eventRouter.routeEvent(event);
  }
  
  async streamGitOperation(
    sessionId: string,
    userId: string,
    gitOp: GitOperation
  ): Promise<void> {
    const event: StreamingEvent = {
      event_type: 'git_operation',
      session_id: sessionId,
      user_id: userId,
      timestamp: new Date().toISOString(),
      data: {
        operation_type: gitOp.operationType,
        branch: gitOp.branch,
        commit_hash: gitOp.commitHash,
        commit_message: gitOp.commitMessage,
        files_changed: gitOp.filesChanged,
        lines_added: gitOp.linesAdded,
        lines_deleted: gitOp.linesDeleted,
        merge_conflicts: gitOp.mergeConflicts,
        success: gitOp.success,
        duration_ms: gitOp.durationMs
      }
    };
    
    await this.eventRouter.routeEvent(event);
  }
  
  async streamToolExecution(
    sessionId: string,
    userId: string,
    toolExec: ToolExecution
  ): Promise<void> {
    const event: StreamingEvent = {
      event_type: 'tool_execution',
      session_id: sessionId,
      user_id: userId,
      timestamp: new Date().toISOString(),
      data: {
        tool_name: toolExec.toolName,
        execution_time_ms: toolExec.executionTime,
        success: toolExec.success,
        parameters_summary: this.summarizeParameters(toolExec.parameters),
        result_summary: this.summarizeResult(toolExec.result),
        files_affected: toolExec.filesAffected,
        error_message: toolExec.errorMessage
      }
    };
    
    await this.eventRouter.routeEvent(event);
  }
  
  async streamProgressUpdate(
    sessionId: string,
    userId: string,
    progress: ProgressUpdate
  ): Promise<void> {
    const event: StreamingEvent = {
      event_type: 'progress_update',
      session_id: sessionId,
      user_id: userId,
      timestamp: new Date().toISOString(),
      data: {
        phase: progress.currentPhase,
        phase_progress: progress.phaseProgress,
        overall_progress: progress.overallProgress,
        current_action: progress.currentAction,
        tokens_used: progress.tokensUsed,
        cost_so_far: progress.costSoFar,
        active_agents: progress.activeAgents,
        recent_activities: progress.recentActivities,
        performance_metrics: {
          avg_response_time: progress.avgResponseTime,
          error_rate: progress.errorRate,
          throughput: progress.throughput
        }
      }
    };
    
    await this.eventRouter.routeEvent(event);
  }
}
```

### Recursive Agent Tree Visualization

```typescript
export class AgentTreeManager {
  private agentTrees: Map<string, AgentTreeNode> = new Map();
  
  constructor(private eventRouter: EventRouter) {}
  
  buildAgentTree(rootSessionId: string, userId: string): AgentTreeNode {
    // Get or create root node
    let rootNode = this.agentTrees.get(rootSessionId);
    if (!rootNode) {
      rootNode = {
        session_id: rootSessionId,
        user_id: userId,
        parent_session: null,
        git_branch: 'main',
        status: 'running',
        current_phase: 'EXPLORE',
        purpose: 'root',
        progress: 0,
        children: new Map(),
        metrics: {
          start_time: new Date().toISOString(),
          tokens_used: 0,
          cost_so_far: 0,
          files_created: 0,
          files_modified: 0,
          git_commits: 0
        },
        git_info: {
          branch: 'main',
          latest_commit: null,
          commits_count: 0,
          files_changed: []
        }
      };
      
      this.agentTrees.set(rootSessionId, rootNode);
    }
    
    return rootNode;
  }
  
  updateAgentNode(
    sessionId: string,
    userId: string,
    update: Partial<AgentTreeNode>
  ): void {
    const node = this.findNodeInTrees(sessionId);
    if (!node) {
      Logger.warn('Agent node not found for update', { sessionId });
      return;
    }
    
    // Update node with new data
    Object.assign(node, update);
    
    // Stream updated tree to user
    this.streamTreeUpdate(userId, sessionId, node);
  }
  
  addChildAgent(
    parentSessionId: string,
    childSessionId: string,
    userId: string,
    childInfo: AgentSpawnDetails
  ): void {
    const parentNode = this.findNodeInTrees(parentSessionId);
    if (!parentNode) {
      Logger.warn('Parent node not found for child addition', {
        parentSessionId,
        childSessionId
      });
      return;
    }
    
    const childNode: AgentTreeNode = {
      session_id: childSessionId,
      user_id: userId,
      parent_session: parentSessionId,
      git_branch: childInfo.gitBranch,
      status: 'spawning',
      current_phase: 'EXPLORE',
      purpose: childInfo.purpose,
      progress: 0,
      children: new Map(),
      metrics: {
        start_time: new Date().toISOString(),
        tokens_used: 0,
        cost_so_far: 0,
        files_created: 0,
        files_modified: 0,
        git_commits: 0
      },
      git_info: {
        branch: childInfo.gitBranch,
        latest_commit: null,
        commits_count: 0,
        files_changed: []
      }
    };
    
    parentNode.children.set(childSessionId, childNode);
    
    // Stream tree update
    this.streamTreeUpdate(userId, parentSessionId, parentNode);
  }
  
  private async streamTreeUpdate(
    userId: string,
    rootSessionId: string,
    updatedNode: AgentTreeNode
  ): Promise<void> {
    const event: StreamingEvent = {
      event_type: 'agent_tree_update',
      session_id: rootSessionId,
      user_id: userId,
      timestamp: new Date().toISOString(),
      data: {
        tree_root: rootSessionId,
        updated_node: updatedNode.session_id,
        full_tree: this.serializeAgentTree(updatedNode),
        tree_stats: this.calculateTreeStats(updatedNode)
      }
    };
    
    await this.eventRouter.routeEvent(event);
  }
  
  private serializeAgentTree(node: AgentTreeNode): SerializedAgentTree {
    return {
      session_id: node.session_id,
      parent_session: node.parent_session,
      git_branch: node.git_branch,
      status: node.status,
      current_phase: node.current_phase,
      purpose: node.purpose,
      progress: node.progress,
      metrics: node.metrics,
      git_info: node.git_info,
      children: Array.from(node.children.values()).map(
        child => this.serializeAgentTree(child)
      )
    };
  }
}
```

## Dashboard Integration

### WebSocket Client Management

```typescript
// Dashboard WebSocket client
export class DashboardWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private eventHandlers: Map<string, Function[]> = new Map();
  
  constructor(
    private authToken: string,
    private sessionFilters: string[] = []
  ) {}
  
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.buildWebSocketURL();
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        console.log('Dashboard WebSocket connected');
        resolve();
      };
      
      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };
      
      this.ws.onclose = (event) => {
        this.handleDisconnection(event);
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }
  
  // Event subscription system
  on(eventType: string, handler: Function): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }
  
  private handleMessage(event: ClientEvent): void {
    const handlers = this.eventHandlers.get(event.event_type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error('Event handler error:', error);
        }
      });
    }
  }
  
  private buildWebSocketURL(): string {
    const baseUrl = process.env.REACT_APP_WEBSOCKET_URL || 'wss://ws.keen.dev';
    const params = new URLSearchParams({
      token: this.authToken,
      ...(this.sessionFilters.length > 0 && {
        sessions: this.sessionFilters.join(',')
      })
    });
    
    return `${baseUrl}?${params.toString()}`;
  }
}
```

## Testing Requirements

### WebSocket Connection Tests

```typescript
describe('WebSocket Gateway', () => {
  let gateway: WebSocketGateway;
  let mockAuthService: jest.Mocked<AuthenticationService>;
  
  beforeEach(async () => {
    mockAuthService = createMockAuthService();
    gateway = new WebSocketGateway(
      mockAuthService,
      new EventRouter(),
      new ConnectionLimiter()
    );
  });
  
  test('authenticates connections with JWT tokens', async () => {
    const validToken = 'valid_jwt_token';
    mockAuthService.verifyAccessToken.mockResolvedValue({
      sub: 'user123',
      subscription_tier: 'individual'
    });
    
    const client = new WebSocket(`ws://localhost:3001?token=${validToken}`);
    
    await waitForConnection(client);
    expect(client.readyState).toBe(WebSocket.OPEN);
    
    client.close();
  });
  
  test('rejects unauthenticated connections', async () => {
    const client = new WebSocket('ws://localhost:3001'); // No token
    
    await waitForConnectionClose(client);
    expect(client.readyState).toBe(WebSocket.CLOSED);
  });
  
  test('routes events only to authorized users', async () => {
    const user1Token = await generateTestToken('user1');
    const user2Token = await generateTestToken('user2');
    
    const user1Client = new WebSocket(`ws://localhost:3001?token=${user1Token}`);
    const user2Client = new WebSocket(`ws://localhost:3001?token=${user2Token}`);
    
    await Promise.all([
      waitForConnection(user1Client),
      waitForConnection(user2Client)
    ]);
    
    const user1Messages: any[] = [];
    const user2Messages: any[] = [];
    
    user1Client.on('message', (data) => {
      user1Messages.push(JSON.parse(data.toString()));
    });
    
    user2Client.on('message', (data) => {
      user2Messages.push(JSON.parse(data.toString()));
    });
    
    // Send event for user1 only
    await gateway.routeEventToUser('user1', {
      event_type: 'phase_transition',
      session_id: 'session123',
      user_id: 'user1',
      timestamp: new Date().toISOString(),
      data: { from_phase: 'EXPLORE', to_phase: 'PLAN' }
    });
    
    await delay(100);
    
    // Only user1 should receive the message
    expect(user1Messages.length).toBe(2); // Welcome + phase transition
    expect(user2Messages.length).toBe(1); // Only welcome
    
    user1Client.close();
    user2Client.close();
  });
});
```

### Load and Performance Tests

```typescript
describe('WebSocket Performance', () => {
  test('handles 1000 concurrent connections', async () => {
    const connections: WebSocket[] = [];
    const tokens = await generateTestTokens(1000);
    
    // Create 1000 concurrent connections
    const connectionPromises = tokens.map((token, i) => {
      const client = new WebSocket(`ws://localhost:3001?token=${token}`);
      connections.push(client);
      return waitForConnection(client);
    });
    
    const startTime = Date.now();
    await Promise.all(connectionPromises);
    const connectionTime = Date.now() - startTime;
    
    expect(connectionTime).toBeLessThan(5000); // All connected within 5s
    expect(connections.every(c => c.readyState === WebSocket.OPEN)).toBe(true);
    
    // Test message broadcasting
    const messagePromises = connections.map((client, i) => {
      return new Promise(resolve => {
        client.on('message', (data) => {
          const event = JSON.parse(data.toString());
          if (event.event_type === 'test_broadcast') {
            resolve(true);
          }
        });
      });
    });
    
    // Broadcast message to all users
    const broadcastStart = Date.now();
    for (let i = 0; i < 1000; i++) {
      await gateway.routeEventToUser(`user${i}`, {
        event_type: 'test_broadcast',
        session_id: `session${i}`,
        user_id: `user${i}`,
        timestamp: new Date().toISOString(),
        data: { message: 'Hello World' }
      });
    }
    
    await Promise.all(messagePromises);
    const broadcastTime = Date.now() - broadcastStart;
    
    expect(broadcastTime).toBeLessThan(2000); // All messages delivered within 2s
    
    // Cleanup
    connections.forEach(client => client.close());
  });
  
  test('maintains sub-100ms message latency', async () => {
    const token = await generateTestToken('user123');
    const client = new WebSocket(`ws://localhost:3001?token=${token}`);
    
    await waitForConnection(client);
    
    const latencies: number[] = [];
    
    // Send 100 messages and measure latency
    for (let i = 0; i < 100; i++) {
      const sendTime = Date.now();
      
      const latencyPromise = new Promise<number>(resolve => {
        client.on('message', (data) => {
          const event = JSON.parse(data.toString());
          if (event.data?.messageId === i) {
            resolve(Date.now() - sendTime);
          }
        });
      });
      
      await gateway.routeEventToUser('user123', {
        event_type: 'latency_test',
        session_id: 'session123',
        user_id: 'user123',
        timestamp: new Date().toISOString(),
        data: { messageId: i, sendTime }
      });
      
      const latency = await latencyPromise;
      latencies.push(latency);
    }
    
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);
    
    expect(avgLatency).toBeLessThan(50); // Average < 50ms
    expect(maxLatency).toBeLessThan(100); // Max < 100ms
    
    client.close();
  });
});
```

## Integration Points

**This WebSocket layer must integrate with:**
- **Phase 1 (Database)**: Store and retrieve streaming events for replay
- **Phase 2 (API Gateway)**: Authenticate connections and enforce user isolation
- **Phase 3 (Agent Core)**: Receive real-time progress and spawning updates
- **Phase 5 (Dashboard)**: Provide live data visualization components

## Deliverables

1. **WebSocket Gateway** with authentication and multi-tenant isolation
2. **Event routing system** with reliable message delivery
3. **Agent progress streaming** with recursive tree visualization
4. **Git operation streaming** with real-time commit and merge tracking
5. **Connection management** with heartbeat and reconnection logic
6. **Event persistence** for message replay and audit trails
7. **Performance optimization** for thousands of concurrent connections
8. **Comprehensive test suite** with load and concurrency testing
9. **Client SDK** for dashboard and mobile app integration
10. **Monitoring and metrics** for WebSocket performance tracking

**Remember:** The WebSocket layer is what makes keen's recursive agents visible and manageable. Users need to see their agent trees working in real-time, understand progress, and feel confident in the autonomous development process. Sub-100ms latency and rock-solid reliability are non-negotiable.
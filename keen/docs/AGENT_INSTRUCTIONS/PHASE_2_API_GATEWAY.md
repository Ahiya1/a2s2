# Phase 2: API Gateway Implementation

## Mission

Implement keen's **API Gateway layer** that handles ALL business logic, authentication, credit management, rate limiting, and user-facing concerns. This layer ensures agents remain **completely pure** and unaware of commercial aspects while providing production-grade security and scalability.

## Success Criteria

- [ ] **Complete authentication system** with JWT tokens, API keys, and MFA support
- [ ] **Credit management integration** with real-time balance checking and atomic deductions
- [ ] **Rate limiting and abuse prevention** with per-user and per-tier limits
- [ ] **Request sanitization** ensuring agents receive clean, validated inputs
- [ ] **WebSocket management** for real-time streaming coordination
- [ ] **Audit logging** with comprehensive security and compliance trails
- [ ] **Agent purity enforcement** - agents never see business logic
- [ ] **Multi-tenant isolation** at the API layer
- [ ] **80%+ test coverage** including security and load tests
- [ ] **Production monitoring** with metrics, alerts, and health checks

## Core Architecture Principle

### Agent Purity Enforcement

**CRITICAL:** The API Gateway is the **ONLY** layer that knows about:
- User authentication and sessions
- Credit balances and billing
- Rate limiting and quotas
- Multi-tenant concerns
- Business logic and commercial aspects

Agents receive **sanitized requests** with:
- Clean vision/instructions
- Isolated workspace paths
- Pure development context
- No business metadata

```typescript
// BAD: Agent sees business logic
const agentRequest = {
  vision: "Create a todo app",
  userId: "user_123",           // ❌ Agent shouldn't know user ID
  creditBalance: 47.50,          // ❌ Agent shouldn't see credits
  subscriptionTier: "team",      // ❌ Agent shouldn't know billing
  rateLimitRemaining: 245        // ❌ Agent shouldn't see limits
};

// GOOD: Agent receives pure request
const sanitizedRequest = {
  vision: "Create a todo app",
  workingDirectory: "/workspaces/isolated_session_abc123", // ✅ Isolated path
  options: {
    maxIterations: 50,           // ✅ Clean execution options
    enableWebSearch: true,       // ✅ Feature flags only
    enableStreaming: true
  }
};
```

## Authentication Implementation

### JWT Token System

**Study Pattern:** `src/cli/commands/breathe.ts` - User input validation and error handling

```typescript
export class AuthenticationService {
  private jwtSecret: string;
  private refreshTokens: Map<string, RefreshTokenData> = new Map();
  
  constructor(
    private userDAO: UserDAO,
    private tokenDAO: TokenDAO,
    private auditLogger: AuditLogger
  ) {
    this.jwtSecret = process.env.JWT_SECRET!;
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable required');
    }
  }
  
  async login(
    credentials: LoginCredentials,
    clientInfo: ClientInfo
  ): Promise<AuthenticationResult> {
    const { email, password, mfaToken } = credentials;
    
    // 1. Rate limiting check
    await this.checkLoginRateLimit(email, clientInfo.ip);
    
    // 2. User lookup and password verification
    const user = await this.userDAO.getUserByEmail(email);
    if (!user || !await this.verifyPassword(password, user.passwordHash)) {
      await this.auditLogger.logFailedLogin(email, clientInfo, 'invalid_credentials');
      throw new AuthenticationError('Invalid credentials');
    }
    
    // 3. Account status checks
    if (user.accountStatus !== 'active') {
      await this.auditLogger.logFailedLogin(email, clientInfo, 'account_suspended');
      throw new AuthenticationError('Account suspended');
    }
    
    // 4. MFA verification if enabled
    if (user.mfaEnabled) {
      if (!mfaToken) {
        throw new MFARequiredError('MFA token required');
      }
      
      if (!await this.verifyMFAToken(user.mfaSecret, mfaToken)) {
        await this.auditLogger.logFailedLogin(email, clientInfo, 'invalid_mfa');
        throw new AuthenticationError('Invalid MFA token');
      }
    }
    
    // 5. Generate tokens
    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user, clientInfo);
    
    // 6. Update login tracking
    await this.userDAO.updateLastLogin(user.id, clientInfo.ip);
    
    // 7. Audit successful login
    await this.auditLogger.logSuccessfulLogin(user.id, clientInfo);
    
    return {
      user: this.sanitizeUserForResponse(user),
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 900 // 15 minutes
      }
    };
  }
  
  async generateAccessToken(user: User): Promise<string> {
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      subscription_tier: user.subscriptionTier,
      scopes: this.getUserScopes(user),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900 // 15 minutes
    };
    
    return jwt.sign(payload, this.jwtSecret, { algorithm: 'HS256' });
  }
  
  async verifyAccessToken(token: string): Promise<JWTPayload> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JWTPayload;
      
      // Additional validation
      const user = await this.userDAO.getUser(payload.sub);
      if (!user || user.accountStatus !== 'active') {
        throw new AuthenticationError('Invalid token');
      }
      
      return payload;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      }
      throw error;
    }
  }
}
```

### API Key Management

```typescript
export class APIKeyService {
  constructor(
    private tokenDAO: TokenDAO,
    private rateLimitService: RateLimitService
  ) {}
  
  async createAPIKey(
    userId: string,
    keyConfig: APIKeyConfig
  ): Promise<APIKeyResult> {
    // Generate secure API key
    const keyValue = this.generateSecureAPIKey();
    const keyHash = await this.hashAPIKey(keyValue);
    
    // Store API key with metadata
    const apiKey = await this.tokenDAO.createAPIKey({
      userId,
      tokenHash: keyHash,
      name: keyConfig.name,
      scopes: keyConfig.scopes,
      rateLimitPerHour: keyConfig.rateLimitPerHour || 1000,
      expiresAt: keyConfig.expiresAt
    });
    
    // Return key only once (never stored in plaintext)
    return {
      id: apiKey.id,
      key: keyValue, // Only shown once!
      name: apiKey.name,
      scopes: apiKey.scopes,
      rateLimitPerHour: apiKey.rateLimitPerHour,
      createdAt: apiKey.createdAt
    };
  }
  
  async validateAPIKey(keyValue: string): Promise<APIKeyValidation> {
    const keyHash = await this.hashAPIKey(keyValue);
    
    const apiKey = await this.tokenDAO.getAPIKeyByHash(keyHash);
    if (!apiKey || !apiKey.isActive) {
      throw new AuthenticationError('Invalid API key');
    }
    
    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new AuthenticationError('API key expired');
    }
    
    // Check rate limit
    const rateLimitCheck = await this.rateLimitService.checkAPIKeyLimit(
      apiKey.id,
      apiKey.rateLimitPerHour
    );
    
    if (!rateLimitCheck.allowed) {
      throw new RateLimitError('API key rate limit exceeded', rateLimitCheck);
    }
    
    // Update usage tracking
    await this.tokenDAO.updateAPIKeyUsage(apiKey.id);
    
    return {
      userId: apiKey.userId,
      scopes: apiKey.scopes,
      rateLimitRemaining: rateLimitCheck.remaining
    };
  }
  
  private generateSecureAPIKey(): string {
    // Generate cryptographically secure API key
    const prefix = 'ak_live_'; // or 'ak_test_' for test keys
    const randomBytes = crypto.randomBytes(32);
    return prefix + randomBytes.toString('hex');
  }
}
```

## Credit Management Integration

### Pre-flight Credit Validation

**Study Pattern:** `src/conversation/CostOptimizer.ts` - Cost calculation and optimization

```typescript
export class CreditGatewayService {
  constructor(
    private creditManager: CreditManager,
    private costEstimator: CostEstimator
  ) {}
  
  async validateAndReserveCredits(
    userId: string,
    agentRequest: AgentExecutionRequest
  ): Promise<CreditReservation> {
    // 1. Estimate cost for this request
    const costEstimate = await this.costEstimator.estimateAgentExecution({
      vision: agentRequest.vision,
      maxIterations: agentRequest.options.maxIterations,
      enableWebSearch: agentRequest.options.enableWebSearch,
      expectedComplexity: this.analyzeVisionComplexity(agentRequest.vision)
    });
    
    // 2. Check if user has sufficient credits
    const balance = await this.creditManager.getBalance(userId);
    
    if (balance.availableBalance < costEstimate.estimatedCost) {
      throw new InsufficientCreditsError({
        required: costEstimate.estimatedCost,
        available: balance.availableBalance,
        shortfall: costEstimate.estimatedCost - balance.availableBalance
      });
    }
    
    // 3. Reserve credits for this execution
    const reservation = await this.creditManager.reserveCredits(
      userId,
      costEstimate.estimatedCost,
      {
        description: `Agent execution reservation`,
        metadata: {
          visionPreview: agentRequest.vision.substring(0, 100),
          estimatedDuration: costEstimate.estimatedDuration
        }
      }
    );
    
    return {
      reservationId: reservation.id,
      reservedAmount: costEstimate.estimatedCost,
      estimatedCost: costEstimate.estimatedCost,
      remainingBalance: balance.availableBalance - costEstimate.estimatedCost
    };
  }
  
  async finalizeCredits(
    userId: string,
    reservationId: string,
    actualCost: number,
    sessionId: string
  ): Promise<void> {
    await this.creditManager.finalizeReservation(
      userId,
      reservationId,
      actualCost,
      {
        sessionId,
        description: `Agent execution completed`
      }
    );
  }
}
```

## Rate Limiting Implementation

```typescript
export class RateLimitService {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL!);
  }
  
  async checkUserRateLimit(
    userId: string,
    subscriptionTier: SubscriptionTier
  ): Promise<RateLimitResult> {
    const limits = this.getTierLimits(subscriptionTier);
    const windowKey = `rate_limit:user:${userId}:${Math.floor(Date.now() / limits.windowMs)}`;
    
    const currentCount = await this.redis.incr(windowKey);
    await this.redis.expire(windowKey, limits.windowMs / 1000);
    
    const allowed = currentCount <= limits.requestsPerWindow;
    const remaining = Math.max(0, limits.requestsPerWindow - currentCount);
    const resetTime = Math.floor(Date.now() / limits.windowMs + 1) * limits.windowMs;
    
    return {
      allowed,
      remaining,
      resetTime,
      limit: limits.requestsPerWindow
    };
  }
  
  async checkConcurrentSessions(
    userId: string,
    subscriptionTier: SubscriptionTier
  ): Promise<ConcurrencyCheckResult> {
    const limits = this.getTierLimits(subscriptionTier);
    const activeSessionsKey = `active_sessions:${userId}`;
    
    const activeSessions = await this.redis.scard(activeSessionsKey);
    const allowed = activeSessions < limits.maxConcurrentSessions;
    
    return {
      allowed,
      current: activeSessions,
      limit: limits.maxConcurrentSessions
    };
  }
  
  private getTierLimits(tier: SubscriptionTier): RateLimits {
    const limits = {
      individual: {
        requestsPerWindow: 1000,
        windowMs: 3600000, // 1 hour
        maxConcurrentSessions: 2,
        maxAgentsPerSession: 10
      },
      team: {
        requestsPerWindow: 5000,
        windowMs: 3600000,
        maxConcurrentSessions: 10, 
        maxAgentsPerSession: 20
      },
      enterprise: {
        requestsPerWindow: 50000,
        windowMs: 3600000,
        maxConcurrentSessions: 100,
        maxAgentsPerSession: 50
      }
    };
    
    return limits[tier];
  }
}
```

## Agent Execution Gateway

### Request Sanitization and Agent Spawning

**Study Pattern:** `src/agent/AgentSession.ts` - Agent execution with streaming

```typescript
export class AgentExecutionGateway {
  constructor(
    private authService: AuthenticationService,
    private creditService: CreditGatewayService,
    private rateLimitService: RateLimitService,
    private workspaceManager: WorkspaceManager,
    private agentManager: AgentManager,
    private auditLogger: AuditLogger
  ) {}
  
  async executeAgent(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    
    try {
      // 1. Extract and validate user context
      const user = req.user; // Set by authentication middleware
      const { vision, options, webhookUrl } = req.body;
      
      // 2. Input validation and sanitization
      const validatedRequest = await this.validateAgentRequest({
        vision,
        options,
        webhookUrl
      });
      
      // 3. Rate limiting checks
      const rateLimitCheck = await this.rateLimitService.checkUserRateLimit(
        user.id,
        user.subscriptionTier
      );
      
      if (!rateLimitCheck.allowed) {
        return this.sendRateLimitError(res, rateLimitCheck);
      }
      
      // 4. Concurrent session check
      const concurrencyCheck = await this.rateLimitService.checkConcurrentSessions(
        user.id,
        user.subscriptionTier
      );
      
      if (!concurrencyCheck.allowed) {
        return this.sendConcurrencyError(res, concurrencyCheck);
      }
      
      // 5. Credit validation and reservation
      const creditReservation = await this.creditService.validateAndReserveCredits(
        user.id,
        validatedRequest
      );
      
      // 6. Create isolated workspace
      const workspace = await this.workspaceManager.createUserWorkspace(
        user.id,
        {
          sessionType: 'agent_execution',
          visionHash: hashString(validatedRequest.vision)
        }
      );
      
      // 7. Prepare sanitized agent request (NO BUSINESS LOGIC!)
      const sanitizedRequest: PureAgentRequest = {
        vision: validatedRequest.vision,
        workingDirectory: workspace.path,
        options: {
          maxIterations: validatedRequest.options.maxIterations || 50,
          enableWebSearch: validatedRequest.options.enableWebSearch !== false,
          enableStreaming: validatedRequest.options.enableStreaming !== false,
          showProgress: validatedRequest.options.showProgress !== false
        }
        // ✅ NO user ID, credit info, subscription details, etc.
      };
      
      // 8. Start agent execution (PURE - no business concerns)
      const agentSession = await this.agentManager.createSession(
        workspace.sessionId,
        sanitizedRequest
      );
      
      // 9. Start execution tracking
      await this.startExecutionTracking(
        user.id,
        workspace.sessionId,
        creditReservation.reservationId,
        requestId
      );
      
      // 10. Return immediate response with session info
      res.status(200).json({
        success: true,
        session: {
          id: agentSession.id,
          session_id: workspace.sessionId,
          status: 'running',
          current_phase: 'EXPLORE',
          streaming_url: `wss://ws.keen.dev/sessions/${workspace.sessionId}`,
          estimated_cost: creditReservation.estimatedCost,
          created_at: new Date().toISOString()
        },
        credit_reserved: creditReservation.reservedAmount,
        request_id: requestId
      });
      
      // 11. Audit log (async)
      this.auditLogger.logAgentExecution({
        userId: user.id,
        sessionId: workspace.sessionId,
        requestId,
        vision: validatedRequest.vision.substring(0, 200),
        estimatedCost: creditReservation.estimatedCost
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Handle different error types
      if (error instanceof InsufficientCreditsError) {
        return this.sendInsufficientCreditsError(res, error, requestId);
      }
      
      if (error instanceof ValidationError) {
        return this.sendValidationError(res, error, requestId);
      }
      
      // Log unexpected errors
      this.auditLogger.logError({
        requestId,
        userId: req.user?.id,
        error: error.message,
        duration
      });
      
      return this.sendInternalError(res, requestId);
    }
  }
  
  private async validateAgentRequest(
    request: unknown
  ): Promise<ValidatedAgentRequest> {
    const schema = z.object({
      vision: z.string()
        .min(10, 'Vision must be at least 10 characters')
        .max(32000, 'Vision too long (max 32,000 characters)'),
      options: z.object({
        maxIterations: z.number().min(1).max(200).optional(),
        costBudget: z.number().min(0.1).max(1000).optional(),
        enableWebSearch: z.boolean().optional(),
        enableStreaming: z.boolean().optional(),
        showProgress: z.boolean().optional()
      }).optional().default({}),
      webhookUrl: z.string().url().optional()
    });
    
    try {
      return schema.parse(request);
    } catch (error) {
      throw new ValidationError('Invalid request format', error);
    }
  }
}
```

## WebSocket Management

**Study Pattern:** `src/conversation/StreamingManager.ts` - Real-time progress streaming

```typescript
export class WebSocketGateway {
  private wss: WebSocketServer;
  private connections: Map<string, AuthenticatedWebSocket> = new Map();
  
  constructor(
    private authService: AuthenticationService,
    private sessionManager: SessionManager
  ) {
    this.setupWebSocketServer();
  }
  
  private setupWebSocketServer(): void {
    this.wss = new WebSocketServer({
      port: parseInt(process.env.WEBSOCKET_PORT || '3001'),
      verifyClient: this.verifyWebSocketClient.bind(this)
    });
    
    this.wss.on('connection', this.handleConnection.bind(this));
  }
  
  private async verifyWebSocketClient(
    info: { origin: string; secure: boolean; req: IncomingMessage }
  ): Promise<boolean> {
    try {
      // Extract token from query string or header
      const url = new URL(info.req.url!, `ws://localhost:${this.wss.port}`);
      const token = url.searchParams.get('token') || 
                   info.req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) return false;
      
      // Verify JWT token
      const payload = await this.authService.verifyAccessToken(token);
      
      // Attach user info to request
      (info.req as any).userId = payload.sub;
      (info.req as any).sessionFilters = url.searchParams.get('sessions')?.split(',') || [];
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const userId = (req as any).userId;
    const sessionFilters = (req as any).sessionFilters;
    const connectionId = generateConnectionId();
    
    const authenticatedWs: AuthenticatedWebSocket = {
      ws,
      userId,
      sessionFilters,
      connectionId,
      connectedAt: new Date(),
      lastPingAt: new Date()
    };
    
    this.connections.set(connectionId, authenticatedWs);
    
    // Setup event handlers
    ws.on('message', (data) => this.handleMessage(connectionId, data));
    ws.on('close', () => this.handleDisconnection(connectionId));
    ws.on('pong', () => this.handlePong(connectionId));
    
    // Start heartbeat
    this.startHeartbeat(connectionId);
    
    // Send welcome message
    this.sendToConnection(connectionId, {
      type: 'connection_established',
      data: {
        connectionId,
        userId,
        sessionFilters
      }
    });
  }
  
  async broadcastToUser(
    userId: string,
    event: StreamingEvent
  ): Promise<void> {
    const userConnections = Array.from(this.connections.values())
      .filter(conn => conn.userId === userId);
    
    for (const connection of userConnections) {
      // Check if connection is interested in this session
      if (connection.sessionFilters.length === 0 ||
          connection.sessionFilters.includes(event.session_id)) {
        this.sendToConnection(connection.connectionId, event);
      }
    }
  }
  
  private sendToConnection(connectionId: string, data: any): void {
    const connection = this.connections.get(connectionId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify(data));
    }
  }
}
```

## Request/Response Middleware

### Authentication Middleware

```typescript
export function authenticateRequest() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: {
            type: 'AUTHENTICATION_ERROR',
            code: 'MISSING_TOKEN',
            message: 'Authorization header required'
          }
        });
      }
      
      let user: User;
      
      if (authHeader.startsWith('Bearer ')) {
        // JWT token
        const token = authHeader.substring(7);
        const payload = await authService.verifyAccessToken(token);
        user = await userDAO.getUser(payload.sub);
      } else if (authHeader.startsWith('ApiKey ')) {
        // API key
        const apiKey = authHeader.substring(7);
        const validation = await apiKeyService.validateAPIKey(apiKey);
        user = await userDAO.getUser(validation.userId);
        (req as any).apiKeyScopes = validation.scopes;
      } else {
        return res.status(401).json({
          success: false,
          error: {
            type: 'AUTHENTICATION_ERROR',
            code: 'INVALID_TOKEN_FORMAT',
            message: 'Invalid authorization format'
          }
        });
      }
      
      if (!user || user.accountStatus !== 'active') {
        return res.status(401).json({
          success: false,
          error: {
            type: 'AUTHENTICATION_ERROR',
            code: 'INVALID_TOKEN',
            message: 'Token is invalid or user account is not active'
          }
        });
      }
      
      (req as AuthenticatedRequest).user = user;
      next();
      
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return res.status(401).json({
          success: false,
          error: {
            type: 'AUTHENTICATION_ERROR',
            code: 'INVALID_TOKEN',
            message: error.message
          }
        });
      }
      
      return res.status(500).json({
        success: false,
        error: {
          type: 'SYSTEM_ERROR',
          code: 'AUTHENTICATION_FAILED',
          message: 'Authentication system error'
        }
      });
    }
  };
}
```

## Testing Requirements

### Security Tests

```typescript
describe('API Gateway Security', () => {
  test('blocks unauthenticated requests', async () => {
    const response = await request(app)
      .post('/agents/execute')
      .send({ vision: 'Test vision' });
      
    expect(response.status).toBe(401);
    expect(response.body.error.type).toBe('AUTHENTICATION_ERROR');
  });
  
  test('enforces rate limits per subscription tier', async () => {
    const user = await createTestUser({ subscriptionTier: 'individual' });
    const token = await generateTestToken(user);
    
    // Individual tier allows 1000 requests/hour
    // Simulate rapid requests
    const promises = Array(1001).fill(0).map(() => 
      request(app)
        .get('/credits/balance')
        .set('Authorization', `Bearer ${token}`)
    );
    
    const responses = await Promise.all(promises);
    const rateLimited = responses.filter(r => r.status === 429);
    
    expect(rateLimited.length).toBeGreaterThan(0);
  });
  
  test('prevents agent access to business logic', async () => {
    // Mock agent execution to verify sanitized request
    const agentManager = {
      createSession: jest.fn().mockImplementation((sessionId, request) => {
        // Verify request contains ONLY pure agent data
        expect(request).not.toHaveProperty('userId');
        expect(request).not.toHaveProperty('creditBalance');
        expect(request).not.toHaveProperty('subscriptionTier');
        expect(request).toHaveProperty('vision');
        expect(request).toHaveProperty('workingDirectory');
        expect(request.workingDirectory).toMatch(/\/workspaces\/.+/);
        
        return { id: 'session_123', sessionId };
      })
    };
    
    const gateway = new AgentExecutionGateway(
      authService, creditService, rateLimitService,
      workspaceManager, agentManager, auditLogger
    );
    
    await gateway.executeAgent(authenticatedRequest, mockResponse);
    
    expect(agentManager.createSession).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        vision: expect.any(String),
        workingDirectory: expect.stringMatching(/\/workspaces\/.+/),
        options: expect.any(Object)
      })
    );
  });
});
```

### Load Tests

```typescript
describe('API Gateway Performance', () => {
  test('handles 1000 concurrent authentication requests', async () => {
    const users = await createTestUsers(100);
    const tokens = await Promise.all(users.map(generateTestToken));
    
    const startTime = Date.now();
    
    // 1000 concurrent requests
    const promises = Array(1000).fill(0).map((_, i) => 
      request(app)
        .get('/credits/balance')
        .set('Authorization', `Bearer ${tokens[i % tokens.length]}`)
    );
    
    const responses = await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    // All requests should succeed
    const successful = responses.filter(r => r.status === 200);
    expect(successful.length).toBe(1000);
    
    // Should complete within reasonable time
    expect(duration).toBeLessThan(5000); // 5 seconds
  });
});
```

## Integration Points

**The API Gateway must integrate with:**
- **Phase 1 (Database)**: User authentication, credit management, session persistence
- **Phase 3 (Agent Core)**: Pure agent execution with sanitized requests
- **Phase 4 (WebSockets)**: Real-time streaming coordination
- **Phase 5 (Dashboard)**: User interface and monitoring data

## Deliverables

1. **Complete authentication system** with JWT and API key support
2. **Credit management gateway** with real-time validation
3. **Rate limiting service** with tier-based limits
4. **Request sanitization** ensuring agent purity
5. **WebSocket management** for real-time streaming
6. **Audit logging system** for security and compliance
7. **Comprehensive test suite** with security and load tests
8. **API documentation** with examples and error codes
9. **Monitoring and metrics** collection
10. **Integration interfaces** for agent communication

**Remember:** The API Gateway is the guardian of agent purity. It must handle ALL business logic while ensuring agents remain completely unaware of commercial concerns. User security, credit integrity, and system scalability all depend on this layer working flawlessly.
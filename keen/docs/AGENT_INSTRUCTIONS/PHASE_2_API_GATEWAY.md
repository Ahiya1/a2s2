# Phase 2: API Gateway Implementation

## Mission

Implement keen's **API Gateway layer** that handles ALL business logic, authentication, credit management (no packages), rate limiting, and user-facing concerns. This layer ensures agents remain **completely pure** and unaware of commercial aspects while providing production-grade security and scalability.

## Success Criteria

- [ ] **Complete authentication system** with JWT tokens, API keys, and MFA support
- [ ] **Credit management integration** with real-time balance checking, 5x markup, and admin bypass
- [ ] **Rate limiting and abuse prevention** with per-user limits and admin exemptions
- [ ] **Request sanitization** ensuring agents receive clean, validated inputs
- [ ] **WebSocket management** for real-time streaming coordination
- [ ] **Audit logging** with comprehensive security and compliance trails
- [ ] **Agent purity enforcement** - agents never see business logic
- [ ] **Multi-tenant isolation** at the API layer with admin oversight
- [ ] **Admin user privileges** with unlimited access and analytics
- [ ] **80%+ test coverage** including security and load tests
- [ ] **Production monitoring** with metrics, alerts, and health checks

## Core Architecture Principle

### Agent Purity Enforcement

**CRITICAL:** The API Gateway is the **ONLY** layer that knows about:
- User authentication and sessions
- Credit balances and billing (5x markup)
- Rate limiting and quotas (admin exemptions)
- Multi-tenant concerns and user isolation
- Business logic and commercial aspects
- Admin privileges and unlimited access

Agents receive **sanitized requests** with:
- Clean vision/instructions
- Isolated workspace paths
- Pure development context
- No business metadata
- No indication of admin vs regular users

```typescript
// BAD: Agent sees business logic
const agentRequest = {
  vision: "Create a todo app",
  userId: "user_123",           // ❌ Agent shouldn't know user ID
  creditBalance: 47.50,          // ❌ Agent shouldn't see credits
  isAdminUser: true,             // ❌ Agent shouldn't know admin status
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
    
    // 1. Rate limiting check (skip for admin)
    if (email !== 'ahiya.butman@gmail.com') {
      await this.checkLoginRateLimit(email, clientInfo.ip);
    }
    
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
    
    // 4. MFA verification if enabled (skip for admin with correct password)
    if (user.mfaEnabled && !(user.isAdmin && password === '2con-creator')) {
      if (!mfaToken) {
        throw new MFARequiredError('MFA token required');
      }
      
      if (!await this.verifyMFAToken(user.mfaSecret, mfaToken)) {
        await this.auditLogger.logFailedLogin(email, clientInfo, 'invalid_mfa');
        throw new AuthenticationError('Invalid MFA token');
      }
    }
    
    // 5. Generate tokens with admin privileges
    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user, clientInfo);
    
    // 6. Update login tracking
    await this.userDAO.updateLastLogin(user.id, clientInfo.ip);
    
    // 7. Audit successful login
    await this.auditLogger.logSuccessfulLogin(user.id, clientInfo, {
      isAdmin: user.isAdmin,
      adminPrivileges: user.adminPrivileges
    });
    
    return {
      user: this.sanitizeUserForResponse(user),
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: user.isAdmin ? 3600 : 900 // Admin tokens last 1 hour
      },
      adminAccess: user.isAdmin
    };
  }
  
  async generateAccessToken(user: User): Promise<string> {
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isAdmin: user.isAdmin,
      adminPrivileges: user.adminPrivileges,
      scopes: this.getUserScopes(user),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (user.isAdmin ? 3600 : 900) // Admin: 1h, User: 15min
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
      
      // Verify admin privileges haven't been revoked
      if (payload.isAdmin && !user.isAdmin) {
        throw new AuthenticationError('Admin privileges revoked');
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
    const user = await this.userDAO.getUser(userId);
    
    // Generate secure API key
    const keyValue = this.generateSecureAPIKey(user.isAdmin);
    const keyHash = await this.hashAPIKey(keyValue);
    
    // Store API key with metadata and admin privileges
    const apiKey = await this.tokenDAO.createAPIKey({
      userId,
      tokenHash: keyHash,
      name: keyConfig.name,
      scopes: keyConfig.scopes,
      rateLimitPerHour: user.isAdmin ? null : (keyConfig.rateLimitPerHour || 1000),
      bypassLimits: user.isAdmin,
      expiresAt: keyConfig.expiresAt
    });
    
    return {
      id: apiKey.id,
      key: keyValue, // Only shown once!
      name: apiKey.name,
      scopes: apiKey.scopes,
      rateLimitPerHour: apiKey.rateLimitPerHour,
      bypassLimits: apiKey.bypassLimits,
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
    
    // Check rate limit (skip for admin keys)
    if (!apiKey.bypassLimits) {
      const rateLimitCheck = await this.rateLimitService.checkAPIKeyLimit(
        apiKey.id,
        apiKey.rateLimitPerHour
      );
      
      if (!rateLimitCheck.allowed) {
        throw new RateLimitError('API key rate limit exceeded', rateLimitCheck);
      }
    }
    
    // Update usage tracking
    await this.tokenDAO.updateAPIKeyUsage(apiKey.id);
    
    return {
      userId: apiKey.userId,
      scopes: apiKey.scopes,
      rateLimitRemaining: apiKey.bypassLimits ? 'unlimited' : rateLimitCheck.remaining,
      isAdmin: apiKey.bypassLimits,
      adminPrivileges: apiKey.bypassLimits ? await this.getAdminPrivileges(apiKey.userId) : null
    };
  }
  
  private generateSecureAPIKey(isAdmin: boolean): string {
    const prefix = isAdmin ? 'ak_admin_' : 'ak_live_';
    const randomBytes = crypto.randomBytes(32);
    return prefix + randomBytes.toString('hex');
  }
}
```

## Credit Management Integration (No Packages)

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
    
    // Check if user is admin (unlimited credits)
    const isAdmin = await this.creditManager.isAdminUser(userId);
    
    if (isAdmin) {
      return {
        reservationId: `admin_bypass_${Date.now()}`,
        reservedAmount: 0,
        estimatedCost: 0,
        remainingBalance: 999999.999999,
        isAdmin: true,
        unlimited: true
      };
    }
    
    // 1. Estimate Claude API cost for this request
    const costEstimate = await this.costEstimator.estimateAgentExecution({
      vision: agentRequest.vision,
      maxIterations: agentRequest.options.maxIterations,
      enableWebSearch: agentRequest.options.enableWebSearch,
      expectedComplexity: this.analyzeVisionComplexity(agentRequest.vision)
    });
    
    const claudeCost = costEstimate.estimatedClaudeCostUSD;
    const creditCost = claudeCost * 5.0; // 5x markup
    
    // 2. Check if user has sufficient credits
    const balance = await this.creditManager.getBalance(userId);
    
    if (balance.availableBalance < creditCost) {
      throw new InsufficientCreditsError({
        required: creditCost,
        available: balance.availableBalance,
        shortfall: creditCost - balance.availableBalance,
        claudeCost: claudeCost,
        markupMultiplier: 5.0
      });
    }
    
    // 3. Reserve credits for this execution
    const reservation = await this.creditManager.reserveCredits(
      userId,
      creditCost,
      {
        description: `Agent execution reservation`,
        claudeCost: claudeCost,
        metadata: {
          visionPreview: agentRequest.vision.substring(0, 100),
          estimatedDuration: costEstimate.estimatedDuration
        }
      }
    );
    
    return {
      reservationId: reservation.id,
      reservedAmount: creditCost,
      estimatedCost: creditCost,
      claudeCost: claudeCost,
      markupMultiplier: 5.0,
      remainingBalance: balance.availableBalance - creditCost
    };
  }
  
  async finalizeCredits(
    userId: string,
    reservationId: string,
    actualClaudeCost: number,
    sessionId: string
  ): Promise<void> {
    
    // Skip for admin users
    if (await this.creditManager.isAdminUser(userId)) {
      await this.creditManager.logAdminBypass(
        userId,
        actualClaudeCost,
        sessionId,
        'Admin execution completed'
      );
      return;
    }
    
    const actualCreditCost = actualClaudeCost * 5.0;
    
    await this.creditManager.finalizeReservation(
      userId,
      reservationId,
      actualCreditCost,
      {
        sessionId,
        claudeCost: actualClaudeCost,
        markupMultiplier: 5.0,
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
    userRole: string = 'user'
  ): Promise<RateLimitResult> {
    
    // Admin users bypass all rate limits
    if (userRole === 'super_admin' || userRole === 'admin') {
      return {
        allowed: true,
        remaining: 'unlimited',
        resetTime: null,
        limit: 'unlimited',
        isAdmin: true
      };
    }
    
    const limits = this.getTierLimits('individual'); // No packages, single tier
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
    userRole: string = 'user'
  ): Promise<ConcurrencyCheckResult> {
    
    // Admin users bypass concurrency limits
    if (userRole === 'super_admin' || userRole === 'admin') {
      return {
        allowed: true,
        current: 'unlimited',
        limit: 'unlimited',
        isAdmin: true
      };
    }
    
    const limits = this.getTierLimits('individual');
    const activeSessionsKey = `active_sessions:${userId}`;
    
    const activeSessions = await this.redis.scard(activeSessionsKey);
    const allowed = activeSessions < limits.maxConcurrentSessions;
    
    return {
      allowed,
      current: activeSessions,
      limit: limits.maxConcurrentSessions
    };
  }
  
  private getTierLimits(tier: string): RateLimits {
    // Single tier since no packages
    return {
      requestsPerWindow: 1000,
      windowMs: 3600000, // 1 hour
      maxConcurrentSessions: 5,
      maxAgentsPerSession: 15
    };
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
      
      // 3. Rate limiting checks (skip for admin)
      if (!user.isAdmin) {
        const rateLimitCheck = await this.rateLimitService.checkUserRateLimit(
          user.id,
          user.role
        );
        
        if (!rateLimitCheck.allowed) {
          return this.sendRateLimitError(res, rateLimitCheck);
        }
        
        // 4. Concurrent session check (skip for admin)
        const concurrencyCheck = await this.rateLimitService.checkConcurrentSessions(
          user.id,
          user.role
        );
        
        if (!concurrencyCheck.allowed) {
          return this.sendConcurrencyError(res, concurrencyCheck);
        }
      }
      
      // 5. Credit validation and reservation (admin bypass)
      const creditReservation = await this.creditService.validateAndReserveCredits(
        user.id,
        validatedRequest
      );
      
      // 6. Create isolated workspace
      const workspace = await this.workspaceManager.createUserWorkspace(
        user.id,
        {
          sessionType: 'agent_execution',
          visionHash: hashString(validatedRequest.vision),
          isAdminSession: user.isAdmin
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
        // ✅ NO user ID, credit info, admin status, etc.
      };
      
      // 8. Start agent execution (PURE - no business concerns)
      const agentSession = await this.agentManager.createSession(
        workspace.sessionId,
        sanitizedRequest,
        {
          isAdminSession: user.isAdmin, // Internal tracking only
          bypassCreditDeduction: user.isAdmin
        }
      );
      
      // 9. Start execution tracking
      await this.startExecutionTracking(
        user.id,
        workspace.sessionId,
        creditReservation.reservationId,
        requestId,
        user.isAdmin
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
          claude_cost: creditReservation.claudeCost,
          markup_multiplier: creditReservation.markupMultiplier,
          is_admin_session: user.isAdmin,
          credit_bypass: creditReservation.isAdmin || false,
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
        estimatedCost: creditReservation.estimatedCost,
        isAdminSession: user.isAdmin,
        creditBypass: creditReservation.isAdmin || false
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
        duration,
        isAdmin: req.user?.isAdmin || false
      });
      
      return this.sendInternalError(res, requestId);
    }
  }
  
  private sendInsufficientCreditsError(
    res: Response, 
    error: InsufficientCreditsError, 
    requestId: string
  ): void {
    res.status(402).json({
      success: false,
      error: {
        type: 'INSUFFICIENT_CREDITS',
        code: 'PAYMENT_REQUIRED',
        message: 'Insufficient credits for this operation',
        details: {
          required: error.required,
          available: error.available,
          shortfall: error.shortfall,
          claude_cost: error.claudeCost,
          markup_multiplier: error.markupMultiplier,
          credit_packages: {
            starter: { amount: 25, credits: 500 },
            developer: { amount: 100, credits: 2200, bonus: '10%' },
            professional: { amount: 500, credits: 12000, bonus: '20%' },
            enterprise: { amount: 2000, credits: 50000, bonus: '25%' }
          }
        }
      },
      request_id: requestId
    });
  }
}
```

### Admin Analytics Endpoint

```typescript
export class AdminAnalyticsController {
  constructor(
    private analyticsDAO: AnalyticsDAO,
    private auditLogger: AuditLogger
  ) {}
  
  async getSystemAnalytics(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const user = req.user;
    
    // Verify admin privileges
    if (!user.isAdmin || !user.adminPrivileges?.view_all_analytics) {
      return res.status(403).json({
        success: false,
        error: {
          type: 'FORBIDDEN',
          code: 'INSUFFICIENT_PRIVILEGES',
          message: 'Admin privileges required for analytics access'
        }
      });
    }
    
    try {
      const timeRange = req.query.range as 'day' | 'week' | 'month' || 'day';
      const analytics = await this.analyticsDAO.getAdminAnalytics(user.id, timeRange);
      
      // Audit admin analytics access
      await this.auditLogger.logAdminAction({
        adminUserId: user.id,
        action: 'view_analytics',
        timeRange,
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        analytics: {
          ...analytics,
          credit_system: {
            markup_multiplier: 5.0,
            no_packages: true,
            admin_bypasses: analytics.costAnalysis.adminBypasses
          }
        },
        metadata: {
          generated_at: new Date().toISOString(),
          time_range: timeRange,
          admin_user: user.email
        }
      });
      
    } catch (error) {
      await this.auditLogger.logError({
        adminUserId: user.id,
        action: 'analytics_error',
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: {
          type: 'SYSTEM_ERROR',
          code: 'ANALYTICS_ERROR',
          message: 'Failed to retrieve analytics data'
        }
      });
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
  
  private async verifyWebSocketClient(
    info: { origin: string; secure: boolean; req: IncomingMessage }
  ): Promise<boolean> {
    try {
      const url = new URL(info.req.url!, `ws://localhost:${this.wss.port}`);
      const token = url.searchParams.get('token') || 
                   info.req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) return false;
      
      // Verify JWT token
      const payload = await this.authService.verifyAccessToken(token);
      
      // Attach user info to request
      (info.req as any).userId = payload.sub;
      (info.req as any).isAdmin = payload.isAdmin;
      (info.req as any).adminPrivileges = payload.adminPrivileges;
      (info.req as any).sessionFilters = url.searchParams.get('sessions')?.split(',') || [];
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const connectionId = generateConnectionId();
    const userId = (req as any).userId;
    const isAdmin = (req as any).isAdmin;
    const adminPrivileges = (req as any).adminPrivileges;
    const sessionFilters = (req as any).sessionFilters;
    
    const connection: AuthenticatedWebSocket = {
      ws,
      userId,
      isAdmin,
      adminPrivileges,
      sessionFilters,
      connectionId,
      connectedAt: new Date(),
      lastPingAt: new Date()
    };
    
    this.connections.set(connectionId, connection);
    
    // Setup event handlers
    ws.on('message', (data) => this.handleMessage(connectionId, data));
    ws.on('close', () => this.handleDisconnection(connectionId));
    ws.on('pong', () => this.handlePong(connectionId));
    
    // Start heartbeat
    this.startHeartbeat(connectionId);
    
    // Send welcome message with admin status
    this.sendToConnection(connectionId, {
      type: 'connection_established',
      data: {
        connectionId,
        userId,
        adminAccess: isAdmin,
        sessionFilters,
        privileges: isAdmin ? adminPrivileges : null
      }
    });
    
    Logger.info('WebSocket connection established', {
      connectionId,
      userId,
      isAdmin,
      sessionFilters: sessionFilters.length
    });
  }
  
  async broadcastToUser(
    userId: string,
    event: StreamingEvent,
    adminOnly: boolean = false
  ): Promise<void> {
    let userConnections = Array.from(this.connections.values())
      .filter(conn => conn.userId === userId);
    
    // If admin-only event, filter for admin connections
    if (adminOnly) {
      userConnections = userConnections.filter(conn => conn.isAdmin);
    }
    
    for (const connection of userConnections) {
      // Check if connection is interested in this session
      if (connection.sessionFilters.length === 0 ||
          connection.sessionFilters.includes(event.session_id) ||
          (connection.isAdmin && connection.adminPrivileges?.view_all_sessions)) {
        this.sendToConnection(connection.connectionId, event);
      }
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
      let authMethod: 'jwt' | 'api_key';
      
      if (authHeader.startsWith('Bearer ')) {
        // JWT token
        const token = authHeader.substring(7);
        const payload = await authService.verifyAccessToken(token);
        user = await userDAO.getUser(payload.sub);
        authMethod = 'jwt';
      } else if (authHeader.startsWith('ApiKey ')) {
        // API key
        const apiKey = authHeader.substring(7);
        const validation = await apiKeyService.validateAPIKey(apiKey);
        user = await userDAO.getUser(validation.userId);
        authMethod = 'api_key';
        
        // Add API key specific info
        (req as any).apiKeyScopes = validation.scopes;
        (req as any).apiKeyIsAdmin = validation.isAdmin;
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
      
      // Enhance user object with admin info
      const enhancedUser = {
        ...user,
        authMethod,
        tokenIsAdmin: authMethod === 'api_key' ? (req as any).apiKeyIsAdmin : user.isAdmin
      };
      
      (req as AuthenticatedRequest).user = enhancedUser;
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
  test('admin user bypasses rate limits', async () => {
    const adminToken = await generateTestToken('admin-user-id');
    const regularToken = await generateTestToken('regular-user-id');
    
    // Admin should bypass rate limits
    const adminRequests = Array(2000).fill(0).map(() => 
      request(app)
        .get('/credits/balance')
        .set('Authorization', `Bearer ${adminToken}`)
    );
    
    const adminResponses = await Promise.all(adminRequests);
    const adminRateLimited = adminResponses.filter(r => r.status === 429);
    
    expect(adminRateLimited.length).toBe(0); // No rate limiting for admin
    
    // Regular user should be rate limited
    const regularRequests = Array(1001).fill(0).map(() => 
      request(app)
        .get('/credits/balance')
        .set('Authorization', `Bearer ${regularToken}`)
    );
    
    const regularResponses = await Promise.all(regularRequests);
    const regularRateLimited = regularResponses.filter(r => r.status === 429);
    
    expect(regularRateLimited.length).toBeGreaterThan(0); // Rate limited
  });
  
  test('admin user gets unlimited credits', async () => {
    const adminUser = await createTestAdminUser();
    const adminToken = await generateTestToken(adminUser.id);
    
    // Start expensive agent execution
    const response = await request(app)
      .post('/agents/execute')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        vision: 'Complex high-cost agent execution',
        options: { maxIterations: 100 }
      });
      
    expect(response.status).toBe(200);
    expect(response.body.session.credit_bypass).toBe(true);
    expect(response.body.session.is_admin_session).toBe(true);
    expect(response.body.credit_reserved).toBe(0);
  });
  
  test('prevents agent access to business logic', async () => {
    const agentManager = {
      createSession: jest.fn().mockImplementation((sessionId, request, options) => {
        // Verify request contains ONLY pure agent data
        expect(request).not.toHaveProperty('userId');
        expect(request).not.toHaveProperty('creditBalance');
        expect(request).not.toHaveProperty('isAdmin');
        expect(request).toHaveProperty('vision');
        expect(request).toHaveProperty('workingDirectory');
        expect(request.workingDirectory).toMatch(/\/workspaces\/.+/);
        
        // Options should not contain business metadata
        expect(options.isAdminSession).toBeDefined(); // Internal tracking only
        
        return { id: 'session_123', sessionId };
      })
    };
    
    const gateway = new AgentExecutionGateway(
      authService, creditService, rateLimitService,
      workspaceManager, agentManager, auditLogger
    );
    
    const adminRequest = createAuthenticatedRequest({
      isAdmin: true,
      adminPrivileges: { unlimited_credits: true }
    });
    
    await gateway.executeAgent(adminRequest, mockResponse);
    
    expect(agentManager.createSession).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        vision: expect.any(String),
        workingDirectory: expect.stringMatching(/\/workspaces\/.+/),
        options: expect.any(Object)
      }),
      expect.objectContaining({
        isAdminSession: true,
        bypassCreditDeduction: true
      })
    );
  });
});
```

### Admin Analytics Tests

```typescript
describe('Admin Analytics', () => {
  test('admin can access system analytics', async () => {
    const adminToken = await generateAdminToken();
    
    const response = await request(app)
      .get('/admin/analytics?range=day')
      .set('Authorization', `Bearer ${adminToken}`);
      
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.analytics).toBeDefined();
    expect(response.body.analytics.credit_system).toEqual({
      markup_multiplier: 5.0,
      no_packages: true,
      admin_bypasses: expect.any(Number)
    });
  });
  
  test('regular user cannot access admin analytics', async () => {
    const regularToken = await generateTestToken('regular-user');
    
    const response = await request(app)
      .get('/admin/analytics')
      .set('Authorization', `Bearer ${regularToken}`);
      
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_PRIVILEGES');
  });
});
```

### Load Tests

```typescript
describe('API Gateway Performance', () => {
  test('handles admin and regular users concurrently', async () => {
    const adminTokens = await generateAdminTokens(10);
    const regularTokens = await generateTestTokens(990);
    
    const startTime = Date.now();
    
    // Mixed load: admin + regular users
    const adminRequests = adminTokens.map(token => 
      request(app)
        .get('/credits/balance')
        .set('Authorization', `Bearer ${token}`)
    );
    
    const regularRequests = regularTokens.map(token => 
      request(app)
        .get('/credits/balance')
        .set('Authorization', `Bearer ${token}`)
    );
    
    const allRequests = [...adminRequests, ...regularRequests];
    const responses = await Promise.all(allRequests);
    const duration = Date.now() - startTime;
    
    // All admin requests should succeed
    const adminResponses = responses.slice(0, 10);
    expect(adminResponses.every(r => r.status === 200)).toBe(true);
    
    // Some regular requests may be rate limited
    const regularResponses = responses.slice(10);
    const regularSuccesses = regularResponses.filter(r => r.status === 200);
    expect(regularSuccesses.length).toBeGreaterThan(0);
    
    // Should complete within reasonable time
    expect(duration).toBeLessThan(10000); // 10 seconds
  });
});
```

## Integration Points

**The API Gateway must integrate with:**
- **Phase 1 (Database)**: User authentication, credit management with admin bypasses, session persistence
- **Phase 3 (Agent Core)**: Pure agent execution with sanitized requests
- **Phase 4 (WebSockets)**: Real-time streaming coordination with admin privileges
- **Phase 5 (Dashboard)**: User interface and admin analytics data

## Deliverables

1. **Complete authentication system** with JWT and API key support plus admin privileges
2. **Credit management gateway** with real-time validation, 5x markup, and admin bypass
3. **Rate limiting service** with per-user limits and admin exemptions
4. **Request sanitization** ensuring agent purity
5. **WebSocket management** for real-time streaming with admin capabilities
6. **Audit logging system** for security and compliance with admin activity tracking
7. **Admin analytics endpoints** with comprehensive system insights
8. **Comprehensive test suite** with security, admin, and load tests
9. **API documentation** with examples, error codes, and admin endpoints
10. **Integration interfaces** for agent communication with admin privilege propagation

**Remember:** The API Gateway is the guardian of agent purity and the enforcer of the credit system. It must handle ALL business logic including admin privileges while ensuring agents remain completely unaware of commercial concerns. User security, credit integrity with 5x markup, admin unlimited access, and system scalability all depend on this layer working flawlessly.
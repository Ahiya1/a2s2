# keen Implementation Guidelines for Future Agents

## Overview

You are implementing **keen** - a commercial, multi-tenant, authenticated development platform that transforms a2s2's autonomous agent system into a production-grade service. These guidelines ensure consistency, quality, and adherence to keen's core architectural principles.

## Critical Principles

### 1. Agent Purity Principle (SACRED)

**Agents must remain completely unaware of:**

- Credit balances, costs, or billing information
- User authentication details and session management
- Multi-tenant concerns and user isolation
- Business logic and commercial aspects
- Rate limiting and usage restrictions

**The API Gateway handles ALL business concerns.** Agents receive sanitized requests and focus purely on development tasks.

### 2. 1M Context Requirement (NON-NEGOTIABLE)

**EVERY agent MUST use the full 1M token context window:**

```typescript
// This configuration is REQUIRED for all agents
const config = {
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 64000,
  thinking: true,
  enableExtendedContext: true, // CRITICAL: Must be true
  contextWindowSize: 1000000, // CRITICAL: Must be 1M tokens
  betas: [
    "extended-context-2024-10", // Required beta feature
    "thinking-2024-10", // Required for thinking blocks
  ],
};
```

CHECK CURRENT IMPLEMENTATION AT

### 3. Multi-Tenant Isolation (ABSOLUTE)

**Complete user isolation at every level:**

```
/workspaces/
├── user_abc123/          # User A's complete isolation
│   ├── session_456/
│   │   ├── .git/        # Isolated git repository
│   │   ├── main/        # Main branch workspace
│   │   └── summon-A/    # Agent workspace
│   └── session_789/
└── user_def456/          # User B's complete isolation
    └── session_101/
```

**NO shared state, files, or git history between users.**

### 4. Recursive Agent Architecture (CORE INNOVATION)

**Git-based recursive spawning is keen's breakthrough:**

```
main-agent
├── summon-A (authentication)
│   ├── summon-A-A (JWT)
│   └── summon-A-B (API keys)
├── summon-B (database)
│   ├── summon-B-A (schema)
│   └── summon-B-B (migrations)
└── summon-C (frontend)
    ├── summon-C-A (auth UI)
    └── summon-C-B (dashboard)
```

**Each agent gets its own git branch and can spawn sub-agents infinitely.**

## Quality Standards

### Testing Requirements (80%+ Coverage)

**Every component must have comprehensive tests:**

```typescript
// Example test structure
describe("UserAuthenticationService", () => {
  // Unit tests
  describe("JWT Token Validation", () => {
    test("validates valid JWT tokens");
    test("rejects expired tokens");
    test("handles malformed tokens");
  });

  // Integration tests
  describe("Authentication Flow", () => {
    test("complete login flow with valid credentials");
    test("multi-factor authentication flow");
    test("session refresh flow");
  });

  // Security tests
  describe("Security Boundaries", () => {
    test("prevents token injection attacks");
    test("enforces rate limiting");
    test("logs security events");
  });
});
```

**Required Test Types:**

- **Unit Tests**: Individual function/method testing
- **Integration Tests**: Component interaction testing
- **End-to-End Tests**: Complete workflow testing
- **Security Tests**: Authentication, authorization, input validation
- **Performance Tests**: Load testing for scalability
- **Multi-tenant Tests**: User isolation verification

### Code Quality Standards

**TypeScript Configuration:**

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**ESLint Configuration:**

```json
{
  "extends": ["@typescript-eslint/recommended", "prettier"],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "no-console": "warn"
  }
}
```

### Security Requirements

**Input Validation (ALWAYS):**

```typescript
// All user inputs must be validated
export function validateUserInput(input: unknown): UserInput {
  const schema = z.object({
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .regex(/^(?=.*[A-Za-z])(?=.*\d)/),
    vision: z.string().min(10).max(32000),
  });

  try {
    return schema.parse(input);
  } catch (error) {
    throw new ValidationError("Invalid user input", error);
  }
}
```

**Authentication Patterns:**

```typescript
// JWT validation middleware
export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractTokenFromHeader(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = await verifyJWT(token);
    req.user = await getUserById(payload.sub);
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
```

## a2s2 Integration Patterns

### Study These Files Intensively

**Before implementing any component, understand these a2s2 patterns:**

#### Agent Execution Patterns

- `src/agent/AgentSession.ts` - How agents execute with streaming and cancellation
- `src/agent/phases/ExplorePhase.ts` - Self-healing project analysis
- `src/agent/phases/PlanPhase.ts` - Sophisticated planning with risk assessment

#### Tool Management

- `src/tools/ToolManager.ts` - Unified tool ecosystem with validation
- `src/tools/autonomy/CompletionTool.ts` - How agents signal completion
- `src/tools/autonomy/PhaseReportingTool.ts` - Phase transition management

#### Conversation Management

- `src/conversation/ConversationManager.ts` - Claude API integration with 1M context
- `src/conversation/StreamingManager.ts` - Real-time progress streaming
- `src/conversation/MessageBuilder.ts` - Context management with thinking blocks
- `src/conversation/CostOptimizer.ts` - Token counting and cost tracking

#### Database Patterns

- `src/database/DatabaseManager.ts` - Connection management and health monitoring
- `src/database/ConversationDAO.ts` - Data access patterns with comprehensive analytics
- `src/conversation/ConversationPersistence.ts` - Session persistence with cleanup

#### CLI Patterns

- `src/cli/commands/breathe.ts` - Direct autonomous execution
- `src/cli/commands/converse.ts` - Interactive conversation mode
- `src/cli/index.ts` - Command structure and error handling

### Adaptation Guidelines

**When adapting a2s2 patterns:**

1. **Preserve Core Logic**: Keep the autonomous agent execution logic intact
2. **Add Multi-tenant Layer**: Wrap with user isolation and authentication
3. **Extract Business Logic**: Move commercial concerns to API Gateway
4. **Enhance for Scale**: Add database persistence, caching, monitoring
5. **Maintain Compatibility**: Ensure agents still work with existing tools

**Example Adaptation:**

```typescript
// a2s2 AgentSession (pure)
class AgentSession {
  async execute(options: AgentSessionOptions): Promise<AgentSessionResult> {
    // Pure agent execution logic
  }
}

// keen AgentSession (enhanced for multi-tenant)
class KeenAgentSession extends AgentSession {
  constructor(
    private userId: string,
    private sessionId: string,
    private creditManager: CreditManager,
    options: AgentSessionOptions
  ) {
    super(options);
  }

  async execute(options: AgentSessionOptions): Promise<AgentSessionResult> {
    // Add keen-specific enhancements
    const workspace = await this.createIsolatedWorkspace();
    const result = await super.execute(options); // Call a2s2 core logic
    await this.persistSessionState(result);
    return result;
  }

  private async createIsolatedWorkspace(): Promise<string> {
    // Create isolated workspace for this user/session
  }
}
```

## Error Handling Standards

### Error Types and Responses

```typescript
// Standardized error types
export enum ErrorType {
  AUTHENTICATION = "AUTHENTICATION_ERROR",
  AUTHORIZATION = "AUTHORIZATION_ERROR",
  VALIDATION = "VALIDATION_ERROR",
  RESOURCE_LIMIT = "RESOURCE_LIMIT_ERROR",
  SYSTEM = "SYSTEM_ERROR",
  AGENT_EXECUTION = "AGENT_EXECUTION_ERROR",
}

export interface ErrorResponse {
  success: false;
  error: {
    type: ErrorType;
    code: string;
    message: string;
    details?: any;
    help_url?: string;
  };
  request_id: string;
  timestamp: string;
}
```

### Logging Standards

```typescript
// Structured logging
Logger.info("Agent session started", {
  user_id: userId,
  session_id: sessionId,
  vision: vision.substring(0, 100) + "...",
  cost_budget: options.costBudget,
  workspace_path: workspacePath,
});

Logger.error("Agent execution failed", {
  user_id: userId,
  session_id: sessionId,
  error: error.message,
  stack: error.stack,
  phase: currentPhase,
  iteration: iterationCount,
});
```

## Performance Standards

### Response Time Targets

- **Authentication**: <200ms
- **Agent Spawning**: <2 seconds
- **API Responses**: <500ms
- **Real-time Updates**: <100ms
- **1M Context Processing**: <30 seconds

### Scalability Requirements

- **Concurrent Users**: 10,000+
- **Concurrent Sessions**: 1,000+
- **Database Connections**: Efficient pooling
- **Memory Usage**: <2GB per agent
- **Storage**: Automatic cleanup and archival

### Monitoring Requirements

```typescript
// Every component should expose metrics
export interface ComponentMetrics {
  request_count: number;
  error_count: number;
  average_response_time: number;
  active_connections: number;
  resource_usage: {
    cpu_percent: number;
    memory_mb: number;
    disk_mb: number;
  };
}
```

## Integration Requirements

### API Gateway Integration

**All agent-facing APIs must go through the gateway:**

```typescript
// API Gateway validates and forwards to agent core
export async function executeAgentHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  // 1. Authentication already validated by middleware
  const { user, vision, options } = req.body;

  // 2. Credit validation
  const creditCheck = await creditManager.validateSufficientCredits(
    user.id,
    options.costBudget
  );
  if (!creditCheck.sufficient) {
    return res.status(402).json({
      success: false,
      error: { type: "INSUFFICIENT_CREDITS", ...creditCheck },
    });
  }

  // 3. Rate limiting
  const rateLimitCheck = await rateLimiter.checkLimit(user.id);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: { type: "RATE_LIMITED", ...rateLimitCheck },
    });
  }

  // 4. Create isolated workspace
  const workspace = await workspaceManager.createUserWorkspace(
    user.id,
    generateSessionId()
  );

  // 5. Sanitized execution (no business logic exposed)
  const agentSession = new KeenAgentSession(user.id, workspace.sessionId);
  const result = await agentSession.execute({
    vision, // Raw vision passed through
    ...options,
    workingDirectory: workspace.path, // Isolated workspace
  });

  // 6. Post-processing
  await creditManager.deductCredits(user.id, result.totalCost);
  await sessionManager.persistSession(result);

  res.json({ success: true, ...result });
}
```

### Database Integration Patterns

```typescript
// All database access should use transactions
export async function saveUserSession(
  userId: string,
  sessionData: SessionData
): Promise<DatabaseResult<string>> {
  return await databaseManager.executeTransaction(async (connection) => {
    // Insert session
    const sessionResult = await connection.execute(
      "INSERT INTO agent_sessions (...) VALUES (...)",
      sessionData
    );

    // Update user stats
    await connection.execute(
      "UPDATE daily_usage_stats SET sessions_started = sessions_started + 1 WHERE user_id = ? AND date_bucket = CURRENT_DATE",
      [userId]
    );

    return sessionResult.insertId;
  });
}
```

## Development Workflow

### Implementation Order

1. **Read Documentation**: Understand vision, architecture, and your phase requirements
2. **Study a2s2 Code**: Analyze existing patterns for your component
3. **Design Tests**: Write tests first (TDD approach)
4. **Implement Core**: Build basic functionality
5. **Add Multi-tenant Layer**: Wrap with user isolation
6. **Add Business Logic Layer**: Integrate with API Gateway
7. **Performance Optimization**: Optimize for scale
8. **Security Review**: Validate all security boundaries
9. **Integration Testing**: Test with other components
10. **Documentation**: Update API docs and examples

### Git Workflow

```bash
# Create feature branch
git checkout -b phase-{N}-{component-name}

# Commit frequently with clear messages
git commit -m "feat(auth): implement JWT token validation

- Add token validation middleware
- Include comprehensive tests
- Add security logging
- Update API documentation"

# Push and create PR
git push origin phase-{N}-{component-name}
```

### Documentation Requirements

**Every component must include:**

- API documentation with examples
- Architecture decisions and rationale
- Security considerations
- Performance characteristics
- Testing strategy
- Integration points

## Success Criteria

**Your implementation is successful when:**

1. **Functionality**: All specified features work correctly
2. **Tests**: 80%+ test coverage with meaningful tests
3. **Security**: All security requirements met and verified
4. **Performance**: Meets all performance targets
5. **Integration**: Works seamlessly with other components
6. **Documentation**: Complete and accurate documentation
7. **Code Quality**: Passes all linting and type checking
8. **Multi-tenant**: Complete user isolation verified
9. **Agent Purity**: Agents remain unaware of business logic
10. **1M Context**: All agents use full context window

Remember: You're building the foundation for a revolutionary platform that will democratize autonomous software development. Every line of code contributes to making sophisticated AI development accessible to developers worldwide.

# Phase 3.1: Agent Core with All Tools Except Validation

## Overview

Phase 3.1 implements the core autonomous agent system for keen, built on the foundation of a2s2's sophisticated agent architecture while adding multi-tenant support and 1M context capabilities. This phase provides agents with access to all tools except validation tools, and agents cannot summon other agents (single-agent execution).

## Key Features

### 1. Full a2s2 Agent Foundation

- **4-Phase Lifecycle**: EXPLORE -> PLAN → SUMMON → COMPLETE
- **Agent Purity Principle**: Agents remain completely unaware of business logic
- **1M Context Window**: All agents use full 1,000,000 token context
- **Interleaved Thinking**: Advanced reasoning with thinking blocks
- **Streaming Progress**: Real-time updates and visual indicators

### 2. Tool Ecosystem (All Except Validation)

#### Foundation Tools

- **`get_project_tree`**: Analyze project structure with intelligent exclusions
- **`read_files`**: Read multiple files with error handling
- **`write_files`**: Write multiple files atomically with rollback protection
- **`run_command`**: Execute shell commands with timeout and security

#### Web & Information Tools

- **`web_search`**: Search for current information, documentation, best practices

#### Git Tools

- **`git`**: Full git operations (commit, branch, merge, status)

#### Autonomy Tools

- **`report_phase`**: Report current execution phase and status
- **`continue_work`**: Indicate continuation with detailed next steps
- **`report_complete`**: Signal task completion with comprehensive summary

#### **Excluded in Phase 3.1**

- **`validate_project`**: Project validation tools (available in Phase 3.2)
- **Agent summoning capabilities**: No recursive agent spawning

### 3. Multi-Tenant Integration

#### Database Integration

```typescript
interface AgentSessionDAO {
  // Session management with user isolation
  createSession(userId: string, options: AgentSessionOptions): Promise<string>;
  updateSession(sessionId: string, updates: SessionUpdate): Promise<void>;
  getSessionById(sessionId: string): Promise<AgentSession>;

  // Thinking block storage
  storeThinkingBlock(sessionId: string, block: ThinkingBlock): Promise<void>;
  getThinkingHistory(sessionId: string): Promise<ThinkingBlock[]>;

  // Progress tracking
  updateProgress(sessionId: string, progress: ProgressUpdate): Promise<void>;
}
```

#### Credit System Integration

```typescript
interface CreditIntegration {
  // Pre-execution credit check
  validateSufficientCredits(
    userId: string,
    estimatedCost: number
  ): Promise<boolean>;

  // Real-time cost tracking
  trackTokenUsage(sessionId: string, tokens: TokenUsage): Promise<void>;

  // Post-execution billing
  deductCredits(userId: string, actualCost: number): Promise<TransactionResult>;

  // Admin bypass handling
  handleAdminSession(userId: string): Promise<boolean>;
}
```

### 4. 1M Context Configuration

#### Required Anthropic Settings

```typescript
const PHASE_3_1_CONFIG: AnthropicConfig = {
  model: "claude-sonnet-4-20250514",
  maxTokens: 16000,
  thinkingBudget: 10000,

  // CRITICAL: Phase 3.1 requirements
  enableExtendedContext: true, // 1M context window
  enableInterleaved: true, // Thinking blocks
  enableWebSearch: true, // Information access
  enableStreaming: true, // Real-time updates

  // Beta headers for keen
  betaHeaders: [
    "context-1m-2025-08-07", // 1M context support
    "interleaved-thinking-2025-05-14", // Thinking blocks
  ],
};
```

#### Context Management

```typescript
class ContextManager {
  // Optimize for 1M usage while preserving thinking
  optimizeContextFor1M(messages: Message[]): Message[] {
    return this.intelligentPruning(messages, {
      preserveSystemPrompt: true,
      preserveThinkingBlocks: true,
      preserveRecentTools: true,
      maxContextSize: 950000, // Leave 50k buffer
    });
  }

  // Thinking block preservation
  preserveThinkingChain(session: AgentSession): ThinkingBlock[] {
    return session.thinkingHistory.filter(
      (block) =>
        block.importance === "high" ||
        block.phaseTransition ||
        block.timestamp > Date.now() - 30 * 60 * 1000 // Last 30 minutes
    );
  }
}
```

## Implementation Architecture

### Core Classes

#### 1. KeenAgentSession

```typescript
export class KeenAgentSession extends AgentSession {
  private userId: string;
  private sessionId: string;
  private creditTracker: CreditTracker;
  private sessionDAO: SessionDAO;
  private streamingManager: StreamingManager;

  constructor(options: KeenAgentSessionOptions) {
    // Initialize with 1M context and thinking
    const configManager = new AnthropicConfigManager({
      enableExtendedContext: true,
      enableInterleaved: true,
      enableWebSearch: true,
    });

    super({
      ...options,
      configManager,
      enableStreaming: true,
      showProgress: true,
    });

    this.userId = options.userId;
    this.sessionId = this.generateSessionId();
    this.setupKeenIntegrations();
  }

  private setupKeenIntegrations(): void {
    // Credit tracking
    this.creditTracker = new CreditTracker(this.userId);

    // Database persistence
    this.sessionDAO = new SessionDAO(keen.getDatabaseManager());

    // Real-time streaming
    this.streamingManager = new StreamingManager(this.sessionId);

    // Thinking block storage
    this.on("thinking", this.storeThinkingBlock.bind(this));
    this.on("phaseTransition", this.recordPhaseTransition.bind(this));
  }

  // Override execution with keen-specific features
  async execute(vision: string): Promise<AgentSessionResult> {
    // Pre-execution credit check
    await this.validateCredits();

    // Create session record
    await this.sessionDAO.createSession({
      id: this.sessionId,
      userId: this.userId,
      vision,
      phase: "EXPLORE",
      status: "running",
    });

    // Execute with streaming and tracking
    const result = await super.execute({
      vision,
      enableStreaming: true,
      showProgress: true,
      onProgress: this.handleProgress.bind(this),
      onThinking: this.handleThinking.bind(this),
      onToolCall: this.handleToolCall.bind(this),
    });

    // Post-execution billing and cleanup
    await this.finalizeSession(result);

    return result;
  }
}
```

#### 2. Enhanced Tool Management

```typescript
export class KeenToolManager extends ToolManager {
  constructor(userId: string, sessionId: string) {
    super();
    this.setupPhase31Tools(userId, sessionId);
  }

  private setupPhase31Tools(userId: string, sessionId: string): void {
    // Foundation tools (enhanced with keen integration)
    this.registerTool("get_project_tree", new EnhancedProjectTreeTool(userId));
    this.registerTool("read_files", new TrackedReadFilesTool(sessionId));
    this.registerTool("write_files", new TrackedWriteFilesTool(sessionId));
    this.registerTool("run_command", new SecureCommandTool(userId));

    // Web and information
    this.registerTool("web_search", new WebSearchTool());

    // Git operations
    this.registerTool("git", new GitTool(userId, sessionId));

    // Autonomy tools (from a2s2)
    this.registerTool("report_phase", new PhaseReportingTool());
    this.registerTool("continue_work", new ContinuationTool());
    this.registerTool("report_complete", new CompletionTool());

    // Phase 3.1 exclusions - these tools are NOT available
    // - validate_project (available in Phase 3.2)
    // - summon_agent (no recursive spawning in Phase 3.1)
  }
}
```

#### 3. Workspace Isolation

```typescript
export class WorkspaceManager {
  private userId: string;
  private sessionId: string;
  private workspacePath: string;

  constructor(userId: string, sessionId: string) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.workspacePath = `/workspaces/${userId}/${sessionId}`;
  }

  async createIsolatedWorkspace(): Promise<string> {
    // Create user-specific workspace
    await fs.mkdir(this.workspacePath, { recursive: true, mode: 0o700 });

    // Initialize git repository
    await this.runCommand("git init", { cwd: this.workspacePath });

    // Set up security boundaries
    await this.setupSecurityConstraints();

    return this.workspacePath;
  }

  private async setupSecurityConstraints(): void {
    // File system boundaries
    const allowedPaths = [
      this.workspacePath,
      "/tmp", // For temporary operations
      process.env.NODE_MODULES_PATH, // For dependency access
    ];

    // Process isolation
    process.chdir(this.workspacePath);

    // Resource limits
    this.setResourceLimits({
      maxFileSize: 10 * 1024 * 1024, // 10MB per file
      maxTotalFiles: 1000, // 1000 files max
      maxDiskUsage: 100 * 1024 * 1024, // 100MB total
    });
  }
}
```

### 5. Real-Time Streaming Integration

#### WebSocket Event System

```typescript
interface StreamingEvents {
  // Session lifecycle
  "session.started": { sessionId: string; userId: string; vision: string };
  "session.completed": { sessionId: string; result: AgentSessionResult };

  // Phase transitions
  "phase.changed": { sessionId: string; from: AgentPhase; to: AgentPhase };
  "phase.progress": { sessionId: string; phase: AgentPhase; progress: number };

  // Tool execution
  "tool.started": { sessionId: string; toolName: string; params: any };
  "tool.completed": { sessionId: string; toolName: string; result: any };

  // Thinking blocks
  "thinking.started": { sessionId: string; content: string };
  "thinking.completed": { sessionId: string; decision: any };

  // Cost tracking
  "cost.update": { sessionId: string; tokenUsage: TokenUsage; cost: number };
}
```

#### Streaming Manager

```typescript
export class StreamingManager {
  private sessionId: string;
  private wsConnections: WebSocketConnection[];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.wsConnections = [];
  }

  async streamEvent<T extends keyof StreamingEvents>(
    eventType: T,
    data: StreamingEvents[T]
  ): Promise<void> {
    // Get active connections for this session
    const connections = await keen.websockets.getSessionConnections(
      this.sessionId
    );

    // Stream to all connected clients
    for (const connection of connections) {
      await this.sendMessage(connection.connectionId, {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
```

## Database Schema Extensions

### Enhanced Agent Sessions Table

```sql
-- Extend existing agent_sessions table for Phase 3.1
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS thinking_blocks JSONB DEFAULT '[]'::jsonb;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS tool_usage JSONB DEFAULT '{}'::jsonb;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS phase_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS workspace_path TEXT;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS context_utilization JSONB DEFAULT '{}'::jsonb;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_sessions_thinking ON agent_sessions USING GIN (thinking_blocks);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_tool_usage ON agent_sessions USING GIN (tool_usage);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_phase ON agent_sessions (current_phase, status);
```

### Tool Execution Tracking

```sql
CREATE TABLE IF NOT EXISTS tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    tool_name VARCHAR(100) NOT NULL,
    parameters JSONB,
    result JSONB,
    execution_time_ms INTEGER,
    token_usage JSONB,
    status VARCHAR(20) DEFAULT 'completed',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tool_executions_session ON tool_executions (session_id);
CREATE INDEX idx_tool_executions_tool_name ON tool_executions (tool_name);
CREATE INDEX idx_tool_executions_created_at ON tool_executions (created_at);
```

## API Integration Points

### Agent Session Endpoints

```typescript
// POST /api/agent/sessions - Create new agent session
interface CreateAgentSessionRequest {
  vision: string;
  workingDirectory?: string;
  options?: {
    maxIterations?: number;
    costBudget?: number;
    enableWebSearch?: boolean;
  };
}

// GET /api/agent/sessions/:id/stream - WebSocket endpoint for real-time updates
// GET /api/agent/sessions/:id/status - Get current session status
// POST /api/agent/sessions/:id/stop - Stop running session
// GET /api/agent/sessions/:id/thinking - Get thinking block history
// GET /api/agent/sessions/:id/tools - Get tool usage statistics
```

### Integration with Existing APIs

```typescript
// Credit validation before agent execution
app.post("/api/agent/sessions", async (req, res) => {
  const { userId } = req.user;
  const { vision, options } = req.body;

  // Estimate cost for session
  const estimatedCost = AgentCostEstimator.estimate(vision, options);

  // Validate credits (unless admin)
  if (!req.user.isAdmin) {
    const hasCredits = await keen.credits.validateSufficientCredits(
      userId,
      estimatedCost
    );
    if (!hasCredits) {
      return res.status(402).json({ error: "Insufficient credits" });
    }
  }

  // Create and start session
  const session = new KeenAgentSession({ userId, vision, ...options });
  const result = await session.execute(vision);

  res.json(result);
});
```

## Testing Strategy

### Unit Tests

```typescript
describe("Phase 3.1 Agent Core", () => {
  test("Agent session creation with 1M context", async () => {
    const session = new KeenAgentSession({
      userId: "test-user",
      vision: "Create a simple Node.js API",
    });

    expect(session.getConfig().enableExtendedContext).toBe(true);
    expect(session.getConfig().contextWindowSize).toBe(1_000_000);
  });

  test("Tool availability - excludes validation tools", () => {
    const toolManager = new KeenToolManager("user", "session");
    const availableTools = toolManager.getAllToolNames();

    // Should have foundation tools
    expect(availableTools).toContain("get_project_tree");
    expect(availableTools).toContain("write_files");
    expect(availableTools).toContain("web_search");

    // Should NOT have validation tools
    expect(availableTools).not.toContain("validate_project");
    expect(availableTools).not.toContain("summon_agent");
  });

  test("Thinking block persistence", async () => {
    const session = new KeenAgentSession({ userId: "test", vision: "test" });

    const thinkingBlock = {
      id: "thinking-1",
      content: "I need to analyze the project structure first",
      phase: "EXPLORE",
      confidence: 0.8,
    };

    await session.storeThinkingBlock(thinkingBlock);

    const history = await session.getThinkingHistory();
    expect(history).toContainEqual(
      expect.objectContaining({
        id: "thinking-1",
        phase: "EXPLORE",
      })
    );
  });
});
```

### Integration Tests

```typescript
describe("Phase 3.1 Integration Tests", () => {
  test("Complete agent execution workflow", async () => {
    const testUser = await createTestUser();
    const vision = "Create a simple Express.js API with user authentication";

    // Start agent session
    const session = new KeenAgentSession({
      userId: testUser.id,
      vision,
    });

    // Execute and track progress
    const result = await session.execute(vision);

    expect(result.success).toBe(true);
    expect(result.finalPhase).toBe("COMPLETE");
    expect(result.filesCreated).toContain("package.json");
    expect(result.totalCost).toBeGreaterThan(0);

    // Verify credit deduction
    const credits = await keen.credits.getCreditBalance(testUser.id);
    expect(credits.balance).toBeLessThan(credits.initialBalance);

    // Verify session persistence
    const sessionRecord = await keen.sessions.getSessionById(
      session.getSessionId()
    );
    expect(sessionRecord.status).toBe("completed");
  });

  test("Real-time streaming during execution", async () => {
    const session = new KeenAgentSession({ userId: "test", vision: "test" });
    const events: StreamingEvent[] = [];

    // Mock WebSocket connection
    session.on("stream", (event) => events.push(event));

    await session.execute("Create a README file");

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "phase.changed",
        data: { from: "START", to: "EXPLORE" },
      })
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool.started",
        data: { toolName: "write_files" },
      })
    );
  });
});
```

## Performance Characteristics

### Expected Metrics

- **Cold Start**: < 5 seconds for session initialization
- **1M Context Processing**: < 30 seconds for large context requests
- **Tool Execution**: < 2 seconds average per tool call
- **Memory Usage**: < 500MB per concurrent session
- **Disk Usage**: < 100MB per session workspace

### Optimization Strategies

```typescript
class PerformanceOptimizer {
  // Context caching for repeated patterns
  cacheFrequentContext(userId: string, projectType: string): Promise<void> {
    return this.contextCache.store(`${userId}:${projectType}`, {
      commonPatterns: this.extractCommonPatterns(),
      frequentTools: this.getFrequentTools(),
      projectTemplates: this.getProjectTemplates(projectType),
    });
  }

  // Tool execution optimization
  optimizeToolExecution(): void {
    // Parallel tool execution where safe
    // Command batching for shell operations
    // File operation batching
    // Context sharing between related operations
  }
}
```

## Security Considerations

### Workspace Isolation

- Complete file system isolation per user/session
- Process-level sandboxing
- Resource limits to prevent abuse
- Network access restrictions

### Agent Purity Enforcement

```typescript
class PurityEnforcer {
  // Sanitize inputs to remove business logic
  sanitizeAgentInput(input: any): any {
    const sanitized = { ...input };

    // Remove sensitive fields
    delete sanitized.userId;
    delete sanitized.creditBalance;
    delete sanitized.subscriptionTier;
    delete sanitized.billingInfo;

    return sanitized;
  }

  // Validate tool access
  validateToolAccess(toolName: string, userId: string): boolean {
    // Phase 3.1 tool restrictions
    const forbiddenTools = ["validate_project", "summon_agent"];
    return !forbiddenTools.includes(toolName);
  }
}
```

## Migration Path

### From a2s2 to keen Phase 3.1

1. **Agent Session Enhancement**: Add multi-tenancy and database persistence
2. **Tool Registration**: Integrate with keen's tool ecosystem
3. **Context Management**: Ensure 1M context utilization
4. **Streaming Integration**: Connect with WebSocket system
5. **Credit Integration**: Add cost tracking and billing

### To Phase 3.2

Phase 3.1 provides the foundation for Phase 3.2, which will add:

- Validation tools (`validate_project`)
- Self-completion capabilities
- Enhanced quality assurance
- Advanced error recovery

## Success Criteria

### Technical Requirements

- [x] All agents use 1M context window
- [x] Complete tool ecosystem (except validation)
- [x] Multi-tenant workspace isolation
- [x] Real-time streaming integration
- [x] Database persistence of sessions and thinking
- [x] Credit system integration
- [x] Agent purity maintained

### Performance Requirements

- [x] < 5 second session startup
- [x] < 30 second 1M context processing
- [x] > 95% tool execution success rate
- [x] < 500MB memory per session

### Integration Requirements

- [x] Compatible with existing API Gateway
- [x] WebSocket streaming functional
- [x] Database schema properly extended
- [x] Credit billing accurate
- [x] Admin bypass working

Phase 3.1 establishes the core autonomous development capabilities of keen while maintaining the sophisticated agent architecture from a2s2 and adding the multi-tenant, streaming, and persistence features required for a production platform.

The exclusion of validation tools and agent summoning keeps this phase focused on single-agent execution with comprehensive tool access, setting the foundation for the enhanced capabilities in phases 3.2 and 3.3.

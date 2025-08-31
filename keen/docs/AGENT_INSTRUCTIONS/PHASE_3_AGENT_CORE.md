# Phase 3: Agent Core Implementation

## Mission

Enhance a2s2's **pure agent execution system** for keen's multi-tenant environment while maintaining complete **agent purity**. Implement recursive git-based agent spawning, workspace isolation, and 1M context utilization without exposing any business logic to agents.

## Success Criteria

- [ ] **Agent purity maintained** - agents remain completely unaware of business logic
- [ ] **Recursive agent spawning** with git-based workspace isolation
- [ ] **1M context utilization** for all agents without exception
- [ ] **Multi-tenant workspace isolation** with complete user separation
- [ ] **Enhanced AgentSession** supporting hierarchical agent management
- [ ] **Real-time streaming** integration with WebSocket coordination
- [ ] **Git operation tracking** with branch management and conflict resolution
- [ ] **Session persistence** for resumability across time
- [ ] **80%+ test coverage** including recursive spawning scenarios
- [ ] **Performance optimization** for concurrent multi-user execution

## Core Principle: Agent Purity

**SACRED RULE:** Agents must never be aware of:
- User identity or authentication details
- Credit balances or billing information
- Subscription tiers or rate limits
- Multi-tenant concerns or user isolation
- Other users' existence or data

**Agents only know:**
- Their vision/task instructions
- Their isolated workspace path
- Available tools and their capabilities
- Project context within their workspace
- Progress tracking and phase management

```typescript
// ❌ BAD: Agent sees business logic
class AgentSession {
  constructor(
    private userId: string,           // ❌ Agent shouldn't know user
    private creditBalance: number,    // ❌ Agent shouldn't see credits
    private subscriptionTier: string  // ❌ Agent shouldn't know billing
  ) {}
}

// ✅ GOOD: Agent remains pure
class AgentSession {
  constructor(
    private vision: string,           // ✅ Task instructions
    private workingDirectory: string, // ✅ Isolated workspace
    private options: AgentOptions     // ✅ Execution configuration
  ) {
    // Agent focuses purely on development tasks
  }
}
```

## Enhanced AgentSession Implementation

### Study Pattern: Understand a2s2 Foundation

**Study These Files Intensively:**
- `src/agent/AgentSession.ts` - Core agent execution with streaming and cancellation
- `src/agent/phases/ExplorePhase.ts` - Self-healing project analysis
- `src/agent/phases/PlanPhase.ts` - Sophisticated planning with risk assessment
- `src/conversation/ConversationManager.ts` - 1M context integration with streaming
- `src/conversation/StreamingManager.ts` - Real-time progress streaming

### KeenAgentSession Enhancement

```typescript
import { AgentSession as A2S2AgentSession } from '../a2s2/AgentSession';

export class KeenAgentSession extends A2S2AgentSession {
  private workspaceManager: WorkspaceManager;
  private gitManager: GitManager;
  private progressReporter: ProgressReporter;
  private sessionPersistence: SessionPersistence;
  
  // IMPORTANT: Constructor takes NO business logic parameters
  constructor(
    sessionId: string,
    options: KeenAgentSessionOptions // Only pure agent configuration
  ) {
    // Call parent with pure a2s2 options
    super({
      vision: options.vision,
      workingDirectory: options.workingDirectory,
      phase: options.phase || 'EXPLORE',
      maxIterations: options.maxIterations || 50,
      enableWebSearch: options.enableWebSearch !== false,
      enableExtendedContext: true, // CRITICAL: Always 1M context
      enableStreaming: options.enableStreaming !== false,
      showProgress: options.showProgress !== false
    });
    
    this.sessionId = sessionId;
    this.workspaceManager = new WorkspaceManager(options.workingDirectory);
    this.gitManager = new GitManager(options.workingDirectory);
    this.progressReporter = new ProgressReporter(sessionId);
    this.sessionPersistence = new SessionPersistence(sessionId);
    
    this.setupKeenEnhancements();
  }
  
  private setupKeenEnhancements(): void {
    // Enhance parent class with keen-specific features
    this.setupRecursiveSpawning();
    this.setupGitIntegration();
    this.setupProgressStreaming();
    this.setupSessionPersistence();
  }
  
  async execute(options: KeenAgentSessionOptions): Promise<KeenAgentSessionResult> {
    const startTime = Date.now();
    
    try {
      // 1. Initialize isolated workspace
      await this.workspaceManager.ensureIsolation();
      
      // 2. Initialize git repository for recursive spawning
      await this.gitManager.initializeRepository();
      
      // 3. Start progress streaming
      this.progressReporter.startStreaming();
      
      // 4. Execute core a2s2 logic (PURE)
      const coreResult = await super.execute(options);
      
      // 5. Enhance result with keen-specific metadata
      const keenResult = await this.enhanceResult(coreResult);
      
      // 6. Persist session state
      await this.sessionPersistence.persistSession(keenResult);
      
      return keenResult;
      
    } catch (error) {
      await this.handleExecutionError(error);
      throw error;
    } finally {
      this.progressReporter.stopStreaming();
    }
  }
  
  // NEW: Recursive agent spawning capability
  async spawnChildAgent(
    subVision: string,
    spawnConfig: AgentSpawnConfig
  ): Promise<KeenAgentSession> {
    // Generate child session ID
    const childSessionId = this.generateChildSessionId(spawnConfig.purpose);
    
    // Create isolated git branch
    const childBranch = await this.gitManager.createChildBranch(
      childSessionId,
      spawnConfig.purpose
    );
    
    // Prepare child workspace
    const childWorkspace = await this.workspaceManager.createChildWorkspace(
      childBranch,
      spawnConfig.inheritedContext
    );
    
    // Create child agent (PURE - no business logic)
    const childAgent = new KeenAgentSession(childSessionId, {
      vision: subVision,
      workingDirectory: childWorkspace.path,
      parentSessionId: this.sessionId,
      inheritedContext: spawnConfig.inheritedContext,
      // Copy parent's pure configuration
      maxIterations: spawnConfig.maxIterations || 30,
      enableWebSearch: spawnConfig.enableWebSearch !== false,
      enableStreaming: true,
      resourceLimits: spawnConfig.resourceLimits
    });
    
    // Track child relationship
    this.childAgents.set(childSessionId, {
      agent: childAgent,
      branch: childBranch,
      purpose: spawnConfig.purpose,
      spawnedAt: new Date()
    });
    
    // Report spawning to progress stream
    this.progressReporter.reportAgentSpawned({
      parentSession: this.sessionId,
      childSession: childSessionId,
      purpose: spawnConfig.purpose,
      branch: childBranch
    });
    
    return childAgent;
  }
  
  // NEW: Wait for child completion and merge results
  async waitForChildrenCompletion(): Promise<ChildCompletionResult[]> {
    const childPromises = Array.from(this.childAgents.entries()).map(
      async ([childSessionId, childInfo]): Promise<ChildCompletionResult> => {
        try {
          // Wait for child completion
          const result = await childInfo.agent.execute(childInfo.agent.getOptions());
          
          // Attempt to merge child's work
          const mergeResult = await this.gitManager.mergeChildBranch(
            childInfo.branch,
            result.completionReport
          );
          
          return {
            sessionId: childSessionId,
            purpose: childInfo.purpose,
            success: result.success,
            result: result,
            mergeResult: mergeResult
          };
          
        } catch (error) {
          return {
            sessionId: childSessionId,
            purpose: childInfo.purpose,
            success: false,
            error: error.message
          };
        }
      }
    );
    
    const results = await Promise.all(childPromises);
    
    // Report completion summary
    this.progressReporter.reportChildrenCompleted({
      parentSession: this.sessionId,
      childResults: results,
      successfulMerges: results.filter(r => r.mergeResult?.success).length,
      totalChildren: results.length
    });
    
    return results;
  }
}
```

### Workspace Isolation Manager

```typescript
export class WorkspaceManager {
  private workspacePath: string;
  private isolationConfig: IsolationConfig;
  
  constructor(
    workspacePath: string,
    isolationConfig?: IsolationConfig
  ) {
    this.workspacePath = workspacePath;
    this.isolationConfig = isolationConfig || this.getDefaultIsolation();
  }
  
  async ensureIsolation(): Promise<void> {
    // Verify workspace is properly isolated
    await this.validateWorkspaceIsolation();
    
    // Set up filesystem boundaries
    await this.setupFilesystemBoundaries();
    
    // Initialize workspace structure
    await this.initializeWorkspaceStructure();
  }
  
  private async validateWorkspaceIsolation(): Promise<void> {
    // Ensure workspace is within allowed boundaries
    const normalizedPath = path.resolve(this.workspacePath);
    const allowedBasePattern = /^\/workspaces\/[a-f0-9-]+\/session_[a-zA-Z0-9_-]+/;
    
    if (!allowedBasePattern.test(normalizedPath)) {
      throw new SecurityError(
        `Workspace path ${normalizedPath} violates isolation boundaries`
      );
    }
    
    // Check for path traversal attempts
    if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
      throw new SecurityError(
        `Workspace path contains illegal traversal: ${normalizedPath}`
      );
    }
  }
  
  private async setupFilesystemBoundaries(): Promise<void> {
    // Create workspace directory if it doesn't exist
    await fs.ensureDir(this.workspacePath);
    
    // Set restrictive permissions
    await fs.chmod(this.workspacePath, 0o700); // Owner only
    
    // Create .keen directory for metadata
    const keenMetaDir = path.join(this.workspacePath, '.keen');
    await fs.ensureDir(keenMetaDir);
    
    // Initialize isolation metadata
    await this.initializeIsolationMetadata(keenMetaDir);
  }
  
  async createChildWorkspace(
    childBranch: string,
    inheritedContext: any
  ): Promise<ChildWorkspace> {
    const childPath = path.join(this.workspacePath, childBranch);
    
    // Create isolated child directory
    await fs.ensureDir(childPath);
    await fs.chmod(childPath, 0o700);
    
    // Copy inherited context if any
    if (inheritedContext) {
      await this.copyInheritedContext(childPath, inheritedContext);
    }
    
    return {
      path: childPath,
      branch: childBranch,
      isolationLevel: 'child',
      parentPath: this.workspacePath
    };
  }
  
  // Secure file operations within workspace boundaries
  async secureFileOperation(
    operation: 'read' | 'write' | 'delete',
    targetPath: string,
    content?: string
  ): Promise<any> {
    // Validate path is within workspace
    const resolvedPath = path.resolve(targetPath);
    const workspaceBase = path.resolve(this.workspacePath);
    
    if (!resolvedPath.startsWith(workspaceBase)) {
      throw new SecurityError(
        `File operation outside workspace: ${resolvedPath} not in ${workspaceBase}`
      );
    }
    
    switch (operation) {
      case 'read':
        return await fs.readFile(resolvedPath, 'utf8');
      case 'write':
        await fs.ensureDir(path.dirname(resolvedPath));
        return await fs.writeFile(resolvedPath, content!);
      case 'delete':
        return await fs.remove(resolvedPath);
      default:
        throw new Error(`Unsupported file operation: ${operation}`);
    }
  }
}
```

### Git Manager for Recursive Spawning

```typescript
export class GitManager {
  private workspacePath: string;
  private git: SimpleGit;
  private branchHierarchy: Map<string, BranchInfo> = new Map();
  
  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.git = simpleGit(workspacePath);
  }
  
  async initializeRepository(): Promise<void> {
    try {
      // Check if already a git repository
      await this.git.status();
    } catch (error) {
      // Initialize new repository
      await this.git.init();
      
      // Create initial commit
      await this.createInitialCommit();
    }
    
    // Ensure we're on main branch
    await this.git.checkout(['main']);
  }
  
  async createChildBranch(
    childSessionId: string,
    purpose: string
  ): Promise<string> {
    // Generate branch name based on session hierarchy
    const branchName = this.generateBranchName(childSessionId);
    
    // Create and checkout new branch
    await this.git.checkoutLocalBranch(branchName);
    
    // Record branch information
    this.branchHierarchy.set(branchName, {
      sessionId: childSessionId,
      purpose,
      createdAt: new Date(),
      parentBranch: await this.getCurrentBranch(),
      commits: []
    });
    
    // Create initial branch commit
    await this.createBranchCommit(
      branchName,
      `[AGENT:${childSessionId}] Initialize branch for ${purpose}`
    );
    
    return branchName;
  }
  
  async commitProgress(
    sessionId: string,
    phase: string,
    message: string,
    files?: string[]
  ): Promise<string> {
    const currentBranch = await this.getCurrentBranch();
    
    // Stage files if provided, otherwise stage all changes
    if (files && files.length > 0) {
      await this.git.add(files);
    } else {
      await this.git.add('.');
    }
    
    // Create commit with agent metadata
    const commitMessage = `[AGENT:${sessionId}] [PHASE:${phase}] ${message}`;
    const commitResult = await this.git.commit(commitMessage);
    
    // Track commit in branch hierarchy
    const branchInfo = this.branchHierarchy.get(currentBranch);
    if (branchInfo) {
      branchInfo.commits.push({
        hash: commitResult.commit,
        message: commitMessage,
        timestamp: new Date(),
        phase
      });
    }
    
    return commitResult.commit;
  }
  
  async mergeChildBranch(
    childBranch: string,
    completionReport: any
  ): Promise<MergeResult> {
    try {
      // Switch to parent branch
      const branchInfo = this.branchHierarchy.get(childBranch);
      if (!branchInfo) {
        throw new Error(`Branch info not found: ${childBranch}`);
      }
      
      await this.git.checkout(branchInfo.parentBranch || 'main');
      
      // Attempt merge
      const mergeResult = await this.git.merge([childBranch, '--no-ff']);
      
      // Create merge commit with completion info
      await this.git.commit(
        `[MERGE] ${childBranch} - ${completionReport.summary}\n\n` +
        `Files created: ${completionReport.filesCreated?.length || 0}\n` +
        `Files modified: ${completionReport.filesModified?.length || 0}\n` +
        `Success: ${completionReport.success}`
      );
      
      return {
        success: true,
        mergeCommit: mergeResult.commit,
        conflictsResolved: 0,
        summary: `Successfully merged ${childBranch}`
      };
      
    } catch (error) {
      // Handle merge conflicts
      if (error.message.includes('CONFLICTS')) {
        const conflictResolution = await this.handleMergeConflicts(
          childBranch,
          error
        );
        return conflictResolution;
      }
      
      throw new GitOperationError(
        `Failed to merge ${childBranch}: ${error.message}`
      );
    }
  }
  
  private async handleMergeConflicts(
    childBranch: string,
    conflictError: any
  ): Promise<MergeResult> {
    // Get list of conflicted files
    const status = await this.git.status();
    const conflictedFiles = status.conflicted;
    
    if (conflictedFiles.length === 0) {
      throw new Error('No conflicts found but merge failed');
    }
    
    // Attempt automatic conflict resolution
    let resolvedCount = 0;
    const unresolvedFiles: string[] = [];
    
    for (const file of conflictedFiles) {
      const resolved = await this.attemptAutoResolve(file);
      if (resolved) {
        resolvedCount++;
        await this.git.add(file);
      } else {
        unresolvedFiles.push(file);
      }
    }
    
    if (unresolvedFiles.length > 0) {
      // Abort merge if we can't resolve all conflicts
      await this.git.merge(['--abort']);
      
      return {
        success: false,
        error: `Unresolved conflicts in: ${unresolvedFiles.join(', ')}`,
        conflictsResolved: resolvedCount,
        unresolvedConflicts: unresolvedFiles
      };
    }
    
    // Complete merge with resolved conflicts
    const mergeCommit = await this.git.commit(
      `[MERGE] ${childBranch} - conflicts resolved automatically (${resolvedCount} files)`
    );
    
    return {
      success: true,
      mergeCommit: mergeCommit.commit,
      conflictsResolved: resolvedCount,
      summary: `Merged ${childBranch} with ${resolvedCount} conflicts resolved`
    };
  }
}
```

### Enhanced Context Management

**Study Pattern:** `src/conversation/MessageBuilder.ts` - Context management with thinking blocks

```typescript
export class KeenContextManager {
  private contextOptimizer: ContextOptimizer;
  private thinkingBlockManager: ThinkingBlockManager;
  
  constructor() {
    // CRITICAL: Always enforce 1M context
    this.contextOptimizer = new ContextOptimizer({
      maxContextSize: 1000000,  // 1M tokens - NON-NEGOTIABLE
      enableExtendedContext: true,
      intelligentPruning: true,
      preserveThinking: true
    });
    
    this.thinkingBlockManager = new ThinkingBlockManager();
  }
  
  async prepareAgentContext(
    vision: string,
    workspaceAnalysis: any,
    inheritedContext?: any
  ): Promise<ConversationMessage[]> {
    // Build comprehensive context for agent
    const contextBuilder = new ContextBuilder();
    
    // 1. System prompt with agent instructions
    contextBuilder.addSystemPrompt(
      this.buildKeenSystemPrompt(vision, workspaceAnalysis)
    );
    
    // 2. Inherited context from parent agent (if any)
    if (inheritedContext) {
      contextBuilder.addInheritedContext(
        this.sanitizeInheritedContext(inheritedContext)
      );
    }
    
    // 3. Workspace analysis and project context
    contextBuilder.addProjectContext(workspaceAnalysis);
    
    // 4. Available tools and capabilities
    contextBuilder.addToolContext(this.getAvailableTools());
    
    // Build final context
    const context = contextBuilder.build();
    
    // Optimize for 1M context window
    const optimizedContext = await this.contextOptimizer.optimize(context);
    
    // Validate context size
    this.validateContextSize(optimizedContext);
    
    return optimizedContext;
  }
  
  private buildKeenSystemPrompt(
    vision: string,
    workspaceAnalysis: any
  ): string {
    return `You are an autonomous software development agent within keen's platform.

TASK: ${vision}
WORKSPACE: ${workspaceAnalysis.workingDirectory}
CURRENT PHASE: EXPLORE

AUTONOMOUS OPERATION PROTOCOL:
1. You drive this conversation completely - no external prompts
2. Continue working until the task is fully completed
3. Use tools to understand your environment and implement solutions
4. Signal completion using the report_complete tool
5. You can spawn sub-agents using the summon capability for parallel work

RECURSIVE AGENT CAPABILITY:
- You can spawn child agents during the SUMMON phase
- Each child agent gets its own git branch and workspace
- Child agents work in parallel on focused sub-tasks
- You coordinate child completion and merge their work
- Recursive spawning enables unlimited decomposition

THREE-PHASE LIFECYCLE:
- EXPLORE: Understand project state and requirements
  • Use get_project_tree to analyze structure
  • Use read_files to examine key files  
  • Plan your approach and identify sub-tasks

- SUMMON: Create specialist agents for complex tasks
  • Identify tasks suitable for parallel execution
  • Spawn child agents with focused sub-visions
  • Monitor child progress and coordinate completion

- COMPLETE: Implement, test, and finalize the solution
  • Use write_files to implement changes
  • Use run_command to test your work
  • Validate requirements are met
  • Call report_complete when finished

1M CONTEXT WINDOW:
You have access to the full 1,000,000 token context window. Use this for:
- Comprehensive project analysis
- Complex reasoning and planning
- Maintaining context across recursive spawning
- Deep understanding of large codebases

AVAILABLE TOOLS:
${this.formatToolDescriptions()}

BEGIN AUTONOMOUS EXECUTION:
Start by exploring the project structure and understanding your task.`;
  }
  
  private validateContextSize(context: ConversationMessage[]): void {
    const tokenCount = this.estimateTokenCount(context);
    
    if (tokenCount > 950000) { // Leave 50k buffer
      Logger.warn('Context approaching 1M limit', {
        tokenCount,
        contextMessages: context.length
      });
    }
    
    if (tokenCount > 1000000) {
      throw new Error(
        `Context exceeds 1M token limit: ${tokenCount} tokens. ` +
        'This violates keen\'s architecture requirements.'
      );
    }
  }
}
```

## Testing Requirements

### Recursive Spawning Tests

```typescript
describe('Recursive Agent Spawning', () => {
  let parentAgent: KeenAgentSession;
  let workspace: string;
  
  beforeEach(async () => {
    workspace = await createIsolatedTestWorkspace();
    parentAgent = new KeenAgentSession('test_main_session', {
      vision: 'Create a complex application with authentication and database',
      workingDirectory: workspace
    });
  });
  
  test('spawns child agents with isolated git branches', async () => {
    // Parent agent spawns child for authentication
    const authAgent = await parentAgent.spawnChildAgent(
      'Implement JWT authentication system',
      {
        purpose: 'authentication',
        maxIterations: 20,
        resourceLimits: { maxCost: 5.0 }
      }
    );
    
    // Verify child has isolated branch
    const gitManager = new GitManager(workspace);
    const branches = await gitManager.listBranches();
    
    expect(branches).toContain('summon-A'); // First child branch
    expect(authAgent.getWorkingDirectory()).toMatch(/summon-A/);
    
    // Child should be able to spawn its own children
    const jwtAgent = await authAgent.spawnChildAgent(
      'Implement JWT token generation',
      { purpose: 'jwt-tokens' }
    );
    
    const childBranches = await gitManager.listBranches();
    expect(childBranches).toContain('summon-A-A'); // Grandchild branch
  });
  
  test('maintains agent purity in recursive spawning', async () => {
    const mockSpawnFunction = jest.spyOn(parentAgent, 'spawnChildAgent');
    
    await parentAgent.spawnChildAgent(
      'Handle database operations',
      { purpose: 'database' }
    );
    
    const spawnCall = mockSpawnFunction.mock.calls[0];
    const [subVision, spawnConfig] = spawnCall;
    
    // Verify child receives only pure configuration
    expect(spawnConfig).not.toHaveProperty('userId');
    expect(spawnConfig).not.toHaveProperty('creditBalance');
    expect(spawnConfig).not.toHaveProperty('subscriptionTier');
    expect(spawnConfig).toHaveProperty('purpose');
    expect(spawnConfig).toHaveProperty('resourceLimits');
  });
  
  test('merges child work with conflict resolution', async () => {
    // Create two children that might have conflicts
    const child1 = await parentAgent.spawnChildAgent(
      'Create user authentication',
      { purpose: 'auth' }
    );
    
    const child2 = await parentAgent.spawnChildAgent(
      'Create user management',  
      { purpose: 'users' }
    );
    
    // Simulate both children modifying same file
    await child1.executeCommand('write_files', {
      files: [{
        path: 'src/types/User.ts',
        content: 'export interface User { id: string; email: string; }'
      }]
    });
    
    await child2.executeCommand('write_files', {
      files: [{
        path: 'src/types/User.ts', 
        content: 'export interface User { id: string; name: string; }'
      }]
    });
    
    // Wait for both to complete
    const results = await parentAgent.waitForChildrenCompletion();
    
    // Should handle conflict resolution
    expect(results).toHaveLength(2);
    const mergeResults = results.map(r => r.mergeResult);
    
    // At least one should have conflict resolution
    const hasConflictResolution = mergeResults.some(
      r => r?.conflictsResolved > 0
    );
    expect(hasConflictResolution).toBe(true);
  });
});
```

### Multi-tenant Isolation Tests

```typescript
describe('Multi-tenant Isolation', () => {
  test('prevents cross-user workspace access', async () => {
    const user1Workspace = await createUserWorkspace('user1', 'session1');
    const user2Workspace = await createUserWorkspace('user2', 'session2');
    
    const agent1 = new KeenAgentSession('session1', {
      vision: 'Test isolation',
      workingDirectory: user1Workspace
    });
    
    // Try to access user2's workspace (should fail)
    await expect(
      agent1.executeCommand('read_files', {
        paths: [user2Workspace + '/secret.txt']
      })
    ).rejects.toThrow(/outside workspace/);
  });
  
  test('enforces git repository isolation', async () => {
    const user1Session = new KeenAgentSession('user1_session', {
      vision: 'Create app',
      workingDirectory: '/workspaces/user1/session1'
    });
    
    const user2Session = new KeenAgentSession('user2_session', {
      vision: 'Create app', 
      workingDirectory: '/workspaces/user2/session2'
    });
    
    // Both agents create git repositories
    await user1Session.execute();
    await user2Session.execute();
    
    // Repositories should be completely separate
    const user1Git = new GitManager('/workspaces/user1/session1');
    const user2Git = new GitManager('/workspaces/user2/session2');
    
    const user1History = await user1Git.getCommitHistory();
    const user2History = await user2Git.getCommitHistory();
    
    // No shared commit history
    expect(user1History).not.toEqual(user2History);
  });
});
```

### 1M Context Tests

```typescript
describe('1M Context Utilization', () => {
  test('all agents use full 1M context window', async () => {
    const agent = new KeenAgentSession('test_session', {
      vision: 'Large codebase analysis',
      workingDirectory: './test-workspace'
    });
    
    const contextManager = agent.getContextManager();
    const config = contextManager.getConfig();
    
    expect(config.contextWindowSize).toBe(1000000);
    expect(config.enableExtendedContext).toBe(true);
  });
  
  test('child agents inherit 1M context', async () => {
    const parent = new KeenAgentSession('parent', {
      vision: 'Complex multi-component system',
      workingDirectory: './test-workspace'
    });
    
    const child = await parent.spawnChildAgent(
      'Handle specific component',
      { purpose: 'component' }
    );
    
    const childContextConfig = child.getContextManager().getConfig();
    expect(childContextConfig.contextWindowSize).toBe(1000000);
  });
  
  test('handles large project context efficiently', async () => {
    // Create large project with many files
    const largeProject = await createLargeTestProject({
      files: 500,
      avgFileSize: 2000 // 1M total characters
    });
    
    const agent = new KeenAgentSession('large_project', {
      vision: 'Analyze and refactor large codebase',
      workingDirectory: largeProject.path
    });
    
    const startTime = Date.now();
    const result = await agent.execute();
    const duration = Date.now() - startTime;
    
    // Should complete within reasonable time
    expect(duration).toBeLessThan(300000); // 5 minutes
    expect(result.success).toBe(true);
  });
});
```

## Integration Points

**This Agent Core must integrate with:**
- **Phase 1 (Database)**: Session persistence and progress tracking
- **Phase 2 (API Gateway)**: Receive sanitized requests, maintain agent purity
- **Phase 4 (WebSockets)**: Stream progress updates in real-time
- **Phase 5 (Dashboard)**: Provide agent tree visualization data

## Deliverables

1. **Enhanced AgentSession** with recursive spawning and multi-tenant support
2. **Workspace isolation** system with security boundaries
3. **Git manager** for branch-based recursive agent coordination
4. **Context manager** ensuring 1M context utilization
5. **Progress streaming** integration with real-time updates
6. **Session persistence** for resumable agent execution
7. **Comprehensive test suite** with isolation and spawning scenarios
8. **Performance optimization** for concurrent multi-user execution
9. **Documentation** with examples and integration guides
10. **Security validation** ensuring complete user isolation

**Remember:** The Agent Core is the heart of keen's innovation. It must preserve a2s2's autonomous capabilities while adding multi-tenant support and recursive spawning, all while maintaining complete agent purity. Agents must never know they're part of a commercial platform - they focus purely on software development.
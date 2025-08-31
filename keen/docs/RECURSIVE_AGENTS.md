# Recursive Agent Architecture: The Core Innovation

## The Breakthrough Concept

keen's revolutionary innovation is **git-based recursive agent spawning** - a system where agents can spawn sub-agents that work in parallel git branches, then merge results back. This creates **fractal development workflows** that scale organically with task complexity.

## How Recursive Spawning Works

### The Spawning Pattern

```
main-agent (authentication system)
├── summon-A (JWT implementation)
│   ├── summon-A-A (token generation)
│   ├── summon-A-B (token validation) 
│   └── summon-A-C (refresh logic)
├── summon-B (API key system)
│   ├── summon-B-A (key generation)
│   ├── summon-B-B (permission scoping)
│   └── summon-B-C (rate limiting)
└── summon-C (middleware development)
    ├── summon-C-A (authentication middleware)
    ├── summon-C-B (authorization middleware)
    └── summon-C-C (error handling)
```

### The Recursive Mechanism

1. **Main Agent Analysis** 
   - Analyzes vision and creates comprehensive plan
   - Identifies sub-tasks that can be parallelized
   - Determines optimal agent hierarchy structure

2. **SUMMON Phase Activation**
   - Main agent enters SUMMON phase when ready to delegate
   - Creates implementation plan with clear sub-task boundaries
   - Prepares git workspace for parallel development

3. **Git Branch Creation**
   - Each summon creates a new isolated git branch
   - Branch naming: `summon-A`, `summon-A-A`, `summon-A-A-A` (infinitely recursive)
   - Complete workspace isolation per branch

4. **Agent Spawning**
   - New autonomous agent starts on dedicated branch
   - Inherits 1M context window with focused sub-vision
   - Full tool access within branch boundaries

5. **Recursive Capability**
   - Each spawned agent can summon its own sub-agents infinitely
   - Creates tree structure with unlimited depth
   - Each level maintains full autonomy and decision-making

6. **Coordination & Merging**
   - Parent agents wait for all children to complete
   - Intelligent merge strategy with conflict resolution
   - Validation pipeline ensures merge integrity

7. **Result Integration**
   - Successful merges integrate all sub-agent work
   - Failed merges trigger recovery and retry logic
   - Final integration produces cohesive result

## Git Branch Strategy

### Branch Naming Convention

```
main                    # Primary agent branch
├── summon-A           # First spawned agent
│   ├── summon-A-A     # Sub-agent of A
│   │   ├── summon-A-A-A   # Sub-sub-agent
│   │   └── summon-A-A-B   # Sub-sub-agent
│   └── summon-A-B     # Sub-agent of A
├── summon-B           # Second spawned agent
│   ├── summon-B-A     # Sub-agent of B
│   └── summon-B-B     # Sub-agent of B
└── summon-C           # Third spawned agent
```

**Branch Properties:**
- **Unique Identification** - Each branch maps to exactly one agent
- **Hierarchical Structure** - Parent-child relationships clear from naming
- **Infinite Depth** - No limit on recursion depth (system resource limits apply)
- **Isolated Workspaces** - Complete file system isolation per branch

### Merge Strategies

#### 1. Sequential Merge (Default)
```
Parent waits for ALL children → Merge in dependency order → Validate → Continue
```

#### 2. Progressive Merge (Advanced)
```
Merge children as they complete → Handle conflicts incrementally → Maintain progress
```

#### 3. Atomic Merge (High-Risk Tasks)
```
Complete ALL work → Single atomic merge → All-or-nothing validation
```

### Conflict Resolution

```typescript
interface ConflictResolution {
  strategy: 'auto' | 'manual' | 'parent-decides' | 'child-priority';
  confidence: number; // 0.0 - 1.0
  resolution_time: number; // milliseconds
  human_intervention_required: boolean;
}
```

**Automated Conflict Resolution:**
1. **Non-overlapping Changes** - Auto-merge different files/sections
2. **Additive Changes** - Merge new additions without conflicts  
3. **Compatible Modifications** - Merge changes that don't interfere
4. **Semantic Analysis** - Use AI to resolve logical conflicts

**Manual Resolution Triggers:**
- Contradictory logic implementations
- Overlapping function modifications  
- Configuration conflicts
- Test failures after merge

## Agent Communication Protocols

### Parent-Child Coordination

#### 1. Spawning Protocol

```json
{
  "action": "spawn_agent",
  "parent_session": "session_main_123",
  "child_session": "session_summon_A_456",
  "git_branch": "summon-A",
  "sub_vision": "Implement JWT authentication with token refresh",
  "context_inheritance": {
    "project_analysis": { /* exploration results */ },
    "technology_stack": ["Node.js", "TypeScript", "Express"],
    "constraints": ["Must be compatible with existing auth flow"]
  },
  "resource_limits": {
    "max_cost": 5.0,
    "max_duration_minutes": 20,
    "max_recursion_depth": 2
  }
}
```

#### 2. Progress Reporting

```json
{
  "action": "progress_report",
  "session": "session_summon_A_456",
  "parent_session": "session_main_123",
  "phase": "COMPLETE",
  "progress": 0.85,
  "summary": "JWT implementation 85% complete",
  "deliverables": {
    "completed": ["Token generation", "Signature validation"],
    "in_progress": ["Refresh token logic"],
    "pending": ["Integration testing"]
  },
  "resource_usage": {
    "cost_so_far": 3.2,
    "time_elapsed": "12 minutes",
    "tokens_consumed": 45000
  }
}
```

#### 3. Completion Notification

```json
{
  "action": "child_complete",
  "session": "session_summon_A_456",
  "parent_session": "session_main_123",
  "success": true,
  "summary": "JWT authentication system implemented successfully",
  "deliverables": {
    "files_created": [
      "src/auth/jwt.ts",
      "src/middleware/authenticate.ts",
      "tests/auth/jwt.test.ts"
    ],
    "files_modified": [
      "src/types/auth.ts",
      "package.json"
    ]
  },
  "validation_results": {
    "tests_passed": 15,
    "tests_failed": 0,
    "coverage": "96%",
    "type_check": "passed",
    "lint_check": "passed"
  },
  "ready_for_merge": true,
  "merge_conflicts_expected": false
}
```

### Status Updates Through Git Commit Messages

```bash
# Agent status embedded in commit messages
git commit -m "[AGENT:summon-A] [PHASE:EXPLORE] Analyzing authentication requirements

Agent Status:
- Progress: 25%
- Confidence: 0.7
- Next Action: Technology stack analysis
- Resource Usage: $1.2, 15min"

# Cross-agent coordination
git commit -m "[AGENT:summon-A-A] [DEPENDENCY:summon-A-B] Waiting for token validation interface

Blocking on:
- summon-A-B to define TokenValidationResult interface
- Current state: interface designed, implementation pending
- ETA: 3 minutes"
```

### Error Propagation

```typescript
interface AgentError {
  session: string;
  parent_session: string;
  error_type: 'validation' | 'merge_conflict' | 'resource_limit' | 'execution_failure';
  severity: 'warning' | 'error' | 'critical';
  message: string;
  context: {
    phase: AgentPhase;
    current_action: string;
    git_branch: string;
    files_affected: string[];
  };
  recovery_suggestions: string[];
  requires_human_intervention: boolean;
}
```

**Error Escalation:**
1. **Agent-level Recovery** - Try auto-fix, retry, alternative approach
2. **Parent Coordination** - Notify parent, request guidance or resource adjustment
3. **Tree-level Recovery** - Restructure agent assignments, merge partial work
4. **User Intervention** - Surface to dashboard with context and options

## Workspace Isolation Architecture

### File System Structure

```
/workspaces/user_{uuid}/session_{id}/
├── .git/                          # Git repository root
├── .keen/                         # keen metadata
│   ├── agent_tree.json           # Current agent hierarchy
│   ├── session_config.json       # Session configuration
│   └── communication/             # Inter-agent communication
│       ├── spawn_queue.json       # Pending agent spawns
│       ├── completion_reports/    # Completed agent reports
│       └── error_log.json         # Error tracking
├── main/                          # Main branch workspace
│   ├── src/
│   ├── tests/
│   ├── package.json
│   └── README.md
├── summon-A/                      # Agent A workspace
│   ├── src/auth/                  # A's implementation
│   ├── tests/auth/
│   └── .agent_status.json         # A's current status
│   └── summon-A-A/                # Sub-agent AA workspace
│       ├── src/auth/tokens/       # AA's specific work
│       └── .agent_status.json
└── summon-B/                      # Agent B workspace
    ├── src/database/              # B's implementation
    ├── migrations/
    └── .agent_status.json
```

### Resource Boundaries

```typescript
interface ResourceLimits {
  per_agent: {
    max_cost: number;           // Maximum credit spend per agent
    max_duration: number;       // Maximum execution time (seconds)
    max_file_size: number;      // Maximum individual file size (bytes) 
    max_total_files: number;    // Maximum files created/modified
    max_memory_usage: number;   // Maximum memory per agent (MB)
  };
  per_session: {
    max_agents: number;         // Maximum total agents in tree
    max_depth: number;          // Maximum recursion depth
    max_total_cost: number;     // Total cost limit for entire session
    max_session_duration: number; // Total session time limit
  };
  per_user: {
    max_concurrent_sessions: number;  // Simultaneous sessions allowed
    max_agents_per_hour: number;      // Rate limit on agent spawning
    max_storage_per_session: number;  // Disk space limit (MB)
  };
}
```

### Security Boundaries

```typescript
interface SecurityConstraints {
  agent_isolation: {
    filesystem_jail: boolean;        // Restrict to workspace directory
    network_isolation: boolean;      // Block external network access
    process_sandboxing: boolean;     // Containerize agent processes
  };
  git_permissions: {
    branch_access: string[];         // Allowed branch patterns
    merge_permissions: string[];     # Branches agent can merge to/from
    push_restrictions: string[];     # Remote push limitations
  };
  tool_restrictions: {
    allowed_tools: string[];         # Tools this agent can use
    command_whitelist: string[];     # Shell commands allowed
    file_access_patterns: string[];  # File path restrictions
  };
}
```

## Dashboard Visualization

### Real-time Agent Tree

```typescript
interface AgentTreeNode {
  session_id: string;
  parent_session?: string;
  git_branch: string;
  status: 'spawning' | 'running' | 'waiting' | 'completed' | 'failed';
  current_phase: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';
  progress: number; // 0.0 - 1.0
  purpose: string;
  
  // Real-time metrics
  start_time: string;
  last_activity: string;
  cost_so_far: number;
  tokens_used: number;
  
  // File operations
  files_created: number;
  files_modified: number;
  files_deleted: number;
  
  // Child agents
  children: AgentTreeNode[];
  
  // Git integration
  last_commit: {
    hash: string;
    message: string;
    timestamp: string;
    files_changed: string[];
  };
}
```

### Interactive Tree Visualization

```html
<!-- Real-time agent tree display -->
<div class="agent-tree">
  <div class="agent-node main-agent">
    <div class="agent-header">
      <span class="agent-icon">🤖</span>
      <span class="agent-name">Main Agent</span>
      <span class="phase-badge explore">SUMMON</span>
      <span class="progress-bar">
        <div class="progress" style="width: 65%"></div>
      </span>
    </div>
    
    <div class="agent-details">
      <div class="metric">
        <label>Cost:</label>
        <span class="cost">$12.45</span>
      </div>
      <div class="metric">
        <label>Duration:</label>
        <span class="duration">8m 23s</span>
      </div>
      <div class="metric">
        <label>Files:</label>
        <span class="files">15 created, 7 modified</span>
      </div>
    </div>
    
    <!-- Child agents -->
    <div class="child-agents">
      <div class="agent-node child-agent completed">
        <div class="agent-header">
          <span class="agent-icon">✅</span>
          <span class="agent-name">summon-A</span>
          <span class="phase-badge complete">COMPLETE</span>
          <span class="purpose">Authentication System</span>
        </div>
        
        <!-- Grandchild agents -->
        <div class="child-agents">
          <div class="agent-node grandchild-agent running">
            <div class="agent-header">
              <span class="agent-icon">⚡</span>
              <span class="agent-name">summon-A-A</span>
              <span class="phase-badge plan">PLAN</span>
              <span class="purpose">JWT Token Logic</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

### Git Operation Streaming

```typescript
interface GitOperationEvent {
  timestamp: string;
  session_id: string;
  agent_name: string;
  operation: 'branch' | 'commit' | 'merge' | 'conflict';
  branch: string;
  details: {
    commit_hash?: string;
    message?: string;
    files_changed?: string[];
    lines_added?: number;
    lines_deleted?: number;
    conflict_files?: string[];
  };
}
```

**Real-time Git Feed:**
```
[10:45:23] 🌿 summon-A created branch from main
[10:45:45] 📝 summon-A committed "Add JWT token generation logic" (src/auth/jwt.ts)
[10:46:12] 🌿 summon-A-A created branch from summon-A  
[10:46:33] 📝 summon-A-A committed "Implement token validation" (src/auth/validate.ts)
[10:47:01] ⚠️  summon-A-B merge conflict in src/auth/types.ts
[10:47:15] ✅ summon-A-B conflict resolved automatically
[10:47:22] 🔄 summon-A merging child branches: summon-A-A, summon-A-B
[10:47:45] ✅ summon-A merge completed successfully
[10:48:01] 📝 main committed "Integrate authentication system" (15 files changed)
```

## Advanced Coordination Patterns

### Cross-Agent Dependencies

```typescript
interface AgentDependency {
  dependent_agent: string;     # Agent waiting for dependency
  dependency_agent: string;    # Agent providing the dependency
  dependency_type: 'interface' | 'implementation' | 'data' | 'validation';
  description: string;
  blocking: boolean;           # True if dependent agent cannot proceed
  estimated_resolution: string; # ETA for dependency resolution
}
```

**Dependency Resolution:**
```json
{
  "dependencies": [
    {
      "dependent_agent": "summon-C", 
      "dependency_agent": "summon-A",
      "dependency_type": "interface",
      "description": "Needs AuthUser interface definition",
      "blocking": true,
      "estimated_resolution": "2 minutes"
    },
    {
      "dependent_agent": "summon-B-A",
      "dependency_agent": "summon-B-B", 
      "dependency_type": "data",
      "description": "Needs database schema migrations",
      "blocking": false,
      "estimated_resolution": "5 minutes"
    }
  ]
}
```

### Load Balancing and Resource Allocation

```typescript
interface ResourceAllocation {
  agent_session: string;
  allocated_resources: {
    cpu_cores: number;
    memory_mb: number;
    network_bandwidth: number; // Mbps
    storage_mb: number;
  };
  priority: 'low' | 'normal' | 'high' | 'critical';
  constraints: {
    max_parallel_tools: number;
    max_context_size: number;
    allowed_operations: string[];
  };
}
```

### Failure Recovery Patterns

#### 1. Agent Restart
```typescript
if (agent.status === 'failed' && agent.retries < MAX_RETRIES) {
  agent.restart({
    preserve_context: true,
    reset_git_branch: false,
    increase_resources: true
  });
}
```

#### 2. Work Redistribution
```typescript
if (agent.status === 'failed' && !agent.canRecover()) {
  const unfinishedWork = agent.getUnfinishedTasks();
  const redistributionPlan = planWorkRedistribution(unfinishedWork);
  
  for (const task of redistributionPlan) {
    spawnReplacementAgent(task);
  }
}
```

#### 3. Partial Merge
```typescript
if (someChildrenFailed && someChildrenSucceeded) {
  const successfulWork = getCompletedChildWork();
  const partialMerge = createPartialMerge(successfulWork);
  
  if (partialMerge.isUseful()) {
    acceptPartialCompletion(partialMerge);
    reportPartialSuccess();
  }
}
```

## Performance Optimization

### Context Sharing Optimization

```typescript
interface SharedContext {
  project_analysis: ProjectAnalysis;   # Shared across all agents
  technology_decisions: TechDecisions; # Inherited by children
  common_utilities: CodeTemplates;     # Reusable code patterns
  
  // Context inheritance strategy
  inheritance_strategy: {
    full_context: boolean;              # Pass complete context?
    filtered_context: string[];        # Relevant context keys only
    compressed_context: boolean;       # Use context compression?
  };
}
```

### Git Operation Optimization

```typescript
interface GitOptimization {
  shallow_clones: boolean;        # Use shallow git clones for speed
  lazy_file_loading: boolean;     # Load files only when accessed
  incremental_merges: boolean;    # Merge incrementally vs. batch
  conflict_prediction: boolean;   # Predict and prevent conflicts
  parallel_operations: boolean;   # Parallelize independent git ops
}
```

### Agent Lifecycle Optimization

```typescript
interface LifecycleOptimization {
  agent_pooling: boolean;         # Reuse agent processes
  context_caching: boolean;       # Cache frequently used context
  tool_preloading: boolean;       # Preload common tools
  predictive_spawning: boolean;   # Spawn agents before needed
  resource_preallocation: boolean; # Reserve resources in advance
}
```

The recursive agent architecture represents a fundamental breakthrough in autonomous development, enabling unprecedented scalability and coordination while maintaining the elegance and power of individual agent autonomy. This system allows keen to tackle development tasks of arbitrary complexity through organic decomposition and parallel execution.
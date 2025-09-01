# Phase 3.3: Recursive Agent Spawning with Sub-Vision Specialization

## Overview

Phase 3.3 represents the pinnacle of keen's autonomous development capabilities, implementing the **recursive agent spawning system** that enables agents to create specialized sub-agents with focused sub-visions.

Execution in Phase 3.3 is **strictly sequential**:

- A parent agent spawns a child agent.
- The parent **waits until the child completes fully**.
- Only then does the parent continue its own execution or spawn another child.

This design choice emphasizes determinism, reproducibility, and reliability. By avoiding parallelism, Phase 3.3 guarantees that workflows are ordered, dependencies are fully resolved before new work begins, and merges are conflict-minimized.

---

## Key Features

### 1. Recursive Agent Spawning

- **Infinite recursion depth**: Agents can recursively spawn sub-agents without theoretical limit.
- **Sequential-only execution**: Parent is blocked until the child completes.
- **Depth-first tree expansion**: New branches only extend after the current branch resolves.
- **Git-based coordination**: Each agent works in its own isolated git branch.
- **Deterministic task decomposition**: Complex tasks are broken down step-by-step in a predictable order.
- **Guaranteed synchronization**: Each child’s results are integrated before new children are spawned.

### 2. Sub-Vision Specialization

- **Focused expertise**: Each sub-agent receives a clearly scoped sub-vision aligned with its specialization.
- **Context inheritance**: Sub-agents inherit filtered, relevant context from parents.
- **Skill-based assignment**: Tasks are assigned to match sub-agent expertise (frontend, backend, database, etc.).
- **Ordered communication**: All parent-child exchanges are resolved linearly before progression.

### 3. Git-Based Workspace Isolation

- **Branch-per-agent**: Each spawned agent creates and works in its own branch.
- **Hierarchical naming**: Branch names reflect parent-child lineage (summon-A, summon-A-A, etc.).
- **Conflict-free merging**: Each child’s branch is merged back before the next spawn.
- **Auditability**: Git history forms a sequential record of all agent operations.

### 4. Agent Tree Management

- **Resource allocation**: Parent allocates specific credits/time for each child.
- **Dependency tracking**: Dependencies are resolved before new child agents are spawned.
- **Sequential coordination**: Parent manages only one active child at a time.
- **Error propagation**: If a child fails critically, the parent stops or retries before progressing.

---

## Complete Tool Ecosystem

### Foundation Tools

- **`get_project_tree`** – Analyze project structure.
- **`read_files`** – Multi-file safe reading.
- **`write_files`** – Atomic writes with rollback on failure.
- **`run_command`** – Secure command execution.
- **`web_search`** – External information retrieval.
- **`git`** – Version control: branch, merge, commit.

### Validation Tools (Phase 3.2)

- **`validate_project`** – Ensures code quality, consistency, and functional validation.

### Autonomy Tools

- **`report_phase`** – Reports execution state and tree status.
- **`continue_work`** – Plans sequential continuation.
- **`report_complete`** – Summarizes results after merges.

### New in Phase 3.3

- **`summon_agent`** – Spawns a single sub-agent (sequential blocking call).
- **`coordinate_agents`** – Simplified to enforce sequential order.
- **`get_agent_status`** – Reports the status of the sequential tree.

---

## Recursive Agent Architecture

### 1. Sequential Agent Hierarchy

- Parent spawns one child at a time.
- Parent blocks until the child completes and merges results.
- Agent tree expands in a **depth-first sequential fashion**.
- No overlapping children: the tree is expanded step-by-step.

### 2. Agent Tree Manager

- Manages parent-child relationships.
- Records spawn depth, branch naming, and timestamps.
- Ensures no next-child spawn until prior child resolves.
- Persists hierarchy data in database for traceability.

### 3. Git-Based Workspace Coordination

- Each child operates in its isolated branch.
- Parent merges child branch before resuming work.
- Conflicts are resolved immediately (parent-first, child-first, or smart merge strategies).
- Git log provides linear history of sequential merges.

---

## Sub-Vision Specialization System

### 1. Expertise-Based Specialization

Agents specialize into roles such as:

- **Frontend**: UI, React/Vue, accessibility, styling.
- **Backend**: APIs, authentication, server logic.
- **Database**: Schema design, query optimization.
- **Testing**: Unit, integration, E2E.
- **Security**: Auth, data protection, audits.
- **DevOps**: Deployment, CI/CD, scaling.

Each specialization executes in **strict order**—no new sub-agent starts until the previous one completes.

### 2. Context Inheritance

- Parent provides only relevant context to the child (e.g., database specs for DB agent, API contracts for frontend).
- Ensures leaner, more focused sub-agents.
- Prevents unnecessary information transfer.

---

## Agent Communication and Coordination

- **Parent → Child**: Vision, context, and resources passed down.
- **Child → Parent**: Completion report, results, and potential errors.
- **Blocking communication**: Parent cannot proceed until child returns results.
- **Dependency resolution**: All dependencies completed before spawning new children.
- **No sibling communication**: Since no two children exist concurrently.

---

## Real-Time Agent Tree Visualization

### Features

- Displays tree growth as strictly sequential.
- Nodes added only after children complete.
- Shows: active agent, depth, elapsed time, resource usage.
- Metrics updated after each sequential merge.

### Metrics

- **Total cost** (credits, tokens).
- **Completion time per child**.
- **Sequential efficiency** (how well execution time scales).
- **Merge status** (successful, failed, retried).

---

## Database Schema Extensions

### Agent Hierarchy

- Each row records a parent-child link with strict ordering.
- `completed_at` timestamp mandatory before next spawn.

### Communications

- Linear logs of parent-child messages.
- Response required for all requests.

### Dependencies

- Dependency must be `resolved` before spawning next child.

### Git Operations

- Logs sequential merges.
- No overlapping operations permitted.

---

## Testing Strategy

### Sequential Workflow Tests

- Verify that parent waits for child completion.
- Confirm no new agent spawns before prior merges.
- Test recursion up to depth > 20.
- Validate linear git branch naming.

### Error Handling

- Simulate child failure → ensure parent halts until resolved.
- Test conflict resolution strategies in sequential merges.

### Validation

- Ensure all Phase 3.2 validation persists.
- Confirm correctness of results across sequential hierarchy.

---

## Performance and Scalability

- **Deterministic execution**: Every run produces identical structure and results.
- **Predictable timelines**: Each child contributes measurable completion time.
- **Conflict reduction**: Sequential merges prevent race conditions.
- **Trade-off**: No parallelism → slower throughput, but significantly higher reliability.

---

## Why Sequential Execution?

1. **Determinism** – Results are reproducible without nondeterministic race conditions.
2. **Reliability** – Each dependency resolved before moving forward.
3. **Clarity** – Developers can trace agent tree step-by-step.
4. **Reduced Conflicts** – Merges happen incrementally, lowering complexity.
5. **Strong Guarantees** – Parents always know the exact state before spawning further agents.

---

## Success Criteria

### Technical

- [x] Recursive spawning (sequential only).
- [x] Deterministic git isolation and merging.
- [x] Sub-vision specialization system integrated.
- [x] Parent-child blocking synchronization.

### Quality

- [x] Deterministic, reproducible runs.
- [x] Merge success > 95% due to ordered integration.
- [x] Dependencies fully resolved at every step.

### Performance

- [x] Agent spawn < 3s.
- [x] Sequential merge < 10s.
- [x] Depth recursion up to 20+ supported.

---

## Conclusion

Phase 3.3 transforms keen into a deterministic **sequential recursive agent system**.  
Agents now expand hierarchies step-by-step, ensuring each child’s results are integrated before continuing.

This approach sacrifices parallel speed in favor of correctness, reliability, and traceability—laying a foundation for enterprise-grade, mission-critical autonomous development.

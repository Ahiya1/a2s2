# Phase 3: Agent Core Implementation (Enhanced, Comprehensive)

## Mission

Enhance a2s2's **pure agent execution system** for keen's multi-tenant environment while maintaining complete **agent purity**. Implement recursive git-based agent spawning, workspace isolation, and 1M context utilization without exposing any business logic to agents.

## Success Criteria

- [ ] **Agent purity maintained** – agents remain completely unaware of business logic
- [ ] **Recursive agent spawning** with git-based workspace isolation
- [ ] **1M context utilization** for all agents without exception
- [ ] **Multi-tenant workspace isolation** with complete user separation
- [ ] **Enhanced AgentSession** supporting hierarchical agent management
- [ ] **Real-time streaming** integration with WebSocket coordination
- [ ] **Git operation tracking** with branch management **and conflict resolution** _(retained for optional parallel mode)_
- [ ] **Sequential execution enforced** (canonical mode) → prevents merge conflicts in practice
- [ ] **Session persistence** for resumability across time
- [ ] **80%+ test coverage** including recursive spawning scenarios
- [ ] **Performance optimization** for concurrent multi-user execution

> **Note on Merge Conflicts:** The canonical execution model is **sequential**, so conflicts should not occur. We **retain** conflict-resolution logic for a future **parallel mode** feature flag.

---

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

```ts
// ❌ BAD: Agent sees business logic
class AgentSession {
  constructor(
    private userId: string, // ❌ Agent shouldn't know user
    private creditBalance: number, // ❌ Agent shouldn't see credits
    private subscriptionTier: string // ❌ Agent shouldn't know billing
  ) {}
}

// ✅ GOOD: Agent remains pure
class AgentSession {
  constructor(
    private vision: string, // ✅ Task instructions
    private workingDirectory: string, // ✅ Isolated workspace
    private options: AgentOptions // ✅ Execution configuration
  ) {
    // Agent focuses purely on development tasks
  }
}
```

---

## Architecture Overview (New)

**Core components** (by responsibility):

- **KeenAgentSession** – autonomous lifecycle driver (sequential, phase-based)
- **WorkspaceManager** – path isolation, FS policy, child workspace creation
- **GitManager** – repo init, branch naming, commit discipline, _optional_ conflict handling
- **ContextManager** – 1M context window packing, inherited context sanitization
- **ToolManager** – safe tool registry (files, shell, git, web, autonomy tools)
- **ConversationManager** – model IO, streaming, parsing, safety rails
- **Streaming/WebSocketManager** – progress/thinking/events to clients (Phase 4)
- **SessionPersistence (DAO)** – resumability, event log, artifacts index
- **CreditGatewayService (supervisor)** – preflight checks, budgets, hard kill switches (outside agent purity boundary)

**Data flow (high level):**

1. API call → Credit preflight (supervisor) → create **KeenAgentSession**
2. Session builds 1M context → enters **Autonomy Loop**
3. Tools write files / run commands → **GitManager** commits
4. Events stream via **WebSocketManager** → persisted by DAOs
5. On completion (or budget/iteration cap) → **report_complete** → snapshot + return

---

## Operating Modes (New)

- **Sequential (Default, Canonical):**
  - Child agents spawn **one-at-a-time**.
  - Each child completes and merges before next begins.
  - Deterministic order; **no merge conflicts** by design.

- **Parallel (Feature-flagged, Future):**
  - Multiple children run concurrently on branches.
  - Requires advanced conflict resolution & priority merge.
  - The existing Git conflict code remains, but is **disabled** in sequential mode.

---

## Autonomy Design (Expanded)

Autonomy is achieved via a **phase-driven loop** with **tool-governed self-reporting**.

**Key tools (contracted JSON):**

- `report_phase` → `{ phase: "EXPLORE" | "PLAN" | "SUMMON" | "COMPLETE", note?: string }`
- `continue_work` → `{ reason: string, next_phase?: Phase, hints?: any }`
- `report_complete` → `{ summary: string, filesCreated?: string[], filesModified?: string[], success: boolean, metrics?: Record<string,number> }`

**Supervisor boundaries (outside purity):**

- Preflight: `CreditGatewayService.ensureAllowance(sessionBudget)`
- Per-iteration metering: `CostOptimizer.charge(tokens)`
- Hard-stops: budget exceeded, iteration cap, wall clock limit

---

## Phase Lifecycle & State Machine (New)

**States:** `EXPLORE → PLAN → SUMMON → COMPLETE`

**Transitions:**

- `EXPLORE → PLAN` (when enough project context collected)
- `PLAN → SUMMON` (plan approved by agent; tasks enumerated)
- `SUMMON → EXPLORE/PLAN` (if new info or re-plan required)
- `SUMMON → COMPLETE` (when acceptance checks pass)

**Guards:**

- credit budget available, iteration < max, runtime < wall-clock cap

**State Table:**

| State    | Entry Action                              | Tools (typical)                            | Exit Condition                       |
| -------- | ----------------------------------------- | ------------------------------------------ | ------------------------------------ |
| EXPLORE  | analyze tree, read key files              | `get_project_tree`, `read_files`           | map established                      |
| PLAN     | produce spec, risks, test plan            | internal planning, `ValidationTool`        | plan acknowledged via `report_phase` |
| SUMMON   | implement, test, (optionally spawn child) | `write_files`, `run_command`, `web_search` | tests pass or needs re-plan          |
| COMPLETE | summarize, persist, finalize              | `report_complete`                          | terminal                             |

---

## Autonomy Loop – Algorithm (Pseudocode)

```ts
async function runAutonomy(session: KeenAgentSession) {
  while (!session.done()) {
    supervisor.preflightOrThrow(); // credits/limits (outside purity)

    const phase = session.currentPhase();
    session.stream.phase(phase);

    switch (phase) {
      case "EXPLORE":
        await session.explore(); // tree, read_files, heuristics
        session.tool.report_phase({ phase: "PLAN", note: "context mapped" });
        break;

      case "PLAN":
        await session.plan(); // tasks, risks, acceptance
        session.tool.continue_work({
          reason: "ready to implement",
          next_phase: "SUMMON",
        });
        break;

      case "SUMMON":
        // Sequential child spawn (optional)
        if (session.needsChild()) {
          supervisor.ensureAllowance(childBudget);
          const child = await session.spawnChild(subVision);
          await child.runToCompletion(); // blocks until merged
          await session.postChildValidation();
        }
        await session.implementIncrement(); // write_files, run_command
        if (session.acceptanceMet()) {
          session.tool.report_phase({ phase: "COMPLETE" });
        } else {
          session.tool.continue_work({ reason: "more work needed" });
        }
        break;

      case "COMPLETE":
        const report = await session.finalize();
        session.tool.report_complete(report);
        return report;
    }

    supervisor.meterAndMaybeStop();
  }
}
```

---

## Sequential Spawn Protocol (New)

1. **Checkpoint** current branch & workspace
2. **Create child branch** (linear): `summon-A`, `summon-B`, ...
3. **Create child workspace** under parent path
4. **Run child to completion** (blocking)
5. **Validate artifacts** (tests, lints)
6. **Fast-forward merge** back to parent (no conflicts by design)
7. **Commit with metadata** `[CHILD:ID][PURPOSE:...]`
8. **Resume parent** at `SUMMON`

**Branch naming (linear, deterministic):**

```
main → summon-A → summon-B → summon-C → ...
```

---

## Git Strategy (Clarified)

- **Repo init**: on first execution; ensure `main` exists
- **Commit discipline**: `[AGENT:<sid>][PHASE:<phase>] message`
- **Tracking**: `branchHierarchy` map; commit ledger per branch
- **Conflict Handling**: **disabled by default** in sequential mode; implementation retained behind `PARALLEL_MODE` flag

**Operation Table:**

| Operation    | Seq Mode | Parallel Mode   |
| ------------ | -------- | --------------- |
| init repo    | ✓        | ✓               |
| create child | ✓ (one)  | ✓ (many)        |
| merge child  | FF merge | 3-way + resolve |
| auto-resolve | —        | ✓               |

---

## 1M Context Management (Expanded)

**Goals:** pack maximal useful context while preserving _thinking blocks_.

- **Max window**: 1,000,000 tokens; use \~50k buffer
- **Message packing**: system → instructions → inherited → project map → recent tool traces
- **Sanitization**: inherited context scrubbed for business/tenant data
- **Intelligent pruning**: LRU of files, semantic summarization for older traces
- **Thinking preservation**: maintain chain-of-thought _structures_ (without leaking secrets)

```ts
const optimized = contextOptimizer.optimize({
  maxContextSize: 1_000_000,
  intelligentPruning: true,
  preserveThinking: true,
});
```

---

## Persistence Schema (New)

**Tables / DAOs used:**

- `sessions` (SessionDAO): id, parent_id, vision, phase, started_at, ended_at, success, budget_used
- `agent_events` (AnalyticsDAO): session_id, type, payload JSONB, ts
- `artifacts` (SessionDAO): session_id, path, hash, size, kind
- `ws_connections` (WebSocketDAO): session_id, client_id, status
- `credits_ledger` (CreditDAO): session_id, tokens_in, tokens_out, cost

**Indexes:** on `(session_id, ts)` for events; `(path)` for artifacts

**Resumability:** on restart, load last committed phase & context; continue loop

---

## WebSocket Events (New)

**Event names & payloads:**

- `agent.started` → `{ sessionId, vision, cwd }`
- `agent.phase` → `{ sessionId, phase, note? }`
- `agent.progress` → `{ sessionId, message, step, total? }`
- `agent.spawned` → `{ parentId, childId, purpose, branch }`
- `agent.completed` → `{ sessionId, success, summary }`
- `agent.error` → `{ sessionId, code, message, stack? }`

**Backpressure:**

- coalesce progress events; drop debug logs when queue > threshold

---

## Security & Isolation (Expanded)

- **FS boundaries**: regex + `path.resolve` checks; deny `..`, `~`
- **Permissions**: `0o700` on workspaces and child dirs
- **Shell execution**: allowlist commands; timeouts; output size caps
- **RLS**: DB queries scoped by `session_id` and tenant id (enforced by DAO)
- **Audit**: `AuditLogger` captures tool usage & file diffs

---

## Credit Governance (New)

- **Budgets**: per-session & per-child `maxTokens` / `maxCost`
- **Preflight**: decline spawn when `remaining < childMin`
- **Metering**: token usage reported per completion; charged to `credits_ledger`
- **Kill switches**: hard stop on overrun; produce partial report
- **Purity preserved**: all gating outside agent context

---

## Observability & Metrics (New)

- **Counters**: agents_started, agents_completed, children_spawned
- **Timers**: phase_duration_ms{phase}, end_to_end_ms
- **Histograms**: tokens_per_iter, files_touched
- **Gauges**: ws_clients_active, queue_depth
- **Tracing**: OpenTelemetry spans around tool calls & model invocations

---

## Error Handling & Resilience (New)

- **Categories**: ToolError, GitOperationError, BudgetExceeded, ValidationError
- **Retries**: exponential backoff on transient IO; no retry on deterministic compiler errors without code change
- **Idempotency**: commands tagged with `(sessionId, step)` to dedupe on resume
- **Crash recovery**: reload last successful phase; re-run from checkpoint

---

## Performance Targets (New)

- **Cold start** < 3s for empty project; < 8s for medium repo (2k files)
- **Throughput**: 10 concurrent sessions per node with 1M context enabled
- **FS ops**: > 95% operations within 50ms p50, < 300ms p95
- **Streaming**: < 250ms end-to-end latency p95

---

## Testing Strategy (Expanded)

1. **Unit**: Agent state machine, branch naming, context packing
2. **Integration**: `full-autonomous-workflow`, `git-validation-workflow`
3. **E2E**: CLI `breathe` on fixtures (react-todo, node-api)
4. **Security**: path traversal, RLS enforcement
5. **Performance**: large project (500+ files), 1M context ingest
6. **Soak**: 2–4 hour runs with periodic child spawns
7. **Failure Injection**: simulate tool timeouts, OOM, git lock files

**Coverage Goal**: ≥ 80% lines; ≥ 90% critical paths (spawn, finalize)

---

## API Gateway Contracts (New)

- `POST /agents/start` → `{ vision, cwd, budget }` → `{ sessionId }`
- `POST /agents/continue` → `{ sessionId }` → `{ phase, snapshot }`
- `GET /agents/:id/stream` → SSE/WS stream of events
- `POST /agents/:id/kill` → stop gracefully, emit partial report

All requests pass through **AuthenticationService**; payloads are sanitized before entering agent purity zone.

---

## Example End-to-End Flow (New)

1. `/agents/start { vision: "Create auth + CRUD" }` → `sessionId: s1`
2. `agent.started(s1)`; enters **EXPLORE** → reads tree/files
3. `report_phase { PLAN }`; produces spec & tests skeleton
4. `continue_work { next_phase: SUMMON }` → implement
5. Needs JWT specialist → **spawn child** `summon-A` → run → fast-forward merge
6. Parent validates; lints/tests → `report_phase { COMPLETE }`
7. `report_complete { summary, filesCreated, success: true }`

---

## Code Skeletons (New)

```ts
// src/agent/AgentSession.ts (skeleton)
export class AgentSession {
  constructor(
    private opts: AgentOptions,
    private deps: Deps
  ) {}
  currentPhase(): Phase {
    /* ... */
  }
  async explore() {}
  async plan() {}
  async implementIncrement() {}
  needsChild(): boolean {
    /* ... */
  }
  async spawnChild(vision: string) {
    /* sequential */
  }
  acceptanceMet(): boolean {
    /* tests pass, etc. */
  }
  async finalize() {
    /* build CompletionReport */
  }
}
```

```ts
// Branch naming (linear)
function nextChildName(prev?: string): string {
  if (!prev) return "summon-A";
  const last = prev.split("-")[1];
  const code = last.charCodeAt(0) + 1;
  return `summon-${String.fromCharCode(code)}`;
}
```

---

## CLI Touchpoints (New)

- `keen breathe "<vision>"` \ `keen breathe -f vision.md`\ af – kicks off session
- `keen status <sessionId>` – shows phase, last commit, budget used
- `keen continue <sessionId>` – resume after pause/kill

---

## Migration from a2s2 (Plan)

1. **Extract** autonomy tools (report/continue/complete) and ConversationManager
2. **Refactor** to enforce sequential spawn; gate behind feature flag for parallel mode
3. **Integrate** DAOs for persistence and credits
4. **Wire** WebSocketManager for streaming
5. **Harden** with expanded tests & failure injection

---

## Deliverables (Consolidated)

1. **Enhanced AgentSession** with recursive spawning and multi-tenant support
2. **Workspace isolation** with strict FS & process boundaries
3. **Git manager** with branch tracking; conflict logic retained behind flag
4. **Context manager** for guaranteed 1M window
5. **Progress streaming** over WS/SSE with backpressure controls
6. **Session persistence** and resumability
7. **Comprehensive test suite** & performance targets
8. **Observability & audit** via metrics + logs + ledger
9. **Docs & examples** aligned with code skeletons
10. **Security validation** & RLS tests passing
11. **Credit governance** enforced by supervisor, preserving purity

---

**Remember:** The Agent Core is the heart of keen's innovation. It must preserve a2s2's autonomous capabilities while adding multi-tenant support and recursive spawning, all while maintaining complete agent purity. Agents must never know they're part of a commercial platform—they focus purely on software development.

# Interleaved Thinking in keen Agent System

## Overview

Interleaved thinking is a critical architectural pattern in keen where agents maintain continuous reasoning throughout their execution lifecycle. This enables sophisticated decision-making, error recovery, and adaptive behavior during autonomous development tasks.

## What is Interleaved Thinking?

Interleaved thinking refers to the agent's ability to:

- **Think between actions** - Process and reason about each step before execution
- **Adapt in real-time** - Modify approach based on intermediate results
- **Maintain context** - Preserve reasoning chains across multiple interactions
- **Self-correct** - Identify and fix errors through continuous reflection

## Implementation in keen

### 1. Agent Session Thinking Storage

Every agent session in keen captures and stores thinking patterns:

```sql
-- Enhanced agent_sessions table includes thinking storage
ALTER TABLE agent_sessions ADD COLUMN thinking_blocks JSONB DEFAULT '[]'::jsonb;
ALTER TABLE agent_sessions ADD COLUMN reasoning_chain TEXT[];
ALTER TABLE agent_sessions ADD COLUMN decision_points JSONB DEFAULT '{}'::jsonb;
```

### 2. Thinking Block Structure

```typescript
interface ThinkingBlock {
  id: string;
  timestamp: Date;
  phase: "EXPLORE" | "PLAN" | "SUMMON" | "COMPLETE";
  iteration: number;
  thinking_content: string;
  context: {
    current_task: string;
    available_tools: string[];
    previous_results: any[];
    confidence_level: number; // 0-1
  };
  decision_made: {
    action: string;
    reasoning: string;
    alternatives_considered: string[];
  };
  outcome_prediction: string;
}
```

### 3. Anthropic Configuration for Thinking

**Based on a2s2 implementation analysis:**

```typescript
// CRITICAL: Proper configuration for interleaved thinking
export class AnthropicConfigManager {
  constructor(customConfig: Partial<AnthropicConfig> = {}) {
    const defaultConfig: AnthropicConfig = {
      // Use current Claude model
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
      maxTokens: 16000,
      thinkingBudget: 10000,

      // CRITICAL: Enable thinking and extended context
      enableInterleaved: true, // Enable thinking blocks
      enableExtendedContext: true, // keen requires 1M context

      enableWebSearch: true,
      enableStreaming: true,
    };

    this.config = { ...defaultConfig, ...customConfig };
  }

  getRequestConfig() {
    return {
      model: this.config.model,
      max_tokens: this.config.maxTokens,

      // CRITICAL: Thinking configuration
      thinking: {
        type: "enabled" as const,
        budget_tokens: this.config.thinkingBudget,
      },

      stream: this.config.enableStreaming,
    };
  }

  getBetaHeaders(): string[] {
    const headers: string[] = [];

    // CRITICAL: Required headers for keen
    if (this.config.enableInterleaved) {
      headers.push("interleaved-thinking-2025-05-14");
    }

    if (this.config.enableExtendedContext) {
      headers.push("context-1m-2025-08-07");
    }

    return headers;
  }
}
```

### 4. Phase-Based Thinking Patterns

#### EXPLORE Phase Thinking

- **Project Analysis**: "I need to understand the codebase structure first..."
- **Problem Identification**: "The main issues I see are..."
- **Approach Selection**: "Given the complexity, I should..."

#### PLAN Phase Thinking

- **Strategy Formulation**: "My implementation strategy will be..."
- **Risk Assessment**: "Potential challenges include..."
- **Resource Planning**: "I'll need these tools and dependencies..."

#### SUMMON Phase Thinking

- **Task Decomposition**: "I can break this into sub-agents for..."
- **Agent Coordination**: "Each agent will handle..."
- **Merge Strategy**: "I'll coordinate results by..."

#### COMPLETE Phase Thinking

- **Implementation Decisions**: "I'm choosing this approach because..."
- **Quality Validation**: "Let me verify this works by..."
- **Success Criteria**: "This solution is complete when..."

### 5. Recursive Thinking in Agent Trees

When agents spawn sub-agents, thinking is preserved at every level:

```
main-agent thinking: "I need to implement authentication..."
├── summon-A thinking: "I'll focus on JWT tokens because..."
│   ├── summon-A-A thinking: "The token validation logic should..."
│   └── summon-A-B thinking: "For refresh tokens, I need to..."
└── summon-B thinking: "The database schema requires..."
```

## Database Integration

### SessionDAO Enhancement

The `SessionDAO` captures thinking at every step:

```typescript
interface UpdateSessionRequest {
  // Existing fields...
  thinkingBlock?: ThinkingBlock;
  reasoningUpdate?: string;
  confidenceLevel?: number;
  decisionsMade?: DecisionPoint[];
}

interface DecisionPoint {
  timestamp: Date;
  context: string;
  options_considered: string[];
  decision_made: string;
  reasoning: string;
  confidence: number;
}
```

### Storage Pattern

```sql
-- Store thinking as JSONB for efficient querying
INSERT INTO agent_sessions (
  thinking_blocks,
  reasoning_chain,
  decision_points
) VALUES (
  '[{"id": "think-1", "content": "I need to analyze..."}]'::jsonb,
  ARRAY['Initial analysis', 'Problem identification', 'Solution design'],
  '{"key_decisions": [{"decision": "Use TypeScript", "reasoning": "Type safety"}]}'::jsonb
);
```

## Real-Time Thinking Streaming

### WebSocket Integration

Thinking is streamed live to the dashboard:

```typescript
interface ThinkingStreamEvent {
  type: "thinking_update";
  sessionId: string;
  agentId: string;
  thinking: {
    content: string;
    confidence: number;
    decision_pending: boolean;
  };
  timestamp: Date;
}
```

### Dashboard Visualization

- **Thinking Panel**: Live stream of agent reasoning
- **Decision Tree**: Visual representation of choices made
- **Confidence Meter**: Real-time confidence levels
- **Alternative Paths**: What the agent considered but didn't choose

## Analytics and Insights

### Admin Analytics Enhancement

Admin users can analyze thinking patterns across all sessions:

```sql
-- Query thinking patterns
SELECT
  user_id,
  AVG(confidence_level) as avg_confidence,
  COUNT(decision_points) as decisions_made,
  array_agg(DISTINCT reasoning_type) as thinking_patterns
FROM agent_sessions s
CROSS JOIN jsonb_array_elements(s.thinking_blocks) as thinking(block)
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY user_id;
```

### Performance Metrics

- **Thinking Depth**: How thoroughly agents analyze problems
- **Decision Quality**: Success rates of different reasoning patterns
- **Confidence Correlation**: How confidence levels predict success
- **Error Recovery**: How thinking helps agents self-correct

## Implementation Guidelines

### 1. Thinking Capture

```typescript
// In agent execution
class KeenAgent {
  private async captureThinking(content: string, context: any) {
    const thinkingBlock: ThinkingBlock = {
      id: uuidv4(),
      timestamp: new Date(),
      phase: this.currentPhase,
      iteration: this.iteration,
      thinking_content: content,
      context: context,
      decision_made: this.lastDecision,
      outcome_prediction: this.predictOutcome(),
    };

    await this.sessionDAO.updateSession(this.sessionId, {
      thinkingBlock,
    });
  }
}
```

### 2. Real-Time Streaming

```typescript
// Stream thinking to dashboard
class StreamingService {
  async streamThinking(sessionId: string, thinking: ThinkingBlock) {
    const connections =
      await this.websocketDAO.getSessionConnections(sessionId);

    for (const connection of connections) {
      await this.sendMessage(connection.connection_id, {
        type: "thinking_update",
        sessionId,
        thinking,
      });
    }
  }
}
```

### 3. Thinking Analysis

```typescript
// Analyze thinking patterns
class ThinkingAnalyzer {
  async analyzeSession(sessionId: string) {
    const session = await this.sessionDAO.getSessionById(sessionId);

    return {
      thinking_depth: session.thinking_blocks.length,
      avg_confidence: this.calculateAverageConfidence(session),
      decision_quality: this.assessDecisionQuality(session),
      reasoning_patterns: this.identifyPatterns(session),
    };
  }
}
```

## Configuration Validation

### Required Configuration

```typescript
// Validate interleaved thinking is properly configured
export class ThinkingValidator {
  static validateConfig(config: AnthropicConfig): void {
    if (!config.enableInterleaved) {
      throw new Error(
        "CRITICAL: Interleaved thinking must be enabled for keen agents. " +
          "Set enableInterleaved: true in your configuration."
      );
    }

    if (config.thinkingBudget < 1000) {
      console.warn(
        `Warning: Low thinking budget (${config.thinkingBudget}). ` +
          "Consider increasing to 10000+ for better reasoning quality."
      );
    }

    if (!config.enableExtendedContext) {
      throw new Error(
        "CRITICAL: Extended context must be enabled for sophisticated thinking. " +
          "Set enableExtendedContext: true in your configuration."
      );
    }
  }

  static validateHeaders(headers: string[]): void {
    if (!headers.includes("interleaved-thinking-2025-05-14")) {
      throw new Error(
        "CRITICAL: Missing 'interleaved-thinking-2025-05-14' beta header. " +
          "This is required for thinking blocks to function."
      );
    }

    if (!headers.includes("context-1m-2025-08-07")) {
      throw new Error(
        "CRITICAL: Missing 'context-1m-2025-08-07' beta header. " +
          "This is required for 1M context window."
      );
    }
  }
}
```

## Testing Interleaved Thinking

### Validation Tests

```typescript
describe("Interleaved Thinking Validation", () => {
  test("Configuration enables thinking blocks", () => {
    const config = new AnthropicConfigManager({
      enableInterleaved: true,
      enableExtendedContext: true,
      thinkingBudget: 10000,
    });

    const requestConfig = config.getRequestConfig();
    expect(requestConfig.thinking.type).toBe("enabled");
    expect(requestConfig.thinking.budget_tokens).toBe(10000);

    const headers = config.getBetaHeaders();
    expect(headers).toContain("interleaved-thinking-2025-05-14");
  });

  test("Thinking blocks are preserved in sessions", async () => {
    const sessionDAO = new SessionDAO(dbManager);
    const sessionId = "test-session";

    const thinkingBlock: ThinkingBlock = {
      id: "thinking-1",
      timestamp: new Date(),
      phase: "EXPLORE",
      iteration: 1,
      thinking_content: "I need to analyze the project structure...",
      context: { current_task: "project analysis", confidence_level: 0.8 },
      decision_made: {
        action: "explore_files",
        reasoning: "Understanding structure first",
      },
      outcome_prediction: "Will identify main components",
    };

    await sessionDAO.updateSession(sessionId, { thinkingBlock });

    const session = await sessionDAO.getSessionById(sessionId);
    expect(session.thinking_blocks).toContainEqual(
      expect.objectContaining({
        id: "thinking-1",
        phase: "EXPLORE",
      })
    );
  });
});
```

## Benefits of Interleaved Thinking

### 1. **Improved Problem Solving**

- Agents make better decisions through continuous reflection
- Complex problems are broken down more effectively
- Alternative solutions are properly considered

### 2. **Enhanced Transparency**

- Users can see exactly how agents are reasoning
- Decision-making process is fully auditable
- Debugging becomes much easier when things go wrong

### 3. **Adaptive Behavior**

- Agents can change course when new information emerges
- Error recovery happens naturally through re-thinking
- Learning from previous decisions improves future performance

### 4. **Quality Assurance**

- Continuous self-assessment prevents poor solutions
- Confidence levels help identify when human review is needed
- Decision patterns can be analyzed for improvement

### 5. **User Trust**

- Transparent reasoning builds confidence in agent capabilities
- Users understand why specific approaches were chosen
- Failed attempts are explained, not hidden

## Model Evolution Considerations

### Current Implementation (Claude 3.5 Sonnet)

- **Thinking Quality**: Excellent reasoning capabilities
- **Budget Requirements**: 10,000 tokens recommended for complex thinking
- **Beta Headers**: `interleaved-thinking-2025-05-14` confirmed working

### Future Claude 4 Migration

- **Expected Improvements**: Even better reasoning and thinking quality
- **Budget Optimization**: May require less tokens for same quality
- **Header Compatibility**: Likely to maintain same beta headers

## Conclusion

Interleaved thinking is what transforms keen from a simple task execution system into an intelligent development partner. By capturing, storing, and analyzing agent reasoning, keen provides unprecedented transparency and capability in autonomous software development.

The thinking system scales from individual agents to complex recursive hierarchies, maintains full auditability, and provides rich analytics for continuous improvement. Combined with the 1M context window and current Claude models, this foundation enables keen to handle increasingly sophisticated development challenges while maintaining user trust and system reliability.

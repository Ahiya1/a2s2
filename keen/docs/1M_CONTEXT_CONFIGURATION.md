# 1M Context Window Configuration

## Overview

keen's **revolutionary capability** is providing **every agent** with access to the **full 1M token context window**. This enables sophisticated reasoning on complex codebases, comprehensive project understanding, and intelligent decision-making that was previously impossible with smaller context windows.

## Critical Requirements

### Universal 1M Context Access

**EVERY agent in keen must use the full 1M context window:**

- ✅ Main agents spawned by users
- ✅ Recursive sub-agents spawned by other agents
- ✅ Sub-sub-agents at any depth level
- ✅ Both autonomous ('breathe') mode agents
- ✅ Interactive ('converse') mode agents

**NO EXCEPTIONS:** The 1M context is fundamental to keen's competitive advantage.

### Claude API Configuration

```typescript
// Core configuration that MUST be used by all agents
const KEEN_CLAUDE_CONFIG = {
  model: "claude-sonnet-4-20250514",
  max_tokens: 8192,
  thinking: true, // CRITICAL: Enable thinking blocks
  enableExtendedContext: true, // CRITICAL: Enable 1M context
  contextWindowSize: 1000000, // CRITICAL: Full 1M tokens

  // Performance optimizations
  enablePromptCaching: true, // Cache repeated system prompts
  intelligentPruning: true, // Smart context management
  thinkingPreservation: true, // Preserve reasoning across iterations

  // Cost optimization (but never reduce context)
  costOptimizationLevel: "balanced", // balance | aggressive | conservative
  cachingStrategy: "aggressive", // Cache everything possible

  // Beta features for enhanced capabilities
  betas: [
    "extended-context-2024-10", // Enable 1M context window
    "thinking-2024-10", // Enable thinking blocks
    "computer-use-2024-10", // Future: tool use enhancements
  ],
};
```

### Context Window Utilization

```typescript
interface ContextUtilization {
  total_capacity: 1000000; // 1M tokens total
  system_prompt: number; // ~5,000-15,000 tokens
  project_analysis: number; // ~50,000-100,000 tokens
  conversation_history: number; // Variable, managed intelligently
  thinking_blocks: number; // Preserved across iterations
  tool_responses: number; // Recent tool execution results
  available_for_reasoning: number; // Remaining space for complex reasoning
}
```

## Implementation Requirements

### Agent Core Integration

```typescript
// Required: Every AgentSession MUST use full context
export class AgentSession {
  constructor(options: AgentSessionOptions) {
    // CRITICAL: Always enable extended context
    const configManager = new AnthropicConfigManager({
      enableExtendedContext: true, // NEVER allow this to be false
      contextWindowSize: 1000000, // NEVER reduce this
      enableWebSearch: options.enableWebSearch !== false,
      enableStreaming: options.enableStreaming !== false,
      showProgressIndicators: options.showProgress !== false,
      // Cost optimization settings (never reduce context)
      enablePromptCaching: true,
      intelligentContextManagement: true,
      thinkingBlockPreservation: true,
    });

    this.conversationManager = new ConversationManager(
      configManager.getConfig()
    );

    // Validate that 1M context is actually enabled
    this.validateContextConfiguration();
  }

  private validateContextConfiguration(): void {
    const config = this.conversationManager.getConfig();

    if (config.contextWindowSize < 1000000) {
      throw new Error(
        `CRITICAL: Context window is ${config.contextWindowSize} but keen requires 1,000,000 tokens. ` +
          `This violates keen's core architecture principles.`
      );
    }

    if (!config.enableExtendedContext) {
      throw new Error(
        `CRITICAL: Extended context is disabled but keen requires 1M context window. ` +
          `This violates keen's core architecture principles.`
      );
    }

    Logger.info("Context validation passed", {
      contextWindowSize: config.contextWindowSize,
      enableExtendedContext: config.enableExtendedContext,
      enableThinking: config.thinking,
    });
  }
}
```

### ConversationManager Integration

```typescript
// Required: Enhanced ConversationManager for 1M context
export class ConversationManager {
  private contextOptimizer: ContextOptimizer;
  private thinkingBlockManager: ThinkingBlockManager;
  private costTracker: CostTracker;

  constructor(config: AnthropicConfig) {
    // Validate 1M context requirement
    if (!config.enableExtendedContext || config.contextWindowSize < 1000000) {
      throw new Error("keen requires 1M context window for all agents");
    }

    this.anthropic = new Anthropic({
      apiKey: config.apiKey,
      // Ensure beta features are enabled
      defaultHeaders: {
        "anthropic-beta": "extended-context-2024-10,thinking-2024-10",
      },
    });

    this.contextOptimizer = new ContextOptimizer(config);
    this.thinkingBlockManager = new ThinkingBlockManager();
    this.costTracker = new CostTracker();
  }

  private buildRequestConfig(options: ConversationOptions): any {
    const baseConfig = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      thinking: true, // ALWAYS enable thinking

      // CRITICAL: Extended context configuration
      messages: this.contextOptimizer.optimizeForFullContext(
        this.messageBuilder.getMessages()
      ),

      // Beta features for 1M context
      betas: ["extended-context-2024-10", "thinking-2024-10"],

      // Cost optimization (without reducing context)
      ...(options.enablePromptCaching && {
        system: this.contextOptimizer.addCachingHeaders(
          this.messageBuilder.getSystemMessage()
        ),
      }),
    };

    // Validate final configuration
    this.validateRequestConfig(baseConfig);
    return baseConfig;
  }

  private validateRequestConfig(config: any): void {
    if (!config.thinking) {
      throw new Error("Thinking blocks must be enabled for keen agents");
    }

    if (!config.betas?.includes("extended-context-2024-10")) {
      throw new Error("Extended context beta must be enabled for keen agents");
    }

    const estimatedTokens = this.contextOptimizer.estimateTokenUsage(
      config.messages
    );
    if (estimatedTokens > 900000) {
      // Leave 100k buffer
      Logger.warn("Approaching context limit", {
        estimatedTokens,
        contextCapacity: 1000000,
        bufferRemaining: 1000000 - estimatedTokens,
      });
    }
  }
}
```

### Context Optimization Strategies

```typescript
export class ContextOptimizer {
  private readonly MAX_CONTEXT = 1000000;
  private readonly SAFETY_BUFFER = 50000; // Reserve 50k for response
  private readonly EFFECTIVE_LIMIT = this.MAX_CONTEXT - this.SAFETY_BUFFER;

  optimizeForFullContext(
    messages: ConversationMessage[]
  ): ConversationMessage[] {
    const currentUsage = this.estimateTokenUsage(messages);

    if (currentUsage <= this.EFFECTIVE_LIMIT) {
      // No optimization needed
      return messages;
    }

    Logger.info("Context optimization required", {
      currentUsage,
      effectiveLimit: this.EFFECTIVE_LIMIT,
      overage: currentUsage - this.EFFECTIVE_LIMIT,
    });

    // Intelligent context pruning (NEVER remove system prompt)
    const optimized = this.intelligentPruning(messages);

    // Verify we're within limits after optimization
    const optimizedUsage = this.estimateTokenUsage(optimized);
    if (optimizedUsage > this.EFFECTIVE_LIMIT) {
      throw new Error(
        `Context optimization failed: ${optimizedUsage} tokens exceeds limit of ${this.EFFECTIVE_LIMIT}`
      );
    }

    Logger.info("Context optimization completed", {
      originalUsage: currentUsage,
      optimizedUsage,
      tokensSaved: currentUsage - optimizedUsage,
      messagesRemoved: messages.length - optimized.length,
    });

    return optimized;
  }

  private intelligentPruning(
    messages: ConversationMessage[]
  ): ConversationMessage[] {
    const systemMessage = messages[0]; // NEVER remove system prompt
    let workingMessages = messages.slice(1);

    // Pruning strategies (in order of preference)
    const strategies = [
      () => this.removeOldestNonCriticalMessages(workingMessages),
      () => this.compressToolResults(workingMessages),
      () => this.summarizeOldConversations(workingMessages),
      () => this.removeRedundantThinkingBlocks(workingMessages),
    ];

    for (const strategy of strategies) {
      const currentUsage = this.estimateTokenUsage([
        systemMessage,
        ...workingMessages,
      ]);
      if (currentUsage <= this.EFFECTIVE_LIMIT) break;

      workingMessages = strategy();
    }

    return [systemMessage, ...workingMessages];
  }

  private removeOldestNonCriticalMessages(
    messages: ConversationMessage[]
  ): ConversationMessage[] {
    // Keep recent messages and critical context markers
    const criticalPatterns = [
      /\[AGENT:.*\]/, // Agent status messages
      /\[PHASE:.*\]/, // Phase transition markers
      /\[CRITICAL.*\]/, // Explicitly marked critical content
    ];

    const recent = messages.slice(-20); // Always keep last 20 messages
    const older = messages.slice(0, -20);

    const criticalOlder = older.filter((msg) => {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      return criticalPatterns.some((pattern) => pattern.test(content));
    });

    return [...criticalOlder, ...recent];
  }

  private preserveThinkingBlocks(
    messages: ConversationMessage[]
  ): ConversationMessage[] {
    // CRITICAL: Preserve thinking blocks for reasoning continuity
    return messages.map((msg) => {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        // Ensure thinking blocks are preserved
        const hasThinking = msg.content.some(
          (block) => block.type === "thinking"
        );
        if (hasThinking) {
          // Mark as high priority for preservation
          (msg as any).preserveThinking = true;
        }
      }
      return msg;
    });
  }
}
```

## Thinking Block Management

```typescript
export class ThinkingBlockManager {
  preserveThinkingBlocks(
    messages: ConversationMessage[]
  ): ConversationMessage[] {
    return messages.map((message) => {
      if (message.role === "assistant" && Array.isArray(message.content)) {
        // Ensure thinking blocks are properly structured
        const structuredContent = message.content.map((block) => {
          if (block.type === "thinking") {
            return {
              type: "thinking",
              thinking: block.thinking,
              signature: block.signature || "preserved_thinking",
              // Add metadata for context management
              metadata: {
                preserved_at: new Date().toISOString(),
                token_count: this.estimateTokens(block.thinking),
                importance: this.assessThinkingImportance(block.thinking),
              },
            };
          }
          return block;
        });

        return {
          ...message,
          content: structuredContent,
        };
      }
      return message;
    });
  }

  private assessThinkingImportance(
    thinking: string
  ): "high" | "medium" | "low" {
    // Assess thinking block importance for pruning decisions
    const importanceIndicators = {
      high: [
        /architectural decision/i,
        /security consideration/i,
        /breaking change/i,
        /critical bug/i,
        /performance impact/i,
      ],
      medium: [
        /implementation approach/i,
        /design pattern/i,
        /optimization/i,
        /refactoring/i,
      ],
      low: [/syntax/i, /formatting/i, /minor/i],
    };

    for (const [level, patterns] of Object.entries(importanceIndicators)) {
      if (patterns.some((pattern) => pattern.test(thinking))) {
        return level as "high" | "medium" | "low";
      }
    }

    return "medium"; // Default to medium importance
  }
}
```

## Cost Management with 1M Context

### Pricing Awareness

```typescript
interface ContextCostCalculation {
  context_size: number;
  pricing_tier: "standard" | "extended"; // >200K tokens = extended pricing
  input_cost_per_token: number;
  output_cost_per_token: number;
  thinking_cost_per_token: number;
  estimated_cost_per_request: number;
}

const CLAUDE_PRICING_2024 = {
  standard: {
    // ≤200K tokens
    input: 3.0 / 1_000_000, // $3 per million input tokens
    output: 15.0 / 1_000_000, // $15 per million output tokens
    thinking: 15.0 / 1_000_000, // Thinking tokens = output pricing
  },
  extended: {
    // >200K tokens
    input: 6.0 / 1_000_000, // $6 per million input tokens
    output: 22.5 / 1_000_000, // $22.50 per million output tokens
    thinking: 22.5 / 1_000_000, // Thinking tokens = output pricing
  },
};
```

### Cost Optimization Strategies

```typescript
export class CostOptimizer {
  optimizeFor1MContext(options: ContextOptimizationOptions): ContextStrategy {
    const strategy: ContextStrategy = {
      // Always use 1M context - non-negotiable
      contextWindowSize: 1000000,

      // Optimize within the 1M limit
      enablePromptCaching: true,        // Cache system prompts aggressively
      intelligentPruning: true,         // Smart message pruning
      thinkingCompression: false,       // Don't compress thinking blocks
      toolResultSummarization: true,    # Summarize verbose tool outputs

      // Cost reduction techniques
      cachingStrategy: 'aggressive',    // Cache everything possible
      contextReuse: true,              // Reuse context between similar tasks
      batchSimilarRequests: true,      // Batch requests when possible

      // Performance optimizations
      preloadFrequentContext: true,    // Preload common project patterns
      contextPrefetching: true,        // Prefetch related context

      // User experience
      transparentPricing: true,        // Show costs clearly to users
      budgetWarnings: true,           // Warn when approaching limits
      costPrediction: true            // Predict costs before execution
    };

    return strategy;
  }

  calculateContextCost(tokenUsage: TokenUsage): ContextCostBreakdown {
    const isExtendedPricing = tokenUsage.inputTokens > 200_000;
    const pricing = isExtendedPricing ? CLAUDE_PRICING_2024.extended : CLAUDE_PRICING_2024.standard;

    return {
      pricing_tier: isExtendedPricing ? 'extended' : 'standard',
      input_cost: tokenUsage.inputTokens * pricing.input,
      output_cost: tokenUsage.outputTokens * pricing.output,
      thinking_cost: (tokenUsage.thinkingTokens || 0) * pricing.thinking,
      total_cost:
        (tokenUsage.inputTokens * pricing.input) +
        (tokenUsage.outputTokens * pricing.output) +
        ((tokenUsage.thinkingTokens || 0) * pricing.thinking),

      // Cost optimization recommendations
      recommendations: this.generateCostRecommendations(tokenUsage, isExtendedPricing)
    };
  }
}
```

## Testing and Validation

### Context Window Tests

```typescript
describe("1M Context Window Validation", () => {
  test("All agents must use 1M context window", async () => {
    const agentSession = new AgentSession({
      vision: "Test vision for context validation",
      enableExtendedContext: true,
    });

    const config = agentSession.getConversationManager().getConfig();

    expect(config.enableExtendedContext).toBe(true);
    expect(config.contextWindowSize).toBe(1_000_000);
    expect(config.thinking).toBe(true);
  });

  test("Context optimization preserves critical content", async () => {
    const largeContext = generateLargeContext(1_100_000); // Over limit
    const optimizer = new ContextOptimizer();

    const optimized = optimizer.optimizeForFullContext(largeContext);

    // Should be within limit
    const tokenCount = optimizer.estimateTokenUsage(optimized);
    expect(tokenCount).toBeLessThanOrEqual(950_000); // With safety buffer

    // Should preserve system prompt
    expect(optimized[0].role).toBe("user"); // System prompt
    expect(optimized[0].content).toContain("TASK:"); // System prompt content
  });

  test("Thinking blocks are preserved across iterations", async () => {
    const messageWithThinking = {
      role: "assistant",
      content: [
        {
          type: "thinking",
          thinking: "This is important architectural reasoning",
          signature: "architecture_decision",
        },
        {
          type: "text",
          text: "Based on my analysis...",
        },
      ],
    };

    const manager = new ThinkingBlockManager();
    const preserved = manager.preserveThinkingBlocks([messageWithThinking]);

    expect(preserved[0].content[0].type).toBe("thinking");
    expect(preserved[0].content[0].thinking).toContain(
      "architectural reasoning"
    );
  });

  test("Cost calculation accounts for extended pricing", () => {
    const costOptimizer = new CostOptimizer();

    // Test extended pricing (>200K tokens)
    const extendedUsage = {
      inputTokens: 800_000,
      outputTokens: 8_000,
      thinkingTokens: 15_000,
    };

    const cost = costOptimizer.calculateContextCost(extendedUsage);

    expect(cost.pricing_tier).toBe("extended");
    expect(cost.input_cost).toBe(800_000 * (6.0 / 1_000_000)); // Extended input pricing
    expect(cost.total_cost).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```typescript
describe("keen 1M Context Integration", () => {
  test("Recursive agents inherit 1M context", async () => {
    const mainAgent = new AgentSession({
      vision: "Complex multi-agent task requiring recursive spawning",
      enableExtendedContext: true,
    });

    // Mock agent spawning
    const childAgent = mainAgent.spawnChildAgent({
      subVision: "Handle authentication subsystem",
      inheritContext: true,
    });

    const childConfig = childAgent.getConversationManager().getConfig();

    expect(childConfig.contextWindowSize).toBe(1_000_000);
    expect(childConfig.enableExtendedContext).toBe(true);
  });

  test("WebSocket streaming with 1M context", async () => {
    const streamingManager = new StreamingManager({
      enableStreaming: true,
      showProgress: true,
    });

    const contextData = generateContextData(950_000); // Near limit

    // Should handle large context in streaming mode
    const streamResult = await streamingManager.handleLargeContext(contextData);

    expect(streamResult.success).toBe(true);
    expect(streamResult.tokenCount).toBeLessThanOrEqual(1_000_000);
  });
});
```

## Performance Monitoring

### Context Usage Metrics

```typescript
interface ContextMetrics {
  session_id: string;
  timestamp: string;

  // Context utilization
  context_tokens_used: number; // Current context size
  context_utilization_percent: number; // % of 1M limit used
  peak_context_usage: number; // Maximum context used in session

  // Performance impact
  response_time_ms: number; // Response time with large context
  thinking_token_count: number; // Thinking tokens generated
  context_processing_time: number; // Time to process context

  // Cost tracking
  cost_per_request: number; // Cost of this request
  cumulative_session_cost: number; // Total session cost
  pricing_tier: "standard" | "extended";

  // Optimization metrics
  cache_hit_rate: number; // % of cached context reused
  pruning_effectiveness: number; // Tokens saved through pruning
  compression_ratio: number; // Context compression achieved
}
```

### Monitoring Dashboard

```typescript
export class ContextMonitoringService {
  async trackContextUsage(
    sessionId: string,
    metrics: ContextMetrics
  ): Promise<void> {
    // Track context usage patterns
    await this.database.saveContextMetrics(metrics);

    // Alert on concerning patterns
    if (metrics.context_utilization_percent > 95) {
      await this.alertService.sendAlert({
        type: "context_limit_approaching",
        sessionId,
        currentUsage: metrics.context_tokens_used,
        limit: 1_000_000,
      });
    }

    // Performance degradation warning
    if (metrics.response_time_ms > 30_000) {
      // 30 seconds
      await this.alertService.sendAlert({
        type: "performance_degradation",
        sessionId,
        responseTime: metrics.response_time_ms,
        contextSize: metrics.context_tokens_used,
      });
    }
  }

  async generateContextReport(): Promise<ContextUsageReport> {
    const metrics = await this.database.getContextMetrics({
      timeRange: "24h",
      aggregation: "hourly",
    });

    return {
      average_context_usage: metrics.avgContextUsage,
      peak_usage_sessions: metrics.peakUsageSessions,
      cost_impact: metrics.extendedPricingPercentage,
      optimization_opportunities: metrics.optimizationSuggestions,
      performance_trends: metrics.performanceTrends,
    };
  }
}
```

## Implementation Checklist

### Phase 1: Core Implementation

- [ ] **AgentSession** enforces 1M context for all agents
- [ ] **ConversationManager** validates extended context configuration
- [ ] **Context optimization** without reducing window size
- [ ] **Cost tracking** with extended pricing awareness
- [ ] **Thinking block preservation** across iterations

### Phase 2: Advanced Features

- [ ] **Intelligent pruning** strategies for context management
- [ ] **Context caching** for performance optimization
- [ ] **Recursive agent** context inheritance
- [ ] **Real-time monitoring** of context usage
- [ ] **Cost prediction** for large context operations

### Phase 3: Production Optimization

- [ ] **Performance benchmarking** with 1M context
- [ ] **Cost optimization** strategies and recommendations
- [ ] **Context prefetching** and predictive loading
- [ ] **Comprehensive testing** of edge cases
- [ ] **Documentation** and developer guides

## Success Criteria

1. **Universal 1M Access**: 100% of agents use full 1M context window
2. **Performance**: Response times <30s even with large contexts
3. **Cost Efficiency**: Competitive pricing despite extended context usage
4. **Reliability**: <0.1% context-related failures
5. **Developer Experience**: Transparent context management without complexity

The 1M context window is keen's **fundamental competitive advantage** - enabling sophisticated reasoning and comprehensive understanding that competing platforms cannot match. Every implementation decision must preserve and optimize this capability while making it accessible and cost-effective for users.

import { EnvLoader } from "./EnvLoader";

export interface AnthropicConfig {
apiKey: string;
model: string;
maxTokens: number;
thinkingBudget: number;
maxRetries: number;
baseRetryDelay: number;
enableExtendedContext: boolean;
enableInterleaved: boolean;
enableWebSearch: boolean;
// NEW: Streaming configuration options
enableStreaming: boolean;
streamingBufferSize: number;
streamingTimeout: number;
showProgressIndicators: boolean;
typewriterEffect: boolean;
typewriterDelay: number;
}

export class AnthropicConfigManager {
private config: AnthropicConfig;

constructor(customConfig: Partial<AnthropicConfig> = {}) {
// Load environment variables
EnvLoader.load();

    // Build default configuration
    const defaultConfig: AnthropicConfig = {
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      model: "claude-sonnet-4-20250514",
      maxTokens: 16000,
      thinkingBudget: 10000,
      maxRetries: 3,
      baseRetryDelay: 1000,
      enableExtendedContext: false,
      enableInterleaved: true,
      enableWebSearch: true,
      // NEW: Default streaming settings
      enableStreaming: true,
      streamingBufferSize: 64, // Characters to buffer before flushing
      streamingTimeout: 3000000, // 3000 seconds
      showProgressIndicators: true,
      typewriterEffect: false, // Disabled by default for better UX
      typewriterDelay: 20, // ms between characters
    };

    // Merge with custom configuration
    this.config = { ...defaultConfig, ...customConfig };

    // Override streaming based on environment
    if (process.env.NODE_ENV === "test") {
      this.config.enableStreaming = false;
      this.config.showProgressIndicators = false;
    }

    // Disable streaming if not TTY
    if (!process.stdout.isTTY) {
      this.config.showProgressIndicators = false;
      this.config.typewriterEffect = false;
    }

    // Validate the configuration
    this.validateConfig();

}

private validateConfig(): void {
if (!this.config.apiKey && process.env.NODE_ENV !== "test") {
throw new Error(
"ANTHROPIC_API_KEY is required. Set it in your environment or .a2s2.env file."
);
}

    if (this.config.maxTokens < 1000 || this.config.maxTokens > 200000) {
      throw new Error("maxTokens must be between 1,000 and 200,000");
    }

    if (this.config.thinkingBudget < 0) {
      throw new Error("thinkingBudget must be non-negative");
    }

    if (this.config.thinkingBudget > this.config.maxTokens) {
      throw new Error(
        "thinkingBudget should be less than or equal to maxTokens"
      );
    }

    if (this.config.maxRetries < 0 || this.config.maxRetries > 10) {
      throw new Error("maxRetries must be between 0 and 10");
    }

    if (
      this.config.baseRetryDelay < 100 ||
      this.config.baseRetryDelay > 10000
    ) {
      throw new Error("baseRetryDelay must be between 100ms and 10,000ms");
    }

    // NEW: Validate streaming settings
    if (
      this.config.streamingBufferSize < 1 ||
      this.config.streamingBufferSize > 1000
    ) {
      throw new Error(
        "streamingBufferSize must be between 1 and 1000 characters"
      );
    }

    if (
      this.config.streamingTimeout < 1000 ||
      this.config.streamingTimeout > 3000000
    ) {
      throw new Error(
        "streamingTimeout must be between 1 second and 5 minutes"
      );
    }

    if (this.config.typewriterDelay < 1 || this.config.typewriterDelay > 1000) {
      throw new Error("typewriterDelay must be between 1ms and 1000ms");
    }

    if (
      !this.config.model.includes("claude") ||
      !this.config.model.includes("4")
    ) {
      console.warn(
        `Warning: Using non-Claude 4 model (${this.config.model}). a2s2 is optimized for Claude 4 Sonnet.`
      );
    }

}

getConfig(): AnthropicConfig {
return { ...this.config };
}

updateConfig(updates: Partial<AnthropicConfig>): void {
this.config = { ...this.config, ...updates };
this.validateConfig();
}

getRequestConfig() {
return {
model: this.config.model,
max_tokens: this.config.maxTokens,
thinking: {
type: "enabled" as const,
budget_tokens: this.config.thinkingBudget,
},
// NEW: Add streaming configuration
stream: this.config.enableStreaming,
};
}

getBetaHeaders(): string[] {
const headers: string[] = [];

    if (this.config.enableInterleaved) {
      headers.push("interleaved-thinking-2025-05-14");
    }

    if (this.config.enableExtendedContext) {
      headers.push("context-1m-2025-08-07");
    }

    return headers;

}

// NEW: Streaming configuration helpers
getStreamingConfig(): {
enabled: boolean;
bufferSize: number;
timeout: number;
showProgress: boolean;
typewriter: boolean;
typewriterDelay: number;
} {
return {
enabled: this.config.enableStreaming,
bufferSize: this.config.streamingBufferSize,
timeout: this.config.streamingTimeout,
showProgress: this.config.showProgressIndicators,
typewriter: this.config.typewriterEffect,
typewriterDelay: this.config.typewriterDelay,
};
}

shouldStream(): boolean {
return (
this.config.enableStreaming &&
process.env.NODE_ENV !== "test" &&
typeof process !== "undefined" &&
process.stdout &&
process.stdout.isTTY
);
}

shouldShowProgress(): boolean {
return (
this.config.showProgressIndicators &&
process.env.NODE_ENV !== "test" &&
typeof process !== "undefined" &&
process.stdout &&
process.stdout.isTTY
);
}

// Cost calculation helpers
getInputTokenCost(tokenCount: number): number {
const baseRate =
this.config.enableExtendedContext && tokenCount > 200000
? 0.000006 // $6/M for >200K tokens with extended context
: 0.000003; // $3/M for ≤200K tokens

    return tokenCount * baseRate;

}

getOutputTokenCost(tokenCount: number): number {
const baseRate =
this.config.enableExtendedContext && tokenCount > 200000
? 0.0000225 // $22.50/M for >200K tokens with extended context
: 0.000015; // $15/M for ≤200K tokens

    return tokenCount * baseRate;

}

getThinkingTokenCost(tokenCount: number): number {
// Thinking tokens are typically charged at the same rate as input tokens
return this.getInputTokenCost(tokenCount);
}

// Configuration validation utilities
static validateApiKey(apiKey: string): boolean {
return (
typeof apiKey === "string" &&
apiKey.startsWith("sk-ant-") &&
apiKey.length > 20
);
}

static getRecommendedConfig(): Partial<AnthropicConfig> {
return {
model: "claude-sonnet-4-20250514",
maxTokens: 16000,
thinkingBudget: 10000,
maxRetries: 3,
baseRetryDelay: 1000,
enableExtendedContext: false, // Expensive, enable only when needed
enableInterleaved: true, // Recommended for autonomous agents
enableWebSearch: true, // Useful for current information
enableStreaming: true, // Better user experience
showProgressIndicators: true, // Visual feedback
typewriterEffect: false, // Can be distracting for long responses
};
}

// Debug and status methods
getConfigSummary(): {
model: string;
maxTokens: number;
extendedContext: boolean;
interleaved: boolean;
webSearch: boolean;
streaming: boolean;
estimatedCostPer1KTokens: string;
} {
const inputCost = this.getInputTokenCost(1000);
const outputCost = this.getOutputTokenCost(1000);
const avgCost = (inputCost + outputCost) / 2;

    return {
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      extendedContext: this.config.enableExtendedContext,
      interleaved: this.config.enableInterleaved,
      webSearch: this.config.enableWebSearch,
      streaming: this.config.enableStreaming,
      estimatedCostPer1KTokens: `$${avgCost.toFixed(6)}`,
    };

}

isProductionReady(): boolean {
return (
this.config.apiKey !== "" &&
AnthropicConfigManager.validateApiKey(this.config.apiKey) &&
this.config.maxTokens >= 4000 &&
this.config.thinkingBudget >= 1000
);
}
}

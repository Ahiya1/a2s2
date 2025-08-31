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

**Based on a2s2 codebase analysis - CORRECT configuration:**

```typescript
// Core configuration that MUST be used by all agents
const KEEN_CLAUDE_CONFIG = {
  model: "claude-sonnet-4-20250514",
  max_tokens: 16000,
  thinking: {
    type: "enabled" as const,
    budget_tokens: 10000,
  },
  enableExtendedContext: true,       // CRITICAL: Enable 1M context
  
  // CRITICAL: Correct beta header from a2s2 codebase
  betas: ["context-1m-2025-08-07"], // NOT "extended-context-2024-10"
  
  // Performance optimizations
  enablePromptCaching: true,         // Cache repeated system prompts
  intelligentPruning: true,          // Smart context management
  thinkingPreservation: true,        // Preserve reasoning across iterations
  
  // Cost optimization (but never reduce context)
  costOptimizationLevel: "balanced", // balance | aggressive | conservative
  cachingStrategy: "aggressive",     // Cache everything possible
};
```

### AnthropicConfigManager Integration

**Study the a2s2 implementation at `/src/config/AnthropicConfig.ts`:**

```typescript
export class AnthropicConfigManager {
  constructor(customConfig: Partial<AnthropicConfig> = {}) {
    const defaultConfig: AnthropicConfig = {
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      model: "claude-sonnet-4-20250514",
      maxTokens: 16000,
      thinkingBudget: 10000,
      maxRetries: 3,
      baseRetryDelay: 1000,
      enableExtendedContext: false, // ⚠️ keen MUST override this to true
      enableInterleaved: true,
      enableWebSearch: true,
      enableStreaming: true,
    };
    
    // keen MUST override extended context
    this.config = { 
      ...defaultConfig, 
      ...customConfig,
      enableExtendedContext: true // FORCE enable for keen
    };
  }
  
  getBetaHeaders(): string[] {
    const headers: string[] = [];
    
    if (this.config.enableInterleaved) {
      headers.push("interleaved-thinking-2025-05-14");
    }
    
    if (this.config.enableExtendedContext) {
      headers.push("context-1m-2025-08-07"); // CORRECT header
    }
    
    return headers;
  }
}
```

### Context Window Utilization

```typescript
interface ContextUtilization {
  total_capacity: 1000000;           // 1M tokens total
  system_prompt: number;             // ~5,000-15,000 tokens
  project_analysis: number;          // ~50,000-100,000 tokens
  conversation_history: number;      // Variable, managed intelligently
  thinking_blocks: number;           // Preserved across iterations
  tool_responses: number;            // Recent tool execution results
  available_for_reasoning: number;   // Remaining space for complex reasoning
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
      enableExtendedContext: true,        // NEVER allow this to be false
      enableWebSearch: options.enableWebSearch !== false,
      enableStreaming: options.enableStreaming !== false,
      showProgressIndicators: options.showProgress !== false,
      // Cost optimization settings (never reduce context)
      enablePromptCaching: true,
      intelligentContextManagement: true,
      thinkingBlockPreservation: true
    });
    
    this.conversationManager = new ConversationManager(
      configManager.getConfig()
    );
    
    // Validate that 1M context is actually enabled
    this.validateContextConfiguration();
  }
  
  private validateContextConfiguration(): void {
    const config = this.conversationManager.getConfigManager().getConfig();
    
    if (!config.enableExtendedContext) {
      throw new Error(
        `CRITICAL: Extended context is disabled but keen requires 1M context window. ` +
        `This violates keen's core architecture principles.`
      );
    }
    
    const betaHeaders = this.conversationManager.getConfigManager().getBetaHeaders();
    if (!betaHeaders.includes("context-1m-2025-08-07")) {
      throw new Error(
        `CRITICAL: Missing required beta header 'context-1m-2025-08-07' for 1M context. ` +
        `Current headers: ${betaHeaders.join(", ")}`
      );
    }
    
    Logger.info("Context validation passed", {
      enableExtendedContext: config.enableExtendedContext,
      betaHeaders: betaHeaders,
      model: config.model
    });
  }
}
```

### ConversationManager Integration

```typescript
// Required: Enhanced ConversationManager for 1M context
export class ConversationManager {
  private configManager: AnthropicConfigManager;
  private contextOptimizer: ContextOptimizer;
  private costTracker: CostTracker;
  
  constructor(config: Partial<AnthropicConfig>) {
    this.configManager = new AnthropicConfigManager({
      ...config,
      enableExtendedContext: true // FORCE enable for keen
    });
    
    // Validate 1M context requirement
    if (!this.configManager.getConfig().enableExtendedContext) {
      throw new Error("keen requires 1M context window for all agents");
    }
    
    this.anthropic = new Anthropic({
      apiKey: this.configManager.getConfig().apiKey,
    });
    
    this.contextOptimizer = new ContextOptimizer(this.configManager.getConfig());
    this.costTracker = new CostTracker();
  }
  
  private async makeClaudeRequest(tools: Tool[], options: ConversationOptions): Promise<any> {
    const config = this.configManager.getRequestConfig();
    const messages = this.messageBuilder.getMessages();
    
    // Apply cost optimizations
    const optimizedMessages = options.enablePromptCaching
      ? this.costOptimizer.enablePromptCaching(messages)
      : messages;
    
    // Force extended context
    if (options.useExtendedContext !== false) {
      this.configManager.updateConfig({ enableExtendedContext: true });
    }
    
    const request = {
      model: config.model,
      max_tokens: config.max_tokens,
      thinking: config.thinking,
      
      // CRITICAL: Extended context configuration
      messages: this.contextOptimizer.optimizeForFullContext(
        optimizedMessages
      ),
      
      // CRITICAL: Correct beta headers from a2s2
      betas: this.configManager.getBetaHeaders(), // Includes 'context-1m-2025-08-07'
      
      tools: this.formatToolsForClaude(tools)
    };
    
    // Validate final configuration
    this.validateRequestConfig(request);
    return await this.anthropic.beta.messages.create(request);
  }
  
  private validateRequestConfig(config: any): void {
    if (!config.thinking || config.thinking.type !== 'enabled') {
      throw new Error("Thinking blocks must be enabled for keen agents");
    }
    
    if (!config.betas?.includes('context-1m-2025-08-07')) {
      throw new Error("Extended context beta 'context-1m-2025-08-07' must be enabled for keen agents");
    }
    
    const estimatedTokens = this.contextOptimizer.estimateTokenUsage(config.messages);
    if (estimatedTokens > 950000) { // Leave 50k buffer
      Logger.warn("Approaching context limit", {
        estimatedTokens,
        contextCapacity: 1000000,
        bufferRemaining: 1000000 - estimatedTokens
      });
    }
  }
}
```

### Context Optimization Strategies

```typescript
export class ContextOptimizer {
  private readonly MAX_CONTEXT = 1000000;
  private readonly SAFETY_BUFFER = 50000;  // Reserve 50k for response
  private readonly EFFECTIVE_LIMIT = this.MAX_CONTEXT - this.SAFETY_BUFFER;
  
  optimizeForFullContext(messages: ConversationMessage[]): ConversationMessage[] {
    const currentUsage = this.estimateTokenUsage(messages);
    
    if (currentUsage <= this.EFFECTIVE_LIMIT) {
      // No optimization needed
      return messages;
    }
    
    Logger.info("Context optimization required", {
      currentUsage,
      effectiveLimit: this.EFFECTIVE_LIMIT,
      overage: currentUsage - this.EFFECTIVE_LIMIT
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
      messagesRemoved: messages.length - optimized.length
    });
    
    return optimized;
  }
  
  private intelligentPruning(messages: ConversationMessage[]): ConversationMessage[] {
    const systemMessage = messages[0]; // NEVER remove system prompt
    let workingMessages = messages.slice(1);
    
    // Pruning strategies (in order of preference)
    const strategies = [
      () => this.removeOldestNonCriticalMessages(workingMessages),
      () => this.compressToolResults(workingMessages),
      () => this.summarizeOldConversations(workingMessages),
      () => this.removeRedundantThinkingBlocks(workingMessages)
    ];
    
    for (const strategy of strategies) {
      const currentUsage = this.estimateTokenUsage([systemMessage, ...workingMessages]);
      if (currentUsage <= this.EFFECTIVE_LIMIT) break;
      
      workingMessages = strategy();
    }
    
    return [systemMessage, ...workingMessages];
  }
  
  private removeOldestNonCriticalMessages(messages: ConversationMessage[]): ConversationMessage[] {
    // Keep recent messages and critical context markers
    const criticalPatterns = [
      /\[AGENT:.*\]/,      // Agent status messages
      /\[PHASE:.*\]/,      // Phase transition markers
      /\[CRITICAL.*\]/,    // Explicitly marked critical content
    ];
    
    const recent = messages.slice(-20); // Always keep last 20 messages
    const older = messages.slice(0, -20);
    
    const criticalOlder = older.filter(msg => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return criticalPatterns.some(pattern => pattern.test(content));
    });
    
    return [...criticalOlder, ...recent];
  }
  
  private preserveThinkingBlocks(messages: ConversationMessage[]): ConversationMessage[] {
    // CRITICAL: Preserve thinking blocks for reasoning continuity
    return messages.map(msg => {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        // Ensure thinking blocks are preserved
        const hasThinking = msg.content.some(block => block.type === 'thinking');
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

## Cost Management with 1M Context

### Pricing Awareness

**CORRECTED pricing based on a2s2 implementation:**

```typescript
interface ContextCostCalculation {
  context_size: number;
  pricing_tier: 'standard' | 'extended';  // >200K tokens = extended pricing
  input_cost_per_token: number;
  output_cost_per_token: number;
  thinking_cost_per_token: number;
  estimated_cost_per_request: number;
}

// Based on a2s2 AnthropicConfig.ts
const CLAUDE_PRICING_2024 = {
  standard: {  // ≤200K tokens
    input: 3.0 / 1_000_000,      // $3 per million input tokens
    output: 15.0 / 1_000_000,     // $15 per million output tokens
    thinking: 3.0 / 1_000_000     // Thinking tokens = input pricing
  },
  extended: {  // >200K tokens (1M context)
    input: 6.0 / 1_000_000,       // $6 per million input tokens  
    output: 22.5 / 1_000_000,     // $22.50 per million output tokens
    thinking: 6.0 / 1_000_000     // Thinking tokens = input pricing
  }
};

// keen Credit Pricing (5x markup from actual Claude costs)
const KEEN_CREDIT_PRICING = {
  claude_cost_multiplier: 5.0,  // 5x markup as specified
  
  calculateCreditCost(claudeCostInDollars: number): number {
    return claudeCostInDollars * this.claude_cost_multiplier;
  }
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
      toolResultSummarization: true,    // Summarize verbose tool outputs
      
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
    
    const claudeCost = {
      input_cost: tokenUsage.inputTokens * pricing.input,
      output_cost: tokenUsage.outputTokens * pricing.output,
      thinking_cost: (tokenUsage.thinkingTokens || 0) * pricing.thinking,
      total_claude_cost: 
        (tokenUsage.inputTokens * pricing.input) +
        (tokenUsage.outputTokens * pricing.output) +
        ((tokenUsage.thinkingTokens || 0) * pricing.thinking)
    };
    
    const creditCost = KEEN_CREDIT_PRICING.calculateCreditCost(claudeCost.total_claude_cost);
    
    return {
      pricing_tier: isExtendedPricing ? 'extended' : 'standard',
      claude_cost: claudeCost.total_claude_cost,
      credit_cost: creditCost,
      markup_multiplier: KEEN_CREDIT_PRICING.claude_cost_multiplier,
      
      // Cost optimization recommendations
      recommendations: this.generateCostRecommendations(tokenUsage, isExtendedPricing)
    };
  }
}
```

## Admin User Access

### Privileged Admin Account

**Special admin user for keen platform analytics and unlimited usage:**

```typescript
// Admin user configuration
const KEEN_ADMIN_USER = {
  email: 'ahiya.butman@gmail.com',
  password: '2con-creator',
  role: 'super_admin',
  permissions: {
    unlimited_credits: true,
    bypass_rate_limits: true,
    view_all_analytics: true,
    manage_users: true,
    system_monitoring: true
  },
  
  features: {
    cost_bypass: true,           // No credit deductions
    priority_execution: true,    // Queue priority
    advanced_analytics: true,    // Full system analytics
    user_impersonation: true,    // Debug user issues
    system_diagnostics: true     // Internal system metrics
  }
};

// Credit manager override for admin
export class CreditManager {
  async deductCredits(
    userId: string,
    amount: number,
    sessionId: string,
    description: string
  ): Promise<DatabaseOperationResult<CreditTransaction>> {
    
    // Check if user is admin
    if (userId === KEEN_ADMIN_USER.email || 
        await this.isAdminUser(userId)) {
      Logger.info("Credit deduction bypassed for admin user", {
        userId,
        amount,
        sessionId
      });
      
      // Return mock transaction for admin
      return {
        success: true,
        data: {
          id: 'admin_bypass',
          amount: 0, // No actual deduction
          description: `Admin bypass: ${description}`,
          created_at: new Date()
        }
      };
    }
    
    // Normal credit deduction for regular users
    return this.dbManager.executeUserTransaction(userId, async (connection) => {
      // ... existing credit deduction logic
    });
  }
}
```

## Testing and Validation

### Context Window Tests

```typescript
describe('1M Context Window Validation', () => {
  test('All agents must use 1M context window with correct beta headers', async () => {
    const agentSession = new AgentSession({
      vision: 'Test vision for context validation',
    });
    
    const configManager = agentSession.getConversationManager().getConfigManager();
    const config = configManager.getConfig();
    const betaHeaders = configManager.getBetaHeaders();
    
    expect(config.enableExtendedContext).toBe(true);
    expect(betaHeaders).toContain('context-1m-2025-08-07');
    expect(config.model).toBe('claude-sonnet-4-20250514');
  });
  
  test('Context optimization preserves critical content', async () => {
    const largeContext = generateLargeContext(1_100_000); // Over limit
    const optimizer = new ContextOptimizer();
    
    const optimized = optimizer.optimizeForFullContext(largeContext);
    
    // Should be within limit
    const tokenCount = optimizer.estimateTokenUsage(optimized);
    expect(tokenCount).toBeLessThanOrEqual(950_000); // With safety buffer
    
    // Should preserve system prompt
    expect(optimized[0].role).toBe('user'); // System prompt
    expect(optimized[0].content).toContain('TASK:'); // System prompt content
  });
  
  test('Admin user bypasses all credit checks', async () => {
    const creditManager = new CreditManager(dbManager);
    
    const result = await creditManager.deductCredits(
      'ahiya.butman@gmail.com',
      100.0,
      'test_session',
      'Admin test execution'
    );
    
    expect(result.success).toBe(true);
    expect(result.data.amount).toBe(0); // No deduction for admin
    expect(result.data.id).toBe('admin_bypass');
  });
});
```

## Implementation Checklist

### Phase 1: Core Implementation
- [ ] **AnthropicConfigManager** enforces 1M context with correct beta headers
- [ ] **ConversationManager** validates 'context-1m-2025-08-07' header
- [ ] **Context optimization** without reducing window size
- [ ] **Cost tracking** with 5x markup for credits
- [ ] **Admin user** bypass implementation

### Phase 2: Advanced Features  
- [ ] **Intelligent pruning** strategies for context management
- [ ] **Context caching** for performance optimization
- [ ] **Recursive agent** context inheritance
- [ ] **Real-time monitoring** of context usage
- [ ] **Cost prediction** for large context operations with credit conversion

### Phase 3: Production Optimization
- [ ] **Performance benchmarking** with 1M context
- [ ] **Credit optimization** strategies and recommendations
- [ ] **Context prefetching** and predictive loading
- [ ] **Admin analytics** dashboard
- [ ] **Comprehensive testing** of edge cases

## Success Criteria

1. **Universal 1M Access**: 100% of agents use full 1M context window with correct beta headers
2. **Performance**: Response times <30s even with large contexts
3. **Cost Efficiency**: Transparent 5x markup pricing with credit system
4. **Reliability**: <0.1% context-related failures
5. **Admin Access**: Unlimited usage for ahiya.butman@gmail.com with full analytics
6. **Developer Experience**: Transparent context management without complexity

The 1M context window is keen's **fundamental competitive advantage** - enabling sophisticated reasoning and comprehensive understanding that competing platforms cannot match. Every implementation decision must preserve and optimize this capability while making it accessible and cost-effective for users, with special provisions for administrative access and analytics.
import { Logger } from "../logging/Logger";
import { ConversationMessage } from "./MessageBuilder";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export interface CostCalculation {
  inputCost: number;
  outputCost: number;
  thinkingCost: number;
  totalCost: number;
  tokenCounts: TokenUsage;
  pricingTier: "standard" | "extended";
}

export interface OptimizationSuggestions {
  enablePromptCaching: boolean;
  reduceThinkingBudget: boolean;
  pruneContext: boolean;
  useStandardContext: boolean;
  suggestions: string[];
}

export class CostOptimizer {
  private static readonly PRICING = {
    standard: {
      input: 3.0 / 1_000_000, // $3 per million tokens (≤200K context)
      output: 15.0 / 1_000_000, // $15 per million tokens
      thinking: 15.0 / 1_000_000, // Thinking tokens counted as output
    },
    extended: {
      input: 6.0 / 1_000_000, // $6 per million tokens (>200K context)
      output: 22.5 / 1_000_000, // $22.50 per million tokens
      thinking: 22.5 / 1_000_000, // Thinking tokens counted as output
    },
  };

  private totalCostTracking: number = 0;
  private sessionStartTime: Date = new Date();

  constructor(private dailyBudget: number = 50.0) {} // Default $50 daily budget

  calculateCost(usage: TokenUsage, contextSize: number): CostCalculation {
    const pricingTier: "standard" | "extended" =
      contextSize > 200_000 ? "extended" : "standard";
    const pricing = CostOptimizer.PRICING[pricingTier];

    const inputCost = usage.inputTokens * pricing.input;
    const outputCost = usage.outputTokens * pricing.output;
    const thinkingCost = (usage.thinkingTokens || 0) * pricing.thinking;
    const totalCost = inputCost + outputCost + thinkingCost;

    const calculation: CostCalculation = {
      inputCost,
      outputCost,
      thinkingCost,
      totalCost,
      tokenCounts: usage,
      pricingTier,
    };

    this.totalCostTracking += totalCost;

    Logger.debug("Cost calculated", {
      pricingTier,
      totalCost: totalCost.toFixed(4),
      sessionTotal: this.totalCostTracking.toFixed(4),
    });

    return calculation;
  }

  optimizeContextForCost(
    messages: ConversationMessage[],
    targetMaxTokens: number = 180_000
  ): {
    optimizedMessages: ConversationMessage[];
    tokensSaved: number;
    costSavings: number;
  } {
    const originalTokens = this.estimateTokenCount(messages);

    if (originalTokens <= targetMaxTokens) {
      return {
        optimizedMessages: messages,
        tokensSaved: 0,
        costSavings: 0,
      };
    }

    // Keep system prompt (first message) and recent messages
    const systemPrompt = messages[0];
    const recentMessages = messages.slice(-8); // Keep last 8 messages
    const optimizedMessages = systemPrompt
      ? [systemPrompt, ...recentMessages]
      : recentMessages;

    const newTokens = this.estimateTokenCount(optimizedMessages);
    const tokensSaved = originalTokens - newTokens;
    const costSavings = this.calculateTokenCostSavings(
      tokensSaved,
      originalTokens
    );

    Logger.info("Context optimized for cost", {
      originalTokens,
      newTokens,
      tokensSaved,
      costSavings: costSavings.toFixed(4),
      messagesRemoved: messages.length - optimizedMessages.length,
    });

    return {
      optimizedMessages,
      tokensSaved,
      costSavings,
    };
  }

  enablePromptCaching(messages: ConversationMessage[]): ConversationMessage[] {
    if (messages.length === 0) return messages;

    // Add cache control to the first message (system prompt)
    const cachedMessages = [...messages];
    const systemMessage = cachedMessages[0];

    if (systemMessage && systemMessage.role === "user") {
      // Add cache control to system prompt
      if (typeof systemMessage.content === "string") {
        systemMessage.content = [
          {
            type: "text",
            text: systemMessage.content,
            cache_control: { type: "ephemeral" },
          },
        ];
      } else if (Array.isArray(systemMessage.content)) {
        // Add cache control to first text block
        const firstTextBlock = systemMessage.content.find(
          (block) => block.type === "text" || block.text
        );
        if (firstTextBlock) {
          (firstTextBlock as any).cache_control = { type: "ephemeral" };
        }
      }
    }

    Logger.debug("Prompt caching enabled for system message");
    return cachedMessages;
  }

  analyzeOptimizationOpportunities(
    messages: ConversationMessage[],
    averageSessionCost: number,
    contextSize: number
  ): OptimizationSuggestions {
    const suggestions: string[] = [];
    const tokenCount = this.estimateTokenCount(messages);

    const optimizationSuggestions: OptimizationSuggestions = {
      enablePromptCaching: false,
      reduceThinkingBudget: false,
      pruneContext: false,
      useStandardContext: false,
      suggestions,
    };

    // Suggest prompt caching for repeated content
    if (messages.length > 5 && !this.hasPromptCaching(messages[0])) {
      optimizationSuggestions.enablePromptCaching = true;
      suggestions.push(
        "Enable prompt caching for the system prompt to save up to 90% on repeated tokens"
      );
    }

    // Suggest context pruning for large conversations
    if (tokenCount > 150_000) {
      optimizationSuggestions.pruneContext = true;
      suggestions.push(
        `Context is large (${tokenCount} tokens). Consider pruning to reduce costs`
      );
    }

    // Suggest staying in standard pricing tier
    if (contextSize > 200_000) {
      optimizationSuggestions.useStandardContext = true;
      suggestions.push(
        "Using extended context window (>200K tokens) doubles input costs. Consider staying under 200K tokens when possible"
      );
    }

    // Suggest thinking budget optimization
    if (averageSessionCost > this.dailyBudget * 0.1) {
      // >10% of daily budget per session
      optimizationSuggestions.reduceThinkingBudget = true;
      suggestions.push(
        "Consider reducing thinking token budget for simple tasks to lower costs"
      );
    }

    // Budget warnings
    if (this.totalCostTracking > this.dailyBudget * 0.8) {
      suggestions.push(
        `⚠️  Approaching daily budget limit ($${this.totalCostTracking.toFixed(2)}/$${this.dailyBudget})`
      );
    }

    Logger.info("Optimization opportunities analyzed", {
      tokenCount,
      contextSize,
      sessionCost: this.totalCostTracking.toFixed(4),
      suggestionCount: suggestions.length,
    });

    return optimizationSuggestions;
  }

  trackSessionCosts(): {
    totalCost: number;
    averageCostPerMessage: number;
    sessionDuration: number;
    isOverBudget: boolean;
  } {
    const sessionDuration = Date.now() - this.sessionStartTime.getTime();
    const messageCount = 10; // Rough estimate - would track actual message count

    return {
      totalCost: this.totalCostTracking,
      averageCostPerMessage: this.totalCostTracking / Math.max(messageCount, 1),
      sessionDuration: sessionDuration / 1000, // seconds
      isOverBudget: this.totalCostTracking > this.dailyBudget,
    };
  }

  private estimateTokenCount(messages: ConversationMessage[]): number {
    let totalTokens = 0;

    for (const message of messages) {
      if (typeof message.content === "string") {
        totalTokens += this.estimateTokensInText(message.content);
      } else if (Array.isArray(message.content)) {
        for (const content of message.content) {
          if (content.text) {
            totalTokens += this.estimateTokensInText(content.text);
          }
          if (content.content) {
            totalTokens += this.estimateTokensInText(content.content);
          }
        }
      }

      if (message.thinking_content) {
        totalTokens += this.estimateTokensInText(message.thinking_content);
      }
    }

    return totalTokens;
  }

  private estimateTokensInText(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  private calculateTokenCostSavings(
    tokensSaved: number,
    originalTokens: number
  ): number {
    // Estimate cost savings based on standard pricing
    const pricingTier = originalTokens > 200_000 ? "extended" : "standard";
    const pricing = CostOptimizer.PRICING[pricingTier];

    // Assume 50/50 split between input and output tokens for estimation
    const avgCostPerToken = (pricing.input + pricing.output) / 2;
    return tokensSaved * avgCostPerToken;
  }

  private hasPromptCaching(message: ConversationMessage): boolean {
    if (!message || typeof message.content !== "object") return false;
    if (!Array.isArray(message.content)) return false;

    return message.content.some(
      (content: any) =>
        content.cache_control && content.cache_control.type === "ephemeral"
    );
  }

  // Static utility methods
  static calculateRequestCost(
    inputTokens: number,
    outputTokens: number,
    contextSize: number
  ): number {
    const pricingTier = contextSize > 200_000 ? "extended" : "standard";
    const pricing = CostOptimizer.PRICING[pricingTier];

    return inputTokens * pricing.input + outputTokens * pricing.output;
  }

  static formatCost(cost: number): string {
    if (cost < 0.01) {
      return `$${(cost * 1000).toFixed(2)}m`; // Show in thousandths
    }
    return `$${cost.toFixed(4)}`;
  }

  static getBudgetRecommendations(
    projectType: "simple" | "medium" | "complex"
  ): {
    dailyBudget: number;
    sessionBudget: number;
    description: string;
  } {
    const budgets = {
      simple: {
        dailyBudget: 20,
        sessionBudget: 2,
        description: "Basic tasks like README creation, config updates",
      },
      medium: {
        dailyBudget: 100,
        sessionBudget: 10,
        description: "Multi-file changes, moderate complexity projects",
      },
      complex: {
        dailyBudget: 300,
        sessionBudget: 30,
        description:
          "Large codebases, architectural changes, research-heavy tasks",
      },
    };

    return budgets[projectType];
  }
}

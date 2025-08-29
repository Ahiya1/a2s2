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

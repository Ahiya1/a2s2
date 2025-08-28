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
}

export const DEFAULT_ANTHROPIC_CONFIG: AnthropicConfig = {
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  model: "claude-sonnet-4-20250514",
  maxTokens: 16000,
  thinkingBudget: 10000,
  maxRetries: 5,
  baseRetryDelay: 1000,
  enableExtendedContext: false, // 1M context window - requires tier 4+
  enableInterleaved: true, // Interleaved thinking beta
  enableWebSearch: true, // Native web search integration
};

export class AnthropicConfigManager {
  private config: AnthropicConfig;

  constructor(config?: Partial<AnthropicConfig>) {
    this.config = { ...DEFAULT_ANTHROPIC_CONFIG, ...config };
    this.validateConfig();
  }

  getConfig(): AnthropicConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AnthropicConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfig();
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

  getRequestConfig() {
    return {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      thinking: {
        type: "enabled" as const,
        budget_tokens: this.config.thinkingBudget,
      },
      betas: this.getBetaHeaders(),
    };
  }

  private validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    if (!this.config.apiKey.startsWith("sk-ant-")) {
      throw new Error("Invalid Anthropic API key format");
    }

    if (this.config.maxTokens <= 0) {
      throw new Error("maxTokens must be positive");
    }

    if (this.config.thinkingBudget <= 0) {
      throw new Error("thinkingBudget must be positive");
    }

    // FIXED: Changed >= to > to match error message "less than or equal to"
    if (this.config.thinkingBudget > this.config.maxTokens) {
      throw new Error(
        "thinkingBudget should be less than or equal to maxTokens"
      );
    }
  }
}

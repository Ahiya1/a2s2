import Anthropic from "@anthropic-ai/sdk";
import { Tool } from "../ToolManager";
import { ParameterParser } from "../enhanced/ParameterParser";
import { StreamingProgress } from "../../conversation/StreamingManager";
import { Logger } from "../../logging/Logger";
import { z } from "zod";

// NEW: Progress indicator utilities
const ora = require("ora");

export interface WebSearchResult {
  query: string;
  results: string;
  searchTime: number;
  tokensUsed: number;
  sources: string[];
  // NEW: Streaming-related fields
  wasStreamed?: boolean;
  streamingEvents?: number;
}

export interface SearchOptions {
  query: string;
  domains?: string[];
  recentOnly?: boolean;
  focus?:
    | "documentation"
    | "best-practices"
    | "current-info"
    | "troubleshooting"
    | "general";
  maxResults?: number;
  // NEW: Streaming options
  enableStreaming?: boolean;
  showProgress?: boolean;
  onProgress?: (progress: SearchProgress) => void;
}

// NEW: Search progress interface
export interface SearchProgress {
  phase:
    | "initializing"
    | "searching"
    | "analyzing"
    | "summarizing"
    | "complete";
  message: string;
  percentage?: number;
  sources?: number;
  tokensUsed?: number;
}

const WebSearchSchema = z.object({
  query: z.string().min(1, "Search query cannot be empty"),
  domains: z.array(z.string()).optional(),
  recentOnly: z.boolean().optional().default(false),
  focus: z
    .enum([
      "documentation",
      "best-practices",
      "current-info",
      "troubleshooting",
      "general",
    ])
    .optional()
    .default("general"),
  maxResults: z.number().min(1).max(20).optional().default(10),
  enableStreaming: z.boolean().optional().default(true),
  showProgress: z.boolean().optional().default(true),
});

export class WebSearchTool implements Tool {
  name = "web_search";
  description =
    "Search the web for current information, documentation, best practices, and troubleshooting guidance with real-time streaming";

  schema = {
    type: "object" as const,
    properties: {
      query: {
        type: "string" as const,
        description: "The search query - be specific and use relevant keywords",
      },
      domains: {
        type: "array" as const,
        items: { type: "string" as const },
        description:
          "Optional: specific domains to search (e.g., ['github.com', 'stackoverflow.com'])",
      },
      recentOnly: {
        type: "boolean" as const,
        description: "Whether to focus on recent information (last 30 days)",
      },
      focus: {
        type: "string" as const,
        enum: [
          "documentation",
          "best-practices",
          "current-info",
          "troubleshooting",
          "general",
        ],
        description: "Focus area for the search to get more relevant results",
      },
      maxResults: {
        type: "number" as const,
        minimum: 1,
        maximum: 20,
        description: "Maximum number of search results to analyze",
      },
      enableStreaming: {
        type: "boolean" as const,
        description: "Enable streaming progress updates",
      },
      showProgress: {
        type: "boolean" as const,
        description: "Show visual progress indicators",
      },
    },
    required: ["query"],
  };

  private anthropic: Anthropic;
  private searchHistory: WebSearchResult[] = [];
  private costTracker = { totalSearches: 0, estimatedCost: 0 };

  // NEW: Streaming state
  private currentSpinner?: any;
  private searchInProgress: boolean = false;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  async execute(params: unknown): Promise<string> {
    const startTime = Date.now();

    const parseResult = ParameterParser.parseObject(params, WebSearchSchema);

    if (!parseResult.success) {
      const errorMsg = `Invalid web search parameters: ${parseResult.error}`;
      Logger.error(errorMsg, { originalParams: params });
      throw new Error(errorMsg);
    }

    const searchOptions: SearchOptions = parseResult.data as SearchOptions;

    Logger.info("Executing web search", {
      query: searchOptions.query,
      focus: searchOptions.focus,
      recentOnly: searchOptions.recentOnly,
      domainCount: searchOptions.domains?.length || 0,
      streamingEnabled: searchOptions.enableStreaming,
    });

    try {
      // NEW: Streaming search execution
      if (searchOptions.enableStreaming !== false && process.stdout.isTTY) {
        return await this.executeStreamingSearch(searchOptions, startTime);
      } else {
        return await this.executeBatchSearch(searchOptions, startTime);
      }
    } catch (error) {
      this.hideProgress();
      Logger.error("Web search failed", {
        query: searchOptions.query,
        error: (error as Error).message,
      });

      return `Web search failed: ${(error as Error).message}. Please try rephrasing your query or check your internet connection.`;
    }
  }

  // NEW: Streaming search implementation
  private async executeStreamingSearch(
    searchOptions: SearchOptions,
    startTime: number
  ): Promise<string> {
    this.searchInProgress = true;
    let streamingEvents = 0;

    try {
      // Phase 1: Initialize search
      this.showSearchProgress("initializing", "Preparing web search...", 0);
      await this.delay(300); // Brief delay for UX

      // Phase 2: Execute search
      this.showSearchProgress("searching", "Searching the web...", 25);

      const searchPrompt = this.buildSearchPrompt(searchOptions);

      // Create streaming request
      const stream = this.anthropic.beta.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        tools: [
          {
            name: "web_search",
            description: "Search the web for information",
            input_schema: {
              type: "object",
              properties: {
                query: { type: "string" },
              },
              required: ["query"],
            },
          },
        ],
        messages: [
          {
            role: "user",
            content: searchPrompt,
          },
        ],
      });

      // Phase 3: Process streaming results
      this.showSearchProgress("analyzing", "Analyzing search results...", 50);

      let searchResults = "";
      let tokensUsed = 0;

      // Handle streaming events
      stream.on("text", (text) => {
        streamingEvents++;
        searchResults += text;

        // Update progress periodically
        if (streamingEvents % 10 === 0) {
          const progress = Math.min(75, 50 + streamingEvents / 2);
          this.showSearchProgress(
            "analyzing",
            "Processing results...",
            progress
          );
        }
      });

      stream.on("contentBlockDelta", () => {
        streamingEvents++;
      });

      stream.on("messageDelta", (data) => {
        if (data.usage) {
          tokensUsed =
            (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
        }
      });

      // Phase 4: Finalize
      this.showSearchProgress("summarizing", "Finalizing results...", 85);

      const finalMessage = await stream.finalMessage();

      if (finalMessage.usage) {
        tokensUsed =
          finalMessage.usage.input_tokens + finalMessage.usage.output_tokens;
      }

      if (!searchResults) {
        searchResults = this.extractSearchResults(finalMessage);
      }

      // Phase 5: Complete
      this.showSearchProgress("complete", "Search completed!", 100);
      await this.delay(500); // Brief delay to show completion
      this.hideProgress();

      // Track costs and usage
      this.updateCostTracking(tokensUsed);

      // Record search in history
      const searchResult: WebSearchResult = {
        query: searchOptions.query,
        results: searchResults,
        searchTime: Date.now() - startTime,
        tokensUsed,
        sources: this.extractSources(searchResults),
        wasStreamed: true,
        streamingEvents,
      };

      this.searchHistory.push(searchResult);

      Logger.info("Streaming web search completed", {
        query: searchOptions.query,
        searchTime: `${searchResult.searchTime}ms`,
        tokensUsed,
        resultLength: searchResults.length,
        sourceCount: searchResult.sources.length,
        streamingEvents,
      });

      return this.formatSearchResults(searchResult, searchOptions);
    } finally {
      this.searchInProgress = false;
      this.hideProgress();
    }
  }

  // EXISTING: Batch search (fallback)
  private async executeBatchSearch(
    searchOptions: SearchOptions,
    startTime: number
  ): Promise<string> {
    const searchPrompt = this.buildSearchPrompt(searchOptions);

    const response = await this.anthropic.beta.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      tools: [
        {
          name: "web_search",
          description: "Search the web for information",
          input_schema: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
            required: ["query"],
          },
        },
      ],
      messages: [
        {
          role: "user",
          content: searchPrompt,
        },
      ],
    });

    const searchResults = this.extractSearchResults(response);
    const tokensUsed =
      response.usage?.input_tokens + response.usage?.output_tokens || 0;

    this.updateCostTracking(tokensUsed);

    const searchResult: WebSearchResult = {
      query: searchOptions.query,
      results: searchResults,
      searchTime: Date.now() - startTime,
      tokensUsed,
      sources: this.extractSources(searchResults),
      wasStreamed: false,
    };

    this.searchHistory.push(searchResult);

    Logger.info("Batch web search completed", {
      query: searchOptions.query,
      searchTime: `${searchResult.searchTime}ms`,
      tokensUsed,
      resultLength: searchResults.length,
      sourceCount: searchResult.sources.length,
    });

    return this.formatSearchResults(searchResult, searchOptions);
  }

  // NEW: Visual progress indicators
  private showSearchProgress(
    phase: SearchProgress["phase"],
    message: string,
    percentage?: number
  ): void {
    if (!process.stdout.isTTY) return;

    this.hideProgress();

    const phaseEmojis = {
      initializing: "⚡",
      searching: "🔍",
      analyzing: "📊",
      summarizing: "📝",
      complete: "✅",
    };

    const fullMessage =
      percentage !== undefined
        ? `${phaseEmojis[phase]} ${message} (${percentage}%)`
        : `${phaseEmojis[phase]} ${message}`;

    try {
      this.currentSpinner = ora({
        text: fullMessage,
        spinner: "dots",
        color: "blue",
      }).start();
    } catch (error) {
      // Fallback if ora is not available
      console.log(`\r${fullMessage}`);
    }
  }

  private hideProgress(): void {
    if (this.currentSpinner) {
      try {
        this.currentSpinner.stop();
        this.currentSpinner = undefined;
      } catch (error) {
        // Ignore errors when stopping spinner
      }
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildSearchPrompt(options: SearchOptions): string {
    const baseParts = [`Search the web for: ${options.query}`];

    switch (options.focus) {
      case "documentation":
        baseParts.push(
          "Focus on official documentation, API references, and technical guides."
        );
        break;
      case "best-practices":
        baseParts.push(
          "Focus on best practices, coding standards, and recommended approaches from authoritative sources."
        );
        break;
      case "current-info":
        baseParts.push(
          "Focus on the most recent information, updates, and current status."
        );
        break;
      case "troubleshooting":
        baseParts.push(
          "Focus on troubleshooting guides, error solutions, and debugging information."
        );
        break;
      case "general":
      default:
        baseParts.push(
          "Provide comprehensive information relevant to the query."
        );
        break;
    }

    if (options.domains && options.domains.length > 0) {
      baseParts.push(
        `Only search these domains: ${options.domains.join(", ")}`
      );
    }

    if (options.recentOnly) {
      baseParts.push(
        "Focus on recent information from the last 30 days when possible."
      );
    }

    baseParts.push(`
Please provide:
1. A comprehensive summary of the findings
2. Key insights relevant to software development
3. Specific recommendations or actionable information
4. Citations to sources where possible
5. Any important caveats or limitations

Format the response in a clear, structured manner that would be helpful for an autonomous software development agent.`);

    return baseParts.join("\n\n");
  }

  private extractSearchResults(response: any): string {
    if (response.content && Array.isArray(response.content)) {
      const textContent = response.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("\n");

      return textContent;
    }

    return response.content || "No search results available";
  }

  private extractSources(searchResults: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = searchResults.match(urlRegex) || [];

    const sourcePatterns = [
      /github\.com\/[^\s]+/gi,
      /stackoverflow\.com\/[^\s]+/gi,
      /docs\.[^\s]+/gi,
      /[a-zA-Z0-9-]+\.org\/[^\s]*/gi,
    ];

    const sources = new Set([...urls]);

    sourcePatterns.forEach((pattern) => {
      const matches = searchResults.match(pattern) || [];
      matches.forEach((match) => sources.add(match));
    });

    return Array.from(sources).slice(0, 10);
  }

  private formatSearchResults(
    result: WebSearchResult,
    options: SearchOptions
  ): string {
    const lines = [
      `🌐 WEB SEARCH RESULTS`,
      ``,
      `Query: "${result.query}"`,
      `Focus: ${options.focus}`,
      `Search time: ${result.searchTime}ms`,
    ];

    // NEW: Add streaming information
    if (result.wasStreamed) {
      lines.push(`Streaming events: ${result.streamingEvents || 0}`);
    }

    lines.push(``, `📋 FINDINGS:`, ``, result.results);

    if (result.sources.length > 0) {
      lines.push(``);
      lines.push(`🔗 SOURCES:`);
      result.sources.forEach((source) => lines.push(`• ${source}`));
    }

    return lines.join("\n");
  }

  private updateCostTracking(tokensUsed: number): void {
    this.costTracker.totalSearches++;
    const searchCost = 10 / 1000; // $10 per 1,000 searches
    const tokenCost = tokensUsed * (6 / 1_000_000); // Extended pricing for search
    this.costTracker.estimatedCost += searchCost + tokenCost;
  }

  // Public utility methods
  getSearchHistory(): ReadonlyArray<WebSearchResult> {
    return [...this.searchHistory];
  }

  getSearchStats(): {
    totalSearches: number;
    averageSearchTime: number;
    totalTokensUsed: number;
    estimatedCost: number;
    mostCommonQueries: string[];
    streamedSearches: number;
  } {
    if (this.searchHistory.length === 0) {
      return {
        totalSearches: 0,
        averageSearchTime: 0,
        totalTokensUsed: 0,
        estimatedCost: 0,
        mostCommonQueries: [],
        streamedSearches: 0,
      };
    }

    const totalSearchTime = this.searchHistory.reduce(
      (sum, result) => sum + result.searchTime,
      0
    );
    const totalTokensUsed = this.searchHistory.reduce(
      (sum, result) => sum + result.tokensUsed,
      0
    );
    const streamedSearches = this.searchHistory.filter(
      (r) => r.wasStreamed
    ).length;

    const queryWords: Record<string, number> = {};
    this.searchHistory.forEach((result) => {
      const words = result.query
        .toLowerCase()
        .split(" ")
        .filter((word) => word.length > 3);
      words.forEach((word) => {
        queryWords[word] = (queryWords[word] || 0) + 1;
      });
    });

    const mostCommonQueries = Object.entries(queryWords)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);

    return {
      totalSearches: this.searchHistory.length,
      averageSearchTime: totalSearchTime / this.searchHistory.length,
      totalTokensUsed,
      estimatedCost: this.costTracker.estimatedCost,
      mostCommonQueries,
      streamedSearches,
    };
  }

  clearHistory(): void {
    const previousCount = this.searchHistory.length;
    this.searchHistory = [];
    this.costTracker = { totalSearches: 0, estimatedCost: 0 };

    Logger.info("Web search history cleared", { previousCount });
  }

  // NEW: Streaming utilities
  isSearching(): boolean {
    return this.searchInProgress;
  }

  stopSearch(): void {
    if (this.searchInProgress) {
      this.hideProgress();
      this.searchInProgress = false;
      Logger.info("Web search stopped by user");
    }
  }

  // Static utility methods
  static buildCommonQueries(language: string, task: string): string[] {
    const baseQueries = [
      `${language} best practices`,
      `${language} ${task} tutorial`,
      `${task} ${language} examples`,
      `${language} troubleshooting ${task}`,
    ];

    return baseQueries;
  }

  static validateSearchQuery(query: string): {
    isValid: boolean;
    suggestions: string[];
  } {
    const suggestions: string[] = [];

    if (!query || query.trim().length === 0) {
      return { isValid: false, suggestions: ["Query cannot be empty"] };
    }

    if (query.length < 3) {
      suggestions.push(
        "Query is very short - consider adding more specific terms"
      );
    }

    if (query.length > 200) {
      suggestions.push(
        "Query is very long - consider breaking it into smaller, more focused searches"
      );
    }

    if (!/[a-zA-Z]/.test(query)) {
      suggestions.push("Query should contain some alphabetic characters");
    }

    return {
      isValid: suggestions.length === 0,
      suggestions,
    };
  }

  static extractTechnicalTerms(searchResults: string): string[] {
    const technicalPatterns = [
      /\b[A-Z][a-zA-Z]*(?:\.[a-zA-Z]+)+\b/g, // Package names like React.Component
      /\b[a-z]+(?:-[a-z]+)*\b/g, // Kebab-case terms
      /\b[A-Z]{2,}\b/g, // Acronyms
      /\bv?\d+\.\d+(?:\.\d+)?\b/g, // Version numbers
    ];

    const terms = new Set<string>();

    technicalPatterns.forEach((pattern) => {
      const matches = searchResults.match(pattern) || [];
      matches.forEach((match) => {
        if (match.length > 2 && match.length < 30) {
          terms.add(match);
        }
      });
    });

    return Array.from(terms).slice(0, 20);
  }
}

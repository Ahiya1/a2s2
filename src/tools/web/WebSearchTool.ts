import Anthropic from "@anthropic-ai/sdk";
import { Tool } from "../ToolManager";
import { ParameterParser } from "../enhanced/ParameterParser";
import { Logger } from "../../logging/Logger";
import { z } from "zod";

export interface WebSearchResult {
  query: string;
  results: string;
  searchTime: number;
  tokensUsed: number;
  sources: string[];
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
});

export class WebSearchTool implements Tool {
  name = "web_search";
  description =
    "Search the web for current information, documentation, best practices, and troubleshooting guidance";

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
    },
    required: ["query"],
  };

  private anthropic: Anthropic;
  private searchHistory: WebSearchResult[] = [];
  private costTracker = { totalSearches: 0, estimatedCost: 0 };

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  async execute(params: unknown): Promise<string> {
    const startTime = Date.now();

    // Parse parameters
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
    });

    try {
      // Build focused search prompt based on the focus area
      const searchPrompt = this.buildSearchPrompt(searchOptions);

      // Execute search using Anthropic's native web search
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

      // Extract search results from response
      const searchResults = this.extractSearchResults(response);

      // Track costs and usage
      const tokensUsed =
        response.usage?.input_tokens + response.usage?.output_tokens || 0;
      this.updateCostTracking(tokensUsed);

      // Record search in history
      const searchResult: WebSearchResult = {
        query: searchOptions.query,
        results: searchResults,
        searchTime: Date.now() - startTime,
        tokensUsed,
        sources: this.extractSources(searchResults),
      };

      this.searchHistory.push(searchResult);

      Logger.info("Web search completed", {
        query: searchOptions.query,
        searchTime: `${searchResult.searchTime}ms`,
        tokensUsed,
        resultLength: searchResults.length,
        sourceCount: searchResult.sources.length,
      });

      return this.formatSearchResults(searchResult, searchOptions);
    } catch (error) {
      Logger.error("Web search failed", {
        query: searchOptions.query,
        error: (error as Error).message,
      });

      return `Web search failed: ${(error as Error).message}. Please try rephrasing your query or check your internet connection.`;
    }
  }

  private buildSearchPrompt(options: SearchOptions): string {
    const baseParts = [`Search the web for: ${options.query}`];

    // Add focus-specific instructions
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

    // Add domain restrictions
    if (options.domains && options.domains.length > 0) {
      baseParts.push(
        `Only search these domains: ${options.domains.join(", ")}`
      );
    }

    // Add recency preference
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
    // Extract the actual search results from Claude's response
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
    // Extract URLs and source names from the search results
    // This is a simplified implementation - could be enhanced with better parsing
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = searchResults.match(urlRegex) || [];

    // Also look for common source patterns
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

    return Array.from(sources).slice(0, 10); // Limit to 10 sources
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
      ``,
      `📋 FINDINGS:`,
      ``,
      result.results,
    ];

    if (result.sources.length > 0) {
      lines.push(``);
      lines.push(`🔗 SOURCES:`);
      result.sources.forEach((source) => lines.push(`• ${source}`));
    }

    return lines.join("\n");
  }

  private updateCostTracking(tokensUsed: number): void {
    this.costTracker.totalSearches++;

    // Estimate cost: ~$10 per 1,000 searches plus token costs
    const searchCost = 10 / 1000; // $10 per 1,000 searches
    const tokenCost = tokensUsed * (6 / 1_000_000); // Assume extended pricing for search

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
  } {
    if (this.searchHistory.length === 0) {
      return {
        totalSearches: 0,
        averageSearchTime: 0,
        totalTokensUsed: 0,
        estimatedCost: 0,
        mostCommonQueries: [],
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

    // Find most common query patterns (simplified)
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
    };
  }

  clearHistory(): void {
    const previousCount = this.searchHistory.length;
    this.searchHistory = [];
    this.costTracker = { totalSearches: 0, estimatedCost: 0 };

    Logger.info("Web search history cleared", { previousCount });
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

    // Check for common issues
    if (!/[a-zA-Z]/.test(query)) {
      suggestions.push("Query should contain some alphabetic characters");
    }

    return {
      isValid: suggestions.length === 0,
      suggestions,
    };
  }

  static extractTechnicalTerms(searchResults: string): string[] {
    // Extract technical terms, library names, etc. from search results
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

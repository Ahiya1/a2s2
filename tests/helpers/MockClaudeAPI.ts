import { vi } from "vitest";

export interface MockClaudeResponse {
  content: Array<{
    type: "text" | "thinking" | "tool_use";
    text?: string;
    content?: string;
    id?: string;
    name?: string;
    input?: any;
  }>;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    thinking_tokens?: number;
  };
}

export interface MockClaudeRequest {
  model: string;
  max_tokens: number;
  thinking?: {
    type: "enabled";
    budget_tokens: number;
  };
  messages: Array<{
    role: "user" | "assistant";
    content: any;
  }>;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: any;
  }>;
  betas?: string[];
}

export class MockClaudeAPI {
  private static instance: MockClaudeAPI;
  private mockResponses: MockClaudeResponse[] = [];
  private requestHistory: MockClaudeRequest[] = [];
  private responseIndex = 0;

  private constructor() {}

  static getInstance(): MockClaudeAPI {
    if (!MockClaudeAPI.instance) {
      MockClaudeAPI.instance = new MockClaudeAPI();
    }
    return MockClaudeAPI.instance;
  }

  // Add predefined responses for testing
  addResponse(response: Partial<MockClaudeResponse>): void {
    this.mockResponses.push({
      content: response.content || [
        { type: "text", text: "Default mock response" },
      ],
      stop_reason: response.stop_reason || "end_turn",
      usage: response.usage || {
        input_tokens: 100,
        output_tokens: 50,
        thinking_tokens: 25,
      },
    });
  }

  // Add a tool use response
  addToolUseResponse(
    toolName: string,
    toolInput: any,
    followupText?: string
  ): void {
    const content: MockClaudeResponse["content"] = [
      { type: "text", text: followupText || `I'll use the ${toolName} tool.` },
      {
        type: "tool_use",
        id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: toolName,
        input: toolInput,
      },
    ];

    this.addResponse({
      content,
      stop_reason: "tool_use",
      usage: {
        input_tokens: 120,
        output_tokens: 80,
        thinking_tokens: 40,
      },
    });
  }

  // Add a completion response
  addCompletionResponse(
    summary: string,
    filesCreated?: string[],
    filesModified?: string[]
  ): void {
    this.addToolUseResponse(
      "report_complete",
      {
        summary,
        filesCreated: filesCreated || [],
        filesModified: filesModified || [],
        success: true,
      },
      "Task completed successfully."
    );
  }

  // Add a thinking response
  addThinkingResponse(thinkingContent: string, followupText: string): void {
    this.addResponse({
      content: [
        { type: "thinking", content: thinkingContent },
        { type: "text", text: followupText },
      ],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 100,
        output_tokens: 60,
        thinking_tokens: 80,
      },
    });
  }

  // Get the next response (cycles through added responses)
  getNextResponse(): MockClaudeResponse {
    if (this.mockResponses.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "Default mock response - no responses configured",
          },
        ],
        stop_reason: "end_turn",
        usage: { input_tokens: 50, output_tokens: 25 },
      };
    }

    const response =
      this.mockResponses[this.responseIndex % this.mockResponses.length];
    this.responseIndex++;
    return response;
  }

  // Record a request for inspection
  recordRequest(request: MockClaudeRequest): void {
    this.requestHistory.push(request);
  }

  // Get request history for testing
  getRequestHistory(): MockClaudeRequest[] {
    return [...this.requestHistory];
  }

  getLastRequest(): MockClaudeRequest | null {
    return this.requestHistory.length > 0
      ? this.requestHistory[this.requestHistory.length - 1]
      : null;
  }

  // Reset for new test
  reset(): void {
    this.mockResponses = [];
    this.requestHistory = [];
    this.responseIndex = 0;
  }

  // Create a mock Anthropic SDK instance
  createMockSDK() {
    const mockAPI = this;

    return {
      beta: {
        messages: {
          create: vi
            .fn()
            .mockImplementation(async (request: MockClaudeRequest) => {
              mockAPI.recordRequest(request);

              // Add small delay to simulate network latency
              await new Promise((resolve) => setTimeout(resolve, 10));

              return mockAPI.getNextResponse();
            }),
        },
      },
    };
  }

  // Preset scenarios for common testing situations
  setupReadmeCreationScenario(): void {
    this.reset();

    // Agent explores project structure
    this.addToolUseResponse(
      "get_project_tree",
      { path: "." },
      "I'll analyze the project structure first."
    );

    // Agent creates README
    this.addToolUseResponse(
      "write_files",
      {
        files: [
          {
            path: "README.md",
            content: "# Test Project\n\nThis project was created by a2s2.\n",
          },
        ],
      },
      "I'll create a README.md file for this project."
    );

    // Agent reports completion
    this.addCompletionResponse(
      "Successfully created README.md file with project information",
      ["README.md"]
    );
  }

  setupProjectAnalysisScenario(): void {
    this.reset();

    // Agent explores
    this.addToolUseResponse("get_project_tree", { path: "." });

    // Agent reads key files
    this.addToolUseResponse("read_files", {
      paths: ["package.json", "src/index.js"],
    });

    // Agent reports findings
    this.addResponse({
      content: [
        {
          type: "text",
          text: "Based on my analysis, this is a Node.js project with Express. I can help improve it by adding tests, documentation, and better error handling.",
        },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 200, output_tokens: 100, thinking_tokens: 150 },
    });
  }

  setupErrorScenario(): void {
    this.reset();

    // First response fails with API error - this would be handled by the ConversationManager
    this.addResponse({
      content: [
        {
          type: "text",
          text: "I encountered an issue, let me try a different approach.",
        },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 50, output_tokens: 30 },
    });

    // Retry succeeds
    this.addCompletionResponse("Completed after resolving initial issues");
  }

  setupMultiToolScenario(): void {
    this.reset();

    // Agent uses multiple tools in sequence
    this.addToolUseResponse("get_project_tree", { path: "." });
    this.addToolUseResponse("read_files", { paths: ["package.json"] });
    this.addToolUseResponse("write_files", {
      files: [{ path: "config.json", content: "{}" }],
    });
    this.addToolUseResponse("run_command", { command: "npm test" });
    this.addCompletionResponse(
      "Created configuration and ran tests successfully",
      ["config.json"]
    );
  }

  // Helper to inspect if certain tools were called
  wasToolCalled(toolName: string): boolean {
    return this.requestHistory.some((request) =>
      request.tools?.some((tool) => tool.name === toolName)
    );
  }

  // Helper to get tool call parameters
  getToolCallParams(toolName: string): any[] {
    const params: any[] = [];

    this.requestHistory.forEach((request) => {
      // This would need to be implemented based on how tools are actually called
      // in the real implementation
    });

    return params;
  }

  // Helper to check if specific beta headers were used
  wasBetaHeaderUsed(header: string): boolean {
    return this.requestHistory.some((request) =>
      request.betas?.includes(header)
    );
  }

  // Helper to get total token usage across all requests
  getTotalTokenUsage(): { input: number; output: number; thinking: number } {
    return this.mockResponses.reduce(
      (total, response, index) => {
        if (index < this.responseIndex) {
          total.input += response.usage.input_tokens;
          total.output += response.usage.output_tokens;
          total.thinking += response.usage.thinking_tokens || 0;
        }
        return total;
      },
      { input: 0, output: 0, thinking: 0 }
    );
  }
}

// Export singleton instance for easy use in tests
export const mockClaudeAPI = MockClaudeAPI.getInstance();

// Export a factory for creating fresh mocks in individual tests
export function createMockClaudeAPI(): MockClaudeAPI {
  return new (MockClaudeAPI as any)(); // Bypass singleton for individual test instances
}

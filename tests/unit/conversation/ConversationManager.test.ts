import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  ConversationManager,
  ConversationOptions,
} from "../../../src/conversation/ConversationManager";
import { Tool } from "../../../src/tools/ToolManager";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    beta: {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: "I'll help you with your request.",
            },
            {
              type: "tool_use",
              id: "tool_call_1",
              name: "test_tool",
              input: { param: "value" },
            },
          ],
          stop_reason: "tool_use",
          usage: {
            input_tokens: 1000,
            output_tokens: 200,
            thinking_tokens: 100,
          },
        }),
      },
    },
  })),
}));

describe("ConversationManager", () => {
  let conversationManager: ConversationManager;
  let mockTools: Tool[];

  beforeEach(() => {
    // Set up environment
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-12345";

    conversationManager = new ConversationManager();

    // Mock tools for testing
    mockTools = [
      {
        name: "test_tool",
        description: "A test tool",
        schema: {
          type: "object",
          properties: {
            param: { type: "string" },
          },
          required: ["param"],
        },
        execute: vi.fn().mockResolvedValue("Tool execution result"),
      },
      {
        name: "completion_tool",
        description: "Signals task completion",
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
          },
          required: ["summary"],
        },
        execute: vi.fn().mockResolvedValue("Task completed successfully"),
      },
    ];
  });

  test("should initialize with default configuration", () => {
    expect(conversationManager).toBeDefined();
    expect(conversationManager.getConversationId()).toMatch(/^conv_/);
  });

  test("should initialize with custom configuration", () => {
    const customConfig = {
      enableExtendedContext: true,
      enableWebSearch: false,
      maxTokens: 8000,
    };

    const customManager = new ConversationManager(customConfig);
    expect(customManager).toBeDefined();
  });

  test("should execute conversation with tools successfully", async () => {
    const prompt = "Create a simple test file";
    const options: ConversationOptions = {
      maxIterations: 5,
      costBudget: 1.0,
    };

    const result = await conversationManager.executeWithTools(
      prompt,
      mockTools,
      options
    );

    expect(result.success).toBe(true);
    expect(result.conversationId).toBeDefined();
    expect(result.iterationCount).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThanOrEqual(0);
  });

  test("should handle tool execution failures gracefully", async () => {
    const failingTool: Tool = {
      name: "failing_tool",
      description: "A tool that fails",
      schema: {
        type: "object",
        properties: {},
        required: [],
      },
      execute: vi.fn().mockRejectedValue(new Error("Tool execution failed")),
    };

    const prompt = "Use the failing tool";
    const result = await conversationManager.executeWithTools(
      prompt,
      [failingTool],
      { maxIterations: 2 }
    );

    // Should complete but might not be successful
    expect(result).toBeDefined();
    expect(result.conversationId).toBeDefined();
  });

  test("should respect cost budget limits", async () => {
    const prompt = "Expensive operation";
    const options: ConversationOptions = {
      costBudget: 0.01, // Very low budget
      maxIterations: 10,
    };

    const result = await conversationManager.executeWithTools(
      prompt,
      mockTools,
      options
    );

    expect(result.totalCost).toBeLessThanOrEqual(0.01);
  });

  test("should respect max iterations limit", async () => {
    const prompt = "Long running task";
    const options: ConversationOptions = {
      maxIterations: 2, // Very low limit
    };

    const result = await conversationManager.executeWithTools(
      prompt,
      mockTools,
      options
    );

    expect(result.iterationCount).toBeLessThanOrEqual(2);
  });

  test("should handle conversation completion via tool calls", async () => {
    const completionTool: Tool = {
      name: "report_complete",
      description: "Report task completion",
      schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
        },
        required: ["summary"],
      },
      execute: vi.fn().mockResolvedValue("Task completed"),
    };

    const prompt = "Complete this task";
    const result = await conversationManager.executeWithTools(
      prompt,
      [completionTool],
      { maxIterations: 5 }
    );

    expect(result.success).toBe(true);
  });

  test("should handle missing tools gracefully", async () => {
    // Mock Anthropic to request a tool that doesn't exist
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const mockCreate =
      vi.mocked(Anthropic).mock.results[0].value.beta.messages.create;

    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "missing_tool_call",
          name: "nonexistent_tool",
          input: {},
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const prompt = "Use nonexistent tool";
    const result = await conversationManager.executeWithTools(
      prompt,
      mockTools,
      { maxIterations: 2 }
    );

    expect(result).toBeDefined();
    // Tool execution should fail gracefully
  });

  test("should enable prompt caching when requested", async () => {
    const prompt = "Test prompt caching";
    const options: ConversationOptions = {
      enablePromptCaching: true,
      maxIterations: 2,
    };

    const result = await conversationManager.executeWithTools(
      prompt,
      mockTools,
      options
    );

    expect(result.success).toBe(true);
  });

  test("should use extended context when enabled", async () => {
    const prompt = "Test extended context";
    const options: ConversationOptions = {
      useExtendedContext: true,
      maxIterations: 2,
    };

    const result = await conversationManager.executeWithTools(
      prompt,
      mockTools,
      options
    );

    expect(result.success).toBe(true);
  });

  test("should handle empty tools array", async () => {
    const prompt = "Work without tools";
    const result = await conversationManager.executeWithTools(prompt, [], {
      maxIterations: 2,
    });

    expect(result).toBeDefined();
    expect(result.conversationId).toBeDefined();
  });

  test("should track conversation costs", async () => {
    const prompt = "Cost tracking test";
    const result = await conversationManager.executeWithTools(
      prompt,
      mockTools,
      { maxIterations: 2 }
    );

    expect(result.totalCost).toBeGreaterThan(0);

    const costTracking = conversationManager.getCostTracking();
    expect(costTracking).toBeDefined();
    expect(typeof costTracking.totalCost).toBe("number");
  });

  test("should provide conversation summary", () => {
    const summary = conversationManager.getConversationSummary();
    expect(summary).toBeDefined();
    expect(summary.messageCount).toBeGreaterThanOrEqual(0);
  });

  test("should clear conversation state", () => {
    const originalId = conversationManager.getConversationId();
    conversationManager.clear();

    const newId = conversationManager.getConversationId();
    expect(newId).not.toBe(originalId);
  });

  test("should handle API errors gracefully", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const mockCreate =
      vi.mocked(Anthropic).mock.results[0].value.beta.messages.create;

    mockCreate.mockRejectedValueOnce(new Error("API Error"));

    const prompt = "This will fail";
    const result = await conversationManager.executeWithTools(
      prompt,
      mockTools,
      { maxIterations: 1 }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("should format tools for Claude API correctly", async () => {
    const prompt = "Test tool formatting";
    await conversationManager.executeWithTools(prompt, mockTools, {
      maxIterations: 1,
    });

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const mockCreate =
      vi.mocked(Anthropic).mock.results[0].value.beta.messages.create;

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "test_tool",
            description: "A test tool",
            input_schema: expect.objectContaining({
              type: "object",
              properties: expect.any(Object),
              required: expect.any(Array),
            }),
          }),
        ]),
      })
    );
  });

  test("should handle multiple tool calls in parallel", async () => {
    const multiTool: Tool = {
      name: "multi_tool",
      description: "Tool that can be called multiple times",
      schema: {
        type: "object",
        properties: {
          id: { type: "string" },
        },
        required: ["id"],
      },
      execute: vi.fn().mockImplementation(async (params: any) => {
        return `Executed with id: ${params.id}`;
      }),
    };

    // Mock multiple tool calls
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const mockCreate =
      vi.mocked(Anthropic).mock.results[0].value.beta.messages.create;

    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "call_1",
          name: "multi_tool",
          input: { id: "first" },
        },
        {
          type: "tool_use",
          id: "call_2",
          name: "multi_tool",
          input: { id: "second" },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 200, output_tokens: 100 },
    });

    const prompt = "Execute multiple tools";
    const result = await conversationManager.executeWithTools(
      prompt,
      [multiTool],
      { maxIterations: 2 }
    );

    expect(multiTool.execute).toHaveBeenCalledTimes(2);
  });

  test("should generate unique conversation IDs", () => {
    const manager1 = new ConversationManager();
    const manager2 = new ConversationManager();

    expect(manager1.getConversationId()).not.toBe(manager2.getConversationId());
  });
});

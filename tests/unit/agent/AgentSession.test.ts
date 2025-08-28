import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AgentSession,
  AgentSessionOptions,
} from "../../../src/agent/AgentSession";
import { TestUtils } from "../../helpers/TestUtils";

// Mock the Anthropic API
vi.mock("anthropic", () => ({
  default: vi.fn().mockImplementation(() => ({
    beta: {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: "I'll help you create a README.md file for this project.",
            },
            {
              type: "tool_use",
              id: "tool_1",
              name: "report_complete",
              input: {
                summary: "Created README.md file successfully",
                filesCreated: ["README.md"],
                success: true,
              },
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

describe("AgentSession", () => {
  let tempDir: string;
  let mockConsoleOutput: {
    output: string[];
    error: string[];
    restore: () => void;
  };

  beforeEach(async () => {
    tempDir = await TestUtils.createTempDir();
    mockConsoleOutput = TestUtils.mockConsoleOutput();

    // Set required environment variable
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-123";
  });

  afterEach(async () => {
    await TestUtils.cleanupTempDir(tempDir);
    mockConsoleOutput.restore();
    delete process.env.ANTHROPIC_API_KEY;
  });

  test("should initialize agent session correctly", () => {
    const options: AgentSessionOptions = {
      vision: "Create a README.md file for this project",
      workingDirectory: tempDir,
      phase: "EXPLORE",
    };

    const agentSession = new AgentSession(options);

    expect(agentSession.getSessionId()).toBeDefined();
    expect(agentSession.getCurrentPhase()).toBe("EXPLORE");
    expect(agentSession.isSessionCompleted()).toBe(false);

    agentSession.cleanup();
  });

  test("should execute simple agent task", async () => {
    const options: AgentSessionOptions = {
      vision: "Create a README.md file with project description",
      workingDirectory: tempDir,
      phase: "COMPLETE",
      maxIterations: 5,
      costBudget: 1.0,
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(options);
    const result = await agentSession.execute(options);

    expect(result.success).toBe(true);
    expect(result.sessionId).toBeDefined();
    expect(result.iterationCount).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThanOrEqual(0);
    expect(result.duration).toBeGreaterThan(0);

    agentSession.cleanup();
  }, 30000); // 30 second timeout for integration test

  test("should handle invalid API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const options: AgentSessionOptions = {
      vision: "Test task",
      workingDirectory: tempDir,
    };

    expect(() => new AgentSession(options)).toThrow("ANTHROPIC_API_KEY");
  });

  test("should validate session options", () => {
    const invalidOptions: AgentSessionOptions = {
      vision: "", // Empty vision should cause issues
      workingDirectory: tempDir,
    };

    // This should still create the session, but execution might fail
    const agentSession = new AgentSession(invalidOptions);
    expect(agentSession).toBeDefined();
    agentSession.cleanup();
  });

  test("should handle cost budget limits", async () => {
    const options: AgentSessionOptions = {
      vision: "Create a simple project",
      workingDirectory: tempDir,
      costBudget: 0.01, // Very low budget
      maxIterations: 2,
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(options);
    const result = await agentSession.execute(options);

    // Should complete even with low budget, or fail gracefully
    expect(result).toBeDefined();
    expect(result.totalCost).toBeLessThanOrEqual(0.01);

    agentSession.cleanup();
  });

  test("should track session metrics", async () => {
    const options: AgentSessionOptions = {
      vision: "Simple test task",
      workingDirectory: tempDir,
      maxIterations: 3,
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(options);

    // Check initial metrics
    const initialMetrics = agentSession.getMetrics();
    expect(initialMetrics.sessionId).toBeDefined();
    expect(initialMetrics.phase).toBe("EXPLORE");
    expect(initialMetrics.iterationCount).toBe(0);

    await agentSession.execute(options);

    // Check final metrics
    const finalMetrics = agentSession.getMetrics();
    expect(finalMetrics.iterationCount).toBeGreaterThan(0);
    expect(finalMetrics.endTime).toBeDefined();

    agentSession.cleanup();
  });

  test("should handle web search configuration", () => {
    const optionsWithWebSearch: AgentSessionOptions = {
      vision: "Research and create a modern web project",
      workingDirectory: tempDir,
      enableWebSearch: true,
    };

    const agentSession = new AgentSession(optionsWithWebSearch);
    expect(agentSession).toBeDefined();

    agentSession.cleanup();
  });

  test("should handle extended context configuration", () => {
    const optionsWithExtendedContext: AgentSessionOptions = {
      vision: "Analyze and refactor a large codebase",
      workingDirectory: tempDir,
      enableExtendedContext: true,
    };

    const agentSession = new AgentSession(optionsWithExtendedContext);
    expect(agentSession).toBeDefined();

    agentSession.cleanup();
  });

  test("should generate unique session IDs", () => {
    const options: AgentSessionOptions = {
      vision: "Test task",
      workingDirectory: tempDir,
    };

    const session1 = new AgentSession(options);
    const session2 = new AgentSession(options);

    expect(session1.getSessionId()).not.toBe(session2.getSessionId());

    session1.cleanup();
    session2.cleanup();
  });

  test("should cleanup resources properly", () => {
    const options: AgentSessionOptions = {
      vision: "Test cleanup",
      workingDirectory: tempDir,
    };

    const agentSession = new AgentSession(options);
    const sessionId = agentSession.getSessionId();

    // Cleanup should not throw
    expect(() => agentSession.cleanup()).not.toThrow();

    // Session ID should still be accessible after cleanup
    expect(agentSession.getSessionId()).toBe(sessionId);
  });
});

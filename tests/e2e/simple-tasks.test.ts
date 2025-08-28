import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AgentSession,
  AgentSessionOptions,
} from "../../src/agent/AgentSession";
import { TestUtils } from "../helpers/TestUtils";
import * as path from "path";

// Mock the Anthropic API for E2E tests
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    beta: {
      messages: {
        create: vi.fn().mockImplementation(async (request) => {
          // Simple mock that responds based on the messages content
          const lastMessage = request.messages[request.messages.length - 1];
          const content =
            typeof lastMessage.content === "string"
              ? lastMessage.content
              : lastMessage.content[0]?.text || "";

          // Simulate different responses based on the task
          if (content.includes("README")) {
            return {
              content: [
                {
                  type: "text",
                  text: "I'll create a README.md file for this project.",
                },
                {
                  type: "tool_use",
                  id: "write_readme",
                  name: "write_files",
                  input: {
                    files: [
                      {
                        path: "README.md",
                        content:
                          "# Test Project\n\nThis is a test project created by a2s2.\n",
                      },
                    ],
                  },
                },
              ],
              stop_reason: "tool_use",
              usage: {
                input_tokens: 800,
                output_tokens: 150,
                thinking_tokens: 50,
              },
            };
          }

          if (content.includes("package.json")) {
            return {
              content: [
                { type: "text", text: "I'll create a package.json file." },
                {
                  type: "tool_use",
                  id: "write_package",
                  name: "write_files",
                  input: {
                    files: [
                      {
                        path: "package.json",
                        content: JSON.stringify(
                          {
                            name: "test-project",
                            version: "1.0.0",
                            description: "E2E test project",
                          },
                          null,
                          2
                        ),
                      },
                    ],
                  },
                },
              ],
              stop_reason: "tool_use",
              usage: {
                input_tokens: 700,
                output_tokens: 120,
                thinking_tokens: 40,
              },
            };
          }

          // Default completion response
          return {
            content: [
              { type: "text", text: "Task completed successfully." },
              {
                type: "tool_use",
                id: "complete_task",
                name: "report_complete",
                input: {
                  summary: "Successfully completed the requested task",
                  filesCreated: ["README.md"],
                  success: true,
                },
              },
            ],
            stop_reason: "tool_use",
            usage: {
              input_tokens: 600,
              output_tokens: 100,
              thinking_tokens: 30,
            },
          };
        }),
      },
    },
  })),
}));

describe("Simple Tasks E2E", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await TestUtils.createTempDir();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-e2e-12345";
  });

  afterEach(async () => {
    await TestUtils.cleanupTempDir(tempDir);
    delete process.env.ANTHROPIC_API_KEY;
  });

  test("should create README.md file when requested", async () => {
    const options: AgentSessionOptions = {
      vision: "Create a README.md file for this project with basic information",
      workingDirectory: tempDir,
      phase: "COMPLETE",
      maxIterations: 5,
      costBudget: 2.0,
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(options);
    const result = await agentSession.execute(options);

    expect(result.success).toBe(true);
    expect(result.iterationCount).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThan(0);

    // Verify README.md was created
    const readmePath = path.join(tempDir, "README.md");
    expect(await TestUtils.fileExists(readmePath)).toBe(true);

    const readmeContent = await TestUtils.readTestFile(readmePath);
    expect(readmeContent).toContain("# Test Project");
    expect(readmeContent).toContain("a2s2");

    agentSession.cleanup();
  }, 30000);

  test("should create package.json when requested", async () => {
    const options: AgentSessionOptions = {
      vision: "Create a package.json file for a new Node.js project",
      workingDirectory: tempDir,
      phase: "COMPLETE",
      maxIterations: 5,
      costBudget: 2.0,
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(options);
    const result = await agentSession.execute(options);

    expect(result.success).toBe(true);

    // Verify package.json was created
    const packagePath = path.join(tempDir, "package.json");
    expect(await TestUtils.fileExists(packagePath)).toBe(true);

    const packageContent = await TestUtils.readTestFile(packagePath);
    const packageJson = JSON.parse(packageContent);

    expect(packageJson.name).toBeDefined();
    expect(packageJson.version).toBeDefined();
    expect(packageJson.description).toBeDefined();

    agentSession.cleanup();
  }, 30000);

  test("should analyze existing project structure", async () => {
    // Create an existing project structure
    await TestUtils.createTestFiles(tempDir, {
      "package.json": JSON.stringify({
        name: "existing-project",
        dependencies: { react: "^18.0.0" },
      }),
      "src/App.jsx":
        "export default function App() { return <div>Hello</div> }",
      "src/index.js": "import App from './App';",
    });

    const options: AgentSessionOptions = {
      vision: "Analyze this existing project and add appropriate documentation",
      workingDirectory: tempDir,
      phase: "EXPLORE",
      maxIterations: 8,
      costBudget: 3.0,
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(options);
    const result = await agentSession.execute(options);

    expect(result.success).toBe(true);
    expect(result.iterationCount).toBeGreaterThan(0);

    // The agent should have analyzed the existing structure
    const metrics = agentSession.getMetrics();
    expect(metrics.toolCallsCount).toBeGreaterThan(0);

    agentSession.cleanup();
  }, 30000);

  test("should handle simple code generation task", async () => {
    const options: AgentSessionOptions = {
      vision:
        "Create a simple JavaScript utility function file with common helper functions",
      workingDirectory: tempDir,
      phase: "COMPLETE",
      maxIterations: 6,
      costBudget: 2.5,
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(options);
    const result = await agentSession.execute(options);

    expect(result.success).toBe(true);
    expect(result.sessionId).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);

    // Check that some file was created (exact file depends on agent decision)
    const files = require("fs").readdirSync(tempDir);
    expect(files.length).toBeGreaterThan(0);

    agentSession.cleanup();
  }, 30000);

  test("should respect cost budget limits in E2E scenario", async () => {
    const lowBudget = 0.5; // Very low budget for E2E test

    const options: AgentSessionOptions = {
      vision: "Create multiple files for a complete web project setup",
      workingDirectory: tempDir,
      costBudget: lowBudget,
      maxIterations: 10, // High iteration limit
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(options);
    const result = await agentSession.execute(options);

    // Should complete within budget even if not fully successful
    expect(result.totalCost).toBeLessThanOrEqual(lowBudget * 1.1); // Allow 10% margin for rounding

    agentSession.cleanup();
  }, 30000);

  test("should handle iteration limits in E2E scenario", async () => {
    const maxIterations = 2; // Very low iteration limit

    const options: AgentSessionOptions = {
      vision:
        "Create a complex multi-file application with tests and documentation",
      workingDirectory: tempDir,
      maxIterations,
      costBudget: 5.0, // High budget
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(options);
    const result = await agentSession.execute(options);

    // Should stop at iteration limit
    expect(result.iterationCount).toBeLessThanOrEqual(maxIterations);

    agentSession.cleanup();
  }, 30000);

  test("should work with different starting phases", async () => {
    // Create minimal existing structure
    await TestUtils.createTestFiles(tempDir, {
      "main.js": "console.log('Hello, World!');",
    });

    const exploreOptions: AgentSessionOptions = {
      vision: "Understand and improve this JavaScript project",
      workingDirectory: tempDir,
      phase: "EXPLORE", // Start with exploration
      maxIterations: 4,
      costBudget: 2.0,
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(exploreOptions);
    const result = await agentSession.execute(exploreOptions);

    expect(result.success).toBe(true);
    expect(result.finalPhase).toBeDefined();

    // Phase should have been reported
    const currentPhase = agentSession.getCurrentPhase();
    expect(["EXPLORE", "SUMMON", "COMPLETE"]).toContain(currentPhase);

    agentSession.cleanup();
  }, 30000);

  test("should generate session metrics correctly", async () => {
    const options: AgentSessionOptions = {
      vision: "Create a simple configuration file",
      workingDirectory: tempDir,
      maxIterations: 3,
      costBudget: 1.0,
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(options);

    // Check initial metrics
    const initialMetrics = agentSession.getMetrics();
    expect(initialMetrics.sessionId).toBeDefined();
    expect(initialMetrics.startTime).toBeInstanceOf(Date);
    expect(initialMetrics.iterationCount).toBe(0);
    expect(initialMetrics.totalCost).toBe(0);

    const result = await agentSession.execute(options);

    // Check final metrics
    const finalMetrics = agentSession.getMetrics();
    expect(finalMetrics.iterationCount).toBeGreaterThan(0);
    expect(finalMetrics.totalCost).toBeGreaterThan(0);
    expect(finalMetrics.endTime).toBeInstanceOf(Date);

    expect(result.iterationCount).toBe(finalMetrics.iterationCount);
    expect(result.totalCost).toBe(finalMetrics.totalCost);

    agentSession.cleanup();
  }, 30000);

  test("should handle empty working directory", async () => {
    const options: AgentSessionOptions = {
      vision: "Initialize a new project from scratch with basic structure",
      workingDirectory: tempDir,
      phase: "COMPLETE",
      maxIterations: 5,
      costBudget: 2.0,
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(options);
    const result = await agentSession.execute(options);

    // Should work even with empty directory
    expect(result.success).toBe(true);
    expect(result.sessionId).toBeDefined();

    agentSession.cleanup();
  }, 30000);

  test("should maintain session state throughout execution", async () => {
    const options: AgentSessionOptions = {
      vision: "Create project documentation and verify it was created",
      workingDirectory: tempDir,
      maxIterations: 6,
      costBudget: 2.0,
      enableWebSearch: false,
    };

    const agentSession = new AgentSession(options);
    const sessionId = agentSession.getSessionId();

    const result = await agentSession.execute(options);

    // Session ID should remain constant
    expect(agentSession.getSessionId()).toBe(sessionId);
    expect(result.sessionId).toBe(sessionId);

    // Session should track completion status
    const isCompleted = agentSession.isSessionCompleted();
    expect(typeof isCompleted).toBe("boolean");

    agentSession.cleanup();
  }, 30000);
});

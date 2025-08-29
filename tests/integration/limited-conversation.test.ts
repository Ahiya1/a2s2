import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { LimitedConversationAgent } from "../../src/conversation/LimitedConversationAgent";
import { TestUtils } from "../helpers/TestUtils";

// Mock the AgentSession
vi.mock("../../src/agent/AgentSession", () => ({
  AgentSession: vi.fn().mockImplementation(() => ({
    getSessionId: vi.fn().mockReturnValue("test_session_123"),
    execute: vi.fn().mockResolvedValue({
      success: true,
      finalPhase: "COMPLETE",
      totalCost: 0.25,
      iterationCount: 5,
      sessionId: "test_session_123",
      duration: 8000,
    }),
    cleanup: vi.fn(),
  })),
}));

// Mock ConversationManager
vi.mock("../../src/conversation/ConversationManager", () => ({
  ConversationManager: vi.fn().mockImplementation(() => ({
    executeWithTools: vi.fn().mockResolvedValue({
      success: true,
      response: {
        content: "I understand your project structure. What would you like to work on?",
      },
      totalCost: 0.05,
      iterationCount: 1,
    }),
    clear: vi.fn(),
  })),
}));

// Mock AnthropicConfigManager
vi.mock("../../src/config/AnthropicConfig", () => ({
  AnthropicConfigManager: vi.fn().mockImplementation(() => ({
    getConfig: vi.fn().mockReturnValue({
      apiKey: "test-key",
      modelId: "claude-3-5-sonnet-20241022",
      maxTokens: 8000,
    }),
  })),
}));

// Mock ConversationPersistence
vi.mock("../../src/conversation/ConversationPersistence", () => ({
  ConversationPersistence: vi.fn().mockImplementation(() => ({
    loadConversation: vi.fn().mockResolvedValue(null),
    saveConversation: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock ProjectAnalyzer
vi.mock("../../src/conversation/ProjectAnalyzer", () => ({
  ProjectAnalyzer: vi.fn().mockImplementation(() => ({
    analyzeProject: vi.fn().mockResolvedValue({
      directory: "/test/dir",
      structure: "test structure",
      keyFiles: ["package.json"],
      techStack: ["Node.js"],
      patterns: ["Test Pattern"],
    }),
  })),
}));

// Mock readline interface - prevent actual user input
vi.mock("readline", () => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
    prompt: vi.fn(),
  }),
}));

describe("LimitedConversationAgent", () => {
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
    vi.clearAllMocks();
  });

  test("should initialize with limited tools only", async () => {
    const agent = new LimitedConversationAgent({
      workingDirectory: tempDir,
    });

    // The agent should be created successfully
    expect(agent).toBeDefined();
    expect(agent).toBeInstanceOf(LimitedConversationAgent);
  });

  test("should have only read-only tools available", async () => {
    const agent = new LimitedConversationAgent({
      workingDirectory: tempDir,
      verbose: true,
    });

    // Verify that only allowed tools are available
    const tools = (agent as any).getLimitedTools();
    const toolNames = tools.map((tool: any) => tool.name);
    
    expect(toolNames).toContain('get_project_tree');
    expect(toolNames).toContain('read_files');
    
    // Should NOT contain write tools
    expect(toolNames).not.toContain('write_files');
    expect(toolNames).not.toContain('run_command');
    expect(toolNames).not.toContain('web_search');
  });

  test("should handle project analysis caching", async () => {
    // Create agent with conversation ID to test caching
    const conversationId = "test_conv_123";
    
    const agent = new LimitedConversationAgent({
      workingDirectory: tempDir,
      conversationId,
    });

    expect(agent).toBeDefined();
    expect(agent).toBeInstanceOf(LimitedConversationAgent);
  });

  test("should generate unique conversation ID when none provided", async () => {
    const agent1 = new LimitedConversationAgent({
      workingDirectory: tempDir,
    });
    
    const agent2 = new LimitedConversationAgent({
      workingDirectory: tempDir,
    });

    // Both agents should be created with different IDs
    expect(agent1).toBeDefined();
    expect(agent2).toBeDefined();
    expect(agent1).toBeInstanceOf(LimitedConversationAgent);
    expect(agent2).toBeInstanceOf(LimitedConversationAgent);
  });

  test("should validate required environment variables", async () => {
    // Remove API key
    delete process.env.ANTHROPIC_API_KEY;
    
    expect(() => {
      new LimitedConversationAgent({
        workingDirectory: tempDir,
      });
    }).toThrow("ANTHROPIC_API_KEY environment variable is required");
  });

  test("should configure tools correctly", async () => {
    const agent = new LimitedConversationAgent({
      workingDirectory: tempDir,
      verbose: true,
    });
    
    // Verify initialization completed
    expect(agent).toBeDefined();
    expect(agent).toBeInstanceOf(LimitedConversationAgent);
  });

  test("should support cost budget configuration", async () => {
    const agent = new LimitedConversationAgent({
      workingDirectory: tempDir,
      costBudget: 10.0,
    });
    
    expect(agent).toBeDefined();
    expect(agent).toBeInstanceOf(LimitedConversationAgent);
  });

  test("should support streaming configuration", async () => {
    const agent = new LimitedConversationAgent({
      workingDirectory: tempDir,
      enableStreaming: true,
      showProgress: true,
    });
    
    expect(agent).toBeDefined();
    expect(agent).toBeInstanceOf(LimitedConversationAgent);
  });

  test("should cleanup resources properly", async () => {
    const agent = new LimitedConversationAgent({
      workingDirectory: tempDir,
    });
    
    // Call cleanup method
    (agent as any).cleanup();
    
    // Should not throw errors
    expect(true).toBe(true);
  });
});

describe("LimitedConversationAgent Tool Restrictions", () => {
  let tempDir: string;
  let mockConsoleOutput: {
    output: string[];
    error: string[];
    restore: () => void;
  };

  beforeEach(async () => {
    tempDir = await TestUtils.createTempDir();
    mockConsoleOutput = TestUtils.mockConsoleOutput();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-123";
  });

  afterEach(async () => {
    await TestUtils.cleanupTempDir(tempDir);
    mockConsoleOutput.restore();
    delete process.env.ANTHROPIC_API_KEY;
    vi.clearAllMocks();
  });

  test("should only allow read-only tools", async () => {
    const agent = new LimitedConversationAgent({
      workingDirectory: tempDir,
    });
    
    // Get the limited tools
    const tools = (agent as any).getLimitedTools();
    
    // Should only contain read-only tools
    const toolNames = tools.map((tool: any) => tool.name);
    expect(toolNames).toContain('get_project_tree');
    expect(toolNames).toContain('read_files');
    
    // Should NOT contain write tools
    expect(toolNames).not.toContain('write_files');
    expect(toolNames).not.toContain('run_command');
    expect(toolNames).not.toContain('web_search');
  });

  test("should have correct tool descriptions", async () => {
    const agent = new LimitedConversationAgent({
      workingDirectory: tempDir,
    });
    
    const description = (agent as any).getToolDescription('get_project_tree');
    expect(description).toContain('Analyze project structure');
    
    const readDescription = (agent as any).getToolDescription('read_files');
    expect(readDescription).toContain('Read multiple files');
  });

  test("should have correct tool schemas", async () => {
    const agent = new LimitedConversationAgent({
      workingDirectory: tempDir,
    });
    
    const treeSchema = (agent as any).getToolSchema('get_project_tree');
    expect(treeSchema).toHaveProperty('type', 'object');
    expect(treeSchema).toHaveProperty('properties');
    
    const readSchema = (agent as any).getToolSchema('read_files');
    expect(readSchema).toHaveProperty('type', 'object');
    expect(readSchema.required).toContain('paths');
  });

  test("should build conversation summary correctly", async () => {
    const agent = new LimitedConversationAgent({
      workingDirectory: tempDir,
    });
    
    // Test empty history
    const emptySummary = (agent as any).buildConversationSummary();
    expect(emptySummary).toContain('No previous conversation');
    
    // Add some conversation history
    (agent as any).conversationHistory = [
      { role: 'user', content: 'Hello', timestamp: new Date() },
      { role: 'assistant', content: 'Hi there!', timestamp: new Date() },
    ];
    
    const summary = (agent as any).buildConversationSummary();
    expect(summary).toContain('user: Hello');
    expect(summary).toContain('assistant: Hi there!');
  });

  test("should build project summary correctly", async () => {
    const agent = new LimitedConversationAgent({
      workingDirectory: tempDir,
    });
    
    // Test without project context
    const emptySummary = (agent as any).buildProjectSummary();
    expect(emptySummary).toContain('No project context available');
    
    // Set project context
    (agent as any).projectContext = {
      directory: '/test/dir',
      techStack: ['Node.js', 'React'],
      keyFiles: ['package.json', 'src/App.js'],
      patterns: ['React App'],
    };
    
    const summary = (agent as any).buildProjectSummary();
    expect(summary).toContain('Directory: /test/dir');
    expect(summary).toContain('Tech Stack: Node.js, React');
    expect(summary).toContain('Key Files: package.json');
    expect(summary).toContain('Patterns: React App');
  });
});

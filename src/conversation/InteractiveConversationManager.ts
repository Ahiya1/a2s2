import {
  ConversationManager,
  ConversationOptions,
} from "./ConversationManager";
import { ToolManager, Tool } from "../tools/ToolManager";
import { WebSearchTool } from "../tools/web/WebSearchTool";
import { AnthropicConfigManager } from "../config/AnthropicConfig";
import { StreamingProgress } from "./StreamingManager";
import { Logger } from "../logging/Logger";
import * as readline from "readline";

// NEW: Progress indicator utilities
const ora = require("ora");

export interface InteractiveConversationOptions {
  workingDirectory: string;
  verbose?: boolean;
  enableWebSearch?: boolean;
  costBudget?: number;
  // NEW: Streaming options
  enableStreaming?: boolean;
  showProgress?: boolean;
  typewriterEffect?: boolean;
  enableCancellation?: boolean;
}

export interface InteractiveConversationResult {
  success: boolean;
  error?: string;
  totalCost: number;
  messageCount: number;
  conversationId: string;
  // NEW: Streaming results
  wasStreamed?: boolean;
  totalStreamingTime?: number;
}

export class InteractiveConversationManager {
  private conversationManager: ConversationManager;
  private toolManager: ToolManager;
  private webSearchTool?: WebSearchTool;
  private rl!: readline.Interface;
  private options: InteractiveConversationOptions;
  private totalCost: number = 0;
  private messageCount: number = 0;
  private conversationId: string;

  // NEW: Streaming state
  private currentSpinner?: any;
  private isStreamingActive: boolean = false;
  private streamingStartTime: number = 0;
  private totalStreamingTime: number = 0;
  private cancellationRequested: boolean = false;

  constructor(options: InteractiveConversationOptions) {
    this.options = options;
    this.conversationId = this.generateConversationId();

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    const configManager = new AnthropicConfigManager({
      enableExtendedContext: false,
      enableWebSearch: options.enableWebSearch !== false,
      // NEW: Configure streaming based on options
      enableStreaming: options.enableStreaming !== false,
      showProgressIndicators: options.showProgress !== false,
      typewriterEffect: options.typewriterEffect || false,
    });

    this.conversationManager = new ConversationManager(
      configManager.getConfig()
    );

    this.toolManager = new ToolManager();
    this.setupWebSearch();
    this.setupReadlineInterface();

    Logger.info("InteractiveConversationManager initialized", {
      conversationId: this.conversationId,
      workingDirectory: options.workingDirectory,
      enableWebSearch: options.enableWebSearch,
      streamingEnabled: options.enableStreaming !== false,
      progressEnabled: options.showProgress !== false,
    });
  }

  private setupReadlineInterface(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "\n💭 You: ",
    });

    // NEW: Setup cancellation handling
    if (this.options.enableCancellation !== false) {
      this.setupCancellationHandling();
    }
  }

  // NEW: Setup CTRL+C handling during streaming
  private setupCancellationHandling(): void {
    process.on("SIGINT", () => {
      if (this.isStreamingActive) {
        this.cancellationRequested = true;
        this.stopCurrentStreaming();
        console.log(
          '\n\n🛑 Streaming cancelled by user. Type "quit" to exit or continue chatting...\n'
        );
        this.rl.prompt();
      } else {
        console.log("\n👋 Goodbye!");
        process.exit(0);
      }
    });
  }

  async startInteractiveConversation(): Promise<InteractiveConversationResult> {
    try {
      Logger.info("Starting interactive conversation with Claude agent", {
        conversationId: this.conversationId,
      });

      this.displayWelcome();
      await this.conversationLoop();

      return {
        success: true,
        totalCost: this.totalCost,
        messageCount: this.messageCount,
        conversationId: this.conversationId,
        wasStreamed: this.totalStreamingTime > 0,
        totalStreamingTime: this.totalStreamingTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      Logger.error("Interactive conversation failed", {
        conversationId: this.conversationId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        totalCost: this.totalCost,
        messageCount: this.messageCount,
        conversationId: this.conversationId,
        wasStreamed: this.totalStreamingTime > 0,
        totalStreamingTime: this.totalStreamingTime,
      };
    } finally {
      this.cleanup();
    }
  }

  private displayWelcome(): void {
    console.log("\n🤖 " + "=".repeat(60));
    console.log("🤖   Welcome to a2s2 Interactive Agent Conversation!");
    console.log("🤖 " + "=".repeat(60));
    console.log(
      "\n💡 You're now chatting with Claude 4 Sonnet - an AI agent with access to:"
    );
    console.log("   📁 File reading and writing");
    console.log("   🌳 Project structure analysis");
    console.log("   💻 Shell command execution");
    if (this.webSearchTool) {
      console.log("   🔍 Web search capabilities");
    }

    // NEW: Streaming information
    if (this.options.enableStreaming !== false) {
      console.log("   ⚡ Real-time streaming responses");
      if (this.options.enableCancellation !== false) {
        console.log("   🛑 CTRL+C to cancel streaming");
      }
    }

    console.log(
      "\n🎯 The agent can explore your project and help with development tasks."
    );
    console.log(
      "\n💭 Start by describing what you'd like to work on, or ask the agent"
    );
    console.log(
      "   to analyze your project structure to understand what you're building."
    );
    console.log("\n⌨️  Commands:");
    console.log("   • Type your message and press Enter to chat");
    console.log("   • Type 'quit' or 'exit' to end the conversation");
    console.log("   • Type 'cost' to see current usage costs");
    console.log("   • Type 'help' for more information");
    if (
      this.options.enableStreaming !== false &&
      this.options.enableCancellation !== false
    ) {
      console.log("   • Press CTRL+C during responses to cancel streaming");
    }
    console.log("\n" + "=".repeat(68));
  }

  private async conversationLoop(): Promise<void> {
    return new Promise((resolve, reject) => {
      const handleInput = async (input: string) => {
        const trimmed = input.trim();

        if (
          trimmed.toLowerCase() === "quit" ||
          trimmed.toLowerCase() === "exit"
        ) {
          console.log("\n👋 Thanks for chatting! Goodbye!");
          resolve();
          return;
        }

        if (trimmed.toLowerCase() === "cost") {
          console.log(
            `\n💰 Current session cost: $${this.totalCost.toFixed(4)}`
          );
          console.log(`📊 Messages exchanged: ${this.messageCount}`);
          if (this.totalStreamingTime > 0) {
            console.log(
              `⚡ Total streaming time: ${(this.totalStreamingTime / 1000).toFixed(1)}s`
            );
          }
          this.rl.prompt();
          return;
        }

        if (trimmed.toLowerCase() === "help") {
          this.displayHelp();
          this.rl.prompt();
          return;
        }

        if (trimmed === "") {
          this.rl.prompt();
          return;
        }

        try {
          if (
            this.options.costBudget &&
            this.totalCost >= this.options.costBudget
          ) {
            console.log(
              `\n⚠️  Cost budget of $${this.options.costBudget} reached. Ending conversation.`
            );
            resolve();
            return;
          }

          // NEW: Enhanced streaming conversation
          await this.handleStreamingConversation(trimmed);
        } catch (error) {
          console.log(
            `❌ Error: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        this.rl.prompt();
      };

      this.rl.on("line", handleInput);
      this.rl.on("close", () => {
        console.log("\n👋 Conversation ended. Goodbye!");
        resolve();
      });

      this.rl.prompt();
    });
  }

  // NEW: Handle conversation with streaming support
  private async handleStreamingConversation(input: string): Promise<void> {
    this.cancellationRequested = false;
    this.isStreamingActive = true;
    this.streamingStartTime = Date.now();

    // Show initial progress
    if (this.options.showProgress !== false) {
      this.showStreamingIndicator("🤖 Claude is thinking...");
    } else {
      console.log("\n🤖 Claude:");
    }

    try {
      const conversationOptions: ConversationOptions = {
        maxIterations: 15,
        costBudget: this.options.costBudget,
        useExtendedContext: false,
        enablePromptCaching: true,
        enableStreaming: this.options.enableStreaming !== false,
        streamingOptions: {
          showProgress: this.options.showProgress !== false,
          enableTypewriter: this.options.typewriterEffect || false,
          onProgress: this.handleStreamingProgress.bind(this),
          onText: this.handleStreamingText.bind(this),
          onThinking: this.handleStreamingThinking.bind(this),
          onComplete: this.handleStreamingComplete.bind(this),
          onError: this.handleStreamingError.bind(this),
        },
        onProgress: this.handleStreamingProgress.bind(this),
        onStreamText: this.handleStreamingText.bind(this),
        onStreamThinking: this.handleStreamingThinking.bind(this),
      };

      const result = await this.conversationManager.executeWithTools(
        input,
        this.getAllTools(),
        conversationOptions
      );

      this.messageCount++;
      this.totalCost += result.totalCost;

      if (result.streamingDuration) {
        this.totalStreamingTime += result.streamingDuration;
      }

      if (!result.success || result.error) {
        console.log(
          "❌ Sorry, I encountered an error processing your message."
        );
        if (result.error) {
          console.log(`Error: ${result.error.message}`);
        }
      } else if (!this.cancellationRequested && result.response) {
        // Only show success message if not cancelled and response exists
        if (this.options.verbose && result.response.toolCalls.length > 0) {
          console.log(
            `\n🔧 Tools used: ${result.response.toolCalls.map((tc) => tc.name).join(", ")}`
          );
        }
      }
    } finally {
      this.isStreamingActive = false;
      this.hideStreamingIndicator();
    }
  }

  // NEW: Streaming event handlers
  private handleStreamingProgress(progress: StreamingProgress): void {
    if (this.cancellationRequested) return;

    const messages = {
      starting: "🔄 Starting...",
      streaming: "💬 Streaming response...",
      thinking: "🧠 Thinking deeply...",
      tool_use: "🛠️ Using tools...",
      complete: "✅ Complete!",
      error: "❌ Error occurred",
    };

    const message = messages[progress.phase] || "⏳ Processing...";

    if (progress.percentage !== undefined && progress.percentage > 0) {
      this.showStreamingIndicator(`${message} (${progress.percentage}%)`);
    } else {
      this.showStreamingIndicator(message);
    }
  }

  private handleStreamingText(text: string): void {
    if (this.cancellationRequested) return;

    this.hideStreamingIndicator();

    if (!this.options.typewriterEffect) {
      process.stdout.write(text);
    }
    // Note: typewriter effect is handled in StreamingManager
  }

  private handleStreamingThinking(thinking: string): void {
    if (this.cancellationRequested) return;

    if (this.options.verbose) {
      // Show abbreviated thinking in verbose mode
      const preview =
        thinking.length > 50 ? thinking.substring(0, 47) + "..." : thinking;
      this.showStreamingIndicator(`🧠 Thinking: ${preview}`);
    }
  }

  private handleStreamingComplete(): void {
    this.hideStreamingIndicator();
    console.log(); // New line after response
  }

  private handleStreamingError(error: Error): void {
    this.hideStreamingIndicator();
    console.log(`\n❌ Streaming error: ${error.message}`);
  }

  // NEW: Visual indicators for streaming
  private showStreamingIndicator(message: string): void {
    if (!process.stdout.isTTY || this.options.showProgress === false) return;

    this.hideStreamingIndicator();

    try {
      this.currentSpinner = ora({
        text: message,
        spinner: "dots",
        color: "cyan",
      }).start();
    } catch (error) {
      // Fallback if ora is not available
      console.log(`\r${message}`);
    }
  }

  private hideStreamingIndicator(): void {
    if (this.currentSpinner) {
      try {
        this.currentSpinner.stop();
        this.currentSpinner = undefined;
      } catch (error) {
        // Ignore errors when stopping spinner
      }
    }
  }

  private stopCurrentStreaming(): void {
    this.hideStreamingIndicator();

    if (this.conversationManager.isStreamingActive()) {
      this.conversationManager.stopStreaming();
    }

    this.isStreamingActive = false;

    if (this.streamingStartTime > 0) {
      this.totalStreamingTime += Date.now() - this.streamingStartTime;
    }
  }

  private displayHelp(): void {
    console.log("\n📖 Help - Interactive Agent Conversation");
    console.log("\n🤖 About the Agent:");
    console.log(
      "   • You're chatting with Claude 4 Sonnet, a powerful AI assistant"
    );
    console.log(
      "   • The agent has access to tools and can explore your project"
    );
    console.log(
      "   • It can read/write files, analyze structure, run commands, and search the web"
    );

    if (this.options.enableStreaming !== false) {
      console.log("\n⚡ Streaming Features:");
      console.log("   • Responses stream in real-time for faster interaction");
      console.log("   • Progress indicators show what Claude is doing");
      if (this.options.enableCancellation !== false) {
        console.log(
          "   • Press CTRL+C during responses to cancel and continue"
        );
      }
      if (this.options.typewriterEffect) {
        console.log(
          "   • Typewriter effect for a more natural conversation feel"
        );
      }
    }

    console.log("\n💡 Tips for effective conversation:");
    console.log("   • Be specific about what you want to accomplish");
    console.log(
      "   • Ask the agent to analyze your project first to understand the context"
    );
    console.log(
      "   • You can ask for code reviews, suggestions, or help with implementation"
    );
    console.log(
      "   • The agent can help plan features, debug issues, or improve code quality"
    );
    console.log("\n🛠️  Available Tools:");
    console.log("   • get_project_tree: Analyze project structure");
    console.log("   • read_files: Read and examine files");
    console.log("   • write_files: Create or modify files");
    console.log("   • run_command: Execute shell commands");
    if (this.webSearchTool) {
      console.log(
        "   • web_search: Search for documentation or best practices"
      );
    }
    console.log("\n⌨️  Commands:");
    console.log("   • 'quit' or 'exit': End the conversation");
    console.log("   • 'cost': Show current usage costs");
    console.log("   • 'help': Show this help message");
    if (
      this.options.enableStreaming !== false &&
      this.options.enableCancellation !== false
    ) {
      console.log("   • CTRL+C: Cancel current streaming response");
    }
  }

  private setupWebSearch(): void {
    if (this.options.enableWebSearch !== false) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        this.webSearchTool = new WebSearchTool(apiKey);
        this.toolManager.registerTool("web_search", this.webSearchTool);
        Logger.info("Web search enabled for interactive conversation");
      } else {
        Logger.warn("Web search disabled: ANTHROPIC_API_KEY not found");
      }
    }
  }

  private getAllTools(): Tool[] {
    const toolNames = this.toolManager.getAllToolNames();
    const tools: Tool[] = [];

    for (const name of toolNames) {
      const tool = this.toolManager.getTool(name);
      if (tool) {
        const enhancedTool = {
          name: tool.name || name,
          description: tool.description || this.getToolDescription(name),
          schema: tool.schema || this.getToolSchema(name),
          execute: async (params: unknown) => {
            return await this.toolManager.executeTool(name, params);
          },
        };
        tools.push(enhancedTool);
      }
    }

    Logger.debug("Available tools for interactive conversation", {
      conversationId: this.conversationId,
      toolCount: tools.length,
      tools: tools.map((t) => t.name),
    });

    return tools;
  }

  private getToolDescription(toolName: string): string {
    const descriptions: Record<string, string> = {
      get_project_tree:
        "Analyze project structure using tree command with intelligent exclusions",
      read_files:
        "Read multiple files and return their contents with error handling",
      write_files: "Write multiple files atomically with rollback protection",
      run_command: "Execute shell commands with timeout and error handling",
      web_search:
        "Search the web for current information, documentation, and best practices",
    };

    return descriptions[toolName] || `Execute ${toolName} tool`;
  }

  private getToolSchema(toolName: string): any {
    const schemas: Record<string, any> = {
      get_project_tree: {
        type: "object",
        properties: {
          path: { type: "string", description: "Project path to analyze" },
        },
        required: [],
      },
      read_files: {
        type: "object",
        properties: {
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Array of file paths to read",
          },
        },
        required: ["paths"],
      },
      write_files: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "File path" },
                content: { type: "string", description: "File content" },
              },
              required: ["path", "content"],
            },
            description: "Array of files to write",
          },
        },
        required: ["files"],
      },
      run_command: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          timeout: { type: "number", description: "Timeout in milliseconds" },
        },
        required: ["command"],
      },
      web_search: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          maxResults: { type: "number", description: "Maximum results" },
          focus: {
            type: "string",
            enum: [
              "documentation",
              "best-practices",
              "current-info",
              "troubleshooting",
              "general",
            ],
            description: "Focus area for search",
          },
        },
        required: ["query"],
      },
    };

    return (
      schemas[toolName] || {
        type: "object",
        properties: {},
        required: [],
      }
    );
  }

  private generateConversationId(): string {
    return `interactive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanup(): void {
    try {
      this.stopCurrentStreaming();
      this.rl?.close();
      this.conversationManager?.clear();
      Logger.info("Interactive conversation cleaned up", {
        conversationId: this.conversationId,
        totalCost: this.totalCost,
        messageCount: this.messageCount,
        totalStreamingTime: this.totalStreamingTime,
      });
    } catch (error) {
      Logger.warn("Error during cleanup", {
        conversationId: this.conversationId,
        error: (error as Error).message,
      });
    }
  }
}

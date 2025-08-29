import {
  ConversationManager,
  ConversationOptions,
} from "./ConversationManager";
import { ToolManager, Tool } from "../tools/ToolManager";
import { WebSearchTool } from "../tools/web/WebSearchTool";
import { AnthropicConfigManager } from "../config/AnthropicConfig";
import { Logger } from "../logging/Logger";
import * as readline from "readline";

export interface InteractiveConversationOptions {
  workingDirectory: string;
  verbose?: boolean;
  enableWebSearch?: boolean;
  costBudget?: number;
}

export interface InteractiveConversationResult {
  success: boolean;
  error?: string;
  totalCost: number;
  messageCount: number;
  conversationId: string;
}

/**
 * InteractiveConversationManager provides a direct chat interface with Claude
 * that has access to all agent tools during the conversation.
 */
export class InteractiveConversationManager {
  private conversationManager: ConversationManager;
  private toolManager: ToolManager;
  private webSearchTool?: WebSearchTool;
  private rl: readline.Interface;
  private options: InteractiveConversationOptions;
  private totalCost: number = 0;
  private messageCount: number = 0;
  private conversationId: string;

  constructor(options: InteractiveConversationOptions) {
    this.options = options;
    this.conversationId = this.generateConversationId();

    // Validate API key
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    // Initialize conversation manager with Claude 4 Sonnet
    const configManager = new AnthropicConfigManager({
      enableExtendedContext: false,
      enableWebSearch: options.enableWebSearch !== false,
    });

    this.conversationManager = new ConversationManager(
      configManager.getConfig()
    );

    // Initialize tool manager with all available tools
    this.toolManager = new ToolManager();
    this.setupWebSearch();

    // Setup readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "\n💭 You: ",
    });

    Logger.info("InteractiveConversationManager initialized", {
      conversationId: this.conversationId,
      workingDirectory: options.workingDirectory,
      enableWebSearch: options.enableWebSearch,
    });
  }

  async startInteractiveConversation(): Promise<InteractiveConversationResult> {
    try {
      Logger.info("Starting interactive conversation with Claude agent", {
        conversationId: this.conversationId,
      });

      // Display welcome message
      this.displayWelcome();

      // Start the conversation loop
      await this.conversationLoop();

      return {
        success: true,
        totalCost: this.totalCost,
        messageCount: this.messageCount,
        conversationId: this.conversationId,
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
    console.log("\n" + "=".repeat(68));
  }

  private async conversationLoop(): Promise<void> {
    return new Promise((resolve, reject) => {
      const handleInput = async (input: string) => {
        const trimmed = input.trim();

        // Handle special commands
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
          // Check cost budget
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

          // Send message to Claude with tools
          console.log("\n🤖 Claude (thinking...)\n");

          const result = await this.conversationManager.executeWithTools(
            trimmed,
            this.getAllTools(),
            {
              maxIterations: 15, // Limited iterations for interactive use
              costBudget: this.options.costBudget,
              useExtendedContext: false,
              enablePromptCaching: true,
            }
          );

          this.messageCount++;
          this.totalCost += result.totalCost;

          if (result.success && result.response) {
            // Display Claude's response
            console.log("🤖 Claude:");
            console.log(result.response.textContent);

            // Show tool usage if verbose
            if (this.options.verbose && result.response.toolCalls.length > 0) {
              console.log(
                `\n🔧 Tools used: ${result.response.toolCalls.map((tc) => tc.name).join(", ")}`
              );
            }
          } else {
            console.log(
              "❌ Sorry, I encountered an error processing your message."
            );
            if (result.error) {
              console.log(`Error: ${result.error.message}`);
            }
          }
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

      // Start with initial prompt
      this.rl.prompt();
    });
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
      this.rl?.close();
      this.conversationManager?.clear();
      Logger.info("Interactive conversation cleaned up", {
        conversationId: this.conversationId,
        totalCost: this.totalCost,
        messageCount: this.messageCount,
      });
    } catch (error) {
      Logger.warn("Error during cleanup", {
        conversationId: this.conversationId,
        error: (error as Error).message,
      });
    }
  }
}

import { ToolManager } from "../tools/ToolManager";
import { ProjectAnalyzer } from "./ProjectAnalyzer";
import { ConversationManager } from "./ConversationManager";
import { AnthropicConfigManager } from "../config/AnthropicConfig";
import { Logger } from "../logging/Logger";
import {
  ConversationPersistence,
  ConversationState,
} from "./ConversationPersistence";
import { AgentSession, AgentSessionOptions } from "../agent/AgentSession";
import { OutputFormatter } from "../cli/utils/output";
import * as readline from "readline";
import { ProjectContext } from "./ConversationAgent";

export interface LimitedConversationOptions {
  workingDirectory: string;
  verbose?: boolean;
  costBudget?: number;
  enableStreaming?: boolean;
  showProgress?: boolean;
  conversationId?: string;
}

export interface ConversationResult {
  success: boolean;
  error?: string;
  totalCost: number;
  messageCount: number;
  conversationId: string;
  visionExecuted?: boolean;
  executionResult?: any;
}

/**
 * LimitedConversationAgent provides a conversation interface with limited tools.
 * It can only read files and analyze projects, but cannot write files or execute commands.
 * When the user types 'breathe', it synthesizes the conversation into a vision
 * and passes it to the execution agent.
 */
export class LimitedConversationAgent {
  private conversationManager: ConversationManager;
  private toolManager: ToolManager;
  private projectAnalyzer: ProjectAnalyzer;
  private persistence: ConversationPersistence;
  private rl!: readline.Interface;
  private options: LimitedConversationOptions;
  private totalCost: number = 0;
  private messageCount: number = 0;
  private conversationId: string;
  private conversationHistory: Array<{
    role: string;
    content: string;
    timestamp: Date;
  }> = [];
  private projectContext?: ProjectContext;
  private isStreamingActive: boolean = false;
  private cancellationRequested: boolean = false;

  // Define allowed tools for conversation agent (read-only)
  private readonly ALLOWED_TOOLS = ["get_project_tree", "read_files"];

  constructor(options: LimitedConversationOptions) {
    this.options = options;
    this.conversationId =
      options.conversationId || this.generateConversationId();
    this.persistence = new ConversationPersistence();

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    const configManager = new AnthropicConfigManager({
      enableExtendedContext: false,
      enableWebSearch: false, // Disabled for conversation agent
      enableStreaming: options.enableStreaming !== false,
      showProgressIndicators: options.showProgress !== false,
    });

    this.conversationManager = new ConversationManager(
      configManager.getConfig()
    );

    this.toolManager = new ToolManager();
    this.projectAnalyzer = new ProjectAnalyzer(options.workingDirectory);
    this.setupReadlineInterface();

    Logger.info("LimitedConversationAgent initialized", {
      conversationId: this.conversationId,
      workingDirectory: options.workingDirectory,
      allowedTools: this.ALLOWED_TOOLS,
    });
  }

  private setupReadlineInterface(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "\n💭 You: ",
    });

    // Setup cancellation handling
    process.on("SIGINT", () => {
      if (this.isStreamingActive) {
        this.cancellationRequested = true;
        console.log(
          '\n\n🛑 Conversation cancelled. Type "quit" to exit or continue chatting...\n'
        );
        this.rl.prompt();
      } else {
        console.log("\n👋 Goodbye!");
        process.exit(0);
      }
    });
  }

  async startConversation(): Promise<ConversationResult> {
    try {
      Logger.info("Starting limited conversation with agent", {
        conversationId: this.conversationId,
      });

      // Try to restore previous conversation state
      const existingState = await this.persistence.loadConversation(
        this.conversationId
      );
      if (existingState) {
        this.conversationHistory = existingState.conversationHistory;
        this.projectContext = existingState.projectContext;
        this.totalCost = existingState.totalCost;
        this.messageCount = existingState.messageCount;

        console.log(
          `\n🔄 Restored conversation from ${existingState.lastUpdated.toLocaleString()}`
        );
        console.log(
          `📊 Previous session: ${this.messageCount} messages, $${this.totalCost.toFixed(4)} cost`
        );
      }

      this.displayWelcome();

      // Only analyze project if we don't have cached context
      if (!this.projectContext) {
        console.log("\n🔍 Analyzing your project (first time only)...");
        this.projectContext = await this.projectAnalyzer.analyzeProject();
        console.log("✅ Project analysis complete and cached!\n");
      } else {
        console.log(
          "\n✅ Using cached project analysis (no re-analysis needed)\n"
        );
      }

      const result = await this.conversationLoop();

      // Save final conversation state
      await this.saveConversationState();

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      Logger.error("Limited conversation failed", {
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
    console.log("🤖   Welcome to a2s2 Conversational Agent!");
    console.log("🤖 " + "=".repeat(60));
    console.log(
      "\n💡 You're chatting with Claude 4 Sonnet - a conversation agent with LIMITED access to:"
    );
    console.log("   📁 File reading (read-only)");
    console.log("   🌳 Project structure analysis");
    console.log("   🔍 No file writing or command execution");

    console.log(
      "\n🎯 This agent helps you plan and discuss your project before execution."
    );
    console.log("\n⌨️  Commands:");
    console.log("   • Type your message and press Enter to chat");
    console.log(
      "   • Type 'breathe' to synthesize conversation and start autonomous execution"
    );
    console.log("   • Type 'quit' or 'exit' to end the conversation");
    console.log("   • Type 'cost' to see current usage costs");
    console.log("   • Type 'help' for more information");
    console.log("\n" + "=".repeat(68));

    if (this.conversationHistory.length > 0) {
      console.log(
        "\n📝 Previous conversation context available. You can continue where you left off."
      );
    }
  }

  private async conversationLoop(): Promise<ConversationResult> {
    return new Promise((resolve, reject) => {
      const handleInput = async (input: string) => {
        const trimmed = input.trim();

        if (
          trimmed.toLowerCase() === "quit" ||
          trimmed.toLowerCase() === "exit"
        ) {
          console.log("\n👋 Thanks for chatting! Goodbye!");
          resolve({
            success: true,
            totalCost: this.totalCost,
            messageCount: this.messageCount,
            conversationId: this.conversationId,
          });
          return;
        }

        if (trimmed.toLowerCase() === "breathe") {
          console.log(
            "\n🌬️  Breathe command detected! Synthesizing conversation..."
          );
          const vision = await this.synthesizeVision();

          console.log("\n📋 Generated Vision:");
          console.log("─".repeat(60));
          console.log(OutputFormatter.colorize("cyan", vision));
          console.log("─".repeat(60));

          const confirmed = await this.confirmVision(vision);
          if (confirmed) {
            const executionResult = await this.executeVision(vision);
            resolve({
              success: true,
              totalCost: this.totalCost,
              messageCount: this.messageCount,
              conversationId: this.conversationId,
              visionExecuted: true,
              executionResult,
            });
          } else {
            console.log(
              "\n💭 Vision cancelled. Continue the conversation or type 'quit' to exit."
            );
            this.rl.prompt();
          }
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
          if (
            this.options.costBudget &&
            this.totalCost >= this.options.costBudget
          ) {
            console.log(
              `\n⚠️  Cost budget of $${this.options.costBudget} reached. Ending conversation.`
            );
            resolve({
              success: true,
              totalCost: this.totalCost,
              messageCount: this.messageCount,
              conversationId: this.conversationId,
            });
            return;
          }

          await this.handleConversationMessage(trimmed);

          // Save conversation state periodically
          await this.saveConversationState();
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
        resolve({
          success: true,
          totalCost: this.totalCost,
          messageCount: this.messageCount,
          conversationId: this.conversationId,
        });
      });

      this.rl.prompt();
    });
  }

  private async handleConversationMessage(input: string): Promise<void> {
    this.cancellationRequested = false;
    this.isStreamingActive = true;

    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: input,
      timestamp: new Date(),
    });

    // Show progress
    if (this.options.showProgress !== false) {
      console.log("\n🤖 Claude:");
    }

    try {
      const tools = this.getLimitedTools();

      // FIXED: Build conversational context instead of treating input as autonomous task
      const conversationalContext = this.buildConversationalContext(input);

      const conversationOptions = {
        maxIterations: 5, // Allow tool use + response (not just 1)
        useConversationalMode: true, // NEW FLAG: Use conversational system prompt
        costBudget: this.options.costBudget,
        useExtendedContext: false,
        enablePromptCaching: true,
        enableStreaming: this.options.enableStreaming !== false,
        streamingOptions: {
          showProgress: this.options.showProgress !== false,
          onText: (text: string) => {
            if (!this.cancellationRequested) {
              process.stdout.write(text);
            }
          },
          onComplete: () => {
            console.log(); // New line after response
          },
        },
      };

      // FIXED: Use conversational context instead of direct input
      const result = await this.conversationManager.executeWithTools(
        conversationalContext,
        tools,
        conversationOptions
      );

      this.messageCount++;
      this.totalCost += result.totalCost;

      // Add assistant response to history
      if (result.response && result.response.textContent) {
        this.conversationHistory.push({
          role: "assistant",
          content: result.response.textContent,
          timestamp: new Date(),
        });
      }

      if (!result.success || result.error) {
        console.log(
          "\n❌ Sorry, I encountered an error processing your message."
        );
        if (result.error) {
          console.log(`Error: ${result.error.message}`);
        }
      }
    } finally {
      this.isStreamingActive = false;
    }
  }

  // NEW METHOD: Build conversational context from user input
  private buildConversationalContext(userInput: string): string {
    const projectSummary = this.buildProjectSummary();
    const recentConversation = this.conversationHistory
      .slice(-6) // Last 3 exchanges (user + assistant pairs)
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    return `Project Context:
${projectSummary}

Recent Conversation:
${recentConversation}

Current User Message: "${userInput}"

Please respond conversationally to help the user with their project. Use tools if they would help answer their question or request.`;
  }

  private async synthesizeVision(): Promise<string> {
    // Build a comprehensive vision from the conversation history
    const conversationSummary = this.buildConversationSummary();
    const projectSummary = this.buildProjectSummary();

    const synthesisPrompt = `
Based on our conversation, synthesize a clear and comprehensive vision for autonomous execution.

Project Context:
${projectSummary}

Conversation Summary:
${conversationSummary}

Please create a detailed vision that captures:
1. The main goal/objective
2. Specific requirements discussed
3. Technical considerations
4. Any constraints or preferences mentioned

Provide a clear, actionable vision that an autonomous agent can execute:`;

    try {
      const tools = this.getLimitedTools();

      const result = await this.conversationManager.executeWithTools(
        synthesisPrompt,
        tools,
        {
          maxIterations: 3,
          useConversationalMode: true, // Use conversational mode for synthesis too
          costBudget: 5.0,
          useExtendedContext: false,
          enableStreaming: false,
        }
      );

      this.totalCost += result.totalCost;

      return (
        result.response?.textContent ||
        "Create a solution based on our conversation."
      );
    } catch (error) {
      Logger.error("Vision synthesis failed", {
        conversationId: this.conversationId,
        error: String(error),
      });
      return "Create a solution based on our conversation.";
    }
  }

  private buildConversationSummary(): string {
    if (this.conversationHistory.length === 0) {
      return "No previous conversation.";
    }

    const recentMessages = this.conversationHistory.slice(-10); // Last 10 messages
    return recentMessages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n\n");
  }

  private buildProjectSummary(): string {
    if (!this.projectContext) {
      return "No project context available.";
    }

    return `
Directory: ${this.projectContext.directory}
Tech Stack: ${this.projectContext.techStack.join(", ")}
Key Files: ${this.projectContext.keyFiles.slice(0, 5).join(", ")}
Patterns: ${this.projectContext.patterns.join(", ")}
`;
  }

  private async confirmVision(vision: string): Promise<boolean> {
    return new Promise((resolve) => {
      const askConfirmation = () => {
        this.rl.question(
          "\n🤔 Execute this vision? (y/n/edit): ",
          (answer: string) => {
            const response = answer.toLowerCase().trim();

            if (response === "y" || response === "yes") {
              resolve(true);
            } else if (response === "n" || response === "no") {
              console.log("❌ Vision execution cancelled");
              resolve(false);
            } else if (response === "edit") {
              console.log(
                "📝 Vision editing not implemented yet. Please continue the conversation to refine the requirements."
              );
              resolve(false);
            } else {
              console.log(
                "Please answer 'y' for yes, 'n' for no, or 'edit' to modify:"
              );
              askConfirmation();
            }
          }
        );
      };

      askConfirmation();
    });
  }

  private async executeVision(vision: string): Promise<any> {
    console.log("\n🚀 Starting autonomous execution...");
    console.log("─".repeat(60));

    try {
      const agentOptions: AgentSessionOptions = {
        vision,
        workingDirectory: this.options.workingDirectory,
        phase: "EXPLORE",
        maxIterations: 50,
        costBudget: 50.0,
        enableWebSearch: true,
        enableExtendedContext: false,
        enableStreaming: true,
        showProgress: true,
      };

      const agentSession = new AgentSession(agentOptions);
      const result = await agentSession.execute(agentOptions);

      // Update our total cost to include execution cost
      this.totalCost += result.totalCost;

      console.log("\n📊 Execution Results:");
      console.log(`✅ Success: ${result.success}`);
      console.log(`💰 Cost: $${result.totalCost.toFixed(4)}`);
      console.log(`🔄 Iterations: ${result.iterationCount}`);
      console.log(`⏱️  Duration: ${(result.duration / 1000).toFixed(1)}s`);

      agentSession.cleanup();

      return result;
    } catch (error) {
      console.log(
        `❌ Execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { success: false, error: String(error) };
    }
  }

  private displayHelp(): void {
    console.log("\n📖 Help - Limited Conversation Agent");
    console.log("\n🤖 About this agent:");
    console.log(
      "   • This is a CONVERSATION-ONLY agent with limited capabilities"
    );
    console.log(
      "   • It can read files and analyze your project, but cannot modify anything"
    );
    console.log(
      "   • Use this to discuss and plan before autonomous execution"
    );

    console.log("\n🌬️  The 'breathe' command:");
    console.log(
      "   • Type 'breathe' to synthesize the conversation into a vision"
    );
    console.log(
      "   • The agent will create an execution plan from your discussion"
    );
    console.log(
      "   • You can approve the vision before autonomous execution begins"
    );
    console.log("   • This is the ONLY way to transition to execution mode");

    console.log("\n💡 Tips for effective conversation:");
    console.log("   • Describe what you want to accomplish");
    console.log("   • Ask about your project structure and current state");
    console.log("   • Discuss technical approaches and preferences");
    console.log("   • Clarify requirements and constraints");
    console.log("   • When ready, type 'breathe' to move to execution");

    console.log("\n🛠️  Available tools (read-only):");
    console.log("   • get_project_tree: Analyze project structure");
    console.log("   • read_files: Read and examine files");
    console.log("   • NO file writing or command execution tools");
  }

  private getLimitedTools() {
    // Return only the limited tools available to this agent
    const tools: any[] = [];

    for (const name of this.ALLOWED_TOOLS) {
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

    Logger.debug("Limited tools prepared for conversation", {
      conversationId: this.conversationId,
      availableTools: tools.map((t) => t.name),
    });

    return tools;
  }

  private getToolDescription(toolName: string): string {
    const descriptions: Record<string, string> = {
      get_project_tree:
        "Analyze project structure using tree command with intelligent exclusions",
      read_files:
        "Read multiple files and return their contents with error handling",
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
    };

    return (
      schemas[toolName] || {
        type: "object",
        properties: {},
        required: [],
      }
    );
  }

  private async saveConversationState(): Promise<void> {
    if (!this.projectContext) return;

    const state: ConversationState = {
      conversationId: this.conversationId,
      workingDirectory: this.options.workingDirectory,
      conversationHistory: this.conversationHistory,
      projectContext: this.projectContext,
      totalCost: this.totalCost,
      messageCount: this.messageCount,
      lastUpdated: new Date(),
    };

    try {
      await this.persistence.saveConversation(state);
    } catch (error) {
      Logger.warn("Failed to save conversation state", {
        conversationId: this.conversationId,
        error: String(error),
      });
    }
  }

  private generateConversationId(): string {
    return `limited_conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanup(): void {
    try {
      this.rl?.close();
      this.conversationManager?.clear();
      Logger.info("Limited conversation cleaned up", {
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

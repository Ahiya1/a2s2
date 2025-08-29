import {
  LimitedConversationAgent,
  LimitedConversationOptions,
} from "./LimitedConversationAgent";
import { Logger } from "../logging/Logger";

export interface InteractiveConversationOptions {
  workingDirectory: string;
  verbose?: boolean;
  enableWebSearch?: boolean;
  costBudget?: number;
  // Streaming options
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
  // Streaming results
  wasStreamed?: boolean;
  totalStreamingTime?: number;
  // Vision execution results
  visionExecuted?: boolean;
  executionResult?: any;
}

/**
 * InteractiveConversationManager provides the CLI interface for interactive conversations.
 * It delegates all conversation logic to LimitedConversationAgent.
 * This is a thin wrapper that handles interface translation between CLI options
 * and the conversation agent.
 */
export class InteractiveConversationManager {
  private limitedAgent: LimitedConversationAgent;
  private options: InteractiveConversationOptions;
  private conversationId: string;

  constructor(options: InteractiveConversationOptions) {
    this.options = options;

    // Convert InteractiveConversationOptions to LimitedConversationOptions
    const agentOptions: LimitedConversationOptions = {
      workingDirectory: options.workingDirectory,
      verbose: options.verbose,
      costBudget: options.costBudget,
      enableStreaming: options.enableStreaming !== false, // Default to true
      showProgress: options.showProgress !== false, // Default to true
    };

    this.limitedAgent = new LimitedConversationAgent(agentOptions);
    this.conversationId = this.generateConversationId();

    Logger.info("InteractiveConversationManager initialized", {
      conversationId: this.conversationId,
      workingDirectory: options.workingDirectory,
      enableWebSearch: false, // Always false for limited agent
      streamingEnabled: options.enableStreaming !== false,
      progressEnabled: options.showProgress !== false,
    });
  }

  async startInteractiveConversation(): Promise<InteractiveConversationResult> {
    try {
      Logger.info("Starting interactive conversation with limited agent", {
        conversationId: this.conversationId,
      });

      // Delegate to LimitedConversationAgent
      const result = await this.limitedAgent.startConversation();

      // Convert result format from ConversationResult to InteractiveConversationResult
      const interactiveResult: InteractiveConversationResult = {
        success: result.success,
        error: result.error,
        totalCost: result.totalCost,
        messageCount: result.messageCount,
        conversationId: result.conversationId,
        // Streaming results (best effort based on what we know)
        wasStreamed: this.options.enableStreaming !== false,
        totalStreamingTime: 0, // LimitedAgent doesn't track this separately
        // Vision execution results
        visionExecuted: result.visionExecuted,
        executionResult: result.executionResult,
      };

      Logger.info("Interactive conversation completed", {
        conversationId: this.conversationId,
        success: interactiveResult.success,
        totalCost: interactiveResult.totalCost,
        messageCount: interactiveResult.messageCount,
        visionExecuted: interactiveResult.visionExecuted,
      });

      return interactiveResult;
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
        totalCost: 0,
        messageCount: 0,
        conversationId: this.conversationId,
        wasStreamed: false,
        totalStreamingTime: 0,
      };
    }
  }

  private generateConversationId(): string {
    return `interactive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

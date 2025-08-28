import Anthropic from "@anthropic-ai/sdk";
import {
  AnthropicConfig,
  AnthropicConfigManager,
} from "../config/AnthropicConfig";
import { ErrorHandler, AnthropicError } from "./ErrorHandler";
import { MessageBuilder, ConversationMessage } from "./MessageBuilder";
import { ResponseParser, ParsedResponse, ToolCall } from "./ResponseParser";
import { CostOptimizer, TokenUsage, CostCalculation } from "./CostOptimizer";
import { Tool } from "../tools/ToolManager";
import { Logger } from "../logging/Logger";

export interface ConversationOptions {
  useExtendedContext?: boolean;
  enablePromptCaching?: boolean;
  maxIterations?: number;
  costBudget?: number;
}

export interface ConversationResult {
  success: boolean;
  response?: ParsedResponse;
  error?: AnthropicError;
  iterationCount: number;
  totalCost: number;
  conversationId: string;
}

export interface ToolExecutionResult {
  toolCall: ToolCall;
  result: string;
  success: boolean;
  error?: string;
}

export class ConversationManager {
  private anthropic: Anthropic;
  private configManager: AnthropicConfigManager;
  private errorHandler: ErrorHandler;
  private messageBuilder: MessageBuilder;
  private costOptimizer: CostOptimizer;
  private conversationId: string;

  constructor(config?: Partial<AnthropicConfig>) {
    this.configManager = new AnthropicConfigManager(config);
    this.anthropic = new Anthropic({
      apiKey: this.configManager.getConfig().apiKey,
    });

    this.errorHandler = new ErrorHandler({
      maxRetries: this.configManager.getConfig().maxRetries,
      baseDelay: this.configManager.getConfig().baseRetryDelay,
      maxDelay: 60000,
      jitterFactor: 0.1,
    });

    this.messageBuilder = new MessageBuilder();
    this.costOptimizer = new CostOptimizer();
    this.conversationId = this.generateConversationId();

    Logger.info("ConversationManager initialized", {
      conversationId: this.conversationId,
      model: this.configManager.getConfig().model,
    });
  }

  async executeWithTools(
    prompt: string,
    tools: Tool[],
    options: ConversationOptions = {}
  ): Promise<ConversationResult> {
    const startTime = Date.now();
    let iterationCount = 0;
    const maxIterations = options.maxIterations || 50;

    Logger.info("Starting conversation with tools", {
      conversationId: this.conversationId,
      toolCount: tools.length,
      promptLength: prompt.length,
      maxIterations,
    });

    try {
      // Build initial system message
      const systemMessage = this.messageBuilder.buildSystemPrompt({
        vision: prompt,
        workingDirectory: process.cwd(),
        tools,
        context: this.gatherAdditionalContext(),
      });

      let totalCost = 0;
      let lastResponse: ParsedResponse | undefined;

      // Main conversation loop
      while (iterationCount < maxIterations) {
        iterationCount++;

        Logger.debug(
          `Conversation iteration ${iterationCount}/${maxIterations}`,
          {
            conversationId: this.conversationId,
          }
        );

        // Make API request with error handling
        const response = await this.errorHandler.executeWithRetry(
          () => this.makeClaudeRequest(tools, options),
          `claude_request_${iterationCount}`,
          { conversationId: this.conversationId, iteration: iterationCount }
        );

        // Parse response
        lastResponse = ResponseParser.parse(response);

        // Track costs
        const costCalculation = this.costOptimizer.calculateCost(
          lastResponse.usage,
          this.messageBuilder.estimateTokenCount()
        );
        totalCost += costCalculation.totalCost;

        Logger.info(`Iteration ${iterationCount} completed`, {
          conversationId: this.conversationId,
          cost: costCalculation.totalCost.toFixed(4),
          totalCost: totalCost.toFixed(4),
          toolCalls: lastResponse.toolCalls.length,
          stopReason: lastResponse.stopReason,
        });

        // Add assistant response to conversation
        this.messageBuilder.addAssistantMessage(
          lastResponse.textContent,
          lastResponse.thinkingContent
        );

        // Check for completion
        if (ResponseParser.isComplete(response)) {
          Logger.info("Conversation completed naturally", {
            conversationId: this.conversationId,
            iterations: iterationCount,
            totalCost: totalCost.toFixed(4),
          });
          break;
        }

        // Execute tool calls if present
        if (lastResponse.toolCalls.length > 0) {
          const toolResults = await this.executeToolCalls(
            lastResponse.toolCalls,
            tools
          );

          // Add tool results to conversation
          if (toolResults.length === 1) {
            this.messageBuilder.addToolResult(
              toolResults[0].toolCall.id,
              toolResults[0].result
            );
          } else {
            this.messageBuilder.addMultipleToolResults(
              toolResults.map((tr) => ({
                toolUseId: tr.toolCall.id,
                result: tr.result,
              }))
            );
          }

          // Check for completion tool
          const hasCompletionTool = toolResults.some(
            (tr) => tr.toolCall.name === "report_complete" && tr.success
          );

          if (hasCompletionTool) {
            Logger.info("Conversation completed via completion tool", {
              conversationId: this.conversationId,
              iterations: iterationCount,
              totalCost: totalCost.toFixed(4),
            });
            break;
          }
        }

        // Budget check
        if (options.costBudget && totalCost > options.costBudget) {
          Logger.warn("Cost budget exceeded", {
            conversationId: this.conversationId,
            totalCost: totalCost.toFixed(4),
            budget: options.costBudget,
          });
          throw new AnthropicError(
            "budget_exceeded",
            `Cost budget of $${options.costBudget} exceeded (actual: $${totalCost.toFixed(4)})`
          );
        }

        // Context management
        this.messageBuilder.pruneContextIfNeeded(180000);
      }

      // Handle max iterations reached
      if (iterationCount >= maxIterations) {
        Logger.warn("Max iterations reached", {
          conversationId: this.conversationId,
          maxIterations,
          totalCost: totalCost.toFixed(4),
        });
      }

      const duration = Date.now() - startTime;
      Logger.info("Conversation finished", {
        conversationId: this.conversationId,
        iterations: iterationCount,
        duration: `${(duration / 1000).toFixed(1)}s`,
        totalCost: totalCost.toFixed(4),
        success: true,
      });

      return {
        success: true,
        response: lastResponse,
        iterationCount,
        totalCost,
        conversationId: this.conversationId,
      };
    } catch (error) {
      const anthropicError =
        error instanceof AnthropicError
          ? error
          : new AnthropicError(
              "unknown_error",
              (error as Error).message,
              undefined,
              undefined,
              error as Error
            );

      Logger.error("Conversation failed", {
        conversationId: this.conversationId,
        error: anthropicError.message,
        errorCode: anthropicError.code,
        iterations: iterationCount,
      });

      return {
        success: false,
        error: anthropicError,
        iterationCount,
        totalCost: this.costOptimizer.trackSessionCosts().totalCost,
        conversationId: this.conversationId,
      };
    }
  }

  private async makeClaudeRequest(
    tools: Tool[],
    options: ConversationOptions
  ): Promise<any> {
    const config = this.configManager.getRequestConfig();
    const messages = this.messageBuilder.getMessages();

    // Apply cost optimizations
    const optimizedMessages = options.enablePromptCaching
      ? this.costOptimizer.enablePromptCaching(messages)
      : messages;

    // Update config for extended context if needed
    if (options.useExtendedContext) {
      this.configManager.updateConfig({ enableExtendedContext: true });
    }

    const request = {
      model: config.model,
      max_tokens: config.max_tokens,
      thinking: {
        type: "enabled" as const,
        budget_tokens: config.thinking.budget_tokens,
      },
      messages: optimizedMessages,
      tools: this.formatToolsForClaude(tools),
      betas: this.configManager.getBetaHeaders(),
    };

    Logger.debug("Making Claude API request", {
      conversationId: this.conversationId,
      messageCount: optimizedMessages.length,
      toolCount: tools.length,
      betaHeaders: request.betas,
    });

    const response = await this.anthropic.beta.messages.create(request);
    return response;
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    tools: Tool[]
  ): Promise<ToolExecutionResult[]> {
    Logger.debug(`Executing ${toolCalls.length} tool calls`, {
      conversationId: this.conversationId,
      toolNames: toolCalls.map((tc) => tc.name),
    });

    const results: ToolExecutionResult[] = [];

    // Execute tool calls in parallel for efficiency
    const executionPromises = toolCalls.map(
      async (toolCall): Promise<ToolExecutionResult> => {
        const tool = tools.find((t) => (t.name || "") === toolCall.name);

        if (!tool) {
          const errorMsg = `Tool '${toolCall.name}' not found`;
          Logger.error(errorMsg, {
            conversationId: this.conversationId,
            toolCall,
          });
          return {
            toolCall,
            result: errorMsg,
            success: false,
            error: errorMsg,
          };
        }

        try {
          Logger.debug(`Executing tool: ${toolCall.name}`, {
            conversationId: this.conversationId,
            parameters: toolCall.parameters,
          });

          const result = await tool.execute(toolCall.parameters);

          Logger.debug(`Tool executed successfully: ${toolCall.name}`, {
            conversationId: this.conversationId,
            resultLength: result.length,
          });

          return {
            toolCall,
            result,
            success: true,
          };
        } catch (error) {
          const errorMsg = `Tool execution failed: ${(error as Error).message}`;
          Logger.error(errorMsg, {
            conversationId: this.conversationId,
            toolName: toolCall.name,
            error: (error as Error).message,
          });

          return {
            toolCall,
            result: errorMsg,
            success: false,
            error: errorMsg,
          };
        }
      }
    );

    const executionResults = await Promise.all(executionPromises);
    results.push(...executionResults);

    const successCount = results.filter((r) => r.success).length;
    Logger.info(`Tool execution completed`, {
      conversationId: this.conversationId,
      total: results.length,
      successful: successCount,
      failed: results.length - successCount,
    });

    return results;
  }

  private formatToolsForClaude(tools: Tool[]): any[] {
    return tools.map((tool) => ({
      name: tool.name || "unknown_tool",
      description: tool.description || `Execute ${tool.name || "unknown tool"}`,
      input_schema: {
        type: "object",
        properties: tool.schema?.properties || {},
        required: tool.schema?.required || [],
      },
    }));
  }

  private gatherAdditionalContext(): string {
    const context = [
      `Working directory: ${process.cwd()}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Conversation ID: ${this.conversationId}`,
    ];

    return context.join("\n");
  }

  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public utility methods
  getConversationId(): string {
    return this.conversationId;
  }

  getConversationSummary() {
    return this.messageBuilder.getConversationSummary();
  }

  getCostTracking() {
    return this.costOptimizer.trackSessionCosts();
  }

  clear(): void {
    this.messageBuilder.clear();
    this.conversationId = this.generateConversationId();
    Logger.info("Conversation cleared", {
      conversationId: this.conversationId,
    });
  }
}

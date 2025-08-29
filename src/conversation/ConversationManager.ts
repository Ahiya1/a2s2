import Anthropic from "@anthropic-ai/sdk";
import {
  AnthropicConfig,
  AnthropicConfigManager,
} from "../config/AnthropicConfig";
import { ErrorHandler, AnthropicError } from "./ErrorHandler";
import { MessageBuilder, ConversationMessage } from "./MessageBuilder";
import {
  ResponseParser,
  ParsedResponse,
  ToolCall,
  ThinkingBlock,
} from "./ResponseParser";
import { CostOptimizer, TokenUsage, CostCalculation } from "./CostOptimizer";
import {
  StreamingManager,
  StreamingOptions,
  StreamingProgress,
} from "./StreamingManager";
import { Tool } from "../tools/ToolManager";
import { Logger } from "../logging/Logger";

export interface ConversationOptions {
  useExtendedContext?: boolean;
  enablePromptCaching?: boolean;
  maxIterations?: number;
  costBudget?: number;
  // NEW: Conversational mode flag
  useConversationalMode?: boolean;
  // Streaming options
  enableStreaming?: boolean;
  streamingOptions?: StreamingOptions;
  onProgress?: (progress: StreamingProgress) => void;
  onStreamText?: (text: string) => void;
  onStreamThinking?: (thinking: string) => void;
}

export interface ConversationResult {
  success: boolean;
  response?: ParsedResponse;
  error?: AnthropicError;
  iterationCount: number;
  totalCost: number;
  conversationId: string;
  // Streaming results
  wasStreamed?: boolean;
  streamingDuration?: number;
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
  private streamingManager?: StreamingManager;

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
      streamingEnabled: this.configManager.shouldStream(),
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
    const enableStreaming =
      options.enableStreaming ?? this.configManager.shouldStream();

    Logger.info("Starting conversation with tools", {
      conversationId: this.conversationId,
      toolCount: tools.length,
      promptLength: prompt.length,
      maxIterations,
      streamingEnabled: enableStreaming,
      conversationalMode: options.useConversationalMode || false,
    });

    try {
      // Build appropriate system message based on mode
      let systemMessage: ConversationMessage;

      if (options.useConversationalMode) {
        // CONVERSATIONAL MODE: Use conversational system prompt
        systemMessage = this.messageBuilder.buildConversationalSystemPrompt({
          workingDirectory: process.cwd(),
          tools,
          context: this.gatherAdditionalContext(),
          userGoal: prompt,
        });

        Logger.debug("Using conversational system prompt", {
          conversationId: this.conversationId,
          promptLength: prompt.length,
        });
      } else {
        // AUTONOMOUS MODE: Use autonomous system prompt (existing behavior)
        systemMessage = this.messageBuilder.buildSystemPrompt({
          vision: prompt,
          workingDirectory: process.cwd(),
          tools,
          context: this.gatherAdditionalContext(),
        });

        Logger.debug("Using autonomous system prompt", {
          conversationId: this.conversationId,
          vision: prompt.substring(0, 100) + "...",
        });
      }

      let totalCost = 0;
      let lastResponse: ParsedResponse | undefined;
      let totalStreamingDuration = 0;

      // Main conversation loop
      while (iterationCount < maxIterations) {
        iterationCount++;

        Logger.debug(
          `Conversation iteration ${iterationCount}/${maxIterations}`,
          {
            conversationId: this.conversationId,
            streaming: enableStreaming,
            conversationalMode: options.useConversationalMode || false,
          }
        );

        // Check cost budget BEFORE making request to prevent overruns
        if (options.costBudget && totalCost >= options.costBudget) {
          Logger.warn("Cost budget exceeded before iteration", {
            conversationId: this.conversationId,
            totalCost: totalCost.toFixed(4),
            budget: options.costBudget,
          });

          return {
            success: false,
            error: new AnthropicError(
              "budget_exceeded",
              `Cost budget of $${options.costBudget} exceeded (actual: $${totalCost.toFixed(4)})`
            ),
            iterationCount,
            totalCost,
            conversationId: this.conversationId,
            wasStreamed: enableStreaming,
            streamingDuration: totalStreamingDuration,
          };
        }

        try {
          let streamingDuration = 0;

          if (enableStreaming) {
            // STREAMING PATH
            const streamResult = await this.makeStreamingClaudeRequest(
              tools,
              options,
              {
                ...options.streamingOptions,
                onProgress: options.onProgress,
                onText: options.onStreamText,
                onThinking: options.onStreamThinking,
              }
            );

            lastResponse = streamResult.response;
            streamingDuration = streamResult.duration;
            totalStreamingDuration += streamingDuration;
          } else {
            // BATCH PATH (original logic)
            const response = await this.errorHandler.executeWithRetry(
              () => this.makeClaudeRequest(tools, options),
              `claude_request_${iterationCount}`,
              { conversationId: this.conversationId, iteration: iterationCount }
            );

            lastResponse = ResponseParser.parse(response);
          }

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
            streamed: enableStreaming,
            streamingDuration: streamingDuration,
            conversationalMode: options.useConversationalMode || false,
          });

          // Add assistant response to conversation with preserved thinking blocks
          if (lastResponse.toolCalls.length > 0) {
            this.messageBuilder.addAssistantMessageWithPreservedThinking(
              lastResponse.textContent,
              lastResponse.thinkingBlocks,
              lastResponse.toolCalls
            );
          } else {
            this.messageBuilder.addAssistantMessageWithPreservedThinking(
              lastResponse.textContent,
              lastResponse.thinkingBlocks,
              []
            );
          }

          // Check for completion
          if (ResponseParser.isComplete(lastResponse.rawResponse)) {
            Logger.info("Conversation completed naturally", {
              conversationId: this.conversationId,
              iterations: iterationCount,
              totalCost: totalCost.toFixed(4),
              totalStreamingDuration,
              conversationalMode: options.useConversationalMode || false,
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
                totalStreamingDuration,
              });
              break;
            }
          }

          // In conversational mode, stop after one complete interaction
          // (Claude's response + any tool calls executed)
          if (
            options.useConversationalMode &&
            lastResponse.toolCalls.length === 0
          ) {
            Logger.info("Conversational turn completed", {
              conversationId: this.conversationId,
              iterations: iterationCount,
              totalCost: totalCost.toFixed(4),
            });
            break;
          }

          // Context management
          this.messageBuilder.pruneContextIfNeeded(180000);
        } catch (iterationError) {
          const anthropicError =
            iterationError instanceof AnthropicError
              ? iterationError
              : this.errorHandler.classifyError(iterationError as Error);

          Logger.error("API request failed after all retries", {
            conversationId: this.conversationId,
            iteration: iterationCount,
            error: anthropicError.message,
            errorCode: anthropicError.code,
            wasStreaming: enableStreaming,
          });

          return {
            success: false,
            error: anthropicError,
            iterationCount,
            totalCost,
            conversationId: this.conversationId,
            wasStreamed: enableStreaming,
            streamingDuration: totalStreamingDuration,
          };
        }
      }

      // Handle max iterations reached
      if (iterationCount >= maxIterations) {
        Logger.warn("Max iterations reached", {
          conversationId: this.conversationId,
          maxIterations,
          totalCost: totalCost.toFixed(4),
          totalStreamingDuration,
          conversationalMode: options.useConversationalMode || false,
        });
      }

      const duration = Date.now() - startTime;
      Logger.info("Conversation finished", {
        conversationId: this.conversationId,
        iterations: iterationCount,
        duration: `${(duration / 1000).toFixed(1)}s`,
        totalCost: totalCost.toFixed(4),
        streamingDuration: totalStreamingDuration,
        success: true,
        conversationalMode: options.useConversationalMode || false,
      });

      return {
        success: true,
        response: lastResponse,
        iterationCount,
        totalCost,
        conversationId: this.conversationId,
        wasStreamed: enableStreaming,
        streamingDuration: totalStreamingDuration,
      };
    } catch (error) {
      const anthropicError =
        error instanceof AnthropicError
          ? error
          : new AnthropicError(
              "unknown_error",
              `Conversation failed: ${(error as Error).message}`,
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

  // NEW: Streaming implementation
  private async makeStreamingClaudeRequest(
    tools: Tool[],
    options: ConversationOptions,
    streamingOptions?: StreamingOptions
  ): Promise<{ response: ParsedResponse; duration: number }> {
    const startTime = Date.now();

    // Initialize streaming manager
    this.streamingManager = new StreamingManager(streamingOptions);

    const config = this.configManager.getRequestConfig();
    const messages = this.messageBuilder.getMessages();

    // Apply cost optimizations
    const optimizedMessages = options.enablePromptCaching
      ? this.costOptimizer.enablePromptCaching(messages)
      : messages;

    if (options.useExtendedContext) {
      this.configManager.updateConfig({ enableExtendedContext: true });
    }

    const request = {
      model: config.model,
      max_tokens: config.max_tokens,
      thinking: config.thinking,
      messages: optimizedMessages,
      tools: this.formatToolsForClaude(tools),
      betas: this.configManager.getBetaHeaders(),
      stream: true, // Enable streaming
    };

    Logger.debug("Making streaming Claude API request", {
      conversationId: this.conversationId,
      messageCount: optimizedMessages.length,
      toolCount: tools.length,
      betaHeaders: request.betas,
    });

    // Start streaming
    this.streamingManager.startStreaming();

    try {
      // Create streaming request
      const stream = this.anthropic.beta.messages.stream(request);

      // Set up event handlers
      stream.on("text", (text) => {
        this.streamingManager?.handleStreamingEvent({
          type: "content_block_delta",
          data: { delta: { type: "text_delta", text } },
          timestamp: Date.now(),
        });
      });

      stream.on("contentBlockStart", (data) => {
        this.streamingManager?.handleStreamingEvent({
          type: "content_block_start",
          data: { content_block: data },
          index: data.index,
          timestamp: Date.now(),
        });
      });

      stream.on("contentBlockDelta", (data) => {
        this.streamingManager?.handleStreamingEvent({
          type: "content_block_delta",
          data: { delta: data },
          index: data.index,
          timestamp: Date.now(),
        });
      });

      stream.on("contentBlockStop", (data) => {
        this.streamingManager?.handleStreamingEvent({
          type: "content_block_stop",
          data,
          index: data.index,
          timestamp: Date.now(),
        });
      });

      stream.on("messageStart", (data) => {
        this.streamingManager?.handleStreamingEvent({
          type: "message_start",
          data: { message: data },
          timestamp: Date.now(),
        });
      });

      stream.on("messageDelta", (data) => {
        this.streamingManager?.handleStreamingEvent({
          type: "message_delta",
          data,
          timestamp: Date.now(),
        });
      });

      stream.on("messageStop", () => {
        this.streamingManager?.handleStreamingEvent({
          type: "message_stop",
          timestamp: Date.now(),
        });
      });

      stream.on("error", (error) => {
        this.streamingManager?.handleStreamingEvent({
          type: "error",
          data: error,
          timestamp: Date.now(),
        });
      });

      // Wait for completion
      const finalMessage = await stream.finalMessage();

      const duration = Date.now() - startTime;

      // Parse the final response
      const response = ResponseParser.parse(finalMessage);

      Logger.debug("Streaming request completed", {
        conversationId: this.conversationId,
        duration: `${duration}ms`,
        tokens: response.usage.inputTokens + response.usage.outputTokens,
      });

      return { response, duration };
    } catch (error) {
      this.streamingManager?.handleStreamingEvent({
        type: "error",
        data: error,
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  // EXISTING: Batch request (fallback)
  private async makeClaudeRequest(
    tools: Tool[],
    options: ConversationOptions
  ): Promise<any> {
    const config = this.configManager.getRequestConfig();
    const messages = this.messageBuilder.getMessages();

    const optimizedMessages = options.enablePromptCaching
      ? this.costOptimizer.enablePromptCaching(messages)
      : messages;

    if (options.useExtendedContext) {
      this.configManager.updateConfig({ enableExtendedContext: true });
    }

    const request = {
      model: config.model,
      max_tokens: config.max_tokens,
      thinking: config.thinking,
      messages: optimizedMessages,
      tools: this.formatToolsForClaude(tools),
      betas: this.configManager.getBetaHeaders(),
      // No stream parameter - this is batch mode
    };

    Logger.debug("Making batch Claude API request", {
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

          const toolResult = await tool.execute(toolCall.parameters);

          // FIXED: Handle both wrapped ToolManager responses and direct responses
          let resultString: string;
          let wasSuccessful = true;

          if (
            typeof toolResult === "object" &&
            toolResult !== null &&
            "success" in toolResult
          ) {
            // This is a wrapped response from ToolManager.executeTool()
            wasSuccessful = Boolean(toolResult.success);

            if (toolResult.success) {
              resultString = String(toolResult.result || "");
            } else {
              // Handle error case - send the error message back to the agent
              resultString =
                toolResult.error?.message ||
                String(toolResult.error) ||
                "Tool execution failed";
            }
          } else if (typeof toolResult === "string") {
            // Direct string response
            resultString = toolResult;
          } else {
            // Fallback: convert to string
            resultString = String(toolResult);
          }

          Logger.debug(`Tool executed successfully: ${toolCall.name}`, {
            conversationId: this.conversationId,
            resultLength: resultString.length,
            success: wasSuccessful,
          });

          return {
            toolCall,
            result: resultString,
            success: wasSuccessful,
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

  // Streaming utilities
  isStreamingActive(): boolean {
    return this.streamingManager?.isStreaming() || false;
  }

  stopStreaming(): void {
    this.streamingManager?.stopStreaming();
  }

  getStreamingState() {
    return this.streamingManager?.getPublicState();
  }

  clear(): void {
    this.messageBuilder.clear();
    this.streamingManager?.stopStreaming();
    this.streamingManager = undefined;
    this.conversationId = this.generateConversationId();
    Logger.info("Conversation cleared", {
      conversationId: this.conversationId,
    });
  }
}

import { Logger } from "../logging/Logger";

export interface ToolCall {
  id: string;
  name: string;
  parameters: any;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

export interface ParsedResponse {
  textContent: string;
  thinkingContent?: string;
  thinkingBlocks: ThinkingBlock[];
  toolCalls: ToolCall[];
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
  };
  rawResponse: any;
  // NEW: Streaming-related fields
  wasStreamed?: boolean;
  streamingEvents?: StreamingEvent[];
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
}

// NEW: Enhanced streaming event interface
export interface StreamingEvent {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_delta"
    | "message_stop"
    | "ping"
    | "error";
  data?: any;
  index?: number;
  timestamp?: number;
}

// NEW: Stream chunk interface for incremental parsing
export interface StreamChunk {
  event: string;
  data: any;
  raw?: string;
}

export type ContentBlock = ThinkingBlock | TextBlock | ToolUseBlock;

export class ResponseParser {
  // NEW: Enhanced streaming state management
  private static streamingState = new Map<
    string,
    {
      textContent: string;
      thinkingContent: string;
      thinkingBlocks: ThinkingBlock[];
      toolCalls: ToolCall[];
      events: StreamingEvent[];
      startTime: number;
    }
  >();

  static parse(response: any, wasStreamed = false): ParsedResponse {
    Logger.debug("Parsing Claude response", {
      contentBlocks: response.content?.length || 0,
      stopReason: response.stop_reason,
      wasStreamed,
    });

    const parsed: ParsedResponse = {
      textContent: "",
      thinkingContent: undefined,
      thinkingBlocks: [],
      toolCalls: [],
      stopReason: response.stop_reason || "unknown",
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        thinkingTokens: response.usage?.thinking_tokens,
      },
      rawResponse: response,
      wasStreamed,
    };

    if (response.content && Array.isArray(response.content)) {
      for (const block of response.content) {
        this.parseContentBlock(block, parsed);
      }
    }

    Logger.debug("Response parsed", {
      textLength: parsed.textContent.length,
      thinkingLength: parsed.thinkingContent?.length || 0,
      thinkingBlockCount: parsed.thinkingBlocks.length,
      toolCallCount: parsed.toolCalls.length,
      stopReason: parsed.stopReason,
      wasStreamed,
    });

    return parsed;
  }

  // NEW: Parse streaming chunk
  static parseStreamingChunk(
    chunk: StreamChunk,
    streamId: string
  ): {
    event: StreamingEvent;
    partialResponse?: Partial<ParsedResponse>;
  } {
    const event: StreamingEvent = {
      type: chunk.event as any,
      data: chunk.data,
      timestamp: Date.now(),
    };

    // Initialize or get streaming state
    let state = this.streamingState.get(streamId);
    if (!state) {
      state = {
        textContent: "",
        thinkingContent: "",
        thinkingBlocks: [],
        toolCalls: [],
        events: [],
        startTime: Date.now(),
      };
      this.streamingState.set(streamId, state);
    }

    state.events.push(event);

    // Process different event types
    const partialResponse = this.processStreamingEvent(event, state);

    Logger.debug("Streaming chunk parsed", {
      streamId,
      eventType: event.type,
      hasPartialResponse: !!partialResponse,
      stateTextLength: state.textContent.length,
    });

    return { event, partialResponse };
  }

  // NEW: Process individual streaming events
  private static processStreamingEvent(
    event: StreamingEvent,
    state: any
  ): Partial<ParsedResponse> | undefined {
    switch (event.type) {
      case "message_start":
        return {
          stopReason: "streaming",
          usage: {
            inputTokens: event.data?.message?.usage?.input_tokens || 0,
            outputTokens: 0,
          },
        };

      case "content_block_start":
        if (event.data?.content_block?.type === "text") {
          // Text block started
          return undefined;
        }
        break;

      case "content_block_delta":
        if (event.data?.delta?.type === "text_delta") {
          const text = event.data.delta.text || "";
          state.textContent += text;

          return {
            textContent: state.textContent,
          };
        } else if (event.data?.delta?.type === "thinking_delta") {
          const thinking = event.data.delta.thinking || "";
          state.thinkingContent += thinking;

          return {
            thinkingContent: state.thinkingContent,
          };
        }
        break;

      case "content_block_stop":
        // Block completed
        return undefined;

      case "message_delta":
        if (event.data?.usage) {
          return {
            usage: {
              inputTokens: event.data.usage.input_tokens || 0,
              outputTokens: event.data.usage.output_tokens || 0,
              thinkingTokens: event.data.usage.thinking_tokens,
            },
            stopReason: event.data.delta?.stop_reason || "streaming",
          };
        }
        break;

      case "message_stop":
        // Complete the thinking blocks if any thinking content exists
        if (state.thinkingContent.trim()) {
          const thinkingBlock: ThinkingBlock = {
            type: "thinking",
            thinking: state.thinkingContent,
            signature: event.data?.signature || "thinking",
          };
          state.thinkingBlocks.push(thinkingBlock);
        }

        return {
          textContent: state.textContent,
          thinkingContent: state.thinkingContent || undefined,
          thinkingBlocks: [...state.thinkingBlocks],
          toolCalls: [...state.toolCalls],
          stopReason: "end_turn",
        };

      case "error":
        Logger.error("Streaming error event", {
          error: event.data,
          streamState: {
            textLength: state.textContent.length,
            thinkingLength: state.thinkingContent.length,
          },
        });

        return {
          stopReason: "error",
        };

      case "ping":
        // Heartbeat event - no action needed
        return undefined;

      default:
        Logger.debug("Unknown streaming event type", {
          type: event.type,
          data: event.data,
        });
        return undefined;
    }

    return undefined;
  }

  // NEW: Get accumulated streaming response
  static getStreamingResponse(streamId: string): ParsedResponse | null {
    const state = this.streamingState.get(streamId);
    if (!state) return null;

    return {
      textContent: state.textContent,
      thinkingContent: state.thinkingContent || undefined,
      thinkingBlocks: [...state.thinkingBlocks],
      toolCalls: [...state.toolCalls],
      stopReason: "streaming",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
      rawResponse: { streaming: true },
      wasStreamed: true,
      streamingEvents: [...state.events],
    };
  }

  // NEW: Clean up streaming state
  static clearStreamingState(streamId: string): void {
    this.streamingState.delete(streamId);
    Logger.debug("Streaming state cleared", { streamId });
  }

  // NEW: Get all active streams
  static getActiveStreams(): string[] {
    return Array.from(this.streamingState.keys());
  }

  private static parseContentBlock(
    block: ContentBlock,
    parsed: ParsedResponse
  ): void {
    switch (block.type) {
      case "text":
        if ("text" in block) {
          parsed.textContent += block.text;
        }
        break;

      case "thinking":
        if ("thinking" in block && "signature" in block) {
          parsed.thinkingBlocks.push({
            type: "thinking",
            thinking: block.thinking,
            signature: block.signature,
          });

          parsed.thinkingContent =
            (parsed.thinkingContent || "") + block.thinking;
        }
        break;

      case "tool_use":
        if ("id" in block && "name" in block && "input" in block) {
          const toolCall: ToolCall = {
            id: block.id,
            name: block.name,
            parameters: this.sanitizeToolParameters(block.input, block.name),
          };
          parsed.toolCalls.push(toolCall);
        }
        break;

      default:
        Logger.warn("Unknown content block type", {
          type: (block as any).type,
        });
        break;
    }
  }

  private static sanitizeToolParameters(input: any, toolName: string): any {
    if (input === null || input === undefined) {
      return {};
    }

    if (typeof input === "object" && !Array.isArray(input)) {
      return input;
    }

    if (typeof input === "string") {
      try {
        const parsed = JSON.parse(input);
        Logger.debug(`Parsed JSON string parameters for tool ${toolName}`, {
          originalType: typeof input,
          parsedType: typeof parsed,
        });
        return parsed;
      } catch (error) {
        Logger.warn(
          `Failed to parse JSON string parameters for tool ${toolName}`,
          {
            input,
            error: (error as Error).message,
          }
        );
        return { input };
      }
    }

    return { value: input };
  }

  static extractToolCalls(response: any): ToolCall[] {
    const parsed = this.parse(response);
    return parsed.toolCalls;
  }

  static extractTextContent(response: any): string {
    const parsed = this.parse(response);
    return parsed.textContent;
  }

  static extractThinkingContent(response: any): string | undefined {
    const parsed = this.parse(response);
    return parsed.thinkingContent;
  }

  static extractThinkingBlocks(response: any): ThinkingBlock[] {
    const parsed = this.parse(response);
    return parsed.thinkingBlocks;
  }

  static hasToolCalls(response: any): boolean {
    const parsed = this.parse(response);
    return parsed.toolCalls.length > 0;
  }

  static isComplete(response: any): boolean {
    const parsed = this.parse(response);

    if (["end_turn", "stop_sequence"].includes(parsed.stopReason)) {
      return true;
    }

    const hasCompletionTool = parsed.toolCalls.some(
      (call) => call.name === "report_complete" || call.name === "task_complete"
    );

    if (hasCompletionTool) {
      return true;
    }

    const completionPatterns = [
      /task\s+completed/i,
      /work\s+finished/i,
      /implementation\s+complete/i,
      /requirements\s+satisfied/i,
    ];

    const hasCompletionText = completionPatterns.some((pattern) =>
      pattern.test(parsed.textContent)
    );

    return hasCompletionText;
  }

  static getUsageStats(response: any): {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
    totalTokens: number;
  } {
    const parsed = this.parse(response);
    return {
      inputTokens: parsed.usage.inputTokens,
      outputTokens: parsed.usage.outputTokens,
      thinkingTokens: parsed.usage.thinkingTokens,
      totalTokens:
        parsed.usage.inputTokens +
        parsed.usage.outputTokens +
        (parsed.usage.thinkingTokens || 0),
    };
  }

  // NEW: Streaming-specific utilities
  static parseServerSentEvent(rawEvent: string): StreamChunk | null {
    const lines = rawEvent.trim().split("\n");
    let event = "";
    let data = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        event = line.slice(7);
      } else if (line.startsWith("data: ")) {
        data = line.slice(6);
      }
    }

    if (!event || !data) {
      return null;
    }

    try {
      const parsedData = JSON.parse(data);
      return {
        event,
        data: parsedData,
        raw: rawEvent,
      };
    } catch (error) {
      Logger.warn("Failed to parse SSE data", {
        event,
        data: data.substring(0, 100),
        error: (error as Error).message,
      });
      return null;
    }
  }

  static isStreamingComplete(event: StreamingEvent): boolean {
    return event.type === "message_stop" || event.type === "error";
  }

  static getStreamingProgress(
    events: StreamingEvent[],
    estimatedTotalTokens?: number
  ): {
    phase: "starting" | "streaming" | "thinking" | "tool_use" | "complete";
    percentage?: number;
    tokensReceived: number;
  } {
    let phase: "starting" | "streaming" | "thinking" | "tool_use" | "complete" =
      "starting";
    let tokensReceived = 0;

    // Determine current phase based on latest events
    const recentEvents = events.slice(-5);

    if (recentEvents.some((e) => e.type === "message_stop")) {
      phase = "complete";
    } else if (
      recentEvents.some(
        (e) =>
          e.type === "content_block_delta" &&
          e.data?.delta?.type === "thinking_delta"
      )
    ) {
      phase = "thinking";
    } else if (recentEvents.some((e) => e.type.includes("tool"))) {
      phase = "tool_use";
    } else if (recentEvents.some((e) => e.type === "content_block_delta")) {
      phase = "streaming";
    }

    // Estimate tokens received (rough approximation)
    for (const event of events) {
      if (event.type === "content_block_delta" && event.data?.delta?.text) {
        tokensReceived += Math.ceil(event.data.delta.text.length / 4);
      } else if (
        event.type === "message_delta" &&
        event.data?.usage?.output_tokens
      ) {
        tokensReceived = event.data.usage.output_tokens;
      }
    }

    const percentage = estimatedTotalTokens
      ? Math.min(100, Math.round((tokensReceived / estimatedTotalTokens) * 100))
      : undefined;

    return {
      phase,
      percentage,
      tokensReceived,
    };
  }

  // Streaming support methods for incremental updates
  static parseStreamingDelta(delta: any): Partial<ParsedResponse> {
    const parsed: Partial<ParsedResponse> = {
      textContent: "",
      thinkingContent: "",
      toolCalls: [],
    };

    if (delta.type === "text_delta" && delta.text) {
      parsed.textContent = delta.text;
    }

    if (delta.type === "thinking_delta" && delta.thinking) {
      parsed.thinkingContent = delta.thinking;
    }

    if (delta.type === "tool_use_delta") {
      Logger.debug("Received tool use delta", { delta });
    }

    return parsed;
  }

  // Validation methods
  static validateResponse(response: any): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!response) {
      errors.push("Response is null or undefined");
      return { isValid: false, errors };
    }

    if (!response.content) {
      errors.push("Response missing content");
    }

    if (!Array.isArray(response.content)) {
      errors.push("Response content is not an array");
    }

    if (!response.stop_reason) {
      errors.push("Response missing stop_reason");
    }

    if (!response.usage) {
      errors.push("Response missing usage information");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static parseWithFallback(response: any): ParsedResponse {
    try {
      return this.parse(response);
    } catch (error) {
      Logger.error("Failed to parse response, using fallback", {
        error: (error as Error).message,
        response: JSON.stringify(response).substring(0, 500),
      });

      return {
        textContent: response?.content?.[0]?.text || "Error parsing response",
        thinkingContent: undefined,
        thinkingBlocks: [],
        toolCalls: [],
        stopReason: "error",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
        },
        rawResponse: response,
      };
    }
  }

  static getResponseStructure(response: any): Record<string, any> {
    return {
      hasContent: !!response.content,
      contentBlocks: response.content?.length || 0,
      stopReason: response.stop_reason,
      hasUsage: !!response.usage,
      topLevelKeys: Object.keys(response || {}),
      wasStreamed: response.streaming || false,
    };
  }
}

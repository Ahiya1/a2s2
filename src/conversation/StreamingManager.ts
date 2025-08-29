import { EventEmitter } from "events";
import { Logger } from "../logging/Logger";
import { ThinkingBlock, ToolCall } from "./ResponseParser";

export interface StreamingEvent {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_delta"
    | "message_stop"
    | "error"
    | "thinking_start"
    | "thinking_delta"
    | "thinking_stop"
    | "tool_use_start"
    | "tool_use_delta"
    | "tool_use_stop";
  data?: any;
  index?: number;
  timestamp: number;
}

export interface StreamingState {
  isActive: boolean;
  messageId?: string;
  currentBlockIndex: number;
  textBuffer: string;
  thinkingBuffer: string;
  thinkingBlocks: ThinkingBlock[];
  toolCalls: ToolCall[];
  totalTokens: number;
  startTime: number;
  error?: Error;
}

export interface StreamingOptions {
  showProgress?: boolean;
  bufferSize?: number;
  timeout?: number;
  enableTypewriter?: boolean;
  typewriterDelay?: number;
  onProgress?: (progress: StreamingProgress) => void;
  onText?: (text: string) => void;
  onThinking?: (thinking: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onComplete?: (state: StreamingState) => void;
  onError?: (error: Error) => void;
}

export interface StreamingProgress {
  phase:
    | "starting"
    | "streaming"
    | "thinking"
    | "tool_use"
    | "complete"
    | "error";
  percentage?: number;
  message?: string;
  tokensReceived: number;
  elapsedTime: number;
}

export class StreamingManager extends EventEmitter {
  private state: StreamingState;
  private options: StreamingOptions;
  private textBuffer: string = "";
  private typewriterTimer?: NodeJS.Timeout;
  private progressTimer?: NodeJS.Timeout;
  private timeoutTimer?: NodeJS.Timeout;

  constructor(options: StreamingOptions = {}) {
    super();
    this.options = {
      showProgress: true,
      bufferSize: 64,
      timeout: 3000000, // 5 minutes
      enableTypewriter: false,
      typewriterDelay: 20,
      ...options,
    };

    this.state = this.initializeState();
    this.setupEventHandlers();
  }

  private initializeState(): StreamingState {
    return {
      isActive: false,
      currentBlockIndex: 0,
      textBuffer: "",
      thinkingBuffer: "",
      thinkingBlocks: [],
      toolCalls: [],
      totalTokens: 0,
      startTime: 0,
    };
  }

  private setupEventHandlers(): void {
    this.on("progress", (progress: StreamingProgress) => {
      this.options.onProgress?.(progress);
    });

    this.on("text", (text: string) => {
      this.options.onText?.(text);
    });

    this.on("thinking", (thinking: string) => {
      this.options.onThinking?.(thinking);
    });

    this.on("toolCall", (toolCall: ToolCall) => {
      this.options.onToolCall?.(toolCall);
    });

    this.on("complete", (state: StreamingState) => {
      this.options.onComplete?.(state);
    });

    this.on("error", (error: Error) => {
      this.options.onError?.(error);
    });
  }

  startStreaming(): void {
    this.state = this.initializeState();
    this.state.isActive = true;
    this.state.startTime = Date.now();
    this.textBuffer = "";

    // Setup timeout
    if (this.options.timeout) {
      this.timeoutTimer = setTimeout(() => {
        this.handleError(
          new Error(`Streaming timeout after ${this.options.timeout}ms`)
        );
      }, this.options.timeout);
    }

    // Start progress reporting
    this.startProgressReporting();

    this.emitProgress("starting", "Initiating streaming connection...");
    Logger.debug("Streaming started", {
      options: this.options,
      timeout: this.options.timeout,
    });
  }

  handleStreamingEvent(event: StreamingEvent): void {
    if (!this.state.isActive) {
      Logger.warn("Received streaming event but streaming is not active", {
        event,
      });
      return;
    }

    Logger.debug("Processing streaming event", {
      type: event.type,
      index: event.index,
      hasData: !!event.data,
    });

    try {
      switch (event.type) {
        case "message_start":
          this.handleMessageStart(event);
          break;

        case "content_block_start":
          this.handleContentBlockStart(event);
          break;

        case "content_block_delta":
          this.handleContentBlockDelta(event);
          break;

        case "content_block_stop":
          this.handleContentBlockStop(event);
          break;

        case "thinking_start":
          this.handleThinkingStart(event);
          break;

        case "thinking_delta":
          this.handleThinkingDelta(event);
          break;

        case "thinking_stop":
          this.handleThinkingStop(event);
          break;

        case "tool_use_start":
          this.handleToolUseStart(event);
          break;

        case "tool_use_delta":
          this.handleToolUseDelta(event);
          break;

        case "tool_use_stop":
          this.handleToolUseStop(event);
          break;

        case "message_delta":
          this.handleMessageDelta(event);
          break;

        case "message_stop":
          this.handleMessageStop(event);
          break;

        case "error":
          this.handleError(event.data);
          break;

        default:
          Logger.warn("Unknown streaming event type", {
            type: event.type,
            event,
          });
          break;
      }
    } catch (error) {
      Logger.error("Error processing streaming event", {
        event: event.type,
        error: (error as Error).message,
      });
      this.handleError(error as Error);
    }
  }

  private handleMessageStart(event: StreamingEvent): void {
    this.state.messageId = event.data?.message?.id;
    this.emitProgress("streaming", "Message started...");
  }

  private handleContentBlockStart(event: StreamingEvent): void {
    this.state.currentBlockIndex = event.index || 0;

    if (event.data?.content_block?.type === "text") {
      this.emitProgress("streaming", "Receiving text...");
    }
  }

  private handleContentBlockDelta(event: StreamingEvent): void {
    if (event.data?.delta?.type === "text_delta" && event.data.delta.text) {
      const text = event.data.delta.text;
      this.state.textBuffer += text;

      if (this.options.enableTypewriter) {
        this.addToTypewriterBuffer(text);
      } else {
        this.flushTextBuffer(text);
      }
    }
  }

  private handleContentBlockStop(event: StreamingEvent): void {
    this.flushAllBuffers();
  }

  private handleThinkingStart(event: StreamingEvent): void {
    this.emitProgress("thinking", "Claude is thinking...");
  }

  private handleThinkingDelta(event: StreamingEvent): void {
    if (event.data?.delta?.thinking) {
      const thinking = event.data.delta.thinking;
      this.state.thinkingBuffer += thinking;
      this.emit("thinking", thinking);
    }
  }

  private handleThinkingStop(event: StreamingEvent): void {
    if (this.state.thinkingBuffer.trim()) {
      const thinkingBlock: ThinkingBlock = {
        type: "thinking",
        thinking: this.state.thinkingBuffer,
        signature: event.data?.signature || "thinking",
      };

      this.state.thinkingBlocks.push(thinkingBlock);
      this.state.thinkingBuffer = "";
    }
  }

  private handleToolUseStart(event: StreamingEvent): void {
    this.emitProgress("tool_use", "Using tools...");
  }

  private handleToolUseDelta(event: StreamingEvent): void {
    // Handle tool use deltas - implementation depends on specific tool format
    Logger.debug("Tool use delta received", { event });
  }

  private handleToolUseStop(event: StreamingEvent): void {
    if (event.data) {
      const toolCall: ToolCall = {
        id: event.data.id || `tool_${Date.now()}`,
        name: event.data.name || "unknown",
        parameters: event.data.input || {},
      };

      this.state.toolCalls.push(toolCall);
      this.emit("toolCall", toolCall);
    }
  }

  private handleMessageDelta(event: StreamingEvent): void {
    if (event.data?.usage) {
      this.state.totalTokens =
        (event.data.usage.input_tokens || 0) +
        (event.data.usage.output_tokens || 0) +
        (event.data.usage.thinking_tokens || 0);
    }
  }

  private handleMessageStop(event: StreamingEvent): void {
    this.completeStreaming();
  }

  private handleError(error: Error): void {
    this.state.error = error;
    this.state.isActive = false;
    this.cleanup();

    this.emitProgress("error", `Error: ${error.message}`);
    this.emit("error", error);

    Logger.error("Streaming error", {
      error: error.message,
      state: this.getPublicState(),
    });
  }

  private addToTypewriterBuffer(text: string): void {
    this.textBuffer += text;

    if (!this.typewriterTimer) {
      this.startTypewriter();
    }
  }

  private startTypewriter(): void {
    this.typewriterTimer = setInterval(() => {
      if (this.textBuffer.length === 0) {
        if (this.typewriterTimer) {
          clearInterval(this.typewriterTimer);
          this.typewriterTimer = undefined;
        }
        return;
      }

      const char = this.textBuffer.charAt(0);
      this.textBuffer = this.textBuffer.slice(1);

      process.stdout.write(char);
      this.emit("text", char);
    }, this.options.typewriterDelay || 20);
  }

  private flushTextBuffer(text?: string): void {
    if (text) {
      process.stdout.write(text);
      this.emit("text", text);
    }
  }

  private flushAllBuffers(): void {
    if (this.textBuffer) {
      this.flushTextBuffer(this.textBuffer);
      this.textBuffer = "";
    }
  }

  private startProgressReporting(): void {
    if (!this.options.showProgress) return;

    this.progressTimer = setInterval(() => {
      if (this.state.isActive) {
        const elapsedTime = Date.now() - this.state.startTime;
        this.emitProgress("streaming", undefined, elapsedTime);
      }
    }, 1000); // Update every second
  }

  private emitProgress(
    phase: StreamingProgress["phase"],
    message?: string,
    elapsedTime?: number
  ): void {
    const progress: StreamingProgress = {
      phase,
      message,
      tokensReceived: this.state.totalTokens,
      elapsedTime: elapsedTime || Date.now() - this.state.startTime,
    };

    this.emit("progress", progress);
  }

  private completeStreaming(): void {
    this.state.isActive = false;
    this.flushAllBuffers();
    this.cleanup();

    this.emitProgress("complete", "Streaming complete");
    this.emit("complete", this.state);

    Logger.info("Streaming completed", {
      duration: Date.now() - this.state.startTime,
      tokens: this.state.totalTokens,
      textLength: this.state.textBuffer.length,
      thinkingBlocks: this.state.thinkingBlocks.length,
      toolCalls: this.state.toolCalls.length,
    });
  }

  private cleanup(): void {
    if (this.typewriterTimer) {
      clearInterval(this.typewriterTimer);
      this.typewriterTimer = undefined;
    }

    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = undefined;
    }

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }
  }

  stopStreaming(): void {
    if (this.state.isActive) {
      this.state.isActive = false;
      this.cleanup();
      this.emitProgress("complete", "Streaming stopped by user");
      this.emit("complete", this.state);
    }
  }

  isStreaming(): boolean {
    return this.state.isActive;
  }

  getState(): StreamingState {
    return { ...this.state };
  }

  getPublicState(): Omit<StreamingState, "error"> {
    const { error, ...publicState } = this.state;
    return publicState;
  }

  // Static utility methods
  static createStreamingEvent(
    type: StreamingEvent["type"],
    data?: any,
    index?: number
  ): StreamingEvent {
    return {
      type,
      data,
      index,
      timestamp: Date.now(),
    };
  }

  static isStreamingSupported(): boolean {
    return (
      typeof process !== "undefined" &&
      process.stdout &&
      process.stdout.isTTY &&
      process.env.NODE_ENV !== "test"
    );
  }
}

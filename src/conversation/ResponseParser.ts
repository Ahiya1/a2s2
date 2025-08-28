import { Logger } from "../logging/Logger";

export interface ToolCall {
  id: string;
  name: string;
  parameters: any;
}

// NEW: Interface to preserve complete thinking blocks with signatures
export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

export interface ParsedResponse {
  textContent: string;
  thinkingContent?: string;
  thinkingBlocks: ThinkingBlock[]; // NEW: Preserve complete thinking blocks
  toolCalls: ToolCall[];
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
  };
  rawResponse: any;
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

export type ContentBlock = ThinkingBlock | TextBlock | ToolUseBlock;

export class ResponseParser {
  static parse(response: any): ParsedResponse {
    Logger.debug("Parsing Claude response", {
      contentBlocks: response.content?.length || 0,
      stopReason: response.stop_reason,
    });

    const parsed: ParsedResponse = {
      textContent: "",
      thinkingContent: undefined,
      thinkingBlocks: [], // NEW: Store complete thinking blocks
      toolCalls: [],
      stopReason: response.stop_reason || "unknown",
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        thinkingTokens: response.usage?.thinking_tokens,
      },
      rawResponse: response,
    };

    // Parse content blocks
    if (response.content && Array.isArray(response.content)) {
      for (const block of response.content) {
        this.parseContentBlock(block, parsed);
      }
    }

    Logger.debug("Response parsed", {
      textLength: parsed.textContent.length,
      thinkingLength: parsed.thinkingContent?.length || 0,
      thinkingBlockCount: parsed.thinkingBlocks.length, // NEW
      toolCallCount: parsed.toolCalls.length,
      stopReason: parsed.stopReason,
    });

    return parsed;
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
          // NEW: Store the complete thinking block with signature
          parsed.thinkingBlocks.push({
            type: "thinking",
            thinking: block.thinking,
            signature: block.signature,
          });

          // Also keep the text content for backwards compatibility
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

    // If it's already an object, return it
    if (typeof input === "object" && !Array.isArray(input)) {
      return input;
    }

    // If it's a string, try to parse as JSON
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
        // Return as string parameter if JSON parsing fails
        return { input };
      }
    }

    // For other types, wrap in object
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

  // NEW: Method to extract complete thinking blocks
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

    // Check stop reason
    if (["end_turn", "stop_sequence"].includes(parsed.stopReason)) {
      return true;
    }

    // Check for completion signals in tool calls
    const hasCompletionTool = parsed.toolCalls.some(
      (call) => call.name === "report_complete" || call.name === "task_complete"
    );

    if (hasCompletionTool) {
      return true;
    }

    // Check for completion signals in text content
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

  // Streaming support methods
  static parseStreamingDelta(delta: any): Partial<ParsedResponse> {
    const parsed: Partial<ParsedResponse> = {
      textContent: "",
      thinkingContent: "",
      toolCalls: [],
    };

    if (delta.type === "text_delta" && delta.text) {
      parsed.textContent = delta.text;
    }

    if (delta.type === "thinking_delta" && delta.content) {
      parsed.thinkingContent = delta.content;
    }

    if (delta.type === "tool_use_delta") {
      // Handle streaming tool use - would need more implementation for full streaming
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

  // Error handling for malformed responses
  static parseWithFallback(response: any): ParsedResponse {
    try {
      return this.parse(response);
    } catch (error) {
      Logger.error("Failed to parse response, using fallback", {
        error: (error as Error).message,
        response: JSON.stringify(response).substring(0, 500),
      });

      // Return minimal valid response
      return {
        textContent: response?.content?.[0]?.text || "Error parsing response",
        thinkingContent: undefined,
        thinkingBlocks: [], // NEW
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

  // Debug utilities
  static getResponseStructure(response: any): Record<string, any> {
    return {
      hasContent: !!response.content,
      contentBlocks: response.content?.length || 0,
      stopReason: response.stop_reason,
      hasUsage: !!response.usage,
      topLevelKeys: Object.keys(response || {}),
    };
  }
}

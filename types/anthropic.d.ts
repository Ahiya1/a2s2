declare module "@anthropic-ai/sdk" {
  export default class Anthropic {
    constructor(options: { apiKey: string });

    beta: {
      messages: {
        create(options: {
          model: string;
          max_tokens: number;
          thinking?: {
            type: "enabled";
            budget_tokens: number;
          };
          messages: Array<{
            role: "user" | "assistant";
            content:
              | string
              | Array<{
                  type: string;
                  text?: string;
                  tool_use_id?: string;
                  content?: string;
                  cache_control?: { type: "ephemeral" };
                  thinking?: string;
                  signature?: string;
                  id?: string;
                  name?: string;
                  input?: any;
                }>;
            thinking_content?: string;
          }>;
          tools?: Array<{
            name: string;
            description: string;
            input_schema: {
              type: "object";
              properties: Record<string, any>;
              required: string[];
            };
          }>;
          betas?: string[];
          stream?: boolean;
        }): Promise<{
          content: Array<{
            type: "text" | "thinking" | "tool_use";
            text?: string;
            thinking?: string;
            signature?: string;
            content?: string;
            id?: string;
            name?: string;
            input?: any;
          }>;
          stop_reason: string;
          usage: {
            input_tokens: number;
            output_tokens: number;
            thinking_tokens?: number;
          };
          _request_id?: string;
        }>;

        // NEW: Streaming method
        stream(options: {
          model: string;
          max_tokens: number;
          thinking?: {
            type: "enabled";
            budget_tokens: number;
          };
          messages: Array<{
            role: "user" | "assistant";
            content:
              | string
              | Array<{
                  type: string;
                  text?: string;
                  tool_use_id?: string;
                  content?: string;
                  cache_control?: { type: "ephemeral" };
                  thinking?: string;
                  signature?: string;
                  id?: string;
                  name?: string;
                  input?: any;
                }>;
            thinking_content?: string;
          }>;
          tools?: Array<{
            name: string;
            description: string;
            input_schema: {
              type: "object";
              properties: Record<string, any>;
              required: string[];
            };
          }>;
          betas?: string[];
        }): AnthropicStream;
      };
    };
  }

  // NEW: Streaming interfaces
  export interface AnthropicStream {
    on(event: "text", handler: (text: string) => void): this;
    on(
      event: "contentBlockStart",
      handler: (data: {
        type: string;
        index: number;
        content_block: any;
      }) => void
    ): this;
    on(
      event: "contentBlockDelta",
      handler: (data: {
        type: string;
        index: number;
        delta: {
          type: "text_delta" | "thinking_delta" | "tool_use_delta";
          text?: string;
          thinking?: string;
          partial_json?: string;
        };
      }) => void
    ): this;
    on(
      event: "contentBlockStop",
      handler: (data: { type: string; index: number }) => void
    ): this;
    on(
      event: "messageStart",
      handler: (data: {
        type: string;
        message: {
          id: string;
          type: string;
          role: string;
          content: any[];
          model: string;
          stop_reason: string | null;
          stop_sequence: string | null;
          usage: {
            input_tokens: number;
            output_tokens: number;
            thinking_tokens?: number;
          };
        };
      }) => void
    ): this;
    on(
      event: "messageDelta",
      handler: (data: {
        type: string;
        delta: {
          stop_reason?: string;
          stop_sequence?: string | null;
        };
        usage: {
          input_tokens?: number;
          output_tokens: number;
          thinking_tokens?: number;
        };
      }) => void
    ): this;
    on(event: "messageStop", handler: () => void): this;
    on(event: "error", handler: (error: Error) => void): this;
    on(event: "ping", handler: (data: { type: "ping" }) => void): this;

    finalMessage(): Promise<{
      content: Array<{
        type: "text" | "thinking" | "tool_use";
        text?: string;
        thinking?: string;
        signature?: string;
        content?: string;
        id?: string;
        name?: string;
        input?: any;
      }>;
      stop_reason: string;
      usage: {
        input_tokens: number;
        output_tokens: number;
        thinking_tokens?: number;
      };
      _request_id?: string;
    }>;

    abort(): void;
  }

  export class APIError extends Error {
    status?: number;
    headers?: Record<string, string>;
    constructor(
      message: string,
      status?: number,
      headers?: Record<string, string>
    );
  }
}

// Also support the "anthropic" import for backward compatibility
declare module "anthropic" {
  export { default } from "@anthropic-ai/sdk";
}

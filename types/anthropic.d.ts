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
        }): Promise<{
          content: Array<{
            type: "text" | "thinking" | "tool_use";
            text?: string;
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
        }>;
      };
    };
  }
}

// Also support the "anthropic" import for backward compatibility
declare module "anthropic" {
  export { default } from "@anthropic-ai/sdk";
}

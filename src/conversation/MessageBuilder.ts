import { Tool } from "../tools/ToolManager";
import { Logger } from "../logging/Logger";
import { ThinkingBlock } from "./ResponseParser"; // NEW: Import ThinkingBlock

export interface ConversationMessage {
  role: "user" | "assistant";
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        tool_use_id?: string;
        content?: string;
        cache_control?: { type: "ephemeral" };
        id?: string;
        name?: string;
        input?: any;
        thinking?: string; // NEW: For thinking blocks
        signature?: string; // NEW: For thinking block signatures
      }>;
  thinking_content?: string; // Kept for backwards compatibility but not used with structured content
}

export interface SystemPromptOptions {
  vision: string;
  workingDirectory: string;
  phase?: "EXPLORE" | "SUMMON" | "COMPLETE";
  tools: Tool[];
  context?: string;
}

// NEW: Interface for conversational system prompt options
export interface ConversationalSystemPromptOptions {
  workingDirectory: string;
  tools: Tool[];
  context?: string;
  userGoal?: string;
}

export interface ToolResultMessage {
  role: "user";
  content: Array<{
    type: "tool_result";
    tool_use_id: string;
    content: string;
  }>;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: any;
}

export class MessageBuilder {
  private messages: ConversationMessage[] = [];
  private systemPromptCached = false;

  constructor() {
    this.messages = [];
  }

  buildSystemPrompt(options: SystemPromptOptions): ConversationMessage {
    const {
      vision,
      workingDirectory,
      phase = "EXPLORE",
      tools,
      context,
    } = options;

    const systemPrompt = `You are an autonomous software development agent with complete control over this conversation.

TASK: ${vision}
WORKING DIRECTORY: ${workingDirectory}
CURRENT PHASE: ${phase}

AUTONOMOUS OPERATION PROTOCOL:
1. You drive this conversation completely - no external prompts will be provided
2. Continue working until the task is fully completed
3. Use tools to understand your environment and implement solutions
4. Signal completion when finished using the report_complete tool
5. Request help if stuck using appropriate tools

THREE-PHASE LIFECYCLE:
- EXPLORE: Understand the current project state and requirements
  • Use get_project_tree to analyze structure
  • Use read_files to examine key files
  • Use web_search for current best practices
  • Plan your implementation approach

- SUMMON: Create specialists for complex tasks (Phase 2 feature - skip for now)
  • Assess if task requires specialist coordination
  • For Phase 1B, work independently

- COMPLETE: Implement, test, and finalize the solution
  • Use write_files to implement changes
  • Use run_command to test your work
  • Validate requirements are met
  • Call report_complete when finished

AVAILABLE TOOLS:
${this.formatToolDescriptions(tools)}

${context ? `\nADDITIONAL CONTEXT:\n${context}` : ""}

Begin autonomous execution now. Start by exploring the project structure and understanding your task.`;

    const message: ConversationMessage = {
      role: "user",
      content: systemPrompt,
    };

    // Add caching control for repeated system prompts
    if (!this.systemPromptCached) {
      message.content = [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ];
      this.systemPromptCached = true;
    }

    this.messages = [message];
    Logger.debug("Built system prompt", {
      vision: vision.substring(0, 100) + "...",
      phase,
      toolCount: tools.length,
    });

    return message;
  }

  // NEW: Build conversational system prompt for interactive conversations
  buildConversationalSystemPrompt(
    options: ConversationalSystemPromptOptions
  ): ConversationMessage {
    const { workingDirectory, tools, context, userGoal } = options;

    const systemPrompt = `You are Claude, a helpful AI assistant with access to development tools. You're in a conversational mode where you should:

🎯 PRIMARY GOAL: Have a meaningful conversation with the user to understand their needs and help them achieve their goals.

WORKING DIRECTORY: ${workingDirectory}

💬 CONVERSATION GUIDELINES:
1. **Engage conversationally first** - Talk with the user to understand their project and goals
2. **Use tools thoughtfully** - Only use tools when:
   • The user specifically asks you to analyze, read, or modify something
   • You need information to better answer their question
   • It would genuinely help the conversation (not just because tools are available)
3. **Ask before major actions** - Before running commands, writing files, or making changes, explain what you plan to do and why
4. **Be curious and helpful** - Ask follow-up questions to better understand what the user wants to accomplish
5. **Explain your reasoning** - When you do use tools, explain why you're using them and what you hope to learn

🛠️ AVAILABLE TOOLS (use when appropriate):
${this.formatToolDescriptions(tools)}

💡 CONVERSATION STYLE:
• Start by understanding what the user wants to work on
• Be conversational and friendly
• Offer suggestions and ask clarifying questions
• Use tools to support the conversation, not drive it
• When analyzing code or projects, explain what you find in a helpful way
• Focus on being genuinely useful to the user's goals

${userGoal ? `\nUSER'S STATED GOAL: ${userGoal}\n` : ""}
${context ? `\nADDITIONAL CONTEXT:\n${context}` : ""}

You're here to have a helpful conversation and assist with development tasks. What would you like to work on?`;

    const message: ConversationMessage = {
      role: "user",
      content: systemPrompt,
    };

    // Add caching control for repeated system prompts
    if (!this.systemPromptCached) {
      message.content = [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ];
      this.systemPromptCached = true;
    }

    this.messages = [message];
    Logger.debug("Built conversational system prompt", {
      workingDirectory,
      toolCount: tools.length,
      hasUserGoal: !!userGoal,
    });

    return message;
  }

  addUserMessage(content: string): ConversationMessage {
    const message: ConversationMessage = {
      role: "user",
      content,
    };

    this.messages.push(message);
    Logger.debug("Added user message", {
      contentLength: content.length,
      totalMessages: this.messages.length,
    });

    return message;
  }

  // NEW: Method to add assistant message with preserved thinking blocks
  addAssistantMessageWithPreservedThinking(
    textContent: string,
    thinkingBlocks: ThinkingBlock[],
    toolCalls: ToolCall[] = []
  ): ConversationMessage {
    const content: any[] = [];

    // Add preserved thinking blocks first (with signatures)
    thinkingBlocks.forEach((block) => {
      content.push({
        type: "thinking",
        thinking: block.thinking,
        signature: block.signature,
      });
    });

    // Add text content if present
    if (textContent.trim()) {
      content.push({
        type: "text",
        text: textContent,
      });
    }

    // Add tool_use blocks
    toolCalls.forEach((toolCall) => {
      content.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.parameters,
      });
    });

    const message: ConversationMessage = {
      role: "assistant",
      content: content,
    };

    this.messages.push(message);
    Logger.debug("Added assistant message with preserved thinking", {
      contentLength: textContent.length,
      thinkingBlockCount: thinkingBlocks.length,
      toolCallCount: toolCalls.length,
      totalMessages: this.messages.length,
    });

    return message;
  }

  // DEPRECATED: These methods should not be used anymore with thinking mode
  addAssistantMessage(
    content: string,
    thinkingContent?: string
  ): ConversationMessage {
    Logger.warn(
      "addAssistantMessage called with thinking mode enabled - this may cause API errors"
    );

    // For backwards compatibility, create a simple message without thinking blocks
    const message: ConversationMessage = {
      role: "assistant",
      content: content,
    };

    this.messages.push(message);
    Logger.debug("Added assistant message (legacy)", {
      contentLength: content.length,
      totalMessages: this.messages.length,
    });

    return message;
  }

  addAssistantMessageWithToolCalls(
    textContent: string,
    toolCalls: ToolCall[],
    thinkingContent?: string
  ): ConversationMessage {
    Logger.warn(
      "addAssistantMessageWithToolCalls called with thinking mode enabled - this may cause API errors"
    );

    const content: any[] = [];

    // Add text content if present
    if (textContent.trim()) {
      content.push({
        type: "text",
        text: textContent,
      });
    }

    // Add tool_use blocks
    toolCalls.forEach((toolCall) => {
      content.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.parameters,
      });
    });

    const message: ConversationMessage = {
      role: "assistant",
      content: content,
    };

    this.messages.push(message);
    Logger.debug("Added assistant message with tool calls (legacy)", {
      contentLength: textContent.length,
      toolCallCount: toolCalls.length,
      totalMessages: this.messages.length,
    });

    return message;
  }

  addToolResult(toolUseId: string, result: string): ToolResultMessage {
    const message: ToolResultMessage = {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: result,
        },
      ],
    };

    this.messages.push(message);
    Logger.debug("Added tool result", {
      toolUseId,
      resultLength: result.length,
      totalMessages: this.messages.length,
    });

    return message;
  }

  addMultipleToolResults(
    results: Array<{ toolUseId: string; result: string }>
  ): ToolResultMessage {
    const message: ToolResultMessage = {
      role: "user",
      content: results.map(({ toolUseId, result }) => ({
        type: "tool_result",
        tool_use_id: toolUseId,
        content: result,
      })),
    };

    this.messages.push(message);
    Logger.debug("Added multiple tool results", {
      resultCount: results.length,
      totalMessages: this.messages.length,
    });

    return message;
  }

  getMessages(): ConversationMessage[] {
    return [...this.messages]; // Return copy to prevent mutation
  }

  getLastMessage(): ConversationMessage | null {
    return this.messages.length > 0
      ? this.messages[this.messages.length - 1]
      : null;
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  // Estimate token count for context management
  estimateTokenCount(): number {
    let totalTokens = 0;

    for (const message of this.messages) {
      if (typeof message.content === "string") {
        totalTokens += this.estimateTokensInText(message.content);
      } else if (Array.isArray(message.content)) {
        for (const content of message.content) {
          if (content.text) {
            totalTokens += this.estimateTokensInText(content.text);
          }
          if (content.content) {
            totalTokens += this.estimateTokensInText(content.content);
          }
          if (content.thinking) {
            totalTokens += this.estimateTokensInText(content.thinking);
          }
        }
      }

      if (message.thinking_content) {
        totalTokens += this.estimateTokensInText(message.thinking_content);
      }
    }

    return totalTokens;
  }

  // Context management for long conversations
  pruneContextIfNeeded(maxTokens: number = 180000): boolean {
    const currentTokens = this.estimateTokenCount();

    if (currentTokens <= maxTokens) {
      return false;
    }

    Logger.info("Context pruning needed", {
      currentTokens,
      maxTokens,
      messageCount: this.messages.length,
    });

    // Keep system prompt and recent messages
    const systemPrompt = this.messages[0];
    const recentMessages = this.messages.slice(-10); // Keep last 10 messages

    this.messages = [systemPrompt, ...recentMessages];

    Logger.info("Context pruned", {
      newTokens: this.estimateTokenCount(),
      newMessageCount: this.messages.length,
    });

    return true;
  }

  clear(): void {
    this.messages = [];
    this.systemPromptCached = false;
    Logger.debug("Message history cleared");
  }

  // Helper methods
  private formatToolDescriptions(tools: Tool[]): string {
    if (tools.length === 0) {
      return "No tools available.";
    }

    return tools
      .map((tool, index) => {
        const name = tool.name || "unnamed_tool";
        const description = tool.description || "No description available";
        return `${index + 1}. ${name}: ${description}`;
      })
      .join("\n");
  }

  private estimateTokensInText(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    // This is a simplified estimate - actual tokenization would be more accurate
    return Math.ceil(text.length / 4);
  }

  // Debugging and inspection methods
  getConversationSummary(): {
    messageCount: number;
    estimatedTokens: number;
    phases: string[];
    toolUsage: Record<string, number>;
  } {
    const phases: string[] = [];
    const toolUsage: Record<string, number> = {};

    for (const message of this.messages) {
      // Extract phase information from system prompts
      if (message.role === "user" && typeof message.content === "string") {
        const phaseMatch = message.content.match(/CURRENT PHASE: (\w+)/);
        if (phaseMatch && !phases.includes(phaseMatch[1])) {
          phases.push(phaseMatch[1]);
        }
      }

      // Count tool usage from tool results
      if (message.role === "user" && Array.isArray(message.content)) {
        for (const content of message.content) {
          if (content.type === "tool_result") {
            // Extract tool name from tool_use_id if possible
            const toolName = content.tool_use_id?.split("_")[0] || "unknown";
            toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
          }
        }
      }
    }

    return {
      messageCount: this.getMessageCount(),
      estimatedTokens: this.estimateTokenCount(),
      phases,
      toolUsage,
    };
  }
}

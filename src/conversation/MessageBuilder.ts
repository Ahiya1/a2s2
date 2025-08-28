import { Tool } from "../tools/ToolManager";
import { Logger } from "../logging/Logger";

export interface ConversationMessage {
  role: "user" | "assistant";
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        tool_use_id?: string;
        content?: string;
      }>;
  thinking_content?: string;
}

export interface SystemPromptOptions {
  vision: string;
  workingDirectory: string;
  phase?: "EXPLORE" | "SUMMON" | "COMPLETE";
  tools: Tool[];
  context?: string;
}

export interface ToolResultMessage {
  role: "user";
  content: Array<{
    type: "tool_result";
    tool_use_id: string;
    content: string;
  }>;
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

  addAssistantMessage(
    content: string,
    thinkingContent?: string
  ): ConversationMessage {
    const message: ConversationMessage = {
      role: "assistant",
      content,
    };

    if (thinkingContent) {
      message.thinking_content = thinkingContent;
    }

    this.messages.push(message);
    Logger.debug("Added assistant message", {
      contentLength: content.length,
      hasThinking: !!thinkingContent,
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
      .map(
        (tool, index) =>
          `${index + 1}. ${tool.name}: ${tool.description || "No description available"}`
      )
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

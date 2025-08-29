import {
  ConversationManager,
  ConversationOptions,
  ConversationResult,
} from "../conversation/ConversationManager";
import { ToolManager, Tool } from "../tools/ToolManager";
import { CompletionTool } from "../tools/autonomy/CompletionTool";
import { ContinuationTool } from "../tools/autonomy/ContinuationTool";
import { PhaseReportingTool } from "../tools/autonomy/PhaseReportingTool";
import { WebSearchTool } from "../tools/web/WebSearchTool";
import { AnthropicConfigManager } from "../config/AnthropicConfig";
import { Logger } from "../logging/Logger";

export type AgentPhase = "EXPLORE" | "SUMMON" | "COMPLETE";

export interface AgentSessionOptions {
  vision: string;
  workingDirectory?: string;
  phase?: AgentPhase;
  maxIterations?: number;
  costBudget?: number;
  enableWebSearch?: boolean;
  enableExtendedContext?: boolean;
}

export interface AgentSessionResult {
  success: boolean;
  finalPhase: AgentPhase;
  completionReport?: any;
  iterationCount: number;
  totalCost: number;
  sessionId: string;
  error?: string;
  duration: number;
}

export interface SessionMetrics {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  phase: AgentPhase;
  iterationCount: number;
  toolCallsCount: number;
  totalCost: number;
  tokensUsed: number;
  filesModified: string[];
  filesCreated: string[];
}

export class AgentSession {
  private sessionId: string;
  private conversationManager: ConversationManager;
  private toolManager: ToolManager;
  private phaseReportingTool!: PhaseReportingTool;
  private completionTool!: CompletionTool;
  private continuationTool!: ContinuationTool;
  private webSearchTool?: WebSearchTool;
  private metrics: SessionMetrics;
  private isCompleted: boolean = false;

  constructor(options: AgentSessionOptions) {
    this.sessionId = this.generateSessionId();

    // Validate API key first before proceeding
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    // Initialize conversation manager with Claude 4 Sonnet
    const configManager = new AnthropicConfigManager({
      enableExtendedContext: options.enableExtendedContext || false,
      enableWebSearch: options.enableWebSearch !== false, // Default to true
    });

    this.conversationManager = new ConversationManager(
      configManager.getConfig()
    );

    // Initialize tool manager with autonomy tools
    this.toolManager = new ToolManager();
    this.setupAutonomyTools();

    // Setup web search if enabled
    if (options.enableWebSearch !== false) {
      this.setupWebSearch();
    }

    // Initialize metrics
    this.metrics = {
      sessionId: this.sessionId,
      startTime: new Date(),
      phase: options.phase || "EXPLORE",
      iterationCount: 0,
      toolCallsCount: 0,
      totalCost: 0,
      tokensUsed: 0,
      filesModified: [],
      filesCreated: [],
    };

    Logger.info("AgentSession initialized", {
      sessionId: this.sessionId,
      vision: options.vision.substring(0, 100) + "...",
      workingDirectory: options.workingDirectory || process.cwd(),
      phase: this.metrics.phase,
      enableWebSearch: options.enableWebSearch,
    });
  }

  async execute(options: AgentSessionOptions): Promise<AgentSessionResult> {
    const startTime = Date.now();

    try {
      Logger.info("Starting autonomous agent execution", {
        sessionId: this.sessionId,
        vision: options.vision.substring(0, 100) + "...",
      });

      // Setup completion callback
      this.completionTool.onCompletion((report) => {
        this.handleCompletion(report);
      });

      // Get all available tools
      const tools = this.getAllTools();

      // Configure conversation options with proper cost budget handling
      const conversationOptions: ConversationOptions = {
        maxIterations: options.maxIterations || 190,
        costBudget: options.costBudget || 50.0,
        useExtendedContext: options.enableExtendedContext,
        enablePromptCaching: true,
      };

      // Execute autonomous conversation
      const result = await this.conversationManager.executeWithTools(
        options.vision,
        tools,
        conversationOptions
      );

      this.metrics.endTime = new Date();
      this.metrics.iterationCount = result.iterationCount;
      this.metrics.totalCost = result.totalCost;

      // Count tool calls from conversation
      const summary = this.conversationManager.getConversationSummary();
      this.metrics.toolCallsCount = Object.values(summary.toolUsage).reduce(
        (sum, count) => sum + count,
        0
      );

      Logger.info("Agent execution completed", {
        sessionId: this.sessionId,
        success: result.success,
        iterations: result.iterationCount,
        cost: result.totalCost.toFixed(4),
        duration: `${(Date.now() - startTime) / 1000}s`,
      });

      // Return actual success status, ensuring result is considered successful
      // if we completed iterations without errors
      const success = result.success && result.error === undefined;

      return {
        success,
        finalPhase: this.phaseReportingTool.getCurrentPhase() || "COMPLETE",
        completionReport: this.isCompleted
          ? this.getCompletionReport()
          : undefined,
        iterationCount: result.iterationCount,
        totalCost: result.totalCost,
        sessionId: this.sessionId,
        error: result.error?.message,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.metrics.endTime = new Date();

      Logger.error("Agent execution failed", {
        sessionId: this.sessionId,
        error: (error as Error).message,
      });

      return {
        success: false,
        finalPhase: this.phaseReportingTool?.getCurrentPhase() || "EXPLORE",
        iterationCount: this.metrics.iterationCount,
        totalCost: this.metrics.totalCost,
        sessionId: this.sessionId,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      };
    }
  }

  private setupAutonomyTools(): void {
    this.phaseReportingTool = new PhaseReportingTool();
    this.completionTool = new CompletionTool();
    this.continuationTool = new ContinuationTool();

    this.toolManager.registerTool("report_phase", this.phaseReportingTool);
    this.toolManager.registerTool("report_complete", this.completionTool);
    this.toolManager.registerTool("continue_work", this.continuationTool);
  }

  private setupWebSearch(): void {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      Logger.warn("Web search disabled: ANTHROPIC_API_KEY not found");
      return;
    }

    this.webSearchTool = new WebSearchTool(apiKey);
    this.toolManager.registerTool("web_search", this.webSearchTool);
  }

  private getAllTools(): Tool[] {
    const toolNames = this.toolManager.getAllToolNames();
    const tools: Tool[] = [];

    for (const name of toolNames) {
      const tool = this.toolManager.getTool(name);
      if (tool) {
        // Ensure the tool has the required properties
        const enhancedTool = {
          name: tool.name || name,
          description: tool.description || this.getToolDescription(name),
          schema: tool.schema || this.getToolSchema(name),
          execute: async (params: unknown) => {
            this.metrics.toolCallsCount++;
            return await this.toolManager.executeTool(name, params);
          },
        };
        tools.push(enhancedTool);
      }
    }

    Logger.debug("Available tools configured", {
      sessionId: this.sessionId,
      toolCount: tools.length,
      tools: tools.map((t) => t.name),
    });

    return tools;
  }

  private getToolDescription(toolName: string): string {
    const descriptions: Record<string, string> = {
      get_project_tree:
        "Analyze project structure using tree command with intelligent exclusions",
      read_files:
        "Read multiple files and return their contents with error handling",
      write_files: "Write multiple files atomically with rollback protection",
      run_command: "Execute shell commands with timeout and error handling",
      web_search:
        "Search the web for current information, documentation, and best practices",
      report_phase:
        "Report current phase of execution and provide status updates",
      report_complete:
        "Signal task completion with comprehensive summary report",
      continue_work: "Indicate continuation of work with detailed next steps",
    };

    return descriptions[toolName] || `Execute ${toolName} tool`;
  }

  private getToolSchema(toolName: string): any {
    // Return appropriate schemas based on tool type
    const schemas: Record<string, any> = {
      get_project_tree: {
        type: "object",
        properties: {
          path: { type: "string", description: "Project path to analyze" },
        },
        required: [],
      },
      read_files: {
        type: "object",
        properties: {
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Array of file paths to read",
          },
        },
        required: ["paths"],
      },
      write_files: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "File path" },
                content: { type: "string", description: "File content" },
              },
              required: ["path", "content"],
            },
            description: "Array of files to write",
          },
        },
        required: ["files"],
      },
      run_command: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          timeout: { type: "number", description: "Timeout in milliseconds" },
        },
        required: ["command"],
      },
    };

    return (
      schemas[toolName] || {
        type: "object",
        properties: {},
        required: [],
      }
    );
  }

  private handleCompletion(report: any): void {
    this.isCompleted = true;

    // Update metrics with completion data
    if (report.filesCreated) {
      this.metrics.filesCreated.push(...report.filesCreated);
    }
    if (report.filesModified) {
      this.metrics.filesModified.push(...report.filesModified);
    }

    Logger.info("Agent reported completion", {
      sessionId: this.sessionId,
      success: report.success,
      filesCreated: report.filesCreated?.length || 0,
      filesModified: report.filesModified?.length || 0,
    });
  }

  private getCompletionReport(): any {
    // Aggregate completion data from various sources
    return {
      sessionId: this.sessionId,
      completedAt: this.metrics.endTime,
      duration: this.metrics.endTime
        ? this.metrics.endTime.getTime() - this.metrics.startTime.getTime()
        : 0,
      iterations: this.metrics.iterationCount,
      toolCalls: this.metrics.toolCallsCount,
      totalCost: this.metrics.totalCost,
      filesCreated: this.metrics.filesCreated,
      filesModified: this.metrics.filesModified,
      finalPhase: this.phaseReportingTool?.getCurrentPhase(),
      phaseStats: this.phaseReportingTool?.getPhaseStats(),
      continuationStats: this.continuationTool?.getContinuationStats(),
      webSearchStats: this.webSearchTool?.getSearchStats(),
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public getters for monitoring
  getSessionId(): string {
    return this.sessionId;
  }

  getMetrics(): SessionMetrics {
    return { ...this.metrics };
  }

  getCurrentPhase(): AgentPhase {
    return this.phaseReportingTool?.getCurrentPhase() || "EXPLORE";
  }

  isSessionCompleted(): boolean {
    return this.isCompleted;
  }

  // Cleanup method
  cleanup(): void {
    try {
      this.completionTool?.removeCompletionCallback(() => {});
      this.conversationManager?.clear();
      Logger.info("Agent session cleaned up", { sessionId: this.sessionId });
    } catch (error) {
      Logger.warn("Error during cleanup", {
        sessionId: this.sessionId,
        error: (error as Error).message,
      });
    }
  }
}

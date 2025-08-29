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
import { StreamingProgress } from "../conversation/StreamingManager";
import { Logger } from "../logging/Logger";

// NEW: Progress indicator utilities
const ora = require("ora");

export type AgentPhase = "EXPLORE" | "SUMMON" | "COMPLETE";

export interface AgentSessionOptions {
  vision: string;
  workingDirectory?: string;
  phase?: AgentPhase;
  maxIterations?: number;
  costBudget?: number;
  enableWebSearch?: boolean;
  enableExtendedContext?: boolean;
  // NEW: Streaming options for autonomous agents
  enableStreaming?: boolean;
  showProgress?: boolean;
  verboseProgress?: boolean;
  enableCancellation?: boolean;
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
  // NEW: Streaming results
  wasStreamed?: boolean;
  streamingDuration?: number;
  phaseTransitions?: PhaseTransition[];
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
  // NEW: Streaming metrics
  streamingTime?: number;
  phaseTransitions: PhaseTransition[];
}

// NEW: Phase transition tracking
export interface PhaseTransition {
  from: AgentPhase;
  to: AgentPhase;
  timestamp: Date;
  reason?: string;
  duration: number;
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

  // NEW: Streaming state for autonomous execution
  private currentSpinner?: any;
  private streamingActive: boolean = false;
  private currentPhase: AgentPhase;
  private phaseStartTime: number = 0;
  private totalStreamingDuration: number = 0;
  private options: AgentSessionOptions;
  private cancellationRequested: boolean = false;

  constructor(options: AgentSessionOptions) {
    this.sessionId = this.generateSessionId();
    this.options = options;
    this.currentPhase = options.phase || "EXPLORE";

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    const configManager = new AnthropicConfigManager({
      enableExtendedContext: options.enableExtendedContext || false,
      enableWebSearch: options.enableWebSearch !== false,
      // NEW: Configure streaming for autonomous agents
      enableStreaming: options.enableStreaming !== false,
      showProgressIndicators: options.showProgress !== false,
    });

    this.conversationManager = new ConversationManager(
      configManager.getConfig()
    );

    this.toolManager = new ToolManager();
    this.setupAutonomyTools();

    if (options.enableWebSearch !== false) {
      this.setupWebSearch();
    }

    // NEW: Setup cancellation handling
    if (options.enableCancellation !== false) {
      this.setupCancellationHandling();
    }

    this.metrics = {
      sessionId: this.sessionId,
      startTime: new Date(),
      phase: this.currentPhase,
      iterationCount: 0,
      toolCallsCount: 0,
      totalCost: 0,
      tokensUsed: 0,
      filesModified: [],
      filesCreated: [],
      phaseTransitions: [],
    };

    Logger.info("AgentSession initialized", {
      sessionId: this.sessionId,
      vision: options.vision.substring(0, 100) + "...",
      workingDirectory: options.workingDirectory || process.cwd(),
      phase: this.currentPhase,
      enableWebSearch: options.enableWebSearch,
      streamingEnabled: options.enableStreaming !== false,
    });
  }

  // NEW: Setup CTRL+C handling during autonomous execution
  private setupCancellationHandling(): void {
    const originalHandler = process.listeners("SIGINT");

    process.removeAllListeners("SIGINT");
    process.on("SIGINT", () => {
      if (this.streamingActive) {
        this.cancellationRequested = true;
        this.stopCurrentOperation();
        console.log(
          "\n\n🛑 Agent execution cancelled by user. Cleaning up...\n"
        );
        process.exit(0);
      } else {
        // Restore original behavior
        originalHandler.forEach((handler) =>
          process.on("SIGINT", handler as any)
        );
        process.kill(process.pid, "SIGINT");
      }
    });
  }

  async execute(options: AgentSessionOptions): Promise<AgentSessionResult> {
    const startTime = Date.now();
    this.phaseStartTime = startTime;

    try {
      Logger.info("Starting autonomous agent execution", {
        sessionId: this.sessionId,
        vision: options.vision.substring(0, 100) + "...",
      });

      // NEW: Show initial progress for streaming
      if (options.showProgress !== false) {
        this.showPhaseProgress(
          this.currentPhase,
          "Initializing autonomous agent..."
        );
      }

      this.completionTool.onCompletion((report) => {
        this.handleCompletion(report);
      });

      const tools = this.getAllTools();

      const conversationOptions: ConversationOptions = {
        maxIterations: options.maxIterations || 190,
        costBudget: options.costBudget || 50.0,
        useExtendedContext: options.enableExtendedContext,
        enablePromptCaching: true,
        // NEW: Streaming configuration for autonomous execution
        enableStreaming: options.enableStreaming !== false,
        streamingOptions: {
          showProgress: options.showProgress !== false,
          onProgress: this.handleStreamingProgress.bind(this),
          onText: this.handleStreamingText.bind(this),
          onThinking: this.handleStreamingThinking.bind(this),
          onToolCall: this.handleStreamingToolCall.bind(this),
          onComplete: this.handleStreamingComplete.bind(this),
          onError: this.handleStreamingError.bind(this),
        },
        onProgress: this.handleStreamingProgress.bind(this),
        onStreamText: this.handleStreamingText.bind(this),
        onStreamThinking: this.handleStreamingThinking.bind(this),
      };

      this.streamingActive = true;
      const result = await this.conversationManager.executeWithTools(
        options.vision,
        tools,
        conversationOptions
      );
      this.streamingActive = false;

      this.metrics.endTime = new Date();
      this.metrics.iterationCount = result.iterationCount;
      this.metrics.totalCost = result.totalCost;

      if (result.streamingDuration) {
        this.totalStreamingDuration = result.streamingDuration;
        this.metrics.streamingTime = result.streamingDuration;
      }

      const summary = this.conversationManager.getConversationSummary();
      this.metrics.toolCallsCount = Object.values(summary.toolUsage).reduce(
        (sum, count) => sum + count,
        0
      );

      this.hideProgress();

      Logger.info("Agent execution completed", {
        sessionId: this.sessionId,
        success: result.success,
        iterations: result.iterationCount,
        cost: result.totalCost.toFixed(4),
        duration: `${(Date.now() - startTime) / 1000}s`,
        streamingDuration: this.totalStreamingDuration,
        cancelled: this.cancellationRequested,
      });

      const success =
        result.success &&
        result.error === undefined &&
        !this.cancellationRequested;

      return {
        success,
        finalPhase: this.phaseReportingTool.getCurrentPhase() || "COMPLETE",
        completionReport: this.isCompleted
          ? this.getCompletionReport()
          : undefined,
        iterationCount: result.iterationCount,
        totalCost: result.totalCost,
        sessionId: this.sessionId,
        error: this.cancellationRequested
          ? "Cancelled by user"
          : result.error?.message,
        duration: Date.now() - startTime,
        wasStreamed: options.enableStreaming !== false,
        streamingDuration: this.totalStreamingDuration,
        phaseTransitions: [...this.metrics.phaseTransitions],
      };
    } catch (error) {
      this.metrics.endTime = new Date();
      this.hideProgress();

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
        wasStreamed: options.enableStreaming !== false,
        streamingDuration: this.totalStreamingDuration,
        phaseTransitions: [...this.metrics.phaseTransitions],
      };
    }
  }

  // NEW: Streaming event handlers for autonomous execution
  private handleStreamingProgress(progress: StreamingProgress): void {
    if (this.cancellationRequested) return;

    // Map streaming phases to agent phases
    const phaseMessages = {
      starting: "Initializing request...",
      streaming: "Processing with Claude...",
      thinking: "Deep reasoning in progress...",
      tool_use: "Executing development tools...",
      complete: "Iteration complete",
      error: "Error occurred",
    };

    const message = phaseMessages[progress.phase] || "Working...";

    if (progress.percentage !== undefined && progress.percentage > 0) {
      this.showPhaseProgress(
        this.currentPhase,
        `${message} (${progress.percentage}%)`
      );
    } else {
      this.showPhaseProgress(this.currentPhase, message);
    }
  }

  private handleStreamingText(text: string): void {
    if (this.cancellationRequested) return;

    if (this.options.verboseProgress) {
      this.hideProgress();
      process.stdout.write(text);
    } else {
      // For autonomous mode, we typically don't show the raw text
      // but we could show abbreviated versions
      const preview = text.length > 100 ? text.substring(0, 97) + "..." : text;
      this.showPhaseProgress(this.currentPhase, `Response: ${preview}`);
    }
  }

  private handleStreamingThinking(thinking: string): void {
    if (this.cancellationRequested) return;

    if (this.options.verboseProgress) {
      const preview =
        thinking.length > 80 ? thinking.substring(0, 77) + "..." : thinking;
      this.showPhaseProgress(this.currentPhase, `Thinking: ${preview}`);
    }
  }

  private handleStreamingToolCall(toolCall: any): void {
    if (this.cancellationRequested) return;

    this.showPhaseProgress(this.currentPhase, `Using tool: ${toolCall.name}`);

    // Check for phase transitions based on tool calls
    if (toolCall.name === "report_phase") {
      this.handlePhaseTransition(toolCall.parameters?.phase);
    }
  }

  private handleStreamingComplete(): void {
    if (!this.cancellationRequested) {
      this.showPhaseProgress(
        this.currentPhase,
        "Iteration completed successfully"
      );
    }
  }

  private handleStreamingError(error: Error): void {
    this.hideProgress();
    console.log(`\n❌ Streaming error: ${error.message}`);
  }

  // NEW: Phase management for autonomous execution
  private handlePhaseTransition(newPhase?: AgentPhase): void {
    if (!newPhase || newPhase === this.currentPhase) return;

    const now = Date.now();
    const duration = now - this.phaseStartTime;

    // Record the transition
    this.metrics.phaseTransitions.push({
      from: this.currentPhase,
      to: newPhase,
      timestamp: new Date(),
      duration,
    });

    Logger.info("Phase transition", {
      sessionId: this.sessionId,
      from: this.currentPhase,
      to: newPhase,
      duration: `${(duration / 1000).toFixed(1)}s`,
    });

    this.currentPhase = newPhase;
    this.metrics.phase = newPhase;
    this.phaseStartTime = now;

    // Update progress indicator
    this.showPhaseProgress(newPhase, `Entering ${newPhase} phase...`);
  }

  // NEW: Visual progress indicators
  private showPhaseProgress(phase: AgentPhase, message: string): void {
    if (!process.stdout.isTTY || this.options.showProgress === false) return;

    this.hideProgress();

    const phaseEmojis = {
      EXPLORE: "🔍",
      SUMMON: "🧙",
      COMPLETE: "✅",
    };

    const phaseColors = {
      EXPLORE: "blue",
      SUMMON: "magenta",
      COMPLETE: "green",
    } as const;

    const fullMessage = `${phaseEmojis[phase]} ${phase}: ${message}`;

    try {
      this.currentSpinner = ora({
        text: fullMessage,
        spinner: "dots",
        color: phaseColors[phase],
      }).start();
    } catch (error) {
      // Fallback if ora is not available
      console.log(`\r${fullMessage}`);
    }
  }

  private hideProgress(): void {
    if (this.currentSpinner) {
      try {
        this.currentSpinner.stop();
        this.currentSpinner = undefined;
      } catch (error) {
        // Ignore errors when stopping spinner
      }
    }
  }

  private stopCurrentOperation(): void {
    this.hideProgress();

    if (this.conversationManager.isStreamingActive()) {
      this.conversationManager.stopStreaming();
    }

    this.streamingActive = false;
    this.cancellationRequested = true;
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
        const enhancedTool = {
          name: tool.name || name,
          description: tool.description || this.getToolDescription(name),
          schema: tool.schema || this.getToolSchema(name),
          execute: async (params: unknown) => {
            this.metrics.toolCallsCount++;

            // NEW: Show tool execution progress
            if (this.options.showProgress !== false) {
              this.showPhaseProgress(this.currentPhase, `Executing ${name}...`);
            }

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

    if (report.filesCreated) {
      this.metrics.filesCreated.push(...report.filesCreated);
    }
    if (report.filesModified) {
      this.metrics.filesModified.push(...report.filesModified);
    }

    // NEW: Show completion progress
    if (this.options.showProgress !== false) {
      this.showPhaseProgress("COMPLETE", "Task completed successfully!");
      setTimeout(() => this.hideProgress(), 2000);
    }

    Logger.info("Agent reported completion", {
      sessionId: this.sessionId,
      success: report.success,
      filesCreated: report.filesCreated?.length || 0,
      filesModified: report.filesModified?.length || 0,
    });
  }

  private getCompletionReport(): any {
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
      // NEW: Streaming-specific completion data
      streamingDuration: this.metrics.streamingTime,
      phaseTransitions: this.metrics.phaseTransitions,
      wasStreamed: this.options.enableStreaming !== false,
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
    return this.currentPhase;
  }

  isSessionCompleted(): boolean {
    return this.isCompleted;
  }

  // NEW: Streaming utilities for autonomous agents
  isStreamingActive(): boolean {
    return this.streamingActive;
  }

  stopExecution(): void {
    this.stopCurrentOperation();
  }

  getPhaseTransitions(): PhaseTransition[] {
    return [...this.metrics.phaseTransitions];
  }

  getTotalStreamingDuration(): number {
    return this.totalStreamingDuration;
  }

  cleanup(): void {
    try {
      this.stopCurrentOperation();
      this.completionTool?.removeCompletionCallback(() => {});
      this.conversationManager?.clear();
      Logger.info("Agent session cleaned up", {
        sessionId: this.sessionId,
        streamingDuration: this.totalStreamingDuration,
      });
    } catch (error) {
      Logger.warn("Error during cleanup", {
        sessionId: this.sessionId,
        error: (error as Error).message,
      });
    }
  }
}

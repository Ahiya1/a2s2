import { ToolManager, Tool, ToolResult } from "../tools/ToolManager";
import { SessionPersistenceManager } from "../persistence/SessionPersistenceManager";
import { ConversationEventEmitter } from "../events/ConversationEventEmitter";
import { DatabaseConfigManager } from "../config/DatabaseConfig";
import { Logger } from "../logging/Logger";

export interface DatabaseAwareConfig {
  enableTracking: boolean;
  trackAllTools: boolean;
  trackedTools: string[];
  excludedTools: string[];
  trackFileOperations: boolean;
  trackExecutionMetrics: boolean;
  enableEventEmission: boolean;
  sessionTimeout: number; // milliseconds
}

export interface ToolExecutionContext {
  sessionId?: string;
  conversationId?: string;
  iterationCount?: number;
  phase?: string;
  metadata?: Record<string, any>;
}

export interface TrackedToolResult extends ToolResult {
  executionContext?: ToolExecutionContext;
  trackingId?: string;
  startTime?: Date;
  endTime?: Date;
  fileOperations?: Array<{
    type: "read" | "write" | "create" | "delete";
    filePath: string;
    success: boolean;
    error?: string;
    fileSize?: number;
  }>;
}

/**
 * DatabaseAwareToolManager wraps the existing ToolManager without modifying it.
 * It provides database tracking capabilities while maintaining the exact same interface.
 *
 * This is a safe wrapper that preserves backward compatibility completely.
 */
export class DatabaseAwareToolManager extends ToolManager {
  private sessionManager?: SessionPersistenceManager;
  private eventEmitter?: ConversationEventEmitter;
  private dbConfigManager: DatabaseConfigManager;
  private config: DatabaseAwareConfig;

  // Execution tracking
  private currentContext?: ToolExecutionContext;
  private executionHistory: Map<string, TrackedToolResult[]> = new Map();

  constructor(
    config: Partial<DatabaseAwareConfig> = {},
    sessionManager?: SessionPersistenceManager,
    eventEmitter?: ConversationEventEmitter
  ) {
    // Initialize the parent ToolManager with all default tools
    super();

    this.sessionManager = sessionManager;
    this.eventEmitter = eventEmitter;
    this.dbConfigManager = DatabaseConfigManager.getInstance();

    this.config = {
      enableTracking: true,
      trackAllTools: true,
      trackedTools: [],
      excludedTools: ["get_project_tree"], // Exclude noisy tools by default
      trackFileOperations: true,
      trackExecutionMetrics: true,
      enableEventEmission: true,
      sessionTimeout: 300000, // 5 minutes
      ...config,
    };

    Logger.info("DatabaseAwareToolManager initialized", {
      trackingEnabled:
        this.config.enableTracking && this.dbConfigManager.isEnabled(),
      trackAllTools: this.config.trackAllTools,
      sessionManagerAvailable: !!this.sessionManager,
      eventEmitterAvailable: !!this.eventEmitter,
    });
  }

  // Override executeTool to add tracking
  async executeTool(name: string, params: unknown): Promise<ToolResult> {
    const trackingId = this.generateTrackingId(name);
    const startTime = new Date();

    // Check if this tool should be tracked
    const shouldTrack = this.shouldTrackTool(name);

    if (shouldTrack) {
      Logger.debug("Starting tracked tool execution", {
        toolName: name,
        trackingId,
        sessionId: this.currentContext?.sessionId,
        hasParams: !!params,
      });
    }

    try {
      // Execute the original tool
      const originalResult = await super.executeTool(name, params);
      const endTime = new Date();
      const executionTime = endTime.getTime() - startTime.getTime();

      // Create tracked result
      const trackedResult: TrackedToolResult = {
        ...originalResult,
        executionContext: this.currentContext,
        trackingId,
        startTime,
        endTime,
      };

      if (shouldTrack) {
        // Detect file operations from tool result
        if (this.config.trackFileOperations) {
          trackedResult.fileOperations = this.detectFileOperations(
            name,
            params,
            originalResult
          );
        }

        // Track execution
        await this.trackToolExecution(
          name,
          params,
          trackedResult,
          executionTime
        );
      }

      return trackedResult;
    } catch (error) {
      const endTime = new Date();
      const executionTime = endTime.getTime() - startTime.getTime();

      // Create error result
      const errorResult: TrackedToolResult = {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          executionTime,
          toolName: name,
          timestamp: endTime,
        },
        executionContext: this.currentContext,
        trackingId,
        startTime,
        endTime,
      };

      if (shouldTrack) {
        await this.trackToolExecution(name, params, errorResult, executionTime);
      }

      throw error;
    }
  }

  // Context management methods
  setExecutionContext(context: ToolExecutionContext): void {
    this.currentContext = context;

    Logger.debug("Tool execution context set", {
      sessionId: context.sessionId,
      conversationId: context.conversationId,
      phase: context.phase,
    });
  }

  clearExecutionContext(): void {
    this.currentContext = undefined;
    Logger.debug("Tool execution context cleared");
  }

  getExecutionContext(): ToolExecutionContext | undefined {
    return this.currentContext ? { ...this.currentContext } : undefined;
  }

  // Tool execution tracking
  private async trackToolExecution(
    toolName: string,
    parameters: unknown,
    result: TrackedToolResult,
    executionTime: number
  ): Promise<void> {
    try {
      const sessionId = this.currentContext?.sessionId;

      if (!sessionId) {
        Logger.debug("No session context for tool tracking", { toolName });
        return;
      }

      // Track with SessionPersistenceManager
      if (this.sessionManager) {
        this.sessionManager.trackToolExecution(sessionId, {
          toolName,
          parameters,
          result,
          executionTime,
          startTime: result.startTime!,
          endTime: result.endTime!,
        });
      }

      // Track file operations if detected
      if (result.fileOperations && result.fileOperations.length > 0) {
        result.fileOperations.forEach((operation) => {
          this.sessionManager?.trackFileOperation(sessionId, {
            type: operation.type,
            filePath: operation.filePath,
            success: operation.success,
            error: operation.error,
            fileSize: operation.fileSize,
            toolExecutionId: result.trackingId,
          });
        });
      }

      // Add to execution history
      if (!this.executionHistory.has(sessionId)) {
        this.executionHistory.set(sessionId, []);
      }

      const history = this.executionHistory.get(sessionId)!;
      history.push(result);

      // Keep only recent executions (last 100 per session)
      if (history.length > 100) {
        this.executionHistory.set(sessionId, history.slice(-100));
      }

      Logger.debug("Tool execution tracked", {
        toolName,
        sessionId,
        trackingId: result.trackingId,
        success: result.success,
        executionTime,
        fileOperations: result.fileOperations?.length || 0,
      });
    } catch (error) {
      Logger.error("Failed to track tool execution", {
        toolName,
        sessionId: this.currentContext?.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // File operation detection
  private detectFileOperations(
    toolName: string,
    params: unknown,
    result: ToolResult
  ): Array<{
    type: "read" | "write" | "create" | "delete";
    filePath: string;
    success: boolean;
    error?: string;
    fileSize?: number;
  }> {
    const operations: Array<{
      type: "read" | "write" | "create" | "delete";
      filePath: string;
      success: boolean;
      error?: string;
      fileSize?: number;
    }> = [];

    try {
      // Detect file operations based on tool name and parameters
      switch (toolName) {
        case "read_files":
          if (this.isValidParams(params, "paths")) {
            const paths = (params as any).paths;
            if (Array.isArray(paths)) {
              paths.forEach((path: string) => {
                operations.push({
                  type: "read",
                  filePath: path,
                  success: result.success,
                  error: result.error?.message,
                });
              });
            }
          }
          break;

        case "write_files":
          if (this.isValidParams(params, "files")) {
            const files = (params as any).files;
            if (Array.isArray(files)) {
              files.forEach((file: any) => {
                if (file.path) {
                  operations.push({
                    type: this.fileExists(file.path) ? "write" : "create",
                    filePath: file.path,
                    success: result.success,
                    error: result.error?.message,
                    fileSize: file.content ? file.content.length : undefined,
                  });
                }
              });
            }
          }
          break;

        // Add detection for other file-related tools as needed
        default:
          // Try to detect file paths in the result string for other tools
          if (result.success && typeof result.result === "string") {
            const filePathPattern =
              /(?:created|modified|wrote|read|deleted)\s+([^\s]+\.[a-zA-Z]{1,4})/gi;
            let match;

            while ((match = filePathPattern.exec(result.result)) !== null) {
              const filePath = match[1];
              const operationType = this.inferOperationType(match[0]);

              if (operationType) {
                operations.push({
                  type: operationType,
                  filePath,
                  success: true,
                });
              }
            }
          }
          break;
      }
    } catch (error) {
      Logger.warn("Error detecting file operations", {
        toolName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return operations;
  }

  // Utility methods
  private shouldTrackTool(toolName: string): boolean {
    if (!this.config.enableTracking || !this.dbConfigManager.isEnabled()) {
      return false;
    }

    // Check exclusions first
    if (this.config.excludedTools.includes(toolName)) {
      return false;
    }

    // If tracking all tools, return true unless excluded
    if (this.config.trackAllTools) {
      return true;
    }

    // Otherwise, only track explicitly listed tools
    return this.config.trackedTools.includes(toolName);
  }

  private isValidParams(params: unknown, expectedProperty: string): boolean {
    return (
      typeof params === "object" &&
      params !== null &&
      expectedProperty in params
    );
  }

  private fileExists(filePath: string): boolean {
    // Simple heuristic - in a real implementation, you might check the filesystem
    // For now, assume files in common directories exist
    const commonDirs = ["src/", "lib/", "dist/", "build/", "node_modules/"];
    return commonDirs.some((dir) => filePath.includes(dir));
  }

  private inferOperationType(
    matchText: string
  ): "read" | "write" | "create" | "delete" | null {
    const lowerText = matchText.toLowerCase();

    if (lowerText.includes("created")) return "create";
    if (lowerText.includes("modified") || lowerText.includes("wrote"))
      return "write";
    if (lowerText.includes("read")) return "read";
    if (lowerText.includes("deleted")) return "delete";

    return null;
  }

  private generateTrackingId(toolName: string): string {
    return `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API for execution history and statistics
  getExecutionHistory(sessionId: string): TrackedToolResult[] {
    return this.executionHistory.get(sessionId) || [];
  }

  getToolStatistics(sessionId?: string): Record<
    string,
    {
      count: number;
      successRate: number;
      averageExecutionTime: number;
      totalExecutionTime: number;
      fileOperationCount: number;
    }
  > {
    const stats: Record<
      string,
      {
        count: number;
        successRate: number;
        averageExecutionTime: number;
        totalExecutionTime: number;
        fileOperationCount: number;
      }
    > = {};

    const histories = sessionId
      ? [this.executionHistory.get(sessionId) || []]
      : Array.from(this.executionHistory.values());

    histories.forEach((history) => {
      history.forEach((result) => {
        const toolName = result.metadata?.toolName || "unknown";

        if (!stats[toolName]) {
          stats[toolName] = {
            count: 0,
            successRate: 0,
            averageExecutionTime: 0,
            totalExecutionTime: 0,
            fileOperationCount: 0,
          };
        }

        const toolStats = stats[toolName];
        toolStats.count++;

        // Update success rate
        const successCount =
          toolStats.successRate * (toolStats.count - 1) +
          (result.success ? 1 : 0);
        toolStats.successRate = successCount / toolStats.count;

        // Update execution time
        const executionTime = result.metadata?.executionTime || 0;
        toolStats.totalExecutionTime += executionTime;
        toolStats.averageExecutionTime =
          toolStats.totalExecutionTime / toolStats.count;

        // Update file operation count
        toolStats.fileOperationCount += result.fileOperations?.length || 0;
      });
    });

    return stats;
  }

  clearExecutionHistory(sessionId?: string): void {
    if (sessionId) {
      this.executionHistory.delete(sessionId);
      Logger.debug("Execution history cleared for session", { sessionId });
    } else {
      this.executionHistory.clear();
      Logger.debug("All execution history cleared");
    }
  }

  // Configuration management
  updateConfig(newConfig: Partial<DatabaseAwareConfig>): void {
    this.config = { ...this.config, ...newConfig };

    Logger.debug("DatabaseAware tool manager configuration updated", {
      config: this.config,
    });
  }

  getConfig(): Readonly<DatabaseAwareConfig> {
    return { ...this.config };
  }

  // Health and status
  isTrackingEnabled(): boolean {
    return this.config.enableTracking && this.dbConfigManager.isEnabled();
  }

  getStatus(): {
    trackingEnabled: boolean;
    activeSessionsTracked: number;
    totalExecutionsTracked: number;
    sessionManagerAvailable: boolean;
    eventEmitterAvailable: boolean;
    databaseEnabled: boolean;
  } {
    const totalExecutions = Array.from(this.executionHistory.values()).reduce(
      (total, history) => total + history.length,
      0
    );

    return {
      trackingEnabled: this.isTrackingEnabled(),
      activeSessionsTracked: this.executionHistory.size,
      totalExecutionsTracked: totalExecutions,
      sessionManagerAvailable: !!this.sessionManager,
      eventEmitterAvailable: !!this.eventEmitter,
      databaseEnabled: this.dbConfigManager.isEnabled(),
    };
  }

  isHealthy(): boolean {
    const status = this.getStatus();

    // Consider healthy if tracking is working or disabled
    if (!status.trackingEnabled) {
      return true; // Disabled is considered healthy
    }

    // Check if we have too many tracked sessions (memory concern)
    return (
      status.activeSessionsTracked < 1000 &&
      status.totalExecutionsTracked < 10000
    );
  }

  // Cleanup and maintenance
  cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    this.executionHistory.forEach((history, sessionId) => {
      const lastExecution = history[history.length - 1];
      const lastExecutionTime = lastExecution?.endTime?.getTime() || 0;

      if (now - lastExecutionTime > this.config.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    });

    expiredSessions.forEach((sessionId) => {
      this.executionHistory.delete(sessionId);
    });

    if (expiredSessions.length > 0) {
      Logger.debug("Cleaned up expired session tracking", {
        expiredSessions: expiredSessions.length,
        remainingSessions: this.executionHistory.size,
      });
    }
  }

  // Static factory methods
  static create(
    config: Partial<DatabaseAwareConfig> = {}
  ): DatabaseAwareToolManager {
    return new DatabaseAwareToolManager(config);
  }

  static createWithDependencies(
    config: Partial<DatabaseAwareConfig> = {},
    sessionManager: SessionPersistenceManager,
    eventEmitter: ConversationEventEmitter
  ): DatabaseAwareToolManager {
    return new DatabaseAwareToolManager(config, sessionManager, eventEmitter);
  }

  // Integration helpers
  setSessionManager(sessionManager: SessionPersistenceManager): void {
    this.sessionManager = sessionManager;
    Logger.debug("Session manager set on DatabaseAwareToolManager");
  }

  setEventEmitter(eventEmitter: ConversationEventEmitter): void {
    this.eventEmitter = eventEmitter;
    Logger.debug("Event emitter set on DatabaseAwareToolManager");
  }

  removeSessionManager(): void {
    this.sessionManager = undefined;
    Logger.debug("Session manager removed from DatabaseAwareToolManager");
  }

  removeEventEmitter(): void {
    this.eventEmitter = undefined;
    Logger.debug("Event emitter removed from DatabaseAwareToolManager");
  }
}

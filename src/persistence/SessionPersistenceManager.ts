import {
  SessionMetrics,
  PhaseTransition,
  AgentPhase,
} from "../agent/AgentSession";
import { ConversationDAO } from "../database/ConversationDAO";
import { DatabaseConfigManager } from "../config/DatabaseConfig";
import { ConversationEventEmitter } from "../events/ConversationEventEmitter";
import { Logger } from "../logging/Logger";
import { ToolResult } from "../tools/ToolManager";
import { DatabaseOperationResult } from "../types/DatabaseTypes";

export interface SessionPersistenceConfig {
  enableAutoSave: boolean;
  autoSaveInterval: number; // milliseconds
  trackFileOperations: boolean;
  trackToolExecutions: boolean;
  trackPhaseTransitions: boolean;
  trackCostMetrics: boolean;
  enableEventEmission: boolean;
  bufferUpdates: boolean;
  bufferSize: number;
}

export interface SessionSnapshot {
  sessionId: string;
  timestamp: Date;
  metrics: SessionMetrics;
  recentEvents: SessionEvent[];
  status: "active" | "completed" | "failed" | "cancelled";
}

export interface SessionEvent {
  type:
    | "phase_transition"
    | "tool_execution"
    | "file_operation"
    | "cost_update";
  timestamp: Date;
  data: any;
}

export interface SessionAnalytics {
  sessionId: string;
  duration: number;
  phaseBreakdown: Record<AgentPhase, number>; // time spent in each phase
  toolUsageStats: Record<
    string,
    { count: number; totalTime: number; successRate: number }
  >;
  costProgression: Array<{
    timestamp: Date;
    totalCost: number;
    iterationCount: number;
  }>;
  fileActivitySummary: {
    filesRead: Set<string>;
    filesWritten: Set<string>;
    filesCreated: Set<string>;
    totalOperations: number;
  };
}

/**
 * SessionPersistenceManager captures AgentSession lifecycle data without modifying AgentSession.
 * It integrates via event emission rather than direct coupling to maintain backward compatibility.
 */
export class SessionPersistenceManager {
  private conversationDAO: ConversationDAO;
  private dbConfigManager: DatabaseConfigManager;
  private eventEmitter?: ConversationEventEmitter;
  private config: SessionPersistenceConfig;

  // Session tracking
  private activeSessions: Map<string, SessionSnapshot> = new Map();
  private sessionAnalytics: Map<string, SessionAnalytics> = new Map();
  private updateBuffer: Map<string, SessionMetrics[]> = new Map();

  // Auto-save timers
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();
  private bufferFlushTimer?: NodeJS.Timeout;

  constructor(
    config: Partial<SessionPersistenceConfig> = {},
    eventEmitter?: ConversationEventEmitter
  ) {
    this.conversationDAO = new ConversationDAO();
    this.dbConfigManager = DatabaseConfigManager.getInstance();
    this.eventEmitter = eventEmitter;

    this.config = {
      enableAutoSave: true,
      autoSaveInterval: 30000, // 30 seconds
      trackFileOperations: true,
      trackToolExecutions: true,
      trackPhaseTransitions: true,
      trackCostMetrics: true,
      enableEventEmission: true,
      bufferUpdates: true,
      bufferSize: 10,
      ...config,
    };

    this.setupBufferFlush();

    Logger.info("SessionPersistenceManager initialized", {
      config: this.config,
      databaseEnabled: this.dbConfigManager.isEnabled(),
    });
  }

  private setupBufferFlush(): void {
    if (!this.config.bufferUpdates) return;

    this.bufferFlushTimer = setInterval(() => {
      this.flushAllBuffers();
    }, 10000); // Flush every 10 seconds

    // Cleanup on process exit
    process.on("exit", () => {
      this.flushAllBuffersSync();
      this.clearAllTimers();
    });
  }

  // Session lifecycle management
  trackSessionStart(
    sessionId: string,
    options: {
      vision: string;
      workingDirectory: string;
      phase: AgentPhase;
      conversationId?: string;
      maxIterations?: number;
      costBudget?: number;
      enableWebSearch?: boolean;
      enableExtendedContext?: boolean;
    }
  ): void {
    const now = new Date();

    const metrics: SessionMetrics = {
      sessionId,
      startTime: now,
      endTime: undefined,
      phase: options.phase,
      iterationCount: 0,
      toolCallsCount: 0,
      totalCost: 0,
      tokensUsed: 0,
      filesModified: [],
      filesCreated: [],
      phaseTransitions: [],
    };

    const snapshot: SessionSnapshot = {
      sessionId,
      timestamp: now,
      metrics,
      recentEvents: [],
      status: "active",
    };

    this.activeSessions.set(sessionId, snapshot);

    // Initialize analytics
    const analytics: SessionAnalytics = {
      sessionId,
      duration: 0,
      phaseBreakdown: { EXPLORE: 0, SUMMON: 0, COMPLETE: 0 },
      toolUsageStats: {},
      costProgression: [],
      fileActivitySummary: {
        filesRead: new Set(),
        filesWritten: new Set(),
        filesCreated: new Set(),
        totalOperations: 0,
      },
    };
    this.sessionAnalytics.set(sessionId, analytics);

    // Setup auto-save
    if (this.config.enableAutoSave) {
      this.setupAutoSave(sessionId);
    }

    // Emit event
    if (this.config.enableEventEmission && this.eventEmitter) {
      this.eventEmitter.emitSessionStarted(sessionId, {
        conversationId: options.conversationId,
        vision: options.vision,
        workingDirectory: options.workingDirectory,
        options,
        phase: options.phase,
      });
    }

    Logger.debug("Session tracking started", {
      sessionId,
      phase: options.phase,
      vision: options.vision.substring(0, 50) + "...",
    });
  }

  trackSessionProgress(
    sessionId: string,
    updates: Partial<SessionMetrics>
  ): void {
    const snapshot = this.activeSessions.get(sessionId);
    if (!snapshot) {
      Logger.warn("Attempted to track progress for unknown session", {
        sessionId,
      });
      return;
    }

    // Update metrics
    snapshot.metrics = { ...snapshot.metrics, ...updates };
    snapshot.timestamp = new Date();

    // Update analytics
    const analytics = this.sessionAnalytics.get(sessionId);
    if (analytics) {
      this.updateAnalytics(analytics, snapshot.metrics);
    }

    // Buffer or save immediately
    if (this.config.bufferUpdates) {
      this.addToBuffer(sessionId, snapshot.metrics);
    } else {
      this.saveSessionMetrics(snapshot.metrics);
    }

    Logger.debug("Session progress tracked", {
      sessionId,
      iterationCount: snapshot.metrics.iterationCount,
      totalCost: snapshot.metrics.totalCost,
      phase: snapshot.metrics.phase,
    });
  }

  trackPhaseTransition(
    sessionId: string,
    transition: PhaseTransition,
    details?: {
      summary?: string;
      keyFindings?: string[];
      nextActions?: string[];
      confidence?: number;
    }
  ): void {
    const snapshot = this.activeSessions.get(sessionId);
    if (!snapshot) {
      Logger.warn("Attempted to track phase transition for unknown session", {
        sessionId,
      });
      return;
    }

    // Update session metrics
    snapshot.metrics.phase = transition.to;
    snapshot.metrics.phaseTransitions.push(transition);
    snapshot.timestamp = new Date();

    // Add to recent events
    const event: SessionEvent = {
      type: "phase_transition",
      timestamp: new Date(),
      data: { transition, details },
    };
    this.addRecentEvent(snapshot, event);

    // Update analytics
    const analytics = this.sessionAnalytics.get(sessionId);
    if (analytics) {
      analytics.phaseBreakdown[transition.to] += transition.duration;
    }

    // Save phase transition to database
    if (this.config.trackPhaseTransitions && this.dbConfigManager.isEnabled()) {
      this.conversationDAO
        .savePhaseTransition(sessionId, transition)
        .catch((error) => {
          Logger.error("Failed to save phase transition", {
            sessionId,
            transition,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }

    // Emit event
    if (this.config.enableEventEmission && this.eventEmitter) {
      this.eventEmitter.emitPhaseTransition(sessionId, transition, details);
    }

    Logger.debug("Phase transition tracked", {
      sessionId,
      from: transition.from,
      to: transition.to,
      duration: transition.duration,
    });
  }

  trackToolExecution(
    sessionId: string,
    toolExecution: {
      toolName: string;
      parameters: any;
      result: ToolResult;
      executionTime: number;
      startTime: Date;
      endTime: Date;
    }
  ): void {
    const snapshot = this.activeSessions.get(sessionId);
    if (!snapshot) {
      Logger.warn("Attempted to track tool execution for unknown session", {
        sessionId,
      });
      return;
    }

    // Update session metrics
    snapshot.metrics.toolCallsCount++;
    snapshot.timestamp = new Date();

    // Add to recent events
    const event: SessionEvent = {
      type: "tool_execution",
      timestamp: toolExecution.endTime,
      data: toolExecution,
    };
    this.addRecentEvent(snapshot, event);

    // Update analytics
    const analytics = this.sessionAnalytics.get(sessionId);
    if (analytics) {
      const toolStats = analytics.toolUsageStats[toolExecution.toolName] || {
        count: 0,
        totalTime: 0,
        successRate: 0,
      };

      toolStats.count++;
      toolStats.totalTime += toolExecution.executionTime;
      toolStats.successRate =
        (toolStats.successRate * (toolStats.count - 1) +
          (toolExecution.result.success ? 1 : 0)) /
        toolStats.count;

      analytics.toolUsageStats[toolExecution.toolName] = toolStats;
    }

    // Save tool execution to database
    if (this.config.trackToolExecutions && this.dbConfigManager.isEnabled()) {
      this.conversationDAO
        .saveToolExecution(
          sessionId,
          toolExecution.toolName,
          toolExecution.parameters,
          toolExecution.result,
          toolExecution.executionTime
        )
        .catch((error) => {
          Logger.error("Failed to save tool execution", {
            sessionId,
            toolName: toolExecution.toolName,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }

    // Emit events
    if (this.config.enableEventEmission && this.eventEmitter) {
      const executionId = `${sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      this.eventEmitter.emitToolExecutionStarted(sessionId, {
        toolName: toolExecution.toolName,
        parameters: toolExecution.parameters,
        executionId,
      });

      this.eventEmitter.emitToolExecutionCompleted(sessionId, {
        toolName: toolExecution.toolName,
        parameters: toolExecution.parameters,
        result: toolExecution.result,
        executionTime: toolExecution.executionTime,
        executionId,
      });
    }

    Logger.debug("Tool execution tracked", {
      sessionId,
      toolName: toolExecution.toolName,
      success: toolExecution.result.success,
      executionTime: toolExecution.executionTime,
    });
  }

  trackFileOperation(
    sessionId: string,
    operation: {
      type: "read" | "write" | "create" | "delete";
      filePath: string;
      success: boolean;
      error?: string;
      fileSize?: number;
      toolExecutionId?: string;
    }
  ): void {
    const snapshot = this.activeSessions.get(sessionId);
    if (!snapshot) {
      Logger.warn("Attempted to track file operation for unknown session", {
        sessionId,
      });
      return;
    }

    // Update session metrics
    if (operation.success) {
      switch (operation.type) {
        case "write":
          if (!snapshot.metrics.filesModified.includes(operation.filePath)) {
            snapshot.metrics.filesModified.push(operation.filePath);
          }
          break;
        case "create":
          if (!snapshot.metrics.filesCreated.includes(operation.filePath)) {
            snapshot.metrics.filesCreated.push(operation.filePath);
          }
          break;
      }
    }
    snapshot.timestamp = new Date();

    // Add to recent events
    const event: SessionEvent = {
      type: "file_operation",
      timestamp: new Date(),
      data: operation,
    };
    this.addRecentEvent(snapshot, event);

    // Update analytics
    const analytics = this.sessionAnalytics.get(sessionId);
    if (analytics && operation.success) {
      const summary = analytics.fileActivitySummary;
      summary.totalOperations++;

      switch (operation.type) {
        case "read":
          summary.filesRead.add(operation.filePath);
          break;
        case "write":
          summary.filesWritten.add(operation.filePath);
          break;
        case "create":
          summary.filesCreated.add(operation.filePath);
          break;
      }
    }

    // Emit event
    if (this.config.enableEventEmission && this.eventEmitter) {
      this.eventEmitter.emitFileOperation(sessionId, {
        toolExecutionId: operation.toolExecutionId,
        operationType: operation.type,
        filePath: operation.filePath,
        success: operation.success,
        error: operation.error,
        fileSize: operation.fileSize,
      });
    }

    Logger.debug("File operation tracked", {
      sessionId,
      operation: operation.type,
      filePath: operation.filePath,
      success: operation.success,
    });
  }

  trackCostUpdate(
    sessionId: string,
    costUpdate: {
      iterationCount: number;
      totalCost: number;
      tokensUsed: number;
      usage?: {
        inputTokens: number;
        outputTokens: number;
        thinkingTokens?: number;
        cacheCreationTokens?: number;
        cacheReadTokens?: number;
      };
      cost?: {
        inputCost: number;
        outputCost: number;
        thinkingCost: number;
        totalCost: number;
      };
      pricingTier?: "standard" | "extended";
    }
  ): void {
    const snapshot = this.activeSessions.get(sessionId);
    if (!snapshot) {
      Logger.warn("Attempted to track cost update for unknown session", {
        sessionId,
      });
      return;
    }

    // Update session metrics
    snapshot.metrics.totalCost = costUpdate.totalCost;
    snapshot.metrics.tokensUsed = costUpdate.tokensUsed;
    snapshot.metrics.iterationCount = costUpdate.iterationCount;
    snapshot.timestamp = new Date();

    // Add to recent events
    const event: SessionEvent = {
      type: "cost_update",
      timestamp: new Date(),
      data: costUpdate,
    };
    this.addRecentEvent(snapshot, event);

    // Update analytics
    const analytics = this.sessionAnalytics.get(sessionId);
    if (analytics) {
      analytics.costProgression.push({
        timestamp: new Date(),
        totalCost: costUpdate.totalCost,
        iterationCount: costUpdate.iterationCount,
      });
    }

    // Emit event
    if (
      this.config.enableEventEmission &&
      this.eventEmitter &&
      costUpdate.usage &&
      costUpdate.cost
    ) {
      this.eventEmitter.emitCostTracking(sessionId, {
        usage: costUpdate.usage,
        cost: costUpdate.cost,
        pricingTier: costUpdate.pricingTier || "standard",
        iterationNumber: costUpdate.iterationCount,
      });
    }

    Logger.debug("Cost update tracked", {
      sessionId,
      totalCost: costUpdate.totalCost,
      iterationCount: costUpdate.iterationCount,
      tokensUsed: costUpdate.tokensUsed,
    });
  }

  trackSessionCompletion(
    sessionId: string,
    result: {
      success: boolean;
      error?: string;
      finalPhase: AgentPhase;
      completionReport?: any;
      duration: number;
    }
  ): void {
    const snapshot = this.activeSessions.get(sessionId);
    if (!snapshot) {
      Logger.warn("Attempted to track completion for unknown session", {
        sessionId,
      });
      return;
    }

    // Update session metrics
    snapshot.metrics.endTime = new Date();
    snapshot.status = result.success ? "completed" : "failed";
    snapshot.timestamp = new Date();

    // Update analytics
    const analytics = this.sessionAnalytics.get(sessionId);
    if (analytics) {
      analytics.duration = result.duration;
    }

    // Final save to database
    this.saveSessionMetrics(snapshot.metrics);

    // Cleanup auto-save timer
    const timer = this.autoSaveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(sessionId);
    }

    // Emit event
    if (this.config.enableEventEmission && this.eventEmitter) {
      this.eventEmitter.emitSessionCompleted(sessionId, {
        success: result.success,
        error: result.error,
        metrics: snapshot.metrics,
      });
    }

    Logger.info("Session completion tracked", {
      sessionId,
      success: result.success,
      finalPhase: result.finalPhase,
      duration: result.duration,
      iterationCount: snapshot.metrics.iterationCount,
      totalCost: snapshot.metrics.totalCost,
    });

    // Keep session for a while for analytics, then clean up
    setTimeout(() => {
      this.activeSessions.delete(sessionId);
      this.sessionAnalytics.delete(sessionId);
    }, 300000); // Keep for 5 minutes
  }

  // Buffer management
  private addToBuffer(sessionId: string, metrics: SessionMetrics): void {
    if (!this.updateBuffer.has(sessionId)) {
      this.updateBuffer.set(sessionId, []);
    }

    const buffer = this.updateBuffer.get(sessionId)!;
    buffer.push(metrics);

    // Flush if buffer is full
    if (buffer.length >= this.config.bufferSize) {
      this.flushBuffer(sessionId);
    }
  }

  private flushBuffer(sessionId: string): void {
    const buffer = this.updateBuffer.get(sessionId);
    if (!buffer || buffer.length === 0) return;

    // Use the latest metrics from the buffer
    const latestMetrics = buffer[buffer.length - 1];
    this.saveSessionMetrics(latestMetrics);

    // Clear buffer
    this.updateBuffer.set(sessionId, []);
  }

  private flushAllBuffers(): void {
    for (const sessionId of this.updateBuffer.keys()) {
      this.flushBuffer(sessionId);
    }
  }

  private flushAllBuffersSync(): void {
    // Force flush all buffers synchronously (for shutdown)
    this.flushAllBuffers();
  }

  // Auto-save setup
  private setupAutoSave(sessionId: string): void {
    const timer = setInterval(() => {
      const snapshot = this.activeSessions.get(sessionId);
      if (snapshot && snapshot.status === "active") {
        this.saveSessionMetrics(snapshot.metrics);
      }
    }, this.config.autoSaveInterval);

    this.autoSaveTimers.set(sessionId, timer);
  }

  // Database operations
  private async saveSessionMetrics(metrics: SessionMetrics): Promise<void> {
    if (!this.dbConfigManager.isEnabled()) return;

    try {
      const result = await this.conversationDAO.saveAgentSession(metrics);

      if (!result.success) {
        Logger.error("Failed to save session metrics to database", {
          sessionId: metrics.sessionId,
          error: result.error,
        });
      }
    } catch (error) {
      Logger.error("Error saving session metrics", {
        sessionId: metrics.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Utility methods
  private addRecentEvent(snapshot: SessionSnapshot, event: SessionEvent): void {
    snapshot.recentEvents.push(event);

    // Keep only recent events (last 50)
    if (snapshot.recentEvents.length > 50) {
      snapshot.recentEvents = snapshot.recentEvents.slice(-50);
    }
  }

  private updateAnalytics(
    analytics: SessionAnalytics,
    metrics: SessionMetrics
  ): void {
    // Update duration
    if (metrics.endTime) {
      analytics.duration =
        metrics.endTime.getTime() - metrics.startTime.getTime();
    }

    // Update phase breakdown from transitions
    metrics.phaseTransitions.forEach((transition) => {
      analytics.phaseBreakdown[transition.to] += transition.duration;
    });
  }

  private clearAllTimers(): void {
    if (this.bufferFlushTimer) {
      clearInterval(this.bufferFlushTimer);
    }

    this.autoSaveTimers.forEach((timer) => clearInterval(timer));
    this.autoSaveTimers.clear();
  }

  // Public API
  getActiveSession(sessionId: string): SessionSnapshot | undefined {
    return this.activeSessions.get(sessionId);
  }

  getAllActiveSessions(): SessionSnapshot[] {
    return Array.from(this.activeSessions.values());
  }

  getSessionAnalytics(sessionId: string): SessionAnalytics | undefined {
    return this.sessionAnalytics.get(sessionId);
  }

  async forceFlush(sessionId?: string): Promise<void> {
    if (sessionId) {
      this.flushBuffer(sessionId);
    } else {
      this.flushAllBuffers();
    }
  }

  updateConfig(newConfig: Partial<SessionPersistenceConfig>): void {
    this.config = { ...this.config, ...newConfig };

    Logger.debug("Session persistence configuration updated", {
      config: this.config,
    });
  }

  getConfig(): Readonly<SessionPersistenceConfig> {
    return { ...this.config };
  }

  isHealthy(): boolean {
    const activeSessionCount = this.activeSessions.size;
    const bufferCount = Array.from(this.updateBuffer.values()).reduce(
      (total, buffer) => total + buffer.length,
      0
    );

    // Consider unhealthy if too many active sessions or large buffers
    return activeSessionCount < 100 && bufferCount < 1000;
  }

  getStatus(): {
    activeSessions: number;
    bufferedUpdates: number;
    autoSaveTimers: number;
    databaseEnabled: boolean;
  } {
    return {
      activeSessions: this.activeSessions.size,
      bufferedUpdates: Array.from(this.updateBuffer.values()).reduce(
        (total, buffer) => total + buffer.length,
        0
      ),
      autoSaveTimers: this.autoSaveTimers.size,
      databaseEnabled: this.dbConfigManager.isEnabled(),
    };
  }

  async close(): Promise<void> {
    Logger.info("Closing session persistence manager");

    // Flush all buffers
    await this.forceFlush();

    // Clear all timers
    this.clearAllTimers();

    Logger.info("Session persistence manager closed", {
      finalStatus: this.getStatus(),
    });
  }
}

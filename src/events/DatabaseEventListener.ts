import { ConversationEventEmitter } from "./ConversationEventEmitter";
import { ConversationDAO } from "../database/ConversationDAO";
import { DatabaseConfigManager } from "../config/DatabaseConfig";
import { Logger } from "../logging/Logger";
import {
  ConversationSavedEvent,
  SessionStartedEvent,
  SessionCompletedEvent,
  PhaseTransitionEvent,
  ToolExecutionEvent,
  FileOperationEvent,
  CostTrackingEvent,
  ValidationEvent,
  EVENT_TYPES,
} from "../types/DatabaseTypes";
import { ConversationState } from "../conversation/ConversationPersistence";
import { SessionMetrics, PhaseTransition } from "../agent/AgentSession";
import { ToolResult } from "../tools/ToolManager";

export interface DatabaseEventListenerConfig {
  enableLogging?: boolean;
  enableRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  enableBatching?: boolean;
  batchSize?: number;
  batchTimeout?: number;
}

export interface EventProcessingStats {
  totalProcessed: number;
  successful: number;
  failed: number;
  retried: number;
  averageProcessingTime: number;
  lastProcessedAt?: Date;
}

export class DatabaseEventListener {
  private conversationDAO: ConversationDAO;
  private dbConfigManager: DatabaseConfigManager;
  private eventEmitter: ConversationEventEmitter;
  private config: DatabaseEventListenerConfig;
  private processingStats: EventProcessingStats;
  private eventBatch: Array<{
    type: string;
    data: any;
    timestamp: Date;
    retryCount: number;
  }> = [];
  private batchTimer?: NodeJS.Timeout;

  constructor(
    eventEmitter: ConversationEventEmitter,
    config: DatabaseEventListenerConfig = {}
  ) {
    this.eventEmitter = eventEmitter;
    this.conversationDAO = new ConversationDAO();
    this.dbConfigManager = DatabaseConfigManager.getInstance();

    this.config = {
      enableLogging: true,
      enableRetry: true,
      maxRetries: 3,
      retryDelay: 1000,
      enableBatching: false,
      batchSize: 10,
      batchTimeout: 5000,
      ...config,
    };

    this.processingStats = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      retried: 0,
      averageProcessingTime: 0,
    };

    this.setupEventListeners();
    this.setupBatching();

    Logger.info("DatabaseEventListener initialized", {
      config: this.config,
      databaseEnabled: this.dbConfigManager.isEnabled(),
    });
  }

  private setupEventListeners(): void {
    // Conversation events
    this.eventEmitter.on(
      EVENT_TYPES.CONVERSATION_SAVED,
      this.handleConversationSaved.bind(this)
    );

    // Session events
    this.eventEmitter.on(
      EVENT_TYPES.SESSION_STARTED,
      this.handleSessionStarted.bind(this)
    );
    this.eventEmitter.on(
      EVENT_TYPES.SESSION_COMPLETED,
      this.handleSessionCompleted.bind(this)
    );

    // Phase transition events
    this.eventEmitter.on(
      EVENT_TYPES.PHASE_TRANSITION,
      this.handlePhaseTransition.bind(this)
    );

    // Tool execution events
    this.eventEmitter.on(
      EVENT_TYPES.TOOL_EXECUTION_COMPLETED,
      this.handleToolExecution.bind(this)
    );

    // File operation events
    this.eventEmitter.on(
      EVENT_TYPES.FILE_OPERATION,
      this.handleFileOperation.bind(this)
    );

    // Cost tracking events
    this.eventEmitter.on(
      EVENT_TYPES.COST_TRACKING,
      this.handleCostTracking.bind(this)
    );

    // Validation events
    this.eventEmitter.on(
      EVENT_TYPES.VALIDATION,
      this.handleValidation.bind(this)
    );

    // Error events
    this.eventEmitter.on(EVENT_TYPES.ERROR, this.handleError.bind(this));

    Logger.debug("Event listeners registered", {
      eventTypes: [
        EVENT_TYPES.CONVERSATION_SAVED,
        EVENT_TYPES.SESSION_STARTED,
        EVENT_TYPES.SESSION_COMPLETED,
        EVENT_TYPES.PHASE_TRANSITION,
        EVENT_TYPES.TOOL_EXECUTION_COMPLETED,
        EVENT_TYPES.FILE_OPERATION,
        EVENT_TYPES.COST_TRACKING,
        EVENT_TYPES.VALIDATION,
        EVENT_TYPES.ERROR,
      ],
    });
  }

  private setupBatching(): void {
    if (!this.config.enableBatching) return;

    this.batchTimer = setInterval(() => {
      this.processBatch();
    }, this.config.batchTimeout);

    // Cleanup on process exit
    process.on("exit", () => {
      this.processBatch();
      if (this.batchTimer) {
        clearInterval(this.batchTimer);
      }
    });
  }

  private async processBatch(): Promise<void> {
    if (this.eventBatch.length === 0) return;

    const batch = [...this.eventBatch];
    this.eventBatch = [];

    Logger.debug("Processing event batch", {
      batchSize: batch.length,
    });

    for (const event of batch) {
      try {
        await this.processEventWithRetry(
          event.type,
          event.data,
          event.retryCount
        );
      } catch (error) {
        Logger.error("Failed to process batched event", {
          eventType: event.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async processEventWithRetry(
    eventType: string,
    data: any,
    retryCount: number = 0
  ): Promise<void> {
    const startTime = Date.now();

    try {
      if (!this.dbConfigManager.isEnabled()) {
        Logger.debug("Database disabled, skipping event processing", {
          eventType,
        });
        return;
      }

      await this.processEventData(eventType, data);

      // Update success stats
      this.updateProcessingStats(Date.now() - startTime, true);

      if (this.config.enableLogging) {
        Logger.debug("Event processed successfully", {
          eventType,
          processingTime: `${Date.now() - startTime}ms`,
          retryCount,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (this.config.enableRetry && retryCount < this.config.maxRetries!) {
        this.processingStats.retried++;

        Logger.warn("Event processing failed, retrying", {
          eventType,
          retryCount: retryCount + 1,
          maxRetries: this.config.maxRetries,
          error: errorMessage,
          retryDelay: this.config.retryDelay,
        });

        setTimeout(
          () => {
            this.processEventWithRetry(eventType, data, retryCount + 1);
          },
          this.config.retryDelay! * (retryCount + 1)
        ); // Exponential backoff
      } else {
        // Update failure stats
        this.updateProcessingStats(Date.now() - startTime, false);

        Logger.error("Event processing failed after all retries", {
          eventType,
          retryCount,
          error: errorMessage,
        });

        throw error;
      }
    }
  }

  private async processEventData(eventType: string, data: any): Promise<void> {
    switch (eventType) {
      case EVENT_TYPES.CONVERSATION_SAVED:
        await this.processConversationSaved(data as ConversationSavedEvent);
        break;
      case EVENT_TYPES.SESSION_STARTED:
        await this.processSessionStarted(data as SessionStartedEvent);
        break;
      case EVENT_TYPES.SESSION_COMPLETED:
        await this.processSessionCompleted(data as SessionCompletedEvent);
        break;
      case EVENT_TYPES.PHASE_TRANSITION:
        await this.processPhaseTransition(data as PhaseTransitionEvent);
        break;
      case EVENT_TYPES.TOOL_EXECUTION_COMPLETED:
        await this.processToolExecution(data as ToolExecutionEvent);
        break;
      case EVENT_TYPES.FILE_OPERATION:
        await this.processFileOperation(data as FileOperationEvent);
        break;
      case EVENT_TYPES.COST_TRACKING:
        await this.processCostTracking(data as CostTrackingEvent);
        break;
      case EVENT_TYPES.VALIDATION:
        await this.processValidation(data as ValidationEvent);
        break;
      case EVENT_TYPES.ERROR:
        await this.processErrorEvent(data);
        break;
      default:
        Logger.warn("Unknown event type", { eventType });
    }
  }

  private updateProcessingStats(
    processingTime: number,
    success: boolean
  ): void {
    this.processingStats.totalProcessed++;
    this.processingStats.lastProcessedAt = new Date();

    if (success) {
      this.processingStats.successful++;
    } else {
      this.processingStats.failed++;
    }

    // Update average processing time
    if (this.processingStats.totalProcessed === 1) {
      this.processingStats.averageProcessingTime = processingTime;
    } else {
      this.processingStats.averageProcessingTime =
        (this.processingStats.averageProcessingTime *
          (this.processingStats.totalProcessed - 1) +
          processingTime) /
        this.processingStats.totalProcessed;
    }
  }

  // Event handlers
  private async handleConversationSaved(
    event: ConversationSavedEvent
  ): Promise<void> {
    if (this.config.enableBatching) {
      this.eventBatch.push({
        type: EVENT_TYPES.CONVERSATION_SAVED,
        data: event,
        timestamp: new Date(),
        retryCount: 0,
      });

      if (this.eventBatch.length >= this.config.batchSize!) {
        await this.processBatch();
      }
    } else {
      await this.processEventWithRetry(EVENT_TYPES.CONVERSATION_SAVED, event);
    }
  }

  private async processConversationSaved(
    event: ConversationSavedEvent
  ): Promise<void> {
    try {
      // FIXED: Ensure projectContext is properly handled for ConversationState compatibility
      const stateWithRequiredFields: ConversationState = {
        conversationId: event.state.conversationId,
        workingDirectory: event.state.workingDirectory,
        conversationHistory: event.state.conversationHistory,
        projectContext: event.state.projectContext, // This should already be a ProjectContext object
        totalCost: event.state.totalCost,
        messageCount: event.state.messageCount,
        lastUpdated: event.state.lastUpdated,
      };

      const result = await this.conversationDAO.saveConversation(
        stateWithRequiredFields
      );

      if (!result.success) {
        throw new Error(`Failed to save conversation: ${result.error}`);
      }

      Logger.debug("Conversation saved to database", {
        conversationId: event.conversationId,
      });
    } catch (error) {
      Logger.error("Failed to process conversation saved event", {
        conversationId: event.conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async handleSessionStarted(
    event: SessionStartedEvent
  ): Promise<void> {
    if (this.config.enableBatching) {
      this.eventBatch.push({
        type: EVENT_TYPES.SESSION_STARTED,
        data: event,
        timestamp: new Date(),
        retryCount: 0,
      });

      if (this.eventBatch.length >= this.config.batchSize!) {
        await this.processBatch();
      }
    } else {
      await this.processEventWithRetry(EVENT_TYPES.SESSION_STARTED, event);
    }
  }

  private async processSessionStarted(
    event: SessionStartedEvent
  ): Promise<void> {
    try {
      // Create a basic session metrics object for the started session
      const sessionMetrics: SessionMetrics = {
        sessionId: event.sessionId,
        startTime: event.timestamp,
        endTime: undefined,
        phase: "EXPLORE", // Default phase
        iterationCount: 0,
        toolCallsCount: 0,
        totalCost: 0,
        tokensUsed: 0,
        filesModified: [],
        filesCreated: [],
        phaseTransitions: [],
        streamingTime: 0,
      };

      const result =
        await this.conversationDAO.saveAgentSession(sessionMetrics);

      if (!result.success) {
        throw new Error(`Failed to save session start: ${result.error}`);
      }

      Logger.debug("Session start saved to database", {
        sessionId: event.sessionId,
      });
    } catch (error) {
      Logger.error("Failed to process session started event", {
        sessionId: event.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async handleSessionCompleted(
    event: SessionCompletedEvent
  ): Promise<void> {
    if (this.config.enableBatching) {
      this.eventBatch.push({
        type: EVENT_TYPES.SESSION_COMPLETED,
        data: event,
        timestamp: new Date(),
        retryCount: 0,
      });

      if (this.eventBatch.length >= this.config.batchSize!) {
        await this.processBatch();
      }
    } else {
      await this.processEventWithRetry(EVENT_TYPES.SESSION_COMPLETED, event);
    }
  }

  private async processSessionCompleted(
    event: SessionCompletedEvent
  ): Promise<void> {
    try {
      const result = await this.conversationDAO.saveAgentSession(event.metrics);

      if (!result.success) {
        throw new Error(`Failed to save session completion: ${result.error}`);
      }

      Logger.debug("Session completion saved to database", {
        sessionId: event.sessionId,
        success: event.success,
      });
    } catch (error) {
      Logger.error("Failed to process session completed event", {
        sessionId: event.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async handlePhaseTransition(
    event: PhaseTransitionEvent
  ): Promise<void> {
    if (this.config.enableBatching) {
      this.eventBatch.push({
        type: EVENT_TYPES.PHASE_TRANSITION,
        data: event,
        timestamp: new Date(),
        retryCount: 0,
      });

      if (this.eventBatch.length >= this.config.batchSize!) {
        await this.processBatch();
      }
    } else {
      await this.processEventWithRetry(EVENT_TYPES.PHASE_TRANSITION, event);
    }
  }

  private async processPhaseTransition(
    event: PhaseTransitionEvent
  ): Promise<void> {
    try {
      const result = await this.conversationDAO.savePhaseTransition(
        event.sessionId,
        event.transition
      );

      if (!result.success) {
        throw new Error(`Failed to save phase transition: ${result.error}`);
      }

      Logger.debug("Phase transition saved to database", {
        sessionId: event.sessionId,
        from: event.transition.from,
        to: event.transition.to,
      });
    } catch (error) {
      Logger.error("Failed to process phase transition event", {
        sessionId: event.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async handleToolExecution(event: ToolExecutionEvent): Promise<void> {
    if (this.config.enableBatching) {
      this.eventBatch.push({
        type: EVENT_TYPES.TOOL_EXECUTION_COMPLETED,
        data: event,
        timestamp: new Date(),
        retryCount: 0,
      });

      if (this.eventBatch.length >= this.config.batchSize!) {
        await this.processBatch();
      }
    } else {
      await this.processEventWithRetry(
        EVENT_TYPES.TOOL_EXECUTION_COMPLETED,
        event
      );
    }
  }

  private async processToolExecution(event: ToolExecutionEvent): Promise<void> {
    try {
      // FIXED: Create proper Error object with name property for ToolResult compatibility
      const toolResult: ToolResult = {
        success: event.result.success,
        result: event.result.result,
        error: event.result.error
          ? ({
              name: "ToolExecutionError",
              message:
                event.result.error.message || "Unknown tool execution error",
            } as Error)
          : undefined,
        metadata: event.result.metadata,
      };

      const result = await this.conversationDAO.saveToolExecution(
        event.sessionId,
        event.toolName,
        event.parameters,
        toolResult,
        event.executionTime
      );

      if (!result.success) {
        throw new Error(`Failed to save tool execution: ${result.error}`);
      }

      Logger.debug("Tool execution saved to database", {
        sessionId: event.sessionId,
        toolName: event.toolName,
        success: event.result.success,
      });
    } catch (error) {
      Logger.error("Failed to process tool execution event", {
        sessionId: event.sessionId,
        toolName: event.toolName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async handleFileOperation(event: FileOperationEvent): Promise<void> {
    if (this.config.enableBatching) {
      this.eventBatch.push({
        type: EVENT_TYPES.FILE_OPERATION,
        data: event,
        timestamp: new Date(),
        retryCount: 0,
      });

      if (this.eventBatch.length >= this.config.batchSize!) {
        await this.processBatch();
      }
    } else {
      await this.processEventWithRetry(EVENT_TYPES.FILE_OPERATION, event);
    }
  }

  private async processFileOperation(event: FileOperationEvent): Promise<void> {
    try {
      // TODO: Add file operation tracking to ConversationDAO if needed
      // For now, just log the file operation
      Logger.debug("File operation processed", {
        sessionId: event.sessionId,
        operationType: event.operationType,
        filePath: event.filePath,
        success: event.success,
      });
    } catch (error) {
      Logger.error("Failed to process file operation event", {
        sessionId: event.sessionId,
        operationType: event.operationType,
        filePath: event.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async handleCostTracking(event: CostTrackingEvent): Promise<void> {
    if (this.config.enableBatching) {
      this.eventBatch.push({
        type: EVENT_TYPES.COST_TRACKING,
        data: event,
        timestamp: new Date(),
        retryCount: 0,
      });

      if (this.eventBatch.length >= this.config.batchSize!) {
        await this.processBatch();
      }
    } else {
      await this.processEventWithRetry(EVENT_TYPES.COST_TRACKING, event);
    }
  }

  private async processCostTracking(event: CostTrackingEvent): Promise<void> {
    try {
      // TODO: Add cost tracking to ConversationDAO if needed
      // For now, just log the cost tracking
      Logger.debug("Cost tracking processed", {
        sessionId: event.sessionId,
        totalCost: event.cost.totalCost,
        pricingTier: event.pricingTier,
      });
    } catch (error) {
      Logger.error("Failed to process cost tracking event", {
        sessionId: event.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async handleValidation(event: ValidationEvent): Promise<void> {
    if (this.config.enableBatching) {
      this.eventBatch.push({
        type: EVENT_TYPES.VALIDATION,
        data: event,
        timestamp: new Date(),
        retryCount: 0,
      });

      if (this.eventBatch.length >= this.config.batchSize!) {
        await this.processBatch();
      }
    } else {
      await this.processEventWithRetry(EVENT_TYPES.VALIDATION, event);
    }
  }

  private async processValidation(event: ValidationEvent): Promise<void> {
    try {
      // TODO: Add validation result tracking to ConversationDAO if needed
      // For now, just log the validation result
      Logger.debug("Validation processed", {
        sessionId: event.sessionId,
        validationType: event.validationType,
        result: event.result,
        message: event.message,
      });
    } catch (error) {
      Logger.error("Failed to process validation event", {
        sessionId: event.sessionId,
        validationType: event.validationType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async handleError(event: any): Promise<void> {
    if (this.config.enableBatching) {
      this.eventBatch.push({
        type: EVENT_TYPES.ERROR,
        data: event,
        timestamp: new Date(),
        retryCount: 0,
      });

      if (this.eventBatch.length >= this.config.batchSize!) {
        await this.processBatch();
      }
    } else {
      await this.processEventWithRetry(EVENT_TYPES.ERROR, event);
    }
  }

  private async processErrorEvent(event: any): Promise<void> {
    try {
      // Log error events for monitoring
      Logger.error("Error event received", {
        sessionId: event.sessionId,
        errorType: event.errorType,
        errorMessage: event.errorMessage,
        severity: event.severity,
      });

      // TODO: Add error tracking to database if needed
    } catch (error) {
      Logger.error("Failed to process error event", {
        sessionId: event.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Public API
  getProcessingStats(): EventProcessingStats {
    return { ...this.processingStats };
  }

  getConfig(): Readonly<DatabaseEventListenerConfig> {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<DatabaseEventListenerConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Restart batching if configuration changed
    if (
      newConfig.enableBatching !== undefined ||
      newConfig.batchTimeout !== undefined
    ) {
      if (this.batchTimer) {
        clearInterval(this.batchTimer);
        this.batchTimer = undefined;
      }
      this.setupBatching();
    }

    Logger.debug("Database event listener configuration updated", {
      oldConfig,
      newConfig: this.config,
    });
  }

  async forceProcessBatch(): Promise<void> {
    await this.processBatch();
  }

  isHealthy(): boolean {
    const stats = this.getProcessingStats();
    const successRate =
      stats.totalProcessed > 0
        ? (stats.successful / stats.totalProcessed) * 100
        : 100;

    // Consider unhealthy if:
    // - Success rate is below 90%
    // - Average processing time is above 5000ms (5 seconds)
    // - No events processed in last hour (if any have been processed)
    const isUnhealthy =
      successRate < 90 ||
      stats.averageProcessingTime > 5000 ||
      (stats.lastProcessedAt &&
        Date.now() - stats.lastProcessedAt.getTime() > 60 * 60 * 1000);

    return !isUnhealthy;
  }

  close(): void {
    Logger.info("Closing database event listener");

    // Process any remaining batched events
    if (this.config.enableBatching && this.eventBatch.length > 0) {
      this.processBatch();
    }

    // Clear timers
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = undefined;
    }

    // Remove all event listeners
    this.eventEmitter.removeAllListeners();

    Logger.info("Database event listener closed", {
      finalStats: this.getProcessingStats(),
    });
  }
}

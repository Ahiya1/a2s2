import { EventEmitter } from "events";
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
import { SessionMetrics, PhaseTransition } from "../agent/AgentSession";
import { ToolResult } from "../tools/ToolManager";

// Define custom event listener type for our events
export type EventListener = (...args: any[]) => void;

export interface EmitterConfig {
  enableLogging?: boolean;
  enableMetrics?: boolean;
  maxListeners?: number;
  enableBuffering?: boolean;
  bufferSize?: number;
  flushInterval?: number;
  enableHistory?: boolean;
  maxHistorySize?: number;
}

export interface EventMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  errors: number;
  successRate: number;
  averageProcessingTime: number;
}

export interface EventHistoryEntry {
  type: string;
  data: any;
  timestamp: Date;
  id: string;
}

export class ConversationEventEmitter extends EventEmitter {
  private config: EmitterConfig;
  private eventBuffer: Array<{
    type: string;
    data: any;
    timestamp: Date;
    id: string;
  }> = [];

  // FIXED: Add event history tracking
  private eventHistory: EventHistoryEntry[] = [];

  private metrics: EventMetrics = {
    totalEvents: 0,
    eventsByType: {},
    errors: 0,
    successRate: 100,
    averageProcessingTime: 0,
  };

  // FIXED: Use a different name for our custom listeners to avoid conflict
  private eventListeners: Map<string, Set<EventListener>> = new Map();
  private bufferFlushTimer?: NodeJS.Timeout;

  constructor(config: EmitterConfig = {}) {
    super();

    this.config = {
      enableLogging: true,
      enableMetrics: true,
      maxListeners: 50,
      enableBuffering: false,
      bufferSize: 100,
      flushInterval: 5000, // 5 seconds
      enableHistory: true,
      maxHistorySize: 1000,
      ...config,
    };

    this.setMaxListeners(this.config.maxListeners!);
    this.setupBuffering();
    this.setupErrorHandling();

    Logger.debug("ConversationEventEmitter initialized", {
      config: this.config,
    });
  }

  private setupErrorHandling(): void {
    this.on("error", (error: Error) => {
      Logger.error("Event emitter error", {
        error: error.message,
        stack: error.stack,
      });
      this.metrics.errors++;
      this.updateSuccessRate();
    });
  }

  private setupBuffering(): void {
    if (!this.config.enableBuffering) return;

    this.bufferFlushTimer = setInterval(() => {
      this.flushEventBuffer();
    }, this.config.flushInterval);

    // Cleanup on process exit
    process.on("exit", () => {
      this.flushEventBuffer();
      if (this.bufferFlushTimer) {
        clearInterval(this.bufferFlushTimer);
      }
    });
  }

  private flushEventBuffer(): void {
    if (this.eventBuffer.length === 0) return;

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    Logger.debug("Flushing event buffer", {
      eventCount: eventsToFlush.length,
    });

    // Process buffered events
    eventsToFlush.forEach((bufferedEvent) => {
      try {
        this.processEvent(bufferedEvent.type, bufferedEvent.data);
      } catch (error) {
        Logger.error("Error processing buffered event", {
          eventType: bufferedEvent.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  private processEvent(eventType: string, data: any): void {
    const startTime = Date.now();

    try {
      // Update metrics
      this.metrics.totalEvents++;
      this.metrics.eventsByType[eventType] =
        (this.metrics.eventsByType[eventType] || 0) + 1;

      // Log event if enabled
      if (this.config.enableLogging) {
        Logger.debug("Event emitted", {
          type: eventType,
          timestamp: new Date().toISOString(),
        });
      }

      // Emit the actual event
      super.emit(eventType, data);

      // Update processing time metrics
      const processingTime = Date.now() - startTime;
      this.updateProcessingTimeMetrics(processingTime);
    } catch (error) {
      this.metrics.errors++;
      Logger.error("Error processing event", {
        eventType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private updateProcessingTimeMetrics(processingTime: number): void {
    // Simple moving average for processing time
    if (this.metrics.totalEvents === 1) {
      this.metrics.averageProcessingTime = processingTime;
    } else {
      this.metrics.averageProcessingTime =
        (this.metrics.averageProcessingTime * (this.metrics.totalEvents - 1) +
          processingTime) /
        this.metrics.totalEvents;
    }
  }

  private updateSuccessRate(): void {
    const totalProcessed = this.metrics.totalEvents;
    const successful = totalProcessed - this.metrics.errors;
    this.metrics.successRate =
      totalProcessed > 0 ? (successful / totalProcessed) * 100 : 100;
  }

  private emitEvent(eventType: string, data: any): void {
    const eventEntry: EventHistoryEntry = {
      type: eventType,
      data,
      timestamp: new Date(),
      id: this.generateEventId(),
    };

    // FIXED: Add to history if enabled
    if (this.config.enableHistory) {
      this.eventHistory.push(eventEntry);
      this.maintainHistorySize();
    }

    if (this.config.enableBuffering) {
      this.eventBuffer.push(eventEntry);

      // Flush if buffer is full
      if (this.eventBuffer.length >= this.config.bufferSize!) {
        this.flushEventBuffer();
      }
    } else {
      this.processEvent(eventType, data);
    }
  }

  // FIXED: Add missing getEventHistory method
  getEventHistory(): EventHistoryEntry[] {
    return [...this.eventHistory];
  }

  // FIXED: Add method to clear event history
  clearEventHistory(): void {
    this.eventHistory = [];
    Logger.debug("Event history cleared");
  }

  // FIXED: Maintain history size
  private maintainHistorySize(): void {
    if (this.eventHistory.length > this.config.maxHistorySize!) {
      const excess = this.eventHistory.length - this.config.maxHistorySize!;
      this.eventHistory.splice(0, excess);
    }
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // FIXED: Override addListener to return 'this' for compatibility
  addListener(eventType: string, listener: EventListener): this {
    // Add to our custom listener tracking
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(listener);

    // Call parent method
    super.addListener(eventType, listener);
    return this;
  }

  // FIXED: Override removeListener to return 'this' for compatibility
  removeListener(eventType: string, listener: EventListener): this {
    // Remove from our custom listener tracking
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.eventListeners.delete(eventType);
      }
    }

    // Call parent method
    super.removeListener(eventType, listener);
    return this;
  }

  // FIXED: Add proper listeners method that returns Function[]
  listeners(eventName: string | symbol): Function[] {
    return super.listeners(eventName);
  }

  // Event emission methods with proper event structure
  emitConversationSaved(conversationId: string, state: any): void {
    const event: ConversationSavedEvent = {
      conversationId,
      state,
      timestamp: new Date(),
    };

    this.emitEvent(EVENT_TYPES.CONVERSATION_SAVED, event);
  }

  emitSessionStarted(
    sessionId: string,
    details: {
      conversationId?: string;
      vision: string;
      workingDirectory: string;
      options: any;
      phase: "EXPLORE" | "SUMMON" | "COMPLETE";
    }
  ): void {
    const event: SessionStartedEvent = {
      sessionId,
      conversationId: details.conversationId,
      vision: details.vision,
      workingDirectory: details.workingDirectory,
      options: details.options,
      timestamp: new Date(),
    };

    this.emitEvent(EVENT_TYPES.SESSION_STARTED, event);
  }

  emitSessionCompleted(
    sessionId: string,
    result: {
      success: boolean;
      error?: string;
      metrics: SessionMetrics;
    }
  ): void {
    const event: SessionCompletedEvent = {
      sessionId,
      metrics: result.metrics,
      success: result.success,
      error: result.error,
      timestamp: new Date(),
    };

    this.emitEvent(EVENT_TYPES.SESSION_COMPLETED, event);
  }

  emitPhaseTransition(
    sessionId: string,
    transition: PhaseTransition,
    details?: {
      summary?: string;
      keyFindings?: string[];
      nextActions?: string[];
      confidence?: number;
    }
  ): void {
    // FIXED: Ensure event has the 'type' property
    const event: PhaseTransitionEvent & { type: string } = {
      type: EVENT_TYPES.PHASE_TRANSITION,
      sessionId,
      transition,
      timestamp: new Date(),
    };

    this.emitEvent(EVENT_TYPES.PHASE_TRANSITION, event);
  }

  emitToolExecutionStarted(
    sessionId: string,
    execution: {
      toolName: string;
      parameters: any;
      executionId: string;
    }
  ): void {
    const event = {
      type: EVENT_TYPES.TOOL_EXECUTION_STARTED,
      sessionId,
      conversationId: undefined,
      toolName: execution.toolName,
      parameters: execution.parameters,
      executionId: execution.executionId,
      timestamp: new Date(),
    };

    this.emitEvent(EVENT_TYPES.TOOL_EXECUTION_STARTED, event);
  }

  emitToolExecutionCompleted(
    sessionId: string,
    execution: {
      toolName: string;
      parameters: any;
      result: ToolResult;
      executionTime: number;
      executionId: string;
    }
  ): void {
    const event: ToolExecutionEvent & { type: string } = {
      type: EVENT_TYPES.TOOL_EXECUTION_COMPLETED,
      sessionId,
      conversationId: undefined,
      toolName: execution.toolName,
      parameters: execution.parameters,
      result: execution.result,
      executionTime: execution.executionTime,
      timestamp: new Date(),
    };

    this.emitEvent(EVENT_TYPES.TOOL_EXECUTION_COMPLETED, event);
  }

  emitFileOperation(
    sessionId: string,
    operation: {
      toolExecutionId?: string;
      operationType: "read" | "write" | "create" | "delete";
      filePath: string;
      success: boolean;
      error?: string;
      fileSize?: number;
    }
  ): void {
    const event: FileOperationEvent = {
      sessionId,
      toolExecutionId: operation.toolExecutionId,
      operationType: operation.operationType,
      filePath: operation.filePath,
      success: operation.success,
      error: operation.error,
      fileSize: operation.fileSize,
      timestamp: new Date(),
    };

    this.emitEvent(EVENT_TYPES.FILE_OPERATION, event);
  }

  emitCostTracking(
    sessionId: string,
    costData: {
      usage: {
        inputTokens: number;
        outputTokens: number;
        thinkingTokens?: number;
        cacheCreationTokens?: number;
        cacheReadTokens?: number;
      };
      cost: {
        inputCost: number;
        outputCost: number;
        thinkingCost: number;
        totalCost: number;
      };
      pricingTier: "standard" | "extended";
      iterationNumber?: number;
    }
  ): void {
    const event: CostTrackingEvent = {
      sessionId,
      conversationId: undefined,
      usage: costData.usage,
      cost: costData.cost,
      pricingTier: costData.pricingTier,
      timestamp: new Date(),
    };

    this.emitEvent(EVENT_TYPES.COST_TRACKING, event);
  }

  emitValidation(
    sessionId: string,
    validation: {
      validationType: string;
      result: "passed" | "failed" | "warning";
      message: string;
      details?: any;
    }
  ): void {
    const event: ValidationEvent = {
      sessionId,
      validationType: validation.validationType,
      result: validation.result,
      message: validation.message,
      details: validation.details,
      timestamp: new Date(),
    };

    this.emitEvent(EVENT_TYPES.VALIDATION, event);
  }

  emitError(errorData: {
    sessionId?: string;
    conversationId?: string;
    errorType: string;
    errorMessage: string;
    errorStack?: string;
    context?: Record<string, any>;
    severity: "low" | "medium" | "high" | "critical";
  }): void {
    const event = {
      type: EVENT_TYPES.ERROR,
      sessionId: errorData.sessionId,
      conversationId: errorData.conversationId,
      errorType: errorData.errorType,
      errorMessage: errorData.errorMessage,
      errorStack: errorData.errorStack,
      context: errorData.context,
      severity: errorData.severity,
      timestamp: new Date(),
    };

    this.emitEvent(EVENT_TYPES.ERROR, event);
  }

  // Utility methods
  getMetrics(): EventMetrics {
    return { ...this.metrics };
  }

  getEventListenerCount(eventType?: string): number {
    if (eventType) {
      return this.eventListeners.get(eventType)?.size || 0;
    }

    let total = 0;
    for (const listeners of this.eventListeners.values()) {
      total += listeners.size;
    }
    return total;
  }

  getActiveEventTypes(): string[] {
    return Array.from(this.eventListeners.keys());
  }

  clearEventListeners(eventType?: string): void {
    if (eventType) {
      this.eventListeners.delete(eventType);
      this.removeAllListeners(eventType);
    } else {
      this.eventListeners.clear();
      this.removeAllListeners();
    }

    Logger.debug("Event listeners cleared", { eventType: eventType || "all" });
  }

  getBufferStatus(): {
    enabled: boolean;
    currentSize: number;
    maxSize: number;
    flushInterval: number;
  } {
    return {
      enabled: this.config.enableBuffering || false,
      currentSize: this.eventBuffer.length,
      maxSize: this.config.bufferSize || 0,
      flushInterval: this.config.flushInterval || 0,
    };
  }

  // FIXED: Add method to get history status
  getHistoryStatus(): {
    enabled: boolean;
    currentSize: number;
    maxSize: number;
  } {
    return {
      enabled: this.config.enableHistory || false,
      currentSize: this.eventHistory.length,
      maxSize: this.config.maxHistorySize || 0,
    };
  }

  forceFlush(): void {
    if (this.config.enableBuffering) {
      this.flushEventBuffer();
    }
  }

  updateConfig(newConfig: Partial<EmitterConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Update max listeners if changed
    if (newConfig.maxListeners !== undefined) {
      this.setMaxListeners(newConfig.maxListeners);
    }

    // Restart buffering if configuration changed
    if (
      newConfig.enableBuffering !== undefined ||
      newConfig.flushInterval !== undefined
    ) {
      if (this.bufferFlushTimer) {
        clearInterval(this.bufferFlushTimer);
        this.bufferFlushTimer = undefined;
      }
      this.setupBuffering();
    }

    // Update history size if changed
    if (newConfig.maxHistorySize !== undefined) {
      this.maintainHistorySize();
    }

    Logger.debug("Event emitter configuration updated", {
      oldConfig,
      newConfig: this.config,
    });
  }

  close(): void {
    Logger.info("Closing conversation event emitter");

    // Flush any remaining buffered events
    this.forceFlush();

    // Clear timers
    if (this.bufferFlushTimer) {
      clearInterval(this.bufferFlushTimer);
      this.bufferFlushTimer = undefined;
    }

    // Clear all listeners
    this.clearEventListeners();

    // Log final metrics
    Logger.info("Event emitter final metrics", {
      metrics: this.getMetrics(),
      bufferStatus: this.getBufferStatus(),
      historyStatus: this.getHistoryStatus(),
    });
  }

  // Health check method
  isHealthy(): boolean {
    const metrics = this.getMetrics();
    const bufferStatus = this.getBufferStatus();

    // Consider unhealthy if:
    // - Success rate is below 95%
    // - Average processing time is above 100ms
    // - Buffer is full and not flushing
    const isUnhealthy =
      metrics.successRate < 95 ||
      metrics.averageProcessingTime > 100 ||
      (bufferStatus.enabled &&
        bufferStatus.currentSize >= bufferStatus.maxSize);

    return !isUnhealthy;
  }

  // Debug method to get detailed status
  getStatus(): {
    healthy: boolean;
    metrics: EventMetrics;
    listeners: Record<string, number>;
    buffer: {
      enabled: boolean;
      currentSize: number;
      maxSize: number;
      flushInterval: number;
    };
    history: {
      enabled: boolean;
      currentSize: number;
      maxSize: number;
    };
    config: EmitterConfig;
  } {
    const listenerCounts: Record<string, number> = {};
    for (const [eventType, listeners] of this.eventListeners) {
      listenerCounts[eventType] = listeners.size;
    }

    return {
      healthy: this.isHealthy(),
      metrics: this.getMetrics(),
      listeners: listenerCounts,
      buffer: this.getBufferStatus(),
      history: this.getHistoryStatus(),
      config: { ...this.config },
    };
  }
}

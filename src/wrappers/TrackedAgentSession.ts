import {
  AgentSession,
  AgentSessionOptions,
  AgentSessionResult,
  SessionMetrics,
  PhaseTransition,
  AgentPhase,
} from "../agent/AgentSession";
import { ConversationEventEmitter } from "../events/ConversationEventEmitter";
import { SessionPersistenceManager } from "../persistence/SessionPersistenceManager";
import { Logger } from "../logging/Logger";
import { ToolResult } from "../tools/ToolManager";

export interface TrackedAgentSessionOptions extends AgentSessionOptions {
  eventEmitter: ConversationEventEmitter;
  enableTracking?: boolean;
  persistenceConfig?: {
    enableAutoSave: boolean;
    trackFileOperations: boolean;
    trackToolExecutions: boolean;
  };
  trackingConfig?: {
    trackPhaseTransitions: boolean;
    trackCostMetrics: boolean;
    enableDetailedMetrics: boolean;
  };
}

export interface SessionTrackingMetrics extends SessionMetrics {
  trackingEnabled: boolean;
  eventsEmitted: number;
  persistenceOperations: number;
  trackingOverhead: number; // milliseconds
}

export class TrackedAgentSession extends AgentSession {
  private persistenceManager?: SessionPersistenceManager;

  // FIXED: Use different name to avoid conflict with base class private eventEmitter
  private trackingEventEmitter?: ConversationEventEmitter;

  private trackingEnabled: boolean;
  private trackingMetrics: {
    eventsEmitted: number;
    persistenceOperations: number;
    trackingOverhead: number;
  };

  // FIXED: Add proper type annotation
  private trackingConfig: {
    trackPhaseTransitions: boolean;
    trackCostMetrics: boolean;
    enableDetailedMetrics: boolean;
  };

  constructor(options: TrackedAgentSessionOptions) {
    // FIXED: Remove onProgress handling since it doesn't exist in base class
    super(options);

    this.trackingEnabled = options.enableTracking !== false;

    this.trackingMetrics = {
      eventsEmitted: 0,
      persistenceOperations: 0,
      trackingOverhead: 0,
    };

    this.trackingConfig = {
      trackPhaseTransitions: true,
      trackCostMetrics: true,
      enableDetailedMetrics: false,
      ...options.trackingConfig,
    };

    if (this.trackingEnabled) {
      this.setupTracking(options);
    }

    Logger.debug("TrackedAgentSession initialized", {
      sessionId: this.getSessionId(),
      trackingEnabled: this.trackingEnabled,
      trackingConfig: this.trackingConfig,
    });
  }

  private setupTracking(options: TrackedAgentSessionOptions): void {
    try {
      // Setup event emitter - use different name to avoid conflicts
      this.trackingEventEmitter =
        options.eventEmitter || new ConversationEventEmitter();

      // Setup persistence manager
      this.persistenceManager = new SessionPersistenceManager(
        options.persistenceConfig,
        this.trackingEventEmitter
      );

      // Start tracking the session
      this.persistenceManager.trackSessionStart(this.getSessionId(), {
        vision: options.vision,
        workingDirectory: options.workingDirectory || process.cwd(),
        phase: options.phase || "EXPLORE",
        conversationId: undefined, // Could be linked to conversation if available
        maxIterations: options.maxIterations,
        costBudget: options.costBudget,
        enableWebSearch: options.enableWebSearch,
        enableExtendedContext: options.enableExtendedContext,
      });

      this.trackingMetrics.eventsEmitted++;

      Logger.debug("Session tracking setup completed", {
        sessionId: this.getSessionId(),
      });
    } catch (error) {
      Logger.error("Failed to setup session tracking", {
        sessionId: this.getSessionId(),
        error: error instanceof Error ? error.message : String(error),
      });

      // Disable tracking if setup fails
      this.trackingEnabled = false;
    }
  }

  // Override execute to add tracking
  async execute(
    options: TrackedAgentSessionOptions
  ): Promise<AgentSessionResult> {
    const trackingStartTime = Date.now();

    try {
      // FIXED: Remove onProgress callback handling since base class uses showProgress (boolean)
      // The base class doesn't support progress callbacks, only a boolean flag

      // Execute the session
      const result = await super.execute(options);

      // Track completion
      if (this.trackingEnabled && this.persistenceManager) {
        this.persistenceManager.trackSessionCompletion(this.getSessionId(), {
          success: result.success,
          error: result.error,
          finalPhase: result.finalPhase,
          completionReport: result.completionReport,
          duration: result.duration,
        });

        this.trackingMetrics.eventsEmitted++;
        this.trackingMetrics.persistenceOperations++;
      }

      // Add tracking metrics to result
      const trackedResult: AgentSessionResult = {
        ...result,
        // Add custom tracking data if needed
      };

      const trackingOverhead = Date.now() - trackingStartTime - result.duration;
      this.trackingMetrics.trackingOverhead += trackingOverhead;

      Logger.debug("Tracked session execution completed", {
        sessionId: this.getSessionId(),
        success: result.success,
        trackingOverhead: `${trackingOverhead}ms`,
        eventsEmitted: this.trackingMetrics.eventsEmitted,
      });

      return trackedResult;
    } catch (error) {
      // Track error
      if (this.trackingEnabled && this.persistenceManager) {
        this.persistenceManager.trackSessionCompletion(this.getSessionId(), {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          finalPhase: this.getCurrentPhase(),
          duration: Date.now() - trackingStartTime,
        });

        this.trackingMetrics.eventsEmitted++;
      }

      throw error;
    }
  }

  // FIXED: Add proper type annotation for progress parameter
  private trackProgress(progress: {
    phase?: string;
    iteration?: number;
    cost?: number;
    message?: string;
  }): void {
    if (!this.trackingEnabled || !this.persistenceManager) return;

    try {
      // Extract metrics from current session state
      const currentMetrics = this.getMetrics();

      this.persistenceManager.trackSessionProgress(this.getSessionId(), {
        iterationCount: currentMetrics.iterationCount,
        totalCost: currentMetrics.totalCost,
        tokensUsed: currentMetrics.tokensUsed,
        phase: this.getCurrentPhase(),
      });

      this.trackingMetrics.persistenceOperations++;
    } catch (error) {
      Logger.warn("Failed to track session progress", {
        sessionId: this.getSessionId(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Additional tracking methods
  trackPhaseTransition(transition: PhaseTransition): void {
    if (!this.trackingEnabled || !this.persistenceManager) return;
    if (!this.trackingConfig.trackPhaseTransitions) return;

    try {
      this.persistenceManager.trackPhaseTransition(
        this.getSessionId(),
        transition
      );
      this.trackingMetrics.eventsEmitted++;
      this.trackingMetrics.persistenceOperations++;
    } catch (error) {
      Logger.warn("Failed to track phase transition", {
        sessionId: this.getSessionId(),
        transition,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  trackToolExecution(
    toolName: string,
    parameters: any,
    result: ToolResult,
    executionTime: number
  ): void {
    if (!this.trackingEnabled || !this.persistenceManager) return;

    try {
      this.persistenceManager.trackToolExecution(this.getSessionId(), {
        toolName,
        parameters,
        result,
        executionTime,
        startTime: new Date(Date.now() - executionTime),
        endTime: new Date(),
      });

      this.trackingMetrics.eventsEmitted++;
      this.trackingMetrics.persistenceOperations++;
    } catch (error) {
      Logger.warn("Failed to track tool execution", {
        sessionId: this.getSessionId(),
        toolName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  trackFileOperation(
    operationType: "read" | "write" | "create" | "delete",
    filePath: string,
    success: boolean,
    error?: string,
    fileSize?: number
  ): void {
    if (!this.trackingEnabled || !this.persistenceManager) return;

    try {
      this.persistenceManager.trackFileOperation(this.getSessionId(), {
        type: operationType,
        filePath,
        success,
        error,
        fileSize,
      });

      this.trackingMetrics.eventsEmitted++;
      this.trackingMetrics.persistenceOperations++;
    } catch (error) {
      Logger.warn("Failed to track file operation", {
        sessionId: this.getSessionId(),
        operationType,
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  trackCostUpdate(
    iterationCount: number,
    totalCost: number,
    tokensUsed: number
  ): void {
    if (!this.trackingEnabled || !this.persistenceManager) return;
    if (!this.trackingConfig.trackCostMetrics) return;

    try {
      this.persistenceManager.trackCostUpdate(this.getSessionId(), {
        iterationCount,
        totalCost,
        tokensUsed,
      });

      this.trackingMetrics.eventsEmitted++;
      this.trackingMetrics.persistenceOperations++;
    } catch (error) {
      Logger.warn("Failed to track cost update", {
        sessionId: this.getSessionId(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Public API for tracking metrics
  getTrackingMetrics(): SessionTrackingMetrics {
    const baseMetrics = this.getMetrics();

    return {
      ...baseMetrics,
      trackingEnabled: this.trackingEnabled,
      eventsEmitted: this.trackingMetrics.eventsEmitted,
      persistenceOperations: this.trackingMetrics.persistenceOperations,
      trackingOverhead: this.trackingMetrics.trackingOverhead,
    };
  }

  getTrackingConfig(): typeof this.trackingConfig {
    return { ...this.trackingConfig };
  }

  updateTrackingConfig(newConfig: Partial<typeof this.trackingConfig>): void {
    this.trackingConfig = { ...this.trackingConfig, ...newConfig };

    Logger.debug("Tracking configuration updated", {
      sessionId: this.getSessionId(),
      config: this.trackingConfig,
    });
  }

  isTrackingEnabled(): boolean {
    return this.trackingEnabled;
  }

  disableTracking(): void {
    this.trackingEnabled = false;
    Logger.debug("Session tracking disabled", {
      sessionId: this.getSessionId(),
    });
  }

  enableTracking(): void {
    if (this.persistenceManager) {
      this.trackingEnabled = true;
      Logger.debug("Session tracking enabled", {
        sessionId: this.getSessionId(),
      });
    } else {
      Logger.warn(
        "Cannot enable tracking: persistence manager not initialized",
        {
          sessionId: this.getSessionId(),
        }
      );
    }
  }

  // FIXED: Remove the problematic method that tries to access getEventHistory
  getTrackingStatus(): {
    enabled: boolean;
    eventsEmitted: number;
    persistenceOperations: number;
    trackingOverhead: number;
    // REMOVED: eventsInHistory reference to avoid getEventHistory error
  } {
    return {
      enabled: this.trackingEnabled,
      eventsEmitted: this.trackingMetrics.eventsEmitted,
      persistenceOperations: this.trackingMetrics.persistenceOperations,
      trackingOverhead: this.trackingMetrics.trackingOverhead,
    };
  }

  // Cleanup method
  cleanup(): void {
    try {
      // Close persistence manager
      if (this.persistenceManager) {
        this.persistenceManager.close();
      }

      // Close event emitter if we created it
      if (this.trackingEventEmitter) {
        this.trackingEventEmitter.close();
      }

      // Call parent cleanup
      super.cleanup();

      Logger.debug("TrackedAgentSession cleanup completed", {
        sessionId: this.getSessionId(),
        finalMetrics: this.getTrackingMetrics(),
      });
    } catch (error) {
      Logger.warn("Error during TrackedAgentSession cleanup", {
        sessionId: this.getSessionId(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

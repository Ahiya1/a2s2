import { z } from "zod";
import {
  ConversationSavedEvent,
  SessionStartedEvent,
  SessionCompletedEvent,
  PhaseTransitionEvent,
  ToolExecutionEvent,
  FileOperationEvent,
  CostTrackingEvent,
  ValidationEvent,
} from "../types/DatabaseTypes";

// Base event schema
const BaseEventSchema = z.object({
  timestamp: z.date(),
  sessionId: z.string().optional(),
  conversationId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Conversation events
export const ConversationSavedEventSchema = BaseEventSchema.extend({
  type: z.literal("conversation_saved"),
  payload: z.object({
    conversationId: z.string(),
    state: z.object({
      conversationId: z.string(),
      workingDirectory: z.string(),
      conversationHistory: z.array(z.any()),
      projectContext: z.any(),
      totalCost: z.number(),
      messageCount: z.number(),
      lastUpdated: z.date(),
    }),
  }),
});

export const ConversationLoadedEventSchema = BaseEventSchema.extend({
  type: z.literal("conversation_loaded"),
  payload: z.object({
    conversationId: z.string(),
    fromCache: z.boolean(),
    age: z.number(), // milliseconds since last update
  }),
});

// Session events
export const SessionStartedEventSchema = BaseEventSchema.extend({
  type: z.literal("session_started"),
  payload: z.object({
    sessionId: z.string(),
    conversationId: z.string().optional(),
    vision: z.string(),
    workingDirectory: z.string(),
    options: z.record(z.any()),
    phase: z.enum(["EXPLORE", "SUMMON", "COMPLETE"]),
  }),
});

export const SessionCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("session_completed"),
  payload: z.object({
    sessionId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
    metrics: z.object({
      sessionId: z.string(),
      startTime: z.date(),
      endTime: z.date().optional(),
      phase: z.enum(["EXPLORE", "SUMMON", "COMPLETE"]),
      iterationCount: z.number(),
      toolCallsCount: z.number(),
      totalCost: z.number(),
      tokensUsed: z.number(),
      filesModified: z.array(z.string()),
      filesCreated: z.array(z.string()),
      streamingTime: z.number().optional(),
      phaseTransitions: z.array(z.any()),
    }),
  }),
});

export const SessionProgressEventSchema = BaseEventSchema.extend({
  type: z.literal("session_progress"),
  payload: z.object({
    sessionId: z.string(),
    phase: z.enum(["EXPLORE", "SUMMON", "COMPLETE"]),
    iterationCount: z.number(),
    currentCost: z.number(),
    progress: z.number(), // 0-1
    message: z.string().optional(),
  }),
});

// Phase transition events
export const PhaseTransitionEventSchema = BaseEventSchema.extend({
  type: z.literal("phase_transition"),
  payload: z.object({
    sessionId: z.string(),
    transition: z.object({
      from: z.enum(["EXPLORE", "SUMMON", "COMPLETE"]),
      to: z.enum(["EXPLORE", "SUMMON", "COMPLETE"]),
      timestamp: z.date(),
      reason: z.string().optional(),
      duration: z.number(),
    }),
    summary: z.string().optional(),
    keyFindings: z.array(z.string()).optional(),
    nextActions: z.array(z.string()).optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
});

// Tool execution events
export const ToolExecutionStartedEventSchema = BaseEventSchema.extend({
  type: z.literal("tool_execution_started"),
  payload: z.object({
    sessionId: z.string(),
    conversationId: z.string().optional(),
    toolName: z.string(),
    parameters: z.record(z.any()),
    executionId: z.string(),
  }),
});

export const ToolExecutionCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("tool_execution_completed"),
  payload: z.object({
    sessionId: z.string(),
    conversationId: z.string().optional(),
    toolName: z.string(),
    parameters: z.record(z.any()),
    result: z.object({
      success: z.boolean(),
      result: z.any().optional(),
      error: z
        .object({
          message: z.string(),
        })
        .optional(),
      metadata: z
        .object({
          executionTime: z.number(),
          toolName: z.string(),
          timestamp: z.date(),
        })
        .optional(),
    }),
    executionTime: z.number(),
    executionId: z.string(),
  }),
});

// File operation events
export const FileOperationEventSchema = BaseEventSchema.extend({
  type: z.literal("file_operation"),
  payload: z.object({
    sessionId: z.string(),
    toolExecutionId: z.string().optional(),
    operationType: z.enum(["read", "write", "create", "delete"]),
    filePath: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
    fileSize: z.number().optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

// Cost tracking events
export const CostTrackingEventSchema = BaseEventSchema.extend({
  type: z.literal("cost_tracking"),
  payload: z.object({
    sessionId: z.string(),
    conversationId: z.string().optional(),
    usage: z.object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      thinkingTokens: z.number().optional(),
      cacheCreationTokens: z.number().optional(),
      cacheReadTokens: z.number().optional(),
    }),
    cost: z.object({
      inputCost: z.number(),
      outputCost: z.number(),
      thinkingCost: z.number(),
      totalCost: z.number(),
    }),
    pricingTier: z.enum(["standard", "extended"]),
    iterationNumber: z.number().optional(),
  }),
});

// Validation events
export const ValidationEventSchema = BaseEventSchema.extend({
  type: z.literal("validation"),
  payload: z.object({
    sessionId: z.string(),
    validationType: z.string(),
    result: z.enum(["passed", "failed", "warning"]),
    message: z.string(),
    details: z.record(z.any()).optional(),
    filePath: z.string().optional(),
  }),
});

// Error events
export const ErrorEventSchema = BaseEventSchema.extend({
  type: z.literal("error"),
  payload: z.object({
    sessionId: z.string().optional(),
    conversationId: z.string().optional(),
    errorType: z.string(),
    errorMessage: z.string(),
    errorStack: z.string().optional(),
    context: z.record(z.any()).optional(),
    severity: z.enum(["low", "medium", "high", "critical"]),
  }),
});

// System events
export const SystemEventSchema = BaseEventSchema.extend({
  type: z.literal("system"),
  payload: z.object({
    eventType: z.enum([
      "database_connected",
      "database_disconnected",
      "database_error",
      "backup_created",
      "cleanup_completed",
      "health_check_failed",
    ]),
    message: z.string(),
    details: z.record(z.any()).optional(),
  }),
});

// Union of all event schemas
export const EventSchema = z.discriminatedUnion("type", [
  ConversationSavedEventSchema,
  ConversationLoadedEventSchema,
  SessionStartedEventSchema,
  SessionCompletedEventSchema,
  SessionProgressEventSchema,
  PhaseTransitionEventSchema,
  ToolExecutionStartedEventSchema,
  ToolExecutionCompletedEventSchema,
  FileOperationEventSchema,
  CostTrackingEventSchema,
  ValidationEventSchema,
  ErrorEventSchema,
  SystemEventSchema,
]);

// Type definitions
export type ConversationSavedEventType = z.infer<
  typeof ConversationSavedEventSchema
>;
export type ConversationLoadedEventType = z.infer<
  typeof ConversationLoadedEventSchema
>;
export type SessionStartedEventType = z.infer<typeof SessionStartedEventSchema>;
export type SessionCompletedEventType = z.infer<
  typeof SessionCompletedEventSchema
>;
export type SessionProgressEventType = z.infer<
  typeof SessionProgressEventSchema
>;
export type PhaseTransitionEventType = z.infer<
  typeof PhaseTransitionEventSchema
>;
export type ToolExecutionStartedEventType = z.infer<
  typeof ToolExecutionStartedEventSchema
>;
export type ToolExecutionCompletedEventType = z.infer<
  typeof ToolExecutionCompletedEventSchema
>;
export type FileOperationEventType = z.infer<typeof FileOperationEventSchema>;
export type CostTrackingEventType = z.infer<typeof CostTrackingEventSchema>;
export type ValidationEventType = z.infer<typeof ValidationEventSchema>;
export type ErrorEventType = z.infer<typeof ErrorEventSchema>;
export type SystemEventType = z.infer<typeof SystemEventSchema>;

export type DatabaseEventType = z.infer<typeof EventSchema>;

// Event type constants
export const EVENT_TYPES = {
  CONVERSATION_SAVED: "conversation_saved" as const,
  CONVERSATION_LOADED: "conversation_loaded" as const,
  SESSION_STARTED: "session_started" as const,
  SESSION_COMPLETED: "session_completed" as const,
  SESSION_PROGRESS: "session_progress" as const,
  PHASE_TRANSITION: "phase_transition" as const,
  TOOL_EXECUTION_STARTED: "tool_execution_started" as const,
  TOOL_EXECUTION_COMPLETED: "tool_execution_completed" as const,
  FILE_OPERATION: "file_operation" as const,
  COST_TRACKING: "cost_tracking" as const,
  VALIDATION: "validation" as const,
  ERROR: "error" as const,
  SYSTEM: "system" as const,
} as const;

// Event priorities for processing
export enum EventPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

// Event metadata interface
export interface EventMetadata {
  priority: EventPriority;
  retryCount: number;
  maxRetries: number;
  processingDeadline?: Date;
  correlationId?: string;
  causationId?: string;
  source: string;
  version: string;
}

// Event with metadata wrapper
export interface DatabaseEventWithMetadata {
  event: DatabaseEventType;
  metadata: EventMetadata;
  id: string;
  createdAt: Date;
}

// Event processing result
export interface EventProcessingResult {
  success: boolean;
  error?: string;
  processingTime: number;
  retryRequested?: boolean;
  retryDelay?: number;
}

// Event filter interface
export interface EventFilter {
  types?: string[];
  sessionId?: string;
  conversationId?: string;
  startTime?: Date;
  endTime?: Date;
  minPriority?: EventPriority;
}

// Event statistics
export interface EventStatistics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  processingStats: {
    successful: number;
    failed: number;
    retried: number;
    averageProcessingTime: number;
  };
  timeRange: {
    start: Date;
    end: Date;
  };
}

// Utility functions for event handling
export class EventTypeUtils {
  static validateEvent(event: any): event is DatabaseEventType {
    const result = EventSchema.safeParse(event);
    return result.success;
  }

  static createEvent<T extends DatabaseEventType>(
    type: T["type"],
    payload: T["payload"],
    options: Partial<{
      sessionId: string;
      conversationId: string;
      metadata: Record<string, any>;
    }> = {}
  ): T {
    return {
      type,
      payload,
      timestamp: new Date(),
      sessionId: options.sessionId,
      conversationId: options.conversationId,
      metadata: options.metadata,
    } as T;
  }

  static createEventWithMetadata(
    event: DatabaseEventType,
    options: Partial<EventMetadata> = {}
  ): DatabaseEventWithMetadata {
    return {
      event,
      metadata: {
        priority: EventPriority.NORMAL,
        retryCount: 0,
        maxRetries: 3,
        source: "a2s2-agent-system",
        version: "1.0.0",
        ...options,
      },
      id: this.generateEventId(),
      createdAt: new Date(),
    };
  }

  static getEventPriority(event: DatabaseEventType): EventPriority {
    switch (event.type) {
      case EVENT_TYPES.ERROR:
        return event.payload.severity === "critical"
          ? EventPriority.CRITICAL
          : EventPriority.HIGH;
      case EVENT_TYPES.SYSTEM:
        return event.payload.eventType === "database_error"
          ? EventPriority.HIGH
          : EventPriority.NORMAL;
      case EVENT_TYPES.SESSION_STARTED:
      case EVENT_TYPES.SESSION_COMPLETED:
        return EventPriority.HIGH;
      case EVENT_TYPES.CONVERSATION_SAVED:
      case EVENT_TYPES.PHASE_TRANSITION:
        return EventPriority.NORMAL;
      default:
        return EventPriority.LOW;
    }
  }

  static shouldRetryEvent(event: DatabaseEventType, error: Error): boolean {
    // Don't retry validation events
    if (event.type === EVENT_TYPES.VALIDATION) {
      return false;
    }

    // Don't retry error events
    if (event.type === EVENT_TYPES.ERROR) {
      return false;
    }

    // Retry database connection errors
    if (
      error.message.includes("database") ||
      error.message.includes("connection")
    ) {
      return true;
    }

    // Retry timeout errors
    if (error.message.includes("timeout")) {
      return true;
    }

    return false;
  }

  static getRetryDelay(retryCount: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, etc.
    return Math.min(1000 * Math.pow(2, retryCount), 30000);
  }

  static filterEvents(
    events: DatabaseEventType[],
    filter: EventFilter
  ): DatabaseEventType[] {
    return events.filter((event) => {
      if (filter.types && !filter.types.includes(event.type)) {
        return false;
      }

      if (filter.sessionId && event.sessionId !== filter.sessionId) {
        return false;
      }

      if (
        filter.conversationId &&
        event.conversationId !== filter.conversationId
      ) {
        return false;
      }

      if (filter.startTime && event.timestamp < filter.startTime) {
        return false;
      }

      if (filter.endTime && event.timestamp > filter.endTime) {
        return false;
      }

      if (filter.minPriority !== undefined) {
        const eventPriority = EventTypeUtils.getEventPriority(event);
        if (eventPriority < filter.minPriority) {
          return false;
        }
      }

      return true;
    });
  }

  static generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static serializeEvent(event: DatabaseEventType): string {
    return JSON.stringify(event, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });
  }

  static deserializeEvent(serialized: string): DatabaseEventType | null {
    try {
      const parsed = JSON.parse(serialized, (key, value) => {
        // Convert ISO date strings back to Date objects
        if (
          (typeof value === "string" && key.endsWith("Time")) ||
          key === "timestamp"
        ) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
        return value;
      });

      const result = EventSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch (error) {
      return null;
    }
  }

  static createEventStatistics(
    events: DatabaseEventWithMetadata[]
  ): EventStatistics {
    const eventsByType: Record<string, number> = {};
    let successful = 0;
    let failed = 0;
    let retried = 0;
    let totalProcessingTime = 0;
    let processedEvents = 0;

    const timestamps = events.map((e) => e.event.timestamp);
    const start =
      timestamps.length > 0
        ? new Date(Math.min(...timestamps.map((t) => t.getTime())))
        : new Date();
    const end =
      timestamps.length > 0
        ? new Date(Math.max(...timestamps.map((t) => t.getTime())))
        : new Date();

    events.forEach((eventWithMeta) => {
      const event = eventWithMeta.event;
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;

      // Track processing stats based on metadata
      if (eventWithMeta.metadata.retryCount > 0) {
        retried++;
      }

      // Note: In a real implementation, you would track actual processing results
      // For now, assume most events are successful
      successful++;
    });

    return {
      totalEvents: events.length,
      eventsByType,
      processingStats: {
        successful,
        failed,
        retried,
        averageProcessingTime:
          processedEvents > 0 ? totalProcessingTime / processedEvents : 0,
      },
      timeRange: { start, end },
    };
  }
}

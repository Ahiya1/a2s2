import { ConversationState } from "../conversation/ConversationPersistence";
import { SessionMetrics, PhaseTransition } from "../agent/AgentSession";
import { ToolResult } from "../tools/ToolManager";

// Core database entity interfaces
export interface DatabaseConversation {
  id: string;
  conversation_id: string;
  working_directory: string;
  project_context: string; // JSON serialized
  total_cost: number;
  message_count: number;
  created_at: Date;
  updated_at: Date;
  last_updated: Date;
  conversation_history: string; // JSON serialized
}

export interface DatabaseAgentSession {
  id: string;
  session_id: string;
  conversation_id?: string;
  start_time: Date;
  end_time?: Date;
  phase: "EXPLORE" | "SUMMON" | "COMPLETE";
  iteration_count: number;
  tool_calls_count: number;
  total_cost: number;
  tokens_used: number;
  files_modified: string; // JSON array
  files_created: string; // JSON array
  streaming_time?: number;
  success: boolean;
  error_message?: string;
  vision: string;
  working_directory: string;
  created_at: Date;
  updated_at: Date;
}

export interface DatabasePhaseTransition {
  id: string;
  session_id: string;
  from_phase: string;
  to_phase: "EXPLORE" | "SUMMON" | "COMPLETE";
  timestamp: Date;
  reason?: string;
  duration: number;
  summary?: string;
  key_findings?: string; // JSON array
  next_actions?: string; // JSON array
  confidence?: number;
  created_at: Date;
}

export interface DatabaseToolExecution {
  id: string;
  session_id: string;
  conversation_id?: string;
  tool_name: string;
  tool_parameters: string; // JSON serialized
  result: string;
  success: boolean;
  error_message?: string;
  execution_time: number;
  timestamp: Date;
  created_at: Date;
}

export interface DatabaseFileOperation {
  id: string;
  session_id: string;
  tool_execution_id?: string;
  operation_type: "read" | "write" | "create" | "delete";
  file_path: string;
  success: boolean;
  error_message?: string;
  file_size?: number;
  timestamp: Date;
  created_at: Date;
}

export interface DatabaseCostTracking {
  id: string;
  session_id: string;
  conversation_id?: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  input_cost: number;
  output_cost: number;
  thinking_cost: number;
  total_cost: number;
  pricing_tier: "standard" | "extended";
  timestamp: Date;
  created_at: Date;
}

export interface DatabaseValidationResult {
  id: string;
  session_id: string;
  validation_type: string;
  result: "passed" | "failed" | "warning";
  message: string;
  details?: string; // JSON serialized
  timestamp: Date;
  created_at: Date;
}

// Query result types
export interface ConversationAnalytics {
  totalConversations: number;
  totalSessions: number;
  averageCost: number;
  averageMessages: number;
  successRate: number;
  phaseDistribution: Record<string, number>;
  toolUsageStats: Record<string, number>;
  dateRange: {
    start: Date;
    end: Date;
  };
}

export interface SessionAnalytics {
  sessionId: string;
  conversationCount: number;
  totalCost: number;
  totalTime: number;
  phaseTransitions: DatabasePhaseTransition[];
  toolExecutions: DatabaseToolExecution[];
  fileOperations: DatabaseFileOperation[];
  costBreakdown: DatabaseCostTracking[];
}

export interface DashboardMetrics {
  conversations: {
    total: number;
    today: number;
    thisWeek: number;
    successRate: number;
  };
  sessions: {
    active: number;
    completed: number;
    failed: number;
  };
  costs: {
    total: number;
    today: number;
    average: number;
    breakdown: Record<string, number>;
  };
  tools: {
    mostUsed: Array<{ name: string; count: number; successRate: number }>;
    recentExecutions: DatabaseToolExecution[];
  };
  performance: {
    averageSessionTime: number;
    averageTokensPerSession: number;
    phaseDistribution: Record<string, number>;
  };
}

// Event payload types - Updated to match actual ConversationState interface
export interface ConversationSavedEvent {
  conversationId: string;
  state: ConversationState;
  timestamp: Date;
}

export interface SessionStartedEvent {
  sessionId: string;
  conversationId?: string;
  vision: string;
  workingDirectory: string;
  options: any;
  timestamp: Date;
}

export interface SessionCompletedEvent {
  sessionId: string;
  metrics: SessionMetrics;
  success: boolean;
  error?: string;
  timestamp: Date;
}

export interface PhaseTransitionEvent {
  sessionId: string;
  transition: PhaseTransition;
  timestamp: Date;
}

export interface ToolExecutionEvent {
  sessionId: string;
  conversationId?: string;
  toolName: string;
  parameters: any;
  result: ToolResult;
  executionTime: number;
  timestamp: Date;
}

export interface FileOperationEvent {
  sessionId: string;
  toolExecutionId?: string;
  operationType: "read" | "write" | "create" | "delete";
  filePath: string;
  success: boolean;
  error?: string;
  fileSize?: number;
  timestamp: Date;
}

export interface CostTrackingEvent {
  sessionId: string;
  conversationId?: string;
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
  timestamp: Date;
}

export interface ValidationEvent {
  sessionId: string;
  validationType: string;
  result: "passed" | "failed" | "warning";
  message: string;
  details?: any;
  timestamp: Date;
}

// Database configuration types
export interface DatabaseConfig {
  enabled: boolean;
  url: string;
  type: "sqlite" | "postgres" | "mysql";
  poolSize: number;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  enableWAL: boolean;
  enableForeignKeys: boolean;
  backup: {
    enabled: boolean;
    interval: number; // hours
    retention: number; // days
  };
  analytics: {
    enabled: boolean;
    retention: number; // days
  };
}

// Query options
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: "ASC" | "DESC";
  filters?: Record<string, any>;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

// Database operation results
export interface DatabaseOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  affectedRows?: number;
  executionTime: number;
  timestamp: Date;
}

export interface BulkOperationResult {
  success: boolean;
  totalRecords: number;
  successCount: number;
  failureCount: number;
  errors: string[];
  executionTime: number;
}

// Migration types
export interface Migration {
  version: string;
  description: string;
  up: string;
  down: string;
  checksum: string;
  appliedAt?: Date;
}

export interface MigrationStatus {
  currentVersion: string;
  availableVersions: string[];
  pendingMigrations: Migration[];
  appliedMigrations: Migration[];
}

// Health check types
export interface DatabaseHealth {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  connectionPool: {
    active: number;
    idle: number;
    total: number;
  };
  performance: {
    avgQueryTime: number;
    slowQueries: number;
    failedQueries: number;
  };
  storage: {
    size: number;
    freeSpace: number;
    fragmentationLevel: number;
  };
  lastBackup?: Date;
  uptime: number;
  errors: string[];
}

// Export utility types - FIXED: Added missing properties
export interface ExportOptions {
  format: "json" | "csv" | "sql";
  tables?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  compress: boolean;
  includeAnalytics: boolean;
  outputPath?: string; // ADDED: Missing property
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  size: number;
  recordCount: number;
  tables: string[];
  format: string;
  compressed: boolean; // ADDED: Missing property
  error?: string;
  executionTime: number;
}

// FIXED: Event type constants
export const EVENT_TYPES = {
  CONVERSATION_SAVED: "conversation_saved",
  SESSION_STARTED: "session_started",
  SESSION_COMPLETED: "session_completed",
  PHASE_TRANSITION: "phase_transition",
  TOOL_EXECUTION_STARTED: "tool_execution_started",
  TOOL_EXECUTION_COMPLETED: "tool_execution_completed",
  FILE_OPERATION: "file_operation",
  COST_TRACKING: "cost_tracking",
  VALIDATION: "validation",
  ERROR: "error",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// Type guards
export const isDatabaseConversation = (
  obj: any
): obj is DatabaseConversation => {
  return (
    obj &&
    typeof obj.conversation_id === "string" &&
    typeof obj.total_cost === "number"
  );
};

export const isDatabaseAgentSession = (
  obj: any
): obj is DatabaseAgentSession => {
  return (
    obj && typeof obj.session_id === "string" && typeof obj.phase === "string"
  );
};

export const isDatabaseToolExecution = (
  obj: any
): obj is DatabaseToolExecution => {
  return (
    obj && typeof obj.tool_name === "string" && typeof obj.success === "boolean"
  );
};

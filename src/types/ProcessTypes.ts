/**
 * Core process execution types
 */
export interface ExecutionOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  signal?: AbortSignal;
  maxBuffer?: number;
  killSignal?: NodeJS.Signals | number;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
}

export interface ProcessInfo {
  pid?: number;
  command: string;
  startTime: Date;
  options: ExecutionOptions;
  status: ProcessStatus;
}

export enum ProcessStatus {
  STARTING = "starting",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  TIMEOUT = "timeout",
  KILLED = "killed",
}

/**
 * Process management configuration
 */
export interface ProcessManagerConfig {
  defaultTimeout: number;
  maxConcurrentProcesses: number;
  killTimeout: number;
  enableCleanup: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Resource management types
 */
export interface ResourceUsage {
  activeProcesses: number;
  totalProcessesSpawned: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  timeoutCount: number;
  errorCount: number;
  peakMemoryUsage?: number;
}

export interface ResourceLimits {
  maxActiveProcesses: number;
  maxTotalProcesses: number;
  maxExecutionTime: number;
  memoryLimitMB?: number;
}

/**
 * Command execution patterns
 */
export interface CommandPattern {
  pattern: string | RegExp;
  timeout?: number;
  retries?: number;
  priority?: number;
  requiresCleanup?: boolean;
}

export interface CommandExecution {
  id: string;
  command: string;
  pattern?: CommandPattern;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  result?: ExecutionResult;
  error?: Error;
  retryCount: number;
}

/**
 * Error handling types
 */
export interface ProcessError extends Error {
  code?: string | number;
  signal?: NodeJS.Signals;
  killed?: boolean;
  pid?: number;
  command: string;
  options: ExecutionOptions;
  stderr?: string;
  stdout?: string;
}

export class TimeoutError extends Error implements ProcessError {
  code = "TIMEOUT";
  killed = true;

  constructor(
    public command: string,
    public options: ExecutionOptions,
    public pid?: number
  ) {
    super(`Command timed out after ${options.timeout}ms: ${command}`);
    this.name = "TimeoutError";
  }
}

export class ProcessKilledError extends Error implements ProcessError {
  code = "KILLED";
  killed = true;

  constructor(
    public command: string,
    public options: ExecutionOptions,
    public signal: NodeJS.Signals,
    public pid?: number
  ) {
    super(`Command was killed with signal ${signal}: ${command}`);
    this.name = "ProcessKilledError";
  }
}

export class CommandNotFoundError extends Error implements ProcessError {
  code = "ENOENT";

  constructor(
    public command: string,
    public options: ExecutionOptions
  ) {
    super(`Command not found: ${command}`);
    this.name = "CommandNotFoundError";
  }
}

export class ProcessFailedError extends Error implements ProcessError {
  constructor(
    public command: string,
    public options: ExecutionOptions,
    public code: number,
    public stdout?: string,
    public stderr?: string,
    public pid?: number
  ) {
    super(`Command failed with exit code ${code}: ${command}`);
    this.name = "ProcessFailedError";
  }
}

/**
 * Event system types for process monitoring
 */
export interface ProcessEvent {
  type: ProcessEventType;
  timestamp: Date;
  processId: string;
  command: string;
  data?: any;
}

export enum ProcessEventType {
  PROCESS_STARTED = "process_started",
  PROCESS_COMPLETED = "process_completed",
  PROCESS_FAILED = "process_failed",
  PROCESS_TIMEOUT = "process_timeout",
  PROCESS_KILLED = "process_killed",
  RESOURCE_LIMIT_REACHED = "resource_limit_reached",
  CLEANUP_INITIATED = "cleanup_initiated",
  CLEANUP_COMPLETED = "cleanup_completed",
}

export interface ProcessEventListener {
  (event: ProcessEvent): void | Promise<void>;
}

/**
 * Tool-specific execution contexts
 */
export interface ValidationContext extends ExecutionOptions {
  type:
    | "typescript"
    | "javascript"
    | "eslint"
    | "test"
    | "build"
    | "format"
    | "custom";
  fix?: boolean;
  strict?: boolean;
  files?: string[];
  config?: string;
  format?: "json" | "text" | "junit";
}

export interface GitContext extends ExecutionOptions {
  operation:
    | "init"
    | "status"
    | "add"
    | "commit"
    | "push"
    | "pull"
    | "branch"
    | "checkout"
    | "log"
    | "diff"
    | "clone"
    | "remote";
  repository?: string;
  branch?: string;
  remote?: string;
  message?: string;
  files?: string[];
}

export interface ShellContext extends ExecutionOptions {
  shell?: string;
  stdio?: "inherit" | "ignore" | "pipe";
  detached?: boolean;
  uid?: number;
  gid?: number;
}

/**
 * Mock testing types
 */
export interface MockCommandConfig {
  command: string | RegExp;
  result: ExecutionResult;
  delay?: number;
  shouldFail?: boolean;
  callCount?: number;
}

export interface MockExecutionHistory {
  command: string;
  options: ExecutionOptions;
  timestamp: Date;
  duration?: number;
  result?: ExecutionResult;
  error?: Error;
}

/**
 * Performance monitoring types
 */
export interface PerformanceMetrics {
  commandsExecuted: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  timeoutCount: number;
  errorCount: number;
  successRate: number;
  commandBreakdown: Record<
    string,
    {
      count: number;
      totalTime: number;
      avgTime: number;
      errors: number;
      timeouts: number;
    }
  >;
}

export interface PerformanceSample {
  timestamp: Date;
  command: string;
  duration: number;
  success: boolean;
  memoryUsage?: number;
  cpuUsage?: number;
}

/**
 * Configuration validation types
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface ProcessHealthCheck {
  healthy: boolean;
  activeProcesses: number;
  zombieProcesses: number;
  resourceUsage: ResourceUsage;
  lastError?: ProcessError;
  uptime: number;
}

/**
 * Utility types
 */
export type CommandMatcher = string | RegExp | ((command: string) => boolean);

export type ProcessCallback<T = void> = (
  command: string,
  options: ExecutionOptions,
  result?: ExecutionResult,
  error?: ProcessError
) => T | Promise<T>;

export type ResourceCleanupHandler = () => void | Promise<void>;

/**
 * Type guards
 */
export function isProcessError(error: unknown): error is ProcessError {
  return error instanceof Error && "command" in error && "options" in error;
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

export function isProcessKilledError(
  error: unknown
): error is ProcessKilledError {
  return error instanceof ProcessKilledError;
}

export function isCommandNotFoundError(
  error: unknown
): error is CommandNotFoundError {
  return error instanceof CommandNotFoundError;
}

export function isProcessFailedError(
  error: unknown
): error is ProcessFailedError {
  return error instanceof ProcessFailedError;
}

/**
 * Default configurations
 */
export const DEFAULT_PROCESS_CONFIG: ProcessManagerConfig = {
  defaultTimeout: 30000,
  maxConcurrentProcesses: 10,
  killTimeout: 5000,
  enableCleanup: true,
  logLevel: "info",
};

export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxActiveProcesses: 20,
  maxTotalProcesses: 1000,
  maxExecutionTime: 300000, // 5 minutes
  memoryLimitMB: 1024, // 1GB
};

/**
 * Common command patterns
 */
export const COMMON_COMMAND_PATTERNS: Record<string, CommandPattern> = {
  typescript: {
    pattern: /npx tsc/,
    timeout: 60000,
    retries: 1,
    priority: 1,
  },
  eslint: {
    pattern: /npx eslint/,
    timeout: 45000,
    retries: 2,
    priority: 2,
  },
  test: {
    pattern: /npm (test|run test)/,
    timeout: 120000,
    retries: 1,
    priority: 1,
  },
  build: {
    pattern: /npm (run )?build/,
    timeout: 180000,
    retries: 0,
    priority: 1,
    requiresCleanup: true,
  },
  git: {
    pattern: /git /,
    timeout: 60000,
    retries: 1,
    priority: 3,
  },
};

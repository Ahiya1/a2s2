/**
 * keen CLI - Type definitions
 */

export interface CLIOptions {
  vision: string;
  visionFile?: string;
  directory?: string;
  phase?: "EXPLORE" | "PLAN" | "SUMMON" | "COMPLETE";
  maxIterations?: number;
  costBudget?: number;
  webSearch?: boolean;
  extendedContext?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  debug?: boolean;
  stream?: boolean;
}

export interface AgentResult {
  success: boolean;
  summary?: string;
  filesCreated?: string[];
  filesModified?: string[];
  nextSteps?: string[];
  testsRun?: string[];
  validationResults?: string[];
  totalCost?: number;
  duration?: number;
  error?: string;
}

export interface ProgressIndicator {
  stop: () => void;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface CLIConfig {
  anthropicApiKey?: string;
  defaultDirectory?: string;
  defaultPhase?: string;
  defaultMaxIterations?: number;
  defaultCostBudget?: number;
  enableWebSearch?: boolean;
  enableExtendedContext?: boolean;
  logLevel?: LogLevel;
}

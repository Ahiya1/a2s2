/**
 * keen Agent Core - Type definitions
 */

import { AnthropicConfig } from '../config/AnthropicConfig.js';

export type AgentPhase = 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';

export interface AgentSessionOptions {
  sessionId: string;
  vision: string;
  workingDirectory: string;
  visionFile?: string;
  anthropicConfig: AnthropicConfig;
  dryRun: boolean;
  verbose: boolean;
  debug: boolean;
}

export interface AgentExecutionContext {
  sessionId: string;
  workingDirectory: string;
  dryRun: boolean;
  verbose: boolean;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

// Updated to match Anthropic SDK tool schema format
export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolManagerOptions {
  workingDirectory: string;
  enableWebSearch: boolean;
  debug: boolean;
}

export interface ThinkingBlock {
  id: string;
  content: string;
  phase: AgentPhase;
  timestamp: Date;
  confidence?: number;
  decision?: any;
}

export interface PhaseReport {
  phase: AgentPhase;
  summary: string;
  confidence?: number;
  estimatedTimeRemaining?: string;
  keyFindings?: string[];
  nextActions?: string[];
}

export interface CompletionReport {
  summary: string;
  success?: boolean;
  filesCreated?: string[];
  filesModified?: string[];
  nextSteps?: string[];
  testsRun?: string[];
  validationResults?: string[];
}

export interface ContinuationPlan {
  nextAction: string;
  reasoning?: string;
  estimatedDuration?: string;
  dependencies?: string[];
  risks?: string[];
  requiresUserInput?: boolean;
}

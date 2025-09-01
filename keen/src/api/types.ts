/**
 * keen API Gateway - TypeScript Type Definitions
 * Shared interfaces and types for the API Gateway layer
 */

import { Request } from 'express';

// ============================================================================
// Enhanced Express Types
// ============================================================================

/**
 * Extended Express Request with authentication and audit info
 */
export interface AuthenticatedRequest extends Request {
  id: string; // Request ID
  user?: AuthenticatedUser;
  apiKeyScopes?: string[];
  rateLimitInfo?: RateLimitInfo;
}

/**
 * User with authentication metadata
 */
export interface AuthenticatedUser {
  id: string;
  email?: string;
  username?: string;
  display_name?: string;
  role?: string;
  is_admin?: boolean;
  admin_privileges?: {
    unlimited_credits?: boolean;
    bypass_rate_limits?: boolean;
    view_all_analytics?: boolean;
    user_impersonation?: boolean;
    system_diagnostics?: boolean;
    priority_execution?: boolean;
    global_access?: boolean;
    audit_access?: boolean;
  };
  email_verified?: boolean;
  account_status?: string;
  mfa_enabled?: boolean;
  timezone?: string;
  preferences?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
  last_login_at?: Date;
  last_login_ip?: string;
  authMethod?: 'jwt' | 'api_key';
  tokenIsAdmin?: boolean;
  tokenScopes?: string[];
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface JWTPayload {
  sub: string; // User ID
  email: string;
  username: string;
  role: string;
  isAdmin: boolean;
  adminPrivileges: Record<string, any>;
  scopes: string[];
  iat: number;
  exp: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  mfaToken?: string;
}

export interface ClientInfo {
  ip: string;
  userAgent?: string;
  deviceId?: string;
}

export interface AuthenticationResult {
  user: AuthenticatedUser;
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  adminAccess: boolean;
}

export interface APIKeyConfig {
  name: string;
  scopes: string[];
  rateLimitPerHour?: number;
  expiresAt?: Date;
}

export interface APIKeyResult {
  id: string;
  key: string; // Only shown once
  name: string;
  scopes: string[];
  rateLimitPerHour: number | null;
  bypassLimits: boolean;
  createdAt: Date;
}

export interface APIKeyValidation {
  userId: string;
  scopes: string[];
  rateLimitRemaining: number | 'unlimited';
  isAdmin: boolean;
  adminPrivileges: Record<string, any> | null;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

export interface RateLimitInfo {
  allowed: boolean;
  remaining: number | 'unlimited';
  resetTime: number | null;
  limit: number | 'unlimited';
  isAdmin?: boolean;
}

export interface ConcurrencyCheckResult {
  allowed: boolean;
  current: number | 'unlimited';
  limit: number | 'unlimited';
  isAdmin?: boolean;
}

export interface RateLimits {
  requestsPerWindow: number;
  windowMs: number;
  maxConcurrentSessions: number;
  maxAgentsPerSession: number;
}

// ============================================================================
// Credit Management Types
// ============================================================================

export interface CreditReservation {
  reservationId: string;
  reservedAmount: number;
  estimatedCost: number;
  claudeCost?: number;
  markupMultiplier?: number;
  remainingBalance: number;
  isAdmin?: boolean;
  unlimited?: boolean;
}

export interface InsufficientCreditsError extends Error {
  name: 'InsufficientCreditsError';
  required: number;
  available: number;
  shortfall: number;
  claudeCost: number;
  markupMultiplier: number;
}

// ============================================================================
// Agent Execution Types
// ============================================================================

export interface AgentExecutionRequest {
  vision: string;
  workingDirectory?: string;
  options: AgentExecutionOptions;
  webhookUrl?: string;
}

export interface AgentExecutionOptions {
  maxIterations?: number;
  costBudget?: number;
  enableWebSearch?: boolean;
  enableStreaming?: boolean;
  showProgress?: boolean;
  startingPhase?: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';
}

export interface PureAgentRequest {
  vision: string;
  workingDirectory: string;
  options: {
    maxIterations: number;
    enableWebSearch: boolean;
    enableStreaming: boolean;
    showProgress: boolean;
  };
  // ✅ NO business logic exposed:
  // - No userId
  // - No credit info
  // - No admin status
  // - No rate limit info
  // - Just pure development context
}

export interface AgentSession {
  id: string;
  session_id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  current_phase: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';
  vision: string;
  working_directory: string;
  git_branch: string;
  estimated_cost: number;
  streaming_url: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface AuthenticatedWebSocket {
  ws: any; // WebSocket instance
  userId: string;
  isAdmin: boolean;
  adminPrivileges: Record<string, any> | null;
  sessionFilters: string[];
  connectionId: string;
  connectedAt: Date;
  lastPingAt: Date;
}

export interface StreamingEvent {
  event_type: 'phase_transition' | 'agent_spawned' | 'git_operation' | 'tool_execution' | 
             'progress_update' | 'error' | 'session_complete' | 'connection_established' |
             'pong' | 'subscription_confirmed' | 'subscription_cancelled' | 'admin_response' |
             'admin_broadcast';
  timestamp: string;
  session_id: string;
  data: Record<string, any>;
}

// ============================================================================
// Workspace Management Types
// ============================================================================

export interface WorkspaceConfig {
  sessionType: 'agent_execution' | 'user_workspace';
  visionHash: string;
  isAdminSession: boolean;
}

export interface UserWorkspace {
  sessionId: string;
  path: string;
  isolated: boolean;
  createdAt: Date;
}

// ============================================================================
// Analytics Types
// ============================================================================

export interface AdminAnalytics {
  sessions: {
    total_started: number;
    completed_successfully: number;
    failed: number;
    cancelled: number;
    success_rate: number;
  };
  agents: {
    total_spawned: number;
    max_recursion_depth: number;
    avg_agents_per_session: number;
  };
  costs: {
    total_spent: number;
    avg_per_session: number;
    most_expensive_session: number;
    cost_breakdown: {
      standard_context: number;
      extended_context: number;
    };
  };
  credit_system: {
    markup_multiplier: number;
    no_packages: boolean;
    admin_bypasses: number;
  };
  tools: {
    most_used: Array<{
      name: string;
      count: number;
      success_rate: number;
    }>;
  };
  git_operations: {
    commits: number;
    branches_created: number;
    merges: number;
    conflicts_resolved: number;
  };
}

// ============================================================================
// Error Types
// ============================================================================

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public details?: Record<string, any>) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string, public rateLimitInfo: RateLimitInfo) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class ConcurrencyError extends Error {
  constructor(message: string, public concurrencyInfo: ConcurrencyCheckResult) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}

export class MFARequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MFARequiredError';
  }
}

// ============================================================================
// Audit Logging Types
// ============================================================================

export interface AuditLogEntry {
  id?: string;
  event_type: 'api_request' | 'api_response' | 'authentication' | 'credit_transaction' | 'admin_action' | 'error' | 'security_event';
  user_id?: string;
  session_id?: string;
  request_id?: string;
  timestamp: Date;
  ip_address?: string;
  user_agent?: string;
  event_data: Record<string, any>;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  is_admin_action: boolean;
}

export interface APIRequestLog {
  requestId: string;
  method: string;
  path: string;
  userAgent?: string;
  ip: string;
  userId?: string;
  isAdmin: boolean;
}

export interface APIResponseLog {
  requestId: string;
  statusCode: number;
  duration: number;
  responseSize: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface APIGatewayConfig {
  port: number;
  host: string;
  environment: 'development' | 'staging' | 'production';
  cors: {
    origins: string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
    skipSuccessfulRequests: boolean;
    adminBypass: boolean;
  };
  websocket: {
    pingInterval: number;
    pongTimeout: number;
    maxConnections: number;
  };
  security: {
    jwtSecret: string;
    jwtExpiration: string;
    refreshTokenExpiration: string;
    bcryptRounds: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
  };
}

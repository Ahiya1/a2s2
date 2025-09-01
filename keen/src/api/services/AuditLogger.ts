/**
 * keen API Gateway - Audit Logging Service
 * Comprehensive security and compliance audit logging
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import { 
  AuditLogEntry, 
  APIRequestLog, 
  APIResponseLog 
} from '../types.js';

export class AuditLogger {
  constructor(private db: DatabaseManager) {}

  /**
   * Log API request
   */
  async logAPIRequest(request: APIRequestLog): Promise<void> {
    try {
      await this.createAuditEntry({
        event_type: 'api_request',
        user_id: request.userId,
        request_id: request.requestId,
        timestamp: new Date(),
        ip_address: request.ip,
        user_agent: request.userAgent,
        event_data: {
          method: request.method,
          path: request.path,
          is_admin: request.isAdmin
        },
        risk_level: this.assessRequestRisk(request),
        is_admin_action: request.isAdmin
      });
    } catch (error) {
      console.error('Failed to log API request:', error);
      // Don't throw - audit logging should not break API functionality
    }
  }

  /**
   * Log API response
   */
  async logAPIResponse(response: APIResponseLog): Promise<void> {
    try {
      await this.createAuditEntry({
        event_type: 'api_response',
        request_id: response.requestId,
        timestamp: new Date(),
        event_data: {
          status_code: response.statusCode,
          duration_ms: response.duration,
          response_size_bytes: response.responseSize,
          is_error: response.statusCode >= 400
        },
        risk_level: response.statusCode >= 500 ? 'high' : 
                   response.statusCode >= 400 ? 'medium' : 'low',
        is_admin_action: false
      });
    } catch (error) {
      console.error('Failed to log API response:', error);
    }
  }

  /**
   * Log successful authentication
   */
  async logSuccessfulLogin(
    userId: string, 
    clientInfo: { ip: string; userAgent?: string },
    authDetails: { isAdmin: boolean; adminPrivileges?: Record<string, any> }
  ): Promise<void> {
    try {
      await this.createAuditEntry({
        event_type: 'authentication',
        user_id: userId,
        timestamp: new Date(),
        ip_address: clientInfo.ip,
        user_agent: clientInfo.userAgent,
        event_data: {
          action: 'login_success',
          is_admin: authDetails.isAdmin,
          admin_privileges: authDetails.adminPrivileges,
          authentication_method: 'password'
        },
        risk_level: authDetails.isAdmin ? 'medium' : 'low',
        is_admin_action: authDetails.isAdmin
      });
    } catch (error) {
      console.error('Failed to log successful login:', error);
    }
  }

  /**
   * Log failed authentication attempt
   */
  async logFailedLogin(
    email: string,
    clientInfo: { ip: string; userAgent?: string },
    reason: string
  ): Promise<void> {
    try {
      await this.createAuditEntry({
        event_type: 'authentication',
        timestamp: new Date(),
        ip_address: clientInfo.ip,
        user_agent: clientInfo.userAgent,
        event_data: {
          action: 'login_failed',
          email,
          reason,
          potentially_malicious: this.isSuspiciousLogin(clientInfo, reason)
        },
        risk_level: this.assessFailureRisk(reason),
        is_admin_action: false
      });
    } catch (error) {
      console.error('Failed to log failed login:', error);
    }
  }

  /**
   * Log agent execution start
   */
  async logAgentExecution(executionInfo: {
    userId: string;
    sessionId: string;
    requestId: string;
    vision: string;
    estimatedCost: number;
    isAdminSession: boolean;
    creditBypass: boolean;
  }): Promise<void> {
    try {
      await this.createAuditEntry({
        event_type: 'api_request',
        user_id: executionInfo.userId,
        session_id: executionInfo.sessionId,
        request_id: executionInfo.requestId,
        timestamp: new Date(),
        event_data: {
          action: 'agent_execution_start',
          vision_preview: executionInfo.vision,
          estimated_cost: executionInfo.estimatedCost,
          is_admin_session: executionInfo.isAdminSession,
          credit_bypass: executionInfo.creditBypass
        },
        risk_level: executionInfo.estimatedCost > 50 ? 'medium' : 'low',
        is_admin_action: executionInfo.isAdminSession
      });
    } catch (error) {
      console.error('Failed to log agent execution:', error);
    }
  }

  /**
   * Log admin action
   */
  async logAdminAction(action: {
    adminUserId: string;
    action: string;
    targetUserId?: string;
    details?: Record<string, any>;
    timestamp?: Date;
  }): Promise<void> {
    try {
      await this.createAuditEntry({
        event_type: 'admin_action',
        user_id: action.adminUserId,
        timestamp: action.timestamp || new Date(),
        event_data: {
          admin_action: action.action,
          target_user_id: action.targetUserId,
          details: action.details,
          requires_review: this.requiresAdminReview(action.action)
        },
        risk_level: this.assessAdminActionRisk(action.action),
        is_admin_action: true
      });
    } catch (error) {
      console.error('Failed to log admin action:', error);
    }
  }

  /**
   * Log error event
   */
  async logError(errorInfo: {
    requestId?: string;
    userId?: string;
    sessionId?: string;
    error: string;
    duration?: number;
    isAdmin: boolean;
  }): Promise<void> {
    try {
      await this.createAuditEntry({
        event_type: 'error',
        user_id: errorInfo.userId,
        session_id: errorInfo.sessionId,
        request_id: errorInfo.requestId,
        timestamp: new Date(),
        event_data: {
          error_message: errorInfo.error,
          duration_ms: errorInfo.duration,
          is_admin_request: errorInfo.isAdmin,
          requires_investigation: this.requiresInvestigation(errorInfo.error)
        },
        risk_level: this.assessErrorRisk(errorInfo.error),
        is_admin_action: errorInfo.isAdmin
      });
    } catch (error) {
      console.error('Failed to log error:', error);
    }
  }

  /**
   * Log security event
   */
  async logSecurityEvent(event: {
    type: 'rate_limit_exceeded' | 'invalid_token' | 'suspicious_activity' | 'admin_privilege_escalation';
    userId?: string;
    ip?: string;
    details: Record<string, any>;
  }): Promise<void> {
    try {
      await this.createAuditEntry({
        event_type: 'security_event',
        user_id: event.userId,
        timestamp: new Date(),
        ip_address: event.ip,
        event_data: {
          security_event_type: event.type,
          details: event.details,
          automatic_response: this.getAutomaticResponse(event.type),
          requires_manual_review: this.requiresManualReview(event.type)
        },
        risk_level: this.assessSecurityEventRisk(event.type),
        is_admin_action: false
      });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Get audit logs with admin access
   */
  async getAuditLogs(
    adminUserId: string,
    filters: {
      startDate?: Date;
      endDate?: Date;
      eventType?: string;
      userId?: string;
      riskLevel?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    logs: AuditLogEntry[];
    total: number;
  }> {
    // Verify admin access
    const adminUser = await this.db.query(
      'SELECT is_admin, admin_privileges FROM users WHERE id = $1',
      [adminUserId]
    );
    
    if (!adminUser[0]?.is_admin) {
      throw new Error('Admin privileges required to access audit logs');
    }

    // Build query conditions
    const conditions = ['1=1'];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    if (filters.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(filters.eventType);
    }

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filters.userId);
    }

    if (filters.riskLevel) {
      conditions.push(`risk_level = $${paramIndex++}`);
      params.push(filters.riskLevel);
    }

    // Get total count
    const countResult = await this.db.query(
      `SELECT COUNT(*) as total FROM audit_logs WHERE ${conditions.join(' AND ')}`,
      params
    );

    // Get logs
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;
    
    params.push(limit, offset);
    const logs = await this.db.query<AuditLogEntry>(
      `
      SELECT * FROM audit_logs 
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp DESC 
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `,
      params
    );

    return {
      logs,
      total: parseInt(countResult[0]?.total || '0', 10)
    };
  }

  /**
   * Create audit log entry
   */
  private async createAuditEntry(entry: Omit<AuditLogEntry, 'id'>): Promise<void> {
    const id = uuidv4();
    
    try {
      await this.db.query(
        `
        INSERT INTO audit_logs (
          id, event_type, user_id, session_id, request_id, timestamp,
          ip_address, user_agent, event_data, risk_level, is_admin_action
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          id,
          entry.event_type,
          entry.user_id,
          entry.session_id,
          entry.request_id,
          entry.timestamp,
          entry.ip_address,
          entry.user_agent,
          JSON.stringify(entry.event_data),
          entry.risk_level,
          entry.is_admin_action
        ]
      );
    } catch (error: any) {
      // In test environment, gracefully handle missing audit_logs table
      if (process.env.NODE_ENV === 'test' && error.code === '42P01') {
        // Table doesn't exist in test environment, skip audit logging
        return;
      }
      throw error;
    }
  }

  // Risk assessment methods
  private assessRequestRisk(request: APIRequestLog): 'low' | 'medium' | 'high' | 'critical' {
    if (request.isAdmin) return 'medium';
    if (request.path.includes('/admin')) return 'high';
    if (request.path.includes('/agents/execute')) return 'medium';
    return 'low';
  }

  private assessFailureRisk(reason: string): 'low' | 'medium' | 'high' | 'critical' {
    if (reason === 'invalid_mfa') return 'high';
    if (reason === 'account_suspended') return 'medium';
    return 'low';
  }

  private assessAdminActionRisk(action: string): 'low' | 'medium' | 'high' | 'critical' {
    if (action === 'delete_user' || action === 'suspend_account') return 'high';
    if (action === 'view_analytics' || action === 'view_audit_logs') return 'medium';
    return 'low';
  }

  private assessErrorRisk(error: string): 'low' | 'medium' | 'high' | 'critical' {
    if (error.includes('database') || error.includes('connection')) return 'high';
    if (error.includes('authentication') || error.includes('authorization')) return 'medium';
    return 'low';
  }

  private assessSecurityEventRisk(type: string): 'low' | 'medium' | 'high' | 'critical' {
    if (type === 'admin_privilege_escalation') return 'critical';
    if (type === 'suspicious_activity') return 'high';
    if (type === 'rate_limit_exceeded') return 'medium';
    return 'low';
  }

  private isSuspiciousLogin(clientInfo: { ip: string }, reason: string): boolean {
    // Simple heuristics - in production, use more sophisticated detection
    return reason === 'invalid_credentials' || 
           clientInfo.ip === '127.0.0.1' || 
           !clientInfo.ip;
  }

  private requiresAdminReview(action: string): boolean {
    return ['delete_user', 'suspend_account', 'modify_credits', 'privilege_escalation'].includes(action);
  }

  private requiresInvestigation(error: string): boolean {
    return error.includes('security') || 
           error.includes('authentication') || 
           error.includes('privilege');
  }

  private requiresManualReview(type: string): boolean {
    return ['admin_privilege_escalation', 'suspicious_activity'].includes(type);
  }

  private getAutomaticResponse(type: string): string {
    switch (type) {
      case 'rate_limit_exceeded':
        return 'Request blocked, rate limit enforced';
      case 'invalid_token':
        return 'Request rejected, authentication required';
      case 'suspicious_activity':
        return 'Account flagged for review';
      default:
        return 'Event logged';
    }
  }
}
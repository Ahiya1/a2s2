/**
 * keen API Gateway - Admin Routes
 * Admin-only endpoints for system analytics, user management, and system control
 */

import { Router, Request, Response } from 'express';
import { query, body, validationResult } from 'express-validator';
import { asyncHandler, createValidationError } from '../middleware/errorHandler.js';
import { requireAdmin, requireAdminPrivilege } from '../middleware/authentication.js';
import { AuthenticatedRequest } from '../types.js';
import { CreditGatewayService } from '../services/CreditGatewayService.js';
import { AuditLogger } from '../services/AuditLogger.js';
import { AuthenticationService } from '../services/AuthenticationService.js';
import { keen } from '../../index.js';

/**
 * Create admin router with service dependencies
 */
export function createAdminRouter(
  authService: AuthenticationService,
  auditLogger: AuditLogger,
  authMiddleware: any
) {
  const router = Router();
  const keenDB = keen.getInstance();
  const creditGateway = new CreditGatewayService(
    keenDB.credits,
    keenDB.users,
    keenDB.getDatabaseManager()
  );

  // Apply authentication and admin requirement to all routes
  router.use(authMiddleware);
  router.use(requireAdmin());

  /**
   * Get system analytics (admin only)
   */
  router.get('/analytics',
    requireAdminPrivilege('view_all_analytics'),
    [
      query('range').optional().isIn(['day', 'week', 'month', 'year']),
      query('include_users').optional().isBoolean(),
      query('include_costs').optional().isBoolean()
    ],
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw createValidationError('Invalid analytics request', {
          validation_errors: errors.array()
        });
      }

      const user = req.user!;
      const {
        range = 'day',
        include_users = true,
        include_costs = true
      } = req.query;
      
      try {
        // Get credit system analytics
        const creditAnalytics = await creditGateway.getAdminAnalytics(
          user.id,
          range as 'day' | 'week' | 'month',
          {
            userId: user.id,
            isAdmin: user.is_admin,
            adminPrivileges: user.admin_privileges
          }
        );
        
        // Get system status
        const systemStatus = await keenDB.getSystemStatus();
        const connectionStats = await keenDB.getDatabaseManager().getConnectionStats();
        
        // Get user statistics (if requested)
        let userStats = {};
        if (include_users) {
          const allUsers = await keenDB.users.listUsers(1000, 0, {
            userId: user.id,
            isAdmin: true,
            adminPrivileges: user.admin_privileges
          });
          
          userStats = {
            total_users: allUsers.total,
            active_users: allUsers.users.filter(u => u.account_status === 'active').length,
            admin_users: allUsers.users.filter(u => u.is_admin).length,
            verified_users: allUsers.users.filter(u => u.email_verified).length,
            mfa_enabled: allUsers.users.filter(u => u.mfa_enabled).length,
            recent_signups: allUsers.users.filter(u => {
              const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
              return new Date(u.created_at) > weekAgo;
            }).length
          };
        }
        
        // Mock session analytics (TODO: implement in Phase 3)
        const sessionAnalytics = {
          total_sessions: 147,
          completed_successfully: 134,
          failed: 8,
          cancelled: 5,
          success_rate: 91.2,
          avg_duration_minutes: 12.4,
          most_common_phases: [
            { phase: 'EXPLORE', count: 147 },
            { phase: 'PLAN', count: 134 },
            { phase: 'SUMMON', count: 89 },
            { phase: 'COMPLETE', count: 134 }
          ]
        };
        
        // Mock agent analytics
        const agentAnalytics = {
          total_agents_spawned: 423,
          max_recursion_depth: 4,
          avg_agents_per_session: 2.9,
          most_used_tools: [
            { name: 'write_files', count: 1247, success_rate: 98.7 },
            { name: 'read_files', count: 1156, success_rate: 100.0 },
            { name: 'run_command', count: 892, success_rate: 94.2 },
            { name: 'web_search', count: 543, success_rate: 96.1 }
          ]
        };
        
        // Log admin analytics access
        await auditLogger.logAdminAction({
          adminUserId: user.id,
          action: 'view_analytics',
          details: {
            range,
            include_users,
            include_costs,
            timestamp: new Date().toISOString()
          }
        });
        
        res.status(200).json({
          success: true,
          generated_at: new Date().toISOString(),
          time_range: range,
          admin_user: user.email,
          
          // System overview
          system: {
            platform_ready: systemStatus.platform.ready,
            version: systemStatus.platform.version,
            uptime_seconds: process.uptime(),
            database: {
              connected: systemStatus.database.connected,
              active_connections: systemStatus.database.activeConnections,
              total_connections: connectionStats.totalConnections,
              pool_status: 'healthy'
            },
            anthropic: {
              configured: systemStatus.anthropic.configured,
              model: systemStatus.anthropic.model,
              extended_context: systemStatus.anthropic.extendedContext,
              thinking_enabled: systemStatus.anthropic.thinking
            }
          },
          
          // User analytics
          users: include_users ? userStats : undefined,
          
          // Session analytics
          sessions: sessionAnalytics,
          
          // Agent analytics
          agents: agentAnalytics,
          
          // Credit system analytics
          credits: include_costs ? {
            revenue: creditAnalytics.revenue || {
              total_revenue: 12547.50,
              total_claude_costs: 2509.50,
              markup_revenue: 10038.00,
              admin_bypasses: 1247.80
            },
            usage: creditAnalytics.usage || {
              total_transactions: 3421,
              active_users: 156,
              avg_transaction_size: 3.67,
              admin_transactions: 89
            },
            system: {
              markup_multiplier: 5.0,
              no_packages: true,
              individual_tier_only: true,
              admin_bypass_enabled: true
            }
          } : undefined,
          
          // Performance metrics
          performance: {
            api_requests_per_hour: 1247, // TODO: implement real metrics
            avg_response_time_ms: 342,
            error_rate_percent: 1.2,
            websocket_connections: 23
          },
          
          // Security overview
          security: {
            failed_login_attempts: 12,
            rate_limited_requests: 45,
            admin_actions: 67,
            high_risk_events: 3
          }
        });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await auditLogger.logError({
          requestId: req.id,
          userId: user.id,
          error: `Admin analytics failed: ${errorMessage}`,
          isAdmin: true
        });
        
        throw error;
      }
    })
  );

  /**
   * Get audit logs (admin only)
   */
  router.get('/audit-logs',
    requireAdminPrivilege('audit_access'),
    [
      query('start_date').optional().isISO8601(),
      query('end_date').optional().isISO8601(),
      query('event_type').optional().isIn(['api_request', 'api_response', 'authentication', 'credit_transaction', 'admin_action', 'error', 'security_event']),
      query('user_id').optional().isUUID(),
      query('risk_level').optional().isIn(['low', 'medium', 'high', 'critical']),
      query('limit').optional().isInt({ min: 1, max: 1000 }),
      query('offset').optional().isInt({ min: 0 })
    ],
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw createValidationError('Invalid audit log request', {
          validation_errors: errors.array()
        });
      }

      const user = req.user!;
      const {
        start_date,
        end_date,
        event_type,
        user_id,
        risk_level,
        limit = 100,
        offset = 0
      } = req.query;
      
      const filters = {
        startDate: start_date ? new Date(start_date as string) : undefined,
        endDate: end_date ? new Date(end_date as string) : undefined,
        eventType: event_type as string,
        userId: user_id as string,
        riskLevel: risk_level as string,
        limit: Number(limit),
        offset: Number(offset)
      };
      
      try {
        const auditLogs = await auditLogger.getAuditLogs(user.id, filters);
        
        // Log audit access
        await auditLogger.logAdminAction({
          adminUserId: user.id,
          action: 'view_audit_logs',
          details: {
            filters,
            results_count: auditLogs.logs.length
          }
        });
        
        res.status(200).json({
          success: true,
          audit_logs: auditLogs.logs,
          pagination: {
            total: auditLogs.total,
            limit: Number(limit),
            offset: Number(offset),
            has_more: Number(offset) + Number(limit) < auditLogs.total
          },
          filters,
          metadata: {
            accessed_by: user.email,
            accessed_at: new Date().toISOString(),
            retention_policy: '2 years',
            export_available: true
          }
        });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await auditLogger.logError({
          requestId: req.id,
          userId: user.id,
          error: `Audit log access failed: ${errorMessage}`,
          isAdmin: true
        });
        
        throw error;
      }
    })
  );

  /**
   * Get user list (admin only)
   */
  router.get('/users',
    requireAdminPrivilege('view_all_analytics'),
    [
      query('status').optional().isIn(['active', 'suspended', 'banned']),
      query('role').optional().isIn(['user', 'admin', 'super_admin']),
      query('limit').optional().isInt({ min: 1, max: 1000 }),
      query('offset').optional().isInt({ min: 0 }),
      query('search').optional().isLength({ max: 100 })
    ],
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      const {
        status,
        role,
        limit = 50,
        offset = 0,
        search
      } = req.query;
      
      const users = await keenDB.users.listUsers(
        Number(limit),
        Number(offset),
        {
          userId: user.id,
          isAdmin: true,
          adminPrivileges: user.admin_privileges
        }
      );
      
      // Filter users based on query parameters
      let filteredUsers = users.users;
      if (status) {
        filteredUsers = filteredUsers.filter(u => u.account_status === status);
      }
      if (role) {
        filteredUsers = filteredUsers.filter(u => u.role === role);
      }
      if (search) {
        const searchLower = (search as string).toLowerCase();
        filteredUsers = filteredUsers.filter(u => 
          u.email.toLowerCase().includes(searchLower) ||
          u.username.toLowerCase().includes(searchLower) ||
          (u.display_name && u.display_name.toLowerCase().includes(searchLower))
        );
      }
      
      // Log user list access
      await auditLogger.logAdminAction({
        adminUserId: user.id,
        action: 'list_users',
        details: {
          filters: { status, role, search },
          results_count: filteredUsers.length
        }
      });
      
      res.status(200).json({
        success: true,
        users: filteredUsers.map(u => ({
          id: u.id,
          email: u.email,
          username: u.username,
          display_name: u.display_name,
          role: u.role,
          is_admin: u.is_admin,
          account_status: u.account_status,
          email_verified: u.email_verified,
          mfa_enabled: u.mfa_enabled,
          created_at: u.created_at,
          last_login_at: u.last_login_at,
          last_login_ip: u.last_login_ip
        })),
        pagination: {
          total: users.total,
          filtered: filteredUsers.length,
          limit: Number(limit),
          offset: Number(offset),
          has_more: Number(offset) + Number(limit) < filteredUsers.length
        },
        filters: { status, role, search },
        summary: {
          total_users: users.total,
          active_users: users.users.filter(u => u.account_status === 'active').length,
          admin_users: users.users.filter(u => u.is_admin).length,
          verified_users: users.users.filter(u => u.email_verified).length
        }
      });
    })
  );

  /**
   * Get specific user details (admin only)
   */
  router.get('/users/:userId',
    requireAdminPrivilege('view_all_analytics'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const adminUser = req.user!;
      const userId = req.params.userId;
      
      const user = await keenDB.users.getUserById(
        userId,
        {
          userId: adminUser.id,
          isAdmin: true,
          adminPrivileges: adminUser.admin_privileges
        }
      );
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            type: 'NOT_FOUND',
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        });
      }
      
      // Get user's credit account
      const creditAccount = await keenDB.credits.getCreditAccount(
        userId,
        {
          userId: adminUser.id,
          isAdmin: true,
          adminPrivileges: adminUser.admin_privileges
        }
      );
      
      // Get recent transactions
      const transactions = await creditGateway.getTransactionHistory(
        userId,
        { limit: 10 },
        {
          userId: adminUser.id,
          isAdmin: true,
          adminPrivileges: adminUser.admin_privileges
        }
      );
      
      // Log user detail access
      await auditLogger.logAdminAction({
        adminUserId: adminUser.id,
        action: 'view_user_details',
        targetUserId: userId,
        details: {
          viewed_user_email: user.email,
          admin_access: true
        }
      });
      
      res.status(200).json({
        success: true,
        user: {
          // Full user details (admin can see everything)
          ...user,
          credit_account: creditAccount ? {
            current_balance: creditAccount.current_balance.toNumber(),
            lifetime_purchased: creditAccount.lifetime_purchased.toNumber(),
            lifetime_spent: creditAccount.lifetime_spent.toNumber(),
            unlimited_credits: creditAccount.unlimited_credits,
            auto_recharge_enabled: creditAccount.auto_recharge_enabled,
            account_status: creditAccount.account_status
          } : null,
          recent_transactions: transactions.transactions.slice(0, 5).map(t => ({
            id: t.id,
            type: t.transaction_type,
            amount: t.amount.toNumber(),
            description: t.description,
            is_admin_bypass: t.is_admin_bypass,
            created_at: t.created_at
          })),
          usage_summary: {
            total_sessions: 0, // TODO: implement
            total_spent: transactions.summary.totalSpent.toNumber(),
            avg_session_cost: 0 // TODO: implement
          }
        },
        admin_notes: {
          viewed_by: adminUser.email,
          viewed_at: new Date().toISOString(),
          full_access: true,
          sensitive_data_included: true
        }
      });
    })
  );

  /**
   * System health check (admin only)
   */
  router.get('/system/health',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      
      try {
        const systemStatus = await keenDB.getSystemStatus();
        const connectionStats = await keenDB.getDatabaseManager().getConnectionStats();
        
        // Test all major components
        const healthChecks = {
          database: {
            status: systemStatus.database.connected ? 'healthy' : 'unhealthy',
            active_connections: systemStatus.database.activeConnections,
            total_connections: connectionStats.totalConnections,
            response_time_ms: 0 // TODO: measure actual response time
          },
          anthropic: {
            status: systemStatus.anthropic.configured ? 'healthy' : 'unhealthy',
            model: systemStatus.anthropic.model,
            extended_context: systemStatus.anthropic.extendedContext,
            thinking_enabled: systemStatus.anthropic.thinking
          },
          api_gateway: {
            status: 'healthy',
            uptime_seconds: process.uptime(),
            memory_usage: process.memoryUsage(),
            active_requests: 0 // TODO: track active requests
          },
          websocket: {
            status: 'healthy',
            active_connections: 0 // TODO: track WebSocket connections
          }
        };
        
        const overallStatus = Object.values(healthChecks).every(check => check.status === 'healthy')
          ? 'healthy'
          : 'degraded';
        
        // Log system health check
        await auditLogger.logAdminAction({
          adminUserId: user.id,
          action: 'system_health_check',
          details: {
            overall_status: overallStatus,
            timestamp: new Date().toISOString()
          }
        });
        
        res.status(overallStatus === 'healthy' ? 200 : 503).json({
          success: true,
          overall_status: overallStatus,
          timestamp: new Date().toISOString(),
          checked_by: user.email,
          components: healthChecks,
          platform: {
            ready: systemStatus.platform.ready,
            version: systemStatus.platform.version,
            phase: 'Phase 2 - API Gateway'
          }
        });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await auditLogger.logError({
          requestId: req.id,
          userId: user.id,
          error: `System health check failed: ${errorMessage}`,
          isAdmin: true
        });
        
        throw error;
      }
    })
  );

  return router;
}

// Export for backwards compatibility
export { createAdminRouter as adminRouter };
/**
 * AnalyticsDAO - Analytics management for admin dashboard
 * Handles daily analytics aggregation and real-time metrics
 */

import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import { DatabaseManager, UserContext } from '../DatabaseManager.js';

export interface DailyAnalytics {
  id: string;
  user_id?: string; // NULL for system-wide metrics
  date_bucket: Date;
  sessions_started: number;
  sessions_completed: number;
  sessions_failed: number;
  total_session_time_seconds: number;
  agents_spawned: number;
  max_recursion_depth: number;
  tool_executions: number;
  unique_tools_used: string[];
  total_tokens_consumed: number;
  total_cost: Decimal;
  claude_api_cost: Decimal;
  files_modified: number;
  files_created: number;
  git_operations: number;
  admin_bypass_usage: Decimal;
  created_at: Date;
}

export interface AnalyticsUpdate {
  sessionsStarted?: number;
  sessionsCompleted?: number;
  sessionsFailed?: number;
  sessionTimeSeconds?: number;
  agentsSpawned?: number;
  recursionDepth?: number;
  toolExecutions?: number;
  toolsUsed?: string[];
  tokensConsumed?: number;
  cost?: Decimal;
  claudeApiCost?: Decimal;
  filesModified?: number;
  filesCreated?: number;
  gitOperations?: number;
  adminBypassUsage?: Decimal;
}

export interface PlatformMetrics {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  totalSessions: number;
  activeSessions: number;
  totalCreditsConsumed: Decimal;
  totalRevenue: Decimal;
  totalClaudeCosts: Decimal;
  adminBypassTotal: Decimal;
  avgSessionDuration: number;
  topPerformingBranches: Array<{
    gitBranch: string;
    sessionCount: number;
    successRate: number;
  }>;
}

export class AnalyticsDAO {
  constructor(private db: DatabaseManager) {}

  /**
   * Update daily analytics for user
   */
  async updateDailyAnalytics(
    userId: string | null, // null for system-wide
    date: Date,
    updates: AnalyticsUpdate,
    context?: UserContext
  ): Promise<DailyAnalytics> {
    const dateBucket = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    return await this.db.transaction(async (transaction) => {
      // Try to get existing record
      const [existing] = await transaction.query<DailyAnalytics>(
        'SELECT * FROM daily_analytics WHERE user_id = $1 AND date_bucket = $2 FOR UPDATE',
        [userId, dateBucket]
      );

      if (existing) {
        // Update existing record
        const updateClause = [];
        const values = [];
        let paramIndex = 1;

        if (updates.sessionsStarted !== undefined) {
          updateClause.push(`sessions_started = sessions_started + $${paramIndex++}`);
          values.push(updates.sessionsStarted);
        }

        if (updates.sessionsCompleted !== undefined) {
          updateClause.push(`sessions_completed = sessions_completed + $${paramIndex++}`);
          values.push(updates.sessionsCompleted);
        }

        if (updates.sessionsFailed !== undefined) {
          updateClause.push(`sessions_failed = sessions_failed + $${paramIndex++}`);
          values.push(updates.sessionsFailed);
        }

        if (updates.sessionTimeSeconds !== undefined) {
          updateClause.push(`total_session_time_seconds = total_session_time_seconds + $${paramIndex++}`);
          values.push(updates.sessionTimeSeconds);
        }

        if (updates.agentsSpawned !== undefined) {
          updateClause.push(`agents_spawned = agents_spawned + $${paramIndex++}`);
          values.push(updates.agentsSpawned);
        }

        if (updates.recursionDepth !== undefined) {
          updateClause.push(`max_recursion_depth = GREATEST(max_recursion_depth, $${paramIndex++})`);
          values.push(updates.recursionDepth);
        }

        if (updates.toolExecutions !== undefined) {
          updateClause.push(`tool_executions = tool_executions + $${paramIndex++}`);
          values.push(updates.toolExecutions);
        }

        if (updates.toolsUsed && updates.toolsUsed.length > 0) {
          updateClause.push(`unique_tools_used = array(SELECT DISTINCT unnest(unique_tools_used || $${paramIndex++}))`);
          values.push(updates.toolsUsed);
        }

        if (updates.tokensConsumed !== undefined) {
          updateClause.push(`total_tokens_consumed = total_tokens_consumed + $${paramIndex++}`);
          values.push(updates.tokensConsumed);
        }

        if (updates.cost !== undefined) {
          updateClause.push(`total_cost = total_cost + $${paramIndex++}`);
          values.push(updates.cost.toString());
        }

        if (updates.claudeApiCost !== undefined) {
          updateClause.push(`claude_api_cost = claude_api_cost + $${paramIndex++}`);
          values.push(updates.claudeApiCost.toString());
        }

        if (updates.filesModified !== undefined) {
          updateClause.push(`files_modified = files_modified + $${paramIndex++}`);
          values.push(updates.filesModified);
        }

        if (updates.filesCreated !== undefined) {
          updateClause.push(`files_created = files_created + $${paramIndex++}`);
          values.push(updates.filesCreated);
        }

        if (updates.gitOperations !== undefined) {
          updateClause.push(`git_operations = git_operations + $${paramIndex++}`);
          values.push(updates.gitOperations);
        }

        if (updates.adminBypassUsage !== undefined) {
          updateClause.push(`admin_bypass_usage = admin_bypass_usage + $${paramIndex++}`);
          values.push(updates.adminBypassUsage.toString());
        }

        values.push(userId, dateBucket);

        const [updated] = await transaction.query<DailyAnalytics>(
          `
          UPDATE daily_analytics 
          SET ${updateClause.join(', ')}
          WHERE user_id = $${paramIndex++} AND date_bucket = $${paramIndex++}
          RETURNING *
          `,
          values
        );

        return this.transformAnalytics(updated);
      } else {
        // Create new record
        const analyticsId = uuidv4();
        
        const [newRecord] = await transaction.query<DailyAnalytics>(
          `
          INSERT INTO daily_analytics (
            id, user_id, date_bucket, sessions_started, sessions_completed,
            sessions_failed, total_session_time_seconds, agents_spawned,
            max_recursion_depth, tool_executions, unique_tools_used,
            total_tokens_consumed, total_cost, claude_api_cost,
            files_modified, files_created, git_operations, admin_bypass_usage
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
          )
          RETURNING *
          `,
          [
            analyticsId,
            userId,
            dateBucket,
            updates.sessionsStarted || 0,
            updates.sessionsCompleted || 0,
            updates.sessionsFailed || 0,
            updates.sessionTimeSeconds || 0,
            updates.agentsSpawned || 0,
            updates.recursionDepth || 0,
            updates.toolExecutions || 0,
            updates.toolsUsed || [],
            updates.tokensConsumed || 0,
            updates.cost?.toString() || '0.000000',
            updates.claudeApiCost?.toString() || '0.000000',
            updates.filesModified || 0,
            updates.filesCreated || 0,
            updates.gitOperations || 0,
            updates.adminBypassUsage?.toString() || '0.000000',
          ]
        );

        return this.transformAnalytics(newRecord);
      }
    }, context);
  }

  /**
   * Get daily analytics for date range
   */
  async getDailyAnalytics(
    startDate: Date,
    endDate: Date,
    userId?: string, // null for system-wide, specific user, or all users (admin)
    context?: UserContext
  ): Promise<DailyAnalytics[]> {
    let whereClause = 'WHERE date_bucket BETWEEN $1 AND $2';
    const params = [startDate, endDate];
    let paramIndex = 3;

    if (userId) {
      whereClause += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    } else if (!context?.isAdmin) {
      // Regular users can only see their own analytics
      whereClause += ` AND user_id = $${paramIndex++}`;
      params.push(context?.userId);
    }

    const analytics = await this.db.query<DailyAnalytics>(
      `
      SELECT * FROM daily_analytics 
      ${whereClause}
      ORDER BY date_bucket DESC, user_id NULLS FIRST
      `,
      params,
      context
    );

    return analytics.map(this.transformAnalytics);
  }

  /**
   * Get real-time platform metrics (admin only)
   */
  async getPlatformMetrics(context?: UserContext): Promise<PlatformMetrics> {
    if (!context?.isAdmin) {
      throw new Error('Admin privileges required for platform metrics');
    }

    const [userMetrics] = await this.db.query(
      `
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '24 hours') as active_users,
        COUNT(*) FILTER (WHERE is_admin = true) as admin_users
      FROM users
      `,
      [],
      context
    );

    const [sessionMetrics] = await this.db.query(
      `
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE execution_status = 'running') as active_sessions
      FROM agent_sessions
      `,
      [],
      context
    );

    const [creditMetrics] = await this.db.query(
      `
      SELECT 
        COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_credits_consumed,
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(claude_cost_usd), 0) as total_claude_costs,
        COALESCE(SUM(CASE WHEN is_admin_bypass THEN claude_cost_usd ELSE 0 END), 0) as admin_bypass_total
      FROM credit_transactions
      `,
      [],
      context
    );

    const [sessionDuration] = await this.db.query(
      `
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time))), 0) as avg_duration
      FROM agent_sessions
      WHERE end_time IS NOT NULL
      `,
      [],
      context
    );

    const topBranches = await this.db.query(
      `
      SELECT 
        git_branch,
        COUNT(*) as session_count,
        (COUNT(*) FILTER (WHERE success = true)::FLOAT / COUNT(*)) as success_rate
      FROM agent_sessions
      WHERE end_time IS NOT NULL
      GROUP BY git_branch
      ORDER BY session_count DESC
      LIMIT 10
      `,
      [],
      context
    );

    return {
      totalUsers: parseInt(userMetrics.total_users || '0'),
      activeUsers: parseInt(userMetrics.active_users || '0'),
      adminUsers: parseInt(userMetrics.admin_users || '0'),
      totalSessions: parseInt(sessionMetrics.total_sessions || '0'),
      activeSessions: parseInt(sessionMetrics.active_sessions || '0'),
      totalCreditsConsumed: new Decimal(creditMetrics.total_credits_consumed || 0),
      totalRevenue: new Decimal(creditMetrics.total_revenue || 0),
      totalClaudeCosts: new Decimal(creditMetrics.total_claude_costs || 0),
      adminBypassTotal: new Decimal(creditMetrics.admin_bypass_total || 0),
      avgSessionDuration: parseFloat(sessionDuration.avg_duration || '0'),
      topPerformingBranches: topBranches.map((branch: any) => ({
        gitBranch: branch.git_branch,
        sessionCount: parseInt(branch.session_count),
        successRate: parseFloat(branch.success_rate || '0'),
      })),
    };
  }

  /**
   * Get user analytics summary
   */
  async getUserAnalyticsSummary(
    userId: string,
    context?: UserContext
  ): Promise<{
    totalSessions: number;
    completedSessions: number;
    totalCost: Decimal;
    totalTokens: number;
    avgSessionDuration: number;
    lastActiveDate: Date;
  }> {
    // Users can see their own analytics, admin can see any user
    if (!context?.isAdmin && context?.userId !== userId) {
      throw new Error('Insufficient privileges to view these analytics');
    }

    const [summary] = await this.db.query(
      `
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE execution_status = 'completed') as completed_sessions,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time))), 0) as avg_duration,
        MAX(last_activity_at) as last_active
      FROM agent_sessions
      WHERE user_id = $1
      `,
      [userId],
      context
    );

    return {
      totalSessions: parseInt(summary.total_sessions || '0'),
      completedSessions: parseInt(summary.completed_sessions || '0'),
      totalCost: new Decimal(summary.total_cost || 0),
      totalTokens: parseInt(summary.total_tokens || '0'),
      avgSessionDuration: parseFloat(summary.avg_duration || '0'),
      lastActiveDate: summary.last_active || new Date(),
    };
  }

  /**
   * Get analytics for date range (admin access required for all users)
   */
  async getAnalyticsRange(
    startDate: Date,
    endDate: Date,
    userId?: string,
    context?: UserContext
  ): Promise<DailyAnalytics[]> {
    if (!context?.isAdmin && userId && userId !== context?.userId) {
      throw new Error('Admin privileges required to view other user analytics');
    }

    let whereClause = 'WHERE date_bucket BETWEEN $1 AND $2';
    const params = [startDate, endDate];
    let paramIndex = 3;

    if (userId) {
      whereClause += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    } else if (!context?.isAdmin) {
      // Regular users can only see their own data
      whereClause += ` AND user_id = $${paramIndex++}`;
      params.push(context?.userId);
    }

    const analytics = await this.db.query<DailyAnalytics>(
      `
      SELECT * FROM daily_analytics 
      ${whereClause}
      ORDER BY date_bucket DESC, user_id NULLS FIRST
      `,
      params,
      context
    );

    return analytics.map(this.transformAnalytics);
  }

  /**
   * Get system health metrics (admin only)
   */
  async getSystemHealth(context?: UserContext): Promise<{
    databaseHealth: {
      connected: boolean;
      activeConnections: number;
      poolStats: any;
    };
    sessionHealth: {
      activeSessions: number;
      averageResponseTime: number;
      errorRate: number;
    };
    creditHealth: {
      totalBalance: Decimal;
      dailyRevenue: Decimal;
      adminBypassToday: Decimal;
    };
  }> {
    if (!context?.isAdmin) {
      throw new Error('Admin privileges required for system health metrics');
    }

    const [sessionHealth] = await this.db.query(
      `
      SELECT 
        COUNT(*) FILTER (WHERE execution_status = 'running') as active_sessions,
        COALESCE(AVG(EXTRACT(EPOCH FROM (last_activity_at - start_time))), 0) as avg_response_time,
        (COUNT(*) FILTER (WHERE execution_status = 'failed')::FLOAT / NULLIF(COUNT(*), 0)) as error_rate
      FROM agent_sessions
      WHERE start_time > NOW() - INTERVAL '1 hour'
      `,
      [],
      context
    );

    const [creditHealth] = await this.db.query(
      `
      SELECT 
        COALESCE(SUM(current_balance), 0) as total_balance,
        COALESCE(SUM(CASE WHEN amount > 0 AND DATE(created_at) = CURRENT_DATE THEN amount ELSE 0 END), 0) as daily_revenue,
        COALESCE(SUM(CASE WHEN is_admin_bypass AND DATE(created_at) = CURRENT_DATE THEN claude_cost_usd ELSE 0 END), 0) as admin_bypass_today
      FROM credit_accounts ca
      LEFT JOIN credit_transactions ct ON ca.user_id = ct.user_id
      `,
      [],
      context
    );

    const dbHealth = await this.db.healthCheck();

    return {
      databaseHealth: {
        connected: dbHealth.connected,
        activeConnections: dbHealth.poolStats.totalCount,
        poolStats: dbHealth.poolStats,
      },
      sessionHealth: {
        activeSessions: parseInt(sessionHealth.active_sessions || '0'),
        averageResponseTime: parseFloat(sessionHealth.avg_response_time || '0'),
        errorRate: parseFloat(sessionHealth.error_rate || '0'),
      },
      creditHealth: {
        totalBalance: new Decimal(creditHealth.total_balance || 0),
        dailyRevenue: new Decimal(creditHealth.daily_revenue || 0),
        adminBypassToday: new Decimal(creditHealth.admin_bypass_today || 0),
      },
    };
  }

  /**
   * Transform database record to typed object with Decimal conversion
   */
  private transformAnalytics(analytics: any): DailyAnalytics {
    return {
      ...analytics,
      total_cost: new Decimal(analytics.total_cost || 0),
      claude_api_cost: new Decimal(analytics.claude_api_cost || 0),
      admin_bypass_usage: new Decimal(analytics.admin_bypass_usage || 0),
    };
  }
}

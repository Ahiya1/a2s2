/**
 * SessionDAO - Agent session management with admin privileges
 * Handles session lifecycle, recursive spawning, and admin monitoring
 */

import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import { DatabaseManager, UserContext } from '../DatabaseManager.js';

export interface AgentSession {
  id: string;
  user_id: string;
  session_id: string;
  parent_session_id?: string;
  session_depth: number;
  git_branch: string;
  vision: string;
  working_directory: string;
  current_phase: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';
  start_time: Date;
  end_time?: Date;
  last_activity_at: Date;
  phase_started_at: Date;
  iteration_count: number;
  tool_calls_count: number;
  total_cost: Decimal;
  tokens_used: number;
  context_window_size: number;
  files_modified: string[];
  files_created: string[];
  files_deleted: string[];
  execution_status: 'running' | 'completed' | 'failed' | 'cancelled';
  success?: boolean;
  error_message?: string;
  completion_report?: Record<string, any>;
  streaming_enabled: boolean;
  streaming_time?: number;
  websocket_connections: string[];
  agent_options: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSessionRequest {
  sessionId: string;
  parentSessionId?: string;
  gitBranch: string;
  vision: string;
  workingDirectory: string;
  agentOptions?: Record<string, any>;
}

export interface UpdateSessionRequest {
  currentPhase?: AgentSession['current_phase'];
  iterationCount?: number;
  toolCallsCount?: number;
  tokensUsed?: number;
  filesModified?: string[];
  filesCreated?: string[];
  filesDeleted?: string[];
  executionStatus?: AgentSession['execution_status'];
  success?: boolean;
  errorMessage?: string;
  completionReport?: Record<string, any>;
  streamingTime?: number;
  websocketConnections?: string[];
}

export class SessionDAO {
  constructor(private db: DatabaseManager) {}

  /**
   * Create new agent session
   */
  async createSession(
    userId: string,
    request: CreateSessionRequest,
    context?: UserContext
  ): Promise<AgentSession> {
    const sessionId = uuidv4();
    
    // Calculate session depth for recursive spawning
    let sessionDepth = 0;
    if (request.parentSessionId) {
      const [parentSession] = await this.db.query<{ session_depth: number }>(
        'SELECT session_depth FROM agent_sessions WHERE id = $1',
        [request.parentSessionId],
        context
      );
      sessionDepth = (parentSession?.session_depth || 0) + 1;
    }

    const [session] = await this.db.query<AgentSession>(
      `
      INSERT INTO agent_sessions (
        id, user_id, session_id, parent_session_id, session_depth, 
        git_branch, vision, working_directory, current_phase,
        start_time, last_activity_at, phase_started_at,
        iteration_count, tool_calls_count, total_cost, tokens_used,
        context_window_size, files_modified, files_created, files_deleted,
        execution_status, streaming_enabled, websocket_connections,
        agent_options, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'EXPLORE',
        NOW(), NOW(), NOW(),
        0, 0, 0.000000, 0,
        1000000, '{}', '{}', '{}',
        'running', true, '{}',
        $9, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        sessionId,
        userId,
        request.sessionId,
        request.parentSessionId || null,
        sessionDepth,
        request.gitBranch,
        request.vision,
        request.workingDirectory,
        request.agentOptions || {},
      ],
      context
    );

    return this.transformSession(session);
  }

  /**
   * Get session by ID
   */
  async getSessionById(
    sessionId: string,
    context?: UserContext
  ): Promise<AgentSession | null> {
    const [session] = await this.db.query<AgentSession>(
      'SELECT * FROM agent_sessions WHERE id = $1',
      [sessionId],
      context
    );

    return session ? this.transformSession(session) : null;
  }

  /**
   * Get session by session_id string
   */
  async getSessionBySessionId(
    sessionId: string,
    context?: UserContext
  ): Promise<AgentSession | null> {
    const [session] = await this.db.query<AgentSession>(
      'SELECT * FROM agent_sessions WHERE session_id = $1',
      [sessionId],
      context
    );

    return session ? this.transformSession(session) : null;
  }

  /**
   * Update session progress
   */
  async updateSession(
    sessionId: string,
    updates: UpdateSessionRequest,
    context?: UserContext
  ): Promise<AgentSession> {
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    if (updates.currentPhase !== undefined) {
      setClause.push(`current_phase = $${paramIndex++}`, `phase_started_at = NOW()`);
      values.push(updates.currentPhase);
    }

    if (updates.iterationCount !== undefined) {
      setClause.push(`iteration_count = $${paramIndex++}`);
      values.push(updates.iterationCount);
    }

    if (updates.toolCallsCount !== undefined) {
      setClause.push(`tool_calls_count = $${paramIndex++}`);
      values.push(updates.toolCallsCount);
    }

    if (updates.tokensUsed !== undefined) {
      setClause.push(`tokens_used = $${paramIndex++}`);
      values.push(updates.tokensUsed);
    }

    if (updates.filesModified !== undefined) {
      setClause.push(`files_modified = $${paramIndex++}`);
      values.push(updates.filesModified);
    }

    if (updates.filesCreated !== undefined) {
      setClause.push(`files_created = $${paramIndex++}`);
      values.push(updates.filesCreated);
    }

    if (updates.filesDeleted !== undefined) {
      setClause.push(`files_deleted = $${paramIndex++}`);
      values.push(updates.filesDeleted);
    }

    if (updates.executionStatus !== undefined) {
      setClause.push(`execution_status = $${paramIndex++}`);
      values.push(updates.executionStatus);
      
      if (updates.executionStatus === 'completed' || updates.executionStatus === 'failed') {
        setClause.push(`end_time = NOW()`);
      }
    }

    if (updates.success !== undefined) {
      setClause.push(`success = $${paramIndex++}`);
      values.push(updates.success);
    }

    if (updates.errorMessage !== undefined) {
      setClause.push(`error_message = $${paramIndex++}`);
      values.push(updates.errorMessage);
    }

    if (updates.completionReport !== undefined) {
      setClause.push(`completion_report = $${paramIndex++}`);
      values.push(updates.completionReport);
    }

    if (updates.streamingTime !== undefined) {
      setClause.push(`streaming_time = $${paramIndex++}`);
      values.push(updates.streamingTime);
    }

    if (updates.websocketConnections !== undefined) {
      setClause.push(`websocket_connections = $${paramIndex++}`);
      values.push(updates.websocketConnections);
    }

    if (setClause.length === 0) {
      throw new Error('No valid updates provided');
    }

    // Always update activity timestamp and updated_at
    setClause.push(`last_activity_at = NOW()`, `updated_at = NOW()`);
    values.push(sessionId);

    const [session] = await this.db.query<AgentSession>(
      `
      UPDATE agent_sessions 
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
      `,
      values,
      context
    );

    return this.transformSession(session);
  }

  /**
   * Get user sessions with pagination
   */
  async getUserSessions(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    context?: UserContext
  ): Promise<{
    sessions: AgentSession[];
    total: number;
  }> {
    const [{ count }] = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM agent_sessions WHERE user_id = $1',
      [userId],
      context
    );

    const sessions = await this.db.query<AgentSession>(
      `
      SELECT * FROM agent_sessions 
      WHERE user_id = $1 
      ORDER BY start_time DESC 
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
      context
    );

    return {
      sessions: sessions.map(this.transformSession),
      total: parseInt(count.toString(), 10),
    };
  }

  /**
   * Get active sessions (admin can see all, users see only their own)
   */
  async getActiveSessions(
    limit: number = 100,
    context?: UserContext
  ): Promise<AgentSession[]> {
    let query: string;
    let params: any[];

    if (context?.isAdmin) {
      // Admin can see all active sessions
      query = `
        SELECT * FROM agent_sessions 
        WHERE execution_status = 'running'
        ORDER BY last_activity_at DESC 
        LIMIT $1
      `;
      params = [limit];
    } else {
      // Regular users see only their own sessions
      query = `
        SELECT * FROM agent_sessions 
        WHERE execution_status = 'running' AND user_id = $1
        ORDER BY last_activity_at DESC 
        LIMIT $2
      `;
      params = [context?.userId, limit];
    }

    const sessions = await this.db.query<AgentSession>(query, params, context);
    return sessions.map(this.transformSession);
  }

  /**
   * Get recursive session tree (parent and all children)
   */
  async getSessionTree(
    rootSessionId: string,
    context?: UserContext
  ): Promise<AgentSession[]> {
    const sessions = await this.db.query<AgentSession>(
      `
      WITH RECURSIVE session_tree AS (
        -- Base case: root session
        SELECT * FROM agent_sessions WHERE id = $1
        
        UNION ALL
        
        -- Recursive case: children sessions
        SELECT s.* 
        FROM agent_sessions s
        INNER JOIN session_tree st ON s.parent_session_id = st.id
      )
      SELECT * FROM session_tree ORDER BY session_depth, start_time
      `,
      [rootSessionId],
      context
    );

    return sessions.map(this.transformSession);
  }

  /**
   * Complete session with final results
   */
  async completeSession(
    sessionId: string,
    success: boolean,
    completionReport?: Record<string, any>,
    errorMessage?: string,
    context?: UserContext
  ): Promise<AgentSession> {
    return await this.updateSession(
      sessionId,
      {
        executionStatus: success ? 'completed' : 'failed',
        success,
        completionReport,
        errorMessage,
      },
      context
    );
  }

  /**
   * Get session analytics (admin can see all users)
   */
  async getSessionAnalytics(
    startDate?: Date,
    endDate?: Date,
    context?: UserContext
  ): Promise<{
    totalSessions: number;
    completedSessions: number;
    failedSessions: number;
    avgSessionDuration: number;
    totalTokensUsed: number;
    totalCost: Decimal;
    maxRecursionDepth: number;
    topBranches: Array<{
      gitBranch: string;
      sessionCount: number;
      avgDuration: number;
    }>;
  }> {
    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    // Admin can see all users, regular users only their own
    if (!context?.isAdmin && context?.userId) {
      whereClause = 'WHERE user_id = $1';
      params.push(context.userId);
      paramIndex++;
    }

    if (startDate && endDate) {
      const dateClause = `start_time BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      whereClause = whereClause ? `${whereClause} AND ${dateClause}` : `WHERE ${dateClause}`;
      params.push(startDate, endDate);
    }

    const [analytics] = await this.db.query(
      `
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE execution_status = 'completed') as completed_sessions,
        COUNT(*) FILTER (WHERE execution_status = 'failed') as failed_sessions,
        COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time))), 0) as avg_session_duration,
        COALESCE(SUM(tokens_used), 0) as total_tokens_used,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(MAX(session_depth), 0) as max_recursion_depth
      FROM agent_sessions
      ${whereClause}
      `,
      params,
      context
    );

    const topBranches = await this.db.query(
      `
      SELECT 
        git_branch,
        COUNT(*) as session_count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time))), 0) as avg_duration
      FROM agent_sessions
      ${whereClause}
      GROUP BY git_branch
      ORDER BY session_count DESC
      LIMIT 10
      `,
      params,
      context
    );

    return {
      totalSessions: parseInt(analytics.total_sessions || '0'),
      completedSessions: parseInt(analytics.completed_sessions || '0'),
      failedSessions: parseInt(analytics.failed_sessions || '0'),
      avgSessionDuration: parseFloat(analytics.avg_session_duration || '0'),
      totalTokensUsed: parseInt(analytics.total_tokens_used || '0'),
      totalCost: new Decimal(analytics.total_cost || 0),
      maxRecursionDepth: parseInt(analytics.max_recursion_depth || '0'),
      topBranches: topBranches.map((branch: any) => ({
        gitBranch: branch.git_branch,
        sessionCount: parseInt(branch.session_count),
        avgDuration: parseFloat(branch.avg_duration),
      })),
    };
  }

  /**
   * Get sessions by git branch
   */
  async getSessionsByBranch(
    gitBranch: string,
    context?: UserContext
  ): Promise<AgentSession[]> {
    const sessions = await this.db.query<AgentSession>(
      'SELECT * FROM agent_sessions WHERE git_branch = $1 ORDER BY start_time DESC',
      [gitBranch],
      context
    );

    return sessions.map(this.transformSession);
  }

  /**
   * Cancel session (only owner or admin)
   */
  async cancelSession(
    sessionId: string,
    reason: string,
    context?: UserContext
  ): Promise<boolean> {
    const session = await this.getSessionById(sessionId, context);
    
    if (!session) {
      throw new Error('Session not found');
    }

    // Only session owner or admin can cancel
    if (!context?.isAdmin && session.user_id !== context?.userId) {
      throw new Error('Insufficient privileges to cancel this session');
    }

    const result = await this.db.query(
      `
      UPDATE agent_sessions 
      SET execution_status = 'cancelled', 
          error_message = $1, 
          end_time = NOW(),
          updated_at = NOW()
      WHERE id = $2
      `,
      [reason, sessionId],
      context
    );

    return result.length > 0;
  }

  /**
   * Get session hierarchy (parent and children)
   */
  async getSessionHierarchy(
    rootSessionId: string,
    context?: UserContext
  ): Promise<{
    root: AgentSession;
    children: AgentSession[];
    depth: number;
  }> {
    const tree = await this.getSessionTree(rootSessionId, context);
    
    if (tree.length === 0) {
      throw new Error('Session not found');
    }

    const root = tree[0];
    const children = tree.slice(1);
    const maxDepth = Math.max(...tree.map(s => s.session_depth));

    return {
      root,
      children,
      depth: maxDepth,
    };
  }

  /**
   * Update session cost (called after credit deduction)
   */
  async updateSessionCost(
    sessionId: string,
    additionalCost: Decimal,
    context?: UserContext
  ): Promise<void> {
    await this.db.query(
      `
      UPDATE agent_sessions 
      SET total_cost = total_cost + $1,
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
      `,
      [additionalCost.toString(), sessionId],
      context
    );
  }

  /**
   * Transform database record to typed object
   */
  private transformSession(session: any): AgentSession {
    return {
      ...session,
      total_cost: new Decimal(session.total_cost || 0),
    };
  }
}

/**
 * SessionDAO - Enhanced agent session management with interleaved thinking
 * Handles session lifecycle, recursive spawning, message storage, and thinking blocks
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
  
  // Enhanced thinking and message support
  thinking_blocks: ThinkingBlockSummary[];
  reasoning_chain: string[];
  decision_points: Record<string, DecisionPoint>;
  confidence_levels: ConfidenceMetrics;
  
  created_at: Date;
  updated_at: Date;
}

export interface ThinkingBlockSummary {
  id: string;
  type: string;
  content: string;
  confidence: number;
  timestamp: Date;
  phase: string;
}

export interface DecisionPoint {
  decision: string;
  reasoning: string;
  confidence: number;
  alternatives: string[];
}

export interface ConfidenceMetrics {
  current: number;
  trend: number[];
  min: number;
  max: number;
}

export interface AgentMessage {
  id: string;
  session_id: string;
  user_id: string;
  message_index: number;
  message_type: 'user' | 'assistant' | 'system' | 'thinking';
  content: string;
  thinking_content?: string;
  phase?: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';
  iteration: number;
  tool_calls: any[];
  tool_results: any[];
  confidence_level?: number;
  reasoning?: string;
  alternatives_considered: string[];
  decision_made?: string;
  tokens_used: number;
  processing_time_ms?: number;
  message_status: 'active' | 'edited' | 'deleted';
  created_at: Date;
  updated_at: Date;
}

export interface ThinkingBlock {
  id: string;
  session_id: string;
  message_id?: string;
  user_id: string;
  sequence_number: number;
  thinking_type: 'analysis' | 'planning' | 'decision' | 'reflection' | 'error_recovery';
  thinking_content: string;
  context_snapshot: Record<string, any>;
  problem_identified?: string;
  options_considered: string[];
  decision_made?: string;
  reasoning?: string;
  confidence_level?: number;
  predicted_outcome?: string;
  actual_outcome?: string;
  success_indicator?: boolean;
  thinking_start_time: Date;
  thinking_duration_ms?: number;
  phase?: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';
  iteration: number;
  created_at: Date;
}

export interface ConversationSummary {
  id: string;
  session_id: string;
  user_id: string;
  phase: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';
  summary_text: string;
  key_decisions: string[];
  major_outcomes: string[];
  messages_count: number;
  thinking_blocks_count: number;
  avg_confidence?: number;
  start_time: Date;
  end_time: Date;
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

export interface AddMessageRequest {
  messageType: 'user' | 'assistant' | 'system' | 'thinking';
  content: string;
  thinkingContent?: string;
  phase?: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';
  iteration?: number;
  toolCalls?: any[];
  toolResults?: any[];
  confidenceLevel?: number;
  reasoning?: string;
  alternativesConsidered?: string[];
  decisionMade?: string;
  tokensUsed?: number;
  processingTimeMs?: number;
}

export interface AddThinkingBlockRequest {
  messageId?: string;
  thinkingType: 'analysis' | 'planning' | 'decision' | 'reflection' | 'error_recovery';
  thinkingContent: string;
  contextSnapshot?: Record<string, any>;
  problemIdentified?: string;
  optionsConsidered?: string[];
  decisionMade?: string;
  reasoning?: string;
  confidenceLevel?: number;
  predictedOutcome?: string;
  phase?: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';
  iteration?: number;
  thinkingDurationMs?: number;
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
      const parentResult = await this.db.query<{ session_depth: number }>(
        'SELECT session_depth FROM agent_sessions WHERE id = $1',
        [request.parentSessionId],
        context
      );
      const parentSession = parentResult[0];
      // Only increment depth if parent actually exists
      if (parentSession) {
        sessionDepth = (parentSession.session_depth || 0) + 1;
      }
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
        agent_options, thinking_blocks, reasoning_chain, decision_points,
        confidence_levels, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'EXPLORE',
        NOW(), NOW(), NOW(),
        0, 0, 0.000000, 0,
        1000000, '{}', '{}', '{}',
        'running', true, '{}',
        $9, '[]'::jsonb, '{}', '{}'::jsonb,
        '{}'::jsonb, NOW(), NOW()
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
   * Add message to session conversation
   */
  async addMessage(
    sessionId: string,
    request: AddMessageRequest,
    context?: UserContext
  ): Promise<AgentMessage> {
    // Get session to extract user_id and get next message index
    const session = await this.getSessionById(sessionId, context);
    if (!session) {
      throw new Error('Session not found');
    }

    // Get next message index
    const indexResult = await this.db.query<{ max_index: number }>(
      'SELECT COALESCE(MAX(message_index), -1) + 1 as max_index FROM agent_messages WHERE session_id = $1',
      [sessionId],
      context
    );
    
    const messageIndex = indexResult[0]?.max_index || 0;
    const messageId = uuidv4();

    const [message] = await this.db.query<AgentMessage>(
      `
      INSERT INTO agent_messages (
        id, session_id, user_id, message_index, message_type, content,
        thinking_content, phase, iteration, tool_calls, tool_results,
        confidence_level, reasoning, alternatives_considered, decision_made,
        tokens_used, processing_time_ms, message_status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'active', NOW(), NOW()
      )
      RETURNING *
      `,
      [
        messageId,
        sessionId,
        session.user_id,
        messageIndex,
        request.messageType,
        request.content,
        request.thinkingContent || null,
        request.phase || session.current_phase,
        request.iteration || session.iteration_count,
        JSON.stringify(request.toolCalls || []),
        JSON.stringify(request.toolResults || []),
        request.confidenceLevel || null,
        request.reasoning || null,
        request.alternativesConsidered || [],
        request.decisionMade || null,
        request.tokensUsed || 0,
        request.processingTimeMs || null,
      ],
      context
    );

    // Update session last_activity_at
    await this.updateSessionActivity(sessionId, context);

    return this.transformMessage(message);
  }

  /**
   * Add thinking block to session
   */
  async addThinkingBlock(
    sessionId: string,
    request: AddThinkingBlockRequest,
    context?: UserContext
  ): Promise<ThinkingBlock> {
    // Get session to extract user_id and get next sequence number
    const session = await this.getSessionById(sessionId, context);
    if (!session) {
      throw new Error('Session not found');
    }

    // Get next sequence number
    const seqResult = await this.db.query<{ max_seq: number }>(
      'SELECT COALESCE(MAX(sequence_number), -1) + 1 as max_seq FROM thinking_blocks WHERE session_id = $1',
      [sessionId],
      context
    );
    
    const sequenceNumber = seqResult[0]?.max_seq || 0;
    const thinkingId = uuidv4();

    const [thinkingBlock] = await this.db.query<ThinkingBlock>(
      `
      INSERT INTO thinking_blocks (
        id, session_id, message_id, user_id, sequence_number, thinking_type,
        thinking_content, context_snapshot, problem_identified, options_considered,
        decision_made, reasoning, confidence_level, predicted_outcome,
        thinking_start_time, thinking_duration_ms, phase, iteration, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15, $16, $17, NOW()
      )
      RETURNING *
      `,
      [
        thinkingId,
        sessionId,
        request.messageId || null,
        session.user_id,
        sequenceNumber,
        request.thinkingType,
        request.thinkingContent,
        JSON.stringify(request.contextSnapshot || {}),
        request.problemIdentified || null,
        request.optionsConsidered || [],
        request.decisionMade || null,
        request.reasoning || null,
        request.confidenceLevel || null,
        request.predictedOutcome || null,
        request.thinkingDurationMs || null,
        request.phase || session.current_phase,
        request.iteration || session.iteration_count,
      ],
      context
    );

    // Update session last_activity_at (trigger will handle thinking_blocks aggregation)
    await this.updateSessionActivity(sessionId, context);

    return this.transformThinkingBlock(thinkingBlock);
  }

  /**
   * Get sessions for a specific user with pagination
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
    // Get total count
    const countResult = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM agent_sessions WHERE user_id = $1',
      [userId],
      context
    );
    
    const total = parseInt(countResult[0]?.count?.toString() || '0', 10);

    // Get sessions
    const sessions = await this.db.query<AgentSession>(
      `
      SELECT * FROM agent_sessions 
      WHERE user_id = $1 
      ORDER BY last_activity_at DESC 
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
      context
    );

    return {
      sessions: sessions.map(this.transformSession),
      total
    };
  }

  /**
   * Get session messages with optional filtering
   */
  async getSessionMessages(
    sessionId: string,
    options: {
      messageType?: 'user' | 'assistant' | 'system' | 'thinking';
      phase?: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';
      limit?: number;
      offset?: number;
    } = {},
    context?: UserContext
  ): Promise<AgentMessage[]> {
    let whereClause = 'WHERE session_id = $1 AND message_status = \'active\'';
    const params: any[] = [sessionId];
    let paramIndex = 2;

    if (options.messageType) {
      whereClause += ` AND message_type = $${paramIndex++}`;
      params.push(options.messageType);
    }

    if (options.phase) {
      whereClause += ` AND phase = $${paramIndex++}`;
      params.push(options.phase);
    }

    const limitClause = options.limit ? `LIMIT $${paramIndex++}` : '';
    if (options.limit) params.push(options.limit.toString());

    const offsetClause = options.offset ? `OFFSET $${paramIndex++}` : '';
    if (options.offset) params.push(options.offset.toString());

    const messages = await this.db.query<AgentMessage>(
      `
      SELECT * FROM agent_messages 
      ${whereClause}
      ORDER BY message_index ASC
      ${limitClause} ${offsetClause}
      `,
      params,
      context
    );

    return messages.map(this.transformMessage);
  }

  /**
   * Get session thinking blocks
   */
  async getSessionThinkingBlocks(
    sessionId: string,
    options: {
      thinkingType?: 'analysis' | 'planning' | 'decision' | 'reflection' | 'error_recovery';
      phase?: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE';
      limit?: number;
      offset?: number;
    } = {},
    context?: UserContext
  ): Promise<ThinkingBlock[]> {
    let whereClause = 'WHERE session_id = $1';
    const params: any[] = [sessionId];
    let paramIndex = 2;

    if (options.thinkingType) {
      whereClause += ` AND thinking_type = $${paramIndex++}`;
      params.push(options.thinkingType);
    }

    if (options.phase) {
      whereClause += ` AND phase = $${paramIndex++}`;
      params.push(options.phase);
    }

    const limitClause = options.limit ? `LIMIT $${paramIndex++}` : '';
    if (options.limit) params.push(options.limit.toString());

    const offsetClause = options.offset ? `OFFSET $${paramIndex++}` : '';
    if (options.offset) params.push(options.offset.toString());

    const thinkingBlocks = await this.db.query<ThinkingBlock>(
      `
      SELECT * FROM thinking_blocks 
      ${whereClause}
      ORDER BY sequence_number ASC
      ${limitClause} ${offsetClause}
      `,
      params,
      context
    );

    return thinkingBlocks.map(this.transformThinkingBlock);
  }

  /**
   * Generate conversation summary for a phase
   */
  async generateConversationSummary(
    sessionId: string,
    phase: 'EXPLORE' | 'PLAN' | 'SUMMON' | 'COMPLETE',
    context?: UserContext
  ): Promise<ConversationSummary> {
    const [summary] = await this.db.query<{ id: string }>(
      'SELECT generate_conversation_summary($1, $2) as id',
      [sessionId, phase],
      context
    );

    if (!summary.id) {
      throw new Error('Failed to generate conversation summary');
    }

    // Fetch the created summary
    const [createdSummary] = await this.db.query<ConversationSummary>(
      'SELECT * FROM conversation_summaries WHERE id = $1',
      [summary.id],
      context
    );

    return this.transformSummary(createdSummary);
  }

  /**
   * Get full conversation history (messages + thinking blocks interleaved)
   */
  async getFullConversationHistory(
    sessionId: string,
    context?: UserContext
  ): Promise<{
    messages: AgentMessage[];
    thinkingBlocks: ThinkingBlock[];
    summaries: ConversationSummary[];
  }> {
    const [messages, thinkingBlocks, summaries] = await Promise.all([
      this.getSessionMessages(sessionId, {}, context),
      this.getSessionThinkingBlocks(sessionId, {}, context),
      this.getConversationSummaries(sessionId, context),
    ]);

    return { messages, thinkingBlocks, summaries };
  }

  /**
   * Get conversation summaries for session
   */
  async getConversationSummaries(
    sessionId: string,
    context?: UserContext
  ): Promise<ConversationSummary[]> {
    const summaries = await this.db.query<ConversationSummary>(
      'SELECT * FROM conversation_summaries WHERE session_id = $1 ORDER BY start_time ASC',
      [sessionId],
      context
    );

    return summaries.map(this.transformSummary);
  }

  /**
   * Get session by ID (enhanced with thinking data)
   */
  async getSessionById(
    sessionId: string,
    context?: UserContext
  ): Promise<AgentSession | null> {
    const result = await this.db.query<AgentSession>(
      'SELECT * FROM agent_sessions WHERE id = $1',
      [sessionId],
      context
    );
    const session = result[0];

    return session ? this.transformSession(session) : null;
  }

  /**
   * Update session progress (enhanced)
   */
  async updateSession(
    sessionId: string,
    updates: UpdateSessionRequest,
    context?: UserContext
  ): Promise<AgentSession> {
    const setClause = [];
    const values: any[] = [];
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
   * Update session activity timestamp
   */
  private async updateSessionActivity(
    sessionId: string,
    context?: UserContext
  ): Promise<void> {
    await this.db.query(
      'UPDATE agent_sessions SET last_activity_at = NOW() WHERE id = $1',
      [sessionId],
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
      thinking_blocks: session.thinking_blocks || [],
      reasoning_chain: session.reasoning_chain || [],
      decision_points: session.decision_points || {},
      confidence_levels: session.confidence_levels || {
        current: 0,
        trend: [],
        min: 0,
        max: 1
      },
    };
  }

  /**
   * Transform database message record with robust JSON parsing
   */
  private transformMessage(message: any): AgentMessage {
    const parseJsonSafely = (value: any, fallback: any = []): any => {
      if (value === null || value === undefined) {
        return fallback;
      }
      
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (e) {
          console.warn('Failed to parse JSON, using fallback:', e);
          return fallback;
        }
      }
      
      // If it's already parsed (from mock or different source), return as is
      return value || fallback;
    };

    return {
      ...message,
      tool_calls: parseJsonSafely(message.tool_calls, []),
      tool_results: parseJsonSafely(message.tool_results, []),
    };
  }

  /**
   * Transform database thinking block record with robust JSON parsing
   */
  private transformThinkingBlock(block: any): ThinkingBlock {
    const parseJsonSafely = (value: any, fallback: any = {}): any => {
      if (value === null || value === undefined) {
        return fallback;
      }
      
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (e) {
          console.warn('Failed to parse JSON, using fallback:', e);
          return fallback;
        }
      }
      
      // If it's already parsed (from mock or different source), return as is
      return value || fallback;
    };

    return {
      ...block,
      context_snapshot: parseJsonSafely(block.context_snapshot, {}),
    };
  }

  /**
   * Transform database summary record
   */
  private transformSummary(summary: any): ConversationSummary {
    return {
      ...summary,
    };
  }
}

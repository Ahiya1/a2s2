import { DatabaseManager } from "./DatabaseManager";
import { Logger } from "../logging/Logger";
import {
  DatabaseConversation,
  DatabaseAgentSession,
  DatabasePhaseTransition,
  DatabaseToolExecution,
  DatabaseFileOperation,
  DatabaseCostTracking,
  DatabaseValidationResult,
  ConversationAnalytics,
  SessionAnalytics,
  DashboardMetrics,
  QueryOptions,
  DatabaseOperationResult,
} from "../types/DatabaseTypes";
import { ConversationState } from "../conversation/ConversationPersistence";
import { SessionMetrics, PhaseTransition } from "../agent/AgentSession";
import { ToolResult } from "../tools/ToolManager";

export class ConversationDAO {
  private dbManager: DatabaseManager;

  constructor() {
    this.dbManager = DatabaseManager.getInstance();
  }

  // Conversation operations
  async saveConversation(
    state: ConversationState
  ): Promise<DatabaseOperationResult<string>> {
    const startTime = Date.now();

    try {
      const conversation: DatabaseConversation = {
        id: "", // Will be auto-generated
        conversation_id: state.conversationId,
        working_directory: state.workingDirectory,
        project_context: JSON.stringify(state.projectContext),
        total_cost: state.totalCost,
        message_count: state.messageCount,
        conversation_history: JSON.stringify(state.conversationHistory),
        created_at: new Date(),
        updated_at: new Date(),
        last_updated: state.lastUpdated,
      };

      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          // Check if conversation already exists
          const existing = await connection.query(
            "SELECT id FROM conversations WHERE conversation_id = ?",
            [conversation.conversation_id]
          );

          if (existing.length > 0) {
            // Update existing conversation
            await connection.execute(
              `
            UPDATE conversations 
            SET working_directory = ?, project_context = ?, total_cost = ?, 
                message_count = ?, conversation_history = ?, last_updated = ?, updated_at = CURRENT_TIMESTAMP
            WHERE conversation_id = ?
          `,
              [
                conversation.working_directory,
                conversation.project_context,
                conversation.total_cost,
                conversation.message_count,
                conversation.conversation_history,
                conversation.last_updated.toISOString(),
                conversation.conversation_id,
              ]
            );

            Logger.debug("Updated existing conversation", {
              conversationId: conversation.conversation_id,
              messageCount: conversation.message_count,
              cost: conversation.total_cost,
            });
          } else {
            // Insert new conversation
            await connection.execute(
              `
            INSERT INTO conversations (
              conversation_id, working_directory, project_context, total_cost,
              message_count, conversation_history, last_updated, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `,
              [
                conversation.conversation_id,
                conversation.working_directory,
                conversation.project_context,
                conversation.total_cost,
                conversation.message_count,
                conversation.conversation_history,
                conversation.last_updated.toISOString(),
              ]
            );

            Logger.debug("Inserted new conversation", {
              conversationId: conversation.conversation_id,
              messageCount: conversation.message_count,
              cost: conversation.total_cost,
            });
          }

          return conversation.conversation_id;
        }
      );

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to save conversation", {
        conversationId: state.conversationId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  async getConversation(
    conversationId: string
  ): Promise<DatabaseOperationResult<ConversationState | null>> {
    const startTime = Date.now();

    try {
      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          const rows = await connection.query(
            "SELECT * FROM conversations WHERE conversation_id = ?",
            [conversationId]
          );

          if (rows.length === 0) {
            return null;
          }

          const row = rows[0];
          const state: ConversationState = {
            conversationId: row.conversation_id,
            workingDirectory: row.working_directory,
            projectContext: JSON.parse(row.project_context || "{}"),
            totalCost: row.total_cost,
            messageCount: row.message_count,
            conversationHistory: JSON.parse(row.conversation_history || "[]"),
            lastUpdated: new Date(row.last_updated),
          };

          return state;
        }
      );

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to get conversation", {
        conversationId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  async listConversations(
    options: QueryOptions = {}
  ): Promise<DatabaseOperationResult<ConversationState[]>> {
    const startTime = Date.now();

    try {
      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          let sql = "SELECT * FROM conversations";
          const params: any[] = [];
          const conditions: string[] = [];

          // Apply filters
          if (options.filters) {
            if (options.filters.workingDirectory) {
              conditions.push("working_directory LIKE ?");
              params.push(`%${options.filters.workingDirectory}%`);
            }
            if (options.filters.minCost) {
              conditions.push("total_cost >= ?");
              params.push(options.filters.minCost);
            }
            if (options.filters.maxCost) {
              conditions.push("total_cost <= ?");
              params.push(options.filters.maxCost);
            }
          }

          // Apply date range
          if (options.dateRange) {
            conditions.push("created_at >= ? AND created_at <= ?");
            params.push(options.dateRange.start.toISOString());
            params.push(options.dateRange.end.toISOString());
          }

          if (conditions.length > 0) {
            sql += " WHERE " + conditions.join(" AND ");
          }

          // Apply ordering
          sql += ` ORDER BY ${options.orderBy || "created_at"} ${options.orderDirection || "DESC"}`;

          // Apply pagination - FIXED: limit should be converted to string for SQL
          if (options.limit) {
            sql += " LIMIT ?";
            params.push(String(options.limit));

            if (options.offset) {
              sql += " OFFSET ?";
              params.push(String(options.offset));
            }
          }

          const rows = await connection.query(sql, params);

          const conversations: ConversationState[] = rows.map((row) => ({
            conversationId: row.conversation_id,
            workingDirectory: row.working_directory,
            projectContext: JSON.parse(row.project_context || "{}"),
            totalCost: row.total_cost,
            messageCount: row.message_count,
            conversationHistory: JSON.parse(row.conversation_history || "[]"),
            lastUpdated: new Date(row.last_updated),
          }));

          return conversations;
        }
      );

      return {
        success: result.success,
        data: result.data || [],
        error: result.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to list conversations", {
        error: errorMessage,
        options,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  // Agent session operations
  async saveAgentSession(
    metrics: SessionMetrics
  ): Promise<DatabaseOperationResult<string>> {
    const startTime = Date.now();

    try {
      const session: DatabaseAgentSession = {
        id: "", // Will be auto-generated
        session_id: metrics.sessionId,
        conversation_id: undefined, // TODO: Link to conversation if available
        start_time: metrics.startTime,
        end_time: metrics.endTime,
        phase: metrics.phase,
        iteration_count: metrics.iterationCount,
        tool_calls_count: metrics.toolCallsCount,
        total_cost: metrics.totalCost,
        tokens_used: metrics.tokensUsed,
        files_modified: JSON.stringify(metrics.filesModified),
        files_created: JSON.stringify(metrics.filesCreated),
        streaming_time: metrics.streamingTime,
        success: true, // TODO: Get from session result
        error_message: undefined,
        vision: "", // TODO: Get from session options
        working_directory: process.cwd(), // TODO: Get from session options
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          const existing = await connection.query(
            "SELECT id FROM agent_sessions WHERE session_id = ?",
            [session.session_id]
          );

          if (existing.length > 0) {
            // Update existing session
            await connection.execute(
              `
            UPDATE agent_sessions 
            SET end_time = ?, phase = ?, iteration_count = ?, tool_calls_count = ?,
                total_cost = ?, tokens_used = ?, files_modified = ?, files_created = ?,
                streaming_time = ?, updated_at = CURRENT_TIMESTAMP
            WHERE session_id = ?
          `,
              [
                session.end_time?.toISOString(),
                session.phase,
                session.iteration_count,
                session.tool_calls_count,
                session.total_cost,
                session.tokens_used,
                session.files_modified,
                session.files_created,
                session.streaming_time,
                session.session_id,
              ]
            );
          } else {
            // Insert new session
            await connection.execute(
              `
            INSERT INTO agent_sessions (
              session_id, conversation_id, start_time, end_time, phase,
              iteration_count, tool_calls_count, total_cost, tokens_used,
              files_modified, files_created, streaming_time, success,
              error_message, vision, working_directory, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `,
              [
                session.session_id,
                session.conversation_id,
                session.start_time.toISOString(),
                session.end_time?.toISOString(),
                session.phase,
                session.iteration_count,
                session.tool_calls_count,
                session.total_cost,
                session.tokens_used,
                session.files_modified,
                session.files_created,
                session.streaming_time,
                session.success,
                session.error_message,
                session.vision,
                session.working_directory,
              ]
            );
          }

          return session.session_id;
        }
      );

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to save agent session", {
        sessionId: metrics.sessionId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  // Phase transition operations
  async savePhaseTransition(
    sessionId: string,
    transition: PhaseTransition
  ): Promise<DatabaseOperationResult<number>> {
    const startTime = Date.now();

    try {
      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          const insertResult = await connection.execute(
            `
          INSERT INTO phase_transitions (
            session_id, from_phase, to_phase, timestamp, reason, duration,
            summary, key_findings, next_actions, confidence, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
            [
              sessionId,
              transition.from,
              transition.to,
              transition.timestamp.toISOString(),
              transition.reason,
              transition.duration,
              "", // TODO: Get summary from transition if available
              JSON.stringify([]), // TODO: Get key findings if available
              JSON.stringify([]), // TODO: Get next actions if available
              undefined, // TODO: Get confidence if available
            ]
          );

          return insertResult.lastInsertRowid;
        }
      );

      Logger.debug("Saved phase transition", {
        sessionId,
        from: transition.from,
        to: transition.to,
        duration: transition.duration,
      });

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to save phase transition", {
        sessionId,
        transition,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  // Tool execution operations
  async saveToolExecution(
    sessionId: string,
    toolName: string,
    parameters: any,
    result: ToolResult,
    executionTime: number
  ): Promise<DatabaseOperationResult<number>> {
    const startTime = Date.now();

    try {
      const dbResult = await this.dbManager.executeTransaction(
        async (connection) => {
          const insertResult = await connection.execute(
            `
          INSERT INTO tool_executions (
            session_id, conversation_id, tool_name, tool_parameters,
            result, success, error_message, execution_time, timestamp, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
            [
              sessionId,
              null, // TODO: Link to conversation if available
              toolName,
              JSON.stringify(parameters),
              typeof result.result === "string"
                ? result.result
                : JSON.stringify(result.result),
              result.success,
              result.error?.message || null,
              executionTime,
            ]
          );

          return insertResult.lastInsertRowid;
        }
      );

      Logger.debug("Saved tool execution", {
        sessionId,
        toolName,
        success: result.success,
        executionTime,
      });

      return {
        success: dbResult.success,
        data: dbResult.data,
        error: dbResult.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to save tool execution", {
        sessionId,
        toolName,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  // ADDED: Missing getAnalytics method
  async getAnalytics(
    options: QueryOptions = {}
  ): Promise<DatabaseOperationResult<ConversationAnalytics>> {
    return this.getConversationAnalytics(options);
  }

  // Analytics operations
  async getConversationAnalytics(
    options: QueryOptions = {}
  ): Promise<DatabaseOperationResult<ConversationAnalytics>> {
    const startTime = Date.now();

    try {
      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          // Get basic conversation stats
          let dateFilter = "";
          const params: any[] = [];

          if (options.dateRange) {
            dateFilter = "WHERE created_at >= ? AND created_at <= ?";
            params.push(options.dateRange.start.toISOString());
            params.push(options.dateRange.end.toISOString());
          }

          const [statsRow] = await connection.query(
            `
          SELECT 
            COUNT(*) as totalConversations,
            AVG(total_cost) as averageCost,
            AVG(message_count) as averageMessages,
            MIN(created_at) as startDate,
            MAX(created_at) as endDate
          FROM conversations ${dateFilter}
        `,
            params
          );

          // Get session stats
          const [sessionStatsRow] = await connection.query(
            `
          SELECT 
            COUNT(*) as totalSessions,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successfulSessions
          FROM agent_sessions ${dateFilter.replace("created_at", "start_time")}
        `,
            params
          );

          // Get phase distribution
          const phaseRows = await connection.query(
            `
          SELECT phase, COUNT(*) as count
          FROM agent_sessions ${dateFilter.replace("created_at", "start_time")}
          GROUP BY phase
        `,
            params
          );

          const phaseDistribution: Record<string, number> = {};
          phaseRows.forEach((row) => {
            phaseDistribution[row.phase] = row.count;
          });

          // Get tool usage stats
          const toolRows = await connection.query(
            `
          SELECT tool_name, COUNT(*) as count
          FROM tool_executions ${dateFilter.replace("created_at", "timestamp")}
          GROUP BY tool_name
          ORDER BY count DESC
          LIMIT 10
        `,
            params
          );

          const toolUsageStats: Record<string, number> = {};
          toolRows.forEach((row) => {
            toolUsageStats[row.tool_name] = row.count;
          });

          const analytics: ConversationAnalytics = {
            totalConversations: statsRow?.totalConversations || 0,
            totalSessions: sessionStatsRow?.totalSessions || 0,
            averageCost: statsRow?.averageCost || 0,
            averageMessages: statsRow?.averageMessages || 0,
            successRate:
              sessionStatsRow?.totalSessions > 0
                ? (sessionStatsRow.successfulSessions /
                    sessionStatsRow.totalSessions) *
                  100
                : 0,
            phaseDistribution,
            toolUsageStats,
            dateRange: {
              start:
                options.dateRange?.start ||
                new Date(statsRow?.startDate || Date.now()),
              end:
                options.dateRange?.end ||
                new Date(statsRow?.endDate || Date.now()),
            },
          };

          return analytics;
        }
      );

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to get conversation analytics", {
        error: errorMessage,
        options,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  // ADDED: Missing getConversationCount method
  async getConversationCount(): Promise<DatabaseOperationResult<number>> {
    const startTime = Date.now();

    try {
      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          const [row] = await connection.query(
            "SELECT COUNT(*) as count FROM conversations"
          );
          return row?.count || 0;
        }
      );

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to get conversation count", {
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  // ADDED: Missing getSessionCount method
  async getSessionCount(): Promise<DatabaseOperationResult<number>> {
    const startTime = Date.now();

    try {
      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          const [row] = await connection.query(
            "SELECT COUNT(*) as count FROM agent_sessions"
          );
          return row?.count || 0;
        }
      );

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to get session count", {
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  // ADDED: Missing getToolExecutionCount method
  async getToolExecutionCount(): Promise<DatabaseOperationResult<number>> {
    const startTime = Date.now();

    try {
      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          const [row] = await connection.query(
            "SELECT COUNT(*) as count FROM tool_executions"
          );
          return row?.count || 0;
        }
      );

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to get tool execution count", {
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  async getDashboardMetrics(): Promise<
    DatabaseOperationResult<DashboardMetrics>
  > {
    const startTime = Date.now();

    try {
      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          const now = new Date();
          const today = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
          const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

          // Conversation metrics
          const [convStats] = await connection.query(
            `
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN created_at >= ? THEN 1 END) as today,
            COUNT(CASE WHEN created_at >= ? THEN 1 END) as thisWeek
          FROM conversations
        `,
            [today.toISOString(), weekAgo.toISOString()]
          );

          // Session metrics
          const [sessionStats] = await connection.query(`
          SELECT 
            COUNT(CASE WHEN end_time IS NULL THEN 1 END) as active,
            COUNT(CASE WHEN success = 1 THEN 1 END) as completed,
            COUNT(CASE WHEN success = 0 THEN 1 END) as failed
          FROM agent_sessions
        `);

          // Cost metrics
          const [costStats] = await connection.query(
            `
          SELECT 
            SUM(total_cost) as totalCost,
            AVG(total_cost) as averageCost,
            SUM(CASE WHEN timestamp >= ? THEN total_cost ELSE 0 END) as todayCost
          FROM cost_tracking
        `,
            [today.toISOString()]
          );

          // Tool usage - FIXED: Cast count to number to fix type compatibility
          const topTools = await connection.query(
            `
          SELECT 
            tool_name,
            CAST(COUNT(*) as INTEGER) as count,
            ROUND(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as successRate
          FROM tool_executions
          WHERE timestamp >= ?
          GROUP BY tool_name
          ORDER BY count DESC
          LIMIT 5
        `,
            [weekAgo.toISOString()]
          );

          // Recent tool executions
          const recentExecutions = await connection.query(`
          SELECT * FROM tool_executions
          ORDER BY timestamp DESC
          LIMIT 10
        `);

          // Performance metrics
          const [perfStats] = await connection.query(
            `
          SELECT 
            AVG(CASE WHEN end_time IS NOT NULL THEN 
              (julianday(end_time) - julianday(start_time)) * 86400 
              ELSE NULL END) as avgSessionTime,
            AVG(tokens_used) as avgTokens
          FROM agent_sessions
          WHERE start_time >= ?
        `,
            [weekAgo.toISOString()]
          );

          // Phase distribution
          const phaseRows = await connection.query(
            `
          SELECT phase, COUNT(*) as count
          FROM agent_sessions
          WHERE start_time >= ?
          GROUP BY phase
        `,
            [weekAgo.toISOString()]
          );

          const phaseDistribution: Record<string, number> = {};
          phaseRows.forEach((row) => {
            phaseDistribution[row.phase] = row.count;
          });

          const metrics: DashboardMetrics = {
            conversations: {
              total: convStats?.total || 0,
              today: convStats?.today || 0,
              thisWeek: convStats?.thisWeek || 0,
              successRate: 100, // TODO: Calculate based on successful completions
            },
            sessions: {
              active: sessionStats?.active || 0,
              completed: sessionStats?.completed || 0,
              failed: sessionStats?.failed || 0,
            },
            costs: {
              total: costStats?.totalCost || 0,
              today: costStats?.todayCost || 0,
              average: costStats?.averageCost || 0,
              breakdown: { standard: 0, extended: 0 }, // TODO: Calculate breakdown
            },
            tools: {
              mostUsed: topTools.map((row) => ({
                name: row.tool_name,
                count: Number(row.count), // Ensure it's a number
                successRate: row.successRate,
              })),
              recentExecutions: recentExecutions as DatabaseToolExecution[],
            },
            performance: {
              averageSessionTime: perfStats?.avgSessionTime || 0,
              averageTokensPerSession: perfStats?.avgTokens || 0,
              phaseDistribution,
            },
          };

          return metrics;
        }
      );

      return {
        success: result.success,
        data: result.data!,
        error: result.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to get dashboard metrics", {
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  // Cleanup operations
  async cleanupOldData(
    retentionDays: number
  ): Promise<DatabaseOperationResult<number>> {
    const startTime = Date.now();

    try {
      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
          const cutoffDateStr = cutoffDate.toISOString();

          let totalDeleted = 0;

          // Delete old conversations (cascades to related data)
          const convResult = await connection.execute(
            "DELETE FROM conversations WHERE created_at < ?",
            [cutoffDateStr]
          );
          totalDeleted += convResult.changes || 0;

          // Delete old agent sessions (cascades to related data)
          const sessionResult = await connection.execute(
            "DELETE FROM agent_sessions WHERE start_time < ?",
            [cutoffDateStr]
          );
          totalDeleted += sessionResult.changes || 0;

          Logger.info("Cleaned up old database records", {
            retentionDays,
            totalDeleted,
            cutoffDate: cutoffDateStr,
          });

          return totalDeleted;
        }
      );

      return {
        success: result.success,
        data: result.data || 0,
        error: result.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to cleanup old data", {
        retentionDays,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  // Search operations
  async searchConversations(
    query: string,
    options: QueryOptions = {}
  ): Promise<DatabaseOperationResult<ConversationState[]>> {
    const startTime = Date.now();

    try {
      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          // Use FTS search if available, otherwise use LIKE
          let sql = `
          SELECT c.* FROM conversations c
          LEFT JOIN conversations_fts fts ON c.id = fts.rowid
          WHERE (
            c.conversation_id LIKE ? OR
            c.working_directory LIKE ? OR
            c.project_context LIKE ? OR
            c.conversation_history LIKE ?
          )
        `;

          const searchTerm = `%${query}%`;
          const params = [searchTerm, searchTerm, searchTerm, searchTerm];

          // Apply additional filters
          if (options.dateRange) {
            sql += " AND c.created_at >= ? AND c.created_at <= ?";
            params.push(options.dateRange.start.toISOString());
            params.push(options.dateRange.end.toISOString());
          }

          sql += ` ORDER BY c.${options.orderBy || "created_at"} ${options.orderDirection || "DESC"}`;

          if (options.limit) {
            sql += " LIMIT ?";
            params.push(String(options.limit));
          }

          const rows = await connection.query(sql, params);

          const conversations: ConversationState[] = rows.map((row) => ({
            conversationId: row.conversation_id,
            workingDirectory: row.working_directory,
            projectContext: JSON.parse(row.project_context || "{}"),
            totalCost: row.total_cost,
            messageCount: row.message_count,
            conversationHistory: JSON.parse(row.conversation_history || "[]"),
            lastUpdated: new Date(row.last_updated),
          }));

          return conversations;
        }
      );

      Logger.debug("Searched conversations", {
        query,
        resultCount: result.data?.length || 0,
        executionTime: Date.now() - startTime,
      });

      return {
        success: result.success,
        data: result.data || [],
        error: result.error,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to search conversations", {
        query,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }
}

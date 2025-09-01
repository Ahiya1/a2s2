/**
 * DatabaseManager - Core database connection and management
 * Handles multi-tenant isolation, connection pooling, and admin context
 */

import { Pool, PoolClient, PoolConfig } from "pg";
import { config } from "../config/database.js";

export interface UserContext {
  userId: string;
  isAdmin: boolean;
  adminPrivileges?: {
    unlimited_credits?: boolean;
    bypass_rate_limits?: boolean;
    view_all_analytics?: boolean;
    user_impersonation?: boolean;
    system_diagnostics?: boolean;
    priority_execution?: boolean;
    global_access?: boolean;
    audit_access?: boolean;
  };
}

export interface DatabaseTransaction {
  query<T = any>(text: string, params?: any[]): Promise<T[]>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

class DatabaseTransactionImpl implements DatabaseTransaction {
  constructor(
    private client: PoolClient,
    private context?: UserContext,
    private dbManager?: DatabaseManager
  ) {}

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    // Ensure user context is maintained for each transaction query
    if (this.context && this.dbManager) {
      await this.dbManager.setUserContext(this.client, this.context);
    }
    const result = await this.client.query(text, params);
    return result.rows as T[];
  }

  async commit(): Promise<void> {
    await this.client.query("COMMIT");
    if (this.context && this.dbManager) {
      await this.dbManager.clearUserContext(this.client);
    }
    this.client.release();
  }

  async rollback(): Promise<void> {
    await this.client.query("ROLLBACK");
    if (this.context && this.dbManager) {
      await this.dbManager.clearUserContext(this.client);
    }
    this.client.release();
  }
}

export class DatabaseManager {
  private pool: Pool;
  private _isConnected: boolean = false;
  private customParametersInitialized: boolean = false;

  constructor(customConfig?: any) {
    const poolConfig: PoolConfig = {
      host: customConfig?.host || config.host,
      port: customConfig?.port || config.port,
      database: customConfig?.database || config.database,
      user: customConfig?.user || config.user,
      password: customConfig?.password || config.password,
      ssl: customConfig?.ssl !== undefined ? customConfig.ssl : config.ssl,
      max: customConfig?.maxConnections || config.maxConnections,
      idleTimeoutMillis: customConfig?.idleTimeout || config.idleTimeout,
      connectionTimeoutMillis:
        customConfig?.connectionTimeout || config.connectionTimeout,
    };

    this.pool = new Pool(poolConfig);
    this.setupConnectionHandlers();
  }

  /**
   * Get current connection status
   */
  get isConnected(): boolean {
    return this._isConnected && !this.pool.ended;
  }

  private setupConnectionHandlers(): void {
    this.pool.on("connect", () => {
      this._isConnected = true;
      console.log("Database pool connected");
    });

    this.pool.on("error", (err) => {
      console.error("Database pool error:", err);
      this._isConnected = false;
    });

    this.pool.on("remove", () => {});
  }

  /**
   * Initialize database connection and test connectivity
   */
  async initialize(): Promise<void> {
    try {
      await this.testConnection();
      await this.initializeCustomParameters();
      this._isConnected = true;
      console.log("Database connection initialized successfully");
    } catch (error) {
      this._isConnected = false;
      console.error("Database initialization failed:", error);
      throw error;
    }
  }

  /**
   * Initialize custom PostgreSQL parameters for RLS
   */
  private async initializeCustomParameters(): Promise<void> {
    if (this.customParametersInitialized || process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      const client = await this.pool.connect();
      try {
        // Create custom parameters for RLS if they don't exist
        // These are session-level parameters that can be set per connection
        await client.query("SET app.current_user_id = '';");
        await client.query("SET app.is_admin_user = 'false';");
        await client.query("SET app.admin_privileges = '{}';");
        
        this.customParametersInitialized = true;
      } catch (error) {
        // Parameters might already be configured or we might not have permissions
        // This is not a critical error for basic functionality
        console.warn("Could not initialize custom parameters:", error);
      } finally {
        client.release();
      }
    } catch (error) {
      console.warn("Could not initialize custom parameters:", error);
    }
  }

  /**
   * Setup client connection with proper role switching for RLS
   */
  private async setupClientConnection(client: PoolClient): Promise<void> {
    // Switch to application_user role to ensure RLS policies are enforced
    // Only do this if we're not already the application_user and not in test mode
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const currentUserResult = await client.query("SELECT current_user");
    const currentUser = currentUserResult.rows[0]?.current_user;

    if (currentUser !== "application_user") {
      try {
        await client.query("SET ROLE application_user");
      } catch (error) {
        // If role switching fails, log it but continue
        // This allows the system to work even if the role doesn't exist in development
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.warn(
          "Could not switch to application_user role:",
          errorMessage
        );
      }
    }
  }

  /**
   * Set user context for row-level security
   * Note: PostgreSQL SET statements don't support parameterized queries,
   * so we use string formatting with proper validation
   */
  async setUserContext(
    client: PoolClient,
    context: UserContext
  ): Promise<void> {
    // In test environment, RLS is disabled so we don't need to set context parameters
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    // Validate UUID format for security
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        context.userId
      )
    ) {
      throw new Error("Invalid userId format");
    }

    try {
      await client.query('SET app.current_user_id = $1', [context.userId]);
      await client.query('SET app.is_admin_user = $1', [context.isAdmin.toString()]);
    } catch (error) {
      // In development, these parameters might not be configured
      // Log the error but don't fail the operation
      console.warn('Could not set user context parameters:', error);
      return;
    }

    // Set additional admin context if available
    if (context.isAdmin && context.adminPrivileges) {
      try {
        const privilegesJson = JSON.stringify(context.adminPrivileges);
        await client.query('SET app.admin_privileges = $1', [privilegesJson]);
      } catch (error) {
        // Non-critical error, log but continue
        console.warn('Could not set admin privileges:', error);
      }
    }
  }

  /**
   * Clear user context
   */
  async clearUserContext(client: PoolClient): Promise<void> {
    // In test environment, we don't set context parameters so nothing to clear
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      await client.query("RESET app.current_user_id");
    } catch (error) {
      // Parameter might not be set, ignore error
    }
    try {
      await client.query("RESET app.is_admin_user");
    } catch (error) {
      // Parameter might not be set, ignore error
    }
    try {
      await client.query("RESET app.admin_privileges");
    } catch (error) {
      // Parameter might not be set, ignore error
    }
  }

  /**
   * Execute a query with user context
   */
  async query<T = any>(
    text: string,
    params?: any[],
    context?: UserContext
  ): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      // Setup role switching for RLS
      await this.setupClientConnection(client);

      if (context) {
        await this.setUserContext(client, context);
      }

      const result = await client.query(text, params);
      return result.rows as T[];
    } catch (error) {
      console.error("Database query error:", error);
      throw error;
    } finally {
      if (context) {
        await this.clearUserContext(client);
      }
      client.release();
    }
  }

  /**
   * Start a database transaction
   */
  async beginTransaction(context?: UserContext): Promise<DatabaseTransaction> {
    const client = await this.pool.connect();
    try {
      // Setup role switching for RLS
      await this.setupClientConnection(client);

      await client.query("BEGIN");

      if (context) {
        await this.setUserContext(client, context);
      }

      return new DatabaseTransactionImpl(client, context, this);
    } catch (error) {
      client.release();
      throw error;
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(
    callback: (transaction: DatabaseTransaction) => Promise<T>,
    context?: UserContext
  ): Promise<T> {
    const transaction = await this.beginTransaction(context);
    try {
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.query("SELECT version() as version");
      console.log("Database connected:", result[0]?.version);
      return true;
    } catch (error) {
      console.error("Database connection test failed:", error);
      return false;
    }
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * Get connection statistics for monitoring
   */
  getConnectionStats(): {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    waitingConnections: number;
    isConnected: boolean;
  } {
    const stats = this.getPoolStats();
    return {
      totalConnections: stats.totalCount,
      activeConnections: stats.totalCount - stats.idleCount,
      idleConnections: stats.idleCount,
      waitingConnections: stats.waitingCount,
      isConnected: this.isConnected,
    };
  }

  /**
   * Gracefully close all connections
   */
  async close(): Promise<void> {
    try {
      // Check if pool is already ended
      if (this.pool.ended) {
        console.log("Database pool already closed");
        return;
      }
      
      await this.pool.end();
      this._isConnected = false;
      console.log("Database pool closed");
    } catch (error) {
      console.error("Error closing database pool:", error);
      // Don't rethrow to prevent cascading errors during cleanup
    }
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<{
    connected: boolean;
    poolStats: ReturnType<DatabaseManager["getPoolStats"]>;
    latency?: number;
  }> {
    const startTime = Date.now();
    const connected = await this.testConnection();
    const latency = connected ? Date.now() - startTime : undefined;

    return {
      connected,
      poolStats: this.getPoolStats(),
      ...(latency !== undefined && { latency }),
    };
  }
}

// Singleton instance
export const db = new DatabaseManager();

/**
 * DatabaseManager - Core database connection and management
 * Handles multi-tenant isolation, connection pooling, and admin context
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { config } from '../config/database.js';

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
  constructor(private client: PoolClient) {}

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const result = await this.client.query(text, params);
    return result.rows as T[];
  }

  async commit(): Promise<void> {
    await this.client.query('COMMIT');
    this.client.release();
  }

  async rollback(): Promise<void> {
    await this.client.query('ROLLBACK');
    this.client.release();
  }
}

export class DatabaseManager {
  private pool: Pool;
  private isConnected: boolean = false;

  constructor() {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: config.maxConnections,
      idleTimeoutMillis: config.idleTimeout,
      connectionTimeoutMillis: config.connectionTimeout,
    };

    this.pool = new Pool(poolConfig);
    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    this.pool.on('connect', () => {
      this.isConnected = true;
      console.log('Database pool connected');
    });

    this.pool.on('error', (err) => {
      console.error('Database pool error:', err);
      this.isConnected = false;
    });

    this.pool.on('remove', () => {
      console.log('Database connection removed from pool');
    });
  }

  /**
   * Set user context for row-level security
   */
  async setUserContext(client: PoolClient, context: UserContext): Promise<void> {
    await client.query('SET app.current_user_id = $1', [context.userId]);
    await client.query('SET app.is_admin_user = $1', [context.isAdmin.toString()]);
    
    // Set additional admin context if available
    if (context.isAdmin && context.adminPrivileges) {
      await client.query('SET app.admin_privileges = $1', [
        JSON.stringify(context.adminPrivileges)
      ]);
    }
  }

  /**
   * Clear user context
   */
  async clearUserContext(client: PoolClient): Promise<void> {
    await client.query('RESET app.current_user_id');
    await client.query('RESET app.is_admin_user');
    await client.query('RESET app.admin_privileges');
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
      if (context) {
        await this.setUserContext(client, context);
      }
      
      const result = await client.query(text, params);
      return result.rows as T[];
    } catch (error) {
      console.error('Database query error:', error);
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
      await client.query('BEGIN');
      
      if (context) {
        await this.setUserContext(client, context);
      }
      
      return new DatabaseTransactionImpl(client);
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
      const result = await this.query('SELECT version() as version');
      console.log('Database connected:', result[0]?.version);
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
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
   * Gracefully close all connections
   */
  async close(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      console.log('Database pool closed');
    } catch (error) {
      console.error('Error closing database pool:', error);
      throw error;
    }
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<{
    connected: boolean;
    poolStats: ReturnType<DatabaseManager['getPoolStats']>;
    latency?: number;
  }> {
    const startTime = Date.now();
    const connected = await this.testConnection();
    const latency = connected ? Date.now() - startTime : undefined;
    
    return {
      connected,
      poolStats: this.getPoolStats(),
      latency,
    };
  }
}

// Singleton instance
export const db = new DatabaseManager();

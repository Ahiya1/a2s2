import { promises as fs } from "fs";
import * as path from "path";
import { EventEmitter } from "events";
import { DatabaseConfigManager } from "../config/DatabaseConfig";
import { Logger } from "../logging/Logger";
import {
  DatabaseHealth,
  DatabaseOperationResult,
  BulkOperationResult,
} from "../types/DatabaseTypes";

export interface DatabaseConnection {
  execute(sql: string, params?: any[]): Promise<any>;
  query(sql: string, params?: any[]): Promise<any[]>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  close(): Promise<void>;
}

export interface ConnectionPoolStats {
  active: number;
  idle: number;
  total: number;
  created: number;
  destroyed: number;
}

export class DatabaseManager extends EventEmitter {
  private static instance: DatabaseManager;
  private configManager: DatabaseConfigManager;
  private connectionPool: DatabaseConnection[] = [];
  private activeConnections: Set<DatabaseConnection> = new Set();
  private isInitialized: boolean = false;
  private healthCheckInterval?: NodeJS.Timeout;
  private retryQueue: Array<{
    operation: () => Promise<any>;
    resolve: Function;
    reject: Function;
    attempt: number;
  }> = [];

  private constructor() {
    super();
    this.configManager = DatabaseConfigManager.getInstance();
    this.setupErrorHandling();
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private setupErrorHandling(): void {
    this.on("error", (error: Error) => {
      Logger.error("Database error", {
        error: error.message,
        stack: error.stack,
      });
    });

    this.on("connectionError", (error: Error, connection: any) => {
      Logger.error("Database connection error", {
        error: error.message,
        connectionId: connection?.id,
      });
    });

    this.on("queryError", (error: Error, sql: string, params: any[]) => {
      Logger.error("Database query error", {
        error: error.message,
        sql: sql.substring(0, 200),
        paramCount: params?.length || 0,
      });
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      Logger.debug("Database manager already initialized");
      return;
    }

    const config = this.configManager.getConfig();

    if (!config.enabled) {
      Logger.info("Database persistence is disabled");
      this.isInitialized = true;
      return;
    }

    Logger.info("Initializing database manager", {
      type: config.type,
      poolSize: config.poolSize,
      enabled: config.enabled,
    });

    try {
      // Validate configuration
      const validation = this.configManager.validateConfig();
      if (!validation.isValid) {
        throw new Error(
          `Invalid database configuration: ${validation.errors.join(", ")}`
        );
      }

      // Create initial connection pool
      await this.createConnectionPool();

      // Test initial connection
      await this.testConnection();

      // Start health monitoring
      this.startHealthMonitoring();

      this.isInitialized = true;
      this.emit("initialized");

      Logger.info("Database manager initialized successfully", {
        poolSize: this.connectionPool.length,
        type: config.type,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Database manager initialization failed", {
        error: errorMessage,
      });
      this.emit("error", error);
      throw error;
    }
  }

  private async createConnectionPool(): Promise<void> {
    const config = this.configManager.getConfig();
    const connectionConfig = this.configManager.getConnectionConfig();

    // Create connection pool based on database type
    for (let i = 0; i < config.poolSize; i++) {
      try {
        const connection = await this.createConnection(connectionConfig);
        this.connectionPool.push(connection);
        Logger.debug(`Created database connection ${i + 1}/${config.poolSize}`);
      } catch (error) {
        Logger.error(`Failed to create database connection ${i + 1}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
  }

  private async createConnection(
    connectionConfig: any
  ): Promise<DatabaseConnection> {
    const config = this.configManager.getConfig();

    if (config.type === "sqlite") {
      return this.createSQLiteConnection(connectionConfig);
    } else if (config.type === "postgres") {
      return this.createPostgresConnection(connectionConfig);
    } else if (config.type === "mysql") {
      return this.createMySQLConnection(connectionConfig);
    }

    throw new Error(`Unsupported database type: ${config.type}`);
  }

  private async createSQLiteConnection(
    connectionConfig: any
  ): Promise<DatabaseConnection> {
    // Note: This is a simplified SQLite connection implementation
    // In a real implementation, you would use a library like sqlite3 or better-sqlite3

    const dbPath = this.configManager.getDatabasePath();
    if (!dbPath) {
      throw new Error("SQLite database path not found");
    }

    // Ensure database directory exists
    const dbDir = path.dirname(dbPath);
    await fs.mkdir(dbDir, { recursive: true });

    // Mock SQLite connection for this implementation
    const connection: DatabaseConnection = {
      execute: async (sql: string, params?: any[]): Promise<any> => {
        Logger.debug("Executing SQLite query (mock)", {
          sql: sql.substring(0, 100),
          paramCount: params?.length || 0,
        });

        // In real implementation, this would execute against SQLite database
        return { changes: 1, lastInsertRowid: 1 };
      },

      query: async (sql: string, params?: any[]): Promise<any[]> => {
        Logger.debug("Executing SQLite select (mock)", {
          sql: sql.substring(0, 100),
          paramCount: params?.length || 0,
        });

        // In real implementation, this would query SQLite database
        return [];
      },

      beginTransaction: async (): Promise<void> => {
        Logger.debug("Beginning SQLite transaction (mock)");
      },

      commitTransaction: async (): Promise<void> => {
        Logger.debug("Committing SQLite transaction (mock)");
      },

      rollbackTransaction: async (): Promise<void> => {
        Logger.debug("Rolling back SQLite transaction (mock)");
      },

      close: async (): Promise<void> => {
        Logger.debug("Closing SQLite connection (mock)");
      },
    };

    return connection;
  }

  private async createPostgresConnection(
    connectionConfig: any
  ): Promise<DatabaseConnection> {
    throw new Error(
      "PostgreSQL implementation not yet available - use SQLite for now"
    );
  }

  private async createMySQLConnection(
    connectionConfig: any
  ): Promise<DatabaseConnection> {
    throw new Error(
      "MySQL implementation not yet available - use SQLite for now"
    );
  }

  private async testConnection(): Promise<void> {
    const connection = await this.getConnection();

    try {
      // Test basic connectivity
      await connection.query("SELECT 1 as test");
      Logger.debug("Database connection test successful");
    } catch (error) {
      Logger.error("Database connection test failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.releaseConnection(connection);
    }
  }

  private startHealthMonitoring(): void {
    const config = this.configManager.getConfig();

    // Check health every 5 minutes
    this.healthCheckInterval = setInterval(
      async () => {
        try {
          const health = await this.checkHealth();

          if (health.status !== "healthy") {
            Logger.warn("Database health check failed", {
              status: health.status,
              errors: health.errors,
            });
            this.emit("healthCheckFailed", health);
          }
        } catch (error) {
          Logger.error("Health check error", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      5 * 60 * 1000
    ); // 5 minutes
  }

  async getConnection(): Promise<DatabaseConnection> {
    if (!this.isInitialized) {
      throw new Error("Database manager not initialized");
    }

    const config = this.configManager.getConfig();

    if (!config.enabled) {
      throw new Error("Database is disabled");
    }

    // Simple round-robin connection selection
    const connection = this.connectionPool.find(
      (conn) => !this.activeConnections.has(conn)
    );

    if (!connection) {
      // All connections are active, wait or create new one if under limit
      if (this.connectionPool.length < config.poolSize) {
        const connectionConfig = this.configManager.getConnectionConfig();
        const newConnection = await this.createConnection(connectionConfig);
        this.connectionPool.push(newConnection);
        this.activeConnections.add(newConnection);
        return newConnection;
      }

      throw new Error("No available database connections");
    }

    this.activeConnections.add(connection);
    return connection;
  }

  releaseConnection(connection: DatabaseConnection): void {
    this.activeConnections.delete(connection);
  }

  async executeTransaction<T>(
    operation: (connection: DatabaseConnection) => Promise<T>
  ): Promise<DatabaseOperationResult<T>> {
    const startTime = Date.now();
    const connection = await this.getConnection();

    try {
      await connection.beginTransaction();

      const result = await operation(connection);

      await connection.commitTransaction();

      const executionTime = Date.now() - startTime;

      Logger.debug("Transaction completed successfully", {
        executionTime: `${executionTime}ms`,
      });

      return {
        success: true,
        data: result,
        executionTime,
        timestamp: new Date(),
      };
    } catch (error) {
      try {
        await connection.rollbackTransaction();
      } catch (rollbackError) {
        Logger.error("Transaction rollback failed", {
          rollbackError:
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
        });
      }

      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      Logger.error("Transaction failed", {
        error: errorMessage,
        executionTime: `${executionTime}ms`,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime,
        timestamp: new Date(),
      };
    } finally {
      this.releaseConnection(connection);
    }
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries?: number
  ): Promise<T> {
    const config = this.configManager.getConfig();
    const attempts = maxRetries || config.retryAttempts;

    let lastError: Error;

    for (let attempt = 1; attempt <= attempts + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt <= attempts) {
          Logger.warn(
            `Database operation failed, retrying (${attempt}/${attempts})`,
            {
              error: lastError.message,
              nextRetryIn: `${config.retryDelay}ms`,
            }
          );

          await this.delay(config.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    Logger.error("Database operation failed after all retries", {
      attempts: attempts + 1,
      error: lastError!.message,
    });

    throw lastError!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async executeBulkOperation(
    operations: Array<() => Promise<any>>
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    Logger.info("Starting bulk database operation", {
      totalOperations: operations.length,
    });

    const connection = await this.getConnection();

    try {
      await connection.beginTransaction();

      for (const operation of operations) {
        try {
          await operation();
          successCount++;
        } catch (error) {
          failureCount++;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          errors.push(errorMessage);

          Logger.warn("Bulk operation item failed", { error: errorMessage });
        }
      }

      if (failureCount === 0) {
        await connection.commitTransaction();
      } else {
        await connection.rollbackTransaction();
        Logger.warn(
          "Bulk operation partially failed, transaction rolled back",
          {
            successCount,
            failureCount,
          }
        );
      }
    } catch (error) {
      await connection.rollbackTransaction();
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Bulk operation transaction failed", {
        error: errorMessage,
      });
      errors.push(errorMessage);
    } finally {
      this.releaseConnection(connection);
    }

    const executionTime = Date.now() - startTime;
    const success = failureCount === 0;

    Logger.info("Bulk operation completed", {
      success,
      successCount,
      failureCount,
      executionTime: `${executionTime}ms`,
    });

    return {
      success,
      totalRecords: operations.length,
      successCount,
      failureCount,
      errors,
      executionTime,
    };
  }

  // ADDED: Missing createBackup method
  async createBackup(
    backupPath: string
  ): Promise<DatabaseOperationResult<string>> {
    const startTime = Date.now();

    try {
      if (!this.isInitialized) {
        throw new Error("Database manager not initialized");
      }

      const config = this.configManager.getConfig();

      if (!config.enabled) {
        throw new Error("Database is disabled - cannot create backup");
      }

      Logger.info("Creating database backup", { backupPath });

      if (config.type === "sqlite") {
        const dbPath = this.configManager.getDatabasePath();
        if (!dbPath) {
          throw new Error("SQLite database path not found");
        }

        // Ensure backup directory exists
        const backupDir = path.dirname(backupPath);
        await fs.mkdir(backupDir, { recursive: true });

        // Copy the SQLite database file
        await fs.copyFile(dbPath, backupPath);

        Logger.info("SQLite backup created successfully", {
          source: dbPath,
          backup: backupPath,
        });

        return {
          success: true,
          data: backupPath,
          executionTime: Date.now() - startTime,
          timestamp: new Date(),
        };
      } else {
        // For other database types, we would use database-specific backup commands
        throw new Error(
          `Backup not implemented for database type: ${config.type}`
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      Logger.error("Database backup failed", {
        backupPath,
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

  async checkHealth(): Promise<DatabaseHealth> {
    const startTime = Date.now();
    const errors: string[] = [];
    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    try {
      // Basic connectivity test
      const connection = await this.getConnection();

      try {
        await connection.query("SELECT 1");
      } catch (error) {
        errors.push(
          `Connection test failed: ${error instanceof Error ? error.message : String(error)}`
        );
        status = "unhealthy";
      } finally {
        this.releaseConnection(connection);
      }

      // Connection pool health
      const poolStats = this.getConnectionPoolStats();
      if (poolStats.active === poolStats.total) {
        errors.push("All connections in pool are active");
        status = status === "healthy" ? "degraded" : status;
      }

      // Database-specific health checks
      const config = this.configManager.getConfig();
      let storage = { size: 0, freeSpace: 0, fragmentationLevel: 0 };

      if (config.type === "sqlite") {
        try {
          storage = await this.checkSQLiteHealth();
        } catch (error) {
          errors.push(
            `SQLite health check failed: ${error instanceof Error ? error.message : String(error)}`
          );
          status = status === "healthy" ? "degraded" : status;
        }
      }

      return {
        status,
        version: "1.0.0",
        connectionPool: poolStats,
        performance: {
          avgQueryTime: 0, // TODO: Implement query time tracking
          slowQueries: 0,
          failedQueries: 0,
        },
        storage,
        uptime: Date.now() - startTime,
        errors,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        version: "unknown",
        connectionPool: { active: 0, idle: 0, total: 0 },
        performance: { avgQueryTime: 0, slowQueries: 0, failedQueries: 1 },
        storage: { size: 0, freeSpace: 0, fragmentationLevel: 0 },
        uptime: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  private async checkSQLiteHealth(): Promise<{
    size: number;
    freeSpace: number;
    fragmentationLevel: number;
  }> {
    const dbPath = this.configManager.getDatabasePath();
    if (!dbPath) {
      throw new Error("SQLite database path not found");
    }

    try {
      const stats = await fs.stat(dbPath);

      // Get free space in database directory
      const dbDir = path.dirname(dbPath);
      // Note: In real implementation, you would check actual disk space
      const freeSpace = 1000000000; // 1GB placeholder

      return {
        size: stats.size,
        freeSpace,
        fragmentationLevel: 0, // TODO: Calculate from PRAGMA stats
      };
    } catch (error) {
      throw new Error(
        `Failed to check SQLite health: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  getConnectionPoolStats(): ConnectionPoolStats {
    return {
      active: this.activeConnections.size,
      idle: this.connectionPool.length - this.activeConnections.size,
      total: this.connectionPool.length,
      created: this.connectionPool.length, // Simplified tracking
      destroyed: 0, // Simplified tracking
    };
  }

  async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    Logger.info("Closing database manager");

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // Close all connections
    const closePromises = this.connectionPool.map(async (connection) => {
      try {
        await connection.close();
      } catch (error) {
        Logger.warn("Error closing database connection", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.allSettled(closePromises);

    this.connectionPool = [];
    this.activeConnections.clear();
    this.isInitialized = false;
    this.emit("closed");

    Logger.info("Database manager closed");
  }

  // Utility methods
  isEnabled(): boolean {
    return this.configManager.isEnabled();
  }

  isHealthy(): Promise<boolean> {
    return this.checkHealth().then((health) => health.status === "healthy");
  }

  async vacuum(): Promise<void> {
    const config = this.configManager.getConfig();

    if (config.type === "sqlite") {
      Logger.info("Running SQLite VACUUM");
      const connection = await this.getConnection();

      try {
        await connection.execute("VACUUM");
        Logger.info("SQLite VACUUM completed");
      } finally {
        this.releaseConnection(connection);
      }
    } else {
      Logger.info(`VACUUM not supported for database type: ${config.type}`);
    }
  }

  async analyze(): Promise<void> {
    Logger.info("Running database statistics analysis");
    const connection = await this.getConnection();

    try {
      await connection.execute("ANALYZE");
      Logger.info("Database analysis completed");
    } catch (error) {
      Logger.warn("Database analysis failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.releaseConnection(connection);
    }
  }

  // Static utility methods
  static async createTestInstance(): Promise<DatabaseManager> {
    const instance = DatabaseManager.getInstance();
    const configManager = DatabaseConfigManager.getInstance();

    // Use test configuration
    configManager.updateConfig(configManager.createTestConfig());

    await instance.initialize();
    return instance;
  }
}

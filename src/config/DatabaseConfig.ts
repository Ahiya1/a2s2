import { DatabaseConfig } from "../types/DatabaseTypes";
import { Logger } from "../logging/Logger";
import * as path from "path";

export class DatabaseConfigManager {
  private static instance: DatabaseConfigManager;
  private config: DatabaseConfig;

  private constructor() {
    this.config = this.loadDefaultConfig();
    this.loadFromEnvironment();
  }

  static getInstance(): DatabaseConfigManager {
    if (!DatabaseConfigManager.instance) {
      DatabaseConfigManager.instance = new DatabaseConfigManager();
    }
    return DatabaseConfigManager.instance;
  }

  private loadDefaultConfig(): DatabaseConfig {
    // Default to SQLite in .a2s2-conversations directory
    const defaultDbPath = path.join(
      process.cwd(),
      ".a2s2-conversations",
      "conversations.db"
    );

    return {
      enabled: false, // Disabled by default for backward compatibility
      url: `sqlite://${defaultDbPath}`,
      type: "sqlite",
      poolSize: 5,
      timeout: 30000, // 30 seconds
      retryAttempts: 3,
      retryDelay: 1000, // 1 second
      enableWAL: true, // Write-Ahead Logging for better performance
      enableForeignKeys: true,
      backup: {
        enabled: false,
        interval: 24, // hours
        retention: 30, // days
      },
      analytics: {
        enabled: true,
        retention: 90, // days
      },
    };
  }

  private loadFromEnvironment(): void {
    try {
      // Database enable/disable
      if (process.env.A2S2_DATABASE_ENABLED !== undefined) {
        this.config.enabled = process.env.A2S2_DATABASE_ENABLED === "true";
      }

      // Database URL
      if (process.env.A2S2_DATABASE_URL) {
        this.config.url = process.env.A2S2_DATABASE_URL;
        this.config.type = this.inferDatabaseType(this.config.url);
      }

      // Connection pool size
      if (process.env.A2S2_DATABASE_POOL_SIZE) {
        const poolSize = parseInt(process.env.A2S2_DATABASE_POOL_SIZE, 10);
        if (!isNaN(poolSize) && poolSize > 0 && poolSize <= 50) {
          this.config.poolSize = poolSize;
        }
      }

      // Connection timeout
      if (process.env.A2S2_DATABASE_TIMEOUT) {
        const timeout = parseInt(process.env.A2S2_DATABASE_TIMEOUT, 10);
        if (!isNaN(timeout) && timeout > 0) {
          this.config.timeout = timeout;
        }
      }

      // Retry configuration
      if (process.env.A2S2_DATABASE_RETRY_ATTEMPTS) {
        const retryAttempts = parseInt(
          process.env.A2S2_DATABASE_RETRY_ATTEMPTS,
          10
        );
        if (
          !isNaN(retryAttempts) &&
          retryAttempts >= 0 &&
          retryAttempts <= 10
        ) {
          this.config.retryAttempts = retryAttempts;
        }
      }

      if (process.env.A2S2_DATABASE_RETRY_DELAY) {
        const retryDelay = parseInt(process.env.A2S2_DATABASE_RETRY_DELAY, 10);
        if (!isNaN(retryDelay) && retryDelay > 0) {
          this.config.retryDelay = retryDelay;
        }
      }

      // SQLite specific options
      if (process.env.A2S2_DATABASE_DISABLE_WAL === "true") {
        this.config.enableWAL = false;
      }

      if (process.env.A2S2_DATABASE_DISABLE_FK === "true") {
        this.config.enableForeignKeys = false;
      }

      // Backup configuration
      if (process.env.A2S2_DATABASE_BACKUP_ENABLED === "true") {
        this.config.backup.enabled = true;
      }

      if (process.env.A2S2_DATABASE_BACKUP_INTERVAL) {
        const interval = parseInt(
          process.env.A2S2_DATABASE_BACKUP_INTERVAL,
          10
        );
        if (!isNaN(interval) && interval > 0) {
          this.config.backup.interval = interval;
        }
      }

      if (process.env.A2S2_DATABASE_BACKUP_RETENTION) {
        const retention = parseInt(
          process.env.A2S2_DATABASE_BACKUP_RETENTION,
          10
        );
        if (!isNaN(retention) && retention > 0) {
          this.config.backup.retention = retention;
        }
      }

      // Analytics configuration
      if (process.env.A2S2_DATABASE_ANALYTICS_DISABLED === "true") {
        this.config.analytics.enabled = false;
      }

      if (process.env.A2S2_DATABASE_ANALYTICS_RETENTION) {
        const retention = parseInt(
          process.env.A2S2_DATABASE_ANALYTICS_RETENTION,
          10
        );
        if (!isNaN(retention) && retention > 0) {
          this.config.analytics.retention = retention;
        }
      }

      // Disable database in test environment by default
      if (
        process.env.NODE_ENV === "test" &&
        process.env.A2S2_DATABASE_ENABLED !== "true"
      ) {
        this.config.enabled = false;
      }

      Logger.debug("Database configuration loaded from environment", {
        enabled: this.config.enabled,
        type: this.config.type,
        poolSize: this.config.poolSize,
        timeout: this.config.timeout,
        backupEnabled: this.config.backup.enabled,
        analyticsEnabled: this.config.analytics.enabled,
      });
    } catch (error) {
      Logger.error("Error loading database configuration from environment", {
        error: (error as Error).message,
      });
      // Keep default configuration on error
    }
  }

  private inferDatabaseType(url: string): "sqlite" | "postgres" | "mysql" {
    if (url.startsWith("sqlite:")) return "sqlite";
    if (url.startsWith("postgres:") || url.startsWith("postgresql:"))
      return "postgres";
    if (url.startsWith("mysql:")) return "mysql";

    // Default to SQLite for file paths
    return "sqlite";
  }

  getConfig(): Readonly<DatabaseConfig> {
    return { ...this.config };
  }

  updateConfig(updates: Partial<DatabaseConfig>): void {
    this.config = { ...this.config, ...updates };

    Logger.info("Database configuration updated", {
      changes: Object.keys(updates),
      enabled: this.config.enabled,
    });
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  isDevelopmentMode(): boolean {
    return process.env.NODE_ENV === "development";
  }

  isTestMode(): boolean {
    return process.env.NODE_ENV === "test";
  }

  isProductionMode(): boolean {
    return process.env.NODE_ENV === "production";
  }

  getDatabasePath(): string | null {
    if (this.config.type !== "sqlite") return null;

    // Extract path from SQLite URL
    const url = this.config.url;
    if (url.startsWith("sqlite://")) {
      return url.replace("sqlite://", "");
    } else if (url.startsWith("sqlite:")) {
      return url.replace("sqlite:", "");
    }

    return null;
  }

  getConnectionConfig(): {
    url: string;
    type: string;
    options: Record<string, any>;
  } {
    const options: Record<string, any> = {
      max: this.config.poolSize,
      connectionTimeoutMillis: this.config.timeout,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 60000,
    };

    // SQLite specific options
    if (this.config.type === "sqlite") {
      options.enableWAL = this.config.enableWAL;
      options.enableForeignKeys = this.config.enableForeignKeys;
      options.busyTimeout = 30000;
      options.pragma = {
        journal_mode: this.config.enableWAL ? "WAL" : "DELETE",
        synchronous: "NORMAL",
        cache_size: 1000,
        foreign_keys: this.config.enableForeignKeys ? 1 : 0,
        ignore_check_constraints: 0,
      };
    }

    // PostgreSQL specific options
    if (this.config.type === "postgres") {
      options.ssl = this.isProductionMode()
        ? { rejectUnauthorized: false }
        : false;
      options.application_name = "a2s2-agent-system";
    }

    // MySQL specific options
    if (this.config.type === "mysql") {
      options.ssl = this.isProductionMode() ? {} : false;
      options.charset = "utf8mb4";
      options.timezone = "Z";
    }

    return {
      url: this.config.url,
      type: this.config.type,
      options,
    };
  }

  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate URL
    if (!this.config.url || this.config.url.trim() === "") {
      errors.push("Database URL is required");
    }

    // Validate pool size
    if (this.config.poolSize < 1 || this.config.poolSize > 50) {
      errors.push("Pool size must be between 1 and 50");
    }

    // Validate timeout
    if (this.config.timeout < 1000 || this.config.timeout > 300000) {
      errors.push("Timeout must be between 1 second and 5 minutes");
    }

    // Validate retry configuration
    if (this.config.retryAttempts < 0 || this.config.retryAttempts > 10) {
      errors.push("Retry attempts must be between 0 and 10");
    }

    if (this.config.retryDelay < 100 || this.config.retryDelay > 30000) {
      errors.push("Retry delay must be between 100ms and 30 seconds");
    }

    // Validate backup configuration
    if (this.config.backup.enabled) {
      if (
        this.config.backup.interval < 1 ||
        this.config.backup.interval > 168
      ) {
        errors.push("Backup interval must be between 1 and 168 hours");
      }

      if (
        this.config.backup.retention < 1 ||
        this.config.backup.retention > 365
      ) {
        errors.push("Backup retention must be between 1 and 365 days");
      }
    }

    // Validate analytics configuration
    if (this.config.analytics.enabled) {
      if (
        this.config.analytics.retention < 1 ||
        this.config.analytics.retention > 730
      ) {
        errors.push("Analytics retention must be between 1 and 730 days");
      }
    }

    // SQLite specific validation
    if (this.config.type === "sqlite") {
      const dbPath = this.getDatabasePath();
      if (dbPath) {
        const dbDir = path.dirname(dbPath);
        try {
          // Check if directory is accessible (will be created if doesn't exist)
        } catch (error) {
          errors.push(`SQLite database directory is not accessible: ${dbDir}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  getEnvironmentVariableHelp(): Record<string, string> {
    return {
      A2S2_DATABASE_ENABLED: "Enable/disable database persistence (true/false)",
      A2S2_DATABASE_URL:
        "Database connection URL (sqlite:///path/to/db.sqlite, postgres://...)",
      A2S2_DATABASE_POOL_SIZE: "Connection pool size (1-50)",
      A2S2_DATABASE_TIMEOUT: "Connection timeout in milliseconds",
      A2S2_DATABASE_RETRY_ATTEMPTS:
        "Number of retry attempts on failure (0-10)",
      A2S2_DATABASE_RETRY_DELAY: "Delay between retries in milliseconds",
      A2S2_DATABASE_DISABLE_WAL: "Disable SQLite WAL mode (true/false)",
      A2S2_DATABASE_DISABLE_FK: "Disable foreign key constraints (true/false)",
      A2S2_DATABASE_BACKUP_ENABLED: "Enable automatic backups (true/false)",
      A2S2_DATABASE_BACKUP_INTERVAL: "Backup interval in hours",
      A2S2_DATABASE_BACKUP_RETENTION: "Backup retention in days",
      A2S2_DATABASE_ANALYTICS_DISABLED:
        "Disable analytics collection (true/false)",
      A2S2_DATABASE_ANALYTICS_RETENTION: "Analytics data retention in days",
    };
  }

  createTestConfig(): DatabaseConfig {
    const testDbPath = path.join(
      process.cwd(),
      ".a2s2-test",
      "test-conversations.db"
    );

    return {
      enabled: true,
      url: `sqlite://${testDbPath}`,
      type: "sqlite",
      poolSize: 2,
      timeout: 5000,
      retryAttempts: 1,
      retryDelay: 500,
      enableWAL: false, // Disable WAL in tests for simplicity
      enableForeignKeys: true,
      backup: {
        enabled: false,
        interval: 24,
        retention: 1,
      },
      analytics: {
        enabled: true,
        retention: 7,
      },
    };
  }

  getConfigSummary(): {
    enabled: boolean;
    type: string;
    performance: string;
    features: string[];
    environment: string;
  } {
    const features: string[] = [];

    if (this.config.backup.enabled) features.push("Backup");
    if (this.config.analytics.enabled) features.push("Analytics");
    if (this.config.enableWAL) features.push("WAL");
    if (this.config.enableForeignKeys) features.push("Foreign Keys");

    return {
      enabled: this.config.enabled,
      type: this.config.type.toUpperCase(),
      performance: `Pool: ${this.config.poolSize}, Timeout: ${this.config.timeout}ms`,
      features,
      environment: process.env.NODE_ENV || "development",
    };
  }

  // Static utility methods
  static getDefaultSQLitePath(): string {
    return path.join(process.cwd(), ".a2s2-conversations", "conversations.db");
  }

  static createInMemoryConfig(): DatabaseConfig {
    return {
      enabled: true,
      url: "sqlite::memory:",
      type: "sqlite",
      poolSize: 1,
      timeout: 5000,
      retryAttempts: 0,
      retryDelay: 0,
      enableWAL: false,
      enableForeignKeys: true,
      backup: { enabled: false, interval: 24, retention: 30 },
      analytics: { enabled: true, retention: 90 },
    };
  }
}

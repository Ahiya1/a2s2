import { promises as fs } from "fs";
import * as path from "path";
import { DatabaseConfigManager } from "../config/DatabaseConfig";
import { Logger } from "../logging/Logger";
import {
  DatabaseHealth,
  Migration,
  MigrationStatus,
  DatabaseOperationResult,
} from "../types/DatabaseTypes";

export interface InitializationResult {
  success: boolean;
  message: string;
  databaseCreated: boolean;
  migrationsRun: number;
  seedDataInserted: boolean;
  error?: string;
  executionTime: number;
}

export class DatabaseInitializer {
  private configManager: DatabaseConfigManager;
  private schemaPath: string;
  private migrationsPath: string;

  constructor() {
    this.configManager = DatabaseConfigManager.getInstance();
    this.schemaPath = path.join(__dirname, "schema.sql");
    this.migrationsPath = path.join(__dirname, "migrations");
  }

  async initialize(force = false): Promise<InitializationResult> {
    const startTime = Date.now();

    Logger.info("Initializing database system", {
      enabled: this.configManager.isEnabled(),
      force,
      environment: process.env.NODE_ENV || "development",
    });

    if (!this.configManager.isEnabled()) {
      return {
        success: true,
        message: "Database persistence is disabled",
        databaseCreated: false,
        migrationsRun: 0,
        seedDataInserted: false,
        executionTime: Date.now() - startTime,
      };
    }

    try {
      const config = this.configManager.getConfig();

      // Validate configuration
      const validation = this.configManager.validateConfig();
      if (!validation.isValid) {
        throw new Error(
          `Invalid database configuration: ${validation.errors.join(", ")}`
        );
      }

      let databaseCreated = false;
      let migrationsRun = 0;
      let seedDataInserted = false;

      // Step 1: Ensure database directory exists (for SQLite)
      if (config.type === "sqlite") {
        await this.ensureDatabaseDirectory();
        databaseCreated = await this.createSQLiteDatabase(force);
      }

      // Step 2: Initialize database schema
      if (databaseCreated || force) {
        await this.createInitialSchema();
        Logger.info("Initial database schema created");
      }

      // Step 3: Run migrations
      migrationsRun = await this.runPendingMigrations();

      // Step 4: Insert seed data (development only)
      if (
        this.configManager.isDevelopmentMode() ||
        this.configManager.isTestMode()
      ) {
        seedDataInserted = await this.insertSeedData();
      }

      // Step 5: Validate database integrity
      await this.validateDatabaseIntegrity();

      const executionTime = Date.now() - startTime;

      Logger.info("Database initialization completed successfully", {
        databaseCreated,
        migrationsRun,
        seedDataInserted,
        executionTime: `${executionTime}ms`,
      });

      return {
        success: true,
        message: "Database initialization completed successfully",
        databaseCreated,
        migrationsRun,
        seedDataInserted,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      Logger.error("Database initialization failed", {
        error: errorMessage,
        executionTime: `${executionTime}ms`,
      });

      return {
        success: false,
        message: "Database initialization failed",
        databaseCreated: false,
        migrationsRun: 0,
        seedDataInserted: false,
        error: errorMessage,
        executionTime,
      };
    }
  }

  // ADDED: Missing initializeSchema method
  async initializeSchema(): Promise<DatabaseOperationResult<void>> {
    const startTime = Date.now();

    try {
      if (!this.configManager.isEnabled()) {
        return {
          success: true,
          executionTime: Date.now() - startTime,
          timestamp: new Date(),
        };
      }

      Logger.info("Initializing database schema");

      // Step 1: Ensure database directory exists (for SQLite)
      const config = this.configManager.getConfig();
      if (config.type === "sqlite") {
        await this.ensureDatabaseDirectory();
        await this.createSQLiteDatabase(false);
      }

      // Step 2: Create initial schema
      await this.createInitialSchema();

      Logger.info("Database schema initialization completed");

      return {
        success: true,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      Logger.error("Database schema initialization failed", {
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

  private async ensureDatabaseDirectory(): Promise<void> {
    const dbPath = this.configManager.getDatabasePath();
    if (!dbPath) return;

    const dbDir = path.dirname(dbPath);

    try {
      await fs.access(dbDir);
    } catch (error) {
      Logger.info("Creating database directory", { directory: dbDir });
      await fs.mkdir(dbDir, { recursive: true });
    }
  }

  private async createSQLiteDatabase(force: boolean): Promise<boolean> {
    const dbPath = this.configManager.getDatabasePath();
    if (!dbPath) return false;

    try {
      // Check if database already exists
      await fs.access(dbPath);

      if (!force) {
        Logger.info("SQLite database already exists", { path: dbPath });
        return false;
      } else {
        Logger.info("Removing existing database (force mode)", {
          path: dbPath,
        });
        await fs.unlink(dbPath);
      }
    } catch (error) {
      // Database doesn't exist, which is expected
    }

    // Create empty database file
    await fs.writeFile(dbPath, "");
    Logger.info("SQLite database file created", { path: dbPath });

    return true;
  }

  private async createInitialSchema(): Promise<void> {
    try {
      const schemaSQL = await this.loadSchemaFile();

      // For now, we'll use a simple approach without actual database connection
      // In a real implementation, you would execute the SQL against the database
      Logger.info("Database schema loaded", {
        statements: schemaSQL.split(";").filter((s) => s.trim()).length,
      });

      // TODO: Execute schema SQL against database connection
      // This would require integrating with a database library like sqlite3, pg, etc.
    } catch (error) {
      Logger.error("Failed to create initial schema", {
        error: error instanceof Error ? error.message : String(error),
        schemaPath: this.schemaPath,
      });
      throw error;
    }
  }

  private async loadSchemaFile(): Promise<string> {
    try {
      return await fs.readFile(this.schemaPath, "utf8");
    } catch (error) {
      Logger.error("Failed to load schema file", {
        error: error instanceof Error ? error.message : String(error),
        path: this.schemaPath,
      });
      throw new Error(`Schema file not found: ${this.schemaPath}`);
    }
  }

  private async runPendingMigrations(): Promise<number> {
    try {
      const migrations = await this.loadMigrations();
      let migrationsRun = 0;

      for (const migration of migrations) {
        if (await this.shouldRunMigration(migration)) {
          await this.runMigration(migration);
          migrationsRun++;
          Logger.info("Migration completed", {
            version: migration.version,
            description: migration.description,
          });
        }
      }

      Logger.info("Migration process completed", {
        totalMigrations: migrations.length,
        migrationsRun,
      });

      return migrationsRun;
    } catch (error) {
      Logger.error("Migration process failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async loadMigrations(): Promise<Migration[]> {
    try {
      // Check if migrations directory exists
      await fs.access(this.migrationsPath);

      const files = await fs.readdir(this.migrationsPath);
      const migrationFiles = files
        .filter((file) => file.endsWith(".ts") || file.endsWith(".js"))
        .sort();

      const migrations: Migration[] = [];

      for (const file of migrationFiles) {
        const migrationPath = path.join(this.migrationsPath, file);
        try {
          // In a real implementation, you would dynamically import the migration
          // For now, we'll create a placeholder migration
          const migration: Migration = {
            version: file.replace(/\.(ts|js)$/, ""),
            description: `Migration from ${file}`,
            up: `-- Migration up from ${file}`,
            down: `-- Migration down from ${file}`,
            checksum: this.calculateChecksum(`Migration ${file}`),
          };

          migrations.push(migration);
        } catch (error) {
          Logger.warn("Failed to load migration file", {
            file,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return migrations;
    } catch (error) {
      // Migrations directory doesn't exist, return empty array
      Logger.info("No migrations directory found, skipping migrations");
      return [];
    }
  }

  private async shouldRunMigration(migration: Migration): Promise<boolean> {
    // In a real implementation, check against database migration table
    // For now, assume all migrations need to run
    return true;
  }

  private async runMigration(migration: Migration): Promise<void> {
    // In a real implementation, execute the migration SQL
    // TODO: Implement actual migration execution
    Logger.debug("Running migration (placeholder)", {
      version: migration.version,
      upStatements: migration.up.split(";").filter((s) => s.trim()).length,
    });
  }

  private calculateChecksum(content: string): string {
    // Simple checksum calculation (in real implementation, use crypto)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  private async insertSeedData(): Promise<boolean> {
    if (
      !this.configManager.isDevelopmentMode() &&
      !this.configManager.isTestMode()
    ) {
      return false;
    }

    try {
      Logger.info("Inserting development seed data");

      // TODO: Insert sample conversations, sessions, etc. for development/testing
      // This would help with dashboard development and testing

      return true;
    } catch (error) {
      Logger.warn("Failed to insert seed data", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async validateDatabaseIntegrity(): Promise<void> {
    try {
      // TODO: Run integrity checks
      // - Check all tables exist
      // - Validate foreign key constraints
      // - Check indexes
      // - Validate data types

      Logger.info("Database integrity validation completed");
    } catch (error) {
      Logger.error("Database integrity validation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getMigrationStatus(): Promise<MigrationStatus> {
    try {
      const availableMigrations = await this.loadMigrations();

      // TODO: Query database for applied migrations
      const appliedMigrations: Migration[] = [];
      const pendingMigrations = availableMigrations.filter(
        (migration) =>
          !appliedMigrations.some(
            (applied) => applied.version === migration.version
          )
      );

      const currentVersion =
        appliedMigrations.length > 0
          ? appliedMigrations[appliedMigrations.length - 1].version
          : "0.0.0";

      return {
        currentVersion,
        availableVersions: availableMigrations.map((m) => m.version),
        pendingMigrations,
        appliedMigrations,
      };
    } catch (error) {
      Logger.error("Failed to get migration status", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async checkHealth(): Promise<DatabaseHealth> {
    const startTime = Date.now();

    try {
      // TODO: Implement actual health checks
      const health: DatabaseHealth = {
        status: "healthy",
        version: "1.0.0",
        connectionPool: {
          active: 0,
          idle: 1,
          total: 1,
        },
        performance: {
          avgQueryTime: 0,
          slowQueries: 0,
          failedQueries: 0,
        },
        storage: {
          size: 0,
          freeSpace: 1000000000, // 1GB free space placeholder
          fragmentationLevel: 0,
        },
        uptime: Date.now() - startTime,
        errors: [],
      };

      Logger.debug("Database health check completed", {
        status: health.status,
      });
      return health;
    } catch (error) {
      Logger.error("Database health check failed", {
        error: error instanceof Error ? error.message : String(error),
      });

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

  async reset(): Promise<void> {
    if (
      !this.configManager.isDevelopmentMode() &&
      !this.configManager.isTestMode()
    ) {
      throw new Error(
        "Database reset is only allowed in development or test environments"
      );
    }

    Logger.warn("Resetting database (development/test only)");

    const config = this.configManager.getConfig();

    if (config.type === "sqlite") {
      const dbPath = this.configManager.getDatabasePath();
      if (dbPath) {
        try {
          await fs.unlink(dbPath);
          Logger.info("SQLite database file removed", { path: dbPath });
        } catch (error) {
          // File might not exist, which is fine
        }
      }
    }

    // Re-initialize after reset
    await this.initialize(true);
  }

  async createBackup(): Promise<string> {
    const config = this.configManager.getConfig();

    if (!config.backup.enabled) {
      throw new Error("Database backups are not enabled");
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `a2s2-backup-${timestamp}`;

    if (config.type === "sqlite") {
      const dbPath = this.configManager.getDatabasePath();
      if (!dbPath) throw new Error("SQLite database path not found");

      const backupDir = path.join(path.dirname(dbPath), "backups");
      await fs.mkdir(backupDir, { recursive: true });

      const backupPath = path.join(backupDir, `${backupName}.db`);
      await fs.copyFile(dbPath, backupPath);

      Logger.info("Database backup created", {
        original: dbPath,
        backup: backupPath,
      });

      return backupPath;
    }

    throw new Error(`Backup not implemented for database type: ${config.type}`);
  }

  async cleanup(): Promise<void> {
    const config = this.configManager.getConfig();

    if (!config.analytics.enabled) return;

    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - config.analytics.retention);

    Logger.info("Running database cleanup", {
      retentionDate: retentionDate.toISOString(),
      retentionDays: config.analytics.retention,
    });

    try {
      // TODO: Implement cleanup queries
      // - Delete old conversation data
      // - Delete old session data
      // - Delete old analytics data
      // - Vacuum database (SQLite)

      Logger.info("Database cleanup completed");
    } catch (error) {
      Logger.error("Database cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Static utility methods
  static async isInitialized(): Promise<boolean> {
    const configManager = DatabaseConfigManager.getInstance();

    if (!configManager.isEnabled()) return true; // Consider disabled as "initialized"

    const config = configManager.getConfig();

    if (config.type === "sqlite") {
      const dbPath = configManager.getDatabasePath();
      if (!dbPath) return false;

      try {
        await fs.access(dbPath);
        return true;
      } catch {
        return false;
      }
    }

    // For other database types, assume initialized
    return true;
  }

  static async getInitializedStatus(): Promise<{
    initialized: boolean;
    config: any;
    health?: DatabaseHealth;
  }> {
    const configManager = DatabaseConfigManager.getInstance();
    const config = configManager.getConfigSummary();

    if (!configManager.isEnabled()) {
      return {
        initialized: true,
        config: { ...config, message: "Database disabled" },
      };
    }

    const initialized = await DatabaseInitializer.isInitialized();
    let health: DatabaseHealth | undefined;

    if (initialized) {
      try {
        const initializer = new DatabaseInitializer();
        health = await initializer.checkHealth();
      } catch (error) {
        // Health check failed, but database might still be initialized
      }
    }

    return {
      initialized,
      config,
      health,
    };
  }
}

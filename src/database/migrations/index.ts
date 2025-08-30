import { DatabaseManager } from "../DatabaseManager";
import { Logger } from "../../logging/Logger";
import {
  Migration,
  MigrationStatus,
  DatabaseOperationResult,
} from "../../types/DatabaseTypes";
import * as crypto from "crypto";

export interface MigrationExecutor {
  version: string;
  description: string;
  up(): Promise<void>;
  down(): Promise<void>;
}

export class MigrationManager {
  private dbManager: DatabaseManager;
  private migrations: MigrationExecutor[] = [];

  constructor() {
    this.dbManager = DatabaseManager.getInstance();
    this.loadMigrations();
  }

  private loadMigrations(): void {
    // Register all migrations in order
    this.registerMigration(new InitialSchemaMigration());
    this.registerMigration(new AddStreamingTimeMigration());
    this.registerMigration(new AddFullTextSearchMigration());
    // Add new migrations here as they are created
  }

  private registerMigration(migration: MigrationExecutor): void {
    this.migrations.push(migration);
    Logger.debug("Registered migration", {
      version: migration.version,
      description: migration.description,
    });
  }

  async getMigrationStatus(): Promise<MigrationStatus> {
    try {
      const appliedMigrations = await this.getAppliedMigrations();
      const pendingMigrations = this.migrations.filter(
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
        availableVersions: this.migrations.map((m) => m.version),
        pendingMigrations: pendingMigrations.map((m) =>
          this.migrationExecutorToMigration(m)
        ),
        appliedMigrations,
      };
    } catch (error) {
      Logger.error("Failed to get migration status", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async runPendingMigrations(): Promise<DatabaseOperationResult<number>> {
    const startTime = Date.now();
    let migrationsRun = 0;

    try {
      await this.ensureMigrationTable();

      const status = await this.getMigrationStatus();
      const pendingMigrations = this.migrations.filter(
        (migration) =>
          !status.appliedMigrations.some(
            (applied) => applied.version === migration.version
          )
      );

      if (pendingMigrations.length === 0) {
        Logger.info("No pending migrations to run");
        return {
          success: true,
          data: 0,
          executionTime: Date.now() - startTime,
          timestamp: new Date(),
        };
      }

      Logger.info("Running pending migrations", {
        count: pendingMigrations.length,
        migrations: pendingMigrations.map((m) => m.version),
      });

      for (const migration of pendingMigrations) {
        await this.runMigration(migration);
        migrationsRun++;

        Logger.info("Migration completed successfully", {
          version: migration.version,
          description: migration.description,
        });
      }

      return {
        success: true,
        data: migrationsRun,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Migration process failed", {
        error: errorMessage,
        migrationsRun,
      });

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  // ADDED: Wrapper method for compatibility with existing calls
  async runMigrations(): Promise<DatabaseOperationResult<number>> {
    return this.runPendingMigrations();
  }

  // ADDED: Wrapper method that returns pending migrations list
  async getPendingMigrations(): Promise<Migration[]> {
    try {
      const status = await this.getMigrationStatus();
      return status.pendingMigrations;
    } catch (error) {
      Logger.error("Failed to get pending migrations", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async runMigration(migration: MigrationExecutor): Promise<void> {
    const migrationRecord = this.migrationExecutorToMigration(migration);

    const result = await this.dbManager.executeTransaction(
      async (connection) => {
        Logger.info("Running migration", {
          version: migration.version,
          description: migration.description,
        });

        // Execute the migration
        await migration.up();

        // Record the migration as applied
        await connection.execute(
          `
        INSERT INTO schema_migrations (version, description, checksum, applied_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `,
          [
            migrationRecord.version,
            migrationRecord.description,
            migrationRecord.checksum,
          ]
        );

        return migrationRecord.version;
      }
    );

    if (!result.success) {
      throw new Error(`Migration ${migration.version} failed: ${result.error}`);
    }
  }

  async rollbackMigration(
    version: string
  ): Promise<DatabaseOperationResult<void>> {
    const startTime = Date.now();

    try {
      const migration = this.migrations.find((m) => m.version === version);
      if (!migration) {
        throw new Error(`Migration ${version} not found`);
      }

      const appliedMigrations = await this.getAppliedMigrations();
      const isApplied = appliedMigrations.some((m) => m.version === version);

      if (!isApplied) {
        throw new Error(`Migration ${version} is not applied`);
      }

      Logger.info("Rolling back migration", {
        version: migration.version,
        description: migration.description,
      });

      const result = await this.dbManager.executeTransaction(
        async (connection) => {
          // Execute the rollback
          await migration.down();

          // Remove the migration record
          await connection.execute(
            "DELETE FROM schema_migrations WHERE version = ?",
            [version]
          );

          return undefined;
        }
      );

      if (!result.success) {
        throw new Error(
          `Migration rollback ${version} failed: ${result.error}`
        );
      }

      Logger.info("Migration rolled back successfully", { version });

      return {
        success: true,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Migration rollback failed", {
        version,
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

  // ADDED: Method to get migrations to rollback
  async getMigrationsToRollback(steps: number): Promise<Migration[]> {
    try {
      const appliedMigrations = await this.getAppliedMigrations();

      // Sort by version descending and take the specified number of steps
      const migrationsToRollback = appliedMigrations
        .sort((a, b) => this.compareVersions(b.version, a.version))
        .slice(0, steps);

      Logger.debug("Identified migrations to rollback", {
        steps,
        migrations: migrationsToRollback.map((m) => m.version),
      });

      return migrationsToRollback;
    } catch (error) {
      Logger.error("Failed to get migrations to rollback", {
        steps,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ADDED: Method to rollback multiple migrations
  async rollbackMigrations(
    migrations: Migration[]
  ): Promise<DatabaseOperationResult<void>> {
    const startTime = Date.now();

    try {
      Logger.info("Rolling back multiple migrations", {
        count: migrations.length,
        migrations: migrations.map((m) => m.version),
      });

      // Rollback migrations in reverse order
      for (const migration of migrations) {
        const result = await this.rollbackMigration(migration.version);
        if (!result.success) {
          throw new Error(
            `Failed to rollback migration ${migration.version}: ${result.error}`
          );
        }
      }

      Logger.info("Multiple migrations rolled back successfully", {
        count: migrations.length,
      });

      return {
        success: true,
        executionTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Multiple migration rollback failed", {
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

  // ADDED: Instance method for getCurrentVersion (in addition to static method)
  async getCurrentVersion(): Promise<string> {
    try {
      const status = await this.getMigrationStatus();
      return status.currentVersion;
    } catch (error) {
      Logger.error("Failed to get current version", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async validateMigrations(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Check for duplicate versions
      const versions = this.migrations.map((m) => m.version);
      const duplicateVersions = versions.filter(
        (version, index) => versions.indexOf(version) !== index
      );

      if (duplicateVersions.length > 0) {
        errors.push(
          `Duplicate migration versions: ${duplicateVersions.join(", ")}`
        );
      }

      // Check version ordering (should be sequential)
      for (let i = 1; i < this.migrations.length; i++) {
        const current = this.migrations[i].version;
        const previous = this.migrations[i - 1].version;

        if (this.compareVersions(current, previous) <= 0) {
          errors.push(
            `Migration version ${current} should be greater than ${previous}`
          );
        }
      }

      // Validate migration integrity against applied migrations
      const appliedMigrations = await this.getAppliedMigrations();

      for (const applied of appliedMigrations) {
        const migration = this.migrations.find(
          (m) => m.version === applied.version
        );
        if (!migration) {
          errors.push(
            `Applied migration ${applied.version} not found in available migrations`
          );
          continue;
        }

        const expectedChecksum = this.calculateChecksum(migration);
        if (applied.checksum !== expectedChecksum) {
          errors.push(
            `Migration ${applied.version} checksum mismatch - migration may have been modified after application`
          );
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch (error) {
      Logger.error("Migration validation failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        isValid: false,
        errors: [
          `Validation error: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  }

  private async ensureMigrationTable(): Promise<void> {
    const result = await this.dbManager.executeTransaction(
      async (connection) => {
        await connection.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      }
    );

    if (!result.success) {
      throw new Error(`Failed to create migration table: ${result.error}`);
    }
  }

  // CHANGED: Made public instead of private
  async getAppliedMigrations(): Promise<Migration[]> {
    const result = await this.dbManager.executeTransaction(
      async (connection) => {
        const rows = await connection.query(
          "SELECT * FROM schema_migrations ORDER BY version",
          []
        );

        return rows.map((row) => ({
          version: row.version,
          description: row.description,
          up: "", // Not stored
          down: "", // Not stored
          checksum: row.checksum,
          appliedAt: new Date(row.applied_at),
        }));
      }
    );

    if (!result.success) {
      throw new Error(`Failed to get applied migrations: ${result.error}`);
    }

    return result.data || [];
  }

  private migrationExecutorToMigration(executor: MigrationExecutor): Migration {
    return {
      version: executor.version,
      description: executor.description,
      up: `-- Migration up code for ${executor.version}`,
      down: `-- Migration down code for ${executor.version}`,
      checksum: this.calculateChecksum(executor),
    };
  }

  private calculateChecksum(migration: MigrationExecutor): string {
    const content = `${migration.version}:${migration.description}:${migration.up.toString()}:${migration.down.toString()}`;
    return crypto.createHash("md5").update(content).digest("hex");
  }

  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split(".").map(Number);
    const v2Parts = version2.split(".").map(Number);

    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }

    return 0;
  }

  // Static utility methods
  static async getCurrentVersion(): Promise<string> {
    const manager = new MigrationManager();
    const status = await manager.getMigrationStatus();
    return status.currentVersion;
  }

  static async hasPendingMigrations(): Promise<boolean> {
    const manager = new MigrationManager();
    const status = await manager.getMigrationStatus();
    return status.pendingMigrations.length > 0;
  }
}

// Migration implementations
class InitialSchemaMigration implements MigrationExecutor {
  version = "1.0.0";
  description = "Initial database schema";

  async up(): Promise<void> {
    const dbManager = DatabaseManager.getInstance();

    await dbManager.executeTransaction(async (connection) => {
      // This migration is handled by schema.sql
      // Just ensure the basic structure is in place
      await connection.execute(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'
      `);

      Logger.debug("Initial schema migration executed");
    });
  }

  async down(): Promise<void> {
    const dbManager = DatabaseManager.getInstance();

    await dbManager.executeTransaction(async (connection) => {
      // Drop all tables in reverse dependency order
      const tables = [
        "validation_results",
        "cost_tracking",
        "file_operations",
        "tool_executions",
        "phase_transitions",
        "agent_sessions",
        "conversations_fts",
        "conversations",
      ];

      for (const table of tables) {
        await connection.execute(`DROP TABLE IF EXISTS ${table}`);
      }

      Logger.debug("Initial schema migration rolled back");
    });
  }
}

class AddStreamingTimeMigration implements MigrationExecutor {
  version = "1.1.0";
  description = "Add streaming time tracking to agent sessions";

  async up(): Promise<void> {
    const dbManager = DatabaseManager.getInstance();

    await dbManager.executeTransaction(async (connection) => {
      // Check if column already exists
      const result = await connection.query(`
        PRAGMA table_info(agent_sessions)
      `);

      const hasStreamingTime = result.some(
        (row) => row.name === "streaming_time"
      );

      if (!hasStreamingTime) {
        await connection.execute(`
          ALTER TABLE agent_sessions 
          ADD COLUMN streaming_time INTEGER
        `);

        Logger.debug("Added streaming_time column to agent_sessions");
      }
    });
  }

  async down(): Promise<void> {
    // SQLite doesn't support DROP COLUMN, so we would need to recreate the table
    // For simplicity, this is a no-op in development
    Logger.debug("Streaming time migration rollback (no-op in SQLite)");
  }
}

class AddFullTextSearchMigration implements MigrationExecutor {
  version = "1.2.0";
  description = "Add full-text search capability for conversations";

  async up(): Promise<void> {
    const dbManager = DatabaseManager.getInstance();

    await dbManager.executeTransaction(async (connection) => {
      // Create FTS virtual table if it doesn't exist
      await connection.execute(`
        CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
          conversation_id,
          project_context,
          conversation_history,
          content=conversations,
          content_rowid=id
        )
      `);

      // Populate FTS table with existing data
      await connection.execute(`
        INSERT INTO conversations_fts(rowid, conversation_id, project_context, conversation_history)
        SELECT id, conversation_id, project_context, conversation_history 
        FROM conversations
      `);

      Logger.debug("Full-text search migration completed");
    });
  }

  async down(): Promise<void> {
    const dbManager = DatabaseManager.getInstance();

    await dbManager.executeTransaction(async (connection) => {
      await connection.execute("DROP TABLE IF EXISTS conversations_fts");
      Logger.debug("Full-text search migration rolled back");
    });
  }
}

// Export the migration manager and individual migrations
export default MigrationManager;
export {
  InitialSchemaMigration,
  AddStreamingTimeMigration,
  AddFullTextSearchMigration,
};

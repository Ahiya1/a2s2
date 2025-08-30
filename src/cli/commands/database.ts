import { Command } from "commander";
import { DatabaseCLI } from "../../database/DatabaseCLI";
import { Logger } from "../../logging/Logger";
import { OutputFormatter } from "../utils/output";

export function createDatabaseCommand(): Command {
  const command = new Command("database")
    .alias("db")
    .description("Database management operations");

  // Initialize database
  command
    .command("init")
    .description("Initialize database schema and run migrations")
    .option("-f, --force", "Force reinitialization (drops existing data)")
    .option("--seed", "Insert seed data for development")
    .action(async (options) => {
      try {
        const dbCLI = new DatabaseCLI();
        const result = await dbCLI.initialize(options.force, options.seed);

        if (result.success) {
          OutputFormatter.formatSuccess("Database initialization completed");
          console.log(`  Database Created: ${result.databaseCreated}`);
          console.log(`  Migrations Run: ${result.migrationsRun}`);
          console.log(`  Seed Data Inserted: ${result.seedDataInserted}`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
        } else {
          OutputFormatter.formatError("Database initialization failed");
          console.log(`  Error: ${result.error}`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
          process.exit(1);
        }
      } catch (error) {
        OutputFormatter.formatError("Database initialization error");
        console.log(
          `  Error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Run migrations
  command
    .command("migrate")
    .description("Run pending database migrations")
    .option(
      "--dry-run",
      "Show what migrations would be run without executing them"
    )
    .action(async (options) => {
      try {
        const dbCLI = new DatabaseCLI();

        if (options.dryRun) {
          const pending = await dbCLI.getPendingMigrations();
          if (pending.length === 0) {
            OutputFormatter.formatInfo("No pending migrations");
          } else {
            OutputFormatter.formatInfo("Pending migrations:");
            pending.forEach((m) => {
              console.log(`  • ${m.version}: ${m.description}`);
            });
          }
        } else {
          const result = await dbCLI.runMigrations();
          if (result.success) {
            OutputFormatter.formatSuccess("Migrations completed");
            console.log(`  Migrations Run: ${result.migrationsRun}`);
            console.log(`  Execution Time: ${result.executionTime}ms`);
          } else {
            OutputFormatter.formatError("Migration failed");
            console.log(`  Error: ${result.error}`);
            console.log(`  Execution Time: ${result.executionTime}ms`);
            process.exit(1);
          }
        }
      } catch (error) {
        OutputFormatter.formatError("Migration error");
        console.log(
          `  Error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Rollback migrations
  command
    .command("rollback")
    .description("Rollback database migrations")
    .option("-s, --steps <number>", "Number of migrations to rollback", "1")
    .option("--dry-run", "Show what migrations would be rolled back")
    .action(async (options) => {
      try {
        const dbCLI = new DatabaseCLI();
        const steps = parseInt(options.steps, 10);

        if (options.dryRun) {
          const toRollback = await dbCLI.getMigrationsToRollback(steps);
          if (toRollback.length === 0) {
            OutputFormatter.formatInfo("No migrations to rollback");
          } else {
            OutputFormatter.formatInfo("Migrations to rollback:");
            toRollback.forEach((m) => {
              console.log(`  • ${m.version}: ${m.description}`);
            });
          }
        } else {
          const result = await dbCLI.rollbackMigrations(steps);
          if (result.success) {
            OutputFormatter.formatSuccess("Rollback completed");
            console.log(
              `  Migrations Rolled Back: ${result.migrationsRolledBack}`
            );
            console.log(`  Execution Time: ${result.executionTime}ms`);
          } else {
            OutputFormatter.formatError("Rollback failed");
            console.log(`  Error: ${result.error}`);
            console.log(`  Execution Time: ${result.executionTime}ms`);
            process.exit(1);
          }
        }
      } catch (error) {
        OutputFormatter.formatError("Rollback error");
        console.log(
          `  Error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Database status
  command
    .command("status")
    .description("Show database status and migration information")
    .action(async () => {
      try {
        const dbCLI = new DatabaseCLI();
        const status = await dbCLI.getStatus();

        OutputFormatter.formatHeader("Database Status");
        console.log(`  Initialized: ${status.initialized}`);
        console.log(`  Healthy: ${status.healthy}`);
        console.log(`  Version: ${status.currentVersion}`);
        console.log(`  Pending Migrations: ${status.pendingMigrations.length}`);
        console.log(`  Total Conversations: ${status.totalConversations}`);
        console.log(`  Total Sessions: ${status.totalSessions}`);

        if (status.connectionPoolStats) {
          console.log("\n  Connection Pool:");
          console.log(`    Active: ${status.connectionPoolStats.active}`);
          console.log(`    Idle: ${status.connectionPoolStats.idle}`);
          console.log(`    Total: ${status.connectionPoolStats.total}`);
        }

        if (status.pendingMigrations.length > 0) {
          OutputFormatter.formatSection("Pending Migrations");
          status.pendingMigrations.forEach((m) => {
            console.log(`  • ${m.version}: ${m.description}`);
          });
        }
      } catch (error) {
        OutputFormatter.formatError("Status check error");
        console.log(
          `  Error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Export data
  command
    .command("export")
    .description("Export database data")
    .option("-f, --format <format>", "Export format (json, csv, sql)", "json")
    .option("-o, --output <path>", "Output file path")
    .option("-t, --tables <tables>", "Comma-separated list of tables to export")
    .option("--from <date>", "Export data from date (YYYY-MM-DD)")
    .option("--to <date>", "Export data to date (YYYY-MM-DD)")
    .option("--compress", "Compress the exported data")
    .action(async (options) => {
      try {
        const dbCLI = new DatabaseCLI();

        let dateRange: { start: Date; end: Date } | undefined;
        if (options.from || options.to) {
          const fromDate = options.from
            ? new Date(options.from)
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago default
          const toDate = options.to ? new Date(options.to) : new Date(); // now default

          dateRange = {
            start: fromDate,
            end: toDate,
          };
        }

        const result = await dbCLI.exportData({
          format: options.format,
          outputPath: options.output,
          tables: options.tables ? options.tables.split(",") : undefined,
          dateRange,
          compress: Boolean(options.compress),
          includeAnalytics: true,
        });

        if (result.success) {
          OutputFormatter.formatSuccess("Data export completed");
          console.log(`  File Path: ${result.filePath}`);
          console.log(`  Record Count: ${result.recordCount}`);
          console.log(`  Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
          console.log(`  Format: ${result.format}`);
          console.log(`  Compressed: ${result.compressed}`);
          console.log(`  Tables: ${result.tables.join(", ")}`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
        } else {
          OutputFormatter.formatError("Data export failed");
          console.log(`  Error: ${result.error}`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
          process.exit(1);
        }
      } catch (error) {
        OutputFormatter.formatError("Export error");
        console.log(
          `  Error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Import data
  command
    .command("import")
    .description("Import database data")
    .argument("<file>", "File to import")
    .option("--format <format>", "Import format (json, sql)", "auto")
    .option("--truncate", "Truncate tables before import")
    .action(async (file, options) => {
      try {
        const dbCLI = new DatabaseCLI();
        const result = await dbCLI.importData(file, {
          format: options.format,
          truncate: Boolean(options.truncate),
        });

        if (result.success) {
          OutputFormatter.formatSuccess("Data import completed");
          console.log(`  Record Count: ${result.recordCount}`);
          console.log(`  Tables Affected: ${result.tables.join(", ")}`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
        } else {
          OutputFormatter.formatError("Data import failed");
          console.log(`  Error: ${result.error}`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
          process.exit(1);
        }
      } catch (error) {
        OutputFormatter.formatError("Import error");
        console.log(
          `  Error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Create backup
  command
    .command("backup")
    .description("Create database backup")
    .option("-o, --output <path>", "Backup file path")
    .action(async (options) => {
      try {
        const dbCLI = new DatabaseCLI();
        const result = await dbCLI.createBackup(options.output);

        if (result.success) {
          OutputFormatter.formatSuccess("Backup created successfully");
          console.log(`  Backup Path: ${result.backupPath}`);
          console.log(`  Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
        } else {
          OutputFormatter.formatError("Backup creation failed");
          console.log(`  Error: ${result.error}`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
          process.exit(1);
        }
      } catch (error) {
        OutputFormatter.formatError("Backup error");
        console.log(
          `  Error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Cleanup old data
  command
    .command("cleanup")
    .description("Clean up old database records")
    .option("-d, --days <days>", "Keep data from last N days", "30")
    .option("--dry-run", "Show what would be cleaned up")
    .action(async (options) => {
      try {
        const dbCLI = new DatabaseCLI();
        const days = parseInt(options.days, 10);

        const result = await dbCLI.cleanupOldData(days, options.dryRun);

        if (result.success) {
          const message = options.dryRun
            ? "Cleanup analysis completed"
            : "Cleanup completed";
          OutputFormatter.formatSuccess(message);
          console.log(`  Records to Remove: ${result.recordsAffected}`);
          console.log(`  Retention Days: ${days}`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
        } else {
          OutputFormatter.formatError("Cleanup failed");
          console.log(`  Error: ${result.error}`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
          process.exit(1);
        }
      } catch (error) {
        OutputFormatter.formatError("Cleanup error");
        console.log(
          `  Error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Analytics
  command
    .command("analytics")
    .description("Show database analytics")
    .option("--from <date>", "Analytics from date (YYYY-MM-DD)")
    .option("--to <date>", "Analytics to date (YYYY-MM-DD)")
    .option("--format <format>", "Output format (table, json)", "table")
    .action(async (options) => {
      try {
        const dbCLI = new DatabaseCLI();

        let dateRange: { start: Date; end: Date } | undefined;
        if (options.from || options.to) {
          const fromDate = options.from
            ? new Date(options.from)
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const toDate = options.to ? new Date(options.to) : new Date();

          dateRange = {
            start: fromDate,
            end: toDate,
          };
        }

        const result = await dbCLI.getAnalytics(dateRange);

        if (result.success) {
          if (options.format === "json") {
            console.log(JSON.stringify(result.data, null, 2));
          } else {
            OutputFormatter.formatHeader("Database Analytics");
            const data = result.data;

            console.log(`  Total Conversations: ${data.totalConversations}`);
            console.log(`  Total Sessions: ${data.totalSessions}`);
            console.log(`  Average Cost: $${data.averageCost.toFixed(4)}`);
            console.log(`  Average Messages: ${data.averageMessages}`);
            console.log(
              `  Success Rate: ${(data.successRate * 100).toFixed(1)}%`
            );

            if (data.phaseDistribution) {
              OutputFormatter.formatSection("Phase Distribution");
              Object.entries(data.phaseDistribution).forEach(
                ([phase, count]) => {
                  console.log(`  ${phase}: ${count}`);
                }
              );
            }

            if (data.toolUsageStats) {
              OutputFormatter.formatSection("Tool Usage");
              Object.entries(data.toolUsageStats)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 10)
                .forEach(([tool, count]) => {
                  console.log(`  ${tool}: ${count}`);
                });
            }

            if (data.dateRange) {
              OutputFormatter.formatSection("Date Range");
              console.log(
                `  From: ${data.dateRange.start.toISOString().split("T")[0]}`
              );
              console.log(
                `  To: ${data.dateRange.end.toISOString().split("T")[0]}`
              );
            }
          }
        } else {
          OutputFormatter.formatError("Analytics failed");
          console.log(`  Error: ${result.error}`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
          process.exit(1);
        }
      } catch (error) {
        OutputFormatter.formatError("Analytics error");
        console.log(
          `  Error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Health check
  command
    .command("health")
    .description("Check database health")
    .action(async () => {
      try {
        const dbCLI = new DatabaseCLI();
        const health = await dbCLI.checkHealth();

        OutputFormatter.formatHeader("Database Health Check");

        // Status with appropriate color
        if (health.status === "healthy") {
          OutputFormatter.formatSuccess(`Status: ${health.status}`);
        } else if (health.status === "degraded") {
          OutputFormatter.formatWarning(`Status: ${health.status}`);
        } else {
          OutputFormatter.formatError(`Status: ${health.status}`);
        }

        console.log(`  Version: ${health.version}`);
        console.log(`  Uptime: ${Math.floor(health.uptime / 1000)}s`);

        OutputFormatter.formatSection("Connection Pool");
        console.log(`  Active: ${health.connectionPool.active}`);
        console.log(`  Idle: ${health.connectionPool.idle}`);
        console.log(`  Total: ${health.connectionPool.total}`);

        OutputFormatter.formatSection("Performance");
        console.log(
          `  Avg Query Time: ${health.performance.avgQueryTime.toFixed(2)}ms`
        );
        console.log(`  Slow Queries: ${health.performance.slowQueries}`);
        console.log(`  Failed Queries: ${health.performance.failedQueries}`);

        OutputFormatter.formatSection("Storage");
        console.log(
          `  Size: ${(health.storage.size / 1024 / 1024).toFixed(2)} MB`
        );
        console.log(
          `  Free Space: ${(health.storage.freeSpace / 1024 / 1024).toFixed(2)} MB`
        );
        console.log(`  Fragmentation: ${health.storage.fragmentationLevel}%`);

        if (health.lastBackup) {
          console.log(`  Last Backup: ${health.lastBackup.toISOString()}`);
        }

        if (health.errors.length > 0) {
          OutputFormatter.formatSection("Health Issues");
          health.errors.forEach((error) => {
            OutputFormatter.formatError(error);
          });
        }

        if (health.status === "unhealthy") {
          process.exit(1);
        }
      } catch (error) {
        OutputFormatter.formatError("Health check error");
        console.log(
          `  Error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Reset database (development only)
  command
    .command("reset")
    .description("Reset database (development only)")
    .option("--confirm", "Confirm database reset")
    .action(async (options) => {
      try {
        if (!options.confirm) {
          OutputFormatter.formatError("Database reset requires --confirm flag");
          OutputFormatter.formatWarning(
            "This will permanently delete all data"
          );
          process.exit(1);
        }

        const dbCLI = new DatabaseCLI();
        const result = await dbCLI.resetDatabase();

        if (result.success) {
          OutputFormatter.formatSuccess("Database reset completed");
          console.log("  All data has been removed and schema reinitialized");
          console.log(`  Execution Time: ${result.executionTime}ms`);
        } else {
          OutputFormatter.formatError("Database reset failed");
          console.log(`  Error: ${result.error}`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
          process.exit(1);
        }
      } catch (error) {
        OutputFormatter.formatError("Reset error");
        console.log(
          `  Error: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  return command;
}

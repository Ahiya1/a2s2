/**
 * Database Layer Main Export
 * Exports all database components with multi-tenant support and admin handling
 */

import { AnalyticsDAO } from "./dao/AnalyticsDAO.js";
import { CreditDAO } from "./dao/CreditDAO.js";
import { SessionDAO } from "./dao/SessionDAO.js";
import { UserDAO } from "./dao/UserDAO.js";
import { WebSocketDAO } from "./dao/WebSocketDAO.js";
import { DatabaseManager } from "./DatabaseManager.js";
import { MigrationRunner } from "./migrations/run.js";
import { SeedRunner } from "./seeds/run.js";

// Core database manager
export {
  DatabaseManager,
  db,
} from "./DatabaseManager.js";
export type {
  UserContext,
  DatabaseTransaction,
} from "./DatabaseManager.js";

// Data Access Objects
export {
  UserDAO,
} from "./dao/UserDAO.js";
export type {
  User,
  CreateUserRequest,
  LoginRequest,
  LoginResponse,
} from "./dao/UserDAO.js";
export {
  CreditDAO,
} from "./dao/CreditDAO.js";
export type {
  CreditAccount,
  CreditTransaction,
  DeductCreditsRequest,
  AddCreditsRequest,
} from "./dao/CreditDAO.js";
export {
  SessionDAO,
} from "./dao/SessionDAO.js";
export type {
  AgentSession,
  CreateSessionRequest,
  UpdateSessionRequest,
} from "./dao/SessionDAO.js";
export {
  AnalyticsDAO,
} from "./dao/AnalyticsDAO.js";
export type {
  DailyAnalytics,
  AnalyticsUpdate,
  PlatformMetrics,
} from "./dao/AnalyticsDAO.js";
export {
  WebSocketDAO,
} from "./dao/WebSocketDAO.js";
export type {
  WebSocketConnection,
  CreateConnectionRequest,
  ConnectionMetrics,
} from "./dao/WebSocketDAO.js";

// Migration and seeding
export { MigrationRunner } from "./migrations/run.js";
export { SeedRunner } from "./seeds/run.js";

// Configuration
export {
  config,
  testConfig,
  adminConfig,
  creditConfig,
  securityConfig,
} from "../config/database.js";

/**
 * Database Service - High-level service combining all DAOs
 * Provides convenient access to all database operations with admin handling
 */
export class DatabaseService {
  public readonly users: UserDAO;
  public readonly credits: CreditDAO;
  public readonly sessions: SessionDAO;
  public readonly analytics: AnalyticsDAO;
  public readonly websockets: WebSocketDAO;
  private readonly db: DatabaseManager;

  constructor() {
    this.db = new DatabaseManager();
    this.users = new UserDAO(this.db);
    this.credits = new CreditDAO(this.db);
    this.sessions = new SessionDAO(this.db);
    this.analytics = new AnalyticsDAO(this.db);
    this.websockets = new WebSocketDAO(this.db);
  }

  /**
   * Initialize database (run migrations and seeds)
   */
  async initialize(): Promise<void> {
    console.log("🚀 Initializing keen database...");

    try {
      const migrationRunner = new MigrationRunner(this.db); // Fixed: pass db instance
      await migrationRunner.runMigrations();
      // Note: Migration runner doesn't need explicit close

      const seedRunner = new SeedRunner(); // Fixed: no constructor arguments
      await seedRunner.runSeeds();
      const isValid = await seedRunner.validateSeeds();

      if (!isValid) {
        throw new Error("Database initialization validation failed");
      }

      console.log("✅ keen database initialized successfully!");
    } catch (error) {
      console.error("❌ Database initialization failed:", error);
      throw error;
    }
  }

  /**
   * Test database connectivity
   */
  async testConnection(): Promise<boolean> {
    return this.db.testConnection();
  }

  /**
   * Get database manager instance
   */
  getDatabaseManager(): DatabaseManager {
    return this.db;
  }

  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<{
    connected: boolean;
    poolStats: any;
    latency?: number;
  }> {
    return this.db.healthCheck();
  }

  /**
   * Execute raw query (for testing only)
   * This method should only be used in test environments
   */
  async executeRawQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Raw query execution is only allowed in test environment');
    }
    return this.db.query(sql, params);
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    return this.db.close();
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();

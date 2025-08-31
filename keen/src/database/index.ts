/**
 * Database Layer Main Export
 * Exports all database components with multi-tenant support and admin handling
 */

// Core database manager
export { DatabaseManager, UserContext, DatabaseTransaction, db } from './DatabaseManager.js';

// Data Access Objects
export { UserDAO, User, CreateUserRequest, LoginRequest, LoginResponse } from './dao/UserDAO.js';
export { 
  CreditDAO, 
  CreditAccount, 
  CreditTransaction, 
  DeductCreditsRequest, 
  AddCreditsRequest 
} from './dao/CreditDAO.js';
export { 
  SessionDAO, 
  AgentSession, 
  CreateSessionRequest, 
  UpdateSessionRequest 
} from './dao/SessionDAO.js';
export { 
  AnalyticsDAO, 
  DailyAnalytics, 
  AnalyticsUpdate, 
  PlatformMetrics 
} from './dao/AnalyticsDAO.js';
export { 
  WebSocketDAO, 
  WebSocketConnection, 
  CreateConnectionRequest, 
  ConnectionMetrics 
} from './dao/WebSocketDAO.js';

// Migration and seeding
export { MigrationRunner } from './migrations/run.js';
export { SeedRunner } from './seeds/run.js';

// Configuration
export { 
  config, 
  testConfig, 
  adminConfig, 
  creditConfig, 
  securityConfig 
} from '../config/database.js';

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
    console.log('🚀 Initializing keen database...');
    
    const migrationRunner = new MigrationRunner();
    await migrationRunner.runMigrations();
    await migrationRunner.close();
    
    const seedRunner = new SeedRunner();
    await seedRunner.runSeeds();
    const isValid = await seedRunner.validateSeeds();
    await seedRunner.close();
    
    if (!isValid) {
      throw new Error('Database initialization validation failed');
    }
    
    console.log('✅ keen database initialized successfully!');
  }

  /**
   * Test database connectivity
   */
  async testConnection(): Promise<boolean> {
    return await this.db.testConnection();
  }

  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<{
    connected: boolean;
    poolStats: any;
    latency?: number;
  }> {
    return await this.db.healthCheck();
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    await this.db.close();
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();

/**
 * keen Database Layer - Main Entry Point
 * Production-grade multi-tenant PostgreSQL with Anthropic Claude integration
 */

import { DatabaseManager } from './database/DatabaseManager.js';
import { UserDAO } from './database/dao/UserDAO.js';
import { SessionDAO } from './database/dao/SessionDAO.js';
import { CreditDAO } from './database/dao/CreditDAO.js';
import { WebSocketDAO } from './database/dao/WebSocketDAO.js';
import { AnalyticsDAO } from './database/dao/AnalyticsDAO.js';

// NEW: Anthropic configuration exports
import { 
  AnthropicConfigManager, 
  KEEN_DEFAULT_CONFIG,
  type AnthropicConfig,
  type ContextUtilization
} from './config/AnthropicConfig.js';

// Configuration exports
import { 
  databaseConfig,
  adminConfig,
  creditConfig,
  securityConfig,
  performanceConfig,
  monitoringConfig,
  getKeenPlatformConfig,
  type KeenPlatformConfig,
  EnvLoader
} from './config/index.js';

export class keen {
  private static instance: keen;
  private dbManager: DatabaseManager;
  private anthropicConfigManager: AnthropicConfigManager;
  
  // DAO instances
  public readonly users: UserDAO;
  public readonly sessions: SessionDAO;
  public readonly credits: CreditDAO;
  public readonly websockets: WebSocketDAO;
  public readonly analytics: AnalyticsDAO;

  constructor(
    customDbConfig?: any,
    customAnthropicConfig?: Partial<AnthropicConfig>
  ) {
    // Load environment variables from multiple locations
    EnvLoader.load();
    
    this.dbManager = new DatabaseManager(customDbConfig || databaseConfig);
    this.anthropicConfigManager = new AnthropicConfigManager({
      ...KEEN_DEFAULT_CONFIG,
      ...customAnthropicConfig
    });
    
    // Initialize DAOs
    this.users = new UserDAO(this.dbManager);
    this.sessions = new SessionDAO(this.dbManager);
    this.credits = new CreditDAO(this.dbManager);
    this.websockets = new WebSocketDAO(this.dbManager);
    this.analytics = new AnalyticsDAO(this.dbManager);
  }

  /**
   * Get singleton instance
   */
  static getInstance(
    customDbConfig?: any,
    customAnthropicConfig?: Partial<AnthropicConfig>
  ): keen {
    if (!keen.instance) {
      keen.instance = new keen(customDbConfig, customAnthropicConfig);
    }
    return keen.instance;
  }

  /**
   * Initialize database connection
   */
  async initialize(): Promise<void> {
    await this.dbManager.initialize();
    console.log('keen database initialized successfully');
    
    // Validate Anthropic configuration
    const validation = this.anthropicConfigManager.validateKeenRequirements();
    if (!validation.valid) {
      console.warn('Anthropic configuration warnings:', validation.issues);
    }
    
    console.log('keen platform ready with 1M context and thinking enabled');
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.dbManager.close();
    console.log('keen database connection closed');
  }

  /**
   * Get database manager instance
   */
  getDatabaseManager(): DatabaseManager {
    return this.dbManager;
  }

  /**
   * Get Anthropic configuration manager
   */
  getAnthropicConfigManager(): AnthropicConfigManager {
    return this.anthropicConfigManager;
  }

  /**
   * Get complete platform configuration
   */
  async getPlatformConfig(): Promise<KeenPlatformConfig> {
    return await getKeenPlatformConfig();
  }

  /**
   * Validate platform readiness
   */
  async validatePlatform(): Promise<{
    database: boolean;
    anthropic: boolean;
    issues: string[];
    ready: boolean;
  }> {
    const issues: string[] = [];
    
    // Test database connection
    let databaseReady = false;
    try {
      await this.dbManager.query('SELECT 1');
      databaseReady = true;
    } catch (error) {
      issues.push(`Database connection failed: ${error}`);
    }
    
    // Validate Anthropic configuration
    const anthropicValidation = this.anthropicConfigManager.validateKeenRequirements();
    const anthropicReady = anthropicValidation.valid;
    
    if (!anthropicReady) {
      issues.push(...anthropicValidation.issues);
    }
    
    return {
      database: databaseReady,
      anthropic: anthropicReady,
      issues,
      ready: databaseReady && anthropicReady
    };
  }

  /**
   * Get system status for monitoring
   */
  async getSystemStatus(): Promise<{
    database: {
      connected: boolean;
      activeConnections: number;
    };
    anthropic: {
      configured: boolean;
      model: string;
      extendedContext: boolean;
      thinking: boolean;
      betaHeaders: string[];
    };
    platform: {
      version: string;
      ready: boolean;
    };
  }> {
    const dbStats = await this.dbManager.getConnectionStats();
    const anthropicConfig = this.anthropicConfigManager.getConfig();
    const validation = this.anthropicConfigManager.validateKeenRequirements();
    
    return {
      database: {
        connected: dbStats.totalConnections > 0,
        activeConnections: dbStats.activeConnections
      },
      anthropic: {
        configured: this.anthropicConfigManager.isProductionReady(),
        model: anthropicConfig.model,
        extendedContext: anthropicConfig.enableExtendedContext,
        thinking: anthropicConfig.enableInterleaved,
        betaHeaders: validation.betaHeaders
      },
      platform: {
        version: '1.0.0',
        ready: validation.valid && dbStats.totalConnections > 0
      }
    };
  }

  /**
   * For testing: reset singleton instance
   */
  static resetInstance(): void {
    if (keen.instance) {
      keen.instance.close();
    }
    keen.instance = null as any;
  }
}

// Export everything for easy import
export {
  // Database exports
  DatabaseManager,
  UserDAO,
  SessionDAO, 
  CreditDAO,
  WebSocketDAO,
  AnalyticsDAO,
  
  // Anthropic configuration exports
  AnthropicConfigManager,
  KEEN_DEFAULT_CONFIG,
  type AnthropicConfig,
  type ContextUtilization,
  
  // Configuration exports
  databaseConfig,
  adminConfig,
  creditConfig,
  securityConfig,
  performanceConfig,
  monitoringConfig,
  getKeenPlatformConfig,
  type KeenPlatformConfig,
  EnvLoader
};

// Export default instance for convenience
export default keen.getInstance();
/**
 * Phase 1 Tests - Database Core Functionality
 * Tests for the core database layer, DAOs, and configuration
 */

import { keen } from '../../src/index.js';
import { DatabaseManager } from '../../src/database/DatabaseManager.js';
import { UserDAO } from '../../src/database/dao/UserDAO.js';
import { SessionDAO } from '../../src/database/dao/SessionDAO.js';
import { CreditDAO } from '../../src/database/dao/CreditDAO.js';
import { AnthropicConfigManager, KEEN_DEFAULT_CONFIG } from '../../src/config/AnthropicConfig.js';

describe('Phase 1: Database Core Functionality', () => {
  let keenDB: keen;
  let dbManager: DatabaseManager;
  let userDAO: UserDAO;
  let sessionDAO: SessionDAO;
  let creditDAO: CreditDAO;

  beforeAll(async () => {
    // Use a test instance to avoid conflicts
    keenDB = keen.getInstance();
    dbManager = keenDB.getDatabaseManager();
    userDAO = keenDB.users;
    sessionDAO = keenDB.sessions;
    creditDAO = keenDB.credits;
  });

  afterAll(async () => {
    if (keenDB) {
      await keenDB.close();
    }
  });

  describe('Database Manager', () => {
    test('should initialize successfully', () => {
      expect(dbManager).toBeDefined();
      expect(dbManager).toBeInstanceOf(DatabaseManager);
    });

    test('should have connection stats available', async () => {
      const stats = await dbManager.getConnectionStats();
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('idleConnections');
      expect(typeof stats.totalConnections).toBe('number');
    });
  });

  describe('DAO Layer', () => {
    test('UserDAO should be available', () => {
      expect(userDAO).toBeDefined();
      expect(userDAO).toBeInstanceOf(UserDAO);
    });

    test('SessionDAO should be available', () => {
      expect(sessionDAO).toBeDefined();
      expect(sessionDAO).toBeInstanceOf(SessionDAO);
    });

    test('CreditDAO should be available', () => {
      expect(creditDAO).toBeDefined();
      expect(creditDAO).toBeInstanceOf(CreditDAO);
    });

    test('WebSocketDAO should be available', () => {
      expect(keenDB.websockets).toBeDefined();
    });

    test('AnalyticsDAO should be available', () => {
      expect(keenDB.analytics).toBeDefined();
    });
  });

  describe('Configuration System', () => {
    test('should load configuration successfully', async () => {
      const config = await keenDB.getPlatformConfig();
      expect(config).toBeDefined();
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('admin');
      expect(config).toHaveProperty('credits');
      expect(config).toHaveProperty('security');
    });

    test('Anthropic configuration should be properly initialized', () => {
      const anthropicManager = keenDB.getAnthropicConfigManager();
      expect(anthropicManager).toBeDefined();
      expect(anthropicManager).toBeInstanceOf(AnthropicConfigManager);
    });

    test('Anthropic config should have 1M context enabled', () => {
      const anthropicManager = keenDB.getAnthropicConfigManager();
      const config = anthropicManager.getConfig();
      
      expect(config.enableExtendedContext).toBe(true);
      expect(config.enableInterleaved).toBe(true);
      expect(config.model).toBe('claude-sonnet-4-20250514');
      expect(config.maxTokens).toBeGreaterThan(0);
    });

    test('should validate keen requirements', () => {
      const anthropicManager = keenDB.getAnthropicConfigManager();
      const validation = anthropicManager.validateKeenRequirements();
      
      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('issues');
      expect(validation).toHaveProperty('betaHeaders');
      expect(Array.isArray(validation.issues)).toBe(true);
      expect(Array.isArray(validation.betaHeaders)).toBe(true);
    });
  });

  describe('Platform Readiness', () => {
    test('should validate platform status', async () => {
      const status = await keenDB.validatePlatform();
      
      expect(status).toHaveProperty('database');
      expect(status).toHaveProperty('anthropic');
      expect(status).toHaveProperty('issues');
      expect(status).toHaveProperty('ready');
      expect(Array.isArray(status.issues)).toBe(true);
    });

    test('should provide system status', async () => {
      const systemStatus = await keenDB.getSystemStatus();
      
      expect(systemStatus).toHaveProperty('database');
      expect(systemStatus).toHaveProperty('anthropic');
      expect(systemStatus).toHaveProperty('platform');
      
      expect(systemStatus.database).toHaveProperty('connected');
      expect(systemStatus.database).toHaveProperty('activeConnections');
      
      expect(systemStatus.anthropic).toHaveProperty('configured');
      expect(systemStatus.anthropic).toHaveProperty('model');
      expect(systemStatus.anthropic).toHaveProperty('extendedContext');
      expect(systemStatus.anthropic).toHaveProperty('thinking');
      expect(systemStatus.anthropic).toHaveProperty('betaHeaders');
      
      expect(systemStatus.platform).toHaveProperty('version');
      expect(systemStatus.platform).toHaveProperty('ready');
    });
  });

  describe('Environment Loading', () => {
    test('should load environment variables', () => {
      // Test that basic env vars are loaded
      expect(process.env.NODE_ENV).toBeDefined();
      
      // Database config should be available
      const dbConfig = require('../../src/config/database.js');
      expect(dbConfig).toBeDefined();
    });

    test('should have default configuration values', () => {
      expect(KEEN_DEFAULT_CONFIG).toBeDefined();
      expect(KEEN_DEFAULT_CONFIG.enableExtendedContext).toBe(true);
      expect(KEEN_DEFAULT_CONFIG.enableInterleaved).toBe(true);
      expect(KEEN_DEFAULT_CONFIG.model).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      // This test ensures error handling doesn't crash the system
      try {
        await dbManager.query('INVALID SQL QUERY');
      } catch (error) {
        expect(error).toBeDefined();
        expect(error).toBeInstanceOf(Error);
      }
    });

    test('should handle missing environment variables', () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      
      // Should still work with defaults
      const testConfig = require('../../src/config/index.js');
      expect(testConfig).toBeDefined();
      
      // Restore env
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Multi-tenancy Support', () => {
    test('should support user context in database operations', () => {
      // Test that database manager accepts user context
      const mockContext = {
        userId: 'test-user-123',
        isAdmin: false,
        adminPrivileges: null
      };
      
      // This should not throw
      expect(() => {
        dbManager.query('SELECT 1', [], mockContext);
      }).not.toThrow();
    });

    test('should support admin context', () => {
      const adminContext = {
        userId: 'admin-user-123',
        isAdmin: true,
        adminPrivileges: {
          bypassRateLimit: true,
          unlimitedCredits: true
        }
      };
      
      // This should not throw
      expect(() => {
        dbManager.query('SELECT 1', [], adminContext);
      }).not.toThrow();
    });
  });

  describe('Export System', () => {
    test('should export all required components', () => {
      const keenModule = require('../../src/index.js');
      
      // Core exports
      expect(keenModule.keen).toBeDefined();
      expect(keenModule.DatabaseManager).toBeDefined();
      expect(keenModule.UserDAO).toBeDefined();
      expect(keenModule.SessionDAO).toBeDefined();
      expect(keenModule.CreditDAO).toBeDefined();
      expect(keenModule.WebSocketDAO).toBeDefined();
      expect(keenModule.AnalyticsDAO).toBeDefined();
      
      // Anthropic exports
      expect(keenModule.AnthropicConfigManager).toBeDefined();
      expect(keenModule.KEEN_DEFAULT_CONFIG).toBeDefined();
      
      // Configuration exports
      expect(keenModule.databaseConfig).toBeDefined();
      expect(keenModule.adminConfig).toBeDefined();
      expect(keenModule.creditConfig).toBeDefined();
      expect(keenModule.EnvLoader).toBeDefined();
    });

    test('should export default instance', () => {
      const defaultInstance = require('../../src/index.js').default;
      expect(defaultInstance).toBeDefined();
      expect(defaultInstance).toBeInstanceOf(keen);
    });
  });

  describe('Singleton Pattern', () => {
    test('should return same instance', () => {
      const instance1 = keen.getInstance();
      const instance2 = keen.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    test('should support custom configuration', () => {
      // Reset for clean test
      keen.resetInstance();
      
      const customConfig = {
        model: 'claude-test-model',
        enableExtendedContext: false
      };
      
      const customInstance = keen.getInstance(undefined, customConfig);
      expect(customInstance).toBeDefined();
      
      const anthropicConfig = customInstance.getAnthropicConfigManager().getConfig();
      expect(anthropicConfig.model).toBe('claude-test-model');
      expect(anthropicConfig.enableExtendedContext).toBe(false);
      
      // Clean up
      keen.resetInstance();
    });
  });

  describe('TypeScript Support', () => {
    test('should have proper TypeScript types', () => {
      // This test ensures TypeScript compilation works
      const keenInstance: keen = keen.getInstance();
      const dbMgr: DatabaseManager = keenInstance.getDatabaseManager();
      const users: UserDAO = keenInstance.users;
      const sessions: SessionDAO = keenInstance.sessions;
      const credits: CreditDAO = keenInstance.credits;
      
      expect(keenInstance).toBeDefined();
      expect(dbMgr).toBeDefined();
      expect(users).toBeDefined();
      expect(sessions).toBeDefined();
      expect(credits).toBeDefined();
    });
  });
});

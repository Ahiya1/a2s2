/**
 * SQL Injection Prevention Tests
 * Tests that parameterized queries prevent SQL injection attacks
 */

import { DatabaseManager, UserContext } from '../../src/database/DatabaseManager.js';
import { WebSocketDAO } from '../../src/database/dao/WebSocketDAO.js';
import { testConfig } from '../../src/config/database.js';
import { generateTestEmail } from '../setup.js';

// Use test database
process.env.DB_NAME = testConfig.database;
process.env.DB_USER = testConfig.user;
process.env.DB_PASSWORD = testConfig.password;

describe('SQL Injection Prevention Tests', () => {
  let dbManager: DatabaseManager;
  let webSocketDAO: WebSocketDAO;
  let testUserId: string;

  beforeAll(async () => {
    dbManager = new DatabaseManager(testConfig);
    await dbManager.initialize();
    webSocketDAO = new WebSocketDAO(dbManager);

    // Create test user for context testing
    const testEmail = generateTestEmail('sqlinjection');
    const testUser = await dbManager.query(
      'INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [testEmail, `sqltest_${Date.now()}`, 'hash123']
    );
    testUserId = testUser[0].id;
  });

  afterAll(async () => {
    // Cleanup test user
    if (testUserId) {
      await dbManager.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    await dbManager.close();
  });

  describe('DatabaseManager Context Setting', () => {
    it('should sanitize malicious userId in context', async () => {
      const maliciousUserId = "'; DROP TABLE users; --";
      const maliciousContext: UserContext = {
        userId: maliciousUserId,
        isAdmin: false
      };

      // Test by running a query with malicious context - should not execute malicious SQL
      await expect(
        dbManager.query('SELECT COUNT(*) FROM users', [], maliciousContext)
      ).resolves.not.toThrow();

      // Verify users table still exists by running a simple query
      const result = await dbManager.query('SELECT COUNT(*) FROM users');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should sanitize malicious admin privileges in context', async () => {
      const maliciousPrivileges = {
        "test': true}'; DROP TABLE users; --": true,
        unlimited_credits: true
      };

      const maliciousContext: UserContext = {
        userId: testUserId,
        isAdmin: true,
        adminPrivileges: maliciousPrivileges
      };

      // Test by running a query with malicious admin context
      await expect(
        dbManager.query('SELECT COUNT(*) FROM users', [], maliciousContext)
      ).resolves.not.toThrow();

      // Verify users table still exists
      const result = await dbManager.query('SELECT COUNT(*) FROM users');
      expect(result).toBeDefined();
    });

    it('should handle boolean isAdmin value safely', async () => {
      // Test with string that could be interpreted as SQL
      const contextWithStringAdmin = {
        userId: testUserId,
        isAdmin: "true'; DROP TABLE users; --" as any
      };

      // Test by running a query with malicious boolean context
      await expect(
        dbManager.query('SELECT COUNT(*) FROM users', [], contextWithStringAdmin)
      ).resolves.not.toThrow();

      // Verify users table still exists
      const result = await dbManager.query('SELECT COUNT(*) FROM users');
      expect(result).toBeDefined();
    });
  });

  describe('WebSocketDAO Cleanup Method', () => {
    it('should sanitize malicious interval parameter', async () => {
      const maliciousInterval = "5; DROP TABLE websocket_connections; --" as any;
      const adminContext: UserContext = {
        userId: testUserId,
        isAdmin: true
      };

      // This should throw a validation error and not execute malicious SQL
      await expect(
        webSocketDAO.cleanupInactiveConnections(maliciousInterval, adminContext)
      ).rejects.toThrow('Invalid threshold: must be a positive integer between 1 and 1440 minutes');

      // Verify websocket_connections table still exists
      const result = await dbManager.query('SELECT COUNT(*) FROM websocket_connections');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle numeric interval parameter safely', async () => {
      const adminContext: UserContext = {
        userId: testUserId,
        isAdmin: true
      };

      // Test with valid numeric parameter
      const cleanedCount = await webSocketDAO.cleanupInactiveConnections(30, adminContext);
      expect(typeof cleanedCount).toBe('number');
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });

    it('should require admin context for cleanup', async () => {
      const regularUserContext: UserContext = {
        userId: testUserId,
        isAdmin: false
      };

      // Should throw error for non-admin user
      await expect(
        webSocketDAO.cleanupInactiveConnections(30, regularUserContext)
      ).rejects.toThrow('Admin privileges required');
    });
  });

  describe('General SQL Injection Protection', () => {
    it('should prevent injection in parameterized queries', async () => {
      const maliciousEmail = "test'; DROP TABLE users; --@example.com";
      
      // This should safely handle the malicious input via parameters
      const result = await dbManager.query(
        'SELECT * FROM users WHERE email = $1',
        [maliciousEmail]
      );
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0); // No user with this email should exist
      
      // Verify users table still exists
      const countResult = await dbManager.query('SELECT COUNT(*) FROM users');
      expect(countResult).toBeDefined();
    });

    it('should handle special characters in parameters safely', async () => {
      const specialChars = "'; OR 1=1; --";
      
      const result = await dbManager.query(
        'SELECT * FROM users WHERE username = $1',
        [specialChars]
      );
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should prevent injection in multi-parameter queries', async () => {
      const maliciousEmail = "test'; DROP TABLE users; --";
      const maliciousUsername = "'; DELETE FROM users WHERE 1=1; --";
      
      await expect(
        dbManager.query(
          'SELECT * FROM users WHERE email = $1 AND username = $2',
          [maliciousEmail, maliciousUsername]
        )
      ).resolves.not.toThrow();
      
      // Verify users table integrity
      const countResult = await dbManager.query('SELECT COUNT(*) FROM users');
      expect(countResult).toBeDefined();
    });
  });
});
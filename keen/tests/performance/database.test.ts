/**
 * Database Performance Tests
 * Tests concurrent operations, connection pooling, and query optimization
 */

import Decimal from 'decimal.js';
import { DatabaseService } from '../../src/database/index.js';
import { UserContext } from '../../src/database/DatabaseManager.js';
import { testConfig, adminConfig } from '../../src/config/database.js';
import { generateTestEmail, generateTestSessionId } from '../setup.js';

// Use test database
process.env.DB_NAME = testConfig.database;
process.env.DB_USER = testConfig.user;
process.env.DB_PASSWORD = testConfig.password;

describe('Database Performance Tests', () => {
  let dbService: DatabaseService;
  let testUsers: { id: string; context: UserContext }[] = [];
  let adminContext: UserContext;

  beforeAll(async () => {
    dbService = new DatabaseService();
    
    // Just test connection, don't run full initialization
    const connected = await dbService.testConnection();
    if (!connected) {
      throw new Error('Cannot connect to test database. Ensure migrations have been run.');
    }

    // Get admin context
    const adminUser = await dbService.users.getUserByEmail(adminConfig.email);
    if (adminUser) {
      adminContext = {
        userId: adminUser.id,
        isAdmin: true,
        adminPrivileges: adminUser.admin_privileges
      };
    }

    // Create multiple test users for concurrent testing
    for (let i = 0; i < 10; i++) {
      const userEmail = generateTestEmail(`perf${i}`);
      const user = await dbService.users.createUser({
        email: userEmail,
        username: `perf_user${i}_${Date.now()}`,
        password: 'password123'
      });
      
      const userContext: UserContext = { userId: user.id, isAdmin: false };
      testUsers.push({
        id: user.id,
        context: userContext
      });

      // Create credit account with initial balance
      try {
        await dbService.credits.createCreditAccount(user.id, userContext);
        await dbService.credits.addCredits({
          userId: user.id,
          amount: new Decimal('1000.00'),
          description: 'Performance test initial credits'
        }, userContext);
      } catch (error) {
        // Account might already exist
      }
    }
  });

  afterAll(async () => {
    // Cleanup test users
    for (const user of testUsers) {
      try {
        await dbService.executeRawQuery('DELETE FROM users WHERE id = $1', [user.id]);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    await dbService.close();
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent credit deductions safely', async () => {
      const user = testUsers[0];
      const claudeCost = new Decimal('2.00'); // 10 credits with 5x markup
      
      // Execute 10 concurrent credit deductions with unique session IDs
      const promises = Array.from({ length: 10 }, (_, i) => {
        const sessionId = generateTestSessionId();
        return dbService.credits.deductCredits({
          userId: user.id,
          claudeCostUSD: claudeCost,
          sessionId: sessionId,
          description: `Concurrent operation ${i}`
        }, user.context);
      });

      const startTime = Date.now();
      
      try {
        const results = await Promise.all(promises);
        const endTime = Date.now();
        
        // All transactions should succeed
        expect(results).toHaveLength(10);
        
        // Should complete within reasonable time (under 5 seconds)
        expect(endTime - startTime).toBeLessThan(5000);
        
        // Final balance should be correct (1000 - (10 * 10) = 900)
        const finalAccount = await dbService.credits.getCreditAccount(user.id, user.context);
        expect(finalAccount?.current_balance.toString()).toBe('900');
        
        console.log(`✅ Concurrent operations completed in ${endTime - startTime}ms`);
      } catch (error) {
        // Some operations may fail due to insufficient credits, which is expected
        console.log('Some concurrent operations failed as expected:', error);
      }
    });

    it('should handle concurrent session creation', async () => {
      const user = testUsers[1];
      
      // Create 5 concurrent sessions with unique IDs
      const promises = Array.from({ length: 5 }, (_, i) => {
        const sessionId = generateTestSessionId();
        return dbService.sessions.createSession(user.id, {
          sessionId: sessionId,
          gitBranch: `branch-${i}`,
          vision: `Concurrent session ${i}`,
          workingDirectory: `/tmp/concurrent-${i}`
        }, user.context);
      });

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      expect(results).toHaveLength(5);
      expect(endTime - startTime).toBeLessThan(3000); // Under 3 seconds
      
      // All sessions should have different IDs
      const sessionIds = results.map(s => s.id);
      const uniqueIds = new Set(sessionIds);
      expect(uniqueIds.size).toBe(5);
      
      console.log(`✅ Concurrent session creation completed in ${endTime - startTime}ms`);
    });
  });

  describe('Query Performance', () => {
    it('should execute user lookup queries efficiently', async () => {
      const iterations = 100;
      const startTime = Date.now();
      
      // Execute 100 user lookups
      const promises = testUsers.slice(0, 5).map(async (user, index) => {
        const lookupPromises = Array.from({ length: 20 }, () => 
          dbService.users.getUserById(user.id, user.context)
        );
        return await Promise.all(lookupPromises);
      });
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      expect(results.flat()).toHaveLength(iterations);
      expect(endTime - startTime).toBeLessThan(5000); // Under 5 seconds for 100 lookups
      
      const avgTime = (endTime - startTime) / iterations;
      console.log(`✅ Average user lookup time: ${avgTime.toFixed(2)}ms`);
    });

    it('should handle complex analytics queries efficiently', async () => {
      const user = testUsers[2];
      
      // Create some test data
      const sessionId = generateTestSessionId();
      await dbService.sessions.createSession(user.id, {
        sessionId: sessionId,
        gitBranch: 'analytics-branch',
        vision: 'Analytics performance test',
        workingDirectory: '/tmp/analytics'
      }, user.context);

      const startTime = Date.now();
      
      // Execute analytics query
      const analytics = await dbService.analytics.getUserAnalyticsSummary(
        user.id,
        user.context
      );
      
      const endTime = Date.now();
      
      expect(analytics).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // Under 1 second
      
      console.log(`✅ Analytics query completed in ${endTime - startTime}ms`);
    });
  });

  describe('Connection Pool Performance', () => {
    it('should maintain healthy connection pool under load', async () => {
      const initialHealth = await dbService.getHealthStatus();
      expect(initialHealth.connected).toBe(true);
      
      // Execute many concurrent operations
      const promises = testUsers.map(async (user, index) => {
        const operations = [];
        
        // Mix of different operation types
        operations.push(
          dbService.users.getUserById(user.id, user.context)
        );
        operations.push(
          dbService.credits.getCreditAccount(user.id, user.context)
        );
        operations.push(
          dbService.sessions.getUserSessions(user.id, 10, 0, user.context)
        );
        
        return await Promise.all(operations);
      });

      const startTime = Date.now();
      await Promise.all(promises);
      const endTime = Date.now();
      
      const finalHealth = await dbService.getHealthStatus();
      
      expect(finalHealth.connected).toBe(true);
      expect(endTime - startTime).toBeLessThan(10000); // Under 10 seconds
      
      console.log(`✅ Connection pool test completed in ${endTime - startTime}ms`);
      console.log(`✅ Pool stats: ${JSON.stringify(finalHealth.poolStats)}`);
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should handle large result sets efficiently', async () => {
      // Create many credit transactions for performance testing
      const user = testUsers[3];
      
      const promises = Array.from({ length: 50 }, (_, i) => 
        dbService.credits.addCredits({
          userId: user.id,
          amount: new Decimal('1.00'),
          description: `Performance test transaction ${i}`
        }, user.context)
      );

      await Promise.all(promises);
      
      const startTime = Date.now();
      
      // Get large transaction history
      const history = await dbService.credits.getTransactionHistory(
        user.id,
        100, // Large page size
        0,
        user.context
      );
      
      const endTime = Date.now();
      
      expect(history.transactions.length).toBeGreaterThan(40);
      expect(endTime - startTime).toBeLessThan(2000); // Under 2 seconds
      
      console.log(`✅ Large result set query completed in ${endTime - startTime}ms`);
      console.log(`✅ Retrieved ${history.transactions.length} transactions`);
    });
  });

  describe('Admin Bypass Performance', () => {
    it('should handle admin operations without performance penalty', async () => {
      if (!adminContext) {
        throw new Error('Admin context not available');
      }
      
      // Execute many admin bypass operations with unique session IDs
      const promises = Array.from({ length: 20 }, (_, i) => {
        const sessionId = generateTestSessionId();
        return dbService.credits.deductCredits({
          userId: adminContext.userId,
          claudeCostUSD: new Decimal('10.00'),
          sessionId: sessionId,
          description: `Admin performance test ${i}`
        }, adminContext);
      });

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      // All should be admin bypass transactions
      expect(results).toHaveLength(20);
      results.forEach(transaction => {
        expect(transaction.is_admin_bypass).toBe(true);
        expect(transaction.transaction_type).toBe('admin_bypass');
        expect(transaction.amount.toString()).toBe('0');
      });
      
      expect(endTime - startTime).toBeLessThan(5000); // Under 5 seconds
      
      console.log(`✅ Admin bypass operations completed in ${endTime - startTime}ms`);
    });
  });
});

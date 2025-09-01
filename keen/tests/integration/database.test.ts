/**
 * Database Integration Tests
 * Tests complete workflows with actual database operations
 */

import Decimal from 'decimal.js';
import { DatabaseService } from '../../src/database/index.js';
import { UserContext } from '../../src/database/DatabaseManager.js';
import { adminConfig, testConfig } from '../../src/config/database.js';
import { generateTestEmail, generateTestSessionId } from '../setup.js';

// Use test database configuration
process.env.DB_NAME = testConfig.database;
process.env.DB_USER = testConfig.user;
process.env.DB_PASSWORD = testConfig.password;

describe('Database Integration Tests', () => {
  let dbService: DatabaseService;
  let adminContext: UserContext;
  let regularUserContext: UserContext;
  let regularUserId: string;
  let testUsers: string[] = [];

  beforeAll(async () => {
    dbService = new DatabaseService();
    
    // Just test connection, don't run full initialization
    const connected = await dbService.testConnection();
    if (!connected) {
      throw new Error('Cannot connect to test database. Ensure migrations have been run.');
    }

    // Setup admin context
    const adminUser = await dbService.users.getUserByEmail(adminConfig.email);
    if (adminUser) {
      adminContext = {
        userId: adminUser.id,
        isAdmin: true,
        adminPrivileges: adminUser.admin_privileges
      };
    }
  });

  afterAll(async () => {
    // Cleanup test users
    for (const userId of testUsers) {
      try {
        await dbService.executeRawQuery('DELETE FROM users WHERE id = $1', [userId]);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    await dbService.close();
  });

  describe('Complete User Lifecycle', () => {
    it('should create user, credit account, and handle session lifecycle', async () => {
      const testEmail = generateTestEmail('integration');
      
      // 1. Create regular user
      const user = await dbService.users.createUser({
        email: testEmail,
        username: `integration_user_${Date.now()}`,
        password: 'securepassword123',
        display_name: 'Integration Test User'
      });

      expect(user.email).toBe(testEmail);
      expect(user.is_admin).toBe(false);
      regularUserId = user.id;
      regularUserContext = { userId: user.id, isAdmin: false };
      testUsers.push(user.id);

      // 2. Create credit account
      const creditAccount = await dbService.credits.createCreditAccount(user.id, regularUserContext);
      
      expect(creditAccount.user_id).toBe(user.id);
      expect(creditAccount.unlimited_credits).toBe(false);
      expect(creditAccount.current_balance.toString()).toBe('0');

      // 3. Add credits to account
      const addCreditsTransaction = await dbService.credits.addCredits({
        userId: user.id,
        amount: new Decimal('100.00'),
        description: 'Initial credit purchase',
        metadata: { payment_method: 'test' }
      }, regularUserContext);

      expect(addCreditsTransaction.transaction_type).toBe('purchase');
      expect(addCreditsTransaction.amount.toString()).toBe('100');
      expect(addCreditsTransaction.balance_after.toString()).toBe('100');

      // 4. Create agent session
      const sessionId = generateTestSessionId();
      const session = await dbService.sessions.createSession(user.id, {
        sessionId: sessionId,
        gitBranch: 'main',
        vision: 'Integration test session',
        workingDirectory: '/tmp/test',
        agentOptions: { testMode: true }
      }, regularUserContext);

      expect(session.user_id).toBe(user.id);
      expect(session.session_id).toBe(sessionId);
      expect(session.current_phase).toBe('EXPLORE');
      expect(session.execution_status).toBe('running');

      // 5. Deduct credits for session
      const claudeCost = new Decimal('5.00');
      const deductTransaction = await dbService.credits.deductCredits({
        userId: user.id,
        claudeCostUSD: claudeCost,
        sessionId: session.id,
        description: 'Integration test credit usage'
      }, regularUserContext);

      expect(deductTransaction.transaction_type).toBe('usage');
      expect(deductTransaction.amount.toString()).toBe('-25'); // 5.00 * 5x markup
      expect(deductTransaction.balance_after.toString()).toBe('75'); // 100 - 25
      expect(deductTransaction.claude_cost_usd?.toString()).toBe('5');
      expect(deductTransaction.markup_multiplier.toString()).toBe('5');
      expect(deductTransaction.is_admin_bypass).toBe(false);

      // 6. Update session progress
      const updatedSession = await dbService.sessions.updateSession(session.id, {
        currentPhase: 'COMPLETE',
        iterationCount: 5,
        toolCallsCount: 10,
        tokensUsed: 15000,
        executionStatus: 'completed',
        success: true
      }, regularUserContext);

      expect(updatedSession.current_phase).toBe('COMPLETE');
      expect(updatedSession.execution_status).toBe('completed');
      expect(updatedSession.success).toBe(true);
      expect(updatedSession.tokens_used).toBe(15000);
    });
  });

  describe('Admin Bypass Workflow', () => {
    it('should handle complete admin workflow with bypasses', async () => {
      if (!adminContext) {
        throw new Error('Admin context not available for testing');
      }

      // 1. Create admin session
      const adminSessionId = generateTestSessionId();
      const adminSession = await dbService.sessions.createSession(adminContext.userId, {
        sessionId: adminSessionId,
        gitBranch: 'admin-test',
        vision: 'Admin integration test session',
        workingDirectory: '/tmp/admin-test',
        agentOptions: { adminMode: true }
      }, adminContext);

      expect(adminSession.user_id).toBe(adminContext.userId);

      // 2. Deduct credits (should be bypassed)
      const claudeCost = new Decimal('100.00'); // Large cost
      const adminTransaction = await dbService.credits.deductCredits({
        userId: adminContext.userId,
        claudeCostUSD: claudeCost,
        sessionId: adminSession.id,
        description: 'Admin large operation test'
      }, adminContext);

      expect(adminTransaction.transaction_type).toBe('admin_bypass');
      expect(adminTransaction.amount.toString()).toBe('0'); // No deduction
      expect(adminTransaction.is_admin_bypass).toBe(true);
      expect(adminTransaction.claude_cost_usd?.toString()).toBe('100');
      expect(adminTransaction.description).toContain('[ADMIN BYPASS]');

      // 3. Get admin analytics
      const analytics = await dbService.credits.getAdminAnalytics(
        undefined, 
        undefined, 
        adminContext
      );

      expect(analytics.totalAdminBypass.gte(claudeCost)).toBe(true);
      expect(analytics.transactionCount).toBeGreaterThan(0);

      // 4. Get platform metrics (admin only)
      const platformMetrics = await dbService.analytics.getPlatformMetrics(adminContext);
      
      expect(platformMetrics.totalUsers).toBeGreaterThan(0);
      expect(platformMetrics.adminUsers).toBeGreaterThan(0);
      expect(platformMetrics.adminBypassTotal.gte(claudeCost)).toBe(true);
    });
  });

  describe('Multi-tenant Isolation', () => {
    it.skip('should enforce user isolation in sessions', async () => {
      // Create user 1
      const user1Email = generateTestEmail('user1');
      const user1 = await dbService.users.createUser({
        email: user1Email,
        username: `isolation_user1_${Date.now()}`,
        password: 'password123'
      });
      testUsers.push(user1.id);
      const user1Context: UserContext = { userId: user1.id, isAdmin: false };

      // Create session for user 1
      const session1Id = generateTestSessionId();
      const session1 = await dbService.sessions.createSession(user1.id, {
        sessionId: session1Id,
        gitBranch: 'user1-branch',
        vision: 'User 1 session',
        workingDirectory: '/tmp/user1'
      }, user1Context);

      // Create user 2
      const user2Email = generateTestEmail('user2');
      const user2 = await dbService.users.createUser({
        email: user2Email,
        username: `isolation_user2_${Date.now()}`,
        password: 'password123'
      });
      testUsers.push(user2.id);
      const user2Context: UserContext = { userId: user2.id, isAdmin: false };

      // User 2 should not be able to see User 1's sessions
      const user2Sessions = await dbService.sessions.getUserSessions(
        user1.id, // Try to access user 1's sessions
        50,
        0,
        user2Context // With user 2's context
      );

      // Due to RLS, user 2 should see 0 sessions from user 1
      expect(user2Sessions.sessions).toHaveLength(0);
      expect(user2Sessions.total).toBe(0);

      // But admin should see all sessions
      if (adminContext) {
        const adminViewSessions = await dbService.sessions.getUserSessions(
          user1.id,
          50,
          0,
          adminContext
        );
        
        expect(adminViewSessions.sessions.length).toBeGreaterThan(0);
      }
    });
  });

  describe('WebSocket Connection Management', () => {
    it('should manage WebSocket connections with proper isolation', async () => {
      const userEmail = generateTestEmail('wstest');
      const user = await dbService.users.createUser({
        email: userEmail,
        username: `wstest_user_${Date.now()}`,
        password: 'password123'
      });
      testUsers.push(user.id);
      const userContext: UserContext = { userId: user.id, isAdmin: false };

      // Create WebSocket connection for user
      const connectionId = `test-connection-${Date.now()}`;
      const connection = await dbService.websockets.createConnection(user.id, {
        connectionId: connectionId,
        clientIp: '192.168.1.100',
        userAgent: 'Mozilla/5.0 Integration Test',
        clientType: 'dashboard',
        subscribedEvents: ['session_updates', 'credit_updates'],
        sessionFilters: []
      }, userContext);

      expect(connection.user_id).toBe(user.id);
      expect(connection.connection_id).toBe(connectionId);
      expect(connection.connection_status).toBe('active');

      // Update connection activity
      const updated = await dbService.websockets.updateConnectionActivity(
        connectionId,
        userContext
      );
      expect(updated).toBe(true);

      // Close connection
      const closed = await dbService.websockets.closeConnection(
        connectionId,
        userContext
      );
      expect(closed).toBe(true);
    });
  });

  describe('Analytics and Reporting', () => {
    it('should generate user analytics correctly', async () => {
      const userEmail = generateTestEmail('analytics');
      const user = await dbService.users.createUser({
        email: userEmail,
        username: `analytics_user_${Date.now()}`,
        password: 'password123'
      });
      testUsers.push(user.id);
      const userContext: UserContext = { userId: user.id, isAdmin: false };

      const analytics = await dbService.analytics.getUserAnalyticsSummary(
        user.id,
        userContext
      );

      expect(analytics.totalSessions).toBeGreaterThanOrEqual(0);
      expect(analytics.totalCost.gte(0)).toBe(true);
      expect(analytics.totalTokens).toBeGreaterThanOrEqual(0);
    });

    it('should handle daily analytics updates', async () => {
      const userEmail = generateTestEmail('dailyanalytics');
      const user = await dbService.users.createUser({
        email: userEmail,
        username: `dailyanalytics_user_${Date.now()}`,
        password: 'password123'
      });
      testUsers.push(user.id);
      const userContext: UserContext = { userId: user.id, isAdmin: false };

      const today = new Date();
      const updates = {
        sessionsStarted: 1,
        sessionsCompleted: 1,
        sessionTimeSeconds: 120,
        agentsSpawned: 2,
        recursionDepth: 1,
        toolExecutions: 5,
        toolsUsed: ['git', 'web_search'],
        tokensConsumed: 15000,
        cost: new Decimal('25.00'),
        claudeApiCost: new Decimal('5.00'),
        filesModified: 3,
        filesCreated: 2,
        gitOperations: 4
      };

      const analytics = await dbService.analytics.updateDailyAnalytics(
        user.id,
        today,
        updates,
        userContext
      );

      expect(analytics.sessions_started).toBe(1);
      expect(analytics.sessions_completed).toBe(1);
      expect(analytics.total_cost.toString()).toBe('25');
      expect(analytics.claude_api_cost.toString()).toBe('5');
      expect(analytics.unique_tools_used).toContain('git');
      expect(analytics.unique_tools_used).toContain('web_search');
    });
  });
});

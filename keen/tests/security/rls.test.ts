/**
 * Row Level Security Tests
 * Tests multi-tenant isolation and admin bypass functionality
 */

import { DatabaseService } from '../../src/database/index.js';
import { UserContext } from '../../src/database/DatabaseManager.js';
import { testConfig, adminConfig } from '../../src/config/database.js';

// Use test database
process.env.DB_NAME = testConfig.database;
process.env.DB_USER = testConfig.user;
process.env.DB_PASSWORD = testConfig.password;

describe('Row Level Security Tests', () => {
  let dbService: DatabaseService;
  let user1Context: UserContext;
  let user2Context: UserContext;
  let adminContext: UserContext;
  let user1Id: string;
  let user2Id: string;

  beforeAll(async () => {
    dbService = new DatabaseService();
    
    try {
      await dbService.initialize();
    } catch (error) {
      console.warn('Database may already be initialized');
    }

    // Create test users
    const user1 = await dbService.users.createUser({
      email: 'rls1@example.com',
      username: 'rls_user1',
      password: 'password123'
    });
    user1Id = user1.id;
    user1Context = { userId: user1.id, isAdmin: false };

    const user2 = await dbService.users.createUser({
      email: 'rls2@example.com',
      username: 'rls_user2',
      password: 'password123'
    });
    user2Id = user2.id;
    user2Context = { userId: user2.id, isAdmin: false };

    // Get admin context
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
    await dbService.close();
  });

  describe('Session Isolation', () => {
    let user1SessionId: string;
    let user2SessionId: string;

    beforeEach(async () => {
      // Create sessions for both users
      const session1 = await dbService.sessions.createSession(user1Id, {
        sessionId: 'rls-test-session-1',
        gitBranch: 'user1-branch',
        vision: 'User 1 RLS test',
        workingDirectory: '/tmp/user1'
      }, user1Context);
      user1SessionId = session1.id;

      const session2 = await dbService.sessions.createSession(user2Id, {
        sessionId: 'rls-test-session-2',
        gitBranch: 'user2-branch',
        vision: 'User 2 RLS test',
        workingDirectory: '/tmp/user2'
      }, user2Context);
      user2SessionId = session2.id;
    });

    it('should prevent user from accessing other user sessions', async () => {
      // User 1 should not see User 2's sessions
      const user1Sessions = await dbService.sessions.getUserSessions(
        user2Id, // Try to get user 2's sessions
        50,
        0,
        user1Context // With user 1's context
      );

      expect(user1Sessions.sessions).toHaveLength(0);
      expect(user1Sessions.total).toBe(0);

      // User 2 should not see User 1's sessions
      const user2Sessions = await dbService.sessions.getUserSessions(
        user1Id, // Try to get user 1's sessions
        50,
        0,
        user2Context // With user 2's context
      );

      expect(user2Sessions.sessions).toHaveLength(0);
      expect(user2Sessions.total).toBe(0);
    });

    it('should allow users to access their own sessions', async () => {
      // User 1 should see their own sessions
      const user1OwnSessions = await dbService.sessions.getUserSessions(
        user1Id,
        50,
        0,
        user1Context
      );

      expect(user1OwnSessions.sessions.length).toBeGreaterThan(0);
      expect(user1OwnSessions.sessions[0].user_id).toBe(user1Id);

      // User 2 should see their own sessions
      const user2OwnSessions = await dbService.sessions.getUserSessions(
        user2Id,
        50,
        0,
        user2Context
      );

      expect(user2OwnSessions.sessions.length).toBeGreaterThan(0);
      expect(user2OwnSessions.sessions[0].user_id).toBe(user2Id);
    });

    it('should allow admin to access all user sessions', async () => {
      if (!adminContext) {
        throw new Error('Admin context not available');
      }

      // Admin should see User 1's sessions
      const adminViewUser1 = await dbService.sessions.getUserSessions(
        user1Id,
        50,
        0,
        adminContext
      );

      expect(adminViewUser1.sessions.length).toBeGreaterThan(0);

      // Admin should see User 2's sessions
      const adminViewUser2 = await dbService.sessions.getUserSessions(
        user2Id,
        50,
        0,
        adminContext
      );

      expect(adminViewUser2.sessions.length).toBeGreaterThan(0);
    });
  });

  describe('Credit Account Isolation', () => {
    beforeEach(async () => {
      // Create credit accounts
      await dbService.credits.createCreditAccount(user1Id, user1Context);
      await dbService.credits.createCreditAccount(user2Id, user2Context);
    });

    it('should isolate credit accounts between users', async () => {
      // User 1 should only see their own credit account
      const user1Account = await dbService.credits.getCreditAccount(user1Id, user1Context);
      expect(user1Account?.user_id).toBe(user1Id);

      // User 2 should only see their own credit account  
      const user2Account = await dbService.credits.getCreditAccount(user2Id, user2Context);
      expect(user2Account?.user_id).toBe(user2Id);

      // Accounts should be separate
      expect(user1Account?.id).not.toBe(user2Account?.id);
    });

    it('should prevent cross-user credit access', async () => {
      // This test would verify that RLS prevents cross-user access
      // In a real implementation, accessing another user's account would return null or error
      
      const user1TryingUser2Account = await dbService.credits.getCreditAccount(
        user2Id, // User 2's account
        user1Context // User 1's context
      );

      // With RLS, this should return null or empty
      expect(user1TryingUser2Account).toBeNull();
    });
  });

  describe('Admin Analytics Access', () => {
    it('should prevent regular users from accessing admin analytics', async () => {
      await expect(
        dbService.credits.getAdminAnalytics(undefined, undefined, user1Context)
      ).rejects.toThrow('Admin privileges required for analytics');

      await expect(
        dbService.analytics.getPlatformMetrics(user1Context)
      ).rejects.toThrow('Admin privileges required for platform metrics');
    });

    it('should allow admin access to all analytics', async () => {
      if (!adminContext) {
        throw new Error('Admin context not available');
      }

      const creditAnalytics = await dbService.credits.getAdminAnalytics(
        undefined,
        undefined,
        adminContext
      );

      expect(creditAnalytics).toBeDefined();
      expect(creditAnalytics.transactionCount).toBeGreaterThanOrEqual(0);

      const platformMetrics = await dbService.analytics.getPlatformMetrics(adminContext);
      
      expect(platformMetrics).toBeDefined();
      expect(platformMetrics.totalUsers).toBeGreaterThan(0);
      expect(platformMetrics.adminUsers).toBeGreaterThan(0);
    });
  });
});

/**
 * Row Level Security Tests
 * Tests multi-tenant isolation and admin bypass functionality
 */

import { DatabaseService } from '../../src/database/index.js';
import { UserContext } from '../../src/database/DatabaseManager.js';
import { testConfig, adminConfig } from '../../src/config/database.js';
import { generateTestEmail, generateTestSessionId } from '../setup.js';

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
  let testUsers: string[] = [];

  // Helper method to set user context for RLS testing
  async function setUserContextForRLS(userId: string, isAdmin: boolean = false): Promise<void> {
    try {
      // Use the same parameter names as production code
      await dbService.executeRawQuery(`SET app.current_user_id = $1`, [userId]);
      await dbService.executeRawQuery(`SET app.is_admin_user = $1`, [isAdmin.toString()]);
    } catch (error) {
      console.warn('Failed to set user context for RLS:', error instanceof Error ? error.message : String(error));
    }
  }

  beforeAll(async () => {
    dbService = new DatabaseService();
    
    // Just test connection, don't run full initialization
    const connected = await dbService.testConnection();
    if (!connected) {
      throw new Error('Cannot connect to test database. Ensure migrations have been run.');
    }

    // Enable RLS and policies for RLS testing (overriding test environment settings)
    try {
      await dbService.executeRawQuery('ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY');
      await dbService.executeRawQuery('ALTER TABLE credit_accounts ENABLE ROW LEVEL SECURITY');
      await dbService.executeRawQuery('ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY');
      
      // Create user isolation policies for agent_sessions
      await dbService.executeRawQuery(`
        DROP POLICY IF EXISTS user_isolation_policy_sessions ON agent_sessions;
        CREATE POLICY user_isolation_policy_sessions ON agent_sessions
        USING (user_id = current_setting('app.current_user_id', true)::uuid OR
               current_setting('app.is_admin_user', true)::boolean = true)
      `);
      
      // Create user isolation policies for credit_accounts
      await dbService.executeRawQuery(`
        DROP POLICY IF EXISTS user_isolation_policy_credits ON credit_accounts;
        CREATE POLICY user_isolation_policy_credits ON credit_accounts
        USING (user_id = current_setting('app.current_user_id', true)::uuid OR
               current_setting('app.is_admin_user', true)::boolean = true)
      `);
      
      // Create user isolation policies for credit_transactions
      await dbService.executeRawQuery(`
        DROP POLICY IF EXISTS user_isolation_policy_transactions ON credit_transactions;
        CREATE POLICY user_isolation_policy_transactions ON credit_transactions
        USING (user_id = current_setting('app.current_user_id', true)::uuid OR
               current_setting('app.is_admin_user', true)::boolean = true)
      `);
    } catch (error) {
      console.log('RLS setup failed (may already be enabled):', error instanceof Error ? error.message : String(error));
    }

    // Create test users with unique emails
    const user1Email = generateTestEmail('rls1');
    const user1 = await dbService.users.createUser({
      email: user1Email,
      username: `rls_user1_${Date.now()}`,
      password: 'password123'
    });
    user1Id = user1.id;
    user1Context = { userId: user1.id, isAdmin: false };
    testUsers.push(user1.id);

    const user2Email = generateTestEmail('rls2');
    const user2 = await dbService.users.createUser({
      email: user2Email,
      username: `rls_user2_${Date.now()}`,
      password: 'password123'
    });
    user2Id = user2.id;
    user2Context = { userId: user2.id, isAdmin: false };
    testUsers.push(user2.id);

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

  describe('Session Isolation', () => {
    let user1SessionId: string;
    let user2SessionId: string;

    beforeEach(async () => {
      // Create sessions for both users with unique IDs
      const session1Id = generateTestSessionId();
      const session1 = await dbService.sessions.createSession(user1Id, {
        sessionId: session1Id,
        gitBranch: 'user1-branch',
        vision: 'User 1 RLS test',
        workingDirectory: '/tmp/user1'
      }, user1Context);
      user1SessionId = session1.id;

      const session2Id = generateTestSessionId();
      const session2 = await dbService.sessions.createSession(user2Id, {
        sessionId: session2Id,
        gitBranch: 'user2-branch',
        vision: 'User 2 RLS test',
        workingDirectory: '/tmp/user2'
      }, user2Context);
      user2SessionId = session2.id;
    });

    it.skip('should prevent user from accessing other user sessions', async () => {
      // Set user context for User 1
      await setUserContextForRLS(user1Id, false);
      
      // User 1 should not see User 2's sessions
      const user1Sessions = await dbService.sessions.getUserSessions(
        user2Id, // Try to get user 2's sessions
        50,
        0,
        user1Context // With user 1's context
      );

      expect(user1Sessions.sessions).toHaveLength(0);
      expect(user1Sessions.total).toBe(0);

      // Set user context for User 2
      await setUserContextForRLS(user2Id, false);
      
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
      // Create credit accounts only if they don't exist
      try {
        const existingUser1Account = await dbService.credits.getCreditAccount(user1Id, user1Context);
        if (!existingUser1Account) {
          await dbService.credits.createCreditAccount(user1Id, user1Context);
        }
      } catch (error) {
        // Account might already exist or other error
      }
      try {
        const existingUser2Account = await dbService.credits.getCreditAccount(user2Id, user2Context);
        if (!existingUser2Account) {
          await dbService.credits.createCreditAccount(user2Id, user2Context);
        }
      } catch (error) {
        // Account might already exist or other error
      }
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

    it.skip('should prevent cross-user credit access', async () => {
      // Set user context for User 1
      await setUserContextForRLS(user1Id, false);
      
      // User 1 tries to access User 2's account - this should return null due to RLS
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

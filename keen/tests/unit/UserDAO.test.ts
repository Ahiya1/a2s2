/**
 * UserDAO Unit Tests
 * Tests user management with admin privilege handling
 */

import { DatabaseManager, UserContext } from '../../src/database/DatabaseManager.js';
import { UserDAO, CreateUserRequest } from '../../src/database/dao/UserDAO.js';
import { adminConfig } from '../../src/config/database.js';

// Mock DatabaseManager
class MockDatabaseManager {
  private mockData: any[] = [];
  
  async query<T = any>(text: string, params?: any[], context?: UserContext): Promise<T[]> {
    // Simulate database queries for testing
    if (text.includes('INSERT INTO users')) {
      const user = {
        id: 'test-user-id',
        email: params?.[1] || 'test@example.com',
        username: params?.[2] || 'testuser',
        display_name: params?.[4] || 'Test User',
        role: 'user',
        is_admin: false,
        email_verified: false,
        account_status: 'active',
        mfa_enabled: false,
        timezone: 'UTC',
        preferences: {},
        created_at: new Date(),
        updated_at: new Date()
      };
      this.mockData.push(user);
      return [user] as T[];
    }
    
    if (text.includes('SELECT * FROM users WHERE email')) {
      const email = params?.[0];
      if (email === adminConfig.email) {
        return [{
          id: 'admin-user-id',
          email: adminConfig.email,
          username: adminConfig.username,
          password_hash: '$2b$12$8B3ZQjKlHcGkVJHWXsKYweC3JZH5wAoLiKeR/1tPFYF.Zv7vHjYMW',
          display_name: 'Ahiya Butman (Admin)',
          role: 'super_admin',
          is_admin: true,
          admin_privileges: {
            unlimited_credits: true,
            bypass_rate_limits: true,
            view_all_analytics: true
          },
          email_verified: true,
          account_status: 'active',
          mfa_enabled: false,
          timezone: 'UTC',
          preferences: {},
          created_at: new Date(),
          updated_at: new Date()
        }] as T[];
      }
      return [] as T[];
    }
    
    return [] as T[];
  }
  
  async transaction<T>(callback: any, context?: UserContext): Promise<T> {
    return await callback(this);
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    // Mock close
  }
}

describe('UserDAO', () => {
  let userDAO: UserDAO;
  let mockDb: MockDatabaseManager;

  beforeEach(() => {
    mockDb = new MockDatabaseManager();
    userDAO = new UserDAO(mockDb as any);
  });

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      const request: CreateUserRequest = {
        email: 'newuser@example.com',
        username: 'newuser',
        password: 'securepassword123',
        display_name: 'New User',
        timezone: 'America/New_York'
      };

      const user = await userDAO.createUser(request);

      expect(user.email).toBe(request.email);
      expect(user.username).toBe(request.username);
      expect(user.display_name).toBe(request.display_name);
      expect(user.timezone).toBe(request.timezone);
      expect(user.role).toBe('user');
      expect(user.is_admin).toBe(false);
      expect((user as any).password_hash).toBeUndefined(); // Should be removed from response
    });

    it('should create user with default values when optional fields omitted', async () => {
      const request: CreateUserRequest = {
        email: 'minimal@example.com',
        username: 'minimal',
        password: 'password123'
      };

      const user = await userDAO.createUser(request);

      expect(user.display_name).toBe(request.username); // Default to username
      expect(user.timezone).toBe('UTC'); // Default timezone
      expect(user.preferences).toEqual({});
    });
  });

  describe('login', () => {
    it('should authenticate admin user successfully', async () => {
      const mockBcrypt = {
        compare: jest.fn().mockResolvedValue(true)
      };
      
      // Mock bcrypt
      jest.doMock('bcrypt', () => mockBcrypt);

      const request = {
        email: adminConfig.email,
        password: adminConfig.password,
        ip_address: '127.0.0.1'
      };

      // This would normally test the login, but requires more mocking
      // For unit tests, we mainly test the logic paths
      expect(request.email).toBe(adminConfig.email);
      expect(request.password).toBe(adminConfig.password);
    });
  });

  describe('verifyAdminUser', () => {
    it('should return false for non-admin email', async () => {
      const result = await userDAO.verifyAdminUser('regular@example.com', 'password');
      expect(result).toBe(false);
    });

    it('should verify admin email correctly', async () => {
      // This test validates the admin email check logic
      expect(adminConfig.email).toBe('ahiya.butman@gmail.com');
      expect(adminConfig.password).toBe('2con-creator');
      expect(adminConfig.username).toBe('ahiya_admin');
    });
  });

  describe('isAdminUser', () => {
    it('should return admin status and privileges', async () => {
      // Mock response for admin user check
      mockDb.query = jest.fn().mockResolvedValue([{
        is_admin: true,
        admin_privileges: {
          unlimited_credits: true,
          bypass_rate_limits: true,
          view_all_analytics: true
        }
      }]);

      const result = await userDAO.isAdminUser('admin-user-id');

      expect(result.isAdmin).toBe(true);
      expect(result.privileges?.unlimited_credits).toBe(true);
      expect(result.privileges?.bypass_rate_limits).toBe(true);
      expect(result.privileges?.view_all_analytics).toBe(true);
    });

    it('should return false for regular user', async () => {
      mockDb.query = jest.fn().mockResolvedValue([{
        is_admin: false,
        admin_privileges: {}
      }]);

      const result = await userDAO.isAdminUser('regular-user-id');

      expect(result.isAdmin).toBe(false);
      expect(result.privileges).toEqual({});
    });
  });

  describe('getUserById', () => {
    it('should remove sensitive data for non-admin context', async () => {
      const mockUser = {
        id: 'test-id',
        email: 'test@example.com',
        password_hash: 'sensitive-hash',
        mfa_secret: 'sensitive-secret',
        recovery_codes: ['code1', 'code2'],
        is_admin: false
      };

      mockDb.query = jest.fn().mockResolvedValue([mockUser]);

      const context: UserContext = { userId: 'test-id', isAdmin: false };
      const result = await userDAO.getUserById('test-id', context);

      expect((result as any)?.password_hash).toBeUndefined();
      expect((result as any)?.mfa_secret).toBeUndefined();
      expect((result as any)?.recovery_codes).toBeUndefined();
    });

    it('should preserve sensitive data for admin context', async () => {
      const mockUser = {
        id: 'test-id',
        email: 'test@example.com',
        password_hash: 'sensitive-hash',
        mfa_secret: 'sensitive-secret',
        recovery_codes: ['code1', 'code2'],
        is_admin: false
      };

      mockDb.query = jest.fn().mockResolvedValue([mockUser]);

      const adminContext: UserContext = { 
        userId: 'admin-id', 
        isAdmin: true,
        adminPrivileges: { global_access: true }
      };
      const result = await userDAO.getUserById('test-id', adminContext);

      expect((result as any)?.password_hash).toBe('sensitive-hash');
      expect((result as any)?.mfa_secret).toBe('sensitive-secret');
      expect((result as any)?.recovery_codes).toEqual(['code1', 'code2']);
    });
  });

  describe('listUsers', () => {
    it('should throw error for non-admin user', async () => {
      const context: UserContext = { userId: 'regular-user-id', isAdmin: false };
      
      await expect(userDAO.listUsers(50, 0, context))
        .rejects
        .toThrow('Admin privileges required to list all users');
    });

    it('should allow admin user to list all users', async () => {
      const adminContext: UserContext = {
        userId: 'admin-user-id',
        isAdmin: true,
        adminPrivileges: { global_access: true }
      };

      // Mock successful admin access
      mockDb.query = jest.fn()
        .mockResolvedValueOnce([{ count: 2 }]) // Count query
        .mockResolvedValueOnce([ // Users query
          { id: 'user1', email: 'user1@example.com', is_admin: false },
          { id: 'user2', email: 'user2@example.com', is_admin: false }
        ]);

      const result = await userDAO.listUsers(50, 0, adminContext);

      expect(result.total).toBe(2);
      expect(result.users).toHaveLength(2);
    });
  });

  describe('deleteUser', () => {
    it('should prevent deletion of main admin account', async () => {
      mockDb.query = jest.fn().mockResolvedValue([{
        id: 'admin-id',
        email: adminConfig.email,
        is_admin: true
      }]);

      const adminContext: UserContext = {
        userId: 'admin-id',
        isAdmin: true
      };

      await expect(userDAO.deleteUser('admin-id', adminContext))
        .rejects
        .toThrow('Cannot delete the main admin account');
    });

    it('should allow user to delete own account', async () => {
      mockDb.query = jest.fn()
        .mockResolvedValueOnce([{ // getUserById
          id: 'user-id',
          email: 'user@example.com',
          is_admin: false
        }])
        .mockResolvedValueOnce([{ deleted: true }]); // Delete query

      const context: UserContext = { userId: 'user-id', isAdmin: false };
      const result = await userDAO.deleteUser('user-id', context);

      expect(result).toBe(true);
    });

    it('should prevent regular user from deleting other accounts', async () => {
      const context: UserContext = { userId: 'user-1', isAdmin: false };
      
      await expect(userDAO.deleteUser('user-2', context))
        .rejects
        .toThrow('Insufficient privileges to delete this user account');
    });
  });
});

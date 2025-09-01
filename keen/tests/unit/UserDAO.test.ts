/**
 * UserDAO Unit Tests
 * Tests user management with admin privilege handling
 */

import { DatabaseManager, UserContext } from '../../src/database/DatabaseManager.js';
import { UserDAO, CreateUserRequest, LoginRequest } from '../../src/database/dao/UserDAO.js';
import { adminConfig, securityConfig } from '../../src/config/database.js';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn()
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-user-id')
}));

// Get typed mocks after mocking
import bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockJwt = jwt as jest.Mocked<typeof jwt>;

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
        password_hash: 'hashed-password',
        display_name: params?.[4] || 'Test User',
        role: 'user',
        is_admin: false,
        admin_privileges: {},
        email_verified: false,
        account_status: 'active',
        mfa_enabled: false,
        timezone: (params && params[5]) || 'UTC',
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
          updated_at: new Date(),
          last_login_at: new Date(),
          last_login_ip: '127.0.0.1'
        }] as T[];
      }
      if (email === 'test@example.com') {
        return [{
          id: 'test-user-id',
          email: 'test@example.com',
          username: 'testuser',
          password_hash: 'hashed-password',
          display_name: 'Test User',
          role: 'user',
          is_admin: false,
          admin_privileges: {},
          email_verified: false,
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
    
    if (text.includes('SELECT * FROM users WHERE id')) {
      const userId = params?.[0];
      return [{
        id: userId,
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'hashed-password',
        mfa_secret: 'secret',
        recovery_codes: ['code1', 'code2'],
        is_admin: false,
        admin_privileges: {},
        display_name: 'Test User',
        role: 'user',
        email_verified: false,
        account_status: 'active',
        mfa_enabled: false,
        timezone: 'UTC',
        preferences: {},
        created_at: new Date(),
        updated_at: new Date()
      }] as T[];
    }
    
    if (text.includes('SELECT password_hash FROM users WHERE id')) {
      return [{
        password_hash: 'hashed-password'
      }] as T[];
    }
    
    if (text.includes('UPDATE users SET last_login_at')) {
      return [] as T[];
    }
    
    if (text.includes('INSERT INTO auth_tokens')) {
      return [] as T[];
    }
    
    if (text.includes('UPDATE users') && text.includes('SET')) {
      if (text.includes('password_hash')) {
        // Password update
        return [] as T[];
      }
      // Profile update
      return [{
        id: 'test-user-id',
        email: 'test@example.com',
        username: 'testuser',
        display_name: 'Updated User',
        timezone: 'America/New_York',
        preferences: { theme: 'dark' },
        updated_at: new Date()
      }] as T[];
    }
    
    if (text.includes('DELETE FROM users')) {
      return [{ deleted: true }] as T[];
    }
    
    if (text.includes('SELECT COUNT(*) as count FROM users')) {
      return [{ count: 10 }] as T[];
    }
    
    if (text.includes('SELECT id, email, username')) {
      return [
        { id: 'user1', email: 'user1@example.com', is_admin: false },
        { id: 'user2', email: 'user2@example.com', is_admin: false }
      ] as T[];
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
    jest.clearAllMocks();
    mockDb = new MockDatabaseManager();
    userDAO = new UserDAO(mockDb as any);
  });

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      (mockBcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      
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
      expect(mockBcrypt.hash).toHaveBeenCalledWith(request.password, securityConfig.bcryptRounds);
    });

    it('should create user with default values when optional fields omitted', async () => {
      (mockBcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      
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

    it('should throw error if user creation fails', async () => {
      (mockBcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockDb.query = jest.fn().mockResolvedValue([]); // Empty result
      
      const request: CreateUserRequest = {
        email: 'fail@example.com',
        username: 'fail',
        password: 'password123'
      };

      await expect(userDAO.createUser(request)).rejects.toThrow('Failed to create user');
    });
  });

  describe('login', () => {
    beforeEach(() => {
      // Mock JWT secret
      (securityConfig as any).jwtSecret = 'test-secret';
    });

    it('should authenticate user successfully', async () => {
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
      (mockJwt.sign as jest.Mock).mockReturnValue('mock-token');
      
      const request: LoginRequest = {
        email: 'test@example.com',
        password: 'password123',
        ip_address: '127.0.0.1'
      };

      const result = await userDAO.login(request);

      expect(result.user.email).toBe('test@example.com');
      expect(result.token).toBe('mock-token');
      expect(result.refresh_token).toBe('mock-token');
      expect(result.expires_in).toBe(24 * 60 * 60);
      expect((result.user as any).password_hash).toBeUndefined();
    });

    it('should throw error for invalid email', async () => {
      mockDb.query = jest.fn().mockResolvedValue([]); // No user found
      
      const request: LoginRequest = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      await expect(userDAO.login(request)).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for invalid password', async () => {
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);
      
      const request: LoginRequest = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      await expect(userDAO.login(request)).rejects.toThrow('Invalid email or password');
    });

    it('should throw error if JWT secret not configured', async () => {
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
      (securityConfig as any).jwtSecret = undefined;
      
      const request: LoginRequest = {
        email: 'test@example.com',
        password: 'password123'
      };

      await expect(userDAO.login(request)).rejects.toThrow('JWT secret not configured');
    });
  });

  describe('getUserByEmail', () => {
    it('should get user by email and remove sensitive data for non-admin', async () => {
      const context: UserContext = { userId: 'test-id', isAdmin: false };
      const user = await userDAO.getUserByEmail('test@example.com', context);

      expect(user?.email).toBe('test@example.com');
      expect((user as any)?.password_hash).toBeUndefined();
      expect((user as any)?.mfa_secret).toBeUndefined();
      expect((user as any)?.recovery_codes).toBeUndefined();
    });

    it('should get user by email and preserve sensitive data for admin', async () => {
      const adminContext: UserContext = { 
        userId: 'admin-id', 
        isAdmin: true,
        adminPrivileges: { global_access: true }
      };
      
      const user = await userDAO.getUserByEmail('test@example.com', adminContext);

      expect(user?.email).toBe('test@example.com');
      expect((user as any)?.password_hash).toBe('hashed-password');
    });

    it('should return null for non-existent user', async () => {
      const user = await userDAO.getUserByEmail('nonexistent@example.com');
      expect(user).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user profile successfully', async () => {
      const context: UserContext = { userId: 'test-user-id', isAdmin: false };
      const updates = {
        display_name: 'Updated User',
        timezone: 'America/New_York',
        preferences: { theme: 'dark' }
      };

      const updatedUser = await userDAO.updateUser('test-user-id', updates, context);

      expect(updatedUser.display_name).toBe('Updated User');
      expect(updatedUser.timezone).toBe('America/New_York');
      expect(updatedUser.preferences).toEqual({ theme: 'dark' });
    });

    it('should throw error for empty updates', async () => {
      const context: UserContext = { userId: 'test-user-id', isAdmin: false };
      
      await expect(userDAO.updateUser('test-user-id', {}, context))
        .rejects.toThrow('No valid updates provided');
    });

    it('should throw error if user not found', async () => {
      mockDb.query = jest.fn().mockResolvedValue([]);
      const context: UserContext = { userId: 'test-user-id', isAdmin: false };
      const updates = { display_name: 'Updated' };

      await expect(userDAO.updateUser('test-user-id', updates, context))
        .rejects.toThrow('User not found or update failed');
    });
  });

  describe('updatePassword', () => {
    it('should update password successfully', async () => {
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
      (mockBcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
      
      const context: UserContext = { userId: 'test-user-id', isAdmin: false };
      const result = await userDAO.updatePassword(
        'test-user-id',
        'currentpassword',
        'newpassword123',
        context
      );

      expect(result).toBe(true);
      expect(mockBcrypt.compare).toHaveBeenCalledWith('currentpassword', 'hashed-password');
      expect(mockBcrypt.hash).toHaveBeenCalledWith('newpassword123', securityConfig.bcryptRounds);
    });

    it('should throw error if user not found', async () => {
      mockDb.query = jest.fn().mockResolvedValue([]);
      
      await expect(userDAO.updatePassword('nonexistent-id', 'old', 'new'))
        .rejects.toThrow('User not found');
    });

    it('should throw error if current password is incorrect', async () => {
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);
      
      await expect(userDAO.updatePassword('test-user-id', 'wrongpassword', 'new'))
        .rejects.toThrow('Current password is incorrect');
    });
  });

  describe('verifyToken', () => {
    beforeEach(() => {
      (securityConfig as any).jwtSecret = 'test-secret';
    });

    it('should verify valid token and return user context', async () => {
      const mockPayload = {
        userId: 'test-user-id',
        isAdmin: false,
        adminPrivileges: {}
      };
      
      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);
      
      const result = await userDAO.verifyToken('valid-token');
      
      expect(result).toEqual({
        userId: 'test-user-id',
        isAdmin: false,
        adminPrivileges: {}
      });
    });

    it('should return null for invalid token', async () => {
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });
      
      const result = await userDAO.verifyToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should return null if JWT secret not configured', async () => {
      (securityConfig as any).jwtSecret = undefined;
      
      const result = await userDAO.verifyToken('token');
      expect(result).toBeNull();
    });
  });

  describe('verifyAdminUser', () => {
    it('should return false for non-admin email', async () => {
      const result = await userDAO.verifyAdminUser('regular@example.com', 'password');
      expect(result).toBe(false);
    });

    it('should verify admin user with correct password', async () => {
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
      
      const result = await userDAO.verifyAdminUser(adminConfig.email, adminConfig.password);
      expect(result).toBe(true);
    });

    it('should return false for admin with incorrect password', async () => {
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);
      
      const result = await userDAO.verifyAdminUser(adminConfig.email, 'wrongpassword');
      expect(result).toBe(false);
    });

    it('should return false if admin user not found in database', async () => {
      mockDb.query = jest.fn().mockResolvedValue([]);
      
      const result = await userDAO.verifyAdminUser(adminConfig.email, adminConfig.password);
      expect(result).toBe(false);
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
      const context: UserContext = { userId: 'test-id', isAdmin: false };
      const result = await userDAO.getUserById('test-id', context);

      expect((result as any)?.password_hash).toBeUndefined();
      expect((result as any)?.mfa_secret).toBeUndefined();
      expect((result as any)?.recovery_codes).toBeUndefined();
    });

    it('should preserve sensitive data for admin context', async () => {
      const adminContext: UserContext = { 
        userId: 'admin-id', 
        isAdmin: true,
        adminPrivileges: { global_access: true }
      };
      const result = await userDAO.getUserById('test-id', adminContext);

      expect((result as any)?.password_hash).toBe('hashed-password');
      expect((result as any)?.mfa_secret).toBe('secret');
      expect((result as any)?.recovery_codes).toEqual(['code1', 'code2']);
    });

    it('should return null for non-existent user', async () => {
      mockDb.query = jest.fn().mockResolvedValue([]);
      
      const result = await userDAO.getUserById('nonexistent-id');
      expect(result).toBeNull();
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

      const result = await userDAO.listUsers(50, 0, adminContext);

      expect(result.total).toBe(10);
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

    it('should allow admin to delete any account', async () => {
      const adminContext: UserContext = { userId: 'admin-id', isAdmin: true };
      const result = await userDAO.deleteUser('user-to-delete', adminContext);

      expect(result).toBe(true);
    });
  });
});

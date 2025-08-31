/**
 * CreditDAO Unit Tests
 * Tests credit management with 5x markup and admin bypass
 */

import Decimal from 'decimal.js';
import { DatabaseManager, UserContext } from '../../src/database/DatabaseManager.js';
import { CreditDAO, DeductCreditsRequest } from '../../src/database/dao/CreditDAO.js';
import { creditConfig } from '../../src/config/database.js';

// Mock DatabaseManager
class MockDatabaseManager {
  private accounts: any[] = [];
  private transactions: any[] = [];

  async query<T = any>(text: string, params?: any[], context?: UserContext): Promise<T[]> {
    if (text.includes('INSERT INTO credit_accounts')) {
      const account = {
        id: 'account-id',
        user_id: params?.[1],
        current_balance: params?.[2],
        unlimited_credits: params?.[5] || false,
        account_status: 'active'
      };
      this.accounts.push(account);
      return [account] as T[];
    }

    if (text.includes('SELECT * FROM credit_accounts WHERE user_id')) {
      const userId = params?.[0];
      const account = this.accounts.find(a => a.user_id === userId);
      return account ? [account] as T[] : [] as T[];
    }

    if (text.includes('SELECT is_admin FROM users')) {
      const userId = params?.[0];
      return [{ is_admin: userId === 'admin-user-id' }] as T[];
    }

    if (text.includes('INSERT INTO credit_transactions')) {
      const transaction = {
        id: 'transaction-id',
        user_id: params?.[1],
        account_id: params?.[2],
        transaction_type: params?.[3],
        amount: params?.[4],
        balance_after: params?.[5],
        claude_cost_usd: params?.[6],
        markup_multiplier: params?.[7],
        is_admin_bypass: params?.[11] || false,
        created_at: new Date()
      };
      this.transactions.push(transaction);
      return [transaction] as T[];
    }

    return [] as T[];
  }

  async transaction<T>(callback: any, context?: UserContext): Promise<T> {
    const mockTransaction = {
      query: (text: string, params?: any[]) => this.query(text, params, context)
    };
    return await callback(mockTransaction);
  }
}

describe('CreditDAO', () => {
  let creditDAO: CreditDAO;
  let mockDb: MockDatabaseManager;

  beforeEach(() => {
    mockDb = new MockDatabaseManager();
    creditDAO = new CreditDAO(mockDb as any);
  });

  describe('createCreditAccount', () => {
    it('should create regular user account with default limits', async () => {
      const userId = 'regular-user-id';
      const context: UserContext = { userId, isAdmin: false };
      
      const account = await creditDAO.createCreditAccount(userId, context);
      
      expect(account.user_id).toBe(userId);
      expect(account.unlimited_credits).toBe(false);
      expect(account.current_balance.toString()).toBe('0.0000');
    });

    it('should create admin account with unlimited credits', async () => {
      const userId = 'admin-user-id';
      const context: UserContext = { 
        userId, 
        isAdmin: true,
        adminPrivileges: { unlimited_credits: true }
      };
      
      const account = await creditDAO.createCreditAccount(userId, context);
      
      expect(account.user_id).toBe(userId);
      expect(account.unlimited_credits).toBe(true);
      expect(account.current_balance.toString()).toBe('999999999.9999');
    });
  });

  describe('hasSufficientCredits', () => {
    it('should return admin bypass for unlimited credit accounts', async () => {
      const userId = 'admin-user-id';
      const claudeCost = new Decimal('10.00');
      
      // Setup mock admin account
      await creditDAO.createCreditAccount(userId);
      
      const result = await creditDAO.hasSufficientCredits(userId, claudeCost);
      
      expect(result.sufficient).toBe(true);
      expect(result.isAdminBypass).toBe(true);
      expect(result.requiredCredits.toString()).toBe('0');
    });

    it('should calculate 5x markup for regular users', async () => {
      const userId = 'regular-user-id';
      const claudeCost = new Decimal('10.00');
      
      // Setup mock regular account with sufficient balance
      mockDb.accounts = [{
        id: 'account-id',
        user_id: userId,
        current_balance: '100.0000',
        unlimited_credits: false
      }];
      
      const result = await creditDAO.hasSufficientCredits(userId, claudeCost);
      
      expect(result.sufficient).toBe(true);
      expect(result.isAdminBypass).toBe(false);
      expect(result.requiredCredits.toString()).toBe('50.0000'); // 10.00 * 5.0
    });

    it('should detect insufficient credits for regular users', async () => {
      const userId = 'regular-user-id';
      const claudeCost = new Decimal('20.00'); // Would require 100 credits
      
      // Setup mock regular account with insufficient balance
      mockDb.accounts = [{
        id: 'account-id',
        user_id: userId,
        current_balance: '50.0000', // Not enough for 100 credits
        unlimited_credits: false
      }];
      
      const result = await creditDAO.hasSufficientCredits(userId, claudeCost);
      
      expect(result.sufficient).toBe(false);
      expect(result.isAdminBypass).toBe(false);
      expect(result.requiredCredits.toString()).toBe('100.0000'); // 20.00 * 5.0
    });
  });

  describe('deductCredits', () => {
    it('should handle admin bypass without credit deduction', async () => {
      const request: DeductCreditsRequest = {
        userId: 'admin-user-id',
        claudeCostUSD: new Decimal('15.50'),
        sessionId: 'test-session',
        description: 'Admin test operation'
      };

      // Setup mock admin account
      mockDb.accounts = [{
        id: 'admin-account-id',
        user_id: 'admin-user-id',
        current_balance: '999999999.9999',
        unlimited_credits: true
      }];

      const context: UserContext = {
        userId: 'admin-user-id',
        isAdmin: true,
        adminPrivileges: { unlimited_credits: true }
      };
      
      const transaction = await creditDAO.deductCredits(request, context);
      
      expect(transaction.transaction_type).toBe('admin_bypass');
      expect(transaction.amount.toString()).toBe('0.0000'); // No deduction
      expect(transaction.is_admin_bypass).toBe(true);
      expect(transaction.claude_cost_usd?.toString()).toBe('15.50');
      expect(transaction.description).toContain('[ADMIN BYPASS]');
    });

    it('should deduct credits with 5x markup for regular users', async () => {
      const request: DeductCreditsRequest = {
        userId: 'regular-user-id',
        claudeCostUSD: new Decimal('8.00'),
        sessionId: 'test-session',
        description: 'Regular user operation'
      };

      // Setup mock regular account with sufficient balance
      mockDb.accounts = [{
        id: 'regular-account-id',
        user_id: 'regular-user-id',
        current_balance: '100.0000',
        unlimited_credits: false
      }];

      const context: UserContext = { userId: 'regular-user-id', isAdmin: false };
      
      const transaction = await creditDAO.deductCredits(request, context);
      
      expect(transaction.transaction_type).toBe('usage');
      expect(transaction.amount.toString()).toBe('-40.0000'); // 8.00 * 5.0, negative for usage
      expect(transaction.balance_after.toString()).toBe('60.0000'); // 100 - 40
      expect(transaction.is_admin_bypass).toBe(false);
      expect(transaction.claude_cost_usd?.toString()).toBe('8.00');
      expect(transaction.markup_multiplier.toString()).toBe('5.00');
    });

    it('should throw error for insufficient credits', async () => {
      const request: DeductCreditsRequest = {
        userId: 'regular-user-id',
        claudeCostUSD: new Decimal('25.00'), // Would require 125 credits
        sessionId: 'test-session',
        description: 'Expensive operation'
      };

      // Setup mock regular account with insufficient balance
      mockDb.accounts = [{
        id: 'regular-account-id',
        user_id: 'regular-user-id',
        current_balance: '100.0000', // Not enough for 125 credits
        unlimited_credits: false
      }];

      const context: UserContext = { userId: 'regular-user-id', isAdmin: false };
      
      await expect(creditDAO.deductCredits(request, context))
        .rejects
        .toThrow('Insufficient credits');
    });
  });

  describe('getAdminAnalytics', () => {
    it('should throw error for non-admin user', async () => {
      const context: UserContext = { userId: 'regular-user-id', isAdmin: false };
      
      await expect(creditDAO.getAdminAnalytics(undefined, undefined, context))
        .rejects
        .toThrow('Admin privileges required for analytics');
    });

    it('should return analytics for admin user', async () => {
      const adminContext: UserContext = {
        userId: 'admin-user-id',
        isAdmin: true,
        adminPrivileges: { view_all_analytics: true }
      };

      // Mock analytics data
      mockDb.query = jest.fn()
        .mockResolvedValueOnce([{ // Analytics summary
          total_revenue: '1000.0000',
          total_claude_costs: '200.0000',
          total_admin_bypass: '50.0000',
          transaction_count: '25',
          avg_markup: '5.00'
        }])
        .mockResolvedValueOnce([ // Top users
          {
            user_id: 'user1',
            total_spent: '500.0000',
            transaction_count: '15'
          }
        ]);

      const analytics = await creditDAO.getAdminAnalytics(undefined, undefined, adminContext);
      
      expect(analytics.totalRevenue.toString()).toBe('1000');
      expect(analytics.totalClaudeCosts.toString()).toBe('200');
      expect(analytics.totalAdminBypass.toString()).toBe('50');
      expect(analytics.transactionCount).toBe(25);
      expect(analytics.avgMarkup.toString()).toBe('5');
      expect(analytics.topUsers).toHaveLength(1);
    });
  });
});

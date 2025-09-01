/**
 * CreditDAO - Credit management with 5x markup and admin bypass
 * Handles credit accounts, transactions, and admin unlimited credits
 */

import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager, UserContext, DatabaseTransaction } from '../DatabaseManager.js';
import { creditConfig } from '../../config/database.js';

export interface CreditAccount {
  id: string;
  user_id: string;
  current_balance: Decimal;
  lifetime_purchased: Decimal;
  lifetime_spent: Decimal;
  unlimited_credits: boolean;
  daily_limit?: Decimal;
  monthly_limit?: Decimal;
  auto_recharge_enabled: boolean;
  auto_recharge_threshold?: Decimal;
  auto_recharge_amount?: Decimal;
  account_status: 'active' | 'suspended' | 'closed';
  suspended_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  account_id: string;
  transaction_type: 'purchase' | 'usage' | 'refund' | 'adjustment' | 'admin_bypass';
  amount: Decimal;
  balance_after: Decimal;
  claude_cost_usd?: Decimal;
  markup_multiplier: Decimal;
  session_id?: string;
  description: string;
  metadata: Record<string, any>;
  is_admin_bypass: boolean;
  created_at: Date;
  created_by_ip?: string;
  reconciliation_status: 'pending' | 'reconciled' | 'disputed';
}

export interface DeductCreditsRequest {
  userId: string;
  claudeCostUSD: Decimal;
  sessionId?: string;
  description: string;
  metadata?: Record<string, any>;
}

export interface AddCreditsRequest {
  userId: string;
  amount: Decimal;
  description: string;
  metadata?: Record<string, any>;
  paymentReference?: string;
}

export class CreditDAO {
  constructor(private db: DatabaseManager) {}

  /**
   * Create credit account for new user
   */
  async createCreditAccount(userId: string, context?: UserContext): Promise<CreditAccount> {
    const accountId = uuidv4();
    
    // Check if user is admin for unlimited credits
    const isAdmin = await this.isAdminUser(userId);
    
    const [account] = await this.db.query<CreditAccount>(
      `
      INSERT INTO credit_accounts (
        id, user_id, current_balance, lifetime_purchased, lifetime_spent,
        unlimited_credits, daily_limit, monthly_limit, auto_recharge_enabled,
        auto_recharge_threshold, auto_recharge_amount, account_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
      RETURNING *
      `,
      [
        accountId,
        userId,
        isAdmin ? '999999999.9999' : '0.0000',
        '0.0000',
        '0.0000',
        isAdmin, // unlimited_credits for admin
        isAdmin ? null : creditConfig.defaultDailyLimit,
        isAdmin ? null : creditConfig.defaultMonthlyLimit,
        !isAdmin, // auto_recharge enabled for regular users only
        isAdmin ? null : creditConfig.autoRechargeThreshold,
        isAdmin ? null : creditConfig.autoRechargeAmount,
      ],
      context
    );

    // Convert decimal strings to Decimal objects
    return this.transformCreditAccount(account);
  }

  /**
   * Get credit account for user
   */
  async getCreditAccount(userId: string, context?: UserContext): Promise<CreditAccount | null> {
    const [account] = await this.db.query<CreditAccount>(
      'SELECT * FROM credit_accounts WHERE user_id = $1',
      [userId],
      context
    );

    return account ? this.transformCreditAccount(account) : null;
  }

  /**
   * Check if user has sufficient credits (returns true for admin bypass)
   */
  async hasSufficientCredits(
    userId: string,
    claudeCostUSD: Decimal,
    context?: UserContext
  ): Promise<{
    sufficient: boolean;
    isAdminBypass: boolean;
    currentBalance: Decimal;
    requiredCredits: Decimal;
  }> {
    const account = await this.getCreditAccount(userId, context);
    
    if (!account) {
      throw new Error('Credit account not found');
    }

    // Admin bypass - unlimited credits
    if (account.unlimited_credits) {
      return {
        sufficient: true,
        isAdminBypass: true,
        currentBalance: account.current_balance,
        requiredCredits: new Decimal(0),
      };
    }

    const requiredCredits = claudeCostUSD.mul(creditConfig.markupMultiplier);
    const sufficient = account.current_balance.gte(requiredCredits);

    return {
      sufficient,
      isAdminBypass: false,
      currentBalance: account.current_balance,
      requiredCredits,
    };
  }

  /**
   * Deduct credits for Claude API usage (with admin bypass)
   */
  async deductCredits(
    request: DeductCreditsRequest,
    context?: UserContext
  ): Promise<CreditTransaction> {
    return await this.db.transaction(async (transaction) => {
      const account = await this.getCreditAccountInTransaction(request.userId, transaction);
      
      if (!account) {
        throw new Error('Credit account not found');
      }

      // Check for admin bypass
      if (account.unlimited_credits) {
        return await this.handleAdminBypass(
          request.userId,
          request.claudeCostUSD,
          request.sessionId,
          request.description,
          transaction,
          request.metadata
        );
      }

      // Regular credit deduction with 5x markup
      const creditAmount = request.claudeCostUSD.mul(creditConfig.markupMultiplier);
      const newBalance = account.current_balance.sub(creditAmount);

      if (newBalance.lt(0)) {
        throw new Error(
          `Insufficient credits. Current: ${account.current_balance}, Required: ${creditAmount}`
        );
      }

      // Resolve session_id to UUID if it's not already
      let sessionUuid: string | null = null;
      if (request.sessionId) {
        sessionUuid = await this.resolveSessionId(request.sessionId, transaction);
      }

      const transactionId = uuidv4();
      const [creditTransaction] = await transaction.query<CreditTransaction>(
        `
        INSERT INTO credit_transactions (
          id, user_id, account_id, transaction_type, amount, balance_after,
          claude_cost_usd, markup_multiplier, session_id, description, 
          metadata, is_admin_bypass, created_at, reconciliation_status
        ) VALUES ($1, $2, $3, 'usage', $4, $5, $6, $7, $8, $9, $10, false, NOW(), 'pending')
        RETURNING *
        `,
        [
          transactionId,
          request.userId,
          account.id,
          creditAmount.neg().toString(), // Negative for usage
          newBalance.toString(),
          request.claudeCostUSD.toString(),
          creditConfig.markupMultiplier,
          sessionUuid,
          request.description,
          request.metadata || {},
        ]
      );

      return this.transformCreditTransaction(creditTransaction);
    }, context);
  }

  /**
   * Handle admin bypass transaction (no actual credit deduction)
   */
  private async handleAdminBypass(
    userId: string,
    claudeCostUSD: Decimal,
    sessionId: string | undefined,
    description: string,
    transaction: DatabaseTransaction,
    metadata?: Record<string, any>
  ): Promise<CreditTransaction> {
    const account = await this.getCreditAccountInTransaction(userId, transaction);
    const transactionId = uuidv4();
    
    // Resolve session_id to UUID if it's not already
    let sessionUuid: string | null = null;
    if (sessionId) {
      sessionUuid = await this.resolveSessionId(sessionId, transaction);
    }
    
    const [creditTransaction] = await transaction.query<CreditTransaction>(
      `
      INSERT INTO credit_transactions (
        id, user_id, account_id, transaction_type, amount, balance_after,
        claude_cost_usd, markup_multiplier, session_id, description, 
        metadata, is_admin_bypass, created_at, reconciliation_status
      ) VALUES ($1, $2, $3, 'admin_bypass', $4, $5, $6, $7, $8, $9, $10, true, NOW(), 'reconciled')
      RETURNING *
      `,
      [
        transactionId,
        userId,
        account!.id,
        '0.0000', // No credit change for admin
        account!.current_balance.toString(), // Balance unchanged
        claudeCostUSD.toString(),
        creditConfig.markupMultiplier,
        sessionUuid,
        `[ADMIN BYPASS] ${description}`,
        {
          ...metadata,
          admin_bypass: true,
          actual_cost: claudeCostUSD.toString(),
          would_have_charged: claudeCostUSD.mul(creditConfig.markupMultiplier).toString(),
        },
      ]
    );

    return this.transformCreditTransaction(creditTransaction);
  }

  /**
   * Resolve session ID to UUID format
   */
  private async resolveSessionId(sessionId: string, transaction: DatabaseTransaction): Promise<string | null> {
    // If it's already a UUID, return as is
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      return sessionId;
    }

    // Try to find the session UUID by session_id string
    const sessions = await transaction.query<{ id: string }>(
      'SELECT id FROM agent_sessions WHERE session_id = $1 LIMIT 1',
      [sessionId]
    );

    return sessions.length > 0 ? sessions[0].id : null;
  }

  /**
   * Add credits to account (purchases, adjustments)
   */
  async addCredits(
    request: AddCreditsRequest,
    context?: UserContext
  ): Promise<CreditTransaction> {
    return await this.db.transaction(async (transaction) => {
      const account = await this.getCreditAccountInTransaction(request.userId, transaction);
      
      if (!account) {
        throw new Error('Credit account not found');
      }

      const newBalance = account.current_balance.add(request.amount);
      const transactionId = uuidv4();

      const [creditTransaction] = await transaction.query<CreditTransaction>(
        `
        INSERT INTO credit_transactions (
          id, user_id, account_id, transaction_type, amount, balance_after,
          markup_multiplier, description, metadata, is_admin_bypass, 
          created_at, reconciliation_status
        ) VALUES ($1, $2, $3, 'purchase', $4, $5, $6, $7, $8, false, NOW(), 'pending')
        RETURNING *
        `,
        [
          transactionId,
          request.userId,
          account.id,
          request.amount.toString(),
          newBalance.toString(),
          creditConfig.markupMultiplier,
          request.description,
          {
            ...request.metadata,
            payment_reference: request.paymentReference,
          },
        ]
      );

      return this.transformCreditTransaction(creditTransaction);
    }, context);
  }

  /**
   * Get credit transaction history
   */
  async getTransactionHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    context?: UserContext
  ): Promise<{
    transactions: CreditTransaction[];
    total: number;
  }> {
    const countResult = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM credit_transactions WHERE user_id = $1',
      [userId],
      context
    );
    
    const count = countResult[0]?.count || 0;

    const transactions = await this.db.query<CreditTransaction>(
      `
      SELECT * FROM credit_transactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
      context
    );

    return {
      transactions: transactions.map(this.transformCreditTransaction),
      total: parseInt(count.toString(), 10),
    };
  }

  /**
   * Get admin analytics for all credit activity
   */
  async getAdminAnalytics(
    startDate?: Date,
    endDate?: Date,
    context?: UserContext
  ): Promise<{
    totalRevenue: Decimal;
    totalClaudeCosts: Decimal;
    totalAdminBypass: Decimal;
    transactionCount: number;
    avgMarkup: Decimal;
    topUsers: Array<{
      userId: string;
      totalSpent: Decimal;
      transactionCount: number;
    }>;
  }> {
    if (!context?.isAdmin) {
      throw new Error('Admin privileges required for analytics');
    }

    const whereClause = startDate && endDate 
      ? 'WHERE created_at BETWEEN $1 AND $2'
      : '';
    const params = startDate && endDate ? [startDate, endDate] : [];

    const [analytics] = await this.db.query(
      `
      SELECT 
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(claude_cost_usd), 0) as total_claude_costs,
        COALESCE(SUM(CASE WHEN is_admin_bypass THEN claude_cost_usd ELSE 0 END), 0) as total_admin_bypass,
        COUNT(*) as transaction_count,
        COALESCE(AVG(markup_multiplier), 0) as avg_markup
      FROM credit_transactions
      ${whereClause}
      `,
      params,
      context
    );

    const topUsers = await this.db.query(
      `
      SELECT 
        user_id,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_spent,
        COUNT(*) as transaction_count
      FROM credit_transactions
      ${whereClause}
      GROUP BY user_id
      ORDER BY total_spent DESC
      LIMIT 10
      `,
      params,
      context
    );

    return {
      totalRevenue: new Decimal(analytics.total_revenue || 0),
      totalClaudeCosts: new Decimal(analytics.total_claude_costs || 0),
      totalAdminBypass: new Decimal(analytics.total_admin_bypass || 0),
      transactionCount: parseInt(analytics.transaction_count || '0'),
      avgMarkup: new Decimal(analytics.avg_markup || 0),
      topUsers: topUsers.map((user: any) => ({
        userId: user.user_id,
        totalSpent: new Decimal(user.total_spent || 0),
        transactionCount: parseInt(user.transaction_count || '0'),
      })),
    };
  }

  /**
   * Check if user is admin (for credit account setup)
   */
  private async isAdminUser(userId: string): Promise<boolean> {
    const result = await this.db.query<{ is_admin: boolean }>(
      'SELECT is_admin FROM users WHERE id = $1',
      [userId]
    );
    return result[0]?.is_admin || false;
  }

  /**
   * Get credit account within transaction
   */
  private async getCreditAccountInTransaction(
    userId: string, 
    transaction: DatabaseTransaction
  ): Promise<CreditAccount | null> {
    const accounts = await transaction.query<CreditAccount>(
      'SELECT * FROM credit_accounts WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    const account = accounts[0];
    return account ? this.transformCreditAccount(account) : null;
  }

  /**
   * Transform database record to typed object with Decimal conversion
   */
  private transformCreditAccount(account: any): CreditAccount {
    return {
      ...account,
      current_balance: new Decimal(account.current_balance),
      lifetime_purchased: new Decimal(account.lifetime_purchased),
      lifetime_spent: new Decimal(account.lifetime_spent),
      daily_limit: account.daily_limit ? new Decimal(account.daily_limit) : undefined,
      monthly_limit: account.monthly_limit ? new Decimal(account.monthly_limit) : undefined,
      auto_recharge_threshold: account.auto_recharge_threshold 
        ? new Decimal(account.auto_recharge_threshold) : undefined,
      auto_recharge_amount: account.auto_recharge_amount 
        ? new Decimal(account.auto_recharge_amount) : undefined,
    };
  }

  /**
   * Transform database record to typed object with Decimal conversion
   */
  private transformCreditTransaction(transaction: any): CreditTransaction {
    return {
      ...transaction,
      amount: new Decimal(transaction.amount),
      balance_after: new Decimal(transaction.balance_after),
      claude_cost_usd: transaction.claude_cost_usd 
        ? new Decimal(transaction.claude_cost_usd) : undefined,
      markup_multiplier: new Decimal(transaction.markup_multiplier),
    };
  }
}

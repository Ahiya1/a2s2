/**
 * keen API Gateway - Credit Management Service
 * Credit validation, reservation, and management with admin bypass
 */

import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { CreditDAO, CreditAccount, CreditTransaction } from '../../database/dao/CreditDAO.js';
import { UserDAO } from '../../database/dao/UserDAO.js';
import { DatabaseManager, UserContext } from '../../database/DatabaseManager.js';
import {
  AgentExecutionRequest,
  CreditReservation,
  InsufficientCreditsError
} from '../types.js';

export interface CreditValidationResult {
  sufficient: boolean;
  isAdminBypass: boolean;
  currentBalance: Decimal;
  requiredCredits: Decimal;
  claudeCost?: Decimal;
  markupMultiplier: number;
}

export interface CostEstimation {
  estimatedClaudeCostUSD: Decimal;
  estimatedDuration: string;
  complexity: 'low' | 'medium' | 'high' | 'very_high';
  factors: {
    visionLength: number;
    maxIterations: number;
    webSearchEnabled: boolean;
    expectedTokens: {
      input: number;
      output: number;
      thinking: number;
    };
  };
}

export class CreditGatewayService {
  private readonly MARKUP_MULTIPLIER = 5.0; // 5x markup over Claude API costs
  
  constructor(
    private creditDAO: CreditDAO,
    private userDAO: UserDAO,
    private db: DatabaseManager
  ) {}

  /**
   * Validate and reserve credits for agent execution
   */
  async validateAndReserveCredits(
    userId: string,
    agentRequest: AgentExecutionRequest,
    context?: UserContext
  ): Promise<CreditReservation> {
    try {
      // Check if user is admin (unlimited credits)
      const adminCheck = await this.isAdminUser(userId);
      
      if (adminCheck.isAdmin) {
        return {
          reservationId: `admin_bypass_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
          reservedAmount: 0,
          estimatedCost: 0,
          remainingBalance: 999999.999999,
          isAdmin: true,
          unlimited: true
        };
      }

      // 1. Estimate Claude API cost for this request
      const costEstimate = await this.estimateAgentExecutionCost(agentRequest);
      const claudeCost = costEstimate.estimatedClaudeCostUSD;
      const creditCost = claudeCost.mul(this.MARKUP_MULTIPLIER);

      // 2. Check if user has sufficient credits
      const balance = await this.getBalance(userId, context);
      
      if (balance.availableBalance.lt(creditCost)) {
        const error = new Error('Insufficient credits') as InsufficientCreditsError;
        error.name = 'InsufficientCreditsError';
        error.required = creditCost.toNumber();
        error.available = balance.availableBalance.toNumber();
        error.shortfall = creditCost.sub(balance.availableBalance).toNumber();
        error.claudeCost = claudeCost.toNumber();
        error.markupMultiplier = this.MARKUP_MULTIPLIER;
        throw error;
      }

      // 3. Reserve credits for this execution
      const reservationId = await this.reserveCredits(
        userId,
        creditCost,
        {
          description: 'Agent execution reservation',
          claudeCost: claudeCost,
          sessionId: agentRequest.workingDirectory ? this.generateSessionId() : undefined,
          metadata: {
            visionPreview: agentRequest.vision.substring(0, 100),
            estimatedDuration: costEstimate.estimatedDuration,
            complexity: costEstimate.complexity
          }
        },
        context
      );

      return {
        reservationId,
        reservedAmount: creditCost.toNumber(),
        estimatedCost: creditCost.toNumber(),
        claudeCost: claudeCost.toNumber(),
        markupMultiplier: this.MARKUP_MULTIPLIER,
        remainingBalance: balance.availableBalance.sub(creditCost).toNumber()
      };

    } catch (error) {
      if ((error as any).name === 'InsufficientCreditsError') {
        throw error;
      }
      
      console.error('Credit validation error:', error);
      throw new Error('Credit validation failed due to system error');
    }
  }

  /**
   * Finalize credit usage after agent execution
   */
  async finalizeCredits(
    userId: string,
    reservationId: string,
    actualClaudeCost: Decimal,
    sessionId: string,
    context?: UserContext
  ): Promise<CreditTransaction> {
    try {
      // Check for admin bypass
      const adminCheck = await this.isAdminUser(userId);
      
      if (adminCheck.isAdmin || reservationId.startsWith('admin_bypass_')) {
        return await this.handleAdminBypassFinalization(
          userId,
          actualClaudeCost,
          sessionId,
          'Admin execution completed',
          context
        );
      }

      const actualCreditCost = actualClaudeCost.mul(this.MARKUP_MULTIPLIER);
      
      // Finalize the reservation with actual costs
      return await this.creditDAO.deductCredits({
        userId,
        claudeCostUSD: actualClaudeCost,
        sessionId,
        description: 'Agent execution completed',
        metadata: {
          reservationId,
          actualClaudeCost: actualClaudeCost.toString(),
          actualCreditCost: actualCreditCost.toString(),
          markupMultiplier: this.MARKUP_MULTIPLIER
        }
      }, context);
      
    } catch (error) {
      console.error('Credit finalization error:', error);
      throw new Error('Credit finalization failed');
    }
  }

  /**
   * Get user credit balance with reserved amounts
   */
  async getBalance(
    userId: string,
    context?: UserContext
  ): Promise<{
    currentBalance: Decimal;
    reservedBalance: Decimal;
    availableBalance: Decimal;
    lifetimePurchased: Decimal;
    lifetimeSpent: Decimal;
    dailyLimit?: Decimal;
    dailyUsed: Decimal;
    autoRechargeEnabled: boolean;
    unlimitedCredits: boolean;
  }> {
    const account = await this.creditDAO.getCreditAccount(userId, context);
    
    if (!account) {
      throw new Error('Credit account not found');
    }

    // Calculate reserved balance (active reservations)
    const reservedBalance = await this.calculateReservedBalance(userId, context);
    
    // Calculate daily usage
    const dailyUsed = await this.calculateDailyUsage(userId, context);

    return {
      currentBalance: account.current_balance,
      reservedBalance,
      availableBalance: account.current_balance.sub(reservedBalance),
      lifetimePurchased: account.lifetime_purchased,
      lifetimeSpent: account.lifetime_spent,
      dailyLimit: account.daily_limit,
      dailyUsed,
      autoRechargeEnabled: account.auto_recharge_enabled,
      unlimitedCredits: account.unlimited_credits
    };
  }

  /**
   * Add credits to user account (purchase)
   */
  async addCredits(
    userId: string,
    amount: Decimal,
    description: string,
    paymentReference?: string,
    context?: UserContext
  ): Promise<CreditTransaction> {
    return await this.creditDAO.addCredits({
      userId,
      amount,
      description,
      paymentReference,
      metadata: {
        paymentReference,
        addedAt: new Date().toISOString(),
        source: 'api_gateway'
      }
    }, context);
  }

  /**
   * Get credit transaction history
   */
  async getTransactionHistory(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      type?: 'purchase' | 'usage' | 'refund' | 'adjustment' | 'admin_bypass';
      startDate?: Date;
      endDate?: Date;
    } = {},
    context?: UserContext
  ): Promise<{
    transactions: CreditTransaction[];
    total: number;
    summary: {
      totalSpent: Decimal;
      totalPurchased: Decimal;
      adminBypasses: number;
      avgTransactionAmount: Decimal;
    };
  }> {
    const { limit = 50, offset = 0 } = options;
    
    // Get paginated transaction history
    const result = await this.creditDAO.getTransactionHistory(userId, limit, offset, context);
    
    // Calculate summary statistics
    const allTransactions = result.transactions;
    
    const totalSpent = allTransactions
      .filter(t => t.amount.lt(0))
      .reduce((sum, t) => sum.add(t.amount.abs()), new Decimal(0));
    
    const totalPurchased = allTransactions
      .filter(t => t.amount.gt(0))
      .reduce((sum, t) => sum.add(t.amount), new Decimal(0));
    
    const adminBypasses = allTransactions
      .filter(t => t.is_admin_bypass)
      .length;
    
    const avgTransactionAmount = allTransactions.length > 0
      ? allTransactions.reduce((sum, t) => sum.add(t.amount.abs()), new Decimal(0)).div(allTransactions.length)
      : new Decimal(0);

    return {
      transactions: result.transactions,
      total: result.total,
      summary: {
        totalSpent,
        totalPurchased,
        adminBypasses,
        avgTransactionAmount
      }
    };
  }

  /**
   * Estimate agent execution cost based on request parameters
   */
  private async estimateAgentExecutionCost(
    request: AgentExecutionRequest
  ): Promise<CostEstimation> {
    // Analyze vision complexity
    const complexity = this.analyzeVisionComplexity(request.vision);
    const maxIterations = request.options.maxIterations || 50;
    const webSearchEnabled = request.options.enableWebSearch !== false;
    
    // Base estimation factors
    let baseInputTokens = 50000; // Base context
    let baseOutputTokens = 10000; // Base output
    let thinkingTokens = 5000; // Base thinking
    
    // Adjust based on complexity
    switch (complexity) {
      case 'very_high':
        baseInputTokens *= 4;
        baseOutputTokens *= 3;
        thinkingTokens *= 4;
        break;
      case 'high':
        baseInputTokens *= 2.5;
        baseOutputTokens *= 2;
        thinkingTokens *= 3;
        break;
      case 'medium':
        baseInputTokens *= 1.5;
        baseOutputTokens *= 1.5;
        thinkingTokens *= 2;
        break;
      // 'low' uses base values
    }
    
    // Adjust for iterations
    const iterationMultiplier = Math.min(maxIterations / 20, 3); // Cap at 3x
    baseInputTokens *= iterationMultiplier;
    baseOutputTokens *= iterationMultiplier;
    
    // Adjust for web search
    if (webSearchEnabled) {
      baseInputTokens += 20000; // Additional context from search results
      baseOutputTokens += 5000; // Additional processing
    }
    
    const totalInputTokens = Math.floor(baseInputTokens);
    const totalOutputTokens = Math.floor(baseOutputTokens);
    const totalThinkingTokens = Math.floor(thinkingTokens);
    
    // Calculate costs using Claude pricing
    const claudeCost = this.calculateClaudeCost(
      totalInputTokens,
      totalOutputTokens,
      totalThinkingTokens
    );
    
    // Estimate duration
    const estimatedMinutes = Math.max(5, Math.floor(maxIterations * 0.5 + (complexity === 'very_high' ? 10 : 5)));
    const estimatedDuration = estimatedMinutes < 60 
      ? `${estimatedMinutes} minutes`
      : `${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60}m`;
    
    return {
      estimatedClaudeCostUSD: claudeCost,
      estimatedDuration,
      complexity,
      factors: {
        visionLength: request.vision.length,
        maxIterations,
        webSearchEnabled,
        expectedTokens: {
          input: totalInputTokens,
          output: totalOutputTokens,
          thinking: totalThinkingTokens
        }
      }
    };
  }

  /**
   * Analyze vision complexity for cost estimation
   */
  private analyzeVisionComplexity(vision: string): 'low' | 'medium' | 'high' | 'very_high' {
    const length = vision.length;
    const complexityIndicators = [
      /\b(database|sql|postgresql|mysql)\b/gi,
      /\b(authentication|auth|oauth|jwt)\b/gi,
      /\b(api|rest|graphql|websocket)\b/gi,
      /\b(react|vue|angular|typescript)\b/gi,
      /\b(microservices?|distributed|scalable?)\b/gi,
      /\b(testing|test|jest|cypress)\b/gi,
      /\b(deployment|docker|kubernetes|aws)\b/gi,
      /\b(performance|optimization|caching)\b/gi
    ];
    
    const matches = complexityIndicators.reduce((count, regex) => {
      return count + (vision.match(regex) || []).length;
    }, 0);
    
    if (length > 1000 || matches >= 8) return 'very_high';
    if (length > 500 || matches >= 5) return 'high';
    if (length > 200 || matches >= 3) return 'medium';
    return 'low';
  }

  /**
   * Calculate Claude API cost with extended context pricing
   */
  private calculateClaudeCost(
    inputTokens: number,
    outputTokens: number,
    thinkingTokens: number = 0
  ): Decimal {
    const isExtendedContext = inputTokens > 200000;
    
    let inputCostPer1K: Decimal;
    let outputCostPer1K: Decimal;
    
    if (isExtendedContext) {
      // Extended context pricing (>200K tokens)
      inputCostPer1K = new Decimal(0.006); // $0.006 per 1K input tokens
      outputCostPer1K = new Decimal(0.0225); // $0.0225 per 1K output tokens
    } else {
      // Standard context pricing (≤200K tokens)
      inputCostPer1K = new Decimal(0.003); // $0.003 per 1K input tokens
      outputCostPer1K = new Decimal(0.015); // $0.015 per 1K output tokens
    }
    
    const inputCost = new Decimal(inputTokens).div(1000).mul(inputCostPer1K);
    const outputCost = new Decimal(outputTokens).div(1000).mul(outputCostPer1K);
    const thinkingCost = new Decimal(thinkingTokens).div(1000).mul(inputCostPer1K); // Thinking tokens priced as input
    
    return inputCost.add(outputCost).add(thinkingCost);
  }

  /**
   * Check if user is admin
   */
  private async isAdminUser(userId: string): Promise<{ isAdmin: boolean; privileges?: any }> {
    try {
      const result = await this.db.query(
        'SELECT is_admin, admin_privileges FROM users WHERE id = $1',
        [userId]
      );
      
      const user = result[0];
      return {
        isAdmin: user?.is_admin || false,
        privileges: user?.admin_privileges || {}
      };
    } catch (error) {
      console.error('Error checking admin status:', error);
      return { isAdmin: false };
    }
  }

  /**
   * Reserve credits (placeholder implementation)
   */
  private async reserveCredits(
    userId: string,
    amount: Decimal,
    details: {
      description: string;
      claudeCost: Decimal;
      sessionId?: string;
      metadata?: Record<string, any>;
    },
    context?: UserContext
  ): Promise<string> {
    // TODO: Implement actual reservation system
    // For now, return a reservation ID
    const reservationId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    // Store reservation in database (TODO: create reservations table)
    console.log(`Reserved ${amount} credits for user ${userId}, reservation: ${reservationId}`);
    
    return reservationId;
  }

  /**
   * Calculate reserved balance from active reservations
   */
  private async calculateReservedBalance(
    userId: string,
    context?: UserContext
  ): Promise<Decimal> {
    // TODO: Query active reservations from database
    // For now, return 0
    return new Decimal(0);
  }

  /**
   * Calculate daily usage
   */
  private async calculateDailyUsage(
    userId: string,
    context?: UserContext
  ): Promise<Decimal> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    try {
      const result = await this.db.query(
        `
        SELECT COALESCE(SUM(ABS(amount)), 0) as daily_spent
        FROM credit_transactions 
        WHERE user_id = $1 AND amount < 0 AND created_at >= $2 AND created_at < $3
        `,
        [userId, today, tomorrow],
        context
      );
      
      return new Decimal(result[0]?.daily_spent || 0);
    } catch (error) {
      console.error('Error calculating daily usage:', error);
      return new Decimal(0);
    }
  }

  /**
   * Handle admin bypass finalization
   */
  private async handleAdminBypassFinalization(
    userId: string,
    claudeCost: Decimal,
    sessionId: string,
    description: string,
    context?: UserContext
  ): Promise<CreditTransaction> {
    return await this.creditDAO.deductCredits({
      userId,
      claudeCostUSD: claudeCost,
      sessionId,
      description: `[ADMIN BYPASS] ${description}`,
      metadata: {
        admin_bypass: true,
        actual_cost: claudeCost.toString(),
        would_have_charged: claudeCost.mul(this.MARKUP_MULTIPLIER).toString(),
        markup_multiplier: this.MARKUP_MULTIPLIER
      }
    }, context);
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get admin analytics for credit system
   */
  async getAdminAnalytics(
    adminUserId: string,
    timeRange: 'day' | 'week' | 'month' = 'day',
    context?: UserContext
  ): Promise<{
    revenue: {
      totalRevenue: Decimal;
      totalClaudeCosts: Decimal;
      markupRevenue: Decimal;
      adminBypasses: Decimal;
    };
    usage: {
      totalTransactions: number;
      activeUsers: number;
      avgTransactionSize: Decimal;
      adminTransactions: number;
    };
    system: {
      markupMultiplier: number;
      noPackages: boolean;
      creditSystemStatus: 'operational' | 'degraded' | 'offline';
    };
  }> {
    // Verify admin access
    const adminCheck = await this.isAdminUser(adminUserId);
    if (!adminCheck.isAdmin) {
      throw new Error('Admin privileges required for analytics access');
    }

    // Get the basic analytics from DAO and transform to expected structure
    try {
      const basicAnalytics = await this.creditDAO.getAdminAnalytics(undefined, undefined, context);
      
      // Transform to expected structure
      return {
        revenue: {
          totalRevenue: basicAnalytics.totalRevenue || new Decimal(0),
          totalClaudeCosts: basicAnalytics.totalClaudeCosts || new Decimal(0),
          markupRevenue: (basicAnalytics.totalRevenue || new Decimal(0)).sub(basicAnalytics.totalClaudeCosts || new Decimal(0)),
          adminBypasses: basicAnalytics.totalAdminBypass || new Decimal(0)
        },
        usage: {
          totalTransactions: basicAnalytics.transactionCount || 0,
          activeUsers: basicAnalytics.topUsers ? basicAnalytics.topUsers.length : 0,
          avgTransactionSize: basicAnalytics.avgMarkup || new Decimal(0),
          adminTransactions: 0 // TODO: calculate admin transactions
        },
        system: {
          markupMultiplier: this.MARKUP_MULTIPLIER,
          noPackages: true,
          creditSystemStatus: 'operational'
        }
      };
    } catch (error) {
      console.error('Error getting analytics:', error);
      // Return default structure if there's an error
      return {
        revenue: {
          totalRevenue: new Decimal(0),
          totalClaudeCosts: new Decimal(0),
          markupRevenue: new Decimal(0),
          adminBypasses: new Decimal(0)
        },
        usage: {
          totalTransactions: 0,
          activeUsers: 0,
          avgTransactionSize: new Decimal(0),
          adminTransactions: 0
        },
        system: {
          markupMultiplier: this.MARKUP_MULTIPLIER,
          noPackages: true,
          creditSystemStatus: 'operational'
        }
      };
    }
  }
}

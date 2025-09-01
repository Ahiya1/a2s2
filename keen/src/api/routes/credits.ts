/**
 * keen API Gateway - Credit Management Routes
 * Credit balance, transactions, and purchase management
 */

import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import Decimal from 'decimal.js';
import { asyncHandler, createValidationError } from '../middleware/errorHandler.js';
import { requireScopes } from '../middleware/authentication.js';
import { AuthenticatedRequest } from '../types.js';
import { CreditGatewayService } from '../services/CreditGatewayService.js';
import { AuditLogger } from '../services/AuditLogger.js';
import { AuthenticationService } from '../services/AuthenticationService.js';
import { keen } from '../../index.js';

/**
 * Create credits router with service dependencies
 */
export function createCreditsRouter(
  authService: AuthenticationService,
  auditLogger: AuditLogger,
  authMiddleware: any
) {
  const router = Router();
  const keenDB = keen.getInstance();
  const creditGateway = new CreditGatewayService(
    keenDB.credits,
    keenDB.users,
    keenDB.getDatabaseManager()
  );

  // Apply authentication to all credit routes
  router.use(authMiddleware);

  /**
   * Get credit balance
   */
  router.get('/balance',
    requireScopes(['credits:read']),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      
      const balance = await creditGateway.getBalance(
        user.id,
        {
          userId: user.id,
          isAdmin: user.is_admin,
          adminPrivileges: user.admin_privileges
        }
      );
      
      res.status(200).json({
        success: true,
        balance: {
          current_balance: balance.currentBalance.toNumber(),
          reserved_balance: balance.reservedBalance.toNumber(),
          available_balance: balance.availableBalance.toNumber(),
          lifetime_purchased: balance.lifetimePurchased.toNumber(),
          lifetime_spent: balance.lifetimeSpent.toNumber(),
          daily_limit: balance.dailyLimit?.toNumber() || null,
          daily_used: balance.dailyUsed.toNumber(),
          auto_recharge_enabled: balance.autoRechargeEnabled,
          unlimited_credits: balance.unlimitedCredits
        },
        credit_system: {
          markup_multiplier: 5.0,
          no_packages: true,
          individual_tier: !user.is_admin,
          admin_unlimited: user.is_admin && balance.unlimitedCredits,
          claude_api_pricing: {
            standard_context: {
              input_per_1k_tokens: 0.003,
              output_per_1k_tokens: 0.015,
              keen_markup: '5x'
            },
            extended_context: {
              input_per_1k_tokens: 0.006,
              output_per_1k_tokens: 0.0225,
              keen_markup: '5x',
              threshold_tokens: 200000
            }
          }
        },
        user_info: {
          is_admin: user.is_admin,
          credit_bypass: user.is_admin && balance.unlimitedCredits,
          user_tier: user.is_admin ? 'admin' : 'individual'
        }
      });
    })
  );

  /**
   * Purchase credits
   */
  router.post('/purchase',
    requireScopes(['credits:read']), // Users need to be authenticated but no special scopes for purchases
    [
      body('amount').isFloat({ min: 10, max: 10000 }),
      body('payment_method_id').isLength({ min: 1 }),
      body('description').optional().isLength({ max: 500 }).trim()
    ],
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw createValidationError('Invalid purchase request', {
          validation_errors: errors.array()
        });
      }

      const user = req.user!;
      const { amount, payment_method_id, description } = req.body;
      
      // TODO: Integrate with payment processor (Stripe)
      // For now, simulate successful payment
      const paymentReference = `payment_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      
      try {
        // Add credits to account
        const transaction = await creditGateway.addCredits(
          user.id,
          new Decimal(amount),
          description || `Credit purchase - $${amount}`,
          paymentReference,
          {
            userId: user.id,
            isAdmin: user.is_admin,
            adminPrivileges: user.admin_privileges
          }
        );
        
        // Get updated balance
        const updatedBalance = await creditGateway.getBalance(
          user.id,
          {
            userId: user.id,
            isAdmin: user.is_admin,
            adminPrivileges: user.admin_privileges
          }
        );
        
        // Log purchase
        await auditLogger.logAdminAction({
          adminUserId: user.id,
          action: 'purchase_credits',
          details: {
            amount,
            payment_method_id,
            payment_reference: paymentReference,
            transaction_id: transaction.id
          }
        });
        
        res.status(200).json({
          success: true,
          message: 'Credits purchased successfully',
          transaction: {
            id: transaction.id,
            amount: transaction.amount.toNumber(),
            balance_after: transaction.balance_after.toNumber(),
            payment_reference: paymentReference,
            created_at: transaction.created_at
          },
          balance: {
            current_balance: updatedBalance.currentBalance.toNumber(),
            available_balance: updatedBalance.availableBalance.toNumber(),
            lifetime_purchased: updatedBalance.lifetimePurchased.toNumber()
          },
          purchase_info: {
            credit_value: `$${amount} = ${amount} keen credits`,
            markup_info: '5x markup over Claude API costs',
            usage_estimate: {
              standard_requests: Math.floor(amount / 0.50),
              complex_requests: Math.floor(amount / 5.0),
              note: 'Estimates based on typical usage patterns'
            }
          }
        });
        
      } catch (error) {
        // Log failed purchase
        const errorMessage = error instanceof Error ? error.message : String(error);
        await auditLogger.logError({
          requestId: req.id,
          userId: user.id,
          error: `Credit purchase failed: ${errorMessage}`,
          isAdmin: user.is_admin
        });
        
        throw error;
      }
    })
  );

  /**
   * Get transaction history
   */
  router.get('/transactions',
    requireScopes(['credits:read']),
    [
      query('type').optional().isIn(['purchase', 'usage', 'refund', 'adjustment', 'admin_bypass']),
      query('limit').optional().isInt({ min: 1, max: 200 }),
      query('offset').optional().isInt({ min: 0 }),
      query('start_date').optional().isISO8601(),
      query('end_date').optional().isISO8601()
    ],
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw createValidationError('Invalid transaction query parameters', {
          validation_errors: errors.array()
        });
      }

      const user = req.user!;
      const {
        type,
        limit = 50,
        offset = 0,
        start_date,
        end_date
      } = req.query;
      
      const options = {
        limit: Number(limit),
        offset: Number(offset),
        type: type as any,
        startDate: start_date ? new Date(start_date as string) : undefined,
        endDate: end_date ? new Date(end_date as string) : undefined
      };
      
      const result = await creditGateway.getTransactionHistory(
        user.id,
        options,
        {
          userId: user.id,
          isAdmin: user.is_admin,
          adminPrivileges: user.admin_privileges
        }
      );
      
      res.status(200).json({
        success: true,
        transactions: result.transactions.map(t => ({
          id: t.id,
          type: t.transaction_type,
          amount: t.amount.toNumber(),
          balance_after: t.balance_after.toNumber(),
          claude_cost_usd: t.claude_cost_usd?.toNumber() || null,
          markup_multiplier: t.markup_multiplier.toNumber(),
          session_id: t.session_id,
          description: t.description,
          metadata: t.metadata,
          is_admin_bypass: t.is_admin_bypass,
          created_at: t.created_at,
          reconciliation_status: t.reconciliation_status
        })),
        pagination: {
          total: result.total,
          limit: Number(limit),
          offset: Number(offset),
          has_more: Number(offset) + Number(limit) < result.total
        },
        summary: {
          total_spent: result.summary.totalSpent.toNumber(),
          total_purchased: result.summary.totalPurchased.toNumber(),
          admin_bypasses: result.summary.adminBypasses,
          avg_transaction_amount: result.summary.avgTransactionAmount.toNumber()
        },
        filters: {
          type: type || 'all',
          start_date,
          end_date
        }
      });
    })
  );

  /**
   * Get credit usage analytics (for user's own usage)
   */
  router.get('/analytics',
    requireScopes(['credits:read']),
    [
      query('period').optional().isIn(['day', 'week', 'month', 'year']),
      query('group_by').optional().isIn(['day', 'week', 'month'])
    ],
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      const { period = 'month', group_by = 'day' } = req.query;
      
      // TODO: Implement detailed user analytics
      // For now, return summary data
      const balance = await creditGateway.getBalance(
        user.id,
        {
          userId: user.id,
          isAdmin: user.is_admin,
          adminPrivileges: user.admin_privileges
        }
      );
      
      const transactions = await creditGateway.getTransactionHistory(
        user.id,
        { limit: 100 },
        {
          userId: user.id,
          isAdmin: user.is_admin,
          adminPrivileges: user.admin_privileges
        }
      );
      
      // Calculate analytics
      const usageTransactions = transactions.transactions.filter(t => t.amount.lt(0));
      const purchaseTransactions = transactions.transactions.filter(t => t.amount.gt(0));
      
      const totalSpent = usageTransactions.reduce((sum, t) => sum.add(t.amount.abs()), new Decimal(0));
      const avgSessionCost = usageTransactions.length > 0 
        ? totalSpent.div(usageTransactions.length) 
        : new Decimal(0);
      
      const claudeCosts = usageTransactions
        .filter(t => t.claude_cost_usd)
        .reduce((sum, t) => sum.add(t.claude_cost_usd!), new Decimal(0));
      
      res.status(200).json({
        success: true,
        period,
        group_by,
        analytics: {
          usage: {
            total_spent: totalSpent.toNumber(),
            total_sessions: usageTransactions.filter(t => t.session_id).length,
            avg_session_cost: avgSessionCost.toNumber(),
            total_claude_costs: claudeCosts.toNumber(),
            markup_revenue: totalSpent.sub(claudeCosts).toNumber()
          },
          purchases: {
            total_purchased: balance.lifetimePurchased.toNumber(),
            purchase_count: purchaseTransactions.length,
            avg_purchase_amount: purchaseTransactions.length > 0
              ? balance.lifetimePurchased.div(purchaseTransactions.length).toNumber()
              : 0
          },
          efficiency: {
            cost_per_session: avgSessionCost.toNumber(),
            claude_vs_keen_ratio: claudeCosts.gt(0) ? totalSpent.div(claudeCosts).toNumber() : 5.0,
            usage_pattern: usageTransactions.length > 10 ? 'active' : 'light'
          },
          admin_info: user.is_admin ? {
            unlimited_credits: balance.unlimitedCredits,
            bypass_count: transactions.summary.adminBypasses,
            total_theoretical_cost: usageTransactions
              .filter(t => t.is_admin_bypass)
              .reduce((sum, t) => sum.add(t.claude_cost_usd?.mul(5) || new Decimal(0)), new Decimal(0))
              .toNumber()
          } : undefined
        },
        credit_system: {
          markup_multiplier: 5.0,
          individual_tier: !user.is_admin,
          admin_unlimited: user.is_admin && balance.unlimitedCredits
        }
      });
    })
  );

  /**
   * Estimate costs for a potential agent execution
   */
  router.post('/estimate',
    requireScopes(['credits:read']),
    [
      body('vision').isLength({ min: 10, max: 10000 }).trim(),
      body('max_iterations').optional().isInt({ min: 1, max: 200 }),
      body('enable_web_search').optional().isBoolean(),
      body('complexity').optional().isIn(['low', 'medium', 'high', 'very_high'])
    ],
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw createValidationError('Invalid cost estimation request', {
          validation_errors: errors.array()
        });
      }

      const user = req.user!;
      const { vision, max_iterations = 50, enable_web_search = true, complexity } = req.body;
      
      // Create mock agent request for estimation
      const mockRequest = {
        vision,
        options: {
          maxIterations: max_iterations,
          enableWebSearch: enable_web_search
        }
      };
      
      try {
        // Get cost estimation (without actually reserving credits)
        const balance = await creditGateway.getBalance(
          user.id,
          {
            userId: user.id,
            isAdmin: user.is_admin,
            adminPrivileges: user.admin_privileges
          }
        );
        
        // TODO: Use actual cost estimation logic
        const estimatedClaudeCost = vision.length * 0.0001 + max_iterations * 0.01; // Mock calculation
        const estimatedCreditCost = estimatedClaudeCost * 5.0;
        const canAfford = balance.availableBalance.gte(estimatedCreditCost) || balance.unlimitedCredits;
        
        res.status(200).json({
          success: true,
          estimation: {
            vision_analysis: {
              length: vision.length,
              estimated_complexity: complexity || 'medium',
              max_iterations,
              web_search_enabled: enable_web_search
            },
            cost_breakdown: {
              claude_api_cost: estimatedClaudeCost,
              keen_credit_cost: estimatedCreditCost,
              markup_multiplier: 5.0,
              breakdown: {
                input_tokens_est: Math.floor(vision.length * 1.2),
                output_tokens_est: Math.floor(max_iterations * 500),
                thinking_tokens_est: Math.floor(max_iterations * 200),
                extended_context: vision.length > 1000
              }
            },
            affordability: {
              can_afford: canAfford,
              current_balance: balance.currentBalance.toNumber(),
              available_balance: balance.availableBalance.toNumber(),
              shortfall: canAfford ? 0 : estimatedCreditCost - balance.availableBalance.toNumber(),
              admin_unlimited: user.is_admin && balance.unlimitedCredits
            },
            estimated_duration: `${Math.max(5, max_iterations * 0.5)} minutes`,
            confidence: 'medium'
          },
          user_context: {
            is_admin: user.is_admin,
            credit_bypass: user.is_admin && balance.unlimitedCredits,
            tier: user.is_admin ? 'admin' : 'individual'
          }
        });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await auditLogger.logError({
          requestId: req.id,
          userId: user.id,
          error: `Cost estimation failed: ${errorMessage}`,
          isAdmin: user.is_admin
        });
        
        throw error;
      }
    })
  );

  return router;
}

// Export for backwards compatibility  
export { createCreditsRouter as creditsRouter };
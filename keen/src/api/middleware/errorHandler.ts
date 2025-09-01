/**
 * keen API Gateway - Error Handling Middleware
 * Centralized error handling with proper logging and user-friendly responses
 */

import { Request, Response, NextFunction } from 'express';
import { 
  AuthenticationError,
  ValidationError,
  RateLimitError,
  ConcurrencyError,
  MFARequiredError
} from '../types.js';

/**
 * Global error handler middleware
 */
export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.id || 'unknown';
  
  // Don't log headers in production for security
  const logError = {
    requestId,
    error: {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    },
    request: {
      method: req.method,
      path: req.path,
      user: (req as any).user?.id || 'anonymous',
      isAdmin: (req as any).user?.isAdmin || false
    }
  };
  
  console.error('🚨 API Error:', JSON.stringify(logError, null, 2));
  
  // Handle specific error types
  if (error instanceof AuthenticationError) {
    res.status(401).json({
      success: false,
      error: {
        type: 'AUTHENTICATION_ERROR',
        code: 'INVALID_CREDENTIALS',
        message: error.message,
        help_url: 'https://docs.keen.dev/errors/authentication'
      },
      request_id: requestId
    });
    return;
  }
  
  if (error instanceof MFARequiredError) {
    res.status(401).json({
      success: false,
      error: {
        type: 'MFA_REQUIRED',
        code: 'TWO_FACTOR_REQUIRED',
        message: error.message,
        help_url: 'https://docs.keen.dev/auth/mfa'
      },
      request_id: requestId
    });
    return;
  }
  
  if (error instanceof ValidationError) {
    res.status(400).json({
      success: false,
      error: {
        type: 'VALIDATION_ERROR',
        code: 'INVALID_REQUEST',
        message: error.message,
        details: error.details,
        help_url: 'https://docs.keen.dev/api/validation'
      },
      request_id: requestId
    });
    return;
  }
  
  if (error instanceof RateLimitError) {
    res.status(429).json({
      success: false,
      error: {
        type: 'RATE_LIMIT_ERROR',
        code: 'TOO_MANY_REQUESTS',
        message: error.message,
        details: {
          limit: error.rateLimitInfo.limit,
          remaining: error.rateLimitInfo.remaining,
          reset_time: error.rateLimitInfo.resetTime
        },
        help_url: 'https://docs.keen.dev/api/rate-limits'
      },
      request_id: requestId
    });
    return;
  }
  
  if (error instanceof ConcurrencyError) {
    res.status(409).json({
      success: false,
      error: {
        type: 'CONCURRENCY_ERROR',
        code: 'TOO_MANY_CONCURRENT_SESSIONS',
        message: error.message,
        details: {
          current: error.concurrencyInfo.current,
          limit: error.concurrencyInfo.limit
        },
        help_url: 'https://docs.keen.dev/api/concurrency'
      },
      request_id: requestId
    });
    return;
  }
  
  // Handle insufficient credits error
  if (error.name === 'InsufficientCreditsError') {
    res.status(402).json({
      success: false,
      error: {
        type: 'INSUFFICIENT_CREDITS',
        code: 'PAYMENT_REQUIRED',
        message: 'Insufficient credits for this operation',
        details: {
          required: error.required,
          available: error.available,
          shortfall: error.shortfall,
          claude_cost: error.claudeCost,
          markup_multiplier: error.markupMultiplier,
          credit_info: {
            pricing: '5x markup over Claude API costs',
            no_packages: true,
            purchase_url: 'https://app.keen.dev/credits/purchase'
          }
        },
        help_url: 'https://docs.keen.dev/credits/insufficient'
      },
      request_id: requestId
    });
    return;
  }
  
  // Handle database connection errors
  if (error.code === 'ECONNREFUSED' || error.code === '3D000') {
    res.status(503).json({
      success: false,
      error: {
        type: 'SERVICE_UNAVAILABLE',
        code: 'DATABASE_CONNECTION_ERROR',
        message: 'Database service temporarily unavailable',
        help_url: 'https://status.keen.dev'
      },
      request_id: requestId
    });
    return;
  }
  
  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: {
        type: 'AUTHENTICATION_ERROR',
        code: 'INVALID_TOKEN',
        message: 'Authentication token is invalid',
        help_url: 'https://docs.keen.dev/auth/tokens'
      },
      request_id: requestId
    });
    return;
  }
  
  if (error.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: {
        type: 'AUTHENTICATION_ERROR',
        code: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired',
        details: {
          expired_at: error.expiredAt
        },
        help_url: 'https://docs.keen.dev/auth/refresh'
      },
      request_id: requestId
    });
    return;
  }
  
  // Handle Anthropic API errors
  if (error.name === 'AnthropicError' || error.message?.includes('anthropic')) {
    res.status(503).json({
      success: false,
      error: {
        type: 'EXTERNAL_SERVICE_ERROR',
        code: 'ANTHROPIC_API_ERROR',
        message: 'AI service temporarily unavailable',
        help_url: 'https://docs.keen.dev/troubleshooting/ai-service'
      },
      request_id: requestId
    });
    return;
  }
  
  // Default server error
  const statusCode = error.statusCode || error.status || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(statusCode).json({
    success: false,
    error: {
      type: 'INTERNAL_SERVER_ERROR',
      code: 'SYSTEM_ERROR',
      message: isDevelopment ? error.message : 'An unexpected error occurred',
      stack: isDevelopment ? error.stack : undefined,
      help_url: 'https://docs.keen.dev/support'
    },
    request_id: requestId
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = req.id || 'unknown';
  
  res.status(404).json({
    success: false,
    error: {
      type: 'NOT_FOUND',
      code: 'ENDPOINT_NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
      available_endpoints: {
        api_info: 'GET /api',
        health: 'GET /health',
        authentication: 'POST /api/v1/auth/login',
        agents: 'POST /api/v1/agents/execute',
        credits: 'GET /api/v1/credits/balance',
        admin: 'GET /api/v1/admin/analytics',
        websocket: 'ws://localhost:3000/ws'
      },
      help_url: 'https://docs.keen.dev/api'
    },
    request_id: requestId
  });
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation error helper
 */
export function createValidationError(message: string, details?: Record<string, any>): ValidationError {
  return new ValidationError(message, details);
}

/**
 * Authentication error helper
 */
export function createAuthError(message: string): AuthenticationError {
  return new AuthenticationError(message);
}

/**
 * Rate limit error helper
 */
export function createRateLimitError(message: string, rateLimitInfo: any): RateLimitError {
  return new RateLimitError(message, rateLimitInfo);
}

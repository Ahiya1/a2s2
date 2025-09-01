/**
 * keen API Gateway - Rate Limiting Middleware
 * Per-user rate limiting with admin bypass and Redis-based storage
 */

import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types.js';

/**
 * Check if user should bypass rate limits (admin users)
 */
function shouldBypassRateLimit(req: Request): boolean {
  const user = (req as AuthenticatedRequest).user;
  return Boolean(user?.is_admin && user.admin_privileges?.bypass_rate_limits);
}

/**
 * Generate rate limit key for user-specific limiting
 */
function generateRateLimitKey(req: Request): string {
  const user = (req as AuthenticatedRequest).user;
  
  if (user) {
    return `user:${user.id}`;
  }
  
  // Fall back to IP-based limiting for unauthenticated requests
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
             (req.headers['x-real-ip'] as string) ||
             req.connection.remoteAddress ||
             req.socket.remoteAddress ||
             'unknown';
             
  return `ip:${ip}`;
}

/**
 * Main rate limiting middleware
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Individual tier limit
  
  keyGenerator: generateRateLimitKey,
  
  skip: (req: Request) => {
    // Skip rate limiting for admin users
    return shouldBypassRateLimit(req);
  },
  
  message: {
    success: false,
    error: {
      type: 'RATE_LIMIT_ERROR',
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this user/IP',
      details: {
        limit: 1000,
        window_ms: 3600000,
        user_tier: 'individual',
        admin_bypass_available: false,
        retry_after: '1 hour'
      },
      help_url: 'https://docs.keen.dev/api/rate-limits'
    }
  },
  
  headers: true, // Include rate limit headers in response
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Slow down middleware for additional protection
 */
export const slowDownMiddleware = slowDown({
  windowMs: 60 * 1000, // 1 minute
  delayAfter: 100, // Allow 100 requests per minute without delay
  delayMs: 500, // Add 500ms delay per request after the limit
  
  keyGenerator: generateRateLimitKey,
  
  skip: shouldBypassRateLimit
});

/**
 * Strict rate limiting for agent execution endpoints
 */
export const agentExecutionRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 agent executions per hour for regular users
  
  keyGenerator: generateRateLimitKey,
  
  skip: shouldBypassRateLimit,
  
  message: {
    success: false,
    error: {
      type: 'RATE_LIMIT_ERROR',
      code: 'AGENT_EXECUTION_LIMIT_EXCEEDED',
      message: 'Too many agent executions in the current time window',
      details: {
        limit: 10,
        window_ms: 3600000,
        endpoint: 'agent_execution',
        user_tier: 'individual',
        admin_bypass_available: false
      },
      help_url: 'https://docs.keen.dev/api/rate-limits#agent-execution'
    }
  }
});

/**
 * Auth endpoint rate limiting (stricter for login attempts)
 */
export const authRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 auth attempts per 15 minutes
  
  keyGenerator: (req: Request) => {
    // Use IP for auth endpoints since user might not be authenticated yet
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
               (req.headers['x-real-ip'] as string) ||
               req.connection.remoteAddress ||
               req.socket.remoteAddress ||
               'unknown';
    return `auth:${ip}`;
  },
  
  message: {
    success: false,
    error: {
      type: 'RATE_LIMIT_ERROR',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts',
      details: {
        limit: 20,
        window_ms: 900000,
        endpoint: 'authentication',
        retry_after: '15 minutes'
      },
      help_url: 'https://docs.keen.dev/auth/rate-limits'
    }
  }
});

/**
 * API key creation rate limiting
 */
export const apiKeyRateLimitMiddleware = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 API key operations per hour
  
  keyGenerator: generateRateLimitKey,
  
  skip: shouldBypassRateLimit,
  
  message: {
    success: false,
    error: {
      type: 'RATE_LIMIT_ERROR',
      code: 'API_KEY_RATE_LIMIT_EXCEEDED',
      message: 'Too many API key operations',
      details: {
        limit: 10,
        window_ms: 3600000,
        endpoint: 'api_keys'
      }
    }
  }
});

/**
 * Concurrent session limiting
 */
const activeSessions = new Map<string, Set<string>>();

export function checkConcurrentSessions(maxSessions: number = 3) {
  return function(req: Request, res: Response, next: NextFunction): void {
    const user = (req as AuthenticatedRequest).user;
    
    // Admin users bypass concurrent session limits
    if (shouldBypassRateLimit(req)) {
      next();
      return;
    }
    
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          type: 'AUTHENTICATION_ERROR',
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required'
        }
      });
      return;
    }
    
    const currentSessions = activeSessions.get(user.id)?.size || 0;
    
    if (currentSessions >= maxSessions) {
      res.status(409).json({
        success: false,
        error: {
          type: 'CONCURRENCY_ERROR',
          code: 'TOO_MANY_CONCURRENT_SESSIONS',
          message: 'Maximum concurrent sessions exceeded',
          details: {
            current: currentSessions,
            limit: maxSessions,
            admin_bypass_available: false
          }
        },
        request_id: req.id
      });
      return;
    }
    
    next();
  };
}

export function addConcurrentSession(userId: string, sessionId: string): void {
  if (!activeSessions.has(userId)) {
    activeSessions.set(userId, new Set());
  }
  activeSessions.get(userId)!.add(sessionId);
}

export function removeConcurrentSession(userId: string, sessionId: string): void {
  const sessions = activeSessions.get(userId);
  if (sessions) {
    sessions.delete(sessionId);
    if (sessions.size === 0) {
      activeSessions.delete(userId);
    }
  }
}

// Legacy function names for compatibility
export function incrementUserSessions(userId: string): void {
  console.warn('incrementUserSessions is deprecated, use addConcurrentSession instead');
}

export function decrementUserSessions(userId: string): void {
  console.warn('decrementUserSessions is deprecated, use removeConcurrentSession instead');
}
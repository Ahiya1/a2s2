/**
 * keen API Gateway - Authentication Middleware
 * JWT and API key validation middleware with admin privilege support
 */

import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, AuthenticationError } from '../types.js';
import { AuthenticationService } from '../services/AuthenticationService.js';
import { AuditLogger } from '../services/AuditLogger.js';

/**
 * Create authentication middleware
 */
export function createAuthMiddleware(
  authService: AuthenticationService,
  auditLogger: AuditLogger
) {
  /**
   * Main authentication middleware
   */
  return async function authenticateRequest(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        await auditLogger.logSecurityEvent({
          type: 'invalid_token',
          ip: getClientIP(req),
          details: {
            reason: 'missing_authorization_header',
            path: req.path,
            method: req.method
          }
        });

        res.status(401).json({
          success: false,
          error: {
            type: 'AUTHENTICATION_ERROR',
            code: 'MISSING_AUTHORIZATION',
            message: 'Authorization header is required',
            help_url: 'https://docs.keen.dev/auth/headers'
          },
          request_id: req.id
        });
        return;
      }

      let user: any;
      let authMethod: 'jwt' | 'api_key';

      if (authHeader.startsWith('Bearer ')) {
        // JWT token authentication
        const token = authHeader.substring(7);
        const payload = await authService.verifyAccessToken(token);
        
        user = {
          id: payload.sub,
          email: payload.email,
          username: payload.username,
          role: payload.role,
          is_admin: payload.isAdmin,
          admin_privileges: payload.adminPrivileges,
          authMethod: 'jwt' as const,
          tokenIsAdmin: payload.isAdmin,
          tokenScopes: payload.scopes
        };
        authMethod = 'jwt';
        
      } else if (authHeader.startsWith('ApiKey ')) {
        // API key authentication
        const apiKey = authHeader.substring(7);
        const validation = await authService.validateAPIKey(apiKey);
        
        user = {
          id: validation.userId,
          is_admin: validation.isAdmin,
          admin_privileges: validation.adminPrivileges,
          authMethod: 'api_key' as const,
          tokenIsAdmin: validation.isAdmin,
          tokenScopes: validation.scopes
        };
        authMethod = 'api_key';
        
        // Add API key specific info to request
        (req as AuthenticatedRequest).apiKeyScopes = validation.scopes;
        
      } else {
        await auditLogger.logSecurityEvent({
          type: 'invalid_token',
          ip: getClientIP(req),
          details: {
            reason: 'invalid_authorization_format',
            auth_header_prefix: authHeader.substring(0, 10),
            path: req.path
          }
        });

        res.status(401).json({
          success: false,
          error: {
            type: 'AUTHENTICATION_ERROR',
            code: 'INVALID_AUTHORIZATION_FORMAT',
            message: 'Authorization header must start with "Bearer " or "ApiKey "',
            help_url: 'https://docs.keen.dev/auth/formats'
          },
          request_id: req.id
        });
        return;
      }

      // Attach authenticated user to request
      (req as AuthenticatedRequest).user = user;

      next();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof AuthenticationError) {
        await auditLogger.logSecurityEvent({
          type: 'invalid_token',
          ip: getClientIP(req),
          details: {
            reason: errorMessage,
            path: req.path,
            method: req.method
          }
        });

        res.status(401).json({
          success: false,
          error: {
            type: 'AUTHENTICATION_ERROR',
            code: 'INVALID_TOKEN',
            message: errorMessage,
            help_url: 'https://docs.keen.dev/auth/troubleshooting'
          },
          request_id: req.id
        });
        return;
      }

      // Log unexpected authentication errors
      console.error('Unexpected authentication error:', error);
      await auditLogger.logError({
        requestId: req.id,
        error: errorMessage,
        isAdmin: false
      });

      res.status(500).json({
        success: false,
        error: {
          type: 'SYSTEM_ERROR',
          code: 'AUTHENTICATION_SYSTEM_ERROR',
          message: 'Authentication system temporarily unavailable'
        },
        request_id: req.id
      });
      return;
    }
  };
}

/**
 * Admin-only middleware
 */
export function requireAdmin() {
  return function(req: Request, res: Response, next: NextFunction): void {
    const user = (req as AuthenticatedRequest).user;

    if (!user || !user.is_admin) {
      res.status(403).json({
        success: false,
        error: {
          type: 'AUTHORIZATION_ERROR',
          code: 'INSUFFICIENT_PRIVILEGES',
          message: 'Admin privileges required for this operation',
          help_url: 'https://docs.keen.dev/auth/admin'
        },
        request_id: req.id
      });
      return;
    }

    next();
  };
}

/**
 * Require specific admin privileges
 */
export function requireAdminPrivilege(privilege: string) {
  return function(req: Request, res: Response, next: NextFunction): void {
    const user = (req as AuthenticatedRequest).user;

    if (!user || !user.is_admin || !user.admin_privileges?.[privilege as keyof typeof user.admin_privileges]) {
      res.status(403).json({
        success: false,
        error: {
          type: 'AUTHORIZATION_ERROR',
          code: 'INSUFFICIENT_ADMIN_PRIVILEGES',
          message: `Admin privilege '${privilege}' required for this operation`,
          details: {
            required_privilege: privilege,
            user_privileges: user?.admin_privileges || {}
          },
          help_url: 'https://docs.keen.dev/auth/admin-privileges'
        },
        request_id: req.id
      });
      return;
    }

    next();
  };
}

/**
 * Require specific API scopes
 */
export function requireScopes(requiredScopes: string[]) {
  return function(req: Request, res: Response, next: NextFunction): void {
    const user = (req as AuthenticatedRequest).user;
    const userScopes = user?.tokenScopes || [];
    const apiKeyScopes = (req as AuthenticatedRequest).apiKeyScopes || [];
    const allScopes = [...userScopes, ...apiKeyScopes];

    // Admin users have all scopes
    if (user?.is_admin) {
      next();
      return;
    }

    const hasAllScopes = requiredScopes.every(scope => allScopes.includes(scope));
    
    if (!hasAllScopes) {
      const missingScopes = requiredScopes.filter(scope => !allScopes.includes(scope));
      
      res.status(403).json({
        success: false,
        error: {
          type: 'AUTHORIZATION_ERROR',
          code: 'INSUFFICIENT_SCOPES',
          message: 'Required API scopes are missing',
          details: {
            required_scopes: requiredScopes,
            user_scopes: allScopes,
            missing_scopes: missingScopes
          },
          help_url: 'https://docs.keen.dev/auth/scopes'
        },
        request_id: req.id
      });
      return;
    }

    next();
  };
}

/**
 * Optional authentication middleware (for endpoints that work with or without auth)
 */
export function optionalAuth(
  authService: AuthenticationService,
  auditLogger: AuditLogger
) {
  const authMiddleware = createAuthMiddleware(authService, auditLogger);
  
  return function(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      // No auth header, continue without authentication
      next();
      return;
    }
    
    // Auth header present, validate it
    authMiddleware(req, res, next);
  };
}

/**
 * Rate limit bypass check for admin users
 */
export function shouldBypassRateLimit(req: Request): boolean {
  const user = (req as AuthenticatedRequest).user;
  return Boolean(user?.is_admin && user.admin_privileges?.bypass_rate_limits);
}

/**
 * Get client IP address
 */
function getClientIP(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
         (req.headers['x-real-ip'] as string) ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         'unknown';
}

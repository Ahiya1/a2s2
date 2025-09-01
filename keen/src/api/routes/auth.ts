/**
 * keen API Gateway - Authentication Routes
 * JWT login, API key management, and admin authentication
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { asyncHandler, createValidationError } from '../middleware/errorHandler.js';
import { requireAdmin } from '../middleware/authentication.js';
import { AuthenticatedRequest, LoginCredentials, APIKeyConfig } from '../types.js';
import { AuthenticationService } from '../services/AuthenticationService.js';
import { AuditLogger } from '../services/AuditLogger.js';
import { keen } from '../../index.js';

/**
 * Create authentication router with service dependencies
 */
export function createAuthRouter(
  authService: AuthenticationService,
  auditLogger: AuditLogger,
  authMiddleware: any
) {
  const router = Router();
  const keenDB = keen.getInstance();

  /**
   * User registration
   */
  router.post('/register',
    [
      body('email').isEmail().normalizeEmail(),
      body('username').isLength({ min: 3, max: 50 }).trim(),
      body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
      body('display_name').optional().isLength({ max: 100 }).trim()
    ],
    asyncHandler(async (req: Request, res: Response) => {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw createValidationError('Invalid registration data', {
          validation_errors: errors.array()
        });
      }

      const { email, username, password, display_name } = req.body;
      const clientInfo = {
        ip: getClientIP(req),
        userAgent: req.get('User-Agent')
      };

      // Create user account
      const user = await keenDB.users.createUser({
        email,
        username,
        password,
        display_name
      });

      // Create credit account
      await keenDB.credits.createCreditAccount(user.id);

      // Generate authentication tokens
      const accessToken = await authService.generateAccessToken(user);
      const refreshToken = 'refresh_token_placeholder'; // TODO: implement refresh tokens

      // Log successful registration
      await auditLogger.logSuccessfulLogin(user.id, clientInfo, {
        isAdmin: user.is_admin,
        adminPrivileges: user.admin_privileges
      });

      res.status(201).json({
        success: true,
        message: 'User account created successfully',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
          is_admin: user.is_admin,
          created_at: user.created_at
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: user.is_admin ? 3600 : 900
        },
        admin_access: user.is_admin
      });
    })
  );

  /**
   * User login
   */
  router.post('/login',
    [
      body('email').isEmail().normalizeEmail(),
      body('password').isLength({ min: 1 }),
      body('mfa_token').optional().isLength({ min: 6, max: 6 })
    ],
    asyncHandler(async (req: Request, res: Response) => {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw createValidationError('Invalid login credentials', {
          validation_errors: errors.array()
        });
      }

      const credentials: LoginCredentials = {
        email: req.body.email,
        password: req.body.password,
        mfaToken: req.body.mfa_token
      };

      const clientInfo = {
        ip: getClientIP(req),
        userAgent: req.get('User-Agent')
      };

      // Authenticate user
      const authResult = await authService.login(credentials, clientInfo);

      res.status(200).json({
        success: true,
        message: 'Login successful',
        user: authResult.user,
        tokens: authResult.tokens,
        admin_access: authResult.adminAccess,
        session_info: {
          ip: clientInfo.ip,
          user_agent: clientInfo.userAgent,
          login_time: new Date().toISOString(),
          token_expires_at: new Date(Date.now() + authResult.tokens.expires_in * 1000).toISOString()
        }
      });
    })
  );

  /**
   * Refresh access token
   */
  router.post('/refresh',
    [
      body('refresh_token').isLength({ min: 1 })
    ],
    asyncHandler(async (req: Request, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw createValidationError('Invalid refresh token', {
          validation_errors: errors.array()
        });
      }

      const { refresh_token } = req.body;
      
      // Refresh access token
      const result = await authService.refreshAccessToken(refresh_token);

      res.status(200).json({
        success: true,
        tokens: {
          access_token: result.access_token,
          expires_in: result.expires_in
        }
      });
    })
  );

  /**
   * Logout (revoke tokens)
   */
  router.post('/logout',
    authMiddleware,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      
      // TODO: Implement token revocation
      // For now, just log the logout
      await auditLogger.logAdminAction({
        adminUserId: user.id,
        action: 'logout',
        timestamp: new Date()
      });

      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    })
  );

  /**
   * Create API key
   */
  router.post('/api-keys',
    authMiddleware,
    [
      body('name').isLength({ min: 1, max: 100 }).trim(),
      body('scopes').isArray().custom((scopes: string[]) => {
        const validScopes = ['profile:read', 'credits:read', 'agents:execute', 'sessions:read', 'admin:analytics'];
        return scopes.every(scope => validScopes.includes(scope));
      }),
      body('rate_limit_per_hour').optional().isInt({ min: 100, max: 10000 }),
      body('expires_at').optional().isISO8601()
    ],
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw createValidationError('Invalid API key configuration', {
          validation_errors: errors.array()
        });
      }

      const user = req.user!;
      const keyConfig: APIKeyConfig = {
        name: req.body.name,
        scopes: req.body.scopes,
        rateLimitPerHour: req.body.rate_limit_per_hour,
        expiresAt: req.body.expires_at ? new Date(req.body.expires_at) : undefined
      };

      // Create API key
      const apiKey = await authService.createAPIKey(user.id, keyConfig, {
        userId: user.id,
        isAdmin: user.is_admin,
        adminPrivileges: user.admin_privileges
      });

      // Log API key creation
      await auditLogger.logAdminAction({
        adminUserId: user.id,
        action: 'create_api_key',
        details: {
          key_name: keyConfig.name,
          scopes: keyConfig.scopes,
          rate_limit: keyConfig.rateLimitPerHour
        }
      });

      res.status(201).json({
        success: true,
        message: 'API key created successfully',
        api_key: apiKey,
        warning: 'Store this API key securely. It will not be shown again.',
        usage: {
          header: `Authorization: ApiKey ${apiKey.key}`,
          curl_example: `curl -H "Authorization: ApiKey ${apiKey.key}" https://api.keen.dev/api/v1/credits/balance`
        }
      });
    })
  );

  /**
   * List user's API keys
   */
  router.get('/api-keys',
    authMiddleware,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      
      const apiKeys = await authService.listAPIKeys(user.id, {
        userId: user.id,
        isAdmin: user.is_admin,
        adminPrivileges: user.admin_privileges
      });

      res.status(200).json({
        success: true,
        api_keys: apiKeys,
        total: apiKeys.length,
        usage_info: {
          header_format: 'Authorization: ApiKey {your_key}',
          rate_limits: 'Per-key rate limits apply',
          scopes: 'Keys are limited to specified scopes'
        }
      });
    })
  );

  /**
   * Revoke API key
   */
  router.delete('/api-keys/:keyId',
    authMiddleware,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      const keyId = req.params.keyId;
      
      const revoked = await authService.revokeAPIKey(user.id, keyId, {
        userId: user.id,
        isAdmin: user.is_admin,
        adminPrivileges: user.admin_privileges
      });

      if (!revoked) {
        return res.status(404).json({
          success: false,
          error: {
            type: 'NOT_FOUND',
            code: 'API_KEY_NOT_FOUND',
            message: 'API key not found or already revoked'
          }
        });
      }

      // Log API key revocation
      await auditLogger.logAdminAction({
        adminUserId: user.id,
        action: 'revoke_api_key',
        details: {
          key_id: keyId
        }
      });

      res.status(200).json({
        success: true,
        message: 'API key revoked successfully'
      });
    })
  );

  /**
   * Get current user profile
   */
  router.get('/profile',
    authMiddleware,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      
      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
          is_admin: user.is_admin,
          admin_privileges: user.admin_privileges,
          auth_method: user.authMethod,
          token_scopes: user.tokenScopes,
          account_status: user.account_status,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled,
          timezone: user.timezone,
          preferences: user.preferences,
          created_at: user.created_at,
          last_login_at: user.last_login_at
        }
      });
    })
  );

  /**
   * Admin: verify admin credentials (for sensitive operations)
   */
  router.post('/admin/verify',
    authMiddleware,
    requireAdmin(),
    [
      body('password').isLength({ min: 1 })
    ],
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw createValidationError('Password is required', {
          validation_errors: errors.array()
        });
      }

      const user = req.user!;
      const { password } = req.body;

      // Verify admin password
      const isValid = await keenDB.users.verifyAdminUser(user.email!, password);
      
      if (!isValid) {
        await auditLogger.logSecurityEvent({
          type: 'admin_privilege_escalation',
          userId: user.id,
          ip: getClientIP(req),
          details: {
            reason: 'invalid_admin_password',
            email: user.email
          }
        });
        
        return res.status(401).json({
          success: false,
          error: {
            type: 'AUTHENTICATION_ERROR',
            code: 'INVALID_ADMIN_PASSWORD',
            message: 'Invalid admin password'
          }
        });
      }

      // Log successful admin verification
      await auditLogger.logAdminAction({
        adminUserId: user.id,
        action: 'admin_password_verified',
        details: {
          ip: getClientIP(req),
          user_agent: req.get('User-Agent')
        }
      });

      res.status(200).json({
        success: true,
        message: 'Admin credentials verified',
        admin_session: {
          verified_at: new Date().toISOString(),
          expires_in: 3600 // 1 hour
        }
      });
    })
  );

  return router;
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

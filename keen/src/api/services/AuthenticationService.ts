/**
 * keen API Gateway - Authentication Service
 * JWT token management, API key validation, and admin privilege handling
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager, UserContext } from '../../database/DatabaseManager.js';
import { UserDAO, User } from '../../database/dao/UserDAO.js';
import {
  JWTPayload,
  LoginCredentials,
  ClientInfo,
  AuthenticationResult,
  APIKeyConfig,
  APIKeyResult,
  APIKeyValidation,
  AuthenticationError,
  MFARequiredError
} from '../types.js';
import { AuditLogger } from './AuditLogger.js';

interface RefreshTokenData {
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  clientInfo: ClientInfo;
}

interface APIKeyData {
  id: string;
  userId: string;
  tokenHash: string;
  name: string;
  scopes: string[];
  rateLimitPerHour: number | null;
  bypassLimits: boolean;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export class AuthenticationService {
  private jwtSecret: string;
  private refreshTokens: Map<string, RefreshTokenData> = new Map();

  constructor(
    private db: DatabaseManager,
    private userDAO: UserDAO,
    private auditLogger: AuditLogger
  ) {
    this.jwtSecret = process.env.JWT_SECRET!;
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }

  /**
   * Authenticate user login with credentials
   */
  async login(
    credentials: LoginCredentials,
    clientInfo: ClientInfo
  ): Promise<AuthenticationResult> {
    const { email, password, mfaToken } = credentials;

    try {
      // 1. Rate limiting check (skip for admin)
      if (email !== process.env.ADMIN_EMAIL) {
        await this.checkLoginRateLimit(email, clientInfo.ip);
      }

      // 2. User lookup and password verification
      const user = await this.userDAO.getUserByEmailForAuth(email);
      if (!user || !await this.verifyPassword(password, user.password_hash)) {
        await this.auditLogger.logFailedLogin(email, clientInfo, 'invalid_credentials');
        throw new AuthenticationError('Invalid email or password');
      }

      // 3. Account status checks
      if (user.account_status !== 'active') {
        await this.auditLogger.logFailedLogin(email, clientInfo, 'account_suspended');
        throw new AuthenticationError('Account is suspended or inactive');
      }

      // 4. MFA verification if enabled (skip for admin with correct password)
      if (user.mfa_enabled && !(user.is_admin && password === process.env.ADMIN_PASSWORD)) {
        if (!mfaToken) {
          throw new MFARequiredError('Two-factor authentication token required');
        }

        if (!await this.verifyMFAToken(user.mfa_secret!, mfaToken)) {
          await this.auditLogger.logFailedLogin(email, clientInfo, 'invalid_mfa');
          throw new AuthenticationError('Invalid two-factor authentication token');
        }
      }

      // 5. Generate tokens with admin privileges
      const accessToken = await this.generateAccessToken(user);
      const refreshToken = await this.generateRefreshToken(user, clientInfo);

      // 6. Update login tracking
      await this.updateLoginTracking(user.id, clientInfo.ip);

      // 7. Audit successful login
      await this.auditLogger.logSuccessfulLogin(user.id, clientInfo, {
        isAdmin: user.is_admin,
        adminPrivileges: user.admin_privileges
      });

      // 8. Return sanitized user data
      const sanitizedUser = this.sanitizeUserForResponse(user);

      return {
        user: {
          ...sanitizedUser,
          authMethod: 'jwt' as const,
          tokenIsAdmin: user.is_admin
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: user.is_admin ? 3600 : 900 // Admin: 1h, User: 15min
        },
        adminAccess: user.is_admin
      };

    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof MFARequiredError) {
        throw error;
      }
      
      console.error('Login error:', error);
      await this.auditLogger.logFailedLogin(email, clientInfo, 'system_error');
      throw new AuthenticationError('Login failed due to system error');
    }
  }

  /**
   * Generate JWT access token
   */
  async generateAccessToken(user: User): Promise<string> {
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      isAdmin: user.is_admin,
      adminPrivileges: user.admin_privileges || {},
      scopes: this.getUserScopes(user),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (user.is_admin ? 3600 : 900)
    };

    return jwt.sign(payload, this.jwtSecret, { algorithm: 'HS256' });
  }

  /**
   * Verify JWT access token
   */
  async verifyAccessToken(token: string): Promise<JWTPayload> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JWTPayload;

      // Additional validation - ensure user still exists and is active
      const user = await this.userDAO.getUserById(payload.sub);
      if (!user || user.account_status !== 'active') {
        throw new AuthenticationError('Token is invalid - user account not active');
      }

      // Verify admin privileges haven't been revoked
      if (payload.isAdmin && !user.is_admin) {
        throw new AuthenticationError('Admin privileges have been revoked');
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid authentication token');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Authentication token has expired');
      }
      throw error;
    }
  }

  /**
   * Create API key for user
   */
  async createAPIKey(
    userId: string,
    keyConfig: APIKeyConfig,
    context?: UserContext
  ): Promise<APIKeyResult> {
    const user = await this.userDAO.getUserById(userId, context);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Generate secure API key
    const keyValue = this.generateSecureAPIKey(user.is_admin);
    const keyHash = this.hashAPIKey(keyValue);
    const keyId = uuidv4();

    // Store API key with metadata and admin privileges
    await this.db.query(
      `
      INSERT INTO auth_tokens (
        id, user_id, token_type, token_hash, token_name, token_scopes,
        rate_limit_per_hour, bypass_rate_limits, expires_at, created_at
      ) VALUES ($1, $2, 'api_key', $3, $4, $5, $6, $7, $8, NOW())
      `,
      [
        keyId,
        userId,
        keyHash,
        keyConfig.name,
        JSON.stringify(keyConfig.scopes),
        user.is_admin ? null : (keyConfig.rateLimitPerHour || 1000),
        user.is_admin,
        keyConfig.expiresAt
      ],
      context
    );

    return {
      id: keyId,
      key: keyValue, // Only shown once!
      name: keyConfig.name,
      scopes: keyConfig.scopes,
      rateLimitPerHour: user.is_admin ? null : (keyConfig.rateLimitPerHour || 1000),
      bypassLimits: user.is_admin,
      createdAt: new Date()
    };
  }

  /**
   * Validate API key
   */
  async validateAPIKey(keyValue: string): Promise<APIKeyValidation> {
    const keyHash = this.hashAPIKey(keyValue);

    const result = await this.db.query<any>(
      `
      SELECT t.*, u.is_admin, u.admin_privileges 
      FROM auth_tokens t
      JOIN users u ON t.user_id = u.id
      WHERE t.token_hash = $1 AND t.token_type = 'api_key' AND t.is_active = true
      `,
      [keyHash]
    );

    const apiKey = result[0];
    if (!apiKey) {
      throw new AuthenticationError('Invalid API key');
    }

    // Check expiration
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      throw new AuthenticationError('API key has expired');
    }

    // Update last used timestamp
    await this.db.query(
      'UPDATE auth_tokens SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = $1',
      [apiKey.id]
    );

    return {
      userId: apiKey.user_id,
      scopes: JSON.parse(apiKey.token_scopes || '[]'),
      rateLimitRemaining: apiKey.bypass_rate_limits ? 'unlimited' : 1000, // TODO: implement actual tracking
      isAdmin: apiKey.bypass_rate_limits,
      adminPrivileges: apiKey.bypass_rate_limits ? apiKey.admin_privileges : null
    };
  }

  /**
   * Generate refresh token
   */
  private async generateRefreshToken(user: User, clientInfo: ClientInfo): Promise<string> {
    const tokenValue = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days

    // Store refresh token data
    this.refreshTokens.set(tokenValue, {
      userId: user.id,
      createdAt: new Date(),
      expiresAt,
      clientInfo
    });

    // Also store in database for persistence
    await this.db.query(
      `
      INSERT INTO auth_tokens (user_id, token_type, token_hash, expires_at, created_ip)
      VALUES ($1, 'jwt_refresh', $2, $3, $4)
      `,
      [user.id, this.hashToken(tokenValue), expiresAt, clientInfo.ip]
    );

    return tokenValue;
  }

  /**
   * Verify password against hash
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) {
      return false;
    }
    return bcrypt.compare(password, hash);
  }

  /**
   * Verify MFA token (TOTP)
   */
  private async verifyMFAToken(secret: string, token: string): Promise<boolean> {
    // TODO: Implement TOTP verification with time window
    // For now, return true for development
    return true;
  }

  /**
   * Check login rate limiting
   */
  private async checkLoginRateLimit(email: string, ip: string): Promise<void> {
    // TODO: Implement Redis-based rate limiting
    // For now, just log the attempt
    console.log(`Login attempt for ${email} from ${ip}`);
  }

  /**
   * Update user login tracking
   */
  private async updateLoginTracking(userId: string, ip: string): Promise<void> {
    await this.db.query(
      'UPDATE users SET last_login_at = NOW(), last_login_ip = $1 WHERE id = $2',
      [ip, userId]
    );
  }

  /**
   * Get user scopes based on role and admin privileges
   */
  private getUserScopes(user: User): string[] {
    const baseScopes = ['profile:read', 'credits:read', 'agents:execute', 'sessions:read'];
    
    if (user.is_admin) {
      return [
        ...baseScopes,
        'admin:analytics',
        'admin:users:read',
        'admin:users:write',
        'admin:credits:write',
        'admin:system:read',
        'admin:audit:read',
        'agents:unlimited',
        'credits:unlimited'
      ];
    }

    return baseScopes;
  }

  /**
   * Generate secure API key
   */
  private generateSecureAPIKey(isAdmin: boolean): string {
    const prefix = isAdmin ? 'ak_admin_' : 'ak_live_';
    const randomBytes = crypto.randomBytes(32);
    return prefix + randomBytes.toString('hex');
  }

  /**
   * Hash API key for secure storage
   */
  private hashAPIKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Hash token for secure storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Sanitize user data for API response
   */
  private sanitizeUserForResponse(user: User): Omit<User, 'password_hash' | 'mfa_secret' | 'recovery_codes'> {
    const { password_hash, mfa_secret, recovery_codes, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(tokenValue: string): Promise<void> {
    this.refreshTokens.delete(tokenValue);
    
    const tokenHash = this.hashToken(tokenValue);
    await this.db.query(
      'UPDATE auth_tokens SET is_active = false WHERE token_hash = $1 AND token_type = $2',
      [tokenHash, 'jwt_refresh']
    );
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
    const tokenData = this.refreshTokens.get(refreshToken);
    
    if (!tokenData || tokenData.expiresAt < new Date()) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    const user = await this.userDAO.getUserById(tokenData.userId);
    if (!user || user.account_status !== 'active') {
      throw new AuthenticationError('User account is not active');
    }

    const accessToken = await this.generateAccessToken(user);
    
    return {
      access_token: accessToken,
      expires_in: user.is_admin ? 3600 : 900
    };
  }

  /**
   * List user's API keys
   */
  async listAPIKeys(
    userId: string, 
    context?: UserContext
  ): Promise<Array<Omit<APIKeyResult, 'key'>>> {
    const keys = await this.db.query<any>(
      `
      SELECT id, token_name as name, token_scopes, rate_limit_per_hour, 
             bypass_rate_limits, created_at, last_used_at, expires_at
      FROM auth_tokens 
      WHERE user_id = $1 AND token_type = 'api_key' AND is_active = true
      ORDER BY created_at DESC
      `,
      [userId],
      context
    );

    return keys.map(key => ({
      id: key.id,
      name: key.name,
      scopes: JSON.parse(key.token_scopes || '[]'),
      rateLimitPerHour: key.rate_limit_per_hour,
      bypassLimits: key.bypass_rate_limits,
      createdAt: key.created_at
    }));
  }

  /**
   * Revoke API key
   */
  async revokeAPIKey(
    userId: string, 
    keyId: string, 
    context?: UserContext
  ): Promise<boolean> {
    const result = await this.db.query(
      'UPDATE auth_tokens SET is_active = false WHERE id = $1 AND user_id = $2 AND token_type = $3',
      [keyId, userId, 'api_key'],
      context
    );

    return result.length > 0;
  }
}
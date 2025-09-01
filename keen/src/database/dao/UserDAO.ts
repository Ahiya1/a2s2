/**
 * UserDAO - User management with admin privilege handling
 * Handles authentication, admin users, and user lifecycle management
 */

import bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { DatabaseManager, UserContext } from "../DatabaseManager.js";
import { securityConfig, adminConfig } from "../../config/database.js";

export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  display_name?: string;
  role: "user" | "admin" | "super_admin";
  is_admin: boolean;
  admin_privileges?: {
    unlimited_credits?: boolean;
    bypass_rate_limits?: boolean;
    view_all_analytics?: boolean;
    user_impersonation?: boolean;
    system_diagnostics?: boolean;
    priority_execution?: boolean;
    global_access?: boolean;
    audit_access?: boolean;
  };
  email_verified: boolean;
  email_verification_token?: string;
  account_status: "active" | "suspended" | "banned";
  mfa_enabled: boolean;
  mfa_secret?: string;
  recovery_codes?: string[];
  timezone: string;
  preferences: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  last_login_ip?: string;
}

export interface CreateUserRequest {
  email: string;
  username: string;
  password: string;
  display_name?: string;
  timezone?: string;
  preferences?: Record<string, any>;
}

export interface LoginRequest {
  email: string;
  password: string;
  ip_address?: string;
}

export interface LoginResponse {
  user: Omit<User, "password_hash" | "mfa_secret" | "recovery_codes">;
  token: string;
  refresh_token: string;
  expires_in: number;
}

export class UserDAO {
  constructor(private db: DatabaseManager) {}

  /**
   * Create a new user account
   */
  async createUser(request: CreateUserRequest): Promise<User> {
    const hashedPassword = await bcrypt.hash(
      request.password,
      securityConfig.bcryptRounds
    );
    const userId = uuidv4();

    const result = await this.db.query<User>(
      `
      INSERT INTO users (
        id, email, username, password_hash, display_name, 
        timezone, preferences, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
      `,
      [
        userId,
        request.email,
        request.username,
        hashedPassword,
        request.display_name || request.username,
        request.timezone || "UTC",
        request.preferences || {},
      ]
    );

    const user = result[0];
    if (!user) {
      throw new Error("Failed to create user");
    }

    // Remove sensitive data from response
    delete (user as any).password_hash;
    delete (user as any).mfa_secret;
    delete (user as any).recovery_codes;

    return user;
  }

  /**
   * Authenticate user login (including admin)
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    const result = await this.db.query<User>(
      "SELECT * FROM users WHERE email = $1 AND account_status = $2",
      [request.email, "active"]
    );

    const user = result[0];
    if (!user) {
      throw new Error("Invalid email or password");
    }

    const isValidPassword = await bcrypt.compare(
      request.password,
      user.password_hash
    );
    if (!isValidPassword) {
      throw new Error("Invalid email or password");
    }

    // Update last login information
    await this.db.query(
      "UPDATE users SET last_login_at = NOW(), last_login_ip = $1 WHERE id = $2",
      [request.ip_address, user.id]
    );

    // Ensure JWT secret is available
    if (!securityConfig.jwtSecret) {
      throw new Error("JWT secret not configured");
    }

    // Generate JWT tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      isAdmin: user.is_admin,
      adminPrivileges: user.admin_privileges || {},
    };

    const jwtSecret = securityConfig.jwtSecret;
    
    // Work around TypeScript JWT typing issues by using any
    const jwtOptions: any = {
      expiresIn: securityConfig.jwtExpiresIn
    };
    const refreshOptions: any = {
      expiresIn: securityConfig.jwtRefreshExpiresIn
    };

    const token = jwt.sign(tokenPayload, jwtSecret, jwtOptions);
    const refreshToken = jwt.sign(
      { userId: user.id, type: "refresh" },
      jwtSecret,
      refreshOptions
    );

    // Store refresh token
    await this.db.query(
      `
      INSERT INTO auth_tokens (user_id, token_type, token_hash, expires_at, created_ip)
      VALUES ($1, 'jwt_refresh', $2, NOW() + INTERVAL '7 days', $3)
      `,
      [user.id, this.hashToken(refreshToken), request.ip_address]
    );

    // Remove sensitive data
    const safeUser = { ...user };
    delete (safeUser as any).password_hash;
    delete (safeUser as any).mfa_secret;
    delete (safeUser as any).recovery_codes;

    return {
      user: safeUser,
      token,
      refresh_token: refreshToken,
      expires_in: 24 * 60 * 60, // 24 hours in seconds
    };
  }

  /**
   * Verify admin user credentials (for special admin operations)
   */
  async verifyAdminUser(email: string, password: string): Promise<boolean> {
    if (email !== adminConfig.email) {
      return false;
    }

    const result = await this.db.query<User>(
      "SELECT * FROM users WHERE email = $1 AND is_admin = true",
      [adminConfig.email]
    );

    const adminUser = result[0];
    if (!adminUser) {
      return false;
    }

    return await bcrypt.compare(password, adminUser.password_hash);
  }

  /**
   * Check if user is admin with specific privileges
   */
  async isAdminUser(userId: string): Promise<{
    isAdmin: boolean;
    privileges?: User["admin_privileges"];
  }> {
    const result = await this.db.query<
      Pick<User, "is_admin" | "admin_privileges">
    >("SELECT is_admin, admin_privileges FROM users WHERE id = $1", [userId]);

    const user = result[0];
    return {
      isAdmin: user?.is_admin || false,
      privileges: user?.admin_privileges || {},
    };
  }

  /**
   * Get user by ID (with admin context for access control)
   */
  async getUserById(
    userId: string,
    context?: UserContext
  ): Promise<User | null> {
    const result = await this.db.query<User>(
      "SELECT * FROM users WHERE id = $1",
      [userId],
      context
    );

    const user = result[0];
    if (!user) {
      return null;
    }

    // Remove sensitive data unless admin is accessing
    if (!context?.isAdmin) {
      delete (user as any).password_hash;
      delete (user as any).mfa_secret;
      delete (user as any).recovery_codes;
    }

    return user;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(
    email: string,
    context?: UserContext
  ): Promise<User | null> {
    const result = await this.db.query<User>(
      "SELECT * FROM users WHERE email = $1",
      [email],
      context
    );

    const user = result[0];
    if (!user) {
      return null;
    }

    // Remove sensitive data unless admin is accessing
    if (!context?.isAdmin) {
      delete (user as any).password_hash;
      delete (user as any).mfa_secret;
      delete (user as any).recovery_codes;
    }

    return user;
  }

  /**
   * Get user by email for authentication purposes (includes password_hash)
   */
  async getUserByEmailForAuth(
    email: string,
    context?: UserContext
  ): Promise<User | null> {
    const result = await this.db.query<User>(
      "SELECT * FROM users WHERE email = $1",
      [email],
      context
    );

    return result[0] || null;
  }

  /**
   * Update user profile
   */
  async updateUser(
    userId: string,
    updates: Partial<Pick<User, "display_name" | "timezone" | "preferences">>,
    context?: UserContext
  ): Promise<User> {
    const setClause = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.display_name !== undefined) {
      setClause.push(`display_name = $${paramIndex++}`);
      values.push(updates.display_name);
    }

    if (updates.timezone !== undefined) {
      setClause.push(`timezone = $${paramIndex++}`);
      values.push(updates.timezone);
    }

    if (updates.preferences !== undefined) {
      setClause.push(`preferences = $${paramIndex++}`);
      values.push(updates.preferences);
    }

    if (setClause.length === 0) {
      throw new Error("No valid updates provided");
    }

    setClause.push(`updated_at = NOW()`);
    values.push(userId);

    const result = await this.db.query<User>(
      `
      UPDATE users 
      SET ${setClause.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
      `,
      values,
      context
    );

    const user = result[0];
    if (!user) {
      throw new Error("User not found or update failed");
    }

    // Remove sensitive data unless admin
    if (!context?.isAdmin) {
      delete (user as any).password_hash;
      delete (user as any).mfa_secret;
      delete (user as any).recovery_codes;
    }

    return user;
  }

  /**
   * List all users (admin only)
   */
  async listUsers(
    limit: number = 50,
    offset: number = 0,
    context?: UserContext
  ): Promise<{
    users: Omit<User, "password_hash" | "mfa_secret" | "recovery_codes">[];
    total: number;
  }> {
    if (!context?.isAdmin) {
      throw new Error("Admin privileges required to list all users");
    }

    const countResult = await this.db.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM users",
      [],
      context
    );

    const count = countResult[0]?.count || 0;

    const users = await this.db.query<User>(
      `
      SELECT id, email, username, display_name, role, is_admin, 
             admin_privileges, email_verified, account_status, 
             timezone, preferences, created_at, updated_at, 
             last_login_at, last_login_ip
      FROM users 
      ORDER BY created_at DESC 
      LIMIT $1 OFFSET $2
      `,
      [limit, offset],
      context
    );

    return {
      users,
      total: parseInt(count.toString(), 10),
    };
  }

  /**
   * Delete user account (admin only or self)
   */
  async deleteUser(userId: string, context?: UserContext): Promise<boolean> {
    // Allow users to delete their own account or admin to delete any account
    if (!context?.isAdmin && context?.userId !== userId) {
      throw new Error("Insufficient privileges to delete this user account");
    }

    // Don't allow deletion of the main admin account
    const user = await this.getUserById(userId);
    if (user?.email === adminConfig.email) {
      throw new Error("Cannot delete the main admin account");
    }

    const result = await this.db.query(
      "DELETE FROM users WHERE id = $1",
      [userId],
      context
    );

    return result.length > 0;
  }

  /**
   * Hash a token for secure storage
   */
  private hashToken(token: string): string {
    return require("crypto").createHash("sha256").update(token).digest("hex");
  }

  /**
   * Verify JWT token and extract user context
   */
  async verifyToken(token: string): Promise<UserContext | null> {
    try {
      if (!securityConfig.jwtSecret) {
        throw new Error("JWT secret not configured");
      }

      const decoded = jwt.verify(token, securityConfig.jwtSecret) as any;

      return {
        userId: decoded.userId,
        isAdmin: decoded.isAdmin || false,
        adminPrivileges: decoded.adminPrivileges || {},
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Update user password
   */
  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context?: UserContext
  ): Promise<boolean> {
    // Verify current password
    const result = await this.db.query<User>(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId]
    );

    const user = result[0];
    if (!user) {
      throw new Error("User not found");
    }

    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.password_hash
    );
    if (!isValidPassword) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(
      newPassword,
      securityConfig.bcryptRounds
    );

    // Update password
    await this.db.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [hashedPassword, userId],
      context
    );

    return true;
  }
}

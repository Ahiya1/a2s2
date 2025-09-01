/**
 * Extended Express types for keen API Gateway
 */

import * as express from 'express';

declare global {
  namespace Express {
    export interface Request {
      id: string;
      user?: {
        id: string;
        email?: string;
        username?: string;
        role?: string;
        is_admin?: boolean;
        admin_privileges?: Record<string, any>;
        authMethod?: 'jwt' | 'api_key';
        tokenIsAdmin?: boolean;
        tokenScopes?: string[];
        account_status?: string;
        email_verified?: boolean;
        mfa_enabled?: boolean;
        timezone?: string;
        preferences?: Record<string, any>;
        created_at?: Date;
        last_login_at?: Date;
        display_name?: string;
        last_login_ip?: string;
      };
      apiKeyScopes?: string[];
      rateLimitInfo?: {
        allowed: boolean;
        remaining: number | 'unlimited';
        resetTime: number | null;
        limit: number | 'unlimited';
        isAdmin?: boolean;
      };
    }
  }
}

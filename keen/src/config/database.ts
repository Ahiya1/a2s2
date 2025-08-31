/**
 * Database configuration management
 * Handles environment-specific database settings
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
  idleTimeout: number;
  connectionTimeout: number;
}

export interface AdminConfig {
  email: string;
  password: string;
  username: string;
}

export interface CreditConfig {
  markupMultiplier: number;
  defaultDailyLimit: number;
  defaultMonthlyLimit: number;
  autoRechargeThreshold: number;
  autoRechargeAmount: number;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvFloat(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseFloat(value) : defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  return value ? value.toLowerCase() === 'true' : defaultValue;
}

export const config: DatabaseConfig = {
  host: getEnvVar('DB_HOST', 'localhost'),
  port: getEnvNumber('DB_PORT', 5432),
  database: getEnvVar('DB_NAME', 'keen_development'),
  user: getEnvVar('DB_USER', 'keen_user'),
  password: getEnvVar('DB_PASSWORD'),
  ssl: getEnvBoolean('DB_SSL', false),
  maxConnections: getEnvNumber('DB_MAX_CONNECTIONS', 20),
  idleTimeout: getEnvNumber('DB_IDLE_TIMEOUT', 30000),
  connectionTimeout: getEnvNumber('DB_CONNECTION_TIMEOUT', 10000),
};

export const testConfig: DatabaseConfig = {
  host: getEnvVar('DB_HOST', 'localhost'),
  port: getEnvNumber('DB_PORT', 5432),
  database: getEnvVar('TEST_DB_NAME', 'keen_test'),
  user: getEnvVar('TEST_DB_USER', 'keen_test_user'),
  password: getEnvVar('TEST_DB_PASSWORD', 'test_password'),
  ssl: getEnvBoolean('DB_SSL', false),
  maxConnections: getEnvNumber('DB_MAX_CONNECTIONS', 10),
  idleTimeout: getEnvNumber('DB_IDLE_TIMEOUT', 10000),
  connectionTimeout: getEnvNumber('DB_CONNECTION_TIMEOUT', 5000),
};

export const adminConfig: AdminConfig = {
  email: getEnvVar('ADMIN_EMAIL', 'ahiya.butman@gmail.com'),
  password: getEnvVar('ADMIN_PASSWORD', '2con-creator'),
  username: getEnvVar('ADMIN_USERNAME', 'ahiya_admin'),
};

export const creditConfig: CreditConfig = {
  markupMultiplier: getEnvFloat('CREDIT_MARKUP_MULTIPLIER', 5.0),
  defaultDailyLimit: getEnvFloat('DEFAULT_DAILY_LIMIT', 100.0),
  defaultMonthlyLimit: getEnvFloat('DEFAULT_MONTHLY_LIMIT', 1000.0),
  autoRechargeThreshold: getEnvFloat('AUTO_RECHARGE_THRESHOLD', 10.0),
  autoRechargeAmount: getEnvFloat('AUTO_RECHARGE_AMOUNT', 50.0),
};

export const securityConfig = {
  bcryptRounds: getEnvNumber('BCRYPT_ROUNDS', 12),
  jwtSecret: getEnvVar('JWT_SECRET'),
  jwtExpiresIn: getEnvVar('JWT_EXPIRES_IN', '24h'),
  jwtRefreshExpiresIn: getEnvVar('JWT_REFRESH_EXPIRES_IN', '7d'),
  apiKeyLength: getEnvNumber('API_KEY_LENGTH', 32),
  sessionTimeout: getEnvNumber('SESSION_TIMEOUT', 3600000),
  rateLimitWindow: getEnvNumber('RATE_LIMIT_WINDOW', 3600000),
  rateLimitMaxRequests: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 1000),
};

export const performanceConfig = {
  connectionPoolSize: getEnvNumber('CONNECTION_POOL_SIZE', 10),
  queryTimeout: getEnvNumber('QUERY_TIMEOUT', 30000),
  maxQueryComplexity: getEnvNumber('MAX_QUERY_COMPLEXITY', 1000),
};

export const monitoringConfig = {
  logLevel: getEnvVar('LOG_LEVEL', 'info'),
  metricsEnabled: getEnvBoolean('METRICS_ENABLED', true),
  auditLogEnabled: getEnvBoolean('AUDIT_LOG_ENABLED', true),
};

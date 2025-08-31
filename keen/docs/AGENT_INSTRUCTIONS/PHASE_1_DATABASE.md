# Phase 1: Database Layer Implementation

## Mission

Implement keen's **multi-tenant database layer** with complete PostgreSQL schema, data access layer, and comprehensive analytics. This phase creates the foundation for user isolation, credit management (no packages), session persistence, and real-time streaming.

## Success Criteria

- [ ] **PostgreSQL schema** fully implemented with all tables and relationships
- [ ] **Multi-tenant isolation** enforced at database level with row-level security
- [ ] **Credit management system** with atomic transactions and audit trails (no packages)
- [ ] **Session persistence** supporting recursive agent hierarchies
- [ ] **Real-time streaming** support with WebSocket connection tracking
- [ ] **Analytics and reporting** with comprehensive metrics collection
- [ ] **Admin user support** with unlimited credits and analytics access
- [ ] **80%+ test coverage** including integration and performance tests
- [ ] **Database migrations** system for schema evolution
- [ ] **Connection pooling** and performance optimization
- [ ] **Backup and recovery** procedures implemented

## Database Schema Implementation

### 1. Core User Management

**Study Pattern:** `src/database/DatabaseManager.ts` - Connection management and health monitoring

```sql
-- Users table with comprehensive authentication support
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    avatar_url TEXT,
    
    -- User role and privileges
    role VARCHAR(20) NOT NULL DEFAULT 'user', -- 'user', 'admin', 'super_admin'
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    admin_privileges JSONB DEFAULT '{}',
    
    -- Account status and verification
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    account_status VARCHAR(20) NOT NULL DEFAULT 'active',
    
    -- Multi-factor authentication
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    recovery_codes TEXT[],
    
    -- Preferences and configuration
    timezone VARCHAR(50) DEFAULT 'UTC',
    preferences JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip INET
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Insert admin user (ahiya.butman@gmail.com)
INSERT INTO users (
    email, username, password_hash, display_name, role, is_admin, admin_privileges,
    email_verified, account_status
) VALUES (
    'ahiya.butman@gmail.com',
    'ahiya_admin',
    -- Password hash for '2con-creator'
    '$2b$12$example_hash_for_2con_creator_password',
    'Ahiya Butman (Admin)',
    'super_admin',
    TRUE,
    '{
      "unlimited_credits": true,
      "bypass_rate_limits": true,
      "view_all_analytics": true,
      "manage_users": true,
      "system_monitoring": true,
      "priority_execution": true,
      "user_impersonation": true,
      "system_diagnostics": true
    }',
    TRUE,
    'active'
);
```

**Implementation Requirements:**
- **UUID Primary Keys**: Prevent enumeration attacks
- **JSONB Preferences**: Flexible user configuration storage
- **Admin Role Support**: Special handling for super_admin users
- **Comprehensive Indexing**: Optimize for common query patterns
- **Audit Trails**: Track all user account changes

### 2. Authentication Token Management

```sql
CREATE TABLE auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_type VARCHAR(20) NOT NULL, -- jwt_refresh, api_key, session
    token_hash VARCHAR(255) NOT NULL,
    token_name VARCHAR(255),
    
    -- Token metadata
    scopes TEXT[] NOT NULL DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    
    -- Security tracking
    created_ip INET,
    last_used_ip INET,
    user_agent TEXT,
    
    -- Status and configuration
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    rate_limit_per_hour INTEGER DEFAULT 1000,
    
    -- Admin token special handling
    bypass_limits BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX idx_auth_tokens_token_hash ON auth_tokens(token_hash);
CREATE INDEX idx_auth_tokens_expires_at ON auth_tokens(expires_at);
CREATE INDEX idx_auth_tokens_bypass_limits ON auth_tokens(bypass_limits);
```

### 3. Credit Management System (No Packages)

**Study Pattern:** `src/conversation/CostOptimizer.ts` - Cost tracking and optimization

```sql
CREATE TABLE credit_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Balance management (6 decimal places for precision)
    current_balance DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    lifetime_purchased DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    lifetime_spent DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    
    -- Spending controls (no packages, only limits)
    daily_limit DECIMAL(10,6),
    monthly_limit DECIMAL(10,6),
    auto_recharge_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    auto_recharge_threshold DECIMAL(10,6) DEFAULT 10.000000,
    auto_recharge_amount DECIMAL(10,6) DEFAULT 50.000000,
    
    -- Admin account special handling
    unlimited_credits BOOLEAN NOT NULL DEFAULT FALSE,
    bypass_billing BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_credit_accounts_user_id ON credit_accounts(user_id);
CREATE INDEX idx_credit_accounts_unlimited ON credit_accounts(unlimited_credits);

-- Create unlimited credit account for admin user
INSERT INTO credit_accounts (
    user_id,
    current_balance,
    unlimited_credits,
    bypass_billing,
    daily_limit,
    monthly_limit
) 
SELECT 
    id,
    999999.999999, -- Large balance for display purposes
    TRUE,          -- Unlimited credits
    TRUE,          -- Bypass all billing
    NULL,          -- No daily limit
    NULL           -- No monthly limit
FROM users 
WHERE email = 'ahiya.butman@gmail.com';

-- Immutable transaction log for audit trail
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    
    transaction_type VARCHAR(20) NOT NULL, -- purchase, usage, refund, adjustment, admin_bypass
    amount DECIMAL(12,6) NOT NULL,
    balance_after DECIMAL(12,6) NOT NULL,
    
    -- Claude API cost details (for transparency)
    claude_cost_usd DECIMAL(12,6), -- Actual Claude API cost
    keen_markup_multiplier DECIMAL(4,2) DEFAULT 5.00, -- 5x markup
    
    -- Reference information
    session_id UUID,
    stripe_payment_intent_id VARCHAR(255),
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    
    -- Admin bypass tracking
    is_admin_bypass BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by_ip INET
);

CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_account_id ON credit_transactions(account_id);
CREATE INDEX idx_credit_transactions_session_id ON credit_transactions(session_id);
CREATE INDEX idx_credit_transactions_admin_bypass ON credit_transactions(is_admin_bypass);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);
```

### 4. Agent Session Management

**Study Pattern:** `src/agent/AgentSession.ts` - Session lifecycle and metrics

```sql
CREATE TABLE agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Session hierarchy for recursive agents
    session_id VARCHAR(64) NOT NULL UNIQUE,
    parent_session_id UUID REFERENCES agent_sessions(id),
    session_depth INTEGER NOT NULL DEFAULT 0,
    git_branch VARCHAR(255) NOT NULL,
    
    -- Execution context
    vision TEXT NOT NULL,
    working_directory TEXT NOT NULL,
    current_phase VARCHAR(20) NOT NULL DEFAULT 'EXPLORE',
    
    -- Timing and metrics
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    iteration_count INTEGER NOT NULL DEFAULT 0,
    tool_calls_count INTEGER NOT NULL DEFAULT 0,
    
    -- Cost tracking (Claude costs + keen markup)
    claude_cost_usd DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    keen_cost_credits DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    context_tokens_used INTEGER NOT NULL DEFAULT 0, -- 1M context tracking
    
    -- File operations
    files_modified TEXT[] DEFAULT '{}',
    files_created TEXT[] DEFAULT '{}',
    files_deleted TEXT[] DEFAULT '{}',
    
    -- Status and results
    execution_status VARCHAR(20) NOT NULL DEFAULT 'running',
    success BOOLEAN,
    error_message TEXT,
    completion_report JSONB,
    
    -- Streaming support
    streaming_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    websocket_connections TEXT[] DEFAULT '{}',
    
    -- Admin session tracking
    is_admin_session BOOLEAN NOT NULL DEFAULT FALSE,
    bypass_credit_deduction BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX idx_agent_sessions_session_id ON agent_sessions(session_id);
CREATE INDEX idx_agent_sessions_parent_session_id ON agent_sessions(parent_session_id);
CREATE INDEX idx_agent_sessions_current_phase ON agent_sessions(current_phase);
CREATE INDEX idx_agent_sessions_is_admin ON agent_sessions(is_admin_session);
CREATE INDEX idx_agent_sessions_start_time ON agent_sessions(start_time);
```

### 5. Real-time Streaming Support

**Study Pattern:** `src/conversation/StreamingManager.ts` - Real-time progress streaming

```sql
CREATE TABLE websocket_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
    
    connection_id VARCHAR(255) NOT NULL UNIQUE,
    client_ip INET NOT NULL,
    user_agent TEXT,
    client_type VARCHAR(50) NOT NULL,
    
    connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_ping_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMP WITH TIME ZONE,
    
    -- Event subscriptions
    subscribed_events TEXT[] DEFAULT '{}',
    session_filters UUID[],
    
    -- Admin connection privileges
    admin_connection BOOLEAN NOT NULL DEFAULT FALSE,
    can_view_all_sessions BOOLEAN NOT NULL DEFAULT FALSE,
    
    connection_status VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE INDEX idx_websocket_connections_user_id ON websocket_connections(user_id);
CREATE INDEX idx_websocket_connections_connection_id ON websocket_connections(connection_id);
CREATE INDEX idx_websocket_connections_admin ON websocket_connections(admin_connection);
```

### 6. Analytics and Reporting Tables

```sql
-- Aggregate analytics for admin dashboard
CREATE TABLE daily_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_bucket DATE NOT NULL,
    
    -- User metrics
    total_users INTEGER NOT NULL DEFAULT 0,
    active_users INTEGER NOT NULL DEFAULT 0,
    new_users INTEGER NOT NULL DEFAULT 0,
    
    -- Session metrics
    total_sessions INTEGER NOT NULL DEFAULT 0,
    successful_sessions INTEGER NOT NULL DEFAULT 0,
    failed_sessions INTEGER NOT NULL DEFAULT 0,
    avg_session_duration_minutes DECIMAL(8,2),
    
    -- Cost and credit metrics
    total_claude_costs_usd DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    total_credit_revenue DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    total_credits_purchased DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    total_credits_used DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
    
    -- Token usage
    total_tokens_consumed BIGINT NOT NULL DEFAULT 0,
    context_tokens_used BIGINT NOT NULL DEFAULT 0, -- 1M context usage
    
    -- Agent metrics
    total_agents_spawned INTEGER NOT NULL DEFAULT 0,
    avg_recursion_depth DECIMAL(4,2),
    max_recursion_depth INTEGER,
    
    -- Admin activity
    admin_sessions INTEGER NOT NULL DEFAULT 0,
    admin_bypass_transactions INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_daily_analytics_date ON daily_analytics(date_bucket);
CREATE INDEX idx_daily_analytics_created_at ON daily_analytics(created_at);
```

## Data Access Layer Implementation

### DatabaseManager Enhancement

**Study Pattern:** `src/database/DatabaseManager.ts`

```typescript
export class KeenDatabaseManager extends DatabaseManager {
  private userPool: Map<string, pg.Pool> = new Map(); // Per-user connection pools
  
  constructor() {
    super();
    this.setupMultiTenantSupport();
  }
  
  private setupMultiTenantSupport(): void {
    // Enable row-level security
    this.enableRowLevelSecurity();
    
    // Setup connection pooling per tenant
    this.setupTenantPooling();
  }
  
  async getUserConnection(userId: string): Promise<DatabaseConnection> {
    // Get user-specific connection with RLS context
    const connection = await this.getConnection();
    
    // Set user context for row-level security
    await connection.execute(
      "SET LOCAL app.current_user_id = $1",
      [userId]
    );
    
    // Check if user is admin for special privileges
    const isAdmin = await this.checkAdminUser(userId);
    if (isAdmin) {
      await connection.execute(
        "SET LOCAL app.is_admin_user = 'true'"
      );
    }
    
    return connection;
  }
  
  private async checkAdminUser(userId: string): Promise<boolean> {
    const result = await this.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [userId]
    );
    
    return result.rows.length > 0 && result.rows[0].is_admin;
  }
  
  async executeUserTransaction<T>(
    userId: string,
    operation: (connection: DatabaseConnection) => Promise<T>
  ): Promise<DatabaseOperationResult<T>> {
    const connection = await this.getUserConnection(userId);
    
    try {
      await connection.beginTransaction();
      const result = await operation(connection);
      await connection.commitTransaction();
      
      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      await connection.rollbackTransaction();
      throw error;
    } finally {
      this.releaseConnection(connection);
    }
  }
}
```

### Row-Level Security Implementation

```sql
-- Enable RLS on all user-sensitive tables
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE websocket_connections ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data (unless admin)
CREATE POLICY user_isolation_policy ON agent_sessions
    FOR ALL TO application_user
    USING (
        user_id = current_setting('app.current_user_id')::UUID OR 
        current_setting('app.is_admin_user', true) = 'true'
    );

CREATE POLICY user_credit_isolation ON credit_accounts
    FOR ALL TO application_user  
    USING (
        user_id = current_setting('app.current_user_id')::UUID OR 
        current_setting('app.is_admin_user', true) = 'true'
    );

CREATE POLICY user_transaction_isolation ON credit_transactions
    FOR ALL TO application_user
    USING (
        user_id = current_setting('app.current_user_id')::UUID OR 
        current_setting('app.is_admin_user', true) = 'true'
    );
```

### Credit Management Implementation (No Packages)

```typescript
export class CreditManager {
  constructor(private dbManager: KeenDatabaseManager) {}
  
  async deductCredits(
    userId: string,
    claudeCostUSD: number,
    sessionId: string,
    description: string
  ): Promise<DatabaseOperationResult<CreditTransaction>> {
    
    // Check if user is admin (unlimited credits)
    const isAdmin = await this.isAdminUser(userId);
    
    if (isAdmin) {
      return this.handleAdminBypass(userId, claudeCostUSD, sessionId, description);
    }
    
    return this.dbManager.executeUserTransaction(userId, async (connection) => {
      // Calculate credit cost (5x markup)
      const creditCost = claudeCostUSD * 5.0;
      
      // Get current balance with row lock
      const accountResult = await connection.query(
        "SELECT * FROM credit_accounts WHERE user_id = $1 FOR UPDATE",
        [userId]
      );
      
      if (accountResult.rows.length === 0) {
        throw new Error('Credit account not found');
      }
      
      const account = accountResult.rows[0];
      if (account.current_balance < creditCost) {
        throw new Error(`Insufficient credits: ${account.current_balance} < ${creditCost}`);
      }
      
      const newBalance = account.current_balance - creditCost;
      
      // Update balance
      await connection.execute(
        `UPDATE credit_accounts 
         SET current_balance = $1, lifetime_spent = lifetime_spent + $2, updated_at = NOW()
         WHERE user_id = $3`,
        [newBalance, creditCost, userId]
      );
      
      // Record transaction
      const transactionResult = await connection.execute(
        `INSERT INTO credit_transactions (
          user_id, account_id, transaction_type, amount, balance_after, 
          claude_cost_usd, keen_markup_multiplier, session_id, description
        ) VALUES ($1, $2, 'usage', $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          userId, account.id, -creditCost, newBalance, 
          claudeCostUSD, 5.0, sessionId, description
        ]
      );
      
      return transactionResult.rows[0];
    });
  }
  
  private async isAdminUser(userId: string): Promise<boolean> {
    const result = await this.dbManager.query(
      `SELECT ca.unlimited_credits, u.is_admin 
       FROM credit_accounts ca 
       JOIN users u ON ca.user_id = u.id 
       WHERE ca.user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) return false;
    
    const row = result.rows[0];
    return row.unlimited_credits || row.is_admin;
  }
  
  private async handleAdminBypass(
    userId: string,
    claudeCostUSD: number,
    sessionId: string,
    description: string
  ): Promise<DatabaseOperationResult<CreditTransaction>> {
    
    return this.dbManager.executeUserTransaction(userId, async (connection) => {
      // Record admin bypass transaction (no actual deduction)
      const transactionResult = await connection.execute(
        `INSERT INTO credit_transactions (
          user_id, account_id, transaction_type, amount, balance_after,
          claude_cost_usd, keen_markup_multiplier, session_id, description,
          is_admin_bypass
        ) 
        SELECT $1, ca.id, 'admin_bypass', 0, ca.current_balance,
               $2, 5.0, $3, $4, TRUE
        FROM credit_accounts ca WHERE ca.user_id = $1
        RETURNING *`,
        [userId, claudeCostUSD, sessionId, `Admin bypass: ${description}`]
      );
      
      Logger.info("Admin credit bypass applied", {
        userId,
        claudeCostUSD,
        sessionId,
        description
      });
      
      return transactionResult.rows[0];
    });
  }
  
  async validateSufficientCredits(
    userId: string,
    requiredClaudeCost: number
  ): Promise<CreditValidationResult> {
    
    // Admin users always have sufficient credits
    if (await this.isAdminUser(userId)) {
      return {
        sufficient: true,
        currentBalance: 999999.999999,
        required: requiredClaudeCost * 5.0,
        isAdmin: true,
        unlimited: true
      };
    }
    
    const result = await this.dbManager.executeUserTransaction(userId, async (connection) => {
      const balanceResult = await connection.query(
        "SELECT current_balance FROM credit_accounts WHERE user_id = $1",
        [userId]
      );
      
      if (balanceResult.rows.length === 0) {
        return { sufficient: false, currentBalance: 0, required: requiredClaudeCost * 5.0 };
      }
      
      const currentBalance = balanceResult.rows[0].current_balance;
      const requiredCredits = requiredClaudeCost * 5.0;
      
      return {
        sufficient: currentBalance >= requiredCredits,
        currentBalance,
        required: requiredCredits,
        shortfall: Math.max(0, requiredCredits - currentBalance),
        claudeCost: requiredClaudeCost,
        markupMultiplier: 5.0
      };
    });
    
    return result.data!;
  }
}
```

### Analytics DAO for Admin Dashboard

```typescript
export class AnalyticsDAO {
  constructor(private dbManager: KeenDatabaseManager) {}
  
  async getAdminAnalytics(
    adminUserId: string,
    timeRange: 'day' | 'week' | 'month' = 'day'
  ): Promise<AdminAnalyticsResult> {
    
    // Verify admin privileges
    const isAdmin = await this.verifyAdminUser(adminUserId);
    if (!isAdmin) {
      throw new Error('Insufficient privileges for analytics access');
    }
    
    const dateCondition = this.getDateCondition(timeRange);
    
    const analytics = await this.dbManager.query(`
      SELECT 
        COUNT(DISTINCT u.id) as total_users,
        COUNT(DISTINCT CASE WHEN u.last_login_at >= NOW() - INTERVAL '24 hours' THEN u.id END) as active_users,
        COUNT(DISTINCT s.id) as total_sessions,
        COUNT(DISTINCT CASE WHEN s.success = true THEN s.id END) as successful_sessions,
        SUM(s.claude_cost_usd) as total_claude_costs,
        SUM(s.keen_cost_credits) as total_credit_revenue,
        SUM(CASE WHEN ct.transaction_type = 'purchase' THEN ct.amount ELSE 0 END) as credits_purchased,
        SUM(CASE WHEN ct.transaction_type = 'usage' THEN ABS(ct.amount) ELSE 0 END) as credits_used,
        SUM(s.tokens_used) as total_tokens,
        SUM(s.context_tokens_used) as context_tokens,
        COUNT(CASE WHEN s.is_admin_session = true THEN 1 END) as admin_sessions,
        COUNT(CASE WHEN ct.is_admin_bypass = true THEN 1 END) as admin_bypasses
      FROM users u
      LEFT JOIN agent_sessions s ON u.id = s.user_id ${dateCondition}
      LEFT JOIN credit_transactions ct ON u.id = ct.user_id ${dateCondition.replace('s.', 'ct.')}
    `);
    
    // Get recursive agent metrics
    const recursionMetrics = await this.dbManager.query(`
      SELECT 
        AVG(session_depth) as avg_recursion_depth,
        MAX(session_depth) as max_recursion_depth,
        COUNT(*) as total_recursive_sessions
      FROM agent_sessions 
      WHERE session_depth > 0 ${dateCondition}
    `);
    
    return {
      userMetrics: analytics.rows[0],
      recursionMetrics: recursionMetrics.rows[0],
      costAnalysis: {
        totalClaudeCosts: analytics.rows[0].total_claude_costs,
        totalCreditRevenue: analytics.rows[0].total_credit_revenue,
        markupEffectiveness: (analytics.rows[0].total_credit_revenue / analytics.rows[0].total_claude_costs) || 0,
        adminBypasses: analytics.rows[0].admin_bypasses
      },
      contextUsage: {
        totalTokens: analytics.rows[0].total_tokens,
        contextTokens: analytics.rows[0].context_tokens,
        contextUtilizationRate: (analytics.rows[0].context_tokens / analytics.rows[0].total_tokens) || 0
      }
    };
  }
  
  private async verifyAdminUser(userId: string): Promise<boolean> {
    const result = await this.dbManager.query(
      `SELECT is_admin, admin_privileges->'view_all_analytics' as analytics_access
       FROM users WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) return false;
    
    const row = result.rows[0];
    return row.is_admin || row.analytics_access === true;
  }
}
```

## Testing Requirements

### Unit Tests

```typescript
describe('KeenDatabaseManager', () => {
  let dbManager: KeenDatabaseManager;
  let adminUserId: string;
  let regularUserId: string;
  
  beforeEach(async () => {
    dbManager = await KeenDatabaseManager.createTestInstance();
    adminUserId = 'admin-user-id'; // ahiya.butman@gmail.com
    regularUserId = await createTestUser();
  });
  
  test('enforces user isolation at database level', async () => {
    // Create sessions for two different users
    const user1Session = await dbManager.createSession(regularUserId, sessionData1);
    const user2Session = await dbManager.createSession(regularUserId2, sessionData2);
    
    // User 1 should only see their own sessions
    const user1Sessions = await dbManager.getUserSessions(regularUserId);
    expect(user1Sessions).toHaveLength(1);
    expect(user1Sessions[0].id).toBe(user1Session.id);
    
    // Admin should see all sessions
    const adminSessions = await dbManager.getUserSessions(adminUserId);
    expect(adminSessions.length).toBeGreaterThanOrEqual(2);
  });
  
  test('admin user bypasses credit deductions', async () => {
    const creditManager = new CreditManager(dbManager);
    
    const result = await creditManager.deductCredits(
      adminUserId,
      10.50, // $10.50 Claude cost
      'test_session',
      'Admin test execution'
    );
    
    expect(result.success).toBe(true);
    expect(result.data.amount).toBe(0); // No deduction
    expect(result.data.is_admin_bypass).toBe(true);
    expect(result.data.claude_cost_usd).toBe(10.50);
  });
  
  test('regular user gets 5x markup on credits', async () => {
    const creditManager = new CreditManager(dbManager);
    await creditManager.addCredits(regularUserId, 100.0);
    
    const claudeCost = 2.00; // $2.00 Claude cost
    const expectedCreditCost = 10.00; // $2.00 * 5 = $10.00
    
    const result = await creditManager.deductCredits(
      regularUserId,
      claudeCost,
      'test_session',
      'Regular user test'
    );
    
    expect(result.success).toBe(true);
    expect(Math.abs(result.data.amount)).toBe(expectedCreditCost);
    expect(result.data.claude_cost_usd).toBe(claudeCost);
    expect(result.data.keen_markup_multiplier).toBe(5.0);
  });
});

describe('CreditManager', () => {
  test('prevents double-spending with concurrent transactions', async () => {
    const creditManager = new CreditManager(dbManager);
    await creditManager.addCredits(regularUserId, 10.0);
    
    // Attempt two concurrent deductions that would exceed balance
    const claudeCost1 = 1.50; // = 7.50 credits
    const claudeCost2 = 1.00; // = 5.00 credits
    // Total = 12.50 credits, but user only has 10.0
    
    const deduction1 = creditManager.deductCredits(regularUserId, claudeCost1, 'session1', 'test');
    const deduction2 = creditManager.deductCredits(regularUserId, claudeCost2, 'session2', 'test');
    
    const results = await Promise.allSettled([deduction1, deduction2]);
    
    // One should succeed, one should fail
    const successes = results.filter(r => r.status === 'fulfilled').length;
    expect(successes).toBe(1);
  });
});
```

### Integration Tests

```typescript
describe('Database Integration', () => {
  test('complete admin session lifecycle with bypass', async () => {
    // 1. Create admin session
    const session = await sessionDAO.createSession(adminUserId, {
      sessionId: 'admin_session_123',
      vision: 'Admin test execution',
      workingDirectory: '/tmp/admin_test',
      gitBranch: 'main'
    });
    
    expect(session.is_admin_session).toBe(true);
    expect(session.bypass_credit_deduction).toBe(true);
    
    // 2. Execute with high cost (would normally require many credits)
    const highClaudeCost = 50.00; // $50 Claude cost = $250 in credits
    
    await sessionDAO.completeSession(adminUserId, session.sessionId, {
      success: true,
      claudeCost: highClaudeCost,
      creditCost: 0, // Should be 0 for admin
      filesCreated: ['src/admin_test.ts'],
      completionReport: { summary: 'Admin test completed successfully' }
    });
    
    // 3. Verify no credit deduction
    const balance = await creditManager.getBalance(adminUserId);
    expect(balance.unlimited_credits).toBe(true);
    
    // 4. Verify transaction logged as admin bypass
    const transactions = await creditManager.getTransactionHistory(adminUserId);
    const bypassTransaction = transactions.find(t => t.is_admin_bypass);
    expect(bypassTransaction).toBeDefined();
    expect(bypassTransaction.claude_cost_usd).toBe(highClaudeCost);
  });
  
  test('analytics accessible only to admin users', async () => {
    const analyticsDAO = new AnalyticsDAO(dbManager);
    
    // Admin should access analytics
    const adminAnalytics = await analyticsDAO.getAdminAnalytics(adminUserId);
    expect(adminAnalytics.userMetrics).toBeDefined();
    expect(adminAnalytics.costAnalysis).toBeDefined();
    
    // Regular user should be denied
    await expect(
      analyticsDAO.getAdminAnalytics(regularUserId)
    ).rejects.toThrow('Insufficient privileges');
  });
});
```

## Performance Optimization

### Connection Pooling

```typescript
// PostgreSQL connection pool configuration
const poolConfig = {
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  
  // Pool configuration
  max: 100,                    // Maximum connections
  min: 10,                     // Minimum connections
  acquireTimeoutMillis: 30000, // 30 seconds
  idleTimeoutMillis: 600000,   // 10 minutes
  
  // Performance settings
  statement_timeout: 300000,   // 5 minutes
  query_timeout: 60000,        // 1 minute
  connectionTimeoutMillis: 10000, // 10 seconds
};
```

### Query Optimization

```sql
-- Materialized view for admin dashboard metrics
CREATE MATERIALIZED VIEW admin_dashboard_metrics AS
SELECT 
    DATE_TRUNC('hour', s.start_time) as hour_bucket,
    COUNT(*) as sessions_started,
    COUNT(*) FILTER (WHERE s.success = true) as sessions_completed,
    AVG(s.keen_cost_credits) as avg_credit_cost_per_session,
    SUM(s.tokens_used) as total_tokens,
    SUM(s.context_tokens_used) as total_context_tokens,
    COUNT(*) FILTER (WHERE s.is_admin_session = true) as admin_sessions,
    SUM(s.claude_cost_usd) as total_claude_costs,
    AVG(s.session_depth) as avg_recursion_depth
FROM agent_sessions s
WHERE s.start_time >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', s.start_time)
ORDER BY hour_bucket;

-- Refresh every 5 minutes
CREATE UNIQUE INDEX idx_admin_dashboard_metrics_hour ON admin_dashboard_metrics(hour_bucket);
```

## Integration Points

**This database layer must integrate with:**
- **Phase 2 (API Gateway)**: Provide user authentication, credit validation, and admin privilege checking
- **Phase 3 (Agent Core)**: Store session state and progress tracking with admin bypass
- **Phase 4 (WebSockets)**: Support real-time connection management with admin monitoring
- **Phase 5 (Dashboard)**: Provide analytics and reporting data with admin-only access

## Deliverables

1. **Complete PostgreSQL schema** with all tables, indexes, and admin user setup
2. **Database manager** with multi-tenant connection pooling and admin privilege handling
3. **Data access layer** with comprehensive CRUD operations and admin bypasses
4. **Credit management** with atomic transactions, 5x markup, and admin unlimited credits
5. **Session persistence** supporting recursive hierarchies and admin session tracking
6. **Analytics system** with admin-only access to comprehensive platform metrics
7. **Migration system** for schema evolution
8. **Comprehensive test suite** with 80%+ coverage including admin scenarios
9. **Performance benchmarks** and optimization guides
10. **Integration interfaces** for other phases with admin privilege propagation

**Remember:** This database layer is the foundation for everything in keen. User isolation, credit integrity with 5x markup, admin privileges, and data consistency are absolutely critical - there's no room for errors in financial transactions, user data leakage, or admin access controls.
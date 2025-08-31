# Phase 1: Database Layer Implementation

## Mission

Implement keen's **multi-tenant database layer** with complete PostgreSQL schema, data access layer, and comprehensive analytics. This phase creates the foundation for user isolation, credit management, session persistence, and real-time streaming.

## Success Criteria

- [ ] **PostgreSQL schema** fully implemented with all tables and relationships
- [ ] **Multi-tenant isolation** enforced at database level with row-level security
- [ ] **Credit management system** with atomic transactions and audit trails
- [ ] **Session persistence** supporting recursive agent hierarchies
- [ ] **Real-time streaming** support with WebSocket connection tracking
- [ ] **Analytics and reporting** with comprehensive metrics collection
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
    
    -- Subscription and billing
    subscription_tier VARCHAR(20) NOT NULL DEFAULT 'individual',
    subscription_status VARCHAR(20) NOT NULL DEFAULT 'active',
    billing_customer_id VARCHAR(255),
    
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
CREATE INDEX idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX idx_users_created_at ON users(created_at);
```

**Implementation Requirements:**
- **UUID Primary Keys**: Prevent enumeration attacks
- **JSONB Preferences**: Flexible user configuration storage
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
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX idx_auth_tokens_token_hash ON auth_tokens(token_hash);
CREATE INDEX idx_auth_tokens_expires_at ON auth_tokens(expires_at);
```

### 3. Credit Management System

**Study Pattern:** `src/conversation/CostOptimizer.ts` - Cost tracking and optimization

```sql
CREATE TABLE credit_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Balance management (4 decimal places for precision)
    current_balance DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    lifetime_purchased DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    lifetime_spent DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    
    -- Spending controls
    daily_limit DECIMAL(10,4),
    monthly_limit DECIMAL(10,4),
    auto_recharge_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    auto_recharge_threshold DECIMAL(10,4) DEFAULT 10.0000,
    auto_recharge_amount DECIMAL(10,4) DEFAULT 50.0000,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_credit_accounts_user_id ON credit_accounts(user_id);

-- Immutable transaction log for audit trail
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    
    transaction_type VARCHAR(20) NOT NULL, -- purchase, usage, refund, adjustment
    amount DECIMAL(12,4) NOT NULL,
    balance_after DECIMAL(12,4) NOT NULL,
    
    -- Reference information
    session_id UUID,
    stripe_payment_intent_id VARCHAR(255),
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by_ip INET
);

CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_account_id ON credit_transactions(account_id);
CREATE INDEX idx_credit_transactions_session_id ON credit_transactions(session_id);
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
    total_cost DECIMAL(10,6) NOT NULL DEFAULT 0.000000,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    
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
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX idx_agent_sessions_session_id ON agent_sessions(session_id);
CREATE INDEX idx_agent_sessions_parent_session_id ON agent_sessions(parent_session_id);
CREATE INDEX idx_agent_sessions_current_phase ON agent_sessions(current_phase);
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
    
    connection_status VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE INDEX idx_websocket_connections_user_id ON websocket_connections(user_id);
CREATE INDEX idx_websocket_connections_connection_id ON websocket_connections(connection_id);
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
    
    return connection;
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

-- Users can only see their own data
CREATE POLICY user_isolation_policy ON agent_sessions
    FOR ALL TO application_user
    USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY user_credit_isolation ON credit_accounts
    FOR ALL TO application_user  
    USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY user_transaction_isolation ON credit_transactions
    FOR ALL TO application_user
    USING (user_id = current_setting('app.current_user_id')::UUID);
```

### DAO Implementation

**Study Pattern:** `src/database/ConversationDAO.ts`

```typescript
export class KeenSessionDAO {
  constructor(private dbManager: KeenDatabaseManager) {}
  
  async createSession(
    userId: string,
    sessionData: CreateSessionRequest
  ): Promise<DatabaseOperationResult<AgentSession>> {
    return this.dbManager.executeUserTransaction(userId, async (connection) => {
      // Insert session record
      const sessionResult = await connection.execute(
        `INSERT INTO agent_sessions (
          user_id, session_id, vision, working_directory, git_branch
        ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          userId,
          sessionData.sessionId,
          sessionData.vision,
          sessionData.workingDirectory,
          sessionData.gitBranch
        ]
      );
      
      // Update user statistics
      await connection.execute(
        `INSERT INTO daily_usage_stats (user_id, date_bucket, sessions_started)
         VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (user_id, date_bucket) 
         DO UPDATE SET sessions_started = daily_usage_stats.sessions_started + 1`,
        [userId]
      );
      
      return sessionResult.rows[0];
    });
  }
  
  async getSessionHierarchy(
    userId: string,
    sessionId: string
  ): Promise<DatabaseOperationResult<SessionHierarchy>> {
    return this.dbManager.executeUserTransaction(userId, async (connection) => {
      // Get session with all children (recursive)
      const result = await connection.query(
        `WITH RECURSIVE session_tree AS (
          -- Base case: main session
          SELECT id, session_id, parent_session_id, git_branch, 
                 current_phase, execution_status, 0 as depth
          FROM agent_sessions 
          WHERE session_id = $1 AND user_id = $2
          
          UNION ALL
          
          -- Recursive case: child sessions
          SELECT s.id, s.session_id, s.parent_session_id, s.git_branch,
                 s.current_phase, s.execution_status, st.depth + 1
          FROM agent_sessions s
          INNER JOIN session_tree st ON s.parent_session_id = st.id
        )
        SELECT * FROM session_tree ORDER BY depth, git_branch`,
        [sessionId, userId]
      );
      
      return this.buildHierarchyTree(result.rows);
    });
  }
}
```

### Credit Management Implementation

```typescript
export class CreditManager {
  constructor(private dbManager: KeenDatabaseManager) {}
  
  async deductCredits(
    userId: string,
    amount: number,
    sessionId: string,
    description: string
  ): Promise<DatabaseOperationResult<CreditTransaction>> {
    return this.dbManager.executeUserTransaction(userId, async (connection) => {
      // Get current balance with row lock
      const accountResult = await connection.query(
        "SELECT * FROM credit_accounts WHERE user_id = $1 FOR UPDATE",
        [userId]
      );
      
      if (accountResult.rows.length === 0) {
        throw new Error('Credit account not found');
      }
      
      const account = accountResult.rows[0];
      if (account.current_balance < amount) {
        throw new Error(`Insufficient credits: ${account.current_balance} < ${amount}`);
      }
      
      const newBalance = account.current_balance - amount;
      
      // Update balance
      await connection.execute(
        `UPDATE credit_accounts 
         SET current_balance = $1, lifetime_spent = lifetime_spent + $2, updated_at = NOW()
         WHERE user_id = $3`,
        [newBalance, amount, userId]
      );
      
      // Record transaction
      const transactionResult = await connection.execute(
        `INSERT INTO credit_transactions (
          user_id, account_id, transaction_type, amount, balance_after, 
          session_id, description
        ) VALUES ($1, $2, 'usage', $3, $4, $5, $6) RETURNING *`,
        [userId, account.id, -amount, newBalance, sessionId, description]
      );
      
      return transactionResult.rows[0];
    });
  }
  
  async validateSufficientCredits(
    userId: string,
    requiredAmount: number
  ): Promise<CreditValidationResult> {
    const result = await this.dbManager.executeUserTransaction(userId, async (connection) => {
      const balanceResult = await connection.query(
        "SELECT current_balance FROM credit_accounts WHERE user_id = $1",
        [userId]
      );
      
      if (balanceResult.rows.length === 0) {
        return { sufficient: false, currentBalance: 0, required: requiredAmount };
      }
      
      const currentBalance = balanceResult.rows[0].current_balance;
      
      return {
        sufficient: currentBalance >= requiredAmount,
        currentBalance,
        required: requiredAmount,
        shortfall: Math.max(0, requiredAmount - currentBalance)
      };
    });
    
    return result.data!;
  }
}
```

## Testing Requirements

### Unit Tests

```typescript
describe('KeenDatabaseManager', () => {
  let dbManager: KeenDatabaseManager;
  let testUserId: string;
  
  beforeEach(async () => {
    dbManager = await KeenDatabaseManager.createTestInstance();
    testUserId = await createTestUser();
  });
  
  test('enforces user isolation at database level', async () => {
    // Create sessions for two different users
    const user1Session = await dbManager.createSession(testUserId, sessionData1);
    const user2Session = await dbManager.createSession(testUserId2, sessionData2);
    
    // User 1 should only see their own sessions
    const user1Sessions = await dbManager.getUserSessions(testUserId);
    expect(user1Sessions).toHaveLength(1);
    expect(user1Sessions[0].id).toBe(user1Session.id);
    
    // User 2 should only see their own sessions
    const user2Sessions = await dbManager.getUserSessions(testUserId2);
    expect(user2Sessions).toHaveLength(1);
    expect(user2Sessions[0].id).toBe(user2Session.id);
  });
});

describe('CreditManager', () => {
  test('prevents double-spending with concurrent transactions', async () => {
    const creditManager = new CreditManager(dbManager);
    await creditManager.addCredits(testUserId, 10.0);
    
    // Attempt two concurrent $8 deductions (should fail one)
    const deduction1 = creditManager.deductCredits(testUserId, 8.0, 'session1', 'test');
    const deduction2 = creditManager.deductCredits(testUserId, 8.0, 'session2', 'test');
    
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
  test('complete session lifecycle with credit tracking', async () => {
    // 1. Create user with credits
    const userId = await createTestUser();
    await creditManager.addCredits(userId, 25.0);
    
    // 2. Create session
    const session = await sessionDAO.createSession(userId, {
      sessionId: 'test_session_123',
      vision: 'Test agent execution',
      workingDirectory: '/tmp/test',
      gitBranch: 'main'
    });
    
    // 3. Track progress
    await sessionDAO.updateSessionProgress(userId, session.sessionId, {
      phase: 'EXPLORE',
      progress: 0.5,
      tokensUsed: 15000
    });
    
    // 4. Complete session with cost
    await sessionDAO.completeSession(userId, session.sessionId, {
      success: true,
      totalCost: 3.75,
      filesCreated: ['src/test.ts'],
      completionReport: { summary: 'Test completed successfully' }
    });
    
    // 5. Verify credit deduction
    const balance = await creditManager.getBalance(userId);
    expect(balance.currentBalance).toBe(21.25); // 25.0 - 3.75
    
    // 6. Verify session persistence
    const savedSession = await sessionDAO.getSession(userId, session.sessionId);
    expect(savedSession.executionStatus).toBe('completed');
    expect(savedSession.totalCost).toBe(3.75);
  });
});
```

## Database Migrations

### Migration System

```typescript
export class MigrationManager {
  private migrations: Migration[] = [
    new CreateUserTables_001(),
    new CreateAuthTables_002(),
    new CreateCreditTables_003(),
    new CreateSessionTables_004(),
    new CreateStreamingTables_005(),
    new AddRowLevelSecurity_006()
  ];
  
  async runMigrations(): Promise<void> {
    for (const migration of this.migrations) {
      await this.runMigration(migration);
    }
  }
  
  private async runMigration(migration: Migration): Promise<void> {
    const connection = await this.dbManager.getConnection();
    
    try {
      // Check if migration already run
      const exists = await connection.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [migration.version]
      );
      
      if (exists.rows.length > 0) {
        Logger.info(`Migration ${migration.version} already applied`);
        return;
      }
      
      await connection.beginTransaction();
      
      // Run migration
      await migration.up(connection);
      
      // Record migration
      await connection.execute(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, NOW())",
        [migration.version, migration.name]
      );
      
      await connection.commitTransaction();
      
      Logger.info(`Migration ${migration.version} applied successfully`);
    } catch (error) {
      await connection.rollbackTransaction();
      throw error;
    } finally {
      this.dbManager.releaseConnection(connection);
    }
  }
}
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
  min: 10,                     # Minimum connections
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
-- Materialized view for dashboard metrics
CREATE MATERIALIZED VIEW dashboard_metrics AS
SELECT 
    DATE_TRUNC('hour', s.start_time) as hour_bucket,
    COUNT(*) as sessions_started,
    COUNT(*) FILTER (WHERE s.success = true) as sessions_completed,
    AVG(s.total_cost) as avg_cost_per_session,
    SUM(s.tokens_used) as total_tokens
FROM agent_sessions s
WHERE s.start_time >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', s.start_time)
ORDER BY hour_bucket;

-- Refresh every 5 minutes
CREATE UNIQUE INDEX idx_dashboard_metrics_hour ON dashboard_metrics(hour_bucket);
```

## Integration Points

**This database layer must integrate with:**
- **Phase 2 (API Gateway)**: Provide user authentication and credit validation
- **Phase 3 (Agent Core)**: Store session state and progress tracking
- **Phase 4 (WebSockets)**: Support real-time connection management
- **Phase 5 (Dashboard)**: Provide analytics and reporting data

## Deliverables

1. **Complete PostgreSQL schema** with all tables and indexes
2. **Database manager** with multi-tenant connection pooling
3. **Data access layer** with comprehensive CRUD operations
4. **Credit management** with atomic transactions
5. **Session persistence** supporting recursive hierarchies
6. **Migration system** for schema evolution
7. **Comprehensive test suite** with 80%+ coverage
8. **Performance benchmarks** and optimization guides
9. **Documentation** with API references and examples
10. **Integration interfaces** for other phases

**Remember:** This database layer is the foundation for everything in keen. User isolation, credit integrity, and data consistency are absolutely critical - there's no room for errors in financial transactions or user data leakage.
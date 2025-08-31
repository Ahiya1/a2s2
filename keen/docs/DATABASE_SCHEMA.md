# keen Database Schema Design

## Overview

keen's database schema is designed for **multi-tenant isolation**, **real-time streaming**, **comprehensive analytics**, and **scalable performance**. The schema supports the recursive agent architecture while maintaining complete user isolation and audit trails.

## Database Technology: PostgreSQL

**Why PostgreSQL:**
- **JSON Support** - Native JSONB for flexible agent metadata and configuration storage
- **Scalability** - Proven performance for multi-tenant SaaS applications
- **ACID Compliance** - Critical for credit transactions and billing integrity
- **Advanced Features** - Row-level security, table partitioning, and full-text search
- **Extensions** - PostGIS for future location features, pg_stat_statements for performance

## Core Tables

### Users Management

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- bcrypt hash
    display_name VARCHAR(255),
    avatar_url TEXT,
    
    -- Subscription and billing
    subscription_tier VARCHAR(20) NOT NULL DEFAULT 'individual', -- individual, team, enterprise
    subscription_status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, suspended, cancelled
    billing_customer_id VARCHAR(255), -- Stripe customer ID
    
    -- Account status and verification
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    account_status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, suspended, banned
    
    -- Multi-factor authentication
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret VARCHAR(255), -- TOTP secret
    recovery_codes TEXT[], -- Array of backup codes
    
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

**Design Decisions:**
- **UUID Primary Keys** - Prevent enumeration attacks and enable distributed ID generation
- **JSONB Preferences** - Flexible storage for user preferences without schema changes
- **Comprehensive Audit Trail** - Track login patterns and account changes
- **Built-in MFA Support** - Native support for two-factor authentication

### Authentication Tokens

```sql
CREATE TABLE auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_type VARCHAR(20) NOT NULL, -- jwt_refresh, api_key, session
    token_hash VARCHAR(255) NOT NULL, -- SHA-256 hash of actual token
    token_name VARCHAR(255), -- User-friendly name for API keys
    
    -- Token metadata
    scopes TEXT[] NOT NULL DEFAULT '{}', -- Array of permission scopes
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
CREATE INDEX idx_auth_tokens_token_type ON auth_tokens(token_type);
```

**Design Decisions:**
- **Token Hashing** - Store SHA-256 hashes, never plaintext tokens
- **Flexible Scopes** - Array-based permission system for fine-grained access control
- **Rate Limiting** - Per-token rate limits for abuse prevention
- **Security Metadata** - Track IP addresses and user agents for security analysis

### Credit Management

```sql
CREATE TABLE credit_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Balance management
    current_balance DECIMAL(12,4) NOT NULL DEFAULT 0.0000, -- 4 decimal places for precise accounting
    lifetime_purchased DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    lifetime_spent DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    
    -- Spending limits and controls
    daily_limit DECIMAL(10,4),
    monthly_limit DECIMAL(10,4),
    auto_recharge_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    auto_recharge_threshold DECIMAL(10,4) DEFAULT 10.0000,
    auto_recharge_amount DECIMAL(10,4) DEFAULT 50.0000,
    
    -- Account status
    account_status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, suspended, closed
    suspended_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_credit_accounts_user_id ON credit_accounts(user_id);
CREATE INDEX idx_credit_accounts_current_balance ON credit_accounts(current_balance);
```

```sql
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    
    -- Transaction details
    transaction_type VARCHAR(20) NOT NULL, -- purchase, usage, refund, adjustment
    amount DECIMAL(12,4) NOT NULL, -- Positive for credits, negative for usage
    balance_after DECIMAL(12,4) NOT NULL, -- Balance after this transaction
    
    -- Reference information
    session_id UUID REFERENCES agent_sessions(id), -- Link to agent session if usage
    stripe_payment_intent_id VARCHAR(255), -- Stripe reference for purchases
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    
    -- Audit and security
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by_ip INET,
    reconciliation_status VARCHAR(20) DEFAULT 'pending' -- pending, reconciled, disputed
);

CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_account_id ON credit_transactions(account_id);
CREATE INDEX idx_credit_transactions_session_id ON credit_transactions(session_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(transaction_type);
```

**Design Decisions:**
- **Decimal Precision** - Use DECIMAL(12,4) for precise financial calculations
- **Immutable Transactions** - Never update transactions, only insert for audit trail
- **Balance Snapshots** - Store balance_after in each transaction for easy reconciliation
- **Flexible Metadata** - JSONB for storing additional transaction context

### Agent Sessions

```sql
CREATE TABLE agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Session identification and hierarchy
    session_id VARCHAR(64) NOT NULL UNIQUE, -- Human-readable session ID
    parent_session_id UUID REFERENCES agent_sessions(id), -- For recursive agents
    session_depth INTEGER NOT NULL DEFAULT 0, -- Depth in agent hierarchy
    git_branch VARCHAR(255) NOT NULL, -- Git branch for this agent
    
    -- Execution context
    vision TEXT NOT NULL, -- Original user vision/instructions
    working_directory TEXT NOT NULL,
    current_phase VARCHAR(20) NOT NULL DEFAULT 'EXPLORE', -- EXPLORE, PLAN, SUMMON, COMPLETE
    
    -- Execution timing
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    phase_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Execution metrics
    iteration_count INTEGER NOT NULL DEFAULT 0,
    tool_calls_count INTEGER NOT NULL DEFAULT 0,
    total_cost DECIMAL(10,6) NOT NULL DEFAULT 0.000000, -- Higher precision for cost tracking
    tokens_used INTEGER NOT NULL DEFAULT 0,
    context_window_size INTEGER NOT NULL DEFAULT 1000000, -- 1M tokens
    
    -- File operations tracking
    files_modified TEXT[] DEFAULT '{}',
    files_created TEXT[] DEFAULT '{}',
    files_deleted TEXT[] DEFAULT '{}',
    
    -- Status and results
    execution_status VARCHAR(20) NOT NULL DEFAULT 'running', -- running, completed, failed, cancelled
    success BOOLEAN,
    error_message TEXT,
    completion_report JSONB,
    
    -- Streaming and real-time features
    streaming_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    streaming_time INTEGER, -- Milliseconds spent streaming
    websocket_connections TEXT[], -- Array of active WebSocket connection IDs
    
    -- Configuration and options
    agent_options JSONB DEFAULT '{}', -- Store AgentSessionOptions
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX idx_agent_sessions_session_id ON agent_sessions(session_id);
CREATE INDEX idx_agent_sessions_parent_session_id ON agent_sessions(parent_session_id);
CREATE INDEX idx_agent_sessions_current_phase ON agent_sessions(current_phase);
CREATE INDEX idx_agent_sessions_execution_status ON agent_sessions(execution_status);
CREATE INDEX idx_agent_sessions_start_time ON agent_sessions(start_time);
CREATE INDEX idx_agent_sessions_git_branch ON agent_sessions(git_branch);
```

**Design Decisions:**
- **Hierarchical Sessions** - Support recursive agent spawning with parent/child relationships
- **Git Integration** - Track git branch for each agent session
- **Comprehensive Metrics** - Detailed tracking for billing and analytics
- **Real-time Support** - WebSocket connection tracking for live updates
- **Flexible Options** - JSONB storage for agent configuration

### Phase Transitions

```sql
CREATE TABLE phase_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Transition details
    from_phase VARCHAR(20) NOT NULL,
    to_phase VARCHAR(20) NOT NULL,
    transition_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    duration_ms INTEGER, -- Duration spent in from_phase
    
    -- Phase report data
    summary TEXT NOT NULL,
    key_findings TEXT[] DEFAULT '{}',
    next_actions TEXT[] DEFAULT '{}',
    confidence DECIMAL(3,2), -- 0.00 to 1.00
    estimated_time_remaining VARCHAR(255),
    
    -- Context and metadata
    phase_metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_phase_transitions_session_id ON phase_transitions(session_id);
CREATE INDEX idx_phase_transitions_user_id ON phase_transitions(user_id);
CREATE INDEX idx_phase_transitions_timestamp ON phase_transitions(transition_timestamp);
CREATE INDEX idx_phase_transitions_from_to ON phase_transitions(from_phase, to_phase);
```

### Tool Executions

```sql
CREATE TABLE tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Tool execution details
    tool_name VARCHAR(100) NOT NULL,
    tool_parameters JSONB NOT NULL DEFAULT '{}',
    execution_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Results and performance
    execution_time_ms INTEGER NOT NULL,
    success BOOLEAN NOT NULL,
    result_data JSONB,
    error_message TEXT,
    
    -- Resource usage
    tokens_consumed INTEGER DEFAULT 0,
    cost DECIMAL(10,6) DEFAULT 0.000000,
    
    -- Context and metadata
    execution_context JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_executions_session_id ON tool_executions(session_id);
CREATE INDEX idx_tool_executions_user_id ON tool_executions(user_id);
CREATE INDEX idx_tool_executions_tool_name ON tool_executions(tool_name);
CREATE INDEX idx_tool_executions_timestamp ON tool_executions(execution_timestamp);
CREATE INDEX idx_tool_executions_success ON tool_executions(success);
```

### Git Operations

```sql
CREATE TABLE git_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Git operation details
    operation_type VARCHAR(20) NOT NULL, -- commit, branch, merge, push, pull, clone
    branch_name VARCHAR(255) NOT NULL,
    commit_hash VARCHAR(64),
    operation_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Operation metadata
    commit_message TEXT,
    files_changed TEXT[] DEFAULT '{}',
    lines_added INTEGER DEFAULT 0,
    lines_deleted INTEGER DEFAULT 0,
    merge_conflicts JSONB, -- Details of any merge conflicts
    
    -- Results and status
    success BOOLEAN NOT NULL,
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_git_operations_session_id ON git_operations(session_id);
CREATE INDEX idx_git_operations_user_id ON git_operations(user_id);
CREATE INDEX idx_git_operations_branch_name ON git_operations(branch_name);
CREATE INDEX idx_git_operations_operation_type ON git_operations(operation_type);
CREATE INDEX idx_git_operations_timestamp ON git_operations(operation_timestamp);
```

## Real-time Streaming Tables

### WebSocket Connections

```sql
CREATE TABLE websocket_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
    
    -- Connection details
    connection_id VARCHAR(255) NOT NULL UNIQUE,
    client_ip INET NOT NULL,
    user_agent TEXT,
    client_type VARCHAR(50) NOT NULL, -- dashboard, cli, mobile, api
    
    -- Connection lifecycle
    connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_ping_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMP WITH TIME ZONE,
    
    -- Subscription filters
    subscribed_events TEXT[] DEFAULT '{}', -- Types of events this connection wants
    session_filters UUID[], -- Specific sessions to monitor
    
    -- Status
    connection_status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, inactive, closed
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_websocket_connections_user_id ON websocket_connections(user_id);
CREATE INDEX idx_websocket_connections_connection_id ON websocket_connections(connection_id);
CREATE INDEX idx_websocket_connections_session_id ON websocket_connections(session_id);
CREATE INDEX idx_websocket_connections_status ON websocket_connections(connection_status);
```

### Streaming Events

```sql
CREATE TABLE streaming_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Event details
    event_type VARCHAR(50) NOT NULL, -- phase_change, git_operation, tool_execution, progress_update, error
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Event data
    event_data JSONB NOT NULL DEFAULT '{}',
    event_source VARCHAR(50) NOT NULL, -- agent, git, tool, system
    
    -- Delivery tracking
    delivered_to TEXT[] DEFAULT '{}', -- Array of connection IDs that received this event
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_streaming_events_session_id ON streaming_events(session_id);
CREATE INDEX idx_streaming_events_user_id ON streaming_events(user_id);
CREATE INDEX idx_streaming_events_type ON streaming_events(event_type);
CREATE INDEX idx_streaming_events_timestamp ON streaming_events(event_timestamp);
```

## Analytics and Reporting Tables

### Usage Analytics

```sql
CREATE TABLE daily_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date_bucket DATE NOT NULL,
    
    -- Session statistics
    sessions_started INTEGER NOT NULL DEFAULT 0,
    sessions_completed INTEGER NOT NULL DEFAULT 0,
    sessions_failed INTEGER NOT NULL DEFAULT 0,
    total_session_time_seconds INTEGER NOT NULL DEFAULT 0,
    
    -- Agent statistics
    agents_spawned INTEGER NOT NULL DEFAULT 0,
    max_recursion_depth INTEGER NOT NULL DEFAULT 0,
    
    -- Tool usage
    tool_executions INTEGER NOT NULL DEFAULT 0,
    unique_tools_used TEXT[] DEFAULT '{}',
    
    -- Resource usage
    total_tokens_consumed INTEGER NOT NULL DEFAULT 0,
    total_cost DECIMAL(10,6) NOT NULL DEFAULT 0.000000,
    files_modified INTEGER NOT NULL DEFAULT 0,
    files_created INTEGER NOT NULL DEFAULT 0,
    git_operations INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_daily_usage_stats_user_date ON daily_usage_stats(user_id, date_bucket);
CREATE INDEX idx_daily_usage_stats_date ON daily_usage_stats(date_bucket);
```

### System Metrics

```sql
CREATE TABLE system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Active connections and sessions
    active_users INTEGER NOT NULL,
    active_sessions INTEGER NOT NULL,
    active_websocket_connections INTEGER NOT NULL,
    
    -- Performance metrics
    avg_response_time_ms DECIMAL(8,2) NOT NULL,
    error_rate DECIMAL(5,4) NOT NULL, -- 0.0000 to 1.0000
    
    -- Resource utilization
    cpu_usage_percent DECIMAL(5,2),
    memory_usage_percent DECIMAL(5,2),
    database_connections INTEGER,
    
    -- Business metrics
    credits_purchased_today DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    credits_consumed_today DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_metrics_timestamp ON system_metrics(metric_timestamp);
```

## Data Retention and Partitioning

### Table Partitioning

```sql
-- Partition streaming_events by month for performance
CREATE TABLE streaming_events_y2024m01 PARTITION OF streaming_events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE streaming_events_y2024m02 PARTITION OF streaming_events
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Add partitions for each month as needed
```

### Data Retention Policies

```sql
-- Automated cleanup job (run daily)
DELETE FROM streaming_events 
WHERE created_at < NOW() - INTERVAL '30 days';

DELETE FROM websocket_connections 
WHERE disconnected_at IS NOT NULL 
AND disconnected_at < NOW() - INTERVAL '7 days';

DELETE FROM system_metrics 
WHERE metric_timestamp < NOW() - INTERVAL '90 days';
```

## Security Features

### Row Level Security

```sql
-- Enable RLS on user-sensitive tables
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY user_isolation_policy ON agent_sessions
    FOR ALL TO application_user
    USING (user_id = current_setting('app.current_user_id')::UUID);
```

### Audit Triggers

```sql
CREATE OR REPLACE FUNCTION audit_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the updated_at timestamp
    NEW.updated_at = NOW();
    
    -- Log sensitive changes
    IF TG_TABLE_NAME = 'users' AND OLD.email != NEW.email THEN
        INSERT INTO audit_log (table_name, record_id, action, old_values, new_values)
        VALUES (TG_TABLE_NAME, NEW.id, 'email_change', 
                json_build_object('old_email', OLD.email),
                json_build_object('new_email', NEW.email));
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_users_changes
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION audit_changes();
```

## Database Performance Optimization

### Connection Pooling Configuration

```sql
-- PostgreSQL configuration
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 16MB
maintenance_work_mem = 256MB
```

### Indexing Strategy

1. **Primary Keys** - All tables use UUID primary keys with btree indexes
2. **Foreign Keys** - Indexed for join performance
3. **Query Patterns** - Indexes match common query patterns (user_id, timestamp ranges)
4. **Composite Indexes** - Multi-column indexes for complex queries
5. **Partial Indexes** - For filtered queries (e.g., active sessions only)

### Query Optimization

```sql
-- Example: Optimized query for dashboard metrics
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

-- Refresh materialized view every 5 minutes
CREATE UNIQUE INDEX idx_dashboard_metrics_hour ON dashboard_metrics(hour_bucket);
```

## Migration Strategy

The database schema is designed for zero-downtime migrations:

1. **Additive Changes** - New columns added with defaults
2. **Backward Compatibility** - Old columns deprecated before removal
3. **Index Management** - Concurrent index creation
4. **Data Migration** - Batched updates for large tables
5. **Rollback Support** - All migrations are reversible

This schema design ensures keen can scale to support thousands of users with millions of agent executions while maintaining performance, security, and data integrity.
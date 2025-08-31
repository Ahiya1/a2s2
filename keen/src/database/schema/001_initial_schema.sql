-- keen Platform Database Schema - Phase 1
-- Multi-tenant PostgreSQL architecture with admin privileges
-- Implements comprehensive user management, credit system, and session tracking

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Users Management Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- bcrypt hash
    display_name VARCHAR(255),
    
    -- Admin and role management
    role VARCHAR(20) NOT NULL DEFAULT 'user', -- user, admin, super_admin
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    admin_privileges JSONB DEFAULT '{}', -- Special privileges for admin user
    
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

-- Authentication Tokens Table
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

-- Credit Accounts Table
CREATE TABLE credit_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Balance management (4 decimal places for precise accounting)
    current_balance DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    lifetime_purchased DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    lifetime_spent DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    
    -- Admin unlimited credits flag
    unlimited_credits BOOLEAN NOT NULL DEFAULT FALSE,
    
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

-- Credit Transactions Table (Immutable audit trail)
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    
    -- Transaction details
    transaction_type VARCHAR(20) NOT NULL, -- purchase, usage, refund, adjustment, admin_bypass
    amount DECIMAL(12,4) NOT NULL, -- Positive for credits, negative for usage
    balance_after DECIMAL(12,4) NOT NULL, -- Balance after this transaction
    
    -- Claude API cost tracking
    claude_cost_usd DECIMAL(12,6), -- Actual Claude API cost
    markup_multiplier DECIMAL(4,2) DEFAULT 5.00, -- 5x markup
    
    -- Reference information
    session_id UUID, -- Link to agent session
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    
    -- Admin bypass tracking
    is_admin_bypass BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Audit and security
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by_ip INET,
    reconciliation_status VARCHAR(20) DEFAULT 'pending' -- pending, reconciled, disputed
);

-- Agent Sessions Table
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

-- WebSocket Connections Table
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

-- Daily Analytics Table (Admin Dashboard)
CREATE TABLE daily_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL for system-wide metrics
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
    claude_api_cost DECIMAL(10,6) NOT NULL DEFAULT 0.000000,
    files_modified INTEGER NOT NULL DEFAULT 0,
    files_created INTEGER NOT NULL DEFAULT 0,
    git_operations INTEGER NOT NULL DEFAULT 0,
    
    -- Admin bypass tracking
    admin_bypass_usage DECIMAL(10,6) NOT NULL DEFAULT 0.000000,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for optimal query performance

-- Users table indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_is_admin ON users(is_admin);
CREATE INDEX idx_users_account_status ON users(account_status);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Auth tokens indexes
CREATE INDEX idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX idx_auth_tokens_token_hash ON auth_tokens(token_hash);
CREATE INDEX idx_auth_tokens_expires_at ON auth_tokens(expires_at);
CREATE INDEX idx_auth_tokens_token_type ON auth_tokens(token_type);
CREATE INDEX idx_auth_tokens_is_active ON auth_tokens(is_active);

-- Credit accounts indexes
CREATE UNIQUE INDEX idx_credit_accounts_user_id ON credit_accounts(user_id);
CREATE INDEX idx_credit_accounts_current_balance ON credit_accounts(current_balance);
CREATE INDEX idx_credit_accounts_unlimited_credits ON credit_accounts(unlimited_credits);

-- Credit transactions indexes
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_account_id ON credit_transactions(account_id);
CREATE INDEX idx_credit_transactions_session_id ON credit_transactions(session_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(transaction_type);
CREATE INDEX idx_credit_transactions_admin_bypass ON credit_transactions(is_admin_bypass);

-- Agent sessions indexes
CREATE INDEX idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX idx_agent_sessions_session_id ON agent_sessions(session_id);
CREATE INDEX idx_agent_sessions_parent_session_id ON agent_sessions(parent_session_id);
CREATE INDEX idx_agent_sessions_current_phase ON agent_sessions(current_phase);
CREATE INDEX idx_agent_sessions_execution_status ON agent_sessions(execution_status);
CREATE INDEX idx_agent_sessions_start_time ON agent_sessions(start_time);
CREATE INDEX idx_agent_sessions_git_branch ON agent_sessions(git_branch);

-- WebSocket connections indexes
CREATE INDEX idx_websocket_connections_user_id ON websocket_connections(user_id);
CREATE INDEX idx_websocket_connections_connection_id ON websocket_connections(connection_id);
CREATE INDEX idx_websocket_connections_session_id ON websocket_connections(session_id);
CREATE INDEX idx_websocket_connections_status ON websocket_connections(connection_status);

-- Daily analytics indexes
CREATE INDEX idx_daily_analytics_user_id ON daily_analytics(user_id);
CREATE INDEX idx_daily_analytics_date_bucket ON daily_analytics(date_bucket);
CREATE UNIQUE INDEX idx_daily_analytics_user_date ON daily_analytics(user_id, date_bucket);

-- Enable Row Level Security for multi-tenant isolation
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE websocket_connections ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user isolation (admin can access all)
CREATE POLICY user_isolation_policy_sessions ON agent_sessions
    FOR ALL TO application_user
    USING (
        user_id = current_setting('app.current_user_id')::UUID OR 
        current_setting('app.is_admin_user', true)::BOOLEAN = true
    );

CREATE POLICY user_isolation_policy_credits ON credit_accounts
    FOR ALL TO application_user
    USING (
        user_id = current_setting('app.current_user_id')::UUID OR 
        current_setting('app.is_admin_user', true)::BOOLEAN = true
    );

CREATE POLICY user_isolation_policy_transactions ON credit_transactions
    FOR ALL TO application_user
    USING (
        user_id = current_setting('app.current_user_id')::UUID OR 
        current_setting('app.is_admin_user', true)::BOOLEAN = true
    );

CREATE POLICY user_isolation_policy_tokens ON auth_tokens
    FOR ALL TO application_user
    USING (
        user_id = current_setting('app.current_user_id')::UUID OR 
        current_setting('app.is_admin_user', true)::BOOLEAN = true
    );

CREATE POLICY user_isolation_policy_websockets ON websocket_connections
    FOR ALL TO application_user
    USING (
        user_id = current_setting('app.current_user_id')::UUID OR 
        current_setting('app.is_admin_user', true)::BOOLEAN = true
    );

-- Create audit trigger function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auth_tokens_updated_at BEFORE UPDATE ON auth_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_accounts_updated_at BEFORE UPDATE ON credit_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_sessions_updated_at BEFORE UPDATE ON agent_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_websocket_connections_updated_at BEFORE UPDATE ON websocket_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create credit balance validation function
CREATE OR REPLACE FUNCTION validate_credit_transaction()
RETURNS TRIGGER AS $$
DECLARE
    account_unlimited BOOLEAN;
    current_balance DECIMAL(12,4);
BEGIN
    -- Get account details
    SELECT ca.unlimited_credits, ca.current_balance 
    INTO account_unlimited, current_balance
    FROM credit_accounts ca
    WHERE ca.id = NEW.account_id;
    
    -- Skip validation for admin accounts with unlimited credits
    IF account_unlimited = true OR NEW.is_admin_bypass = true THEN
        RETURN NEW;
    END IF;
    
    -- Validate sufficient balance for usage transactions
    IF NEW.transaction_type = 'usage' AND NEW.amount < 0 THEN
        IF current_balance + NEW.amount < 0 THEN
            RAISE EXCEPTION 'Insufficient credit balance. Current: %, Required: %', 
                current_balance, ABS(NEW.amount);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply credit validation trigger
CREATE TRIGGER validate_credit_transaction_trigger
    BEFORE INSERT ON credit_transactions
    FOR EACH ROW EXECUTE FUNCTION validate_credit_transaction();

-- Create function to update credit account balance
CREATE OR REPLACE FUNCTION update_credit_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the credit account balance
    UPDATE credit_accounts 
    SET current_balance = NEW.balance_after,
        lifetime_spent = CASE 
            WHEN NEW.transaction_type = 'usage' AND NEW.amount < 0 
            THEN lifetime_spent + ABS(NEW.amount) 
            ELSE lifetime_spent 
        END,
        lifetime_purchased = CASE 
            WHEN NEW.transaction_type = 'purchase' AND NEW.amount > 0 
            THEN lifetime_purchased + NEW.amount 
            ELSE lifetime_purchased 
        END,
        updated_at = NOW()
    WHERE id = NEW.account_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply credit balance update trigger
CREATE TRIGGER update_credit_balance_trigger
    AFTER INSERT ON credit_transactions
    FOR EACH ROW EXECUTE FUNCTION update_credit_balance();

-- Comments for table documentation
COMMENT ON TABLE users IS 'Core user management with admin privilege support and multi-factor authentication';
COMMENT ON TABLE auth_tokens IS 'Authentication token management with scoped permissions and rate limiting';
COMMENT ON TABLE credit_accounts IS 'Credit balance management with admin unlimited credits and spending controls';
COMMENT ON TABLE credit_transactions IS 'Immutable audit trail of all credit operations with 5x markup tracking';
COMMENT ON TABLE agent_sessions IS 'Agent execution tracking with recursive spawning and git branch management';
COMMENT ON TABLE websocket_connections IS 'Real-time WebSocket connection management for streaming updates';
COMMENT ON TABLE daily_analytics IS 'Daily aggregated metrics for admin dashboard analytics and reporting';

COMMENT ON COLUMN credit_transactions.claude_cost_usd IS 'Actual cost from Claude API before 5x markup';
COMMENT ON COLUMN credit_transactions.markup_multiplier IS 'Multiplier applied to Claude cost (default 5x)';
COMMENT ON COLUMN credit_transactions.is_admin_bypass IS 'True if this transaction was bypassed for admin user';
COMMENT ON COLUMN credit_accounts.unlimited_credits IS 'Admin accounts have unlimited credits without deductions';
COMMENT ON COLUMN users.admin_privileges IS 'JSON object containing admin-specific privileges and permissions';

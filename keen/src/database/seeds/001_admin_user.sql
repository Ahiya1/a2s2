-- Seed script to create the admin user (ahiya.butman@gmail.com)
-- This script sets up the admin account with unlimited privileges

-- Insert the admin user
INSERT INTO users (
    email, 
    username, 
    password_hash, 
    display_name, 
    role, 
    is_admin, 
    admin_privileges,
    email_verified, 
    account_status,
    timezone,
    preferences,
    created_at,
    updated_at
) VALUES (
    'ahiya.butman@gmail.com',
    'ahiya_admin',
    '$2b$12$8B3ZQjKlHcGkVJHWXsKYweC3JZH5wAoLiKeR/1tPFYF.Zv7vHjYMW', -- bcrypt hash of '2con-creator'
    'Ahiya Butman (Admin)',
    'super_admin',
    TRUE,
    '{
        "unlimited_credits": true,
        "bypass_rate_limits": true,
        "view_all_analytics": true,
        "user_impersonation": true,
        "system_diagnostics": true,
        "priority_execution": true,
        "global_access": true,
        "audit_access": true
    }'::jsonb,
    TRUE,
    'active',
    'UTC',
    '{
        "dashboard_theme": "admin",
        "notification_preferences": {
            "email_alerts": true,
            "system_alerts": true,
            "security_alerts": true
        },
        "admin_settings": {
            "auto_refresh_analytics": true,
            "show_system_metrics": true,
            "enable_debug_mode": true
        }
    }'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (email) DO UPDATE SET
    username = EXCLUDED.username,
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    is_admin = EXCLUDED.is_admin,
    admin_privileges = EXCLUDED.admin_privileges,
    email_verified = EXCLUDED.email_verified,
    account_status = EXCLUDED.account_status,
    preferences = EXCLUDED.preferences,
    updated_at = NOW();

-- Create unlimited credit account for admin user
INSERT INTO credit_accounts (
    user_id,
    current_balance,
    lifetime_purchased,
    lifetime_spent,
    unlimited_credits,
    daily_limit,
    monthly_limit,
    auto_recharge_enabled,
    account_status,
    created_at,
    updated_at
)
SELECT 
    u.id,
    999999999.9999, -- High balance for display purposes
    0.0000,
    0.0000,
    TRUE, -- Unlimited credits flag
    NULL, -- No daily limit
    NULL, -- No monthly limit
    FALSE, -- No auto-recharge needed
    'active',
    NOW(),
    NOW()
FROM users u 
WHERE u.email = 'ahiya.butman@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET
    unlimited_credits = TRUE,
    current_balance = 999999999.9999,
    daily_limit = NULL,
    monthly_limit = NULL,
    account_status = 'active',
    updated_at = NOW();

-- Create initial admin bypass transaction record
INSERT INTO credit_transactions (
    user_id,
    account_id,
    transaction_type,
    amount,
    balance_after,
    claude_cost_usd,
    markup_multiplier,
    description,
    is_admin_bypass,
    metadata,
    created_at,
    reconciliation_status
)
SELECT 
    u.id,
    ca.id,
    'admin_bypass',
    0.0000, -- No actual credit change
    999999999.9999, -- Unlimited balance
    NULL, -- No Claude cost for setup
    5.00, -- Standard markup
    'Admin account initialization - unlimited credits enabled',
    TRUE, -- This is an admin bypass transaction
    '{
        "initialization": true,
        "admin_setup": true,
        "unlimited_privileges": true,
        "created_by": "system"
    }'::jsonb,
    NOW(),
    'reconciled'
FROM users u
JOIN credit_accounts ca ON ca.user_id = u.id
WHERE u.email = 'ahiya.butman@gmail.com'
ON CONFLICT DO NOTHING;

-- Create initial daily analytics entry for admin monitoring
INSERT INTO daily_analytics (
    user_id,
    date_bucket,
    sessions_started,
    sessions_completed,
    sessions_failed,
    total_session_time_seconds,
    agents_spawned,
    max_recursion_depth,
    tool_executions,
    unique_tools_used,
    total_tokens_consumed,
    total_cost,
    claude_api_cost,
    files_modified,
    files_created,
    git_operations,
    admin_bypass_usage,
    created_at
)
SELECT 
    u.id,
    CURRENT_DATE,
    0, 0, 0, 0, 0, 0, 0,
    '{}',
    0,
    0.000000,
    0.000000,
    0, 0, 0,
    0.000000, -- Track admin bypass usage
    NOW()
FROM users u 
WHERE u.email = 'ahiya.butman@gmail.com'
ON CONFLICT (user_id, date_bucket) DO NOTHING;

-- Create system-wide analytics entry (user_id NULL for global metrics)
INSERT INTO daily_analytics (
    user_id,
    date_bucket,
    sessions_started,
    sessions_completed,
    sessions_failed,
    total_session_time_seconds,
    agents_spawned,
    max_recursion_depth,
    tool_executions,
    unique_tools_used,
    total_tokens_consumed,
    total_cost,
    claude_api_cost,
    files_modified,
    files_created,
    git_operations,
    admin_bypass_usage,
    created_at
) VALUES (
    NULL, -- System-wide metrics
    CURRENT_DATE,
    0, 0, 0, 0, 0, 0, 0,
    '{}',
    0,
    0.000000,
    0.000000,
    0, 0, 0,
    0.000000,
    NOW()
) ON CONFLICT (user_id, date_bucket) DO NOTHING;

-- Verify admin user creation
DO $$
DECLARE
    admin_count INTEGER;
    credit_account_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO admin_count 
    FROM users 
    WHERE email = 'ahiya.butman@gmail.com' AND is_admin = true;
    
    SELECT COUNT(*) INTO credit_account_count 
    FROM credit_accounts ca
    JOIN users u ON ca.user_id = u.id
    WHERE u.email = 'ahiya.butman@gmail.com' AND ca.unlimited_credits = true;
    
    IF admin_count = 0 THEN
        RAISE EXCEPTION 'Failed to create admin user account';
    END IF;
    
    IF credit_account_count = 0 THEN
        RAISE EXCEPTION 'Failed to create admin credit account with unlimited credits';
    END IF;
    
    RAISE NOTICE 'Admin user successfully created: ahiya.butman@gmail.com';
    RAISE NOTICE 'Admin credit account created with unlimited credits';
    RAISE NOTICE 'Admin privileges: unlimited_credits, bypass_rate_limits, view_all_analytics';
END $$;

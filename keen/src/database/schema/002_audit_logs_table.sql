-- keen Platform Database Schema - Phase 2 Additions
-- Audit Logging System for API Gateway

-- Audit Logs Table for comprehensive security and compliance logging
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event classification
    event_type VARCHAR(30) NOT NULL, -- api_request, api_response, authentication, credit_transaction, admin_action, error, security_event
    event_subtype VARCHAR(50), -- More specific classification
    
    -- User and session context
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
    request_id VARCHAR(100), -- Request correlation ID
    
    -- Request/response details
    method VARCHAR(10), -- HTTP method for API requests
    path VARCHAR(500), -- API endpoint path
    status_code INTEGER, -- HTTP status code for responses
    response_time_ms INTEGER, -- Response time in milliseconds
    
    -- Client and network information
    ip_address INET,
    user_agent TEXT,
    client_fingerprint VARCHAR(255), -- Client identification
    
    -- Event data and context
    event_data JSONB DEFAULT '{}', -- Structured event data
    error_details JSONB, -- Error information if applicable
    metadata JSONB DEFAULT '{}', -- Additional metadata
    
    -- Risk assessment
    risk_level VARCHAR(10) NOT NULL DEFAULT 'low', -- low, medium, high, critical
    risk_factors TEXT[], -- Array of risk indicators
    
    -- Administrative flags
    is_admin_action BOOLEAN NOT NULL DEFAULT FALSE,
    requires_review BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    
    -- Compliance and retention
    retention_until TIMESTAMP WITH TIME ZONE, -- When this log can be purged
    compliance_category VARCHAR(50), -- GDPR, SOX, HIPAA, etc.
    
    -- Audit trail integrity
    data_hash VARCHAR(64), -- SHA-256 hash for integrity verification
    previous_log_hash VARCHAR(64), -- Chain of custody
    
    -- Timestamps
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for audit logs performance
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC); -- Primary query pattern
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_risk_level ON audit_logs(risk_level);
CREATE INDEX idx_audit_logs_admin_action ON audit_logs(is_admin_action);
CREATE INDEX idx_audit_logs_requires_review ON audit_logs(requires_review) WHERE requires_review = true;
CREATE INDEX idx_audit_logs_session_id ON audit_logs(session_id);
CREATE INDEX idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX idx_audit_logs_ip_address ON audit_logs(ip_address);

-- Composite indexes for common query patterns
CREATE INDEX idx_audit_logs_user_type_time ON audit_logs(user_id, event_type, timestamp DESC);
CREATE INDEX idx_audit_logs_admin_time ON audit_logs(is_admin_action, timestamp DESC) WHERE is_admin_action = true;
CREATE INDEX idx_audit_logs_high_risk ON audit_logs(risk_level, timestamp DESC) WHERE risk_level IN ('high', 'critical');

-- GIN indexes for JSONB columns
CREATE INDEX idx_audit_logs_event_data ON audit_logs USING GIN(event_data);
CREATE INDEX idx_audit_logs_metadata ON audit_logs USING GIN(metadata);

-- Row Level Security for audit logs (admin access only)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only access to audit logs (regular users cannot see audit data)
CREATE POLICY audit_logs_admin_policy ON audit_logs
    FOR ALL TO application_user
    USING (
        current_setting('app.is_admin_user', true)::BOOLEAN = true
    );

-- Comment for documentation
COMMENT ON TABLE audit_logs IS 'Comprehensive audit logging for security, compliance, and monitoring with admin-only access';
COMMENT ON COLUMN audit_logs.event_data IS 'Structured JSON data containing event-specific information';
COMMENT ON COLUMN audit_logs.risk_level IS 'Automated risk assessment: low, medium, high, critical';
COMMENT ON COLUMN audit_logs.data_hash IS 'SHA-256 hash for audit trail integrity verification';
COMMENT ON COLUMN audit_logs.is_admin_action IS 'True if this event was performed by an admin user';

-- Create application_user role for Row Level Security
-- Note: This should be run with superuser privileges
DO $$
BEGIN
    -- Create role if it doesn't exist
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'application_user') THEN
        CREATE ROLE application_user;
    END IF;
    
    -- Grant necessary permissions
    GRANT CONNECT ON DATABASE keen_development TO application_user;
    GRANT USAGE ON SCHEMA public TO application_user;
    
    -- Grant table permissions
    GRANT ALL ON ALL TABLES IN SCHEMA public TO application_user;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO application_user;
    
    -- Grant permissions for new tables
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO application_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO application_user;
    
EXCEPTION 
    WHEN insufficient_privilege THEN 
        RAISE NOTICE 'Insufficient privileges to create role. Run this migration with superuser privileges.';
END$$;

-- Create function to set user context for RLS
CREATE OR REPLACE FUNCTION set_user_context(p_user_id UUID, p_is_admin BOOLEAN DEFAULT FALSE)
RETURNS VOID AS $$
BEGIN
    -- Set user context for Row Level Security
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, true);
    PERFORM set_config('app.is_admin_user', p_is_admin::TEXT, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clear user context
CREATE OR REPLACE FUNCTION clear_user_context()
RETURNS VOID AS $$
BEGIN
    -- Clear user context
    PERFORM set_config('app.current_user_id', '', true);
    PERFORM set_config('app.is_admin_user', 'false', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on context functions
GRANT EXECUTE ON FUNCTION set_user_context(UUID, BOOLEAN) TO application_user;
GRANT EXECUTE ON FUNCTION clear_user_context() TO application_user;

-- Create audit log trigger function for data integrity
CREATE OR REPLACE FUNCTION audit_log_integrity_trigger()
RETURNS TRIGGER AS $$
DECLARE
    data_to_hash TEXT;
    last_hash VARCHAR(64);
BEGIN
    -- Get the previous log hash for chaining
    SELECT data_hash INTO last_hash 
    FROM audit_logs 
    ORDER BY timestamp DESC 
    LIMIT 1;
    
    -- Create hash input from key fields
    data_to_hash := CONCAT(
        NEW.event_type, '|',
        COALESCE(NEW.user_id::TEXT, ''), '|',
        COALESCE(NEW.request_id, ''), '|',
        NEW.timestamp::TEXT, '|',
        COALESCE(NEW.event_data::TEXT, '{}')
    );
    
    -- Calculate SHA-256 hash
    NEW.data_hash := encode(digest(data_to_hash, 'sha256'), 'hex');
    NEW.previous_log_hash := last_hash;
    
    -- Set retention period (2 years for compliance)
    IF NEW.retention_until IS NULL THEN
        NEW.retention_until := NOW() + INTERVAL '2 years';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply integrity trigger to audit logs
CREATE TRIGGER audit_log_integrity_trigger
    BEFORE INSERT ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_log_integrity_trigger();

-- Create audit log cleanup function (for GDPR compliance)
CREATE OR REPLACE FUNCTION cleanup_expired_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired audit logs
    DELETE FROM audit_logs 
    WHERE retention_until < NOW() 
    AND compliance_category NOT IN ('legal_hold', 'investigation');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup operation
    INSERT INTO audit_logs (event_type, event_data, is_admin_action, metadata)
    VALUES (
        'admin_action',
        jsonb_build_object('action', 'audit_log_cleanup', 'deleted_count', deleted_count),
        true,
        jsonb_build_object('automated', true, 'retention_policy', '2_years')
    );
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant cleanup function to admin users only
-- Note: This would typically be called by a scheduled job

-- Create view for audit log analytics (admin only)
CREATE VIEW audit_analytics AS
SELECT 
    DATE_TRUNC('day', timestamp) as date,
    event_type,
    risk_level,
    COUNT(*) as event_count,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) FILTER (WHERE is_admin_action = true) as admin_actions,
    COUNT(*) FILTER (WHERE requires_review = true) as events_requiring_review,
    AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL) as avg_response_time
FROM audit_logs
GROUP BY DATE_TRUNC('day', timestamp), event_type, risk_level
ORDER BY date DESC, event_count DESC;

-- Grant view access to admin users only
GRANT SELECT ON audit_analytics TO application_user;

-- Phase 2 API Gateway - Audit Logging Table
-- Comprehensive security and compliance audit logging

-- Audit Logs Table for API Gateway
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event classification
    event_type VARCHAR(50) NOT NULL, 
    
    -- Context and references
    user_id UUID,
    agent_session_id UUID,
    request_id VARCHAR(100),
    
    -- Event timing
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Client information
    ip_address INET,
    user_agent TEXT,
    
    -- Event data (flexible JSON storage)
    event_data JSONB NOT NULL DEFAULT '{}',
    
    -- Risk assessment
    risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
    
    -- Admin activity tracking
    is_admin_action BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Retention and compliance
    retention_date DATE DEFAULT (CURRENT_DATE + INTERVAL '2 years'),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Audit timestamp
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for optimal audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_agent_session_id ON audit_logs(agent_session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_risk_level ON audit_logs(risk_level);
CREATE INDEX IF NOT EXISTS idx_audit_logs_is_admin_action ON audit_logs(is_admin_action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_timestamp ON audit_logs(event_type, timestamp DESC);

-- GIN index for searching within event_data JSON
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_data_gin ON audit_logs USING GIN(event_data);

-- Comments for documentation
COMMENT ON TABLE audit_logs IS 'Comprehensive audit logging for API Gateway security and compliance';
COMMENT ON COLUMN audit_logs.event_type IS 'Type of event: api_request, authentication, admin_action, security_event, etc.';
COMMENT ON COLUMN audit_logs.event_data IS 'Flexible JSON storage for event-specific data and metadata';
COMMENT ON COLUMN audit_logs.risk_level IS 'Risk assessment: low, medium, high, critical for security monitoring';
COMMENT ON COLUMN audit_logs.is_admin_action IS 'Flag indicating this event was performed by an admin user';
COMMENT ON COLUMN audit_logs.retention_date IS 'Date after which this log can be archived (default 2 years)';
-- Add audit_logs table for API Gateway audit logging
-- This table is required by the AuditLogger service for security and compliance logging

-- Audit Logs Table for API Gateway
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event classification
    event_type VARCHAR(50) NOT NULL, -- api_request, api_response, authentication, admin_action, security_event, error
    
    -- Context information
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
    request_id VARCHAR(255), -- Links multiple audit entries for same request
    
    -- Timestamp and location
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    
    -- Event data (flexible JSON for different event types)
    event_data JSONB NOT NULL DEFAULT '{}',
    
    -- Risk assessment
    risk_level VARCHAR(20) NOT NULL DEFAULT 'low', -- low, medium, high, critical
    
    -- Admin action tracking
    is_admin_action BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Audit metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for optimal audit log querying
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_session_id ON audit_logs(session_id);
CREATE INDEX idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_ip_address ON audit_logs(ip_address);
CREATE INDEX idx_audit_logs_risk_level ON audit_logs(risk_level);
CREATE INDEX idx_audit_logs_admin_action ON audit_logs(is_admin_action);

-- GIN index for JSON event data queries
CREATE INDEX idx_audit_logs_event_data ON audit_logs USING GIN (event_data);

-- Composite indexes for common query patterns
CREATE INDEX idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_audit_logs_admin_timestamp ON audit_logs(is_admin_action, timestamp DESC);
CREATE INDEX idx_audit_logs_risk_timestamp ON audit_logs(risk_level, timestamp DESC);

-- Row Level Security for audit logs (admin-only access)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admin users can access audit logs
CREATE POLICY admin_only_audit_policy ON audit_logs
    FOR ALL TO application_user
    USING (current_setting('app.is_admin_user', true)::BOOLEAN = true);

-- Table comment
COMENT ON TABLE audit_logs IS 'Comprehensive audit trail for API Gateway security and compliance monitoring';
COMENT ON COLUMN audit_logs.event_data IS 'Flexible JSON data specific to each event type';
COMENT ON COLUMN audit_logs.risk_level IS 'Security risk assessment: low, medium, high, critical';
COMENT ON COLUMN audit_logs.is_admin_action IS 'Flag for admin actions requiring special audit attention';

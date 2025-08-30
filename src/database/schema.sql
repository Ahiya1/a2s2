-- a2s2 Database Schema
-- Version: 1.0.0
-- Description: Complete schema for autonomous agent conversation persistence

-- Enable foreign key constraints (SQLite)
PRAGMA foreign_keys = ON;

-- Migration tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial schema version
INSERT OR IGNORE INTO schema_migrations (version, description, checksum) 
VALUES ('1.0.0', 'Initial schema', 'a2s2_initial_schema_v1');

-- Conversations table - Core conversation persistence
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT UNIQUE NOT NULL,
    working_directory TEXT NOT NULL,
    project_context TEXT, -- JSON serialized ProjectContext
    total_cost REAL NOT NULL DEFAULT 0.0,
    message_count INTEGER NOT NULL DEFAULT 0,
    conversation_history TEXT NOT NULL, -- JSON serialized conversation history
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_conversation_id ON conversations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_working_directory ON conversations(working_directory);

-- Agent sessions table - Autonomous execution tracking
CREATE TABLE IF NOT EXISTS agent_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    conversation_id TEXT, -- Optional reference to conversation
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    phase TEXT NOT NULL CHECK (phase IN ('EXPLORE', 'SUMMON', 'COMPLETE')),
    iteration_count INTEGER NOT NULL DEFAULT 0,
    tool_calls_count INTEGER NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0.0,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    files_modified TEXT, -- JSON array of file paths
    files_created TEXT, -- JSON array of file paths
    streaming_time INTEGER, -- Milliseconds of streaming time
    success BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    vision TEXT NOT NULL, -- Original task vision
    working_directory TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_session_id ON agent_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_conversation_id ON agent_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_start_time ON agent_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_phase ON agent_sessions(phase);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_success ON agent_sessions(success);

-- Phase transitions table - Agent phase tracking
CREATE TABLE IF NOT EXISTS phase_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    from_phase TEXT NOT NULL,
    to_phase TEXT NOT NULL CHECK (to_phase IN ('EXPLORE', 'SUMMON', 'COMPLETE')),
    timestamp TIMESTAMP NOT NULL,
    reason TEXT,
    duration INTEGER NOT NULL, -- Duration in milliseconds
    summary TEXT,
    key_findings TEXT, -- JSON array of findings
    next_actions TEXT, -- JSON array of actions
    confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_phase_transitions_session_id ON phase_transitions(session_id);
CREATE INDEX IF NOT EXISTS idx_phase_transitions_timestamp ON phase_transitions(timestamp);
CREATE INDEX IF NOT EXISTS idx_phase_transitions_to_phase ON phase_transitions(to_phase);

-- Tool executions table - All tool usage tracking
CREATE TABLE IF NOT EXISTS tool_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    conversation_id TEXT, -- Optional reference to conversation
    tool_name TEXT NOT NULL,
    tool_parameters TEXT NOT NULL, -- JSON serialized parameters
    result TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    execution_time INTEGER NOT NULL, -- Milliseconds
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_tool_executions_session_id ON tool_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_conversation_id ON tool_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_tool_name ON tool_executions(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_executions_timestamp ON tool_executions(timestamp);
CREATE INDEX IF NOT EXISTS idx_tool_executions_success ON tool_executions(success);

-- File operations table - File system interaction tracking
CREATE TABLE IF NOT EXISTS file_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    tool_execution_id INTEGER, -- Reference to the tool execution that caused this
    operation_type TEXT NOT NULL CHECK (operation_type IN ('read', 'write', 'create', 'delete')),
    file_path TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    file_size INTEGER, -- Size in bytes
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id),
    FOREIGN KEY (tool_execution_id) REFERENCES tool_executions(id)
);

CREATE INDEX IF NOT EXISTS idx_file_operations_session_id ON file_operations(session_id);
CREATE INDEX IF NOT EXISTS idx_file_operations_tool_execution_id ON file_operations(tool_execution_id);
CREATE INDEX IF NOT EXISTS idx_file_operations_operation_type ON file_operations(operation_type);
CREATE INDEX IF NOT EXISTS idx_file_operations_file_path ON file_operations(file_path);
CREATE INDEX IF NOT EXISTS idx_file_operations_timestamp ON file_operations(timestamp);

-- Cost tracking table - Detailed cost analysis
CREATE TABLE IF NOT EXISTS cost_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    conversation_id TEXT, -- Optional reference to conversation
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    thinking_tokens INTEGER DEFAULT 0,
    cache_creation_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    input_cost REAL NOT NULL DEFAULT 0.0,
    output_cost REAL NOT NULL DEFAULT 0.0,
    thinking_cost REAL NOT NULL DEFAULT 0.0,
    total_cost REAL NOT NULL DEFAULT 0.0,
    pricing_tier TEXT NOT NULL CHECK (pricing_tier IN ('standard', 'extended')),
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_cost_tracking_session_id ON cost_tracking(session_id);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_conversation_id ON cost_tracking(conversation_id);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_timestamp ON cost_tracking(timestamp);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_pricing_tier ON cost_tracking(pricing_tier);

-- Validation results table - Project validation tracking
CREATE TABLE IF NOT EXISTS validation_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    validation_type TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'warning')),
    message TEXT NOT NULL,
    details TEXT, -- JSON serialized details
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_validation_results_session_id ON validation_results(session_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_validation_type ON validation_results(validation_type);
CREATE INDEX IF NOT EXISTS idx_validation_results_result ON validation_results(result);
CREATE INDEX IF NOT EXISTS idx_validation_results_timestamp ON validation_results(timestamp);

-- Analytics views for dashboard queries
-- Daily conversation summary
CREATE VIEW IF NOT EXISTS daily_conversation_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_conversations,
    AVG(total_cost) as avg_cost,
    AVG(message_count) as avg_messages,
    SUM(total_cost) as total_cost
FROM conversations 
GROUP BY DATE(created_at);

-- Session success rate by phase
CREATE VIEW IF NOT EXISTS session_success_by_phase AS
SELECT 
    phase,
    COUNT(*) as total_sessions,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_sessions,
    ROUND(
        (SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2
    ) as success_rate,
    AVG(total_cost) as avg_cost,
    AVG(iteration_count) as avg_iterations
FROM agent_sessions 
GROUP BY phase;

-- Tool usage statistics
CREATE VIEW IF NOT EXISTS tool_usage_stats AS
SELECT 
    tool_name,
    COUNT(*) as total_executions,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_executions,
    ROUND(
        (SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2
    ) as success_rate,
    AVG(execution_time) as avg_execution_time,
    MAX(execution_time) as max_execution_time
FROM tool_executions 
GROUP BY tool_name
ORDER BY total_executions DESC;

-- Recent activity view (last 7 days)
CREATE VIEW IF NOT EXISTS recent_activity AS
SELECT 
    'conversation' as activity_type,
    conversation_id as activity_id,
    'New conversation in ' || working_directory as description,
    total_cost as cost,
    created_at as timestamp
FROM conversations 
WHERE created_at >= datetime('now', '-7 days')

UNION ALL

SELECT 
    'session' as activity_type,
    session_id as activity_id,
    'Agent session: ' || phase || ' - ' || 
    CASE WHEN success = 1 THEN 'Success' ELSE 'Failed' END as description,
    total_cost as cost,
    start_time as timestamp
FROM agent_sessions 
WHERE start_time >= datetime('now', '-7 days')

ORDER BY timestamp DESC;

-- Performance monitoring view
CREATE VIEW IF NOT EXISTS performance_metrics AS
SELECT 
    DATE(start_time) as date,
    COUNT(*) as total_sessions,
    AVG(iteration_count) as avg_iterations,
    AVG(total_cost) as avg_cost,
    AVG(tokens_used) as avg_tokens,
    AVG(tool_calls_count) as avg_tool_calls,
    AVG(CASE WHEN end_time IS NOT NULL THEN 
        (julianday(end_time) - julianday(start_time)) * 86400 
        ELSE NULL END) as avg_duration_seconds,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_sessions,
    ROUND(
        (SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2
    ) as success_rate
FROM agent_sessions
WHERE start_time >= datetime('now', '-30 days')
GROUP BY DATE(start_time)
ORDER BY date DESC;

-- Triggers to maintain updated_at timestamps
CREATE TRIGGER IF NOT EXISTS update_conversations_timestamp 
    AFTER UPDATE ON conversations
    FOR EACH ROW
BEGIN
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_agent_sessions_timestamp 
    AFTER UPDATE ON agent_sessions
    FOR EACH ROW
BEGIN
    UPDATE agent_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Cleanup trigger for old data (if analytics retention is enabled)
-- This would be controlled by the analytics.retention config setting
CREATE TRIGGER IF NOT EXISTS cleanup_old_analytics_data
    AFTER INSERT ON agent_sessions
    FOR EACH ROW
    WHEN (SELECT COUNT(*) FROM agent_sessions) % 100 = 0 -- Run every 100 inserts
BEGIN
    -- Delete conversation data older than retention period
    DELETE FROM conversations 
    WHERE created_at < datetime('now', '-90 days');
    
    -- Delete session data older than retention period
    DELETE FROM agent_sessions 
    WHERE start_time < datetime('now', '-90 days');
    
    -- Cleanup will cascade to related tables due to foreign keys
END;

-- Create full-text search indexes for better search performance (SQLite FTS5)
-- These are optional and database-specific
CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
    conversation_id,
    project_context,
    conversation_history,
    content=conversations,
    content_rowid=id
);

-- Triggers to maintain FTS index
CREATE TRIGGER IF NOT EXISTS conversations_fts_insert
    AFTER INSERT ON conversations
BEGIN
    INSERT INTO conversations_fts(rowid, conversation_id, project_context, conversation_history)
    VALUES (new.id, new.conversation_id, new.project_context, new.conversation_history);
END;

CREATE TRIGGER IF NOT EXISTS conversations_fts_delete
    AFTER DELETE ON conversations
BEGIN
    DELETE FROM conversations_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS conversations_fts_update
    AFTER UPDATE ON conversations
BEGIN
    DELETE FROM conversations_fts WHERE rowid = old.id;
    INSERT INTO conversations_fts(rowid, conversation_id, project_context, conversation_history)
    VALUES (new.id, new.conversation_id, new.project_context, new.conversation_history);
END;

-- Optimization: Analyze tables for better query planning
-- ANALYZE;

-- Schema validation queries (for integrity checks)
-- These can be used by DatabaseInitializer to validate schema

-- Verify all required tables exist
CREATE VIEW IF NOT EXISTS schema_validation AS
SELECT 
    'conversations' as table_name,
    CASE WHEN COUNT(*) > 0 THEN 'exists' ELSE 'missing' END as status
FROM sqlite_master 
WHERE type='table' AND name='conversations'

UNION ALL

SELECT 
    'agent_sessions' as table_name,
    CASE WHEN COUNT(*) > 0 THEN 'exists' ELSE 'missing' END as status
FROM sqlite_master 
WHERE type='table' AND name='agent_sessions'

UNION ALL

SELECT 
    'phase_transitions' as table_name,
    CASE WHEN COUNT(*) > 0 THEN 'exists' ELSE 'missing' END as status
FROM sqlite_master 
WHERE type='table' AND name='phase_transitions'

UNION ALL

SELECT 
    'tool_executions' as table_name,
    CASE WHEN COUNT(*) > 0 THEN 'exists' ELSE 'missing' END as status
FROM sqlite_master 
WHERE type='table' AND name='tool_executions'

UNION ALL

SELECT 
    'file_operations' as table_name,
    CASE WHEN COUNT(*) > 0 THEN 'exists' ELSE 'missing' END as status
FROM sqlite_master 
WHERE type='table' AND name='file_operations'

UNION ALL

SELECT 
    'cost_tracking' as table_name,
    CASE WHEN COUNT(*) > 0 THEN 'exists' ELSE 'missing' END as status
FROM sqlite_master 
WHERE type='table' AND name='cost_tracking'

UNION ALL

SELECT 
    'validation_results' as table_name,
    CASE WHEN COUNT(*) > 0 THEN 'exists' ELSE 'missing' END as status
FROM sqlite_master 
WHERE type='table' AND name='validation_results';

-- Performance optimization settings (SQLite specific)
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 1000;
PRAGMA temp_store = memory;

-- Final schema version check
SELECT 'Schema version 1.0.0 loaded successfully' as status;
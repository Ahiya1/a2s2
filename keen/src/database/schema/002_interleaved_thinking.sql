-- Phase 1B Enhancement: Interleaved Thinking and Message Storage
-- Adds support for storing agent reasoning, thinking blocks, and full conversation history

-- Add interleaved thinking columns to agent_sessions
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS thinking_blocks JSONB DEFAULT '[]'::jsonb;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS reasoning_chain TEXT[] DEFAULT '{}';
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS decision_points JSONB DEFAULT '{}'::jsonb;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS confidence_levels JSONB DEFAULT '{}'::jsonb;

-- Create agent_messages table for full conversation history
CREATE TABLE IF NOT EXISTS agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Message identification
    message_index INTEGER NOT NULL, -- Sequential message number in conversation
    message_type VARCHAR(20) NOT NULL, -- user, assistant, system, thinking
    
    -- Message content
    content TEXT NOT NULL,
    thinking_content TEXT, -- For interleaved thinking blocks
    
    -- Context and metadata
    phase VARCHAR(20), -- EXPLORE, PLAN, SUMMON, COMPLETE
    iteration INTEGER DEFAULT 0,
    tool_calls JSONB DEFAULT '[]'::jsonb,
    tool_results JSONB DEFAULT '[]'::jsonb,
    
    -- Reasoning and decision tracking
    confidence_level DECIMAL(3,2), -- 0.00 to 1.00
    reasoning TEXT,
    alternatives_considered TEXT[],
    decision_made TEXT,
    
    -- Timing and performance
    tokens_used INTEGER DEFAULT 0,
    processing_time_ms INTEGER,
    
    -- Status and validation
    message_status VARCHAR(20) DEFAULT 'active', -- active, edited, deleted
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create thinking_blocks table for detailed thinking analysis
CREATE TABLE IF NOT EXISTS thinking_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    message_id UUID REFERENCES agent_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Block identification
    sequence_number INTEGER NOT NULL,
    thinking_type VARCHAR(30) NOT NULL, -- analysis, planning, decision, reflection, error_recovery
    
    -- Thinking content
    thinking_content TEXT NOT NULL,
    context_snapshot JSONB DEFAULT '{}'::jsonb,
    
    -- Decision tracking
    problem_identified TEXT,
    options_considered TEXT[],
    decision_made TEXT,
    reasoning TEXT,
    confidence_level DECIMAL(3,2), -- 0.00 to 1.00
    
    -- Outcome tracking
    predicted_outcome TEXT,
    actual_outcome TEXT,
    success_indicator BOOLEAN,
    
    -- Timing
    thinking_start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    thinking_duration_ms INTEGER,
    
    -- Phase and context
    phase VARCHAR(20), -- EXPLORE, PLAN, SUMMON, COMPLETE
    iteration INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create conversation_summaries table for efficient session overview
CREATE TABLE IF NOT EXISTS conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Summary content
    phase VARCHAR(20) NOT NULL, -- Phase this summary covers
    summary_text TEXT NOT NULL,
    key_decisions TEXT[],
    major_outcomes TEXT[],
    
    -- Metrics
    messages_count INTEGER NOT NULL DEFAULT 0,
    thinking_blocks_count INTEGER NOT NULL DEFAULT 0,
    avg_confidence DECIMAL(3,2),
    
    -- Time range covered
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_agent_messages_session_id ON agent_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_user_id ON agent_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_message_index ON agent_messages(session_id, message_index);
CREATE INDEX IF NOT EXISTS idx_agent_messages_message_type ON agent_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_agent_messages_phase ON agent_messages(phase);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created_at ON agent_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_thinking_blocks_session_id ON thinking_blocks(session_id);
CREATE INDEX IF NOT EXISTS idx_thinking_blocks_message_id ON thinking_blocks(message_id);
CREATE INDEX IF NOT EXISTS idx_thinking_blocks_user_id ON thinking_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_thinking_blocks_sequence ON thinking_blocks(session_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_thinking_blocks_thinking_type ON thinking_blocks(thinking_type);
CREATE INDEX IF NOT EXISTS idx_thinking_blocks_phase ON thinking_blocks(phase);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_session_id ON conversation_summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_user_id ON conversation_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_phase ON conversation_summaries(phase);

-- Enhanced indexes for agent_sessions thinking columns
CREATE INDEX IF NOT EXISTS idx_agent_sessions_thinking_blocks_gin ON agent_sessions USING GIN (thinking_blocks);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_decision_points_gin ON agent_sessions USING GIN (decision_points);

-- Enable Row Level Security for new tables
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE thinking_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user isolation
CREATE POLICY user_isolation_policy_messages ON agent_messages
    FOR ALL TO application_user
    USING (
        user_id = current_setting('app.current_user_id')::UUID OR 
        current_setting('app.is_admin_user', true)::BOOLEAN = true
    );

CREATE POLICY user_isolation_policy_thinking ON thinking_blocks
    FOR ALL TO application_user
    USING (
        user_id = current_setting('app.current_user_id')::UUID OR 
        current_setting('app.is_admin_user', true)::BOOLEAN = true
    );

CREATE POLICY user_isolation_policy_summaries ON conversation_summaries
    FOR ALL TO application_user
    USING (
        user_id = current_setting('app.current_user_id')::UUID OR 
        current_setting('app.is_admin_user', true)::BOOLEAN = true
    );

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_agent_messages_updated_at BEFORE UPDATE ON agent_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_summaries_updated_at BEFORE UPDATE ON conversation_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to auto-update session thinking metrics
CREATE OR REPLACE FUNCTION update_session_thinking_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update agent_sessions with aggregated thinking metrics
    UPDATE agent_sessions 
    SET 
        thinking_blocks = (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', tb.id,
                    'type', tb.thinking_type,
                    'content', tb.thinking_content,
                    'confidence', tb.confidence_level,
                    'timestamp', tb.created_at,
                    'phase', tb.phase
                )
            ), '[]'::jsonb)
            FROM thinking_blocks tb 
            WHERE tb.session_id = NEW.session_id
        ),
        reasoning_chain = (
            SELECT COALESCE(array_agg(tb.reasoning ORDER BY tb.sequence_number), '{}')
            FROM thinking_blocks tb
            WHERE tb.session_id = NEW.session_id AND tb.reasoning IS NOT NULL
        ),
        decision_points = (
            SELECT COALESCE(jsonb_object_agg(
                tb.sequence_number::text,
                jsonb_build_object(
                    'decision', tb.decision_made,
                    'reasoning', tb.reasoning,
                    'confidence', tb.confidence_level,
                    'alternatives', tb.options_considered
                )
            ), '{}'::jsonb)
            FROM thinking_blocks tb
            WHERE tb.session_id = NEW.session_id AND tb.decision_made IS NOT NULL
        ),
        confidence_levels = (
            SELECT jsonb_build_object(
                'current', AVG(tb.confidence_level),
                'trend', array_agg(tb.confidence_level ORDER BY tb.sequence_number),
                'min', MIN(tb.confidence_level),
                'max', MAX(tb.confidence_level)
            )
            FROM thinking_blocks tb
            WHERE tb.session_id = NEW.session_id AND tb.confidence_level IS NOT NULL
        )
    WHERE id = NEW.session_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply thinking metrics update trigger
CREATE TRIGGER update_session_thinking_metrics_trigger
    AFTER INSERT OR UPDATE ON thinking_blocks
    FOR EACH ROW EXECUTE FUNCTION update_session_thinking_metrics();

-- Create function to generate conversation summaries
CREATE OR REPLACE FUNCTION generate_conversation_summary(
    p_session_id UUID,
    p_phase VARCHAR(20)
)
RETURNS UUID AS $$
DECLARE
    summary_id UUID;
    user_id_val UUID;
BEGIN
    -- Get user_id from session
    SELECT user_id INTO user_id_val FROM agent_sessions WHERE id = p_session_id;
    
    -- Generate summary
    INSERT INTO conversation_summaries (
        session_id,
        user_id,
        phase,
        summary_text,
        key_decisions,
        major_outcomes,
        messages_count,
        thinking_blocks_count,
        avg_confidence,
        start_time,
        end_time
    )
    SELECT 
        p_session_id,
        user_id_val,
        p_phase,
        'Auto-generated summary for phase ' || p_phase,
        COALESCE(array_agg(DISTINCT tb.decision_made) FILTER (WHERE tb.decision_made IS NOT NULL), '{}'),
        COALESCE(array_agg(DISTINCT am.content) FILTER (WHERE am.message_type = 'assistant'), '{}'),
        COUNT(DISTINCT am.id),
        COUNT(DISTINCT tb.id),
        AVG(tb.confidence_level),
        MIN(COALESCE(am.created_at, tb.created_at)),
        MAX(COALESCE(am.created_at, tb.created_at))
    FROM agent_messages am
    FULL OUTER JOIN thinking_blocks tb ON am.session_id = tb.session_id AND am.phase = tb.phase
    WHERE (am.session_id = p_session_id OR tb.session_id = p_session_id)
      AND (am.phase = p_phase OR tb.phase = p_phase)
    RETURNING id INTO summary_id;
    
    RETURN summary_id;
END;
$$ LANGUAGE plpgsql;

-- Add comments for new tables
COMMENT ON TABLE agent_messages IS 'Complete conversation history with interleaved thinking for agent sessions';
COMMENT ON TABLE thinking_blocks IS 'Detailed thinking blocks capturing agent reasoning and decision-making process';
COMMENT ON TABLE conversation_summaries IS 'Phase-based summaries of agent conversations for efficient overview';

COMMENT ON COLUMN agent_sessions.thinking_blocks IS 'Aggregated thinking blocks in JSONB format for quick access';
COMMENT ON COLUMN agent_sessions.reasoning_chain IS 'Sequential array of reasoning steps taken by the agent';
COMMENT ON COLUMN agent_sessions.decision_points IS 'Key decisions made during session with reasoning and confidence';
COMMENT ON COLUMN agent_sessions.confidence_levels IS 'Confidence metrics and trends throughout the session';

COMMENT ON COLUMN agent_messages.thinking_content IS 'Agent thinking content interleaved with regular messages';
COMMENT ON COLUMN thinking_blocks.thinking_type IS 'Type of thinking: analysis, planning, decision, reflection, error_recovery';
COMMENT ON COLUMN thinking_blocks.confidence_level IS 'Agent confidence in this thinking block (0.00 to 1.00)';

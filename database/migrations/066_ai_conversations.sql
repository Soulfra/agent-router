-- AI Conversations Logging Table
--
-- Tracks ALL AI API calls (OpenAI, Anthropic, Ollama, etc.)
-- Records full conversation context for debugging, auditing, and training
--
-- Purpose: Fix missing conversation logs that should be posted to forums/message boards/CSV

CREATE TABLE IF NOT EXISTS ai_conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Service metadata
  service VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'ollama', 'coderabbit'
  model VARCHAR(100) NOT NULL, -- 'gpt-4', 'claude-3-opus', 'mistral:7b', etc.
  endpoint VARCHAR(255), -- API endpoint used

  -- Conversation data
  user_prompt TEXT NOT NULL,
  system_prompt TEXT,
  assistant_response TEXT NOT NULL,

  -- Full context (for debugging)
  full_request JSONB, -- Complete API request body
  full_response JSONB, -- Complete API response body

  -- Token usage
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,

  -- Cost tracking
  estimated_cost_usd NUMERIC(10, 6),

  -- Performance
  latency_ms INTEGER,

  -- Context
  purpose VARCHAR(100), -- 'bug_diagnosis', 'lesson_help', 'code_review', 'chat', etc.
  context_source VARCHAR(100), -- 'guardian', 'learning_engine', 'cal_loop', 'user', etc.
  related_entity_type VARCHAR(50), -- 'bug_report', 'lesson', 'file', 'user', etc.
  related_entity_id TEXT, -- ID of related entity

  -- Forum integration
  posted_to_forum BOOLEAN DEFAULT FALSE,
  forum_thread_id UUID REFERENCES forum_threads(id),

  -- Status
  status VARCHAR(50) DEFAULT 'completed', -- 'completed', 'failed', 'timeout'
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255) DEFAULT 'cal',

  -- Privacy/compliance
  contains_sensitive_data BOOLEAN DEFAULT FALSE,
  anonymized BOOLEAN DEFAULT FALSE
);

-- Indexes for common queries
CREATE INDEX idx_ai_conversations_service ON ai_conversations(service);
CREATE INDEX idx_ai_conversations_model ON ai_conversations(model);
CREATE INDEX idx_ai_conversations_purpose ON ai_conversations(purpose);
CREATE INDEX idx_ai_conversations_context_source ON ai_conversations(context_source);
CREATE INDEX idx_ai_conversations_created ON ai_conversations(created_at DESC);
CREATE INDEX idx_ai_conversations_forum_thread ON ai_conversations(forum_thread_id);
CREATE INDEX idx_ai_conversations_related_entity ON ai_conversations(related_entity_type, related_entity_id);

-- Full-text search on prompts and responses
CREATE INDEX idx_ai_conversations_prompt_search ON ai_conversations USING gin(to_tsvector('english', user_prompt));
CREATE INDEX idx_ai_conversations_response_search ON ai_conversations USING gin(to_tsvector('english', assistant_response));

-- View for analytics
CREATE OR REPLACE VIEW ai_conversation_stats AS
SELECT
  service,
  model,
  purpose,
  COUNT(*) as conversation_count,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(estimated_cost_usd) as total_cost_usd,
  AVG(latency_ms) as avg_latency_ms,
  MIN(created_at) as first_conversation,
  MAX(created_at) as last_conversation
FROM ai_conversations
WHERE status = 'completed'
GROUP BY service, model, purpose;

-- View for recent important conversations
CREATE OR REPLACE VIEW ai_recent_important_conversations AS
SELECT
  conversation_id,
  service,
  model,
  purpose,
  LEFT(user_prompt, 100) || '...' as prompt_preview,
  LEFT(assistant_response, 100) || '...' as response_preview,
  total_tokens,
  estimated_cost_usd,
  posted_to_forum,
  forum_thread_id,
  created_at
FROM ai_conversations
WHERE status = 'completed'
  AND purpose IN ('bug_diagnosis', 'code_review', 'critical_error')
ORDER BY created_at DESC
LIMIT 100;

-- Comments
COMMENT ON TABLE ai_conversations IS 'Complete log of all AI API calls for auditing, debugging, forum posting, and CSV export';
COMMENT ON COLUMN ai_conversations.purpose IS 'Why this AI call was made: bug_diagnosis, lesson_help, code_review, chat, etc.';
COMMENT ON COLUMN ai_conversations.context_source IS 'Which CALOS component made this call: guardian, learning_engine, cal_loop, etc.';
COMMENT ON COLUMN ai_conversations.posted_to_forum IS 'Whether this conversation was automatically posted to content forum';
COMMENT ON COLUMN ai_conversations.contains_sensitive_data IS 'Flag conversations containing secrets, credentials, or PII for privacy filtering';

-- Migration 070: User LLM Usage Tracking
-- Creates table for tracking user LLM API usage
--
-- Purpose:
-- - Track every LLM request made by users via API keys
-- - Calculate costs and billing
-- - Enforce rate limits
-- - Generate usage reports
-- - Audit trail
--
-- Usage:
--   Automatically logged by routes/llm-proxy-routes.js
--   Queried by GET /api/llm/usage endpoint

CREATE TABLE IF NOT EXISTS user_llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and API key
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id UUID NOT NULL REFERENCES user_api_keys(id) ON DELETE CASCADE,

  -- Provider and model
  provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'deepseek', 'ollama'
  model VARCHAR(100) NOT NULL,   -- 'gpt-4', 'claude-3-opus', etc.

  -- Endpoint
  endpoint VARCHAR(50) NOT NULL, -- 'chat', 'completion', 'embedding'

  -- Token usage
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,

  -- Cost
  estimated_cost_usd NUMERIC(10, 6) DEFAULT 0, -- Up to $9999.999999

  -- Performance
  latency_ms INTEGER, -- Response time in milliseconds

  -- Request metadata
  task_type VARCHAR(50), -- 'code', 'creative', 'reasoning', 'general'
  temperature NUMERIC(3, 2), -- 0.00 to 2.00
  max_tokens INTEGER,

  -- Request/response details (optional, for debugging)
  request_data JSONB,
  response_data JSONB,

  -- Error tracking
  error_message TEXT,
  error_code VARCHAR(50),

  -- Timestamp
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_llm_usage_user_id
  ON user_llm_usage(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_llm_usage_api_key_id
  ON user_llm_usage(api_key_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_llm_usage_provider
  ON user_llm_usage(provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_llm_usage_model
  ON user_llm_usage(model, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_llm_usage_created_at
  ON user_llm_usage(created_at DESC);

-- Index for rate limiting queries (last hour, last day)
CREATE INDEX IF NOT EXISTS idx_user_llm_usage_rate_limiting
  ON user_llm_usage(api_key_id, created_at)
  WHERE created_at > NOW() - INTERVAL '24 hours';

-- Comments
COMMENT ON TABLE user_llm_usage IS 'Tracks all LLM API requests made by users';
COMMENT ON COLUMN user_llm_usage.provider IS 'LLM provider (openai, anthropic, deepseek, ollama)';
COMMENT ON COLUMN user_llm_usage.model IS 'Model used (gpt-4, claude-3-opus, etc.)';
COMMENT ON COLUMN user_llm_usage.endpoint IS 'API endpoint (chat, completion, embedding)';
COMMENT ON COLUMN user_llm_usage.estimated_cost_usd IS 'Estimated cost in USD (based on provider pricing)';
COMMENT ON COLUMN user_llm_usage.latency_ms IS 'Response time in milliseconds';
COMMENT ON COLUMN user_llm_usage.task_type IS 'Type of task (code, creative, reasoning, general)';

-- View: Daily usage summary per user
CREATE OR REPLACE VIEW user_daily_usage AS
SELECT
  user_id,
  DATE(created_at) as usage_date,
  COUNT(*) as total_requests,
  SUM(total_tokens) as total_tokens,
  SUM(estimated_cost_usd) as total_cost_usd,
  AVG(latency_ms) as avg_latency_ms,
  COUNT(DISTINCT provider) as providers_used,
  COUNT(DISTINCT model) as models_used
FROM user_llm_usage
GROUP BY user_id, DATE(created_at);

COMMENT ON VIEW user_daily_usage IS 'Daily aggregated usage statistics per user';

-- View: Hourly usage (for rate limiting)
CREATE OR REPLACE VIEW user_hourly_usage AS
SELECT
  user_id,
  api_key_id,
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as requests,
  SUM(total_tokens) as tokens,
  SUM(estimated_cost_usd) as cost_usd
FROM user_llm_usage
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY user_id, api_key_id, DATE_TRUNC('hour', created_at);

COMMENT ON VIEW user_hourly_usage IS 'Hourly usage for rate limiting (last 24 hours)';

-- Function: Get user's usage in last N days
CREATE OR REPLACE FUNCTION get_user_usage(
  p_user_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE(
  total_requests BIGINT,
  total_tokens BIGINT,
  total_cost_usd NUMERIC,
  avg_latency_ms NUMERIC,
  by_provider JSONB,
  by_model JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH usage_data AS (
    SELECT
      provider,
      model,
      COUNT(*) as requests,
      SUM(total_tokens) as tokens,
      SUM(estimated_cost_usd) as cost,
      AVG(latency_ms) as latency
    FROM user_llm_usage
    WHERE user_id = p_user_id
      AND created_at > NOW() - (p_days || ' days')::INTERVAL
    GROUP BY provider, model
  )
  SELECT
    SUM(requests)::BIGINT as total_requests,
    SUM(tokens)::BIGINT as total_tokens,
    SUM(cost)::NUMERIC as total_cost_usd,
    AVG(latency)::NUMERIC as avg_latency_ms,
    jsonb_object_agg(provider, jsonb_build_object(
      'requests', requests,
      'tokens', tokens,
      'cost', cost
    )) as by_provider,
    jsonb_object_agg(model, jsonb_build_object(
      'requests', requests,
      'tokens', tokens,
      'cost', cost
    )) as by_model
  FROM usage_data;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_usage IS 'Get aggregated usage statistics for a user';

-- Function: Check rate limit (used by validate-api-key.js)
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_api_key_id UUID,
  p_hourly_limit INTEGER,
  p_daily_limit INTEGER
)
RETURNS TABLE(
  allowed BOOLEAN,
  hourly_used INTEGER,
  daily_used INTEGER
) AS $$
DECLARE
  v_hourly_used INTEGER;
  v_daily_used INTEGER;
BEGIN
  -- Count requests in last hour
  SELECT COUNT(*)::INTEGER INTO v_hourly_used
  FROM user_llm_usage
  WHERE api_key_id = p_api_key_id
    AND created_at > NOW() - INTERVAL '1 hour';

  -- Count requests in last 24 hours
  SELECT COUNT(*)::INTEGER INTO v_daily_used
  FROM user_llm_usage
  WHERE api_key_id = p_api_key_id
    AND created_at > NOW() - INTERVAL '24 hours';

  -- Check if within limits
  RETURN QUERY SELECT
    (v_hourly_used < p_hourly_limit AND v_daily_used < p_daily_limit) as allowed,
    v_hourly_used as hourly_used,
    v_daily_used as daily_used;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_rate_limit IS 'Check if API key is within rate limits';

-- Migration: Multi-Provider Tracking
-- Track tokens, costs, and metadata for OpenAI, Anthropic, DeepSeek, Ollama
-- Answer the question: "which tokens came from each provider?"

-- ============================================================================
-- ADD COLUMNS TO LEARNING_SESSIONS
-- ============================================================================

-- Provider-specific metadata (request IDs, model versions, etc.)
ALTER TABLE learning_sessions
ADD COLUMN IF NOT EXISTS provider_metadata JSONB DEFAULT '{}';

-- Provider's internal model identifier (e.g., "gpt-4-0125-preview")
ALTER TABLE learning_sessions
ADD COLUMN IF NOT EXISTS provider_model_id VARCHAR(255);

-- Provider's request/completion ID for tracing
ALTER TABLE learning_sessions
ADD COLUMN IF NOT EXISTS provider_request_id VARCHAR(255);

COMMENT ON COLUMN learning_sessions.provider_metadata IS 'Provider-specific data: usage details, finish_reason, system_fingerprint, etc.';
COMMENT ON COLUMN learning_sessions.provider_model_id IS 'Provider''s exact model identifier (e.g., gpt-4-0125-preview, claude-3-5-sonnet-20250219)';
COMMENT ON COLUMN learning_sessions.provider_request_id IS 'Provider''s request/completion ID for debugging and tracing';

-- ============================================================================
-- CREATE PROVIDER COST TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_costs (
  cost_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider info
  provider VARCHAR(100) NOT NULL, -- 'openai', 'anthropic', 'deepseek', 'ollama'
  model_name VARCHAR(255) NOT NULL, -- 'gpt-4', 'claude-3-5-sonnet', etc.

  -- Pricing (per 1K tokens)
  input_cost_per_1k DECIMAL(10, 6) NOT NULL,
  output_cost_per_1k DECIMAL(10, 6) NOT NULL,

  -- Metadata
  currency VARCHAR(3) DEFAULT 'USD',
  effective_date TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE (provider, model_name, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_provider_costs_lookup ON provider_costs(provider, model_name, effective_date DESC);

COMMENT ON TABLE provider_costs IS 'Pricing data for different providers and models';
COMMENT ON COLUMN provider_costs.input_cost_per_1k IS 'Cost per 1,000 input tokens (USD)';
COMMENT ON COLUMN provider_costs.output_cost_per_1k IS 'Cost per 1,000 output tokens (USD)';

-- ============================================================================
-- INSERT DEFAULT PROVIDER COSTS (Current as of 2025-10)
-- ============================================================================

-- OpenAI
INSERT INTO provider_costs (provider, model_name, input_cost_per_1k, output_cost_per_1k, notes)
VALUES
  ('openai', 'gpt-4-turbo', 0.01, 0.03, 'GPT-4 Turbo with Vision'),
  ('openai', 'gpt-4', 0.03, 0.06, 'GPT-4 8K context'),
  ('openai', 'gpt-4-32k', 0.06, 0.12, 'GPT-4 32K context'),
  ('openai', 'gpt-3.5-turbo', 0.0005, 0.0015, 'GPT-3.5 Turbo'),
  ('openai', 'gpt-3.5-turbo-16k', 0.003, 0.004, 'GPT-3.5 Turbo 16K')
ON CONFLICT (provider, model_name, effective_date) DO NOTHING;

-- Anthropic
INSERT INTO provider_costs (provider, model_name, input_cost_per_1k, output_cost_per_1k, notes)
VALUES
  ('anthropic', 'claude-3-5-sonnet-20250219', 0.003, 0.015, 'Claude 3.5 Sonnet (Feb 2025)'),
  ('anthropic', 'claude-3-opus-20240229', 0.015, 0.075, 'Claude 3 Opus'),
  ('anthropic', 'claude-3-sonnet-20240229', 0.003, 0.015, 'Claude 3 Sonnet'),
  ('anthropic', 'claude-3-haiku-20240307', 0.00025, 0.00125, 'Claude 3 Haiku')
ON CONFLICT (provider, model_name, effective_date) DO NOTHING;

-- DeepSeek
INSERT INTO provider_costs (provider, model_name, input_cost_per_1k, output_cost_per_1k, notes)
VALUES
  ('deepseek', 'deepseek-chat', 0.00014, 0.00028, 'DeepSeek Chat V2.5'),
  ('deepseek', 'deepseek-coder', 0.00014, 0.00028, 'DeepSeek Coder V2')
ON CONFLICT (provider, model_name, effective_date) DO NOTHING;

-- Ollama (free, but track for consistency)
INSERT INTO provider_costs (provider, model_name, input_cost_per_1k, output_cost_per_1k, notes)
VALUES
  ('ollama', 'llama3', 0, 0, 'Ollama Llama 3 - Self-hosted, free'),
  ('ollama', 'calos-model', 0, 0, 'CalOS custom model - Self-hosted, free'),
  ('ollama', 'drseuss-model', 0, 0, 'Dr Seuss custom model - Self-hosted, free')
ON CONFLICT (provider, model_name, effective_date) DO NOTHING;

-- ============================================================================
-- VIEW: Per-Provider Token and Cost Breakdown
-- ============================================================================

CREATE OR REPLACE VIEW provider_usage_breakdown AS
SELECT
  ls.provider,
  ls.model_used,
  COUNT(DISTINCT ls.user_id) AS unique_users,
  COUNT(*) AS total_sessions,
  SUM(ls.tokens_input) AS total_input_tokens,
  SUM(ls.tokens_output) AS total_output_tokens,
  SUM(ls.tokens_input + ls.tokens_output) AS total_tokens,
  SUM(ls.cost_usd) AS total_cost_usd,
  AVG(ls.latency_ms) AS avg_latency_ms,
  COUNT(*) FILTER (WHERE ls.success = true) AS successful_sessions,
  COUNT(*) FILTER (WHERE ls.success = false) AS failed_sessions
FROM learning_sessions ls
GROUP BY ls.provider, ls.model_used
ORDER BY total_cost_usd DESC, total_tokens DESC;

COMMENT ON VIEW provider_usage_breakdown IS 'Per-provider token and cost breakdown - answers "which tokens came from each provider?"';

-- ============================================================================
-- VIEW: User Provider Preferences
-- ============================================================================

CREATE OR REPLACE VIEW user_provider_preferences AS
SELECT
  u.user_id,
  u.username,
  ls.provider,
  COUNT(*) AS sessions_count,
  SUM(ls.tokens_output) AS tokens_received,
  SUM(ls.cost_usd) AS cost_spent,
  MAX(ls.created_at) AS last_used_at
FROM users u
JOIN learning_sessions ls ON ls.user_id = u.user_id
GROUP BY u.user_id, u.username, ls.provider
ORDER BY u.username, sessions_count DESC;

COMMENT ON VIEW user_provider_preferences IS 'Track which providers each user prefers';

-- ============================================================================
-- FUNCTION: Calculate Cost from Token Usage
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_provider_cost(
  p_provider VARCHAR,
  p_model VARCHAR,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER
)
RETURNS DECIMAL(10, 6) AS $$
DECLARE
  v_input_cost DECIMAL(10, 6);
  v_output_cost DECIMAL(10, 6);
  v_total_cost DECIMAL(10, 6);
BEGIN
  -- Get pricing for this provider/model
  SELECT
    input_cost_per_1k,
    output_cost_per_1k
  INTO v_input_cost, v_output_cost
  FROM provider_costs
  WHERE provider = p_provider
    AND model_name = p_model
  ORDER BY effective_date DESC
  LIMIT 1;

  -- If no pricing found, return 0 (e.g., for custom Ollama models)
  IF v_input_cost IS NULL THEN
    RETURN 0;
  END IF;

  -- Calculate cost: (tokens / 1000) * cost_per_1k
  v_total_cost :=
    (p_input_tokens / 1000.0 * v_input_cost) +
    (p_output_tokens / 1000.0 * v_output_cost);

  RETURN v_total_cost;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_provider_cost IS 'Calculate USD cost from token usage and provider pricing';

-- ============================================================================
-- EXAMPLE USAGE
-- ============================================================================

-- Example 1: Get per-provider breakdown
-- SELECT * FROM provider_usage_breakdown;

-- Example 2: Calculate cost for a session
-- SELECT calculate_provider_cost('openai', 'gpt-4', 1000, 500); -- Should return ~0.06 USD

-- Example 3: See which user prefers which provider
-- SELECT * FROM user_provider_preferences WHERE username = 'roughsparks';

-- Example 4: Update provider metadata when recording a session
-- UPDATE learning_sessions
-- SET provider_metadata = '{
--   "finish_reason": "stop",
--   "system_fingerprint": "fp_abc123",
--   "model_version": "gpt-4-0125-preview"
-- }'::jsonb,
-- provider_model_id = 'gpt-4-0125-preview',
-- provider_request_id = 'chatcmpl-ABC123'
-- WHERE session_id = '...';

-- Add context token tracking fields
-- Separates prompt tokens (context) from completion tokens (response)

ALTER TABLE ai_usage_history
  ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0;

-- Update existing rows: assume 70% prompt, 30% completion (typical ratio)
UPDATE ai_usage_history
SET
  prompt_tokens = ROUND(tokens * 0.7),
  completion_tokens = ROUND(tokens * 0.3)
WHERE prompt_tokens = 0 AND completion_tokens = 0 AND tokens > 0;

-- Add index for context queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_context_tokens ON ai_usage_history(prompt_tokens DESC, created_at DESC);

-- Create view for easy context tracking
CREATE OR REPLACE VIEW ai_context_usage AS
SELECT
  date_trunc('hour', created_at) as hour,
  instance_name,
  provider,
  model,
  SUM(prompt_tokens) as total_context_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(tokens) as total_tokens,
  COUNT(*) as request_count,
  AVG(prompt_tokens) as avg_context_per_request,
  MAX(prompt_tokens) as max_context_in_hour,
  SUM(cost_usd) as total_cost
FROM ai_usage_history
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY hour, instance_name, provider, model
ORDER BY hour DESC;

COMMENT ON COLUMN ai_usage_history.prompt_tokens IS 'Tokens used for prompt/context (input to model)';
COMMENT ON COLUMN ai_usage_history.completion_tokens IS 'Tokens generated in completion (output from model)';
COMMENT ON VIEW ai_context_usage IS 'Aggregated context usage by hour for capacity monitoring';

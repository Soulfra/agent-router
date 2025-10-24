-- Model Usage Tracking System
-- Tracks ACTUAL usage patterns to discover real-world use cases
-- (Not just theoretical capabilities)

-- Main usage log: every request to any model
CREATE TABLE IF NOT EXISTS model_usage_log (
  id SERIAL PRIMARY KEY,

  -- Request metadata
  request_id UUID DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT,  -- No FK constraint - users table has UUID primary key
  session_id TEXT,
  device_id TEXT,

  -- Model info
  model_id TEXT NOT NULL,  -- e.g., 'ollama:mistral', 'gpt-4', 'claude-3-sonnet'
  model_type TEXT,         -- 'internal' or 'external'
  model_provider TEXT,     -- 'ollama', 'openai', 'anthropic'

  -- Prompt analysis
  prompt_text TEXT,
  prompt_length INTEGER,
  prompt_hash TEXT,        -- For deduplication
  detected_intent TEXT,    -- From old system: 'code', 'creative', etc.

  -- Real-world use case (discovered via clustering)
  use_case_category TEXT,  -- e.g., 'casual_chat', 'technical_code', 'creative_writing'
  use_case_confidence REAL, -- 0.0-1.0

  -- Response metadata
  response_text TEXT,
  response_length INTEGER,
  response_tokens INTEGER,
  response_time_ms INTEGER,

  -- Success metrics
  status TEXT DEFAULT 'success',  -- 'success', 'error', 'timeout'
  error_message TEXT,

  -- Cost tracking
  cost_usd REAL DEFAULT 0,
  cost_tokens INTEGER,

  -- Routing info
  routing_rule TEXT,       -- Which rule selected this model
  was_delegated BOOLEAN DEFAULT false,
  delegated_from TEXT,

  -- Context
  room_id TEXT,
  room_slug TEXT,
  priority INTEGER,

  -- Feedback signals (implicit)
  had_followup BOOLEAN DEFAULT false,  -- User asked follow-up (bad signal)
  session_abandoned BOOLEAN DEFAULT false,
  user_satisfaction_score REAL         -- If we add explicit feedback
);

-- Indexes for fast queries
CREATE INDEX idx_usage_timestamp ON model_usage_log(timestamp DESC);
CREATE INDEX idx_usage_model ON model_usage_log(model_id);
CREATE INDEX idx_usage_use_case ON model_usage_log(use_case_category);
CREATE INDEX idx_usage_status ON model_usage_log(status);
CREATE INDEX idx_usage_user ON model_usage_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_usage_prompt_hash ON model_usage_log(prompt_hash);

-- Use case discoveries: clusters found by analyzer
CREATE TABLE IF NOT EXISTS model_use_cases (
  id SERIAL PRIMARY KEY,

  -- Use case metadata
  category_name TEXT UNIQUE NOT NULL,  -- e.g., 'casual_chat', 'starbucks_menus'
  category_slug TEXT UNIQUE NOT NULL,

  -- Discovery metadata
  discovered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  sample_count INTEGER DEFAULT 0,

  -- Characteristics
  typical_prompt_length INTEGER,
  typical_response_length INTEGER,
  avg_tokens INTEGER,

  -- Example prompts (for reference)
  example_prompts JSONB,  -- Array of sample prompts

  -- Keywords that identify this category
  keywords TEXT[],
  patterns TEXT[],  -- Regex patterns

  -- Performance requirements
  requires_fast_response BOOLEAN DEFAULT false,
  requires_high_accuracy BOOLEAN DEFAULT false,
  cost_sensitive BOOLEAN DEFAULT true
);

-- Model rankings per use case
CREATE TABLE IF NOT EXISTS model_rankings (
  id SERIAL PRIMARY KEY,

  -- What use case
  use_case_id INTEGER REFERENCES model_use_cases(id),
  use_case_category TEXT NOT NULL,

  -- Which model
  model_id TEXT NOT NULL,
  model_provider TEXT,

  -- Performance metrics (from actual usage)
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,

  -- Success rate
  success_rate REAL GENERATED ALWAYS AS (
    CASE
      WHEN total_requests > 0 THEN successful_requests::REAL / total_requests::REAL
      ELSE 0
    END
  ) STORED,

  -- Speed metrics
  avg_response_time_ms REAL,
  p95_response_time_ms REAL,

  -- Quality signals
  avg_followup_rate REAL,      -- Lower is better (means user satisfied)
  avg_abandon_rate REAL,        -- Lower is better
  avg_satisfaction_score REAL,  -- Higher is better (if we collect it)

  -- Cost
  avg_cost_per_request REAL,
  total_cost_usd REAL DEFAULT 0,

  -- Token efficiency
  avg_tokens INTEGER,
  avg_tokens_per_char REAL,

  -- Ranking score (0-100)
  ranking_score REAL,

  -- Last updated
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(use_case_category, model_id)
);

CREATE INDEX idx_rankings_use_case ON model_rankings(use_case_category);
CREATE INDEX idx_rankings_score ON model_rankings(ranking_score DESC);
CREATE INDEX idx_rankings_model ON model_rankings(model_id);

-- MinIO model storage metadata
CREATE TABLE IF NOT EXISTS model_storage (
  id SERIAL PRIMARY KEY,

  -- Model identification
  model_id TEXT UNIQUE NOT NULL,  -- e.g., 'ollama:mistral:7b-v0.3'
  model_name TEXT NOT NULL,
  model_version TEXT,

  -- MinIO bucket info
  bucket_name TEXT DEFAULT 'calos-models',
  object_path TEXT,               -- Path in bucket
  object_size BIGINT,             -- Bytes

  -- Model file metadata
  file_format TEXT,               -- 'gguf', 'safetensors', etc.
  quantization TEXT,              -- 'Q4_K_M', 'Q8_0', etc.
  parameter_count TEXT,           -- '7B', '13B', etc.

  -- Model metadata
  family TEXT,                    -- 'llama', 'mistral', etc.
  trained_on TEXT,
  context_length INTEGER,

  -- Availability
  is_downloaded BOOLEAN DEFAULT false,
  local_path TEXT,

  -- Timestamps
  uploaded_at TIMESTAMPTZ,
  last_accessed TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_storage_model ON model_storage(model_id);
CREATE INDEX idx_storage_bucket ON model_storage(bucket_name, object_path);

-- Usage analytics view: aggregated stats
CREATE OR REPLACE VIEW model_usage_stats AS
SELECT
  model_id,
  model_provider,
  use_case_category,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE status = 'success') as successful_requests,
  COUNT(*) FILTER (WHERE status = 'error') as failed_requests,
  AVG(response_time_ms) as avg_response_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time_ms,
  AVG(response_tokens) as avg_tokens,
  SUM(cost_usd) as total_cost_usd,
  AVG(cost_usd) as avg_cost_per_request,
  COUNT(*) FILTER (WHERE had_followup = true)::REAL / COUNT(*)::REAL as followup_rate,
  COUNT(*) FILTER (WHERE session_abandoned = true)::REAL / COUNT(*)::REAL as abandon_rate,
  MIN(timestamp) as first_used,
  MAX(timestamp) as last_used
FROM model_usage_log
GROUP BY model_id, model_provider, use_case_category;

-- Discovery: Find most common prompt patterns
CREATE OR REPLACE FUNCTION find_prompt_patterns(
  min_occurrences INTEGER DEFAULT 10
)
RETURNS TABLE(
  pattern_hash TEXT,
  example_prompt TEXT,
  occurrence_count BIGINT,
  avg_response_time_ms REAL,
  models_used TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.prompt_hash,
    MIN(l.prompt_text) as example_prompt,
    COUNT(*) as occurrence_count,
    AVG(l.response_time_ms) as avg_response_time_ms,
    ARRAY_AGG(DISTINCT l.model_id) as models_used
  FROM model_usage_log l
  WHERE l.prompt_hash IS NOT NULL
  GROUP BY l.prompt_hash
  HAVING COUNT(*) >= min_occurrences
  ORDER BY occurrence_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Helper: Calculate ranking score for a model/use-case pair
CREATE OR REPLACE FUNCTION calculate_ranking_score(
  p_use_case TEXT,
  p_model_id TEXT
)
RETURNS REAL AS $$
DECLARE
  v_success_rate REAL;
  v_avg_time REAL;
  v_avg_cost REAL;
  v_followup_rate REAL;
  v_score REAL;
BEGIN
  -- Get metrics from usage log
  SELECT
    COUNT(*) FILTER (WHERE status = 'success')::REAL / COUNT(*)::REAL,
    AVG(response_time_ms),
    AVG(cost_usd),
    COUNT(*) FILTER (WHERE had_followup = true)::REAL / COUNT(*)::REAL
  INTO v_success_rate, v_avg_time, v_avg_cost, v_followup_rate
  FROM model_usage_log
  WHERE use_case_category = p_use_case
    AND model_id = p_model_id;

  IF v_success_rate IS NULL THEN
    RETURN 0;  -- No data
  END IF;

  -- Calculate score (0-100)
  -- Higher success rate = better
  -- Lower response time = better
  -- Lower cost = better
  -- Lower followup rate = better (user satisfied)

  v_score :=
    (v_success_rate * 40) +                           -- 40% weight on success
    ((1.0 - (v_avg_time / 10000.0)) * 30) +          -- 30% weight on speed
    ((1.0 - LEAST(v_avg_cost / 0.1, 1.0)) * 20) +    -- 20% weight on cost
    ((1.0 - v_followup_rate) * 10);                   -- 10% weight on satisfaction

  RETURN GREATEST(LEAST(v_score, 100), 0);  -- Clamp 0-100
END;
$$ LANGUAGE plpgsql;

-- Refresh rankings periodically
CREATE OR REPLACE FUNCTION refresh_model_rankings()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Upsert rankings for all use-case/model combinations
  INSERT INTO model_rankings (
    use_case_category,
    model_id,
    model_provider,
    total_requests,
    successful_requests,
    failed_requests,
    avg_response_time_ms,
    p95_response_time_ms,
    avg_tokens,
    avg_cost_per_request,
    total_cost_usd,
    avg_followup_rate,
    avg_abandon_rate,
    ranking_score,
    last_updated
  )
  SELECT
    use_case_category,
    model_id,
    model_provider,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status = 'error'),
    AVG(response_time_ms),
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms),
    AVG(response_tokens),
    AVG(cost_usd),
    SUM(cost_usd),
    AVG(CASE WHEN had_followup THEN 1.0 ELSE 0.0 END),
    AVG(CASE WHEN session_abandoned THEN 1.0 ELSE 0.0 END),
    calculate_ranking_score(use_case_category, model_id),
    CURRENT_TIMESTAMP
  FROM model_usage_log
  WHERE use_case_category IS NOT NULL
    AND model_id IS NOT NULL
  GROUP BY use_case_category, model_id, model_provider
  ON CONFLICT (use_case_category, model_id) DO UPDATE SET
    total_requests = EXCLUDED.total_requests,
    successful_requests = EXCLUDED.successful_requests,
    failed_requests = EXCLUDED.failed_requests,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    p95_response_time_ms = EXCLUDED.p95_response_time_ms,
    avg_tokens = EXCLUDED.avg_tokens,
    avg_cost_per_request = EXCLUDED.avg_cost_per_request,
    total_cost_usd = EXCLUDED.total_cost_usd,
    avg_followup_rate = EXCLUDED.avg_followup_rate,
    avg_abandon_rate = EXCLUDED.avg_abandon_rate,
    ranking_score = EXCLUDED.ranking_score,
    last_updated = EXCLUDED.last_updated;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Seed some initial use case categories
INSERT INTO model_use_cases (category_name, category_slug, keywords, requires_fast_response, cost_sensitive) VALUES
  ('Casual Chat', 'casual_chat', ARRAY['hello', 'hi', 'what', 'where', 'when', 'menu', 'hours', 'open'], true, true),
  ('Technical Code', 'technical_code', ARRAY['code', 'function', 'debug', 'implement', 'refactor', 'algorithm'], false, false),
  ('Creative Writing', 'creative_writing', ARRAY['write', 'story', 'poem', 'creative', 'draft', 'compose'], false, false),
  ('Data Analysis', 'data_analysis', ARRAY['analyze', 'compare', 'calculate', 'statistics', 'trends'], false, false),
  ('Quick Lookup', 'quick_lookup', ARRAY['define', 'what is', 'who is', 'meaning of'], true, true)
ON CONFLICT (category_slug) DO NOTHING;

-- Add comment
COMMENT ON TABLE model_usage_log IS 'Tracks every model request to discover real-world usage patterns';
COMMENT ON TABLE model_use_cases IS 'Discovered use case categories based on actual usage clustering';
COMMENT ON TABLE model_rankings IS 'Model performance rankings per use case, based on real metrics';
COMMENT ON TABLE model_storage IS 'MinIO bucket storage metadata for model files';

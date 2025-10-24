-- Model Wrappers System
-- Different "personalities" and configurations for the same model

-- Custom wrappers (in addition to built-in ones)
CREATE TABLE IF NOT EXISTS model_wrappers (
  id SERIAL PRIMARY KEY,

  -- Wrapper identity
  wrapper_name TEXT UNIQUE NOT NULL,  -- e.g., 'concise', 'detailed', 'code-only'
  display_name TEXT NOT NULL,         -- Human-friendly name
  description TEXT,

  -- Configuration
  config JSONB NOT NULL,              -- {systemPromptSuffix, temperature, maxTokens, etc.}
  applicable_domains TEXT[],          -- Which domains this works with (['*'] for all)

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  avg_satisfaction_score REAL,

  -- Metadata
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wrappers_name ON model_wrappers(wrapper_name);
CREATE INDEX idx_wrappers_domains ON model_wrappers USING GIN(applicable_domains);

-- Wrapper performance metrics (per wrapper + domain + profile)
CREATE TABLE IF NOT EXISTS wrapper_performance (
  id SERIAL PRIMARY KEY,

  -- What wrapper
  wrapper_name TEXT NOT NULL,

  -- What context
  domain TEXT NOT NULL,
  user_profile TEXT,                 -- Optional: track per profile

  -- Time period
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Usage metrics
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,

  -- Success rate
  success_rate REAL GENERATED ALWAYS AS (
    CASE
      WHEN total_requests > 0 THEN successful_requests::REAL / total_requests::REAL
      ELSE 0
    END
  ) STORED,

  -- Performance
  avg_response_time_ms REAL,
  avg_cost_per_request REAL,

  -- Quality signals
  avg_followup_rate REAL,          -- Lower is better (user satisfied)
  avg_satisfaction_score REAL,     -- Higher is better
  completion_rate REAL,             -- % of sessions completed

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(wrapper_name, domain, user_profile, date)
);

CREATE INDEX idx_wrapper_perf_wrapper ON wrapper_performance(wrapper_name);
CREATE INDEX idx_wrapper_perf_domain ON wrapper_performance(domain);
CREATE INDEX idx_wrapper_perf_profile ON wrapper_performance(user_profile);
CREATE INDEX idx_wrapper_perf_date ON wrapper_performance(date DESC);

-- Wrapper usage log (sampled for analysis)
CREATE TABLE IF NOT EXISTS wrapper_usage_samples (
  id SERIAL PRIMARY KEY,

  -- Context
  wrapper_name TEXT NOT NULL,
  domain TEXT,
  user_profile TEXT,
  user_id INTEGER REFERENCES users(id),

  -- Request/response
  prompt_text TEXT,
  response_text TEXT,
  response_length INTEGER,

  -- Metrics
  response_time_ms INTEGER,
  cost_usd REAL,
  status TEXT,                     -- 'success', 'error', 'timeout'

  -- Feedback
  user_satisfaction_score REAL,
  had_followup BOOLEAN,

  -- Metadata
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wrapper_samples_wrapper ON wrapper_usage_samples(wrapper_name);
CREATE INDEX idx_wrapper_samples_timestamp ON wrapper_usage_samples(timestamp DESC);

-- Function to refresh wrapper performance stats
CREATE OR REPLACE FUNCTION refresh_wrapper_performance(days_back INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  -- Aggregate usage data by wrapper, domain, profile, and date
  INSERT INTO wrapper_performance (
    wrapper_name,
    domain,
    user_profile,
    date,
    total_requests,
    successful_requests,
    avg_response_time_ms,
    avg_cost_per_request,
    avg_followup_rate,
    updated_at
  )
  SELECT
    mul.wrapper_name,
    mul.use_case_category as domain,
    COALESCE(up.selected_profile, up.detected_profile) as user_profile,
    DATE(mul.timestamp) as date,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE mul.status = 'success') as successful_requests,
    AVG(mul.response_time_ms) as avg_response_time_ms,
    AVG(mul.cost_usd) as avg_cost_per_request,
    AVG(CASE WHEN mul.had_followup THEN 1 ELSE 0 END) as avg_followup_rate,
    NOW() as updated_at
  FROM model_usage_log mul
  LEFT JOIN user_profiles up ON up.user_id = mul.user_id
  WHERE mul.timestamp >= CURRENT_DATE - (days_back || ' days')::INTERVAL
    AND mul.wrapper_name IS NOT NULL
  GROUP BY mul.wrapper_name, mul.use_case_category, COALESCE(up.selected_profile, up.detected_profile), DATE(mul.timestamp)
  ON CONFLICT (wrapper_name, domain, user_profile, date) DO UPDATE SET
    total_requests = EXCLUDED.total_requests,
    successful_requests = EXCLUDED.successful_requests,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    avg_cost_per_request = EXCLUDED.avg_cost_per_request,
    avg_followup_rate = EXCLUDED.avg_followup_rate,
    updated_at = NOW();

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

-- Function to sample wrapper usage (for analysis)
CREATE OR REPLACE FUNCTION sample_wrapper_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- Sample 5% of wrapper usage for detailed analysis
  IF NEW.wrapper_name IS NOT NULL AND random() < 0.05 THEN
    INSERT INTO wrapper_usage_samples (
      wrapper_name, domain, user_profile, user_id,
      prompt_text, response_text, response_length,
      response_time_ms, cost_usd, status,
      had_followup, timestamp
    )
    SELECT
      NEW.wrapper_name,
      NEW.use_case_category,
      COALESCE(up.selected_profile, up.detected_profile),
      NEW.user_id,
      NEW.prompt_text,
      NEW.response_text,
      NEW.response_length,
      NEW.response_time_ms,
      NEW.cost_usd,
      NEW.status,
      NEW.had_followup,
      NEW.timestamp
    FROM user_profiles up
    WHERE up.user_id = NEW.user_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sample wrapper usage
CREATE TRIGGER sample_wrapper_usage_trigger
AFTER INSERT ON model_usage_log
FOR EACH ROW
EXECUTE FUNCTION sample_wrapper_usage();

-- Seed some example custom wrappers (these are examples - can be removed)
INSERT INTO model_wrappers (wrapper_name, display_name, description, config, applicable_domains)
VALUES
  ('senior-dev', 'Senior Developer', 'Assume senior-level expertise, use advanced patterns',
   '{"systemPromptSuffix": "\\n\\nAssume senior developer expertise. Focus on best practices, performance, and maintainability.", "temperature": 0.4, "maxTokens": 800}',
   ARRAY['code', 'cryptography']),

  ('5-min-tutorial', '5-Minute Tutorial', 'Quick tutorial format with time estimates',
   '{"systemPromptSuffix": "\\n\\nProvide a 5-minute quick-start tutorial. Include estimated time for each step. Keep it practical.", "temperature": 0.6, "maxTokens": 600}',
   ARRAY['*']),

  ('tldr', 'TL;DR', 'One-sentence summary',
   '{"systemPromptSuffix": "\\n\\nProvide ONLY a one-sentence TL;DR summary. No elaboration.", "temperature": 0.3, "maxTokens": 50}',
   ARRAY['*'])
ON CONFLICT (wrapper_name) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE model_wrappers IS 'Custom wrapper configurations (in addition to built-in ones)';
COMMENT ON TABLE wrapper_performance IS 'Performance metrics per wrapper, domain, and profile';
COMMENT ON TABLE wrapper_usage_samples IS 'Sampled wrapper usage for detailed analysis (5% sample rate)';
COMMENT ON FUNCTION refresh_wrapper_performance IS 'Refresh wrapper performance stats from usage logs (call daily)';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON model_wrappers TO agent_router_app;
-- GRANT SELECT ON wrapper_performance TO agent_router_app;
-- GRANT SELECT ON wrapper_usage_samples TO agent_router_app;

-- Initial completion message
DO $$
BEGIN
  RAISE NOTICE 'Model Wrappers System installed successfully!';
  RAISE NOTICE '- 9 built-in wrappers available (default, concise, detailed, code-only, etc.)';
  RAISE NOTICE '- 3 example custom wrappers seeded';
  RAISE NOTICE '- Performance tracking enabled (per wrapper + domain + profile)';
  RAISE NOTICE '- 5%% usage sampling for analysis';
  RAISE NOTICE 'Next: Run refresh_wrapper_performance() daily via cron';
END $$;

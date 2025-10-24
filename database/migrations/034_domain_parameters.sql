-- Domain Parameter Presets
-- Store temperature, max_tokens, and other model parameters per domain
--
-- Key insight: Different domains need different parameters
-- - Code domain: Low temperature (0.2-0.3) for consistency
-- - Creative domain: High temperature (0.8-0.9) for variety
-- - Reasoning domain: Medium temperature (0.5-0.6) for balance
--
-- Integrates with: multi-llm-router, model_wrappers, bucket_instances

-- ============================================================================
-- Domain Parameter Presets
-- Parameter configurations per domain
-- ============================================================================

CREATE TABLE IF NOT EXISTS domain_parameter_presets (
  preset_id TEXT PRIMARY KEY,

  -- Which domain
  domain_context TEXT NOT NULL,   -- 'code', 'creative', 'reasoning', 'fact', 'simple'

  -- Preset identification
  preset_name TEXT NOT NULL,      -- 'default', 'precise', 'creative', 'balanced'
  preset_slug TEXT NOT NULL,
  description TEXT,

  -- Model parameters
  temperature REAL NOT NULL DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  top_p REAL DEFAULT 0.9 CHECK (top_p >= 0 AND top_p <= 1),
  top_k INTEGER DEFAULT NULL CHECK (top_k IS NULL OR top_k > 0),
  max_tokens INTEGER DEFAULT 2000 CHECK (max_tokens > 0),
  frequency_penalty REAL DEFAULT 0 CHECK (frequency_penalty >= -2 AND frequency_penalty <= 2),
  presence_penalty REAL DEFAULT 0 CHECK (presence_penalty >= -2 AND presence_penalty <= 2),
  repetition_penalty REAL DEFAULT 1.0 CHECK (repetition_penalty >= 0 AND repetition_penalty <= 2),

  -- Stop sequences
  stop_sequences TEXT[],

  -- Context/memory
  context_window_tokens INTEGER,
  memory_tokens INTEGER,           -- How many tokens to use for memory/context

  -- Streaming
  enable_streaming BOOLEAN DEFAULT true,

  -- Safety/moderation
  enable_content_filter BOOLEAN DEFAULT true,
  max_retries INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 120,

  -- Domain-specific tweaks
  system_prompt_suffix TEXT,      -- Append to system prompt for this domain
  response_format TEXT,            -- 'text', 'json', 'markdown', 'code'

  -- Advanced settings
  mirostat INTEGER,                -- 0, 1, or 2 (Ollama-specific)
  mirostat_tau REAL,
  mirostat_eta REAL,
  num_ctx INTEGER,                 -- Context window for Ollama
  num_predict INTEGER,             -- Max tokens for Ollama

  -- Provider-specific overrides
  openai_params JSONB,             -- OpenAI-specific parameters
  anthropic_params JSONB,          -- Claude-specific parameters
  ollama_params JSONB,             -- Ollama-specific parameters

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  avg_success_rate REAL,
  avg_response_time_ms REAL,
  avg_user_rating REAL,

  -- Status
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'testing', 'deprecated', 'archived')),

  -- Version control
  version INTEGER DEFAULT 1,
  parent_preset_id TEXT REFERENCES domain_parameter_presets(preset_id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(domain_context, preset_slug)
);

CREATE INDEX idx_domain_params_domain ON domain_parameter_presets(domain_context);
CREATE INDEX idx_domain_params_slug ON domain_parameter_presets(preset_slug);
CREATE INDEX idx_domain_params_default ON domain_parameter_presets(is_default) WHERE is_default = true;
CREATE INDEX idx_domain_params_active ON domain_parameter_presets(is_active) WHERE is_active = true;
CREATE INDEX idx_domain_params_status ON domain_parameter_presets(status);

-- ============================================================================
-- Parameter Performance Tracking
-- Track how different parameters perform
-- ============================================================================

CREATE TABLE IF NOT EXISTS parameter_performance_log (
  id SERIAL PRIMARY KEY,

  -- Which preset
  preset_id TEXT NOT NULL REFERENCES domain_parameter_presets(preset_id) ON DELETE CASCADE,

  -- Context
  domain_context TEXT NOT NULL,
  model_id TEXT NOT NULL,
  request_id TEXT,

  -- Request/response
  prompt_tokens INTEGER,
  response_tokens INTEGER,
  response_time_ms INTEGER,

  -- Quality metrics
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  had_followup BOOLEAN,            -- User asked follow-up (implicit negative signal)

  -- Cost
  cost_usd REAL,

  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_param_perf_preset ON parameter_performance_log(preset_id);
CREATE INDEX idx_param_perf_domain ON parameter_performance_log(domain_context);
CREATE INDEX idx_param_perf_model ON parameter_performance_log(model_id);
CREATE INDEX idx_param_perf_timestamp ON parameter_performance_log(timestamp DESC);
CREATE INDEX idx_param_perf_success ON parameter_performance_log(success);

-- ============================================================================
-- Domain + Model Combinations
-- Optimal parameters for specific domain+model pairs
-- ============================================================================

CREATE TABLE IF NOT EXISTS domain_model_parameters (
  id SERIAL PRIMARY KEY,

  -- Which combination
  domain_context TEXT NOT NULL,
  model_id TEXT NOT NULL,

  -- Best preset for this combination
  recommended_preset_id TEXT REFERENCES domain_parameter_presets(preset_id),

  -- Override parameters (if needed)
  override_params JSONB,

  -- Performance metrics
  avg_success_rate REAL,
  avg_response_time_ms REAL,
  avg_cost_per_1k_tokens REAL,
  avg_user_rating REAL,
  total_requests INTEGER DEFAULT 0,

  -- Optimization notes
  optimization_notes TEXT,
  last_optimized_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(domain_context, model_id)
);

CREATE INDEX idx_domain_model_params_domain ON domain_model_parameters(domain_context);
CREATE INDEX idx_domain_model_params_model ON domain_model_parameters(model_id);
CREATE INDEX idx_domain_model_params_combo ON domain_model_parameters(domain_context, model_id);

-- ============================================================================
-- Parameter A/B Testing
-- Test different parameter configurations
-- ============================================================================

CREATE TABLE IF NOT EXISTS parameter_ab_tests (
  test_id TEXT PRIMARY KEY,

  -- Test metadata
  test_name TEXT NOT NULL,
  description TEXT,

  -- Which domain
  domain_context TEXT NOT NULL,

  -- Variants
  control_preset_id TEXT NOT NULL REFERENCES domain_parameter_presets(preset_id),
  variant_preset_id TEXT NOT NULL REFERENCES domain_parameter_presets(preset_id),

  -- Traffic split
  traffic_split REAL DEFAULT 0.5 CHECK (traffic_split >= 0 AND traffic_split <= 1),

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),

  -- Results
  control_requests INTEGER DEFAULT 0,
  variant_requests INTEGER DEFAULT 0,
  control_success_rate REAL,
  variant_success_rate REAL,
  control_avg_response_time REAL,
  variant_avg_response_time REAL,
  control_avg_rating REAL,
  variant_avg_rating REAL,

  -- Statistical significance
  p_value REAL,
  confidence_level REAL,           -- 0.90, 0.95, 0.99
  winner TEXT,                     -- 'control', 'variant', 'inconclusive'

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_ab_tests_domain ON parameter_ab_tests(domain_context);
CREATE INDEX idx_ab_tests_status ON parameter_ab_tests(status);

-- ============================================================================
-- Seed Default Presets
-- ============================================================================

INSERT INTO domain_parameter_presets (
  preset_id,
  domain_context,
  preset_name,
  preset_slug,
  description,
  temperature,
  top_p,
  max_tokens,
  is_default,
  system_prompt_suffix
) VALUES
  -- Code domain: Precise, consistent, low temperature
  ('preset_code_default', 'code', 'Default (Precise)', 'default',
   'Balanced precision for code generation', 0.3, 0.9, 2000, true,
   '\nFocus on clean, maintainable code with proper error handling.'),

  ('preset_code_creative', 'code', 'Creative', 'creative',
   'More variety in code solutions', 0.6, 0.95, 2000, false,
   '\nExplore multiple approaches and creative solutions.'),

  ('preset_code_strict', 'code', 'Strict', 'strict',
   'Ultra-precise for production code', 0.1, 0.9, 3000, false,
   '\nFollowing strict best practices and style guidelines.'),

  -- Creative domain: High temperature, variety
  ('preset_creative_default', 'creative', 'Default (Expressive)', 'default',
   'Balanced creativity and coherence', 0.8, 0.95, 3000, true,
   '\nBe creative while maintaining quality and coherence.'),

  ('preset_creative_wild', 'creative', 'Wild', 'wild',
   'Maximum creativity and variety', 1.2, 0.98, 3000, false,
   '\nPush boundaries, be unconventional and surprising.'),

  ('preset_creative_controlled', 'creative', 'Controlled', 'controlled',
   'Creative but grounded', 0.6, 0.9, 2500, false,
   '\nCreative within reasonable bounds.'),

  -- Reasoning domain: Balanced for logical thinking
  ('preset_reasoning_default', 'reasoning', 'Default (Balanced)', 'default',
   'Balanced reasoning and exploration', 0.5, 0.9, 2500, true,
   '\nThink step-by-step and explain your reasoning.'),

  ('preset_reasoning_logical', 'reasoning', 'Logical', 'logical',
   'Strict logical reasoning', 0.2, 0.9, 3000, false,
   '\nFollow strict logical rules and formal reasoning.'),

  ('preset_reasoning_exploratory', 'reasoning', 'Exploratory', 'exploratory',
   'Explore multiple reasoning paths', 0.7, 0.95, 3000, false,
   '\nConsider multiple perspectives and reasoning approaches.'),

  -- Fact domain: Low temperature for accuracy
  ('preset_fact_default', 'fact', 'Default (Accurate)', 'default',
   'Precise factual responses', 0.2, 0.9, 1500, true,
   '\nProvide accurate, well-sourced factual information.'),

  ('preset_fact_strict', 'fact', 'Strict', 'strict',
   'Ultra-precise facts only', 0.05, 0.85, 1500, false,
   '\nStick to verified facts only, cite sources.'),

  -- Simple domain: Balanced, easy to understand
  ('preset_simple_default', 'simple', 'Default (Clear)', 'default',
   'Clear and simple responses', 0.4, 0.9, 1500, true,
   '\nKeep explanations simple and easy to understand.'),

  ('preset_simple_conversational', 'simple', 'Conversational', 'conversational',
   'Natural conversation style', 0.7, 0.9, 2000, false,
   '\nBe conversational and friendly.')

ON CONFLICT (domain_context, preset_slug) DO NOTHING;

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Active presets per domain
CREATE OR REPLACE VIEW active_domain_presets AS
SELECT
  dpp.preset_id,
  dpp.domain_context,
  dpp.preset_name,
  dpp.preset_slug,
  dpp.temperature,
  dpp.max_tokens,
  dpp.is_default,
  dpp.times_used,
  dpp.avg_success_rate,
  dpp.avg_user_rating
FROM domain_parameter_presets dpp
WHERE dpp.is_active = true
  AND dpp.status = 'active'
ORDER BY dpp.domain_context, dpp.is_default DESC, dpp.times_used DESC;

-- Parameter performance comparison
CREATE OR REPLACE VIEW preset_performance_comparison AS
SELECT
  dpp.domain_context,
  dpp.preset_name,
  COUNT(ppl.id) as total_requests,
  AVG(CASE WHEN ppl.success THEN 1.0 ELSE 0.0 END) as success_rate,
  AVG(ppl.response_time_ms) as avg_response_time_ms,
  AVG(ppl.user_rating) as avg_user_rating,
  AVG(ppl.cost_usd) as avg_cost_usd
FROM domain_parameter_presets dpp
LEFT JOIN parameter_performance_log ppl ON dpp.preset_id = ppl.preset_id
WHERE dpp.is_active = true
GROUP BY dpp.domain_context, dpp.preset_name
ORDER BY dpp.domain_context, success_rate DESC;

-- Best parameters per domain+model
CREATE OR REPLACE VIEW optimal_domain_model_params AS
SELECT
  dmp.domain_context,
  dmp.model_id,
  dpp.preset_name,
  dpp.temperature,
  dpp.max_tokens,
  dmp.avg_success_rate,
  dmp.avg_response_time_ms,
  dmp.avg_cost_per_1k_tokens,
  dmp.total_requests
FROM domain_model_parameters dmp
JOIN domain_parameter_presets dpp ON dmp.recommended_preset_id = dpp.preset_id
WHERE dmp.total_requests > 10
ORDER BY dmp.domain_context, dmp.avg_success_rate DESC;

-- ============================================================================
-- Helper Functions
-- ============================================================================

/**
 * Get recommended preset for domain + model
 */
CREATE OR REPLACE FUNCTION get_recommended_preset(
  p_domain_context TEXT,
  p_model_id TEXT DEFAULT NULL
) RETURNS TABLE(
  preset_id TEXT,
  preset_name TEXT,
  temperature REAL,
  top_p REAL,
  max_tokens INTEGER,
  system_prompt_suffix TEXT
) AS $$
BEGIN
  -- Try domain+model combination first
  IF p_model_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      dpp.preset_id,
      dpp.preset_name,
      COALESCE((dmp.override_params->>'temperature')::REAL, dpp.temperature) as temperature,
      COALESCE((dmp.override_params->>'top_p')::REAL, dpp.top_p) as top_p,
      COALESCE((dmp.override_params->>'max_tokens')::INTEGER, dpp.max_tokens) as max_tokens,
      dpp.system_prompt_suffix
    FROM domain_model_parameters dmp
    JOIN domain_parameter_presets dpp ON dmp.recommended_preset_id = dpp.preset_id
    WHERE dmp.domain_context = p_domain_context
      AND dmp.model_id = p_model_id
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Fall back to domain default
  RETURN QUERY
  SELECT
    dpp.preset_id,
    dpp.preset_name,
    dpp.temperature,
    dpp.top_p,
    dpp.max_tokens,
    dpp.system_prompt_suffix
  FROM domain_parameter_presets dpp
  WHERE dpp.domain_context = p_domain_context
    AND dpp.is_default = true
    AND dpp.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update timestamps
CREATE TRIGGER update_domain_params_updated_at
  BEFORE UPDATE ON domain_parameter_presets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domain_model_params_updated_at
  BEFORE UPDATE ON domain_model_parameters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Ensure only one default per domain
CREATE OR REPLACE FUNCTION enforce_single_default_preset()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE domain_parameter_presets
    SET is_default = false
    WHERE domain_context = NEW.domain_context
      AND preset_id != NEW.preset_id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enforce_single_default_preset
  BEFORE INSERT OR UPDATE ON domain_parameter_presets
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION enforce_single_default_preset();

-- Update preset usage stats
CREATE OR REPLACE FUNCTION update_preset_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE domain_parameter_presets
  SET
    times_used = times_used + 1,
    avg_success_rate = (
      SELECT AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END)
      FROM parameter_performance_log
      WHERE preset_id = NEW.preset_id
    ),
    avg_response_time_ms = (
      SELECT AVG(response_time_ms)
      FROM parameter_performance_log
      WHERE preset_id = NEW.preset_id
        AND response_time_ms IS NOT NULL
    ),
    avg_user_rating = (
      SELECT AVG(user_rating)
      FROM parameter_performance_log
      WHERE preset_id = NEW.preset_id
        AND user_rating IS NOT NULL
    )
  WHERE preset_id = NEW.preset_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_preset_stats
  AFTER INSERT ON parameter_performance_log
  FOR EACH ROW EXECUTE FUNCTION update_preset_stats();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE domain_parameter_presets IS 'Model parameter configurations per domain (temperature, max_tokens, etc.)';
COMMENT ON TABLE parameter_performance_log IS 'Track performance of different parameter configurations';
COMMENT ON TABLE domain_model_parameters IS 'Optimal parameters for specific domain+model combinations';
COMMENT ON TABLE parameter_ab_tests IS 'A/B testing of different parameter configurations';
COMMENT ON COLUMN domain_parameter_presets.temperature IS 'Sampling temperature: 0=deterministic, 2=random (0.0-2.0)';
COMMENT ON COLUMN domain_parameter_presets.system_prompt_suffix IS 'Append to system prompt for this domain';
COMMENT ON FUNCTION get_recommended_preset IS 'Get recommended preset for domain + model combination';

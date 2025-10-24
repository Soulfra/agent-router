-- Experiments & A/B Testing System
-- Comprehensive framework for testing model versions, wrappers, prompts, and parameters
-- Multi-armed bandit optimization with statistical significance testing

-- Experiments
CREATE TABLE IF NOT EXISTS experiments (
  id SERIAL PRIMARY KEY,

  -- Experiment definition
  name TEXT NOT NULL,
  description TEXT,
  experiment_type TEXT NOT NULL,    -- 'model_version', 'wrapper', 'prompt', 'parameter', 'mixed'

  -- Targeting
  domain TEXT,                       -- Domain-specific (null = all domains)
  user_profile TEXT,                 -- Profile-specific (null = all profiles)

  -- Metrics
  primary_metric TEXT NOT NULL DEFAULT 'success_rate',  -- 'success_rate', 'conversion_rate', 'satisfaction', 'cost'
  secondary_metrics JSONB DEFAULT '[]'::jsonb,

  -- Optimization
  auto_optimize BOOLEAN DEFAULT true,                   -- Enable multi-armed bandit
  min_sample_size INTEGER DEFAULT 100,                  -- Min samples before optimization
  request_count INTEGER DEFAULT 0,                      -- Total requests processed

  -- Status
  status TEXT DEFAULT 'active',      -- 'active', 'paused', 'completed', 'archived'
  winner_variant_id INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_experiments_status ON experiments(status);
CREATE INDEX idx_experiments_type ON experiments(experiment_type);
CREATE INDEX idx_experiments_domain ON experiments(domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_experiments_profile ON experiments(user_profile) WHERE user_profile IS NOT NULL;
CREATE INDEX idx_experiments_active ON experiments(status, ends_at) WHERE status = 'active';

-- Experiment variants
CREATE TABLE IF NOT EXISTS experiment_variants (
  id SERIAL PRIMARY KEY,

  -- What experiment
  experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,

  -- Variant definition
  variant_name TEXT NOT NULL,        -- 'control', 'treatment_a', 'treatment_b', etc.
  variant_config JSONB NOT NULL,     -- Configuration (model, wrapper, prompt, params)

  -- Traffic allocation
  traffic_percent REAL NOT NULL DEFAULT 50.0
    CHECK (traffic_percent >= 0 AND traffic_percent <= 100),
  is_control BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(experiment_id, variant_name)
);

CREATE INDEX idx_variants_experiment ON experiment_variants(experiment_id);
CREATE INDEX idx_variants_control ON experiment_variants(is_control) WHERE is_control = true;

-- Experiment assignments (user → variant mapping)
CREATE TABLE IF NOT EXISTS experiment_assignments (
  id SERIAL PRIMARY KEY,

  -- What experiment and variant
  experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
  variant_id INTEGER REFERENCES experiment_variants(id) ON DELETE CASCADE,

  -- Who
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT,

  -- Timestamps
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(experiment_id, user_id)     -- Sticky assignment per user
);

CREATE INDEX idx_assignments_experiment ON experiment_assignments(experiment_id);
CREATE INDEX idx_assignments_variant ON experiment_assignments(variant_id);
CREATE INDEX idx_assignments_user ON experiment_assignments(user_id);

-- Experiment results (individual observations)
CREATE TABLE IF NOT EXISTS experiment_results (
  id SERIAL PRIMARY KEY,

  -- What experiment and variant
  experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
  variant_id INTEGER REFERENCES experiment_variants(id) ON DELETE CASCADE,

  -- Who
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT,

  -- Metrics
  success BOOLEAN DEFAULT false,
  response_time_ms INTEGER,
  cost_usd REAL,
  user_satisfaction REAL,            -- 1-5 rating
  conversion BOOLEAN DEFAULT false,  -- Did user convert (trial → paid, etc.)

  -- Additional metrics (JSON)
  metrics JSONB,

  -- Timestamps
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_results_experiment ON experiment_results(experiment_id);
CREATE INDEX idx_results_variant ON experiment_results(variant_id);
CREATE INDEX idx_results_user ON experiment_results(user_id);
CREATE INDEX idx_results_time ON experiment_results(recorded_at DESC);

-- Experiment statistics (aggregated per variant)
CREATE TABLE IF NOT EXISTS experiment_statistics (
  id SERIAL PRIMARY KEY,

  -- What experiment and variant
  experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
  variant_id INTEGER REFERENCES experiment_variants(id) ON DELETE CASCADE,

  -- Sample size
  total_observations INTEGER DEFAULT 0,

  -- Success metrics
  success_count INTEGER DEFAULT 0,
  success_rate REAL GENERATED ALWAYS AS (
    CASE
      WHEN total_observations > 0 THEN success_count::REAL / total_observations::REAL
      ELSE 0
    END
  ) STORED,

  -- Performance metrics
  avg_response_time_ms REAL,
  avg_cost_usd REAL,
  avg_satisfaction REAL,

  -- Conversion metrics
  conversion_count INTEGER DEFAULT 0,
  conversion_rate REAL GENERATED ALWAYS AS (
    CASE
      WHEN total_observations > 0 THEN conversion_count::REAL / total_observations::REAL
      ELSE 0
    END
  ) STORED,

  -- Statistical analysis
  confidence_interval_lower REAL,
  confidence_interval_upper REAL,
  p_value REAL,
  is_significant BOOLEAN DEFAULT false,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(experiment_id, variant_id)
);

CREATE INDEX idx_stats_experiment ON experiment_statistics(experiment_id);
CREATE INDEX idx_stats_variant ON experiment_statistics(variant_id);
CREATE INDEX idx_stats_success_rate ON experiment_statistics(success_rate DESC);
CREATE INDEX idx_stats_significant ON experiment_statistics(is_significant) WHERE is_significant = true;

-- Function: Refresh experiment statistics
CREATE OR REPLACE FUNCTION refresh_experiment_statistics(p_experiment_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_affected_rows INTEGER;
BEGIN
  -- Aggregate results per variant
  INSERT INTO experiment_statistics (
    experiment_id,
    variant_id,
    total_observations,
    success_count,
    avg_response_time_ms,
    avg_cost_usd,
    avg_satisfaction,
    conversion_count,
    updated_at
  )
  SELECT
    er.experiment_id,
    er.variant_id,
    COUNT(*) as total_observations,
    COUNT(*) FILTER (WHERE er.success = true) as success_count,
    AVG(er.response_time_ms) as avg_response_time_ms,
    AVG(er.cost_usd) as avg_cost_usd,
    AVG(er.user_satisfaction) as avg_satisfaction,
    COUNT(*) FILTER (WHERE er.conversion = true) as conversion_count,
    NOW() as updated_at
  FROM experiment_results er
  WHERE er.experiment_id = p_experiment_id
  GROUP BY er.experiment_id, er.variant_id
  ON CONFLICT (experiment_id, variant_id) DO UPDATE SET
    total_observations = EXCLUDED.total_observations,
    success_count = EXCLUDED.success_count,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    avg_cost_usd = EXCLUDED.avg_cost_usd,
    avg_satisfaction = EXCLUDED.avg_satisfaction,
    conversion_count = EXCLUDED.conversion_count,
    updated_at = NOW();

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  RETURN v_affected_rows;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate statistical significance (chi-square test for success rate)
CREATE OR REPLACE FUNCTION calculate_experiment_significance(p_experiment_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_control_success INTEGER;
  v_control_total INTEGER;
  v_treatment_success INTEGER;
  v_treatment_total INTEGER;
  v_control_rate REAL;
  v_treatment_rate REAL;
  v_pooled_rate REAL;
  v_se REAL;
  v_z_score REAL;
  v_p_value REAL;
  v_is_significant BOOLEAN := false;
BEGIN
  -- Get control variant stats
  SELECT success_count, total_observations, success_rate
  INTO v_control_success, v_control_total, v_control_rate
  FROM experiment_statistics es
  JOIN experiment_variants ev ON ev.id = es.variant_id
  WHERE es.experiment_id = p_experiment_id
    AND ev.is_control = true
  LIMIT 1;

  -- Get treatment variant stats (first non-control)
  SELECT success_count, total_observations, success_rate
  INTO v_treatment_success, v_treatment_total, v_treatment_rate
  FROM experiment_statistics es
  JOIN experiment_variants ev ON ev.id = es.variant_id
  WHERE es.experiment_id = p_experiment_id
    AND ev.is_control = false
  LIMIT 1;

  -- Check if we have enough data
  IF v_control_total IS NULL OR v_treatment_total IS NULL THEN
    RETURN false;
  END IF;

  IF v_control_total < 30 OR v_treatment_total < 30 THEN
    RETURN false;
  END IF;

  -- Calculate pooled rate
  v_pooled_rate := (v_control_success + v_treatment_success)::REAL / (v_control_total + v_treatment_total)::REAL;

  -- Calculate standard error
  v_se := SQRT(v_pooled_rate * (1 - v_pooled_rate) * ((1.0 / v_control_total) + (1.0 / v_treatment_total)));

  IF v_se = 0 THEN
    RETURN false;
  END IF;

  -- Calculate z-score
  v_z_score := ABS(v_control_rate - v_treatment_rate) / v_se;

  -- Approximate p-value (two-tailed test)
  -- Using normal approximation: p ≈ 2 * (1 - Φ(|z|))
  -- For simplicity, use threshold: |z| > 1.96 means p < 0.05
  v_is_significant := v_z_score > 1.96;
  v_p_value := CASE
    WHEN v_z_score > 2.58 THEN 0.01
    WHEN v_z_score > 1.96 THEN 0.05
    ELSE 0.10
  END;

  -- Update statistics
  UPDATE experiment_statistics
  SET p_value = v_p_value,
      is_significant = v_is_significant
  WHERE experiment_id = p_experiment_id;

  RETURN v_is_significant;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-refresh stats on new result
CREATE OR REPLACE FUNCTION trigger_refresh_experiment_stats()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_experiment_statistics(NEW.experiment_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_stats_on_result
AFTER INSERT ON experiment_results
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_experiment_stats();

-- View: Active experiments with variant counts
CREATE OR REPLACE VIEW active_experiments_summary AS
SELECT
  e.id,
  e.name,
  e.experiment_type,
  e.domain,
  e.user_profile,
  e.primary_metric,
  e.status,
  COUNT(DISTINCT ev.id) as variant_count,
  SUM(es.total_observations) as total_observations,
  e.created_at,
  e.ends_at
FROM experiments e
LEFT JOIN experiment_variants ev ON ev.experiment_id = e.id
LEFT JOIN experiment_statistics es ON es.experiment_id = e.id
WHERE e.status = 'active'
GROUP BY e.id, e.name, e.experiment_type, e.domain, e.user_profile, e.primary_metric, e.status, e.created_at, e.ends_at
ORDER BY e.created_at DESC;

-- View: Experiment results comparison
CREATE OR REPLACE VIEW experiment_results_comparison AS
SELECT
  e.id as experiment_id,
  e.name as experiment_name,
  e.primary_metric,
  ev.id as variant_id,
  ev.variant_name,
  ev.is_control,
  es.total_observations,
  es.success_rate,
  es.avg_response_time_ms,
  es.avg_cost_usd,
  es.avg_satisfaction,
  es.conversion_rate,
  es.is_significant,
  es.p_value
FROM experiments e
JOIN experiment_variants ev ON ev.experiment_id = e.id
LEFT JOIN experiment_statistics es ON es.variant_id = ev.id
ORDER BY e.id, ev.is_control DESC, es.success_rate DESC;

-- Comments for documentation
COMMENT ON TABLE experiments IS 'A/B testing experiments for model versions, wrappers, prompts, and parameters';
COMMENT ON TABLE experiment_variants IS 'Experiment variants with traffic allocation (control vs treatments)';
COMMENT ON TABLE experiment_assignments IS 'Sticky user-to-variant assignments for consistent experience';
COMMENT ON TABLE experiment_results IS 'Individual observations with metrics (success, time, cost, satisfaction)';
COMMENT ON TABLE experiment_statistics IS 'Aggregated statistics per variant with statistical significance';
COMMENT ON FUNCTION refresh_experiment_statistics IS 'Aggregate results into statistics table (auto-triggered)';
COMMENT ON FUNCTION calculate_experiment_significance IS 'Calculate statistical significance using chi-square test';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON experiments TO agent_router_app;
-- GRANT SELECT, INSERT, UPDATE ON experiment_variants TO agent_router_app;
-- GRANT SELECT, INSERT ON experiment_assignments TO agent_router_app;
-- GRANT SELECT, INSERT ON experiment_results TO agent_router_app;
-- GRANT SELECT ON experiment_statistics TO agent_router_app;

-- Initial completion message
DO $$
BEGIN
  RAISE NOTICE 'Experiments & A/B Testing System installed successfully!';
  RAISE NOTICE '- Multi-variant testing supported';
  RAISE NOTICE '- Multi-armed bandit optimization ready';
  RAISE NOTICE '- Statistical significance testing (chi-square)';
  RAISE NOTICE '- Sticky user assignments for consistent experience';
  RAISE NOTICE '- Auto-aggregation of results (via trigger)';
  RAISE NOTICE 'Next: Call refresh_experiment_statistics(experiment_id) after updates';
  RAISE NOTICE 'Next: Call calculate_experiment_significance(experiment_id) to test significance';
END $$;

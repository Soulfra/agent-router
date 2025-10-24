-- Migration: AI Cost Analytics & Monitoring
-- "See if the curve is going up or down when we wiggle something"
--
-- Tracks AI usage, costs, trends, and enables:
-- - Real-time cost monitoring (the "curve")
-- - Trend detection (is it going up or down?)
-- - A/B testing (wiggle providers)
-- - Circuit breakers (orange warnings)
-- - Provider comparison

-- ============================================================================
-- AI USAGE HISTORY
-- Every single AI request for time-series analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_usage_history (
  id SERIAL PRIMARY KEY,

  -- Instance identification
  instance_name VARCHAR(100) NOT NULL,  -- 'cal', 'ralph', 'deepthink', etc.
  provider VARCHAR(100) NOT NULL,       -- 'claude-code', 'ollama', 'deepseek', 'openai'
  model VARCHAR(255) NOT NULL,          -- 'claude-sonnet-4.5', 'mistral:latest'

  -- Usage metrics
  tokens INTEGER DEFAULT 0,
  cost_usd DECIMAL(12, 8) DEFAULT 0,    -- High precision for micro-costs
  latency_ms INTEGER,

  -- Result
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  -- Timestamp (critical for time-series)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_ai_usage_created ON ai_usage_history (created_at DESC);
CREATE INDEX idx_ai_usage_instance_time ON ai_usage_history (instance_name, created_at DESC);
CREATE INDEX idx_ai_usage_provider_time ON ai_usage_history (provider, created_at DESC);
CREATE INDEX idx_ai_usage_instance_provider ON ai_usage_history (instance_name, provider, created_at DESC);
CREATE INDEX idx_ai_usage_cost_time ON ai_usage_history (created_at DESC, cost_usd);
CREATE INDEX idx_ai_usage_success ON ai_usage_history (success, created_at DESC);

-- ============================================================================
-- AI INSTANCE USAGE (AGGREGATED)
-- Pre-computed stats per instance (faster queries)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_instance_usage (
  id SERIAL PRIMARY KEY,

  -- Instance identification
  instance_name VARCHAR(100) NOT NULL,
  provider VARCHAR(100) NOT NULL,
  model VARCHAR(255) NOT NULL,

  -- Aggregated metrics
  tokens INTEGER DEFAULT 0,
  cost DECIMAL(12, 8) DEFAULT 0,
  success BOOLEAN DEFAULT TRUE,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ai_instance_name_time ON ai_instance_usage (instance_name, created_at DESC);
CREATE INDEX idx_ai_instance_provider ON ai_instance_usage (provider, created_at DESC);

-- ============================================================================
-- AI CIRCUIT BREAKER EVENTS
-- Track when circuit breakers trip/reset (the "orange" warnings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_circuit_breaker_events (
  id SERIAL PRIMARY KEY,

  -- Instance
  instance_name VARCHAR(100) NOT NULL,

  -- Event type
  event VARCHAR(50) NOT NULL,  -- 'tripped', 'reset', 'half_open'

  -- Reason
  reason TEXT,

  -- Threshold that was exceeded (if tripped)
  threshold_type VARCHAR(50),     -- 'cost_per_day', 'error_rate', 'latency'
  threshold_value DECIMAL(12, 8),
  actual_value DECIMAL(12, 8),

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cb_instance_time ON ai_circuit_breaker_events (instance_name, created_at DESC);
CREATE INDEX idx_cb_event ON ai_circuit_breaker_events (event, created_at DESC);

-- ============================================================================
-- AI A/B TEST EXPERIMENTS
-- Track experiments for provider comparison ("wiggle something")
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_ab_experiments (
  id SERIAL PRIMARY KEY,

  -- Experiment details
  experiment_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Metric being optimized
  metric VARCHAR(50) NOT NULL,  -- 'cost', 'latency', 'efficiency', 'quality'

  -- Configuration
  variants JSONB NOT NULL,  -- Array of variant configs
  min_sample_size INTEGER DEFAULT 30,
  auto_promote BOOLEAN DEFAULT FALSE,

  -- Status
  status VARCHAR(50) DEFAULT 'running',  -- 'running', 'stopped', 'promoted'
  winner VARCHAR(100),
  confidence DECIMAL(5, 4),  -- 0.0 to 1.0

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  stopped_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_experiments_status ON ai_ab_experiments (status, started_at DESC);
CREATE INDEX idx_experiments_id ON ai_ab_experiments (experiment_id);

-- ============================================================================
-- AI A/B TEST RESULTS
-- Individual test results for each variant
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_ab_test_results (
  id SERIAL PRIMARY KEY,

  -- Experiment reference
  experiment_id VARCHAR(100) NOT NULL,
  variant_name VARCHAR(100) NOT NULL,

  -- Instance used
  instance_name VARCHAR(100) NOT NULL,

  -- Metrics
  cost DECIMAL(12, 8),
  latency INTEGER,
  tokens INTEGER,
  success BOOLEAN DEFAULT TRUE,
  quality_score DECIMAL(5, 4),  -- Optional quality rating

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ab_results_experiment ON ai_ab_test_results (experiment_id, created_at DESC);
CREATE INDEX idx_ab_results_variant ON ai_ab_test_results (experiment_id, variant_name, created_at DESC);

-- Foreign key
ALTER TABLE ai_ab_test_results ADD CONSTRAINT fk_ab_results_experiment
  FOREIGN KEY (experiment_id) REFERENCES ai_ab_experiments(experiment_id) ON DELETE CASCADE;

-- ============================================================================
-- AI COST ALERTS
-- Alert history for threshold violations (🟢🟡🔴 status changes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_cost_alerts (
  id SERIAL PRIMARY KEY,

  -- Instance
  instance_name VARCHAR(100) NOT NULL,

  -- Alert level
  status VARCHAR(20) NOT NULL,  -- 'HEALTHY', 'WARNING', 'CRITICAL'
  previous_status VARCHAR(20),

  -- Alert details
  alert_type VARCHAR(50),  -- 'cost_per_day', 'cost_per_request', 'trend_increase', etc.
  message TEXT NOT NULL,

  -- Metrics
  threshold DECIMAL(12, 8),
  actual_value DECIMAL(12, 8),

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_alerts_instance_time ON ai_cost_alerts (instance_name, created_at DESC);
CREATE INDEX idx_alerts_status ON ai_cost_alerts (status, created_at DESC);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Real-time provider costs (last 24h)
CREATE OR REPLACE VIEW ai_provider_costs_24h AS
SELECT
  instance_name,
  provider,
  model,
  COUNT(*) as total_requests,
  SUM(cost_usd) as total_cost,
  AVG(cost_usd) as avg_cost,
  SUM(tokens) as total_tokens,
  AVG(latency_ms) as avg_latency,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as success_rate,
  CASE
    WHEN SUM(tokens) > 0
    THEN (SUM(cost_usd) / SUM(tokens)) * 1000
    ELSE 0
  END as cost_per_1k_tokens
FROM ai_usage_history
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY instance_name, provider, model
ORDER BY total_cost DESC;

-- Cost trend (hourly buckets, last 7 days)
CREATE OR REPLACE VIEW ai_cost_trend_hourly AS
SELECT
  date_trunc('hour', created_at) as hour,
  instance_name,
  provider,
  SUM(cost_usd) as total_cost,
  COUNT(*) as request_count,
  SUM(tokens) as total_tokens,
  AVG(latency_ms) as avg_latency,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as success_rate
FROM ai_usage_history
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY date_trunc('hour', created_at), instance_name, provider
ORDER BY hour DESC;

-- Active circuit breakers
CREATE OR REPLACE VIEW ai_active_circuit_breakers AS
SELECT DISTINCT ON (instance_name)
  instance_name,
  event,
  reason,
  threshold_type,
  threshold_value,
  actual_value,
  created_at
FROM ai_circuit_breaker_events
ORDER BY instance_name, created_at DESC;

-- Running experiments summary
CREATE OR REPLACE VIEW ai_active_experiments AS
SELECT
  e.experiment_id,
  e.name,
  e.metric,
  e.status,
  e.started_at,
  COUNT(r.id) as total_results,
  e.winner,
  e.confidence
FROM ai_ab_experiments e
LEFT JOIN ai_ab_test_results r ON e.experiment_id = r.experiment_id
WHERE e.status = 'running'
GROUP BY e.id
ORDER BY e.started_at DESC;

-- ============================================================================
-- FUNCTIONS FOR ANALYTICS
-- ============================================================================

-- Calculate cost trend (slope) for an instance
CREATE OR REPLACE FUNCTION ai_calculate_trend(
  p_instance_name VARCHAR(100),
  p_lookback_hours INTEGER DEFAULT 24
)
RETURNS TABLE(
  slope DECIMAL,
  trend VARCHAR(20),
  percent_change DECIMAL,
  data_points INTEGER
) AS $$
DECLARE
  v_data_points INTEGER;
  v_slope DECIMAL;
  v_avg_cost DECIMAL;
  v_trend VARCHAR(20);
  v_percent_change DECIMAL;
BEGIN
  -- Get hourly cost data
  WITH hourly_costs AS (
    SELECT
      EXTRACT(EPOCH FROM (created_at - (NOW() - INTERVAL '1 hour' * p_lookback_hours)))::INTEGER / 3600 as hour_index,
      SUM(cost_usd) as total_cost
    FROM ai_usage_history
    WHERE instance_name = p_instance_name
      AND created_at >= NOW() - INTERVAL '1 hour' * p_lookback_hours
    GROUP BY hour_index
    ORDER BY hour_index
  ),
  regression AS (
    SELECT
      COUNT(*)::INTEGER as n,
      SUM(hour_index) as sum_x,
      SUM(total_cost) as sum_y,
      SUM(hour_index * total_cost) as sum_xy,
      SUM(hour_index * hour_index) as sum_x2,
      AVG(total_cost) as avg_cost
    FROM hourly_costs
  )
  SELECT
    r.n,
    CASE
      WHEN r.n > 1 AND (r.n * r.sum_x2 - r.sum_x * r.sum_x) > 0
      THEN (r.n * r.sum_xy - r.sum_x * r.sum_y) / (r.n * r.sum_x2 - r.sum_x * r.sum_x)
      ELSE 0
    END,
    r.avg_cost
  INTO v_data_points, v_slope, v_avg_cost
  FROM regression r;

  -- Calculate percent change
  v_percent_change := CASE
    WHEN v_avg_cost > 0 THEN (v_slope / v_avg_cost) * 100
    ELSE 0
  END;

  -- Determine trend
  v_trend := CASE
    WHEN ABS(v_percent_change) < 5 THEN 'flat'
    WHEN v_slope > 0 THEN 'increasing'
    ELSE 'decreasing'
  END;

  RETURN QUERY SELECT v_slope, v_trend, v_percent_change, v_data_points;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE ai_usage_history IS 'Every AI request for time-series cost analysis';
COMMENT ON TABLE ai_circuit_breaker_events IS 'Circuit breaker trip/reset events (orange warnings)';
COMMENT ON TABLE ai_ab_experiments IS 'A/B testing experiments (wiggle providers)';
COMMENT ON TABLE ai_cost_alerts IS 'Alert history for threshold violations (🟢🟡🔴)';
COMMENT ON FUNCTION ai_calculate_trend IS 'Calculate if cost curve is going up or down';

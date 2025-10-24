-- Model Version Management System
-- Enables A/B testing of different model versions, base models, and configurations

-- Model versions (different versions per domain)
CREATE TABLE IF NOT EXISTS model_versions (
  id SERIAL PRIMARY KEY,

  -- Version identity
  domain TEXT NOT NULL,              -- e.g., 'cryptography', 'data', 'publishing'
  version_name TEXT NOT NULL,        -- e.g., 'v1', 'v2-experimental', 'v1-optimized'

  -- Model configuration
  base_model TEXT NOT NULL,          -- Ollama model name (e.g., 'codellama:7b-instruct')
  modelfile_path TEXT,               -- Path to Modelfile
  config JSONB DEFAULT '{}'::jsonb,  -- Configuration overrides (temperature, top_p, etc.)

  -- Status and traffic
  status TEXT DEFAULT 'testing',     -- 'testing', 'active', 'retired'
  traffic_percent INTEGER DEFAULT 0  CHECK (traffic_percent >= 0 AND traffic_percent <= 100),

  -- Metadata
  description TEXT,
  notes TEXT,
  created_by TEXT,                   -- Who created this version
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(domain, version_name)
);

CREATE INDEX idx_model_versions_domain ON model_versions(domain);
CREATE INDEX idx_model_versions_status ON model_versions(status);
CREATE INDEX idx_model_versions_active ON model_versions(domain, status) WHERE status = 'active';

-- Version performance metrics (aggregated per version)
CREATE TABLE IF NOT EXISTS model_version_performance (
  id SERIAL PRIMARY KEY,

  -- What version
  version_id INTEGER REFERENCES model_versions(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  version_name TEXT NOT NULL,

  -- Time period
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Usage metrics
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,

  -- Success rate
  success_rate REAL GENERATED ALWAYS AS (
    CASE
      WHEN total_requests > 0 THEN successful_requests::REAL / total_requests::REAL
      ELSE 0
    END
  ) STORED,

  -- Performance metrics
  avg_response_time_ms REAL,
  p95_response_time_ms REAL,
  avg_cost_per_request REAL,
  total_cost_usd REAL DEFAULT 0,

  -- Quality signals
  avg_followup_rate REAL,
  avg_satisfaction_score REAL,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(version_id, date)
);

CREATE INDEX idx_version_perf_version ON model_version_performance(version_id);
CREATE INDEX idx_version_perf_date ON model_version_performance(date DESC);
CREATE INDEX idx_version_perf_domain ON model_version_performance(domain, date DESC);

-- Version deployment history (audit trail)
CREATE TABLE IF NOT EXISTS model_version_deployments (
  id SERIAL PRIMARY KEY,

  -- What happened
  version_id INTEGER REFERENCES model_versions(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  version_name TEXT NOT NULL,
  action TEXT NOT NULL,               -- 'deployed', 'traffic_updated', 'retired', 'rolled_back'

  -- Old and new state
  old_status TEXT,
  new_status TEXT,
  old_traffic_percent INTEGER,
  new_traffic_percent INTEGER,

  -- Context
  reason TEXT,
  deployed_by TEXT,
  deployment_notes TEXT,

  -- Metadata
  deployed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deployments_version ON model_version_deployments(version_id);
CREATE INDEX idx_deployments_domain ON model_version_deployments(domain);
CREATE INDEX idx_deployments_time ON model_version_deployments(deployed_at DESC);

-- Function to log deployment events (trigger)
CREATE OR REPLACE FUNCTION log_model_version_deployment()
RETURNS TRIGGER AS $$
BEGIN
  -- Determine action
  DECLARE
    action_type TEXT;
  BEGIN
    IF TG_OP = 'INSERT' THEN
      action_type := 'deployed';
    ELSIF OLD.status != NEW.status THEN
      IF NEW.status = 'retired' THEN
        action_type := 'retired';
      ELSIF OLD.status = 'retired' AND NEW.status = 'active' THEN
        action_type := 'rolled_back';
      ELSE
        action_type := 'status_changed';
      END IF;
    ELSIF OLD.traffic_percent != NEW.traffic_percent THEN
      action_type := 'traffic_updated';
    ELSE
      RETURN NEW; -- No significant change
    END IF;

    -- Log deployment
    INSERT INTO model_version_deployments (
      version_id, domain, version_name, action,
      old_status, new_status,
      old_traffic_percent, new_traffic_percent
    ) VALUES (
      NEW.id, NEW.domain, NEW.version_name, action_type,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      NEW.status,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.traffic_percent ELSE NULL END,
      NEW.traffic_percent
    );

    RETURN NEW;
  END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER model_version_deployment_log
AFTER INSERT OR UPDATE ON model_versions
FOR EACH ROW
EXECUTE FUNCTION log_model_version_deployment();

-- Function to refresh version performance stats
CREATE OR REPLACE FUNCTION refresh_model_version_performance(days_back INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  -- Aggregate usage data by version and date
  INSERT INTO model_version_performance (
    version_id,
    domain,
    version_name,
    date,
    total_requests,
    successful_requests,
    failed_requests,
    unique_users,
    avg_response_time_ms,
    avg_cost_per_request,
    total_cost_usd,
    updated_at
  )
  SELECT
    mv.id as version_id,
    mul.use_case_category as domain,
    mul.model_version as version_name,
    DATE(mul.timestamp) as date,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE mul.status = 'success') as successful_requests,
    COUNT(*) FILTER (WHERE mul.status != 'success') as failed_requests,
    COUNT(DISTINCT mul.user_id) as unique_users,
    AVG(mul.response_time_ms) as avg_response_time_ms,
    AVG(mul.cost_usd) as avg_cost_per_request,
    SUM(mul.cost_usd) as total_cost_usd,
    NOW() as updated_at
  FROM model_usage_log mul
  LEFT JOIN model_versions mv ON mv.version_name = mul.model_version
    AND mv.domain = mul.use_case_category
  WHERE mul.timestamp >= CURRENT_DATE - (days_back || ' days')::INTERVAL
    AND mul.model_version IS NOT NULL
    AND mul.use_case_category IS NOT NULL
  GROUP BY mv.id, mul.use_case_category, mul.model_version, DATE(mul.timestamp)
  ON CONFLICT (version_id, date) DO UPDATE SET
    total_requests = EXCLUDED.total_requests,
    successful_requests = EXCLUDED.successful_requests,
    failed_requests = EXCLUDED.failed_requests,
    unique_users = EXCLUDED.unique_users,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    avg_cost_per_request = EXCLUDED.avg_cost_per_request,
    total_cost_usd = EXCLUDED.total_cost_usd,
    updated_at = NOW();

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

-- Seed default versions for existing domains
INSERT INTO model_versions (domain, version_name, base_model, status, traffic_percent, description)
VALUES
  ('cryptography', 'v1', 'soulfra-model', 'active', 100, 'Original soulfra cryptography model'),
  ('data', 'v1', 'deathtodata-model', 'active', 100, 'Original deathtodata ETL model'),
  ('publishing', 'v1', 'publishing-model', 'active', 100, 'Original publishing documentation model'),
  ('calos', 'v1', 'calos-model', 'active', 100, 'Original CalOS platform model'),
  ('whimsical', 'v1', 'drseuss-model', 'active', 100, 'Original Dr. Seuss creative model')
ON CONFLICT (domain, version_name) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE model_versions IS 'Multiple versions of domain-specific models for A/B testing';
COMMENT ON TABLE model_version_performance IS 'Performance metrics per version over time';
COMMENT ON TABLE model_version_deployments IS 'Audit trail of version deployments and changes';
COMMENT ON FUNCTION refresh_model_version_performance IS 'Refresh version performance stats from usage logs (call daily)';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON model_versions TO agent_router_app;
-- GRANT SELECT ON model_version_performance TO agent_router_app;
-- GRANT SELECT ON model_version_deployments TO agent_router_app;

-- Initial completion message
DO $$
BEGIN
  RAISE NOTICE 'Model Version Management System installed successfully!';
  RAISE NOTICE '- 5 default versions registered (v1 for each domain)';
  RAISE NOTICE '- Version deployment auditing enabled';
  RAISE NOTICE '- Performance tracking enabled';
  RAISE NOTICE 'Next: Run refresh_model_version_performance() daily via cron';
END $$;

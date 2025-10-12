--
-- Migration 006: Guardian Agent Tables
--
-- Adds tables for autonomous system monitoring and healing
--

-- Guardian activity log
-- Tracks all guardian monitoring runs and healing actions
CREATE TABLE IF NOT EXISTS guardian_log (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  diagnosis TEXT,
  action_taken TEXT,
  result VARCHAR(20) NOT NULL CHECK (result IN ('healthy', 'healed', 'unhealthy', 'failed')),
  metadata JSONB,
  tool_calls JSONB,
  CONSTRAINT guardian_log_event_type_check CHECK (event_type IN (
    'health_check',
    'healing_action',
    'monitoring_error',
    'auto_fix'
  ))
);

-- Index for recent activity queries
CREATE INDEX IF NOT EXISTS idx_guardian_log_timestamp ON guardian_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_guardian_log_severity ON guardian_log(severity);
CREATE INDEX IF NOT EXISTS idx_guardian_log_result ON guardian_log(result);

-- System health metrics
-- Stores time-series metrics for monitoring trends
CREATE TABLE IF NOT EXISTS health_metrics (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  metric_name VARCHAR(100) NOT NULL,
  metric_value NUMERIC NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('ok', 'warning', 'error')),
  metadata JSONB,
  CONSTRAINT health_metrics_name_check CHECK (metric_name IN (
    'api_response_time',
    'database_query_time',
    'ollama_response_time',
    'price_fetch_success_rate',
    'scheduler_job_success_rate',
    'test_pass_rate',
    'system_uptime'
  ))
);

-- Index for metric queries
CREATE INDEX IF NOT EXISTS idx_health_metrics_timestamp ON health_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_health_metrics_name ON health_metrics(metric_name);

-- View: Recent guardian activity summary
CREATE OR REPLACE VIEW guardian_activity_summary AS
SELECT
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as total_checks,
  COUNT(*) FILTER (WHERE result = 'healthy') as healthy_count,
  COUNT(*) FILTER (WHERE result = 'healed') as healed_count,
  COUNT(*) FILTER (WHERE result = 'unhealthy') as unhealthy_count,
  COUNT(*) FILTER (WHERE severity = 'error') as error_count
FROM guardian_log
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- View: System health dashboard
CREATE OR REPLACE VIEW system_health_dashboard AS
SELECT
  'guardian' as component,
  COUNT(*) as checks_last_hour,
  MAX(timestamp) as last_check,
  BOOL_OR(result IN ('unhealthy', 'failed')) as has_issues
FROM guardian_log
WHERE timestamp > NOW() - INTERVAL '1 hour'
UNION ALL
SELECT
  'scheduler' as component,
  COUNT(*) as checks_last_hour,
  MAX(started_at) as last_check,
  BOOL_OR(status = 'failed') as has_issues
FROM scheduler_log
WHERE started_at > NOW() - INTERVAL '1 hour';

-- Function: Get latest health status
CREATE OR REPLACE FUNCTION get_latest_health_status()
RETURNS TABLE (
  component VARCHAR(50),
  status VARCHAR(20),
  last_check TIMESTAMP,
  message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    'guardian'::VARCHAR(50),
    g.result::VARCHAR(20),
    g.timestamp,
    g.diagnosis
  FROM guardian_log g
  WHERE g.event_type = 'health_check'
  ORDER BY g.timestamp DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function: Clean old guardian logs (keep last 30 days)
CREATE OR REPLACE FUNCTION clean_old_guardian_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM guardian_log
  WHERE timestamp < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Record health metric
CREATE OR REPLACE FUNCTION record_health_metric(
  p_metric_name VARCHAR(100),
  p_metric_value NUMERIC,
  p_status VARCHAR(20),
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS VOID AS $$
BEGIN
  INSERT INTO health_metrics (metric_name, metric_value, status, metadata)
  VALUES (p_metric_name, p_metric_value, p_status, p_metadata);
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL PRIVILEGES ON guardian_log TO matthewmauer;
GRANT ALL PRIVILEGES ON health_metrics TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE guardian_log_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE health_metrics_id_seq TO matthewmauer;

-- Migration complete
SELECT 'Migration 006 completed: Guardian tables created' as status;

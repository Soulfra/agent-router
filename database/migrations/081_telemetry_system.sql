-- Migration 081: Telemetry System
-- VS Code / Google Analytics style telemetry for CALOS
--
-- Purpose:
-- - Collect usage telemetry from all tiers (Community, Pro, Enterprise)
-- - Track feature usage, performance, errors, sessions
-- - Enable trend analysis and capacity planning
-- - All data obfuscated (no PII)
--
-- What We Collect:
-- - Feature usage (POS, transcripts, crypto, marketplace)
-- - Performance metrics (response times, error rates)
-- - Session analytics (active sessions, duration)
-- - Error reporting (exceptions, API errors)
-- - Trend data (popular features, workflows, themes)
--
-- Privacy:
-- - All user IDs hashed (SHA-256)
-- - No PII (emails, names, IP addresses)
-- - No transaction amounts or customer data
-- - Aggregate data only
--
-- Opt-Out:
-- - Community tier: Required (in TOS)
-- - Pro tier: Required (in TOS)
-- - Enterprise tier: Optional (air-gapped mode)

-- ============================================================================
-- TELEMETRY EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS telemetry_events (
  event_id SERIAL PRIMARY KEY,

  -- Installation
  install_id VARCHAR(32) NOT NULL,

  -- Event type
  event_type VARCHAR(50) NOT NULL,  -- 'feature_usage', 'performance', 'error', 'session', 'api_request'

  -- Event data (JSON, obfuscated)
  event_data JSONB NOT NULL,

  -- Timestamp
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_events_install_id
  ON telemetry_events(install_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_type
  ON telemetry_events(event_type);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_created_at
  ON telemetry_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_install_type_created
  ON telemetry_events(install_id, event_type, created_at DESC);

COMMENT ON TABLE telemetry_events IS 'All telemetry events (obfuscated, no PII)';
COMMENT ON COLUMN telemetry_events.event_type IS 'Event type: feature_usage, performance, error, session, api_request';
COMMENT ON COLUMN telemetry_events.event_data IS 'Obfuscated event data (JSON)';

-- ============================================================================
-- TELEMETRY FEATURES
-- ============================================================================

CREATE TABLE IF NOT EXISTS telemetry_features (
  feature_id SERIAL PRIMARY KEY,

  -- Installation
  install_id VARCHAR(32) NOT NULL,

  -- Feature
  feature_name VARCHAR(100) NOT NULL,

  -- Usage counts
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,

  -- Timestamps
  first_used_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_features_install_id
  ON telemetry_features(install_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_features_feature_name
  ON telemetry_features(feature_name);

CREATE INDEX IF NOT EXISTS idx_telemetry_features_usage_count
  ON telemetry_features(usage_count DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_features_install_feature
  ON telemetry_features(install_id, feature_name);

COMMENT ON TABLE telemetry_features IS 'Feature usage tracking (aggregated)';
COMMENT ON COLUMN telemetry_features.feature_name IS 'Feature name: pos_transaction, transcript_upload, etc.';

-- ============================================================================
-- TELEMETRY ERRORS
-- ============================================================================

CREATE TABLE IF NOT EXISTS telemetry_errors (
  error_id SERIAL PRIMARY KEY,

  -- Installation
  install_id VARCHAR(32) NOT NULL,

  -- Error info
  error_type VARCHAR(100) NOT NULL,      -- 'database', 'network', 'validation', 'authentication', etc.
  error_name VARCHAR(255),               -- Error class name (e.g., 'TypeError', 'ValidationError')
  error_message TEXT,                    -- Obfuscated error message (PII removed)
  error_stack TEXT,                      -- Obfuscated stack trace (first 5 lines)

  -- Context
  path VARCHAR(500),                     -- Obfuscated path (e.g., '/api/users/:id')
  method VARCHAR(10),                    -- HTTP method
  status_code INTEGER,                   -- HTTP status code

  -- Occurrence tracking
  occurrence_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_errors_install_id
  ON telemetry_errors(install_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_errors_type
  ON telemetry_errors(error_type);

CREATE INDEX IF NOT EXISTS idx_telemetry_errors_occurrence_count
  ON telemetry_errors(occurrence_count DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_errors_last_seen
  ON telemetry_errors(last_seen_at DESC);

COMMENT ON TABLE telemetry_errors IS 'Error tracking (obfuscated, no PII)';
COMMENT ON COLUMN telemetry_errors.error_type IS 'Error category: database, network, validation, authentication, etc.';

-- ============================================================================
-- TELEMETRY PERFORMANCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS telemetry_performance (
  performance_id SERIAL PRIMARY KEY,

  -- Installation
  install_id VARCHAR(32) NOT NULL,

  -- Metric
  metric_name VARCHAR(100) NOT NULL,     -- 'api_request', 'database_query', 'slow_request'
  path VARCHAR(500),                     -- Obfuscated path

  -- Performance data
  duration_ms INTEGER NOT NULL,          -- Duration in milliseconds
  status_code INTEGER,                   -- HTTP status code (if applicable)

  -- Aggregation
  recorded_at DATE DEFAULT CURRENT_DATE,
  hour INTEGER DEFAULT EXTRACT(HOUR FROM NOW()),

  -- Timestamp
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_performance_install_id
  ON telemetry_performance(install_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_performance_metric
  ON telemetry_performance(metric_name);

CREATE INDEX IF NOT EXISTS idx_telemetry_performance_recorded_at
  ON telemetry_performance(recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_performance_install_metric_recorded
  ON telemetry_performance(install_id, metric_name, recorded_at DESC);

COMMENT ON TABLE telemetry_performance IS 'Performance metrics (response times, durations)';
COMMENT ON COLUMN telemetry_performance.metric_name IS 'Metric name: api_request, database_query, slow_request';

-- ============================================================================
-- TELEMETRY SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS telemetry_sessions (
  session_id SERIAL PRIMARY KEY,

  -- Installation
  install_id VARCHAR(32) NOT NULL,

  -- Session
  session_hash VARCHAR(64) NOT NULL,     -- Hashed session ID
  user_hash VARCHAR(64),                 -- Hashed user ID (optional)

  -- Session data
  session_type VARCHAR(50),              -- 'start', 'end', 'active'
  duration_seconds INTEGER,              -- Session duration (for 'end' events)

  -- Timestamp
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_install_id
  ON telemetry_sessions(install_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_session_hash
  ON telemetry_sessions(session_hash);

CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_created_at
  ON telemetry_sessions(created_at DESC);

COMMENT ON TABLE telemetry_sessions IS 'Session analytics (active sessions, duration)';
COMMENT ON COLUMN telemetry_sessions.session_hash IS 'Hashed session ID (SHA-256)';

-- ============================================================================
-- TELEMETRY AGGREGATES (Daily Summaries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS telemetry_aggregates (
  aggregate_id SERIAL PRIMARY KEY,

  -- Installation
  install_id VARCHAR(32) NOT NULL,

  -- Date
  date DATE NOT NULL,

  -- Feature usage counts
  features_used JSONB DEFAULT '{}',      -- { "pos_transaction": 50, "transcript_upload": 10 }

  -- Performance metrics
  avg_response_time_ms INTEGER,
  p95_response_time_ms INTEGER,
  p99_response_time_ms INTEGER,

  -- Error counts
  total_errors INTEGER DEFAULT 0,
  error_types JSONB DEFAULT '{}',        -- { "database": 5, "network": 2 }

  -- API stats
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,  -- 2xx
  client_errors INTEGER DEFAULT 0,        -- 4xx
  server_errors INTEGER DEFAULT 0,        -- 5xx

  -- Session stats
  active_sessions INTEGER DEFAULT 0,
  avg_session_duration_seconds INTEGER,

  -- Timestamp
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(install_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_aggregates_install_id
  ON telemetry_aggregates(install_id);

CREATE INDEX IF NOT EXISTS idx_telemetry_aggregates_date
  ON telemetry_aggregates(date DESC);

COMMENT ON TABLE telemetry_aggregates IS 'Daily telemetry aggregates (summary stats)';
COMMENT ON COLUMN telemetry_aggregates.features_used IS 'Feature usage counts per day (JSON)';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

/**
 * Increment feature usage count
 */
CREATE OR REPLACE FUNCTION increment_feature_usage(
  p_install_id VARCHAR(32),
  p_feature_name VARCHAR(100)
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO telemetry_features (
    install_id,
    feature_name,
    usage_count,
    last_used_at
  ) VALUES (
    p_install_id,
    p_feature_name,
    1,
    NOW()
  )
  ON CONFLICT (install_id, feature_name) DO UPDATE SET
    usage_count = telemetry_features.usage_count + 1,
    last_used_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_feature_usage IS 'Increment feature usage count';

/**
 * Record error occurrence
 */
CREATE OR REPLACE FUNCTION record_error_occurrence(
  p_install_id VARCHAR(32),
  p_error_type VARCHAR(100),
  p_error_name VARCHAR(255),
  p_error_message TEXT,
  p_error_stack TEXT,
  p_path VARCHAR(500) DEFAULT NULL,
  p_method VARCHAR(10) DEFAULT NULL,
  p_status_code INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_error_id INTEGER;
BEGIN
  -- Try to find existing error
  SELECT error_id INTO v_error_id
  FROM telemetry_errors
  WHERE install_id = p_install_id
    AND error_type = p_error_type
    AND error_name = p_error_name
    AND path = p_path
  LIMIT 1;

  IF v_error_id IS NOT NULL THEN
    -- Update existing error
    UPDATE telemetry_errors
    SET
      occurrence_count = occurrence_count + 1,
      last_seen_at = NOW()
    WHERE error_id = v_error_id;
  ELSE
    -- Insert new error
    INSERT INTO telemetry_errors (
      install_id,
      error_type,
      error_name,
      error_message,
      error_stack,
      path,
      method,
      status_code
    ) VALUES (
      p_install_id,
      p_error_type,
      p_error_name,
      p_error_message,
      p_error_stack,
      p_path,
      p_method,
      p_status_code
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_error_occurrence IS 'Record error occurrence (deduplicate similar errors)';

/**
 * Get telemetry summary for install
 */
CREATE OR REPLACE FUNCTION get_telemetry_summary(
  p_install_id VARCHAR(32),
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  feature_name VARCHAR(100),
  usage_count BIGINT,
  avg_response_time_ms NUMERIC,
  total_errors BIGINT,
  total_requests BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.feature_name,
    SUM(f.usage_count) as usage_count,
    AVG(p.duration_ms) as avg_response_time_ms,
    (
      SELECT COUNT(*)
      FROM telemetry_errors e
      WHERE e.install_id = p_install_id
        AND e.last_seen_at >= NOW() - (p_days || ' days')::INTERVAL
    ) as total_errors,
    (
      SELECT COUNT(*)
      FROM telemetry_performance perf
      WHERE perf.install_id = p_install_id
        AND perf.created_at >= NOW() - (p_days || ' days')::INTERVAL
    ) as total_requests
  FROM telemetry_features f
  LEFT JOIN telemetry_performance p ON p.install_id = f.install_id
  WHERE f.install_id = p_install_id
    AND f.last_used_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY f.feature_name
  ORDER BY usage_count DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_telemetry_summary IS 'Get telemetry summary for install (last N days)';

/**
 * Get popular features (across all installs)
 */
CREATE OR REPLACE FUNCTION get_popular_features(
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  feature_name VARCHAR(100),
  total_installs BIGINT,
  total_usage BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.feature_name,
    COUNT(DISTINCT f.install_id) as total_installs,
    SUM(f.usage_count) as total_usage
  FROM telemetry_features f
  WHERE f.last_used_at >= NOW() - INTERVAL '30 days'
  GROUP BY f.feature_name
  ORDER BY total_usage DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_popular_features IS 'Get most popular features across all installs';

-- ============================================================================
-- CLEANUP / RETENTION
-- ============================================================================

/**
 * Cleanup old telemetry data (keep last 90 days)
 */
CREATE OR REPLACE FUNCTION cleanup_telemetry_data(
  p_days INTEGER DEFAULT 90
)
RETURNS TABLE (
  events_deleted BIGINT,
  performance_deleted BIGINT,
  sessions_deleted BIGINT
) AS $$
DECLARE
  v_events_deleted BIGINT;
  v_performance_deleted BIGINT;
  v_sessions_deleted BIGINT;
BEGIN
  -- Delete old events
  DELETE FROM telemetry_events
  WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_events_deleted = ROW_COUNT;

  -- Delete old performance data
  DELETE FROM telemetry_performance
  WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_performance_deleted = ROW_COUNT;

  -- Delete old sessions
  DELETE FROM telemetry_sessions
  WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_sessions_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_events_deleted, v_performance_deleted, v_sessions_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_telemetry_data IS 'Cleanup old telemetry data (default: 90 days)';

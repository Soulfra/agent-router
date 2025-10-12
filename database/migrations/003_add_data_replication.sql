-- Migration: Add Data Replication Tables
-- Description: Tables for tracking data replication across multiple sources

-- Data replicas table - stores replicated data with validation info
CREATE TABLE IF NOT EXISTS data_replicas (
  id SERIAL PRIMARY KEY,
  data_type VARCHAR(50) NOT NULL,
  params JSONB NOT NULL,
  validated_data JSONB NOT NULL,
  source_count INTEGER NOT NULL,
  sources JSONB NOT NULL,
  replicated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Index for fast lookups
  CONSTRAINT idx_data_replicas_lookup
    UNIQUE (data_type, params, replicated_at)
);

-- Index on data type and replication time
CREATE INDEX IF NOT EXISTS idx_data_replicas_type_time
  ON data_replicas(data_type, replicated_at DESC);

-- Index on params for JSON queries
CREATE INDEX IF NOT EXISTS idx_data_replicas_params
  ON data_replicas USING gin(params);

-- Data source performance tracking
CREATE TABLE IF NOT EXISTS data_source_stats (
  id SERIAL PRIMARY KEY,
  source_name VARCHAR(50) NOT NULL,
  data_type VARCHAR(50) NOT NULL,
  requests INTEGER DEFAULT 0,
  successes INTEGER DEFAULT 0,
  failures INTEGER DEFAULT 0,
  average_latency_ms INTEGER DEFAULT 0,
  last_success TIMESTAMP,
  last_failure TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT idx_source_stats_lookup
    UNIQUE (source_name, data_type)
);

-- View: Latest replicated data by type
CREATE OR REPLACE VIEW latest_replicas AS
SELECT DISTINCT ON (data_type, params)
  data_type,
  params,
  validated_data,
  source_count,
  sources,
  replicated_at
FROM data_replicas
ORDER BY data_type, params, replicated_at DESC;

-- View: Data source reliability scores
CREATE OR REPLACE VIEW source_reliability AS
SELECT
  source_name,
  data_type,
  requests,
  successes,
  failures,
  CASE
    WHEN requests > 0 THEN ROUND((successes::NUMERIC / requests::NUMERIC) * 100, 2)
    ELSE 0
  END as success_rate,
  average_latency_ms,
  last_success,
  last_failure
FROM data_source_stats
ORDER BY success_rate DESC, average_latency_ms ASC;

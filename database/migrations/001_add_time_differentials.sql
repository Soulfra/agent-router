-- Migration: Add time differential tracking to existing CalOS database
-- Purpose: Optimize timestamp columns and add request/response latency tracking
-- Date: 2025-10-11
--
-- Run this ONLY if you have an existing CalOS database
-- For new installations, just use schema.sql directly

-- ============================================================
-- Step 1: Add new timestamp columns to ai_responses
-- ============================================================

-- Add request/response timestamps and latency tracking
ALTER TABLE ai_responses
  ADD COLUMN IF NOT EXISTS request_timestamp TIMESTAMP,
  ADD COLUMN IF NOT EXISTS response_timestamp TIMESTAMP,
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN DEFAULT FALSE;

-- Backfill request_timestamp from created_at for existing rows
UPDATE ai_responses
SET request_timestamp = created_at
WHERE request_timestamp IS NULL;

-- Make request_timestamp NOT NULL after backfill
ALTER TABLE ai_responses
  ALTER COLUMN request_timestamp SET NOT NULL,
  ALTER COLUMN request_timestamp SET DEFAULT CURRENT_TIMESTAMP;

-- ============================================================
-- Step 2: Add indexes for new columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_responses_request_time
  ON ai_responses(request_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_responses_latency
  ON ai_responses(latency_ms)
  WHERE latency_ms IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_responses_cache_hit
  ON ai_responses(cache_hit);

-- ============================================================
-- Step 3: Update agent_metrics table
-- ============================================================

-- Add timestamp as second column (can't reorder existing columns)
-- Add response_id link
ALTER TABLE agent_metrics
  ADD COLUMN IF NOT EXISTS response_id INTEGER REFERENCES ai_responses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_hash VARCHAR(64);

-- Add new indexes
CREATE INDEX IF NOT EXISTS idx_metrics_response
  ON agent_metrics(response_id)
  WHERE response_id IS NOT NULL;

-- Reorder indexes for better performance (timestamp first)
DROP INDEX IF EXISTS idx_metrics_timestamp;
DROP INDEX IF EXISTS idx_metrics_agent;
DROP INDEX IF EXISTS idx_metrics_type;

CREATE INDEX idx_metrics_timestamp ON agent_metrics(timestamp DESC);
CREATE INDEX idx_metrics_agent ON agent_metrics(agent_id, timestamp DESC);
CREATE INDEX idx_metrics_type ON agent_metrics(metric_type);

-- ============================================================
-- Step 4: Update conversations table
-- ============================================================

-- Add new columns for better tracking
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_agent VARCHAR(100);

-- Add new indexes
CREATE INDEX IF NOT EXISTS idx_conversations_started
  ON conversations(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_agent
  ON conversations(last_agent)
  WHERE last_agent IS NOT NULL;

-- ============================================================
-- Step 5: Update views
-- ============================================================

-- Drop old views
DROP VIEW IF EXISTS recent_responses;
DROP VIEW IF EXISTS agent_performance;
DROP VIEW IF EXISTS fast_responses;
DROP VIEW IF EXISTS slow_responses;

-- Create new views with timing info
CREATE OR REPLACE VIEW recent_responses AS
SELECT
  id,
  request_timestamp,
  response_timestamp,
  latency_ms,
  provider,
  model,
  query_text,
  LENGTH(response) as response_length,
  cache_hit,
  created_at
FROM ai_responses
ORDER BY request_timestamp DESC
LIMIT 100;

-- Fast responses (under 100ms)
CREATE OR REPLACE VIEW fast_responses AS
SELECT
  provider,
  model,
  latency_ms,
  cache_hit,
  request_timestamp
FROM ai_responses
WHERE latency_ms < 100 AND latency_ms IS NOT NULL
ORDER BY request_timestamp DESC;

-- Slow responses (over 5 seconds)
CREATE OR REPLACE VIEW slow_responses AS
SELECT
  provider,
  model,
  latency_ms,
  query_text,
  request_timestamp
FROM ai_responses
WHERE latency_ms > 5000 AND latency_ms IS NOT NULL
ORDER BY latency_ms DESC;

-- Agent performance summary (last 24 hours)
CREATE OR REPLACE VIEW agent_performance AS
SELECT
  agent_id,
  COUNT(*) as total_requests,
  AVG(value) FILTER (WHERE metric_type = 'latency') as avg_latency_ms,
  MIN(value) FILTER (WHERE metric_type = 'latency') as min_latency_ms,
  MAX(value) FILTER (WHERE metric_type = 'latency') as max_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) FILTER (WHERE metric_type = 'latency') as p95_latency_ms,
  COUNT(*) FILTER (WHERE metric_type = 'cache_hit') as cache_hits,
  COUNT(*) FILTER (WHERE metric_type = 'error') as error_count,
  COUNT(*) FILTER (WHERE metric_type = 'request') as request_count
FROM agent_metrics
WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY agent_id
ORDER BY total_requests DESC;

-- ============================================================
-- Verification
-- ============================================================

-- Check migration results
DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Migration 001 Complete - Time Differential Tracking';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'New columns added to ai_responses:';
  RAISE NOTICE '  - request_timestamp (indexed)';
  RAISE NOTICE '  - response_timestamp';
  RAISE NOTICE '  - latency_ms (indexed)';
  RAISE NOTICE '  - cache_hit (indexed)';
  RAISE NOTICE '';
  RAISE NOTICE 'New columns added to agent_metrics:';
  RAISE NOTICE '  - response_id (links to ai_responses)';
  RAISE NOTICE '  - request_hash (links to specific request)';
  RAISE NOTICE '';
  RAISE NOTICE 'New columns added to conversations:';
  RAISE NOTICE '  - message_count';
  RAISE NOTICE '  - last_agent';
  RAISE NOTICE '';
  RAISE NOTICE 'New views created:';
  RAISE NOTICE '  - fast_responses (< 100ms)';
  RAISE NOTICE '  - slow_responses (> 5s)';
  RAISE NOTICE '  - Enhanced recent_responses';
  RAISE NOTICE '  - Enhanced agent_performance';
  RAISE NOTICE '';
  RAISE NOTICE 'Run these queries to verify:';
  RAISE NOTICE '  SELECT * FROM recent_responses LIMIT 10;';
  RAISE NOTICE '  SELECT * FROM agent_performance;';
  RAISE NOTICE '  SELECT * FROM fast_responses LIMIT 10;';
  RAISE NOTICE '============================================================';
END $$;

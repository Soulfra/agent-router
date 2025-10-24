-- Migration 066: Sharding and Event Broadcasting Infrastructure
-- Created: 2025-10-20
--
-- Purpose: Add tables and indexes to support database sharding and event broadcasting
-- for distributed wave/pulse/echo propagation across Soulfra instances.

-- ============================================================
-- Table: event_log
-- ============================================================
-- Stores events for wave propagation tracking and history

CREATE TABLE IF NOT EXISTS event_log (
  id BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  ttl INTEGER NOT NULL,
  propagation_path JSONB NOT NULL,  -- Array of instance IDs
  origin_instance VARCHAR(255) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast event lookups
CREATE INDEX IF NOT EXISTS idx_event_log_event_id ON event_log(event_id);
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_timestamp ON event_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_origin ON event_log(origin_instance);
CREATE INDEX IF NOT EXISTS idx_event_log_recorded ON event_log(recorded_at DESC);

-- JSONB indexes for querying event data
CREATE INDEX IF NOT EXISTS idx_event_log_data_gin ON event_log USING GIN (event_data);
CREATE INDEX IF NOT EXISTS idx_event_log_path_gin ON event_log USING GIN (propagation_path);

-- ============================================================
-- Table: shard_registry
-- ============================================================
-- Tracks available database shards for consistent hashing

CREATE TABLE IF NOT EXISTS shard_registry (
  id SERIAL PRIMARY KEY,
  shard_index INTEGER UNIQUE NOT NULL,
  shard_name VARCHAR(100) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL,
  database_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active', 'readonly', 'offline'
  weight INTEGER NOT NULL DEFAULT 1,
  virtual_nodes INTEGER NOT NULL DEFAULT 150,
  added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_health_check TIMESTAMP,
  health_status VARCHAR(20) DEFAULT 'unknown',  -- 'healthy', 'degraded', 'unhealthy'
  consecutive_failures INTEGER DEFAULT 0,
  metadata JSONB
);

-- Indexes for shard lookups
CREATE INDEX IF NOT EXISTS idx_shard_registry_status ON shard_registry(status);
CREATE INDEX IF NOT EXISTS idx_shard_registry_health ON shard_registry(health_status);
CREATE INDEX IF NOT EXISTS idx_shard_registry_index ON shard_registry(shard_index);

-- ============================================================
-- Table: stream_sessions
-- ============================================================
-- Tracks Soulfra live coding streams

CREATE TABLE IF NOT EXISTS stream_sessions (
  id BIGSERIAL PRIMARY KEY,
  stream_id VARCHAR(255) UNIQUE NOT NULL,
  streamer_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  language VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active', 'paused', 'ended'
  viewer_count INTEGER DEFAULT 0,
  max_viewers INTEGER DEFAULT 0,
  code_executions INTEGER DEFAULT 0,
  chat_messages INTEGER DEFAULT 0,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  metadata JSONB
);

-- Indexes for stream lookups
CREATE INDEX IF NOT EXISTS idx_stream_sessions_stream_id ON stream_sessions(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_sessions_streamer ON stream_sessions(streamer_id);
CREATE INDEX IF NOT EXISTS idx_stream_sessions_status ON stream_sessions(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_stream_sessions_started ON stream_sessions(started_at DESC);

-- ============================================================
-- Table: stream_chat
-- ============================================================
-- Stores chat messages for streams

CREATE TABLE IF NOT EXISTS stream_chat (
  id BIGSERIAL PRIMARY KEY,
  stream_id VARCHAR(255) NOT NULL REFERENCES stream_sessions(stream_id) ON DELETE CASCADE,
  viewer_id VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'chat',  -- 'chat', 'command', 'system'
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for chat lookups
CREATE INDEX IF NOT EXISTS idx_stream_chat_stream ON stream_chat(stream_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_stream_chat_viewer ON stream_chat(viewer_id);
CREATE INDEX IF NOT EXISTS idx_stream_chat_type ON stream_chat(message_type);

-- ============================================================
-- Table: stream_viewers
-- ============================================================
-- Tracks viewers in streams

CREATE TABLE IF NOT EXISTS stream_viewers (
  id BIGSERIAL PRIMARY KEY,
  stream_id VARCHAR(255) NOT NULL REFERENCES stream_sessions(stream_id) ON DELETE CASCADE,
  viewer_id VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP,
  commands_executed INTEGER DEFAULT 0,
  UNIQUE(stream_id, viewer_id)
);

-- Indexes for viewer lookups
CREATE INDEX IF NOT EXISTS idx_stream_viewers_stream ON stream_viewers(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_viewers_active ON stream_viewers(stream_id, left_at) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stream_viewers_viewer ON stream_viewers(viewer_id);

-- ============================================================
-- Views
-- ============================================================

-- View: Active streams with viewer counts
CREATE OR REPLACE VIEW active_streams AS
SELECT
  s.stream_id,
  s.streamer_id,
  s.title,
  s.description,
  s.language,
  s.status,
  COUNT(DISTINCT v.viewer_id) FILTER (WHERE v.left_at IS NULL) as current_viewers,
  s.max_viewers,
  s.code_executions,
  s.chat_messages,
  s.started_at,
  EXTRACT(EPOCH FROM (NOW() - s.started_at)) as duration_seconds
FROM stream_sessions s
LEFT JOIN stream_viewers v ON s.stream_id = v.stream_id
WHERE s.status = 'active'
GROUP BY s.id, s.stream_id, s.streamer_id, s.title, s.description,
         s.language, s.status, s.max_viewers, s.code_executions,
         s.chat_messages, s.started_at
ORDER BY current_viewers DESC, s.started_at DESC;

-- View: Recent events by type
CREATE OR REPLACE VIEW recent_events_by_type AS
SELECT
  event_type,
  COUNT(*) as event_count,
  MAX(timestamp) as last_event_at,
  COUNT(DISTINCT origin_instance) as unique_sources
FROM event_log
WHERE timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY event_type
ORDER BY event_count DESC;

-- View: Shard health status
CREATE OR REPLACE VIEW shard_health AS
SELECT
  shard_index,
  shard_name,
  host,
  port,
  status,
  health_status,
  consecutive_failures,
  last_health_check,
  CASE
    WHEN last_health_check IS NULL THEN 'Never checked'
    WHEN last_health_check < NOW() - INTERVAL '5 minutes' THEN 'Stale'
    WHEN health_status = 'healthy' THEN 'OK'
    WHEN health_status = 'degraded' THEN 'Warning'
    ELSE 'Critical'
  END as health_summary
FROM shard_registry
ORDER BY shard_index;

-- ============================================================
-- Functions
-- ============================================================

-- Function: Clean old events (keep last 7 days)
CREATE OR REPLACE FUNCTION clean_old_events()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM event_log
  WHERE recorded_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Update stream viewer count
CREATE OR REPLACE FUNCTION update_stream_viewer_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE stream_sessions
  SET
    viewer_count = (
      SELECT COUNT(*)
      FROM stream_viewers
      WHERE stream_id = NEW.stream_id
        AND left_at IS NULL
    ),
    max_viewers = GREATEST(
      max_viewers,
      (SELECT COUNT(*) FROM stream_viewers WHERE stream_id = NEW.stream_id AND left_at IS NULL)
    )
  WHERE stream_id = NEW.stream_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update viewer count on viewer join/leave
CREATE TRIGGER trg_stream_viewer_count
AFTER INSERT OR UPDATE ON stream_viewers
FOR EACH ROW
EXECUTE FUNCTION update_stream_viewer_count();

-- Function: Record shard health check
CREATE OR REPLACE FUNCTION record_shard_health_check(
  p_shard_index INTEGER,
  p_is_healthy BOOLEAN
)
RETURNS VOID AS $$
BEGIN
  UPDATE shard_registry
  SET
    last_health_check = NOW(),
    health_status = CASE
      WHEN p_is_healthy THEN 'healthy'
      ELSE 'unhealthy'
    END,
    consecutive_failures = CASE
      WHEN p_is_healthy THEN 0
      ELSE consecutive_failures + 1
    END
  WHERE shard_index = p_shard_index;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE event_log IS 'Wave propagation event log for distributed broadcasting';
COMMENT ON TABLE shard_registry IS 'Registry of database shards for consistent hashing';
COMMENT ON TABLE stream_sessions IS 'Live coding stream sessions';
COMMENT ON TABLE stream_chat IS 'Chat messages for streams';
COMMENT ON TABLE stream_viewers IS 'Viewer participation tracking';

COMMENT ON COLUMN event_log.event_id IS 'Unique event identifier for echo detection';
COMMENT ON COLUMN event_log.ttl IS 'Time-to-live (hops remaining) for wave propagation';
COMMENT ON COLUMN event_log.propagation_path IS 'JSON array of instance IDs in propagation path';

COMMENT ON COLUMN shard_registry.virtual_nodes IS 'Number of virtual nodes in consistent hash ring';
COMMENT ON COLUMN shard_registry.weight IS 'Shard weight for load distribution';

-- ============================================================
-- Verification
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Migration 066 Complete - Sharding and Event Broadcasting';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'New tables:';
  RAISE NOTICE '  - event_log (wave propagation tracking)';
  RAISE NOTICE '  - shard_registry (shard management)';
  RAISE NOTICE '  - stream_sessions (live coding streams)';
  RAISE NOTICE '  - stream_chat (stream chat messages)';
  RAISE NOTICE '  - stream_viewers (viewer tracking)';
  RAISE NOTICE '';
  RAISE NOTICE 'New views:';
  RAISE NOTICE '  - active_streams (current live streams)';
  RAISE NOTICE '  - recent_events_by_type (event analytics)';
  RAISE NOTICE '  - shard_health (shard health monitoring)';
  RAISE NOTICE '';
  RAISE NOTICE 'New functions:';
  RAISE NOTICE '  - clean_old_events() - cleanup old event data';
  RAISE NOTICE '  - update_stream_viewer_count() - trigger for viewer counts';
  RAISE NOTICE '  - record_shard_health_check() - record shard health';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  SELECT * FROM active_streams;';
  RAISE NOTICE '  SELECT * FROM shard_health;';
  RAISE NOTICE '  SELECT * FROM recent_events_by_type;';
  RAISE NOTICE '  SELECT clean_old_events();';
  RAISE NOTICE '============================================================';
END $$;

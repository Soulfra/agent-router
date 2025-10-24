/**
 * Migration 020: Session Blocks System
 *
 * Blockchain-inspired session management where each request is a "block":
 * - Blocks have priority ("gas") for queue ordering
 * - Blocks have deadlines (like block times)
 * - Real-time monitoring (Blocknative-style)
 * - Room-scoped execution
 *
 * Vision: Sessions are blocks, priority is gas, rooms are persistent networks
 */

-- ============================================================================
-- 1. SESSION BLOCKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_blocks (
  block_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session & user context
  session_id UUID REFERENCES user_sessions(session_id),
  user_id UUID REFERENCES users(user_id),
  device_id VARCHAR(255), -- For anonymous users

  -- Room assignment (persistent context)
  room_id INTEGER REFERENCES code_rooms(id),
  room_slug VARCHAR(255), -- Cached for performance

  -- Priority & "Gas" mechanics
  priority INTEGER DEFAULT 50, -- 0-100 (higher = faster, like gas price)
  boost_count INTEGER DEFAULT 0, -- How many times priority was boosted

  -- Block status (lifecycle)
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, executing, completed, timeout, failed

  -- Timing (blockchain-like)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline_at TIMESTAMPTZ NOT NULL, -- Block timeout
  executed_at TIMESTAMPTZ, -- When execution started
  completed_at TIMESTAMPTZ, -- When execution finished
  timeout_at TIMESTAMPTZ, -- If deadline exceeded

  -- Performance metrics
  queue_time_ms INTEGER, -- Time spent in queue
  execution_time_ms INTEGER, -- Time spent executing

  -- Block data
  block_data JSONB NOT NULL DEFAULT '{}', -- model, prompt, context, type, metadata

  -- Results
  result JSONB, -- Execution result
  error_message TEXT -- If failed or timeout
);

CREATE INDEX idx_session_blocks_status ON session_blocks(status);
CREATE INDEX idx_session_blocks_priority ON session_blocks(priority DESC, created_at);
CREATE INDEX idx_session_blocks_room ON session_blocks(room_id, status);
CREATE INDEX idx_session_blocks_deadline ON session_blocks(deadline_at) WHERE status IN ('pending', 'executing');
CREATE INDEX idx_session_blocks_user ON session_blocks(user_id, created_at DESC);
CREATE INDEX idx_session_blocks_session ON session_blocks(session_id);

COMMENT ON TABLE session_blocks IS 'Blockchain-inspired session blocks with priority queuing';

-- ============================================================================
-- 2. PRIORITY QUEUE VIEW
-- ============================================================================

-- Active queue ordered by priority (gas) and age
CREATE OR REPLACE VIEW session_block_queue AS
SELECT
  sb.block_id,
  sb.room_id,
  sb.room_slug,
  sb.priority,
  sb.status,
  sb.created_at,
  sb.deadline_at,
  EXTRACT(EPOCH FROM (sb.deadline_at - NOW())) AS seconds_to_deadline,
  -- Queue position (within room)
  ROW_NUMBER() OVER (PARTITION BY sb.room_id ORDER BY sb.priority DESC, sb.created_at) as queue_position,
  sb.block_data->'type' as request_type
FROM session_blocks sb
WHERE sb.status = 'pending'
  AND sb.deadline_at > NOW()
ORDER BY sb.priority DESC, sb.created_at;

COMMENT ON VIEW session_block_queue IS 'Priority queue ordered by gas price (priority)';

-- ============================================================================
-- 3. BLOCK STATISTICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW session_block_stats AS
SELECT
  COUNT(*) as total_blocks,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'executing') as executing,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'timeout') as timeout,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,

  -- Priority distribution
  COUNT(*) FILTER (WHERE priority >= 75) as high_priority,
  COUNT(*) FILTER (WHERE priority >= 40 AND priority < 75) as medium_priority,
  COUNT(*) FILTER (WHERE priority < 40) as low_priority,

  -- Average metrics
  AVG(queue_time_ms) as avg_queue_time_ms,
  AVG(execution_time_ms) FILTER (WHERE execution_time_ms IS NOT NULL) as avg_execution_time_ms,
  AVG(priority) as avg_priority,

  -- Timeout rate
  (COUNT(*) FILTER (WHERE status = 'timeout')::DECIMAL / NULLIF(COUNT(*), 0) * 100) as timeout_rate_percent

FROM session_blocks
WHERE created_at > NOW() - INTERVAL '1 hour';

COMMENT ON VIEW session_block_stats IS 'Real-time session block statistics';

-- ============================================================================
-- 4. ROOM QUEUE VIEW
-- ============================================================================

-- Queue depth by room (like network congestion)
CREATE OR REPLACE VIEW session_room_queues AS
SELECT
  COALESCE(cr.name, 'Unassigned') as room_name,
  sb.room_id,
  COUNT(*) FILTER (WHERE sb.status = 'pending') as queue_depth,
  COUNT(*) FILTER (WHERE sb.status = 'executing') as active_count,
  AVG(sb.priority) FILTER (WHERE sb.status = 'pending') as avg_priority,
  MIN(sb.created_at) FILTER (WHERE sb.status = 'pending') as oldest_pending,
  MAX(sb.priority) FILTER (WHERE sb.status = 'pending') as max_priority
FROM session_blocks sb
LEFT JOIN code_rooms cr ON cr.id = sb.room_id
WHERE sb.status IN ('pending', 'executing')
GROUP BY sb.room_id, cr.name
ORDER BY queue_depth DESC;

COMMENT ON VIEW session_room_queues IS 'Queue depth and congestion by room';

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

/**
 * Get next block to execute from queue
 * Returns highest priority block for a given room
 */
CREATE OR REPLACE FUNCTION get_next_block(p_room_id INTEGER DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  v_block_id UUID;
BEGIN
  SELECT block_id INTO v_block_id
  FROM session_blocks
  WHERE status = 'pending'
    AND deadline_at > NOW()
    AND (p_room_id IS NULL OR room_id = p_room_id)
  ORDER BY priority DESC, created_at ASC
  LIMIT 1;

  RETURN v_block_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Auto-boost blocks approaching deadline
 * Like "gas wars" when blocks are about to timeout
 */
CREATE OR REPLACE FUNCTION auto_boost_near_deadline()
RETURNS TABLE(block_id UUID, old_priority INTEGER, new_priority INTEGER) AS $$
BEGIN
  RETURN QUERY
  UPDATE session_blocks
  SET
    priority = LEAST(100, priority + 20),
    boost_count = boost_count + 1
  WHERE status = 'pending'
    AND deadline_at < NOW() + INTERVAL '1 minute' -- Less than 1 minute to deadline
    AND priority < 80 -- Only boost if not already high priority
  RETURNING
    session_blocks.block_id,
    priority - 20 as old_priority,
    priority as new_priority;
END;
$$ LANGUAGE plpgsql;

/**
 * Timeout expired blocks
 */
CREATE OR REPLACE FUNCTION timeout_expired_blocks()
RETURNS TABLE(block_id UUID) AS $$
BEGIN
  RETURN QUERY
  UPDATE session_blocks
  SET
    status = 'timeout',
    timeout_at = NOW(),
    error_message = 'Deadline exceeded'
  WHERE status IN ('pending', 'executing')
    AND deadline_at < NOW()
  RETURNING session_blocks.block_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Get block statistics for monitoring
 */
CREATE OR REPLACE FUNCTION get_block_stats()
RETURNS TABLE(
  metric VARCHAR(50),
  value NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'total_blocks'::VARCHAR(50), COUNT(*)::NUMERIC FROM session_blocks WHERE created_at > NOW() - INTERVAL '1 hour'
  UNION ALL
  SELECT 'pending'::VARCHAR(50), COUNT(*)::NUMERIC FROM session_blocks WHERE status = 'pending'
  UNION ALL
  SELECT 'executing'::VARCHAR(50), COUNT(*)::NUMERIC FROM session_blocks WHERE status = 'executing'
  UNION ALL
  SELECT 'completed'::VARCHAR(50), COUNT(*)::NUMERIC FROM session_blocks WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 hour'
  UNION ALL
  SELECT 'avg_queue_time_ms'::VARCHAR(50), AVG(queue_time_ms)::NUMERIC FROM session_blocks WHERE queue_time_ms IS NOT NULL AND completed_at > NOW() - INTERVAL '1 hour'
  UNION ALL
  SELECT 'avg_execution_time_ms'::VARCHAR(50), AVG(execution_time_ms)::NUMERIC FROM session_blocks WHERE execution_time_ms IS NOT NULL AND completed_at > NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

/**
 * Calculate queue/execution times on status change
 */
CREATE OR REPLACE FUNCTION calculate_block_times()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate queue time when execution starts
  IF NEW.status = 'executing' AND OLD.status = 'pending' THEN
    NEW.queue_time_ms := EXTRACT(EPOCH FROM (NEW.executed_at - NEW.created_at)) * 1000;
  END IF;

  -- Calculate execution time when completed
  IF NEW.status IN ('completed', 'timeout', 'failed') AND OLD.status = 'executing' THEN
    NEW.execution_time_ms := EXTRACT(EPOCH FROM (COALESCE(NEW.completed_at, NEW.timeout_at, NOW()) - NEW.executed_at)) * 1000;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_times_on_status_change
BEFORE UPDATE OF status ON session_blocks
FOR EACH ROW
EXECUTE FUNCTION calculate_block_times();

-- ============================================================================
-- 7. CLEANUP FUNCTIONS
-- ============================================================================

/**
 * Clean up old completed blocks
 * Keep last 24 hours, delete older
 */
CREATE OR REPLACE FUNCTION cleanup_old_blocks()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM session_blocks
  WHERE status IN ('completed', 'timeout', 'failed')
    AND completed_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Composite index for queue retrieval (room + priority + status)
CREATE INDEX idx_session_blocks_queue_retrieval
ON session_blocks(room_id, priority DESC, created_at)
WHERE status = 'pending';

-- Index for deadline monitoring
CREATE INDEX idx_session_blocks_deadline_monitor
ON session_blocks(deadline_at, status)
WHERE status IN ('pending', 'executing');

-- Index for user session tracking
CREATE INDEX idx_session_blocks_user_tracking
ON session_blocks(user_id, created_at DESC)
WHERE user_id IS NOT NULL;

COMMENT ON DATABASE calos IS 'CalOS - Session Block System with Priority Queuing';

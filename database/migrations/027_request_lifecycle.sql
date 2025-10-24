-- Request Lifecycle Tracking
-- Tracks full state lifecycle of every request: created → running → completed → failed → killed → timeout
-- This is the "killed tags" system the user asked for

-- Request lifecycle states table
CREATE TABLE IF NOT EXISTS request_lifecycle (
  id SERIAL PRIMARY KEY,

  -- Request identification
  request_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  parent_request_id UUID, -- For sub-requests/multi-bucket routing

  -- Lifecycle state
  state TEXT NOT NULL DEFAULT 'created' CHECK (
    state IN ('created', 'pending', 'running', 'completed', 'failed', 'killed', 'timeout')
  ),

  -- Timestamps for each state transition
  created_at TIMESTAMPTZ DEFAULT NOW(),
  pending_at TIMESTAMPTZ,
  running_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  killed_at TIMESTAMPTZ,
  timeout_at TIMESTAMPTZ,

  -- Request details
  endpoint TEXT NOT NULL, -- '/agent', '/api/buckets/route', etc.
  method TEXT DEFAULT 'POST',

  -- Routing info
  bucket_id TEXT REFERENCES bucket_instances(bucket_id) ON DELETE SET NULL,
  bucket_name TEXT,
  model_id TEXT,
  routing_rule TEXT,

  -- Request content
  prompt_text TEXT,
  prompt_length INTEGER,
  input_hash TEXT, -- For deduplication

  -- Context
  user_id TEXT,
  session_id TEXT,
  room_id TEXT,
  priority INTEGER DEFAULT 50,

  -- Execution info
  started_by TEXT, -- 'user', 'system', 'agent'
  executed_by TEXT, -- Which agent/bucket handled it

  -- Result tracking
  response_text TEXT,
  response_length INTEGER,
  response_time_ms INTEGER,

  -- Error tracking
  error_message TEXT,
  error_code TEXT,
  error_stack TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Timeout tracking
  timeout_ms INTEGER DEFAULT 120000, -- 2 minutes default
  deadline_at TIMESTAMPTZ,

  -- Kill tracking
  killed_by TEXT, -- Who/what killed it: 'user', 'system', 'timeout'
  kill_reason TEXT,

  -- Cleanup tracking
  cleanup_performed BOOLEAN DEFAULT false,
  cleanup_at TIMESTAMPTZ,
  cleanup_actions JSONB, -- What was cleaned up

  -- Performance metrics
  queue_time_ms INTEGER, -- Time spent in queue
  execution_time_ms INTEGER, -- Actual execution time
  total_time_ms INTEGER, -- End-to-end time

  -- Metadata
  tags TEXT[],
  metadata JSONB,

  -- Indexes for fast lookups
  CONSTRAINT valid_times CHECK (
    (completed_at IS NULL OR running_at IS NOT NULL) AND
    (failed_at IS NULL OR running_at IS NOT NULL) AND
    (killed_at IS NULL OR created_at IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX idx_lifecycle_request_id ON request_lifecycle(request_id);
CREATE INDEX idx_lifecycle_state ON request_lifecycle(state);
CREATE INDEX idx_lifecycle_created ON request_lifecycle(created_at DESC);
CREATE INDEX idx_lifecycle_bucket ON request_lifecycle(bucket_id) WHERE bucket_id IS NOT NULL;
CREATE INDEX idx_lifecycle_user ON request_lifecycle(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_lifecycle_session ON request_lifecycle(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_lifecycle_parent ON request_lifecycle(parent_request_id) WHERE parent_request_id IS NOT NULL;
CREATE INDEX idx_lifecycle_deadline ON request_lifecycle(deadline_at) WHERE state IN ('pending', 'running');

-- State transition log (audit trail)
CREATE TABLE IF NOT EXISTS request_state_transitions (
  id SERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES request_lifecycle(request_id) ON DELETE CASCADE,

  from_state TEXT,
  to_state TEXT NOT NULL,

  transitioned_at TIMESTAMPTZ DEFAULT NOW(),
  transition_duration_ms INTEGER, -- Time in previous state

  reason TEXT, -- Why the transition happened
  triggered_by TEXT, -- What triggered it: 'system', 'user', 'timeout', 'error'

  metadata JSONB -- Additional transition data
);

CREATE INDEX idx_transitions_request ON request_state_transitions(request_id, transitioned_at DESC);
CREATE INDEX idx_transitions_to_state ON request_state_transitions(to_state);

-- Helper functions

/**
 * Create new request lifecycle entry
 */
CREATE OR REPLACE FUNCTION create_request_lifecycle(
  p_endpoint TEXT,
  p_prompt TEXT,
  p_user_id TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_priority INTEGER DEFAULT 50,
  p_timeout_ms INTEGER DEFAULT 120000
) RETURNS UUID AS $$
DECLARE
  v_request_id UUID;
BEGIN
  INSERT INTO request_lifecycle (
    endpoint,
    prompt_text,
    prompt_length,
    input_hash,
    user_id,
    session_id,
    priority,
    timeout_ms,
    deadline_at,
    state
  ) VALUES (
    p_endpoint,
    p_prompt,
    LENGTH(p_prompt),
    MD5(p_prompt),
    p_user_id,
    p_session_id,
    p_priority,
    p_timeout_ms,
    NOW() + (p_timeout_ms || ' milliseconds')::INTERVAL,
    'created'
  ) RETURNING request_id INTO v_request_id;

  -- Log state transition
  INSERT INTO request_state_transitions (
    request_id, from_state, to_state, triggered_by, reason
  ) VALUES (
    v_request_id, NULL, 'created', 'system', 'Request created'
  );

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Transition request to new state
 */
CREATE OR REPLACE FUNCTION transition_request_state(
  p_request_id UUID,
  p_new_state TEXT,
  p_reason TEXT DEFAULT NULL,
  p_triggered_by TEXT DEFAULT 'system'
) RETURNS BOOLEAN AS $$
DECLARE
  v_old_state TEXT;
  v_old_timestamp TIMESTAMPTZ;
  v_duration_ms INTEGER;
BEGIN
  -- Get current state
  SELECT state,
    CASE
      WHEN state = 'created' THEN created_at
      WHEN state = 'pending' THEN pending_at
      WHEN state = 'running' THEN running_at
      ELSE created_at
    END
  INTO v_old_state, v_old_timestamp
  FROM request_lifecycle
  WHERE request_id = p_request_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Calculate duration in previous state
  v_duration_ms := EXTRACT(EPOCH FROM (NOW() - v_old_timestamp)) * 1000;

  -- Update request lifecycle
  UPDATE request_lifecycle
  SET
    state = p_new_state,
    pending_at = CASE WHEN p_new_state = 'pending' THEN NOW() ELSE pending_at END,
    running_at = CASE WHEN p_new_state = 'running' THEN NOW() ELSE running_at END,
    completed_at = CASE WHEN p_new_state = 'completed' THEN NOW() ELSE completed_at END,
    failed_at = CASE WHEN p_new_state = 'failed' THEN NOW() ELSE failed_at END,
    killed_at = CASE WHEN p_new_state = 'killed' THEN NOW() ELSE killed_at END,
    timeout_at = CASE WHEN p_new_state = 'timeout' THEN NOW() ELSE timeout_at END
  WHERE request_id = p_request_id;

  -- Log transition
  INSERT INTO request_state_transitions (
    request_id,
    from_state,
    to_state,
    transition_duration_ms,
    reason,
    triggered_by
  ) VALUES (
    p_request_id,
    v_old_state,
    p_new_state,
    v_duration_ms,
    p_reason,
    p_triggered_by
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

/**
 * Kill request (user cancelled, timeout, etc.)
 */
CREATE OR REPLACE FUNCTION kill_request(
  p_request_id UUID,
  p_killed_by TEXT,
  p_reason TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE request_lifecycle
  SET
    state = 'killed',
    killed_at = NOW(),
    killed_by = p_killed_by,
    kill_reason = p_reason
  WHERE request_id = p_request_id
    AND state IN ('created', 'pending', 'running');

  IF FOUND THEN
    -- Log transition
    PERFORM transition_request_state(p_request_id, 'killed', p_reason, p_killed_by);
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

/**
 * Mark timed-out requests
 */
CREATE OR REPLACE FUNCTION mark_timed_out_requests() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH timed_out AS (
    UPDATE request_lifecycle
    SET
      state = 'timeout',
      timeout_at = NOW()
    WHERE state IN ('pending', 'running')
      AND deadline_at < NOW()
    RETURNING request_id
  )
  SELECT COUNT(*) INTO v_count FROM timed_out;

  -- Log transitions
  INSERT INTO request_state_transitions (request_id, from_state, to_state, reason, triggered_by)
  SELECT
    request_id,
    state,
    'timeout',
    'Exceeded deadline',
    'system'
  FROM request_lifecycle
  WHERE state = 'timeout'
    AND timeout_at >= NOW() - INTERVAL '1 second';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

/**
 * Clean up old completed/failed/killed requests
 */
CREATE OR REPLACE FUNCTION cleanup_old_requests(
  p_keep_days INTEGER DEFAULT 7
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM request_lifecycle
    WHERE state IN ('completed', 'failed', 'killed', 'timeout')
      AND COALESCE(completed_at, failed_at, killed_at, timeout_at) < NOW() - (p_keep_days || ' days')::INTERVAL
    RETURNING request_id
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

/**
 * Get request statistics
 */
CREATE OR REPLACE FUNCTION get_request_stats()
RETURNS TABLE(
  state TEXT,
  count BIGINT,
  avg_duration_ms REAL,
  max_duration_ms INTEGER,
  oldest TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rl.state,
    COUNT(*)::BIGINT,
    AVG(
      EXTRACT(EPOCH FROM (
        COALESCE(completed_at, failed_at, killed_at, timeout_at, NOW()) - created_at
      )) * 1000
    )::REAL as avg_duration_ms,
    MAX(
      EXTRACT(EPOCH FROM (
        COALESCE(completed_at, failed_at, killed_at, timeout_at, NOW()) - created_at
      )) * 1000
    )::INTEGER as max_duration_ms,
    MIN(created_at) as oldest
  FROM request_lifecycle rl
  GROUP BY rl.state;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE request_lifecycle IS 'Full lifecycle tracking for all requests: created → pending → running → completed/failed/killed/timeout';
COMMENT ON TABLE request_state_transitions IS 'Audit trail of all state transitions for requests';
COMMENT ON FUNCTION create_request_lifecycle IS 'Create new request lifecycle entry with automatic deadline calculation';
COMMENT ON FUNCTION transition_request_state IS 'Move request to new state with automatic timing and logging';
COMMENT ON FUNCTION kill_request IS 'Kill active request with reason (user cancel, timeout, error)';
COMMENT ON FUNCTION mark_timed_out_requests IS 'Scan for requests past deadline and mark as timeout';
COMMENT ON FUNCTION cleanup_old_requests IS 'Clean up completed/failed/killed requests older than N days';

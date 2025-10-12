-- ============================================================================
-- Lofi Streaming Room System
-- Session tracking, song requests, heatmaps, live viewer counts
-- ============================================================================

-- ============================================================================
-- Visit Sessions (UPC-style pairing from visit → close)
-- ============================================================================

CREATE TABLE IF NOT EXISTS visit_sessions (
  id SERIAL PRIMARY KEY,

  -- Session identification
  session_id UUID UNIQUE NOT NULL,
  device_id VARCHAR(64),
  user_id UUID, -- No FK constraint due to permissions

  -- Page/room tracking
  page VARCHAR(255),
  room_name VARCHAR(100),

  -- Timing
  start_time TIMESTAMP DEFAULT NOW(),
  end_time TIMESTAMP,
  duration_ms INTEGER,

  -- Interaction tracking
  total_interactions INTEGER DEFAULT 0,
  interaction_data JSONB, -- Array of {type, timestamp, data}

  -- Metadata
  metadata JSONB -- {userAgent, referrer, ip, etc}
);

-- Indexes
CREATE INDEX idx_visit_sessions_session_id ON visit_sessions(session_id);
CREATE INDEX idx_visit_sessions_device_id ON visit_sessions(device_id);
CREATE INDEX idx_visit_sessions_user_id ON visit_sessions(user_id);
CREATE INDEX idx_visit_sessions_page ON visit_sessions(page);
CREATE INDEX idx_visit_sessions_start_time ON visit_sessions(start_time DESC);
CREATE INDEX idx_visit_sessions_duration ON visit_sessions(duration_ms DESC);

-- ============================================================================
-- Heatmap Data (click/hover tracking to "cast shadows")
-- ============================================================================

CREATE TABLE IF NOT EXISTS heatmap_data (
  id SERIAL PRIMARY KEY,

  -- Session tracking
  session_id UUID,
  device_id VARCHAR(64),

  -- Page/room identification
  page VARCHAR(255) NOT NULL,
  room_name VARCHAR(100),

  -- Interaction details
  interaction_type VARCHAR(50) NOT NULL, -- 'click', 'hover', 'scroll', 'touch'

  -- Normalized coordinates (0-1 range for responsiveness)
  x_position DECIMAL(5,4), -- 0.0000 to 1.0000
  y_position DECIMAL(5,4),

  -- Raw coordinates (for debugging)
  raw_x INTEGER,
  raw_y INTEGER,
  viewport_width INTEGER,
  viewport_height INTEGER,

  -- Element information
  element_id VARCHAR(255),
  element_class VARCHAR(255),
  element_tag VARCHAR(50),

  -- Timestamp
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_heatmap_page ON heatmap_data(page);
CREATE INDEX idx_heatmap_room ON heatmap_data(room_name);
CREATE INDEX idx_heatmap_type ON heatmap_data(interaction_type);
CREATE INDEX idx_heatmap_time ON heatmap_data(recorded_at DESC);
CREATE INDEX idx_heatmap_position ON heatmap_data(x_position, y_position);

-- ============================================================================
-- Song Requests (queue system for lofi room)
-- ============================================================================

CREATE TABLE IF NOT EXISTS song_requests (
  id SERIAL PRIMARY KEY,

  -- Requester information
  device_id VARCHAR(64) NOT NULL,
  user_id UUID,

  -- Song details
  song_title VARCHAR(255) NOT NULL,
  song_artist VARCHAR(255),
  song_url TEXT, -- YouTube/Spotify URL
  song_duration_seconds INTEGER,

  -- Request details
  message TEXT, -- Optional comment with request
  requested_at TIMESTAMP DEFAULT NOW(),

  -- Queue management
  queue_position INTEGER,
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, played, skipped

  -- Moderation
  approved_by UUID, -- Moderator who approved
  approved_at TIMESTAMP,
  rejection_reason TEXT,

  -- Playback tracking
  played_at TIMESTAMP,
  play_duration_ms INTEGER, -- How long it actually played
  skip_count INTEGER DEFAULT 0, -- How many people voted to skip

  -- Badge/reputation requirements met
  requester_badge VARCHAR(50),
  requester_reputation DECIMAL(3,2)
);

-- Indexes
CREATE INDEX idx_song_requests_device ON song_requests(device_id);
CREATE INDEX idx_song_requests_status ON song_requests(status);
CREATE INDEX idx_song_requests_queue ON song_requests(queue_position);
CREATE INDEX idx_song_requests_time ON song_requests(requested_at DESC);

-- ============================================================================
-- Current Room State (for "now playing" and viewer counts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS room_state (
  id SERIAL PRIMARY KEY,
  room_name VARCHAR(100) UNIQUE NOT NULL,

  -- Current song
  current_song_id INTEGER REFERENCES song_requests(id),
  current_song_started_at TIMESTAMP,

  -- Viewer stats
  current_viewers INTEGER DEFAULT 0,
  peak_viewers INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,

  -- Queue stats
  queue_length INTEGER DEFAULT 0,

  -- Last updated
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Initialize lofi room
INSERT INTO room_state (room_name)
VALUES ('lofi-stream')
ON CONFLICT (room_name) DO NOTHING;

-- ============================================================================
-- Views
-- ============================================================================

/**
 * Active song queue (pending + approved)
 */
CREATE OR REPLACE VIEW song_queue AS
SELECT
  sr.id,
  sr.song_title,
  sr.song_artist,
  sr.song_url,
  sr.song_duration_seconds,
  sr.message,
  sr.queue_position,
  sr.status,
  sr.requested_at,
  sr.requester_badge,
  ud.current_badge as current_requester_badge,
  ud.trust_score
FROM song_requests sr
LEFT JOIN user_devices ud ON sr.device_id = ud.device_id
WHERE sr.status IN ('pending', 'approved')
ORDER BY sr.queue_position ASC, sr.requested_at ASC;

/**
 * Heatmap aggregation (for visualization)
 */
CREATE OR REPLACE VIEW heatmap_summary AS
SELECT
  page,
  room_name,
  interaction_type,
  ROUND(x_position::numeric, 2) as x_bucket,
  ROUND(y_position::numeric, 2) as y_bucket,
  COUNT(*) as interaction_count,
  MAX(recorded_at) as last_interaction
FROM heatmap_data
WHERE recorded_at > NOW() - INTERVAL '24 hours'
GROUP BY page, room_name, interaction_type, x_bucket, y_bucket
HAVING COUNT(*) > 2 -- Filter noise
ORDER BY interaction_count DESC;

/**
 * Session analytics (avg duration, bounce rate, etc)
 */
CREATE OR REPLACE VIEW session_analytics AS
SELECT
  page,
  COUNT(*) as total_sessions,
  AVG(duration_ms) as avg_duration_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as median_duration_ms,
  COUNT(*) FILTER (WHERE duration_ms < 5000) as bounce_count,
  COUNT(*) FILTER (WHERE duration_ms < 5000)::FLOAT / COUNT(*) as bounce_rate,
  AVG(total_interactions) as avg_interactions,
  COUNT(DISTINCT device_id) as unique_devices,
  MAX(start_time) as last_session
FROM visit_sessions
WHERE start_time > NOW() - INTERVAL '7 days'
GROUP BY page
ORDER BY total_sessions DESC;

-- ============================================================================
-- Functions
-- ============================================================================

/**
 * Request a song (with badge permission check)
 */
CREATE OR REPLACE FUNCTION request_song(
  p_device_id VARCHAR(64),
  p_user_id UUID,
  p_song_title VARCHAR(255),
  p_song_artist VARCHAR(255),
  p_song_url TEXT,
  p_message TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  request_id INTEGER,
  queue_position INTEGER,
  error_code VARCHAR(50)
) AS $$
DECLARE
  v_device RECORD;
  v_recent_requests INTEGER;
  v_new_id INTEGER;
  v_new_position INTEGER;
BEGIN
  -- Get device info
  SELECT * INTO v_device FROM user_devices WHERE device_id = p_device_id;

  -- Check if device is blocked or suspicious
  IF v_device.is_blocked THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'DEVICE_BLOCKED'::VARCHAR;
    RETURN;
  END IF;

  IF v_device.is_suspicious AND v_device.trust_score < 0.5 THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'SUSPICIOUS_DEVICE'::VARCHAR;
    RETURN;
  END IF;

  -- Check permission (need at least contributor badge)
  IF v_device.current_badge IN ('newcomer') THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'INSUFFICIENT_BADGE'::VARCHAR;
    RETURN;
  END IF;

  -- Rate limit: max 3 requests per hour
  SELECT COUNT(*) INTO v_recent_requests
  FROM song_requests
  WHERE device_id = p_device_id
    AND requested_at > NOW() - INTERVAL '1 hour';

  IF v_recent_requests >= 3 THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'RATE_LIMIT_EXCEEDED'::VARCHAR;
    RETURN;
  END IF;

  -- Get next queue position
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_new_position
  FROM song_requests
  WHERE status IN ('pending', 'approved');

  -- Insert song request
  INSERT INTO song_requests (
    device_id,
    user_id,
    song_title,
    song_artist,
    song_url,
    message,
    queue_position,
    status,
    requester_badge,
    requester_reputation
  )
  VALUES (
    p_device_id,
    p_user_id,
    p_song_title,
    p_song_artist,
    p_song_url,
    p_message,
    v_new_position,
    CASE
      WHEN v_device.trust_score >= 0.7 THEN 'approved'
      ELSE 'pending'
    END,
    v_device.current_badge,
    v_device.reputation_score
  )
  RETURNING id INTO v_new_id;

  -- Update room state queue length
  UPDATE room_state
  SET queue_length = queue_length + 1,
      last_updated = NOW()
  WHERE room_name = 'lofi-stream';

  RETURN QUERY SELECT TRUE, v_new_id, v_new_position, NULL::VARCHAR;
END;
$$ LANGUAGE plpgsql;

/**
 * Approve/reject song request (moderator only)
 */
CREATE OR REPLACE FUNCTION moderate_song_request(
  p_request_id INTEGER,
  p_moderator_id UUID,
  p_action VARCHAR(20), -- 'approve' or 'reject'
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_moderator RECORD;
BEGIN
  -- Check if moderator has permission
  SELECT * INTO v_moderator FROM user_devices WHERE user_id = p_moderator_id;

  IF NOT v_moderator.can_moderate THEN
    RETURN FALSE;
  END IF;

  IF p_action = 'approve' THEN
    UPDATE song_requests
    SET status = 'approved',
        approved_by = p_moderator_id,
        approved_at = NOW()
    WHERE id = p_request_id;
  ELSIF p_action = 'reject' THEN
    UPDATE song_requests
    SET status = 'rejected',
        approved_by = p_moderator_id,
        approved_at = NOW(),
        rejection_reason = p_reason
    WHERE id = p_request_id;
  ELSE
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

/**
 * Mark song as played
 */
CREATE OR REPLACE FUNCTION mark_song_played(
  p_request_id INTEGER,
  p_play_duration_ms INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE song_requests
  SET status = 'played',
      played_at = NOW(),
      play_duration_ms = p_play_duration_ms
  WHERE id = p_request_id;

  -- Update room state
  UPDATE room_state
  SET current_song_id = p_request_id,
      current_song_started_at = NOW(),
      queue_length = GREATEST(queue_length - 1, 0),
      last_updated = NOW()
  WHERE room_name = 'lofi-stream';
END;
$$ LANGUAGE plpgsql;

/**
 * Update room viewer count
 */
CREATE OR REPLACE FUNCTION update_room_viewers(
  p_room_name VARCHAR(100),
  p_viewer_count INTEGER
)
RETURNS VOID AS $$
DECLARE
  v_current_peak INTEGER;
BEGIN
  -- Get current peak
  SELECT peak_viewers INTO v_current_peak
  FROM room_state
  WHERE room_name = p_room_name;

  -- Update room state
  UPDATE room_state
  SET current_viewers = p_viewer_count,
      peak_viewers = GREATEST(COALESCE(v_current_peak, 0), p_viewer_count),
      total_sessions = total_sessions + 1,
      last_updated = NOW()
  WHERE room_name = p_room_name;

  -- Insert if room doesn't exist
  IF NOT FOUND THEN
    INSERT INTO room_state (room_name, current_viewers, peak_viewers, total_sessions)
    VALUES (p_room_name, p_viewer_count, p_viewer_count, 1);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON visit_sessions TO postgres;
GRANT USAGE ON SEQUENCE visit_sessions_id_seq TO postgres;

GRANT SELECT, INSERT, UPDATE, DELETE ON heatmap_data TO postgres;
GRANT USAGE ON SEQUENCE heatmap_data_id_seq TO postgres;

GRANT SELECT, INSERT, UPDATE, DELETE ON song_requests TO postgres;
GRANT USAGE ON SEQUENCE song_requests_id_seq TO postgres;

GRANT SELECT, INSERT, UPDATE, DELETE ON room_state TO postgres;
GRANT USAGE ON SEQUENCE room_state_id_seq TO postgres;

GRANT SELECT ON song_queue TO postgres;
GRANT SELECT ON heatmap_summary TO postgres;
GRANT SELECT ON session_analytics TO postgres;

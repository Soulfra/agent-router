/**
 * Migration 041: Bounce Detection & Session Heartbeat Tracking
 *
 * Adds timer-based bounce detection for spam filtering and analytics:
 * - Heartbeat tracking (5-second timer)
 * - Bounce detection (no interaction, fast exit)
 * - IP rotation tracking (residential proxy use case)
 * - Cross-domain session preservation
 */

-- ============================================================================
-- UPDATE visit_sessions TABLE
-- ============================================================================

-- Add heartbeat tracking columns
ALTER TABLE visit_sessions
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS heartbeat_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add bounce detection columns
ALTER TABLE visit_sessions
ADD COLUMN IF NOT EXISTS bounce_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bounce_reason TEXT,
ADD COLUMN IF NOT EXISTS bounce_time_ms INTEGER;

-- Add IP tracking columns (for residential proxy / VPN use case)
ALTER TABLE visit_sessions
ADD COLUMN IF NOT EXISTS ip_address TEXT,
ADD COLUMN IF NOT EXISTS ip_hash TEXT, -- SHA-256 hash for privacy
ADD COLUMN IF NOT EXISTS ip_rotations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ip_history JSONB DEFAULT '[]'; -- Array of {ip, timestamp}

-- Add affiliate tracking columns (session-based, not cookie-based)
ALTER TABLE visit_sessions
ADD COLUMN IF NOT EXISTS affiliate_code TEXT,
ADD COLUMN IF NOT EXISTS referral_source TEXT,
ADD COLUMN IF NOT EXISTS campaign_id TEXT;

-- Add spam detection columns
ALTER TABLE visit_sessions
ADD COLUMN IF NOT EXISTS spam_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bot_reason TEXT;

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_visit_sessions_active ON visit_sessions(is_active, last_heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_visit_sessions_bounce ON visit_sessions(bounce_detected, bounce_reason);
CREATE INDEX IF NOT EXISTS idx_visit_sessions_affiliate ON visit_sessions(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_visit_sessions_ip_hash ON visit_sessions(ip_hash);
CREATE INDEX IF NOT EXISTS idx_visit_sessions_spam ON visit_sessions(spam_score DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update heartbeat
CREATE OR REPLACE FUNCTION update_session_heartbeat(
  p_session_id UUID,
  p_ip_address TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE visit_sessions
  SET
    last_heartbeat_at = NOW(),
    heartbeat_count = heartbeat_count + 1,
    is_active = true,
    -- Track IP rotation if IP changed
    ip_rotations = CASE
      WHEN p_ip_address IS NOT NULL AND p_ip_address != ip_address
      THEN ip_rotations + 1
      ELSE ip_rotations
    END,
    ip_history = CASE
      WHEN p_ip_address IS NOT NULL AND p_ip_address != ip_address
      THEN ip_history || jsonb_build_object(
        'ip', p_ip_address,
        'timestamp', NOW()
      )
      ELSE ip_history
    END,
    ip_address = COALESCE(p_ip_address, ip_address)
  WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Function to detect bounces
CREATE OR REPLACE FUNCTION detect_bounces() RETURNS void AS $$
BEGIN
  -- Mark sessions as bounced if:
  -- 1. No heartbeat for 30+ seconds
  -- 2. Total duration < 5 seconds
  -- 3. Zero interactions

  UPDATE visit_sessions
  SET
    bounce_detected = true,
    bounce_reason = CASE
      WHEN last_heartbeat_at IS NOT NULL AND last_heartbeat_at < NOW() - INTERVAL '30 seconds'
        THEN 'no_heartbeat_30s'
      WHEN duration_ms IS NOT NULL AND duration_ms < 5000 AND total_interactions = 0
        THEN 'fast_exit_no_interaction'
      WHEN total_interactions = 0 AND end_time IS NOT NULL
        THEN 'zero_interactions'
      WHEN heartbeat_count < 2
        THEN 'insufficient_heartbeats'
      ELSE 'timeout'
    END,
    bounce_time_ms = EXTRACT(EPOCH FROM (COALESCE(last_heartbeat_at, end_time, NOW()) - start_time)) * 1000,
    is_active = false
  WHERE
    is_active = true
    AND bounce_detected = false
    AND (
      -- No heartbeat for 30 seconds
      (last_heartbeat_at IS NOT NULL AND last_heartbeat_at < NOW() - INTERVAL '30 seconds')
      OR
      -- Session ended with no interaction
      (end_time IS NOT NULL AND total_interactions = 0)
      OR
      -- Very short session
      (duration_ms IS NOT NULL AND duration_ms < 5000 AND total_interactions = 0)
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Bounce analytics by page
CREATE OR REPLACE VIEW bounce_analytics_by_page AS
SELECT
  page,
  COUNT(*) as total_sessions,
  SUM(CASE WHEN bounce_detected THEN 1 ELSE 0 END) as bounced_sessions,
  ROUND(
    100.0 * SUM(CASE WHEN bounce_detected THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
    2
  ) as bounce_rate_percent,
  AVG(CASE WHEN bounce_detected THEN bounce_time_ms ELSE NULL END) as avg_bounce_time_ms,
  COUNT(DISTINCT bounce_reason) as unique_bounce_reasons
FROM visit_sessions
WHERE page IS NOT NULL
GROUP BY page
ORDER BY bounce_rate_percent DESC;

-- Spam detection view
CREATE OR REPLACE VIEW potential_spam_sessions AS
SELECT
  session_id,
  device_id,
  ip_hash,
  page,
  bounce_detected,
  bounce_reason,
  heartbeat_count,
  total_interactions,
  spam_score,
  is_bot,
  bot_reason,
  start_time,
  duration_ms
FROM visit_sessions
WHERE
  spam_score > 50
  OR is_bot = true
  OR (bounce_detected = true AND heartbeat_count < 2)
ORDER BY spam_score DESC, start_time DESC;

-- Active sessions view
CREATE OR REPLACE VIEW active_sessions AS
SELECT
  session_id,
  page,
  room_name,
  heartbeat_count,
  last_heartbeat_at,
  EXTRACT(EPOCH FROM (NOW() - start_time)) as session_duration_seconds,
  total_interactions,
  ip_rotations,
  affiliate_code
FROM visit_sessions
WHERE
  is_active = true
  AND last_heartbeat_at > NOW() - INTERVAL '30 seconds'
ORDER BY last_heartbeat_at DESC;

-- Affiliate attribution view (cross-domain tracking)
CREATE OR REPLACE VIEW affiliate_session_tracking AS
SELECT
  vs.session_id,
  vs.affiliate_code,
  vs.referral_source,
  vs.campaign_id,
  vs.start_time,
  vs.end_time,
  vs.duration_ms,
  vs.total_interactions,
  vs.bounce_detected,
  vs.ip_rotations,
  ac.id as conversion_id,
  ac.conversion_type,
  ac.conversion_value
FROM visit_sessions vs
LEFT JOIN analytics_conversions ac ON vs.session_id::text = ac.session_id
WHERE vs.affiliate_code IS NOT NULL
ORDER BY vs.start_time DESC;

-- ============================================================================
-- SCHEDULED CLEANUP
-- ============================================================================

-- Function to clean up old inactive sessions
CREATE OR REPLACE FUNCTION cleanup_inactive_sessions() RETURNS void AS $$
BEGIN
  -- Mark sessions as inactive if no heartbeat for 5 minutes
  UPDATE visit_sessions
  SET
    is_active = false,
    end_time = COALESCE(end_time, last_heartbeat_at, NOW())
  WHERE
    is_active = true
    AND last_heartbeat_at < NOW() - INTERVAL '5 minutes';

  -- Auto-detect bounces for ended sessions
  PERFORM detect_bounces();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE visit_sessions IS 'Session tracking with timer-based bounce detection and IP rotation tracking';
COMMENT ON COLUMN visit_sessions.heartbeat_count IS 'Number of 5-second heartbeats received';
COMMENT ON COLUMN visit_sessions.bounce_detected IS 'Whether session was detected as a bounce (spam filter)';
COMMENT ON COLUMN visit_sessions.ip_rotations IS 'Number of IP changes (residential proxy tracking)';
COMMENT ON COLUMN visit_sessions.affiliate_code IS 'Affiliate code from URL params (session-based, not cookie)';

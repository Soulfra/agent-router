-- ============================================================================
-- User Devices & Reputation Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_devices (
  id SERIAL PRIMARY KEY,

  -- Device identification
  device_id VARCHAR(64) UNIQUE NOT NULL,
  user_id UUID, -- No FK constraint due to permissions

  -- Timestamps
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),

  -- Device fingerprint components (for debugging/verification)
  fingerprint_data JSONB,

  -- Voting stats
  total_votes INTEGER DEFAULT 0,
  total_matches_played INTEGER DEFAULT 0,

  -- Reputation metrics
  trust_score DECIMAL(3,2) DEFAULT 0.50,
  consistency_score DECIMAL(3,2) DEFAULT 0.50,
  reputation_score DECIMAL(3,2) DEFAULT 0.50,

  -- Badge/tier system
  current_badge VARCHAR(50) DEFAULT 'newcomer',
  badge_earned_at TIMESTAMP,

  -- Permission levels (unlocked through reputation)
  can_vote BOOLEAN DEFAULT TRUE,
  can_chat BOOLEAN DEFAULT FALSE,
  can_create_polls BOOLEAN DEFAULT FALSE,
  can_moderate BOOLEAN DEFAULT FALSE,

  -- Anti-abuse
  is_suspicious BOOLEAN DEFAULT FALSE,
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_reason TEXT,
  blocked_until TIMESTAMP,

  -- Activity tracking
  days_active INTEGER DEFAULT 1,
  last_active_date DATE DEFAULT CURRENT_DATE
);

-- Indexes
CREATE INDEX idx_user_devices_device_id ON user_devices(device_id);
CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX idx_user_devices_badge ON user_devices(current_badge);
CREATE INDEX idx_user_devices_trust ON user_devices(trust_score DESC);
CREATE INDEX idx_user_devices_last_seen ON user_devices(last_seen DESC);

-- ============================================================================
-- Device Activity Tracking
-- ============================================================================

/**
 * Update device activity (call this on every vote)
 */
CREATE OR REPLACE FUNCTION update_device_activity(
  p_device_id VARCHAR(64),
  p_user_id UUID DEFAULT NULL,
  p_fingerprint_data JSONB DEFAULT NULL
)
RETURNS TABLE(
  device_record_id INTEGER,
  is_new_device BOOLEAN
) AS $$
DECLARE
  v_device RECORD;
  v_is_new BOOLEAN DEFAULT FALSE;
  v_today DATE DEFAULT CURRENT_DATE;
BEGIN
  -- Try to find existing device
  SELECT * INTO v_device FROM user_devices WHERE device_id = p_device_id;

  IF NOT FOUND THEN
    -- New device
    v_is_new := TRUE;

    INSERT INTO user_devices (
      device_id,
      user_id,
      fingerprint_data,
      first_seen,
      last_seen,
      days_active,
      last_active_date
    )
    VALUES (
      p_device_id,
      p_user_id,
      p_fingerprint_data,
      NOW(),
      NOW(),
      1,
      v_today
    )
    RETURNING id INTO v_device;

  ELSE
    -- Existing device - update activity
    UPDATE user_devices
    SET
      last_seen = NOW(),
      user_id = COALESCE(p_user_id, user_id), -- Link to user if provided
      fingerprint_data = COALESCE(p_fingerprint_data, fingerprint_data),
      days_active = CASE
        WHEN last_active_date < v_today THEN days_active + 1
        ELSE days_active
      END,
      last_active_date = v_today
    WHERE device_id = p_device_id
    RETURNING id INTO v_device;
  END IF;

  RETURN QUERY SELECT v_device.id, v_is_new;
END;
$$ LANGUAGE plpgsql;

/**
 * Update device reputation after vote
 */
CREATE OR REPLACE FUNCTION update_device_reputation(
  p_device_id VARCHAR(64),
  p_vote_was_suspicious BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
DECLARE
  v_device RECORD;
  v_vote_history RECORD;
  v_new_trust DECIMAL;
  v_new_consistency DECIMAL;
BEGIN
  -- Get current device stats
  SELECT * INTO v_device FROM user_devices WHERE device_id = p_device_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Get vote history for calculations
  SELECT
    COUNT(*) as total_votes,
    COUNT(DISTINCT winner_id) as unique_winners,
    AVG(vote_duration_ms) as avg_duration,
    COUNT(*) FILTER (WHERE is_suspicious) as suspicious_count
  INTO v_vote_history
  FROM elo_user_votes
  WHERE device_fingerprint = p_device_id
    AND voted_at > NOW() - INTERVAL '30 days';

  -- Calculate trust score
  v_new_trust := 0.5;

  -- Good variety of choices
  IF v_vote_history.total_votes > 0 THEN
    v_new_trust := v_new_trust + (v_vote_history.unique_winners::DECIMAL / v_vote_history.total_votes) * 0.3;
  END IF;

  -- Thoughtful voting (1-30 seconds)
  IF v_vote_history.avg_duration > 1000 AND v_vote_history.avg_duration < 30000 THEN
    v_new_trust := v_new_trust + 0.2;
  END IF;

  -- Penalize suspicious behavior
  IF v_vote_history.total_votes > 0 THEN
    v_new_trust := v_new_trust - (v_vote_history.suspicious_count::DECIMAL / v_vote_history.total_votes) * 0.4;
  END IF;

  v_new_trust := GREATEST(0, LEAST(1, v_new_trust));

  -- Calculate consistency score (based on variance)
  v_new_consistency := 0.7; -- Placeholder, would need more complex calculation

  -- Update device
  UPDATE user_devices
  SET
    total_votes = total_votes + 1,
    trust_score = v_new_trust,
    consistency_score = v_new_consistency,
    reputation_score = (v_new_trust + v_new_consistency) / 2,
    is_suspicious = (v_new_trust < 0.3)
  WHERE device_id = p_device_id;

END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Views
-- ============================================================================

CREATE OR REPLACE VIEW device_leaderboard AS
SELECT
  device_id,
  user_id,
  current_badge,
  total_votes,
  trust_score,
  reputation_score,
  days_active,
  first_seen,
  last_seen
FROM user_devices
WHERE NOT is_blocked
  AND NOT is_suspicious
ORDER BY reputation_score DESC, total_votes DESC
LIMIT 100;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON user_devices TO postgres;
GRANT USAGE ON SEQUENCE user_devices_id_seq TO postgres;
GRANT SELECT ON device_leaderboard TO postgres;

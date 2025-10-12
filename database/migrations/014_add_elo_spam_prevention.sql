-- ============================================================================
-- ELO Spam Prevention & Vote Tracking
-- ============================================================================

-- Track individual votes to prevent duplicates
CREATE TABLE IF NOT EXISTS elo_user_votes (
  id SERIAL PRIMARY KEY,

  -- Match info
  match_id INTEGER REFERENCES elo_matches(id) ON DELETE CASCADE,
  item_a_id INTEGER REFERENCES elo_items(id) ON DELETE CASCADE,
  item_b_id INTEGER REFERENCES elo_items(id) ON DELETE CASCADE,
  winner_id INTEGER REFERENCES elo_items(id) ON DELETE SET NULL,

  -- User identification (at least one required)
  user_id UUID, -- No FK constraint due to permissions
  session_id VARCHAR(100),
  device_fingerprint VARCHAR(64),
  ip_address INET,

  -- User tier at time of vote
  user_tier VARCHAR(20) DEFAULT 'anonymous',

  -- Spam detection metadata
  vote_duration_ms INTEGER, -- How long did they view before voting?
  is_suspicious BOOLEAN DEFAULT FALSE,
  suspicious_reason TEXT,

  -- Timestamps
  voted_at TIMESTAMP DEFAULT NOW(),

  -- Indexes for duplicate detection
  CONSTRAINT unique_user_matchup_24h UNIQUE (user_id, item_a_id, item_b_id),
  CONSTRAINT unique_session_matchup_24h UNIQUE (session_id, item_a_id, item_b_id)
);

-- Index for vote tracking queries
CREATE INDEX idx_elo_votes_user_id ON elo_user_votes(user_id);
CREATE INDEX idx_elo_votes_session_id ON elo_user_votes(session_id);
CREATE INDEX idx_elo_votes_device_fp ON elo_user_votes(device_fingerprint);
CREATE INDEX idx_elo_votes_ip ON elo_user_votes(ip_address);
CREATE INDEX idx_elo_votes_voted_at ON elo_user_votes(voted_at);
CREATE INDEX idx_elo_votes_suspicious ON elo_user_votes(is_suspicious) WHERE is_suspicious = TRUE;

-- Track suspicious voting patterns
CREATE TABLE IF NOT EXISTS elo_spam_patterns (
  id SERIAL PRIMARY KEY,

  -- Identifier
  identifier_type VARCHAR(20), -- 'user', 'session', 'ip', 'device'
  identifier_value TEXT,

  -- Pattern details
  pattern_type VARCHAR(50), -- 'rapid_fire', 'bias_detected', 'vote_manipulation'
  pattern_data JSONB,

  -- Severity
  severity VARCHAR(20) DEFAULT 'low', -- low, medium, high, critical
  confidence_score DECIMAL(3,2), -- 0.00 to 1.00

  -- Action taken
  action_taken VARCHAR(50), -- 'flagged', 'rate_limited', 'banned'

  -- Timestamps
  first_detected_at TIMESTAMP DEFAULT NOW(),
  last_detected_at TIMESTAMP DEFAULT NOW(),
  occurrences INTEGER DEFAULT 1
);

CREATE INDEX idx_spam_patterns_identifier ON elo_spam_patterns(identifier_type, identifier_value);
CREATE INDEX idx_spam_patterns_type ON elo_spam_patterns(pattern_type);
CREATE INDEX idx_spam_patterns_severity ON elo_spam_patterns(severity);

-- Blocked IPs/devices/users
CREATE TABLE IF NOT EXISTS elo_blocked_voters (
  id SERIAL PRIMARY KEY,

  -- What's blocked
  block_type VARCHAR(20), -- 'user', 'ip', 'device', 'session'
  block_value TEXT,

  -- Why blocked
  reason TEXT,
  blocked_by VARCHAR(20) DEFAULT 'system', -- 'system' or 'admin'

  -- Duration
  blocked_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP, -- NULL = permanent

  -- Evidence
  evidence_pattern_ids INTEGER[], -- References to elo_spam_patterns
  evidence_vote_ids INTEGER[] -- References to elo_user_votes
);

CREATE INDEX idx_blocked_voters_type_value ON elo_blocked_voters(block_type, block_value);
CREATE INDEX idx_blocked_voters_expires ON elo_blocked_voters(expires_at);

-- ============================================================================
-- Functions for spam detection
-- ============================================================================

/**
 * Check if voter is allowed to vote
 */
CREATE OR REPLACE FUNCTION check_voter_allowed(
  p_user_id UUID,
  p_session_id VARCHAR(100),
  p_device_fingerprint VARCHAR(64),
  p_ip_address INET
)
RETURNS TABLE(
  allowed BOOLEAN,
  reason TEXT
) AS $$
BEGIN
  -- Check if user is blocked
  IF EXISTS (
    SELECT 1 FROM elo_blocked_voters
    WHERE block_type = 'user'
      AND block_value = p_user_id::TEXT
      AND (expires_at IS NULL OR expires_at > NOW())
  ) THEN
    RETURN QUERY SELECT FALSE, 'User account is blocked from voting';
    RETURN;
  END IF;

  -- Check if IP is blocked
  IF EXISTS (
    SELECT 1 FROM elo_blocked_voters
    WHERE block_type = 'ip'
      AND block_value = p_ip_address::TEXT
      AND (expires_at IS NULL OR expires_at > NOW())
  ) THEN
    RETURN QUERY SELECT FALSE, 'IP address is blocked from voting';
    RETURN;
  END IF;

  -- Check if device is blocked
  IF EXISTS (
    SELECT 1 FROM elo_blocked_voters
    WHERE block_type = 'device'
      AND block_value = p_device_fingerprint
      AND (expires_at IS NULL OR expires_at > NOW())
  ) THEN
    RETURN QUERY SELECT FALSE, 'Device is blocked from voting';
    RETURN;
  END IF;

  -- Check if session is blocked
  IF EXISTS (
    SELECT 1 FROM elo_blocked_voters
    WHERE block_type = 'session'
      AND block_value = p_session_id
      AND (expires_at IS NULL OR expires_at > NOW())
  ) THEN
    RETURN QUERY SELECT FALSE, 'Session is blocked from voting';
    RETURN;
  END IF;

  -- All checks passed
  RETURN QUERY SELECT TRUE, 'Allowed';
END;
$$ LANGUAGE plpgsql;

/**
 * Check for duplicate vote (same matchup within 24 hours)
 */
CREATE OR REPLACE FUNCTION check_duplicate_vote(
  p_user_id UUID,
  p_session_id VARCHAR(100),
  p_item_a_id INTEGER,
  p_item_b_id INTEGER
)
RETURNS TABLE(
  is_duplicate BOOLEAN,
  previous_vote_id INTEGER,
  previous_voted_at TIMESTAMP
) AS $$
DECLARE
  v_vote RECORD;
BEGIN
  -- Check user votes (if logged in)
  IF p_user_id IS NOT NULL THEN
    SELECT id, elo_user_votes.voted_at INTO v_vote
    FROM elo_user_votes
    WHERE user_id = p_user_id
      AND (
        (item_a_id = p_item_a_id AND item_b_id = p_item_b_id)
        OR (item_a_id = p_item_b_id AND item_b_id = p_item_a_id)
      )
      AND elo_user_votes.voted_at > NOW() - INTERVAL '24 hours'
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY SELECT TRUE, v_vote.id, v_vote.voted_at;
      RETURN;
    END IF;
  END IF;

  -- Check session votes (anonymous)
  IF p_session_id IS NOT NULL THEN
    SELECT id, elo_user_votes.voted_at INTO v_vote
    FROM elo_user_votes
    WHERE session_id = p_session_id
      AND (
        (item_a_id = p_item_a_id AND item_b_id = p_item_b_id)
        OR (item_a_id = p_item_b_id AND item_b_id = p_item_a_id)
      )
      AND elo_user_votes.voted_at > NOW() - INTERVAL '24 hours'
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY SELECT TRUE, v_vote.id, v_vote.voted_at;
      RETURN;
    END IF;
  END IF;

  -- No duplicate found
  RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

/**
 * Detect rapid-fire voting (multiple votes in short time)
 */
CREATE OR REPLACE FUNCTION detect_rapid_fire_voting(
  p_user_id UUID,
  p_session_id VARCHAR(100),
  p_time_window_seconds INTEGER DEFAULT 60,
  p_threshold_count INTEGER DEFAULT 5
)
RETURNS TABLE(
  is_rapid_fire BOOLEAN,
  vote_count INTEGER,
  avg_seconds_between DECIMAL
) AS $$
DECLARE
  v_count INTEGER;
  v_avg DECIMAL;
BEGIN
  -- Count votes and calculate average time between votes
  WITH vote_diffs AS (
    SELECT
      voted_at,
      EXTRACT(EPOCH FROM (voted_at - LAG(voted_at) OVER (ORDER BY voted_at))) as seconds_diff
    FROM elo_user_votes
    WHERE (user_id = p_user_id OR session_id = p_session_id)
      AND voted_at > NOW() - (p_time_window_seconds || ' seconds')::INTERVAL
  )
  SELECT COUNT(*), AVG(seconds_diff)
  INTO v_count, v_avg
  FROM vote_diffs;

  RETURN QUERY SELECT
    v_count >= p_threshold_count,
    v_count,
    COALESCE(v_avg, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Views for spam monitoring
-- ============================================================================

CREATE OR REPLACE VIEW elo_vote_statistics AS
SELECT
  DATE_TRUNC('hour', voted_at) as hour,
  user_tier,
  COUNT(*) as total_votes,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(*) FILTER (WHERE is_suspicious) as suspicious_votes,
  AVG(vote_duration_ms) as avg_vote_duration_ms
FROM elo_user_votes
WHERE voted_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', voted_at), user_tier
ORDER BY hour DESC;

CREATE OR REPLACE VIEW elo_suspicious_voters AS
SELECT
  COALESCE(user_id::TEXT, session_id, device_fingerprint, ip_address::TEXT) as identifier,
  user_tier,
  COUNT(*) as total_votes,
  COUNT(*) FILTER (WHERE is_suspicious) as suspicious_votes,
  ARRAY_AGG(DISTINCT suspicious_reason) FILTER (WHERE suspicious_reason IS NOT NULL) as reasons,
  MIN(voted_at) as first_vote,
  MAX(voted_at) as last_vote,
  COUNT(*) / EXTRACT(EPOCH FROM (MAX(voted_at) - MIN(voted_at) + INTERVAL '1 second')) as votes_per_second
FROM elo_user_votes
GROUP BY COALESCE(user_id::TEXT, session_id, device_fingerprint, ip_address::TEXT), user_tier
HAVING COUNT(*) FILTER (WHERE is_suspicious) > 0
   OR COUNT(*) / EXTRACT(EPOCH FROM (MAX(voted_at) - MIN(voted_at) + INTERVAL '1 second')) > 0.1
ORDER BY suspicious_votes DESC, votes_per_second DESC;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON elo_user_votes TO postgres;
GRANT SELECT, INSERT, UPDATE ON elo_spam_patterns TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON elo_blocked_voters TO postgres;
GRANT USAGE ON SEQUENCE elo_user_votes_id_seq TO postgres;
GRANT USAGE ON SEQUENCE elo_spam_patterns_id_seq TO postgres;
GRANT USAGE ON SEQUENCE elo_blocked_voters_id_seq TO postgres;
GRANT SELECT ON elo_vote_statistics TO postgres;
GRANT SELECT ON elo_suspicious_voters TO postgres;

-- Device Pairing & Multi-Device Authentication System
-- Seamless device pairing via QR codes, WiFi proximity, and trust elevation

-- Extend user_devices table with pairing fields
ALTER TABLE user_devices
ADD COLUMN IF NOT EXISTS trust_level TEXT DEFAULT 'unverified'
  CHECK (trust_level IN ('unverified', 'verified', 'trusted')),
ADD COLUMN IF NOT EXISTS reputation_score REAL DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS nickname TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_user_devices_trust ON user_devices(trust_level);
CREATE INDEX IF NOT EXISTS idx_user_devices_reputation ON user_devices(reputation_score DESC);

-- Device pairing sessions (QR codes, WiFi proximity)
CREATE TABLE IF NOT EXISTS device_pairing_sessions (
  id SERIAL PRIMARY KEY,

  -- Who's pairing
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  source_device_id INTEGER REFERENCES user_devices(id) ON DELETE CASCADE,
  target_device_id INTEGER REFERENCES user_devices(id) ON DELETE SET NULL,

  -- Pairing method
  pairing_method TEXT NOT NULL,  -- 'qr_code', 'wifi_proximity', 'bluetooth', 'manual'
  pairing_code TEXT UNIQUE,      -- Generated code for QR/manual
  pairing_metadata JSONB,         -- Extra data (WiFi SSID, Bluetooth MAC, etc.)

  -- Session status
  status TEXT DEFAULT 'pending',  -- 'pending', 'completed', 'expired', 'cancelled'

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_pairing_sessions_user ON device_pairing_sessions(user_id);
CREATE INDEX idx_pairing_sessions_code ON device_pairing_sessions(pairing_code) WHERE pairing_code IS NOT NULL;
CREATE INDEX idx_pairing_sessions_status ON device_pairing_sessions(status);
CREATE INDEX idx_pairing_sessions_expires ON device_pairing_sessions(expires_at) WHERE status = 'pending';

-- Device pairing events (audit log)
CREATE TABLE IF NOT EXISTS device_pairing_events (
  id SERIAL PRIMARY KEY,

  -- What happened
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  device_id INTEGER REFERENCES user_devices(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,        -- 'paired', 'auto_paired', 'revoked', 'trust_elevated'
  pairing_method TEXT,              -- Method used for pairing

  -- Context
  event_metadata JSONB,             -- Extra data about the event
  ip_address INET,
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pairing_events_user ON device_pairing_events(user_id);
CREATE INDEX idx_pairing_events_device ON device_pairing_events(device_id);
CREATE INDEX idx_pairing_events_type ON device_pairing_events(event_type);
CREATE INDEX idx_pairing_events_time ON device_pairing_events(created_at DESC);

-- Function to clean up expired pairing sessions
CREATE OR REPLACE FUNCTION cleanup_expired_pairing_sessions()
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE device_pairing_sessions
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-elevate device trust based on usage
CREATE OR REPLACE FUNCTION auto_elevate_device_trust(p_user_id INTEGER, p_device_id INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_current_trust TEXT;
  v_new_trust TEXT;
  v_sessions INTEGER;
  v_actions INTEGER;
  v_days_active INTEGER;
  v_reputation REAL;
BEGIN
  -- Get current trust level
  SELECT trust_level INTO v_current_trust
  FROM user_devices
  WHERE id = p_device_id AND user_id = p_user_id;

  IF v_current_trust IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate usage metrics
  SELECT
    COUNT(DISTINCT us.id) as sessions,
    COUNT(DISTINCT al.id) as actions,
    EXTRACT(DAYS FROM NOW() - ud.first_seen_at) as days_active,
    COALESCE(ud.reputation_score, 0.0) as reputation
  INTO v_sessions, v_actions, v_days_active, v_reputation
  FROM user_devices ud
  LEFT JOIN user_sessions us ON us.user_id = ud.user_id AND us.device_id = ud.id
  LEFT JOIN actions_log al ON al.user_id = ud.user_id AND al.device_id = ud.id
  WHERE ud.id = p_device_id
  GROUP BY ud.id, ud.first_seen_at, ud.reputation_score;

  -- Determine new trust level
  v_new_trust := v_current_trust;

  IF v_current_trust = 'unverified' THEN
    -- Elevate to verified: 1+ sessions, 5+ actions
    IF v_sessions >= 1 AND v_actions >= 5 THEN
      v_new_trust := 'verified';
    END IF;
  ELSIF v_current_trust = 'verified' THEN
    -- Elevate to trusted: 10+ sessions, 50+ actions, 7+ days, 0.8+ reputation
    IF v_sessions >= 10 AND v_actions >= 50 AND v_days_active >= 7 AND v_reputation >= 0.8 THEN
      v_new_trust := 'trusted';
    END IF;
  END IF;

  -- Update if changed
  IF v_new_trust != v_current_trust THEN
    UPDATE user_devices
    SET trust_level = v_new_trust,
        updated_at = NOW()
    WHERE id = p_device_id;

    -- Log elevation event
    INSERT INTO device_pairing_events (
      user_id, device_id, event_type, event_metadata
    )
    VALUES (
      p_user_id, p_device_id, 'trust_elevated',
      jsonb_build_object(
        'from', v_current_trust,
        'to', v_new_trust,
        'sessions', v_sessions,
        'actions', v_actions,
        'days_active', v_days_active,
        'reputation', v_reputation
      )
    );
  END IF;

  RETURN v_new_trust;
END;
$$ LANGUAGE plpgsql;

-- View: Active pairing sessions
CREATE OR REPLACE VIEW active_pairing_sessions AS
SELECT
  dps.id,
  dps.user_id,
  u.email as user_email,
  dps.source_device_id,
  sd.nickname as source_device_nickname,
  dps.pairing_method,
  dps.pairing_code,
  dps.status,
  dps.created_at,
  dps.expires_at,
  EXTRACT(EPOCH FROM (dps.expires_at - NOW())) as seconds_until_expiry
FROM device_pairing_sessions dps
LEFT JOIN users u ON u.id = dps.user_id
LEFT JOIN user_devices sd ON sd.id = dps.source_device_id
WHERE dps.status = 'pending'
  AND dps.expires_at > NOW()
ORDER BY dps.created_at DESC;

-- View: Device trust summary
CREATE OR REPLACE VIEW device_trust_summary AS
SELECT
  ud.user_id,
  ud.trust_level,
  COUNT(*) as device_count,
  AVG(ud.reputation_score) as avg_reputation,
  MAX(ud.last_seen_at) as most_recent_activity
FROM user_devices ud
WHERE ud.user_id IS NOT NULL
GROUP BY ud.user_id, ud.trust_level;

-- Comments for documentation
COMMENT ON TABLE device_pairing_sessions IS 'QR code and proximity-based device pairing sessions';
COMMENT ON TABLE device_pairing_events IS 'Audit log of device pairing actions (paired, revoked, trust changes)';
COMMENT ON FUNCTION cleanup_expired_pairing_sessions IS 'Mark expired pairing sessions (run via cron every 5 minutes)';
COMMENT ON FUNCTION auto_elevate_device_trust IS 'Automatically elevate device trust level based on usage metrics';
COMMENT ON VIEW active_pairing_sessions IS 'Currently active (unexpired) pairing sessions';
COMMENT ON VIEW device_trust_summary IS 'Summary of device trust levels per user';

-- Seed data: Trust level descriptions (for UI)
CREATE TABLE IF NOT EXISTS trust_level_definitions (
  trust_level TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  permissions JSONB,
  icon TEXT,
  color TEXT
);

INSERT INTO trust_level_definitions (trust_level, display_name, description, permissions, icon, color)
VALUES
  ('unverified', 'Unverified', 'New device, limited access',
   '{"can_view": true, "can_edit": false, "can_admin": false}'::jsonb,
   '❓', '#95a5a6'),

  ('verified', 'Verified', 'QR paired or WiFi paired, standard access',
   '{"can_view": true, "can_edit": true, "can_admin": false}'::jsonb,
   '✓', '#3498db'),

  ('trusted', 'Trusted', 'Multiple sessions, high reputation, full access',
   '{"can_view": true, "can_edit": true, "can_admin": true}'::jsonb,
   '⭐', '#2ecc71')
ON CONFLICT (trust_level) DO NOTHING;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON device_pairing_sessions TO agent_router_app;
-- GRANT SELECT, INSERT ON device_pairing_events TO agent_router_app;
-- GRANT SELECT ON active_pairing_sessions TO agent_router_app;
-- GRANT SELECT ON device_trust_summary TO agent_router_app;

-- Initial completion message
DO $$
BEGIN
  RAISE NOTICE 'Device Pairing System installed successfully!';
  RAISE NOTICE '- QR code pairing enabled';
  RAISE NOTICE '- WiFi proximity detection enabled';
  RAISE NOTICE '- 3 trust levels defined (unverified, verified, trusted)';
  RAISE NOTICE '- Auto trust elevation function available';
  RAISE NOTICE 'Next: Run cleanup_expired_pairing_sessions() every 5 minutes via cron';
END $$;

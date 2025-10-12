-- Migration: User Authentication & SSO System
--
-- Purpose: Cross-domain single sign-on for CalOS network
-- Users log in once and access all 12 domains without captchas
-- "Warm-up" system inspired by RuneScape authentication

-- ============================================================
-- Users Table
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(42), -- Ethereum wallet for USDC rewards
  username VARCHAR(50) UNIQUE,
  display_name VARCHAR(100),
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(255),
  verification_expires_at TIMESTAMP,
  password_reset_token VARCHAR(255),
  password_reset_expires_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active', -- active, suspended, banned
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,
  login_count INT DEFAULT 0
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_status ON users(status);

-- ============================================================
-- User Sessions Table (Cross-Domain SSO)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  session_token VARCHAR(512) UNIQUE NOT NULL, -- JWT token
  refresh_token VARCHAR(512) UNIQUE,
  domain_id UUID REFERENCES domain_portfolio(domain_id), -- Which domain initiated session
  ip_address INET,
  user_agent TEXT,
  device_fingerprint VARCHAR(255), -- Browser fingerprint
  is_trusted BOOLEAN DEFAULT FALSE, -- Trusted = skip captchas
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days',
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP,
  revoke_reason TEXT
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_sessions_device ON user_sessions(device_fingerprint);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_sessions_active ON user_sessions(user_id, revoked, expires_at);

-- ============================================================
-- Trusted Devices Table (Skip Captchas)
-- ============================================================
CREATE TABLE IF NOT EXISTS trusted_devices (
  device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  device_fingerprint VARCHAR(255) NOT NULL,
  device_name VARCHAR(100), -- User-assigned name like "My iPhone"
  browser VARCHAR(100),
  os VARCHAR(100),
  first_seen_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP DEFAULT NOW(),
  last_ip INET,
  trusted_until TIMESTAMP DEFAULT NOW() + INTERVAL '90 days',
  active BOOLEAN DEFAULT TRUE,

  UNIQUE(user_id, device_fingerprint)
);

CREATE INDEX idx_trusted_devices_user ON trusted_devices(user_id);
CREATE INDEX idx_trusted_devices_fingerprint ON trusted_devices(device_fingerprint);
CREATE INDEX idx_trusted_devices_expires ON trusted_devices(trusted_until);

-- ============================================================
-- Session Activity Log (Security Audit)
-- ============================================================
CREATE TABLE IF NOT EXISTS session_activity (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES user_sessions(session_id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  domain_id UUID REFERENCES domain_portfolio(domain_id),
  activity_type VARCHAR(50) NOT NULL, -- login, logout, access_domain, refresh_token
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE,
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_user ON session_activity(user_id, created_at DESC);
CREATE INDEX idx_activity_session ON session_activity(session_id);
CREATE INDEX idx_activity_type ON session_activity(activity_type);

-- ============================================================
-- Cross-Domain Access Tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS domain_access_log (
  access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES domain_portfolio(domain_id) ON DELETE CASCADE,
  session_id UUID REFERENCES user_sessions(session_id) ON DELETE SET NULL,
  accessed_at TIMESTAMP DEFAULT NOW(),
  referrer_domain_id UUID REFERENCES domain_portfolio(domain_id), -- Which domain sent them
  captcha_shown BOOLEAN DEFAULT FALSE,
  captcha_passed BOOLEAN,
  time_on_domain_seconds INT
);

CREATE INDEX idx_domain_access_user ON domain_access_log(user_id, accessed_at DESC);
CREATE INDEX idx_domain_access_domain ON domain_access_log(domain_id, accessed_at DESC);
CREATE INDEX idx_domain_access_session ON domain_access_log(session_id);

-- ============================================================
-- User Preferences (Cross-Domain Settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  theme VARCHAR(20) DEFAULT 'dark', -- dark, light, auto
  language VARCHAR(10) DEFAULT 'en',
  timezone VARCHAR(50) DEFAULT 'UTC',
  email_notifications BOOLEAN DEFAULT TRUE,
  marketing_emails BOOLEAN DEFAULT FALSE,
  show_skill_notifications BOOLEAN DEFAULT TRUE,
  show_xp_gains BOOLEAN DEFAULT TRUE,
  auto_claim_rewards BOOLEAN DEFAULT FALSE,
  preferences JSONB DEFAULT '{}', -- Additional custom preferences
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Views
-- ============================================================

-- Active Sessions View
CREATE OR REPLACE VIEW active_sessions AS
SELECT
  us.session_id,
  us.user_id,
  u.email,
  u.username,
  u.wallet_address,
  us.domain_id,
  dp.domain_name,
  dp.brand_name,
  us.ip_address,
  us.device_fingerprint,
  us.is_trusted,
  us.created_at,
  us.last_active_at,
  us.expires_at,
  td.device_name as trusted_device_name
FROM user_sessions us
JOIN users u ON us.user_id = u.user_id
LEFT JOIN domain_portfolio dp ON us.domain_id = dp.domain_id
LEFT JOIN trusted_devices td ON us.user_id = td.user_id AND us.device_fingerprint = td.device_fingerprint
WHERE us.revoked = FALSE
  AND us.expires_at > NOW()
  AND u.status = 'active'
ORDER BY us.last_active_at DESC;

-- User Activity Summary
CREATE OR REPLACE VIEW user_activity_summary AS
SELECT
  u.user_id,
  u.email,
  u.username,
  u.wallet_address,
  u.created_at as joined_at,
  u.last_login_at,
  u.login_count,
  COUNT(DISTINCT us.session_id) as total_sessions,
  COUNT(DISTINCT CASE WHEN us.expires_at > NOW() AND us.revoked = FALSE THEN us.session_id END) as active_sessions,
  COUNT(DISTINCT td.device_id) as trusted_devices,
  COUNT(DISTINCT dal.domain_id) as domains_accessed,
  COUNT(DISTINCT dv.vote_id) as total_votes,
  COALESCE(SUM(dv.reward_amount), 0) + COALESCE(SUM(df.reward_amount), 0) as total_earned
FROM users u
LEFT JOIN user_sessions us ON u.user_id = us.user_id
LEFT JOIN trusted_devices td ON u.user_id = td.user_id AND td.active = TRUE
LEFT JOIN domain_access_log dal ON u.user_id = dal.user_id
LEFT JOIN domain_votes dv ON u.wallet_address = dv.wallet_address
LEFT JOIN domain_feedback df ON u.wallet_address = df.wallet_address
WHERE u.status = 'active'
GROUP BY u.user_id
ORDER BY u.created_at DESC;

-- Domain Access Leaderboard
CREATE OR REPLACE VIEW domain_access_leaderboard AS
SELECT
  dp.domain_id,
  dp.domain_name,
  dp.brand_name,
  dp.primary_color,
  COUNT(DISTINCT dal.user_id) as unique_visitors,
  COUNT(dal.access_id) as total_visits,
  ROUND(AVG(dal.time_on_domain_seconds), 2) as avg_time_seconds,
  COUNT(DISTINCT dal.user_id) FILTER (WHERE dal.captcha_shown = FALSE) as trusted_visits,
  COUNT(DISTINCT dal.user_id) FILTER (WHERE dal.captcha_shown = TRUE) as captcha_visits
FROM domain_portfolio dp
LEFT JOIN domain_access_log dal ON dp.domain_id = dal.domain_id
WHERE dp.status = 'active'
GROUP BY dp.domain_id
ORDER BY unique_visitors DESC;

-- ============================================================
-- Functions
-- ============================================================

-- Function: Create User Session
CREATE OR REPLACE FUNCTION create_user_session(
  p_user_id UUID,
  p_session_token VARCHAR(512),
  p_refresh_token VARCHAR(512),
  p_domain_id UUID,
  p_ip_address INET,
  p_user_agent TEXT,
  p_device_fingerprint VARCHAR(255)
)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
  v_is_trusted BOOLEAN := FALSE;
BEGIN
  -- Check if device is trusted
  SELECT EXISTS(
    SELECT 1 FROM trusted_devices
    WHERE user_id = p_user_id
      AND device_fingerprint = p_device_fingerprint
      AND active = TRUE
      AND trusted_until > NOW()
  ) INTO v_is_trusted;

  -- Create session
  INSERT INTO user_sessions (
    user_id,
    session_token,
    refresh_token,
    domain_id,
    ip_address,
    user_agent,
    device_fingerprint,
    is_trusted
  ) VALUES (
    p_user_id,
    p_session_token,
    p_refresh_token,
    p_domain_id,
    p_ip_address,
    p_user_agent,
    p_device_fingerprint,
    v_is_trusted
  ) RETURNING session_id INTO v_session_id;

  -- Update user last login
  UPDATE users
  SET
    last_login_at = NOW(),
    login_count = login_count + 1
  WHERE user_id = p_user_id;

  -- Update trusted device last seen
  IF v_is_trusted THEN
    UPDATE trusted_devices
    SET
      last_seen_at = NOW(),
      last_ip = p_ip_address
    WHERE user_id = p_user_id
      AND device_fingerprint = p_device_fingerprint;
  END IF;

  -- Log activity
  INSERT INTO session_activity (
    session_id,
    user_id,
    domain_id,
    activity_type,
    ip_address,
    user_agent,
    success
  ) VALUES (
    v_session_id,
    p_user_id,
    p_domain_id,
    'login',
    p_ip_address,
    p_user_agent,
    TRUE
  );

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Validate Session Token
CREATE OR REPLACE FUNCTION validate_session(p_session_token VARCHAR(512))
RETURNS TABLE (
  valid BOOLEAN,
  session_id UUID,
  user_id UUID,
  email VARCHAR(255),
  is_trusted BOOLEAN,
  expires_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TRUE as valid,
    us.session_id,
    us.user_id,
    u.email,
    us.is_trusted,
    us.expires_at
  FROM user_sessions us
  JOIN users u ON us.user_id = u.user_id
  WHERE us.session_token = p_session_token
    AND us.revoked = FALSE
    AND us.expires_at > NOW()
    AND u.status = 'active';

  -- If no valid session found, return invalid result
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::VARCHAR, FALSE, NULL::TIMESTAMP;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function: Revoke Session
CREATE OR REPLACE FUNCTION revoke_session(
  p_session_id UUID,
  p_reason TEXT DEFAULT 'user_logout'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user_id before revoking
  SELECT user_id INTO v_user_id
  FROM user_sessions
  WHERE session_id = p_session_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Revoke session
  UPDATE user_sessions
  SET
    revoked = TRUE,
    revoked_at = NOW(),
    revoke_reason = p_reason
  WHERE session_id = p_session_id;

  -- Log activity
  INSERT INTO session_activity (
    session_id,
    user_id,
    activity_type,
    success,
    metadata
  ) VALUES (
    p_session_id,
    v_user_id,
    'logout',
    TRUE,
    jsonb_build_object('reason', p_reason)
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: Add Trusted Device
CREATE OR REPLACE FUNCTION add_trusted_device(
  p_user_id UUID,
  p_device_fingerprint VARCHAR(255),
  p_device_name VARCHAR(100),
  p_browser VARCHAR(100),
  p_os VARCHAR(100),
  p_ip INET
)
RETURNS UUID AS $$
DECLARE
  v_device_id UUID;
BEGIN
  -- Insert or update trusted device
  INSERT INTO trusted_devices (
    user_id,
    device_fingerprint,
    device_name,
    browser,
    os,
    last_ip,
    last_seen_at
  ) VALUES (
    p_user_id,
    p_device_fingerprint,
    p_device_name,
    p_browser,
    p_os,
    p_ip,
    NOW()
  )
  ON CONFLICT (user_id, device_fingerprint)
  DO UPDATE SET
    last_seen_at = NOW(),
    last_ip = p_ip,
    active = TRUE,
    trusted_until = NOW() + INTERVAL '90 days'
  RETURNING device_id INTO v_device_id;

  -- Mark all sessions from this device as trusted
  UPDATE user_sessions
  SET is_trusted = TRUE
  WHERE user_id = p_user_id
    AND device_fingerprint = p_device_fingerprint
    AND revoked = FALSE;

  RETURN v_device_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Log Domain Access
CREATE OR REPLACE FUNCTION log_domain_access(
  p_user_id UUID,
  p_domain_id UUID,
  p_session_id UUID,
  p_referrer_domain_id UUID DEFAULT NULL,
  p_captcha_shown BOOLEAN DEFAULT FALSE,
  p_captcha_passed BOOLEAN DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_access_id UUID;
BEGIN
  INSERT INTO domain_access_log (
    user_id,
    domain_id,
    session_id,
    referrer_domain_id,
    captcha_shown,
    captcha_passed
  ) VALUES (
    p_user_id,
    p_domain_id,
    p_session_id,
    p_referrer_domain_id,
    p_captcha_shown,
    p_captcha_passed
  ) RETURNING access_id INTO v_access_id;

  -- Update session last active
  UPDATE user_sessions
  SET last_active_at = NOW()
  WHERE session_id = p_session_id;

  RETURN v_access_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Triggers
-- ============================================================

-- Auto-cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS TRIGGER AS $$
BEGIN
  -- Revoke expired sessions
  UPDATE user_sessions
  SET
    revoked = TRUE,
    revoked_at = NOW(),
    revoke_reason = 'expired'
  WHERE expires_at <= NOW()
    AND revoked = FALSE;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Run cleanup daily
CREATE OR REPLACE FUNCTION schedule_session_cleanup()
RETURNS void AS $$
BEGIN
  -- This would typically be called by a cron job or scheduler
  PERFORM cleanup_expired_sessions();
END;
$$ LANGUAGE plpgsql;

-- Update last_active_at on session access
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE user_sessions
  SET last_active_at = NOW()
  WHERE session_id = NEW.session_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_session_activity
  AFTER INSERT ON session_activity
  FOR EACH ROW
  EXECUTE FUNCTION update_session_activity();

-- ============================================================
-- Grant Permissions
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON users TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_sessions TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON trusted_devices TO postgres;
GRANT SELECT, INSERT ON session_activity TO postgres;
GRANT SELECT, INSERT, UPDATE ON domain_access_log TO postgres;
GRANT SELECT, INSERT, UPDATE ON user_preferences TO postgres;

GRANT SELECT ON active_sessions TO postgres;
GRANT SELECT ON user_activity_summary TO postgres;
GRANT SELECT ON domain_access_leaderboard TO postgres;

-- ============================================================
-- Test Data (for development)
-- ============================================================

-- Create a test user
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Check if test user already exists
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'test@calos.ai') THEN
    INSERT INTO users (
      email,
      password_hash,
      wallet_address,
      username,
      display_name,
      email_verified,
      status
    ) VALUES (
      'test@calos.ai',
      '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFG', -- Placeholder hash
      '0x1234567890123456789012345678901234567890',
      'testuser',
      'Test User',
      TRUE,
      'active'
    ) RETURNING user_id INTO v_user_id;

    -- Create default preferences
    INSERT INTO user_preferences (user_id)
    VALUES (v_user_id);

    RAISE NOTICE '✅ Test user created: test@calos.ai';
  END IF;
END $$;

-- ============================================================
-- Success Message
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ User Authentication & SSO System installed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - users (user accounts)';
  RAISE NOTICE '  - user_sessions (cross-domain SSO tokens)';
  RAISE NOTICE '  - trusted_devices (skip captchas for known devices)';
  RAISE NOTICE '  - session_activity (security audit log)';
  RAISE NOTICE '  - domain_access_log (track cross-domain navigation)';
  RAISE NOTICE '  - user_preferences (settings sync across domains)';
  RAISE NOTICE '';
  RAISE NOTICE 'Views created:';
  RAISE NOTICE '  - active_sessions (currently logged in users)';
  RAISE NOTICE '  - user_activity_summary (user engagement metrics)';
  RAISE NOTICE '  - domain_access_leaderboard (most visited domains)';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - create_user_session() (handle login)';
  RAISE NOTICE '  - validate_session() (verify JWT tokens)';
  RAISE NOTICE '  - revoke_session() (handle logout)';
  RAISE NOTICE '  - add_trusted_device() (mark device as trusted)';
  RAISE NOTICE '  - log_domain_access() (track domain visits)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Apply migration: psql -U postgres -d calos -f database/migrations/010_add_user_auth.sql';
  RAISE NOTICE '  2. Build SSO middleware (middleware/sso-auth.js)';
  RAISE NOTICE '  3. Create auth routes (routes/auth-routes.js)';
  RAISE NOTICE '  4. Implement JWT token generation/validation';
  RAISE NOTICE '  5. Add cookie-based session management';
END $$;

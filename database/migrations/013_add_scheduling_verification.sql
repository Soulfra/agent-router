/**
 * Migration 013: Scheduling & Verification Systems
 *
 * Features:
 * - Timezone-based action scheduling (NYSE/NASDAQ hours)
 * - Enhanced device fingerprinting (bare metal IDs)
 * - Privacy-preserving age verification
 * - Scheduled rate limiting
 */

-- ============================================================================
-- 1. AGE VERIFICATION
-- ============================================================================

-- Add age bracket to users (privacy-preserving, no exact DOB stored)
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_bracket VARCHAR(20) DEFAULT 'adult';
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verification_method VARCHAR(50);

-- Age brackets: child (0-12), teen (13-17), adult (18-64), senior (65+)
CREATE TYPE age_bracket_enum AS ENUM ('child', 'teen', 'adult', 'senior');

-- Age verification log (track verification attempts, not actual DOB)
CREATE TABLE IF NOT EXISTS age_verifications (
  verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  age_bracket age_bracket_enum NOT NULL,
  verification_method VARCHAR(50) NOT NULL, -- 'document', 'credit_card', 'third_party', 'self_attested'
  document_hash TEXT, -- Hash of verification document (never store actual document)
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- Some verifications expire
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, verification_method)
);

CREATE INDEX idx_age_verifications_user ON age_verifications(user_id);
CREATE INDEX idx_age_verifications_expires ON age_verifications(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- 2. ENHANCED DEVICE FINGERPRINTING (BARE METAL IDs)
-- ============================================================================

-- Extend trusted_devices with hardware fingerprints
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS hardware_fingerprint JSONB DEFAULT '{}';
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS cpu_hash TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS gpu_hash TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS mac_address_hash TEXT;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS timezone VARCHAR(50);
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS timezone_offset INTEGER; -- Minutes from UTC
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS detected_location JSONB; -- {country, region, city} from IP/hardware
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS spoofing_flags JSONB DEFAULT '{}'; -- Track suspicious patterns

-- Spoofing detection log
CREATE TABLE IF NOT EXISTS device_spoofing_alerts (
  alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES trusted_devices(device_id),
  user_id UUID NOT NULL REFERENCES users(user_id),
  alert_type VARCHAR(50) NOT NULL, -- 'timezone_mismatch', 'hardware_changed', 'location_impossible', 'vpn_detected'
  severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  details JSONB NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT
);

CREATE INDEX idx_spoofing_alerts_device ON device_spoofing_alerts(device_id);
CREATE INDEX idx_spoofing_alerts_user ON device_spoofing_alerts(user_id);
CREATE INDEX idx_spoofing_alerts_unresolved ON device_spoofing_alerts(resolved) WHERE resolved = FALSE;
CREATE INDEX idx_spoofing_alerts_severity ON device_spoofing_alerts(severity);

-- ============================================================================
-- 3. TIMEZONE-BASED ACTION SCHEDULING
-- ============================================================================

-- Action schedules: Define when actions are available (NYSE hours, etc.)
CREATE TABLE IF NOT EXISTS action_schedules (
  schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',

  -- Weekly schedule (JSON array of time windows)
  -- Example: [{"day": "monday", "open": "09:30", "close": "16:00"}, ...]
  weekly_windows JSONB NOT NULL DEFAULT '[]',

  -- Special dates (holidays, etc.)
  -- Example: [{"date": "2025-12-25", "closed": true, "reason": "Christmas"}, ...]
  special_dates JSONB DEFAULT '[]',

  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link actions to schedules
CREATE TABLE IF NOT EXISTS action_schedule_links (
  link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_code VARCHAR(50) NOT NULL,
  schedule_id UUID NOT NULL REFERENCES action_schedules(schedule_id),
  required BOOLEAN DEFAULT TRUE, -- If TRUE, action fails outside schedule. If FALSE, just warning.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(action_code, schedule_id)
);

CREATE INDEX idx_action_schedule_links_action ON action_schedule_links(action_code);
CREATE INDEX idx_action_schedule_links_schedule ON action_schedule_links(schedule_id);

-- Schedule exceptions (override for specific users/roles)
CREATE TABLE IF NOT EXISTS schedule_exceptions (
  exception_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES action_schedules(schedule_id),
  user_id UUID REFERENCES users(user_id), -- NULL = applies to everyone
  exception_type VARCHAR(50) NOT NULL, -- 'always_allow', 'always_deny', 'custom_window'
  custom_windows JSONB, -- For 'custom_window' type
  reason TEXT,
  granted_by UUID REFERENCES users(user_id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_schedule_exceptions_schedule ON schedule_exceptions(schedule_id);
CREATE INDEX idx_schedule_exceptions_user ON schedule_exceptions(user_id);
CREATE INDEX idx_schedule_exceptions_expires ON schedule_exceptions(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- 4. SCHEDULED RATE LIMITING
-- ============================================================================

-- Extend user_action_log to track scheduled attempts
ALTER TABLE user_action_log ADD COLUMN IF NOT EXISTS outside_schedule BOOLEAN DEFAULT FALSE;
ALTER TABLE user_action_log ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES action_schedules(schedule_id);
ALTER TABLE user_action_log ADD COLUMN IF NOT EXISTS user_timezone VARCHAR(50);

-- Rate limit violations (track abuse patterns)
CREATE TABLE IF NOT EXISTS rate_limit_violations (
  violation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  action_code VARCHAR(50) NOT NULL,
  violation_type VARCHAR(50) NOT NULL, -- 'cooldown', 'outside_schedule', 'daily_limit', 'burst'
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  details JSONB DEFAULT '{}'
);

CREATE INDEX idx_rate_violations_user ON rate_limit_violations(user_id);
CREATE INDEX idx_rate_violations_action ON rate_limit_violations(action_code);
CREATE INDEX idx_rate_violations_time ON rate_limit_violations(attempted_at);

-- ============================================================================
-- 5. SEED DATA: Common Schedules
-- ============================================================================

-- NYSE Trading Hours (Mon-Fri 9:30-16:00 ET)
INSERT INTO action_schedules (schedule_name, description, timezone, weekly_windows, special_dates)
VALUES (
  'nyse_trading_hours',
  'New York Stock Exchange trading hours',
  'America/New_York',
  '[
    {"day": "monday", "open": "09:30", "close": "16:00"},
    {"day": "tuesday", "open": "09:30", "close": "16:00"},
    {"day": "wednesday", "open": "09:30", "close": "16:00"},
    {"day": "thursday", "open": "09:30", "close": "16:00"},
    {"day": "friday", "open": "09:30", "close": "16:00"}
  ]'::jsonb,
  '[
    {"date": "2025-01-01", "closed": true, "reason": "New Year''s Day"},
    {"date": "2025-07-04", "closed": true, "reason": "Independence Day"},
    {"date": "2025-12-25", "closed": true, "reason": "Christmas"}
  ]'::jsonb
) ON CONFLICT (schedule_name) DO NOTHING;

-- Business Hours (Mon-Fri 9:00-17:00 local)
INSERT INTO action_schedules (schedule_name, description, timezone, weekly_windows)
VALUES (
  'business_hours',
  'Standard business hours',
  'America/New_York',
  '[
    {"day": "monday", "open": "09:00", "close": "17:00"},
    {"day": "tuesday", "open": "09:00", "close": "17:00"},
    {"day": "wednesday", "open": "09:00", "close": "17:00"},
    {"day": "thursday", "open": "09:00", "close": "17:00"},
    {"day": "friday", "open": "09:00", "close": "17:00"}
  ]'::jsonb
) ON CONFLICT (schedule_name) DO NOTHING;

-- 24/7 (No restrictions)
INSERT INTO action_schedules (schedule_name, description, timezone, weekly_windows)
VALUES (
  'always_available',
  'Available 24/7',
  'UTC',
  '[
    {"day": "monday", "open": "00:00", "close": "23:59"},
    {"day": "tuesday", "open": "00:00", "close": "23:59"},
    {"day": "wednesday", "open": "00:00", "close": "23:59"},
    {"day": "thursday", "open": "00:00", "close": "23:59"},
    {"day": "friday", "open": "00:00", "close": "23:59"},
    {"day": "saturday", "open": "00:00", "close": "23:59"},
    {"day": "sunday", "open": "00:00", "close": "23:59"}
  ]'::jsonb
) ON CONFLICT (schedule_name) DO NOTHING;

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

/**
 * Check if current time falls within a schedule
 */
CREATE OR REPLACE FUNCTION is_schedule_open(
  p_schedule_id UUID,
  p_check_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN AS $$
DECLARE
  v_schedule RECORD;
  v_day_of_week TEXT;
  v_window JSONB;
  v_time_only TIME;
  v_date_only DATE;
  v_special_date JSONB;
BEGIN
  -- Get schedule
  SELECT * INTO v_schedule
  FROM action_schedules
  WHERE schedule_id = p_schedule_id AND enabled = TRUE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Convert to schedule timezone
  p_check_time := p_check_time AT TIME ZONE v_schedule.timezone;

  -- Check special dates first
  v_date_only := p_check_time::DATE;
  FOR v_special_date IN SELECT * FROM jsonb_array_elements(v_schedule.special_dates)
  LOOP
    IF (v_special_date->>'date')::DATE = v_date_only THEN
      -- If closed on this date, return FALSE
      IF (v_special_date->>'closed')::BOOLEAN THEN
        RETURN FALSE;
      END IF;
      -- Could have custom hours on special dates (future enhancement)
    END IF;
  END LOOP;

  -- Get day of week (lowercase)
  v_day_of_week := LOWER(TO_CHAR(p_check_time, 'Day'));
  v_day_of_week := TRIM(v_day_of_week);
  v_time_only := p_check_time::TIME;

  -- Check weekly windows
  FOR v_window IN SELECT * FROM jsonb_array_elements(v_schedule.weekly_windows)
  LOOP
    IF v_window->>'day' = v_day_of_week THEN
      -- Check if time is within window
      IF v_time_only >= (v_window->>'open')::TIME
         AND v_time_only <= (v_window->>'close')::TIME
      THEN
        RETURN TRUE;
      END IF;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

/**
 * Check if action is available now (considering schedules)
 */
CREATE OR REPLACE FUNCTION check_action_schedule(
  p_action_code VARCHAR(50),
  p_user_id UUID DEFAULT NULL,
  p_check_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  available BOOLEAN,
  reason TEXT,
  schedule_id UUID,
  next_open TIMESTAMPTZ
) AS $$
DECLARE
  v_link RECORD;
  v_exception RECORD;
  v_is_open BOOLEAN;
BEGIN
  -- Check for schedule links
  FOR v_link IN
    SELECT asl.*, s.schedule_name, s.timezone
    FROM action_schedule_links asl
    JOIN action_schedules s ON s.schedule_id = asl.schedule_id
    WHERE asl.action_code = p_action_code AND s.enabled = TRUE
  LOOP
    -- Check for user exceptions first
    IF p_user_id IS NOT NULL THEN
      SELECT * INTO v_exception
      FROM schedule_exceptions
      WHERE schedule_id = v_link.schedule_id
        AND (user_id = p_user_id OR user_id IS NULL)
        AND (expires_at IS NULL OR expires_at > p_check_time)
      ORDER BY user_id DESC NULLS LAST -- User-specific first
      LIMIT 1;

      IF FOUND THEN
        IF v_exception.exception_type = 'always_allow' THEN
          RETURN QUERY SELECT TRUE, 'Schedule exception: always allowed'::TEXT, v_link.schedule_id, NULL::TIMESTAMPTZ;
          RETURN;
        ELSIF v_exception.exception_type = 'always_deny' THEN
          RETURN QUERY SELECT FALSE, 'Schedule exception: denied'::TEXT, v_link.schedule_id, NULL::TIMESTAMPTZ;
          RETURN;
        END IF;
      END IF;
    END IF;

    -- Check if schedule is open
    v_is_open := is_schedule_open(v_link.schedule_id, p_check_time);

    IF v_link.required THEN
      IF NOT v_is_open THEN
        RETURN QUERY SELECT
          FALSE,
          format('Action unavailable - %s is closed', v_link.schedule_name)::TEXT,
          v_link.schedule_id,
          NULL::TIMESTAMPTZ; -- TODO: Calculate next open time
        RETURN;
      END IF;
    END IF;
  END LOOP;

  -- No schedule restrictions or all passed
  RETURN QUERY SELECT TRUE, 'Available'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql;

/**
 * Log rate limit violation
 */
CREATE OR REPLACE FUNCTION log_rate_violation(
  p_user_id UUID,
  p_action_code VARCHAR(50),
  p_violation_type VARCHAR(50),
  p_details JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_violation_id UUID;
BEGIN
  INSERT INTO rate_limit_violations (user_id, action_code, violation_type, details)
  VALUES (p_user_id, p_action_code, p_violation_type, p_details)
  RETURNING violation_id INTO v_violation_id;

  RETURN v_violation_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. VIEWS
-- ============================================================================

-- User age verification status
CREATE OR REPLACE VIEW user_age_verification_status AS
SELECT
  u.user_id,
  u.username,
  u.email,
  u.age_bracket,
  u.age_verified,
  u.age_verified_at,
  u.age_verification_method,
  av.verification_method AS latest_verification_method,
  av.verified_at AS latest_verified_at,
  av.expires_at AS verification_expires_at,
  CASE
    WHEN av.expires_at IS NOT NULL AND av.expires_at < NOW() THEN TRUE
    ELSE FALSE
  END AS verification_expired
FROM users u
LEFT JOIN LATERAL (
  SELECT *
  FROM age_verifications
  WHERE user_id = u.user_id
  ORDER BY verified_at DESC
  LIMIT 1
) av ON TRUE;

-- Device spoofing risk scores
CREATE OR REPLACE VIEW device_risk_scores AS
SELECT
  td.device_id,
  td.user_id,
  td.device_name,
  td.timezone,
  td.detected_location,
  COUNT(dsa.alert_id) AS total_alerts,
  COUNT(dsa.alert_id) FILTER (WHERE dsa.severity = 'critical') AS critical_alerts,
  COUNT(dsa.alert_id) FILTER (WHERE dsa.severity = 'high') AS high_alerts,
  COUNT(dsa.alert_id) FILTER (WHERE NOT dsa.resolved) AS unresolved_alerts,
  CASE
    WHEN COUNT(dsa.alert_id) FILTER (WHERE dsa.severity = 'critical') > 0 THEN 'critical'
    WHEN COUNT(dsa.alert_id) FILTER (WHERE dsa.severity = 'high') > 2 THEN 'high'
    WHEN COUNT(dsa.alert_id) FILTER (WHERE NOT dsa.resolved) > 5 THEN 'medium'
    ELSE 'low'
  END AS overall_risk,
  MAX(dsa.detected_at) AS last_alert_at
FROM trusted_devices td
LEFT JOIN device_spoofing_alerts dsa ON dsa.device_id = td.device_id
GROUP BY td.device_id, td.user_id, td.device_name, td.timezone, td.detected_location;

-- Action schedule availability
CREATE OR REPLACE VIEW action_schedule_status AS
SELECT
  ad.action_code,
  ad.action_name,
  ad.action_category,
  s.schedule_id,
  s.schedule_name,
  s.timezone,
  s.weekly_windows,
  is_schedule_open(s.schedule_id, NOW()) AS currently_open,
  asl.required AS schedule_required
FROM action_definitions ad
JOIN action_schedule_links asl ON asl.action_code = ad.action_code
JOIN action_schedules s ON s.schedule_id = asl.schedule_id
WHERE ad.enabled = TRUE AND s.enabled = TRUE;

COMMENT ON TABLE action_schedules IS 'Define time windows when actions are available (NYSE hours, business hours, etc.)';
COMMENT ON TABLE action_schedule_links IS 'Link actions to schedules';
COMMENT ON TABLE schedule_exceptions IS 'Per-user schedule overrides';
COMMENT ON TABLE age_verifications IS 'Age verification history (privacy-preserving, no DOB stored)';
COMMENT ON TABLE device_spoofing_alerts IS 'Track suspicious device/timezone patterns';
COMMENT ON TABLE rate_limit_violations IS 'Track rate limit abuse attempts';

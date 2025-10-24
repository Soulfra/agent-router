-- Migration 072: Communication Preferences
-- User-controlled multi-channel communication settings
--
-- Purpose:
-- - Let users choose how they want to be contacted
-- - Email enabled by default (zero-cost via Gmail gateway)
-- - SMS is OPT-IN ONLY (privacy-first, GDPR/CCPA compliant)
-- - Push notifications opt-in
-- - Phone number verification for SMS
--
-- Privacy Design:
-- - Users control ALL communication channels
-- - Double opt-in for SMS (verify phone number)
-- - Easy unsubscribe (text STOP)
-- - No forced communication
--
-- Gamification:
-- - +100 credits for verifying phone number
-- - +50 credits for enabling push notifications

CREATE TABLE IF NOT EXISTS communication_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,

  -- Channel preferences (user-controlled)
  email_enabled BOOLEAN DEFAULT true,        -- Default: enabled (zero-cost)
  sms_enabled BOOLEAN DEFAULT false,         -- Default: disabled (OPT-IN ONLY)
  push_enabled BOOLEAN DEFAULT false,        -- Default: disabled (OPT-IN)

  -- SMS configuration
  phone_number VARCHAR(20),                  -- E.164 format: +15551234567
  phone_country_code VARCHAR(5),             -- Country code: +1, +44, etc.
  phone_verified BOOLEAN DEFAULT false,      -- Must verify before SMS enabled
  phone_verification_code VARCHAR(10),       -- Temporary verification code
  phone_verification_sent_at TIMESTAMP,      -- When verification SMS was sent
  phone_verified_at TIMESTAMP,               -- When phone was verified

  -- Push notification configuration
  push_tokens JSONB DEFAULT '[]',            -- Array of device push tokens
  push_verified BOOLEAN DEFAULT false,

  -- Notification preferences (what types of notifications to receive)
  notify_contract_signed BOOLEAN DEFAULT true,
  notify_contract_shared BOOLEAN DEFAULT true,
  notify_credits_earned BOOLEAN DEFAULT true,
  notify_forum_replies BOOLEAN DEFAULT true,
  notify_social_mentions BOOLEAN DEFAULT true,
  notify_campaign_updates BOOLEAN DEFAULT true,

  -- Quiet hours (don't send notifications during this time)
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,                    -- Example: '22:00:00'
  quiet_hours_end TIME,                      -- Example: '08:00:00'
  quiet_hours_timezone VARCHAR(50),          -- Example: 'America/New_York'

  -- Frequency limits (prevent spam)
  max_emails_per_day INTEGER DEFAULT 10,
  max_sms_per_day INTEGER DEFAULT 3,
  max_push_per_day INTEGER DEFAULT 20,

  -- Unsubscribe tracking
  unsubscribe_token VARCHAR(100) UNIQUE,     -- Token for unsubscribe links
  unsubscribed_at TIMESTAMP,                 -- When user unsubscribed from all
  unsubscribe_reason TEXT,                   -- Optional feedback

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Stats
  total_emails_sent INTEGER DEFAULT 0,
  total_sms_sent INTEGER DEFAULT 0,
  total_push_sent INTEGER DEFAULT 0,
  last_email_sent_at TIMESTAMP,
  last_sms_sent_at TIMESTAMP,
  last_push_sent_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_comm_prefs_email_enabled
  ON communication_preferences(email_enabled)
  WHERE email_enabled = true;

CREATE INDEX IF NOT EXISTS idx_comm_prefs_sms_enabled
  ON communication_preferences(sms_enabled)
  WHERE sms_enabled = true;

CREATE INDEX IF NOT EXISTS idx_comm_prefs_phone_number
  ON communication_preferences(phone_number)
  WHERE phone_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_prefs_unsubscribe_token
  ON communication_preferences(unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;

-- Comments
COMMENT ON TABLE communication_preferences IS 'User-controlled multi-channel communication settings (email, SMS, push)';
COMMENT ON COLUMN communication_preferences.email_enabled IS 'Email notifications enabled (default: true, zero-cost via Gmail gateway)';
COMMENT ON COLUMN communication_preferences.sms_enabled IS 'SMS notifications enabled (OPT-IN ONLY, requires phone verification)';
COMMENT ON COLUMN communication_preferences.push_enabled IS 'Push notifications enabled (OPT-IN, requires device registration)';
COMMENT ON COLUMN communication_preferences.phone_verified IS 'Phone number verified via SMS code (required for sms_enabled)';
COMMENT ON COLUMN communication_preferences.quiet_hours_enabled IS 'Respect quiet hours (no notifications during specified time window)';
COMMENT ON COLUMN communication_preferences.unsubscribe_token IS 'Unique token for unsubscribe links in emails';

-- ============================================================================
-- COMMUNICATION LOG (track all messages sent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS communication_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who & what
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL,              -- 'email', 'sms', 'push'

  -- Message details
  event_type VARCHAR(100) NOT NULL,          -- 'contract_signed', 'credits_earned', etc.
  subject TEXT,                              -- Email subject or SMS preview
  body TEXT,                                 -- Full message body
  template_id VARCHAR(100),                  -- Template used (if any)

  -- Delivery status
  status VARCHAR(50) DEFAULT 'pending',      -- 'pending', 'sent', 'delivered', 'failed', 'bounced'
  provider VARCHAR(50),                      -- 'gmail', 'twilio', 'fcm', 'apns'
  provider_message_id TEXT,                  -- External message ID
  error_message TEXT,                        -- If failed

  -- Tracking
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  opened_at TIMESTAMP,                       -- Email opened (tracking pixel)
  clicked_at TIMESTAMP,                      -- Link clicked
  unsubscribed_at TIMESTAMP,                 -- User unsubscribed via this message

  -- Metadata
  metadata JSONB DEFAULT '{}',               -- Additional data
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for communication log
CREATE INDEX IF NOT EXISTS idx_comm_log_user_id
  ON communication_log(user_id);

CREATE INDEX IF NOT EXISTS idx_comm_log_channel
  ON communication_log(channel);

CREATE INDEX IF NOT EXISTS idx_comm_log_event_type
  ON communication_log(event_type);

CREATE INDEX IF NOT EXISTS idx_comm_log_status
  ON communication_log(status);

CREATE INDEX IF NOT EXISTS idx_comm_log_created_at
  ON communication_log(created_at DESC);

COMMENT ON TABLE communication_log IS 'Audit log of all communication sent to users (email, SMS, push)';
COMMENT ON COLUMN communication_log.channel IS 'Communication channel: email, sms, push';
COMMENT ON COLUMN communication_log.event_type IS 'Type of notification: contract_signed, credits_earned, etc.';
COMMENT ON COLUMN communication_log.status IS 'Delivery status: pending, sent, delivered, failed, bounced';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

/**
 * Create default communication preferences for new user
 */
CREATE OR REPLACE FUNCTION create_default_communication_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO communication_preferences (user_id, unsubscribe_token)
  VALUES (
    NEW.user_id,
    encode(gen_random_bytes(32), 'hex')  -- Generate unique unsubscribe token
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Create preferences when user is created
DROP TRIGGER IF EXISTS trigger_create_comm_prefs ON users;
CREATE TRIGGER trigger_create_comm_prefs
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_communication_preferences();

COMMENT ON FUNCTION create_default_communication_preferences IS 'Auto-create communication preferences for new users';

/**
 * Increment message counter when message is sent
 */
CREATE OR REPLACE FUNCTION increment_message_counter()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
    UPDATE communication_preferences
    SET
      total_emails_sent = CASE WHEN NEW.channel = 'email' THEN total_emails_sent + 1 ELSE total_emails_sent END,
      total_sms_sent = CASE WHEN NEW.channel = 'sms' THEN total_sms_sent + 1 ELSE total_sms_sent END,
      total_push_sent = CASE WHEN NEW.channel = 'push' THEN total_push_sent + 1 ELSE total_push_sent END,
      last_email_sent_at = CASE WHEN NEW.channel = 'email' THEN NOW() ELSE last_email_sent_at END,
      last_sms_sent_at = CASE WHEN NEW.channel = 'sms' THEN NOW() ELSE last_sms_sent_at END,
      last_push_sent_at = CASE WHEN NEW.channel = 'push' THEN NOW() ELSE last_push_sent_at END
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Increment counters when message is sent
DROP TRIGGER IF EXISTS trigger_increment_message_counter ON communication_log;
CREATE TRIGGER trigger_increment_message_counter
  AFTER INSERT OR UPDATE ON communication_log
  FOR EACH ROW
  EXECUTE FUNCTION increment_message_counter();

COMMENT ON FUNCTION increment_message_counter IS 'Increment message counters when messages are sent';

/**
 * Check if user has exceeded daily message limit
 */
CREATE OR REPLACE FUNCTION check_message_rate_limit(
  p_user_id UUID,
  p_channel VARCHAR(20)
)
RETURNS BOOLEAN AS $$
DECLARE
  v_prefs RECORD;
  v_count INTEGER;
BEGIN
  -- Get user preferences
  SELECT * INTO v_prefs
  FROM communication_preferences
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN true;  -- No preferences = no limit
  END IF;

  -- Count messages sent today
  SELECT COUNT(*) INTO v_count
  FROM communication_log
  WHERE user_id = p_user_id
    AND channel = p_channel
    AND status = 'sent'
    AND sent_at >= CURRENT_DATE;

  -- Check against limits
  IF p_channel = 'email' AND v_count >= v_prefs.max_emails_per_day THEN
    RETURN false;
  ELSIF p_channel = 'sms' AND v_count >= v_prefs.max_sms_per_day THEN
    RETURN false;
  ELSIF p_channel = 'push' AND v_count >= v_prefs.max_push_per_day THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_message_rate_limit IS 'Check if user has exceeded daily message limit for channel';

/**
 * Check if it's currently quiet hours for user
 */
CREATE OR REPLACE FUNCTION is_quiet_hours(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_prefs RECORD;
  v_current_time TIME;
BEGIN
  -- Get user preferences
  SELECT * INTO v_prefs
  FROM communication_preferences
  WHERE user_id = p_user_id;

  IF NOT FOUND OR NOT v_prefs.quiet_hours_enabled THEN
    RETURN false;  -- No quiet hours
  END IF;

  -- Get current time in user's timezone
  -- TODO: Convert to user's timezone
  v_current_time := CURRENT_TIME;

  -- Check if within quiet hours
  IF v_prefs.quiet_hours_start < v_prefs.quiet_hours_end THEN
    -- Normal case: 22:00 - 08:00 next day
    RETURN v_current_time >= v_prefs.quiet_hours_start
       AND v_current_time <= v_prefs.quiet_hours_end;
  ELSE
    -- Wraps midnight: 22:00 - 02:00
    RETURN v_current_time >= v_prefs.quiet_hours_start
        OR v_current_time <= v_prefs.quiet_hours_end;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION is_quiet_hours IS 'Check if it\'s currently quiet hours for user (don\'t send notifications)';

-- ============================================================================
-- SEED DATA (for testing)
-- ============================================================================

-- Note: Default preferences are created automatically via trigger when user is created


-- Telegram Bot Integration
-- Links Telegram accounts to CALOS users for messaging and account management

-- Telegram accounts (linked to CALOS users)
CREATE TABLE IF NOT EXISTS telegram_accounts (
  telegram_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CALOS user
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Telegram profile
  telegram_user_id BIGINT NOT NULL UNIQUE, -- Telegram's user ID
  telegram_username VARCHAR(255), -- @username (may change)
  telegram_first_name VARCHAR(255),
  telegram_last_name VARCHAR(255),

  -- Status
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  notifications_enabled BOOLEAN DEFAULT TRUE,

  UNIQUE(user_id) -- One Telegram account per CALOS user
);

-- Indexes for Telegram account lookups
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_user ON telegram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_telegram_user ON telegram_accounts(telegram_user_id);

-- Telegram linking codes (temporary codes for account linking)
CREATE TABLE IF NOT EXISTS telegram_linking_codes (
  code_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User to link
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Telegram user requesting link
  telegram_user_id BIGINT NOT NULL UNIQUE, -- Prevent duplicate requests

  -- Linking code
  linking_code VARCHAR(20) NOT NULL UNIQUE,

  -- Expiration
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

-- Index for code lookup
CREATE INDEX IF NOT EXISTS idx_telegram_linking_codes_code ON telegram_linking_codes(linking_code);
CREATE INDEX IF NOT EXISTS idx_telegram_linking_codes_expires ON telegram_linking_codes(expires_at);

-- Telegram verification sessions (phone verification via bot)
CREATE TABLE IF NOT EXISTS telegram_verification_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Telegram user
  telegram_user_id BIGINT NOT NULL,

  -- CALOS user
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Phone number being verified
  phone_number VARCHAR(20) NOT NULL,

  -- Status
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ
);

-- Index for session lookup
CREATE INDEX IF NOT EXISTS idx_telegram_verification_telegram_user ON telegram_verification_sessions(telegram_user_id);

-- Telegram encryption sessions (path-based encryption via bot)
CREATE TABLE IF NOT EXISTS telegram_encryption_sessions (
  session_id VARCHAR(255) PRIMARY KEY,

  -- Telegram user
  telegram_user_id BIGINT NOT NULL,

  -- Challenge state
  challenge_index INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for session lookup
CREATE INDEX IF NOT EXISTS idx_telegram_encryption_telegram_user ON telegram_encryption_sessions(telegram_user_id);

-- Telegram messages (messages sent/received via bot)
CREATE TABLE IF NOT EXISTS telegram_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Telegram details
  telegram_message_id BIGINT NOT NULL, -- Telegram's message ID
  telegram_chat_id BIGINT NOT NULL,
  telegram_user_id BIGINT NOT NULL,

  -- CALOS user (if linked)
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

  -- Message content
  message_text TEXT,
  message_type VARCHAR(50) DEFAULT 'text', -- 'text', 'command', 'photo', etc.

  -- Command details (if command)
  command VARCHAR(50), -- '/start', '/verify', etc.

  -- Timestamps
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for message retrieval
CREATE INDEX IF NOT EXISTS idx_telegram_messages_chat ON telegram_messages(telegram_chat_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_user ON telegram_messages(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_command ON telegram_messages(command) WHERE command IS NOT NULL;

-- Telegram notifications (queued notifications to send via bot)
CREATE TABLE IF NOT EXISTS telegram_notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Recipient
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,

  -- Notification content
  notification_type VARCHAR(50) NOT NULL, -- 'credit_purchase', 'verification_complete', etc.
  title VARCHAR(255),
  message TEXT NOT NULL,

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT
);

-- Indexes for notification queue
CREATE INDEX IF NOT EXISTS idx_telegram_notifications_status ON telegram_notifications(status, created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_notifications_user ON telegram_notifications(user_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get Telegram user by CALOS user ID
CREATE OR REPLACE FUNCTION get_telegram_user(
  p_user_id UUID
)
RETURNS TABLE (
  telegram_user_id BIGINT,
  telegram_username VARCHAR,
  telegram_first_name VARCHAR,
  telegram_last_name VARCHAR,
  linked_at TIMESTAMPTZ,
  notifications_enabled BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ta.telegram_user_id,
    ta.telegram_username,
    ta.telegram_first_name,
    ta.telegram_last_name,
    ta.linked_at,
    ta.notifications_enabled
  FROM telegram_accounts ta
  WHERE ta.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Queue notification for Telegram user
CREATE OR REPLACE FUNCTION queue_telegram_notification(
  p_user_id UUID,
  p_notification_type VARCHAR,
  p_title VARCHAR,
  p_message TEXT
)
RETURNS UUID AS $$
DECLARE
  v_telegram_user_id BIGINT;
  v_notification_id UUID;
BEGIN
  -- Get Telegram user ID
  SELECT telegram_user_id INTO v_telegram_user_id
  FROM telegram_accounts
  WHERE user_id = p_user_id
  AND notifications_enabled = TRUE;

  IF v_telegram_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Queue notification
  INSERT INTO telegram_notifications (
    user_id,
    telegram_user_id,
    notification_type,
    title,
    message
  ) VALUES (
    p_user_id,
    v_telegram_user_id,
    p_notification_type,
    p_title,
    p_message
  ) RETURNING notification_id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

-- Mark Telegram notification as sent
CREATE OR REPLACE FUNCTION mark_telegram_notification_sent(
  p_notification_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE telegram_notifications
  SET status = 'sent', sent_at = NOW()
  WHERE notification_id = p_notification_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active Telegram accounts
CREATE OR REPLACE VIEW active_telegram_accounts AS
SELECT
  ta.telegram_account_id,
  ta.user_id,
  u.email,
  u.username,
  ta.telegram_user_id,
  ta.telegram_username,
  ta.telegram_first_name,
  ta.telegram_last_name,
  ta.linked_at,
  ta.last_active_at,
  EXTRACT(EPOCH FROM (NOW() - ta.last_active_at)) / 86400 as days_since_active
FROM telegram_accounts ta
JOIN users u ON u.user_id = ta.user_id
ORDER BY ta.last_active_at DESC;

-- Pending Telegram notifications
CREATE OR REPLACE VIEW pending_telegram_notifications AS
SELECT
  tn.notification_id,
  tn.user_id,
  u.email,
  tn.telegram_user_id,
  ta.telegram_username,
  tn.notification_type,
  tn.title,
  tn.message,
  tn.created_at,
  EXTRACT(EPOCH FROM (NOW() - tn.created_at)) as age_seconds
FROM telegram_notifications tn
JOIN users u ON u.user_id = tn.user_id
LEFT JOIN telegram_accounts ta ON ta.user_id = tn.user_id
WHERE tn.status = 'pending'
ORDER BY tn.created_at ASC;

-- ============================================================================
-- CLEANUP TASKS
-- ============================================================================

-- Clean expired linking codes (run periodically)
-- DELETE FROM telegram_linking_codes WHERE expires_at < NOW();

-- Clean old verification sessions
-- DELETE FROM telegram_verification_sessions WHERE expires_at < NOW();

-- Clean old encryption sessions (completed)
-- DELETE FROM telegram_encryption_sessions WHERE completed_at < NOW() - INTERVAL '1 hour';

-- Grant permissions (adjust based on your setup)
-- GRANT ALL ON telegram_accounts TO your_app_user;
-- GRANT ALL ON telegram_linking_codes TO your_app_user;
-- GRANT ALL ON telegram_verification_sessions TO your_app_user;
-- GRANT ALL ON telegram_encryption_sessions TO your_app_user;
-- GRANT ALL ON telegram_messages TO your_app_user;
-- GRANT ALL ON telegram_notifications TO your_app_user;

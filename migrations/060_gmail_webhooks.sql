-- Gmail Webhook and Send-As Infrastructure
-- Created: 2025-10-20
--
-- Tables:
-- 1. gmail_webhook_configs - Webhook relay configurations (Tier 3)
-- 2. email_relay_logs - Relay transaction logs
-- 3. gmail_send_as_aliases - Send-As alias configurations (Tier 1)
-- 4. gmail_sent_emails - Sent email logs

-- ==============================================================================
-- Table: gmail_webhook_configs
-- Purpose: Store webhook relay configurations for users
-- Used by: lib/gmail-webhook-relay.js
-- ==============================================================================

CREATE TABLE IF NOT EXISTS gmail_webhook_configs (
  id SERIAL PRIMARY KEY,

  -- User info
  user_id VARCHAR(255) NOT NULL,
  email_address VARCHAR(255) NOT NULL UNIQUE,

  -- OAuth tokens (encrypted in production)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,

  -- Relay configuration
  relay_from_address VARCHAR(255) DEFAULT 'noreply@calos.ai',
  relay_rules JSONB DEFAULT '{}',

  -- Gmail sync state
  last_history_id VARCHAR(255),
  last_webhook_at TIMESTAMP,

  -- Status
  enabled BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Indexes
  CONSTRAINT unique_user_email UNIQUE (user_id, email_address)
);

CREATE INDEX IF NOT EXISTS idx_gmail_webhook_configs_user_id
  ON gmail_webhook_configs(user_id);

CREATE INDEX IF NOT EXISTS idx_gmail_webhook_configs_email
  ON gmail_webhook_configs(email_address);

CREATE INDEX IF NOT EXISTS idx_gmail_webhook_configs_enabled
  ON gmail_webhook_configs(enabled);

-- ==============================================================================
-- Table: email_relay_logs
-- Purpose: Log all email relay transactions
-- Used by: lib/gmail-webhook-relay.js
-- ==============================================================================

CREATE TABLE IF NOT EXISTS email_relay_logs (
  id SERIAL PRIMARY KEY,

  -- User info
  user_id VARCHAR(255) NOT NULL,

  -- Email details
  original_from VARCHAR(255) NOT NULL,
  relayed_from VARCHAR(255) NOT NULL,
  recipient_to TEXT NOT NULL,
  subject TEXT,

  -- Message IDs
  gmail_message_id VARCHAR(255),
  relay_message_id VARCHAR(255),

  -- Status
  status VARCHAR(50) NOT NULL, -- 'sent', 'failed', 'filtered'
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_relay_logs_user_id
  ON email_relay_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_email_relay_logs_status
  ON email_relay_logs(status);

CREATE INDEX IF NOT EXISTS idx_email_relay_logs_created_at
  ON email_relay_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_relay_logs_gmail_message_id
  ON email_relay_logs(gmail_message_id);

-- ==============================================================================
-- Table: gmail_send_as_aliases
-- Purpose: Store Gmail Send-As alias configurations
-- Used by: lib/gmail-send-as-manager.js
-- ==============================================================================

CREATE TABLE IF NOT EXISTS gmail_send_as_aliases (
  id SERIAL PRIMARY KEY,

  -- User info
  user_id VARCHAR(255) NOT NULL,

  -- Alias details
  send_as_email VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  reply_to_address VARCHAR(255),

  -- Verification
  verification_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'failed'
  verification_sent_at TIMESTAMP,

  -- Settings
  is_default BOOLEAN DEFAULT false,
  is_primary BOOLEAN DEFAULT false,

  -- Signature
  signature TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_send_as_email UNIQUE (user_id, send_as_email)
);

CREATE INDEX IF NOT EXISTS idx_gmail_send_as_aliases_user_id
  ON gmail_send_as_aliases(user_id);

CREATE INDEX IF NOT EXISTS idx_gmail_send_as_aliases_send_as_email
  ON gmail_send_as_aliases(send_as_email);

CREATE INDEX IF NOT EXISTS idx_gmail_send_as_aliases_verification_status
  ON gmail_send_as_aliases(verification_status);

CREATE INDEX IF NOT EXISTS idx_gmail_send_as_aliases_is_default
  ON gmail_send_as_aliases(is_default);

-- ==============================================================================
-- Table: gmail_sent_emails
-- Purpose: Log emails sent via Send-As aliases
-- Used by: lib/gmail-send-as-manager.js
-- ==============================================================================

CREATE TABLE IF NOT EXISTS gmail_sent_emails (
  id SERIAL PRIMARY KEY,

  -- User info
  user_id VARCHAR(255) NOT NULL,

  -- Email details
  send_as_email VARCHAR(255) NOT NULL,
  recipient_to TEXT NOT NULL,
  subject TEXT,

  -- Message IDs
  gmail_message_id VARCHAR(255),
  thread_id VARCHAR(255),

  -- Status
  status VARCHAR(50) NOT NULL, -- 'sent', 'failed'
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmail_sent_emails_user_id
  ON gmail_sent_emails(user_id);

CREATE INDEX IF NOT EXISTS idx_gmail_sent_emails_send_as_email
  ON gmail_sent_emails(send_as_email);

CREATE INDEX IF NOT EXISTS idx_gmail_sent_emails_status
  ON gmail_sent_emails(status);

CREATE INDEX IF NOT EXISTS idx_gmail_sent_emails_created_at
  ON gmail_sent_emails(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gmail_sent_emails_gmail_message_id
  ON gmail_sent_emails(gmail_message_id);

-- ==============================================================================
-- Views: Useful queries for reporting
-- ==============================================================================

-- View: Active webhook configurations
CREATE OR REPLACE VIEW active_webhook_configs AS
SELECT
  id,
  user_id,
  email_address,
  relay_from_address,
  enabled,
  last_webhook_at,
  created_at
FROM gmail_webhook_configs
WHERE enabled = true;

-- View: Relay statistics by user
CREATE OR REPLACE VIEW relay_stats_by_user AS
SELECT
  user_id,
  COUNT(*) as total_relayed,
  COUNT(*) FILTER (WHERE status = 'sent') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'filtered') as filtered,
  MAX(created_at) as last_relay,
  MIN(created_at) as first_relay
FROM email_relay_logs
GROUP BY user_id;

-- View: Verified Send-As aliases
CREATE OR REPLACE VIEW verified_send_as_aliases AS
SELECT
  id,
  user_id,
  send_as_email,
  display_name,
  reply_to_address,
  is_default,
  created_at
FROM gmail_send_as_aliases
WHERE verification_status = 'accepted';

-- View: Email sending statistics by alias
CREATE OR REPLACE VIEW email_stats_by_alias AS
SELECT
  user_id,
  send_as_email,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE status = 'sent') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  MAX(created_at) as last_sent,
  MIN(created_at) as first_sent
FROM gmail_sent_emails
GROUP BY user_id, send_as_email;

-- ==============================================================================
-- Functions: Helper functions for common operations
-- ==============================================================================

-- Function: Get user's relay statistics
CREATE OR REPLACE FUNCTION get_user_relay_stats(p_user_id VARCHAR)
RETURNS TABLE (
  total_relayed BIGINT,
  successful BIGINT,
  failed BIGINT,
  filtered BIGINT,
  last_relay TIMESTAMP,
  active_days BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_relayed,
    COUNT(*) FILTER (WHERE status = 'sent')::BIGINT as successful,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed,
    COUNT(*) FILTER (WHERE status = 'filtered')::BIGINT as filtered,
    MAX(created_at) as last_relay,
    COUNT(DISTINCT DATE_TRUNC('day', created_at))::BIGINT as active_days
  FROM email_relay_logs
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Get user's email sending statistics
CREATE OR REPLACE FUNCTION get_user_email_stats(p_user_id VARCHAR)
RETURNS TABLE (
  total_sent BIGINT,
  successful BIGINT,
  failed BIGINT,
  last_sent TIMESTAMP,
  unique_aliases BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_sent,
    COUNT(*) FILTER (WHERE status = 'sent')::BIGINT as successful,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed,
    MAX(created_at) as last_sent,
    COUNT(DISTINCT send_as_email)::BIGINT as unique_aliases
  FROM gmail_sent_emails
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- Sample data (for development/testing only)
-- Uncomment to insert sample data
-- ==============================================================================

-- INSERT INTO gmail_webhook_configs (
--   user_id,
--   email_address,
--   access_token,
--   refresh_token,
--   relay_from_address,
--   relay_rules,
--   enabled
-- ) VALUES (
--   'user123',
--   'user@gmail.com',
--   'sample_access_token',
--   'sample_refresh_token',
--   'noreply@calos.ai',
--   '{"subject_contains": "CALOS"}',
--   true
-- );

-- ==============================================================================
-- Cleanup/Maintenance queries
-- ==============================================================================

-- Delete old relay logs (older than 90 days)
-- Uncomment to create scheduled cleanup job
-- DELETE FROM email_relay_logs
-- WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete old sent email logs (older than 90 days)
-- Uncomment to create scheduled cleanup job
-- DELETE FROM gmail_sent_emails
-- WHERE created_at < NOW() - INTERVAL '90 days';

-- ==============================================================================
-- Permissions (adjust for your environment)
-- ==============================================================================

-- GRANT SELECT, INSERT, UPDATE, DELETE ON gmail_webhook_configs TO calos_app;
-- GRANT SELECT, INSERT ON email_relay_logs TO calos_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON gmail_send_as_aliases TO calos_app;
-- GRANT SELECT, INSERT ON gmail_sent_emails TO calos_app;
-- GRANT SELECT ON active_webhook_configs TO calos_app;
-- GRANT SELECT ON relay_stats_by_user TO calos_app;
-- GRANT SELECT ON verified_send_as_aliases TO calos_app;
-- GRANT SELECT ON email_stats_by_alias TO calos_app;
-- GRANT EXECUTE ON FUNCTION get_user_relay_stats TO calos_app;
-- GRANT EXECUTE ON FUNCTION get_user_email_stats TO calos_app;

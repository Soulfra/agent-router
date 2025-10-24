-- Migration 068: User Data Vault
-- Creates table for storing encrypted user data
--
-- Purpose:
-- - Store arbitrary encrypted data (API keys, OAuth tokens, preferences)
-- - Namespace isolation (users can't access other users' data)
-- - Automatic expiration (TTL support)
-- - Access tracking and audit trail
--
-- Usage:
--   See lib/user-data-vault.js for API

CREATE TABLE IF NOT EXISTS user_data_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Namespace (category of data)
  -- Examples: 'api_keys', 'oauth_tokens', 'preferences', 'secrets'
  namespace VARCHAR(100) NOT NULL,

  -- Key within namespace
  -- Examples: 'openai', 'google', 'github'
  key VARCHAR(255) NOT NULL,

  -- Encrypted data (AES-256-GCM)
  -- Contains JSON object encrypted by lib/simple-encryption.js
  encrypted_data TEXT NOT NULL,

  -- Optional expiration (for temporary data like OAuth tokens)
  expires_at TIMESTAMP,

  -- Metadata (NOT encrypted - for search/filtering)
  -- Examples: {"provider": "openai", "scope": "read-write"}
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Access tracking
  last_accessed_at TIMESTAMP,
  access_count INTEGER DEFAULT 0,

  -- Constraints
  CONSTRAINT user_vault_unique UNIQUE (user_id, namespace, key)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_data_vault_user_id
  ON user_data_vault(user_id);

CREATE INDEX IF NOT EXISTS idx_user_data_vault_namespace
  ON user_data_vault(user_id, namespace);

CREATE INDEX IF NOT EXISTS idx_user_data_vault_expires_at
  ON user_data_vault(expires_at)
  WHERE expires_at IS NOT NULL;

-- Comments
COMMENT ON TABLE user_data_vault IS 'Encrypted storage for user data (API keys, tokens, secrets)';
COMMENT ON COLUMN user_data_vault.namespace IS 'Category of data (e.g., api_keys, oauth_tokens)';
COMMENT ON COLUMN user_data_vault.key IS 'Identifier within namespace (e.g., openai, google)';
COMMENT ON COLUMN user_data_vault.encrypted_data IS 'AES-256-GCM encrypted JSON data';
COMMENT ON COLUMN user_data_vault.expires_at IS 'Optional expiration for temporary data';
COMMENT ON COLUMN user_data_vault.metadata IS 'Unencrypted metadata for search (no sensitive data)';

-- Function to cleanup expired entries (run as cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_vault_entries()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_data_vault
  WHERE expires_at IS NOT NULL AND expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_vault_entries IS 'Delete expired vault entries (run daily via cron)';

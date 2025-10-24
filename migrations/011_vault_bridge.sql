-- Migration: Vault Bridge Tables
-- Session-scoped key tracking and key usage logging

-- Session Keys: Ephemeral credentials per session
CREATE TABLE IF NOT EXISTS session_keys (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'deepseek', etc.
  session_token VARCHAR(255) UNIQUE NOT NULL, -- Ephemeral token
  actual_key_source VARCHAR(50) NOT NULL, -- 'tenant_byok', 'user_key', 'system_key'

  -- Context
  tenant_id UUID,
  user_id VARCHAR(255),

  -- Expiration
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_session_keys_session (session_id, provider),
  INDEX idx_session_keys_token (session_token),
  INDEX idx_session_keys_expires (expires_at)
);

COMMENT ON TABLE session_keys IS 'Session-scoped ephemeral credentials (Cal''s unique voice per session)';

-- Key Usage Log: Track which keys are being used
CREATE TABLE IF NOT EXISTS key_usage_log (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  key_source VARCHAR(50) NOT NULL, -- 'tenant_byok', 'user_key', 'system_key'

  -- Who used it
  tenant_id UUID,
  user_id VARCHAR(255),
  session_id VARCHAR(255),

  -- When
  used_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_key_usage_provider (provider, used_at DESC),
  INDEX idx_key_usage_tenant (tenant_id, used_at DESC),
  INDEX idx_key_usage_user (user_id, used_at DESC),
  INDEX idx_key_usage_session (session_id, used_at DESC)
);

COMMENT ON TABLE key_usage_log IS 'Tracks API key usage for billing and analytics';

-- Clean up expired session keys periodically
CREATE OR REPLACE FUNCTION cleanup_expired_session_keys()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM session_keys
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_session_keys IS 'Removes expired session keys (run periodically)';

-- Migration: Service Credentials - Encrypted API Key Storage
-- Enables Keyring to store encrypted API keys in database
-- Part of Hybrid BYOK system (user keys + platform keys)

-- Service Credentials: Encrypted storage for API keys, tokens, secrets
CREATE TABLE IF NOT EXISTS service_credentials (
  id SERIAL PRIMARY KEY,

  -- Service identification
  service_name VARCHAR(100) NOT NULL, -- 'openai', 'anthropic', 'deepseek', 'github', etc.
  credential_type VARCHAR(50) NOT NULL, -- 'api_key', 'oauth_token', 'ssh_key', etc.
  identifier VARCHAR(255) NOT NULL DEFAULT 'default', -- Account/tenant/user identifier

  -- Encrypted value (AES-256-GCM)
  encrypted_value TEXT NOT NULL, -- Base64-encoded ciphertext
  encryption_method VARCHAR(50) NOT NULL DEFAULT 'aes-256-gcm',
  iv VARCHAR(255) NOT NULL, -- Initialization vector
  auth_tag VARCHAR(255) NOT NULL, -- Authentication tag for GCM

  -- Metadata
  description TEXT, -- Human-readable description
  scopes TEXT, -- Comma-separated list of allowed scopes/permissions

  -- Lifecycle
  expires_at TIMESTAMPTZ, -- Optional expiration
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ, -- Track usage

  -- Ensure uniqueness per service + type + identifier
  UNIQUE(service_name, credential_type, identifier)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_service_credentials_lookup
  ON service_credentials(service_name, credential_type, identifier);

CREATE INDEX IF NOT EXISTS idx_service_credentials_expires
  ON service_credentials(expires_at)
  WHERE expires_at IS NOT NULL;

-- Comments
COMMENT ON TABLE service_credentials IS 'Encrypted storage for API keys and secrets (AES-256-GCM)';
COMMENT ON COLUMN service_credentials.encrypted_value IS 'AES-256-GCM encrypted credential value';
COMMENT ON COLUMN service_credentials.iv IS 'Initialization vector for encryption';
COMMENT ON COLUMN service_credentials.auth_tag IS 'GCM authentication tag for tamper detection';
COMMENT ON COLUMN service_credentials.identifier IS 'Scope identifier: tenant_id, user_id, or "system" for platform keys';

-- Tenant API Keys: Public metadata about which tenants have BYOK
CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id SERIAL PRIMARY KEY,

  -- Tenant
  tenant_id UUID NOT NULL,

  -- Provider
  provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'deepseek'

  -- Key metadata (actual key stored in service_credentials via Keyring)
  key_name VARCHAR(255) NOT NULL,
  encrypted_api_key VARCHAR(255) DEFAULT 'encrypted_by_keyring', -- Pointer to Keyring
  key_prefix VARCHAR(20), -- First few chars for identification (sk-...)

  -- Status
  active BOOLEAN DEFAULT TRUE,
  verified_at TIMESTAMPTZ, -- Last successful verification
  verification_error TEXT, -- Last verification error if any

  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one key per provider per tenant
  UNIQUE(tenant_id, provider)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_tenant
  ON tenant_api_keys(tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_provider
  ON tenant_api_keys(provider, active);

-- Comments
COMMENT ON TABLE tenant_api_keys IS 'Tenant BYOK metadata (actual keys stored in service_credentials)';
COMMENT ON COLUMN tenant_api_keys.encrypted_api_key IS 'Reference to Keyring storage, not actual key';
COMMENT ON COLUMN tenant_api_keys.key_prefix IS 'First few characters for UI display (e.g., "sk-proj...")';

-- User API Keys: Public metadata about user personal keys
CREATE TABLE IF NOT EXISTS user_api_keys (
  id SERIAL PRIMARY KEY,

  -- User
  user_id VARCHAR(255) NOT NULL,

  -- Provider
  provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'deepseek'

  -- Key metadata
  key_name VARCHAR(255) NOT NULL,
  encrypted_api_key VARCHAR(255) DEFAULT 'encrypted_by_keyring',
  key_prefix VARCHAR(20),

  -- Status
  active BOOLEAN DEFAULT TRUE,
  verified_at TIMESTAMPTZ,
  verification_error TEXT,

  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one key per provider per user
  UNIQUE(user_id, provider)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user
  ON user_api_keys(user_id, active);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_provider
  ON user_api_keys(provider, active);

-- Comments
COMMENT ON TABLE user_api_keys IS 'User personal API key metadata (actual keys stored in service_credentials)';

-- Cleanup function for expired credentials
CREATE OR REPLACE FUNCTION cleanup_expired_credentials()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM service_credentials
  WHERE expires_at IS NOT NULL AND expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_credentials IS 'Removes expired credentials (run periodically via cron)';

-- Update last_used_at trigger
CREATE OR REPLACE FUNCTION update_credential_last_used()
RETURNS TRIGGER AS $$
BEGIN
  -- This can be called manually when credential is accessed
  NEW.last_used_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Example: How to mark a credential as used
-- UPDATE service_credentials SET last_used_at = NOW() WHERE service_name = 'openai' AND identifier = 'user_123';

-- Grant permissions (adjust based on your roles)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON service_credentials TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_api_keys TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON user_api_keys TO app_user;

/**
 * Migration 040: Fix OAuth Providers Table
 *
 * Creates the missing oauth_providers table that's causing server crashes.
 * This table stores OAuth provider configurations for authentication.
 */

-- Create oauth_providers table (matches schema from 013_oauth_providers.sql)
CREATE TABLE IF NOT EXISTS oauth_providers (
  provider_id VARCHAR(100) PRIMARY KEY,     -- 'yahoo', 'aol', 'microsoft', 'google', 'github'
  display_name VARCHAR(255) NOT NULL,       -- 'Yahoo!', 'AOL', 'Microsoft Account'
  provider_type VARCHAR(50) NOT NULL DEFAULT 'oauth2',  -- 'oauth2', 'saml', 'openid'

  -- OAuth 2.0 endpoints
  auth_url TEXT,                            -- Authorization endpoint
  token_url TEXT,                           -- Token endpoint
  userinfo_url TEXT,                        -- User info endpoint (optional)
  revoke_url TEXT,                          -- Token revocation endpoint

  -- Configuration
  scopes TEXT[] DEFAULT ARRAY['email', 'profile'],  -- Default scopes
  response_type VARCHAR(50) DEFAULT 'code', -- 'code', 'token', 'id_token'
  grant_type VARCHAR(50) DEFAULT 'authorization_code',

  -- Credentials (encrypted)
  client_id TEXT,                           -- OAuth client ID
  client_secret TEXT,                       -- OAuth client secret (NULL for public clients)

  -- User mapping
  email_field VARCHAR(100) DEFAULT 'email', -- JSON path to email in userinfo
  name_field VARCHAR(100) DEFAULT 'name',   -- JSON path to name
  id_field VARCHAR(100) DEFAULT 'id',       -- JSON path to unique ID

  -- Metadata
  icon_url TEXT,                            -- Provider icon
  docs_url TEXT,                            -- Documentation link
  legacy_provider BOOLEAN DEFAULT false,    -- True for Yahoo, AOL, Hotmail, MSN
  email_domains TEXT[],                     -- ['yahoo.com', 'ymail.com'] for auto-detection

  -- Status
  is_enabled BOOLEAN DEFAULT true,
  requires_manual_setup BOOLEAN DEFAULT false, -- True if admin needs to configure

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns to existing table (if it was created with old schema)
DO $$
BEGIN
  -- Add provider_type if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='provider_type') THEN
    ALTER TABLE oauth_providers ADD COLUMN provider_type VARCHAR(50) NOT NULL DEFAULT 'oauth2';
  END IF;

  -- Add other potentially missing columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='userinfo_url') THEN
    ALTER TABLE oauth_providers ADD COLUMN userinfo_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='revoke_url') THEN
    ALTER TABLE oauth_providers ADD COLUMN revoke_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='scopes') THEN
    ALTER TABLE oauth_providers ADD COLUMN scopes TEXT[] DEFAULT ARRAY['email', 'profile'];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='response_type') THEN
    ALTER TABLE oauth_providers ADD COLUMN response_type VARCHAR(50) DEFAULT 'code';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='grant_type') THEN
    ALTER TABLE oauth_providers ADD COLUMN grant_type VARCHAR(50) DEFAULT 'authorization_code';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='email_field') THEN
    ALTER TABLE oauth_providers ADD COLUMN email_field VARCHAR(100) DEFAULT 'email';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='name_field') THEN
    ALTER TABLE oauth_providers ADD COLUMN name_field VARCHAR(100) DEFAULT 'name';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='id_field') THEN
    ALTER TABLE oauth_providers ADD COLUMN id_field VARCHAR(100) DEFAULT 'id';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='icon_url') THEN
    ALTER TABLE oauth_providers ADD COLUMN icon_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='docs_url') THEN
    ALTER TABLE oauth_providers ADD COLUMN docs_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='legacy_provider') THEN
    ALTER TABLE oauth_providers ADD COLUMN legacy_provider BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='email_domains') THEN
    ALTER TABLE oauth_providers ADD COLUMN email_domains TEXT[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='is_enabled') THEN
    ALTER TABLE oauth_providers ADD COLUMN is_enabled BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='oauth_providers' AND column_name='requires_manual_setup') THEN
    ALTER TABLE oauth_providers ADD COLUMN requires_manual_setup BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_oauth_providers_enabled ON oauth_providers(is_enabled);
CREATE INDEX IF NOT EXISTS idx_oauth_providers_email_domains ON oauth_providers USING GIN(email_domains) WHERE email_domains IS NOT NULL;

-- Seed with common OAuth providers
INSERT INTO oauth_providers (provider_id, display_name, provider_type, is_enabled) VALUES
  ('google', 'Google', 'oauth2', true),
  ('github', 'GitHub', 'oauth2', true),
  ('microsoft', 'Microsoft', 'oauth2', true),
  ('yahoo', 'Yahoo', 'oauth2', false),
  ('aol', 'AOL', 'oauth2', false),
  ('apple', 'Apple', 'oauth2', false),
  ('twitter', 'Twitter/X', 'oauth2', false),
  ('facebook', 'Facebook', 'oauth2', false),
  ('discord', 'Discord', 'oauth2', false),
  ('linkedin', 'LinkedIn', 'oauth2', false)
ON CONFLICT (provider_id) DO NOTHING;

-- Create oauth_user_connections table if not exists (for linking users to OAuth accounts)
CREATE TABLE IF NOT EXISTS oauth_user_connections (
  connection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider_id UUID NOT NULL REFERENCES oauth_providers(provider_id) ON DELETE CASCADE,
  provider_user_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  profile_data JSONB DEFAULT '{}',
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider_id, provider_user_id)
);

-- Create indexes for oauth_user_connections
CREATE INDEX IF NOT EXISTS idx_oauth_connections_user ON oauth_user_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider ON oauth_user_connections(provider_id);

-- Add trigger to update oauth_providers.updated_at
CREATE OR REPLACE FUNCTION update_oauth_providers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_oauth_providers_updated_at
  BEFORE UPDATE ON oauth_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_oauth_providers_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON oauth_providers TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_user_connections TO PUBLIC;

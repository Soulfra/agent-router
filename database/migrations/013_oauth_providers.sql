-- Universal OAuth Provider System
-- Supports modern providers (Google, GitHub) AND legacy email providers (Yahoo, AOL, Hotmail, MSN)

-- ============================================================================
-- OAUTH PROVIDERS
-- ============================================================================

-- OAuth provider configurations
-- Stores auth endpoints and credentials for ANY OAuth provider
CREATE TABLE IF NOT EXISTS oauth_providers (
  provider_id VARCHAR(100) PRIMARY KEY,     -- 'yahoo', 'aol', 'microsoft', 'google', 'github'
  display_name VARCHAR(255) NOT NULL,       -- 'Yahoo!', 'AOL', 'Microsoft Account'
  provider_type VARCHAR(50) NOT NULL,       -- 'oauth2', 'saml', 'openid'

  -- OAuth 2.0 endpoints
  auth_url TEXT NOT NULL,                   -- Authorization endpoint
  token_url TEXT NOT NULL,                  -- Token endpoint
  userinfo_url TEXT,                        -- User info endpoint (optional)
  revoke_url TEXT,                          -- Token revocation endpoint

  -- Configuration
  scopes TEXT[] NOT NULL,                   -- Default scopes ['email', 'profile']
  response_type VARCHAR(50) DEFAULT 'code', -- 'code', 'token', 'id_token'
  grant_type VARCHAR(50) DEFAULT 'authorization_code',

  -- Credentials (encrypted)
  client_id TEXT NOT NULL,                  -- OAuth client ID
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

CREATE INDEX idx_oauth_providers_enabled ON oauth_providers(is_enabled);
CREATE INDEX idx_oauth_providers_email_domains ON oauth_providers USING GIN(email_domains);

-- OAuth authorization attempts (for debugging)
CREATE TABLE IF NOT EXISTS oauth_authorization_attempts (
  id SERIAL PRIMARY KEY,
  provider_id VARCHAR(100) REFERENCES oauth_providers(provider_id),

  -- Request data
  state VARCHAR(255) UNIQUE NOT NULL,       -- OAuth state parameter
  redirect_uri TEXT NOT NULL,
  scopes TEXT[],

  -- User context
  user_id INTEGER REFERENCES users(user_id), -- NULL for new registrations
  ip_address INET,
  user_agent TEXT,

  -- Status
  status VARCHAR(50) DEFAULT 'pending',     -- 'pending', 'completed', 'failed', 'expired'
  completed_at TIMESTAMP,
  error_message TEXT,

  -- Security
  code_verifier VARCHAR(255),               -- PKCE code verifier
  nonce VARCHAR(255),                       -- OpenID Connect nonce

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes')
);

CREATE INDEX idx_oauth_attempts_state ON oauth_authorization_attempts(state);
CREATE INDEX idx_oauth_attempts_status ON oauth_authorization_attempts(status, created_at);
CREATE INDEX idx_oauth_attempts_user ON oauth_authorization_attempts(user_id);

-- User OAuth connections
-- Links users to their OAuth provider accounts
CREATE TABLE IF NOT EXISTS user_oauth_connections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  provider_id VARCHAR(100) REFERENCES oauth_providers(provider_id),

  -- Provider account info
  provider_user_id VARCHAR(255) NOT NULL,   -- Unique ID from provider
  provider_email VARCHAR(255),              -- Email from provider
  provider_name VARCHAR(255),               -- Name from provider
  provider_avatar TEXT,                     -- Avatar URL from provider

  -- Tokens (encrypted)
  access_token TEXT,                        -- Current access token
  refresh_token TEXT,                       -- Refresh token (if available)
  token_type VARCHAR(50) DEFAULT 'Bearer',
  token_expires_at TIMESTAMP,

  -- Metadata
  scopes TEXT[],                            -- Granted scopes
  raw_profile JSONB,                        -- Full profile data from provider

  -- Usage
  is_primary BOOLEAN DEFAULT false,         -- Primary login method
  last_used_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(provider_id, provider_user_id),    -- One connection per provider account
  UNIQUE(user_id, provider_id)              -- One provider connection per user
);

CREATE INDEX idx_oauth_connections_user ON user_oauth_connections(user_id);
CREATE INDEX idx_oauth_connections_provider ON user_oauth_connections(provider_id, provider_user_id);
CREATE INDEX idx_oauth_connections_email ON user_oauth_connections(provider_email);

-- ============================================================================
-- PRE-POPULATED OAUTH PROVIDERS
-- ============================================================================

-- Google OAuth
INSERT INTO oauth_providers (
  provider_id, display_name, provider_type,
  auth_url, token_url, userinfo_url,
  scopes, client_id, client_secret,
  email_field, name_field, id_field,
  icon_url, email_domains, legacy_provider
) VALUES (
  'google',
  'Google',
  'oauth2',
  'https://accounts.google.com/o/oauth2/v2/auth',
  'https://oauth2.googleapis.com/token',
  'https://www.googleapis.com/oauth2/v2/userinfo',
  ARRAY['email', 'profile'],
  'YOUR_GOOGLE_CLIENT_ID',
  'YOUR_GOOGLE_CLIENT_SECRET',
  'email',
  'name',
  'id',
  'https://www.google.com/favicon.ico',
  ARRAY['gmail.com', 'googlemail.com'],
  false
) ON CONFLICT (provider_id) DO NOTHING;

-- GitHub OAuth
INSERT INTO oauth_providers (
  provider_id, display_name, provider_type,
  auth_url, token_url, userinfo_url,
  scopes, client_id, client_secret,
  email_field, name_field, id_field,
  icon_url, email_domains, legacy_provider
) VALUES (
  'github',
  'GitHub',
  'oauth2',
  'https://github.com/login/oauth/authorize',
  'https://github.com/login/oauth/access_token',
  'https://api.github.com/user',
  ARRAY['user:email', 'read:user'],
  'YOUR_GITHUB_CLIENT_ID',
  'YOUR_GITHUB_CLIENT_SECRET',
  'email',
  'name',
  'id',
  'https://github.com/favicon.ico',
  ARRAY[]::TEXT[],
  false
) ON CONFLICT (provider_id) DO NOTHING;

-- Microsoft OAuth (covers Hotmail, Live, MSN, Outlook)
INSERT INTO oauth_providers (
  provider_id, display_name, provider_type,
  auth_url, token_url, userinfo_url,
  scopes, client_id, client_secret,
  email_field, name_field, id_field,
  icon_url, email_domains, legacy_provider
) VALUES (
  'microsoft',
  'Microsoft Account',
  'oauth2',
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  'https://graph.microsoft.com/v1.0/me',
  ARRAY['User.Read', 'email', 'profile', 'openid'],
  'YOUR_MICROSOFT_CLIENT_ID',
  'YOUR_MICROSOFT_CLIENT_SECRET',
  'mail',
  'displayName',
  'id',
  'https://www.microsoft.com/favicon.ico',
  ARRAY['hotmail.com', 'live.com', 'msn.com', 'outlook.com', 'passport.com'],
  true
) ON CONFLICT (provider_id) DO NOTHING;

-- Yahoo OAuth
INSERT INTO oauth_providers (
  provider_id, display_name, provider_type,
  auth_url, token_url, userinfo_url,
  scopes, client_id, client_secret,
  email_field, name_field, id_field,
  icon_url, email_domains, legacy_provider
) VALUES (
  'yahoo',
  'Yahoo!',
  'oauth2',
  'https://api.login.yahoo.com/oauth2/request_auth',
  'https://api.login.yahoo.com/oauth2/get_token',
  'https://api.login.yahoo.com/openid/v1/userinfo',
  ARRAY['openid', 'email', 'profile'],
  'YOUR_YAHOO_CLIENT_ID',
  'YOUR_YAHOO_CLIENT_SECRET',
  'email',
  'name',
  'sub',
  'https://www.yahoo.com/favicon.ico',
  ARRAY['yahoo.com', 'ymail.com', 'rocketmail.com'],
  true
) ON CONFLICT (provider_id) DO NOTHING;

-- AOL OAuth (uses Yahoo infrastructure after merger)
INSERT INTO oauth_providers (
  provider_id, display_name, provider_type,
  auth_url, token_url, userinfo_url,
  scopes, client_id, client_secret,
  email_field, name_field, id_field,
  icon_url, email_domains, legacy_provider
) VALUES (
  'aol',
  'AOL',
  'oauth2',
  'https://api.login.aol.com/oauth2/request_auth',
  'https://api.login.aol.com/oauth2/get_token',
  'https://api.login.aol.com/openid/v1/userinfo',
  ARRAY['openid', 'email', 'profile'],
  'YOUR_AOL_CLIENT_ID',
  'YOUR_AOL_CLIENT_SECRET',
  'email',
  'name',
  'sub',
  'https://www.aol.com/favicon.ico',
  ARRAY['aol.com', 'aim.com'],
  true
) ON CONFLICT (provider_id) DO NOTHING;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Detect OAuth provider from email
CREATE OR REPLACE FUNCTION detect_oauth_provider_from_email(email_address TEXT)
RETURNS VARCHAR AS $$
DECLARE
  email_domain TEXT;
  provider_rec RECORD;
BEGIN
  -- Extract domain from email
  email_domain := LOWER(SUBSTRING(email_address FROM '@(.*)$'));

  -- Find matching provider
  SELECT provider_id INTO provider_rec
  FROM oauth_providers
  WHERE email_domain = ANY(email_domains)
    AND is_enabled = true
  LIMIT 1;

  IF FOUND THEN
    RETURN provider_rec.provider_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Get or create user from OAuth profile
CREATE OR REPLACE FUNCTION get_or_create_oauth_user(
  p_provider_id VARCHAR,
  p_provider_user_id VARCHAR,
  p_email VARCHAR,
  p_name VARCHAR,
  p_avatar TEXT,
  p_raw_profile JSONB
) RETURNS INTEGER AS $$
DECLARE
  v_user_id INTEGER;
  v_connection_id INTEGER;
BEGIN
  -- Check if OAuth connection exists
  SELECT user_id INTO v_user_id
  FROM user_oauth_connections
  WHERE provider_id = p_provider_id
    AND provider_user_id = p_provider_user_id;

  IF FOUND THEN
    -- Update last used
    UPDATE user_oauth_connections
    SET
      last_used_at = NOW(),
      provider_email = p_email,
      provider_name = p_name,
      provider_avatar = p_avatar,
      raw_profile = p_raw_profile
    WHERE provider_id = p_provider_id
      AND provider_user_id = p_provider_user_id;

    RETURN v_user_id;
  END IF;

  -- Check if user exists with this email
  SELECT user_id INTO v_user_id
  FROM users
  WHERE email = LOWER(p_email);

  IF NOT FOUND THEN
    -- Create new user
    INSERT INTO users (
      email,
      display_name,
      avatar_url,
      email_verified,
      status
    ) VALUES (
      LOWER(p_email),
      p_name,
      p_avatar,
      true,  -- OAuth emails are pre-verified
      'active'
    )
    RETURNING user_id INTO v_user_id;
  END IF;

  -- Create OAuth connection
  INSERT INTO user_oauth_connections (
    user_id,
    provider_id,
    provider_user_id,
    provider_email,
    provider_name,
    provider_avatar,
    raw_profile,
    is_primary,
    last_used_at
  ) VALUES (
    v_user_id,
    p_provider_id,
    p_provider_user_id,
    p_email,
    p_name,
    p_avatar,
    p_raw_profile,
    true,
    NOW()
  );

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active OAuth providers summary
CREATE OR REPLACE VIEW oauth_providers_summary AS
SELECT
  p.provider_id,
  p.display_name,
  p.legacy_provider,
  p.is_enabled,
  COUNT(DISTINCT c.user_id) as user_count,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'pending') as pending_auths,
  MAX(c.last_used_at) as last_used
FROM oauth_providers p
LEFT JOIN user_oauth_connections c ON c.provider_id = p.provider_id
LEFT JOIN oauth_authorization_attempts a ON a.provider_id = p.provider_id
GROUP BY p.provider_id, p.display_name, p.legacy_provider, p.is_enabled;

-- User OAuth connections with provider details
CREATE OR REPLACE VIEW user_oauth_connections_detail AS
SELECT
  c.id,
  c.user_id,
  u.email as user_email,
  c.provider_id,
  p.display_name as provider_name,
  p.legacy_provider,
  c.provider_email,
  c.provider_name,
  c.is_primary,
  c.last_used_at,
  c.created_at
FROM user_oauth_connections c
JOIN users u ON u.user_id = c.user_id
JOIN oauth_providers p ON p.provider_id = c.provider_id;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamps
CREATE TRIGGER update_oauth_providers_updated_at BEFORE UPDATE ON oauth_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_connections_updated_at BEFORE UPDATE ON user_oauth_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Clean up expired authorization attempts (run daily)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM oauth_authorization_attempts
  WHERE expires_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

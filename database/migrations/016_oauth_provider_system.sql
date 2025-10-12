/**
 * Migration 016: OAuth2 Provider System
 *
 * CalOS as OAuth Provider - "Sign in with CalOS"
 *
 * Allows third-party apps to use CalOS for authentication
 * Example: Chess app redirects to CalOS, user logs in, chess app gets access token
 */

-- Enable pgcrypto for gen_random_bytes()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. REGISTERED APPLICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_apps (
  app_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- App identity
  app_name VARCHAR(200) NOT NULL,
  app_description TEXT,
  app_url TEXT NOT NULL,

  -- OAuth credentials
  client_id VARCHAR(100) NOT NULL UNIQUE,
  client_secret VARCHAR(100) NOT NULL,

  -- Allowed redirect URIs (whitelist for security)
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',

  -- Allowed scopes
  allowed_scopes TEXT[] NOT NULL DEFAULT ARRAY['openid', 'profile'],

  -- App metadata
  logo_url TEXT,
  privacy_policy_url TEXT,
  terms_of_service_url TEXT,

  -- Developer info
  developer_id UUID REFERENCES users(user_id),
  developer_email VARCHAR(255),

  -- Status
  enabled BOOLEAN DEFAULT TRUE,
  verified BOOLEAN DEFAULT FALSE,

  -- Stats
  total_users INTEGER DEFAULT 0,
  total_authorizations INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_oauth_apps_client_id ON oauth_apps(client_id);
CREATE INDEX idx_oauth_apps_developer ON oauth_apps(developer_id);
CREATE INDEX idx_oauth_apps_enabled ON oauth_apps(enabled) WHERE enabled = TRUE;

COMMENT ON TABLE oauth_apps IS 'Third-party applications registered to use CalOS SSO';

-- ============================================================================
-- 2. AUTHORIZATION CODES
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The code itself (sent to app)
  code VARCHAR(100) NOT NULL UNIQUE,

  -- Who/what it's for
  user_id UUID NOT NULL REFERENCES users(user_id),
  app_id UUID NOT NULL REFERENCES oauth_apps(app_id),
  client_id VARCHAR(100) NOT NULL,

  -- OAuth flow params
  redirect_uri TEXT NOT NULL,
  scopes TEXT[] NOT NULL,

  -- PKCE (Proof Key for Code Exchange) for security
  code_challenge VARCHAR(255),
  code_challenge_method VARCHAR(10), -- 'plain' or 'S256'

  -- Status
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,

  -- Expiry (codes are short-lived, 10 minutes)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_oauth_auth_codes_code ON oauth_authorization_codes(code);
CREATE INDEX idx_oauth_auth_codes_user ON oauth_authorization_codes(user_id);
CREATE INDEX idx_oauth_auth_codes_app ON oauth_authorization_codes(app_id);
CREATE INDEX idx_oauth_auth_codes_unused ON oauth_authorization_codes(used, expires_at) WHERE used = FALSE;

COMMENT ON TABLE oauth_authorization_codes IS 'Temporary codes exchanged for access tokens';

-- ============================================================================
-- 3. ACCESS/REFRESH TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who/what
  user_id UUID NOT NULL REFERENCES users(user_id),
  app_id UUID NOT NULL REFERENCES oauth_apps(app_id),

  -- Tokens
  access_token TEXT NOT NULL UNIQUE,
  refresh_token VARCHAR(100) UNIQUE,

  -- Scopes granted
  scopes TEXT[] NOT NULL,

  -- Expiry
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,

  -- Status
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT
);

CREATE INDEX idx_oauth_tokens_access ON oauth_tokens(access_token);
CREATE INDEX idx_oauth_tokens_refresh ON oauth_tokens(refresh_token);
CREATE INDEX idx_oauth_tokens_user ON oauth_tokens(user_id);
CREATE INDEX idx_oauth_tokens_app ON oauth_tokens(app_id);
CREATE INDEX idx_oauth_tokens_active ON oauth_tokens(revoked, expires_at) WHERE revoked = FALSE;

COMMENT ON TABLE oauth_tokens IS 'Access tokens for third-party apps to call CalOS APIs';

-- ============================================================================
-- 4. USER GRANTS (Saved Consents)
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_user_grants (
  grant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(user_id),
  app_id UUID NOT NULL REFERENCES oauth_apps(app_id),

  -- What permissions user granted
  scopes TEXT[] NOT NULL,

  -- When
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,

  -- Status
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,

  UNIQUE(user_id, app_id)
);

CREATE INDEX idx_oauth_grants_user ON oauth_user_grants(user_id);
CREATE INDEX idx_oauth_grants_app ON oauth_user_grants(app_id);
CREATE INDEX idx_oauth_grants_active ON oauth_user_grants(revoked) WHERE revoked = FALSE;

COMMENT ON TABLE oauth_user_grants IS 'User consent history for apps (skip consent screen if already granted)';

-- ============================================================================
-- 5. AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_audit_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  event_type VARCHAR(50) NOT NULL, -- 'authorize', 'token_issue', 'token_refresh', 'token_revoke', 'grant_revoke'

  user_id UUID REFERENCES users(user_id),
  app_id UUID REFERENCES oauth_apps(app_id),

  -- Details
  details JSONB DEFAULT '{}',

  -- Request metadata
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_oauth_audit_event ON oauth_audit_log(event_type, created_at);
CREATE INDEX idx_oauth_audit_user ON oauth_audit_log(user_id, created_at);
CREATE INDEX idx_oauth_audit_app ON oauth_audit_log(app_id, created_at);

COMMENT ON TABLE oauth_audit_log IS 'Security audit trail for all OAuth events';

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

/**
 * Generate client credentials for a new app
 */
CREATE OR REPLACE FUNCTION generate_oauth_client_credentials()
RETURNS TABLE(
  client_id VARCHAR(100),
  client_secret VARCHAR(100)
) AS $$
BEGIN
  RETURN QUERY SELECT
    ('cal_' || encode(gen_random_bytes(16), 'hex'))::VARCHAR(100),
    ('cs_' || encode(gen_random_bytes(32), 'hex'))::VARCHAR(100);
END;
$$ LANGUAGE plpgsql;

/**
 * Revoke all tokens for an app (when user revokes access)
 */
CREATE OR REPLACE FUNCTION revoke_app_access(p_user_id UUID, p_app_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Revoke all tokens
  UPDATE oauth_tokens
  SET revoked = TRUE, revoked_at = NOW(), revoke_reason = 'user_revoked'
  WHERE user_id = p_user_id AND app_id = p_app_id AND revoked = FALSE;

  -- Revoke grant
  UPDATE oauth_user_grants
  SET revoked = TRUE, revoked_at = NOW()
  WHERE user_id = p_user_id AND app_id = p_app_id;

  -- Audit log
  INSERT INTO oauth_audit_log (event_type, user_id, app_id, details)
  VALUES ('grant_revoke', p_user_id, p_app_id, '{"reason": "user_revoked"}'::jsonb);
END;
$$ LANGUAGE plpgsql;

/**
 * Clean up expired authorization codes and tokens
 */
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_data()
RETURNS TABLE(
  deleted_codes INTEGER,
  deleted_tokens INTEGER
) AS $$
DECLARE
  v_deleted_codes INTEGER;
  v_deleted_tokens INTEGER;
BEGIN
  -- Delete expired authorization codes
  WITH deleted AS (
    DELETE FROM oauth_authorization_codes
    WHERE expires_at < NOW() - INTERVAL '1 day'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted_codes FROM deleted;

  -- Delete expired tokens
  WITH deleted AS (
    DELETE FROM oauth_tokens
    WHERE revoked = FALSE AND expires_at < NOW() - INTERVAL '30 days'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted_tokens FROM deleted;

  RETURN QUERY SELECT v_deleted_codes, v_deleted_tokens;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. VIEWS
-- ============================================================================

-- App statistics dashboard
CREATE OR REPLACE VIEW oauth_app_stats AS
SELECT
  oa.app_id,
  oa.app_name,
  oa.client_id,
  oa.enabled,
  oa.verified,
  COUNT(DISTINCT oug.user_id) AS total_authorized_users,
  COUNT(DISTINCT ot.token_id) FILTER (WHERE ot.revoked = FALSE AND ot.expires_at > NOW()) AS active_tokens,
  MAX(oug.last_used_at) AS last_used,
  oa.created_at
FROM oauth_apps oa
LEFT JOIN oauth_user_grants oug ON oug.app_id = oa.app_id AND oug.revoked = FALSE
LEFT JOIN oauth_tokens ot ON ot.app_id = oa.app_id
GROUP BY oa.app_id;

-- User's connected apps
CREATE OR REPLACE VIEW user_connected_apps AS
SELECT
  oug.user_id,
  oa.app_id,
  oa.app_name,
  oa.app_description,
  oa.app_url,
  oa.logo_url,
  oug.scopes,
  oug.granted_at,
  oug.last_used_at,
  COUNT(ot.token_id) FILTER (WHERE ot.revoked = FALSE AND ot.expires_at > NOW()) AS active_tokens
FROM oauth_user_grants oug
JOIN oauth_apps oa ON oa.app_id = oug.app_id
LEFT JOIN oauth_tokens ot ON ot.user_id = oug.user_id AND ot.app_id = oug.app_id
WHERE oug.revoked = FALSE AND oa.enabled = TRUE
GROUP BY oug.user_id, oa.app_id, oug.scopes, oug.granted_at, oug.last_used_at;

-- Recent OAuth activity
CREATE OR REPLACE VIEW recent_oauth_activity AS
SELECT
  oal.log_id,
  oal.event_type,
  oal.created_at,
  u.username,
  oa.app_name,
  oal.ip_address,
  oal.details
FROM oauth_audit_log oal
LEFT JOIN users u ON u.user_id = oal.user_id
LEFT JOIN oauth_apps oa ON oa.app_id = oal.app_id
ORDER BY oal.created_at DESC
LIMIT 1000;

-- ============================================================================
-- 8. SEED DATA - Example Test App
-- ============================================================================

-- Create a test app for development
WITH creds AS (
  SELECT * FROM generate_oauth_client_credentials()
)
INSERT INTO oauth_apps (
  app_name,
  app_description,
  app_url,
  client_id,
  client_secret,
  redirect_uris,
  allowed_scopes,
  enabled
)
SELECT
  'CalOS Test App',
  'Development test application for CalOS SSO',
  'http://localhost:3000',
  client_id,
  client_secret,
  ARRAY['http://localhost:3000/callback', 'http://127.0.0.1:3000/callback'],
  ARRAY['openid', 'profile', 'email', 'skills'],
  TRUE
FROM creds
ON CONFLICT DO NOTHING;

COMMENT ON DATABASE calos IS 'CalOS Platform - SSO provider with skills/XP progression';

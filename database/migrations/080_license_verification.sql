-- Migration 080: License Verification System
-- "Phone Home" license verification for CALOS Business OS
--
-- Purpose:
-- - Track license verifications (domain, install ID, tier)
-- - Collect usage data (routes, themes, stats) during verification
-- - Support multiple license tiers (development, community, pro, enterprise)
-- - Enable fair trade model (data OR money OR credit)
--
-- License Tiers:
-- - Development (localhost): Free forever, no verification
-- - Community: Free, verify every 24h, share data OR contribute
-- - Pro ($29/mo): 5 domains, verify every 7 days, white-label
-- - Enterprise ($99/mo): Unlimited domains, verify every 30 days, air-gapped
--
-- Model: VS Code / Unity style licensing
-- - Localhost = Always free, no verification
-- - Production = Verify with license.calos.sh
--
-- What We Collect:
-- - Domain (example.com, isadev.com, isasoftware.com)
-- - Routes/endpoints (user's custom routes)
-- - Themes (installed marketplace themes)
-- - Usage stats (anonymized)
-- - Install ID (unique identifier per installation)

-- ============================================================================
-- LICENSE VERIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS license_verifications (
  verification_id SERIAL PRIMARY KEY,

  -- Installation
  install_id VARCHAR(32) NOT NULL,          -- Unique install ID (UUID)
  hostname VARCHAR(255) NOT NULL,           -- Domain (example.com, isadev.com)

  -- License tier
  tier VARCHAR(50) NOT NULL,                -- 'development', 'community', 'pro', 'enterprise'
  features JSONB DEFAULT '{}',              -- { "whiteLabel": true, "multiDomain": true, ... }

  -- Verification data (what we collect)
  verification_data JSONB NOT NULL,         -- Full data sent during verification

  -- Timestamps
  verified_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,                     -- When verification expires (tier-dependent)

  -- Indexes
  INDEX idx_install_id (install_id),
  INDEX idx_hostname (hostname),
  INDEX idx_tier (tier),
  INDEX idx_verified_at (verified_at DESC)
);

COMMENT ON TABLE license_verifications IS 'License verification events (phone home data)';
COMMENT ON COLUMN license_verifications.install_id IS 'Unique installation identifier';
COMMENT ON COLUMN license_verifications.hostname IS 'Domain being verified (example.com, isadev.com)';
COMMENT ON COLUMN license_verifications.tier IS 'License tier: development, community, pro, enterprise';
COMMENT ON COLUMN license_verifications.verification_data IS 'Data collected: routes, themes, stats';

-- ============================================================================
-- LICENSE ACCOUNTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS license_accounts (
  account_id VARCHAR(100) PRIMARY KEY,

  -- User (if linked)
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  email VARCHAR(255),

  -- License tier
  tier VARCHAR(50) NOT NULL DEFAULT 'community',
  status VARCHAR(50) DEFAULT 'active',      -- 'active', 'suspended', 'cancelled'

  -- Limits
  max_domains INTEGER DEFAULT 1,            -- Pro: 5, Enterprise: unlimited (-1)
  max_verifications_per_day INTEGER DEFAULT 100,

  -- Features
  features JSONB DEFAULT '{}',              -- { "whiteLabel": false, "multiDomain": false, ... }

  -- Billing
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  billing_status VARCHAR(50),               -- 'active', 'past_due', 'cancelled'
  current_period_end TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_license_accounts_user_id
  ON license_accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_license_accounts_tier
  ON license_accounts(tier);

CREATE INDEX IF NOT EXISTS idx_license_accounts_status
  ON license_accounts(status);

COMMENT ON TABLE license_accounts IS 'License accounts (link install IDs to users)';
COMMENT ON COLUMN license_accounts.tier IS 'License tier: community, pro, enterprise';
COMMENT ON COLUMN license_accounts.max_domains IS 'Max domains allowed (-1 = unlimited)';

-- ============================================================================
-- LICENSE DOMAINS
-- ============================================================================

CREATE TABLE IF NOT EXISTS license_domains (
  domain_id VARCHAR(100) PRIMARY KEY,

  -- Account
  account_id VARCHAR(100) NOT NULL REFERENCES license_accounts(account_id) ON DELETE CASCADE,

  -- Domain
  hostname VARCHAR(255) NOT NULL,
  install_id VARCHAR(32),                   -- Linked install ID (optional)

  -- Status
  status VARCHAR(50) DEFAULT 'active',      -- 'active', 'suspended', 'removed'
  verified BOOLEAN DEFAULT false,

  -- Timestamps
  added_at TIMESTAMP DEFAULT NOW(),
  last_verified_at TIMESTAMP,

  -- Unique constraint
  UNIQUE(account_id, hostname)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_license_domains_account_id
  ON license_domains(account_id);

CREATE INDEX IF NOT EXISTS idx_license_domains_hostname
  ON license_domains(hostname);

CREATE INDEX IF NOT EXISTS idx_license_domains_install_id
  ON license_domains(install_id)
  WHERE install_id IS NOT NULL;

COMMENT ON TABLE license_domains IS 'Domains linked to license accounts';
COMMENT ON COLUMN license_domains.install_id IS 'Install ID that verified this domain';

-- ============================================================================
-- CUSTOM ROUTES (for data collection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS custom_routes (
  route_id SERIAL PRIMARY KEY,

  -- Installation
  install_id VARCHAR(32) NOT NULL,
  hostname VARCHAR(255) NOT NULL,

  -- Route
  route_path VARCHAR(500) NOT NULL,         -- '/api/my-custom-route'
  route_method VARCHAR(10) DEFAULT 'GET',   -- 'GET', 'POST', 'PUT', 'DELETE'
  route_description TEXT,

  -- Contribution tracking
  contributed BOOLEAN DEFAULT false,        -- Has user contributed this route back?
  contribution_url TEXT,                    -- GitHub PR URL

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_custom_routes_install_id
  ON custom_routes(install_id);

CREATE INDEX IF NOT EXISTS idx_custom_routes_hostname
  ON custom_routes(hostname);

CREATE INDEX IF NOT EXISTS idx_custom_routes_contributed
  ON custom_routes(contributed)
  WHERE contributed = true;

COMMENT ON TABLE custom_routes IS 'Custom routes built by users (collected during verification)';
COMMENT ON COLUMN custom_routes.contributed IS 'Has user contributed this route back to CALOS?';

-- ============================================================================
-- LICENSE ANALYTICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS license_analytics (
  analytics_id SERIAL PRIMARY KEY,

  -- Installation
  install_id VARCHAR(32) NOT NULL,
  hostname VARCHAR(255) NOT NULL,
  tier VARCHAR(50) NOT NULL,

  -- Metrics (from verification_data)
  users_count INTEGER DEFAULT 0,
  transcripts_count INTEGER DEFAULT 0,
  pos_transactions_count INTEGER DEFAULT 0,
  crypto_charges_count INTEGER DEFAULT 0,
  forum_posts_count INTEGER DEFAULT 0,

  -- Routes & themes
  custom_routes_count INTEGER DEFAULT 0,
  installed_themes_count INTEGER DEFAULT 0,

  -- Timestamp
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_license_analytics_install_id
  ON license_analytics(install_id);

CREATE INDEX IF NOT EXISTS idx_license_analytics_hostname
  ON license_analytics(hostname);

CREATE INDEX IF NOT EXISTS idx_license_analytics_tier
  ON license_analytics(tier);

CREATE INDEX IF NOT EXISTS idx_license_analytics_recorded_at
  ON license_analytics(recorded_at DESC);

COMMENT ON TABLE license_analytics IS 'Aggregated analytics from license verifications';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

/**
 * Record license verification
 */
CREATE OR REPLACE FUNCTION record_license_verification(
  p_install_id VARCHAR(32),
  p_hostname VARCHAR(255),
  p_tier VARCHAR(50),
  p_features JSONB,
  p_verification_data JSONB
)
RETURNS TABLE (
  verification_id INTEGER,
  expires_at TIMESTAMP
) AS $$
DECLARE
  v_verification_id INTEGER;
  v_expires_at TIMESTAMP;
  v_interval INTERVAL;
BEGIN
  -- Calculate expiration based on tier
  v_interval := CASE p_tier
    WHEN 'development' THEN INTERVAL '0 seconds'       -- No expiration
    WHEN 'community' THEN INTERVAL '24 hours'
    WHEN 'pro' THEN INTERVAL '7 days'
    WHEN 'enterprise' THEN INTERVAL '30 days'
    ELSE INTERVAL '24 hours'
  END;

  v_expires_at := NOW() + v_interval;

  -- Insert verification
  INSERT INTO license_verifications (
    install_id,
    hostname,
    tier,
    features,
    verification_data,
    expires_at
  ) VALUES (
    p_install_id,
    p_hostname,
    p_tier,
    p_features,
    p_verification_data,
    v_expires_at
  )
  RETURNING license_verifications.verification_id INTO v_verification_id;

  -- Record analytics
  INSERT INTO license_analytics (
    install_id,
    hostname,
    tier,
    users_count,
    transcripts_count,
    pos_transactions_count,
    crypto_charges_count,
    forum_posts_count,
    custom_routes_count,
    installed_themes_count
  ) VALUES (
    p_install_id,
    p_hostname,
    p_tier,
    COALESCE((p_verification_data->'stats'->>'users')::INTEGER, 0),
    COALESCE((p_verification_data->'stats'->>'transcripts')::INTEGER, 0),
    COALESCE((p_verification_data->'stats'->>'posTransactions')::INTEGER, 0),
    COALESCE((p_verification_data->'stats'->>'cryptoCharges')::INTEGER, 0),
    COALESCE((p_verification_data->'stats'->>'forumPosts')::INTEGER, 0),
    COALESCE(jsonb_array_length(p_verification_data->'routes'), 0),
    COALESCE(jsonb_array_length(p_verification_data->'themes'), 0)
  );

  RETURN QUERY SELECT v_verification_id, v_expires_at;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_license_verification IS 'Record license verification and extract analytics';

/**
 * Get license status for install ID
 */
CREATE OR REPLACE FUNCTION get_license_status(
  p_install_id VARCHAR(32),
  p_hostname VARCHAR(255) DEFAULT NULL
)
RETURNS TABLE (
  tier VARCHAR(50),
  features JSONB,
  verified BOOLEAN,
  last_verified_at TIMESTAMP,
  expires_at TIMESTAMP,
  is_expired BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.tier,
    v.features,
    true as verified,
    v.verified_at as last_verified_at,
    v.expires_at,
    (NOW() > v.expires_at) as is_expired
  FROM license_verifications v
  WHERE v.install_id = p_install_id
    AND (p_hostname IS NULL OR v.hostname = p_hostname)
  ORDER BY v.verified_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_license_status IS 'Get latest license status for install ID';

/**
 * Get domain usage stats
 */
CREATE OR REPLACE FUNCTION get_domain_usage(
  p_hostname VARCHAR(255),
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_verifications BIGINT,
  unique_installs BIGINT,
  avg_users NUMERIC,
  avg_transcripts NUMERIC,
  avg_pos_transactions NUMERIC,
  total_custom_routes BIGINT,
  total_themes BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_verifications,
    COUNT(DISTINCT install_id) as unique_installs,
    AVG(users_count) as avg_users,
    AVG(transcripts_count) as avg_transcripts,
    AVG(pos_transactions_count) as avg_pos_transactions,
    SUM(custom_routes_count) as total_custom_routes,
    SUM(installed_themes_count) as total_themes
  FROM license_analytics
  WHERE hostname = p_hostname
    AND recorded_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_domain_usage IS 'Get aggregated usage stats for a domain';

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Official CALOS license account (for our own hosted instances)
INSERT INTO license_accounts (
  account_id,
  tier,
  status,
  max_domains,
  features
) VALUES (
  'license_calos_official',
  'enterprise',
  'active',
  -1,  -- Unlimited
  '{
    "whiteLabel": true,
    "multiDomain": true,
    "apiAccess": true,
    "prioritySupport": true,
    "airGapped": true
  }'::JSONB
) ON CONFLICT DO NOTHING;

-- Default community tier features
INSERT INTO license_accounts (
  account_id,
  tier,
  status,
  max_domains,
  features
) VALUES (
  'license_default_community',
  'community',
  'active',
  1,
  '{
    "whiteLabel": false,
    "multiDomain": false,
    "apiAccess": false,
    "prioritySupport": false
  }'::JSONB
) ON CONFLICT DO NOTHING;

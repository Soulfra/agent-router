/**
 * Migration 020: Platform Licensing & Multi-Tenancy
 *
 * Transform from consumer app → whitelabel platform
 *
 * Business model: License the platform to businesses who want
 * their own branded version of Recipe ELO, Brand Builder, etc.
 *
 * Features:
 * - Multi-tenant architecture
 * - Platform licensing tiers
 * - Whitelabel branding
 * - Admin god mode
 * - 28-day billing cycles (not monthly)
 * - Tenant isolation
 */

-- ============================================================================
-- 1. PLATFORM TENANTS (Licensees)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant identity
  tenant_slug VARCHAR(100) NOT NULL UNIQUE, -- URL-safe identifier (e.g., 'acme-fitness')
  tenant_name VARCHAR(200) NOT NULL, -- Display name (e.g., 'Acme Fitness')
  company_name VARCHAR(200),

  -- Contact
  owner_email VARCHAR(255) NOT NULL,
  owner_name VARCHAR(200),

  -- Custom domain
  custom_domain VARCHAR(255) UNIQUE, -- e.g., 'recipes.acmefitness.com'
  domain_verified BOOLEAN DEFAULT FALSE,

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'trial', -- 'trial', 'active', 'suspended', 'canceled'

  -- Trial period
  trial_ends_at TIMESTAMPTZ,

  -- Billing (28-day cycles, not monthly!)
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ DEFAULT NOW() + INTERVAL '28 days',

  -- Usage limits (per license tier)
  max_users INTEGER DEFAULT 100,
  max_apps INTEGER DEFAULT 1, -- How many apps they can deploy

  -- Current usage
  users_count INTEGER DEFAULT 0,
  apps_deployed INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  suspended_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ
);

CREATE INDEX idx_tenants_slug ON tenants(tenant_slug);
CREATE INDEX idx_tenants_domain ON tenants(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX idx_tenants_status ON tenants(status) WHERE status = 'active';

COMMENT ON TABLE tenants IS 'Platform licensees (whitelabel customers)';

-- ============================================================================
-- 2. PLATFORM LICENSE TIERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_tiers (
  tier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tier_code VARCHAR(50) NOT NULL UNIQUE, -- 'starter', 'pro', 'enterprise'
  tier_name VARCHAR(100) NOT NULL,
  tier_description TEXT,

  -- Pricing (28-day cycle!)
  price_cents INTEGER NOT NULL, -- Price per 28 days
  currency VARCHAR(3) DEFAULT 'usd',

  -- Limits
  max_users INTEGER, -- NULL = unlimited
  max_apps INTEGER, -- How many app types (recipe, brand, etc)
  max_custom_domains INTEGER DEFAULT 1,

  -- Features
  has_whitelabel BOOLEAN DEFAULT TRUE,
  has_custom_domain BOOLEAN DEFAULT FALSE,
  has_api_access BOOLEAN DEFAULT FALSE,
  has_analytics BOOLEAN DEFAULT FALSE,
  has_white_glove BOOLEAN DEFAULT FALSE, -- Dedicated support

  -- Storage/bandwidth
  storage_gb INTEGER,
  bandwidth_gb INTEGER,

  -- Status
  active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_platform_tiers_code ON platform_tiers(tier_code);
CREATE INDEX idx_platform_tiers_active ON platform_tiers(active) WHERE active = TRUE;

COMMENT ON TABLE platform_tiers IS 'Platform pricing tiers';

-- Seed platform tiers
INSERT INTO platform_tiers (tier_code, tier_name, tier_description, price_cents, max_users, max_apps, has_custom_domain, has_api_access, has_analytics, sort_order)
VALUES
  ('starter', 'Starter', 'Perfect for solo entrepreneurs', 9900, 100, 1, FALSE, FALSE, FALSE, 1),
  ('pro', 'Professional', 'For growing businesses', 29900, 1000, 3, TRUE, TRUE, TRUE, 2),
  ('enterprise', 'Enterprise', 'Unlimited everything', 99900, NULL, NULL, TRUE, TRUE, TRUE, 3)
ON CONFLICT (tier_code) DO NOTHING;

-- ============================================================================
-- 3. TENANT LICENSES (Subscriptions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_licenses (
  license_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES platform_tiers(tier_id),

  -- Stripe details
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),

  -- License status
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'past_due', 'canceled', 'suspended'

  -- 28-day billing cycle
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '28 days',

  -- Usage tracking (reset every 28 days)
  users_this_period INTEGER DEFAULT 0,
  api_calls_this_period INTEGER DEFAULT 0,
  storage_used_gb DECIMAL(10,2) DEFAULT 0,
  bandwidth_used_gb DECIMAL(10,2) DEFAULT 0,

  -- Auto-renewal
  auto_renew BOOLEAN DEFAULT TRUE,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  canceled_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_tenant_licenses_tenant ON tenant_licenses(tenant_id);
CREATE INDEX idx_tenant_licenses_status ON tenant_licenses(status) WHERE status = 'active';
CREATE INDEX idx_tenant_licenses_stripe ON tenant_licenses(stripe_subscription_id);
CREATE INDEX idx_tenant_licenses_period ON tenant_licenses(current_period_end) WHERE status = 'active';

COMMENT ON TABLE tenant_licenses IS 'Active platform licenses (28-day billing)';

-- ============================================================================
-- 4. WHITELABEL BRANDING
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_branding (
  branding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,

  -- Branding
  logo_url TEXT,
  logo_small_url TEXT, -- For favicons
  primary_color VARCHAR(7) DEFAULT '#f5576c', -- Hex color
  secondary_color VARCHAR(7) DEFAULT '#667eea',

  -- App customization
  app_name VARCHAR(200), -- Override "Recipe ELO" with their brand
  tagline VARCHAR(500),

  -- Custom CSS
  custom_css TEXT,

  -- Email branding
  email_from_name VARCHAR(100),
  email_from_address VARCHAR(255),
  email_header_html TEXT,
  email_footer_html TEXT,

  -- Social links
  website_url TEXT,
  twitter_url TEXT,
  facebook_url TEXT,
  instagram_url TEXT,

  -- Legal
  terms_url TEXT,
  privacy_url TEXT,
  support_email VARCHAR(255),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id)
);

CREATE INDEX idx_tenant_branding_tenant ON tenant_branding(tenant_id);

COMMENT ON TABLE tenant_branding IS 'Whitelabel branding per tenant';

-- ============================================================================
-- 5. TENANT FEATURE FLAGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_features (
  feature_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,

  -- Which apps are enabled
  recipe_elo_enabled BOOLEAN DEFAULT TRUE,
  brand_builder_enabled BOOLEAN DEFAULT TRUE,
  model_council_enabled BOOLEAN DEFAULT FALSE,

  -- Feature toggles
  offline_mode_enabled BOOLEAN DEFAULT TRUE,
  analytics_enabled BOOLEAN DEFAULT TRUE,
  api_access_enabled BOOLEAN DEFAULT FALSE,
  white_glove_support BOOLEAN DEFAULT FALSE,

  -- Payment features
  accept_payments BOOLEAN DEFAULT TRUE,
  stripe_account_id VARCHAR(255), -- Their connected Stripe account

  -- Limits
  swipes_per_day INTEGER DEFAULT 20, -- Free tier limit
  premium_price_cents INTEGER DEFAULT 499, -- Their premium pricing

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tenant_id)
);

CREATE INDEX idx_tenant_features_tenant ON tenant_features(tenant_id);

COMMENT ON TABLE tenant_features IS 'Feature flags per tenant';

-- ============================================================================
-- 6. SUPER ADMIN USERS (God Mode)
-- ============================================================================

CREATE TABLE IF NOT EXISTS super_admins (
  admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(user_id),

  -- Permissions
  can_manage_tenants BOOLEAN DEFAULT TRUE,
  can_manage_billing BOOLEAN DEFAULT TRUE,
  can_view_analytics BOOLEAN DEFAULT TRUE,
  can_suspend_tenants BOOLEAN DEFAULT TRUE,

  -- Access log
  last_login_at TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,

  -- Status
  active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(user_id),

  UNIQUE(user_id)
);

CREATE INDEX idx_super_admins_user ON super_admins(user_id);
CREATE INDEX idx_super_admins_active ON super_admins(active) WHERE active = TRUE;

COMMENT ON TABLE super_admins IS 'Platform super administrators';

-- ============================================================================
-- 7. ADD TENANT_ID TO EXISTING TABLES (Multi-tenancy)
-- ============================================================================

-- Add tenant_id to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- Add tenant_id to other tables (wrap in DO block to avoid errors if already exists)
DO $$
BEGIN
  -- ELO items
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'elo_items' AND column_name = 'tenant_id') THEN
    ALTER TABLE elo_items ADD COLUMN tenant_id UUID REFERENCES tenants(tenant_id);
    CREATE INDEX idx_elo_items_tenant ON elo_items(tenant_id);
  END IF;

  -- ELO matchups
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'elo_matchups' AND column_name = 'tenant_id') THEN
    ALTER TABLE elo_matchups ADD COLUMN tenant_id UUID REFERENCES tenants(tenant_id);
    CREATE INDEX idx_elo_matchups_tenant ON elo_matchups(tenant_id);
  END IF;

  -- Onboarding sessions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'onboarding_sessions' AND column_name = 'tenant_id') THEN
    ALTER TABLE onboarding_sessions ADD COLUMN tenant_id UUID REFERENCES tenants(tenant_id);
    CREATE INDEX idx_onboarding_sessions_tenant ON onboarding_sessions(tenant_id);
  END IF;

END $$;

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

/**
 * Reset tenant usage at 28-day period end
 */
CREATE OR REPLACE FUNCTION reset_tenant_usage()
RETURNS INTEGER AS $$
DECLARE
  v_reset_count INTEGER;
BEGIN
  WITH reset AS (
    UPDATE tenant_licenses
    SET
      users_this_period = 0,
      api_calls_this_period = 0,
      storage_used_gb = 0,
      bandwidth_used_gb = 0,
      current_period_start = current_period_end,
      current_period_end = current_period_end + INTERVAL '28 days' -- 28-day cycle!
    WHERE current_period_end <= NOW() AND status = 'active'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_reset_count FROM reset;

  RETURN v_reset_count;
END;
$$ LANGUAGE plpgsql;

/**
 * Check if tenant is within limits
 */
CREATE OR REPLACE FUNCTION check_tenant_limits(
  p_tenant_id UUID,
  p_check_type VARCHAR(50) -- 'users', 'apps', 'api_calls', 'storage'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_license RECORD;
  v_tier RECORD;
  v_tenant RECORD;
BEGIN
  -- Get tenant license and tier
  SELECT tl.*, pt.* INTO v_license
  FROM tenant_licenses tl
  JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
  WHERE tl.tenant_id = p_tenant_id
    AND tl.status = 'active'
  LIMIT 1;

  IF v_license IS NULL THEN
    RETURN FALSE; -- No active license
  END IF;

  -- Check specific limit
  CASE p_check_type
    WHEN 'users' THEN
      IF v_license.max_users IS NULL THEN
        RETURN TRUE; -- Unlimited
      END IF;

      SELECT * INTO v_tenant FROM tenants WHERE tenant_id = p_tenant_id;
      RETURN v_tenant.users_count < v_license.max_users;

    WHEN 'apps' THEN
      IF v_license.max_apps IS NULL THEN
        RETURN TRUE;
      END IF;

      SELECT * INTO v_tenant FROM tenants WHERE tenant_id = p_tenant_id;
      RETURN v_tenant.apps_deployed < v_license.max_apps;

    WHEN 'api_calls' THEN
      -- No limit for now
      RETURN TRUE;

    WHEN 'storage' THEN
      IF v_license.storage_gb IS NULL THEN
        RETURN TRUE;
      END IF;
      RETURN v_license.storage_used_gb < v_license.storage_gb;

    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql;

/**
 * Get tenant by slug or domain
 */
CREATE OR REPLACE FUNCTION get_tenant_by_identifier(
  p_identifier VARCHAR(255)
)
RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM tenants
  WHERE tenant_slug = p_identifier
     OR custom_domain = p_identifier
  LIMIT 1;

  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. VIEWS
-- ============================================================================

-- Active tenants with license info
CREATE OR REPLACE VIEW active_tenants AS
SELECT
  t.tenant_id,
  t.tenant_slug,
  t.tenant_name,
  t.custom_domain,
  t.status AS tenant_status,
  pt.tier_name,
  pt.tier_code,
  tl.status AS license_status,
  tl.current_period_end,
  tl.users_this_period,
  t.users_count,
  pt.max_users,
  CASE
    WHEN pt.max_users IS NULL THEN NULL
    ELSE ROUND((t.users_count::DECIMAL / pt.max_users) * 100)
  END AS usage_percent,
  t.created_at
FROM tenants t
JOIN tenant_licenses tl ON tl.tenant_id = t.tenant_id
JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
WHERE t.status = 'active'
  AND tl.status = 'active';

-- Platform revenue summary
CREATE OR REPLACE VIEW platform_revenue AS
SELECT
  COUNT(DISTINCT t.tenant_id) AS total_tenants,
  COUNT(DISTINCT CASE WHEN t.status = 'active' THEN t.tenant_id END) AS active_tenants,
  COUNT(DISTINCT CASE WHEN t.status = 'trial' THEN t.tenant_id END) AS trial_tenants,
  SUM(CASE WHEN tl.status = 'active' THEN pt.price_cents ELSE 0 END) AS mrr_cents, -- Monthly recurring revenue (but 28-day cycle)
  SUM(pt.price_cents) FILTER (WHERE tl.status = 'active' AND pt.tier_code = 'starter') AS starter_mrr,
  SUM(pt.price_cents) FILTER (WHERE tl.status = 'active' AND pt.tier_code = 'pro') AS pro_mrr,
  SUM(pt.price_cents) FILTER (WHERE tl.status = 'active' AND pt.tier_code = 'enterprise') AS enterprise_mrr,
  SUM(t.users_count) AS total_end_users
FROM tenants t
LEFT JOIN tenant_licenses tl ON tl.tenant_id = t.tenant_id
LEFT JOIN platform_tiers pt ON pt.tier_id = tl.tier_id;

COMMENT ON DATABASE calos IS 'CalOS - Multi-tenant whitelabel platform';

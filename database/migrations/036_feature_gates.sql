-- Feature Gate System
-- Unified access control for all platform features
-- Single-line check like 2FA before transaction
--
-- Concept:
-- - Connection → Analysis (auth first, then feature check)
-- - Controlled leaks (only expose contractually allowed features)
-- - Pay-per-feature (monetize partials/beta access)
-- - Find top producers (analytics on usage/revenue)

-- Feature definitions (all features in the platform)
CREATE TABLE IF NOT EXISTS feature_definitions (
  feature_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Feature identification
  feature_name VARCHAR(100) NOT NULL UNIQUE, -- 'secure_messaging', 'telegram_bot', etc.
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50), -- 'messaging', 'payments', 'admin', etc.

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'beta', 'disabled', 'deprecated'
  is_beta BOOLEAN DEFAULT FALSE,

  -- Access requirements
  requires_subscription BOOLEAN DEFAULT FALSE,
  requires_credits BOOLEAN DEFAULT FALSE,
  min_credits_required INTEGER DEFAULT 0,

  -- Tier requirements
  min_tier_code VARCHAR(50), -- 'free', 'starter', 'pro', 'enterprise'
  min_tier_price_cents INTEGER, -- Cached price for upgrade prompts

  -- Pay-per-feature pricing
  is_paid_feature BOOLEAN DEFAULT FALSE,
  feature_price_cents INTEGER, -- Price to unlock this feature separately

  -- Rate limiting (feature-specific)
  rate_limit_per_day INTEGER, -- Max uses per day
  rate_limit_per_month INTEGER,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for feature lookups
CREATE INDEX IF NOT EXISTS idx_feature_definitions_name ON feature_definitions(feature_name);
CREATE INDEX IF NOT EXISTS idx_feature_definitions_status ON feature_definitions(status);
CREATE INDEX IF NOT EXISTS idx_feature_definitions_category ON feature_definitions(category);

-- Feature access overrides (user-specific access)
CREATE TABLE IF NOT EXISTS feature_access_overrides (
  override_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Feature
  feature_name VARCHAR(100) NOT NULL,

  -- Access type
  access_type VARCHAR(50) NOT NULL, -- 'pay_per_feature', 'admin_grant', 'beta', 'promo'

  -- Payment (if pay-per-feature)
  price_paid_cents INTEGER,
  payment_intent_id VARCHAR(255),

  -- Expiration
  expires_at TIMESTAMPTZ, -- NULL = permanent

  -- Metadata
  granted_by VARCHAR(255), -- Admin who granted access
  grant_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, feature_name)
);

-- Indexes for access checks
CREATE INDEX IF NOT EXISTS idx_feature_access_user ON feature_access_overrides(user_id, feature_name);
CREATE INDEX IF NOT EXISTS idx_feature_access_type ON feature_access_overrides(access_type);

-- Feature beta access (private features, ultra hardcore ironman style)
CREATE TABLE IF NOT EXISTS feature_beta_access (
  beta_access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Feature
  feature_name VARCHAR(100) NOT NULL,

  -- Access details
  granted_by VARCHAR(255) NOT NULL, -- Admin/system who granted
  grant_reason TEXT,

  -- Expiration
  expires_at TIMESTAMPTZ, -- NULL = permanent

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, feature_name)
);

-- Indexes for beta access checks
CREATE INDEX IF NOT EXISTS idx_feature_beta_user ON feature_beta_access(user_id, feature_name);

-- Feature usage analytics (track "top producers")
CREATE TABLE IF NOT EXISTS feature_usage_analytics (
  usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE SET NULL,

  -- Feature
  feature_name VARCHAR(100) NOT NULL,

  -- Access details
  access_type VARCHAR(50), -- 'subscription', 'pay_per_feature', 'beta', 'admin'

  -- Blocked?
  blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,

  -- Context
  ip_address INET,
  user_agent TEXT,
  endpoint VARCHAR(255), -- Which API endpoint was accessed

  -- Credits deducted (if applicable)
  credits_deducted INTEGER DEFAULT 0,

  -- Timestamp
  used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_feature_usage_user ON feature_usage_analytics(user_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_usage_feature ON feature_usage_analytics(feature_name, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_usage_blocked ON feature_usage_analytics(blocked) WHERE blocked = TRUE;
CREATE INDEX IF NOT EXISTS idx_feature_usage_date ON feature_usage_analytics(used_at DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Check if user has access to feature
CREATE OR REPLACE FUNCTION check_feature_access(
  p_user_id UUID,
  p_feature_name VARCHAR
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  access_type VARCHAR
) AS $$
DECLARE
  v_feature RECORD;
  v_user RECORD;
  v_has_override BOOLEAN;
  v_has_beta BOOLEAN;
BEGIN
  -- Get feature definition
  SELECT * INTO v_feature
  FROM feature_definitions
  WHERE feature_name = p_feature_name;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Feature not found', NULL::VARCHAR;
    RETURN;
  END IF;

  -- Check if feature is disabled
  IF v_feature.status = 'disabled' THEN
    RETURN QUERY SELECT FALSE, 'Feature temporarily disabled', NULL::VARCHAR;
    RETURN;
  END IF;

  -- Get user info
  SELECT
    u.is_admin,
    uc.credits_remaining,
    tl.status as license_status,
    pt.tier_code
  INTO v_user
  FROM users u
  LEFT JOIN user_credits uc ON uc.user_id = u.user_id
  LEFT JOIN tenant_licenses tl ON tl.tenant_id = u.tenant_id AND tl.status = 'active'
  LEFT JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
  WHERE u.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'User not found', NULL::VARCHAR;
    RETURN;
  END IF;

  -- Admin always has access
  IF v_user.is_admin THEN
    RETURN QUERY SELECT TRUE, 'Admin access', 'admin'::VARCHAR;
    RETURN;
  END IF;

  -- Check pay-per-feature override
  SELECT EXISTS(
    SELECT 1 FROM feature_access_overrides
    WHERE user_id = p_user_id AND feature_name = p_feature_name
    AND (expires_at IS NULL OR expires_at > NOW())
  ) INTO v_has_override;

  IF v_has_override THEN
    RETURN QUERY SELECT TRUE, 'Pay-per-feature access', 'pay_per_feature'::VARCHAR;
    RETURN;
  END IF;

  -- Check beta access
  IF v_feature.is_beta THEN
    SELECT EXISTS(
      SELECT 1 FROM feature_beta_access
      WHERE user_id = p_user_id AND feature_name = p_feature_name
      AND (expires_at IS NULL OR expires_at > NOW())
    ) INTO v_has_beta;

    IF NOT v_has_beta THEN
      RETURN QUERY SELECT FALSE, 'Beta access required', NULL::VARCHAR;
      RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, 'Beta access', 'beta'::VARCHAR;
    RETURN;
  END IF;

  -- Check subscription requirement
  IF v_feature.requires_subscription THEN
    IF v_user.license_status != 'active' THEN
      RETURN QUERY SELECT FALSE, 'Active subscription required', NULL::VARCHAR;
      RETURN;
    END IF;
  END IF;

  -- Check tier requirement
  IF v_feature.min_tier_code IS NOT NULL THEN
    -- Simple tier comparison (would need more robust logic)
    IF v_user.tier_code IS NULL THEN
      RETURN QUERY SELECT FALSE, 'Subscription tier required', NULL::VARCHAR;
      RETURN;
    END IF;
  END IF;

  -- Check credits requirement
  IF v_feature.requires_credits THEN
    IF COALESCE(v_user.credits_remaining, 0) < v_feature.min_credits_required THEN
      RETURN QUERY SELECT FALSE, 'Insufficient credits', NULL::VARCHAR;
      RETURN;
    END IF;
  END IF;

  -- All checks passed
  RETURN QUERY SELECT TRUE, 'Subscription access', 'subscription'::VARCHAR;
END;
$$ LANGUAGE plpgsql;

-- Grant beta access to user
CREATE OR REPLACE FUNCTION grant_beta_access(
  p_user_id UUID,
  p_feature_name VARCHAR,
  p_granted_by VARCHAR,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_beta_access_id UUID;
BEGIN
  INSERT INTO feature_beta_access (user_id, feature_name, granted_by, expires_at)
  VALUES (p_user_id, p_feature_name, p_granted_by, p_expires_at)
  ON CONFLICT (user_id, feature_name) DO UPDATE
  SET granted_by = p_granted_by, expires_at = p_expires_at, created_at = NOW()
  RETURNING beta_access_id INTO v_beta_access_id;

  RETURN v_beta_access_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Feature usage summary
CREATE OR REPLACE VIEW feature_usage_summary AS
SELECT
  feature_name,
  COUNT(*) as total_uses,
  COUNT(*) FILTER (WHERE blocked = FALSE) as successful_uses,
  COUNT(*) FILTER (WHERE blocked = TRUE) as blocked_attempts,
  COUNT(DISTINCT user_id) as unique_users,
  MIN(used_at) as first_use,
  MAX(used_at) as latest_use,
  SUM(credits_deducted) as total_credits_deducted
FROM feature_usage_analytics
GROUP BY feature_name
ORDER BY total_uses DESC;

-- Top revenue-generating features (pay-per-feature)
CREATE OR REPLACE VIEW top_revenue_features AS
SELECT
  feature_name,
  COUNT(*) as unlock_count,
  SUM(price_paid_cents) as total_revenue_cents,
  SUM(price_paid_cents) / 100.0 as total_revenue_dollars,
  AVG(price_paid_cents) as avg_price_cents,
  MIN(created_at) as first_purchase,
  MAX(created_at) as latest_purchase
FROM feature_access_overrides
WHERE access_type = 'pay_per_feature'
GROUP BY feature_name
ORDER BY total_revenue_cents DESC;

-- Active beta users by feature
CREATE OR REPLACE VIEW beta_users_by_feature AS
SELECT
  fba.feature_name,
  COUNT(*) as beta_user_count,
  ARRAY_AGG(u.email ORDER BY fba.created_at) as beta_user_emails,
  MIN(fba.created_at) as first_beta_user,
  MAX(fba.created_at) as latest_beta_user
FROM feature_beta_access fba
JOIN users u ON u.user_id = fba.user_id
WHERE fba.expires_at IS NULL OR fba.expires_at > NOW()
GROUP BY fba.feature_name
ORDER BY beta_user_count DESC;

-- Feature access denied reasons (for debugging)
CREATE OR REPLACE VIEW feature_access_denials AS
SELECT
  feature_name,
  block_reason,
  COUNT(*) as denial_count,
  COUNT(DISTINCT user_id) as unique_users_blocked,
  MAX(used_at) as latest_denial
FROM feature_usage_analytics
WHERE blocked = TRUE
GROUP BY feature_name, block_reason
ORDER BY denial_count DESC;

-- ============================================================================
-- INITIAL DATA (Core Features)
-- ============================================================================

-- Insert core feature definitions
INSERT INTO feature_definitions (feature_name, display_name, description, category, requires_subscription, min_tier_code, is_beta) VALUES
  -- Messaging
  ('secure_messaging', 'Secure Messaging', 'Path-based encrypted messaging', 'messaging', TRUE, 'pro', FALSE),
  ('telegram_bot', 'Telegram Bot', 'Telegram bot integration', 'messaging', TRUE, 'starter', FALSE),

  -- Payments
  ('apple_pay', 'Apple Pay', 'Apple Pay integration', 'payments', FALSE, NULL, FALSE),
  ('ach_payments', 'ACH Payments', 'Bank transfer payments', 'payments', TRUE, 'pro', FALSE),

  -- Handles
  ('vanity_handles', 'Vanity Handles', '@username handles', 'identity', FALSE, NULL, FALSE),
  ('premium_handles', 'Premium Handles', 'Purchase premium @handles', 'identity', FALSE, NULL, FALSE),

  -- Advanced features
  ('model_council', 'Model Council', 'Multi-model collaborative building', 'ai', TRUE, 'pro', FALSE),
  ('autonomous_mode', 'Autonomous Mode', 'Copilot mode - describe what you want', 'ai', TRUE, 'pro', FALSE),
  ('bucket_system', 'Bucket System', '12-bucket integration with reasoning logs', 'ai', TRUE, 'enterprise', FALSE),

  -- Developer features
  ('api_access', 'API Access', 'Platform API access', 'developer', TRUE, 'starter', FALSE),
  ('byok', 'Bring Your Own Key', 'Use your own AI provider keys', 'developer', TRUE, 'pro', FALSE),
  ('webhooks', 'Webhooks', 'Webhook integrations', 'developer', TRUE, 'pro', FALSE),

  -- Admin features
  ('admin_dashboard', 'Admin Dashboard', 'Platform administration', 'admin', TRUE, NULL, FALSE),
  ('usage_analytics', 'Usage Analytics', 'Detailed usage analytics', 'analytics', TRUE, 'pro', FALSE)
ON CONFLICT (feature_name) DO NOTHING;

-- ============================================================================
-- CLEANUP TASKS
-- ============================================================================

-- Clean expired beta access (run periodically)
-- DELETE FROM feature_beta_access WHERE expires_at < NOW();

-- Clean expired feature overrides
-- DELETE FROM feature_access_overrides WHERE expires_at < NOW();

-- Clean old usage analytics (keep 90 days)
-- DELETE FROM feature_usage_analytics WHERE used_at < NOW() - INTERVAL '90 days';

-- Grant permissions (adjust based on your setup)
-- GRANT ALL ON feature_definitions TO your_app_user;
-- GRANT ALL ON feature_access_overrides TO your_app_user;
-- GRANT ALL ON feature_beta_access TO your_app_user;
-- GRANT ALL ON feature_usage_analytics TO your_app_user;

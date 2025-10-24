-- Migration: Usage Events and Tier Enforcement
-- Track usage for billing and tier limit enforcement

-- Usage Events: Track every API call for billing
CREATE TABLE IF NOT EXISTS usage_events (
  id SERIAL PRIMARY KEY,

  -- Identity
  tenant_id UUID,
  user_id VARCHAR(255),
  session_id VARCHAR(255),
  origin_domain VARCHAR(255),

  -- Request details
  agent_id VARCHAR(100), -- '@gpt4', '@claude', etc.
  provider VARCHAR(50),
  model_name VARCHAR(255),

  -- Token usage
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER GENERATED ALWAYS AS (tokens_input + tokens_output) STORED,

  -- Cost (calculated from model_pricing)
  cost_input_usd DECIMAL(10, 6),
  cost_output_usd DECIMAL(10, 6),
  cost_total_usd DECIMAL(10, 6) GENERATED ALWAYS AS (cost_input_usd + cost_output_usd) STORED,

  -- Key source (from VaultBridge)
  key_source VARCHAR(50), -- 'tenant_byok', 'user_key', 'system_key'

  -- Billing target
  billing_target VARCHAR(50), -- 'tenant', 'user', 'platform'

  -- Performance
  latency_ms INTEGER,
  cache_hit BOOLEAN DEFAULT FALSE,

  -- Result
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_usage_tenant_time (tenant_id, created_at DESC),
  INDEX idx_usage_user_time (user_id, created_at DESC),
  INDEX idx_usage_session (session_id, created_at DESC),
  INDEX idx_usage_domain (origin_domain, created_at DESC),
  INDEX idx_usage_agent (agent_id, created_at DESC),
  INDEX idx_usage_billing (billing_target, created_at DESC),
  INDEX idx_usage_monthly (tenant_id, user_id, date_trunc('month', created_at))
);

COMMENT ON TABLE usage_events IS 'Every API call tracked for billing and analytics';
COMMENT ON COLUMN usage_events.key_source IS 'Which API key was used (BYOK, user, or platform)';
COMMENT ON COLUMN usage_events.billing_target IS 'Who gets billed (tenant, user, or platform)';

-- Platform Tiers: Define tier configurations
CREATE TABLE IF NOT EXISTS platform_tiers (
  tier_id SERIAL PRIMARY KEY,
  tier_code VARCHAR(50) UNIQUE NOT NULL, -- 'oss', 'starter', 'pro', 'enterprise'
  tier_name VARCHAR(100) NOT NULL,

  -- Limits
  tokens_limit INTEGER, -- NULL = unlimited
  domains_limit INTEGER, -- NULL = unlimited
  api_calls_limit INTEGER, -- NULL = unlimited

  -- Pricing
  price_cents INTEGER, -- Monthly price in cents, NULL = custom

  -- Features
  byok_enabled BOOLEAN DEFAULT FALSE,
  support_level VARCHAR(50), -- 'community', 'email', 'priority', 'dedicated'
  billing_type VARCHAR(50), -- NULL, 'monthly', 'custom'

  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed platform tiers
INSERT INTO platform_tiers (tier_code, tier_name, tokens_limit, domains_limit, price_cents, byok_enabled, support_level, billing_type, description)
VALUES
  ('oss', 'Open Source', NULL, NULL, 0, TRUE, 'community', NULL, 'Self-hosted, unlimited, no billing'),
  ('starter', 'Starter', 100000, 1, 4900, FALSE, 'email', 'monthly', 'Perfect for small projects'),
  ('pro', 'Pro', 1000000, 5, 19900, TRUE, 'priority', 'monthly', 'For growing businesses with BYOK'),
  ('enterprise', 'Enterprise', NULL, NULL, NULL, TRUE, 'dedicated', 'custom', 'Custom pricing with SLA')
ON CONFLICT (tier_code) DO NOTHING;

COMMENT ON TABLE platform_tiers IS 'Tier definitions for OSS vs Cloud monetization';

-- Tenant Licenses: Track which tier each tenant has
CREATE TABLE IF NOT EXISTS tenant_licenses (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  tier_id INTEGER REFERENCES platform_tiers(tier_id),

  -- License details
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'expired', 'suspended', 'cancelled'

  -- Billing period
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Stripe integration (for Cloud)
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_tenant_licenses_tenant (tenant_id, status),
  INDEX idx_tenant_licenses_tier (tier_id, status),
  INDEX idx_tenant_licenses_expires (expires_at)
);

COMMENT ON TABLE tenant_licenses IS 'Track which tier/license each tenant has';

-- User Subscriptions: Track individual user subscriptions (for user-level billing)
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  tier_id INTEGER REFERENCES platform_tiers(tier_id),

  -- Subscription details
  status VARCHAR(50) DEFAULT 'active',

  -- Billing period
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  -- Stripe integration
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_user_subs_user (user_id, status),
  INDEX idx_user_subs_tier (tier_id, status)
);

COMMENT ON TABLE user_subscriptions IS 'Individual user subscription tracking';

-- Usage Quotas: Track monthly usage vs limits
CREATE TABLE IF NOT EXISTS usage_quotas (
  id SERIAL PRIMARY KEY,

  -- Identity (either tenant_id OR user_id, not both)
  tenant_id UUID,
  user_id VARCHAR(255),

  -- Month
  year INTEGER NOT NULL,
  month INTEGER NOT NULL, -- 1-12

  -- Usage
  tokens_used INTEGER DEFAULT 0,
  api_calls_used INTEGER DEFAULT 0,
  domains_used INTEGER DEFAULT 0, -- Count of unique domains
  cost_usd DECIMAL(10, 2) DEFAULT 0,

  -- Limits (copied from tier)
  tokens_limit INTEGER,
  api_calls_limit INTEGER,
  domains_limit INTEGER,

  -- Overage
  tokens_overage INTEGER GENERATED ALWAYS AS (GREATEST(0, tokens_used - COALESCE(tokens_limit, 0))) STORED,
  overage_cost_cents INTEGER DEFAULT 0,

  -- Timestamps
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE (tenant_id, year, month),
  UNIQUE (user_id, year, month),
  CHECK ((tenant_id IS NOT NULL) != (user_id IS NOT NULL)), -- XOR: one or the other

  -- Indexes
  INDEX idx_quotas_tenant (tenant_id, year DESC, month DESC),
  INDEX idx_quotas_user (user_id, year DESC, month DESC),
  INDEX idx_quotas_month (year, month)
);

COMMENT ON TABLE usage_quotas IS 'Monthly usage aggregates for tier enforcement';

-- Function: Update usage quota on new event
CREATE OR REPLACE FUNCTION update_usage_quota()
RETURNS TRIGGER AS $$
BEGIN
  -- Update tenant quota
  IF NEW.tenant_id IS NOT NULL THEN
    INSERT INTO usage_quotas (tenant_id, year, month, tokens_used, api_calls_used)
    VALUES (
      NEW.tenant_id,
      EXTRACT(YEAR FROM NEW.created_at),
      EXTRACT(MONTH FROM NEW.created_at),
      NEW.tokens_total,
      1
    )
    ON CONFLICT (tenant_id, year, month)
    DO UPDATE SET
      tokens_used = usage_quotas.tokens_used + NEW.tokens_total,
      api_calls_used = usage_quotas.api_calls_used + 1,
      updated_at = NOW();
  END IF;

  -- Update user quota
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO usage_quotas (user_id, year, month, tokens_used, api_calls_used)
    VALUES (
      NEW.user_id,
      EXTRACT(YEAR FROM NEW.created_at),
      EXTRACT(MONTH FROM NEW.created_at),
      NEW.tokens_total,
      1
    )
    ON CONFLICT (user_id, year, month)
    DO UPDATE SET
      tokens_used = usage_quotas.tokens_used + NEW.tokens_total,
      api_calls_used = usage_quotas.api_calls_used + 1,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update quotas on usage events
DROP TRIGGER IF EXISTS trigger_update_usage_quota ON usage_events;
CREATE TRIGGER trigger_update_usage_quota
  AFTER INSERT ON usage_events
  FOR EACH ROW
  EXECUTE FUNCTION update_usage_quota();

COMMENT ON FUNCTION update_usage_quota IS 'Auto-updates monthly usage quotas when new events are logged';

-- Function: Calculate overage charges
CREATE OR REPLACE FUNCTION calculate_overage(
  p_tenant_id UUID DEFAULT NULL,
  p_user_id VARCHAR DEFAULT NULL,
  p_year INTEGER DEFAULT NULL,
  p_month INTEGER DEFAULT NULL
)
RETURNS TABLE (
  tokens_over INTEGER,
  overage_cost_cents INTEGER,
  overage_cost_dollars DECIMAL(10, 2)
) AS $$
DECLARE
  v_year INTEGER;
  v_month INTEGER;
BEGIN
  -- Default to current month if not specified
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE));
  v_month := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE));

  RETURN QUERY
  SELECT
    uq.tokens_overage,
    (uq.tokens_overage / 1000)::INTEGER AS overage_cost_cents, -- $0.01 per 1K tokens
    ((uq.tokens_overage / 1000)::INTEGER / 100.0)::DECIMAL(10, 2) AS overage_cost_dollars
  FROM usage_quotas uq
  WHERE (uq.tenant_id = p_tenant_id OR uq.user_id = p_user_id)
    AND uq.year = v_year
    AND uq.month = v_month
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_overage IS 'Calculate overage charges at $0.01 per 1K tokens';

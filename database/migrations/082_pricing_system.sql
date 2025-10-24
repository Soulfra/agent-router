-- Migration 082: CALOS Pricing & Licensing System
-- Complete pricing implementation for CALOS Business OS
--
-- Purpose:
-- - Implement usage-based pricing (transcripts, POS, crypto, locations, API)
-- - Track subscription tiers (Free, Community, Pro, Enterprise, Self-Hosted)
-- - Meter usage in real-time
-- - Calculate exact billing amounts
-- - Support Stripe integration
--
-- Model: Stripe/AWS/Vercel style usage-based pricing

-- ============================================================================
-- LICENSE TIERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS license_tiers (
  tier_id SERIAL PRIMARY KEY,

  -- Tier info
  tier_slug VARCHAR(50) NOT NULL UNIQUE, -- 'development', 'community', 'pro', 'enterprise', 'self_hosted'
  tier_name VARCHAR(100) NOT NULL,       -- 'Development', 'Community', 'Pro', 'Enterprise', 'Self-Hosted'

  -- Base pricing
  base_cost_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0,  -- $0, $29, $99
  base_cost_annual DECIMAL(10, 2) NOT NULL DEFAULT 0,   -- $0, $312, $1068 (10% discount)

  -- Verification interval
  verification_interval_hours INTEGER NOT NULL DEFAULT 0, -- 0 (dev), 24 (community), 168 (pro/7d), 720 (enterprise/30d)

  -- Usage limits (NULL = unlimited)
  limit_transcripts INTEGER,              -- 5 (community), NULL (pro+)
  limit_pos_transactions INTEGER,         -- 100 (community), NULL (pro+)
  limit_crypto_charges INTEGER,           -- 0 (community), NULL (pro+)
  limit_locations INTEGER,                -- 1 (community), 5 (pro), NULL (enterprise)
  limit_api_requests INTEGER,             -- 100 (community), 10000 (pro), NULL (enterprise)

  -- Features (JSON)
  features JSONB DEFAULT '{}', -- { "whiteLabel": true, "multiDomain": false, "apiAccess": true, "prioritySupport": true, "quickbooksSync": true, "sla": true, "airGapped": true }

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default tiers
INSERT INTO license_tiers (tier_slug, tier_name, base_cost_monthly, base_cost_annual, verification_interval_hours, limit_transcripts, limit_pos_transactions, limit_crypto_charges, limit_locations, limit_api_requests, features) VALUES
  ('development', 'Development', 0, 0, 0, NULL, NULL, NULL, NULL, NULL, '{"whiteLabel": false, "multiDomain": false, "apiAccess": false, "prioritySupport": false, "quickbooksSync": false}'),
  ('community', 'Community', 0, 0, 24, 5, 100, 0, 1, 100, '{"whiteLabel": false, "multiDomain": false, "apiAccess": false, "prioritySupport": false, "quickbooksSync": false}'),
  ('pro', 'Pro', 29, 312, 168, NULL, NULL, NULL, 5, 10000, '{"whiteLabel": true, "multiDomain": false, "apiAccess": false, "prioritySupport": true, "quickbooksSync": true}'),
  ('enterprise', 'Enterprise', 99, 1068, 720, NULL, NULL, NULL, NULL, NULL, '{"whiteLabel": true, "multiDomain": true, "apiAccess": true, "prioritySupport": true, "quickbooksSync": true, "sla": true, "airGapped": true}'),
  ('self_hosted', 'Self-Hosted', 0, 0, 0, NULL, NULL, NULL, NULL, NULL, '{"whiteLabel": true, "multiDomain": true, "apiAccess": true, "prioritySupport": false, "quickbooksSync": true, "fullSourceCode": true}')
ON CONFLICT (tier_slug) DO NOTHING;

COMMENT ON TABLE license_tiers IS 'CALOS pricing tiers with limits and features';

-- ============================================================================
-- USAGE PRICING (Transaction Fees)
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_pricing (
  pricing_id SERIAL PRIMARY KEY,

  -- Usage type
  usage_type VARCHAR(50) NOT NULL UNIQUE, -- 'transcript', 'pos_in_person', 'pos_online', 'crypto', 'location', 'api_request'

  -- Pricing model
  pricing_model VARCHAR(50) NOT NULL, -- 'per_unit', 'percentage', 'percentage_plus_fixed'

  -- Pricing amounts
  cost_per_unit DECIMAL(10, 4),           -- $0.05 (transcripts), $0.001 (API requests)
  cost_percentage DECIMAL(10, 6),         -- 0.026 (2.6% POS), 0.029 (2.9% online), 0.015 (1.5% crypto)
  cost_fixed DECIMAL(10, 4),              -- $0.10 (POS fixed), $0.30 (online fixed)

  -- Additional location cost
  cost_monthly DECIMAL(10, 2),            -- $10/month (additional locations)

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default usage pricing
INSERT INTO usage_pricing (usage_type, pricing_model, cost_per_unit, cost_percentage, cost_fixed, cost_monthly) VALUES
  ('transcript', 'per_unit', 0.05, NULL, NULL, NULL),
  ('pos_in_person', 'percentage_plus_fixed', NULL, 0.026, 0.10, NULL),
  ('pos_online', 'percentage_plus_fixed', NULL, 0.029, 0.30, NULL),
  ('crypto', 'percentage', NULL, 0.015, NULL, NULL),
  ('location', 'per_unit', 10, NULL, NULL, 10),
  ('api_request', 'per_unit', 0.001, NULL, NULL, NULL)
ON CONFLICT (usage_type) DO NOTHING;

COMMENT ON TABLE usage_pricing IS 'Usage-based pricing for CALOS Business OS';

-- ============================================================================
-- SUBSCRIPTION PLANS (User Subscriptions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  subscription_id SERIAL PRIMARY KEY,

  -- User
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  install_id VARCHAR(32) NOT NULL, -- From license-verifier.js

  -- Tier
  tier_id INTEGER REFERENCES license_tiers(tier_id),
  tier_slug VARCHAR(50) NOT NULL,

  -- Billing period
  billing_period VARCHAR(20) NOT NULL DEFAULT 'monthly', -- 'monthly', 'annual'

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'canceled', 'suspended', 'trial', 'past_due'

  -- Trial
  trial_ends_at TIMESTAMP,

  -- Billing dates
  current_period_start TIMESTAMP DEFAULT NOW(),
  current_period_end TIMESTAMP,

  -- Stripe
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  stripe_payment_method_id VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  canceled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_user_id ON subscription_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_install_id ON subscription_plans(install_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_tier_slug ON subscription_plans(tier_slug);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_status ON subscription_plans(status);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_customer ON subscription_plans(stripe_customer_id);

COMMENT ON TABLE subscription_plans IS 'User subscriptions to CALOS tiers';

-- ============================================================================
-- USAGE TRACKING (Real-Time Metering)
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_tracking (
  usage_id SERIAL PRIMARY KEY,

  -- User
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  install_id VARCHAR(32) NOT NULL,

  -- Usage type
  usage_type VARCHAR(50) NOT NULL, -- 'transcript', 'pos_in_person', 'pos_online', 'crypto', 'location', 'api_request'

  -- Usage amount
  usage_count INTEGER DEFAULT 1,              -- Number of units (transcripts, transactions, API requests)
  usage_amount DECIMAL(10, 2),                -- Dollar amount (for POS/crypto transactions)

  -- Billing
  billable BOOLEAN DEFAULT TRUE,              -- False if within free tier
  cost_calculated DECIMAL(10, 4),             -- Calculated cost for this usage event

  -- Metadata
  metadata JSONB DEFAULT '{}', -- { "transactionId": "...", "endpoint": "/api/chat", "domain": "calos.sh" }

  -- Billing period
  billing_period_start TIMESTAMP,
  billing_period_end TIMESTAMP,

  -- Timestamp
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_id ON usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_install_id ON usage_tracking(install_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_usage_type ON usage_tracking(usage_type);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_created_at ON usage_tracking(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_billing_period ON usage_tracking(billing_period_start, billing_period_end);

COMMENT ON TABLE usage_tracking IS 'Real-time usage metering for billing';

-- ============================================================================
-- USAGE AGGREGATES (Daily Rollups)
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_aggregates (
  aggregate_id SERIAL PRIMARY KEY,

  -- User
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  install_id VARCHAR(32) NOT NULL,

  -- Date
  date DATE NOT NULL,

  -- Usage counts
  transcripts INTEGER DEFAULT 0,
  pos_in_person_count INTEGER DEFAULT 0,
  pos_in_person_amount DECIMAL(10, 2) DEFAULT 0,
  pos_online_count INTEGER DEFAULT 0,
  pos_online_amount DECIMAL(10, 2) DEFAULT 0,
  crypto_count INTEGER DEFAULT 0,
  crypto_amount DECIMAL(10, 2) DEFAULT 0,
  locations INTEGER DEFAULT 0,
  api_requests INTEGER DEFAULT 0,

  -- Billing
  total_cost DECIMAL(10, 2) DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(user_id, install_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_aggregates_user_id ON usage_aggregates(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_aggregates_install_id ON usage_aggregates(install_id);
CREATE INDEX IF NOT EXISTS idx_usage_aggregates_date ON usage_aggregates(date DESC);

COMMENT ON TABLE usage_aggregates IS 'Daily usage rollups for billing';

-- ============================================================================
-- PRICING CALCULATOR SESSIONS (Analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pricing_calculator_sessions (
  session_id SERIAL PRIMARY KEY,

  -- User (optional, may be anonymous)
  user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,

  -- Input data (JSON)
  input_data JSONB NOT NULL, -- { "transcripts": 50, "posTransactions": 500, "cryptoCharges": 10, "locations": 3, "apiRequests": 10000 }

  -- Output data (JSON)
  output_data JSONB NOT NULL, -- { "tier": "pro", "total": 744, "savings": { "vsSquare": 48.75, "vsShopify": 29 } }

  -- Session metadata
  ip_address VARCHAR(45),     -- IPv4 or IPv6
  user_agent TEXT,
  referrer TEXT,

  -- Timestamp
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_calculator_sessions_user_id ON pricing_calculator_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pricing_calculator_sessions_created_at ON pricing_calculator_sessions(created_at DESC);

COMMENT ON TABLE pricing_calculator_sessions IS 'Track pricing calculator usage for analytics';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

/**
 * Get current usage for billing period
 */
CREATE OR REPLACE FUNCTION get_current_usage(
  p_user_id INTEGER,
  p_install_id VARCHAR(32),
  p_period_start TIMESTAMP,
  p_period_end TIMESTAMP
)
RETURNS TABLE (
  usage_type VARCHAR(50),
  usage_count BIGINT,
  usage_amount NUMERIC,
  total_cost NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ut.usage_type,
    SUM(ut.usage_count) as usage_count,
    SUM(ut.usage_amount) as usage_amount,
    SUM(ut.cost_calculated) as total_cost
  FROM usage_tracking ut
  WHERE ut.user_id = p_user_id
    AND ut.install_id = p_install_id
    AND ut.created_at >= p_period_start
    AND ut.created_at < p_period_end
    AND ut.billable = TRUE
  GROUP BY ut.usage_type
  ORDER BY ut.usage_type;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_current_usage IS 'Get usage summary for billing period';

/**
 * Check if usage exceeds tier limits
 */
CREATE OR REPLACE FUNCTION check_usage_limits(
  p_user_id INTEGER,
  p_install_id VARCHAR(32),
  p_tier_slug VARCHAR(50)
)
RETURNS TABLE (
  usage_type VARCHAR(50),
  current_usage BIGINT,
  limit_value INTEGER,
  over_limit BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH current_period AS (
    SELECT
      sp.current_period_start,
      sp.current_period_end
    FROM subscription_plans sp
    WHERE sp.user_id = p_user_id
      AND sp.install_id = p_install_id
    LIMIT 1
  ),
  usage_summary AS (
    SELECT
      ut.usage_type,
      SUM(ut.usage_count) as total_usage
    FROM usage_tracking ut
    CROSS JOIN current_period
    WHERE ut.user_id = p_user_id
      AND ut.install_id = p_install_id
      AND ut.created_at >= current_period.current_period_start
      AND ut.created_at < current_period.current_period_end
    GROUP BY ut.usage_type
  )
  SELECT
    COALESCE(us.usage_type, 'transcripts') as usage_type,
    COALESCE(us.total_usage, 0) as current_usage,
    CASE
      WHEN us.usage_type = 'transcript' THEN lt.limit_transcripts
      WHEN us.usage_type = 'pos_in_person' OR us.usage_type = 'pos_online' THEN lt.limit_pos_transactions
      WHEN us.usage_type = 'crypto' THEN lt.limit_crypto_charges
      WHEN us.usage_type = 'location' THEN lt.limit_locations
      WHEN us.usage_type = 'api_request' THEN lt.limit_api_requests
    END as limit_value,
    CASE
      WHEN lt.limit_transcripts IS NULL THEN FALSE -- Unlimited
      WHEN us.usage_type = 'transcript' THEN COALESCE(us.total_usage, 0) > lt.limit_transcripts
      WHEN us.usage_type = 'pos_in_person' OR us.usage_type = 'pos_online' THEN COALESCE(us.total_usage, 0) > lt.limit_pos_transactions
      WHEN us.usage_type = 'crypto' THEN COALESCE(us.total_usage, 0) > lt.limit_crypto_charges
      WHEN us.usage_type = 'location' THEN COALESCE(us.total_usage, 0) > lt.limit_locations
      WHEN us.usage_type = 'api_request' THEN COALESCE(us.total_usage, 0) > lt.limit_api_requests
      ELSE FALSE
    END as over_limit
  FROM license_tiers lt
  LEFT JOIN usage_summary us ON TRUE
  WHERE lt.tier_slug = p_tier_slug;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_usage_limits IS 'Check if user has exceeded tier limits';

/**
 * Calculate billing amount for period
 */
CREATE OR REPLACE FUNCTION calculate_billing(
  p_user_id INTEGER,
  p_install_id VARCHAR(32),
  p_period_start TIMESTAMP,
  p_period_end TIMESTAMP
)
RETURNS TABLE (
  subscription_cost NUMERIC,
  usage_costs JSONB,
  total_cost NUMERIC
) AS $$
DECLARE
  v_tier_slug VARCHAR(50);
  v_base_cost NUMERIC;
  v_total_usage_cost NUMERIC := 0;
  v_usage_costs JSONB := '{}';
BEGIN
  -- Get tier and base cost
  SELECT
    sp.tier_slug,
    CASE
      WHEN sp.billing_period = 'annual' THEN lt.base_cost_annual / 12 -- Prorate annual to monthly
      ELSE lt.base_cost_monthly
    END
  INTO v_tier_slug, v_base_cost
  FROM subscription_plans sp
  JOIN license_tiers lt ON sp.tier_slug = lt.tier_slug
  WHERE sp.user_id = p_user_id
    AND sp.install_id = p_install_id
  LIMIT 1;

  -- Calculate usage costs
  SELECT
    SUM(ut.cost_calculated),
    jsonb_object_agg(ut.usage_type, SUM(ut.cost_calculated))
  INTO v_total_usage_cost, v_usage_costs
  FROM usage_tracking ut
  WHERE ut.user_id = p_user_id
    AND ut.install_id = p_install_id
    AND ut.created_at >= p_period_start
    AND ut.created_at < p_period_end
    AND ut.billable = TRUE;

  RETURN QUERY SELECT
    v_base_cost as subscription_cost,
    COALESCE(v_usage_costs, '{}') as usage_costs,
    COALESCE(v_base_cost, 0) + COALESCE(v_total_usage_cost, 0) as total_cost;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_billing IS 'Calculate total billing for period';

/**
 * Track usage event (called by usage-tracking-middleware.js)
 */
CREATE OR REPLACE FUNCTION track_usage_event(
  p_user_id INTEGER,
  p_install_id VARCHAR(32),
  p_usage_type VARCHAR(50),
  p_usage_count INTEGER DEFAULT 1,
  p_usage_amount NUMERIC DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS INTEGER AS $$
DECLARE
  v_usage_id INTEGER;
  v_tier_slug VARCHAR(50);
  v_limit INTEGER;
  v_current_usage BIGINT;
  v_billable BOOLEAN := TRUE;
  v_cost NUMERIC := 0;
  v_period_start TIMESTAMP;
  v_period_end TIMESTAMP;
BEGIN
  -- Get user's tier and current billing period
  SELECT
    sp.tier_slug,
    sp.current_period_start,
    sp.current_period_end
  INTO v_tier_slug, v_period_start, v_period_end
  FROM subscription_plans sp
  WHERE sp.user_id = p_user_id
    AND sp.install_id = p_install_id
  LIMIT 1;

  -- Get usage limit for this tier
  SELECT
    CASE
      WHEN p_usage_type = 'transcript' THEN lt.limit_transcripts
      WHEN p_usage_type IN ('pos_in_person', 'pos_online') THEN lt.limit_pos_transactions
      WHEN p_usage_type = 'crypto' THEN lt.limit_crypto_charges
      WHEN p_usage_type = 'location' THEN lt.limit_locations
      WHEN p_usage_type = 'api_request' THEN lt.limit_api_requests
    END
  INTO v_limit
  FROM license_tiers lt
  WHERE lt.tier_slug = v_tier_slug;

  -- Get current usage for this period
  SELECT
    COALESCE(SUM(ut.usage_count), 0)
  INTO v_current_usage
  FROM usage_tracking ut
  WHERE ut.user_id = p_user_id
    AND ut.install_id = p_install_id
    AND ut.usage_type = p_usage_type
    AND ut.created_at >= v_period_start
    AND ut.created_at < v_period_end;

  -- Check if billable (within free tier or not)
  IF v_limit IS NOT NULL AND v_current_usage < v_limit THEN
    v_billable := FALSE; -- Still within free tier
  END IF;

  -- Calculate cost if billable
  IF v_billable THEN
    SELECT
      CASE
        WHEN up.pricing_model = 'per_unit' THEN p_usage_count * up.cost_per_unit
        WHEN up.pricing_model = 'percentage' THEN p_usage_amount * up.cost_percentage
        WHEN up.pricing_model = 'percentage_plus_fixed' THEN
          (p_usage_amount * up.cost_percentage) + (p_usage_count * up.cost_fixed)
        ELSE 0
      END
    INTO v_cost
    FROM usage_pricing up
    WHERE up.usage_type = p_usage_type;
  END IF;

  -- Insert usage event
  INSERT INTO usage_tracking (
    user_id,
    install_id,
    usage_type,
    usage_count,
    usage_amount,
    billable,
    cost_calculated,
    metadata,
    billing_period_start,
    billing_period_end
  ) VALUES (
    p_user_id,
    p_install_id,
    p_usage_type,
    p_usage_count,
    p_usage_amount,
    v_billable,
    v_cost,
    p_metadata,
    v_period_start,
    v_period_end
  ) RETURNING usage_id INTO v_usage_id;

  -- Update daily aggregate
  INSERT INTO usage_aggregates (
    user_id,
    install_id,
    date,
    transcripts,
    pos_in_person_count,
    pos_in_person_amount,
    pos_online_count,
    pos_online_amount,
    crypto_count,
    crypto_amount,
    locations,
    api_requests,
    total_cost
  ) VALUES (
    p_user_id,
    p_install_id,
    CURRENT_DATE,
    CASE WHEN p_usage_type = 'transcript' THEN p_usage_count ELSE 0 END,
    CASE WHEN p_usage_type = 'pos_in_person' THEN p_usage_count ELSE 0 END,
    CASE WHEN p_usage_type = 'pos_in_person' THEN p_usage_amount ELSE 0 END,
    CASE WHEN p_usage_type = 'pos_online' THEN p_usage_count ELSE 0 END,
    CASE WHEN p_usage_type = 'pos_online' THEN p_usage_amount ELSE 0 END,
    CASE WHEN p_usage_type = 'crypto' THEN p_usage_count ELSE 0 END,
    CASE WHEN p_usage_type = 'crypto' THEN p_usage_amount ELSE 0 END,
    CASE WHEN p_usage_type = 'location' THEN p_usage_count ELSE 0 END,
    CASE WHEN p_usage_type = 'api_request' THEN p_usage_count ELSE 0 END,
    v_cost
  )
  ON CONFLICT (user_id, install_id, date) DO UPDATE SET
    transcripts = usage_aggregates.transcripts + EXCLUDED.transcripts,
    pos_in_person_count = usage_aggregates.pos_in_person_count + EXCLUDED.pos_in_person_count,
    pos_in_person_amount = usage_aggregates.pos_in_person_amount + EXCLUDED.pos_in_person_amount,
    pos_online_count = usage_aggregates.pos_online_count + EXCLUDED.pos_online_count,
    pos_online_amount = usage_aggregates.pos_online_amount + EXCLUDED.pos_online_amount,
    crypto_count = usage_aggregates.crypto_count + EXCLUDED.crypto_count,
    crypto_amount = usage_aggregates.crypto_amount + EXCLUDED.crypto_amount,
    locations = usage_aggregates.locations + EXCLUDED.locations,
    api_requests = usage_aggregates.api_requests + EXCLUDED.api_requests,
    total_cost = usage_aggregates.total_cost + EXCLUDED.total_cost,
    updated_at = NOW();

  RETURN v_usage_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION track_usage_event IS 'Track single usage event and update aggregates';

-- ============================================================================
-- CLEANUP / RETENTION
-- ============================================================================

/**
 * Cleanup old usage tracking data (keep last 90 days)
 */
CREATE OR REPLACE FUNCTION cleanup_usage_data(
  p_days INTEGER DEFAULT 90
)
RETURNS TABLE (
  usage_deleted BIGINT,
  sessions_deleted BIGINT
) AS $$
DECLARE
  v_usage_deleted BIGINT;
  v_sessions_deleted BIGINT;
BEGIN
  -- Delete old usage tracking (keep aggregates forever)
  DELETE FROM usage_tracking
  WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_usage_deleted = ROW_COUNT;

  -- Delete old calculator sessions
  DELETE FROM pricing_calculator_sessions
  WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_sessions_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_usage_deleted, v_sessions_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_usage_data IS 'Cleanup old usage data (default: 90 days)';

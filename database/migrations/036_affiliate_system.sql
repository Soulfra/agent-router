/**
 * Migration 032: Affiliate Tracking System
 *
 * Enables:
 * - Partner affiliate programs (Google, Adobe, WordPress, etc.)
 * - Referral code tracking
 * - Commission calculations and payouts
 * - Revenue sharing
 * - Attribution tracking
 */

-- ============================================================================
-- AFFILIATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS affiliates (
  affiliate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Affiliate identification
  affiliate_code VARCHAR(50) NOT NULL UNIQUE, -- GOOGLE-PARTNER, ADOBE-RESELLER, etc.
  affiliate_name VARCHAR(200) NOT NULL,
  affiliate_type VARCHAR(50) NOT NULL, -- 'partner', 'influencer', 'reseller', 'agency'

  -- Contact information
  contact_email VARCHAR(255) NOT NULL,
  contact_name VARCHAR(200),
  company_name VARCHAR(200),
  website VARCHAR(500),

  -- Commission structure
  commission_rate DECIMAL(5, 4) DEFAULT 0.20, -- 20% commission
  commission_type VARCHAR(50) DEFAULT 'percentage', -- 'percentage', 'fixed', 'tiered'

  -- Tiered commissions (JSONB)
  -- Example: [{"threshold": 1000, "rate": 0.20}, {"threshold": 5000, "rate": 0.25}]
  tier_structure JSONB DEFAULT '[]',

  -- Payout settings
  payout_method VARCHAR(50) DEFAULT 'ach', -- 'ach', 'stripe', 'paypal', 'wire'
  payout_schedule VARCHAR(50) DEFAULT 'monthly', -- 'weekly', 'monthly', 'quarterly'
  minimum_payout_cents INTEGER DEFAULT 10000, -- $100 minimum payout

  -- Bank account for ACH payouts
  bank_account_id VARCHAR(255), -- Stripe bank account ID
  bank_account_last4 VARCHAR(4),

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'pending', 'suspended', 'terminated'
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(user_id),

  -- Tracking
  cookie_duration_days INTEGER DEFAULT 30, -- Attribution window

  -- Statistics (updated periodically)
  total_referrals INTEGER DEFAULT 0,
  total_revenue_cents BIGINT DEFAULT 0,
  total_commission_cents BIGINT DEFAULT 0,
  total_commission_paid_cents BIGINT DEFAULT 0,

  -- Metadata
  terms_accepted_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_affiliates_code ON affiliates(affiliate_code);
CREATE INDEX idx_affiliates_status ON affiliates(status);
CREATE INDEX idx_affiliates_type ON affiliates(affiliate_type);

-- ============================================================================
-- AFFILIATE REFERRALS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS affiliate_referrals (
  referral_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which affiliate referred this
  affiliate_id UUID NOT NULL REFERENCES affiliates(affiliate_id),

  -- Who was referred
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  user_id UUID REFERENCES users(user_id),

  -- Referral tracking
  referral_code VARCHAR(100), -- Specific campaign code (GOOGLE-PROMO-2024)
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  landing_page VARCHAR(500),

  -- Attribution
  first_touch_at TIMESTAMPTZ DEFAULT NOW(),
  converted_at TIMESTAMPTZ, -- When they made first purchase

  -- Revenue tracking
  lifetime_revenue_cents BIGINT DEFAULT 0,
  lifetime_commission_cents BIGINT DEFAULT 0,

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'converted', 'active', 'churned'

  -- Metadata
  ip_address INET,
  user_agent TEXT,
  referrer VARCHAR(500),
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_referrals_affiliate ON affiliate_referrals(affiliate_id);
CREATE INDEX idx_referrals_tenant ON affiliate_referrals(tenant_id);
CREATE INDEX idx_referrals_status ON affiliate_referrals(status);
CREATE INDEX idx_referrals_created ON affiliate_referrals(created_at);

-- ============================================================================
-- AFFILIATE COMMISSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  commission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which affiliate earned this
  affiliate_id UUID NOT NULL REFERENCES affiliates(affiliate_id),
  referral_id UUID NOT NULL REFERENCES affiliate_referrals(referral_id),

  -- Transaction that triggered commission
  transaction_type VARCHAR(50) NOT NULL, -- 'subscription', 'credit_purchase', 'upgrade'
  transaction_id VARCHAR(255), -- Reference to payment
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),

  -- Commission calculation
  revenue_cents INTEGER NOT NULL, -- Amount customer paid
  commission_rate DECIMAL(5, 4) NOT NULL, -- Rate used for this commission
  commission_cents INTEGER NOT NULL, -- Amount affiliate earns

  -- Payout tracking
  payout_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'paid', 'cancelled'
  payout_id UUID, -- Reference to payout batch
  paid_at TIMESTAMPTZ,

  -- Dates
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_commissions_affiliate ON affiliate_commissions(affiliate_id);
CREATE INDEX idx_commissions_referral ON affiliate_commissions(referral_id);
CREATE INDEX idx_commissions_payout_status ON affiliate_commissions(payout_status);
CREATE INDEX idx_commissions_earned ON affiliate_commissions(earned_at);

-- ============================================================================
-- AFFILIATE PAYOUTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS affiliate_payouts (
  payout_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which affiliate is being paid
  affiliate_id UUID NOT NULL REFERENCES affiliates(affiliate_id),

  -- Payout amount
  total_commission_cents INTEGER NOT NULL,
  fees_cents INTEGER DEFAULT 0, -- Transaction fees
  net_payout_cents INTEGER NOT NULL, -- Amount actually transferred

  -- Payout method details
  payout_method VARCHAR(50) NOT NULL, -- 'ach', 'stripe', 'paypal', 'wire'
  payout_reference VARCHAR(255), -- Stripe transfer ID, PayPal transaction ID, etc.

  -- Period covered
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'

  -- Dates
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,

  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_payouts_affiliate ON affiliate_payouts(affiliate_id);
CREATE INDEX idx_payouts_status ON affiliate_payouts(status);
CREATE INDEX idx_payouts_period ON affiliate_payouts(period_start, period_end);

-- ============================================================================
-- AFFILIATE VOUCHERS (Link affiliates to voucher campaigns)
-- ============================================================================

-- Add affiliate tracking columns to existing vouchers table
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES affiliates(affiliate_id);
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS affiliate_bonus_cents INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_vouchers_affiliate ON vouchers(affiliate_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

/**
 * Track affiliate referral
 * Usage: SELECT track_affiliate_referral('GOOGLE-PARTNER', 'tenant-uuid', 'user-uuid', '{"utm_source": "google"}');
 */
CREATE OR REPLACE FUNCTION track_affiliate_referral(
  affiliate_code_param VARCHAR(100),
  tenant_uuid UUID,
  user_uuid UUID DEFAULT NULL,
  tracking_data JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  affiliate_record RECORD;
  referral_uuid UUID;
BEGIN
  -- Get affiliate
  SELECT * INTO affiliate_record
  FROM affiliates
  WHERE affiliate_code = affiliate_code_param AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Affiliate code not found or inactive: %', affiliate_code_param;
  END IF;

  -- Check if referral already exists
  SELECT referral_id INTO referral_uuid
  FROM affiliate_referrals
  WHERE affiliate_id = affiliate_record.affiliate_id AND tenant_id = tenant_uuid;

  IF FOUND THEN
    -- Update existing referral
    UPDATE affiliate_referrals
    SET updated_at = NOW(),
        metadata = metadata || tracking_data
    WHERE referral_id = referral_uuid;

    RETURN referral_uuid;
  END IF;

  -- Create new referral
  INSERT INTO affiliate_referrals (
    affiliate_id,
    tenant_id,
    user_id,
    utm_source,
    utm_medium,
    utm_campaign,
    referral_code,
    ip_address,
    user_agent,
    metadata
  )
  VALUES (
    affiliate_record.affiliate_id,
    tenant_uuid,
    user_uuid,
    tracking_data->>'utm_source',
    tracking_data->>'utm_medium',
    tracking_data->>'utm_campaign',
    tracking_data->>'referral_code',
    (tracking_data->>'ip_address')::INET,
    tracking_data->>'user_agent',
    tracking_data
  )
  RETURNING referral_id INTO referral_uuid;

  -- Update affiliate stats
  UPDATE affiliates
  SET total_referrals = total_referrals + 1,
      updated_at = NOW()
  WHERE affiliate_id = affiliate_record.affiliate_id;

  RETURN referral_uuid;
END;
$$ LANGUAGE plpgsql;

/**
 * Record affiliate commission
 * Usage: SELECT record_affiliate_commission('tenant-uuid', 5000, 'subscription', 'sub_xxx');
 */
CREATE OR REPLACE FUNCTION record_affiliate_commission(
  tenant_uuid UUID,
  revenue_cents_param INTEGER,
  transaction_type_param VARCHAR(50),
  transaction_id_param VARCHAR(255) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  referral_record RECORD;
  affiliate_record RECORD;
  commission_cents_calc INTEGER;
  commission_uuid UUID;
BEGIN
  -- Get referral for this tenant
  SELECT * INTO referral_record
  FROM affiliate_referrals
  WHERE tenant_id = tenant_uuid
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'No affiliate referral found');
  END IF;

  -- Get affiliate details
  SELECT * INTO affiliate_record
  FROM affiliates
  WHERE affiliate_id = referral_record.affiliate_id;

  -- Calculate commission
  commission_cents_calc := FLOOR(revenue_cents_param * affiliate_record.commission_rate);

  -- Record commission
  INSERT INTO affiliate_commissions (
    affiliate_id,
    referral_id,
    transaction_type,
    transaction_id,
    tenant_id,
    revenue_cents,
    commission_rate,
    commission_cents
  )
  VALUES (
    affiliate_record.affiliate_id,
    referral_record.referral_id,
    transaction_type_param,
    transaction_id_param,
    tenant_uuid,
    revenue_cents_param,
    affiliate_record.commission_rate,
    commission_cents_calc
  )
  RETURNING commission_id INTO commission_uuid;

  -- Update referral stats
  UPDATE affiliate_referrals
  SET lifetime_revenue_cents = lifetime_revenue_cents + revenue_cents_param,
      lifetime_commission_cents = lifetime_commission_cents + commission_cents_calc,
      status = 'converted',
      converted_at = COALESCE(converted_at, NOW()),
      updated_at = NOW()
  WHERE referral_id = referral_record.referral_id;

  -- Update affiliate stats
  UPDATE affiliates
  SET total_revenue_cents = total_revenue_cents + revenue_cents_param,
      total_commission_cents = total_commission_cents + commission_cents_calc,
      updated_at = NOW()
  WHERE affiliate_id = affiliate_record.affiliate_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'commission_id', commission_uuid,
    'commission_cents', commission_cents_calc,
    'commission_dollars', ROUND(commission_cents_calc::NUMERIC / 100, 2)
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Affiliate performance dashboard
CREATE OR REPLACE VIEW affiliate_performance AS
SELECT
  a.affiliate_id,
  a.affiliate_code,
  a.affiliate_name,
  a.affiliate_type,
  a.commission_rate,
  a.status,
  a.total_referrals,
  ROUND(a.total_revenue_cents::NUMERIC / 100, 2) AS total_revenue_dollars,
  ROUND(a.total_commission_cents::NUMERIC / 100, 2) AS total_commission_dollars,
  ROUND(a.total_commission_paid_cents::NUMERIC / 100, 2) AS total_paid_dollars,
  ROUND((a.total_commission_cents - a.total_commission_paid_cents)::NUMERIC / 100, 2) AS pending_payout_dollars,
  (SELECT COUNT(*) FROM affiliate_referrals WHERE affiliate_id = a.affiliate_id AND status = 'converted') AS converted_referrals,
  CASE
    WHEN a.total_referrals > 0 THEN
      ROUND((SELECT COUNT(*) FROM affiliate_referrals WHERE affiliate_id = a.affiliate_id AND status = 'converted')::NUMERIC / a.total_referrals * 100, 2)
    ELSE 0
  END AS conversion_rate_percent,
  a.created_at
FROM affiliates a
ORDER BY a.total_revenue_cents DESC;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE affiliates IS 'Affiliate partners and their commission structure';
COMMENT ON TABLE affiliate_referrals IS 'Tracking of customer referrals from affiliates';
COMMENT ON TABLE affiliate_commissions IS 'Commission earnings for each transaction';
COMMENT ON TABLE affiliate_payouts IS 'Payout batches sent to affiliates';
COMMENT ON FUNCTION track_affiliate_referral IS 'Track a new affiliate referral';
COMMENT ON FUNCTION record_affiliate_commission IS 'Record commission for a transaction';

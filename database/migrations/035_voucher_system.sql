/**
 * Migration 031: Voucher & Gift Card System
 *
 * Enables:
 * - Gift card codes (CALOS-5USD-ABC123)
 * - Affiliate reward vouchers
 * - Promotional codes
 * - Batch generation for distribution
 * - Redemption tracking
 */

-- ============================================================================
-- VOUCHERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS vouchers (
  voucher_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Voucher code (e.g., CALOS-5USD-ABC123, WELCOME-FREE)
  code VARCHAR(100) NOT NULL UNIQUE,

  -- Value in cents ($5 = 500 cents)
  value_cents INTEGER NOT NULL,

  -- Original value (before any partial redemptions)
  original_value_cents INTEGER NOT NULL,

  -- Voucher type
  voucher_type VARCHAR(50) NOT NULL DEFAULT 'gift_card',
  -- Types: 'gift_card', 'promo', 'affiliate_reward', 'onboarding', 'test'

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  -- Statuses: 'active', 'redeemed', 'expired', 'cancelled'

  -- Usage limits
  max_redemptions INTEGER DEFAULT 1, -- NULL = unlimited
  redemptions_count INTEGER DEFAULT 0,

  -- Expiration
  expires_at TIMESTAMPTZ,

  -- Creation metadata
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Campaign/batch tracking
  campaign_name VARCHAR(200),
  batch_id VARCHAR(100),

  -- Affiliate tracking
  affiliate_code VARCHAR(100),
  affiliate_commission_cents INTEGER DEFAULT 0,

  -- Restrictions
  min_purchase_cents INTEGER DEFAULT 0, -- Minimum purchase to redeem
  allowed_tiers TEXT[], -- Only certain tiers can use it
  first_purchase_only BOOLEAN DEFAULT FALSE,

  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}',

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_vouchers_code ON vouchers(code);
CREATE INDEX idx_vouchers_status ON vouchers(status);
CREATE INDEX idx_vouchers_batch ON vouchers(batch_id);
CREATE INDEX idx_vouchers_campaign ON vouchers(campaign_name);
CREATE INDEX idx_vouchers_expires ON vouchers(expires_at);

-- ============================================================================
-- VOUCHER REDEMPTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS voucher_redemptions (
  redemption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which voucher was redeemed
  voucher_id UUID NOT NULL REFERENCES vouchers(voucher_id),

  -- Who redeemed it
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  user_id UUID REFERENCES users(user_id),

  -- Value applied (might be partial)
  value_applied_cents INTEGER NOT NULL,

  -- What it was applied to
  applied_to VARCHAR(50) NOT NULL, -- 'credits', 'subscription', 'invoice'
  transaction_id VARCHAR(255), -- Reference to credits_transaction, invoice, etc.

  -- Timestamp
  redeemed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  redemption_method VARCHAR(50) DEFAULT 'manual', -- 'manual', 'auto', 'cli'
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX idx_redemptions_voucher ON voucher_redemptions(voucher_id);
CREATE INDEX idx_redemptions_tenant ON voucher_redemptions(tenant_id);
CREATE INDEX idx_redemptions_date ON voucher_redemptions(redeemed_at);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

/**
 * Generate a batch of voucher codes
 * Usage: SELECT generate_voucher_batch('WELCOME', 100, 500, 'onboarding');
 */
CREATE OR REPLACE FUNCTION generate_voucher_batch(
  prefix VARCHAR(50),
  count INTEGER,
  value_cents_param INTEGER,
  voucher_type VARCHAR(50) DEFAULT 'gift_card'
)
RETURNS TABLE (
  voucher_id UUID,
  code VARCHAR(100),
  value_cents INTEGER
) AS $$
DECLARE
  random_suffix VARCHAR(20);
  new_code VARCHAR(100);
  batch_uuid VARCHAR(100);
BEGIN
  -- Generate batch ID
  batch_uuid := gen_random_uuid()::TEXT;

  FOR i IN 1..count LOOP
    -- Generate random suffix (uppercase alphanumeric)
    random_suffix := upper(substring(md5(random()::TEXT || clock_timestamp()::TEXT) from 1 for 8));

    -- Construct code
    new_code := prefix || '-' || random_suffix;

    -- Insert voucher
    INSERT INTO vouchers (
      code,
      value_cents,
      original_value_cents,
      voucher_type,
      batch_id,
      status
    )
    VALUES (
      new_code,
      value_cents_param,
      value_cents_param,
      voucher_type,
      batch_uuid,
      'active'
    )
    RETURNING vouchers.voucher_id, vouchers.code, vouchers.value_cents
    INTO voucher_id, code, value_cents;

    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

/**
 * Redeem a voucher for a tenant
 * Usage: SELECT redeem_voucher('CALOS-5USD-ABC123', 'tenant-uuid', 'user-uuid');
 */
CREATE OR REPLACE FUNCTION redeem_voucher(
  voucher_code VARCHAR(100),
  tenant_uuid UUID,
  user_uuid UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  voucher_record RECORD;
  credits_added INTEGER;
  result JSONB;
BEGIN
  -- Lock and fetch voucher
  SELECT * INTO voucher_record
  FROM vouchers
  WHERE code = voucher_code
  FOR UPDATE;

  -- Validate voucher exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Voucher code not found'
    );
  END IF;

  -- Validate voucher is active
  IF voucher_record.status != 'active' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Voucher is ' || voucher_record.status
    );
  END IF;

  -- Validate expiration
  IF voucher_record.expires_at IS NOT NULL AND voucher_record.expires_at < NOW() THEN
    UPDATE vouchers SET status = 'expired' WHERE voucher_id = voucher_record.voucher_id;
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Voucher has expired'
    );
  END IF;

  -- Validate redemption limit
  IF voucher_record.max_redemptions IS NOT NULL
     AND voucher_record.redemptions_count >= voucher_record.max_redemptions THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Voucher has reached maximum redemptions'
    );
  END IF;

  -- Check if already redeemed by this tenant (for single-use vouchers)
  IF voucher_record.max_redemptions = 1 THEN
    IF EXISTS (
      SELECT 1 FROM voucher_redemptions
      WHERE voucher_id = voucher_record.voucher_id AND tenant_id = tenant_uuid
    ) THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'Voucher already redeemed by this account'
      );
    END IF;
  END IF;

  -- Add credits to user account
  credits_added := voucher_record.value_cents;

  INSERT INTO user_credits (user_id, credits_remaining, credits_purchased, purchase_date)
  SELECT u.user_id, credits_added, credits_added, NOW()
  FROM users u
  WHERE u.tenant_id = tenant_uuid
  ON CONFLICT (user_id) DO UPDATE
  SET credits_remaining = user_credits.credits_remaining + credits_added;

  -- Record redemption
  INSERT INTO voucher_redemptions (
    voucher_id,
    tenant_id,
    user_id,
    value_applied_cents,
    applied_to
  )
  VALUES (
    voucher_record.voucher_id,
    tenant_uuid,
    user_uuid,
    credits_added,
    'credits'
  );

  -- Update voucher
  UPDATE vouchers
  SET
    redemptions_count = redemptions_count + 1,
    status = CASE
      WHEN max_redemptions IS NOT NULL AND redemptions_count + 1 >= max_redemptions THEN 'redeemed'
      ELSE 'active'
    END,
    value_cents = 0, -- Fully consumed for single-use
    updated_at = NOW()
  WHERE voucher_id = voucher_record.voucher_id;

  -- Return success
  RETURN jsonb_build_object(
    'success', TRUE,
    'credits_added', credits_added,
    'voucher_code', voucher_code,
    'voucher_type', voucher_record.voucher_type
  );
END;
$$ LANGUAGE plpgsql;

/**
 * Check voucher validity and remaining value
 */
CREATE OR REPLACE FUNCTION check_voucher(voucher_code VARCHAR(100))
RETURNS JSONB AS $$
DECLARE
  voucher_record RECORD;
BEGIN
  SELECT * INTO voucher_record
  FROM vouchers
  WHERE code = voucher_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'error', 'Voucher not found'
    );
  END IF;

  -- Check if expired
  IF voucher_record.expires_at IS NOT NULL AND voucher_record.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'error', 'Voucher expired',
      'expired_at', voucher_record.expires_at
    );
  END IF;

  -- Check if exhausted
  IF voucher_record.max_redemptions IS NOT NULL
     AND voucher_record.redemptions_count >= voucher_record.max_redemptions THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'error', 'Voucher fully redeemed'
    );
  END IF;

  -- Check status
  IF voucher_record.status != 'active' THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'error', 'Voucher is ' || voucher_record.status
    );
  END IF;

  -- Valid!
  RETURN jsonb_build_object(
    'valid', TRUE,
    'code', voucher_record.code,
    'value_cents', voucher_record.value_cents,
    'value_dollars', ROUND(voucher_record.value_cents::NUMERIC / 100, 2),
    'type', voucher_record.voucher_type,
    'description', voucher_record.description,
    'expires_at', voucher_record.expires_at,
    'redemptions_remaining', CASE
      WHEN voucher_record.max_redemptions IS NULL THEN NULL
      ELSE voucher_record.max_redemptions - voucher_record.redemptions_count
    END
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active vouchers summary
CREATE OR REPLACE VIEW active_vouchers AS
SELECT
  v.voucher_id,
  v.code,
  v.value_cents,
  ROUND(v.value_cents::NUMERIC / 100, 2) AS value_dollars,
  v.voucher_type,
  v.status,
  v.redemptions_count,
  v.max_redemptions,
  CASE
    WHEN v.max_redemptions IS NULL THEN NULL
    ELSE v.max_redemptions - v.redemptions_count
  END AS redemptions_remaining,
  v.expires_at,
  v.campaign_name,
  v.batch_id,
  v.created_at
FROM vouchers v
WHERE v.status = 'active'
  AND (v.expires_at IS NULL OR v.expires_at > NOW())
  AND (v.max_redemptions IS NULL OR v.redemptions_count < v.max_redemptions)
ORDER BY v.created_at DESC;

-- Voucher usage statistics
CREATE OR REPLACE VIEW voucher_usage_stats AS
SELECT
  v.campaign_name,
  v.voucher_type,
  COUNT(*) AS total_vouchers,
  SUM(v.original_value_cents) / 100.0 AS total_value_dollars,
  SUM(v.redemptions_count) AS total_redemptions,
  SUM(CASE WHEN v.status = 'redeemed' THEN 1 ELSE 0 END) AS fully_redeemed,
  ROUND(
    SUM(CASE WHEN v.status = 'redeemed' THEN 1 ELSE 0 END)::NUMERIC /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) AS redemption_rate_percent
FROM vouchers v
GROUP BY v.campaign_name, v.voucher_type
ORDER BY total_redemptions DESC;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE vouchers IS 'Gift card and promotional voucher codes';
COMMENT ON TABLE voucher_redemptions IS 'Tracking of voucher redemptions';
COMMENT ON FUNCTION generate_voucher_batch IS 'Batch generate voucher codes';
COMMENT ON FUNCTION redeem_voucher IS 'Redeem a voucher for credits';
COMMENT ON FUNCTION check_voucher IS 'Validate and check voucher status';

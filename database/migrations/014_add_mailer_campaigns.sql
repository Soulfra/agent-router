/**
 * Migration 014: Physical Mailer Campaigns & Coupon Codes
 *
 * Features:
 * - Monthly/yearly physical mailer campaigns (like Bucky Book)
 * - Unique coupon codes for each mailing
 * - Track redemptions and benefits
 * - Support various coupon types (XP boost, league entry, discounts)
 */

-- ============================================================================
-- 1. MAILER CAMPAIGNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS mailer_campaigns (
  campaign_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name VARCHAR(200) NOT NULL,
  campaign_type VARCHAR(50) NOT NULL, -- 'monthly', 'yearly', 'seasonal', 'special'
  description TEXT,

  -- Mailing details
  mail_date DATE NOT NULL,
  expected_delivery_start DATE,
  expected_delivery_end DATE,

  -- Target audience
  target_age_brackets TEXT[], -- ['adult', 'senior'] or NULL for all
  target_regions TEXT[], -- ['US-CA', 'US-NY'] or NULL for all
  target_user_ids UUID[], -- Specific users or NULL for all matching

  -- Physical mailer details
  mailer_format VARCHAR(50), -- 'postcard', 'booklet', 'letter', 'package'
  print_quantity INTEGER,
  print_cost_cents INTEGER,
  postage_cost_cents INTEGER,

  -- Coupon generation
  coupons_per_mailer INTEGER DEFAULT 1,
  total_coupons_generated INTEGER DEFAULT 0,

  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'printing', 'mailed', 'completed', 'cancelled'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(user_id),
  mailed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_mailer_campaigns_type ON mailer_campaigns(campaign_type);
CREATE INDEX idx_mailer_campaigns_status ON mailer_campaigns(status);
CREATE INDEX idx_mailer_campaigns_mail_date ON mailer_campaigns(mail_date);

-- ============================================================================
-- 2. COUPON CODES
-- ============================================================================

CREATE TABLE IF NOT EXISTS coupon_codes (
  coupon_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES mailer_campaigns(campaign_id),

  -- Unique code
  coupon_code VARCHAR(20) NOT NULL UNIQUE,
  display_code VARCHAR(50), -- Formatted for display (e.g., "XXXX-XXXX-XXXX")

  -- Coupon details
  coupon_type VARCHAR(50) NOT NULL, -- 'xp_boost', 'league_entry', 'discount', 'free_action', 'custom'
  benefit_data JSONB NOT NULL, -- Type-specific benefit details

  -- Restrictions
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  max_uses INTEGER DEFAULT 1, -- How many times this code can be redeemed
  uses_remaining INTEGER,

  -- Redemption
  times_redeemed INTEGER DEFAULT 0,
  first_redeemed_at TIMESTAMPTZ,
  last_redeemed_at TIMESTAMPTZ,

  -- Assignment (optional - track which physical address received this code)
  assigned_to_user UUID REFERENCES users(user_id),
  assigned_address JSONB, -- {street, city, state, zip, country}

  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coupon_codes_campaign ON coupon_codes(campaign_id);
CREATE INDEX idx_coupon_codes_code ON coupon_codes(coupon_code);
CREATE INDEX idx_coupon_codes_type ON coupon_codes(coupon_type);
CREATE INDEX idx_coupon_codes_assigned ON coupon_codes(assigned_to_user);
CREATE INDEX idx_coupon_codes_validity ON coupon_codes(valid_from, valid_until);

-- ============================================================================
-- 3. COUPON REDEMPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  redemption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupon_codes(coupon_id),
  user_id UUID NOT NULL REFERENCES users(user_id),

  -- Redemption details
  redeemed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  session_id UUID REFERENCES user_sessions(session_id),

  -- Benefits applied
  benefits_applied JSONB NOT NULL, -- What actually happened (XP awarded, league joined, etc.)
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);
CREATE INDEX idx_coupon_redemptions_user ON coupon_redemptions(user_id);
CREATE INDEX idx_coupon_redemptions_time ON coupon_redemptions(redeemed_at);

-- ============================================================================
-- 4. USER MAILING ADDRESSES
-- ============================================================================

-- Track user addresses for future mailings
CREATE TABLE IF NOT EXISTS user_mailing_addresses (
  address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),

  -- Address details
  address_type VARCHAR(50) DEFAULT 'home', -- 'home', 'work', 'other'
  recipient_name VARCHAR(200),
  street_line1 VARCHAR(200) NOT NULL,
  street_line2 VARCHAR(200),
  city VARCHAR(100) NOT NULL,
  state_province VARCHAR(100),
  postal_code VARCHAR(20) NOT NULL,
  country VARCHAR(2) NOT NULL DEFAULT 'US', -- ISO 3166-1 alpha-2

  -- Validation
  validated BOOLEAN DEFAULT FALSE,
  validated_at TIMESTAMPTZ,
  validation_method VARCHAR(50), -- 'usps', 'manual', 'return_mail'

  -- Preferences
  primary_address BOOLEAN DEFAULT FALSE,
  opt_out_physical_mail BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_mailing_addresses_user ON user_mailing_addresses(user_id);
CREATE INDEX idx_user_mailing_addresses_primary ON user_mailing_addresses(user_id, primary_address) WHERE primary_address = TRUE;
CREATE INDEX idx_user_mailing_addresses_country ON user_mailing_addresses(country);

-- ============================================================================
-- 5. MAILER TRACKING
-- ============================================================================

-- Track which users received which mailers
CREATE TABLE IF NOT EXISTS mailer_deliveries (
  delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES mailer_campaigns(campaign_id),
  user_id UUID REFERENCES users(user_id), -- NULL if sent to non-user address
  address_id UUID REFERENCES user_mailing_addresses(address_id),

  -- Mailing address at time of mailing (snapshot)
  mailing_address JSONB NOT NULL,

  -- Tracking
  mailed_at DATE NOT NULL,
  tracking_number VARCHAR(100),
  delivery_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'delivered', 'returned', 'lost'
  delivered_at DATE,
  returned_at DATE,
  return_reason TEXT,

  -- Coupons included
  coupon_ids UUID[] NOT NULL DEFAULT '{}',

  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_mailer_deliveries_campaign ON mailer_deliveries(campaign_id);
CREATE INDEX idx_mailer_deliveries_user ON mailer_deliveries(user_id);
CREATE INDEX idx_mailer_deliveries_status ON mailer_deliveries(delivery_status);
CREATE INDEX idx_mailer_deliveries_tracking ON mailer_deliveries(tracking_number);

-- ============================================================================
-- 6. COUPON BENEFITS TEMPLATES
-- ============================================================================

-- Pre-defined benefit templates
CREATE TABLE IF NOT EXISTS coupon_benefit_templates (
  template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(100) NOT NULL UNIQUE,
  template_type VARCHAR(50) NOT NULL, -- 'xp_boost', 'league_entry', etc.
  description TEXT,

  -- Benefit configuration
  benefit_config JSONB NOT NULL,
  -- Examples:
  -- XP Boost: {"multiplier": 2.0, "duration_hours": 24, "skills": ["all"]}
  -- League Entry: {"league_type": "chess", "tier": "bronze"}
  -- Free Actions: {"action_codes": ["create_post", "vote_domain"], "count": 10}

  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed common benefit templates
INSERT INTO coupon_benefit_templates (template_name, template_type, description, benefit_config)
VALUES
  ('2x_xp_24h', 'xp_boost', '2x XP boost for 24 hours', '{"multiplier": 2.0, "duration_hours": 24, "skills": ["all"]}'::jsonb),
  ('5x_xp_1h', 'xp_boost', '5x XP boost for 1 hour', '{"multiplier": 5.0, "duration_hours": 1, "skills": ["all"]}'::jsonb),
  ('chess_league_entry', 'league_entry', 'Free entry to chess league', '{"league_type": "chess", "tier": "bronze"}'::jsonb),
  ('tictactoe_league_entry', 'league_entry', 'Free entry to tic-tac-toe league', '{"league_type": "tictactoe", "tier": "bronze"}'::jsonb),
  ('10_free_votes', 'free_action', '10 free domain votes', '{"action_code": "vote_domain", "count": 10}'::jsonb),
  ('5_free_posts', 'free_action', '5 free social posts', '{"action_code": "create_post", "count": 5}'::jsonb),
  ('welcome_package', 'custom', 'New user welcome package', '{"xp_boost": 1.5, "duration_hours": 72, "free_actions": {"vote_domain": 20, "create_post": 10}}'::jsonb)
ON CONFLICT (template_name) DO NOTHING;

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

/**
 * Generate unique coupon code
 */
CREATE OR REPLACE FUNCTION generate_coupon_code(
  p_prefix VARCHAR(5) DEFAULT 'CAL',
  p_length INTEGER DEFAULT 12
)
RETURNS VARCHAR AS $$
DECLARE
  v_code VARCHAR;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Omit confusing chars (0,O,1,I)
  v_attempt INTEGER := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;

    -- Generate random code
    v_code := p_prefix || '-';
    FOR i IN 1..(p_length - LENGTH(p_prefix) - 1) LOOP
      v_code := v_code || SUBSTR(v_chars, 1 + FLOOR(RANDOM() * LENGTH(v_chars))::INTEGER, 1);
      IF i % 4 = 0 AND i < (p_length - LENGTH(p_prefix) - 1) THEN
        v_code := v_code || '-'; -- Add dashes for readability
      END IF;
    END LOOP;

    -- Check uniqueness
    IF NOT EXISTS (SELECT 1 FROM coupon_codes WHERE coupon_code = v_code) THEN
      RETURN v_code;
    END IF;

    -- Safety: max 100 attempts
    IF v_attempt > 100 THEN
      RAISE EXCEPTION 'Failed to generate unique coupon code after 100 attempts';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

/**
 * Create coupon code
 */
CREATE OR REPLACE FUNCTION create_coupon_code(
  p_campaign_id UUID,
  p_coupon_type VARCHAR(50),
  p_benefit_data JSONB,
  p_valid_from DATE DEFAULT CURRENT_DATE,
  p_valid_until DATE DEFAULT CURRENT_DATE + INTERVAL '1 year',
  p_max_uses INTEGER DEFAULT 1
)
RETURNS UUID AS $$
DECLARE
  v_coupon_id UUID;
  v_code VARCHAR;
BEGIN
  -- Generate unique code
  v_code := generate_coupon_code();

  -- Insert coupon
  INSERT INTO coupon_codes (
    campaign_id,
    coupon_code,
    display_code,
    coupon_type,
    benefit_data,
    valid_from,
    valid_until,
    max_uses,
    uses_remaining
  )
  VALUES (
    p_campaign_id,
    v_code,
    v_code, -- Same as code for now
    p_coupon_type,
    p_benefit_data,
    p_valid_from,
    p_valid_until,
    p_max_uses,
    p_max_uses
  )
  RETURNING coupon_id INTO v_coupon_id;

  -- Update campaign counter
  UPDATE mailer_campaigns
  SET total_coupons_generated = total_coupons_generated + 1
  WHERE campaign_id = p_campaign_id;

  RETURN v_coupon_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Validate and redeem coupon
 */
CREATE OR REPLACE FUNCTION redeem_coupon(
  p_coupon_code VARCHAR(20),
  p_user_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_ip_address INET DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  coupon_id UUID,
  benefits_applied JSONB
) AS $$
DECLARE
  v_coupon RECORD;
  v_benefits JSONB;
  v_redemption_id UUID;
BEGIN
  -- Get coupon
  SELECT * INTO v_coupon
  FROM coupon_codes
  WHERE coupon_code = p_coupon_code AND enabled = TRUE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Invalid coupon code'::TEXT, NULL::UUID, NULL::JSONB;
    RETURN;
  END IF;

  -- Check validity
  IF CURRENT_DATE < v_coupon.valid_from THEN
    RETURN QUERY SELECT FALSE, format('Coupon not valid until %s', v_coupon.valid_from)::TEXT, v_coupon.coupon_id, NULL::JSONB;
    RETURN;
  END IF;

  IF CURRENT_DATE > v_coupon.valid_until THEN
    RETURN QUERY SELECT FALSE, format('Coupon expired on %s', v_coupon.valid_until)::TEXT, v_coupon.coupon_id, NULL::JSONB;
    RETURN;
  END IF;

  -- Check uses remaining
  IF v_coupon.uses_remaining IS NOT NULL AND v_coupon.uses_remaining <= 0 THEN
    RETURN QUERY SELECT FALSE, 'Coupon has no uses remaining'::TEXT, v_coupon.coupon_id, NULL::JSONB;
    RETURN;
  END IF;

  -- Check if user already redeemed (if assigned to specific user)
  IF v_coupon.assigned_to_user IS NOT NULL AND v_coupon.assigned_to_user != p_user_id THEN
    RETURN QUERY SELECT FALSE, 'Coupon is assigned to another user'::TEXT, v_coupon.coupon_id, NULL::JSONB;
    RETURN;
  END IF;

  -- Apply benefits (to be implemented in application layer)
  v_benefits := v_coupon.benefit_data;

  -- Record redemption
  INSERT INTO coupon_redemptions (
    coupon_id,
    user_id,
    session_id,
    ip_address,
    benefits_applied,
    success
  )
  VALUES (
    v_coupon.coupon_id,
    p_user_id,
    p_session_id,
    p_ip_address,
    v_benefits,
    TRUE
  )
  RETURNING redemption_id INTO v_redemption_id;

  -- Update coupon
  UPDATE coupon_codes
  SET
    times_redeemed = times_redeemed + 1,
    uses_remaining = CASE WHEN uses_remaining IS NOT NULL THEN uses_remaining - 1 ELSE NULL END,
    first_redeemed_at = COALESCE(first_redeemed_at, NOW()),
    last_redeemed_at = NOW()
  WHERE coupon_id = v_coupon.coupon_id;

  RETURN QUERY SELECT TRUE, 'Coupon redeemed successfully'::TEXT, v_coupon.coupon_id, v_benefits;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. VIEWS
-- ============================================================================

-- Campaign summary
CREATE OR REPLACE VIEW mailer_campaign_summary AS
SELECT
  mc.campaign_id,
  mc.campaign_name,
  mc.campaign_type,
  mc.status,
  mc.mail_date,
  mc.print_quantity,
  mc.total_coupons_generated,
  COUNT(DISTINCT md.delivery_id) AS mailers_sent,
  COUNT(DISTINCT md.delivery_id) FILTER (WHERE md.delivery_status = 'delivered') AS mailers_delivered,
  COUNT(DISTINCT cr.redemption_id) AS total_redemptions,
  COUNT(DISTINCT cr.user_id) AS unique_redeemers,
  (mc.print_cost_cents + mc.postage_cost_cents) AS total_cost_cents,
  CASE
    WHEN mc.total_coupons_generated > 0
    THEN ROUND(100.0 * COUNT(DISTINCT cr.redemption_id) / mc.total_coupons_generated, 2)
    ELSE 0
  END AS redemption_rate_percent
FROM mailer_campaigns mc
LEFT JOIN mailer_deliveries md ON md.campaign_id = mc.campaign_id
LEFT JOIN coupon_codes cc ON cc.campaign_id = mc.campaign_id
LEFT JOIN coupon_redemptions cr ON cr.coupon_id = cc.coupon_id
GROUP BY mc.campaign_id;

-- User coupon inventory
CREATE OR REPLACE VIEW user_coupon_inventory AS
SELECT
  u.user_id,
  u.username,
  cc.coupon_id,
  cc.coupon_code,
  cc.display_code,
  cc.coupon_type,
  cc.benefit_data,
  cc.valid_from,
  cc.valid_until,
  cc.uses_remaining,
  mc.campaign_name,
  CASE
    WHEN cc.times_redeemed > 0 THEN 'used'
    WHEN CURRENT_DATE > cc.valid_until THEN 'expired'
    WHEN CURRENT_DATE < cc.valid_from THEN 'not_yet_valid'
    WHEN cc.uses_remaining IS NOT NULL AND cc.uses_remaining <= 0 THEN 'used_up'
    ELSE 'available'
  END AS status
FROM users u
JOIN coupon_codes cc ON cc.assigned_to_user = u.user_id
JOIN mailer_campaigns mc ON mc.campaign_id = cc.campaign_id
WHERE cc.enabled = TRUE
ORDER BY cc.valid_until DESC;

-- Coupon redemption stats
CREATE OR REPLACE VIEW coupon_redemption_stats AS
SELECT
  cc.coupon_type,
  COUNT(*) AS total_coupons,
  COUNT(*) FILTER (WHERE cc.times_redeemed > 0) AS redeemed_coupons,
  SUM(cc.times_redeemed) AS total_redemptions,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cc.times_redeemed > 0) / COUNT(*), 2) AS redemption_rate_percent,
  AVG(EXTRACT(EPOCH FROM (cc.first_redeemed_at - cc.created_at)) / 86400)::NUMERIC(10,2) AS avg_days_to_first_redemption
FROM coupon_codes cc
GROUP BY cc.coupon_type;

COMMENT ON TABLE mailer_campaigns IS 'Physical mailer campaigns (monthly/yearly mailings like Bucky Book)';
COMMENT ON TABLE coupon_codes IS 'Unique coupon codes included in mailers';
COMMENT ON TABLE coupon_redemptions IS 'Track coupon redemptions and benefits applied';
COMMENT ON TABLE user_mailing_addresses IS 'User physical mailing addresses';
COMMENT ON TABLE mailer_deliveries IS 'Track which users received which mailers';
COMMENT ON TABLE coupon_benefit_templates IS 'Pre-defined coupon benefit configurations';

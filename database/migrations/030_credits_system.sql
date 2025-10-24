/**
 * Migration 030: Credit-Based Billing & Twilio Integration
 *
 * Reverse phone plan: Users PAY YOU to use calls/SMS
 *
 * Business model:
 * - User buys credits upfront (prepaid)
 * - Spends credits on SMS ($0.01), calls ($0.05/min), AI queries ($0.10)
 * - When balance low, buy more credits
 *
 * Revenue: 26-74% profit margin + 100% upfront payment
 */

-- ============================================================================
-- 1. USER CREDITS (Prepaid Balance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,

  -- Current balance
  balance_cents INTEGER NOT NULL DEFAULT 0,
  CHECK (balance_cents >= 0), -- Can't go negative

  -- Lifetime stats
  lifetime_purchased_cents INTEGER DEFAULT 0,
  lifetime_spent_cents INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_purchase_at TIMESTAMPTZ,
  last_usage_at TIMESTAMPTZ
);

CREATE INDEX idx_user_credits_balance ON user_credits(balance_cents);
CREATE INDEX idx_user_credits_updated ON user_credits(updated_at DESC);

COMMENT ON TABLE user_credits IS 'Prepaid credit balance for each user';

-- ============================================================================
-- 2. CREDIT TRANSACTIONS (Ledger)
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_transactions (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Transaction details
  type VARCHAR(50) NOT NULL, -- 'purchase', 'sms_outbound', 'sms_inbound', 'call_outbound', 'call_inbound', 'ai_query', 'phone_verification', 'refund', 'bonus', 'admin_adjustment'
  amount_cents INTEGER NOT NULL, -- Positive = add credits, negative = deduct
  balance_after_cents INTEGER NOT NULL,

  -- Context
  description TEXT,
  metadata JSONB DEFAULT '{}', -- Phone number, call duration, AI model, etc.

  -- Payment processing (for purchases)
  stripe_payment_intent_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),

  -- Related records
  twilio_sid VARCHAR(255), -- Link to Twilio call/SMS

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_transactions_user ON credit_transactions(user_id, created_at DESC);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(type);
CREATE INDEX idx_credit_transactions_stripe ON credit_transactions(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX idx_credit_transactions_twilio ON credit_transactions(twilio_sid) WHERE twilio_sid IS NOT NULL;

COMMENT ON TABLE credit_transactions IS 'Complete ledger of all credit activity';

-- ============================================================================
-- 3. VERIFIED PHONES (USA Only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS verified_phones (
  phone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Phone number (E.164 format)
  phone_number VARCHAR(20) NOT NULL UNIQUE, -- +12345678900
  country_code VARCHAR(2) NOT NULL DEFAULT 'US',

  -- Verification status
  verified BOOLEAN DEFAULT FALSE,
  verification_code VARCHAR(6), -- 6-digit code
  verification_sent_at TIMESTAMPTZ,
  verification_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,

  -- Twilio details
  twilio_sid VARCHAR(255),
  twilio_lookup_data JSONB, -- Carrier info, line type, etc.

  -- Status
  active BOOLEAN DEFAULT TRUE,
  blocked BOOLEAN DEFAULT FALSE, -- Admin can block numbers
  block_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_verified_phones_user ON verified_phones(user_id);
CREATE INDEX idx_verified_phones_number ON verified_phones(phone_number);
CREATE INDEX idx_verified_phones_verified ON verified_phones(verified) WHERE verified = TRUE;

COMMENT ON TABLE verified_phones IS 'USA phone numbers verified via Twilio';

-- ============================================================================
-- 4. TWILIO USAGE LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS twilio_usage (
  usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Phone numbers
  from_number VARCHAR(20), -- Sender
  to_number VARCHAR(20),   -- Recipient

  -- Type
  direction VARCHAR(10) NOT NULL, -- 'inbound', 'outbound'
  type VARCHAR(10) NOT NULL,      -- 'sms', 'call', 'mms'

  -- Call details
  duration_seconds INTEGER, -- For calls
  recording_url TEXT,       -- Call recording (if enabled)
  transcription TEXT,       -- Call transcription (if enabled)

  -- Cost
  cost_cents INTEGER NOT NULL, -- What we charged user
  twilio_cost_usd DECIMAL(10,4), -- What Twilio charged us
  profit_cents INTEGER, -- Our profit

  -- Twilio details
  twilio_sid VARCHAR(255) UNIQUE NOT NULL,
  twilio_status VARCHAR(50), -- 'queued', 'sent', 'delivered', 'failed', etc.
  twilio_error_code VARCHAR(10),
  twilio_error_message TEXT,

  -- Content (for SMS/MMS)
  message_body TEXT, -- SMS text
  media_urls TEXT[], -- MMS attachments

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_twilio_usage_user ON twilio_usage(user_id, created_at DESC);
CREATE INDEX idx_twilio_usage_sid ON twilio_usage(twilio_sid);
CREATE INDEX idx_twilio_usage_type ON twilio_usage(type, direction);
CREATE INDEX idx_twilio_usage_status ON twilio_usage(twilio_status);

COMMENT ON TABLE twilio_usage IS 'Complete log of all Twilio calls and messages';

-- ============================================================================
-- 5. CREDIT PACKAGES (Pricing Tiers)
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_packages (
  package_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Package details
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Pricing
  price_cents INTEGER NOT NULL, -- What user pays (e.g., $10 = 1000 cents)
  credits_cents INTEGER NOT NULL, -- What user gets (e.g., $11 = 1100 cents)
  bonus_cents INTEGER NOT NULL DEFAULT 0, -- Free bonus (e.g., $1 = 100 cents)

  -- Display
  popular BOOLEAN DEFAULT FALSE, -- Highlight as "Most Popular"
  sort_order INTEGER DEFAULT 0,

  -- Status
  active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_packages_active ON credit_packages(active, sort_order);

COMMENT ON TABLE credit_packages IS 'Credit purchase options (e.g., $10 → $11 credits)';

-- Seed default packages
INSERT INTO credit_packages (name, description, price_cents, credits_cents, bonus_cents, popular, sort_order)
VALUES
  ('Starter', 'Perfect for trying out CalOS', 1000, 1100, 100, FALSE, 1),
  ('Pro', 'Most popular choice', 2500, 3000, 500, TRUE, 2),
  ('Power User', 'Best value - 30% bonus!', 5000, 6500, 1500, FALSE, 3),
  ('Enterprise', 'Maximum value - 50% bonus!', 10000, 15000, 5000, FALSE, 4)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. PRICING CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS pricing_config (
  config_key VARCHAR(100) PRIMARY KEY,
  cost_cents INTEGER NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed pricing
INSERT INTO pricing_config (config_key, cost_cents, description)
VALUES
  ('sms_outbound', 1, 'Cost per outbound SMS'),
  ('sms_inbound', 0, 'Cost per inbound SMS (free)'),
  ('mms_outbound', 3, 'Cost per outbound MMS'),
  ('mms_inbound', 0, 'Cost per inbound MMS (free)'),
  ('call_outbound_per_min', 5, 'Cost per minute of outbound calls'),
  ('call_inbound_per_min', 2, 'Cost per minute of inbound calls'),
  ('phone_verification', 5, 'One-time phone verification cost'),
  ('ai_query_gpt4', 10, 'Cost per GPT-4 query'),
  ('ai_query_claude', 8, 'Cost per Claude query'),
  ('ai_query_ollama', 1, 'Cost per Ollama query (local)'),

  -- Twilio actual costs (for profit calculation)
  ('twilio_sms_usa', 1, 'Twilio cost per SMS (USA) - rounded up'),
  ('twilio_call_usa_per_min', 1, 'Twilio cost per minute (USA) - rounded up')
ON CONFLICT (config_key) DO NOTHING;

COMMENT ON TABLE pricing_config IS 'Configurable pricing for all credit-based services';

-- ============================================================================
-- 7. FUNCTIONS
-- ============================================================================

-- Function: Get user balance
CREATE OR REPLACE FUNCTION get_user_balance(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT balance_cents INTO v_balance
  FROM user_credits
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql;

-- Function: Add credits (purchase or bonus)
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount_cents INTEGER,
  p_type VARCHAR(50),
  p_description TEXT DEFAULT NULL,
  p_stripe_payment_intent_id VARCHAR(255) DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_new_balance INTEGER;
BEGIN
  -- Create user_credits record if doesn't exist
  INSERT INTO user_credits (user_id, balance_cents)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Update balance
  UPDATE user_credits
  SET
    balance_cents = balance_cents + p_amount_cents,
    lifetime_purchased_cents = CASE
      WHEN p_type = 'purchase' THEN lifetime_purchased_cents + p_amount_cents
      ELSE lifetime_purchased_cents
    END,
    last_purchase_at = CASE
      WHEN p_type = 'purchase' THEN NOW()
      ELSE last_purchase_at
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_cents INTO v_new_balance;

  -- Log transaction
  INSERT INTO credit_transactions (
    user_id,
    type,
    amount_cents,
    balance_after_cents,
    description,
    metadata,
    stripe_payment_intent_id
  ) VALUES (
    p_user_id,
    p_type,
    p_amount_cents,
    v_new_balance,
    p_description,
    p_metadata,
    p_stripe_payment_intent_id
  ) RETURNING transaction_id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Deduct credits (usage)
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount_cents INTEGER,
  p_type VARCHAR(50),
  p_description TEXT DEFAULT NULL,
  p_twilio_sid VARCHAR(255) DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Check balance
  SELECT balance_cents INTO v_current_balance
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE; -- Lock row to prevent race conditions

  IF v_current_balance IS NULL OR v_current_balance < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient credits (balance: %, required: %)',
      COALESCE(v_current_balance, 0), p_amount_cents;
  END IF;

  -- Deduct credits
  UPDATE user_credits
  SET
    balance_cents = balance_cents - p_amount_cents,
    lifetime_spent_cents = lifetime_spent_cents + p_amount_cents,
    last_usage_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_cents INTO v_new_balance;

  -- Log transaction (negative amount)
  INSERT INTO credit_transactions (
    user_id,
    type,
    amount_cents,
    balance_after_cents,
    description,
    metadata,
    twilio_sid
  ) VALUES (
    p_user_id,
    p_type,
    -p_amount_cents, -- Negative = deduction
    v_new_balance,
    p_description,
    p_metadata,
    p_twilio_sid
  ) RETURNING transaction_id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Check if user can afford
CREATE OR REPLACE FUNCTION can_afford(
  p_user_id UUID,
  p_amount_cents INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT balance_cents INTO v_balance
  FROM user_credits
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_balance, 0) >= p_amount_cents;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. VIEWS
-- ============================================================================

-- User credit summary
CREATE OR REPLACE VIEW user_credit_summary AS
SELECT
  u.user_id,
  u.email,
  uc.balance_cents,
  uc.balance_cents::DECIMAL / 100 as balance_usd,
  uc.lifetime_purchased_cents,
  uc.lifetime_purchased_cents::DECIMAL / 100 as lifetime_purchased_usd,
  uc.lifetime_spent_cents,
  uc.lifetime_spent_cents::DECIMAL / 100 as lifetime_spent_usd,
  uc.last_purchase_at,
  uc.last_usage_at,

  -- Usage stats (last 30 days)
  COUNT(ct.transaction_id) FILTER (WHERE ct.type LIKE '%sms%' AND ct.created_at > NOW() - INTERVAL '30 days') as sms_count_30d,
  COUNT(ct.transaction_id) FILTER (WHERE ct.type LIKE '%call%' AND ct.created_at > NOW() - INTERVAL '30 days') as call_count_30d,
  SUM(-ct.amount_cents) FILTER (WHERE ct.type LIKE '%ai%' AND ct.created_at > NOW() - INTERVAL '30 days') as ai_spend_cents_30d,

  -- Verified phones
  COUNT(vp.phone_id) FILTER (WHERE vp.verified = TRUE) as verified_phones_count
FROM users u
LEFT JOIN user_credits uc ON u.user_id = uc.user_id
LEFT JOIN credit_transactions ct ON u.user_id = ct.user_id
LEFT JOIN verified_phones vp ON u.user_id = vp.user_id
GROUP BY u.user_id, u.email, uc.balance_cents, uc.lifetime_purchased_cents, uc.lifetime_spent_cents, uc.last_purchase_at, uc.last_usage_at;

-- Low balance users (< $1)
CREATE OR REPLACE VIEW users_low_balance AS
SELECT
  u.user_id,
  u.email,
  uc.balance_cents,
  uc.balance_cents::DECIMAL / 100 as balance_usd,
  uc.last_usage_at,
  EXTRACT(EPOCH FROM (NOW() - uc.last_usage_at)) / 3600 as hours_since_last_use
FROM users u
JOIN user_credits uc ON u.user_id = uc.user_id
WHERE uc.balance_cents < 100
  AND uc.last_usage_at > NOW() - INTERVAL '7 days' -- Active in last week
ORDER BY uc.balance_cents ASC;

-- Revenue report
CREATE OR REPLACE VIEW revenue_report AS
SELECT
  DATE_TRUNC('day', ct.created_at) as date,
  SUM(ct.amount_cents) FILTER (WHERE ct.type = 'purchase') as purchases_cents,
  SUM(ct.amount_cents) FILTER (WHERE ct.type = 'purchase')::DECIMAL / 100 as purchases_usd,
  COUNT(*) FILTER (WHERE ct.type = 'purchase') as purchase_count,

  -- Usage revenue (already collected)
  SUM(-ct.amount_cents) FILTER (WHERE ct.type LIKE '%sms%') as sms_revenue_cents,
  SUM(-ct.amount_cents) FILTER (WHERE ct.type LIKE '%call%') as call_revenue_cents,
  SUM(-ct.amount_cents) FILTER (WHERE ct.type LIKE '%ai%') as ai_revenue_cents,

  -- Total
  SUM(ct.amount_cents) FILTER (WHERE ct.type = 'purchase') +
    SUM(-ct.amount_cents) FILTER (WHERE ct.amount_cents < 0) as total_revenue_cents
FROM credit_transactions ct
GROUP BY DATE_TRUNC('day', ct.created_at)
ORDER BY date DESC;

-- Twilio profit analysis
CREATE OR REPLACE VIEW twilio_profit_analysis AS
SELECT
  DATE_TRUNC('day', tu.created_at) as date,
  tu.type,
  tu.direction,
  COUNT(*) as transaction_count,
  SUM(tu.cost_cents) as charged_to_users_cents,
  SUM(tu.twilio_cost_usd * 100) as paid_to_twilio_cents,
  SUM(tu.profit_cents) as profit_cents,
  SUM(tu.profit_cents)::DECIMAL / 100 as profit_usd,
  ROUND(AVG(tu.profit_cents::DECIMAL / NULLIF(tu.cost_cents, 0) * 100), 2) as profit_margin_pct
FROM twilio_usage tu
GROUP BY DATE_TRUNC('day', tu.created_at), tu.type, tu.direction
ORDER BY date DESC, transaction_count DESC;

-- ============================================================================
-- 9. TRIGGERS
-- ============================================================================

-- Update timestamp on user_credits
CREATE TRIGGER update_user_credits_timestamp
  BEFORE UPDATE ON user_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp on verified_phones
CREATE TRIGGER update_verified_phones_timestamp
  BEFORE UPDATE ON verified_phones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp on twilio_usage
CREATE TRIGGER update_twilio_usage_timestamp
  BEFORE UPDATE ON twilio_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 10. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON user_credits TO postgres;
GRANT SELECT, INSERT ON credit_transactions TO postgres;
GRANT SELECT, INSERT, UPDATE ON verified_phones TO postgres;
GRANT SELECT, INSERT, UPDATE ON twilio_usage TO postgres;
GRANT SELECT ON credit_packages TO postgres;
GRANT SELECT ON pricing_config TO postgres;

GRANT SELECT ON user_credit_summary TO postgres;
GRANT SELECT ON users_low_balance TO postgres;
GRANT SELECT ON revenue_report TO postgres;
GRANT SELECT ON twilio_profit_analysis TO postgres;

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Credit system & Twilio integration installed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - user_credits (prepaid balance)';
  RAISE NOTICE '  - credit_transactions (complete ledger)';
  RAISE NOTICE '  - verified_phones (USA phone verification)';
  RAISE NOTICE '  - twilio_usage (call/SMS logs)';
  RAISE NOTICE '  - credit_packages (pricing tiers)';
  RAISE NOTICE '  - pricing_config (configurable costs)';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - get_user_balance(user_id)';
  RAISE NOTICE '  - add_credits(user_id, amount, ...)';
  RAISE NOTICE '  - deduct_credits(user_id, amount, ...)';
  RAISE NOTICE '  - can_afford(user_id, amount)';
  RAISE NOTICE '';
  RAISE NOTICE 'Views created:';
  RAISE NOTICE '  - user_credit_summary (balances + usage)';
  RAISE NOTICE '  - users_low_balance (< $1 remaining)';
  RAISE NOTICE '  - revenue_report (daily revenue)';
  RAISE NOTICE '  - twilio_profit_analysis (profit margins)';
  RAISE NOTICE '';
  RAISE NOTICE 'Default pricing:';
  RAISE NOTICE '  SMS: $0.01  |  MMS: $0.03  |  Calls: $0.05/min';
  RAISE NOTICE '  AI: $0.01-0.10  |  Phone verify: $0.05';
  RAISE NOTICE '';
  RAISE NOTICE 'Credit packages:';
  RAISE NOTICE '  $10 → $11 (10% bonus)';
  RAISE NOTICE '  $25 → $30 (20% bonus)';
  RAISE NOTICE '  $50 → $65 (30% bonus)';
  RAISE NOTICE '  $100 → $150 (50% bonus)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Set up Twilio account → https://www.twilio.com/console';
  RAISE NOTICE '  2. Get phone number → https://www.twilio.com/console/phone-numbers';
  RAISE NOTICE '  3. Configure webhooks → https://www.twilio.com/console/phone-numbers/incoming';
  RAISE NOTICE '  4. Add Twilio credentials to .env';
  RAISE NOTICE '  5. Implement API routes (routes/credits-routes.js, routes/twilio-routes.js)';
END $$;

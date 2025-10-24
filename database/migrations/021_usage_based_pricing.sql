/**
 * Migration 021: Usage-Based Pricing
 *
 * Pivot from subscription tiers → pay-per-token model
 *
 * Features:
 * - Token/cost tracking per tenant
 * - API key management (BYOK - Bring Your Own Key)
 * - Usage metering and billing events
 * - Flexible pricing models (metered, BYOK, hybrid)
 */

-- ============================================================================
-- 1. ADD USAGE TRACKING TO TENANT LICENSES
-- ============================================================================

-- Add token and cost tracking columns
ALTER TABLE tenant_licenses ADD COLUMN IF NOT EXISTS tokens_used_this_period BIGINT DEFAULT 0;
ALTER TABLE tenant_licenses ADD COLUMN IF NOT EXISTS tokens_limit BIGINT; -- NULL = unlimited
ALTER TABLE tenant_licenses ADD COLUMN IF NOT EXISTS cost_this_period_cents INTEGER DEFAULT 0;
ALTER TABLE tenant_licenses ADD COLUMN IF NOT EXISTS cost_limit_cents INTEGER; -- NULL = unlimited

-- Add pricing model type
ALTER TABLE tenant_licenses ADD COLUMN IF NOT EXISTS pricing_model VARCHAR(50) DEFAULT 'subscription';
-- 'subscription' (old model), 'metered' (pay per token), 'byok' (bring your own key), 'hybrid'

-- Add markup percentage (for metered model)
ALTER TABLE tenant_licenses ADD COLUMN IF NOT EXISTS markup_percent INTEGER DEFAULT 50; -- 50% markup on provider costs

COMMENT ON COLUMN tenant_licenses.tokens_used_this_period IS 'Total tokens consumed this 28-day period';
COMMENT ON COLUMN tenant_licenses.tokens_limit IS 'Token limit per period (NULL = unlimited)';
COMMENT ON COLUMN tenant_licenses.cost_this_period_cents IS 'Total cost in cents this period';
COMMENT ON COLUMN tenant_licenses.cost_limit_cents IS 'Cost limit per period (NULL = unlimited)';
COMMENT ON COLUMN tenant_licenses.pricing_model IS 'subscription, metered, byok, or hybrid';
COMMENT ON COLUMN tenant_licenses.markup_percent IS 'Markup % on provider costs (for metered model)';

-- ============================================================================
-- 2. TENANT API KEYS (BYOK - Bring Your Own Key)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_api_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,

  -- Provider details
  provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'deepseek', 'together'
  key_name VARCHAR(200) NOT NULL, -- User-friendly name (e.g., "Production OpenAI")

  -- Encrypted API key
  encrypted_api_key TEXT NOT NULL,
  key_prefix VARCHAR(20), -- First few chars for identification (e.g., "sk-abc...")

  -- Status
  active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(user_id),

  UNIQUE(tenant_id, provider, key_name)
);

CREATE INDEX idx_tenant_api_keys_tenant ON tenant_api_keys(tenant_id);
CREATE INDEX idx_tenant_api_keys_provider ON tenant_api_keys(provider) WHERE active = TRUE;

COMMENT ON TABLE tenant_api_keys IS 'Tenant-provided API keys (BYOK model)';

-- ============================================================================
-- 3. USAGE BILLING EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_billing_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,

  -- Request details
  request_id VARCHAR(255), -- Optional external request ID
  endpoint VARCHAR(200), -- Which API endpoint was called
  user_id UUID REFERENCES users(user_id), -- Which user made the request

  -- LLM provider used
  provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'deepseek', 'ollama'
  model VARCHAR(100), -- Specific model used (e.g., 'gpt-4', 'claude-3-opus')

  -- Token usage
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0,

  -- Costs (in cents)
  provider_cost_cents INTEGER DEFAULT 0, -- What we paid the provider
  markup_cost_cents INTEGER DEFAULT 0, -- Our markup
  total_cost_cents INTEGER DEFAULT 0, -- Total charged to tenant

  -- Billing status
  billed BOOLEAN DEFAULT FALSE,
  billed_at TIMESTAMPTZ,
  invoice_id UUID, -- Link to invoice when billed

  -- Metadata
  metadata JSONB DEFAULT '{}', -- Store request/response details if needed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_events_tenant ON usage_billing_events(tenant_id, created_at DESC);
CREATE INDEX idx_usage_events_unbilled ON usage_billing_events(tenant_id, billed) WHERE billed = FALSE;
CREATE INDEX idx_usage_events_provider ON usage_billing_events(provider);
CREATE INDEX idx_usage_events_user ON usage_billing_events(user_id);

COMMENT ON TABLE usage_billing_events IS 'Record every LLM API call for billing';

-- ============================================================================
-- 4. UPDATE PLATFORM TIERS FOR USAGE-BASED PRICING
-- ============================================================================

-- Add token allowances to tiers
ALTER TABLE platform_tiers ADD COLUMN IF NOT EXISTS tokens_included BIGINT; -- Free tokens included per period
ALTER TABLE platform_tiers ADD COLUMN IF NOT EXISTS price_per_million_tokens_cents INTEGER; -- Price per 1M tokens beyond included

COMMENT ON COLUMN platform_tiers.tokens_included IS 'Free tokens included in base price (NULL = none)';
COMMENT ON COLUMN platform_tiers.price_per_million_tokens_cents IS 'Price per 1M tokens beyond included amount';

-- Update existing tiers with usage pricing
UPDATE platform_tiers
SET
  tokens_included = CASE
    WHEN tier_code = 'starter' THEN 1000000    -- 1M free tokens
    WHEN tier_code = 'pro' THEN 10000000      -- 10M free tokens
    WHEN tier_code = 'enterprise' THEN NULL   -- Unlimited
  END,
  price_per_million_tokens_cents = CASE
    WHEN tier_code = 'starter' THEN 20        -- $0.20 per 1M tokens
    WHEN tier_code = 'pro' THEN 15            -- $0.15 per 1M tokens
    WHEN tier_code = 'enterprise' THEN 10     -- $0.10 per 1M tokens
  END
WHERE tier_code IN ('starter', 'pro', 'enterprise');

-- ============================================================================
-- 5. INVOICES TABLE (For billing history)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_invoices (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,

  -- Invoice details
  invoice_number VARCHAR(50) UNIQUE NOT NULL, -- Human-readable (e.g., "INV-2025-001")
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Amounts (in cents)
  base_price_cents INTEGER DEFAULT 0, -- Subscription base fee
  usage_price_cents INTEGER DEFAULT 0, -- Usage-based charges
  total_price_cents INTEGER NOT NULL,

  -- Usage summary
  total_tokens BIGINT DEFAULT 0,
  total_requests INTEGER DEFAULT 0,

  -- Payment
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'paid', 'overdue', 'void'
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Stripe
  stripe_invoice_id VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_invoices_tenant ON tenant_invoices(tenant_id, created_at DESC);
CREATE INDEX idx_invoices_status ON tenant_invoices(status) WHERE status = 'pending';
CREATE INDEX idx_invoices_number ON tenant_invoices(invoice_number);

COMMENT ON TABLE tenant_invoices IS 'Billing invoices for tenants';

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

/**
 * Record usage event
 * Called after every LLM API request
 */
CREATE OR REPLACE FUNCTION record_usage_event(
  p_tenant_id UUID,
  p_provider VARCHAR(50),
  p_model VARCHAR(100),
  p_tokens_input INTEGER,
  p_tokens_output INTEGER,
  p_provider_cost_cents INTEGER,
  p_markup_percent INTEGER DEFAULT 50,
  p_user_id UUID DEFAULT NULL,
  p_endpoint VARCHAR(200) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_tokens_total INTEGER;
  v_markup_cost_cents INTEGER;
  v_total_cost_cents INTEGER;
BEGIN
  -- Calculate totals
  v_tokens_total := p_tokens_input + p_tokens_output;
  v_markup_cost_cents := (p_provider_cost_cents * p_markup_percent) / 100;
  v_total_cost_cents := p_provider_cost_cents + v_markup_cost_cents;

  -- Insert event
  INSERT INTO usage_billing_events (
    tenant_id, provider, model, user_id, endpoint,
    tokens_input, tokens_output, tokens_total,
    provider_cost_cents, markup_cost_cents, total_cost_cents
  ) VALUES (
    p_tenant_id, p_provider, p_model, p_user_id, p_endpoint,
    p_tokens_input, p_tokens_output, v_tokens_total,
    p_provider_cost_cents, v_markup_cost_cents, v_total_cost_cents
  )
  RETURNING event_id INTO v_event_id;

  -- Update tenant license usage
  UPDATE tenant_licenses
  SET
    tokens_used_this_period = tokens_used_this_period + v_tokens_total,
    cost_this_period_cents = cost_this_period_cents + v_total_cost_cents,
    api_calls_this_period = api_calls_this_period + 1
  WHERE tenant_id = p_tenant_id AND status = 'active';

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Check if tenant is within usage limits
 */
CREATE OR REPLACE FUNCTION check_usage_limits(
  p_tenant_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_license RECORD;
BEGIN
  SELECT * INTO v_license
  FROM tenant_licenses
  WHERE tenant_id = p_tenant_id AND status = 'active'
  LIMIT 1;

  IF v_license IS NULL THEN
    RETURN FALSE; -- No active license
  END IF;

  -- Check token limit
  IF v_license.tokens_limit IS NOT NULL THEN
    IF v_license.tokens_used_this_period >= v_license.tokens_limit THEN
      RETURN FALSE; -- Token limit exceeded
    END IF;
  END IF;

  -- Check cost limit
  IF v_license.cost_limit_cents IS NOT NULL THEN
    IF v_license.cost_this_period_cents >= v_license.cost_limit_cents THEN
      RETURN FALSE; -- Cost limit exceeded
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

/**
 * Generate invoice for tenant
 */
CREATE OR REPLACE FUNCTION generate_invoice(
  p_tenant_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS UUID AS $$
DECLARE
  v_invoice_id UUID;
  v_license RECORD;
  v_tier RECORD;
  v_invoice_number VARCHAR(50);
  v_base_price INTEGER;
  v_usage_price INTEGER;
  v_total_tokens BIGINT;
  v_total_requests INTEGER;
BEGIN
  -- Get license and tier
  SELECT tl.*, pt.* INTO v_license
  FROM tenant_licenses tl
  JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
  WHERE tl.tenant_id = p_tenant_id AND tl.status = 'active'
  LIMIT 1;

  IF v_license IS NULL THEN
    RAISE EXCEPTION 'No active license found for tenant %', p_tenant_id;
  END IF;

  -- Calculate usage charges
  SELECT
    COALESCE(SUM(total_cost_cents), 0),
    COALESCE(SUM(tokens_total), 0),
    COUNT(*)
  INTO v_usage_price, v_total_tokens, v_total_requests
  FROM usage_billing_events
  WHERE tenant_id = p_tenant_id
    AND created_at >= p_period_start
    AND created_at < p_period_end
    AND billed = FALSE;

  -- Base price depends on pricing model
  v_base_price := CASE
    WHEN v_license.pricing_model = 'subscription' THEN v_license.price_cents
    WHEN v_license.pricing_model = 'hybrid' THEN v_license.price_cents
    WHEN v_license.pricing_model = 'metered' THEN 0
    WHEN v_license.pricing_model = 'byok' THEN v_license.price_cents
    ELSE 0
  END;

  -- Generate invoice number
  v_invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                      LPAD(nextval('invoice_number_seq')::TEXT, 6, '0');

  -- Create invoice
  INSERT INTO tenant_invoices (
    tenant_id, invoice_number, period_start, period_end,
    base_price_cents, usage_price_cents, total_price_cents,
    total_tokens, total_requests, status, due_date
  ) VALUES (
    p_tenant_id, v_invoice_number, p_period_start, p_period_end,
    v_base_price, v_usage_price, v_base_price + v_usage_price,
    v_total_tokens, v_total_requests, 'pending', NOW() + INTERVAL '14 days'
  )
  RETURNING invoice_id INTO v_invoice_id;

  -- Mark usage events as billed
  UPDATE usage_billing_events
  SET billed = TRUE, billed_at = NOW(), invoice_id = v_invoice_id
  WHERE tenant_id = p_tenant_id
    AND created_at >= p_period_start
    AND created_at < p_period_end
    AND billed = FALSE;

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- Create sequence for invoice numbers
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

-- ============================================================================
-- 7. UPDATE RESET FUNCTION TO CLEAR USAGE
-- ============================================================================

DROP FUNCTION IF EXISTS reset_tenant_usage();

CREATE OR REPLACE FUNCTION reset_tenant_usage()
RETURNS INTEGER AS $$
DECLARE
  v_reset_count INTEGER;
  v_tenant RECORD;
BEGIN
  v_reset_count := 0;

  -- Loop through tenants with expired periods
  FOR v_tenant IN
    SELECT tenant_id, current_period_start, current_period_end
    FROM tenant_licenses
    WHERE current_period_end <= NOW() AND status = 'active'
  LOOP
    -- Generate invoice for completed period
    PERFORM generate_invoice(
      v_tenant.tenant_id,
      v_tenant.current_period_start,
      v_tenant.current_period_end
    );

    -- Reset usage counters
    UPDATE tenant_licenses
    SET
      users_this_period = 0,
      api_calls_this_period = 0,
      tokens_used_this_period = 0,
      cost_this_period_cents = 0,
      storage_used_gb = 0,
      bandwidth_used_gb = 0,
      current_period_start = current_period_end,
      current_period_end = current_period_end + INTERVAL '28 days'
    WHERE tenant_id = v_tenant.tenant_id;

    v_reset_count := v_reset_count + 1;
  END LOOP;

  RETURN v_reset_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. VIEWS FOR USAGE ANALYTICS
-- ============================================================================

-- Tenant usage summary
CREATE OR REPLACE VIEW tenant_usage_summary AS
SELECT
  t.tenant_id,
  t.tenant_name,
  tl.pricing_model,
  tl.tokens_used_this_period,
  tl.tokens_limit,
  tl.cost_this_period_cents,
  tl.cost_limit_cents,
  CASE
    WHEN tl.tokens_limit IS NOT NULL
    THEN ROUND((tl.tokens_used_this_period::DECIMAL / tl.tokens_limit) * 100, 2)
    ELSE NULL
  END AS tokens_used_percent,
  CASE
    WHEN tl.cost_limit_cents IS NOT NULL
    THEN ROUND((tl.cost_this_period_cents::DECIMAL / tl.cost_limit_cents) * 100, 2)
    ELSE NULL
  END AS cost_used_percent
FROM tenants t
JOIN tenant_licenses tl ON tl.tenant_id = t.tenant_id
WHERE t.status = 'active' AND tl.status = 'active';

-- Usage by provider
CREATE OR REPLACE VIEW usage_by_provider AS
SELECT
  tenant_id,
  provider,
  COUNT(*) AS requests,
  SUM(tokens_total) AS total_tokens,
  SUM(total_cost_cents) AS total_cost_cents,
  AVG(tokens_total) AS avg_tokens_per_request
FROM usage_billing_events
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY tenant_id, provider
ORDER BY total_cost_cents DESC;

COMMENT ON DATABASE calos IS 'CalOS - Usage-based platform licensing';

/**
 * Migration 140: Ad Gateway - Campaign Management System
 *
 * Enables:
 * - Advertising campaigns with budget tracking
 * - A/B testing across AI models and verticals
 * - BYOK integration (use client's API keys or platform keys)
 * - Conversion tracking and attribution
 * - Revenue sharing with affiliates
 *
 * Business Model:
 * - Agencies bring ad budgets
 * - We A/B test across our AI infrastructure
 * - Track conversions and optimize automatically
 * - Revenue: Commission + API markup + platform fees
 */

-- ============================================================================
-- AD CAMPAIGNS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ad_campaigns (
  campaign_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  advertiser_id UUID, -- Can link to affiliates table when it exists
  tenant_id UUID, -- Can link to tenants table when it exists
  created_by UUID, -- Can link to users table when it exists

  -- Campaign details
  campaign_name VARCHAR(200) NOT NULL,
  campaign_description TEXT,
  campaign_type VARCHAR(50) DEFAULT 'ai_chatbot', -- 'ai_chatbot', 'email', 'social', 'mixed'

  -- Targeting
  target_vertical VARCHAR(50), -- 'crypto', 'publishing', 'gaming', 'dev_tools', 'all'
  target_audience JSONB DEFAULT '{}', -- {"age_range": "25-45", "interests": ["ai", "crypto"]}

  -- Creative assets
  ad_copy TEXT,
  ad_creative_url VARCHAR(500),
  call_to_action VARCHAR(200),
  landing_page_url VARCHAR(500),

  -- Budget and spending
  budget_cents INTEGER NOT NULL,
  daily_budget_cents INTEGER,
  spent_cents INTEGER DEFAULT 0,
  remaining_cents INTEGER GENERATED ALWAYS AS (budget_cents - spent_cents) STORED,

  -- API Keys (BYOK integration)
  use_client_keys BOOLEAN DEFAULT false, -- Use client's own API keys
  client_has_openai BOOLEAN DEFAULT false,
  client_has_anthropic BOOLEAN DEFAULT false,
  client_has_deepseek BOOLEAN DEFAULT false,

  -- A/B Testing
  experiment_id INTEGER REFERENCES experiments(id), -- Link to experiment system
  auto_optimize BOOLEAN DEFAULT true, -- Auto-adjust traffic to winning variants

  -- Performance tracking
  total_impressions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5, 4) GENERATED ALWAYS AS (
    CASE WHEN total_clicks > 0
      THEN total_conversions::DECIMAL / total_clicks
      ELSE 0
    END
  ) STORED,

  -- Revenue tracking
  total_revenue_cents INTEGER DEFAULT 0,
  total_cost_cents INTEGER DEFAULT 0, -- AI API costs + platform fees
  total_profit_cents INTEGER GENERATED ALWAYS AS (total_revenue_cents - total_cost_cents) STORED,

  -- Pricing model
  pricing_model VARCHAR(50) DEFAULT 'commission', -- 'commission', 'cpc', 'cpm', 'cpa', 'hybrid'
  commission_rate DECIMAL(5, 4) DEFAULT 0.25, -- 25% commission
  cpc_cents INTEGER, -- Cost per click (if using CPC model)
  cpm_cents INTEGER, -- Cost per 1000 impressions (if using CPM model)
  cpa_cents INTEGER, -- Cost per acquisition (if using CPA model)

  -- Status
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed', 'cancelled'

  -- Schedule
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,

  -- Metadata
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_campaigns_advertiser ON ad_campaigns(advertiser_id);
CREATE INDEX idx_campaigns_tenant ON ad_campaigns(tenant_id);
CREATE INDEX idx_campaigns_status ON ad_campaigns(status);
CREATE INDEX idx_campaigns_vertical ON ad_campaigns(target_vertical);
CREATE INDEX idx_campaigns_experiment ON ad_campaigns(experiment_id);
CREATE INDEX idx_campaigns_active ON ad_campaigns(status, starts_at, ends_at);

-- ============================================================================
-- CAMPAIGN CONVERSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaign_conversions (
  conversion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Campaign linkage
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(campaign_id),
  experiment_id INTEGER REFERENCES experiments(id),
  variant_id INTEGER REFERENCES experiment_variants(id),

  -- Affiliate linkage (for revenue sharing)
  referral_id UUID REFERENCES affiliate_referrals(referral_id),
  commission_id UUID REFERENCES affiliate_commissions(commission_id),

  -- Conversion details
  conversion_type VARCHAR(50) NOT NULL, -- 'click', 'signup', 'purchase', 'subscription'
  conversion_value_cents INTEGER DEFAULT 0,

  -- Attribution
  user_id UUID REFERENCES users(user_id),
  session_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  referrer VARCHAR(500),

  -- AI interaction details
  ai_provider VARCHAR(50), -- 'openai', 'anthropic', 'deepseek', 'ollama'
  ai_model VARCHAR(100),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  ai_cost_cents INTEGER DEFAULT 0,

  -- Costs
  platform_fee_cents INTEGER DEFAULT 0,
  total_cost_cents INTEGER DEFAULT 0,

  -- Revenue attribution
  revenue_cents INTEGER DEFAULT 0,
  commission_cents INTEGER DEFAULT 0,
  profit_cents INTEGER GENERATED ALWAYS AS (revenue_cents - total_cost_cents - commission_cents) STORED,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  converted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_conversions_campaign ON campaign_conversions(campaign_id);
CREATE INDEX idx_conversions_variant ON campaign_conversions(variant_id);
CREATE INDEX idx_conversions_type ON campaign_conversions(conversion_type);
CREATE INDEX idx_conversions_date ON campaign_conversions(converted_at);
CREATE INDEX idx_conversions_user ON campaign_conversions(user_id);

-- ============================================================================
-- CAMPAIGN VARIANTS TABLE (A/B Test Variants)
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaign_variants (
  variant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  campaign_id UUID NOT NULL REFERENCES ad_campaigns(campaign_id),
  experiment_variant_id INTEGER REFERENCES experiment_variants(id),

  -- Variant details
  variant_name VARCHAR(100) NOT NULL,
  variant_description TEXT,

  -- AI configuration for this variant
  ai_provider VARCHAR(50), -- 'openai', 'anthropic', 'deepseek', 'ollama'
  ai_model VARCHAR(100), -- 'gpt-4', 'claude-3-sonnet', etc.
  system_prompt TEXT,
  temperature DECIMAL(3, 2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 500,

  -- Traffic allocation
  traffic_weight DECIMAL(5, 4) DEFAULT 0.33, -- 33% traffic

  -- Performance metrics
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue_cents INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,

  -- Calculated metrics
  ctr DECIMAL(5, 4) GENERATED ALWAYS AS (
    CASE WHEN impressions > 0
      THEN clicks::DECIMAL / impressions
      ELSE 0
    END
  ) STORED,

  conversion_rate DECIMAL(5, 4) GENERATED ALWAYS AS (
    CASE WHEN clicks > 0
      THEN conversions::DECIMAL / clicks
      ELSE 0
    END
  ) STORED,

  roi DECIMAL(10, 4) GENERATED ALWAYS AS (
    CASE WHEN cost_cents > 0
      THEN (revenue_cents - cost_cents)::DECIMAL / cost_cents
      ELSE 0
    END
  ) STORED,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_winner BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_variants_campaign ON campaign_variants(campaign_id);
CREATE INDEX idx_variants_active ON campaign_variants(is_active);
CREATE INDEX idx_variants_winner ON campaign_variants(is_winner);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

/**
 * Track campaign impression
 */
CREATE OR REPLACE FUNCTION track_campaign_impression(
  campaign_uuid UUID,
  variant_uuid UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE ad_campaigns
  SET total_impressions = total_impressions + 1,
      updated_at = NOW()
  WHERE campaign_id = campaign_uuid;

  IF variant_uuid IS NOT NULL THEN
    UPDATE campaign_variants
    SET impressions = impressions + 1,
        updated_at = NOW()
    WHERE variant_id = variant_uuid;
  END IF;
END;
$$ LANGUAGE plpgsql;

/**
 * Track campaign click
 */
CREATE OR REPLACE FUNCTION track_campaign_click(
  campaign_uuid UUID,
  variant_uuid UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE ad_campaigns
  SET total_clicks = total_clicks + 1,
      updated_at = NOW()
  WHERE campaign_id = campaign_uuid;

  IF variant_uuid IS NOT NULL THEN
    UPDATE campaign_variants
    SET clicks = clicks + 1,
        updated_at = NOW()
    WHERE variant_id = variant_uuid;
  END IF;
END;
$$ LANGUAGE plpgsql;

/**
 * Record campaign conversion with full attribution
 */
CREATE OR REPLACE FUNCTION record_campaign_conversion(
  campaign_uuid UUID,
  variant_uuid UUID,
  conversion_type_param VARCHAR(50),
  conversion_value_cents_param INTEGER,
  ai_cost_cents_param INTEGER DEFAULT 0,
  metadata_param JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  conversion_uuid UUID;
  campaign_record RECORD;
  commission_cents_calc INTEGER;
  platform_fee_cents_calc INTEGER;
BEGIN
  -- Get campaign details
  SELECT * INTO campaign_record
  FROM ad_campaigns
  WHERE campaign_id = campaign_uuid;

  -- Calculate commission (if using commission model)
  IF campaign_record.pricing_model IN ('commission', 'hybrid') THEN
    commission_cents_calc := FLOOR(conversion_value_cents_param * campaign_record.commission_rate);
  ELSE
    commission_cents_calc := 0;
  END IF;

  -- Calculate platform fee (5% of AI costs if using client keys, 50% markup if using platform keys)
  IF campaign_record.use_client_keys THEN
    platform_fee_cents_calc := FLOOR(ai_cost_cents_param * 0.05);
  ELSE
    platform_fee_cents_calc := FLOOR(ai_cost_cents_param * 0.5);
  END IF;

  -- Record conversion
  INSERT INTO campaign_conversions (
    campaign_id,
    variant_id,
    conversion_type,
    conversion_value_cents,
    ai_cost_cents,
    platform_fee_cents,
    total_cost_cents,
    revenue_cents,
    commission_cents,
    metadata
  )
  VALUES (
    campaign_uuid,
    variant_uuid,
    conversion_type_param,
    conversion_value_cents_param,
    ai_cost_cents_param,
    platform_fee_cents_calc,
    ai_cost_cents_param + platform_fee_cents_calc,
    conversion_value_cents_param,
    commission_cents_calc,
    metadata_param
  )
  RETURNING conversion_id INTO conversion_uuid;

  -- Update campaign stats
  UPDATE ad_campaigns
  SET total_conversions = total_conversions + 1,
      total_revenue_cents = total_revenue_cents + conversion_value_cents_param,
      total_cost_cents = total_cost_cents + ai_cost_cents_param + platform_fee_cents_calc,
      spent_cents = spent_cents + ai_cost_cents_param + platform_fee_cents_calc,
      updated_at = NOW()
  WHERE campaign_id = campaign_uuid;

  -- Update variant stats
  UPDATE campaign_variants
  SET conversions = conversions + 1,
      revenue_cents = revenue_cents + conversion_value_cents_param,
      cost_cents = cost_cents + ai_cost_cents_param + platform_fee_cents_calc,
      updated_at = NOW()
  WHERE variant_id = variant_uuid;

  RETURN conversion_uuid;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Campaign performance dashboard
CREATE OR REPLACE VIEW campaign_performance AS
SELECT
  c.campaign_id,
  c.campaign_name,
  c.advertiser_id,
  c.target_vertical,
  c.status,
  c.use_client_keys,

  -- Budget
  ROUND(c.budget_cents::NUMERIC / 100, 2) AS budget_dollars,
  ROUND(c.spent_cents::NUMERIC / 100, 2) AS spent_dollars,
  ROUND(c.remaining_cents::NUMERIC / 100, 2) AS remaining_dollars,

  -- Performance
  c.total_impressions,
  c.total_clicks,
  c.total_conversions,
  ROUND(c.conversion_rate * 100, 2) AS conversion_rate_percent,

  -- Revenue
  ROUND(c.total_revenue_cents::NUMERIC / 100, 2) AS revenue_dollars,
  ROUND(c.total_cost_cents::NUMERIC / 100, 2) AS cost_dollars,
  ROUND(c.total_profit_cents::NUMERIC / 100, 2) AS profit_dollars,

  -- ROI
  CASE
    WHEN c.total_cost_cents > 0 THEN
      ROUND((c.total_profit_cents::NUMERIC / c.total_cost_cents * 100), 2)
    ELSE 0
  END AS roi_percent,

  c.starts_at,
  c.ends_at,
  c.created_at

FROM ad_campaigns c
ORDER BY c.created_at DESC;

-- Variant performance comparison
CREATE OR REPLACE VIEW variant_performance AS
SELECT
  v.variant_id,
  v.campaign_id,
  v.variant_name,
  v.ai_provider,
  v.ai_model,
  v.traffic_weight,

  v.impressions,
  v.clicks,
  v.conversions,
  ROUND(v.ctr * 100, 2) AS ctr_percent,
  ROUND(v.conversion_rate * 100, 2) AS conversion_rate_percent,
  ROUND(v.roi * 100, 2) AS roi_percent,

  ROUND(v.revenue_cents::NUMERIC / 100, 2) AS revenue_dollars,
  ROUND(v.cost_cents::NUMERIC / 100, 2) AS cost_dollars,

  v.is_winner,
  v.is_active

FROM campaign_variants v
ORDER BY v.campaign_id, v.conversions DESC;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE ad_campaigns IS 'Advertising campaigns with A/B testing and budget tracking';
COMMENT ON TABLE campaign_conversions IS 'Conversion events with full attribution and revenue tracking';
COMMENT ON TABLE campaign_variants IS 'A/B test variants for campaigns with AI model configurations';

COMMENT ON FUNCTION track_campaign_impression IS 'Track impression for campaign and variant';
COMMENT ON FUNCTION track_campaign_click IS 'Track click for campaign and variant';
COMMENT ON FUNCTION record_campaign_conversion IS 'Record conversion with revenue attribution and commission calculation';

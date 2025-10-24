/**
 * Migration 043: User Tiers & Usage Quotas
 *
 * Implements 3-tier access model (League of Legends / Lichess style):
 * - Developer: Unlimited free access
 * - Free: Limited to Ollama models only
 * - Paid: Pay-as-you-go credits for all models
 *
 * Prevents runaway API costs while enabling monetization.
 */

-- ============================================================================
-- 1. ADD USER TIERS TO USERS TABLE
-- ============================================================================

-- Add tier column if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='users' AND column_name='tier') THEN
    ALTER TABLE users ADD COLUMN tier VARCHAR(20) DEFAULT 'free';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);

COMMENT ON COLUMN users.tier IS 'User access tier: developer, free, paid';

-- ============================================================================
-- 2. TIER CONFIGURATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_tier_configs (
  tier VARCHAR(20) PRIMARY KEY,

  -- Display info
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Daily limits
  max_queries_per_day INTEGER, -- NULL = unlimited
  max_tokens_per_day INTEGER,   -- NULL = unlimited

  -- Model access
  allowed_providers TEXT[], -- ['ollama', 'claude-code', 'openai', 'anthropic', 'deepseek']
  allowed_models TEXT[],    -- Specific models or NULL = all from provider

  -- Cost controls
  requires_credits BOOLEAN DEFAULT FALSE,
  cost_per_query_cents INTEGER DEFAULT 0, -- How many credits to deduct per query

  -- Features
  has_priority_queue BOOLEAN DEFAULT FALSE,
  has_faster_response BOOLEAN DEFAULT FALSE,
  can_use_streaming BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default tier configurations
INSERT INTO user_tier_configs (tier, name, description, max_queries_per_day, max_tokens_per_day, allowed_providers, requires_credits, cost_per_query_cents) VALUES
  ('developer', 'Developer', 'Unlimited access for platform developers', NULL, NULL, ARRAY['ollama', 'claude-code', 'openai', 'anthropic', 'deepseek'], FALSE, 0),
  ('free', 'Free Tier', 'Limited access to local models only', 100, 50000, ARRAY['ollama'], FALSE, 0),
  ('paid', 'Paid Tier', 'Pay-as-you-go credits for all models', NULL, NULL, ARRAY['ollama', 'claude-code', 'openai', 'anthropic', 'deepseek'], TRUE, 10)
ON CONFLICT (tier) DO NOTHING;

COMMENT ON TABLE user_tier_configs IS 'Configuration for each user tier';

-- ============================================================================
-- 3. DAILY USAGE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_daily_usage (
  usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Date tracking (UTC)
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Usage counters
  queries_count INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,

  -- Breakdown by provider
  queries_by_provider JSONB DEFAULT '{}', -- { "ollama": 45, "openai": 5 }
  tokens_by_provider JSONB DEFAULT '{}',  -- { "ollama": 12000, "openai": 5000 }
  cost_by_provider JSONB DEFAULT '{}',    -- { "openai": 50, "anthropic": 100 }

  -- Timestamps
  first_query_at TIMESTAMPTZ,
  last_query_at TIMESTAMPTZ,

  -- Unique constraint: one row per user per day
  UNIQUE(user_id, usage_date)
);

CREATE INDEX idx_user_daily_usage_user ON user_daily_usage(user_id, usage_date DESC);
CREATE INDEX idx_user_daily_usage_date ON user_daily_usage(usage_date DESC);

COMMENT ON TABLE user_daily_usage IS 'Track daily API usage per user for quota enforcement';

-- ============================================================================
-- 4. USAGE EVENTS (Detailed Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Request details
  provider VARCHAR(50) NOT NULL, -- 'ollama', 'openai', etc.
  model VARCHAR(100) NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,

  -- Cost tracking
  cost_cents INTEGER DEFAULT 0,

  -- Performance
  latency_ms INTEGER,

  -- Status
  status VARCHAR(20) NOT NULL, -- 'success', 'error', 'blocked'
  error_message TEXT,

  -- Metadata
  task_type VARCHAR(50), -- 'code', 'creative', 'reasoning', etc.
  ip_address INET,
  user_agent TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_events_user ON usage_events(user_id, created_at DESC);
CREATE INDEX idx_usage_events_provider ON usage_events(provider);
CREATE INDEX idx_usage_events_status ON usage_events(status);
CREATE INDEX idx_usage_events_date ON usage_events(created_at DESC);

COMMENT ON TABLE usage_events IS 'Detailed log of every API request for analytics';

-- ============================================================================
-- 5. COST ALERTS (Budget Monitoring)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cost_alerts (
  alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Alert configuration
  alert_type VARCHAR(50) NOT NULL, -- 'daily_limit', 'weekly_limit', 'monthly_limit', 'low_balance'
  threshold_cents INTEGER NOT NULL,

  -- Who to alert
  user_id UUID REFERENCES users(user_id), -- NULL = system-wide alert
  notification_method VARCHAR(50) NOT NULL, -- 'email', 'webhook', 'log'
  notification_target TEXT, -- Email address or webhook URL

  -- Status
  enabled BOOLEAN DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,

  -- Cooldown (don't spam alerts)
  cooldown_hours INTEGER DEFAULT 24,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cost_alerts_user ON cost_alerts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_cost_alerts_enabled ON cost_alerts(enabled) WHERE enabled = TRUE;

COMMENT ON TABLE cost_alerts IS 'Alert when usage exceeds budget thresholds';

-- ============================================================================
-- 6. PROVIDER RATE LIMITS (Per-User)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_rate_limits (
  limit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,

  -- Rate limit window
  window_seconds INTEGER NOT NULL DEFAULT 60, -- 60s = 1 minute
  max_requests INTEGER NOT NULL,

  -- Current window tracking
  current_window_start TIMESTAMPTZ,
  current_window_count INTEGER DEFAULT 0,

  -- Status
  enabled BOOLEAN DEFAULT TRUE,

  UNIQUE(user_id, provider)
);

CREATE INDEX idx_user_rate_limits_user ON user_rate_limits(user_id);

COMMENT ON TABLE user_rate_limits IS 'Per-user, per-provider rate limiting';

-- ============================================================================
-- 7. FUNCTIONS FOR USAGE TRACKING
-- ============================================================================

-- Function to increment daily usage
CREATE OR REPLACE FUNCTION increment_daily_usage(
  p_user_id UUID,
  p_provider VARCHAR(50),
  p_tokens INTEGER,
  p_cost_cents INTEGER
) RETURNS VOID AS $$
BEGIN
  INSERT INTO user_daily_usage (
    user_id,
    usage_date,
    queries_count,
    tokens_used,
    cost_cents,
    queries_by_provider,
    tokens_by_provider,
    cost_by_provider,
    first_query_at,
    last_query_at
  ) VALUES (
    p_user_id,
    CURRENT_DATE,
    1,
    p_tokens,
    p_cost_cents,
    jsonb_build_object(p_provider, 1),
    jsonb_build_object(p_provider, p_tokens),
    jsonb_build_object(p_provider, p_cost_cents),
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET
    queries_count = user_daily_usage.queries_count + 1,
    tokens_used = user_daily_usage.tokens_used + p_tokens,
    cost_cents = user_daily_usage.cost_cents + p_cost_cents,
    queries_by_provider = user_daily_usage.queries_by_provider ||
      jsonb_build_object(p_provider, COALESCE((user_daily_usage.queries_by_provider->>p_provider)::INTEGER, 0) + 1),
    tokens_by_provider = user_daily_usage.tokens_by_provider ||
      jsonb_build_object(p_provider, COALESCE((user_daily_usage.tokens_by_provider->>p_provider)::INTEGER, 0) + p_tokens),
    cost_by_provider = user_daily_usage.cost_by_provider ||
      jsonb_build_object(p_provider, COALESCE((user_daily_usage.cost_by_provider->>p_provider)::INTEGER, 0) + p_cost_cents),
    last_query_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to check if user is over quota
CREATE OR REPLACE FUNCTION is_user_over_quota(
  p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_tier VARCHAR(20);
  v_max_queries INTEGER;
  v_current_queries INTEGER;
BEGIN
  -- Get user tier
  SELECT tier INTO v_tier FROM users WHERE user_id = p_user_id;

  -- Get tier limits
  SELECT max_queries_per_day INTO v_max_queries
  FROM user_tier_configs
  WHERE tier = v_tier;

  -- NULL = unlimited
  IF v_max_queries IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get current usage
  SELECT COALESCE(queries_count, 0) INTO v_current_queries
  FROM user_daily_usage
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE;

  RETURN v_current_queries >= v_max_queries;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_daily_usage IS 'Atomically increment user daily usage counters';
COMMENT ON FUNCTION is_user_over_quota IS 'Check if user has exceeded their daily quota';

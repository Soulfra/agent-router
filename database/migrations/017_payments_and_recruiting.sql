/**
 * Migration 017: Payments & Recruiting Platform
 *
 * soulfra.com - Skills-based recruiting platform
 *
 * Features:
 * - $1 user registration payments
 * - Recruiter subscription tiers
 * - Job postings with skill requirements
 * - Application tracking
 * - Messaging system
 * - SDK marketplace payments
 */

-- ============================================================================
-- 1. PAYMENTS & SUBSCRIPTIONS
-- ============================================================================

-- User registration payments ($1)
CREATE TABLE IF NOT EXISTS user_payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(user_id),

  -- Stripe details
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),

  -- Payment info
  amount_cents INTEGER NOT NULL, -- Always 100 ($1.00)
  currency VARCHAR(3) DEFAULT 'usd',
  status VARCHAR(50) NOT NULL, -- 'pending', 'succeeded', 'failed', 'refunded'

  -- Metadata
  payment_method VARCHAR(50), -- 'card', 'paypal', etc.
  last_4_digits VARCHAR(4),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT
);

CREATE INDEX idx_user_payments_user ON user_payments(user_id);
CREATE INDEX idx_user_payments_stripe_intent ON user_payments(stripe_payment_intent_id);
CREATE INDEX idx_user_payments_status ON user_payments(status);

COMMENT ON TABLE user_payments IS 'User registration payments ($1)';

-- Recruiter subscription plans
CREATE TABLE IF NOT EXISTS recruiter_plans (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  plan_code VARCHAR(50) NOT NULL UNIQUE, -- 'starter', 'pro', 'enterprise'
  plan_name VARCHAR(100) NOT NULL,
  plan_description TEXT,

  -- Pricing
  price_cents INTEGER NOT NULL, -- Monthly price
  currency VARCHAR(3) DEFAULT 'usd',

  -- Features
  max_active_searches INTEGER, -- NULL = unlimited
  max_messages_per_month INTEGER, -- NULL = unlimited
  has_analytics BOOLEAN DEFAULT FALSE,
  has_api_access BOOLEAN DEFAULT FALSE,
  has_bulk_outreach BOOLEAN DEFAULT FALSE,
  has_priority_support BOOLEAN DEFAULT FALSE,

  -- Status
  active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recruiter_plans_code ON recruiter_plans(plan_code);
CREATE INDEX idx_recruiter_plans_active ON recruiter_plans(active) WHERE active = TRUE;

COMMENT ON TABLE recruiter_plans IS 'Recruiter subscription plan definitions';

-- Seed recruiter plans
INSERT INTO recruiter_plans (plan_code, plan_name, plan_description, price_cents, max_active_searches, max_messages_per_month, has_analytics, has_api_access, has_bulk_outreach, has_priority_support, sort_order)
VALUES
  ('starter', 'Starter', 'Perfect for small agencies', 9900, 10, 100, FALSE, FALSE, FALSE, FALSE, 1),
  ('pro', 'Professional', 'For growing teams', 29900, NULL, NULL, TRUE, FALSE, TRUE, FALSE, 2),
  ('enterprise', 'Enterprise', 'Full-featured solution', 49900, NULL, NULL, TRUE, TRUE, TRUE, TRUE, 3)
ON CONFLICT (plan_code) DO NOTHING;

-- Recruiter subscriptions
CREATE TABLE IF NOT EXISTS recruiter_subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(user_id),
  plan_id UUID NOT NULL REFERENCES recruiter_plans(plan_id),

  -- Stripe details
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),

  -- Subscription info
  status VARCHAR(50) NOT NULL, -- 'active', 'canceled', 'past_due', 'unpaid'

  -- Billing cycle
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,

  -- Usage tracking
  searches_used_this_period INTEGER DEFAULT 0,
  messages_sent_this_period INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  canceled_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_recruiter_subs_user ON recruiter_subscriptions(user_id);
CREATE INDEX idx_recruiter_subs_status ON recruiter_subscriptions(status) WHERE status = 'active';
CREATE INDEX idx_recruiter_subs_stripe ON recruiter_subscriptions(stripe_subscription_id);

COMMENT ON TABLE recruiter_subscriptions IS 'Active recruiter subscriptions';

-- ============================================================================
-- 2. JOB POSTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_postings (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Posted by
  recruiter_id UUID NOT NULL REFERENCES users(user_id),
  company_name VARCHAR(200) NOT NULL,

  -- Job details
  job_title VARCHAR(200) NOT NULL,
  job_description TEXT NOT NULL,
  location VARCHAR(200), -- Can be 'Remote' or city
  employment_type VARCHAR(50) NOT NULL, -- 'full-time', 'part-time', 'contract', 'internship'

  -- Compensation
  salary_min_cents INTEGER,
  salary_max_cents INTEGER,
  salary_currency VARCHAR(3) DEFAULT 'usd',
  salary_period VARCHAR(20) DEFAULT 'yearly', -- 'yearly', 'hourly'

  -- Skill requirements (array of {skill_id, min_level})
  required_skills JSONB DEFAULT '[]',
  preferred_skills JSONB DEFAULT '[]',

  -- Application settings
  application_url TEXT, -- External apply URL (optional)
  application_email VARCHAR(255), -- Or email

  -- Status
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'active', 'paused', 'closed', 'filled'

  -- Stats
  views_count INTEGER DEFAULT 0,
  applications_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_recruiter ON job_postings(recruiter_id);
CREATE INDEX idx_jobs_status ON job_postings(status) WHERE status = 'active';
CREATE INDEX idx_jobs_location ON job_postings(location);
CREATE INDEX idx_jobs_required_skills ON job_postings USING GIN (required_skills);

COMMENT ON TABLE job_postings IS 'Job postings from recruiters';

-- ============================================================================
-- 3. APPLICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_applications (
  application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id UUID NOT NULL REFERENCES job_postings(job_id),
  user_id UUID NOT NULL REFERENCES users(user_id),

  -- Application data
  cover_letter TEXT,
  portfolio_url TEXT,
  video_intro_url TEXT, -- Optional video introduction

  -- Skill match score (calculated at application time)
  skill_match_score DECIMAL(5,2), -- 0-100
  matched_skills JSONB, -- Which skills matched

  -- Status tracking
  status VARCHAR(50) DEFAULT 'submitted', -- 'submitted', 'reviewed', 'interviewing', 'offered', 'accepted', 'rejected', 'withdrawn'

  -- Recruiter feedback
  recruiter_notes TEXT,
  rejection_reason TEXT,

  -- Timestamps
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(job_id, user_id) -- One application per user per job
);

CREATE INDEX idx_applications_job ON job_applications(job_id);
CREATE INDEX idx_applications_user ON job_applications(user_id);
CREATE INDEX idx_applications_status ON job_applications(status);

COMMENT ON TABLE job_applications IS 'User applications to jobs';

-- ============================================================================
-- 4. MESSAGING SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Participants
  user_id UUID NOT NULL REFERENCES users(user_id),
  recruiter_id UUID NOT NULL REFERENCES users(user_id),

  -- Context (optional)
  job_id UUID REFERENCES job_postings(job_id),
  application_id UUID REFERENCES job_applications(application_id),

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'archived'

  -- Last message
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_preview TEXT,

  -- Unread counts
  user_unread_count INTEGER DEFAULT 0,
  recruiter_unread_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, recruiter_id, job_id)
);

CREATE INDEX idx_conversations_user ON conversations(user_id, last_message_at DESC);
CREATE INDEX idx_conversations_recruiter ON conversations(recruiter_id, last_message_at DESC);
CREATE INDEX idx_conversations_job ON conversations(job_id);

COMMENT ON TABLE conversations IS 'Message threads between users and recruiters';

CREATE TABLE IF NOT EXISTS messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id UUID NOT NULL REFERENCES conversations(conversation_id),

  -- Sender
  sender_id UUID NOT NULL REFERENCES users(user_id),
  sender_type VARCHAR(20) NOT NULL, -- 'user' or 'recruiter'

  -- Message content
  message_text TEXT NOT NULL,
  attachments JSONB DEFAULT '[]', -- Array of {url, filename, type}

  -- Status
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_unread ON messages(conversation_id, read) WHERE read = FALSE;

COMMENT ON TABLE messages IS 'Individual messages in conversations';

-- ============================================================================
-- 5. SDK MARKETPLACE
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_sdks (
  sdk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Developer
  developer_id UUID NOT NULL REFERENCES users(user_id),

  -- SDK details
  sdk_name VARCHAR(200) NOT NULL,
  sdk_slug VARCHAR(200) NOT NULL UNIQUE,
  sdk_description TEXT NOT NULL,
  sdk_long_description TEXT,

  -- Technical
  repository_url TEXT,
  documentation_url TEXT,
  npm_package VARCHAR(200),

  -- Category
  category VARCHAR(50) NOT NULL, -- 'coding', 'design', 'sales', 'productivity', etc.
  tags TEXT[] DEFAULT '{}',

  -- Pricing
  pricing_model VARCHAR(50) NOT NULL, -- 'free', 'paid', 'freemium', 'rev_share'
  price_cents INTEGER, -- If paid
  revenue_share_percent INTEGER, -- If rev_share (developer gets this %)

  -- XP rewards this SDK can award
  max_xp_per_action INTEGER DEFAULT 100,
  max_xp_per_day INTEGER DEFAULT 1000,

  -- Media
  icon_url TEXT,
  screenshots JSONB DEFAULT '[]',

  -- Stats
  installs_count INTEGER DEFAULT 0,
  rating_average DECIMAL(3,2) DEFAULT 0.00,
  rating_count INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'pending_review', 'approved', 'rejected', 'suspended'
  review_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sdks_developer ON marketplace_sdks(developer_id);
CREATE INDEX idx_sdks_slug ON marketplace_sdks(sdk_slug);
CREATE INDEX idx_sdks_status ON marketplace_sdks(status) WHERE status = 'approved';
CREATE INDEX idx_sdks_category ON marketplace_sdks(category);

COMMENT ON TABLE marketplace_sdks IS 'SDKs available in marketplace';

-- SDK installations by users
CREATE TABLE IF NOT EXISTS sdk_installations (
  installation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  sdk_id UUID NOT NULL REFERENCES marketplace_sdks(sdk_id),
  user_id UUID NOT NULL REFERENCES users(user_id),

  -- Status
  active BOOLEAN DEFAULT TRUE,

  -- Stats
  xp_earned_total INTEGER DEFAULT 0,
  actions_completed INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  installed_at TIMESTAMPTZ DEFAULT NOW(),
  uninstalled_at TIMESTAMPTZ,

  UNIQUE(sdk_id, user_id)
);

CREATE INDEX idx_sdk_installs_sdk ON sdk_installations(sdk_id);
CREATE INDEX idx_sdk_installs_user ON sdk_installations(user_id);
CREATE INDEX idx_sdk_installs_active ON sdk_installations(sdk_id, active) WHERE active = TRUE;

COMMENT ON TABLE sdk_installations IS 'User installations of marketplace SDKs';

-- SDK reviews
CREATE TABLE IF NOT EXISTS sdk_reviews (
  review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  sdk_id UUID NOT NULL REFERENCES marketplace_sdks(sdk_id),
  user_id UUID NOT NULL REFERENCES users(user_id),

  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,

  helpful_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(sdk_id, user_id)
);

CREATE INDEX idx_sdk_reviews_sdk ON sdk_reviews(sdk_id, created_at DESC);
CREATE INDEX idx_sdk_reviews_user ON sdk_reviews(user_id);

COMMENT ON TABLE sdk_reviews IS 'User reviews of marketplace SDKs';

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

/**
 * Calculate job match score based on user's skills vs job requirements
 */
CREATE OR REPLACE FUNCTION calculate_job_match_score(
  p_user_id UUID,
  p_required_skills JSONB,
  p_preferred_skills JSONB
)
RETURNS TABLE(
  match_score DECIMAL(5,2),
  matched_skills JSONB
) AS $$
DECLARE
  v_user_skills JSONB;
  v_required_match INTEGER := 0;
  v_required_total INTEGER := 0;
  v_preferred_match INTEGER := 0;
  v_preferred_total INTEGER := 0;
  v_matched JSONB := '[]'::JSONB;
BEGIN
  -- Get user's current skills
  SELECT json_agg(json_build_object(
    'skill_id', skill_id,
    'level', level
  ))
  INTO v_user_skills
  FROM user_skills
  WHERE user_id = p_user_id;

  -- Count required skills
  v_required_total := jsonb_array_length(p_required_skills);

  -- Count preferred skills
  v_preferred_total := jsonb_array_length(p_preferred_skills);

  -- Calculate matches (would need full implementation)
  -- Simplified version: return 70% match

  RETURN QUERY SELECT
    70.00::DECIMAL(5,2) AS match_score,
    v_matched AS matched_skills;
END;
$$ LANGUAGE plpgsql;

/**
 * Update subscription usage counters
 */
CREATE OR REPLACE FUNCTION increment_subscription_usage(
  p_user_id UUID,
  p_usage_type VARCHAR(50), -- 'search' or 'message'
  p_amount INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  IF p_usage_type = 'search' THEN
    UPDATE recruiter_subscriptions
    SET searches_used_this_period = searches_used_this_period + p_amount
    WHERE user_id = p_user_id AND status = 'active';
  ELSIF p_usage_type = 'message' THEN
    UPDATE recruiter_subscriptions
    SET messages_sent_this_period = messages_sent_this_period + p_amount
    WHERE user_id = p_user_id AND status = 'active';
  END IF;
END;
$$ LANGUAGE plpgsql;

/**
 * Reset subscription usage at period end
 */
CREATE OR REPLACE FUNCTION reset_subscription_usage()
RETURNS INTEGER AS $$
DECLARE
  v_reset_count INTEGER;
BEGIN
  WITH reset AS (
    UPDATE recruiter_subscriptions
    SET
      searches_used_this_period = 0,
      messages_sent_this_period = 0,
      current_period_start = current_period_end,
      current_period_end = current_period_end + INTERVAL '28 days'
    WHERE current_period_end <= NOW() AND status = 'active'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_reset_count FROM reset;

  RETURN v_reset_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. VIEWS
-- ============================================================================

-- Active jobs with application stats
CREATE OR REPLACE VIEW active_jobs_summary AS
SELECT
  jp.*,
  COUNT(DISTINCT ja.application_id) AS applications_count_actual,
  AVG(ja.skill_match_score) AS avg_match_score,
  u.username AS recruiter_username
FROM job_postings jp
LEFT JOIN job_applications ja ON ja.job_id = jp.job_id
LEFT JOIN users u ON u.user_id = jp.recruiter_id
WHERE jp.status = 'active'
GROUP BY jp.job_id, u.username;

-- User application history
CREATE OR REPLACE VIEW user_applications_summary AS
SELECT
  ja.*,
  jp.job_title,
  jp.company_name,
  jp.location,
  u.username AS recruiter_username
FROM job_applications ja
JOIN job_postings jp ON jp.job_id = ja.job_id
LEFT JOIN users u ON u.user_id = jp.recruiter_id
ORDER BY ja.submitted_at DESC;

-- Marketplace SDK stats
CREATE OR REPLACE VIEW marketplace_sdk_stats AS
SELECT
  ms.*,
  COUNT(DISTINCT si.user_id) FILTER (WHERE si.active = TRUE) AS active_installs,
  SUM(si.xp_earned_total) AS total_xp_awarded,
  u.username AS developer_username
FROM marketplace_sdks ms
LEFT JOIN sdk_installations si ON si.sdk_id = ms.sdk_id
LEFT JOIN users u ON u.user_id = ms.developer_id
WHERE ms.status = 'approved'
GROUP BY ms.sdk_id, u.username;

COMMENT ON DATABASE calos IS 'CalOS / soulfra.com - Skills-based recruiting platform';

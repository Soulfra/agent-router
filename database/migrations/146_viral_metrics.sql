-- Migration 146: Viral Performance & Revenue Tracking
--
-- Track ROI, virality metrics, and revenue across:
-- - 8 languages (en, es, zh, ja, pt, fr, de, hi, ar)
-- - 6 platforms (mastodon, blog, twitter, youtube, newsletter, podcast)
-- - Multiple personas (alice, bob, calriven, etc.)
--
-- Enables:
-- - Cost per 1000 impressions (CPM) tracking
-- - Virality score calculation
-- - Revenue attribution
-- - Budget allocation recommendations

-- Viral performance tracking
CREATE TABLE IF NOT EXISTS viral_performance_tracking (
  performance_id SERIAL PRIMARY KEY,
  post_id VARCHAR(255) UNIQUE NOT NULL,
  voice_session_id VARCHAR(255), -- References voice_journal_sessions.session_id

  -- Platform & language
  platform VARCHAR(50) NOT NULL, -- mastodon | blog | twitter | youtube | newsletter | podcast
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  persona VARCHAR(255), -- alice | bob | calriven | roughspark | etc.
  brand VARCHAR(50), -- soulfra | deathtodata | calriven | calos | etc.

  -- Cost tracking
  cost DECIMAL(10, 4) DEFAULT 0.00, -- Total cost to create & publish

  -- Engagement metrics
  views INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0, -- Bookmarks/saves
  clicks INTEGER DEFAULT 0, -- Click-throughs
  conversions INTEGER DEFAULT 0, -- Purchases/signups

  -- Derived metrics
  virality_score INTEGER, -- 0-100
  engagement_rate DECIMAL(10, 4), -- (likes+comments+shares)/views * 100
  click_through_rate DECIMAL(10, 4), -- clicks/views * 100
  estimated_revenue DECIMAL(10, 4), -- Based on revenue models
  roi DECIMAL(10, 2), -- (revenue - cost) / cost * 100

  tracked_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_viral_performance_platform ON viral_performance_tracking(platform);
CREATE INDEX idx_viral_performance_language ON viral_performance_tracking(language);
CREATE INDEX idx_viral_performance_persona ON viral_performance_tracking(persona);
CREATE INDEX idx_viral_performance_brand ON viral_performance_tracking(brand);
CREATE INDEX idx_viral_performance_session ON viral_performance_tracking(voice_session_id);
CREATE INDEX idx_viral_performance_tracked ON viral_performance_tracking(tracked_at DESC);
CREATE INDEX idx_viral_performance_roi ON viral_performance_tracking(roi DESC);

-- Revenue attribution models (configuration)
CREATE TABLE IF NOT EXISTS revenue_models (
  model_id SERIAL PRIMARY KEY,
  model_name VARCHAR(50) UNIQUE NOT NULL, -- adRevenue | affiliate | sponsorship | subscription
  enabled BOOLEAN DEFAULT TRUE,

  -- Model parameters
  cpm DECIMAL(10, 4), -- Cost per 1000 views
  cpv DECIMAL(10, 6), -- Cost per view
  conversion_rate DECIMAL(10, 6), -- Click-to-purchase rate
  avg_commission DECIMAL(10, 2), -- Average affiliate commission
  monthly_value DECIMAL(10, 2), -- Monthly subscription value
  avg_lifetime INTEGER, -- Average customer lifetime (months)

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default revenue models
INSERT INTO revenue_models (model_name, enabled, cpm, conversion_rate, avg_commission) VALUES
  ('adRevenue', true, 3.50, NULL, NULL),
  ('affiliate', true, NULL, 0.02, 25.00),
  ('sponsorship', false, NULL, NULL, NULL),
  ('subscription', false, NULL, 0.001, NULL)
ON CONFLICT (model_name) DO NOTHING;

-- Viral content patterns (for ML insights)
CREATE TABLE IF NOT EXISTS viral_content_patterns (
  pattern_id SERIAL PRIMARY KEY,
  platform VARCHAR(50) NOT NULL,
  language VARCHAR(10) NOT NULL,
  target_audience VARCHAR(50), -- tech | privacy | business | creative

  -- Pattern characteristics
  hook_pattern TEXT, -- "You won't believe..." | "Here's why..." | etc.
  emotional_trigger VARCHAR(50), -- curiosity | outrage | hope | fear | validation | humor
  hashtags JSONB DEFAULT '[]'::jsonb,
  optimal_length_min INTEGER,
  optimal_length_max INTEGER,
  best_post_hour INTEGER, -- 0-23

  -- Performance
  avg_virality DECIMAL(10, 2),
  avg_engagement DECIMAL(10, 2),
  avg_roi DECIMAL(10, 2),
  sample_count INTEGER DEFAULT 1,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(platform, language, target_audience, hook_pattern)
);

CREATE INDEX idx_viral_patterns_platform_lang ON viral_content_patterns(platform, language);
CREATE INDEX idx_viral_patterns_audience ON viral_content_patterns(target_audience);

-- Budget recommendations (historical tracking)
CREATE TABLE IF NOT EXISTS budget_recommendations (
  recommendation_id SERIAL PRIMARY KEY,
  dimension VARCHAR(50) NOT NULL, -- language | platform | persona | brand
  dimension_value VARCHAR(255) NOT NULL,

  recommended_allocation_pct DECIMAL(5, 2), -- Percentage of budget
  avg_roi DECIMAL(10, 2),
  reasoning TEXT,

  generated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_budget_recommendations_dimension ON budget_recommendations(dimension);
CREATE INDEX idx_budget_recommendations_generated ON budget_recommendations(generated_at DESC);

-- Comments
COMMENT ON TABLE viral_performance_tracking IS 'Track virality, engagement, and ROI per post across languages/platforms/personas';
COMMENT ON TABLE revenue_models IS 'Revenue attribution models (ad revenue, affiliate, sponsorship, subscription)';
COMMENT ON TABLE viral_content_patterns IS 'Machine learning insights: which patterns go viral';
COMMENT ON TABLE budget_recommendations IS 'Historical budget allocation recommendations';

COMMENT ON COLUMN viral_performance_tracking.virality_score IS '0-100 score based on shares, comments, saves, clicks weighted by factors';
COMMENT ON COLUMN viral_performance_tracking.roi IS 'Return on investment: (revenue - cost) / cost * 100';
COMMENT ON COLUMN revenue_models.cpm IS 'Cost per 1000 impressions (e.g., $3.50 for blog ads)';
COMMENT ON COLUMN viral_content_patterns.hook_pattern IS 'Viral hook template that performed well';

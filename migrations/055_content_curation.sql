-- Migration: Content Curation System
-- Purpose: Store user curation preferences and content aggregation configuration
-- Features: Multi-source content aggregation, topic filtering, newsletter generation

-- ============================================================================
-- CURATION CONFIGURATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS curation_configs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,

  -- Content preferences
  topics TEXT, -- JSON array of topics (ai, crypto, startups, etc.)
  sources TEXT, -- JSON array of source IDs (hackernews, reddit-programming, etc.)
  custom_rss TEXT, -- JSON array of custom RSS feed URLs

  -- Delivery settings
  frequency VARCHAR(50) DEFAULT 'daily', -- daily, weekly, realtime
  delivery_time TIME DEFAULT '09:00',
  email VARCHAR(255),

  -- Tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_fetched_at TIMESTAMP,

  UNIQUE(user_id)
);

-- Indexes
CREATE INDEX idx_curation_configs_user ON curation_configs(user_id);
CREATE INDEX idx_curation_configs_frequency ON curation_configs(frequency);

-- ============================================================================
-- CURATED CONTENT CACHE
-- ============================================================================

CREATE TABLE IF NOT EXISTS curated_content (
  id SERIAL PRIMARY KEY,

  -- Content metadata
  external_id VARCHAR(255) UNIQUE NOT NULL, -- Source-specific ID (e.g., hn-12345)
  title TEXT NOT NULL,
  url TEXT,
  description TEXT,
  content TEXT, -- Full content if available

  -- Source info
  source VARCHAR(100) NOT NULL, -- hackernews, reddit, rss, etc.
  source_icon VARCHAR(10),
  author VARCHAR(255),

  -- Engagement metrics
  score INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,

  -- Categorization
  topics TEXT, -- JSON array of extracted topics
  tags TEXT[], -- Additional tags

  -- Timestamps
  published_at TIMESTAMP,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Metadata
  metadata JSONB -- Source-specific extra data
);

-- Indexes
CREATE INDEX idx_curated_content_external_id ON curated_content(external_id);
CREATE INDEX idx_curated_content_source ON curated_content(source);
CREATE INDEX idx_curated_content_published ON curated_content(published_at DESC);
CREATE INDEX idx_curated_content_score ON curated_content(score DESC);
CREATE INDEX idx_curated_content_topics ON curated_content USING gin(to_tsvector('english', topics));

-- ============================================================================
-- USER READING HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS curation_reading_history (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  content_id INTEGER REFERENCES curated_content(id) ON DELETE CASCADE,

  -- Engagement
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_duration INTEGER, -- Seconds spent reading
  clicked BOOLEAN DEFAULT FALSE,
  bookmarked BOOLEAN DEFAULT FALSE,
  shared BOOLEAN DEFAULT FALSE,

  -- Feedback
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,

  UNIQUE(user_id, content_id)
);

-- Indexes
CREATE INDEX idx_reading_history_user ON curation_reading_history(user_id);
CREATE INDEX idx_reading_history_content ON curation_reading_history(content_id);
CREATE INDEX idx_reading_history_read_at ON curation_reading_history(read_at DESC);

-- ============================================================================
-- NEWSLETTER DELIVERY LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS newsletter_delivery_log (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  config_id INTEGER REFERENCES curation_configs(id) ON DELETE CASCADE,

  -- Delivery metadata
  delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  email VARCHAR(255),

  -- Content
  item_count INTEGER,
  content_ids INTEGER[], -- References to curated_content

  -- Status
  status VARCHAR(50) DEFAULT 'sent', -- sent, failed, bounced
  opened BOOLEAN DEFAULT FALSE,
  opened_at TIMESTAMP,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMP,

  -- Email service metadata
  email_service VARCHAR(50), -- sendgrid, mailgun, etc.
  email_id VARCHAR(255), -- Service-specific email ID

  error_message TEXT
);

-- Indexes
CREATE INDEX idx_newsletter_log_user ON newsletter_delivery_log(user_id);
CREATE INDEX idx_newsletter_log_delivered ON newsletter_delivery_log(delivered_at DESC);
CREATE INDEX idx_newsletter_log_status ON newsletter_delivery_log(status);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_curation_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_curation_configs_timestamp
  BEFORE UPDATE ON curation_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_curation_config_timestamp();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get curated feed for user based on preferences
CREATE OR REPLACE FUNCTION get_curated_feed(p_user_id VARCHAR, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id INTEGER,
  title TEXT,
  url TEXT,
  description TEXT,
  source VARCHAR,
  author VARCHAR,
  score INTEGER,
  comments INTEGER,
  published_at TIMESTAMP,
  topics TEXT
) AS $$
DECLARE
  user_topics TEXT;
  user_sources TEXT;
BEGIN
  -- Get user preferences
  SELECT topics, sources INTO user_topics, user_sources
  FROM curation_configs
  WHERE user_id = p_user_id;

  -- If no config, return empty
  IF user_topics IS NULL THEN
    RETURN;
  END IF;

  -- Return curated content matching user preferences
  RETURN QUERY
  SELECT
    c.id,
    c.title,
    c.url,
    c.description,
    c.source,
    c.author,
    c.score,
    c.comments,
    c.published_at,
    c.topics
  FROM curated_content c
  WHERE
    -- Match topics (if topics configured)
    (user_topics IS NULL OR c.topics::jsonb ?| (SELECT array_agg(value) FROM json_array_elements_text(user_topics::json)))
    -- Match sources (if sources configured)
    AND (user_sources IS NULL OR c.source = ANY(SELECT json_array_elements_text(user_sources::json)::text))
  ORDER BY
    c.published_at DESC,
    c.score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE curation_configs IS 'User content curation preferences and delivery settings';
COMMENT ON TABLE curated_content IS 'Cached aggregated content from all sources';
COMMENT ON TABLE curation_reading_history IS 'User engagement with curated content';
COMMENT ON TABLE newsletter_delivery_log IS 'Newsletter delivery tracking and analytics';

COMMENT ON FUNCTION get_curated_feed IS 'Get personalized curated feed based on user preferences';

-- Brand & Bot Engagement Analytics System
-- Tracks brand engagement, bot behavior, model preferences, and funny moments

-- ============================================================================
-- BOT BEHAVIOR TRACKING
-- ============================================================================

-- Bot personality switches (track when bots change personality)
CREATE TABLE IF NOT EXISTS bot_personality_switches (
  switch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bot reference
  bot_id UUID NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,

  -- Personality change
  from_personality VARCHAR(50) NOT NULL, -- 'friendly', 'playful', 'roast'
  to_personality VARCHAR(50) NOT NULL,

  -- Context
  message TEXT, -- The message that triggered the switch
  analysis JSONB, -- Tone analysis (roastScore, aggressiveScore, etc.)
  context JSONB, -- Additional context (user message, trigger, etc.)

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personality_switches_bot ON bot_personality_switches(bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_switches_type ON bot_personality_switches(from_personality, to_personality);

-- Bot AWOL events (when bots go from friendly to roasting)
CREATE TABLE IF NOT EXISTS bot_awol_events (
  event_id VARCHAR(255) PRIMARY KEY,

  -- Bot reference
  bot_id UUID NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,

  -- Event details
  trigger TEXT, -- What triggered the AWOL (user message)
  message TEXT NOT NULL, -- Bot's AWOL message
  previous_personality VARCHAR(50), -- 'friendly'
  new_personality VARCHAR(50), -- 'roast'

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_awol_events_bot ON bot_awol_events(bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_awol_events_time ON bot_awol_events(created_at DESC);

-- Bot user reactions (how users react to bot messages)
CREATE TABLE IF NOT EXISTS bot_user_reactions (
  reaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bot and message reference
  bot_id UUID NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
  message_id VARCHAR(255), -- Platform-specific message ID

  -- Reaction details
  reaction_type VARCHAR(50) NOT NULL, -- 'like', 'dislike', 'laugh', 'report'
  reaction_value INTEGER DEFAULT 1, -- Strength of reaction (1-5)

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_reactions_bot ON bot_user_reactions(bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_reactions_type ON bot_user_reactions(reaction_type);

-- ============================================================================
-- BRAND ENGAGEMENT TRACKING
-- ============================================================================

-- Brand engagement metrics
CREATE TABLE IF NOT EXISTS brand_engagement_metrics (
  metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Brand
  brand VARCHAR(100) NOT NULL, -- 'calos', 'soulfra', 'talkshitwithfriends', etc.

  -- User
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

  -- Interaction details
  model VARCHAR(100), -- AI model used (if applicable)
  message_length INTEGER, -- Length of user message
  session_id VARCHAR(255), -- Session identifier
  metadata JSONB, -- Additional metadata

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_engagement_brand ON brand_engagement_metrics(brand, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brand_engagement_user ON brand_engagement_metrics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brand_engagement_model ON brand_engagement_metrics(model);
CREATE INDEX IF NOT EXISTS idx_brand_engagement_time ON brand_engagement_metrics(created_at DESC);

-- Model interaction tracking (which AI models users prefer)
CREATE TABLE IF NOT EXISTS model_interaction_tracking (
  interaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Model
  model VARCHAR(100) NOT NULL, -- 'mistral', 'llama3.2', 'codellama', etc.

  -- User and brand
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  brand VARCHAR(100), -- Which brand was using this model

  -- Interaction details
  prompt_length INTEGER,
  response_length INTEGER,
  rating INTEGER, -- User rating (1-5, nullable)

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_interactions_model ON model_interaction_tracking(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_interactions_user ON model_interaction_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_model_interactions_brand ON model_interaction_tracking(brand);

-- Funny moments log
CREATE TABLE IF NOT EXISTS funny_moments (
  moment_id VARCHAR(255) PRIMARY KEY,

  -- Source
  brand VARCHAR(100),
  bot_id UUID REFERENCES bots(bot_id) ON DELETE SET NULL,

  -- Moment details
  message TEXT NOT NULL,
  context JSONB, -- What made it funny
  funniness INTEGER DEFAULT 5, -- Funniness score (1-10)

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funny_moments_brand ON funny_moments(brand, funniness DESC);
CREATE INDEX IF NOT EXISTS idx_funny_moments_funniness ON funny_moments(funniness DESC, created_at DESC);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Brand engagement summary
CREATE OR REPLACE VIEW brand_engagement_summary AS
SELECT
  brand,
  COUNT(*) as total_interactions,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT model) as models_used,
  COUNT(DISTINCT session_id) as total_sessions,
  AVG(message_length) as avg_message_length,
  MAX(created_at) as last_interaction
FROM brand_engagement_metrics
GROUP BY brand
ORDER BY total_interactions DESC;

-- Model preference summary
CREATE OR REPLACE VIEW model_preference_summary AS
SELECT
  model,
  COUNT(*) as usage_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT brand) as brands_using,
  AVG(rating) FILTER (WHERE rating IS NOT NULL) as avg_rating,
  AVG(response_length) as avg_response_length
FROM model_interaction_tracking
GROUP BY model
ORDER BY usage_count DESC;

-- Bot behavior summary
CREATE OR REPLACE VIEW bot_behavior_summary AS
SELECT
  b.bot_id,
  b.name as bot_name,
  b.platform,
  b.personality as base_personality,
  COUNT(DISTINCT ps.switch_id) as total_personality_switches,
  COUNT(DISTINCT ae.event_id) as total_awol_events,
  COUNT(DISTINCT r.reaction_id) as total_reactions,
  AVG(CASE WHEN r.reaction_type = 'like' THEN r.reaction_value END) as avg_like_score,
  AVG(CASE WHEN r.reaction_type = 'laugh' THEN r.reaction_value END) as avg_laugh_score
FROM bots b
LEFT JOIN bot_personality_switches ps ON ps.bot_id = b.bot_id
LEFT JOIN bot_awol_events ae ON ae.bot_id = b.bot_id
LEFT JOIN bot_user_reactions r ON r.bot_id = b.bot_id
GROUP BY b.bot_id, b.name, b.platform, b.personality
ORDER BY total_awol_events DESC;

-- Recent AWOL events (last 50)
CREATE OR REPLACE VIEW recent_awol_events AS
SELECT
  ae.event_id,
  ae.bot_id,
  b.name as bot_name,
  b.platform,
  ae.trigger,
  ae.message,
  ae.previous_personality,
  ae.new_personality,
  ae.created_at,
  EXTRACT(EPOCH FROM (NOW() - ae.created_at)) / 60 as minutes_ago
FROM bot_awol_events ae
JOIN bots b ON b.bot_id = ae.bot_id
ORDER BY ae.created_at DESC
LIMIT 50;

-- Top funny moments
CREATE OR REPLACE VIEW top_funny_moments AS
SELECT
  fm.moment_id,
  fm.brand,
  fm.bot_id,
  b.name as bot_name,
  fm.message,
  fm.funniness,
  fm.created_at
FROM funny_moments fm
LEFT JOIN bots b ON b.bot_id = fm.bot_id
ORDER BY fm.funniness DESC, fm.created_at DESC
LIMIT 100;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get brand engagement for date range
CREATE OR REPLACE FUNCTION get_brand_engagement(
  p_brand VARCHAR DEFAULT NULL,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  brand VARCHAR,
  date DATE,
  interactions BIGINT,
  unique_users BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bem.brand,
    DATE(bem.created_at) as date,
    COUNT(*)::BIGINT as interactions,
    COUNT(DISTINCT bem.user_id)::BIGINT as unique_users
  FROM brand_engagement_metrics bem
  WHERE (p_brand IS NULL OR bem.brand = p_brand)
    AND bem.created_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY bem.brand, DATE(bem.created_at)
  ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql;

-- Get model preference trends
CREATE OR REPLACE FUNCTION get_model_trends(
  p_model VARCHAR DEFAULT NULL,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  model VARCHAR,
  date DATE,
  usage_count BIGINT,
  avg_rating NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mit.model,
    DATE(mit.created_at) as date,
    COUNT(*)::BIGINT as usage_count,
    AVG(mit.rating) as avg_rating
  FROM model_interaction_tracking mit
  WHERE (p_model IS NULL OR mit.model = p_model)
    AND mit.created_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY mit.model, DATE(mit.created_at)
  ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql;

-- Get AWOL frequency for bot
CREATE OR REPLACE FUNCTION get_awol_frequency(
  p_bot_id UUID
)
RETURNS TABLE (
  hour_of_day INTEGER,
  awol_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM created_at)::INTEGER as hour_of_day,
    COUNT(*)::BIGINT as awol_count
  FROM bot_awol_events
  WHERE bot_id = p_bot_id
  GROUP BY hour_of_day
  ORDER BY hour_of_day;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE bot_personality_switches IS 'Tracks when bots change personality (friendly → roast mode)';
COMMENT ON TABLE bot_awol_events IS 'Logs when bots "go AWOL" and start roasting users';
COMMENT ON TABLE bot_user_reactions IS 'User reactions to bot messages (likes, laughs, reports)';
COMMENT ON TABLE brand_engagement_metrics IS 'Engagement metrics per brand (CALOS, Soulfra, talkshitwithfriends, etc.)';
COMMENT ON TABLE model_interaction_tracking IS 'Tracks which AI models users interact with and prefer';
COMMENT ON TABLE funny_moments IS 'Log of funny bot moments for highlights and marketing';

COMMENT ON VIEW brand_engagement_summary IS 'Summary of engagement per brand';
COMMENT ON VIEW model_preference_summary IS 'Summary of AI model usage and preferences';
COMMENT ON VIEW bot_behavior_summary IS 'Summary of bot behavior (personality switches, AWOL events, reactions)';
COMMENT ON VIEW recent_awol_events IS 'Most recent bot AWOL events (last 50)';
COMMENT ON VIEW top_funny_moments IS 'Top 100 funniest bot moments';

-- Migration 143: Daily Voice Journal System
-- Created: 2025-10-22
-- Description: Complete voice journaling system with narrative building,
--              idea extraction, brand routing, and multi-platform publishing

-- ============================================================
-- VOICE JOURNAL SESSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS voice_journal_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  audio_path TEXT,
  transcript TEXT,
  metadata JSONB DEFAULT '{}',

  -- Narrative analysis
  narrative_summary JSONB,  -- {title, takeaway, themes[], insights, tangents, actionable}

  -- Extracted work
  extracted_summary JSONB,  -- {devTasks, mathConcepts, productIdeas, researchQuestions}

  -- Brand routing
  primary_brand TEXT,
  primary_domain TEXT,
  routing_confidence INTEGER,  -- 0-100

  -- Publishing
  published_platforms TEXT[],
  published_urls JSONB,  -- {platform: url}

  -- Status
  status TEXT DEFAULT 'processing',  -- processing, complete, error
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_voice_journal_sessions_user ON voice_journal_sessions(user_id);
CREATE INDEX idx_voice_journal_sessions_status ON voice_journal_sessions(status);
CREATE INDEX idx_voice_journal_sessions_created ON voice_journal_sessions(created_at DESC);
CREATE INDEX idx_voice_journal_sessions_brand ON voice_journal_sessions(primary_brand);

COMMENT ON TABLE voice_journal_sessions IS 'Voice journaling sessions with full narrative processing';

-- ============================================================
-- VOICE JOURNAL SCHEDULES
-- ============================================================

CREATE TABLE IF NOT EXISTS voice_journal_schedules (
  schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,

  -- Schedule config
  schedule_time TEXT NOT NULL,  -- HH:MM format (e.g., "09:00")
  timezone TEXT DEFAULT 'America/New_York',
  auto_publish_platforms JSONB DEFAULT '["mastodon", "blog"]',
  auto_extract_enabled BOOLEAN DEFAULT true,
  auto_route_enabled BOOLEAN DEFAULT true,
  prompt_type TEXT DEFAULT 'daily-reflection',  -- daily-reflection, morning-planning, evening-review

  -- Status
  status TEXT DEFAULT 'active',  -- active, inactive, paused

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_voice_journal_schedules_user ON voice_journal_schedules(user_id);
CREATE INDEX idx_voice_journal_schedules_status ON voice_journal_schedules(status);

COMMENT ON TABLE voice_journal_schedules IS 'Daily voice journal automation schedules';

-- ============================================================
-- VOICE JOURNAL PUBLICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS voice_journal_publications (
  publication_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES voice_journal_sessions(session_id),

  -- Brand info
  brand TEXT NOT NULL,
  domain TEXT NOT NULL,

  -- Publishing details
  platforms TEXT[],
  urls JSONB,  -- {platform: url}
  errors JSONB,  -- {platform: error_message}

  -- Narrative summary
  narrative_summary JSONB,  -- {title, themes[], insights}

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_voice_journal_publications_session ON voice_journal_publications(session_id);
CREATE INDEX idx_voice_journal_publications_brand ON voice_journal_publications(brand);
CREATE INDEX idx_voice_journal_publications_created ON voice_journal_publications(created_at DESC);

COMMENT ON TABLE voice_journal_publications IS 'Published voice journal content tracking';

-- ============================================================
-- VOICE JOURNAL SCHEDULED PUBLICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS voice_journal_scheduled_publications (
  publication_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Platform
  platform TEXT NOT NULL,

  -- Content
  narrative_data JSONB NOT NULL,
  routing_data JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',

  -- Schedule
  scheduled_for TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'scheduled',  -- scheduled, published, failed, cancelled

  -- Result
  published_url TEXT,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP
);

CREATE INDEX idx_voice_journal_scheduled_pubs_platform ON voice_journal_scheduled_publications(platform);
CREATE INDEX idx_voice_journal_scheduled_pubs_status ON voice_journal_scheduled_publications(status);
CREATE INDEX idx_voice_journal_scheduled_pubs_scheduled ON voice_journal_scheduled_publications(scheduled_for);

COMMENT ON TABLE voice_journal_scheduled_publications IS 'Scheduled future publications';

-- ============================================================
-- VOICE MATH NOTES
-- ============================================================

CREATE TABLE IF NOT EXISTS voice_math_notes (
  note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES voice_journal_sessions(session_id),

  -- Math concept
  concept_name TEXT NOT NULL,
  description TEXT,
  notation TEXT,  -- LaTeX notation
  applications TEXT,
  related_topics JSONB DEFAULT '[]',
  difficulty TEXT,  -- beginner, intermediate, advanced

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_voice_math_notes_session ON voice_math_notes(session_id);
CREATE INDEX idx_voice_math_notes_difficulty ON voice_math_notes(difficulty);
CREATE INDEX idx_voice_math_notes_created ON voice_math_notes(created_at DESC);

COMMENT ON TABLE voice_math_notes IS 'Mathematical concepts extracted from voice journals';

-- ============================================================
-- VOICE PRODUCT IDEAS
-- ============================================================

CREATE TABLE IF NOT EXISTS voice_product_ideas (
  idea_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES voice_journal_sessions(session_id),

  -- Idea details
  idea_description TEXT NOT NULL,
  target_market TEXT,
  monetization TEXT,
  difficulty TEXT,  -- low, medium, high
  market_size TEXT,  -- niche, medium, large
  unique_value TEXT,

  -- Status
  status TEXT DEFAULT 'new',  -- new, researching, building, launched, abandoned

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_voice_product_ideas_session ON voice_product_ideas(session_id);
CREATE INDEX idx_voice_product_ideas_status ON voice_product_ideas(status);
CREATE INDEX idx_voice_product_ideas_created ON voice_product_ideas(created_at DESC);

COMMENT ON TABLE voice_product_ideas IS 'Product/business ideas from voice journals';

-- ============================================================
-- VOICE RESEARCH QUESTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS voice_research_questions (
  question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES voice_journal_sessions(session_id),

  -- Question details
  question TEXT NOT NULL,
  motivation TEXT,
  starting_points JSONB DEFAULT '[]',
  difficulty TEXT,  -- easy, medium, hard

  -- Status
  status TEXT DEFAULT 'new',  -- new, researching, answered, abandoned

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_voice_research_questions_session ON voice_research_questions(session_id);
CREATE INDEX idx_voice_research_questions_status ON voice_research_questions(status);
CREATE INDEX idx_voice_research_questions_created ON voice_research_questions(created_at DESC);

COMMENT ON TABLE voice_research_questions IS 'Research questions from voice journals';

-- ============================================================
-- DAILY VOICE JOURNAL QUEST
-- ============================================================

INSERT INTO quests (
  quest_key,
  quest_name,
  description,
  quest_type,
  category,
  difficulty,
  requirements,
  rewards,
  completion_criteria,
  active
) VALUES (
  'daily-voice-journal',
  'Daily Voice Journaler',
  'Journal your thoughts daily through voice - talk about your ideas, projects, and insights. Build a daily habit and track your creative journey.',
  'habit',
  'content',
  'medium',
  '{
    "minimum_duration": 300,
    "platforms": ["any"],
    "frequency": "daily"
  }'::jsonb,
  '{
    "credits": 50,
    "badge": "daily_journaler",
    "unlocks": ["voice_analytics_dashboard"]
  }'::jsonb,
  '{
    "type": "streak",
    "target": 7,
    "unit": "sessions"
  }'::jsonb,
  true
) ON CONFLICT (quest_key) DO UPDATE SET
  description = EXCLUDED.description,
  requirements = EXCLUDED.requirements,
  rewards = EXCLUDED.rewards,
  completion_criteria = EXCLUDED.completion_criteria;

-- Weekly streak quest
INSERT INTO quests (
  quest_key,
  quest_name,
  description,
  quest_type,
  category,
  difficulty,
  requirements,
  rewards,
  completion_criteria,
  active
) VALUES (
  'weekly-voice-streak',
  'Weekly Voice Streak',
  'Journal 7 days in a row - build the habit of daily reflection and creative expression.',
  'achievement',
  'content',
  'medium',
  '{
    "consecutive_days": 7
  }'::jsonb,
  '{
    "credits": 100,
    "badge": "weekly_streak",
    "bonus_multiplier": 1.5
  }'::jsonb,
  '{
    "type": "streak",
    "target": 7,
    "unit": "days"
  }'::jsonb,
  true
) ON CONFLICT (quest_key) DO UPDATE SET
  description = EXCLUDED.description,
  requirements = EXCLUDED.requirements,
  rewards = EXCLUDED.rewards,
  completion_criteria = EXCLUDED.completion_criteria;

-- Monthly streak quest
INSERT INTO quests (
  quest_key,
  quest_name,
  description,
  quest_type,
  category,
  difficulty,
  requirements,
  rewards,
  completion_criteria,
  active
) VALUES (
  'monthly-voice-streak',
  'Monthly Voice Streak',
  'Journal 30 days in a row - achieve mastery of daily creative practice.',
  'achievement',
  'content',
  'hard',
  '{
    "consecutive_days": 30
  }'::jsonb,
  '{
    "credits": 500,
    "badge": "monthly_streak",
    "bonus_multiplier": 2.0,
    "unlocks": ["voice_journal_premium"]
  }'::jsonb,
  '{
    "type": "streak",
    "target": 30,
    "unit": "days"
  }'::jsonb,
  true
) ON CONFLICT (quest_key) DO UPDATE SET
  description = EXCLUDED.description,
  requirements = EXCLUDED.requirements,
  rewards = EXCLUDED.rewards,
  completion_criteria = EXCLUDED.completion_criteria;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Get user's current streak
CREATE OR REPLACE FUNCTION get_voice_journal_streak(p_user_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_streak INTEGER;
BEGIN
  WITH daily_sessions AS (
    SELECT DATE(created_at) as session_date
    FROM voice_journal_sessions
    WHERE user_id = p_user_id AND status = 'complete'
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) DESC
  ),
  streak_calc AS (
    SELECT
      session_date,
      session_date - ROW_NUMBER() OVER (ORDER BY session_date DESC)::int as streak_group
    FROM daily_sessions
  )
  SELECT COUNT(*) INTO v_streak
  FROM streak_calc
  WHERE streak_group = (
    SELECT streak_group
    FROM streak_calc
    LIMIT 1
  );

  RETURN COALESCE(v_streak, 0);
END;
$$ LANGUAGE plpgsql;

-- Get analytics for user
CREATE OR REPLACE FUNCTION get_voice_journal_analytics(
  p_user_id TEXT,
  p_period INTERVAL DEFAULT '30 days'
)
RETURNS TABLE (
  total_sessions BIGINT,
  completed_sessions BIGINT,
  avg_processing_time INTERVAL,
  brands_used TEXT[],
  days_active BIGINT,
  current_streak INTEGER,
  total_dev_tasks BIGINT,
  total_math_concepts BIGINT,
  total_product_ideas BIGINT,
  total_research_questions BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    COUNT(CASE WHEN vjs.status = 'complete' THEN 1 END)::BIGINT,
    AVG(CASE WHEN vjs.status = 'complete' THEN (vjs.completed_at - vjs.created_at) END),
    ARRAY_AGG(DISTINCT vjs.primary_brand) FILTER (WHERE vjs.primary_brand IS NOT NULL),
    COUNT(DISTINCT DATE(vjs.created_at))::BIGINT,
    get_voice_journal_streak(p_user_id),
    (SELECT COUNT(*) FROM voice_math_notes vmn WHERE vmn.session_id IN (
      SELECT session_id FROM voice_journal_sessions WHERE user_id = p_user_id
    ))::BIGINT,
    (SELECT COUNT(*) FROM voice_math_notes vmn WHERE vmn.session_id IN (
      SELECT session_id FROM voice_journal_sessions WHERE user_id = p_user_id
    ))::BIGINT,
    (SELECT COUNT(*) FROM voice_product_ideas vpi WHERE vpi.session_id IN (
      SELECT session_id FROM voice_journal_sessions WHERE user_id = p_user_id
    ))::BIGINT,
    (SELECT COUNT(*) FROM voice_research_questions vrq WHERE vrq.session_id IN (
      SELECT session_id FROM voice_journal_sessions WHERE user_id = p_user_id
    ))::BIGINT
  FROM voice_journal_sessions vjs
  WHERE vjs.user_id = p_user_id
    AND vjs.created_at > NOW() - p_period;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VIEWS
-- ============================================================

-- Active voice journal sessions
CREATE OR REPLACE VIEW active_voice_journal_sessions AS
SELECT
  vjs.session_id,
  vjs.user_id,
  vjs.audio_path,
  vjs.status,
  vjs.primary_brand,
  vjs.primary_domain,
  vjs.narrative_summary->>'title' as story_title,
  vjs.published_platforms,
  vjs.created_at,
  vjs.updated_at,
  EXTRACT(EPOCH FROM (NOW() - vjs.created_at)) as seconds_elapsed
FROM voice_journal_sessions vjs
WHERE vjs.status = 'processing'
ORDER BY vjs.created_at DESC;

COMMENT ON VIEW active_voice_journal_sessions IS 'Currently processing voice journal sessions';

-- User voice journal stats
CREATE OR REPLACE VIEW user_voice_journal_stats AS
SELECT
  vjs.user_id,
  COUNT(*) as total_sessions,
  COUNT(CASE WHEN vjs.status = 'complete' THEN 1 END) as completed_sessions,
  COUNT(DISTINCT vjs.primary_brand) as brands_used,
  COUNT(DISTINCT DATE(vjs.created_at)) as days_active,
  MAX(vjs.created_at) as last_session,
  AVG(CASE WHEN vjs.status = 'complete'
    THEN EXTRACT(EPOCH FROM (vjs.completed_at - vjs.created_at))
  END) as avg_processing_seconds
FROM voice_journal_sessions vjs
GROUP BY vjs.user_id;

COMMENT ON VIEW user_voice_journal_stats IS 'Per-user voice journal statistics';

-- ============================================================
-- GRANTS
-- ============================================================

-- Grant access to tables
GRANT SELECT, INSERT, UPDATE ON voice_journal_sessions TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON voice_journal_schedules TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON voice_journal_publications TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON voice_journal_scheduled_publications TO PUBLIC;
GRANT SELECT, INSERT ON voice_math_notes TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON voice_product_ideas TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON voice_research_questions TO PUBLIC;

-- Grant access to views
GRANT SELECT ON active_voice_journal_sessions TO PUBLIC;
GRANT SELECT ON user_voice_journal_stats TO PUBLIC;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_voice_journal_streak(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_voice_journal_analytics(TEXT, INTERVAL) TO PUBLIC;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================

COMMENT ON SCHEMA public IS 'Migration 143: Daily Voice Journal System - Complete';

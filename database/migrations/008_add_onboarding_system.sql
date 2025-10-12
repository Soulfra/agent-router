-- Migration 008: User Onboarding Survey System
-- Progressive survey with payment incentives for brand/idea building

-- Archetypes Table
-- Predefined personality/role types for users to identify with
CREATE TABLE IF NOT EXISTS archetypes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50),                            -- icon identifier (e.g., 'rocket', 'palette', 'code')
  traits JSONB DEFAULT '[]',                   -- Array of trait strings
  example_brands TEXT[],                       -- Example brands that fit this archetype
  color VARCHAR(20),                           -- Brand color for UI
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_archetypes_slug ON archetypes(slug);

-- User Profiles Table
-- Core identity captured during onboarding
CREATE TABLE IF NOT EXISTS user_profiles (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL UNIQUE,

  -- Basic identity
  full_name VARCHAR(255),
  preferred_name VARCHAR(100),                 -- "What do you want to be known as?"
  email VARCHAR(255),

  -- Domain & archetype
  domain_interest VARCHAR(255),                -- Tech, fashion, finance, health, etc.
  archetype_id INTEGER REFERENCES archetypes(id),

  -- Progress tracking
  current_level INTEGER DEFAULT 1,             -- Current depth level (1-10)
  completed_levels INTEGER[] DEFAULT '{}',     -- Array of completed levels
  completion_percentage INTEGER DEFAULT 0,

  -- Payment tracking
  earned_amount NUMERIC(10, 2) DEFAULT 0.00,
  payout_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'paid'
  payout_method VARCHAR(100),                  -- Venmo, PayPal, crypto address, etc.

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_user_profiles_session ON user_profiles(session_id);
CREATE INDEX idx_user_profiles_archetype ON user_profiles(archetype_id);
CREATE INDEX idx_user_profiles_current_level ON user_profiles(current_level);
CREATE INDEX idx_user_profiles_payout_status ON user_profiles(payout_status);

-- Survey Questions Table
-- Question bank organized by depth level
CREATE TABLE IF NOT EXISTS survey_questions (
  id SERIAL PRIMARY KEY,
  level INTEGER NOT NULL,                      -- Depth level 1-10
  question_order INTEGER NOT NULL,             -- Order within level
  question_text TEXT NOT NULL,
  question_type VARCHAR(50) NOT NULL,          -- 'text', 'textarea', 'choice', 'multi-choice', 'scale'
  options JSONB,                               -- For choice/multi-choice questions
  placeholder TEXT,
  help_text TEXT,
  required BOOLEAN DEFAULT true,
  validation_rules JSONB,                      -- Min/max length, pattern, etc.

  -- Payment value
  base_reward NUMERIC(10, 2) DEFAULT 0.00,     -- Payment for answering this question

  -- Metadata
  category VARCHAR(100),                       -- 'identity', 'vision', 'strategy', etc.
  depends_on_question INTEGER REFERENCES survey_questions(id),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_survey_questions_level ON survey_questions(level, question_order);
CREATE INDEX idx_survey_questions_category ON survey_questions(category);

-- Survey Responses Table
-- User answers to questions
CREATE TABLE IF NOT EXISTS survey_responses (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES survey_questions(id),

  -- Response data
  answer TEXT NOT NULL,
  answer_metadata JSONB DEFAULT '{}',          -- Structured data for complex answers

  -- Quality scoring
  quality_score INTEGER,                       -- 1-100 based on depth/thoughtfulness

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(profile_id, question_id)
);

CREATE INDEX idx_survey_responses_profile ON survey_responses(profile_id);
CREATE INDEX idx_survey_responses_question ON survey_responses(question_id);
CREATE INDEX idx_survey_responses_quality ON survey_responses(quality_score);

-- Brand Ideas Table
-- User-submitted brand concepts
CREATE TABLE IF NOT EXISTS brand_ideas (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Brand details
  brand_name VARCHAR(255) NOT NULL,
  tagline TEXT,
  description TEXT NOT NULL,
  target_audience TEXT,
  unique_value_prop TEXT,

  -- Business model
  business_model VARCHAR(100),                 -- 'B2C', 'B2B', 'marketplace', etc.
  revenue_streams TEXT[],

  -- Positioning
  brand_personality TEXT[],                    -- Array of traits
  brand_values TEXT[],
  competitors TEXT[],
  differentiation TEXT,

  -- Viability scoring
  viability_score INTEGER,                     -- 1-100 (could be AI-scored)
  actionability_score INTEGER,                 -- How actionable/specific is the idea?

  -- Bonus eligibility
  bonus_amount NUMERIC(10, 2) DEFAULT 0.00,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_brand_ideas_profile ON brand_ideas(profile_id);
CREATE INDEX idx_brand_ideas_viability ON brand_ideas(viability_score DESC);

-- Incentive Tracker Table
-- Detailed payment calculations
CREATE TABLE IF NOT EXISTS incentive_tracker (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Incentive breakdown
  level_completion_bonus NUMERIC(10, 2) DEFAULT 0.00,
  question_rewards NUMERIC(10, 2) DEFAULT 0.00,
  brand_idea_bonus NUMERIC(10, 2) DEFAULT 0.00,
  quality_bonus NUMERIC(10, 2) DEFAULT 0.00,

  -- Total
  total_earned NUMERIC(10, 2) DEFAULT 0.00,

  -- Calculation details
  levels_completed INTEGER[] DEFAULT '{}',
  questions_answered INTEGER DEFAULT 0,
  brand_ideas_submitted INTEGER DEFAULT 0,
  avg_quality_score NUMERIC(5, 2),

  -- Timestamps
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_incentive_tracker_profile ON incentive_tracker(profile_id);

-- Update trigger for user_profiles.updated_at
CREATE OR REPLACE FUNCTION update_user_profiles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_profiles_timestamp
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_user_profiles_timestamp();

-- Update trigger for survey_responses.updated_at
CREATE OR REPLACE FUNCTION update_survey_responses_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_survey_responses_timestamp
BEFORE UPDATE ON survey_responses
FOR EACH ROW
EXECUTE FUNCTION update_survey_responses_timestamp();

-- Views

-- User progress summary
CREATE OR REPLACE VIEW user_progress_summary AS
SELECT
  up.id,
  up.session_id,
  up.preferred_name,
  up.current_level,
  up.completion_percentage,
  up.earned_amount,
  a.name as archetype_name,
  COUNT(sr.id) as total_responses,
  COUNT(bi.id) as brand_ideas_count,
  up.created_at,
  up.completed_at
FROM user_profiles up
LEFT JOIN archetypes a ON up.archetype_id = a.id
LEFT JOIN survey_responses sr ON up.id = sr.profile_id
LEFT JOIN brand_ideas bi ON up.id = bi.profile_id
GROUP BY up.id, a.name;

-- Leaderboard view (most engaged users)
CREATE OR REPLACE VIEW onboarding_leaderboard AS
SELECT
  up.id,
  up.preferred_name,
  up.completion_percentage,
  up.earned_amount,
  COUNT(sr.id) as responses_count,
  AVG(sr.quality_score) as avg_quality,
  COUNT(bi.id) as ideas_count
FROM user_profiles up
LEFT JOIN survey_responses sr ON up.id = sr.profile_id
LEFT JOIN brand_ideas bi ON up.id = bi.profile_id
GROUP BY up.id
ORDER BY up.completion_percentage DESC, up.earned_amount DESC
LIMIT 100;

-- Payment analytics
CREATE OR REPLACE VIEW payment_analytics AS
SELECT
  COUNT(*) as total_users,
  SUM(earned_amount) as total_payouts,
  AVG(earned_amount) as avg_payout,
  COUNT(*) FILTER (WHERE payout_status = 'pending') as pending_count,
  COUNT(*) FILTER (WHERE payout_status = 'approved') as approved_count,
  COUNT(*) FILTER (WHERE payout_status = 'paid') as paid_count,
  COUNT(*) FILTER (WHERE completion_percentage = 100) as completed_count
FROM user_profiles;

-- Grant permissions
GRANT ALL PRIVILEGES ON archetypes TO matthewmauer;
GRANT ALL PRIVILEGES ON user_profiles TO matthewmauer;
GRANT ALL PRIVILEGES ON survey_questions TO matthewmauer;
GRANT ALL PRIVILEGES ON survey_responses TO matthewmauer;
GRANT ALL PRIVILEGES ON brand_ideas TO matthewmauer;
GRANT ALL PRIVILEGES ON incentive_tracker TO matthewmauer;

GRANT ALL PRIVILEGES ON SEQUENCE archetypes_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE user_profiles_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE survey_questions_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE survey_responses_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE brand_ideas_id_seq TO matthewmauer;
GRANT ALL PRIVILEGES ON SEQUENCE incentive_tracker_id_seq TO matthewmauer;

-- Success indicator
SELECT 'Migration 008: Onboarding Survey System - Completed' as status;

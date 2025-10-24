-- Migration: Data Literacy & Collaborative Hints
-- Adds real-world data skills and social learning features
--
-- New Features:
-- 1. Student hints (collaborative learning with icons/leet speak)
-- 2. Email breach tracking (privacy techniques)
-- 3. Data normalization tracking (quality improvements)
-- 4. OSINT discoveries (identity verification learning)

-- ============================================================
-- STUDENT HINTS TABLE
-- Collaborative learning - students help each other with cryptic hints
-- ============================================================
CREATE TABLE IF NOT EXISTS student_hints (
  hint_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  lesson_id UUID NOT NULL REFERENCES lessons(lesson_id) ON DELETE CASCADE,
  path_id UUID NOT NULL REFERENCES learning_paths(path_id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL, -- Who created the hint

  -- Hint content
  hint_text TEXT NOT NULL, -- Can contain emojis, leet speak, icons
  hint_type VARCHAR(50) DEFAULT 'cryptic', -- cryptic, direct, code_snippet, icon_only
  spoiler_level INT DEFAULT 1, -- 1-5: 1 = very cryptic, 5 = gives answer away

  -- Gamification
  helpfulness_score INT DEFAULT 0, -- Upvotes from other students
  reported_count INT DEFAULT 0, -- Downvotes for spoilers
  xp_earned INT DEFAULT 0, -- XP earned from helpful hints

  -- Status
  visible BOOLEAN DEFAULT true,
  moderated_at TIMESTAMPTZ,
  moderated_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent spam
  UNIQUE(lesson_id, user_id, hint_text)
);

CREATE INDEX IF NOT EXISTS idx_student_hints_lesson ON student_hints(lesson_id, visible);
CREATE INDEX IF NOT EXISTS idx_student_hints_user ON student_hints(user_id);
CREATE INDEX IF NOT EXISTS idx_student_hints_path ON student_hints(path_id);
CREATE INDEX IF NOT EXISTS idx_student_hints_score ON student_hints(helpfulness_score DESC);

COMMENT ON TABLE student_hints IS 'Collaborative hints from students using icons, leet speak, and cryptic clues';
COMMENT ON COLUMN student_hints.hint_text IS 'Can contain: emojis 🔥, leet speak (l33t), icons, cryptic clues';
COMMENT ON COLUMN student_hints.spoiler_level IS '1=very cryptic, 5=answer given away. Level 5 loses XP!';

-- ============================================================
-- HINT RATINGS TABLE
-- Track who rated each hint (prevent duplicate votes)
-- ============================================================
CREATE TABLE IF NOT EXISTS hint_ratings (
  rating_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  hint_id UUID NOT NULL REFERENCES student_hints(hint_id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,

  -- Rating
  rating INT NOT NULL CHECK (rating IN (-1, 1)), -- -1 = downvote/report, 1 = upvote/helpful
  reason VARCHAR(50), -- 'helpful', 'spoiler', 'spam', 'clever'

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(hint_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hint_ratings_hint ON hint_ratings(hint_id);
CREATE INDEX IF NOT EXISTS idx_hint_ratings_user ON hint_ratings(user_id);

-- ============================================================
-- EMAIL BREACH TRACKING TABLE
-- Teach privacy: track which service leaked your email
-- ============================================================
CREATE TABLE IF NOT EXISTS email_breach_tracker (
  tracker_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id VARCHAR(255) NOT NULL,

  -- Email tagging (user+amazon@gmail.com, user+facebook@gmail.com)
  base_email VARCHAR(255) NOT NULL,
  tagged_email VARCHAR(255) NOT NULL UNIQUE, -- Full email with +tag
  service_tag VARCHAR(100) NOT NULL, -- 'amazon', 'facebook', 'sketchy-site'

  -- Breach detection
  breach_detected BOOLEAN DEFAULT false,
  breach_detected_at TIMESTAMPTZ,
  breach_source TEXT, -- How was breach detected? (spam received, haveibeenpwned.com, etc.)
  spam_count INT DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_breach_user ON email_breach_tracker(user_id);
CREATE INDEX IF NOT EXISTS idx_email_breach_tag ON email_breach_tracker(service_tag);
CREATE INDEX IF NOT EXISTS idx_email_breach_detected ON email_breach_tracker(breach_detected, breach_detected_at);

COMMENT ON TABLE email_breach_tracker IS 'Track which services leaked your email using +tags (privacy lesson)';
COMMENT ON COLUMN email_breach_tracker.tagged_email IS 'user+amazon@gmail.com - track where spam comes from';

-- ============================================================
-- DATA NORMALIZATION LOG
-- Track data quality improvements (learning exercise)
-- ============================================================
CREATE TABLE IF NOT EXISTS data_normalization_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id VARCHAR(255) NOT NULL,
  game_id UUID REFERENCES mini_games(game_id) ON DELETE CASCADE,

  -- Normalization task
  task_type VARCHAR(50) NOT NULL, -- 'address', 'phone', 'zipcode', 'name', 'email'
  original_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,

  -- Corrections made
  corrections_applied TEXT[], -- ['removed_leading_zeros', 'standardized_abbreviation', 'fixed_case']
  confidence_score DECIMAL(3,2), -- 0.00-1.00: how confident in normalization

  -- Learning
  was_correct BOOLEAN, -- Did they normalize correctly?
  feedback TEXT, -- What they learned

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_norm_user ON data_normalization_log(user_id);
CREATE INDEX IF NOT EXISTS idx_data_norm_type ON data_normalization_log(task_type);
CREATE INDEX IF NOT EXISTS idx_data_norm_game ON data_normalization_log(game_id);

COMMENT ON TABLE data_normalization_log IS 'Track data quality fixes - teaching data literacy';

-- ============================================================
-- IDENTITY RESOLUTION LOG
-- Track OSINT discoveries (learning exercise)
-- ============================================================
CREATE TABLE IF NOT EXISTS identity_resolution_log (
  resolution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id VARCHAR(255) NOT NULL,
  game_id UUID REFERENCES mini_games(game_id) ON DELETE CASCADE,

  -- Starting data points
  initial_data JSONB NOT NULL, -- { "email": "...", "ip": "...", "phone_partial": "555-..." }

  -- Discovered data
  discovered_data JSONB, -- { "full_name": "...", "address": "...", "geo": "..." }
  discovery_method VARCHAR(100), -- 'ip_geolocation', 'email_lookup', 'phone_reverse', 'fuzzy_match'

  -- Scoring
  accuracy_score DECIMAL(3,2), -- How much did they discover?
  privacy_score DECIMAL(3,2), -- Did they respect privacy boundaries?

  -- Learning outcomes
  learned_techniques TEXT[], -- ['email_osint', 'ip_geolocation', 'data_linking']
  ethical_concerns TEXT, -- Reflections on privacy

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_res_user ON identity_resolution_log(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_res_game ON identity_resolution_log(game_id);
CREATE INDEX IF NOT EXISTS idx_identity_res_method ON identity_resolution_log(discovery_method);

COMMENT ON TABLE identity_resolution_log IS 'Track OSINT learning - how to link data points (and why privacy matters)';

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Update hint helpfulness score when rated
CREATE OR REPLACE FUNCTION update_hint_score()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rating = 1 THEN
    -- Upvote: increase helpfulness
    UPDATE student_hints
    SET helpfulness_score = helpfulness_score + 1
    WHERE hint_id = NEW.hint_id;

    -- Award XP to hint creator (max 50 XP per hint)
    UPDATE student_hints
    SET xp_earned = LEAST(xp_earned + 5, 50)
    WHERE hint_id = NEW.hint_id;

  ELSIF NEW.rating = -1 THEN
    -- Downvote: increase reported count
    UPDATE student_hints
    SET reported_count = reported_count + 1
    WHERE hint_id = NEW.hint_id;

    -- If reported 3+ times, hide hint
    UPDATE student_hints
    SET visible = false
    WHERE hint_id = NEW.hint_id
      AND reported_count >= 3;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_hint_score
  AFTER INSERT ON hint_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_hint_score();

-- Calculate XP from helpful hints
CREATE OR REPLACE FUNCTION calculate_hint_xp(p_user_id VARCHAR)
RETURNS INT AS $$
DECLARE
  total_xp INT;
BEGIN
  SELECT COALESCE(SUM(xp_earned), 0) INTO total_xp
  FROM student_hints
  WHERE user_id = p_user_id
    AND visible = true;

  RETURN total_xp;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_hint_xp IS 'Calculate total XP earned from helpful hints';

-- Check email breach status
CREATE OR REPLACE FUNCTION check_email_breach(p_tagged_email VARCHAR)
RETURNS TABLE(
  breached BOOLEAN,
  service_tag VARCHAR,
  breach_date TIMESTAMPTZ,
  spam_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    breach_detected,
    service_tag,
    breach_detected_at,
    spam_count
  FROM email_breach_tracker
  WHERE tagged_email = p_tagged_email;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_email_breach IS 'Check if a tagged email has been breached';

-- ============================================================
-- VIEWS
-- ============================================================

-- Hint leaderboard (most helpful hint-givers)
CREATE OR REPLACE VIEW hint_leaderboard AS
SELECT
  user_id,
  COUNT(*) AS total_hints,
  SUM(helpfulness_score) AS total_helpfulness,
  SUM(xp_earned) AS total_xp_from_hints,
  AVG(helpfulness_score)::DECIMAL(5,2) AS avg_helpfulness,
  COUNT(CASE WHEN visible = false THEN 1 END) AS hidden_hints
FROM student_hints
GROUP BY user_id
ORDER BY total_xp_from_hints DESC, total_helpfulness DESC;

COMMENT ON VIEW hint_leaderboard IS 'Rank students by hint helpfulness';

-- Email breach summary
CREATE OR REPLACE VIEW email_breach_summary AS
SELECT
  user_id,
  COUNT(*) AS total_tagged_emails,
  COUNT(CASE WHEN breach_detected = true THEN 1 END) AS breached_count,
  ROUND(
    COUNT(CASE WHEN breach_detected = true THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100,
    2
  ) AS breach_percentage,
  SUM(spam_count) AS total_spam_received
FROM email_breach_tracker
GROUP BY user_id;

COMMENT ON VIEW email_breach_summary IS 'Summary of email breach tracking per user';

-- Data quality stats
CREATE OR REPLACE VIEW data_quality_stats AS
SELECT
  user_id,
  task_type,
  COUNT(*) AS total_normalizations,
  COUNT(CASE WHEN was_correct = true THEN 1 END) AS correct_count,
  ROUND(
    COUNT(CASE WHEN was_correct = true THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0) * 100,
    2
  ) AS accuracy_percentage,
  AVG(confidence_score)::DECIMAL(3,2) AS avg_confidence
FROM data_normalization_log
GROUP BY user_id, task_type
ORDER BY user_id, task_type;

COMMENT ON VIEW data_quality_stats IS 'Track data normalization accuracy by user';

-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================
-- Uncomment and adjust based on your role setup:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON student_hints TO app_user;
-- GRANT SELECT, INSERT ON hint_ratings TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON email_breach_tracker TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON data_normalization_log TO app_user;
-- GRANT SELECT, INSERT ON identity_resolution_log TO app_user;
-- GRANT SELECT ON hint_leaderboard TO app_user;
-- GRANT SELECT ON email_breach_summary TO app_user;
-- GRANT SELECT ON data_quality_stats TO app_user;

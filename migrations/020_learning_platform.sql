-- Migration: Domain Academy Learning Platform
-- CryptoZombies-style gamified education with email/SMS drip campaigns
--
-- Purpose: Transform domain challenges into progressive learning paths
-- Pattern: Each domain = unique personality teaching different skills
-- Features: Lessons, mini-games, achievements, streaks, drip campaigns

-- ============================================================
-- LEARNING PATHS TABLE
-- Each domain has its own learning path (e.g., "Build Your AI Identity" for soulfra)
-- ============================================================
CREATE TABLE IF NOT EXISTS learning_paths (
  path_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES domain_portfolio(domain_id) ON DELETE CASCADE,

  -- Path information
  path_name VARCHAR(255) NOT NULL,
  path_slug VARCHAR(255) UNIQUE NOT NULL, -- e.g., 'soulfra-ai-identity'
  tagline TEXT,
  description TEXT,
  difficulty VARCHAR(50) DEFAULT 'beginner', -- beginner, intermediate, advanced

  -- Content
  total_lessons INT DEFAULT 0,
  estimated_hours DECIMAL(5,2), -- Total time to complete
  skills_learned TEXT[], -- ['prompt-engineering', 'api-design', ...]

  -- Gamification
  xp_reward_per_lesson INT DEFAULT 100,
  completion_badge_url TEXT,

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- active, coming_soon, archived
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_paths_domain ON learning_paths(domain_id);
CREATE INDEX IF NOT EXISTS idx_learning_paths_status ON learning_paths(status);
CREATE INDEX IF NOT EXISTS idx_learning_paths_slug ON learning_paths(path_slug);

-- ============================================================
-- LESSONS TABLE
-- Individual lessons within a learning path
-- ============================================================
CREATE TABLE IF NOT EXISTS lessons (
  lesson_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID NOT NULL REFERENCES learning_paths(path_id) ON DELETE CASCADE,

  -- Lesson metadata
  lesson_number INT NOT NULL, -- Position in path (1, 2, 3...)
  lesson_title VARCHAR(255) NOT NULL,
  lesson_slug VARCHAR(255) NOT NULL, -- e.g., 'lesson-1-hello-ai'
  description TEXT,
  learning_objectives TEXT[], -- What you'll learn

  -- Prerequisites
  requires_lesson_id UUID REFERENCES lessons(lesson_id), -- Must complete this first
  required_xp INT DEFAULT 0, -- Minimum XP to unlock

  -- Content
  content_type VARCHAR(50) DEFAULT 'challenge', -- challenge, tutorial, quiz, mini_game
  content_data JSONB, -- Flexible storage for lesson content
  estimated_minutes INT DEFAULT 30,

  -- Challenge integration (if content_type = 'challenge')
  challenge_id UUID REFERENCES domain_challenges(challenge_id),

  -- Rewards
  xp_reward INT DEFAULT 100,
  bonus_xp_conditions JSONB, -- Extra XP for perfect completion, speed, etc.

  -- Status
  status VARCHAR(50) DEFAULT 'published', -- draft, published, archived
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(path_id, lesson_number),
  UNIQUE(path_id, lesson_slug)
);

CREATE INDEX IF NOT EXISTS idx_lessons_path ON lessons(path_id);
CREATE INDEX IF NOT EXISTS idx_lessons_number ON lessons(path_id, lesson_number);
CREATE INDEX IF NOT EXISTS idx_lessons_requires ON lessons(requires_lesson_id);

-- ============================================================
-- USER PROGRESS TABLE
-- Track user progress through learning paths
-- ============================================================
CREATE TABLE IF NOT EXISTS user_progress (
  progress_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  path_id UUID NOT NULL REFERENCES learning_paths(path_id) ON DELETE CASCADE,

  -- Progress tracking
  current_lesson_id UUID REFERENCES lessons(lesson_id),
  completed_lessons UUID[], -- Array of completed lesson IDs
  total_lessons_completed INT DEFAULT 0,
  completion_percentage DECIMAL(5,2) DEFAULT 0.00,

  -- XP & Gamification
  total_xp_earned INT DEFAULT 0,
  current_streak_days INT DEFAULT 0, -- Consecutive days with activity
  longest_streak_days INT DEFAULT 0,
  last_activity_date DATE,

  -- Status
  status VARCHAR(50) DEFAULT 'in_progress', -- in_progress, completed, abandoned
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, path_id)
);

CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_path ON user_progress(path_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_status ON user_progress(status);
CREATE INDEX IF NOT EXISTS idx_user_progress_streak ON user_progress(current_streak_days DESC);

-- ============================================================
-- LESSON COMPLETIONS TABLE
-- Individual lesson completion records
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_completions (
  completion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  lesson_id UUID NOT NULL REFERENCES lessons(lesson_id) ON DELETE CASCADE,
  progress_id UUID REFERENCES user_progress(progress_id) ON DELETE CASCADE,

  -- Completion metadata
  time_spent_seconds INT,
  attempts INT DEFAULT 1,
  perfect_score BOOLEAN DEFAULT FALSE, -- Did they get everything right?

  -- Implementation (if challenge-based)
  implementation_id UUID REFERENCES domain_implementations(implementation_id),
  code_quality_score DECIMAL(5,2), -- 0-100

  -- Rewards earned
  xp_earned INT DEFAULT 0,
  bonus_xp_earned INT DEFAULT 0,
  badges_earned TEXT[],

  -- Timestamps
  completed_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_completions_user ON lesson_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_completions_lesson ON lesson_completions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_completions_progress ON lesson_completions(progress_id);

-- ============================================================
-- ACHIEVEMENTS TABLE
-- Badges, trophies, and unlockables
-- ============================================================
CREATE TABLE IF NOT EXISTS achievements (
  achievement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID REFERENCES learning_paths(path_id), -- NULL = global achievement

  -- Achievement metadata
  achievement_name VARCHAR(255) NOT NULL,
  achievement_slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  icon_url TEXT,
  rarity VARCHAR(50) DEFAULT 'common', -- common, rare, epic, legendary

  -- Unlock conditions
  unlock_type VARCHAR(50) NOT NULL, -- complete_path, streak, perfect_score, speed_run, etc.
  unlock_criteria JSONB, -- Flexible conditions

  -- Rewards
  xp_bonus INT DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_achievements_path ON achievements(path_id);
CREATE INDEX IF NOT EXISTS idx_achievements_rarity ON achievements(rarity);

-- ============================================================
-- USER ACHIEVEMENTS TABLE
-- Track which achievements users have earned
-- ============================================================
CREATE TABLE IF NOT EXISTS user_achievements (
  user_achievement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  achievement_id UUID NOT NULL REFERENCES achievements(achievement_id) ON DELETE CASCADE,

  earned_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement ON user_achievements(achievement_id);

-- ============================================================
-- MINI GAMES TABLE
-- Daily Wordle-style code/concept games
-- ============================================================
CREATE TABLE IF NOT EXISTS mini_games (
  game_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID REFERENCES domain_portfolio(domain_id),

  -- Game metadata
  game_type VARCHAR(50) NOT NULL, -- codeordle, api_battle, pattern_match, debug_challenge
  game_title VARCHAR(255) NOT NULL,
  difficulty VARCHAR(50) DEFAULT 'medium',

  -- Game content
  game_data JSONB NOT NULL, -- Puzzle data (answer, hints, etc.)
  correct_answer TEXT, -- Hashed or encrypted
  hint_1 TEXT,
  hint_2 TEXT,
  hint_3 TEXT,

  -- Availability
  available_date DATE DEFAULT CURRENT_DATE, -- Daily game
  expires_at TIMESTAMP, -- For time-limited challenges

  -- Rewards
  xp_reward INT DEFAULT 50,
  streak_bonus INT DEFAULT 10, -- Extra XP for daily streak

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mini_games_domain ON mini_games(domain_id);
CREATE INDEX IF NOT EXISTS idx_mini_games_date ON mini_games(available_date DESC);
CREATE INDEX IF NOT EXISTS idx_mini_games_type ON mini_games(game_type);

-- ============================================================
-- MINI GAME ATTEMPTS TABLE
-- Track user attempts at mini games
-- ============================================================
CREATE TABLE IF NOT EXISTS mini_game_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  game_id UUID NOT NULL REFERENCES mini_games(game_id) ON DELETE CASCADE,

  -- Attempt details
  attempts_count INT DEFAULT 1,
  hints_used INT DEFAULT 0,
  time_spent_seconds INT,
  completed BOOLEAN DEFAULT FALSE,

  -- Rewards
  xp_earned INT DEFAULT 0,

  -- Timestamps
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  UNIQUE(user_id, game_id, available_date) -- One attempt per day per game
);

CREATE INDEX IF NOT EXISTS idx_mini_game_attempts_user ON mini_game_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_mini_game_attempts_game ON mini_game_attempts(game_id);

-- ============================================================
-- DRIP CAMPAIGNS TABLE
-- Email/SMS automation configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS drip_campaigns (
  campaign_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID REFERENCES learning_paths(path_id), -- NULL = global campaign

  -- Campaign metadata
  campaign_name VARCHAR(255) NOT NULL,
  campaign_slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,

  -- Trigger conditions
  trigger_event VARCHAR(100) NOT NULL, -- signup, lesson_complete, inactive_7_days, achievement_earned
  trigger_conditions JSONB, -- Additional filters

  -- Delivery
  channel VARCHAR(50) DEFAULT 'email', -- email, sms, both
  delay_minutes INT DEFAULT 0, -- Delay after trigger

  -- Status
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drip_campaigns_path ON drip_campaigns(path_id);
CREATE INDEX IF NOT EXISTS idx_drip_campaigns_trigger ON drip_campaigns(trigger_event);
CREATE INDEX IF NOT EXISTS idx_drip_campaigns_active ON drip_campaigns(active);

-- ============================================================
-- DRIP MESSAGES TABLE
-- Individual messages within a campaign
-- ============================================================
CREATE TABLE IF NOT EXISTS drip_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES drip_campaigns(campaign_id) ON DELETE CASCADE,

  -- Message order
  sequence_number INT NOT NULL, -- Order within campaign

  -- Content
  subject LINE VARCHAR(500), -- Email subject or SMS preview
  message_body TEXT NOT NULL,
  message_html TEXT, -- HTML version for email

  -- Personalization
  template_variables JSONB, -- {user_name}, {domain_name}, {progress_pct}

  -- Domain branding
  use_domain_branding BOOLEAN DEFAULT TRUE,
  override_from_name VARCHAR(255),
  override_from_email VARCHAR(255),

  -- CTA
  cta_text VARCHAR(100),
  cta_url TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(campaign_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_drip_messages_campaign ON drip_messages(campaign_id);

-- ============================================================
-- DRIP SENDS TABLE
-- Track sent messages
-- ============================================================
CREATE TABLE IF NOT EXISTS drip_sends (
  send_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  message_id UUID NOT NULL REFERENCES drip_messages(message_id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES drip_campaigns(campaign_id) ON DELETE CASCADE,

  -- Delivery
  channel VARCHAR(50) NOT NULL, -- email or sms
  recipient VARCHAR(255) NOT NULL, -- email address or phone number
  sent_at TIMESTAMP DEFAULT NOW(),

  -- Engagement
  opened BOOLEAN DEFAULT FALSE,
  opened_at TIMESTAMP,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMP,
  converted BOOLEAN DEFAULT FALSE, -- Completed desired action
  converted_at TIMESTAMP,

  -- Status
  delivery_status VARCHAR(50) DEFAULT 'pending', -- pending, sent, delivered, bounced, failed
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_drip_sends_user ON drip_sends(user_id);
CREATE INDEX IF NOT EXISTS idx_drip_sends_message ON drip_sends(message_id);
CREATE INDEX IF NOT EXISTS idx_drip_sends_campaign ON drip_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_drip_sends_sent_at ON drip_sends(sent_at DESC);

-- ============================================================
-- FUNCTIONS: Calculate User Level
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_user_level(p_total_xp INT)
RETURNS INT AS $$
BEGIN
  -- Level formula: sqrt(xp / 100)
  -- Level 1 = 100 XP
  -- Level 2 = 400 XP
  -- Level 3 = 900 XP
  -- Level 10 = 10,000 XP
  RETURN FLOOR(SQRT(p_total_xp / 100.0))::INT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- FUNCTIONS: Update User Progress
-- ============================================================
CREATE OR REPLACE FUNCTION update_user_progress_after_lesson()
RETURNS TRIGGER AS $$
DECLARE
  v_progress RECORD;
  v_total_lessons INT;
  v_path_id UUID;
BEGIN
  -- Get lesson's path
  SELECT path_id INTO v_path_id
  FROM lessons
  WHERE lesson_id = NEW.lesson_id;

  -- Get or create user progress
  SELECT * INTO v_progress
  FROM user_progress
  WHERE user_id = NEW.user_id AND path_id = v_path_id;

  IF NOT FOUND THEN
    INSERT INTO user_progress (user_id, path_id, current_lesson_id)
    VALUES (NEW.user_id, v_path_id, NEW.lesson_id)
    RETURNING * INTO v_progress;
  END IF;

  -- Get total lessons in path
  SELECT COUNT(*) INTO v_total_lessons
  FROM lessons
  WHERE path_id = v_path_id AND status = 'published';

  -- Update progress
  UPDATE user_progress
  SET
    completed_lessons = ARRAY_APPEND(
      COALESCE(completed_lessons, ARRAY[]::UUID[]),
      NEW.lesson_id
    ),
    total_lessons_completed = total_lessons_completed + 1,
    completion_percentage = (
      (total_lessons_completed + 1)::DECIMAL / NULLIF(v_total_lessons, 0) * 100
    ),
    total_xp_earned = total_xp_earned + NEW.xp_earned,
    last_activity_date = CURRENT_DATE,
    last_accessed_at = NOW(),
    status = CASE
      WHEN (total_lessons_completed + 1) >= v_total_lessons THEN 'completed'
      ELSE 'in_progress'
    END,
    completed_at = CASE
      WHEN (total_lessons_completed + 1) >= v_total_lessons THEN NOW()
      ELSE completed_at
    END
  WHERE progress_id = v_progress.progress_id;

  -- Update streak
  PERFORM update_user_streak(NEW.user_id, v_path_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_progress ON lesson_completions;
CREATE TRIGGER trigger_update_progress
  AFTER INSERT ON lesson_completions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_progress_after_lesson();

-- ============================================================
-- FUNCTIONS: Update User Streak
-- ============================================================
CREATE OR REPLACE FUNCTION update_user_streak(p_user_id VARCHAR, p_path_id UUID)
RETURNS VOID AS $$
DECLARE
  v_last_activity DATE;
  v_current_streak INT;
BEGIN
  SELECT last_activity_date, current_streak_days
  INTO v_last_activity, v_current_streak
  FROM user_progress
  WHERE user_id = p_user_id AND path_id = p_path_id;

  IF v_last_activity IS NULL OR v_last_activity < CURRENT_DATE - INTERVAL '1 day' THEN
    -- Streak broken, reset to 1
    UPDATE user_progress
    SET current_streak_days = 1
    WHERE user_id = p_user_id AND path_id = p_path_id;
  ELSIF v_last_activity = CURRENT_DATE - INTERVAL '1 day' THEN
    -- Streak continues!
    UPDATE user_progress
    SET
      current_streak_days = current_streak_days + 1,
      longest_streak_days = GREATEST(longest_streak_days, current_streak_days + 1)
    WHERE user_id = p_user_id AND path_id = p_path_id;
  END IF;
  -- If v_last_activity = CURRENT_DATE, do nothing (already counted today)
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VIEWS: Learning Leaderboard
-- ============================================================
CREATE OR REPLACE VIEW learning_leaderboard AS
SELECT
  up.user_id,
  u.username,
  u.email,
  lp.path_name,
  lp.path_slug,
  dp.domain_name,
  dp.primary_color,

  up.total_xp_earned,
  calculate_user_level(up.total_xp_earned) as user_level,
  up.total_lessons_completed,
  up.completion_percentage,
  up.current_streak_days,
  up.longest_streak_days,

  RANK() OVER (PARTITION BY up.path_id ORDER BY up.total_xp_earned DESC) as path_rank,
  RANK() OVER (ORDER BY up.total_xp_earned DESC) as global_rank

FROM user_progress up
JOIN users u ON up.user_id = u.user_id
JOIN learning_paths lp ON up.path_id = lp.path_id
JOIN domain_portfolio dp ON lp.domain_id = dp.domain_id
WHERE up.status = 'in_progress' OR up.status = 'completed'
ORDER BY up.total_xp_earned DESC;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Domain Academy Learning Platform installed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - learning_paths (domain-specific learning journeys)';
  RAISE NOTICE '  - lessons (individual lessons with prerequisites)';
  RAISE NOTICE '  - user_progress (XP, streaks, completion tracking)';
  RAISE NOTICE '  - lesson_completions (detailed completion records)';
  RAISE NOTICE '  - achievements (badges & trophies)';
  RAISE NOTICE '  - user_achievements (earned achievements)';
  RAISE NOTICE '  - mini_games (daily Wordle-style challenges)';
  RAISE NOTICE '  - mini_game_attempts (game completion tracking)';
  RAISE NOTICE '  - drip_campaigns (email/SMS automation config)';
  RAISE NOTICE '  - drip_messages (campaign message templates)';
  RAISE NOTICE '  - drip_sends (sent message tracking)';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - calculate_user_level() (XP → level conversion)';
  RAISE NOTICE '  - update_user_progress_after_lesson() (auto-update progress)';
  RAISE NOTICE '  - update_user_streak() (daily streak tracking)';
  RAISE NOTICE '';
  RAISE NOTICE 'Views created:';
  RAISE NOTICE '  - learning_leaderboard (ranked users by XP)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Run: psql $DATABASE_URL -f migrations/020_learning_platform.sql';
  RAISE NOTICE '  2. Create LearningEngine class';
  RAISE NOTICE '  3. Build drip campaign automation';
  RAISE NOTICE '  4. Generate 12 domain-specific learning paths!';
END $$;

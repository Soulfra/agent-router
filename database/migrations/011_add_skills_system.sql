-- Migration: Skills & XP System
--
-- Purpose: RuneScape-style skill progression system
-- Users level up skills through performing actions and earn achievements
-- Skills: Voting, Creativity, Development, Trading, Security, Social, etc.

-- ============================================================
-- Skills Table
-- ============================================================
CREATE TABLE IF NOT EXISTS skills (
  skill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name VARCHAR(50) UNIQUE NOT NULL,
  skill_description TEXT,
  skill_icon VARCHAR(50), -- emoji or icon name
  category VARCHAR(50), -- combat, production, gathering, social, etc.
  max_level INT DEFAULT 99,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_skills_category ON skills(category);

-- ============================================================
-- Skill Level Requirements
-- ============================================================
CREATE TABLE IF NOT EXISTS skill_level_requirements (
  level INT PRIMARY KEY CHECK (level BETWEEN 1 AND 120),
  xp_required BIGINT NOT NULL,
  xp_to_next BIGINT
);

-- ============================================================
-- User Skills Table
-- ============================================================
CREATE TABLE IF NOT EXISTS user_skills (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
  current_level INT DEFAULT 1,
  current_xp BIGINT DEFAULT 0,
  total_actions INT DEFAULT 0, -- How many actions performed for this skill
  last_xp_gain_at TIMESTAMP DEFAULT NOW(),
  prestige_level INT DEFAULT 0, -- Reset to level 1 after reaching max level
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY (user_id, skill_id)
);

CREATE INDEX idx_user_skills_user ON user_skills(user_id);
CREATE INDEX idx_user_skills_skill ON user_skills(skill_id);
CREATE INDEX idx_user_skills_level ON user_skills(current_level DESC);
CREATE INDEX idx_user_skills_xp ON user_skills(current_xp DESC);

-- ============================================================
-- Skill Actions Table
-- ============================================================
CREATE TABLE IF NOT EXISTS skill_actions (
  action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_name VARCHAR(100) UNIQUE NOT NULL,
  action_description TEXT,
  skill_id UUID NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
  base_xp INT NOT NULL, -- Base XP awarded per action
  min_level_required INT DEFAULT 1, -- Minimum level to perform action
  cooldown_seconds INT DEFAULT 0, -- Cooldown between actions
  requires_payment BOOLEAN DEFAULT FALSE, -- Does this cost money/tokens?
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_skill_actions_skill ON skill_actions(skill_id);
CREATE INDEX idx_skill_actions_name ON skill_actions(action_name);

-- ============================================================
-- XP Gain Log
-- ============================================================
CREATE TABLE IF NOT EXISTS xp_gain_log (
  xp_gain_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
  action_id UUID REFERENCES skill_actions(action_id) ON DELETE SET NULL,
  xp_gained INT NOT NULL,
  multiplier DECIMAL(3, 2) DEFAULT 1.00, -- XP multiplier (1.0 = normal, 2.0 = double XP)
  level_before INT,
  level_after INT,
  leveled_up BOOLEAN DEFAULT FALSE,
  source VARCHAR(100), -- vote, feedback, code, security_report, etc.
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_xp_gain_user ON xp_gain_log(user_id, created_at DESC);
CREATE INDEX idx_xp_gain_skill ON xp_gain_log(skill_id, created_at DESC);
CREATE INDEX idx_xp_gain_action ON xp_gain_log(action_id);

-- ============================================================
-- XP Multipliers Table
-- ============================================================
CREATE TABLE IF NOT EXISTS xp_multipliers (
  multiplier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  multiplier_name VARCHAR(100) NOT NULL,
  multiplier_value DECIMAL(3, 2) NOT NULL, -- 1.5 = 50% bonus, 2.0 = double XP
  skill_id UUID REFERENCES skills(skill_id), -- NULL = applies to all skills
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_xp_multipliers_active ON xp_multipliers(active, start_time, end_time);
CREATE INDEX idx_xp_multipliers_skill ON xp_multipliers(skill_id);

-- ============================================================
-- Achievements Table
-- ============================================================
CREATE TABLE IF NOT EXISTS achievements (
  achievement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_name VARCHAR(100) UNIQUE NOT NULL,
  achievement_description TEXT,
  achievement_icon VARCHAR(50), -- emoji or icon name
  category VARCHAR(50), -- skill_milestone, special_event, rare, etc.
  skill_id UUID REFERENCES skills(skill_id), -- Related skill (NULL if not skill-specific)
  requirement_type VARCHAR(50), -- reach_level, total_xp, action_count, special
  requirement_value INT, -- Level/XP/count needed
  reward_type VARCHAR(50), -- badge, title, usdc, xp_boost
  reward_value TEXT, -- JSON or text describing reward
  rarity VARCHAR(20) DEFAULT 'common', -- common, uncommon, rare, epic, legendary
  points INT DEFAULT 10, -- Achievement points
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_achievements_category ON achievements(category);
CREATE INDEX idx_achievements_skill ON achievements(skill_id);
CREATE INDEX idx_achievements_rarity ON achievements(rarity);

-- ============================================================
-- User Achievements Table
-- ============================================================
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(achievement_id) ON DELETE CASCADE,
  earned_at TIMESTAMP DEFAULT NOW(),
  progress INT DEFAULT 0, -- For tracking progress toward achievement
  claimed BOOLEAN DEFAULT FALSE, -- Has user claimed the reward?
  claimed_at TIMESTAMP,

  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user ON user_achievements(user_id, earned_at DESC);
CREATE INDEX idx_user_achievements_achievement ON user_achievements(achievement_id);
CREATE INDEX idx_user_achievements_unclaimed ON user_achievements(user_id, claimed) WHERE claimed = FALSE;

-- ============================================================
-- Views
-- ============================================================

-- User Skill Summary
CREATE OR REPLACE VIEW user_skill_summary AS
SELECT
  u.user_id,
  u.email,
  u.username,
  s.skill_name,
  us.current_level,
  us.current_xp,
  us.total_actions,
  us.prestige_level,
  slr_current.xp_required as xp_for_current_level,
  slr_next.xp_required as xp_for_next_level,
  (slr_next.xp_required - us.current_xp) as xp_to_next_level,
  ROUND(
    (us.current_xp - slr_current.xp_required)::DECIMAL /
    NULLIF((slr_next.xp_required - slr_current.xp_required), 0) * 100,
    2
  ) as progress_to_next_level_pct
FROM user_skills us
JOIN users u ON us.user_id = u.user_id
JOIN skills s ON us.skill_id = s.skill_id
JOIN skill_level_requirements slr_current ON us.current_level = slr_current.level
LEFT JOIN skill_level_requirements slr_next ON us.current_level + 1 = slr_next.level
ORDER BY u.username, s.skill_name;

-- Skill Leaderboard
CREATE OR REPLACE VIEW skill_leaderboard AS
SELECT
  s.skill_id,
  s.skill_name,
  u.user_id,
  u.username,
  u.display_name,
  us.current_level,
  us.current_xp,
  us.prestige_level,
  RANK() OVER (PARTITION BY s.skill_id ORDER BY us.current_xp DESC) as rank,
  us.last_xp_gain_at
FROM user_skills us
JOIN users u ON us.user_id = u.user_id
JOIN skills s ON us.skill_id = s.skill_id
WHERE u.status = 'active'
ORDER BY s.skill_name, us.current_xp DESC;

-- User Total Level (Sum of all skill levels)
CREATE OR REPLACE VIEW user_total_level AS
SELECT
  u.user_id,
  u.username,
  u.display_name,
  SUM(us.current_level) as total_level,
  SUM(us.current_xp) as total_xp,
  COUNT(us.skill_id) as skills_trained,
  AVG(us.current_level) as avg_level,
  RANK() OVER (ORDER BY SUM(us.current_level) DESC) as rank
FROM users u
LEFT JOIN user_skills us ON u.user_id = us.user_id
WHERE u.status = 'active'
GROUP BY u.user_id
ORDER BY total_level DESC;

-- Recent XP Gains
CREATE OR REPLACE VIEW recent_xp_gains AS
SELECT
  xgl.xp_gain_id,
  u.username,
  s.skill_name,
  sa.action_name,
  xgl.xp_gained,
  xgl.multiplier,
  xgl.level_before,
  xgl.level_after,
  xgl.leveled_up,
  xgl.created_at
FROM xp_gain_log xgl
JOIN users u ON xgl.user_id = u.user_id
JOIN skills s ON xgl.skill_id = s.skill_id
LEFT JOIN skill_actions sa ON xgl.action_id = sa.action_id
ORDER BY xgl.created_at DESC
LIMIT 100;

-- User Achievement Summary
CREATE OR REPLACE VIEW user_achievement_summary AS
SELECT
  u.user_id,
  u.username,
  COUNT(ua.achievement_id) as total_achievements,
  SUM(a.points) as achievement_points,
  COUNT(ua.achievement_id) FILTER (WHERE ua.claimed = FALSE) as unclaimed_achievements,
  COUNT(ua.achievement_id) FILTER (WHERE a.rarity = 'legendary') as legendary_count,
  COUNT(ua.achievement_id) FILTER (WHERE a.rarity = 'epic') as epic_count,
  COUNT(ua.achievement_id) FILTER (WHERE a.rarity = 'rare') as rare_count
FROM users u
LEFT JOIN user_achievements ua ON u.user_id = ua.user_id
LEFT JOIN achievements a ON ua.achievement_id = a.achievement_id
WHERE u.status = 'active'
GROUP BY u.user_id
ORDER BY achievement_points DESC;

-- ============================================================
-- Functions
-- ============================================================

-- Function: Calculate level from XP
CREATE OR REPLACE FUNCTION calculate_level_from_xp(p_xp BIGINT)
RETURNS INT AS $$
DECLARE
  v_level INT;
BEGIN
  SELECT COALESCE(MAX(level), 1)
  INTO v_level
  FROM skill_level_requirements
  WHERE xp_required <= p_xp;

  RETURN v_level;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Calculate XP for level
CREATE OR REPLACE FUNCTION calculate_xp_for_level(p_level INT)
RETURNS BIGINT AS $$
DECLARE
  v_xp BIGINT;
BEGIN
  SELECT COALESCE(xp_required, 0)
  INTO v_xp
  FROM skill_level_requirements
  WHERE level = p_level;

  RETURN v_xp;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Award XP
CREATE OR REPLACE FUNCTION award_xp(
  p_user_id UUID,
  p_skill_id UUID,
  p_base_xp INT,
  p_action_id UUID DEFAULT NULL,
  p_source VARCHAR(100) DEFAULT 'manual'
)
RETURNS TABLE (
  xp_gained INT,
  total_xp BIGINT,
  level_before INT,
  level_after INT,
  leveled_up BOOLEAN
) AS $$
DECLARE
  v_multiplier DECIMAL(3, 2) := 1.00;
  v_xp_gained INT;
  v_level_before INT;
  v_level_after INT;
  v_current_xp BIGINT;
  v_new_xp BIGINT;
  v_leveled_up BOOLEAN := FALSE;
BEGIN
  -- Get current skill state
  SELECT current_level, current_xp
  INTO v_level_before, v_current_xp
  FROM user_skills
  WHERE user_id = p_user_id AND skill_id = p_skill_id;

  -- If skill doesn't exist for user, initialize it
  IF NOT FOUND THEN
    INSERT INTO user_skills (user_id, skill_id, current_level, current_xp)
    VALUES (p_user_id, p_skill_id, 1, 0);
    v_level_before := 1;
    v_current_xp := 0;
  END IF;

  -- Check for active XP multipliers
  SELECT COALESCE(MAX(multiplier_value), 1.00)
  INTO v_multiplier
  FROM xp_multipliers
  WHERE active = TRUE
    AND NOW() BETWEEN start_time AND end_time
    AND (skill_id IS NULL OR skill_id = p_skill_id);

  -- Calculate XP gained with multiplier
  v_xp_gained := ROUND(p_base_xp * v_multiplier);
  v_new_xp := v_current_xp + v_xp_gained;

  -- Calculate new level
  v_level_after := calculate_level_from_xp(v_new_xp);
  v_leveled_up := v_level_after > v_level_before;

  -- Update user skill
  UPDATE user_skills
  SET
    current_xp = v_new_xp,
    current_level = v_level_after,
    total_actions = total_actions + 1,
    last_xp_gain_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id AND skill_id = p_skill_id;

  -- Log XP gain
  INSERT INTO xp_gain_log (
    user_id,
    skill_id,
    action_id,
    xp_gained,
    multiplier,
    level_before,
    level_after,
    leveled_up,
    source
  ) VALUES (
    p_user_id,
    p_skill_id,
    p_action_id,
    v_xp_gained,
    v_multiplier,
    v_level_before,
    v_level_after,
    v_leveled_up,
    p_source
  );

  -- Check for achievement unlocks
  PERFORM check_achievement_progress(p_user_id, p_skill_id);

  RETURN QUERY SELECT v_xp_gained, v_new_xp, v_level_before, v_level_after, v_leveled_up;
END;
$$ LANGUAGE plpgsql;

-- Function: Check achievement progress
CREATE OR REPLACE FUNCTION check_achievement_progress(
  p_user_id UUID,
  p_skill_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_achievement RECORD;
  v_current_value INT;
BEGIN
  -- Get user's current skill level/XP
  FOR v_achievement IN
    SELECT * FROM achievements
    WHERE skill_id = p_skill_id OR skill_id IS NULL
  LOOP
    -- Check if user already has this achievement
    IF EXISTS (
      SELECT 1 FROM user_achievements
      WHERE user_id = p_user_id AND achievement_id = v_achievement.achievement_id
    ) THEN
      CONTINUE;
    END IF;

    -- Check requirement
    IF v_achievement.requirement_type = 'reach_level' THEN
      SELECT current_level INTO v_current_value
      FROM user_skills
      WHERE user_id = p_user_id AND skill_id = p_skill_id;

      IF v_current_value >= v_achievement.requirement_value THEN
        INSERT INTO user_achievements (user_id, achievement_id, progress)
        VALUES (p_user_id, v_achievement.achievement_id, v_current_value);
      END IF;

    ELSIF v_achievement.requirement_type = 'total_xp' THEN
      SELECT current_xp INTO v_current_value
      FROM user_skills
      WHERE user_id = p_user_id AND skill_id = p_skill_id;

      IF v_current_value >= v_achievement.requirement_value THEN
        INSERT INTO user_achievements (user_id, achievement_id, progress)
        VALUES (p_user_id, v_achievement.achievement_id, v_current_value);
      END IF;

    ELSIF v_achievement.requirement_type = 'action_count' THEN
      SELECT total_actions INTO v_current_value
      FROM user_skills
      WHERE user_id = p_user_id AND skill_id = p_skill_id;

      IF v_current_value >= v_achievement.requirement_value THEN
        INSERT INTO user_achievements (user_id, achievement_id, progress)
        VALUES (p_user_id, v_achievement.achievement_id, v_current_value);
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function: Claim achievement reward
CREATE OR REPLACE FUNCTION claim_achievement_reward(
  p_user_id UUID,
  p_achievement_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_achievement RECORD;
BEGIN
  -- Check if user has achievement and hasn't claimed it
  IF NOT EXISTS (
    SELECT 1 FROM user_achievements
    WHERE user_id = p_user_id
      AND achievement_id = p_achievement_id
      AND claimed = FALSE
  ) THEN
    RETURN FALSE;
  END IF;

  -- Mark as claimed
  UPDATE user_achievements
  SET
    claimed = TRUE,
    claimed_at = NOW()
  WHERE user_id = p_user_id AND achievement_id = p_achievement_id;

  -- TODO: Process reward (USDC payment, XP boost, etc.)

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Triggers
-- ============================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_skills_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_skills_timestamp
  BEFORE UPDATE ON user_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_user_skills_timestamp();

-- ============================================================
-- Seed Data: Skill Level Requirements (RuneScape formula)
-- ============================================================
DO $$
DECLARE
  v_level INT;
  v_xp BIGINT := 0;
  v_xp_to_next BIGINT;
BEGIN
  FOR v_level IN 1..99 LOOP
    IF v_level > 1 THEN
      -- RuneScape XP formula: floor(sum(floor(level + 300 * 2^(level / 7))) / 4) for level 1 to N
      v_xp := FLOOR(
        (SELECT SUM(FLOOR(i + 300 * POWER(2, i::DECIMAL / 7)))
         FROM generate_series(1, v_level - 1) AS i) / 4
      );
    END IF;

    IF v_level < 99 THEN
      v_xp_to_next := FLOOR(
        (SELECT SUM(FLOOR(i + 300 * POWER(2, i::DECIMAL / 7)))
         FROM generate_series(1, v_level) AS i) / 4
      ) - v_xp;
    ELSE
      v_xp_to_next := NULL;
    END IF;

    INSERT INTO skill_level_requirements (level, xp_required, xp_to_next)
    VALUES (v_level, v_xp, v_xp_to_next)
    ON CONFLICT (level) DO NOTHING;
  END LOOP;
END $$;

-- ============================================================
-- Seed Data: Skills
-- ============================================================
INSERT INTO skills (skill_name, skill_description, skill_icon, category) VALUES
  ('Voting', 'Vote on domains and provide feedback', '🗳️', 'social'),
  ('Creativity', 'Create designs, content, and ideas', '🎨', 'production'),
  ('Development', 'Write code and build features', '💻', 'production'),
  ('Trading', 'Buy, sell, and trade domains/assets', '💰', 'commercial'),
  ('Security', 'Find vulnerabilities and improve security', '🔒', 'combat'),
  ('Social', 'Engage with community and collaborate', '👥', 'social'),
  ('Analytics', 'Analyze data and generate insights', '📊', 'gathering'),
  ('Marketing', 'Promote domains and grow audience', '📢', 'commercial'),
  ('Design', 'Create visual assets and UI/UX', '🎨', 'production'),
  ('Writing', 'Write documentation, articles, and content', '✍️', 'production')
ON CONFLICT (skill_name) DO NOTHING;

-- ============================================================
-- Seed Data: Skill Actions
-- ============================================================
DO $$
DECLARE
  v_voting_id UUID;
  v_creativity_id UUID;
  v_development_id UUID;
  v_security_id UUID;
  v_social_id UUID;
BEGIN
  -- Get skill IDs
  SELECT skill_id INTO v_voting_id FROM skills WHERE skill_name = 'Voting';
  SELECT skill_id INTO v_creativity_id FROM skills WHERE skill_name = 'Creativity';
  SELECT skill_id INTO v_development_id FROM skills WHERE skill_name = 'Development';
  SELECT skill_id INTO v_security_id FROM skills WHERE skill_name = 'Security';
  SELECT skill_id INTO v_social_id FROM skills WHERE skill_name = 'Social';

  -- Voting actions
  INSERT INTO skill_actions (action_name, action_description, skill_id, base_xp, cooldown_seconds) VALUES
    ('vote_like', 'Like a domain', v_voting_id, 10, 5),
    ('vote_dislike', 'Dislike a domain', v_voting_id, 10, 5),
    ('submit_short_feedback', 'Submit feedback (10-50 words)', v_voting_id, 50, 60),
    ('submit_long_feedback', 'Submit feedback (50+ words)', v_voting_id, 100, 120),
    ('submit_detailed_feedback', 'Submit feedback (100+ words)', v_voting_id, 200, 300)
  ON CONFLICT (action_name) DO NOTHING;

  -- Creativity actions
  INSERT INTO skill_actions (action_name, action_description, skill_id, base_xp, cooldown_seconds) VALUES
    ('submit_design', 'Submit a design concept', v_creativity_id, 150, 600),
    ('create_mockup', 'Create a mockup or prototype', v_creativity_id, 200, 1200),
    ('suggest_feature', 'Suggest a new feature', v_creativity_id, 75, 300)
  ON CONFLICT (action_name) DO NOTHING;

  -- Development actions
  INSERT INTO skill_actions (action_name, action_description, skill_id, base_xp, cooldown_seconds) VALUES
    ('commit_code', 'Commit code to repository', v_development_id, 100, 300),
    ('complete_challenge', 'Complete a coding challenge', v_development_id, 300, 3600),
    ('fix_bug', 'Fix a bug', v_development_id, 150, 600)
  ON CONFLICT (action_name) DO NOTHING;

  -- Security actions
  INSERT INTO skill_actions (action_name, action_description, skill_id, base_xp, cooldown_seconds) VALUES
    ('report_low_severity_bug', 'Report low severity vulnerability', v_security_id, 200, 0),
    ('report_medium_severity_bug', 'Report medium severity vulnerability', v_security_id, 500, 0),
    ('report_high_severity_bug', 'Report high severity vulnerability', v_security_id, 1000, 0),
    ('report_critical_bug', 'Report critical vulnerability', v_security_id, 2000, 0)
  ON CONFLICT (action_name) DO NOTHING;

  -- Social actions
  INSERT INTO skill_actions (action_name, action_description, skill_id, base_xp, cooldown_seconds) VALUES
    ('refer_user', 'Refer a new user', v_social_id, 250, 0),
    ('help_user', 'Help another user', v_social_id, 100, 600),
    ('share_domain', 'Share a domain on social media', v_social_id, 50, 300)
  ON CONFLICT (action_name) DO NOTHING;
END $$;

-- ============================================================
-- Seed Data: Achievements
-- ============================================================
DO $$
DECLARE
  v_voting_id UUID;
  v_development_id UUID;
  v_security_id UUID;
BEGIN
  SELECT skill_id INTO v_voting_id FROM skills WHERE skill_name = 'Voting';
  SELECT skill_id INTO v_development_id FROM skills WHERE skill_name = 'Development';
  SELECT skill_id INTO v_security_id FROM skills WHERE skill_name = 'Security';

  INSERT INTO achievements (
    achievement_name,
    achievement_description,
    achievement_icon,
    category,
    skill_id,
    requirement_type,
    requirement_value,
    reward_type,
    reward_value,
    rarity,
    points
  ) VALUES
    -- Voting achievements
    ('First Vote', 'Cast your first vote', '🎯', 'skill_milestone', v_voting_id, 'action_count', 1, 'badge', 'first_vote_badge', 'common', 10),
    ('Voting Apprentice', 'Reach level 10 in Voting', '🗳️', 'skill_milestone', v_voting_id, 'reach_level', 10, 'badge', 'voting_apprentice_badge', 'uncommon', 25),
    ('Voting Expert', 'Reach level 50 in Voting', '🏆', 'skill_milestone', v_voting_id, 'reach_level', 50, 'usdc', '10.00', 'rare', 100),
    ('Voting Master', 'Reach level 99 in Voting', '👑', 'skill_milestone', v_voting_id, 'reach_level', 99, 'usdc', '100.00', 'legendary', 500),

    -- Development achievements
    ('Hello World', 'Complete your first coding challenge', '👋', 'skill_milestone', v_development_id, 'action_count', 1, 'badge', 'hello_world_badge', 'common', 10),
    ('Code Warrior', 'Reach level 25 in Development', '⚔️', 'skill_milestone', v_development_id, 'reach_level', 25, 'badge', 'code_warrior_badge', 'uncommon', 50),
    ('Code Master', 'Reach level 99 in Development', '🧙', 'skill_milestone', v_development_id, 'reach_level', 99, 'usdc', '250.00', 'legendary', 1000),

    -- Security achievements
    ('Bug Hunter', 'Report your first vulnerability', '🐛', 'skill_milestone', v_security_id, 'action_count', 1, 'badge', 'bug_hunter_badge', 'common', 15),
    ('Security Expert', 'Reach level 50 in Security', '🛡️', 'skill_milestone', v_security_id, 'reach_level', 50, 'usdc', '50.00', 'rare', 200),
    ('Legendary Hacker', 'Reach level 99 in Security', '🔐', 'skill_milestone', v_security_id, 'reach_level', 99, 'usdc', '500.00', 'legendary', 2000),

    -- Special achievements
    ('Jack of All Trades', 'Reach level 10 in 5 different skills', '🌟', 'special_event', NULL, 'special', 5, 'usdc', '25.00', 'rare', 150),
    ('Master of All', 'Reach level 99 in all skills', '💎', 'special_event', NULL, 'special', 10, 'usdc', '1000.00', 'legendary', 10000)
  ON CONFLICT (achievement_name) DO NOTHING;
END $$;

-- ============================================================
-- Grant Permissions
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON skills TO postgres;
GRANT SELECT ON skill_level_requirements TO postgres;
GRANT SELECT, INSERT, UPDATE ON user_skills TO postgres;
GRANT SELECT ON skill_actions TO postgres;
GRANT SELECT, INSERT ON xp_gain_log TO postgres;
GRANT SELECT, INSERT, UPDATE ON xp_multipliers TO postgres;
GRANT SELECT ON achievements TO postgres;
GRANT SELECT, INSERT, UPDATE ON user_achievements TO postgres;

GRANT SELECT ON user_skill_summary TO postgres;
GRANT SELECT ON skill_leaderboard TO postgres;
GRANT SELECT ON user_total_level TO postgres;
GRANT SELECT ON recent_xp_gains TO postgres;
GRANT SELECT ON user_achievement_summary TO postgres;

-- ============================================================
-- Success Message
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Skills & XP System installed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - skills (10 skills defined)';
  RAISE NOTICE '  - skill_level_requirements (1-99 RuneScape formula)';
  RAISE NOTICE '  - user_skills (track user progress)';
  RAISE NOTICE '  - skill_actions (XP-earning actions)';
  RAISE NOTICE '  - xp_gain_log (audit trail)';
  RAISE NOTICE '  - xp_multipliers (double XP events)';
  RAISE NOTICE '  - achievements (milestones and badges)';
  RAISE NOTICE '  - user_achievements (earned achievements)';
  RAISE NOTICE '';
  RAISE NOTICE 'Skills available:';
  RAISE NOTICE '  - Voting 🗳️';
  RAISE NOTICE '  - Creativity 🎨';
  RAISE NOTICE '  - Development 💻';
  RAISE NOTICE '  - Trading 💰';
  RAISE NOTICE '  - Security 🔒';
  RAISE NOTICE '  - Social 👥';
  RAISE NOTICE '  - Analytics 📊';
  RAISE NOTICE '  - Marketing 📢';
  RAISE NOTICE '  - Design 🎨';
  RAISE NOTICE '  - Writing ✍️';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions created:';
  RAISE NOTICE '  - award_xp() (give XP to user)';
  RAISE NOTICE '  - calculate_level_from_xp() (XP → level)';
  RAISE NOTICE '  - check_achievement_progress() (unlock achievements)';
  RAISE NOTICE '  - claim_achievement_reward() (claim rewards)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Apply migration: psql -U postgres -d calos -f database/migrations/011_add_skills_system.sql';
  RAISE NOTICE '  2. Build skills engine (lib/skills-engine.js)';
  RAISE NOTICE '  3. Integrate with existing systems (voting, challenges, security)';
  RAISE NOTICE '  4. Create leaderboard UI';
END $$;

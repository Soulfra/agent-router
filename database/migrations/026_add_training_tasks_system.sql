-- Training Tasks System
-- Gamified data collection where users perform tasks for XP and rewards
-- Task types: voting, chat, labeling, content generation, QA

-- Training tasks pool
CREATE TABLE IF NOT EXISTS training_tasks (
  id SERIAL PRIMARY KEY,

  -- Task definition
  task_type TEXT NOT NULL,           -- 'vote_model_output', 'chat_conversation', 'label_content', etc.
  task_data JSONB NOT NULL,          -- Task-specific data (prompts, options, context)

  -- Assignment
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_device_id INTEGER REFERENCES user_devices(id) ON DELETE SET NULL,

  -- Rewards
  base_xp_reward INTEGER NOT NULL,
  bonus_xp_potential INTEGER DEFAULT 0,
  skill TEXT,                        -- Which skill this task trains

  -- Priority and timing
  priority INTEGER DEFAULT 1,        -- Higher priority shown first
  estimated_time_seconds INTEGER DEFAULT 60,
  expires_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'available',   -- 'available', 'claimed', 'completed', 'expired', 'rejected'

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_training_tasks_status ON training_tasks(status);
CREATE INDEX idx_training_tasks_type ON training_tasks(task_type);
CREATE INDEX idx_training_tasks_skill ON training_tasks(skill);
CREATE INDEX idx_training_tasks_priority ON training_tasks(priority DESC) WHERE status = 'available';
CREATE INDEX idx_training_tasks_assigned ON training_tasks(assigned_user_id) WHERE status = 'claimed';
CREATE INDEX idx_training_tasks_expires ON training_tasks(expires_at) WHERE status IN ('available', 'claimed');

-- Training task assignments (user completions)
CREATE TABLE IF NOT EXISTS training_task_assignments (
  id SERIAL PRIMARY KEY,

  -- What task
  task_id INTEGER REFERENCES training_tasks(id) ON DELETE CASCADE,

  -- Who did it
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  device_id INTEGER REFERENCES user_devices(id) ON DELETE SET NULL,

  -- Submission
  submission_data JSONB,             -- User's submission (vote, text, labels, etc.)
  quality_score REAL DEFAULT 0.5,    -- 0-1 quality assessment
  time_spent_seconds INTEGER,

  -- Rewards given
  xp_earned INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed', 'flagged'

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_task_assignments_task ON training_task_assignments(task_id);
CREATE INDEX idx_task_assignments_user ON training_task_assignments(user_id);
CREATE INDEX idx_task_assignments_device ON training_task_assignments(device_id);
CREATE INDEX idx_task_assignments_status ON training_task_assignments(status);
CREATE INDEX idx_task_assignments_completed ON training_task_assignments(completed_at DESC) WHERE status = 'completed';

-- Task type definitions (metadata for UI)
CREATE TABLE IF NOT EXISTS training_task_types (
  task_type TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,

  -- Requirements
  min_trust_level TEXT DEFAULT 'unverified',
  cooldown_seconds INTEGER DEFAULT 10,

  -- Rewards
  base_xp INTEGER NOT NULL,
  skill TEXT,

  -- Configuration
  config JSONB DEFAULT '{}'::jsonb,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed task types
INSERT INTO training_task_types (task_type, display_name, description, min_trust_level, cooldown_seconds, base_xp, skill)
VALUES
  ('vote_model_output', 'Vote on Model Output', 'Compare two AI responses and pick the better one', 'unverified', 10, 5, 'judgement'),
  ('rate_response', 'Rate Response Quality', 'Rate an AI response on multiple dimensions', 'verified', 15, 10, 'judgement'),
  ('chat_conversation', 'Chat with AI', 'Have a conversation to generate training data', 'verified', 60, 20, 'communication'),
  ('generate_meme', 'Generate Meme', 'Create a meme based on prompt', 'verified', 30, 15, 'creativity'),
  ('write_prompt', 'Write Creative Prompt', 'Write a creative prompt for AI testing', 'verified', 45, 25, 'creativity'),
  ('label_content', 'Label Content', 'Categorize or tag content', 'verified', 5, 8, 'organization'),
  ('verify_label', 'Verify Label', 'Check if existing label is correct', 'verified', 5, 5, 'judgement'),
  ('flag_inappropriate', 'Flag Inappropriate Content', 'Report content that violates guidelines', 'verified', 10, 10, 'moderation'),
  ('review_submission', 'Review Submission', 'Review another user''s task submission', 'trusted', 20, 15, 'judgement')
ON CONFLICT (task_type) DO NOTHING;

-- Task completion streaks (for gamification)
CREATE TABLE IF NOT EXISTS training_task_streaks (
  id SERIAL PRIMARY KEY,

  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  task_type TEXT,

  -- Streak metrics
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_completed_at TIMESTAMPTZ,

  -- Rewards
  streak_bonus_xp INTEGER DEFAULT 0,

  UNIQUE(user_id, task_type)
);

CREATE INDEX idx_task_streaks_user ON training_task_streaks(user_id);
CREATE INDEX idx_task_streaks_current ON training_task_streaks(current_streak DESC);

-- Task leaderboard (aggregated stats)
CREATE TABLE IF NOT EXISTS training_task_leaderboard (
  id SERIAL PRIMARY KEY,

  -- Time period
  period_type TEXT NOT NULL,         -- 'daily', 'weekly', 'monthly', 'all_time'
  period_start DATE NOT NULL,

  -- Who
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  -- Stats
  tasks_completed INTEGER DEFAULT 0,
  total_xp_earned INTEGER DEFAULT 0,
  avg_quality_score REAL DEFAULT 0,

  -- Ranking
  rank INTEGER,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(period_type, period_start, user_id)
);

CREATE INDEX idx_task_leaderboard_period ON training_task_leaderboard(period_type, period_start);
CREATE INDEX idx_task_leaderboard_rank ON training_task_leaderboard(rank);
CREATE INDEX idx_task_leaderboard_user ON training_task_leaderboard(user_id);

-- Function: Update task streaks
CREATE OR REPLACE FUNCTION update_training_task_streak(p_user_id INTEGER, p_task_type TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_current_streak INTEGER;
  v_last_completed TIMESTAMPTZ;
  v_new_streak INTEGER;
BEGIN
  -- Get current streak
  SELECT current_streak, last_completed_at
  INTO v_current_streak, v_last_completed
  FROM training_task_streaks
  WHERE user_id = p_user_id AND task_type = p_task_type;

  -- Initialize if not exists
  IF v_current_streak IS NULL THEN
    INSERT INTO training_task_streaks (user_id, task_type, current_streak, longest_streak, last_completed_at)
    VALUES (p_user_id, p_task_type, 1, 1, NOW())
    ON CONFLICT (user_id, task_type) DO UPDATE SET
      current_streak = 1,
      longest_streak = 1,
      last_completed_at = NOW();
    RETURN 1;
  END IF;

  -- Check if streak continues (within 48 hours)
  IF v_last_completed > NOW() - INTERVAL '48 hours' THEN
    v_new_streak := v_current_streak + 1;
  ELSE
    v_new_streak := 1; -- Reset streak
  END IF;

  -- Update streak
  UPDATE training_task_streaks
  SET current_streak = v_new_streak,
      longest_streak = GREATEST(longest_streak, v_new_streak),
      last_completed_at = NOW()
  WHERE user_id = p_user_id AND task_type = p_task_type;

  RETURN v_new_streak;
END;
$$ LANGUAGE plpgsql;

-- Function: Refresh leaderboard
CREATE OR REPLACE FUNCTION refresh_training_task_leaderboard(p_period_type TEXT DEFAULT 'all_time')
RETURNS INTEGER AS $$
DECLARE
  v_period_start DATE;
  v_affected_rows INTEGER;
BEGIN
  -- Determine period start
  CASE p_period_type
    WHEN 'daily' THEN v_period_start := CURRENT_DATE;
    WHEN 'weekly' THEN v_period_start := CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER;
    WHEN 'monthly' THEN v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    ELSE v_period_start := '1970-01-01'::DATE; -- all_time
  END CASE;

  -- Aggregate and rank
  WITH user_stats AS (
    SELECT
      ta.user_id,
      COUNT(*) as tasks_completed,
      SUM(ta.xp_earned) as total_xp,
      AVG(ta.quality_score) as avg_quality
    FROM training_task_assignments ta
    WHERE ta.status = 'completed'
      AND (p_period_type = 'all_time' OR ta.completed_at >= v_period_start)
    GROUP BY ta.user_id
  ),
  ranked AS (
    SELECT
      user_id,
      tasks_completed,
      total_xp,
      avg_quality,
      ROW_NUMBER() OVER (ORDER BY total_xp DESC) as rank
    FROM user_stats
  )
  INSERT INTO training_task_leaderboard (
    period_type, period_start, user_id,
    tasks_completed, total_xp_earned, avg_quality_score, rank, updated_at
  )
  SELECT
    p_period_type, v_period_start, user_id,
    tasks_completed, total_xp, avg_quality, rank, NOW()
  FROM ranked
  ON CONFLICT (period_type, period_start, user_id) DO UPDATE SET
    tasks_completed = EXCLUDED.tasks_completed,
    total_xp_earned = EXCLUDED.total_xp_earned,
    avg_quality_score = EXCLUDED.avg_quality_score,
    rank = EXCLUDED.rank,
    updated_at = NOW();

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  RETURN v_affected_rows;
END;
$$ LANGUAGE plpgsql;

-- Function: Expire old tasks
CREATE OR REPLACE FUNCTION expire_old_training_tasks()
RETURNS INTEGER AS $$
DECLARE
  v_affected_rows INTEGER;
BEGIN
  UPDATE training_tasks
  SET status = 'expired'
  WHERE status IN ('available', 'claimed')
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  RETURN v_affected_rows;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update streak on task completion
CREATE OR REPLACE FUNCTION trigger_update_task_streak()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    PERFORM update_training_task_streak(NEW.user_id, (
      SELECT task_type FROM training_tasks WHERE id = NEW.task_id
    ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_task_streak_trigger
AFTER UPDATE ON training_task_assignments
FOR EACH ROW
EXECUTE FUNCTION trigger_update_task_streak();

-- Views for analytics
CREATE OR REPLACE VIEW training_task_stats_by_type AS
SELECT
  tt.task_type,
  ttt.display_name,
  COUNT(*) as total_tasks,
  COUNT(*) FILTER (WHERE tt.status = 'completed') as completed,
  COUNT(*) FILTER (WHERE tt.status = 'available') as available,
  AVG(ta.quality_score) as avg_quality,
  AVG(ta.time_spent_seconds) as avg_time_seconds
FROM training_tasks tt
LEFT JOIN training_task_types ttt ON ttt.task_type = tt.task_type
LEFT JOIN training_task_assignments ta ON ta.task_id = tt.id AND ta.status = 'completed'
GROUP BY tt.task_type, ttt.display_name;

CREATE OR REPLACE VIEW top_task_contributors AS
SELECT
  u.id as user_id,
  u.username,
  COUNT(DISTINCT ta.task_id) as tasks_completed,
  SUM(ta.xp_earned) as total_xp_earned,
  AVG(ta.quality_score) as avg_quality,
  MAX(ta.completed_at) as last_completed_at
FROM training_task_assignments ta
JOIN users u ON u.id = ta.user_id
WHERE ta.status = 'completed'
GROUP BY u.id, u.username
ORDER BY total_xp_earned DESC
LIMIT 100;

-- Comments for documentation
COMMENT ON TABLE training_tasks IS 'Pool of training tasks available for users to complete';
COMMENT ON TABLE training_task_assignments IS 'User completions of training tasks with submissions and rewards';
COMMENT ON TABLE training_task_types IS 'Metadata and configuration for each task type';
COMMENT ON TABLE training_task_streaks IS 'User task completion streaks for gamification';
COMMENT ON TABLE training_task_leaderboard IS 'Ranked leaderboard of top contributors per time period';
COMMENT ON FUNCTION update_training_task_streak IS 'Update user streak after task completion (called by trigger)';
COMMENT ON FUNCTION refresh_training_task_leaderboard IS 'Refresh leaderboard rankings (call daily via cron)';
COMMENT ON FUNCTION expire_old_training_tasks IS 'Mark expired tasks (run every hour via cron)';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON training_tasks TO agent_router_app;
-- GRANT SELECT, INSERT, UPDATE ON training_task_assignments TO agent_router_app;
-- GRANT SELECT ON training_task_types TO agent_router_app;
-- GRANT SELECT, INSERT, UPDATE ON training_task_streaks TO agent_router_app;
-- GRANT SELECT ON training_task_leaderboard TO agent_router_app;

-- Initial completion message
DO $$
BEGIN
  RAISE NOTICE 'Training Tasks System installed successfully!';
  RAISE NOTICE '- 9 task types seeded (voting, chat, labeling, content generation, QA)';
  RAISE NOTICE '- Streak tracking enabled';
  RAISE NOTICE '- Leaderboard system ready';
  RAISE NOTICE '- Quality scoring and XP rewards configured';
  RAISE NOTICE 'Next: Run refresh_training_task_leaderboard() daily via cron';
  RAISE NOTICE 'Next: Run expire_old_training_tasks() hourly via cron';
END $$;

-- Account Warming System
-- Build authentic usage patterns for new accounts (inspired by TikTok account warming)
-- Gradual progression through phases: Observer → Participant → Contributor → Expert

-- Account warmup campaigns
CREATE TABLE IF NOT EXISTS account_warmup_campaigns (
  id SERIAL PRIMARY KEY,

  -- Who's warming up
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  device_id INTEGER REFERENCES user_devices(id) ON DELETE SET NULL,

  -- Campaign configuration
  target_phase TEXT NOT NULL DEFAULT 'contributor',  -- Goal phase
  daily_task_goal INTEGER DEFAULT 5,                 -- Daily task target

  -- Current state
  current_phase TEXT NOT NULL DEFAULT 'observer',    -- 'observer', 'participant', 'contributor', 'expert'
  phase_started_at TIMESTAMPTZ DEFAULT NOW(),

  -- Status
  status TEXT DEFAULT 'active',                      -- 'active', 'paused', 'completed', 'abandoned'

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  UNIQUE(user_id, status) WHERE status = 'active'    -- Only one active campaign per user
);

CREATE INDEX idx_warmup_campaigns_user ON account_warmup_campaigns(user_id);
CREATE INDEX idx_warmup_campaigns_phase ON account_warmup_campaigns(current_phase);
CREATE INDEX idx_warmup_campaigns_status ON account_warmup_campaigns(status);
CREATE INDEX idx_warmup_campaigns_active ON account_warmup_campaigns(status, current_phase) WHERE status = 'active';

-- Warmup phase definitions
CREATE TABLE IF NOT EXISTS account_warmup_phases (
  phase_name TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  duration_days INTEGER,

  -- Requirements to advance
  min_sessions INTEGER DEFAULT 0,
  min_actions INTEGER DEFAULT 0,
  min_time_spent_seconds INTEGER DEFAULT 0,
  min_tasks_completed INTEGER DEFAULT 0,
  min_avg_quality REAL DEFAULT 0,
  min_streak INTEGER DEFAULT 0,

  -- Allowed activities
  allowed_activities JSONB DEFAULT '["*"]'::jsonb,
  allowed_task_types JSONB DEFAULT '["*"]'::jsonb,

  -- Display
  icon TEXT,
  color TEXT,
  order_index INTEGER
);

-- Seed phase definitions
INSERT INTO account_warmup_phases (
  phase_name, display_name, description, duration_days,
  min_sessions, min_actions, min_time_spent_seconds,
  min_tasks_completed, min_avg_quality, min_streak,
  allowed_activities, allowed_task_types,
  icon, color, order_index
)
VALUES
  ('observer', 'Observer', 'Read-only, consume content to build familiarity', 7,
   5, 20, 1800, -- 30 minutes
   0, 0, 0,
   '["view_content", "browse", "search"]'::jsonb,
   '[]'::jsonb,
   '👁️', '#95a5a6', 1),

  ('participant', 'Participant', 'Simple interactions, voting, and ratings', 14,
   15, 75, 5400, -- 90 minutes
   10, 0.6, 0,
   '["view_content", "browse", "search", "vote", "rate", "react"]'::jsonb,
   '["vote_model_output", "rate_response", "verify_label"]'::jsonb,
   '🙋', '#3498db', 2),

  ('contributor', 'Contributor', 'Generate content, complex tasks, community engagement', 21,
   30, 200, 10800, -- 3 hours
   50, 0.7, 3,
   '["*"]'::jsonb,
   '["chat_conversation", "generate_meme", "write_prompt", "label_content"]'::jsonb,
   '✍️', '#2ecc71', 3),

  ('expert', 'Expert', 'Full access, mentorship, high-value tasks', NULL,
   50, 500, 18000, -- 5 hours
   100, 0.8, 7,
   '["*"]'::jsonb,
   '["*"]'::jsonb,
   '⭐', '#f39c12', 4)
ON CONFLICT (phase_name) DO NOTHING;

-- Warmup progress log (audit trail of phase transitions)
CREATE TABLE IF NOT EXISTS account_warmup_progress_log (
  id SERIAL PRIMARY KEY,

  -- What campaign
  campaign_id INTEGER REFERENCES account_warmup_campaigns(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  -- What happened
  event_type TEXT NOT NULL,          -- 'phase_advanced', 'campaign_paused', 'campaign_resumed', 'goal_met'
  from_phase TEXT,
  to_phase TEXT,

  -- Progress snapshot
  metrics JSONB,                     -- Snapshot of progress at time of event

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_warmup_progress_campaign ON account_warmup_progress_log(campaign_id);
CREATE INDEX idx_warmup_progress_user ON account_warmup_progress_log(user_id);
CREATE INDEX idx_warmup_progress_event ON account_warmup_progress_log(event_type);
CREATE INDEX idx_warmup_progress_time ON account_warmup_progress_log(created_at DESC);

-- Warmup activities log (detailed activity tracking)
CREATE TABLE IF NOT EXISTS account_warmup_activities (
  id SERIAL PRIMARY KEY,

  -- What campaign
  campaign_id INTEGER REFERENCES account_warmup_campaigns(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  -- Activity details
  activity_type TEXT NOT NULL,       -- 'view_content', 'vote', 'chat', 'task_complete', etc.
  metadata JSONB,                    -- Activity-specific data

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_warmup_activities_campaign ON account_warmup_activities(campaign_id);
CREATE INDEX idx_warmup_activities_user ON account_warmup_activities(user_id);
CREATE INDEX idx_warmup_activities_type ON account_warmup_activities(activity_type);
CREATE INDEX idx_warmup_activities_time ON account_warmup_activities(created_at DESC);

-- Warmup authenticity metrics (per user)
CREATE TABLE IF NOT EXISTS account_warmup_authenticity (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Authenticity score (0-1)
  authenticity_score REAL DEFAULT 0.5,

  -- Contributing factors
  session_regularity_score REAL DEFAULT 0.5,
  activity_diversity_score REAL DEFAULT 0.5,
  quality_consistency_score REAL DEFAULT 0.5,
  timing_realism_score REAL DEFAULT 0.5,

  -- Flags
  is_suspicious BOOLEAN DEFAULT false,
  suspicious_reasons TEXT[],

  -- Metadata
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_warmup_authenticity_score ON account_warmup_authenticity(authenticity_score DESC);
CREATE INDEX idx_warmup_authenticity_suspicious ON account_warmup_authenticity(is_suspicious) WHERE is_suspicious = true;

-- Function: Calculate user authenticity score
CREATE OR REPLACE FUNCTION calculate_account_authenticity(p_user_id INTEGER)
RETURNS REAL AS $$
DECLARE
  v_score REAL := 0.5;
  v_session_regularity REAL;
  v_diversity REAL;
  v_quality_variance REAL;
  v_unique_days INTEGER;
  v_unique_task_types INTEGER;
BEGIN
  -- Session regularity (consistent daily activity)
  SELECT COUNT(DISTINCT DATE(started_at))
  INTO v_unique_days
  FROM user_sessions
  WHERE user_id = p_user_id
    AND started_at > NOW() - INTERVAL '7 days';

  v_session_regularity := LEAST(1.0, v_unique_days::REAL / 7.0);
  v_score := v_score + (v_session_regularity * 0.2);

  -- Activity diversity (varied task types)
  SELECT COUNT(DISTINCT tt.task_type)
  INTO v_unique_task_types
  FROM training_task_assignments ta
  JOIN training_tasks tt ON tt.id = ta.task_id
  WHERE ta.user_id = p_user_id
    AND ta.status = 'completed';

  v_diversity := LEAST(1.0, v_unique_task_types::REAL / 5.0);
  v_score := v_score + (v_diversity * 0.15);

  -- Quality consistency (realistic variance, not perfect)
  SELECT STDDEV(quality_score)
  INTO v_quality_variance
  FROM training_task_assignments
  WHERE user_id = p_user_id
    AND status = 'completed';

  IF v_quality_variance > 0.05 AND v_quality_variance < 0.25 THEN
    v_score := v_score + 0.15; -- Realistic variance
  ELSIF v_quality_variance = 0 OR v_quality_variance IS NULL THEN
    v_score := v_score - 0.1; -- Suspicious (bot-like)
  END IF;

  -- Clamp to 0-1
  v_score := GREATEST(0.0, LEAST(1.0, v_score));

  -- Update authenticity table
  INSERT INTO account_warmup_authenticity (
    user_id, authenticity_score,
    session_regularity_score, activity_diversity_score,
    last_calculated_at, updated_at
  )
  VALUES (
    p_user_id, v_score,
    v_session_regularity, v_diversity,
    NOW(), NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    authenticity_score = v_score,
    session_regularity_score = v_session_regularity,
    activity_diversity_score = v_diversity,
    last_calculated_at = NOW(),
    updated_at = NOW();

  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Function: Check and auto-advance warmup phase
CREATE OR REPLACE FUNCTION check_warmup_phase_advancement(p_user_id INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_campaign_id INTEGER;
  v_current_phase TEXT;
  v_next_phase TEXT;
  v_phase_order TEXT[] := ARRAY['observer', 'participant', 'contributor', 'expert'];
  v_current_index INTEGER;
  v_can_advance BOOLEAN := true;
  v_sessions INTEGER;
  v_actions INTEGER;
  v_time_spent NUMERIC;
  v_tasks_completed INTEGER;
  v_avg_quality REAL;
  v_max_streak INTEGER;
  v_phase_reqs RECORD;
BEGIN
  -- Get active campaign
  SELECT id, current_phase
  INTO v_campaign_id, v_current_phase
  FROM account_warmup_campaigns
  WHERE user_id = p_user_id
    AND status = 'active'
  LIMIT 1;

  IF v_campaign_id IS NULL THEN
    RETURN NULL; -- No active campaign
  END IF;

  -- Get phase requirements
  SELECT * INTO v_phase_reqs
  FROM account_warmup_phases
  WHERE phase_name = v_current_phase;

  -- Calculate user metrics
  SELECT
    COUNT(DISTINCT us.id),
    COUNT(DISTINCT al.id),
    COALESCE(SUM(EXTRACT(EPOCH FROM (us.ended_at - us.started_at))), 0)
  INTO v_sessions, v_actions, v_time_spent
  FROM users u
  LEFT JOIN user_sessions us ON us.user_id = u.id
  LEFT JOIN actions_log al ON al.user_id = u.id
  WHERE u.id = p_user_id;

  SELECT
    COUNT(*),
    AVG(quality_score),
    COALESCE(MAX(ts.current_streak), 0)
  INTO v_tasks_completed, v_avg_quality, v_max_streak
  FROM training_task_assignments ta
  LEFT JOIN training_task_streaks ts ON ts.user_id = ta.user_id
  WHERE ta.user_id = p_user_id
    AND ta.status = 'completed';

  -- Check requirements
  IF v_sessions < v_phase_reqs.min_sessions THEN v_can_advance := false; END IF;
  IF v_actions < v_phase_reqs.min_actions THEN v_can_advance := false; END IF;
  IF v_time_spent < v_phase_reqs.min_time_spent_seconds THEN v_can_advance := false; END IF;
  IF v_tasks_completed < v_phase_reqs.min_tasks_completed THEN v_can_advance := false; END IF;
  IF COALESCE(v_avg_quality, 0) < v_phase_reqs.min_avg_quality THEN v_can_advance := false; END IF;
  IF v_max_streak < v_phase_reqs.min_streak THEN v_can_advance := false; END IF;

  IF NOT v_can_advance THEN
    RETURN v_current_phase; -- Not ready to advance
  END IF;

  -- Determine next phase
  v_current_index := array_position(v_phase_order, v_current_phase);
  IF v_current_index = array_length(v_phase_order, 1) THEN
    -- Final phase, complete campaign
    UPDATE account_warmup_campaigns
    SET status = 'completed', completed_at = NOW()
    WHERE id = v_campaign_id;

    RETURN v_current_phase; -- Completed
  END IF;

  v_next_phase := v_phase_order[v_current_index + 1];

  -- Advance to next phase
  UPDATE account_warmup_campaigns
  SET current_phase = v_next_phase,
      phase_started_at = NOW()
  WHERE id = v_campaign_id;

  -- Log advancement
  INSERT INTO account_warmup_progress_log (
    campaign_id, user_id, event_type, from_phase, to_phase
  )
  VALUES (
    v_campaign_id, p_user_id, 'phase_advanced',
    v_current_phase, v_next_phase
  );

  RETURN v_next_phase;
END;
$$ LANGUAGE plpgsql;

-- View: Warmup campaign summary
CREATE OR REPLACE VIEW account_warmup_summary AS
SELECT
  awc.id as campaign_id,
  awc.user_id,
  u.username,
  u.email,
  awc.current_phase,
  awp.display_name as phase_name,
  awc.target_phase,
  awc.daily_task_goal,
  awc.status,
  EXTRACT(DAYS FROM NOW() - awc.phase_started_at) as days_in_current_phase,
  EXTRACT(DAYS FROM NOW() - awc.created_at) as total_campaign_days,
  awa.authenticity_score,
  awc.created_at as campaign_started_at
FROM account_warmup_campaigns awc
JOIN users u ON u.id = awc.user_id
LEFT JOIN account_warmup_phases awp ON awp.phase_name = awc.current_phase
LEFT JOIN account_warmup_authenticity awa ON awa.user_id = awc.user_id
WHERE awc.status = 'active';

-- Comments for documentation
COMMENT ON TABLE account_warmup_campaigns IS 'User account warmup campaigns with phase progression';
COMMENT ON TABLE account_warmup_phases IS 'Definition of warmup phases with requirements and permissions';
COMMENT ON TABLE account_warmup_progress_log IS 'Audit log of phase advancements and milestone events';
COMMENT ON TABLE account_warmup_activities IS 'Detailed activity tracking for warmup campaigns';
COMMENT ON TABLE account_warmup_authenticity IS 'Authenticity scoring to detect bot-like behavior';
COMMENT ON FUNCTION calculate_account_authenticity IS 'Calculate user authenticity score based on behavior patterns';
COMMENT ON FUNCTION check_warmup_phase_advancement IS 'Check if user meets phase requirements and auto-advance';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON account_warmup_campaigns TO agent_router_app;
-- GRANT SELECT ON account_warmup_phases TO agent_router_app;
-- GRANT SELECT, INSERT ON account_warmup_progress_log TO agent_router_app;
-- GRANT SELECT, INSERT ON account_warmup_activities TO agent_router_app;
-- GRANT SELECT, INSERT, UPDATE ON account_warmup_authenticity TO agent_router_app;

-- Initial completion message
DO $$
BEGIN
  RAISE NOTICE 'Account Warming System installed successfully!';
  RAISE NOTICE '- 4 warmup phases defined (Observer → Participant → Contributor → Expert)';
  RAISE NOTICE '- Authenticity scoring enabled';
  RAISE NOTICE '- Automatic phase advancement configured';
  RAISE NOTICE '- Activity tracking and audit logging ready';
  RAISE NOTICE 'Next: Run calculate_account_authenticity(user_id) nightly via cron';
  RAISE NOTICE 'Next: Run check_warmup_phase_advancement(user_id) after task completions';
END $$;

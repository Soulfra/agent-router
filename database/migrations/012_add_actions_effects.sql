/**
 * Migration 012: Actions & Effects System
 *
 * Connect user behaviors to rewards and skill progression
 * Track all actions across platform (voting, coding, security, social)
 * Define effects (XP awards, achievement unlocks, bonuses)
 * Support conditional effects and action chaining
 */

-- =====================================================
-- ACTION DEFINITIONS
-- =====================================================

/**
 * All possible actions users can perform
 */
CREATE TABLE IF NOT EXISTS action_definitions (
  action_def_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_code VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'vote_like', 'submit_code', 'report_bug'
  action_name VARCHAR(255) NOT NULL,
  action_description TEXT,
  action_category VARCHAR(50) NOT NULL, -- 'voting', 'development', 'security', 'social', 'trading'

  -- Rate limiting
  cooldown_seconds INT DEFAULT 0,
  daily_limit INT DEFAULT NULL, -- Max times per day (NULL = unlimited)

  -- Requirements
  min_level INT DEFAULT 1,
  required_skill_id UUID REFERENCES skills(skill_id),

  -- Metadata
  icon VARCHAR(100),
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_action_definitions_category ON action_definitions(action_category);
CREATE INDEX idx_action_definitions_enabled ON action_definitions(enabled);

/**
 * Effects that can be triggered by actions
 */
CREATE TABLE IF NOT EXISTS effect_definitions (
  effect_def_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effect_code VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'award_xp', 'unlock_achievement', 'pay_usdc'
  effect_name VARCHAR(255) NOT NULL,
  effect_description TEXT,
  effect_type VARCHAR(50) NOT NULL, -- 'xp', 'achievement', 'payment', 'unlock', 'notification'

  -- Effect configuration (JSON)
  effect_config JSONB DEFAULT '{}', -- Store effect-specific parameters

  -- Metadata
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_effect_definitions_type ON effect_definitions(effect_type);

/**
 * Map actions to their effects
 * One action can trigger multiple effects
 */
CREATE TABLE IF NOT EXISTS action_effects (
  action_effect_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_def_id UUID NOT NULL REFERENCES action_definitions(action_def_id) ON DELETE CASCADE,
  effect_def_id UUID NOT NULL REFERENCES effect_definitions(effect_def_id) ON DELETE CASCADE,

  -- Effect parameters (override defaults from effect_config)
  effect_params JSONB DEFAULT '{}',

  -- Execution order (lower = earlier)
  execution_order INT DEFAULT 0,

  -- Conditional execution
  condition_type VARCHAR(50), -- 'level_range', 'skill_level', 'time_range', 'random_chance'
  condition_params JSONB DEFAULT '{}',

  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_action_effects_action ON action_effects(action_def_id);
CREATE INDEX idx_action_effects_effect ON action_effects(effect_def_id);

/**
 * Log all user actions
 * Used for analytics, rate limiting, and cooldowns
 */
CREATE TABLE IF NOT EXISTS user_action_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  action_def_id UUID NOT NULL REFERENCES action_definitions(action_def_id),

  -- Context
  domain_id UUID REFERENCES domain_portfolio(domain_id),
  session_id UUID REFERENCES user_sessions(session_id),

  -- Action data
  action_data JSONB DEFAULT '{}', -- Store action-specific data

  -- Results
  success BOOLEAN DEFAULT TRUE,
  effects_triggered INT DEFAULT 0,
  error_message TEXT,

  -- Metadata
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_action_log_user ON user_action_log(user_id, created_at DESC);
CREATE INDEX idx_user_action_log_action ON user_action_log(action_def_id, created_at DESC);
CREATE INDEX idx_user_action_log_date ON user_action_log(created_at DESC);

/**
 * Track effect executions
 */
CREATE TABLE IF NOT EXISTS effect_execution_log (
  execution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id UUID NOT NULL REFERENCES user_action_log(log_id) ON DELETE CASCADE,
  effect_def_id UUID NOT NULL REFERENCES effect_definitions(effect_def_id),

  -- Execution details
  effect_params JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}', -- Store effect result (e.g., XP gained, payment amount)

  -- Status
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_effect_execution_log_action ON effect_execution_log(log_id);
CREATE INDEX idx_effect_execution_log_effect ON effect_execution_log(effect_def_id);

/**
 * Action triggers (automation)
 * Define when actions should automatically fire
 */
CREATE TABLE IF NOT EXISTS action_triggers (
  trigger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_name VARCHAR(255) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL, -- 'schedule', 'webhook', 'event', 'chain'

  -- Trigger for this action
  action_def_id UUID NOT NULL REFERENCES action_definitions(action_def_id),

  -- Trigger configuration
  trigger_config JSONB DEFAULT '{}',

  -- Chaining (trigger after another action)
  parent_action_def_id UUID REFERENCES action_definitions(action_def_id),
  chain_condition VARCHAR(50), -- 'always', 'on_success', 'on_failure'

  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_action_triggers_action ON action_triggers(action_def_id);
CREATE INDEX idx_action_triggers_parent ON action_triggers(parent_action_def_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

/**
 * Check if user can perform action (rate limiting, cooldown)
 */
CREATE OR REPLACE FUNCTION check_action_availability(
  p_user_id UUID,
  p_action_code VARCHAR(100)
) RETURNS TABLE (
  available BOOLEAN,
  reason VARCHAR(255),
  cooldown_remaining INT,
  daily_uses_remaining INT
) AS $$
DECLARE
  v_action_def_id UUID;
  v_cooldown_seconds INT;
  v_daily_limit INT;
  v_last_action_time TIMESTAMP;
  v_today_count INT;
  v_min_level INT;
  v_required_skill_id UUID;
  v_user_skill_level INT;
BEGIN
  -- Get action definition
  SELECT
    action_def_id,
    cooldown_seconds,
    daily_limit,
    min_level,
    required_skill_id
  INTO
    v_action_def_id,
    v_cooldown_seconds,
    v_daily_limit,
    v_min_level,
    v_required_skill_id
  FROM action_definitions
  WHERE action_code = p_action_code AND enabled = TRUE;

  IF v_action_def_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Action not found or disabled', 0, 0;
    RETURN;
  END IF;

  -- Check skill level requirement
  IF v_required_skill_id IS NOT NULL THEN
    SELECT current_level INTO v_user_skill_level
    FROM user_skills
    WHERE user_id = p_user_id AND skill_id = v_required_skill_id;

    IF v_user_skill_level IS NULL OR v_user_skill_level < v_min_level THEN
      RETURN QUERY SELECT FALSE, 'Skill level requirement not met', 0, 0;
      RETURN;
    END IF;
  END IF;

  -- Check cooldown
  IF v_cooldown_seconds > 0 THEN
    SELECT created_at INTO v_last_action_time
    FROM user_action_log
    WHERE user_id = p_user_id
      AND action_def_id = v_action_def_id
      AND success = TRUE
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_action_time IS NOT NULL THEN
      DECLARE
        v_seconds_elapsed INT;
      BEGIN
        v_seconds_elapsed := EXTRACT(EPOCH FROM (NOW() - v_last_action_time))::INT;

        IF v_seconds_elapsed < v_cooldown_seconds THEN
          RETURN QUERY SELECT FALSE, 'Action on cooldown', v_cooldown_seconds - v_seconds_elapsed, NULL::INT;
          RETURN;
        END IF;
      END;
    END IF;
  END IF;

  -- Check daily limit
  IF v_daily_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_today_count
    FROM user_action_log
    WHERE user_id = p_user_id
      AND action_def_id = v_action_def_id
      AND success = TRUE
      AND created_at >= CURRENT_DATE;

    IF v_today_count >= v_daily_limit THEN
      RETURN QUERY SELECT FALSE, 'Daily limit reached', 0, 0;
      RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, 'Available', 0, v_daily_limit - v_today_count;
    RETURN;
  END IF;

  -- All checks passed
  RETURN QUERY SELECT TRUE, 'Available', 0, NULL::INT;
END;
$$ LANGUAGE plpgsql;

/**
 * Execute action and trigger all effects
 */
CREATE OR REPLACE FUNCTION execute_action(
  p_user_id UUID,
  p_action_code VARCHAR(100),
  p_action_data JSONB DEFAULT '{}',
  p_domain_id UUID DEFAULT NULL,
  p_session_id UUID DEFAULT NULL,
  p_ip_address VARCHAR(45) DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS TABLE (
  log_id UUID,
  success BOOLEAN,
  effects_triggered INT,
  results JSONB,
  error_message TEXT
) AS $$
DECLARE
  v_action_def_id UUID;
  v_log_id UUID;
  v_effects_triggered INT := 0;
  v_results JSONB := '[]'::JSONB;
  v_effect_record RECORD;
  v_effect_result JSONB;
BEGIN
  -- Get action definition
  SELECT action_def_id INTO v_action_def_id
  FROM action_definitions
  WHERE action_code = p_action_code AND enabled = TRUE;

  IF v_action_def_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, 0, '[]'::JSONB, 'Action not found';
    RETURN;
  END IF;

  -- Log action
  INSERT INTO user_action_log (
    user_id,
    action_def_id,
    domain_id,
    session_id,
    action_data,
    ip_address,
    user_agent,
    success
  ) VALUES (
    p_user_id,
    v_action_def_id,
    p_domain_id,
    p_session_id,
    p_action_data,
    p_ip_address,
    p_user_agent,
    TRUE
  ) RETURNING user_action_log.log_id INTO v_log_id;

  -- Execute all effects for this action
  FOR v_effect_record IN
    SELECT
      ae.effect_def_id,
      ae.effect_params,
      ed.effect_type,
      ed.effect_config
    FROM action_effects ae
    JOIN effect_definitions ed ON ae.effect_def_id = ed.effect_def_id
    WHERE ae.action_def_id = v_action_def_id
      AND ae.enabled = TRUE
    ORDER BY ae.execution_order
  LOOP
    BEGIN
      -- Execute effect based on type
      v_effect_result := execute_effect(
        p_user_id,
        v_log_id,
        v_effect_record.effect_def_id,
        v_effect_record.effect_type,
        v_effect_record.effect_config || v_effect_record.effect_params,
        p_action_data
      );

      v_effects_triggered := v_effects_triggered + 1;
      v_results := v_results || v_effect_result;

    EXCEPTION WHEN OTHERS THEN
      -- Log effect failure but continue
      INSERT INTO effect_execution_log (
        log_id,
        effect_def_id,
        effect_params,
        success,
        error_message
      ) VALUES (
        v_log_id,
        v_effect_record.effect_def_id,
        v_effect_record.effect_params,
        FALSE,
        SQLERRM
      );
    END;
  END LOOP;

  -- Update action log with effects count
  UPDATE user_action_log
  SET effects_triggered = v_effects_triggered
  WHERE user_action_log.log_id = v_log_id;

  RETURN QUERY SELECT v_log_id, TRUE, v_effects_triggered, v_results, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

/**
 * Execute individual effect
 */
CREATE OR REPLACE FUNCTION execute_effect(
  p_user_id UUID,
  p_log_id UUID,
  p_effect_def_id UUID,
  p_effect_type VARCHAR(50),
  p_effect_config JSONB,
  p_action_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB := '{}'::JSONB;
  v_skill_id UUID;
  v_base_xp INT;
  v_xp_result RECORD;
BEGIN
  -- Execute based on effect type
  CASE p_effect_type
    WHEN 'xp' THEN
      -- Award XP to skill
      v_skill_id := (p_effect_config->>'skill_id')::UUID;
      v_base_xp := (p_effect_config->>'xp_amount')::INT;

      -- Call award_xp function
      SELECT * INTO v_xp_result
      FROM award_xp(
        p_user_id,
        v_skill_id,
        v_base_xp,
        NULL, -- action_id (from skill_actions table)
        'action_system'
      );

      v_result := jsonb_build_object(
        'type', 'xp',
        'skill_id', v_skill_id,
        'xp_gained', v_xp_result.xp_gained,
        'level_after', v_xp_result.level_after,
        'leveled_up', v_xp_result.leveled_up
      );

    WHEN 'achievement' THEN
      -- Check achievement progress
      PERFORM check_achievement_progress(p_user_id);
      v_result := jsonb_build_object('type', 'achievement', 'checked', TRUE);

    WHEN 'payment' THEN
      -- Record pending payment
      v_result := jsonb_build_object(
        'type', 'payment',
        'amount_usdc', p_effect_config->>'amount_usdc',
        'pending', TRUE
      );

    WHEN 'notification' THEN
      -- Create notification (would integrate with notification system)
      v_result := jsonb_build_object(
        'type', 'notification',
        'message', p_effect_config->>'message'
      );

    ELSE
      v_result := jsonb_build_object('type', p_effect_type, 'executed', TRUE);
  END CASE;

  -- Log effect execution
  INSERT INTO effect_execution_log (
    log_id,
    effect_def_id,
    effect_params,
    result,
    success
  ) VALUES (
    p_log_id,
    p_effect_def_id,
    p_effect_config,
    v_result,
    TRUE
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEWS
-- =====================================================

/**
 * User action summary
 */
CREATE OR REPLACE VIEW user_action_summary AS
SELECT
  u.user_id,
  u.username,
  u.email,
  COUNT(DISTINCT ual.action_def_id) as unique_actions,
  COUNT(*) as total_actions,
  SUM(CASE WHEN ual.success THEN 1 ELSE 0 END) as successful_actions,
  SUM(ual.effects_triggered) as total_effects_triggered,
  MIN(ual.created_at) as first_action_at,
  MAX(ual.created_at) as last_action_at
FROM users u
LEFT JOIN user_action_log ual ON u.user_id = ual.user_id
GROUP BY u.user_id, u.username, u.email;

/**
 * Action leaderboard
 */
CREATE OR REPLACE VIEW action_leaderboard AS
SELECT
  ad.action_code,
  ad.action_name,
  ad.action_category,
  COUNT(*) as total_uses,
  COUNT(DISTINCT ual.user_id) as unique_users,
  AVG(ual.effects_triggered) as avg_effects_per_use,
  MAX(ual.created_at) as last_used_at
FROM action_definitions ad
LEFT JOIN user_action_log ual ON ad.action_def_id = ual.action_def_id
WHERE ual.success = TRUE
GROUP BY ad.action_def_id, ad.action_code, ad.action_name, ad.action_category
ORDER BY total_uses DESC;

/**
 * Recent activity feed
 */
CREATE OR REPLACE VIEW recent_activity_feed AS
SELECT
  ual.log_id,
  u.username,
  u.display_name,
  ad.action_name,
  ad.action_category,
  ad.icon,
  ual.effects_triggered,
  ual.created_at,
  dp.domain_name
FROM user_action_log ual
JOIN users u ON ual.user_id = u.user_id
JOIN action_definitions ad ON ual.action_def_id = ad.action_def_id
LEFT JOIN domain_portfolio dp ON ual.domain_id = dp.domain_id
WHERE ual.success = TRUE
ORDER BY ual.created_at DESC
LIMIT 100;

-- =====================================================
-- SEED DATA
-- =====================================================

/**
 * Seed core action definitions
 */
INSERT INTO action_definitions (action_code, action_name, action_description, action_category, cooldown_seconds, daily_limit, icon) VALUES
-- Voting actions
('vote_like', 'Like Domain', 'Vote positively for a domain', 'voting', 3, 1000, '👍'),
('vote_dislike', 'Dislike Domain', 'Vote negatively for a domain', 'voting', 3, 1000, '👎'),
('submit_feedback', 'Submit Feedback', 'Provide detailed domain feedback', 'voting', 30, 100, '📝'),
('share_domain', 'Share Domain', 'Share domain with others', 'voting', 10, 50, '🔗'),

-- Development actions
('submit_code', 'Submit Code', 'Submit code implementation', 'development', 60, 20, '💻'),
('review_code', 'Review Code', 'Review peer code submission', 'development', 30, 30, '👀'),
('complete_challenge', 'Complete Challenge', 'Finish coding challenge', 'development', 300, 10, '🏆'),
('contribute_docs', 'Contribute Docs', 'Add documentation', 'development', 60, 20, '📚'),

-- Security actions
('report_bug', 'Report Bug', 'Report security vulnerability', 'security', 60, 10, '🐛'),
('verify_fix', 'Verify Fix', 'Verify bug fix works', 'security', 30, 20, '✅'),
('security_scan', 'Security Scan', 'Run security scan', 'security', 300, 5, '🔒'),

-- Social actions
('create_post', 'Create Post', 'Create social post', 'social', 30, 50, '✍️'),
('comment', 'Comment', 'Comment on post', 'social', 5, 200, '💬'),
('like_post', 'Like Post', 'Like content', 'social', 1, 500, '❤️'),
('follow_user', 'Follow User', 'Follow another user', 'social', 5, 100, '👥'),

-- Trading actions
('list_item', 'List Item', 'List item for sale', 'trading', 30, 50, '🏷️'),
('make_offer', 'Make Offer', 'Make purchase offer', 'trading', 10, 100, '💰'),
('complete_trade', 'Complete Trade', 'Finalize trade', 'trading', 30, 50, '🤝')
ON CONFLICT (action_code) DO NOTHING;

/**
 * Seed core effect definitions
 */
INSERT INTO effect_definitions (effect_code, effect_name, effect_description, effect_type, effect_config) VALUES
-- XP effects
('award_voting_xp', 'Award Voting XP', 'Grant XP to Voting skill', 'xp', '{"xp_amount": 10}'),
('award_dev_xp', 'Award Development XP', 'Grant XP to Development skill', 'xp', '{"xp_amount": 50}'),
('award_security_xp', 'Award Security XP', 'Grant XP to Security skill', 'xp', '{"xp_amount": 100}'),
('award_social_xp', 'Award Social XP', 'Grant XP to Social skill', 'xp', '{"xp_amount": 5}'),
('award_trading_xp', 'Award Trading XP', 'Grant XP to Trading skill', 'xp', '{"xp_amount": 25}'),

-- Payment effects
('pay_vote_reward', 'Vote Reward Payment', 'Pay user for voting', 'payment', '{"amount_usdc": 0.25}'),
('pay_feedback_reward', 'Feedback Reward Payment', 'Pay user for feedback', 'payment', '{"amount_usdc": 2.00}'),
('pay_bug_bounty', 'Bug Bounty Payment', 'Pay security bounty', 'payment', '{"amount_usdc": 50.00}'),

-- Achievement effects
('check_achievements', 'Check Achievements', 'Check for new achievements', 'achievement', '{}'),

-- Notification effects
('notify_level_up', 'Level Up Notification', 'Notify user of level up', 'notification', '{"message": "Congratulations! You leveled up!"}')
ON CONFLICT (effect_code) DO NOTHING;

/**
 * Connect actions to effects
 */
DO $$
DECLARE
  v_voting_skill_id UUID;
  v_dev_skill_id UUID;
  v_security_skill_id UUID;
  v_social_skill_id UUID;
  v_trading_skill_id UUID;
BEGIN
  -- Get skill IDs
  SELECT skill_id INTO v_voting_skill_id FROM skills WHERE skill_name = 'Voting';
  SELECT skill_id INTO v_dev_skill_id FROM skills WHERE skill_name = 'Development';
  SELECT skill_id INTO v_security_skill_id FROM skills WHERE skill_name = 'Security';
  SELECT skill_id INTO v_social_skill_id FROM skills WHERE skill_name = 'Social';
  SELECT skill_id INTO v_trading_skill_id FROM skills WHERE skill_name = 'Trading';

  -- Voting actions → effects
  INSERT INTO action_effects (action_def_id, effect_def_id, effect_params, execution_order)
  SELECT
    ad.action_def_id,
    ed.effect_def_id,
    jsonb_build_object('skill_id', v_voting_skill_id, 'xp_amount', 10),
    1
  FROM action_definitions ad
  CROSS JOIN effect_definitions ed
  WHERE ad.action_code IN ('vote_like', 'vote_dislike', 'share_domain')
    AND ed.effect_code = 'award_voting_xp'
  ON CONFLICT DO NOTHING;

  -- Feedback → XP + payment
  INSERT INTO action_effects (action_def_id, effect_def_id, effect_params, execution_order)
  SELECT ad.action_def_id, ed.effect_def_id,
    jsonb_build_object('skill_id', v_voting_skill_id, 'xp_amount', 25), 1
  FROM action_definitions ad
  CROSS JOIN effect_definitions ed
  WHERE ad.action_code = 'submit_feedback' AND ed.effect_code = 'award_voting_xp'
  ON CONFLICT DO NOTHING;

  INSERT INTO action_effects (action_def_id, effect_def_id, execution_order)
  SELECT ad.action_def_id, ed.effect_def_id, 2
  FROM action_definitions ad
  CROSS JOIN effect_definitions ed
  WHERE ad.action_code = 'submit_feedback' AND ed.effect_code = 'pay_feedback_reward'
  ON CONFLICT DO NOTHING;

  -- Development actions → XP
  INSERT INTO action_effects (action_def_id, effect_def_id, effect_params, execution_order)
  SELECT ad.action_def_id, ed.effect_def_id,
    jsonb_build_object('skill_id', v_dev_skill_id, 'xp_amount', 50), 1
  FROM action_definitions ad
  CROSS JOIN effect_definitions ed
  WHERE ad.action_code IN ('submit_code', 'review_code', 'contribute_docs')
    AND ed.effect_code = 'award_dev_xp'
  ON CONFLICT DO NOTHING;

  -- Complete challenge → bonus XP
  INSERT INTO action_effects (action_def_id, effect_def_id, effect_params, execution_order)
  SELECT ad.action_def_id, ed.effect_def_id,
    jsonb_build_object('skill_id', v_dev_skill_id, 'xp_amount', 200), 1
  FROM action_definitions ad
  CROSS JOIN effect_definitions ed
  WHERE ad.action_code = 'complete_challenge' AND ed.effect_code = 'award_dev_xp'
  ON CONFLICT DO NOTHING;

  -- Security actions → XP + bounty
  INSERT INTO action_effects (action_def_id, effect_def_id, effect_params, execution_order)
  SELECT ad.action_def_id, ed.effect_def_id,
    jsonb_build_object('skill_id', v_security_skill_id, 'xp_amount', 100), 1
  FROM action_definitions ad
  CROSS JOIN effect_definitions ed
  WHERE ad.action_code = 'report_bug' AND ed.effect_code = 'award_security_xp'
  ON CONFLICT DO NOTHING;

  INSERT INTO action_effects (action_def_id, effect_def_id, execution_order)
  SELECT ad.action_def_id, ed.effect_def_id, 2
  FROM action_definitions ad
  CROSS JOIN effect_definitions ed
  WHERE ad.action_code = 'report_bug' AND ed.effect_code = 'pay_bug_bounty'
  ON CONFLICT DO NOTHING;

  -- Social actions → XP
  INSERT INTO action_effects (action_def_id, effect_def_id, effect_params, execution_order)
  SELECT ad.action_def_id, ed.effect_def_id,
    jsonb_build_object('skill_id', v_social_skill_id, 'xp_amount', 5), 1
  FROM action_definitions ad
  CROSS JOIN effect_definitions ed
  WHERE ad.action_code IN ('create_post', 'comment', 'like_post', 'follow_user')
    AND ed.effect_code = 'award_social_xp'
  ON CONFLICT DO NOTHING;

  -- Trading actions → XP
  INSERT INTO action_effects (action_def_id, effect_def_id, effect_params, execution_order)
  SELECT ad.action_def_id, ed.effect_def_id,
    jsonb_build_object('skill_id', v_trading_skill_id, 'xp_amount', 25), 1
  FROM action_definitions ad
  CROSS JOIN effect_definitions ed
  WHERE ad.action_code IN ('list_item', 'make_offer', 'complete_trade')
    AND ed.effect_code = 'award_trading_xp'
  ON CONFLICT DO NOTHING;

  -- All actions → check achievements
  INSERT INTO action_effects (action_def_id, effect_def_id, execution_order)
  SELECT ad.action_def_id, ed.effect_def_id, 999
  FROM action_definitions ad
  CROSS JOIN effect_definitions ed
  WHERE ed.effect_code = 'check_achievements'
  ON CONFLICT DO NOTHING;
END $$;

/**
 * Add comment explaining system
 */
COMMENT ON TABLE action_definitions IS 'Defines all possible user actions (voting, coding, security, social, trading)';
COMMENT ON TABLE effect_definitions IS 'Defines effects that can be triggered (XP awards, payments, achievements)';
COMMENT ON TABLE action_effects IS 'Maps which effects trigger when actions occur';
COMMENT ON TABLE user_action_log IS 'Logs every user action for analytics and rate limiting';
COMMENT ON TABLE effect_execution_log IS 'Logs every effect execution with results';
COMMENT ON FUNCTION execute_action IS 'Execute user action and trigger all configured effects';

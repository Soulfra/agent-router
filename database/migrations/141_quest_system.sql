-- ============================================================================
-- Quest System - Gamification Platform
-- ============================================================================
-- Transform CALOS into a quest-driven game where users unlock apps/features
-- through invites, forum participation, and collaboration.
--
-- Pattern: DND Dungeon Master + Pokemon progression + Invite game mechanics
-- ============================================================================

-- ============================================================================
-- Quest Definitions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS quests (
  quest_id SERIAL PRIMARY KEY,
  quest_slug VARCHAR(255) UNIQUE NOT NULL,
  quest_name VARCHAR(500) NOT NULL,
  quest_description TEXT NOT NULL,
  quest_type VARCHAR(50) NOT NULL, -- 'invite', 'forum', 'collaboration', 'achievement', 'onboarding'
  difficulty VARCHAR(20) DEFAULT 'easy', -- 'easy', 'medium', 'hard', 'legendary'

  -- Requirements
  required_count INTEGER DEFAULT 1, -- How many times to complete action
  required_value INTEGER, -- Threshold (e.g., upvotes needed)
  required_data JSONB DEFAULT '{}', -- Additional requirements

  -- Rewards
  reward_type VARCHAR(50) NOT NULL, -- 'app_unlock', 'feature_unlock', 'tier_upgrade', 'karma', 'badge'
  reward_data JSONB NOT NULL, -- What gets unlocked {"app": "bot-builder"} or {"karma": 100}
  reward_description TEXT,

  -- Quest Chain
  prerequisite_quest_ids INTEGER[], -- Must complete these quests first
  unlocks_quest_ids INTEGER[], -- Completing this unlocks these quests

  -- Metadata
  icon_emoji VARCHAR(10) DEFAULT '🎯',
  is_hidden BOOLEAN DEFAULT false, -- Hidden until prerequisites met
  is_repeatable BOOLEAN DEFAULT false,
  expiry_days INTEGER, -- Quest expires after X days (NULL = never expires)

  -- DND Master Narrative
  narrative_intro TEXT, -- What DND Master says when quest appears
  narrative_progress TEXT, -- What DND Master says during progress
  narrative_complete TEXT, -- What DND Master says on completion

  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quests_type ON quests(quest_type);
CREATE INDEX idx_quests_difficulty ON quests(difficulty);
CREATE INDEX idx_quests_active ON quests(is_active);

-- ============================================================================
-- User Quest Progress Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_quest_progress (
  progress_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  quest_id INTEGER NOT NULL REFERENCES quests(quest_id) ON DELETE CASCADE,

  -- Progress
  status VARCHAR(20) DEFAULT 'available', -- 'locked', 'available', 'in_progress', 'completed', 'claimed'
  current_count INTEGER DEFAULT 0, -- How many times action completed
  current_value INTEGER DEFAULT 0, -- Current value (e.g., total upvotes)
  progress_data JSONB DEFAULT '{}', -- Additional tracking data

  -- Timestamps
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  claimed_at TIMESTAMP,
  expires_at TIMESTAMP,

  -- Metadata
  completion_metadata JSONB, -- Context when completed (which friends invited, etc.)

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, quest_id)
);

CREATE INDEX idx_user_quest_progress_user ON user_quest_progress(user_id);
CREATE INDEX idx_user_quest_progress_quest ON user_quest_progress(quest_id);
CREATE INDEX idx_user_quest_progress_status ON user_quest_progress(status);

-- ============================================================================
-- Quest Rewards Claimed Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS quest_rewards_claimed (
  reward_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  quest_id INTEGER NOT NULL REFERENCES quests(quest_id) ON DELETE CASCADE,
  progress_id INTEGER REFERENCES user_quest_progress(progress_id) ON DELETE CASCADE,

  reward_type VARCHAR(50) NOT NULL,
  reward_data JSONB NOT NULL,

  claimed_at TIMESTAMP DEFAULT NOW(),

  -- Track what was unlocked
  app_unlocked VARCHAR(255), -- Which app was unlocked
  feature_unlocked VARCHAR(255), -- Which feature was unlocked
  karma_awarded INTEGER, -- How much karma awarded
  badge_awarded VARCHAR(255) -- Which badge awarded
);

CREATE INDEX idx_quest_rewards_user ON quest_rewards_claimed(user_id);
CREATE INDEX idx_quest_rewards_quest ON quest_rewards_claimed(quest_id);
CREATE INDEX idx_quest_rewards_type ON quest_rewards_claimed(reward_type);

-- ============================================================================
-- DND Master Narrative Log Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS dungeon_master_narrative (
  narrative_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  quest_id INTEGER REFERENCES quests(quest_id) ON DELETE CASCADE,

  narrative_type VARCHAR(50) NOT NULL, -- 'quest_unlock', 'quest_progress', 'quest_complete', 'hint', 'encouragement'
  narrative_text TEXT NOT NULL, -- What the DND Master said
  context_data JSONB, -- Context that triggered the narrative

  was_shown BOOLEAN DEFAULT false, -- Has user seen this?
  shown_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_dungeon_master_user ON dungeon_master_narrative(user_id);
CREATE INDEX idx_dungeon_master_quest ON dungeon_master_narrative(quest_id);
CREATE INDEX idx_dungeon_master_shown ON dungeon_master_narrative(was_shown);

-- ============================================================================
-- Quest Events Log Table (Audit Trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS quest_events (
  event_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  quest_id INTEGER REFERENCES quests(quest_id) ON DELETE CASCADE,

  event_type VARCHAR(50) NOT NULL, -- 'unlocked', 'started', 'progress', 'completed', 'claimed', 'expired'
  event_data JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quest_events_user ON quest_events(user_id);
CREATE INDEX idx_quest_events_quest ON quest_events(quest_id);
CREATE INDEX idx_quest_events_type ON quest_events(event_type);
CREATE INDEX idx_quest_events_created ON quest_events(created_at);

-- ============================================================================
-- Seed Beginner Quests
-- ============================================================================

INSERT INTO quests (
  quest_slug, quest_name, quest_description, quest_type, difficulty,
  required_count, reward_type, reward_data, reward_description,
  icon_emoji, narrative_intro, narrative_progress, narrative_complete, sort_order
) VALUES
  -- Onboarding Quests
  (
    'welcome-traveler',
    'Welcome, Traveler',
    'Complete your account setup and explore the realm',
    'onboarding',
    'easy',
    1,
    'karma',
    '{"karma": 10}',
    'Earn 10 karma points',
    '👋',
    'Greetings, traveler. You have entered the CALOS realm. Your journey begins now...',
    'You are learning the ways of this land...',
    'Your journey has begun. You are ready for greater challenges.',
    1
  ),

  (
    'first-discussion',
    'First Discussion',
    'Post your first forum discussion',
    'forum',
    'easy',
    1,
    'app_unlock',
    '{"apps": ["bot-builder-dashboard"]}',
    'Unlock the Bot Builder',
    '💬',
    'To prove your worth, share your knowledge with the community. Create your first discussion...',
    'Your voice is being heard in the realm...',
    'Well done! You have contributed to the collective knowledge. The Bot Builder is now yours.',
    2
  ),

  (
    'first-invite',
    'Build Your Circle',
    'Invite 1 friend to join CALOS',
    'invite',
    'easy',
    1,
    'feature_unlock',
    '{"feature": "self-hosted-tier"}',
    'Unlock self-hosted deployment',
    '🤝',
    'No traveler journeys alone. Invite a companion to join your quest...',
    'Your circle begins to form...',
    'Your first companion has joined! Together, you are stronger. Self-hosting is now available.',
    3
  ),

  -- Intermediate Quests
  (
    'discussion-master',
    'Discussion Master',
    'Create 5 forum discussions with at least 10 upvotes total',
    'forum',
    'medium',
    5,
    'app_unlock',
    '{"apps": ["network-radar", "process-monitor"]}',
    'Unlock Network Radar & Process Monitor',
    '🎤',
    'The community values your insights. Share more of your knowledge...',
    'Your wisdom spreads across the realm... {current_count}/5 discussions, {current_value} total upvotes',
    'You are now a Discussion Master! Advanced tools are yours to command.',
    4
  ),

  (
    'circle-builder',
    'Circle Builder',
    'Invite 5 friends to join CALOS',
    'invite',
    'medium',
    5,
    'tier_upgrade',
    '{"tier": "pro"}',
    'Upgrade to Pro tier (30 days free)',
    '🌟',
    'Your influence grows. Gather more allies to your cause...',
    'Your circle expands... {current_count}/5 invited',
    'Your circle is strong! You have earned Pro tier access for 30 days.',
    5
  ),

  (
    'room-explorer',
    'Room Explorer',
    'Join 3 different code rooms and post in each',
    'collaboration',
    'medium',
    3,
    'feature_unlock',
    '{"feature": "custom-room-mascots"}',
    'Unlock custom room mascot creation',
    '🚪',
    'Explore the many chambers of this realm. Each holds unique knowledge...',
    'You have entered {current_count}/3 chambers...',
    'You have mastered the art of exploration! Create your own room mascots.',
    6
  ),

  -- Advanced Quests
  (
    'viral-network',
    'Viral Network',
    'Invite 20 friends to join CALOS',
    'invite',
    'hard',
    20,
    'app_unlock',
    '{"apps": ["marketplace", "analytics-dashboard"]}',
    'Unlock Marketplace & Advanced Analytics',
    '🔥',
    'Your network grows exponentially. Build an empire of allies...',
    'Your influence spreads like wildfire... {current_count}/20 invited',
    'You are a Network Master! The Marketplace and Analytics are yours.',
    7
  ),

  (
    'forum-legend',
    'Forum Legend',
    'Create 25 discussions with 250+ total upvotes',
    'forum',
    'hard',
    25,
    'feature_unlock',
    '{"feature": "dungeon-master-consultation"}',
    'Unlock DND Master consultation mode',
    '👑',
    'You are destined for greatness. Let your voice echo across the realm...',
    'Your legend grows... {current_count}/25 discussions, {current_value}/250 upvotes',
    'You are now a Forum Legend! The Dungeon Master will consult with you directly.',
    8
  ),

  (
    'portal-host',
    'Portal Host',
    'Host a multiplayer portal and complete 3 collaborative tasks',
    'collaboration',
    'hard',
    3,
    'feature_unlock',
    '{"feature": "custom-portal-themes"}',
    'Unlock custom portal themes',
    '🌀',
    'Open a portal and gather allies for collaborative quests...',
    'Your portal thrives... {current_count}/3 tasks completed',
    'You are a Portal Master! Customize your portals as you wish.',
    9
  ),

  -- Legendary Quests
  (
    'empire-builder',
    'Empire Builder',
    'Invite 100 friends and have 50 of them active',
    'invite',
    'legendary',
    50,
    'tier_upgrade',
    '{"tier": "lifetime-pro"}',
    'Lifetime Pro tier access',
    '🏰',
    'Build an empire that spans the realm. Your legend will be eternal...',
    'Your empire grows... {current_count}/50 active allies',
    'You are an Empire Builder! Your Pro access is eternal.',
    10
  )
ON CONFLICT (quest_slug) DO NOTHING;

-- ============================================================================
-- Functions
-- ============================================================================

-- Check if quest is available for user
CREATE OR REPLACE FUNCTION is_quest_available(p_user_id INTEGER, p_quest_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_quest RECORD;
  v_prereq_id INTEGER;
  v_prereq_completed BOOLEAN;
BEGIN
  -- Get quest details
  SELECT * INTO v_quest FROM quests WHERE quest_id = p_quest_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Check if already completed (and not repeatable)
  IF NOT v_quest.is_repeatable AND EXISTS (
    SELECT 1 FROM user_quest_progress
    WHERE user_id = p_user_id AND quest_id = p_quest_id AND status = 'completed'
  ) THEN
    RETURN false;
  END IF;

  -- Check prerequisites
  IF v_quest.prerequisite_quest_ids IS NOT NULL THEN
    FOREACH v_prereq_id IN ARRAY v_quest.prerequisite_quest_ids LOOP
      SELECT EXISTS (
        SELECT 1 FROM user_quest_progress
        WHERE user_id = p_user_id
          AND quest_id = v_prereq_id
          AND status = 'completed'
      ) INTO v_prereq_completed;

      IF NOT v_prereq_completed THEN
        RETURN false;
      END IF;
    END LOOP;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Initialize quest for user
CREATE OR REPLACE FUNCTION initialize_quest(p_user_id INTEGER, p_quest_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_progress_id INTEGER;
  v_quest RECORD;
  v_expiry TIMESTAMP;
BEGIN
  -- Get quest
  SELECT * INTO v_quest FROM quests WHERE quest_id = p_quest_id;

  -- Calculate expiry
  IF v_quest.expiry_days IS NOT NULL THEN
    v_expiry := NOW() + (v_quest.expiry_days || ' days')::INTERVAL;
  END IF;

  -- Create progress record
  INSERT INTO user_quest_progress (
    user_id, quest_id, status, expires_at
  ) VALUES (
    p_user_id, p_quest_id, 'available', v_expiry
  )
  ON CONFLICT (user_id, quest_id) DO UPDATE
    SET status = 'available'
  RETURNING progress_id INTO v_progress_id;

  -- Log event
  INSERT INTO quest_events (user_id, quest_id, event_type, event_data)
  VALUES (p_user_id, p_quest_id, 'unlocked', '{}');

  -- Create DND Master narrative
  IF v_quest.narrative_intro IS NOT NULL THEN
    INSERT INTO dungeon_master_narrative (
      user_id, quest_id, narrative_type, narrative_text
    ) VALUES (
      p_user_id, p_quest_id, 'quest_unlock', v_quest.narrative_intro
    );
  END IF;

  RETURN v_progress_id;
END;
$$ LANGUAGE plpgsql;

-- Update quest progress
CREATE OR REPLACE FUNCTION update_quest_progress(
  p_user_id INTEGER,
  p_quest_id INTEGER,
  p_increment_count INTEGER DEFAULT 1,
  p_increment_value INTEGER DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_quest RECORD;
  v_progress RECORD;
  v_new_count INTEGER;
  v_new_value INTEGER;
  v_is_complete BOOLEAN := false;
BEGIN
  -- Get quest
  SELECT * INTO v_quest FROM quests WHERE quest_id = p_quest_id;

  -- Get or create progress
  SELECT * INTO v_progress FROM user_quest_progress
  WHERE user_id = p_user_id AND quest_id = p_quest_id;

  IF NOT FOUND THEN
    PERFORM initialize_quest(p_user_id, p_quest_id);
    SELECT * INTO v_progress FROM user_quest_progress
    WHERE user_id = p_user_id AND quest_id = p_quest_id;
  END IF;

  -- Update counts
  v_new_count := v_progress.current_count + p_increment_count;
  v_new_value := v_progress.current_value + p_increment_value;

  -- Check if complete
  IF v_new_count >= v_quest.required_count AND
     (v_quest.required_value IS NULL OR v_new_value >= v_quest.required_value) THEN
    v_is_complete := true;
  END IF;

  -- Update progress
  UPDATE user_quest_progress SET
    current_count = v_new_count,
    current_value = v_new_value,
    progress_data = p_metadata,
    status = CASE WHEN v_is_complete THEN 'completed' ELSE 'in_progress' END,
    started_at = COALESCE(started_at, NOW()),
    completed_at = CASE WHEN v_is_complete THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE user_id = p_user_id AND quest_id = p_quest_id;

  -- Log event
  INSERT INTO quest_events (user_id, quest_id, event_type, event_data)
  VALUES (
    p_user_id,
    p_quest_id,
    CASE WHEN v_is_complete THEN 'completed' ELSE 'progress' END,
    jsonb_build_object(
      'count', v_new_count,
      'value', v_new_value
    )
  );

  -- Add DND Master narrative
  IF v_is_complete AND v_quest.narrative_complete IS NOT NULL THEN
    INSERT INTO dungeon_master_narrative (
      user_id, quest_id, narrative_type, narrative_text
    ) VALUES (
      p_user_id, p_quest_id, 'quest_complete', v_quest.narrative_complete
    );
  ELSIF NOT v_is_complete AND v_quest.narrative_progress IS NOT NULL THEN
    INSERT INTO dungeon_master_narrative (
      user_id, quest_id, narrative_type, narrative_text
    ) VALUES (
      p_user_id, p_quest_id, 'quest_progress',
      replace(replace(v_quest.narrative_progress, '{current_count}', v_new_count::TEXT), '{current_value}', v_new_value::TEXT)
    );
  END IF;

  -- Unlock new quests if this one is complete
  IF v_is_complete AND v_quest.unlocks_quest_ids IS NOT NULL THEN
    DECLARE
      v_unlocked_quest_id INTEGER;
    BEGIN
      FOREACH v_unlocked_quest_id IN ARRAY v_quest.unlocks_quest_ids LOOP
        PERFORM initialize_quest(p_user_id, v_unlocked_quest_id);
      END LOOP;
    END;
  END IF;

  RETURN v_is_complete;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Views
-- ============================================================================

-- User quest summary
CREATE OR REPLACE VIEW user_quest_summary AS
SELECT
  u.user_id,
  u.email,
  COUNT(DISTINCT uqp.quest_id) FILTER (WHERE uqp.status = 'completed') as quests_completed,
  COUNT(DISTINCT uqp.quest_id) FILTER (WHERE uqp.status = 'in_progress') as quests_in_progress,
  COUNT(DISTINCT uqp.quest_id) FILTER (WHERE uqp.status = 'available') as quests_available,
  COALESCE(SUM((qrc.reward_data->>'karma')::INTEGER), 0) as total_karma_earned
FROM users u
LEFT JOIN user_quest_progress uqp ON u.user_id = uqp.user_id
LEFT JOIN quest_rewards_claimed qrc ON u.user_id = qrc.user_id
GROUP BY u.user_id, u.email;

-- Quest leaderboard
CREATE OR REPLACE VIEW quest_leaderboard AS
SELECT
  u.user_id,
  u.email,
  u.username,
  COUNT(DISTINCT uqp.quest_id) as quests_completed,
  COALESCE(SUM((qrc.reward_data->>'karma')::INTEGER), 0) as total_karma,
  MAX(uqp.completed_at) as last_quest_completed
FROM users u
JOIN user_quest_progress uqp ON u.user_id = uqp.user_id AND uqp.status = 'completed'
LEFT JOIN quest_rewards_claimed qrc ON u.user_id = qrc.user_id
GROUP BY u.user_id, u.email, u.username
ORDER BY quests_completed DESC, total_karma DESC;

COMMENT ON TABLE quests IS 'Quest definitions for gamification system';
COMMENT ON TABLE user_quest_progress IS 'User progress on quests';
COMMENT ON TABLE quest_rewards_claimed IS 'Rewards claimed by users';
COMMENT ON TABLE dungeon_master_narrative IS 'DND Master AI narrative log';
COMMENT ON TABLE quest_events IS 'Quest event audit trail';

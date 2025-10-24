-- Migration 071: Bucket-Portfolio Integration
--
-- Links the Portfolio Hub system to the 12-bucket starter system
-- Makes portfolios bucket-branded and domain-specific
-- "Choose Your Starter" Pokémon-style onboarding

-- ============================================================================
-- Update portfolio_settings to link to buckets and domains
-- ============================================================================

-- Add bucket and domain columns
ALTER TABLE portfolio_settings
ADD COLUMN IF NOT EXISTS bucket_id TEXT REFERENCES bucket_instances(bucket_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES domain_portfolio(domain_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS starter_chosen_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS bucket_personality JSONB DEFAULT '{}'; -- Cached bucket personality for fast lookups

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_bucket ON portfolio_settings(bucket_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_domain ON portfolio_settings(domain_id);

-- ============================================================================
-- User Bucket Assignments (Starter Selection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_bucket_assignments (
  assignment_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL, -- REFERENCES users(id) when available
  bucket_id TEXT NOT NULL REFERENCES bucket_instances(bucket_id) ON DELETE CASCADE,
  domain_id UUID REFERENCES domain_portfolio(domain_id) ON DELETE SET NULL,

  -- Assignment metadata
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assignment_method VARCHAR(50) DEFAULT 'manual', -- 'manual', 'auto', 'admin'

  -- Starter selection data
  is_primary_bucket BOOLEAN DEFAULT true,
  selection_reason TEXT, -- Why user chose this starter

  -- Status
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'inactive', 'archived'

  -- Unique constraint: one active primary bucket per user
  UNIQUE(user_id, is_primary_bucket) WHERE is_primary_bucket = true AND status = 'active'
);

CREATE INDEX idx_user_bucket_user ON user_bucket_assignments(user_id);
CREATE INDEX idx_user_bucket_bucket ON user_bucket_assignments(bucket_id);
CREATE INDEX idx_user_bucket_primary ON user_bucket_assignments(user_id, is_primary_bucket) WHERE is_primary_bucket = true;

-- ============================================================================
-- Bucket Portfolio Stats (Per-Bucket Analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bucket_portfolio_stats (
  stat_id SERIAL PRIMARY KEY,
  bucket_id TEXT NOT NULL REFERENCES bucket_instances(bucket_id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Activity counts
  reasoning_logs_count INTEGER DEFAULT 0,
  todos_created INTEGER DEFAULT 0,
  todos_completed INTEGER DEFAULT 0,
  artifacts_created INTEGER DEFAULT 0,

  -- Usage stats
  requests_processed INTEGER DEFAULT 0,
  avg_response_time_ms REAL,
  total_tokens_used INTEGER DEFAULT 0,

  -- User engagement
  active_users_count INTEGER DEFAULT 0,

  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(bucket_id, date)
);

CREATE INDEX idx_bucket_portfolio_stats_bucket ON bucket_portfolio_stats(bucket_id);
CREATE INDEX idx_bucket_portfolio_stats_date ON bucket_portfolio_stats(date DESC);

-- ============================================================================
-- Starter Selection Log (Track what starters users view/choose)
-- ============================================================================

CREATE TABLE IF NOT EXISTS starter_selection_log (
  log_id SERIAL PRIMARY KEY,
  user_id INTEGER, -- REFERENCES users(id) when available
  session_id VARCHAR(64), -- For anonymous browsing

  -- Event details
  event_type VARCHAR(50) NOT NULL, -- 'viewed', 'hovered', 'clicked', 'chosen'
  bucket_id TEXT REFERENCES bucket_instances(bucket_id) ON DELETE SET NULL,
  domain_id UUID REFERENCES domain_portfolio(domain_id) ON DELETE SET NULL,

  -- Context
  user_agent TEXT,
  ip_hash VARCHAR(64),

  -- Timing
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  time_spent_ms INTEGER -- Time spent viewing this starter
);

CREATE INDEX idx_starter_log_user ON starter_selection_log(user_id);
CREATE INDEX idx_starter_log_bucket ON starter_selection_log(bucket_id);
CREATE INDEX idx_starter_log_event ON starter_selection_log(event_type);
CREATE INDEX idx_starter_log_timestamp ON starter_selection_log(timestamp DESC);

-- ============================================================================
-- Domain Portfolio Themes (Branding per domain)
-- ============================================================================

CREATE TABLE IF NOT EXISTS domain_portfolio_themes (
  theme_id SERIAL PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES domain_portfolio(domain_id) ON DELETE CASCADE,

  -- Visual theme
  theme_name VARCHAR(100) NOT NULL,
  primary_color VARCHAR(7) NOT NULL,
  secondary_color VARCHAR(7),
  accent_color VARCHAR(7),
  background_gradient TEXT, -- CSS gradient string
  background_image_url TEXT,

  -- Typography
  font_family VARCHAR(100) DEFAULT 'Inter, sans-serif',
  heading_font VARCHAR(100),

  -- Layout
  layout_style VARCHAR(50) DEFAULT 'timeline', -- 'timeline', 'grid', 'masonry', 'minimal'

  -- Personality
  personality_traits TEXT[], -- ['creative', 'technical', 'professional']
  ai_voice_style VARCHAR(100), -- 'casual', 'formal', 'playful', 'technical'

  -- Custom CSS/JS
  custom_css TEXT,
  custom_js TEXT,

  -- Status
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(domain_id, theme_name)
);

CREATE INDEX idx_domain_themes_domain ON domain_portfolio_themes(domain_id);
CREATE INDEX idx_domain_themes_active ON domain_portfolio_themes(is_active) WHERE is_active = true;

-- ============================================================================
-- Bucket Activity Sync Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS bucket_activity_sync (
  sync_id SERIAL PRIMARY KEY,
  bucket_id TEXT NOT NULL REFERENCES bucket_instances(bucket_id) ON DELETE CASCADE,

  -- Last sync timestamps
  last_reasoning_sync TIMESTAMP,
  last_todo_sync TIMESTAMP,
  last_artifact_sync TIMESTAMP,
  last_stats_sync TIMESTAMP,

  -- Sync metrics
  total_syncs INTEGER DEFAULT 0,
  last_sync_duration_ms INTEGER,
  last_sync_items_count INTEGER,

  -- Status
  sync_status VARCHAR(50) DEFAULT 'idle', -- 'idle', 'syncing', 'error'
  last_error TEXT,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(bucket_id)
);

CREATE INDEX idx_bucket_sync_status ON bucket_activity_sync(sync_status);

-- ============================================================================
-- Views
-- ============================================================================

-- User's complete bucket profile
CREATE OR REPLACE VIEW user_bucket_profile AS
SELECT
  uba.user_id,
  uba.bucket_id,
  bi.bucket_name,
  bi.bucket_slug,
  bi.category,
  bi.domain_context,
  bi.ollama_model,
  dp.domain_name,
  dp.brand_name,
  dp.primary_color,
  dp.category as domain_category,
  uba.assigned_at as starter_chosen_at,
  uba.is_primary_bucket,
  ps.public_url_slug as portfolio_slug
FROM user_bucket_assignments uba
JOIN bucket_instances bi ON uba.bucket_id = bi.bucket_id
LEFT JOIN domain_portfolio dp ON uba.domain_id = dp.domain_id
LEFT JOIN portfolio_settings ps ON ps.user_id = uba.user_id AND ps.bucket_id = uba.bucket_id
WHERE uba.status = 'active';

-- Bucket popularity (for starter selection analytics)
CREATE OR REPLACE VIEW bucket_popularity AS
SELECT
  bi.bucket_id,
  bi.bucket_name,
  bi.domain_context,
  COUNT(DISTINCT uba.user_id) as users_count,
  COUNT(DISTINCT CASE WHEN uba.is_primary_bucket THEN uba.user_id END) as primary_users_count,
  AVG(CASE WHEN uba.is_primary_bucket THEN 1 ELSE 0 END) as primary_rate,
  COUNT(DISTINCT ssl.user_id) FILTER (WHERE ssl.event_type = 'viewed') as viewed_count,
  COUNT(DISTINCT ssl.user_id) FILTER (WHERE ssl.event_type = 'chosen') as chosen_count
FROM bucket_instances bi
LEFT JOIN user_bucket_assignments uba ON bi.bucket_id = uba.bucket_id AND uba.status = 'active'
LEFT JOIN starter_selection_log ssl ON bi.bucket_id = ssl.bucket_id
GROUP BY bi.bucket_id, bi.bucket_name, bi.domain_context
ORDER BY users_count DESC;

-- ============================================================================
-- Functions
-- ============================================================================

-- Function: Assign bucket to user (choose starter)
CREATE OR REPLACE FUNCTION assign_bucket_to_user(
  p_user_id INTEGER,
  p_bucket_id TEXT,
  p_is_primary BOOLEAN DEFAULT true
) RETURNS user_bucket_assignments AS $$
DECLARE
  v_assignment user_bucket_assignments;
  v_domain_id UUID;
BEGIN
  -- Get domain for this bucket
  SELECT bi.domain_context INTO v_domain_id
  FROM bucket_instances bi
  LEFT JOIN domain_portfolio dp ON bi.domain_context = dp.domain_name
  WHERE bi.bucket_id = p_bucket_id;

  -- Create assignment
  INSERT INTO user_bucket_assignments (
    user_id, bucket_id, domain_id, is_primary_bucket, assignment_method
  ) VALUES (
    p_user_id, p_bucket_id, v_domain_id, p_is_primary, 'manual'
  )
  ON CONFLICT (user_id, is_primary_bucket)
    WHERE is_primary_bucket = true AND status = 'active'
    DO UPDATE SET
      bucket_id = EXCLUDED.bucket_id,
      domain_id = EXCLUDED.domain_id,
      assigned_at = CURRENT_TIMESTAMP
  RETURNING * INTO v_assignment;

  -- Initialize portfolio settings for this bucket
  INSERT INTO portfolio_settings (
    user_id, bucket_id, domain_id, starter_chosen_at
  ) VALUES (
    p_user_id, p_bucket_id, v_domain_id, CURRENT_TIMESTAMP
  )
  ON CONFLICT (user_id) DO UPDATE SET
    bucket_id = EXCLUDED.bucket_id,
    domain_id = EXCLUDED.domain_id,
    starter_chosen_at = EXCLUDED.starter_chosen_at;

  RETURN v_assignment;
END;
$$ LANGUAGE plpgsql;

-- Function: Sync bucket activity to portfolio timeline
CREATE OR REPLACE FUNCTION sync_bucket_activity_to_timeline(
  p_bucket_id TEXT,
  p_since TIMESTAMP DEFAULT NOW() - INTERVAL '1 day'
) RETURNS INTEGER AS $$
DECLARE
  v_synced_count INTEGER := 0;
BEGIN
  -- Sync reasoning logs
  INSERT INTO portfolio_timeline (
    user_id, event_type, event_category, title, description,
    event_data, source, source_id, event_timestamp
  )
  SELECT
    uba.user_id,
    'bucket_reasoning',
    'ai',
    bi.bucket_name || ': ' || brl.decision_type,
    brl.reasoning,
    jsonb_build_object(
      'decision_type', brl.decision_type,
      'decision_made', brl.decision_made,
      'outcome', brl.outcome,
      'bucket_id', p_bucket_id
    ),
    'bucket_reasoning_log',
    brl.reasoning_id::text,
    brl.timestamp
  FROM bucket_reasoning_log brl
  JOIN bucket_instances bi ON brl.bucket_id = bi.bucket_id
  JOIN user_bucket_assignments uba ON uba.bucket_id = bi.bucket_id
  WHERE brl.bucket_id = p_bucket_id
    AND brl.timestamp > p_since
    AND uba.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM portfolio_timeline pt
      WHERE pt.source = 'bucket_reasoning_log'
        AND pt.source_id = brl.reasoning_id::text
    );

  GET DIAGNOSTICS v_synced_count = ROW_COUNT;

  -- Update sync tracking
  INSERT INTO bucket_activity_sync (bucket_id, last_reasoning_sync, total_syncs)
  VALUES (p_bucket_id, CURRENT_TIMESTAMP, 1)
  ON CONFLICT (bucket_id) DO UPDATE SET
    last_reasoning_sync = CURRENT_TIMESTAMP,
    total_syncs = bucket_activity_sync.total_syncs + 1,
    last_sync_items_count = v_synced_count,
    updated_at = CURRENT_TIMESTAMP;

  RETURN v_synced_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update domain_portfolio_themes.updated_at
CREATE OR REPLACE FUNCTION update_domain_theme_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_domain_theme_updated_at
  BEFORE UPDATE ON domain_portfolio_themes
  FOR EACH ROW
  EXECUTE FUNCTION update_domain_theme_updated_at();

-- Grant permissions (commented out - adjust for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON user_bucket_assignments TO calos;
-- GRANT SELECT, INSERT, UPDATE ON bucket_portfolio_stats TO calos;
-- GRANT SELECT, INSERT ON starter_selection_log TO calos;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON domain_portfolio_themes TO calos;
-- GRANT SELECT, INSERT, UPDATE ON bucket_activity_sync TO calos;

-- GRANT USAGE, SELECT ON SEQUENCE user_bucket_assignments_assignment_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE bucket_portfolio_stats_stat_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE starter_selection_log_log_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE domain_portfolio_themes_theme_id_seq TO calos;
-- GRANT USAGE, SELECT ON SEQUENCE bucket_activity_sync_sync_id_seq TO calos;

-- ============================================================================
-- MULTIPLAYER PORTAL SYSTEM
-- ============================================================================
-- Pokémon-style multiplayer: portals, chat, battles, trades
-- ============================================================================

-- ============================================================================
-- Portal Instances (Multiple Buckets Running Simultaneously)
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_instances (
  portal_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL, -- REFERENCES users(id) when available
  bucket_id TEXT NOT NULL REFERENCES bucket_instances(bucket_id) ON DELETE CASCADE,
  domain_id UUID REFERENCES domain_portfolio(domain_id) ON DELETE SET NULL,

  -- Portal metadata
  portal_name VARCHAR(100), -- User-given name for this portal
  portal_slug VARCHAR(100) UNIQUE, -- URL slug (e.g., "johns-creative-portal")

  -- Status
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'paused', 'closed'
  visibility VARCHAR(20) DEFAULT 'private', -- 'private', 'friends', 'public'

  -- Portal settings
  allow_chat BOOLEAN DEFAULT true,
  allow_battles BOOLEAN DEFAULT true,
  allow_trades BOOLEAN DEFAULT true,
  max_players INTEGER DEFAULT 10, -- Max concurrent players in this portal

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP
);

CREATE INDEX idx_portal_user ON portal_instances(user_id);
CREATE INDEX idx_portal_bucket ON portal_instances(bucket_id);
CREATE INDEX idx_portal_status ON portal_instances(status) WHERE status = 'active';
CREATE INDEX idx_portal_slug ON portal_instances(portal_slug);

-- ============================================================================
-- Portal Players (Presence Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_players (
  presence_id SERIAL PRIMARY KEY,
  portal_id INTEGER NOT NULL REFERENCES portal_instances(portal_id) ON DELETE CASCADE,
  user_id INTEGER, -- REFERENCES users(id) when available
  session_id VARCHAR(64), -- For anonymous users

  -- Player state
  player_name VARCHAR(100),
  player_avatar VARCHAR(255), -- URL to avatar

  -- Presence
  status VARCHAR(20) DEFAULT 'online', -- 'online', 'away', 'offline'
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP,

  -- Player bucket (their current starter)
  current_bucket_id TEXT REFERENCES bucket_instances(bucket_id),

  UNIQUE(portal_id, user_id) WHERE user_id IS NOT NULL,
  UNIQUE(portal_id, session_id) WHERE session_id IS NOT NULL
);

CREATE INDEX idx_portal_players_portal ON portal_players(portal_id);
CREATE INDEX idx_portal_players_user ON portal_players(user_id);
CREATE INDEX idx_portal_players_status ON portal_players(status) WHERE status = 'online';

-- ============================================================================
-- Portal Chat Messages
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_chat_messages (
  message_id SERIAL PRIMARY KEY,
  portal_id INTEGER NOT NULL REFERENCES portal_instances(portal_id) ON DELETE CASCADE,
  user_id INTEGER, -- REFERENCES users(id) when available
  session_id VARCHAR(64), -- For anonymous users

  -- Message content
  message_text TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'chat', -- 'chat', 'system', 'battle', 'trade'

  -- Metadata
  reply_to_message_id INTEGER REFERENCES portal_chat_messages(message_id),
  metadata JSONB DEFAULT '{}', -- For battle results, trade details, etc.

  -- Moderation
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,

  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_portal_chat_portal ON portal_chat_messages(portal_id);
CREATE INDEX idx_portal_chat_timestamp ON portal_chat_messages(timestamp DESC);
CREATE INDEX idx_portal_chat_type ON portal_chat_messages(message_type);

-- ============================================================================
-- Bucket Battles (Pokémon-Style Battles)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bucket_battles (
  battle_id SERIAL PRIMARY KEY,
  portal_id INTEGER REFERENCES portal_instances(portal_id) ON DELETE SET NULL,

  -- Players
  player1_user_id INTEGER, -- REFERENCES users(id)
  player1_bucket_id TEXT NOT NULL REFERENCES bucket_instances(bucket_id),

  player2_user_id INTEGER, -- REFERENCES users(id)
  player2_bucket_id TEXT NOT NULL REFERENCES bucket_instances(bucket_id),

  -- Battle configuration
  battle_type VARCHAR(50) DEFAULT 'speed', -- 'speed', 'quality', 'creativity', 'cost'
  prompt TEXT NOT NULL, -- The challenge prompt both buckets respond to

  -- Results
  player1_response TEXT,
  player1_response_time_ms INTEGER,
  player1_tokens INTEGER,
  player1_cost_usd NUMERIC(10, 6),

  player2_response TEXT,
  player2_response_time_ms INTEGER,
  player2_tokens INTEGER,
  player2_cost_usd NUMERIC(10, 6),

  -- Winner determination
  winner VARCHAR(10), -- 'player1', 'player2', 'tie'
  winner_reason TEXT, -- How the winner was determined

  -- Rewards
  karma_awarded_p1 INTEGER DEFAULT 0,
  karma_awarded_p2 INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'cancelled'

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_bucket_battles_portal ON bucket_battles(portal_id);
CREATE INDEX idx_bucket_battles_player1 ON bucket_battles(player1_user_id);
CREATE INDEX idx_bucket_battles_player2 ON bucket_battles(player2_user_id);
CREATE INDEX idx_bucket_battles_status ON bucket_battles(status);

-- ============================================================================
-- Bucket Trades (Pokémon-Style Trading)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bucket_trades (
  trade_id SERIAL PRIMARY KEY,
  portal_id INTEGER REFERENCES portal_instances(portal_id) ON DELETE SET NULL,

  -- Players
  player1_user_id INTEGER NOT NULL, -- REFERENCES users(id)
  player1_bucket_id TEXT NOT NULL REFERENCES bucket_instances(bucket_id),

  player2_user_id INTEGER NOT NULL, -- REFERENCES users(id)
  player2_bucket_id TEXT NOT NULL REFERENCES bucket_instances(bucket_id),

  -- Trade details
  trade_type VARCHAR(50) DEFAULT 'swap', -- 'swap', 'temporary', 'permanent'
  duration_hours INTEGER, -- For temporary trades

  -- Status
  status VARCHAR(20) DEFAULT 'offered', -- 'offered', 'accepted', 'rejected', 'completed', 'expired'

  -- Acceptance
  player1_accepted BOOLEAN DEFAULT false,
  player2_accepted BOOLEAN DEFAULT false,

  -- Timestamps
  offered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP,
  completed_at TIMESTAMP,
  expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '24 hours'
);

CREATE INDEX idx_bucket_trades_portal ON bucket_trades(portal_id);
CREATE INDEX idx_bucket_trades_player1 ON bucket_trades(player1_user_id);
CREATE INDEX idx_bucket_trades_player2 ON bucket_trades(player2_user_id);
CREATE INDEX idx_bucket_trades_status ON bucket_trades(status);

-- ============================================================================
-- Collaborative Tasks (Multi-Bucket Workflows)
-- ============================================================================

CREATE TABLE IF NOT EXISTS collaborative_tasks (
  task_id SERIAL PRIMARY KEY,
  portal_id INTEGER REFERENCES portal_instances(portal_id) ON DELETE SET NULL,

  -- Task metadata
  task_name VARCHAR(200) NOT NULL,
  task_description TEXT,
  task_type VARCHAR(50) DEFAULT 'chain', -- 'chain', 'parallel', 'competitive'

  -- Participants (array of user IDs)
  participant_user_ids INTEGER[] DEFAULT '{}',
  participant_bucket_ids TEXT[] DEFAULT '{}',

  -- Workflow
  workflow_config JSONB, -- Defines how buckets collaborate

  -- Results
  results JSONB DEFAULT '[]', -- Array of step results
  final_output TEXT,

  -- Rewards
  karma_per_participant INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_collaborative_tasks_portal ON collaborative_tasks(portal_id);
CREATE INDEX idx_collaborative_tasks_status ON collaborative_tasks(status);

-- ============================================================================
-- Portal Leaderboards
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_leaderboards (
  leaderboard_id SERIAL PRIMARY KEY,
  portal_id INTEGER REFERENCES portal_instances(portal_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL, -- REFERENCES users(id)
  bucket_id TEXT REFERENCES bucket_instances(bucket_id),

  -- Stats
  battles_won INTEGER DEFAULT 0,
  battles_lost INTEGER DEFAULT 0,
  trades_completed INTEGER DEFAULT 0,
  collaborative_tasks_completed INTEGER DEFAULT 0,

  -- Karma
  total_karma_earned INTEGER DEFAULT 0,

  -- Rankings
  rank INTEGER,
  rank_tier VARCHAR(20), -- 'Newcomer', 'Bronze', 'Silver', 'Gold', 'Legend'

  -- Timestamps
  first_joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(portal_id, user_id)
);

CREATE INDEX idx_portal_leaderboards_portal ON portal_leaderboards(portal_id);
CREATE INDEX idx_portal_leaderboards_rank ON portal_leaderboards(portal_id, rank);
CREATE INDEX idx_portal_leaderboards_karma ON portal_leaderboards(total_karma_earned DESC);

-- ============================================================================
-- Views
-- ============================================================================

-- Active portals with player counts
CREATE OR REPLACE VIEW active_portals_summary AS
SELECT
  pi.portal_id,
  pi.portal_name,
  pi.portal_slug,
  pi.user_id as owner_user_id,
  bi.bucket_name,
  bi.bucket_slug,
  dp.brand_name,
  dp.primary_color,
  COUNT(DISTINCT pp.user_id) FILTER (WHERE pp.status = 'online') as online_players,
  pi.max_players,
  pi.status,
  pi.visibility,
  pi.created_at,
  pi.last_active_at
FROM portal_instances pi
JOIN bucket_instances bi ON pi.bucket_id = bi.bucket_id
LEFT JOIN domain_portfolio dp ON pi.domain_id = dp.domain_id
LEFT JOIN portal_players pp ON pi.portal_id = pp.portal_id AND pp.status = 'online'
WHERE pi.status = 'active'
GROUP BY pi.portal_id, bi.bucket_name, bi.bucket_slug, dp.brand_name, dp.primary_color
ORDER BY online_players DESC, pi.created_at DESC;

-- Battle leaderboard (global)
CREATE OR REPLACE VIEW global_battle_leaderboard AS
SELECT
  bb.player1_user_id as user_id,
  bi.bucket_name,
  COUNT(*) FILTER (WHERE bb.winner = 'player1') as wins,
  COUNT(*) FILTER (WHERE bb.winner = 'player2' AND bb.player1_user_id IS NOT NULL) as losses,
  SUM(bb.karma_awarded_p1) as total_karma,
  AVG(bb.player1_response_time_ms) as avg_response_time_ms
FROM bucket_battles bb
JOIN bucket_instances bi ON bb.player1_bucket_id = bi.bucket_id
WHERE bb.status = 'completed'
GROUP BY bb.player1_user_id, bi.bucket_name
UNION ALL
SELECT
  bb.player2_user_id as user_id,
  bi.bucket_name,
  COUNT(*) FILTER (WHERE bb.winner = 'player2') as wins,
  COUNT(*) FILTER (WHERE bb.winner = 'player1' AND bb.player2_user_id IS NOT NULL) as losses,
  SUM(bb.karma_awarded_p2) as total_karma,
  AVG(bb.player2_response_time_ms) as avg_response_time_ms
FROM bucket_battles bb
JOIN bucket_instances bi ON bb.player2_bucket_id = bi.bucket_id
WHERE bb.status = 'completed'
GROUP BY bb.player2_user_id, bi.bucket_name
ORDER BY wins DESC, total_karma DESC;

-- ============================================================================
-- Functions
-- ============================================================================

-- Function: Create portal instance
CREATE OR REPLACE FUNCTION create_portal_instance(
  p_user_id INTEGER,
  p_bucket_id TEXT,
  p_portal_name VARCHAR(100),
  p_visibility VARCHAR(20) DEFAULT 'private'
) RETURNS portal_instances AS $$
DECLARE
  v_portal portal_instances;
  v_domain_id UUID;
  v_slug VARCHAR(100);
BEGIN
  -- Get domain for bucket
  SELECT bi.domain_context INTO v_domain_id
  FROM bucket_instances bi
  LEFT JOIN domain_portfolio dp ON bi.domain_context = dp.domain_name
  WHERE bi.bucket_id = p_bucket_id;

  -- Generate unique slug
  v_slug := lower(regexp_replace(p_portal_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := v_slug || '-' || floor(random() * 10000)::text;

  -- Create portal
  INSERT INTO portal_instances (
    user_id, bucket_id, domain_id, portal_name, portal_slug, visibility
  ) VALUES (
    p_user_id, p_bucket_id, v_domain_id, p_portal_name, v_slug, p_visibility
  ) RETURNING * INTO v_portal;

  -- Add owner as first player
  INSERT INTO portal_players (
    portal_id, user_id, status, current_bucket_id
  ) VALUES (
    v_portal.portal_id, p_user_id, 'online', p_bucket_id
  );

  RETURN v_portal;
END;
$$ LANGUAGE plpgsql;

-- Function: Join portal
CREATE OR REPLACE FUNCTION join_portal(
  p_portal_id INTEGER,
  p_user_id INTEGER,
  p_bucket_id TEXT
) RETURNS portal_players AS $$
DECLARE
  v_player portal_players;
  v_current_players INTEGER;
  v_max_players INTEGER;
BEGIN
  -- Check portal capacity
  SELECT COUNT(*), pi.max_players
  INTO v_current_players, v_max_players
  FROM portal_players pp
  JOIN portal_instances pi ON pp.portal_id = pi.portal_id
  WHERE pp.portal_id = p_portal_id AND pp.status = 'online'
  GROUP BY pi.max_players;

  IF v_current_players >= v_max_players THEN
    RAISE EXCEPTION 'Portal is at maximum capacity';
  END IF;

  -- Join portal
  INSERT INTO portal_players (
    portal_id, user_id, status, current_bucket_id
  ) VALUES (
    p_portal_id, p_user_id, 'online', p_bucket_id
  )
  ON CONFLICT (portal_id, user_id)
  DO UPDATE SET
    status = 'online',
    last_seen_at = CURRENT_TIMESTAMP,
    current_bucket_id = EXCLUDED.current_bucket_id
  RETURNING * INTO v_player;

  -- Update portal last_active_at
  UPDATE portal_instances
  SET last_active_at = CURRENT_TIMESTAMP
  WHERE portal_id = p_portal_id;

  RETURN v_player;
END;
$$ LANGUAGE plpgsql;

-- Function: Update leaderboard after battle
CREATE OR REPLACE FUNCTION update_leaderboard_after_battle(
  p_battle_id INTEGER
) RETURNS VOID AS $$
DECLARE
  v_battle bucket_battles;
BEGIN
  SELECT * INTO v_battle FROM bucket_battles WHERE battle_id = p_battle_id;

  -- Update player 1 leaderboard
  IF v_battle.player1_user_id IS NOT NULL THEN
    INSERT INTO portal_leaderboards (
      portal_id, user_id, bucket_id,
      battles_won, battles_lost, total_karma_earned
    ) VALUES (
      v_battle.portal_id, v_battle.player1_user_id, v_battle.player1_bucket_id,
      CASE WHEN v_battle.winner = 'player1' THEN 1 ELSE 0 END,
      CASE WHEN v_battle.winner = 'player2' THEN 1 ELSE 0 END,
      v_battle.karma_awarded_p1
    )
    ON CONFLICT (portal_id, user_id)
    DO UPDATE SET
      battles_won = portal_leaderboards.battles_won + CASE WHEN v_battle.winner = 'player1' THEN 1 ELSE 0 END,
      battles_lost = portal_leaderboards.battles_lost + CASE WHEN v_battle.winner = 'player2' THEN 1 ELSE 0 END,
      total_karma_earned = portal_leaderboards.total_karma_earned + v_battle.karma_awarded_p1,
      last_updated_at = CURRENT_TIMESTAMP;
  END IF;

  -- Update player 2 leaderboard
  IF v_battle.player2_user_id IS NOT NULL THEN
    INSERT INTO portal_leaderboards (
      portal_id, user_id, bucket_id,
      battles_won, battles_lost, total_karma_earned
    ) VALUES (
      v_battle.portal_id, v_battle.player2_user_id, v_battle.player2_bucket_id,
      CASE WHEN v_battle.winner = 'player2' THEN 1 ELSE 0 END,
      CASE WHEN v_battle.winner = 'player1' THEN 1 ELSE 0 END,
      v_battle.karma_awarded_p2
    )
    ON CONFLICT (portal_id, user_id)
    DO UPDATE SET
      battles_won = portal_leaderboards.battles_won + CASE WHEN v_battle.winner = 'player2' THEN 1 ELSE 0 END,
      battles_lost = portal_leaderboards.battles_lost + CASE WHEN v_battle.winner = 'player1' THEN 1 ELSE 0 END,
      total_karma_earned = portal_leaderboards.total_karma_earned + v_battle.karma_awarded_p2,
      last_updated_at = CURRENT_TIMESTAMP;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update leaderboard after battle completion
CREATE OR REPLACE FUNCTION trigger_battle_completion() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    PERFORM update_leaderboard_after_battle(NEW.battle_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_bucket_battle_completion
  AFTER UPDATE ON bucket_battles
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION trigger_battle_completion();

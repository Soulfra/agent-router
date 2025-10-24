-- Migration 059: GitHub + RuneLite + Chat System
-- Links GitHub identities to users, RuneLite accounts, chat logs, and developer memes

-- ============================================================================
-- GitHub Identities
-- ============================================================================

-- Link GitHub accounts to CALOS users
CREATE TABLE IF NOT EXISTS github_identities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  github_username VARCHAR(255) UNIQUE NOT NULL,
  github_email VARCHAR(255),
  github_user_id VARCHAR(50), -- From GitHub API
  access_token TEXT, -- Encrypted OAuth token (if using GitHub OAuth)
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_github_identities_user_id ON github_identities(user_id);
CREATE INDEX idx_github_identities_username ON github_identities(github_username);
CREATE INDEX idx_github_identities_github_user_id ON github_identities(github_user_id);

-- ============================================================================
-- RuneLite Accounts
-- ============================================================================

-- Link GitHub identities to RuneLite (OSRS) usernames
CREATE TABLE IF NOT EXISTS runelite_accounts (
  id SERIAL PRIMARY KEY,
  github_identity_id INTEGER REFERENCES github_identities(id) ON DELETE CASCADE,
  runelite_username VARCHAR(255) NOT NULL,
  display_name VARCHAR(255), -- Display name override
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(github_identity_id, runelite_username)
);

CREATE INDEX idx_runelite_accounts_github_identity ON runelite_accounts(github_identity_id);
CREATE INDEX idx_runelite_accounts_username ON runelite_accounts(runelite_username);
CREATE INDEX idx_runelite_accounts_active ON runelite_accounts(is_active) WHERE is_active = true;

-- ============================================================================
-- Chat Messages
-- ============================================================================

-- Store all chat messages with GitHub attribution
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  github_username VARCHAR(255), -- From GitHub identity
  runelite_username VARCHAR(255), -- From RuneLite
  message TEXT NOT NULL,
  chat_type VARCHAR(50) NOT NULL, -- public, clan, private, trade, game, action
  timestamp TIMESTAMPTZ NOT NULL,
  session_id UUID,
  metadata JSONB, -- Extra data (location, items mentioned, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_github ON chat_messages(github_username);
CREATE INDEX idx_chat_messages_runelite ON chat_messages(runelite_username);
CREATE INDEX idx_chat_messages_timestamp ON chat_messages(timestamp DESC);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_type ON chat_messages(chat_type);

-- Full-text search on messages
CREATE INDEX idx_chat_messages_message_fts ON chat_messages USING GIN(to_tsvector('english', message));

-- ============================================================================
-- User Activities
-- ============================================================================

-- Track all in-game activities (XP, loot, kills, deaths, level-ups)
CREATE TABLE IF NOT EXISTS user_activities (
  id SERIAL PRIMARY KEY,
  github_username VARCHAR(255),
  runelite_username VARCHAR(255),
  activity_type VARCHAR(50) NOT NULL, -- xp_gain, loot, kill, death, level_up, quest_complete, achievement
  activity_data JSONB NOT NULL, -- Details (skill, XP amount, item ID, NPC name, etc.)
  timestamp TIMESTAMPTZ NOT NULL,
  session_id UUID,
  clipworthy BOOLEAN DEFAULT false, -- Marked as clipworthy (rare drop, level up, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_activities_github ON user_activities(github_username);
CREATE INDEX idx_user_activities_runelite ON user_activities(runelite_username);
CREATE INDEX idx_user_activities_type ON user_activities(activity_type);
CREATE INDEX idx_user_activities_timestamp ON user_activities(timestamp DESC);
CREATE INDEX idx_user_activities_session ON user_activities(session_id);
CREATE INDEX idx_user_activities_clipworthy ON user_activities(clipworthy) WHERE clipworthy = true;

-- ============================================================================
-- Grand Exchange Prices
-- ============================================================================

-- Store historical GE prices
CREATE TABLE IF NOT EXISTS ge_prices (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL,
  item_name VARCHAR(255),
  high_price BIGINT,
  low_price BIGINT,
  volume INTEGER,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ge_prices_item_id ON ge_prices(item_id);
CREATE INDEX idx_ge_prices_item_name ON ge_prices(item_name);
CREATE INDEX idx_ge_prices_timestamp ON ge_prices(timestamp DESC);

-- Composite index for timeseries queries
CREATE INDEX idx_ge_prices_item_timestamp ON ge_prices(item_id, timestamp DESC);

-- ============================================================================
-- Game Sessions
-- ============================================================================

-- Track gaming sessions
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY,
  github_username VARCHAR(255),
  runelite_username VARCHAR(255),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER, -- Calculated on end
  total_xp INTEGER DEFAULT 0,
  total_loot_value BIGINT DEFAULT 0,
  chat_count INTEGER DEFAULT 0,
  activity_count INTEGER DEFAULT 0,
  clipworthy_count INTEGER DEFAULT 0,
  metadata JSONB, -- Extra data (location, skills trained, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_game_sessions_github ON game_sessions(github_username);
CREATE INDEX idx_game_sessions_runelite ON game_sessions(runelite_username);
CREATE INDEX idx_game_sessions_start_time ON game_sessions(start_time DESC);
CREATE INDEX idx_game_sessions_duration ON game_sessions(duration_seconds) WHERE duration_seconds IS NOT NULL;

-- ============================================================================
-- Developer Meme Events
-- ============================================================================

-- Track developer humor moments (:q, vim exits, console.log, etc.)
CREATE TABLE IF NOT EXISTS dev_meme_events (
  id SERIAL PRIMARY KEY,
  github_username VARCHAR(255),
  meme_type VARCHAR(50) NOT NULL, -- vim_exit, force_push, console_log, npm_install, semicolon, etc.
  context TEXT, -- What happened (chat message, command, etc.)
  severity VARCHAR(20) DEFAULT 'low', -- low, medium, high, critical
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX idx_dev_meme_events_github ON dev_meme_events(github_username);
CREATE INDEX idx_dev_meme_events_type ON dev_meme_events(meme_type);
CREATE INDEX idx_dev_meme_events_timestamp ON dev_meme_events(timestamp DESC);

-- ============================================================================
-- Developer Meme Stats (Aggregated)
-- ============================================================================

-- Pre-aggregated stats for performance
CREATE TABLE IF NOT EXISTS dev_meme_stats (
  id SERIAL PRIMARY KEY,
  github_username VARCHAR(255) UNIQUE NOT NULL,
  vim_exits INTEGER DEFAULT 0,
  force_pushes INTEGER DEFAULT 0,
  console_logs INTEGER DEFAULT 0,
  npm_installs INTEGER DEFAULT 0,
  semicolon_errors INTEGER DEFAULT 0,
  merge_conflicts INTEGER DEFAULT 0,
  rm_rf_attempts INTEGER DEFAULT 0,
  total_memes INTEGER DEFAULT 0,
  last_meme_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dev_meme_stats_github ON dev_meme_stats(github_username);
CREATE INDEX idx_dev_meme_stats_total ON dev_meme_stats(total_memes DESC);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_github_identities_updated_at
  BEFORE UPDATE ON github_identities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_runelite_accounts_updated_at
  BEFORE UPDATE ON runelite_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_sessions_updated_at
  BEFORE UPDATE ON game_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-increment dev meme stats
CREATE OR REPLACE FUNCTION increment_dev_meme_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO dev_meme_stats (github_username, total_memes, last_meme_at)
  VALUES (NEW.github_username, 1, NEW.timestamp)
  ON CONFLICT (github_username)
  DO UPDATE SET
    total_memes = dev_meme_stats.total_memes + 1,
    last_meme_at = NEW.timestamp,
    updated_at = NOW();

  -- Increment specific meme type counter
  CASE NEW.meme_type
    WHEN 'vim_exit' THEN
      UPDATE dev_meme_stats SET vim_exits = vim_exits + 1 WHERE github_username = NEW.github_username;
    WHEN 'force_push' THEN
      UPDATE dev_meme_stats SET force_pushes = force_pushes + 1 WHERE github_username = NEW.github_username;
    WHEN 'console_log' THEN
      UPDATE dev_meme_stats SET console_logs = console_logs + 1 WHERE github_username = NEW.github_username;
    WHEN 'npm_install' THEN
      UPDATE dev_meme_stats SET npm_installs = npm_installs + 1 WHERE github_username = NEW.github_username;
    WHEN 'semicolon' THEN
      UPDATE dev_meme_stats SET semicolon_errors = semicolon_errors + 1 WHERE github_username = NEW.github_username;
    WHEN 'merge_conflict' THEN
      UPDATE dev_meme_stats SET merge_conflicts = merge_conflicts + 1 WHERE github_username = NEW.github_username;
    WHEN 'rm_rf' THEN
      UPDATE dev_meme_stats SET rm_rf_attempts = rm_rf_attempts + 1 WHERE github_username = NEW.github_username;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER increment_dev_meme_stats_trigger
  AFTER INSERT ON dev_meme_events
  FOR EACH ROW EXECUTE FUNCTION increment_dev_meme_stats();

-- ============================================================================
-- Utility Functions
-- ============================================================================

-- Get user's total chat count
CREATE OR REPLACE FUNCTION get_user_chat_count(p_github_username VARCHAR)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM chat_messages WHERE github_username = p_github_username;
$$ LANGUAGE SQL;

-- Get user's total XP gained
CREATE OR REPLACE FUNCTION get_user_total_xp(p_github_username VARCHAR)
RETURNS BIGINT AS $$
  SELECT COALESCE(SUM((activity_data->>'xpGained')::INTEGER), 0)::BIGINT
  FROM user_activities
  WHERE github_username = p_github_username AND activity_type = 'xp_gain';
$$ LANGUAGE SQL;

-- Get user's session count
CREATE OR REPLACE FUNCTION get_user_session_count(p_github_username VARCHAR)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM game_sessions WHERE github_username = p_github_username;
$$ LANGUAGE SQL;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE github_identities IS 'Links GitHub accounts to CALOS users';
COMMENT ON TABLE runelite_accounts IS 'Links GitHub identities to RuneLite (OSRS) usernames';
COMMENT ON TABLE chat_messages IS 'Unix-style chat logs with GitHub attribution';
COMMENT ON TABLE user_activities IS 'In-game activities (XP, loot, kills, deaths)';
COMMENT ON TABLE ge_prices IS 'Historical Grand Exchange price data';
COMMENT ON TABLE game_sessions IS 'Gaming sessions with aggregated stats';
COMMENT ON TABLE dev_meme_events IS 'Developer humor tracking (:q, vim exits, etc.)';
COMMENT ON TABLE dev_meme_stats IS 'Pre-aggregated meme statistics per user';

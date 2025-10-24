-- Bot Management System
-- Registry for all bots created via BotBuilder

-- Bots table (registry of all bots)
CREATE TABLE IF NOT EXISTS bots (
  bot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Platform
  platform VARCHAR(50) NOT NULL, -- 'telegram', 'discord', 'whatsapp', etc.

  -- Bot details
  name VARCHAR(255) NOT NULL,
  username VARCHAR(255), -- Bot username (e.g., @calos_bot)
  token TEXT NOT NULL, -- Bot API token (encrypted in production)

  -- Personality
  personality VARCHAR(50) DEFAULT 'professional', -- 'professional', 'meme', 'formal', etc.

  -- Status
  status VARCHAR(50) DEFAULT 'created', -- 'created', 'running', 'stopped', 'error'
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bots_platform ON bots(platform);
CREATE INDEX IF NOT EXISTS idx_bots_status ON bots(status);
CREATE INDEX IF NOT EXISTS idx_bots_created ON bots(created_at DESC);

-- Bot statistics (tracks bot performance and usage)
CREATE TABLE IF NOT EXISTS bot_statistics (
  stat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bot reference
  bot_id UUID NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,

  -- Usage stats
  messages_sent BIGINT DEFAULT 0,
  messages_received BIGINT DEFAULT 0,
  commands_executed BIGINT DEFAULT 0,
  users_served BIGINT DEFAULT 0,

  -- Performance stats
  uptime_seconds BIGINT DEFAULT 0, -- Total uptime in seconds
  restarts INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,

  -- Last reset
  stats_reset_at TIMESTAMPTZ DEFAULT NOW(),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(bot_id)
);

-- Bot events log (tracks significant bot events)
CREATE TABLE IF NOT EXISTS bot_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bot reference
  bot_id UUID NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(50) NOT NULL, -- 'created', 'started', 'stopped', 'error', 'command', etc.
  event_data JSONB, -- Additional event data
  message TEXT, -- Human-readable message

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for bot events
CREATE INDEX IF NOT EXISTS idx_bot_events_bot ON bot_events(bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_events_type ON bot_events(event_type);

-- Bot commands log (tracks commands executed)
CREATE TABLE IF NOT EXISTS bot_commands_log (
  command_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bot reference
  bot_id UUID NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,

  -- Command details
  command_name VARCHAR(50) NOT NULL, -- '/start', '/link', '/verify', etc.
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL, -- CALOS user (if linked)
  platform_user_id VARCHAR(255), -- Platform-specific user ID

  -- Execution
  status VARCHAR(50) DEFAULT 'success', -- 'success', 'error', 'pending'
  error_message TEXT,
  execution_time_ms INTEGER, -- How long the command took

  -- Timestamp
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for commands log
CREATE INDEX IF NOT EXISTS idx_bot_commands_bot ON bot_commands_log(bot_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_commands_name ON bot_commands_log(command_name);
CREATE INDEX IF NOT EXISTS idx_bot_commands_user ON bot_commands_log(user_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Create new bot
CREATE OR REPLACE FUNCTION create_bot(
  p_platform VARCHAR,
  p_name VARCHAR,
  p_token TEXT,
  p_personality VARCHAR DEFAULT 'professional',
  p_username VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_bot_id UUID;
BEGIN
  INSERT INTO bots (platform, name, token, personality, username)
  VALUES (p_platform, p_name, p_token, p_personality, p_username)
  RETURNING bot_id INTO v_bot_id;

  -- Create stats record
  INSERT INTO bot_statistics (bot_id) VALUES (v_bot_id);

  -- Log creation event
  INSERT INTO bot_events (bot_id, event_type, message)
  VALUES (v_bot_id, 'created', 'Bot created: ' || p_name);

  RETURN v_bot_id;
END;
$$ LANGUAGE plpgsql;

-- Mark bot as started
CREATE OR REPLACE FUNCTION start_bot(
  p_bot_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE bots
  SET status = 'running', started_at = NOW(), error_message = NULL
  WHERE bot_id = p_bot_id;

  -- Log start event
  INSERT INTO bot_events (bot_id, event_type, message)
  VALUES (p_bot_id, 'started', 'Bot started');

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Mark bot as stopped
CREATE OR REPLACE FUNCTION stop_bot(
  p_bot_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_started_at TIMESTAMPTZ;
  v_uptime_seconds BIGINT;
BEGIN
  -- Get started_at timestamp
  SELECT started_at INTO v_started_at
  FROM bots
  WHERE bot_id = p_bot_id;

  -- Calculate uptime if started
  IF v_started_at IS NOT NULL THEN
    v_uptime_seconds := EXTRACT(EPOCH FROM (NOW() - v_started_at));

    -- Add to total uptime
    UPDATE bot_statistics
    SET uptime_seconds = uptime_seconds + v_uptime_seconds
    WHERE bot_id = p_bot_id;
  END IF;

  -- Update bot status
  UPDATE bots
  SET status = 'stopped', stopped_at = NOW()
  WHERE bot_id = p_bot_id;

  -- Log stop event
  INSERT INTO bot_events (bot_id, event_type, message)
  VALUES (p_bot_id, 'stopped', 'Bot stopped');

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Log bot command
CREATE OR REPLACE FUNCTION log_bot_command(
  p_bot_id UUID,
  p_command_name VARCHAR,
  p_user_id UUID DEFAULT NULL,
  p_platform_user_id VARCHAR DEFAULT NULL,
  p_status VARCHAR DEFAULT 'success',
  p_error_message TEXT DEFAULT NULL,
  p_execution_time_ms INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_command_id UUID;
BEGIN
  INSERT INTO bot_commands_log (
    bot_id,
    command_name,
    user_id,
    platform_user_id,
    status,
    error_message,
    execution_time_ms
  ) VALUES (
    p_bot_id,
    p_command_name,
    p_user_id,
    p_platform_user_id,
    p_status,
    p_error_message,
    p_execution_time_ms
  ) RETURNING command_id INTO v_command_id;

  -- Update statistics
  UPDATE bot_statistics
  SET commands_executed = commands_executed + 1,
      updated_at = NOW()
  WHERE bot_id = p_bot_id;

  RETURN v_command_id;
END;
$$ LANGUAGE plpgsql;

-- Increment bot message count
CREATE OR REPLACE FUNCTION increment_bot_message_count(
  p_bot_id UUID,
  p_direction VARCHAR -- 'sent' or 'received'
)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_direction = 'sent' THEN
    UPDATE bot_statistics
    SET messages_sent = messages_sent + 1,
        updated_at = NOW()
    WHERE bot_id = p_bot_id;
  ELSIF p_direction = 'received' THEN
    UPDATE bot_statistics
    SET messages_received = messages_received + 1,
        updated_at = NOW()
    WHERE bot_id = p_bot_id;
  END IF;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active bots overview
CREATE OR REPLACE VIEW active_bots AS
SELECT
  b.bot_id,
  b.platform,
  b.name,
  b.username,
  b.personality,
  b.status,
  b.created_at,
  b.started_at,
  EXTRACT(EPOCH FROM (NOW() - b.started_at)) / 3600 as uptime_hours,
  bs.messages_sent,
  bs.messages_received,
  bs.commands_executed,
  bs.users_served
FROM bots b
LEFT JOIN bot_statistics bs ON bs.bot_id = b.bot_id
WHERE b.status = 'running'
ORDER BY b.started_at DESC;

-- Bot statistics summary
CREATE OR REPLACE VIEW bot_statistics_summary AS
SELECT
  b.bot_id,
  b.platform,
  b.name,
  b.personality,
  b.status,
  bs.messages_sent,
  bs.messages_received,
  bs.commands_executed,
  bs.users_served,
  bs.uptime_seconds / 3600 as uptime_hours,
  bs.restarts,
  bs.errors_count,
  (SELECT COUNT(*) FROM bot_events WHERE bot_id = b.bot_id AND event_type = 'error') as event_errors,
  (SELECT COUNT(DISTINCT user_id) FROM bot_commands_log WHERE bot_id = b.bot_id AND user_id IS NOT NULL) as unique_users
FROM bots b
LEFT JOIN bot_statistics bs ON bs.bot_id = b.bot_id
ORDER BY b.created_at DESC;

-- Recent bot events
CREATE OR REPLACE VIEW recent_bot_events AS
SELECT
  be.event_id,
  be.bot_id,
  b.name as bot_name,
  b.platform,
  be.event_type,
  be.message,
  be.created_at,
  EXTRACT(EPOCH FROM (NOW() - be.created_at)) / 60 as minutes_ago
FROM bot_events be
JOIN bots b ON b.bot_id = be.bot_id
ORDER BY be.created_at DESC
LIMIT 100;

-- ============================================================================
-- CLEANUP TASKS
-- ============================================================================

-- Clean old bot events (run periodically)
-- DELETE FROM bot_events WHERE created_at < NOW() - INTERVAL '30 days';

-- Clean old command logs
-- DELETE FROM bot_commands_log WHERE executed_at < NOW() - INTERVAL '90 days';

-- Reset bot statistics (monthly)
-- UPDATE bot_statistics SET
--   messages_sent = 0,
--   messages_received = 0,
--   commands_executed = 0,
--   stats_reset_at = NOW()
-- WHERE stats_reset_at < NOW() - INTERVAL '30 days';

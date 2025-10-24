/**
 * Multiplayer Sessions & AI Bots Migration
 *
 * Creates tables for:
 * - Multiplayer group sessions
 * - AI bot registry
 * - Session messages
 * - Message reactions
 * - Session participants
 */

-- ============================================================================
-- AI BOTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_bots (
  bot_id VARCHAR(255) PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  personality VARCHAR(50) NOT NULL, -- friendly, meme, roast, serious, chaos
  group_id UUID REFERENCES groups(group_id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'active', -- active, idle, awol
  metadata JSONB, -- { messagesPosted, reactionsGiven, awolCount, lastActivityAt }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_bots_group ON ai_bots(group_id);
CREATE INDEX idx_ai_bots_status ON ai_bots(status);
CREATE INDEX idx_ai_bots_personality ON ai_bots(personality);

-- ============================================================================
-- MULTIPLAYER SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS multiplayer_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  session_name VARCHAR(500) NOT NULL,
  status VARCHAR(50) DEFAULT 'active', -- active, paused, ended
  metadata JSONB,
  stats JSONB, -- { totalMessages, totalParticipants, totalBots, totalReactions }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_multiplayer_sessions_group ON multiplayer_sessions(group_id);
CREATE INDEX idx_multiplayer_sessions_status ON multiplayer_sessions(status);
CREATE INDEX idx_multiplayer_sessions_created ON multiplayer_sessions(created_at DESC);

-- ============================================================================
-- SESSION PARTICIPANTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_participants (
  participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(255) NOT NULL REFERENCES multiplayer_sessions(session_id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  bot_id VARCHAR(255) REFERENCES ai_bots(bot_id) ON DELETE CASCADE,
  participant_type VARCHAR(50) NOT NULL, -- human, bot
  username VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'online', -- online, idle, offline
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  metadata JSONB
);

CREATE INDEX idx_session_participants_session ON session_participants(session_id);
CREATE INDEX idx_session_participants_user ON session_participants(user_id);
CREATE INDEX idx_session_participants_bot ON session_participants(bot_id);
CREATE INDEX idx_session_participants_type ON session_participants(participant_type);

-- ============================================================================
-- SESSION MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_messages (
  message_id VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL REFERENCES multiplayer_sessions(session_id) ON DELETE CASCADE,
  participant_id VARCHAR(255) NOT NULL, -- Can be user_id or bot_id
  participant_type VARCHAR(50) NOT NULL, -- human, bot
  username VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text', -- text, image, reaction
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_messages_session ON session_messages(session_id);
CREATE INDEX idx_session_messages_participant ON session_messages(participant_id);
CREATE INDEX idx_session_messages_created ON session_messages(created_at DESC);

-- ============================================================================
-- MESSAGE REACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_reactions (
  reaction_id VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL REFERENCES multiplayer_sessions(session_id) ON DELETE CASCADE,
  message_id VARCHAR(255) NOT NULL REFERENCES session_messages(message_id) ON DELETE CASCADE,
  participant_id VARCHAR(255) NOT NULL, -- Can be user_id or bot_id
  username VARCHAR(255) NOT NULL,
  reaction VARCHAR(255) NOT NULL, -- emoji or text
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_message_reactions_session ON message_reactions(session_id);
CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_participant ON message_reactions(participant_id);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active sessions summary
CREATE OR REPLACE VIEW active_sessions_summary AS
SELECT
  ms.session_id,
  ms.session_name,
  ms.group_id,
  g.name AS group_name,
  ms.status,
  ms.created_at,
  ms.started_at,
  COUNT(DISTINCT sp.participant_id) AS total_participants,
  COUNT(DISTINCT sp.participant_id) FILTER (WHERE sp.participant_type = 'human') AS human_participants,
  COUNT(DISTINCT sp.participant_id) FILTER (WHERE sp.participant_type = 'bot') AS bot_participants,
  COUNT(DISTINCT sm.message_id) AS total_messages,
  MAX(sm.created_at) AS last_message_at
FROM multiplayer_sessions ms
LEFT JOIN groups g ON g.group_id = ms.group_id
LEFT JOIN session_participants sp ON sp.session_id = ms.session_id
LEFT JOIN session_messages sm ON sm.session_id = ms.session_id
WHERE ms.status = 'active'
GROUP BY ms.session_id, ms.session_name, ms.group_id, g.name, ms.status, ms.created_at, ms.started_at
ORDER BY ms.created_at DESC;

-- Bot activity summary
CREATE OR REPLACE VIEW bot_activity_summary AS
SELECT
  ab.bot_id,
  ab.username,
  ab.personality,
  ab.status,
  ab.group_id,
  g.name AS group_name,
  ab.metadata->>'messagesPosted' AS messages_posted,
  ab.metadata->>'reactionsGiven' AS reactions_given,
  ab.metadata->>'awolCount' AS awol_count,
  ab.created_at
FROM ai_bots ab
LEFT JOIN groups g ON g.group_id = ab.group_id
ORDER BY ab.created_at DESC;

-- Session messages with context
CREATE OR REPLACE VIEW session_messages_with_context AS
SELECT
  sm.message_id,
  sm.session_id,
  ms.session_name,
  ms.group_id,
  g.name AS group_name,
  sm.participant_id,
  sm.participant_type,
  sm.username,
  sm.message,
  sm.message_type,
  sm.created_at,
  COUNT(mr.reaction_id) AS reaction_count
FROM session_messages sm
LEFT JOIN multiplayer_sessions ms ON ms.session_id = sm.session_id
LEFT JOIN groups g ON g.group_id = ms.group_id
LEFT JOIN message_reactions mr ON mr.message_id = sm.message_id
GROUP BY sm.message_id, sm.session_id, ms.session_name, ms.group_id, g.name,
         sm.participant_id, sm.participant_type, sm.username, sm.message,
         sm.message_type, sm.created_at
ORDER BY sm.created_at DESC;

-- Top active bots
CREATE OR REPLACE VIEW top_active_bots AS
SELECT
  ab.bot_id,
  ab.username,
  ab.personality,
  ab.group_id,
  COUNT(DISTINCT sm.message_id) AS total_messages,
  COUNT(DISTINCT mr.reaction_id) AS total_reactions,
  MAX(sm.created_at) AS last_active_at
FROM ai_bots ab
LEFT JOIN session_messages sm ON sm.participant_id = ab.bot_id
LEFT JOIN message_reactions mr ON mr.participant_id = ab.bot_id
GROUP BY ab.bot_id, ab.username, ab.personality, ab.group_id
HAVING COUNT(DISTINCT sm.message_id) > 0
ORDER BY total_messages DESC, total_reactions DESC
LIMIT 50;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get session stats
CREATE OR REPLACE FUNCTION get_session_stats(p_session_id VARCHAR)
RETURNS TABLE (
  total_messages BIGINT,
  total_participants BIGINT,
  human_participants BIGINT,
  bot_participants BIGINT,
  total_reactions BIGINT,
  messages_per_minute NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT sm.message_id) AS total_messages,
    COUNT(DISTINCT sp.participant_id) AS total_participants,
    COUNT(DISTINCT sp.participant_id) FILTER (WHERE sp.participant_type = 'human') AS human_participants,
    COUNT(DISTINCT sp.participant_id) FILTER (WHERE sp.participant_type = 'bot') AS bot_participants,
    COUNT(DISTINCT mr.reaction_id) AS total_reactions,
    CASE
      WHEN ms.started_at IS NOT NULL THEN
        ROUND(
          COUNT(DISTINCT sm.message_id)::NUMERIC /
          GREATEST(EXTRACT(EPOCH FROM (NOW() - ms.started_at)) / 60, 1),
          2
        )
      ELSE 0
    END AS messages_per_minute
  FROM multiplayer_sessions ms
  LEFT JOIN session_participants sp ON sp.session_id = ms.session_id
  LEFT JOIN session_messages sm ON sm.session_id = ms.session_id
  LEFT JOIN message_reactions mr ON mr.session_id = ms.session_id
  WHERE ms.session_id = p_session_id
  GROUP BY ms.session_id, ms.started_at;
END;
$$ LANGUAGE plpgsql;

-- Get bot stats
CREATE OR REPLACE FUNCTION get_bot_stats(p_bot_id VARCHAR)
RETURNS TABLE (
  total_messages BIGINT,
  total_reactions BIGINT,
  total_sessions BIGINT,
  personality VARCHAR,
  status VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT sm.message_id) AS total_messages,
    COUNT(DISTINCT mr.reaction_id) AS total_reactions,
    COUNT(DISTINCT sm.session_id) AS total_sessions,
    ab.personality,
    ab.status
  FROM ai_bots ab
  LEFT JOIN session_messages sm ON sm.participant_id = ab.bot_id
  LEFT JOIN message_reactions mr ON mr.participant_id = ab.bot_id
  WHERE ab.bot_id = p_bot_id
  GROUP BY ab.bot_id, ab.personality, ab.status;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update bot metadata on message
CREATE OR REPLACE FUNCTION update_bot_message_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.participant_type = 'bot' THEN
    UPDATE ai_bots
    SET
      metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{messagesPosted}',
        to_jsonb(COALESCE((metadata->>'messagesPosted')::INTEGER, 0) + 1)
      ),
      metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{lastActivityAt}',
        to_jsonb(EXTRACT(EPOCH FROM NOW() * 1000)::BIGINT)
      ),
      updated_at = NOW()
    WHERE bot_id = NEW.participant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bot_message_count
AFTER INSERT ON session_messages
FOR EACH ROW EXECUTE FUNCTION update_bot_message_count();

-- Update bot metadata on reaction
CREATE OR REPLACE FUNCTION update_bot_reaction_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ai_bots
  SET
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{reactionsGiven}',
      to_jsonb(COALESCE((metadata->>'reactionsGiven')::INTEGER, 0) + 1)
    ),
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{lastActivityAt}',
      to_jsonb(EXTRACT(EPOCH FROM NOW() * 1000)::BIGINT)
    ),
    updated_at = NOW()
  WHERE bot_id = NEW.participant_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bot_reaction_count
AFTER INSERT ON message_reactions
FOR EACH ROW EXECUTE FUNCTION update_bot_reaction_count();

COMMIT;

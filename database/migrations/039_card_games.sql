/**
 * Card Games Migration
 *
 * Creates tables for multiplayer card game system:
 * - Card games (UNO, CAH, Apples to Apples, Settlers, custom)
 * - Custom cards (player-created/edited)
 * - Game players
 * - Game history
 * - Card decks
 */

-- ============================================================================
-- CARD DECKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS card_decks (
  deck_id VARCHAR(255) PRIMARY KEY,
  deck_name VARCHAR(255) NOT NULL,
  game_mode VARCHAR(50) NOT NULL, -- speed, judge, build, custom
  deck_type VARCHAR(50) DEFAULT 'default', -- default, custom, community
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  group_id UUID REFERENCES groups(group_id) ON DELETE CASCADE,
  total_cards INTEGER DEFAULT 0,
  metadata JSONB, -- { description, tags, popularity }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_card_decks_mode ON card_decks(game_mode);
CREATE INDEX idx_card_decks_type ON card_decks(deck_type);
CREATE INDEX idx_card_decks_group ON card_decks(group_id);
CREATE INDEX idx_card_decks_created ON card_decks(created_at DESC);

-- ============================================================================
-- CUSTOM CARDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS custom_cards (
  card_id VARCHAR(255) PRIMARY KEY,
  group_id UUID REFERENCES groups(group_id) ON DELETE CASCADE,
  deck_id VARCHAR(255) REFERENCES card_decks(deck_id) ON DELETE CASCADE,
  card_type VARCHAR(50) NOT NULL, -- wild, prompt, response, resource, custom
  card_text TEXT NOT NULL,
  card_effect VARCHAR(50), -- skip, reverse, draw2, wild, etc.
  card_color VARCHAR(50), -- red, blue, green, yellow
  custom_effect_text TEXT,
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  edited_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  metadata JSONB, -- { upvotes, downvotes, timesPlayed, originalCardId, version }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_custom_cards_group ON custom_cards(group_id);
CREATE INDEX idx_custom_cards_deck ON custom_cards(deck_id);
CREATE INDEX idx_custom_cards_type ON custom_cards(card_type);
CREATE INDEX idx_custom_cards_creator ON custom_cards(created_by);
CREATE INDEX idx_custom_cards_approved ON custom_cards(approved);
CREATE INDEX idx_custom_cards_created ON custom_cards(created_at DESC);

-- ============================================================================
-- CARD GAMES
-- ============================================================================

CREATE TABLE IF NOT EXISTS card_games (
  game_id VARCHAR(255) PRIMARY KEY,
  group_id UUID REFERENCES groups(group_id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  game_mode VARCHAR(50) NOT NULL, -- speed, judge, build, custom
  deck_id VARCHAR(255) REFERENCES card_decks(deck_id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'waiting', -- waiting, active, paused, ended
  current_player_index INTEGER DEFAULT 0,
  direction INTEGER DEFAULT 1, -- 1 = forward, -1 = reverse
  metadata JSONB, -- { customRules, topCard, currentPrompt }
  stats JSONB, -- { totalTurns, totalPlayers, totalBots, duration }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_card_games_group ON card_games(group_id);
CREATE INDEX idx_card_games_mode ON card_games(game_mode);
CREATE INDEX idx_card_games_status ON card_games(status);
CREATE INDEX idx_card_games_created ON card_games(created_at DESC);

-- ============================================================================
-- GAME PLAYERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS card_game_players (
  player_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id VARCHAR(255) NOT NULL REFERENCES card_games(game_id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  bot_id VARCHAR(255) REFERENCES ai_bots(bot_id) ON DELETE CASCADE,
  player_type VARCHAR(50) NOT NULL, -- human, bot
  username VARCHAR(255) NOT NULL,
  player_index INTEGER NOT NULL, -- Turn order
  hand_size INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  metadata JSONB, -- { cardsPlayed, turnsSkipped, personality }
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ
);

CREATE INDEX idx_card_game_players_game ON card_game_players(game_id);
CREATE INDEX idx_card_game_players_user ON card_game_players(user_id);
CREATE INDEX idx_card_game_players_bot ON card_game_players(bot_id);
CREATE INDEX idx_card_game_players_type ON card_game_players(player_type);

-- ============================================================================
-- GAME HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS card_game_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id VARCHAR(255) NOT NULL REFERENCES card_games(game_id) ON DELETE CASCADE,
  player_id VARCHAR(255) NOT NULL, -- user_id or bot_id
  username VARCHAR(255) NOT NULL,
  action_type VARCHAR(50) NOT NULL, -- play_card, draw_card, skip, reverse, judge_pick
  card_data JSONB, -- { cardType, cardText, cardEffect }
  metadata JSONB, -- { reasoning, targetPlayer, effect }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_card_game_history_game ON card_game_history(game_id);
CREATE INDEX idx_card_game_history_player ON card_game_history(player_id);
CREATE INDEX idx_card_game_history_action ON card_game_history(action_type);
CREATE INDEX idx_card_game_history_created ON card_game_history(created_at DESC);

-- ============================================================================
-- CARD EDIT HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS card_edit_history (
  edit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id VARCHAR(255) NOT NULL REFERENCES custom_cards(card_id) ON DELETE CASCADE,
  edited_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  old_value JSONB, -- { text, effect, color }
  new_value JSONB, -- { text, effect, color }
  edited_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_card_edit_history_card ON card_edit_history(card_id);
CREATE INDEX idx_card_edit_history_editor ON card_edit_history(edited_by);
CREATE INDEX idx_card_edit_history_edited ON card_edit_history(edited_at DESC);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active games summary
CREATE OR REPLACE VIEW active_card_games_summary AS
SELECT
  cg.game_id,
  cg.game_mode,
  cg.status,
  cg.group_id,
  g.name AS group_name,
  cg.created_at,
  cg.started_at,
  COUNT(DISTINCT cgp.player_id) AS total_players,
  COUNT(DISTINCT cgp.player_id) FILTER (WHERE cgp.player_type = 'human') AS human_players,
  COUNT(DISTINCT cgp.player_id) FILTER (WHERE cgp.player_type = 'bot') AS bot_players,
  COUNT(DISTINCT cgh.history_id) AS total_actions,
  MAX(cgh.created_at) AS last_action_at
FROM card_games cg
LEFT JOIN groups g ON g.group_id = cg.group_id
LEFT JOIN card_game_players cgp ON cgp.game_id = cg.game_id
LEFT JOIN card_game_history cgh ON cgh.game_id = cg.game_id
WHERE cg.status IN ('active', 'waiting')
GROUP BY cg.game_id, cg.game_mode, cg.status, cg.group_id, g.name, cg.created_at, cg.started_at
ORDER BY cg.created_at DESC;

-- Custom cards summary
CREATE OR REPLACE VIEW custom_cards_summary AS
SELECT
  cc.card_id,
  cc.card_type,
  cc.card_text,
  cc.group_id,
  g.name AS group_name,
  cc.created_by,
  u.username AS creator_username,
  cc.approved,
  cc.metadata->>'upvotes' AS upvotes,
  cc.metadata->>'downvotes' AS downvotes,
  cc.metadata->>'timesPlayed' AS times_played,
  cc.created_at
FROM custom_cards cc
LEFT JOIN groups g ON g.group_id = cc.group_id
LEFT JOIN users u ON u.user_id = cc.created_by
ORDER BY (cc.metadata->>'upvotes')::INTEGER DESC NULLS LAST, cc.created_at DESC;

-- Top card creators
CREATE OR REPLACE VIEW top_card_creators AS
SELECT
  u.user_id,
  u.username,
  COUNT(DISTINCT cc.card_id) AS total_cards_created,
  COUNT(DISTINCT cc.card_id) FILTER (WHERE cc.approved = true) AS approved_cards,
  SUM((cc.metadata->>'upvotes')::INTEGER) AS total_upvotes,
  SUM((cc.metadata->>'timesPlayed')::INTEGER) AS total_plays
FROM users u
LEFT JOIN custom_cards cc ON cc.created_by = u.user_id
GROUP BY u.user_id, u.username
HAVING COUNT(DISTINCT cc.card_id) > 0
ORDER BY total_upvotes DESC, total_cards_created DESC
LIMIT 50;

-- Game mode popularity
CREATE OR REPLACE VIEW game_mode_stats AS
SELECT
  game_mode,
  COUNT(DISTINCT game_id) AS total_games,
  COUNT(DISTINCT game_id) FILTER (WHERE status = 'active') AS active_games,
  COUNT(DISTINCT game_id) FILTER (WHERE status = 'ended') AS completed_games,
  AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) AS avg_duration_seconds
FROM card_games
GROUP BY game_mode
ORDER BY total_games DESC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get game stats
CREATE OR REPLACE FUNCTION get_card_game_stats(p_game_id VARCHAR)
RETURNS TABLE (
  total_players BIGINT,
  human_players BIGINT,
  bot_players BIGINT,
  total_actions BIGINT,
  cards_played BIGINT,
  duration_seconds NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT cgp.player_id) AS total_players,
    COUNT(DISTINCT cgp.player_id) FILTER (WHERE cgp.player_type = 'human') AS human_players,
    COUNT(DISTINCT cgp.player_id) FILTER (WHERE cgp.player_type = 'bot') AS bot_players,
    COUNT(DISTINCT cgh.history_id) AS total_actions,
    COUNT(DISTINCT cgh.history_id) FILTER (WHERE cgh.action_type = 'play_card') AS cards_played,
    CASE
      WHEN cg.ended_at IS NOT NULL AND cg.started_at IS NOT NULL THEN
        EXTRACT(EPOCH FROM (cg.ended_at - cg.started_at))
      ELSE NULL
    END AS duration_seconds
  FROM card_games cg
  LEFT JOIN card_game_players cgp ON cgp.game_id = cg.game_id
  LEFT JOIN card_game_history cgh ON cgh.game_id = cg.game_id
  WHERE cg.game_id = p_game_id
  GROUP BY cg.game_id, cg.started_at, cg.ended_at;
END;
$$ LANGUAGE plpgsql;

-- Get player's card game stats
CREATE OR REPLACE FUNCTION get_player_card_game_stats(p_user_id UUID)
RETURNS TABLE (
  total_games BIGINT,
  games_won BIGINT,
  total_cards_played BIGINT,
  favorite_mode VARCHAR,
  total_playtime_seconds NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT cgp.game_id) AS total_games,
    COUNT(DISTINCT cg.game_id) FILTER (
      WHERE cg.metadata->>'winnerId' = p_user_id::TEXT
    ) AS games_won,
    COUNT(DISTINCT cgh.history_id) FILTER (
      WHERE cgh.action_type = 'play_card'
    ) AS total_cards_played,
    (
      SELECT game_mode
      FROM card_games cg2
      LEFT JOIN card_game_players cgp2 ON cgp2.game_id = cg2.game_id
      WHERE cgp2.user_id = p_user_id
      GROUP BY game_mode
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS favorite_mode,
    SUM(
      EXTRACT(EPOCH FROM (cg.ended_at - cg.started_at))
    ) AS total_playtime_seconds
  FROM card_game_players cgp
  LEFT JOIN card_games cg ON cg.game_id = cgp.game_id
  LEFT JOIN card_game_history cgh ON cgh.game_id = cgp.game_id AND cgh.player_id = p_user_id::TEXT
  WHERE cgp.user_id = p_user_id
  GROUP BY cgp.user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update custom card metadata on vote
CREATE OR REPLACE FUNCTION update_custom_card_metadata()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE custom_cards
  SET updated_at = NOW()
  WHERE card_id = NEW.card_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_custom_card_metadata
AFTER UPDATE ON custom_cards
FOR EACH ROW
WHEN (OLD.metadata IS DISTINCT FROM NEW.metadata)
EXECUTE FUNCTION update_custom_card_metadata();

-- Record card edit in history
CREATE OR REPLACE FUNCTION record_card_edit()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.card_text IS DISTINCT FROM NEW.card_text OR
     OLD.card_effect IS DISTINCT FROM NEW.card_effect OR
     OLD.card_color IS DISTINCT FROM NEW.card_color THEN

    INSERT INTO card_edit_history (
      card_id,
      edited_by,
      old_value,
      new_value,
      edited_at
    ) VALUES (
      NEW.card_id,
      NEW.edited_by,
      jsonb_build_object(
        'text', OLD.card_text,
        'effect', OLD.card_effect,
        'color', OLD.card_color
      ),
      jsonb_build_object(
        'text', NEW.card_text,
        'effect', NEW.card_effect,
        'color', NEW.card_color
      ),
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_record_card_edit
AFTER UPDATE ON custom_cards
FOR EACH ROW
EXECUTE FUNCTION record_card_edit();

-- Update deck card count
CREATE OR REPLACE FUNCTION update_deck_card_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE card_decks
  SET
    total_cards = (
      SELECT COUNT(*)
      FROM custom_cards
      WHERE deck_id = NEW.deck_id
    ),
    updated_at = NOW()
  WHERE deck_id = NEW.deck_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_deck_card_count_insert
AFTER INSERT ON custom_cards
FOR EACH ROW
EXECUTE FUNCTION update_deck_card_count();

CREATE TRIGGER trigger_update_deck_card_count_delete
AFTER DELETE ON custom_cards
FOR EACH ROW
EXECUTE FUNCTION update_deck_card_count();

COMMIT;

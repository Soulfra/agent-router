-- Migration: RPG System (Player 1 progression)
-- GameBoy/NES-style leveling system
-- Zero dependencies, privacy-first

-- RPG Players (User progression)
CREATE TABLE IF NOT EXISTS rpg_players (
  id SERIAL PRIMARY KEY,

  -- Player identity
  user_id VARCHAR(255) UNIQUE NOT NULL,

  -- Level/XP system
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0, -- Current XP in level (0-99)
  total_xp INTEGER DEFAULT 0, -- Total XP earned (lifetime)

  -- Achievements (JSON array of achievement IDs)
  achievements JSONB DEFAULT '[]',

  -- Stats (GameBoy RPG style)
  stats JSONB DEFAULT '{"hp": 20, "mp": 10, "atk": 5, "def": 5, "speed": 5}',

  -- Inventory (items collected)
  inventory JSONB DEFAULT '[]',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_rpg_players_user (user_id),
  INDEX idx_rpg_players_level (level DESC, total_xp DESC)
);

COMMENT ON TABLE rpg_players IS 'Player progression (Player 1 style)';
COMMENT ON COLUMN rpg_players.level IS 'Current level (1-99)';
COMMENT ON COLUMN rpg_players.xp IS 'XP in current level (100 XP per level)';
COMMENT ON COLUMN rpg_players.total_xp IS 'Lifetime XP (for leaderboard)';

-- XP Log (Track XP gains)
CREATE TABLE IF NOT EXISTS rpg_xp_log (
  id SERIAL PRIMARY KEY,

  user_id VARCHAR(255) NOT NULL,
  amount INTEGER NOT NULL, -- XP amount awarded
  reason TEXT, -- 'Completed quest', 'Found card', 'Roasted code'

  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_rpg_xp_user_time (user_id, created_at DESC)
);

COMMENT ON TABLE rpg_xp_log IS 'XP event log';

-- Quests (RPG missions)
CREATE TABLE IF NOT EXISTS rpg_quests (
  id SERIAL PRIMARY KEY,

  -- Quest identity
  quest_id VARCHAR(100) UNIQUE NOT NULL, -- 'first-card', 'roast-10-cards', 'reach-level-10'
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Quest type
  quest_type VARCHAR(50) DEFAULT 'achievement', -- 'achievement', 'daily', 'weekly'

  -- Rewards
  xp_reward INTEGER DEFAULT 0,
  item_reward JSONB, -- '{"type": "card", "packId": "anti-patterns"}'

  -- Requirements
  requirements JSONB, -- '{"cards_opened": 10}', '{"code_roasted": 5}'

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE rpg_quests IS 'RPG quest definitions';

-- Player Quest Progress
CREATE TABLE IF NOT EXISTS rpg_player_quests (
  id SERIAL PRIMARY KEY,

  user_id VARCHAR(255) NOT NULL,
  quest_id VARCHAR(100) NOT NULL,

  -- Progress
  progress JSONB DEFAULT '{}', -- '{"cards_opened": 5}', '{"code_roasted": 3}'
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, quest_id),
  INDEX idx_rpg_player_quests_user (user_id, completed),
  INDEX idx_rpg_player_quests_quest (quest_id)
);

COMMENT ON TABLE rpg_player_quests IS 'Player quest progress';

-- Achievements (Badges/Trophies)
CREATE TABLE IF NOT EXISTS rpg_achievements (
  id SERIAL PRIMARY KEY,

  achievement_id VARCHAR(100) UNIQUE NOT NULL, -- 'first-card', 'mythic-hunter', 'level-10'
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(10), -- Emoji or icon

  -- Rarity (GameBoy style)
  rarity VARCHAR(20) DEFAULT 'common', -- 'common', 'rare', 'epic', 'legendary', 'mythic'

  -- Requirements
  requirements JSONB, -- '{"level": 10}', '{"mythic_cards": 1}'

  -- Rewards
  xp_reward INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE rpg_achievements IS 'Achievement definitions';

-- Seed initial quests
INSERT INTO rpg_quests (quest_id, name, description, quest_type, xp_reward, requirements)
VALUES
  ('first-card', 'First Card', 'Open your first card pack', 'achievement', 10, '{"cards_opened": 1}'),
  ('roast-code', 'Code Roaster', 'Roast your first piece of code', 'achievement', 15, '{"code_roasted": 1}'),
  ('reach-level-5', 'Level Up', 'Reach level 5', 'achievement', 50, '{"level": 5}'),
  ('mythic-hunter', 'Mythic Hunter', 'Find a mythic card', 'achievement', 100, '{"mythic_cards": 1}'),
  ('daily-login', 'Daily Login', 'Log in today', 'daily', 5, '{"login": 1}')
ON CONFLICT (quest_id) DO NOTHING;

-- Seed initial achievements
INSERT INTO rpg_achievements (achievement_id, name, description, icon, rarity, xp_reward, requirements)
VALUES
  ('first-card', '🎴 First Card', 'Opened first card pack', '🎴', 'common', 10, '{"cards_opened": 1}'),
  ('collector', '📚 Collector', 'Collected 10 cards', '📚', 'rare', 20, '{"cards_collected": 10}'),
  ('hoarder', '🏆 Hoarder', 'Collected 50 cards', '🏆', 'epic', 50, '{"cards_collected": 50}'),
  ('mythic-hunter', '🔴 Mythic Hunter', 'Found a mythic card', '🔴', 'legendary', 100, '{"mythic_cards": 1}'),
  ('code-roaster', '🔥 Code Roaster', 'Roasted 10 pieces of code', '🔥', 'rare', 30, '{"code_roasted": 10}'),
  ('level-10', '⭐ Level 10', 'Reached level 10', '⭐', 'epic', 100, '{"level": 10}'),
  ('level-50', '💎 Level 50', 'Reached level 50', '💎', 'legendary', 500, '{"level": 50}')
ON CONFLICT (achievement_id) DO NOTHING;

COMMENT ON TABLE rpg_quests IS 'Quest definitions seeded with initial quests';
COMMENT ON TABLE rpg_achievements IS 'Achievement definitions seeded with badges';

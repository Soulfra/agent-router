-- Card Collection System Migration
-- Pokemon/MTG-style collectible cards with achievements

-- Card collection table (user's owned cards)
CREATE TABLE IF NOT EXISTS card_collection (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  card_id VARCHAR(32) NOT NULL,  -- Hash of packId:prompt:response
  pack_id VARCHAR(100) NOT NULL,
  rarity VARCHAR(20) NOT NULL,   -- common, rare, epic, legendary, mythic
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  count INTEGER DEFAULT 1,       -- Number of duplicates owned
  first_awarded TIMESTAMP DEFAULT NOW(),
  last_awarded TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_card_collection_user ON card_collection(user_id);
CREATE INDEX IF NOT EXISTS idx_card_collection_pack ON card_collection(pack_id);
CREATE INDEX IF NOT EXISTS idx_card_collection_rarity ON card_collection(rarity);

-- User achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  achievement_id VARCHAR(100) NOT NULL,
  unlocked_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

-- Pack opening history (for analytics)
CREATE TABLE IF NOT EXISTS pack_opening_history (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  pack_id VARCHAR(100) NOT NULL,
  cards_awarded JSONB NOT NULL,  -- Array of card IDs
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pack_history_user ON pack_opening_history(user_id);
CREATE INDEX IF NOT EXISTS idx_pack_history_pack ON pack_opening_history(pack_id);

-- Card trades (for future trading feature)
CREATE TABLE IF NOT EXISTS card_trades (
  id SERIAL PRIMARY KEY,
  from_user_id VARCHAR(255) NOT NULL,
  to_user_id VARCHAR(255) NOT NULL,
  card_id VARCHAR(32) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',  -- pending, accepted, declined
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_card_trades_from ON card_trades(from_user_id);
CREATE INDEX IF NOT EXISTS idx_card_trades_to ON card_trades(to_user_id);
CREATE INDEX IF NOT EXISTS idx_card_trades_status ON card_trades(status);

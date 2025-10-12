-- Migration 009: ELO Rating System
-- Universal ranking system for comparing ANY items (recipes, games, products, etc.)
-- Like Chess.com/Lichess but for anything you want to rank

-- ELO Items Table
-- Stores ANY type of item with its ELO rating
CREATE TABLE IF NOT EXISTS elo_items (
  id SERIAL PRIMARY KEY,

  -- Item identification
  item_type VARCHAR(50) NOT NULL,              -- 'recipe', 'game', 'profile', 'product', etc.
  item_name VARCHAR(255) NOT NULL,
  item_data JSONB DEFAULT '{}',                -- Full item data

  -- ELO Rating
  elo_rating INT DEFAULT 1500,                 -- Standard starting ELO
  peak_rating INT DEFAULT 1500,                -- Highest rating ever achieved
  rating_confidence INT DEFAULT 0,             -- 0-100% confidence in rating

  -- Match Statistics
  matches_played INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  draws INT DEFAULT 0,

  -- Performance metrics
  win_rate DECIMAL(5,2) DEFAULT 0.00,          -- Percentage
  avg_opponent_rating INT DEFAULT 1500,
  performance_rating INT DEFAULT 1500,         -- Current performance

  -- Ranking
  rank INT,                                     -- Overall rank in this item_type
  tier VARCHAR(50),                             -- 'Novice', 'Expert', 'Master', etc.

  -- Metadata
  created_by VARCHAR(100),                      -- User or session that created it
  tags TEXT[],                                  -- Searchable tags
  metadata JSONB DEFAULT '{}',                  -- Additional custom data

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_match_at TIMESTAMP
);

CREATE INDEX idx_elo_items_type ON elo_items(item_type);
CREATE INDEX idx_elo_items_rating ON elo_items(item_type, elo_rating DESC);
CREATE INDEX idx_elo_items_rank ON elo_items(item_type, rank);
CREATE INDEX idx_elo_items_created_by ON elo_items(created_by);
CREATE INDEX idx_elo_items_tags ON elo_items USING GIN(tags);

-- ELO Matches Table
-- History of all head-to-head comparisons
CREATE TABLE IF NOT EXISTS elo_matches (
  id SERIAL PRIMARY KEY,

  -- Match participants
  item_a_id INT NOT NULL REFERENCES elo_items(id) ON DELETE CASCADE,
  item_b_id INT NOT NULL REFERENCES elo_items(id) ON DELETE CASCADE,

  -- Ratings at time of match
  item_a_rating_before INT NOT NULL,
  item_b_rating_before INT NOT NULL,
  item_a_rating_after INT NOT NULL,
  item_b_rating_after INT NOT NULL,

  -- Match result
  winner_id INT REFERENCES elo_items(id),       -- NULL for draw
  result VARCHAR(20) NOT NULL,                   -- 'a_wins', 'b_wins', 'draw'
  score DECIMAL(3,2) DEFAULT 1.00,              -- 1.0 = win, 0.5 = draw, 0.0 = loss

  -- Rating changes
  rating_change INT NOT NULL,                    -- Absolute rating change
  expected_score DECIMAL(5,4),                   -- Predicted probability

  -- Match context
  match_type VARCHAR(50) DEFAULT 'swipe',       -- 'swipe', 'tournament', 'ranked', 'casual'
  session_id VARCHAR(100),
  user_id VARCHAR(100),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_elo_matches_item_a ON elo_matches(item_a_id, matched_at DESC);
CREATE INDEX idx_elo_matches_item_b ON elo_matches(item_b_id, matched_at DESC);
CREATE INDEX idx_elo_matches_winner ON elo_matches(winner_id);
CREATE INDEX idx_elo_matches_session ON elo_matches(session_id);
CREATE INDEX idx_elo_matches_type ON elo_matches(match_type);

-- ELO Rating History
-- Track rating changes over time for graphing
CREATE TABLE IF NOT EXISTS elo_rating_history (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES elo_items(id) ON DELETE CASCADE,

  -- Rating snapshot
  elo_rating INT NOT NULL,
  matches_played INT NOT NULL,
  rank INT,
  tier VARCHAR(50),

  -- Cause of change
  match_id INT REFERENCES elo_matches(id),
  change_type VARCHAR(50),                       -- 'match_win', 'match_loss', 'decay', etc.
  rating_change INT DEFAULT 0,

  -- Timestamp
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_elo_history_item ON elo_rating_history(item_id, recorded_at DESC);

-- ELO Leaderboards View
-- Top items by type with tier classification
CREATE OR REPLACE VIEW elo_leaderboards AS
SELECT
  ei.id,
  ei.item_type,
  ei.item_name,
  ei.item_data,
  ei.elo_rating,
  ei.peak_rating,
  ei.matches_played,
  ei.wins,
  ei.losses,
  ei.draws,
  ei.win_rate,
  ei.tier,
  ROW_NUMBER() OVER (PARTITION BY ei.item_type ORDER BY ei.elo_rating DESC) as rank,
  ei.rating_confidence,
  ei.last_match_at,
  ei.created_at
FROM elo_items ei
WHERE ei.matches_played >= 5  -- Require at least 5 matches for leaderboard
ORDER BY ei.item_type, ei.elo_rating DESC;

-- Recent Matches View
-- Shows recent match activity with item names
CREATE OR REPLACE VIEW elo_recent_matches AS
SELECT
  em.id,
  em.matched_at,
  a.item_name as item_a_name,
  a.elo_rating as item_a_current_rating,
  b.item_name as item_b_name,
  b.elo_rating as item_b_current_rating,
  em.result,
  em.rating_change,
  em.expected_score,
  CASE
    WHEN em.winner_id = em.item_a_id THEN a.item_name
    WHEN em.winner_id = em.item_b_id THEN b.item_name
    ELSE 'Draw'
  END as winner_name,
  em.match_type,
  em.session_id
FROM elo_matches em
JOIN elo_items a ON em.item_a_id = a.id
JOIN elo_items b ON em.item_b_id = b.id
ORDER BY em.matched_at DESC;

-- Match Statistics by Type
-- Aggregate stats per item type
CREATE OR REPLACE VIEW elo_type_stats AS
SELECT
  item_type,
  COUNT(*) as total_items,
  AVG(elo_rating) as avg_rating,
  MAX(elo_rating) as max_rating,
  MIN(elo_rating) as min_rating,
  SUM(matches_played) as total_matches,
  AVG(matches_played) as avg_matches_per_item,
  AVG(win_rate) as avg_win_rate,
  MAX(last_match_at) as last_activity
FROM elo_items
GROUP BY item_type;

-- Head-to-Head Records
-- Compare any two items
CREATE OR REPLACE FUNCTION get_head_to_head(
  p_item_a_id INT,
  p_item_b_id INT
) RETURNS TABLE (
  total_matches BIGINT,
  item_a_wins BIGINT,
  item_b_wins BIGINT,
  draws BIGINT,
  avg_rating_change NUMERIC,
  last_match TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_matches,
    COUNT(*) FILTER (WHERE winner_id = p_item_a_id) as item_a_wins,
    COUNT(*) FILTER (WHERE winner_id = p_item_b_id) as item_b_wins,
    COUNT(*) FILTER (WHERE winner_id IS NULL) as draws,
    AVG(rating_change) as avg_rating_change,
    MAX(matched_at) as last_match
  FROM elo_matches
  WHERE (item_a_id = p_item_a_id AND item_b_id = p_item_b_id)
     OR (item_a_id = p_item_b_id AND item_b_id = p_item_a_id);
END;
$$ LANGUAGE plpgsql;

-- Update trigger for elo_items.updated_at
CREATE OR REPLACE FUNCTION update_elo_items_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_elo_items_timestamp
BEFORE UPDATE ON elo_items
FOR EACH ROW
EXECUTE FUNCTION update_elo_items_timestamp();

-- Automatically update win_rate when wins/losses change
CREATE OR REPLACE FUNCTION update_win_rate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.matches_played > 0 THEN
    NEW.win_rate = ROUND((NEW.wins::DECIMAL / NEW.matches_played) * 100, 2);
  ELSE
    NEW.win_rate = 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_win_rate
BEFORE UPDATE ON elo_items
FOR EACH ROW
WHEN (NEW.wins IS DISTINCT FROM OLD.wins OR NEW.losses IS DISTINCT FROM OLD.losses)
EXECUTE FUNCTION update_win_rate();

-- Function to get suggested matchups
-- Returns items with similar ratings for fair comparisons
CREATE OR REPLACE FUNCTION get_suggested_matchups(
  p_item_id INT,
  p_count INT DEFAULT 5
) RETURNS TABLE (
  id INT,
  item_name VARCHAR,
  elo_rating INT,
  rating_diff INT,
  matches_played INT,
  win_probability NUMERIC
) AS $$
DECLARE
  v_item_rating INT;
BEGIN
  -- Get the item's current rating
  SELECT ei.elo_rating INTO v_item_rating
  FROM elo_items ei
  WHERE ei.id = p_item_id;

  -- Return items with similar ratings
  RETURN QUERY
  SELECT
    ei.id,
    ei.item_name,
    ei.elo_rating,
    ABS(ei.elo_rating - v_item_rating) as rating_diff,
    ei.matches_played,
    ROUND(
      1.0 / (1.0 + POWER(10, (ei.elo_rating - v_item_rating::NUMERIC) / 400))::NUMERIC,
      3
    ) as win_probability
  FROM elo_items ei
  WHERE ei.id != p_item_id
    AND ei.item_type = (SELECT item_type FROM elo_items WHERE id = p_item_id)
  ORDER BY ABS(ei.elo_rating - v_item_rating), RANDOM()
  LIMIT p_count;
END;
$$ LANGUAGE plpgsql;

-- Success indicator
SELECT 'Migration 009: ELO Rating System - Completed' as status;

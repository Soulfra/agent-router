-- Card Roasting System Migration
-- Teaching engineering through voting on patterns (Based/Cringe/Mid)

-- Card roast votes table
CREATE TABLE IF NOT EXISTS card_roast_votes (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  card_id VARCHAR(32) NOT NULL,
  vote_type VARCHAR(20) NOT NULL,  -- based, cringe, mid
  roast_comment TEXT,              -- Optional roast comment
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, card_id)         -- One vote per user per card
);

CREATE INDEX IF NOT EXISTS idx_roast_votes_user ON card_roast_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_roast_votes_card ON card_roast_votes(card_id);
CREATE INDEX IF NOT EXISTS idx_roast_votes_type ON card_roast_votes(vote_type);

-- User taste scores (ELO-style rating for voting accuracy)
CREATE TABLE IF NOT EXISTS user_taste_scores (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL UNIQUE,
  taste_score INTEGER DEFAULT 1200,  -- ELO rating (starts at 1200)
  votes_cast INTEGER DEFAULT 0,
  correct_votes INTEGER DEFAULT 0,   -- Votes matching expert consensus
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taste_scores_user ON user_taste_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_taste_scores_score ON user_taste_scores(taste_score DESC);

-- Card burn events (when community agrees something is cringe)
CREATE TABLE IF NOT EXISTS card_burn_events (
  id SERIAL PRIMARY KEY,
  card_id VARCHAR(32) NOT NULL,
  verdict VARCHAR(20) NOT NULL,    -- based, cringe, mid
  confidence FLOAT NOT NULL,       -- 0.0 - 1.0 (consensus percentage)
  votes JSONB NOT NULL,            -- Vote breakdown
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_burn_events_card ON card_burn_events(card_id);
CREATE INDEX IF NOT EXISTS idx_burn_events_verdict ON card_burn_events(verdict);

-- Roast likes (upvote funny roast comments)
CREATE TABLE IF NOT EXISTS roast_likes (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  vote_id INTEGER NOT NULL REFERENCES card_roast_votes(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, vote_id)
);

CREATE INDEX IF NOT EXISTS idx_roast_likes_user ON roast_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_roast_likes_vote ON roast_likes(vote_id);

-- Pattern explanations (AI-generated educational content)
CREATE TABLE IF NOT EXISTS pattern_explanations (
  id SERIAL PRIMARY KEY,
  card_id VARCHAR(32) NOT NULL,
  explanation TEXT NOT NULL,
  verdict VARCHAR(20) NOT NULL,    -- based, cringe, mid
  generated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(card_id)
);

CREATE INDEX IF NOT EXISTS idx_explanations_card ON pattern_explanations(card_id);

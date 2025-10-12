/**
 * Migration 015: Game Leagues & Tournaments
 *
 * Features:
 * - Game leagues (tic-tac-toe, chess, more)
 * - Seasonal tournaments with brackets
 * - ELO rating system
 * - Match history and results
 * - Standings and leaderboards
 * - Integration with XP/Skills system
 */

-- ============================================================================
-- 1. GAME DEFINITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS game_definitions (
  game_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code VARCHAR(50) NOT NULL UNIQUE,
  game_name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Game details
  min_players INTEGER NOT NULL DEFAULT 2,
  max_players INTEGER NOT NULL DEFAULT 2,
  avg_duration_minutes INTEGER, -- Average game duration

  -- Skill mapping (which skill gains XP from this game)
  primary_skill_id UUID REFERENCES skills(skill_id),
  xp_per_game INTEGER DEFAULT 10,
  xp_multiplier_for_win NUMERIC(3,2) DEFAULT 2.0,

  -- ELO settings
  starting_elo INTEGER DEFAULT 1200,
  k_factor INTEGER DEFAULT 32, -- ELO adjustment rate

  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_game_definitions_code ON game_definitions(game_code);

-- Seed initial games
INSERT INTO game_definitions (game_code, game_name, description, min_players, max_players, avg_duration_minutes, xp_per_game, starting_elo)
VALUES
  ('tictactoe', 'Tic-Tac-Toe', 'Classic 3x3 grid game', 2, 2, 5, 5, 1000),
  ('chess', 'Chess', 'Strategic board game', 2, 2, 30, 20, 1200),
  ('checkers', 'Checkers', 'Classic checkers game', 2, 2, 20, 15, 1100)
ON CONFLICT (game_code) DO NOTHING;

-- ============================================================================
-- 2. LEAGUES
-- ============================================================================

CREATE TABLE IF NOT EXISTS game_leagues (
  league_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES game_definitions(game_id),

  league_name VARCHAR(100) NOT NULL,
  league_code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,

  -- League type
  league_type VARCHAR(50) NOT NULL, -- 'ranked', 'casual', 'tournament', 'season'
  tier VARCHAR(20), -- 'bronze', 'silver', 'gold', 'diamond', etc.

  -- Entry requirements
  entry_fee_cents INTEGER DEFAULT 0, -- Can be paid with coupon or real money
  min_elo INTEGER,
  max_elo INTEGER,
  min_age_bracket TEXT, -- From age verification
  required_skill_level INTEGER, -- Must have X level in related skill

  -- Timing
  start_date DATE,
  end_date DATE,
  registration_deadline DATE,

  -- Limits
  max_participants INTEGER,
  current_participants INTEGER DEFAULT 0,

  -- Settings
  match_format JSONB, -- Game-specific settings (time controls, board size, etc.)
  prize_pool JSONB, -- {1st: {xp: 1000, items: []}, 2nd: {...}}

  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'registration', 'active', 'completed', 'cancelled'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(user_id)
);

CREATE INDEX idx_game_leagues_game ON game_leagues(game_id);
CREATE INDEX idx_game_leagues_code ON game_leagues(league_code);
CREATE INDEX idx_game_leagues_status ON game_leagues(status);
CREATE INDEX idx_game_leagues_dates ON game_leagues(start_date, end_date);

-- ============================================================================
-- 3. LEAGUE PARTICIPATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS league_participants (
  participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES game_leagues(league_id),
  user_id UUID NOT NULL REFERENCES users(user_id),

  -- Registration
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  registration_fee_paid_cents INTEGER DEFAULT 0,
  coupon_id UUID REFERENCES coupon_codes(coupon_id), -- If entered via coupon

  -- Status
  status VARCHAR(50) DEFAULT 'registered', -- 'registered', 'active', 'eliminated', 'withdrawn', 'completed'
  withdrawn_at TIMESTAMPTZ,
  withdrawal_reason TEXT,

  -- Stats (populated during league)
  matches_played INTEGER DEFAULT 0,
  matches_won INTEGER DEFAULT 0,
  matches_lost INTEGER DEFAULT 0,
  matches_drawn INTEGER DEFAULT 0,
  total_xp_earned INTEGER DEFAULT 0,

  -- Bracket position (for tournament-style)
  bracket_position INTEGER,
  current_round INTEGER DEFAULT 0,
  eliminated_round INTEGER,

  -- Final placement
  final_rank INTEGER,
  final_score NUMERIC(10, 2),

  UNIQUE(league_id, user_id)
);

CREATE INDEX idx_league_participants_league ON league_participants(league_id);
CREATE INDEX idx_league_participants_user ON league_participants(user_id);
CREATE INDEX idx_league_participants_status ON league_participants(league_id, status);

-- ============================================================================
-- 4. MATCHES
-- ============================================================================

CREATE TABLE IF NOT EXISTS league_matches (
  match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES game_leagues(league_id),
  game_id UUID NOT NULL REFERENCES game_definitions(game_id),

  -- Match info
  match_number INTEGER, -- Sequential within league
  round_number INTEGER, -- For bracket/tournament style
  match_type VARCHAR(50) DEFAULT 'regular', -- 'regular', 'playoff', 'semifinal', 'final'

  -- Players
  player1_id UUID NOT NULL REFERENCES users(user_id),
  player2_id UUID NOT NULL REFERENCES users(user_id),
  player1_color VARCHAR(20), -- 'white', 'black', 'X', 'O', etc.
  player2_color VARCHAR(20),

  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Results
  status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed', 'abandoned', 'disputed'
  winner_id UUID REFERENCES users(user_id), -- NULL for draw
  result_type VARCHAR(50), -- 'win', 'draw', 'forfeit', 'timeout', 'abandoned'

  -- Game state (stored for resuming/reviewing)
  initial_state JSONB,
  final_state JSONB,
  move_history JSONB, -- Array of moves

  -- Duration
  duration_seconds INTEGER,

  -- ELO changes
  player1_elo_before INTEGER,
  player1_elo_after INTEGER,
  player1_elo_change INTEGER,
  player2_elo_before INTEGER,
  player2_elo_after INTEGER,
  player2_elo_change INTEGER,

  -- XP awarded
  player1_xp_awarded INTEGER DEFAULT 0,
  player2_xp_awarded INTEGER DEFAULT 0,

  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_league_matches_league ON league_matches(league_id);
CREATE INDEX idx_league_matches_players ON league_matches(player1_id, player2_id);
CREATE INDEX idx_league_matches_status ON league_matches(status);
CREATE INDEX idx_league_matches_scheduled ON league_matches(scheduled_at);

-- ============================================================================
-- 5. PLAYER ELO RATINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_elo_ratings (
  rating_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  game_id UUID NOT NULL REFERENCES game_definitions(game_id),

  -- Current rating
  current_elo INTEGER NOT NULL,
  peak_elo INTEGER NOT NULL,
  lowest_elo INTEGER NOT NULL,

  -- Stats
  total_games INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,

  -- Streaks
  current_win_streak INTEGER DEFAULT 0,
  longest_win_streak INTEGER DEFAULT 0,
  current_loss_streak INTEGER DEFAULT 0,

  -- Last played
  last_game_at TIMESTAMPTZ,
  last_rating_change INTEGER DEFAULT 0,

  -- Tier/Rank (auto-calculated from ELO)
  current_tier VARCHAR(20), -- 'bronze', 'silver', 'gold', etc.

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, game_id)
);

CREATE INDEX idx_player_elo_ratings_user ON player_elo_ratings(user_id);
CREATE INDEX idx_player_elo_ratings_game ON player_elo_ratings(game_id);
CREATE INDEX idx_player_elo_ratings_elo ON player_elo_ratings(game_id, current_elo DESC);
CREATE INDEX idx_player_elo_ratings_tier ON player_elo_ratings(game_id, current_tier);

-- ============================================================================
-- 6. ELO HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS elo_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  game_id UUID NOT NULL REFERENCES game_definitions(game_id),
  match_id UUID REFERENCES league_matches(match_id),

  elo_before INTEGER NOT NULL,
  elo_after INTEGER NOT NULL,
  elo_change INTEGER NOT NULL,

  opponent_id UUID REFERENCES users(user_id),
  opponent_elo INTEGER,

  result VARCHAR(20), -- 'win', 'loss', 'draw'

  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_elo_history_user ON elo_history(user_id, recorded_at DESC);
CREATE INDEX idx_elo_history_game ON elo_history(game_id, recorded_at DESC);
CREATE INDEX idx_elo_history_match ON elo_history(match_id);

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

/**
 * Calculate ELO change
 */
CREATE OR REPLACE FUNCTION calculate_elo_change(
  p_player_elo INTEGER,
  p_opponent_elo INTEGER,
  p_score NUMERIC, -- 1.0 = win, 0.5 = draw, 0.0 = loss
  p_k_factor INTEGER DEFAULT 32
)
RETURNS INTEGER AS $$
DECLARE
  v_expected NUMERIC;
  v_change INTEGER;
BEGIN
  -- Expected score
  v_expected := 1.0 / (1.0 + POWER(10.0, (p_opponent_elo - p_player_elo)::NUMERIC / 400.0));

  -- ELO change
  v_change := ROUND(p_k_factor * (p_score - v_expected));

  RETURN v_change;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

/**
 * Get or create player ELO rating
 */
CREATE OR REPLACE FUNCTION get_or_create_elo(
  p_user_id UUID,
  p_game_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_elo INTEGER;
  v_starting_elo INTEGER;
BEGIN
  -- Try to get existing rating
  SELECT current_elo INTO v_elo
  FROM player_elo_ratings
  WHERE user_id = p_user_id AND game_id = p_game_id;

  IF FOUND THEN
    RETURN v_elo;
  END IF;

  -- Get starting ELO for this game
  SELECT starting_elo INTO v_starting_elo
  FROM game_definitions
  WHERE game_id = p_game_id;

  -- Create new rating
  INSERT INTO player_elo_ratings (
    user_id,
    game_id,
    current_elo,
    peak_elo,
    lowest_elo
  )
  VALUES (
    p_user_id,
    p_game_id,
    v_starting_elo,
    v_starting_elo,
    v_starting_elo
  );

  RETURN v_starting_elo;
END;
$$ LANGUAGE plpgsql;

/**
 * Record match result and update ELO
 */
CREATE OR REPLACE FUNCTION record_match_result(
  p_match_id UUID,
  p_winner_id UUID, -- NULL for draw
  p_result_type VARCHAR(50) DEFAULT 'win'
)
RETURNS VOID AS $$
DECLARE
  v_match RECORD;
  v_p1_elo INTEGER;
  v_p2_elo INTEGER;
  v_p1_change INTEGER;
  v_p2_change INTEGER;
  v_p1_score NUMERIC;
  v_p2_score NUMERIC;
  v_k_factor INTEGER;
  v_xp_base INTEGER;
  v_xp_multiplier NUMERIC;
BEGIN
  -- Get match details
  SELECT * INTO v_match
  FROM league_matches
  WHERE match_id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  -- Get K-factor and XP settings
  SELECT k_factor, xp_per_game, xp_multiplier_for_win
  INTO v_k_factor, v_xp_base, v_xp_multiplier
  FROM game_definitions
  WHERE game_id = v_match.game_id;

  -- Get current ELO ratings
  v_p1_elo := get_or_create_elo(v_match.player1_id, v_match.game_id);
  v_p2_elo := get_or_create_elo(v_match.player2_id, v_match.game_id);

  -- Determine scores (1.0 = win, 0.5 = draw, 0.0 = loss)
  IF p_winner_id IS NULL THEN
    v_p1_score := 0.5;
    v_p2_score := 0.5;
  ELSIF p_winner_id = v_match.player1_id THEN
    v_p1_score := 1.0;
    v_p2_score := 0.0;
  ELSE
    v_p1_score := 0.0;
    v_p2_score := 1.0;
  END IF;

  -- Calculate ELO changes
  v_p1_change := calculate_elo_change(v_p1_elo, v_p2_elo, v_p1_score, v_k_factor);
  v_p2_change := calculate_elo_change(v_p2_elo, v_p1_elo, v_p2_score, v_k_factor);

  -- Update match with ELO data
  UPDATE league_matches
  SET
    winner_id = p_winner_id,
    result_type = p_result_type,
    status = 'completed',
    completed_at = NOW(),
    player1_elo_before = v_p1_elo,
    player1_elo_after = v_p1_elo + v_p1_change,
    player1_elo_change = v_p1_change,
    player2_elo_before = v_p2_elo,
    player2_elo_after = v_p2_elo + v_p2_change,
    player2_elo_change = v_p2_change,
    player1_xp_awarded = CASE WHEN v_p1_score = 1.0 THEN (v_xp_base * v_xp_multiplier)::INTEGER ELSE v_xp_base END,
    player2_xp_awarded = CASE WHEN v_p2_score = 1.0 THEN (v_xp_base * v_xp_multiplier)::INTEGER ELSE v_xp_base END
  WHERE match_id = p_match_id;

  -- Update player ELO ratings
  UPDATE player_elo_ratings
  SET
    current_elo = current_elo + v_p1_change,
    peak_elo = GREATEST(peak_elo, current_elo + v_p1_change),
    lowest_elo = LEAST(lowest_elo, current_elo + v_p1_change),
    total_games = total_games + 1,
    wins = wins + (CASE WHEN v_p1_score = 1.0 THEN 1 ELSE 0 END),
    losses = losses + (CASE WHEN v_p1_score = 0.0 THEN 1 ELSE 0 END),
    draws = draws + (CASE WHEN v_p1_score = 0.5 THEN 1 ELSE 0 END),
    current_win_streak = CASE WHEN v_p1_score = 1.0 THEN current_win_streak + 1 ELSE 0 END,
    longest_win_streak = GREATEST(longest_win_streak, CASE WHEN v_p1_score = 1.0 THEN current_win_streak + 1 ELSE 0 END),
    current_loss_streak = CASE WHEN v_p1_score = 0.0 THEN current_loss_streak + 1 ELSE 0 END,
    last_game_at = NOW(),
    last_rating_change = v_p1_change,
    updated_at = NOW()
  WHERE user_id = v_match.player1_id AND game_id = v_match.game_id;

  UPDATE player_elo_ratings
  SET
    current_elo = current_elo + v_p2_change,
    peak_elo = GREATEST(peak_elo, current_elo + v_p2_change),
    lowest_elo = LEAST(lowest_elo, current_elo + v_p2_change),
    total_games = total_games + 1,
    wins = wins + (CASE WHEN v_p2_score = 1.0 THEN 1 ELSE 0 END),
    losses = losses + (CASE WHEN v_p2_score = 0.0 THEN 1 ELSE 0 END),
    draws = draws + (CASE WHEN v_p2_score = 0.5 THEN 1 ELSE 0 END),
    current_win_streak = CASE WHEN v_p2_score = 1.0 THEN current_win_streak + 1 ELSE 0 END,
    longest_win_streak = GREATEST(longest_win_streak, CASE WHEN v_p2_score = 1.0 THEN current_win_streak + 1 ELSE 0 END),
    current_loss_streak = CASE WHEN v_p2_score = 0.0 THEN current_loss_streak + 1 ELSE 0 END,
    last_game_at = NOW(),
    last_rating_change = v_p2_change,
    updated_at = NOW()
  WHERE user_id = v_match.player2_id AND game_id = v_match.game_id;

  -- Record ELO history
  INSERT INTO elo_history (user_id, game_id, match_id, elo_before, elo_after, elo_change, opponent_id, opponent_elo, result)
  VALUES
    (v_match.player1_id, v_match.game_id, p_match_id, v_p1_elo, v_p1_elo + v_p1_change, v_p1_change, v_match.player2_id, v_p2_elo, CASE WHEN v_p1_score = 1.0 THEN 'win' WHEN v_p1_score = 0.5 THEN 'draw' ELSE 'loss' END),
    (v_match.player2_id, v_match.game_id, p_match_id, v_p2_elo, v_p2_elo + v_p2_change, v_p2_change, v_match.player1_id, v_p1_elo, CASE WHEN v_p2_score = 1.0 THEN 'win' WHEN v_p2_score = 0.5 THEN 'draw' ELSE 'loss' END);

  -- Update league participant stats
  UPDATE league_participants
  SET
    matches_played = matches_played + 1,
    matches_won = matches_won + (CASE WHEN v_p1_score = 1.0 THEN 1 ELSE 0 END),
    matches_lost = matches_lost + (CASE WHEN v_p1_score = 0.0 THEN 1 ELSE 0 END),
    matches_drawn = matches_drawn + (CASE WHEN v_p1_score = 0.5 THEN 1 ELSE 0 END)
  WHERE league_id = v_match.league_id AND user_id = v_match.player1_id;

  UPDATE league_participants
  SET
    matches_played = matches_played + 1,
    matches_won = matches_won + (CASE WHEN v_p2_score = 1.0 THEN 1 ELSE 0 END),
    matches_lost = matches_lost + (CASE WHEN v_p2_score = 0.0 THEN 1 ELSE 0 END),
    matches_drawn = matches_drawn + (CASE WHEN v_p2_score = 0.5 THEN 1 ELSE 0 END)
  WHERE league_id = v_match.league_id AND user_id = v_match.player2_id;

END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. VIEWS
-- ============================================================================

-- League leaderboards
CREATE OR REPLACE VIEW league_standings AS
SELECT
  lp.league_id,
  gl.league_name,
  lp.user_id,
  u.username,
  lp.matches_played,
  lp.matches_won,
  lp.matches_lost,
  lp.matches_drawn,
  CASE
    WHEN lp.matches_played > 0
    THEN ROUND(100.0 * lp.matches_won / lp.matches_played, 1)
    ELSE 0
  END AS win_percentage,
  per.current_elo,
  per.current_tier,
  lp.status,
  ROW_NUMBER() OVER (PARTITION BY lp.league_id ORDER BY lp.matches_won DESC, lp.matches_played ASC) AS rank
FROM league_participants lp
JOIN users u ON u.user_id = lp.user_id
JOIN game_leagues gl ON gl.league_id = lp.league_id
LEFT JOIN player_elo_ratings per ON per.user_id = lp.user_id AND per.game_id = gl.game_id
WHERE lp.status IN ('active', 'completed')
ORDER BY lp.league_id, rank;

-- Global game leaderboards
CREATE OR REPLACE VIEW global_game_leaderboards AS
SELECT
  gd.game_id,
  gd.game_code,
  gd.game_name,
  per.user_id,
  u.username,
  per.current_elo,
  per.current_tier,
  per.total_games,
  per.wins,
  per.losses,
  per.draws,
  CASE
    WHEN per.total_games > 0
    THEN ROUND(100.0 * per.wins / per.total_games, 1)
    ELSE 0
  END AS win_percentage,
  per.peak_elo,
  per.longest_win_streak,
  per.last_game_at,
  ROW_NUMBER() OVER (PARTITION BY gd.game_id ORDER BY per.current_elo DESC) AS rank
FROM game_definitions gd
JOIN player_elo_ratings per ON per.game_id = gd.game_id
JOIN users u ON u.user_id = per.user_id
WHERE gd.enabled = TRUE
ORDER BY gd.game_id, rank;

-- User match history
CREATE OR REPLACE VIEW user_match_history AS
SELECT
  lm.match_id,
  lm.league_id,
  gl.league_name,
  gd.game_name,
  lm.match_type,
  lm.scheduled_at,
  lm.completed_at,
  lm.duration_seconds,

  -- Player 1 perspective
  lm.player1_id AS user_id,
  u1.username AS user_username,
  lm.player2_id AS opponent_id,
  u2.username AS opponent_username,
  lm.player1_color AS user_color,
  lm.player2_color AS opponent_color,
  lm.player1_elo_before AS user_elo_before,
  lm.player1_elo_after AS user_elo_after,
  lm.player1_elo_change AS user_elo_change,
  lm.player1_xp_awarded AS user_xp_awarded,
  CASE
    WHEN lm.winner_id = lm.player1_id THEN 'win'
    WHEN lm.winner_id IS NULL THEN 'draw'
    ELSE 'loss'
  END AS user_result,
  lm.result_type,
  lm.status

FROM league_matches lm
JOIN game_leagues gl ON gl.league_id = lm.league_id
JOIN game_definitions gd ON gd.game_id = lm.game_id
JOIN users u1 ON u1.user_id = lm.player1_id
JOIN users u2 ON u2.user_id = lm.player2_id

UNION ALL

-- Player 2 perspective
SELECT
  lm.match_id,
  lm.league_id,
  gl.league_name,
  gd.game_name,
  lm.match_type,
  lm.scheduled_at,
  lm.completed_at,
  lm.duration_seconds,

  lm.player2_id AS user_id,
  u2.username AS user_username,
  lm.player1_id AS opponent_id,
  u1.username AS opponent_username,
  lm.player2_color AS user_color,
  lm.player1_color AS opponent_color,
  lm.player2_elo_before AS user_elo_before,
  lm.player2_elo_after AS user_elo_after,
  lm.player2_elo_change AS user_elo_change,
  lm.player2_xp_awarded AS user_xp_awarded,
  CASE
    WHEN lm.winner_id = lm.player2_id THEN 'win'
    WHEN lm.winner_id IS NULL THEN 'draw'
    ELSE 'loss'
  END AS user_result,
  lm.result_type,
  lm.status

FROM league_matches lm
JOIN game_leagues gl ON gl.league_id = lm.league_id
JOIN game_definitions gd ON gd.game_id = lm.game_id
JOIN users u1 ON u1.user_id = lm.player1_id
JOIN users u2 ON u2.user_id = lm.player2_id;

COMMENT ON TABLE game_definitions IS 'Define games that can be played (tic-tac-toe, chess, etc.)';
COMMENT ON TABLE game_leagues IS 'Leagues and tournaments for games';
COMMENT ON TABLE league_participants IS 'Users participating in leagues';
COMMENT ON TABLE league_matches IS 'Individual matches within leagues';
COMMENT ON TABLE player_elo_ratings IS 'ELO ratings for each player per game';
COMMENT ON TABLE elo_history IS 'Historical ELO changes for tracking progress';

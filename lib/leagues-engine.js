/**
 * Leagues Engine
 *
 * Manage game leagues and tournaments
 * - Create and manage leagues (chess, tic-tac-toe, etc.)
 * - Handle match scheduling and results
 * - Calculate ELO ratings
 * - Generate standings and leaderboards
 * - Award XP for participation/wins
 */

const skillsEngine = require('./skills-engine');

// Database connection (injected via initEngine)
let db = null;

/**
 * Initialize engine with database connection
 */
function initEngine(database) {
  db = database;
  skillsEngine.initEngine(database);
}

/**
 * Create a new league
 *
 * @param {Object} leagueData - League configuration
 * @returns {Promise<Object>} Created league
 */
async function createLeague(leagueData) {
  try {
    const {
      gameId,
      leagueName,
      leagueCode,
      description,
      leagueType = 'ranked',
      tier = null,
      entryFeeCents = 0,
      minElo = null,
      maxElo = null,
      minAgeBracket = null,
      requiredSkillLevel = null,
      startDate,
      endDate,
      registrationDeadline,
      maxParticipants = null,
      matchFormat = {},
      prizePool = {},
      createdBy
    } = leagueData;

    const result = await db.query(`
      INSERT INTO game_leagues (
        game_id,
        league_name,
        league_code,
        description,
        league_type,
        tier,
        entry_fee_cents,
        min_elo,
        max_elo,
        min_age_bracket,
        required_skill_level,
        start_date,
        end_date,
        registration_deadline,
        max_participants,
        match_format,
        prize_pool,
        created_by,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'registration')
      RETURNING *
    `, [
      gameId,
      leagueName,
      leagueCode,
      description,
      leagueType,
      tier,
      entryFeeCents,
      minElo,
      maxElo,
      minAgeBracket,
      requiredSkillLevel,
      startDate,
      endDate,
      registrationDeadline,
      maxParticipants,
      JSON.stringify(matchFormat),
      JSON.stringify(prizePool),
      createdBy
    ]);

    return result.rows[0];

  } catch (error) {
    console.error('[Leagues Engine] Create league error:', error);
    throw error;
  }
}

/**
 * Register user for a league
 *
 * @param {string} leagueId - League UUID
 * @param {string} userId - User UUID
 * @param {string} couponId - Optional coupon for entry
 * @returns {Promise<Object>} Participant record
 */
async function registerParticipant(leagueId, userId, couponId = null) {
  try {
    // Check if league accepts registrations
    const league = await db.query(`
      SELECT * FROM game_leagues WHERE league_id = $1
    `, [leagueId]);

    if (league.rows.length === 0) {
      throw new Error('League not found');
    }

    const leagueData = league.rows[0];

    if (leagueData.status !== 'registration' && leagueData.status !== 'draft') {
      throw new Error('League is not accepting registrations');
    }

    if (leagueData.max_participants && leagueData.current_participants >= leagueData.max_participants) {
      throw new Error('League is full');
    }

    // Check ELO requirements
    if (leagueData.min_elo || leagueData.max_elo) {
      const userElo = await db.query(`
        SELECT current_elo FROM player_elo_ratings
        WHERE user_id = $1 AND game_id = $2
      `, [userId, leagueData.game_id]);

      const elo = userElo.rows[0]?.current_elo || 1200; // Default starting ELO

      if (leagueData.min_elo && elo < leagueData.min_elo) {
        throw new Error(`Minimum ELO required: ${leagueData.min_elo} (you have ${elo})`);
      }

      if (leagueData.max_elo && elo > leagueData.max_elo) {
        throw new Error(`Maximum ELO allowed: ${leagueData.max_elo} (you have ${elo})`);
      }
    }

    // Register participant
    const result = await db.query(`
      INSERT INTO league_participants (
        league_id,
        user_id,
        coupon_id,
        registration_fee_paid_cents,
        status
      )
      VALUES ($1, $2, $3, $4, 'registered')
      RETURNING *
    `, [leagueId, userId, couponId, leagueData.entry_fee_cents]);

    // Update league participant count
    await db.query(`
      UPDATE game_leagues
      SET current_participants = current_participants + 1
      WHERE league_id = $1
    `, [leagueId]);

    return result.rows[0];

  } catch (error) {
    console.error('[Leagues Engine] Register participant error:', error);
    throw error;
  }
}

/**
 * Create a match between two players
 *
 * @param {string} leagueId - League UUID
 * @param {string} player1Id - Player 1 UUID
 * @param {string} player2Id - Player 2 UUID
 * @param {Object} matchConfig - Optional match configuration
 * @returns {Promise<Object>} Created match
 */
async function createMatch(leagueId, player1Id, player2Id, matchConfig = {}) {
  try {
    const {
      matchNumber = null,
      roundNumber = null,
      matchType = 'regular',
      scheduledAt = null,
      initialState = {}
    } = matchConfig;

    // Get league and game info
    const league = await db.query(`
      SELECT gl.*, gd.game_id FROM game_leagues gl
      JOIN game_definitions gd ON gd.game_id = gl.game_id
      WHERE gl.league_id = $1
    `, [leagueId]);

    if (league.rows.length === 0) {
      throw new Error('League not found');
    }

    const gameId = league.rows[0].game_id;

    // Get current ELO ratings
    const player1Elo = await db.query(
      'SELECT * FROM get_or_create_elo($1, $2)',
      [player1Id, gameId]
    );

    const player2Elo = await db.query(
      'SELECT * FROM get_or_create_elo($1, $2)',
      [player2Id, gameId]
    );

    // Create match
    const result = await db.query(`
      INSERT INTO league_matches (
        league_id,
        game_id,
        match_number,
        round_number,
        match_type,
        player1_id,
        player2_id,
        scheduled_at,
        initial_state,
        player1_elo_before,
        player2_elo_before,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'scheduled')
      RETURNING *
    `, [
      leagueId,
      gameId,
      matchNumber,
      roundNumber,
      matchType,
      player1Id,
      player2Id,
      scheduledAt,
      JSON.stringify(initialState),
      player1Elo.rows[0].get_or_create_elo,
      player2Elo.rows[0].get_or_create_elo
    ]);

    return result.rows[0];

  } catch (error) {
    console.error('[Leagues Engine] Create match error:', error);
    throw error;
  }
}

/**
 * Start a match
 *
 * @param {string} matchId - Match UUID
 * @returns {Promise<Object>} Updated match
 */
async function startMatch(matchId) {
  try {
    const result = await db.query(`
      UPDATE league_matches
      SET status = 'in_progress', started_at = NOW()
      WHERE match_id = $1 AND status = 'scheduled'
      RETURNING *
    `, [matchId]);

    if (result.rows.length === 0) {
      throw new Error('Match not found or already started');
    }

    return result.rows[0];

  } catch (error) {
    console.error('[Leagues Engine] Start match error:', error);
    throw error;
  }
}

/**
 * Record match result
 *
 * @param {string} matchId - Match UUID
 * @param {string} winnerId - Winner UUID (null for draw)
 * @param {Object} matchData - Final state, moves, duration
 * @returns {Promise<Object>} Match result
 */
async function recordMatchResult(matchId, winnerId, matchData = {}) {
  try {
    const {
      finalState = {},
      moveHistory = [],
      durationSeconds = null,
      resultType = 'win'
    } = matchData;

    // Update match with final data
    await db.query(`
      UPDATE league_matches
      SET
        final_state = $1,
        move_history = $2,
        duration_seconds = $3
      WHERE match_id = $4
    `, [
      JSON.stringify(finalState),
      JSON.stringify(moveHistory),
      durationSeconds,
      matchId
    ]);

    // Record result and update ELO (database function handles all the logic)
    await db.query(
      'SELECT record_match_result($1, $2, $3)',
      [matchId, winnerId, resultType]
    );

    // Get updated match with ELO changes
    const result = await db.query(`
      SELECT * FROM league_matches WHERE match_id = $1
    `, [matchId]);

    const match = result.rows[0];

    // Award XP to both players
    await awardMatchXP(match);

    return match;

  } catch (error) {
    console.error('[Leagues Engine] Record match result error:', error);
    throw error;
  }
}

/**
 * Award XP to players based on match result
 *
 * @param {Object} match - Match record
 */
async function awardMatchXP(match) {
  try {
    // Get game XP settings
    const game = await db.query(`
      SELECT * FROM game_definitions WHERE game_id = $1
    `, [match.game_id]);

    if (game.rows.length === 0 || !game.rows[0].primary_skill_id) {
      return; // No XP if game doesn't have a primary skill
    }

    const gameData = game.rows[0];

    // Award XP to player 1
    if (match.player1_xp_awarded > 0) {
      await skillsEngine.awardXP(
        match.player1_id,
        gameData.primary_skill_id,
        match.player1_xp_awarded,
        match.match_id,
        'match_result'
      );
    }

    // Award XP to player 2
    if (match.player2_xp_awarded > 0) {
      await skillsEngine.awardXP(
        match.player2_id,
        gameData.primary_skill_id,
        match.player2_xp_awarded,
        match.match_id,
        'match_result'
      );
    }

  } catch (error) {
    console.error('[Leagues Engine] Award match XP error:', error);
    // Don't throw - XP award failure shouldn't fail match recording
  }
}

/**
 * Get league standings
 *
 * @param {string} leagueId - League UUID
 * @returns {Promise<Array>} Standings
 */
async function getStandings(leagueId) {
  try {
    const result = await db.query(`
      SELECT * FROM league_standings
      WHERE league_id = $1
      ORDER BY rank
    `, [leagueId]);

    return result.rows;

  } catch (error) {
    console.error('[Leagues Engine] Get standings error:', error);
    return [];
  }
}

/**
 * Get global leaderboard for a game
 *
 * @param {string} gameCode - Game code (e.g., 'chess', 'tictactoe')
 * @param {number} limit - Number of players to return
 * @returns {Promise<Array>} Leaderboard
 */
async function getGlobalLeaderboard(gameCode, limit = 100) {
  try {
    const result = await db.query(`
      SELECT * FROM global_game_leaderboards
      WHERE game_code = $1
      ORDER BY rank
      LIMIT $2
    `, [gameCode, limit]);

    return result.rows;

  } catch (error) {
    console.error('[Leagues Engine] Get global leaderboard error:', error);
    return [];
  }
}

/**
 * Get user's match history
 *
 * @param {string} userId - User UUID
 * @param {number} limit - Number of matches to return
 * @param {string} gameCode - Optional game code filter
 * @returns {Promise<Array>} Match history
 */
async function getUserMatchHistory(userId, limit = 50, gameCode = null) {
  try {
    let query = `
      SELECT * FROM user_match_history
      WHERE user_id = $1
    `;
    const params = [userId];

    if (gameCode) {
      params.push(gameCode);
      query += ` AND game_name = (SELECT game_name FROM game_definitions WHERE game_code = $${params.length})`;
    }

    query += ` ORDER BY completed_at DESC NULLS LAST, scheduled_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);
    return result.rows;

  } catch (error) {
    console.error('[Leagues Engine] Get user match history error:', error);
    return [];
  }
}

/**
 * Get user's ELO rating for a game
 *
 * @param {string} userId - User UUID
 * @param {string} gameCode - Game code
 * @returns {Promise<Object>} ELO rating
 */
async function getUserELO(userId, gameCode) {
  try {
    const result = await db.query(`
      SELECT per.* FROM player_elo_ratings per
      JOIN game_definitions gd ON gd.game_id = per.game_id
      WHERE per.user_id = $1 AND gd.game_code = $2
    `, [userId, gameCode]);

    return result.rows[0] || null;

  } catch (error) {
    console.error('[Leagues Engine] Get user ELO error:', error);
    return null;
  }
}

/**
 * Get all available games
 *
 * @returns {Promise<Array>} Game definitions
 */
async function getGames() {
  try {
    const result = await db.query(`
      SELECT * FROM game_definitions WHERE enabled = TRUE ORDER BY game_name
    `);

    return result.rows;

  } catch (error) {
    console.error('[Leagues Engine] Get games error:', error);
    return [];
  }
}

/**
 * Get all leagues with optional filtering
 *
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} Leagues
 */
async function getLeagues(filters = {}) {
  try {
    let query = 'SELECT * FROM game_leagues WHERE 1=1';
    const params = [];

    if (filters.status) {
      params.push(filters.status);
      query += ` AND status = $${params.length}`;
    }

    if (filters.gameCode) {
      params.push(filters.gameCode);
      query += ` AND game_id = (SELECT game_id FROM game_definitions WHERE game_code = $${params.length})`;
    }

    if (filters.tier) {
      params.push(filters.tier);
      query += ` AND tier = $${params.length}`;
    }

    query += ' ORDER BY start_date DESC NULLS LAST, created_at DESC';

    const result = await db.query(query, params);
    return result.rows;

  } catch (error) {
    console.error('[Leagues Engine] Get leagues error:', error);
    return [];
  }
}

/**
 * Get league details with participants
 *
 * @param {string} leagueId - League UUID
 * @returns {Promise<Object>} League details
 */
async function getLeagueDetails(leagueId) {
  try {
    const league = await db.query(`
      SELECT gl.*, gd.game_name, gd.game_code
      FROM game_leagues gl
      JOIN game_definitions gd ON gd.game_id = gl.game_id
      WHERE gl.league_id = $1
    `, [leagueId]);

    if (league.rows.length === 0) {
      return null;
    }

    const participants = await db.query(`
      SELECT lp.*, u.username, per.current_elo
      FROM league_participants lp
      JOIN users u ON u.user_id = lp.user_id
      LEFT JOIN player_elo_ratings per ON per.user_id = lp.user_id AND per.game_id = (
        SELECT game_id FROM game_leagues WHERE league_id = $1
      )
      WHERE lp.league_id = $1
      ORDER BY lp.registered_at
    `, [leagueId]);

    return {
      ...league.rows[0],
      participants: participants.rows
    };

  } catch (error) {
    console.error('[Leagues Engine] Get league details error:', error);
    return null;
  }
}

module.exports = {
  initEngine,
  createLeague,
  registerParticipant,
  createMatch,
  startMatch,
  recordMatchResult,
  getStandings,
  getGlobalLeaderboard,
  getUserMatchHistory,
  getUserELO,
  getGames,
  getLeagues,
  getLeagueDetails
};

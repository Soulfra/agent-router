/**
 * ELO Rating System Routes
 *
 * Universal ranking API for ANY items (recipes, games, products, etc.)
 * Like Chess.com/Lichess but for anything you want to compare
 */

const express = require('express');
const router = express.Router();
const EloCalculator = require('../lib/elo-calculator');
const BadgeSystem = require('../lib/badge-system');
const { optionalAuth } = require('../middleware/sso-auth');
const { createRateLimiter, getRateLimitStatus } = require('../middleware/rate-limiter');
const crypto = require('crypto');

// Database connection (injected via initRoutes)
let db = null;
let eloCalc = null;
let broadcastFn = null;
let badgeSystem = null;

// Rate limiter for voting endpoints
const voteRateLimiter = createRateLimiter({
  message: 'Too many votes, please slow down',
  skipSuccessfulRequests: false
});

/**
 * Initialize routes with database connection and broadcast function
 */
function initRoutes(database, broadcast) {
  db = database;
  broadcastFn = broadcast || (() => {}); // Fallback to no-op if not provided
  eloCalc = new EloCalculator({ kFactor: 32, defaultRating: 1500 });
  badgeSystem = new BadgeSystem();
  return router;
}

/**
 * POST /api/elo/item
 * Create a new item to be ranked
 */
router.post('/item', async (req, res) => {
  try {
    const { item_type, item_name, item_data = {}, created_by, tags = [] } = req.body;

    if (!item_type || !item_name) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: item_type, item_name'
      });
    }

    const result = await db.query(`
      INSERT INTO elo_items (
        item_type, item_name, item_data, created_by, tags, tier
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, item_type, item_name, elo_rating, tier, created_at
    `, [item_type, item_name, item_data, created_by, tags, 'Novice']);

    res.status(201).json({
      status: 'ok',
      item: result.rows[0]
    });

  } catch (error) {
    console.error('[ELO] Create item error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * Helper: Generate device fingerprint
 */
function generateDeviceFingerprint(req) {
  const components = [
    req.ip || req.connection.remoteAddress || 'unknown',
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || ''
  ];
  return crypto.createHash('sha256').update(components.join('|')).digest('hex').substring(0, 16);
}

/**
 * POST /api/elo/match
 * Record a match between two items (swipe left/right)
 */
router.post('/match', optionalAuth, voteRateLimiter, async (req, res) => {
  try {
    const { item_a_id, item_b_id, winner_id, session_id, match_type = 'swipe', vote_duration_ms } = req.body;

    if (!item_a_id || !item_b_id || !winner_id) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: item_a_id, item_b_id, winner_id'
      });
    }

    // Extract user info
    const userId = req.user ? req.user.id : null;
    const userTier = req.user
      ? (req.user.isTrustedDevice ? 'trusted' : req.user.emailVerified ? 'verified' : 'registered')
      : 'anonymous';
    const deviceFingerprint = generateDeviceFingerprint(req);
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Check if voter is blocked
    const blockedCheck = await db.query(`
      SELECT * FROM check_voter_allowed($1, $2, $3, $4)
    `, [userId, session_id, deviceFingerprint, ipAddress]);

    if (!blockedCheck.rows[0].allowed) {
      return res.status(403).json({
        status: 'error',
        error: blockedCheck.rows[0].reason,
        code: 'VOTER_BLOCKED'
      });
    }

    // Check for duplicate vote (same matchup within 24 hours)
    const duplicateCheck = await db.query(`
      SELECT * FROM check_duplicate_vote($1, $2, $3, $4)
    `, [userId, session_id, item_a_id, item_b_id]);

    if (duplicateCheck.rows[0].is_duplicate) {
      return res.status(409).json({
        status: 'error',
        error: 'You already voted on this matchup recently',
        code: 'DUPLICATE_VOTE',
        previous_vote_at: duplicateCheck.rows[0].previous_voted_at
      });
    }

    // Detect rapid-fire voting
    const rapidFireCheck = await db.query(`
      SELECT * FROM detect_rapid_fire_voting($1, $2, 60, 5)
    `, [userId, session_id]);

    const isRapidFire = rapidFireCheck.rows[0]?.is_rapid_fire || false;
    const isSuspicious = isRapidFire || (vote_duration_ms && vote_duration_ms < 500); // Less than 500ms to vote
    const suspiciousReason = isRapidFire
      ? `Rapid-fire voting detected: ${rapidFireCheck.rows[0].vote_count} votes in 60 seconds`
      : (vote_duration_ms && vote_duration_ms < 500)
      ? `Vote too fast: ${vote_duration_ms}ms`
      : null;

    // Get current ratings
    const itemsResult = await db.query(`
      SELECT id, elo_rating, matches_played, wins, losses, draws
      FROM elo_items
      WHERE id = ANY($1)
    `, [[item_a_id, item_b_id]]);

    if (itemsResult.rows.length !== 2) {
      return res.status(404).json({
        status: 'error',
        error: 'One or both items not found'
      });
    }

    const itemA = itemsResult.rows.find(r => r.id === item_a_id);
    const itemB = itemsResult.rows.find(r => r.id === item_b_id);

    // Determine result
    let result, score;
    if (winner_id === item_a_id) {
      result = 'a_wins';
      score = 1.0;
    } else if (winner_id === item_b_id) {
      result = 'b_wins';
      score = 1.0;
    } else {
      result = 'draw';
      score = 0.5;
    }

    // Calculate new ratings using adaptive K-factor
    const kFactorA = eloCalc.getAdaptiveKFactor(itemA.elo_rating, itemA.matches_played);
    const kFactorB = eloCalc.getAdaptiveKFactor(itemB.elo_rating, itemB.matches_played);

    const calcA = new EloCalculator({ kFactor: kFactorA });
    const calcB = new EloCalculator({ kFactor: kFactorB });

    let newRatings;
    if (winner_id === item_a_id) {
      newRatings = calcA.updateRatings(itemA.elo_rating, itemB.elo_rating, 1);
    } else if (winner_id === item_b_id) {
      newRatings = calcB.updateRatings(itemB.elo_rating, itemA.elo_rating, 1);
      // Swap for consistency
      newRatings = {
        winner: newRatings.winner,
        loser: newRatings.loser,
        change: newRatings.change,
        probability: 1 - newRatings.probability
      };
    } else {
      // Draw
      newRatings = calcA.updateRatings(itemA.elo_rating, itemB.elo_rating, 0.5);
    }

    const ratingChangeA = winner_id === item_a_id ? newRatings.change : -newRatings.change;
    const ratingChangeB = winner_id === item_b_id ? newRatings.change : -newRatings.change;

    const newRatingA = itemA.elo_rating + ratingChangeA;
    const newRatingB = itemB.elo_rating + ratingChangeB;

    // Record match
    const matchResult = await db.query(`
      INSERT INTO elo_matches (
        item_a_id, item_b_id,
        item_a_rating_before, item_b_rating_before,
        item_a_rating_after, item_b_rating_after,
        winner_id, result, score,
        rating_change, expected_score,
        match_type, session_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, matched_at
    `, [
      item_a_id, item_b_id,
      itemA.elo_rating, itemB.elo_rating,
      newRatingA, newRatingB,
      winner_id, result, score,
      newRatings.change, newRatings.probability,
      match_type, session_id
    ]);

    const matchId = matchResult.rows[0].id;

    // Update item A
    await db.query(`
      UPDATE elo_items
      SET
        elo_rating = $1,
        peak_rating = GREATEST(peak_rating, $1),
        matches_played = matches_played + 1,
        wins = wins + $2,
        losses = losses + $3,
        draws = draws + $4,
        rating_confidence = $5,
        tier = $6,
        last_match_at = NOW()
      WHERE id = $7
    `, [
      newRatingA,
      winner_id === item_a_id ? 1 : 0,
      winner_id === item_b_id ? 1 : 0,
      winner_id === null ? 1 : 0,
      eloCalc.calculateConfidence(itemA.matches_played + 1),
      eloCalc.classifyRating(newRatingA).tier,
      item_a_id
    ]);

    // Update item B
    await db.query(`
      UPDATE elo_items
      SET
        elo_rating = $1,
        peak_rating = GREATEST(peak_rating, $1),
        matches_played = matches_played + 1,
        wins = wins + $2,
        losses = losses + $3,
        draws = draws + $4,
        rating_confidence = $5,
        tier = $6,
        last_match_at = NOW()
      WHERE id = $7
    `, [
      newRatingB,
      winner_id === item_b_id ? 1 : 0,
      winner_id === item_a_id ? 1 : 0,
      winner_id === null ? 1 : 0,
      eloCalc.calculateConfidence(itemB.matches_played + 1),
      eloCalc.classifyRating(newRatingB).tier,
      item_b_id
    ]);

    // Record rating history
    await db.query(`
      INSERT INTO elo_rating_history (item_id, elo_rating, matches_played, tier, match_id, change_type, rating_change)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7),
        ($8, $9, $10, $11, $12, $13, $14)
    `, [
      item_a_id, newRatingA, itemA.matches_played + 1, eloCalc.classifyRating(newRatingA).tier,
      matchId, result === 'a_wins' ? 'match_win' : (result === 'draw' ? 'match_draw' : 'match_loss'), ratingChangeA,
      item_b_id, newRatingB, itemB.matches_played + 1, eloCalc.classifyRating(newRatingB).tier,
      matchId, result === 'b_wins' ? 'match_win' : (result === 'draw' ? 'match_draw' : 'match_loss'), ratingChangeB
    ]);

    // Record vote for spam tracking
    await db.query(`
      INSERT INTO elo_user_votes (
        match_id, item_a_id, item_b_id, winner_id,
        user_id, session_id, device_fingerprint, ip_address,
        user_tier, vote_duration_ms, is_suspicious, suspicious_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      matchId, item_a_id, item_b_id, winner_id,
      userId, session_id, deviceFingerprint, ipAddress,
      userTier, vote_duration_ms, isSuspicious, suspiciousReason
    ]);

    // Log spam pattern if suspicious
    if (isSuspicious) {
      await db.query(`
        INSERT INTO elo_spam_patterns (
          identifier_type, identifier_value, pattern_type,
          pattern_data, severity, confidence_score, action_taken
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `, [
        userId ? 'user' : 'session',
        userId ? userId : session_id,
        isRapidFire ? 'rapid_fire' : 'fast_vote',
        JSON.stringify({
          vote_duration_ms,
          votes_in_window: rapidFireCheck.rows[0]?.vote_count || 1
        }),
        'low',
        0.75,
        'flagged'
      ]);
    }

    // Check for bias patterns (always voting the same way)
    const biasCheck = await db.query(`
      SELECT
        COUNT(*) as total_votes,
        COUNT(DISTINCT winner_id) as unique_winners,
        COUNT(*) FILTER (WHERE winner_id = $1) as votes_for_this_winner
      FROM elo_user_votes
      WHERE (user_id = $2 OR session_id = $3)
        AND voted_at > NOW() - INTERVAL '1 hour'
    `, [winner_id, userId, session_id]);

    const bias = biasCheck.rows[0];
    if (bias.total_votes >= 10 && bias.unique_winners <= 3) {
      // User has voted 10+ times but only for 3 or fewer different items - suspicious bias
      await db.query(`
        INSERT INTO elo_spam_patterns (
          identifier_type, identifier_value, pattern_type,
          pattern_data, severity, confidence_score, action_taken
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `, [
        userId ? 'user' : 'session',
        userId ? userId : session_id,
        'bias_detected',
        JSON.stringify({
          total_votes: bias.total_votes,
          unique_winners: bias.unique_winners,
          bias_percentage: Math.round((bias.votes_for_this_winner / bias.total_votes) * 100)
        }),
        bias.unique_winners === 1 ? 'high' : 'medium',
        0.85,
        'flagged'
      ]);
    }

    // Broadcast update to all connected clients for real-time leaderboard
    if (broadcastFn) {
      broadcastFn({
        type: 'elo_update',
        match_id: matchId,
        item_type: 'recipe',
        items: {
          a: { id: item_a_id, name: itemA.item_name, rating_before: itemA.elo_rating, rating_after: newRatingA, change: ratingChangeA },
          b: { id: item_b_id, name: itemB.item_name, rating_before: itemB.elo_rating, rating_after: newRatingB, change: ratingChangeB }
        },
        winner_id,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      status: 'ok',
      match_id: matchId,
      result,
      ratings: {
        item_a: {
          before: itemA.elo_rating,
          after: newRatingA,
          change: ratingChangeA
        },
        item_b: {
          before: itemB.elo_rating,
          after: newRatingB,
          change: ratingChangeB
        }
      },
      expected_probability: Math.round(newRatings.probability * 100) + '%'
    });

  } catch (error) {
    console.error('[ELO] Match error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/elo/leaderboard
 * Get top-ranked items by type
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const { type, limit = 50 } = req.query;

    if (!type) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required parameter: type'
      });
    }

    const result = await db.query(`
      SELECT * FROM elo_leaderboards
      WHERE item_type = $1
      LIMIT $2
    `, [type, parseInt(limit)]);

    // Add tier info
    const leaderboard = result.rows.map(item => ({
      ...item,
      tier_info: eloCalc.classifyRating(item.elo_rating)
    }));

    res.json({
      status: 'ok',
      type,
      count: leaderboard.length,
      leaderboard
    });

  } catch (error) {
    console.error('[ELO] Leaderboard error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/elo/item/:id
 * Get detailed stats for an item
 */
router.get('/item/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const itemResult = await db.query(`
      SELECT * FROM elo_items WHERE id = $1
    `, [id]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Item not found'
      });
    }

    const item = itemResult.rows[0];

    // Get recent matches
    const matchesResult = await db.query(`
      SELECT * FROM elo_recent_matches
      WHERE (item_a_name = $1 OR item_b_name = $1)
      LIMIT 10
    `, [item.item_name]);

    // Get rating history
    const historyResult = await db.query(`
      SELECT elo_rating, matches_played, tier, recorded_at
      FROM elo_rating_history
      WHERE item_id = $1
      ORDER BY recorded_at DESC
      LIMIT 50
    `, [id]);

    res.json({
      status: 'ok',
      item: {
        ...item,
        tier_info: eloCalc.classifyRating(item.elo_rating),
        confidence_percent: item.rating_confidence
      },
      recent_matches: matchesResult.rows,
      rating_history: historyResult.rows
    });

  } catch (error) {
    console.error('[ELO] Get item error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/elo/matchup/:id1/:id2
 * Predict outcome of a matchup
 */
router.get('/matchup/:id1/:id2', async (req, res) => {
  try {
    const { id1, id2 } = req.params;

    const itemsResult = await db.query(`
      SELECT id, item_name, elo_rating, matches_played, wins, losses
      FROM elo_items
      WHERE id = ANY($1)
    `, [[parseInt(id1), parseInt(id2)]]);

    if (itemsResult.rows.length !== 2) {
      return res.status(404).json({
        status: 'error',
        error: 'One or both items not found'
      });
    }

    const itemA = itemsResult.rows.find(r => r.id === parseInt(id1));
    const itemB = itemsResult.rows.find(r => r.id === parseInt(id2));

    // Get prediction
    const prediction = eloCalc.predictMatch(itemA.elo_rating, itemB.elo_rating);

    // Get head-to-head history
    const h2hResult = await db.query(`
      SELECT * FROM get_head_to_head($1, $2)
    `, [id1, id2]);

    res.json({
      status: 'ok',
      items: {
        a: itemA,
        b: itemB
      },
      prediction,
      head_to_head: h2hResult.rows[0] || {
        total_matches: 0,
        item_a_wins: 0,
        item_b_wins: 0,
        draws: 0
      }
    });

  } catch (error) {
    console.error('[ELO] Matchup prediction error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/elo/suggested/:id
 * Get suggested matchups for an item
 */
router.get('/suggested/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { count = 5 } = req.query;

    const result = await db.query(`
      SELECT * FROM get_suggested_matchups($1, $2)
    `, [id, parseInt(count)]);

    res.json({
      status: 'ok',
      item_id: id,
      suggestions: result.rows
    });

  } catch (error) {
    console.error('[ELO] Suggested matchups error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/elo/stats/:type
 * Get aggregate statistics for an item type
 */
router.get('/stats/:type', async (req, res) => {
  try {
    const { type } = req.params;

    const result = await db.query(`
      SELECT * FROM elo_type_stats WHERE item_type = $1
    `, [type]);

    if (result.rows.length === 0) {
      return res.json({
        status: 'ok',
        type,
        stats: null,
        message: 'No items of this type yet'
      });
    }

    res.json({
      status: 'ok',
      type,
      stats: result.rows[0]
    });

  } catch (error) {
    console.error('[ELO] Stats error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/elo/random/:type
 * Get two random items of same type for comparison
 */
router.get('/random/:type', async (req, res) => {
  try {
    const { type } = req.params;

    const result = await db.query(`
      SELECT id, item_name, item_data, elo_rating, tier, matches_played, wins, losses, draws
      FROM elo_items
      WHERE item_type = $1
      ORDER BY RANDOM()
      LIMIT 2
    `, [type]);

    if (result.rows.length < 2) {
      return res.status(404).json({
        status: 'error',
        error: 'Not enough items of this type to compare (need at least 2)'
      });
    }

    const [itemA, itemB] = result.rows;
    const prediction = eloCalc.predictMatch(itemA.elo_rating, itemB.elo_rating);

    res.json({
      status: 'ok',
      items: [itemA, itemB],
      prediction
    });

  } catch (error) {
    console.error('[ELO] Random pair error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/elo/rate-limit-status
 * Get current rate limit status for the user
 */
router.get('/rate-limit-status', optionalAuth, async (req, res) => {
  try {
    const status = getRateLimitStatus(req);
    res.json({
      status: 'ok',
      ...status
    });
  } catch (error) {
    console.error('[ELO] Rate limit status error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/elo/device-stats
 * Get device badge and reputation info
 */
router.get('/device-stats', async (req, res) => {
  try {
    const { deviceId } = req.query;

    if (!deviceId) {
      return res.status(400).json({
        status: 'error',
        message: 'deviceId is required'
      });
    }

    const result = await db.query(`
      SELECT
        device_id,
        user_id,
        current_badge,
        trust_score,
        consistency_score,
        reputation_score,
        total_votes,
        total_matches_played,
        days_active,
        first_seen,
        last_seen,
        can_vote,
        can_chat,
        can_create_polls,
        is_suspicious,
        is_blocked
      FROM user_devices
      WHERE device_id = $1
    `, [deviceId]);

    if (result.rows.length === 0) {
      return res.json({
        status: 'success',
        device: null
      });
    }

    res.json({
      status: 'success',
      device: result.rows[0]
    });

  } catch (error) {
    console.error('[ELO] Device stats error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/elo/admin/spam-patterns
 * View detected spam patterns (admin endpoint)
 */
router.get('/admin/spam-patterns', async (req, res) => {
  try {
    const { severity, pattern_type, limit = 100 } = req.query;

    let query = `
      SELECT * FROM elo_spam_patterns
      WHERE 1=1
    `;
    const params = [];

    if (severity) {
      params.push(severity);
      query += ` AND severity = $${params.length}`;
    }

    if (pattern_type) {
      params.push(pattern_type);
      query += ` AND pattern_type = $${params.length}`;
    }

    params.push(parseInt(limit));
    query += ` ORDER BY last_detected_at DESC LIMIT $${params.length}`;

    const result = await db.query(query, params);

    res.json({
      status: 'ok',
      count: result.rows.length,
      patterns: result.rows
    });

  } catch (error) {
    console.error('[ELO] Spam patterns error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/elo/admin/suspicious-voters
 * View suspicious voter activity (admin endpoint)
 */
router.get('/admin/suspicious-voters', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM elo_suspicious_voters
      ORDER BY suspicious_votes DESC, votes_per_second DESC
      LIMIT 50
    `);

    res.json({
      status: 'ok',
      count: result.rows.length,
      suspicious_voters: result.rows
    });

  } catch (error) {
    console.error('[ELO] Suspicious voters error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/elo/admin/vote-statistics
 * View voting statistics by hour and tier
 */
router.get('/admin/vote-statistics', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM elo_vote_statistics
      ORDER BY hour DESC
      LIMIT 168
    `);

    res.json({
      status: 'ok',
      count: result.rows.length,
      statistics: result.rows
    });

  } catch (error) {
    console.error('[ELO] Vote statistics error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/elo/admin/block-voter
 * Block a user/IP/device/session from voting
 */
router.post('/admin/block-voter', async (req, res) => {
  try {
    const { block_type, block_value, reason, duration_hours } = req.body;

    if (!block_type || !block_value || !reason) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: block_type, block_value, reason'
      });
    }

    const expiresAt = duration_hours
      ? `NOW() + INTERVAL '${parseInt(duration_hours)} hours'`
      : 'NULL';

    const result = await db.query(`
      INSERT INTO elo_blocked_voters (
        block_type, block_value, reason, blocked_by, expires_at
      )
      VALUES ($1, $2, $3, $4, ${expiresAt})
      RETURNING *
    `, [block_type, block_value, reason, 'admin']);

    res.json({
      status: 'ok',
      blocked: result.rows[0]
    });

  } catch (error) {
    console.error('[ELO] Block voter error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

module.exports = { router, initRoutes };

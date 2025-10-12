/**
 * Domain Voting Routes
 *
 * Tinder-style voting on Matthew Mauer's domain portfolio
 * Users earn USDC for voting and providing feedback
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const actionsEngine = require('../lib/actions-engine');

// Database connection (injected via initRoutes)
let db = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;
  actionsEngine.initEngine(database);
  return router;
}

/**
 * GET /api/domain-voting/card
 * Get a random domain card to vote on
 */
router.get('/card', async (req, res) => {
  try {
    const { sessionId, excludeIds = [] } = req.query;

    // Build exclusion clause
    let excludeClause = '';
    if (excludeIds.length > 0) {
      const ids = Array.isArray(excludeIds) ? excludeIds : [excludeIds];
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
      excludeClause = `WHERE domain_id NOT IN (${placeholders})`;
    }

    // Get random domain
    const result = await db.query(`
      SELECT
        domain_id,
        domain_name,
        brand_name,
        brand_tagline,
        brand_description,
        category,
        primary_color,
        secondary_color,
        logo_url,
        services,
        keywords
      FROM domain_portfolio
      ${excludeClause}
      ORDER BY RANDOM()
      LIMIT 1
    `, excludeIds.length > 0 ? excludeIds : []);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        domain: null,
        message: 'No more domains to vote on'
      });
    }

    const domain = result.rows[0];

    // Get vote stats for this domain
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total_votes,
        COUNT(*) FILTER (WHERE vote_direction = 'like') as likes,
        COUNT(*) FILTER (WHERE vote_direction = 'dislike') as dislikes
      FROM domain_votes
      WHERE domain_id = $1
    `, [domain.domain_id]);

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      domain: {
        ...domain,
        stats: {
          total_votes: parseInt(stats.total_votes),
          likes: parseInt(stats.likes),
          dislikes: parseInt(stats.dislikes),
          like_percentage: stats.total_votes > 0
            ? Math.round((stats.likes / stats.total_votes) * 100)
            : 0
        }
      }
    });

  } catch (error) {
    console.error('[Domain Voting] Get card error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/domain-voting/vote
 * Submit a vote (like/dislike) and earn USDC reward
 */
router.post('/vote', async (req, res) => {
  try {
    const {
      sessionId,
      domainId,
      voteDirection,
      walletAddress = null,
      userIp = null,
      deviceType = null,
      referrerCode = null
    } = req.body;

    if (!sessionId || !domainId || !voteDirection) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, domainId, voteDirection'
      });
    }

    if (!['like', 'dislike'].includes(voteDirection)) {
      return res.status(400).json({
        error: 'voteDirection must be "like" or "dislike"'
      });
    }

    // Check if already voted on this domain
    const existingVote = await db.query(`
      SELECT vote_id FROM domain_votes
      WHERE session_id = $1 AND domain_id = $2
    `, [sessionId, domainId]);

    if (existingVote.rows.length > 0) {
      return res.status(400).json({
        error: 'Already voted on this domain',
        voteId: existingVote.rows[0].vote_id
      });
    }

    // Insert vote
    const rewardAmount = 0.25; // $0.25 USDC per vote

    const voteResult = await db.query(`
      INSERT INTO domain_votes (
        domain_id,
        session_id,
        wallet_address,
        user_ip,
        vote_direction,
        reward_amount,
        referrer_code,
        device_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING vote_id, reward_amount, created_at
    `, [domainId, sessionId, walletAddress, userIp, voteDirection, rewardAmount, referrerCode, deviceType]);

    const vote = voteResult.rows[0];

    // Trigger action (award XP, log activity)
    // Check if session is linked to a user
    const userSession = await db.query(`
      SELECT user_id FROM user_sessions WHERE session_id = $1
    `, [sessionId]);

    if (userSession.rows.length > 0) {
      const userId = userSession.rows[0].user_id;
      try {
        await actionsEngine.voteDomain(
          userId,
          domainId,
          voteDirection,
          sessionId,
          req
        );
      } catch (actionError) {
        console.error('[Domain Voting] Action trigger error:', actionError);
        // Don't fail the vote if action triggers fails
      }
    }

    // Update referral code usage if provided
    if (referrerCode) {
      await db.query(`
        UPDATE referral_codes
        SET
          total_uses = total_uses + 1,
          total_rewards_earned = total_rewards_earned + bonus_per_referral
        WHERE referral_code = $1 AND active = TRUE
      `, [referrerCode]);
    }

    // Get total pending rewards
    const pendingResult = await db.query(`
      SELECT
        COALESCE(SUM(dv.reward_amount), 0) + COALESCE(SUM(df.reward_amount), 0) as total_pending
      FROM domain_votes dv
      LEFT JOIN domain_feedback df ON dv.session_id = df.session_id AND df.paid = FALSE
      WHERE dv.session_id = $1 AND dv.paid = FALSE
    `, [sessionId]);

    const totalPending = parseFloat(pendingResult.rows[0].total_pending);

    res.json({
      success: true,
      voteId: vote.vote_id,
      voteDirection,
      earnedThisVote: parseFloat(vote.reward_amount),
      totalPendingRewards: totalPending,
      message: `+$${rewardAmount} USDC earned!`
    });

  } catch (error) {
    console.error('[Domain Voting] Vote error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/domain-voting/feedback
 * Submit detailed feedback and earn bonus USDC
 */
router.post('/feedback', async (req, res) => {
  try {
    const {
      sessionId,
      domainId,
      voteId = null,
      feedbackText,
      feedbackCategory = 'general',
      walletAddress = null
    } = req.body;

    if (!sessionId || !domainId || !feedbackText) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, domainId, feedbackText'
      });
    }

    if (feedbackText.length < 10) {
      return res.status(400).json({
        error: 'Feedback must be at least 10 characters'
      });
    }

    // Calculate reward based on feedback quality
    const wordCount = feedbackText.trim().split(/\s+/).length;
    let rewardAmount = 2.00; // Base $2 USDC for feedback
    let qualityScore = 50;

    // Quality scoring
    if (wordCount >= 100) {
      qualityScore = 100;
      rewardAmount = 5.00;
    } else if (wordCount >= 50) {
      qualityScore = 80;
      rewardAmount = 3.50;
    } else if (wordCount >= 25) {
      qualityScore = 70;
      rewardAmount = 2.50;
    }

    // Simple spam detection
    const isSpam = /(.)\1{10,}/.test(feedbackText) || // Repeated characters
                    feedbackText.toLowerCase().includes('http') ||
                    wordCount < 5;

    if (isSpam) {
      qualityScore = 0;
      rewardAmount = 0;
    }

    // Insert feedback
    const feedbackResult = await db.query(`
      INSERT INTO domain_feedback (
        domain_id,
        vote_id,
        session_id,
        wallet_address,
        feedback_text,
        feedback_category,
        word_count,
        reward_amount,
        quality_score,
        is_spam
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING feedback_id, reward_amount, quality_score, created_at
    `, [domainId, voteId, sessionId, walletAddress, feedbackText, feedbackCategory,
        wordCount, rewardAmount, qualityScore, isSpam]);

    const feedback = feedbackResult.rows[0];

    // Trigger action (award XP, log activity)
    // Check if session is linked to a user
    const userSession = await db.query(`
      SELECT user_id FROM user_sessions WHERE session_id = $1
    `, [sessionId]);

    if (userSession.rows.length > 0 && !isSpam) {
      const userId = userSession.rows[0].user_id;
      try {
        await actionsEngine.submitFeedback(
          userId,
          domainId,
          feedbackText,
          sessionId,
          req
        );
      } catch (actionError) {
        console.error('[Domain Voting] Action trigger error:', actionError);
        // Don't fail the feedback if action triggers fails
      }
    }

    // Get total pending rewards
    const pendingResult = await db.query(`
      SELECT
        COALESCE(SUM(dv.reward_amount), 0) + COALESCE(SUM(df.reward_amount), 0) as total_pending
      FROM domain_votes dv
      LEFT JOIN domain_feedback df ON dv.session_id = df.session_id AND df.paid = FALSE
      WHERE dv.session_id = $1 AND dv.paid = FALSE
    `, [sessionId]);

    const totalPending = parseFloat(pendingResult.rows[0].total_pending);

    res.json({
      success: true,
      feedbackId: feedback.feedback_id,
      earnedThisFeedback: parseFloat(feedback.reward_amount),
      totalPendingRewards: totalPending,
      qualityScore: feedback.quality_score,
      isSpam,
      message: isSpam
        ? 'Feedback flagged as spam'
        : `+$${rewardAmount} USDC earned for quality feedback!`
    });

  } catch (error) {
    console.error('[Domain Voting] Feedback error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/domain-voting/stats
 * Get overall voting statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { domainId } = req.query;

    if (domainId) {
      // Stats for specific domain
      const result = await db.query(`
        SELECT * FROM domain_voting_leaderboard
        WHERE domain_id = $1
      `, [domainId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Domain not found' });
      }

      res.json({
        success: true,
        domain: result.rows[0]
      });
    } else {
      // Overall stats
      const leaderboardResult = await db.query(`
        SELECT * FROM domain_voting_leaderboard
        ORDER BY total_votes DESC
        LIMIT 20
      `);

      const summaryResult = await db.query(`
        SELECT * FROM payment_summary
      `);

      res.json({
        success: true,
        leaderboard: leaderboardResult.rows,
        paymentSummary: summaryResult.rows[0]
      });
    }

  } catch (error) {
    console.error('[Domain Voting] Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/domain-voting/pending-rewards/:sessionId
 * Check pending USDC rewards for a session
 */
router.get('/pending-rewards/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get vote count and rewards
    const votesResult = await db.query(`
      SELECT
        COUNT(*) as vote_count,
        SUM(reward_amount) as vote_rewards,
        wallet_address
      FROM domain_votes
      WHERE session_id = $1 AND paid = FALSE
      GROUP BY wallet_address
    `, [sessionId]);

    // Get feedback count and rewards
    const feedbackResult = await db.query(`
      SELECT
        COUNT(*) as feedback_count,
        SUM(reward_amount) as feedback_rewards
      FROM domain_feedback
      WHERE session_id = $1 AND paid = FALSE AND is_spam = FALSE
    `, [sessionId]);

    const votes = votesResult.rows[0] || { vote_count: 0, vote_rewards: 0, wallet_address: null };
    const feedback = feedbackResult.rows[0] || { feedback_count: 0, feedback_rewards: 0 };

    const totalPending = parseFloat(votes.vote_rewards || 0) + parseFloat(feedback.feedback_rewards || 0);

    res.json({
      success: true,
      sessionId,
      walletAddress: votes.wallet_address,
      totalPendingRewards: totalPending,
      breakdown: {
        votes: {
          count: parseInt(votes.vote_count),
          rewards: parseFloat(votes.vote_rewards || 0)
        },
        feedback: {
          count: parseInt(feedback.feedback_count),
          rewards: parseFloat(feedback.feedback_rewards || 0)
        }
      }
    });

  } catch (error) {
    console.error('[Domain Voting] Pending rewards error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/domain-voting/claim
 * Claim a domain for configuration/hosting
 */
router.post('/claim', async (req, res) => {
  try {
    const {
      sessionId,
      domainId,
      walletAddress,
      email = null,
      claimReason,
      proposedUse
    } = req.body;

    if (!sessionId || !domainId || !walletAddress || !claimReason) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, domainId, walletAddress, claimReason'
      });
    }

    // Check if already claimed by this wallet
    const existingClaim = await db.query(`
      SELECT claim_id, status FROM domain_claims
      WHERE domain_id = $1 AND wallet_address = $2
    `, [domainId, walletAddress]);

    if (existingClaim.rows.length > 0) {
      return res.json({
        success: true,
        claimId: existingClaim.rows[0].claim_id,
        status: existingClaim.rows[0].status,
        message: 'Domain already claimed by this wallet'
      });
    }

    // Insert claim
    const claimResult = await db.query(`
      INSERT INTO domain_claims (
        domain_id,
        wallet_address,
        session_id,
        email,
        claim_reason,
        proposed_use,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING claim_id, status, created_at
    `, [domainId, walletAddress, sessionId, email, claimReason, proposedUse]);

    const claim = claimResult.rows[0];

    res.json({
      success: true,
      claimId: claim.claim_id,
      status: claim.status,
      message: 'Domain claim submitted for review'
    });

  } catch (error) {
    console.error('[Domain Voting] Claim error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/domain-voting/referral
 * Generate referral code for a user
 */
router.post('/referral', async (req, res) => {
  try {
    const { sessionId, walletAddress = null } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    // Check if referral code already exists
    const existing = await db.query(`
      SELECT referral_code, total_uses, total_rewards_earned
      FROM referral_codes
      WHERE creator_session = $1 OR creator_wallet = $2
    `, [sessionId, walletAddress]);

    if (existing.rows.length > 0) {
      return res.json({
        success: true,
        referralCode: existing.rows[0].referral_code,
        totalUses: existing.rows[0].total_uses,
        totalEarned: parseFloat(existing.rows[0].total_rewards_earned),
        message: 'Existing referral code retrieved'
      });
    }

    // Generate new referral code
    const referralCode = `REF${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    await db.query(`
      INSERT INTO referral_codes (
        referral_code,
        creator_wallet,
        creator_session,
        bonus_per_referral
      ) VALUES ($1, $2, $3, 5.00)
    `, [referralCode, walletAddress, sessionId]);

    res.json({
      success: true,
      referralCode,
      bonusPerReferral: 5.00,
      message: 'Referral code generated'
    });

  } catch (error) {
    console.error('[Domain Voting] Referral error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/domain-voting/leaderboard
 * Get top voters/earners
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM top_voters
      LIMIT 50
    `);

    res.json({
      success: true,
      leaderboard: result.rows
    });

  } catch (error) {
    console.error('[Domain Voting] Leaderboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, initRoutes };

/**
 * CardRoastingEngine
 *
 * Teaching engineering through roasting bad designs.
 * Players vote on code patterns, learn taste through community consensus.
 *
 * Features:
 * - Vote Based/Cringe on engineering decisions
 * - Community consensus determines "correct" answer
 * - Integrates with CringeProof emoji vibe scoring
 * - ELO-style rating for players (learn taste over time)
 * - Roast cards get "burned" if community agrees
 * - Educational explanations for why something is cringe
 *
 * Usage:
 *   const roaster = new CardRoastingEngine({ cringeProofEngine, db });
 *   await roaster.submitVote(userId, cardId, 'cringe', 'This is a god object');
 *   const consensus = await roaster.getConsensus(cardId);
 */

class CardRoastingEngine {
  constructor(options = {}) {
    this.db = options.db;
    this.cringeProofEngine = options.cringeProofEngine;
    this.eloCalculator = options.eloCalculator;

    // Vote types
    this.voteTypes = {
      based: { emoji: '🔥', score: 1 },      // Good pattern
      cringe: { emoji: '💀', score: -1 },    // Bad pattern
      mid: { emoji: '😐', score: 0 }         // Neutral/context-dependent
    };

    // Consensus thresholds
    this.consensusThreshold = 0.7; // 70% agreement to "burn" a card
  }

  /**
   * Submit a vote on a card
   * @param {string} userId - Voter user ID
   * @param {string} cardId - Card being voted on
   * @param {string} voteType - 'based', 'cringe', or 'mid'
   * @param {string} roastComment - Optional roast comment
   * @returns {Promise<object>} - Vote result
   */
  async submitVote(userId, cardId, voteType, roastComment = null) {
    if (!this.db) throw new Error('Database required');

    if (!this.voteTypes[voteType]) {
      throw new Error(`Invalid vote type: ${voteType}. Must be based, cringe, or mid.`);
    }

    // Check if user already voted
    const existingVote = await this.db.query(
      'SELECT * FROM card_roast_votes WHERE user_id = $1 AND card_id = $2',
      [userId, cardId]
    );

    if (existingVote.rows.length > 0) {
      // Update existing vote
      await this.db.query(
        `UPDATE card_roast_votes
         SET vote_type = $1, roast_comment = $2, updated_at = NOW()
         WHERE user_id = $3 AND card_id = $4`,
        [voteType, roastComment, userId, cardId]
      );
    } else {
      // Insert new vote
      await this.db.query(
        `INSERT INTO card_roast_votes (user_id, card_id, vote_type, roast_comment, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [userId, cardId, voteType, roastComment]
      );
    }

    // Calculate new consensus
    const consensus = await this.calculateConsensus(cardId);

    // Check if card should be "burned" (community agrees it's cringe)
    if (consensus.verdict === 'cringe' && consensus.confidence >= this.consensusThreshold) {
      await this.burnCard(cardId, consensus);
    }

    // Update voter's taste score (ELO-style)
    if (consensus.expert_consensus) {
      await this.updateTasteScore(userId, cardId, voteType, consensus.expert_consensus);
    }

    return {
      voteType,
      consensus,
      tasteScoreChange: consensus.expert_consensus ? 'updated' : 'pending'
    };
  }

  /**
   * Calculate consensus on a card
   * @param {string} cardId - Card ID
   * @returns {Promise<object>} - Consensus data
   */
  async calculateConsensus(cardId) {
    if (!this.db) throw new Error('Database required');

    const votes = await this.db.query(
      'SELECT vote_type, COUNT(*) as count FROM card_roast_votes WHERE card_id = $1 GROUP BY vote_type',
      [cardId]
    );

    const voteCounts = {
      based: 0,
      cringe: 0,
      mid: 0
    };

    let total = 0;

    for (const row of votes.rows) {
      voteCounts[row.vote_type] = parseInt(row.count);
      total += parseInt(row.count);
    }

    if (total === 0) {
      return {
        verdict: null,
        confidence: 0,
        votes: voteCounts,
        total: 0
      };
    }

    // Calculate percentages
    const percentages = {
      based: voteCounts.based / total,
      cringe: voteCounts.cringe / total,
      mid: voteCounts.mid / total
    };

    // Determine verdict (majority vote)
    let verdict = 'mid';
    let confidence = 0;

    if (percentages.based > percentages.cringe && percentages.based > percentages.mid) {
      verdict = 'based';
      confidence = percentages.based;
    } else if (percentages.cringe > percentages.based && percentages.cringe > percentages.mid) {
      verdict = 'cringe';
      confidence = percentages.cringe;
    } else {
      confidence = percentages.mid;
    }

    // Get CringeProof score if available
    let cringeProofScore = null;
    if (this.cringeProofEngine) {
      try {
        const card = await this.getCard(cardId);
        cringeProofScore = await this.cringeProofEngine.scorePattern({
          pattern: card.prompt,
          example: card.response,
          metadata: card.metadata
        });
      } catch (err) {
        console.warn('[CardRoastingEngine] CringeProof unavailable:', err.message);
      }
    }

    // Get expert consensus (from users with high taste scores)
    const expertConsensus = await this.getExpertConsensus(cardId);

    return {
      verdict,
      confidence,
      votes: voteCounts,
      percentages,
      total,
      cringeProofScore,
      expert_consensus: expertConsensus
    };
  }

  /**
   * Get card data
   * @param {string} cardId - Card ID
   * @returns {Promise<object>} - Card data
   */
  async getCard(cardId) {
    if (!this.db) throw new Error('Database required');

    const result = await this.db.query(
      'SELECT * FROM card_collection WHERE card_id = $1 LIMIT 1',
      [cardId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get expert consensus (votes from high-reputation users)
   * @param {string} cardId - Card ID
   * @returns {Promise<string>} - Expert verdict
   */
  async getExpertConsensus(cardId) {
    if (!this.db) return null;

    // Get votes from users with taste_score > 1500 (expert level)
    const expertVotes = await this.db.query(
      `SELECT v.vote_type, COUNT(*) as count
       FROM card_roast_votes v
       JOIN user_taste_scores u ON v.user_id = u.user_id
       WHERE v.card_id = $1 AND u.taste_score > 1500
       GROUP BY v.vote_type
       ORDER BY count DESC
       LIMIT 1`,
      [cardId]
    );

    return expertVotes.rows.length > 0 ? expertVotes.rows[0].vote_type : null;
  }

  /**
   * Burn a card (mark as community-approved cringe)
   * @param {string} cardId - Card to burn
   * @param {object} consensus - Consensus data
   */
  async burnCard(cardId, consensus) {
    if (!this.db) return;

    await this.db.query(
      `UPDATE card_collection
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{burned}',
         'true'::jsonb
       )
       WHERE card_id = $1`,
      [cardId]
    );

    // Log burn event
    await this.db.query(
      `INSERT INTO card_burn_events (card_id, verdict, confidence, votes, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [cardId, consensus.verdict, consensus.confidence, JSON.stringify(consensus.votes)]
    );

    console.log(`[CardRoastingEngine] Card burned: ${cardId} (${consensus.confidence * 100}% cringe)`);
  }

  /**
   * Update user's taste score based on vote accuracy
   * @param {string} userId - User ID
   * @param {string} cardId - Card ID
   * @param {string} userVote - User's vote
   * @param {string} expertConsensus - Expert consensus
   */
  async updateTasteScore(userId, cardId, userVote, expertConsensus) {
    if (!this.db || !this.eloCalculator) return;

    // Get current taste score
    const currentScore = await this.db.query(
      'SELECT taste_score FROM user_taste_scores WHERE user_id = $1',
      [userId]
    );

    const score = currentScore.rows.length > 0 ? currentScore.rows[0].taste_score : 1200;

    // Calculate ELO change
    const correct = userVote === expertConsensus;
    const delta = this.eloCalculator.calculateDelta({
      playerRating: score,
      opponentRating: 1600, // Expert baseline
      outcome: correct ? 1 : 0,
      kFactor: 32
    });

    const newScore = score + delta;

    // Update or insert taste score
    await this.db.query(
      `INSERT INTO user_taste_scores (user_id, taste_score, votes_cast, correct_votes, updated_at)
       VALUES ($1, $2, 1, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         taste_score = $2,
         votes_cast = user_taste_scores.votes_cast + 1,
         correct_votes = user_taste_scores.correct_votes + $3,
         updated_at = NOW()`,
      [userId, newScore, correct ? 1 : 0]
    );

    console.log(`[CardRoastingEngine] Taste score updated: ${userId} ${score} → ${newScore} (${correct ? '✓' : '✗'})`);
  }

  /**
   * Get roast leaderboard (best roasters)
   * @param {number} limit - Top N users
   * @returns {Promise<Array>} - Leaderboard
   */
  async getRoastLeaderboard(limit = 10) {
    if (!this.db) return [];

    const result = await this.db.query(
      `SELECT
        user_id,
        taste_score,
        votes_cast,
        correct_votes,
        CASE
          WHEN votes_cast > 0 THEN (correct_votes::float / votes_cast::float * 100)
          ELSE 0
        END as accuracy
      FROM user_taste_scores
      ORDER BY taste_score DESC
      LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Get top roasts (funniest/best comments)
   * @param {number} limit - Top N roasts
   * @returns {Promise<Array>} - Top roasts
   */
  async getTopRoasts(limit = 10) {
    if (!this.db) return [];

    const result = await this.db.query(
      `SELECT
        v.card_id,
        v.roast_comment,
        v.vote_type,
        v.created_at,
        v.user_id,
        COUNT(l.id) as likes
      FROM card_roast_votes v
      LEFT JOIN roast_likes l ON v.id = l.vote_id
      WHERE v.roast_comment IS NOT NULL
      GROUP BY v.id, v.card_id, v.roast_comment, v.vote_type, v.created_at, v.user_id
      ORDER BY likes DESC, v.created_at DESC
      LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Like a roast comment
   * @param {string} userId - User liking
   * @param {number} voteId - Vote ID
   */
  async likeRoast(userId, voteId) {
    if (!this.db) return;

    await this.db.query(
      `INSERT INTO roast_likes (user_id, vote_id, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, vote_id) DO NOTHING`,
      [userId, voteId]
    );
  }

  /**
   * Get educational explanation for a pattern
   * @param {string} cardId - Card ID
   * @returns {Promise<string>} - Explanation
   */
  async getEducationalExplanation(cardId) {
    const card = await this.getCard(cardId);
    const consensus = await this.calculateConsensus(cardId);

    if (!card) return null;

    // Use AI to generate explanation (if available)
    if (this.cringeProofEngine && this.cringeProofEngine.anthropic) {
      try {
        const message = await this.cringeProofEngine.anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `Explain why this engineering pattern is ${consensus.verdict}:

Pattern: ${card.prompt}
Example: ${card.response}

Keep it educational, Gen Z friendly, and under 100 words.`
          }]
        });

        return message.content[0].text;
      } catch (err) {
        console.warn('[CardRoastingEngine] AI explanation failed:', err.message);
      }
    }

    return null;
  }
}

module.exports = CardRoastingEngine;

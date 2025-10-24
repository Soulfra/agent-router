/**
 * Reputation Engine
 *
 * Extends Cal tracking with clout/karma/reputation system for talent marketplace.
 * Solves: "gain clout and followers... activity and interaction to make sure they're good"
 *
 * Features:
 * - Karma scoring from GitHub activity
 * - Badge progression (Newcomer → Contributor → Veteran → Legend)
 * - Trust score calculation
 * - Follower/following system
 * - Activity feed scoring
 * - Collaboration reputation
 * - Skill verification through actions
 *
 * Integrates with:
 * - User Playstyle Tracker (existing)
 * - User Tree Counter (milestone progress)
 * - GitHub Activity Feed (actions/events)
 *
 * Badge Tiers (from TALENT_MARKETPLACE_GUIDE.md):
 * - Newcomer 👤: Just joined
 * - Contributor ✓: 10 votes, 0.3 trust
 * - Veteran ⭐: 200 votes, 30 days, 0.75 trust
 * - Legend 👑: 1000 votes, 90 days, 0.9 trust
 */

const { Pool } = require('pg');
const UserPlaystyleTracker = require('./user-playstyle-tracker');
const UserTreeCounter = require('./user-tree-counter');

class ReputationEngine {
  constructor(config = {}) {
    this.pool = config.pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });

    this.playstyleTracker = config.playstyleTracker || new UserPlaystyleTracker(config);
    this.treeCounter = config.treeCounter || new UserTreeCounter(config);

    // Badge thresholds
    this.badges = {
      newcomer: {
        icon: '👤',
        name: 'Newcomer',
        requirements: {},
        unlocks: 'Basic access'
      },
      contributor: {
        icon: '✓',
        name: 'Contributor',
        requirements: {
          karma: 10,
          trustScore: 0.3
        },
        unlocks: 'Visible to recruiters'
      },
      veteran: {
        icon: '⭐',
        name: 'Veteran',
        requirements: {
          karma: 200,
          daysSinceJoin: 30,
          trustScore: 0.75
        },
        unlocks: 'Featured profile'
      },
      legend: {
        icon: '👑',
        name: 'Legend',
        requirements: {
          karma: 1000,
          daysSinceJoin: 90,
          trustScore: 0.9
        },
        unlocks: 'Elite recruiter access'
      }
    };

    console.log('[ReputationEngine] Initialized');
  }

  /**
   * Get user reputation profile
   *
   * @param {string} userId
   * @returns {Object} Reputation profile
   */
  async getReputationProfile(userId) {
    try {
      // Get or create reputation profile
      let result = await this.pool.query(`
        SELECT * FROM user_reputation WHERE user_id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        // Create new profile
        await this.pool.query(`
          INSERT INTO user_reputation (
            user_id,
            karma,
            trust_score,
            joined_at,
            last_activity,
            badge
          ) VALUES ($1, 0, 0.5, NOW(), NOW(), 'newcomer')
        `, [userId]);

        result = await this.pool.query(`
          SELECT * FROM user_reputation WHERE user_id = $1
        `, [userId]);
      }

      const rep = result.rows[0];

      // Calculate current badge
      const badge = await this._calculateBadge(rep);

      // Get follower counts
      const followers = await this.getFollowerCount(userId);

      return {
        userId: rep.user_id,
        karma: rep.karma,
        trustScore: rep.trust_score,
        badge: badge,
        followers: followers.followerCount,
        following: followers.followingCount,
        joinedAt: rep.joined_at,
        lastActivity: rep.last_activity,
        reputation: rep.reputation_breakdown || {},
        achievements: rep.achievements || []
      };

    } catch (error) {
      console.error('[ReputationEngine] Error getting reputation:', error);
      throw error;
    }
  }

  /**
   * Award karma for action
   *
   * @param {string} userId
   * @param {Object} action
   * @param {string} action.type - Action type (commit, pr, issue, comment, etc.)
   * @param {number} action.value - Karma value (optional, auto-calculated if not provided)
   * @param {Object} action.metadata - Additional context
   * @returns {Object} Updated reputation
   */
  async awardKarma(userId, action) {
    try {
      const { type, value, metadata = {} } = action;

      // Calculate karma value based on action type
      const karmaValue = value || this._calculateKarmaValue(type, metadata);

      // Record karma transaction
      await this.pool.query(`
        INSERT INTO karma_transactions (
          user_id,
          action_type,
          karma_value,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [userId, type, karmaValue, JSON.stringify(metadata)]);

      // Update total karma
      await this.pool.query(`
        UPDATE user_reputation
        SET karma = karma + $1,
            last_activity = NOW()
        WHERE user_id = $2
      `, [karmaValue, userId]);

      // Recalculate trust score
      await this._recalculateTrustScore(userId);

      // Check badge upgrades
      const rep = await this.getReputationProfile(userId);

      console.log(`[ReputationEngine] Awarded ${karmaValue} karma to ${userId} for ${type}`);

      return rep;

    } catch (error) {
      console.error('[ReputationEngine] Error awarding karma:', error);
      throw error;
    }
  }

  /**
   * Calculate trust score
   * Trust = (ForumKarma * 0.3) + (LearningProgress * 0.2) + (Collaboration * 0.1) +
   *         (ContributionQuality * 0.1) + (Consistency * 0.3)
   *
   * @param {string} userId
   * @returns {number} Trust score (0-1)
   */
  async calculateTrustScore(userId) {
    try {
      // Get karma score (normalized 0-1)
      const karmaResult = await this.pool.query(`
        SELECT karma FROM user_reputation WHERE user_id = $1
      `, [userId]);

      const karma = karmaResult.rows[0]?.karma || 0;
      const karmaScore = Math.min(karma / 1000, 1.0); // Max at 1000 karma

      // Get learning progress (from tree counter)
      const trees = await this.treeCounter.getAllProgress(userId);
      const learningScore = trees.length > 0
        ? trees.reduce((sum, t) => sum + (t.completion_rate || 0), 0) / trees.length
        : 0;

      // Get collaboration score (from karma transactions)
      const collabResult = await this.pool.query(`
        SELECT COUNT(*) as count
        FROM karma_transactions
        WHERE user_id = $1
          AND action_type IN ('pr_merged', 'code_review', 'pair_programming')
          AND created_at > NOW() - INTERVAL '90 days'
      `, [userId]);

      const collabCount = parseInt(collabResult.rows[0].count);
      const collabScore = Math.min(collabCount / 20, 1.0); // Max at 20 collabs

      // Get contribution quality (avg karma per contribution)
      const qualityResult = await this.pool.query(`
        SELECT AVG(karma_value) as avg_karma
        FROM karma_transactions
        WHERE user_id = $1
          AND action_type IN ('commit', 'pr_merged', 'issue_closed')
          AND created_at > NOW() - INTERVAL '90 days'
      `, [userId]);

      const avgKarma = parseFloat(qualityResult.rows[0]?.avg_karma || 0);
      const qualityScore = Math.min(avgKarma / 10, 1.0); // Max at 10 avg karma

      // Get consistency score (days active in last 90 days)
      const consistencyResult = await this.pool.query(`
        SELECT COUNT(DISTINCT DATE(created_at)) as active_days
        FROM karma_transactions
        WHERE user_id = $1
          AND created_at > NOW() - INTERVAL '90 days'
      `, [userId]);

      const activeDays = parseInt(consistencyResult.rows[0].active_days);
      const consistencyScore = Math.min(activeDays / 60, 1.0); // Max at 60 days

      // Weighted trust score
      const trustScore =
        (karmaScore * 0.3) +
        (learningScore * 0.2) +
        (collabScore * 0.1) +
        (qualityScore * 0.1) +
        (consistencyScore * 0.3);

      return Math.min(Math.max(trustScore, 0), 1.0); // Clamp 0-1

    } catch (error) {
      console.error('[ReputationEngine] Error calculating trust score:', error);
      return 0.5; // Default trust
    }
  }

  /**
   * Follow user
   *
   * @param {string} followerId - User doing the following
   * @param {string} followeeId - User being followed
   * @returns {Object} Follow relationship
   */
  async followUser(followerId, followeeId) {
    try {
      if (followerId === followeeId) {
        throw new Error('Cannot follow yourself');
      }

      const result = await this.pool.query(`
        INSERT INTO user_followers (
          follower_id,
          followee_id,
          created_at
        ) VALUES ($1, $2, NOW())
        ON CONFLICT (follower_id, followee_id) DO NOTHING
        RETURNING *
      `, [followerId, followeeId]);

      if (result.rows.length > 0) {
        console.log(`[ReputationEngine] ${followerId} followed ${followeeId}`);
      }

      return result.rows[0];

    } catch (error) {
      console.error('[ReputationEngine] Error following user:', error);
      throw error;
    }
  }

  /**
   * Unfollow user
   *
   * @param {string} followerId
   * @param {string} followeeId
   * @returns {boolean} Success
   */
  async unfollowUser(followerId, followeeId) {
    try {
      const result = await this.pool.query(`
        DELETE FROM user_followers
        WHERE follower_id = $1 AND followee_id = $2
      `, [followerId, followeeId]);

      console.log(`[ReputationEngine] ${followerId} unfollowed ${followeeId}`);

      return result.rowCount > 0;

    } catch (error) {
      console.error('[ReputationEngine] Error unfollowing user:', error);
      throw error;
    }
  }

  /**
   * Get follower/following counts
   *
   * @param {string} userId
   * @returns {Object} Counts
   */
  async getFollowerCount(userId) {
    try {
      const result = await this.pool.query(`
        SELECT
          (SELECT COUNT(*) FROM user_followers WHERE followee_id = $1) as follower_count,
          (SELECT COUNT(*) FROM user_followers WHERE follower_id = $1) as following_count
      `, [userId]);

      return {
        followerCount: parseInt(result.rows[0].follower_count),
        followingCount: parseInt(result.rows[0].following_count)
      };

    } catch (error) {
      console.error('[ReputationEngine] Error getting follower count:', error);
      return { followerCount: 0, followingCount: 0 };
    }
  }

  /**
   * Get followers
   *
   * @param {string} userId
   * @returns {Array} Followers
   */
  async getFollowers(userId) {
    try {
      const result = await this.pool.query(`
        SELECT
          f.follower_id as user_id,
          f.created_at,
          r.karma,
          r.trust_score,
          r.badge
        FROM user_followers f
        LEFT JOIN user_reputation r ON f.follower_id = r.user_id
        WHERE f.followee_id = $1
        ORDER BY f.created_at DESC
      `, [userId]);

      return result.rows;

    } catch (error) {
      console.error('[ReputationEngine] Error getting followers:', error);
      return [];
    }
  }

  /**
   * Get following
   *
   * @param {string} userId
   * @returns {Array} Following
   */
  async getFollowing(userId) {
    try {
      const result = await this.pool.query(`
        SELECT
          f.followee_id as user_id,
          f.created_at,
          r.karma,
          r.trust_score,
          r.badge
        FROM user_followers f
        LEFT JOIN user_reputation r ON f.followee_id = r.user_id
        WHERE f.follower_id = $1
        ORDER BY f.created_at DESC
      `, [userId]);

      return result.rows;

    } catch (error) {
      console.error('[ReputationEngine] Error getting following:', error);
      return [];
    }
  }

  /**
   * Get karma leaderboard
   *
   * @param {Object} options
   * @param {number} options.limit - Number of users (default: 50)
   * @param {string} options.badge - Filter by badge
   * @returns {Array} Leaderboard
   */
  async getLeaderboard(options = {}) {
    try {
      const { limit = 50, badge = null } = options;

      const conditions = [];
      const values = [limit];
      let paramIndex = 2;

      if (badge) {
        conditions.push(`badge = $${paramIndex}`);
        values.push(badge);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await this.pool.query(`
        SELECT
          user_id,
          karma,
          trust_score,
          badge,
          joined_at,
          (SELECT COUNT(*) FROM user_followers WHERE followee_id = user_reputation.user_id) as follower_count
        FROM user_reputation
        ${whereClause}
        ORDER BY karma DESC, trust_score DESC
        LIMIT $1
      `, values);

      return result.rows.map((r, idx) => ({
        rank: idx + 1,
        userId: r.user_id,
        karma: r.karma,
        trustScore: r.trust_score,
        badge: r.badge,
        followers: parseInt(r.follower_count),
        joinedAt: r.joined_at
      }));

    } catch (error) {
      console.error('[ReputationEngine] Error getting leaderboard:', error);
      return [];
    }
  }

  /**
   * Get karma history
   *
   * @param {string} userId
   * @param {Object} options
   * @param {Date} options.startDate
   * @param {Date} options.endDate
   * @param {number} options.limit
   * @returns {Array} Karma transactions
   */
  async getKarmaHistory(userId, options = {}) {
    try {
      const { startDate, endDate, limit = 100 } = options;

      const conditions = ['user_id = $1'];
      const values = [userId];
      let paramIndex = 2;

      if (startDate) {
        conditions.push(`created_at >= $${paramIndex}`);
        values.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        conditions.push(`created_at <= $${paramIndex}`);
        values.push(endDate);
        paramIndex++;
      }

      values.push(limit);

      const result = await this.pool.query(`
        SELECT
          action_type,
          karma_value,
          metadata,
          created_at
        FROM karma_transactions
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${paramIndex}
      `, values);

      return result.rows;

    } catch (error) {
      console.error('[ReputationEngine] Error getting karma history:', error);
      return [];
    }
  }

  /**
   * Calculate karma value for action type
   * @private
   */
  _calculateKarmaValue(actionType, metadata = {}) {
    const karmaValues = {
      // GitHub actions
      commit: 1,
      pr_opened: 3,
      pr_merged: 10,
      pr_reviewed: 2,
      issue_opened: 2,
      issue_closed: 5,
      code_review: 3,

      // Learning actions
      milestone_completed: 5,
      tutorial_completed: 3,
      certification: 20,

      // Community actions
      helpful_comment: 2,
      answer_accepted: 10,
      question_upvoted: 1,

      // Collaboration
      pair_programming: 5,
      mentoring: 10,

      // Marketplace actions
      idea_purchased: 5,
      idea_upvoted: 1
    };

    let baseValue = karmaValues[actionType] || 1;

    // Apply multipliers based on metadata
    if (metadata.quality === 'high') {
      baseValue *= 1.5;
    }

    if (metadata.firstTime) {
      baseValue *= 2;
    }

    return Math.round(baseValue);
  }

  /**
   * Recalculate trust score
   * @private
   */
  async _recalculateTrustScore(userId) {
    try {
      const trustScore = await this.calculateTrustScore(userId);

      await this.pool.query(`
        UPDATE user_reputation
        SET trust_score = $1
        WHERE user_id = $2
      `, [trustScore, userId]);

      return trustScore;

    } catch (error) {
      console.error('[ReputationEngine] Error recalculating trust:', error);
      return null;
    }
  }

  /**
   * Calculate current badge based on reputation
   * @private
   */
  async _calculateBadge(reputation) {
    const daysSinceJoin = Math.floor(
      (Date.now() - new Date(reputation.joined_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check legend
    if (
      reputation.karma >= this.badges.legend.requirements.karma &&
      daysSinceJoin >= this.badges.legend.requirements.daysSinceJoin &&
      reputation.trust_score >= this.badges.legend.requirements.trustScore
    ) {
      return {
        ...this.badges.legend,
        level: 'legend'
      };
    }

    // Check veteran
    if (
      reputation.karma >= this.badges.veteran.requirements.karma &&
      daysSinceJoin >= this.badges.veteran.requirements.daysSinceJoin &&
      reputation.trust_score >= this.badges.veteran.requirements.trustScore
    ) {
      return {
        ...this.badges.veteran,
        level: 'veteran'
      };
    }

    // Check contributor
    if (
      reputation.karma >= this.badges.contributor.requirements.karma &&
      reputation.trust_score >= this.badges.contributor.requirements.trustScore
    ) {
      return {
        ...this.badges.contributor,
        level: 'contributor'
      };
    }

    // Default: newcomer
    return {
      ...this.badges.newcomer,
      level: 'newcomer'
    };
  }
}

module.exports = ReputationEngine;

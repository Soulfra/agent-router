/**
 * GitHub Activity Feed
 *
 * Twitter-like feed for GitHub activity.
 * Solves: "make our own twitter but for github activity... making the github nice like a profile"
 *
 * Features:
 * - Feed of GitHub actions (commits, PRs, repos, stars)
 * - Social interactions (like, comment, repost)
 * - Follow users to see their activity
 * - Trending activity
 * - Activity scoring and karma integration
 * - Rich cards for different action types
 * - Real-time updates via webhooks
 *
 * Use Cases:
 * - See follower's latest commits/PRs
 * - Celebrate milestones publicly
 * - Comment on someone's PR
 * - Like impressive commits
 * - Discover trending repos/projects
 */

const { Pool } = require('pg');
const ReputationEngine = require('./reputation-engine');

class GitHubActivityFeed {
  constructor(config = {}) {
    this.pool = config.pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });

    this.reputationEngine = config.reputationEngine || new ReputationEngine(config);

    // Activity types
    this.activityTypes = {
      commit: { icon: '📝', karma: 1, display: 'committed to' },
      pr_opened: { icon: '🔀', karma: 3, display: 'opened PR' },
      pr_merged: { icon: '✅', karma: 10, display: 'merged PR' },
      pr_closed: { icon: '❌', karma: 2, display: 'closed PR' },
      issue_opened: { icon: '🐛', karma: 2, display: 'opened issue' },
      issue_closed: { icon: '🎯', karma: 5, display: 'closed issue' },
      repo_created: { icon: '🎉', karma: 5, display: 'created repo' },
      repo_starred: { icon: '⭐', karma: 1, display: 'starred' },
      repo_forked: { icon: '🍴', karma: 2, display: 'forked' },
      release_published: { icon: '🚀', karma: 15, display: 'published release' },
      code_review: { icon: '👀', karma: 3, display: 'reviewed code in' }
    };

    console.log('[GitHubActivityFeed] Initialized');
  }

  /**
   * Post activity to feed
   *
   * @param {Object} data
   * @param {string} data.userId - User who performed action
   * @param {string} data.activityType - Type of activity (commit, pr_opened, etc.)
   * @param {Object} data.content - Activity content
   * @param {string} data.content.repo - Repository name
   * @param {string} data.content.title - Title (PR title, commit message, etc.)
   * @param {string} data.content.url - GitHub URL
   * @param {Object} data.metadata - Additional metadata
   * @returns {Object} Activity post
   */
  async postActivity(data) {
    try {
      const {
        userId,
        activityType,
        content,
        metadata = {}
      } = data;

      if (!userId || !activityType || !content) {
        throw new Error('userId, activityType, and content are required');
      }

      if (!this.activityTypes[activityType]) {
        throw new Error(`Unknown activity type: ${activityType}`);
      }

      // Create activity post
      const result = await this.pool.query(`
        INSERT INTO github_activity_feed (
          user_id,
          activity_type,
          content,
          metadata,
          like_count,
          comment_count,
          repost_count,
          created_at
        ) VALUES ($1, $2, $3, $4, 0, 0, 0, NOW())
        RETURNING *
      `, [
        userId,
        activityType,
        JSON.stringify(content),
        JSON.stringify(metadata)
      ]);

      const activity = result.rows[0];

      // Award karma for activity
      const karmaValue = this.activityTypes[activityType].karma;
      await this.reputationEngine.awardKarma(userId, {
        type: activityType,
        value: karmaValue,
        metadata: { activityId: activity.id, ...metadata }
      });

      console.log(`[GitHubActivityFeed] Posted activity: ${userId} ${activityType}`);

      return this._formatActivity(activity);

    } catch (error) {
      console.error('[GitHubActivityFeed] Error posting activity:', error);
      throw error;
    }
  }

  /**
   * Get feed for user (shows following + own activity)
   *
   * @param {string} userId
   * @param {Object} options
   * @param {number} options.limit - Max items (default: 50)
   * @param {number} options.offset - Pagination offset
   * @param {Date} options.since - Only show activity after this date
   * @returns {Array} Feed items
   */
  async getFeed(userId, options = {}) {
    try {
      const { limit = 50, offset = 0, since = null } = options;

      const conditions = [];
      const values = [userId];
      let paramIndex = 2;

      if (since) {
        conditions.push(`a.created_at >= $${paramIndex}`);
        values.push(since);
        paramIndex++;
      }

      const whereClause = conditions.length > 0
        ? `AND ${conditions.join(' AND ')}`
        : '';

      values.push(limit, offset);

      // Get activity from followed users + own activity
      const result = await this.pool.query(`
        SELECT a.*
        FROM github_activity_feed a
        WHERE (
          -- Own activity
          a.user_id = $1
          OR
          -- Following activity
          a.user_id IN (
            SELECT followee_id
            FROM user_followers
            WHERE follower_id = $1
          )
        )
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, values);

      const activities = [];

      for (const row of result.rows) {
        // Check if user has liked/reposted
        const interactions = await this._getUserInteractions(row.id, userId);
        activities.push(this._formatActivity(row, interactions));
      }

      return activities;

    } catch (error) {
      console.error('[GitHubActivityFeed] Error getting feed:', error);
      return [];
    }
  }

  /**
   * Get user's activity timeline
   *
   * @param {string} userId
   * @param {Object} options
   * @param {number} options.limit
   * @param {number} options.offset
   * @returns {Array} Activities
   */
  async getUserTimeline(userId, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      const result = await this.pool.query(`
        SELECT *
        FROM github_activity_feed
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);

      return result.rows.map(row => this._formatActivity(row));

    } catch (error) {
      console.error('[GitHubActivityFeed] Error getting timeline:', error);
      return [];
    }
  }

  /**
   * Like activity
   *
   * @param {number} activityId
   * @param {string} userId
   * @returns {Object} Updated activity
   */
  async likeActivity(activityId, userId) {
    try {
      // Check if already liked
      const existing = await this.pool.query(`
        SELECT * FROM activity_likes
        WHERE activity_id = $1 AND user_id = $2
      `, [activityId, userId]);

      if (existing.rows.length > 0) {
        throw new Error('Already liked this activity');
      }

      // Record like
      await this.pool.query(`
        INSERT INTO activity_likes (
          activity_id,
          user_id,
          created_at
        ) VALUES ($1, $2, NOW())
      `, [activityId, userId]);

      // Update like count
      await this.pool.query(`
        UPDATE github_activity_feed
        SET like_count = like_count + 1
        WHERE id = $1
      `, [activityId]);

      // Get activity creator and award karma
      const activityResult = await this.pool.query(`
        SELECT user_id FROM github_activity_feed WHERE id = $1
      `, [activityId]);

      if (activityResult.rows.length > 0) {
        await this.reputationEngine.awardKarma(activityResult.rows[0].user_id, {
          type: 'activity_liked',
          value: 1,
          metadata: { activityId, likerId: userId }
        });
      }

      console.log(`[GitHubActivityFeed] Activity ${activityId} liked by ${userId}`);

      return await this.getActivity(activityId, userId);

    } catch (error) {
      console.error('[GitHubActivityFeed] Error liking activity:', error);
      throw error;
    }
  }

  /**
   * Unlike activity
   *
   * @param {number} activityId
   * @param {string} userId
   * @returns {boolean} Success
   */
  async unlikeActivity(activityId, userId) {
    try {
      const result = await this.pool.query(`
        DELETE FROM activity_likes
        WHERE activity_id = $1 AND user_id = $2
      `, [activityId, userId]);

      if (result.rowCount > 0) {
        // Update like count
        await this.pool.query(`
          UPDATE github_activity_feed
          SET like_count = GREATEST(like_count - 1, 0)
          WHERE id = $1
        `, [activityId]);
      }

      return result.rowCount > 0;

    } catch (error) {
      console.error('[GitHubActivityFeed] Error unliking activity:', error);
      throw error;
    }
  }

  /**
   * Comment on activity
   *
   * @param {number} activityId
   * @param {string} userId
   * @param {string} comment
   * @returns {Object} Created comment
   */
  async commentOnActivity(activityId, userId, comment) {
    try {
      if (!comment || comment.trim().length === 0) {
        throw new Error('Comment cannot be empty');
      }

      // Create comment
      const result = await this.pool.query(`
        INSERT INTO activity_comments (
          activity_id,
          user_id,
          comment,
          created_at
        ) VALUES ($1, $2, $3, NOW())
        RETURNING *
      `, [activityId, userId, comment.trim()]);

      const commentRow = result.rows[0];

      // Update comment count
      await this.pool.query(`
        UPDATE github_activity_feed
        SET comment_count = comment_count + 1
        WHERE id = $1
      `, [activityId]);

      // Get activity creator and award karma
      const activityResult = await this.pool.query(`
        SELECT user_id FROM github_activity_feed WHERE id = $1
      `, [activityId]);

      if (activityResult.rows.length > 0) {
        await this.reputationEngine.awardKarma(activityResult.rows[0].user_id, {
          type: 'activity_commented',
          value: 2,
          metadata: { activityId, commenterId: userId }
        });
      }

      console.log(`[GitHubActivityFeed] Comment added to activity ${activityId}`);

      return {
        id: commentRow.id,
        activityId: commentRow.activity_id,
        userId: commentRow.user_id,
        comment: commentRow.comment,
        createdAt: commentRow.created_at
      };

    } catch (error) {
      console.error('[GitHubActivityFeed] Error commenting:', error);
      throw error;
    }
  }

  /**
   * Get comments for activity
   *
   * @param {number} activityId
   * @returns {Array} Comments
   */
  async getComments(activityId) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM activity_comments
        WHERE activity_id = $1
        ORDER BY created_at ASC
      `, [activityId]);

      return result.rows.map(row => ({
        id: row.id,
        activityId: row.activity_id,
        userId: row.user_id,
        comment: row.comment,
        createdAt: row.created_at
      }));

    } catch (error) {
      console.error('[GitHubActivityFeed] Error getting comments:', error);
      return [];
    }
  }

  /**
   * Repost activity
   *
   * @param {number} activityId
   * @param {string} userId
   * @param {string} comment - Optional comment (like retweet with comment)
   * @returns {Object} Repost
   */
  async repostActivity(activityId, userId, comment = null) {
    try {
      // Check if already reposted
      const existing = await this.pool.query(`
        SELECT * FROM activity_reposts
        WHERE activity_id = $1 AND user_id = $2
      `, [activityId, userId]);

      if (existing.rows.length > 0) {
        throw new Error('Already reposted this activity');
      }

      // Create repost
      const result = await this.pool.query(`
        INSERT INTO activity_reposts (
          activity_id,
          user_id,
          comment,
          created_at
        ) VALUES ($1, $2, $3, NOW())
        RETURNING *
      `, [activityId, userId, comment]);

      const repost = result.rows[0];

      // Update repost count
      await this.pool.query(`
        UPDATE github_activity_feed
        SET repost_count = repost_count + 1
        WHERE id = $1
      `, [activityId]);

      // Get activity creator and award karma
      const activityResult = await this.pool.query(`
        SELECT user_id FROM github_activity_feed WHERE id = $1
      `, [activityId]);

      if (activityResult.rows.length > 0) {
        await this.reputationEngine.awardKarma(activityResult.rows[0].user_id, {
          type: 'activity_reposted',
          value: 3,
          metadata: { activityId, reposterId: userId }
        });
      }

      console.log(`[GitHubActivityFeed] Activity ${activityId} reposted by ${userId}`);

      return repost;

    } catch (error) {
      console.error('[GitHubActivityFeed] Error reposting:', error);
      throw error;
    }
  }

  /**
   * Get trending activity
   *
   * @param {Object} options
   * @param {string} options.timeframe - 'day', 'week', 'month'
   * @param {number} options.limit
   * @returns {Array} Trending activities
   */
  async getTrending(options = {}) {
    try {
      const { timeframe = 'week', limit = 20 } = options;

      let interval = '7 days';
      if (timeframe === 'day') interval = '1 day';
      if (timeframe === 'month') interval = '30 days';

      // Trending score = likes + (comments * 2) + (reposts * 3)
      const result = await this.pool.query(`
        SELECT
          *,
          (like_count + (comment_count * 2) + (repost_count * 3)) as trending_score
        FROM github_activity_feed
        WHERE created_at > NOW() - INTERVAL '${interval}'
        ORDER BY trending_score DESC, created_at DESC
        LIMIT $1
      `, [limit]);

      return result.rows.map(row => this._formatActivity(row));

    } catch (error) {
      console.error('[GitHubActivityFeed] Error getting trending:', error);
      return [];
    }
  }

  /**
   * Get activity by ID
   *
   * @param {number} activityId
   * @param {string} userId - Current user (to check interactions)
   * @returns {Object} Activity
   */
  async getActivity(activityId, userId = null) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM github_activity_feed WHERE id = $1
      `, [activityId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      let interactions = {};
      if (userId) {
        interactions = await this._getUserInteractions(activityId, userId);
      }

      return this._formatActivity(row, interactions);

    } catch (error) {
      console.error('[GitHubActivityFeed] Error getting activity:', error);
      return null;
    }
  }

  /**
   * Get user interactions with activity
   * @private
   */
  async _getUserInteractions(activityId, userId) {
    try {
      const [liked, reposted] = await Promise.all([
        this.pool.query(`
          SELECT id FROM activity_likes
          WHERE activity_id = $1 AND user_id = $2
        `, [activityId, userId]),

        this.pool.query(`
          SELECT id FROM activity_reposts
          WHERE activity_id = $1 AND user_id = $2
        `, [activityId, userId])
      ]);

      return {
        hasLiked: liked.rows.length > 0,
        hasReposted: reposted.rows.length > 0
      };

    } catch (error) {
      console.error('[GitHubActivityFeed] Error getting interactions:', error);
      return { hasLiked: false, hasReposted: false };
    }
  }

  /**
   * Format activity for output
   * @private
   */
  _formatActivity(row, interactions = {}) {
    const activityInfo = this.activityTypes[row.activity_type] || {};

    return {
      id: row.id,
      userId: row.user_id,
      activityType: row.activity_type,
      icon: activityInfo.icon || '📌',
      display: activityInfo.display || row.activity_type,
      content: row.content,
      metadata: row.metadata,
      likeCount: row.like_count,
      commentCount: row.comment_count,
      repostCount: row.repost_count,
      createdAt: row.created_at,
      hasLiked: interactions.hasLiked || false,
      hasReposted: interactions.hasReposted || false
    };
  }
}

module.exports = GitHubActivityFeed;

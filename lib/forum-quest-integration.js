/**
 * Forum Quest Integration
 *
 * Bridges the forum system (content-forum.js, lore-bot-generator.js) with quests.
 * Tracks discussion participation and unlocks features based on engagement.
 *
 * Features:
 * - Track forum posts as quest progress
 * - Quality scoring (upvotes, comments, engagement)
 * - Discussion achievements
 * - Unlock apps/features through forum participation
 *
 * Integrates with:
 * - quest-engine.js (quest progress tracking)
 * - lib/content-forum.js (if exists) or lore bot system
 * - database/migrations/100_game_lore_system.sql (forum discussions)
 *
 * Usage:
 *   const integration = new ForumQuestIntegration({ db, questEngine });
 *   await integration.trackPostCreated(userId, threadId);
 *   await integration.trackUpvote(userId, threadId, newUpvoteCount);
 *   await integration.trackComment(userId, threadId, commentCount);
 *   const quality = await integration.calculatePostQuality(threadId);
 */

const { EventEmitter } = require('events');

class ForumQuestIntegration extends EventEmitter {
  constructor(config = {}) {
    super();

    this.db = config.db;
    this.questEngine = config.questEngine;
    this.enabled = config.enabled !== false;

    if (!this.db) {
      throw new Error('[ForumQuestIntegration] Database required');
    }

    // Quality scoring weights
    this.qualityWeights = {
      upvote: 1,
      comment: 2, // Comments worth more than upvotes
      reply: 1.5,
      view: 0.1
    };

    console.log('[ForumQuestIntegration] Initialized');
  }

  /**
   * Track post created
   */
  async trackPostCreated(userId, threadId, options = {}) {
    if (!this.enabled) return;

    console.log(`[ForumQuestIntegration] Post created: user ${userId}, thread ${threadId}`);

    try {
      // Create post tracking record
      await this.db.query(`
        INSERT INTO forum_quest_tracking (
          user_id,
          thread_id,
          post_type,
          upvotes,
          comments,
          views,
          quality_score,
          created_at
        ) VALUES ($1, $2, $3, 0, 0, 0, 0, NOW())
        ON CONFLICT (user_id, thread_id) DO NOTHING
      `, [userId, threadId, options.postType || 'thread']);

      // Update quest progress
      if (this.questEngine) {
        await this.questEngine.trackForumPost(userId, threadId, 0);
      }

      this.emit('post:created', {
        userId,
        threadId
      });
    } catch (error) {
      console.error('[ForumQuestIntegration] Track post created error:', error.message);
    }
  }

  /**
   * Track upvote received
   */
  async trackUpvote(userId, threadId, newUpvoteCount) {
    if (!this.enabled) return;

    console.log(`[ForumQuestIntegration] Upvote: thread ${threadId} now has ${newUpvoteCount} upvotes`);

    try {
      // Update tracking record
      await this.db.query(`
        UPDATE forum_quest_tracking SET
          upvotes = $1,
          quality_score = calculate_post_quality(upvotes, comments, views),
          updated_at = NOW()
        WHERE thread_id = $2
      `, [newUpvoteCount, threadId]);

      // Get user ID for this thread
      const userResult = await this.db.query(
        'SELECT user_id FROM forum_quest_tracking WHERE thread_id = $1',
        [threadId]
      );

      if (userResult.rows.length === 0) return;

      const postUserId = userResult.rows[0].user_id;

      // Update quest progress (value = total upvotes across all posts)
      if (this.questEngine) {
        const totalUpvotes = await this._getTotalUpvotes(postUserId);
        await this._updateForumQuestProgress(postUserId, totalUpvotes);
      }

      this.emit('post:upvoted', {
        userId: postUserId,
        threadId,
        upvoteCount: newUpvoteCount
      });
    } catch (error) {
      console.error('[ForumQuestIntegration] Track upvote error:', error.message);
    }
  }

  /**
   * Track comment received
   */
  async trackComment(userId, threadId, newCommentCount) {
    if (!this.enabled) return;

    console.log(`[ForumQuestIntegration] Comment: thread ${threadId} now has ${newCommentCount} comments`);

    try {
      // Update tracking record
      await this.db.query(`
        UPDATE forum_quest_tracking SET
          comments = $1,
          quality_score = calculate_post_quality(upvotes, comments, views),
          updated_at = NOW()
        WHERE thread_id = $2
      `, [newCommentCount, threadId]);

      // Get user ID
      const userResult = await this.db.query(
        'SELECT user_id FROM forum_quest_tracking WHERE thread_id = $1',
        [threadId]
      );

      if (userResult.rows.length === 0) return;

      const postUserId = userResult.rows[0].user_id;

      this.emit('post:commented', {
        userId: postUserId,
        threadId,
        commentCount: newCommentCount
      });
    } catch (error) {
      console.error('[ForumQuestIntegration] Track comment error:', error.message);
    }
  }

  /**
   * Track post view
   */
  async trackView(threadId) {
    if (!this.enabled) return;

    try {
      await this.db.query(`
        UPDATE forum_quest_tracking SET
          views = views + 1,
          quality_score = calculate_post_quality(upvotes, comments, views),
          updated_at = NOW()
        WHERE thread_id = $1
      `, [threadId]);
    } catch (error) {
      // Silently fail for views
    }
  }

  /**
   * Calculate post quality score
   */
  async calculatePostQuality(threadId) {
    const result = await this.db.query(
      'SELECT * FROM forum_quest_tracking WHERE thread_id = $1',
      [threadId]
    );

    if (result.rows.length === 0) {
      return 0;
    }

    const post = result.rows[0];

    const quality =
      (post.upvotes * this.qualityWeights.upvote) +
      (post.comments * this.qualityWeights.comment) +
      (post.views * this.qualityWeights.view);

    return quality;
  }

  /**
   * Get total upvotes for user across all posts
   */
  async _getTotalUpvotes(userId) {
    const result = await this.db.query(`
      SELECT COALESCE(SUM(upvotes), 0) as total_upvotes
      FROM forum_quest_tracking
      WHERE user_id = $1
    `, [userId]);

    return parseInt(result.rows[0].total_upvotes);
  }

  /**
   * Update forum quest progress for user
   */
  async _updateForumQuestProgress(userId, totalUpvotes) {
    // Get user's post count
    const countResult = await this.db.query(`
      SELECT COUNT(*) as post_count
      FROM forum_quest_tracking
      WHERE user_id = $1
    `, [userId]);

    const postCount = parseInt(countResult.rows[0].post_count);

    // Update all forum quests
    const quests = await this.questEngine.getQuestsByType('forum');

    for (const quest of quests) {
      // Update based on quest requirements
      if (quest.quest_slug === 'first-discussion') {
        // Just needs 1 post
        if (postCount >= 1) {
          await this.questEngine.updateProgress(userId, quest.quest_id, postCount, 0);
        }
      } else if (quest.quest_slug === 'discussion-master') {
        // Needs 5 posts with 10+ total upvotes
        await this.questEngine.updateProgress(userId, quest.quest_id, postCount, totalUpvotes);
      } else if (quest.quest_slug === 'forum-legend') {
        // Needs 25 posts with 250+ total upvotes
        await this.questEngine.updateProgress(userId, quest.quest_id, postCount, totalUpvotes);
      } else {
        // Generic update
        await this.questEngine.updateProgress(userId, quest.quest_id, postCount, totalUpvotes);
      }
    }
  }

  /**
   * Get forum statistics for user
   */
  async getUserForumStats(userId) {
    const result = await this.db.query(`
      SELECT
        COUNT(*) as total_posts,
        COALESCE(SUM(upvotes), 0) as total_upvotes,
        COALESCE(SUM(comments), 0) as total_comments,
        COALESCE(SUM(views), 0) as total_views,
        COALESCE(AVG(quality_score), 0) as avg_quality_score,
        MAX(created_at) as last_post_at
      FROM forum_quest_tracking
      WHERE user_id = $1
    `, [userId]);

    return result.rows[0] || {
      total_posts: 0,
      total_upvotes: 0,
      total_comments: 0,
      total_views: 0,
      avg_quality_score: 0,
      last_post_at: null
    };
  }

  /**
   * Get top forum contributors
   */
  async getTopContributors(limit = 100) {
    const result = await this.db.query(`
      SELECT
        u.user_id,
        u.username,
        u.email,
        COUNT(fqt.thread_id) as total_posts,
        COALESCE(SUM(fqt.upvotes), 0) as total_upvotes,
        COALESCE(SUM(fqt.comments), 0) as total_comments,
        COALESCE(AVG(fqt.quality_score), 0) as avg_quality
      FROM users u
      JOIN forum_quest_tracking fqt ON u.user_id = fqt.user_id
      GROUP BY u.user_id, u.username, u.email
      ORDER BY total_upvotes DESC, total_posts DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Check if user qualifies for forum achievements
   */
  async checkForumAchievements(userId) {
    const stats = await this.getUserForumStats(userId);
    const achievements = [];

    // First post achievement
    if (stats.total_posts >= 1) {
      achievements.push({
        name: 'First Steps',
        description: 'Created your first discussion',
        icon: '💬'
      });
    }

    // 10 upvotes achievement
    if (stats.total_upvotes >= 10) {
      achievements.push({
        name: 'Community Valued',
        description: 'Received 10+ total upvotes',
        icon: '👍'
      });
    }

    // 50 upvotes achievement
    if (stats.total_upvotes >= 50) {
      achievements.push({
        name: 'Popular Voice',
        description: 'Received 50+ total upvotes',
        icon: '🔥'
      });
    }

    // 250 upvotes achievement
    if (stats.total_upvotes >= 250) {
      achievements.push({
        name: 'Forum Legend',
        description: 'Received 250+ total upvotes',
        icon: '👑'
      });
    }

    // Prolific poster (25+ posts)
    if (stats.total_posts >= 25) {
      achievements.push({
        name: 'Prolific',
        description: 'Created 25+ discussions',
        icon: '📚'
      });
    }

    // Quality contributor (avg quality > 10)
    if (stats.avg_quality_score >= 10) {
      achievements.push({
        name: 'Quality Contributor',
        description: 'High-quality discussions',
        icon: '✨'
      });
    }

    return achievements;
  }
}

// Ensure tables exist
async function ensureForumQuestTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS forum_quest_tracking (
      tracking_id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      thread_id INTEGER NOT NULL, -- Could reference forum_threads if that table exists
      post_type VARCHAR(20) DEFAULT 'thread', -- 'thread', 'reply', 'comment'
      upvotes INTEGER DEFAULT 0,
      downvotes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      quality_score FLOAT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, thread_id)
    );

    CREATE INDEX IF NOT EXISTS idx_forum_quest_tracking_user ON forum_quest_tracking(user_id);
    CREATE INDEX IF NOT EXISTS idx_forum_quest_tracking_thread ON forum_quest_tracking(thread_id);
    CREATE INDEX IF NOT EXISTS idx_forum_quest_tracking_quality ON forum_quest_tracking(quality_score);

    -- Function to calculate post quality
    CREATE OR REPLACE FUNCTION calculate_post_quality(
      p_upvotes INTEGER,
      p_comments INTEGER,
      p_views INTEGER
    ) RETURNS FLOAT AS $$
    BEGIN
      RETURN (
        (p_upvotes * 1.0) +
        (p_comments * 2.0) +
        (p_views * 0.1)
      );
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    COMMENT ON TABLE forum_quest_tracking IS 'Track forum posts for quest progress';
  `);

  console.log('[ForumQuestIntegration] Tables ensured');
}

module.exports = ForumQuestIntegration;
module.exports.ensureForumQuestTables = ensureForumQuestTables;

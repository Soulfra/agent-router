/**
 * Content Forum Manager
 *
 * Reddit/HN-style discussion system for curated content
 * Features:
 * - Nested comments (threaded discussions)
 * - Voting (upvotes/downvotes)
 * - Karma tracking
 * - Hot/trending algorithms
 */

class ContentForum {
  constructor(db) {
    this.db = db;
  }

  // ============================================================================
  // THREADS
  // ============================================================================

  /**
   * Create new thread
   */
  async createThread({ userId, userName, title, body, url, contentId, tags, flair }) {
    const result = await this.db.query(
      `INSERT INTO forum_threads
       (author_id, author_name, title, body, url, content_id, tags, flair)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, userName, title, body, url, contentId, tags || [], flair]
    );

    // Update karma
    await this.incrementUserKarma(userId, 'threads_created');

    return result.rows[0];
  }

  /**
   * Get thread by ID
   */
  async getThread(threadId) {
    const result = await this.db.query(
      'SELECT * FROM forum_threads WHERE id = $1',
      [threadId]
    );

    return result.rows[0];
  }

  /**
   * Get thread with nested comments
   */
  async getThreadWithComments(threadId) {
    // Get thread
    const thread = await this.getThread(threadId);

    if (!thread) {
      return null;
    }

    // Get comments using recursive SQL function
    const commentsResult = await this.db.query(
      'SELECT * FROM get_thread_with_comments($1)',
      [threadId]
    );

    // Build comment tree
    const comments = this.buildCommentTree(commentsResult.rows);

    // Increment view count
    await this.db.query(
      'UPDATE forum_threads SET view_count = view_count + 1 WHERE id = $1',
      [threadId]
    );

    return {
      ...thread,
      comments
    };
  }

  /**
   * Get hot threads (trending)
   */
  async getHotThreads(limit = 25) {
    const result = await this.db.query(
      'SELECT * FROM get_hot_threads($1)',
      [limit]
    );

    return result.rows;
  }

  /**
   * Get new threads (sorted by created_at)
   */
  async getNewThreads(limit = 25) {
    const result = await this.db.query(
      `SELECT * FROM forum_threads
       WHERE NOT archived
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Get top threads (sorted by score)
   */
  async getTopThreads(limit = 25, timeRange = 'all') {
    let timeFilter = '';

    if (timeRange === 'day') {
      timeFilter = "AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 day'";
    } else if (timeRange === 'week') {
      timeFilter = "AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'";
    } else if (timeRange === 'month') {
      timeFilter = "AND created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'";
    } else if (timeRange === 'year') {
      timeFilter = "AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 year'";
    }

    const result = await this.db.query(
      `SELECT * FROM forum_threads
       WHERE NOT archived ${timeFilter}
       ORDER BY score DESC, created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Get threads by tag
   */
  async getThreadsByTag(tag, limit = 25) {
    const result = await this.db.query(
      `SELECT * FROM forum_threads
       WHERE $1 = ANY(tags) AND NOT archived
       ORDER BY last_activity_at DESC
       LIMIT $2`,
      [tag, limit]
    );

    return result.rows;
  }

  /**
   * Get threads for content item
   */
  async getThreadsForContent(contentId, limit = 10) {
    const result = await this.db.query(
      `SELECT * FROM forum_threads
       WHERE content_id = $1 AND NOT archived
       ORDER BY score DESC, created_at DESC
       LIMIT $2`,
      [contentId, limit]
    );

    return result.rows;
  }

  /**
   * Update thread
   */
  async updateThread(threadId, userId, updates) {
    // Verify ownership
    const thread = await this.getThread(threadId);
    if (!thread || thread.author_id !== userId) {
      throw new Error('Unauthorized');
    }

    const { title, body, tags, flair, pinned, locked } = updates;

    const result = await this.db.query(
      `UPDATE forum_threads
       SET title = COALESCE($1, title),
           body = COALESCE($2, body),
           tags = COALESCE($3, tags),
           flair = COALESCE($4, flair),
           pinned = COALESCE($5, pinned),
           locked = COALESCE($6, locked)
       WHERE id = $7 AND author_id = $8
       RETURNING *`,
      [title, body, tags, flair, pinned, locked, threadId, userId]
    );

    return result.rows[0];
  }

  /**
   * Delete thread
   */
  async deleteThread(threadId, userId) {
    // Verify ownership
    const thread = await this.getThread(threadId);
    if (!thread || thread.author_id !== userId) {
      throw new Error('Unauthorized');
    }

    await this.db.query('DELETE FROM forum_threads WHERE id = $1', [threadId]);
  }

  // ============================================================================
  // POSTS (Comments)
  // ============================================================================

  /**
   * Create post (comment)
   */
  async createPost({ userId, userName, threadId, parentId, body }) {
    // Calculate depth
    let depth = 0;
    if (parentId) {
      const parentResult = await this.db.query(
        'SELECT depth FROM forum_posts WHERE id = $1',
        [parentId]
      );
      if (parentResult.rows[0]) {
        depth = parentResult.rows[0].depth + 1;
      }
    }

    const result = await this.db.query(
      `INSERT INTO forum_posts
       (thread_id, parent_id, depth, author_id, author_name, body)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [threadId, parentId, depth, userId, userName, body]
    );

    // Update karma
    await this.incrementUserKarma(userId, 'comments_created');

    return result.rows[0];
  }

  /**
   * Get post by ID
   */
  async getPost(postId) {
    const result = await this.db.query(
      'SELECT * FROM forum_posts WHERE id = $1 AND NOT deleted',
      [postId]
    );

    return result.rows[0];
  }

  /**
   * Update post
   */
  async updatePost(postId, userId, body) {
    // Verify ownership
    const post = await this.getPost(postId);
    if (!post || post.author_id !== userId) {
      throw new Error('Unauthorized');
    }

    const result = await this.db.query(
      `UPDATE forum_posts
       SET body = $1
       WHERE id = $2 AND author_id = $3
       RETURNING *`,
      [body, postId, userId]
    );

    return result.rows[0];
  }

  /**
   * Delete post (soft delete)
   */
  async deletePost(postId, userId) {
    // Verify ownership
    const post = await this.getPost(postId);
    if (!post || post.author_id !== userId) {
      throw new Error('Unauthorized');
    }

    await this.db.query(
      'UPDATE forum_posts SET deleted = TRUE, body = \'[deleted]\' WHERE id = $1',
      [postId]
    );
  }

  // ============================================================================
  // VOTING
  // ============================================================================

  /**
   * Vote on thread
   */
  async voteThread(threadId, userId, voteType) {
    if (!['up', 'down'].includes(voteType)) {
      throw new Error('Invalid vote type');
    }

    // Upsert vote
    await this.db.query(
      `INSERT INTO forum_votes (thread_id, user_id, vote_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, thread_id)
       DO UPDATE SET vote_type = $3`,
      [threadId, userId, voteType]
    );

    // Get updated thread
    return await this.getThread(threadId);
  }

  /**
   * Vote on post
   */
  async votePost(postId, userId, voteType) {
    if (!['up', 'down'].includes(voteType)) {
      throw new Error('Invalid vote type');
    }

    // Upsert vote
    await this.db.query(
      `INSERT INTO forum_votes (post_id, user_id, vote_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, post_id)
       DO UPDATE SET vote_type = $3`,
      [postId, userId, voteType]
    );

    // Get updated post
    return await this.getPost(postId);
  }

  /**
   * Remove vote
   */
  async removeVote(userId, threadId = null, postId = null) {
    if (threadId) {
      await this.db.query(
        'DELETE FROM forum_votes WHERE user_id = $1 AND thread_id = $2',
        [userId, threadId]
      );
    } else if (postId) {
      await this.db.query(
        'DELETE FROM forum_votes WHERE user_id = $1 AND post_id = $2',
        [userId, postId]
      );
    }
  }

  /**
   * Get user's votes for thread
   */
  async getUserVotes(userId, threadId) {
    const result = await this.db.query(
      `SELECT
         thread_id,
         post_id,
         vote_type
       FROM forum_votes
       WHERE user_id = $1
       AND (thread_id = $2 OR post_id IN (
         SELECT id FROM forum_posts WHERE thread_id = $2
       ))`,
      [userId, threadId]
    );

    return result.rows.reduce((acc, row) => {
      if (row.thread_id) {
        acc[`thread-${row.thread_id}`] = row.vote_type;
      } else if (row.post_id) {
        acc[`post-${row.post_id}`] = row.vote_type;
      }
      return acc;
    }, {});
  }

  // ============================================================================
  // KARMA
  // ============================================================================

  /**
   * Get user karma
   */
  async getUserKarma(userId) {
    const result = await this.db.query(
      'SELECT * FROM forum_karma WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Initialize karma record
      const initResult = await this.db.query(
        `INSERT INTO forum_karma (user_id)
         VALUES ($1)
         RETURNING *`,
        [userId]
      );
      return initResult.rows[0];
    }

    return result.rows[0];
  }

  /**
   * Update user karma
   */
  async updateUserKarma(userId) {
    // Calculate karma from votes
    const threadKarmaResult = await this.db.query(
      `SELECT COALESCE(SUM(score), 0) as karma
       FROM forum_threads
       WHERE author_id = $1`,
      [userId]
    );

    const commentKarmaResult = await this.db.query(
      `SELECT COALESCE(SUM(score), 0) as karma
       FROM forum_posts
       WHERE author_id = $1 AND NOT deleted`,
      [userId]
    );

    const postKarma = parseInt(threadKarmaResult.rows[0].karma);
    const commentKarma = parseInt(commentKarmaResult.rows[0].karma);
    const totalKarma = postKarma + commentKarma;

    // Update karma record
    await this.db.query(
      `INSERT INTO forum_karma (user_id, post_karma, comment_karma, total_karma)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id)
       DO UPDATE SET
         post_karma = $2,
         comment_karma = $3,
         total_karma = $4,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, postKarma, commentKarma, totalKarma]
    );

    return { postKarma, commentKarma, totalKarma };
  }

  /**
   * Increment user activity stats
   */
  async incrementUserKarma(userId, field) {
    await this.db.query(
      `INSERT INTO forum_karma (user_id, ${field})
       VALUES ($1, 1)
       ON CONFLICT (user_id)
       DO UPDATE SET ${field} = forum_karma.${field} + 1`,
      [userId]
    );
  }

  /**
   * Get top karma users (leaderboard)
   */
  async getTopKarmaUsers(limit = 10) {
    const result = await this.db.query(
      `SELECT * FROM forum_karma
       ORDER BY total_karma DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Build nested comment tree from flat list
   */
  buildCommentTree(flatComments) {
    const commentMap = new Map();
    const rootComments = [];

    // First pass: create map
    flatComments.forEach(comment => {
      commentMap.set(comment.post_id, {
        ...comment,
        replies: []
      });
    });

    // Second pass: build tree
    flatComments.forEach(comment => {
      const node = commentMap.get(comment.post_id);

      if (comment.parent_id === null) {
        rootComments.push(node);
      } else {
        const parent = commentMap.get(comment.parent_id);
        if (parent) {
          parent.replies.push(node);
        }
      }
    });

    return rootComments;
  }
}

module.exports = ContentForum;

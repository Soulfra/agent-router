/**
 * Forum Routes
 *
 * API endpoints for discussion forum system
 * Reddit/HN-style threading, voting, karma
 */

const express = require('express');
const router = express.Router();
const ContentForum = require('../lib/content-forum');

let db = null;
let forum = null;

/**
 * Initialize routes with database
 */
function initRoutes(database) {
  db = database;
  forum = new ContentForum(db);
  return router;
}

// ============================================================================
// THREADS
// ============================================================================

/**
 * POST /api/forum/threads
 * Create new discussion thread
 */
router.post('/threads', async (req, res) => {
  try {
    const userId = req.user?.userId || req.session?.userId || 'guest';
    const userName = req.user?.userName || req.session?.userName || 'Anonymous';

    const { title, body, url, contentId, tags, flair } = req.body;

    if (!title) {
      return res.status(400).json({
        status: 'error',
        error: 'Thread title is required'
      });
    }

    const thread = await forum.createThread({
      userId,
      userName,
      title,
      body,
      url,
      contentId,
      tags,
      flair
    });

    res.json({
      status: 'success',
      thread
    });
  } catch (error) {
    console.error('[ForumRoutes] Error creating thread:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/forum/threads/:id
 * Get thread with nested comments
 */
router.get('/threads/:id', async (req, res) => {
  try {
    const threadId = parseInt(req.params.id);
    const userId = req.user?.userId || req.session?.userId || 'guest';

    const thread = await forum.getThreadWithComments(threadId);

    if (!thread) {
      return res.status(404).json({
        status: 'error',
        error: 'Thread not found'
      });
    }

    // Get user's votes
    const votes = await forum.getUserVotes(userId, threadId);

    res.json({
      status: 'success',
      thread,
      votes
    });
  } catch (error) {
    console.error('[ForumRoutes] Error getting thread:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/forum/hot
 * Get hot/trending threads
 */
router.get('/hot', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 25;
    const threads = await forum.getHotThreads(limit);

    res.json({
      status: 'success',
      threads,
      count: threads.length
    });
  } catch (error) {
    console.error('[ForumRoutes] Error getting hot threads:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/forum/new
 * Get new threads (sorted by created_at)
 */
router.get('/new', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 25;
    const threads = await forum.getNewThreads(limit);

    res.json({
      status: 'success',
      threads,
      count: threads.length
    });
  } catch (error) {
    console.error('[ForumRoutes] Error getting new threads:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/forum/top
 * Get top threads (sorted by score)
 *
 * Query params:
 * - timeRange: day, week, month, year, all (default: all)
 */
router.get('/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 25;
    const timeRange = req.query.timeRange || 'all';

    const threads = await forum.getTopThreads(limit, timeRange);

    res.json({
      status: 'success',
      threads,
      count: threads.length,
      timeRange
    });
  } catch (error) {
    console.error('[ForumRoutes] Error getting top threads:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/forum/tags/:tag
 * Get threads by tag
 */
router.get('/tags/:tag', async (req, res) => {
  try {
    const tag = req.params.tag;
    const limit = parseInt(req.query.limit) || 25;

    const threads = await forum.getThreadsByTag(tag, limit);

    res.json({
      status: 'success',
      tag,
      threads,
      count: threads.length
    });
  } catch (error) {
    console.error('[ForumRoutes] Error getting threads by tag:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/forum/content/:contentId
 * Get threads for curated content item
 */
router.get('/content/:contentId', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    const limit = parseInt(req.query.limit) || 10;

    const threads = await forum.getThreadsForContent(contentId, limit);

    res.json({
      status: 'success',
      contentId,
      threads,
      count: threads.length
    });
  } catch (error) {
    console.error('[ForumRoutes] Error getting threads for content:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * PUT /api/forum/threads/:id
 * Update thread
 */
router.put('/threads/:id', async (req, res) => {
  try {
    const threadId = parseInt(req.params.id);
    const userId = req.user?.userId || req.session?.userId || 'guest';

    const { title, body, tags, flair, pinned, locked } = req.body;

    const thread = await forum.updateThread(threadId, userId, {
      title,
      body,
      tags,
      flair,
      pinned,
      locked
    });

    res.json({
      status: 'success',
      thread
    });
  } catch (error) {
    console.error('[ForumRoutes] Error updating thread:', error);
    res.status(error.message === 'Unauthorized' ? 403 : 500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * DELETE /api/forum/threads/:id
 * Delete thread
 */
router.delete('/threads/:id', async (req, res) => {
  try {
    const threadId = parseInt(req.params.id);
    const userId = req.user?.userId || req.session?.userId || 'guest';

    await forum.deleteThread(threadId, userId);

    res.json({
      status: 'success',
      message: 'Thread deleted'
    });
  } catch (error) {
    console.error('[ForumRoutes] Error deleting thread:', error);
    res.status(error.message === 'Unauthorized' ? 403 : 500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// POSTS (Comments)
// ============================================================================

/**
 * POST /api/forum/posts
 * Create new post (comment)
 */
router.post('/posts', async (req, res) => {
  try {
    const userId = req.user?.userId || req.session?.userId || 'guest';
    const userName = req.user?.userName || req.session?.userName || 'Anonymous';

    const { threadId, parentId, body } = req.body;

    if (!threadId || !body) {
      return res.status(400).json({
        status: 'error',
        error: 'Thread ID and body are required'
      });
    }

    const post = await forum.createPost({
      userId,
      userName,
      threadId,
      parentId,
      body
    });

    res.json({
      status: 'success',
      post
    });
  } catch (error) {
    console.error('[ForumRoutes] Error creating post:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * PUT /api/forum/posts/:id
 * Update post
 */
router.put('/posts/:id', async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user?.userId || req.session?.userId || 'guest';
    const { body } = req.body;

    if (!body) {
      return res.status(400).json({
        status: 'error',
        error: 'Body is required'
      });
    }

    const post = await forum.updatePost(postId, userId, body);

    res.json({
      status: 'success',
      post
    });
  } catch (error) {
    console.error('[ForumRoutes] Error updating post:', error);
    res.status(error.message === 'Unauthorized' ? 403 : 500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * DELETE /api/forum/posts/:id
 * Delete post (soft delete)
 */
router.delete('/posts/:id', async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user?.userId || req.session?.userId || 'guest';

    await forum.deletePost(postId, userId);

    res.json({
      status: 'success',
      message: 'Post deleted'
    });
  } catch (error) {
    console.error('[ForumRoutes] Error deleting post:', error);
    res.status(error.message === 'Unauthorized' ? 403 : 500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// VOTING
// ============================================================================

/**
 * POST /api/forum/vote/thread/:id
 * Vote on thread
 *
 * Body:
 * - voteType: 'up' or 'down'
 */
router.post('/vote/thread/:id', async (req, res) => {
  try {
    const threadId = parseInt(req.params.id);
    const userId = req.user?.userId || req.session?.userId || 'guest';
    const { voteType } = req.body;

    if (!['up', 'down'].includes(voteType)) {
      return res.status(400).json({
        status: 'error',
        error: 'Vote type must be "up" or "down"'
      });
    }

    const thread = await forum.voteThread(threadId, userId, voteType);

    res.json({
      status: 'success',
      thread
    });
  } catch (error) {
    console.error('[ForumRoutes] Error voting on thread:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * POST /api/forum/vote/post/:id
 * Vote on post
 *
 * Body:
 * - voteType: 'up' or 'down'
 */
router.post('/vote/post/:id', async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user?.userId || req.session?.userId || 'guest';
    const { voteType } = req.body;

    if (!['up', 'down'].includes(voteType)) {
      return res.status(400).json({
        status: 'error',
        error: 'Vote type must be "up" or "down"'
      });
    }

    const post = await forum.votePost(postId, userId, voteType);

    res.json({
      status: 'success',
      post
    });
  } catch (error) {
    console.error('[ForumRoutes] Error voting on post:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * DELETE /api/forum/vote/thread/:id
 * Remove vote from thread
 */
router.delete('/vote/thread/:id', async (req, res) => {
  try {
    const threadId = parseInt(req.params.id);
    const userId = req.user?.userId || req.session?.userId || 'guest';

    await forum.removeVote(userId, threadId, null);

    res.json({
      status: 'success',
      message: 'Vote removed'
    });
  } catch (error) {
    console.error('[ForumRoutes] Error removing vote:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * DELETE /api/forum/vote/post/:id
 * Remove vote from post
 */
router.delete('/vote/post/:id', async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user?.userId || req.session?.userId || 'guest';

    await forum.removeVote(userId, null, postId);

    res.json({
      status: 'success',
      message: 'Vote removed'
    });
  } catch (error) {
    console.error('[ForumRoutes] Error removing vote:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// KARMA
// ============================================================================

/**
 * GET /api/forum/karma/:userId
 * Get user karma
 */
router.get('/karma/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const karma = await forum.getUserKarma(userId);

    res.json({
      status: 'success',
      karma
    });
  } catch (error) {
    console.error('[ForumRoutes] Error getting karma:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * POST /api/forum/karma/:userId/update
 * Recalculate user karma
 */
router.post('/karma/:userId/update', async (req, res) => {
  try {
    const userId = req.params.userId;
    const karma = await forum.updateUserKarma(userId);

    res.json({
      status: 'success',
      karma
    });
  } catch (error) {
    console.error('[ForumRoutes] Error updating karma:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/forum/leaderboard
 * Get karma leaderboard
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const users = await forum.getTopKarmaUsers(limit);

    res.json({
      status: 'success',
      users,
      count: users.length
    });
  } catch (error) {
    console.error('[ForumRoutes] Error getting leaderboard:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

module.exports = {
  router,
  initRoutes
};

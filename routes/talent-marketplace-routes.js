/**
 * Talent Marketplace API Routes
 *
 * REST API for decision tracking, reputation, idea marketplace, activity feed, and communications.
 * Combines all new systems: decisions, todos, reputation, ideas, GitHub activity, profile comms.
 */

const express = require('express');
const router = express.Router();

// Import services
const DecisionTracker = require('../lib/decision-tracker');
const DecisionArchive = require('../lib/decision-archive');
const DecisionTodo = require('../lib/decision-todo');
const ReputationEngine = require('../lib/reputation-engine');
const IdeaMarketplace = require('../lib/idea-marketplace');
const GitHubActivityFeed = require('../lib/github-activity-feed');
const ProfileComms = require('../lib/profile-comms');

// Initialize services
const decisionTracker = new DecisionTracker();
const decisionArchive = new DecisionArchive({ tracker: decisionTracker });
const decisionTodo = new DecisionTodo();
const reputationEngine = new ReputationEngine();
const ideaMarketplace = new IdeaMarketplace({ reputationEngine });
const activityFeed = new GitHubActivityFeed({ reputationEngine });
const profileComms = new ProfileComms();

// ============================================================================
// Decision Tracking Routes
// ============================================================================

/**
 * POST /api/decisions
 * Create new decision
 */
router.post('/api/decisions', async (req, res) => {
  try {
    const decision = await decisionTracker.createDecision(req.body);
    res.json({ success: true, decision });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/decisions/:id
 * Get decision by ID
 */
router.get('/api/decisions/:id', async (req, res) => {
  try {
    const { includeHistory, includeReferences, includeImpact } = req.query;
    const decision = await decisionTracker.getDecision(
      parseInt(req.params.id),
      {
        includeHistory: includeHistory === 'true',
        includeReferences: includeReferences === 'true',
        includeImpact: includeImpact === 'true'
      }
    );

    if (!decision) {
      return res.status(404).json({ success: false, error: 'Decision not found' });
    }

    res.json({ success: true, decision });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/decisions/:id
 * Update decision
 */
router.put('/api/decisions/:id', async (req, res) => {
  try {
    const decision = await decisionTracker.updateDecision(
      parseInt(req.params.id),
      req.body
    );
    res.json({ success: true, decision });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/decisions/:id/deprecate
 * Deprecate decision
 */
router.post('/api/decisions/:id/deprecate', async (req, res) => {
  try {
    const { reason, replacedBy, deprecatedBy } = req.body;
    const decision = await decisionTracker.deprecateDecision(
      parseInt(req.params.id),
      reason,
      replacedBy,
      deprecatedBy
    );
    res.json({ success: true, decision });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/decisions
 * Search decisions
 */
router.get('/api/decisions', async (req, res) => {
  try {
    const decisions = await decisionTracker.searchDecisions(req.query);
    res.json({ success: true, decisions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/decisions/:id/lineage
 * Get decision lineage (trace decision chain)
 */
router.get('/api/decisions/:id/lineage', async (req, res) => {
  try {
    const lineage = await decisionArchive.getLineage(parseInt(req.params.id), req.query);
    res.json({ success: true, lineage });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Decision Todo Routes
// ============================================================================

/**
 * POST /api/todos
 * Create todo from decision
 */
router.post('/api/todos', async (req, res) => {
  try {
    const todo = await decisionTodo.createTodo(req.body);
    res.json({ success: true, todo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/todos/:id
 * Get todo by ID
 */
router.get('/api/todos/:id', async (req, res) => {
  try {
    const { includeDecision, includeDependencies } = req.query;
    const todo = await decisionTodo.getTodo(
      parseInt(req.params.id),
      {
        includeDecision: includeDecision === 'true',
        includeDependencies: includeDependencies === 'true'
      }
    );

    if (!todo) {
      return res.status(404).json({ success: false, error: 'Todo not found' });
    }

    res.json({ success: true, todo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/todos/:id
 * Update todo
 */
router.put('/api/todos/:id', async (req, res) => {
  try {
    const todo = await decisionTodo.updateTodo(parseInt(req.params.id), req.body);
    res.json({ success: true, todo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/todos/:id/complete
 * Complete todo
 */
router.post('/api/todos/:id/complete', async (req, res) => {
  try {
    const { completedBy, completionNotes } = req.body;
    const todo = await decisionTodo.completeTodo(
      parseInt(req.params.id),
      completedBy,
      completionNotes
    );
    res.json({ success: true, todo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/decisions/:decisionId/todos
 * Get todos for decision
 */
router.get('/api/decisions/:decisionId/todos', async (req, res) => {
  try {
    const todos = await decisionTodo.getTodosForDecision(
      parseInt(req.params.decisionId),
      req.query
    );
    res.json({ success: true, todos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/todos
 * Search todos
 */
router.get('/api/todos', async (req, res) => {
  try {
    const todos = await decisionTodo.searchTodos(req.query);
    res.json({ success: true, todos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Reputation Routes
// ============================================================================

/**
 * GET /api/reputation/:userId
 * Get user reputation
 */
router.get('/api/reputation/:userId', async (req, res) => {
  try {
    const reputation = await reputationEngine.getReputationProfile(req.params.userId);
    res.json({ success: true, reputation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/reputation/:userId/karma
 * Award karma
 */
router.post('/api/reputation/:userId/karma', async (req, res) => {
  try {
    const reputation = await reputationEngine.awardKarma(req.params.userId, req.body);
    res.json({ success: true, reputation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/reputation/:userId/follow
 * Follow user
 */
router.post('/api/reputation/:userId/follow', async (req, res) => {
  try {
    const { followerId } = req.body;
    const result = await reputationEngine.followUser(followerId, req.params.userId);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/reputation/:userId/follow
 * Unfollow user
 */
router.delete('/api/reputation/:userId/follow', async (req, res) => {
  try {
    const { followerId } = req.body;
    const result = await reputationEngine.unfollowUser(followerId, req.params.userId);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/reputation/leaderboard
 * Get karma leaderboard
 */
router.get('/api/reputation/leaderboard', async (req, res) => {
  try {
    const leaderboard = await reputationEngine.getLeaderboard(req.query);
    res.json({ success: true, leaderboard });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Idea Marketplace Routes
// ============================================================================

/**
 * POST /api/ideas
 * Submit new idea
 */
router.post('/api/ideas', async (req, res) => {
  try {
    const idea = await ideaMarketplace.submitIdea(req.body);
    res.json({ success: true, idea });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ideas/:id
 * Get idea by ID
 */
router.get('/api/ideas/:id', async (req, res) => {
  try {
    const { userId } = req.query;
    const idea = await ideaMarketplace.getIdea(parseInt(req.params.id), userId);

    if (!idea) {
      return res.status(404).json({ success: false, error: 'Idea not found' });
    }

    res.json({ success: true, idea });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ideas
 * Browse ideas
 */
router.get('/api/ideas', async (req, res) => {
  try {
    const ideas = await ideaMarketplace.browseIdeas(req.query);
    res.json({ success: true, ideas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ideas/:id/purchase
 * Purchase idea
 */
router.post('/api/ideas/:id/purchase', async (req, res) => {
  try {
    const { buyerId, payment } = req.body;
    const result = await ideaMarketplace.purchaseIdea(
      parseInt(req.params.id),
      buyerId,
      payment
    );
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/ideas/:id/upvote
 * Upvote idea
 */
router.post('/api/ideas/:id/upvote', async (req, res) => {
  try {
    const { userId } = req.body;
    const idea = await ideaMarketplace.upvoteIdea(parseInt(req.params.id), userId);
    res.json({ success: true, idea });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/users/:userId/ideas
 * Get user's submitted ideas
 */
router.get('/api/users/:userId/ideas', async (req, res) => {
  try {
    const ideas = await ideaMarketplace.getUserIdeas(req.params.userId);
    res.json({ success: true, ideas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/users/:userId/purchases
 * Get user's purchased ideas
 */
router.get('/api/users/:userId/purchases', async (req, res) => {
  try {
    const purchases = await ideaMarketplace.getUserPurchases(req.params.userId);
    res.json({ success: true, purchases });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/users/:userId/earnings
 * Get user's earnings
 */
router.get('/api/users/:userId/earnings', async (req, res) => {
  try {
    const earnings = await ideaMarketplace.getUserEarnings(req.params.userId);
    res.json({ success: true, earnings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/ideas/stats
 * Get marketplace stats
 */
router.get('/api/ideas/stats', async (req, res) => {
  try {
    const stats = await ideaMarketplace.getMarketplaceStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Activity Feed Routes
// ============================================================================

/**
 * POST /api/activity
 * Post activity
 */
router.post('/api/activity', async (req, res) => {
  try {
    const activity = await activityFeed.postActivity(req.body);
    res.json({ success: true, activity });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/activity/feed/:userId
 * Get user's feed
 */
router.get('/api/activity/feed/:userId', async (req, res) => {
  try {
    const feed = await activityFeed.getFeed(req.params.userId, req.query);
    res.json({ success: true, feed });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/activity/timeline/:userId
 * Get user's timeline
 */
router.get('/api/activity/timeline/:userId', async (req, res) => {
  try {
    const timeline = await activityFeed.getUserTimeline(req.params.userId, req.query);
    res.json({ success: true, timeline });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/activity/:id/like
 * Like activity
 */
router.post('/api/activity/:id/like', async (req, res) => {
  try {
    const { userId } = req.body;
    const activity = await activityFeed.likeActivity(parseInt(req.params.id), userId);
    res.json({ success: true, activity });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/activity/:id/like
 * Unlike activity
 */
router.delete('/api/activity/:id/like', async (req, res) => {
  try {
    const { userId } = req.body;
    const result = await activityFeed.unlikeActivity(parseInt(req.params.id), userId);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/activity/:id/comment
 * Comment on activity
 */
router.post('/api/activity/:id/comment', async (req, res) => {
  try {
    const { userId, comment } = req.body;
    const result = await activityFeed.commentOnActivity(
      parseInt(req.params.id),
      userId,
      comment
    );
    res.json({ success: true, comment: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/activity/:id/comments
 * Get comments
 */
router.get('/api/activity/:id/comments', async (req, res) => {
  try {
    const comments = await activityFeed.getComments(parseInt(req.params.id));
    res.json({ success: true, comments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/activity/:id/repost
 * Repost activity
 */
router.post('/api/activity/:id/repost', async (req, res) => {
  try {
    const { userId, comment } = req.body;
    const repost = await activityFeed.repostActivity(
      parseInt(req.params.id),
      userId,
      comment
    );
    res.json({ success: true, repost });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/activity/trending
 * Get trending activity
 */
router.get('/api/activity/trending', async (req, res) => {
  try {
    const trending = await activityFeed.getTrending(req.query);
    res.json({ success: true, trending });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Communication Routes
// ============================================================================

/**
 * POST /api/messages
 * Send message
 */
router.post('/api/messages', async (req, res) => {
  try {
    const message = await profileComms.sendMessage(req.body);
    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/messages/inbox/:userId
 * Get inbox
 */
router.get('/api/messages/inbox/:userId', async (req, res) => {
  try {
    const inbox = await profileComms.getInbox(req.params.userId, req.query);
    res.json({ success: true, inbox });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/messages/thread/:threadId
 * Get message thread
 */
router.get('/api/messages/thread/:threadId', async (req, res) => {
  try {
    const thread = await profileComms.getThread(parseInt(req.params.threadId));
    res.json({ success: true, thread });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/messages/:id/reply
 * Reply to message
 */
router.post('/api/messages/:id/reply', async (req, res) => {
  try {
    const reply = await profileComms.replyToMessage(parseInt(req.params.id), req.body);
    res.json({ success: true, reply });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/messages/:id/read
 * Mark as read
 */
router.put('/api/messages/:id/read', async (req, res) => {
  try {
    const { userId } = req.body;
    const result = await profileComms.markAsRead(parseInt(req.params.id), userId);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/messages/unread/:userId
 * Get unread count
 */
router.get('/api/messages/unread/:userId', async (req, res) => {
  try {
    const count = await profileComms.getUnreadCount(req.params.userId);
    res.json({ success: true, unreadCount: count });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/messages/:id/route/slack
 * Route message to Slack
 */
router.post('/api/messages/:id/route/slack', async (req, res) => {
  try {
    const routing = await profileComms.routeToSlack(parseInt(req.params.id), req.body);
    res.json({ success: true, routing });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/messages/:id/route/agent
 * Route message to agent
 */
router.post('/api/messages/:id/route/agent', async (req, res) => {
  try {
    const routing = await profileComms.routeToAgent(parseInt(req.params.id), req.body);
    res.json({ success: true, routing });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

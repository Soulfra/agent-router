/**
 * User Profile API Routes
 *
 * REST API for accessing user profiles, playstyles, progress, and goals.
 */

const express = require('express');
const router = express.Router();

const UnifiedUserProfile = require('../lib/unified-user-profile');
const CalStudentLauncher = require('../lib/cal-student-launcher');
const UserPlaystyleTracker = require('../lib/user-playstyle-tracker');
const UserTreeCounter = require('../lib/user-tree-counter');
const IntentClassifier = require('../lib/intent-classifier');

// Initialize services
const profile = new UnifiedUserProfile();
const calLauncher = new CalStudentLauncher();
const playstyleTracker = new UserPlaystyleTracker();
const treeCounter = new UserTreeCounter();
const intentClassifier = new IntentClassifier();

// ============================================================================
// Complete Profile
// ============================================================================

/**
 * GET /api/profile/:userId
 * Get complete user profile
 */
router.get('/api/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const completeProfile = await profile.getCompleteProfile(userId);

    res.json({
      success: true,
      profile: completeProfile
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error getting profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/profile/:userId/segment
 * Get user segment/persona
 */
router.get('/api/profile/:userId/segment', async (req, res) => {
  try {
    const { userId } = req.params;
    const segment = await profile.getUserSegment(userId);

    res.json({
      success: true,
      segment
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error getting segment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/profile/:userId/recommendations
 * Get personalized recommendations
 */
router.get('/api/profile/:userId/recommendations', async (req, res) => {
  try {
    const { userId } = req.params;
    const recommendations = await profile.getRecommendations(userId);

    res.json({
      success: true,
      recommendations
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Playstyle
// ============================================================================

/**
 * GET /api/playstyle/:userId
 * Get user playstyle
 */
router.get('/api/playstyle/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const playstyle = await playstyleTracker.getPlaystyleProfile(userId);

    res.json({
      success: true,
      playstyle
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error getting playstyle:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/playstyle/:userId/analyze
 * Analyze user playstyle from recent interactions
 */
router.get('/api/playstyle/:userId/analyze', async (req, res) => {
  try {
    const { userId } = req.params;
    const { lookbackDays, minInteractions } = req.query;

    const analysis = await playstyleTracker.analyzePlaystyle(userId, {
      lookbackDays: parseInt(lookbackDays) || 30,
      minInteractions: parseInt(minInteractions) || 10
    });

    res.json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error analyzing playstyle:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/playstyle/:userId/interaction
 * Record user interaction
 */
router.post('/api/playstyle/:userId/interaction', async (req, res) => {
  try {
    const { userId } = req.params;
    const { interactionType, content, metadata } = req.body;

    const result = await profile.trackInteraction({
      userId,
      interactionType,
      content,
      metadata
    });

    res.json({
      success: true,
      result
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error recording interaction:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Tree Progress
// ============================================================================

/**
 * GET /api/tree/:userId
 * Get all tree progress for user
 */
router.get('/api/tree/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const allProgress = await treeCounter.getAllProgress(userId);

    res.json({
      success: true,
      trees: allProgress
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error getting tree progress:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tree/:userId/:treeId
 * Get progress in specific tree
 */
router.get('/api/tree/:userId/:treeId', async (req, res) => {
  try {
    const { userId, treeId } = req.params;
    const progress = await treeCounter.getTreeProgress(userId, treeId);

    res.json({
      success: true,
      progress
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error getting tree progress:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/tree/:userId/:treeId/visit
 * Record node visit
 */
router.post('/api/tree/:userId/:treeId/visit', async (req, res) => {
  try {
    const { userId, treeId } = req.params;
    const { nodeId, nodeType, metadata } = req.body;

    const result = await treeCounter.visitNode({
      userId,
      treeId,
      nodeId,
      nodeType,
      metadata
    });

    res.json({
      success: true,
      result
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error recording visit:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/tree/:userId/:treeId/complete
 * Mark node as completed
 */
router.post('/api/tree/:userId/:treeId/complete', async (req, res) => {
  try {
    const { userId, treeId } = req.params;
    const { nodeId, metadata } = req.body;

    const result = await treeCounter.completeNode({
      userId,
      treeId,
      nodeId,
      metadata
    });

    res.json({
      success: true,
      result
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error completing node:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tree/:userId/:treeId/recommend
 * Get next recommended node
 */
router.get('/api/tree/:userId/:treeId/recommend', async (req, res) => {
  try {
    const { userId, treeId } = req.params;
    const recommendation = await treeCounter.getNextRecommendation(userId, treeId);

    res.json({
      success: true,
      recommendation
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error getting recommendation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tree/:treeId/bottlenecks
 * Analyze bottlenecks in tree
 */
router.get('/api/tree/:treeId/bottlenecks', async (req, res) => {
  try {
    const { treeId } = req.params;
    const { minUsers, threshold } = req.query;

    const bottlenecks = await treeCounter.analyzeBottlenecks(treeId, {
      minUsers: parseInt(minUsers) || 5,
      threshold: parseFloat(threshold) || 0.5
    });

    res.json({
      success: true,
      bottlenecks
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error analyzing bottlenecks:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Goals & Intent
// ============================================================================

/**
 * GET /api/goals/:userId
 * Get user goals
 */
router.get('/api/goals/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const goals = await intentClassifier.getActiveGoals(userId);

    res.json({
      success: true,
      goals
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error getting goals:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/goals/:userId/infer
 * Infer goals from recent interactions
 */
router.get('/api/goals/:userId/infer', async (req, res) => {
  try {
    const { userId } = req.params;
    const { lookbackDays, minConfidence } = req.query;

    const goals = await intentClassifier.inferGoals(userId, {
      lookbackDays: parseInt(lookbackDays) || 7,
      minConfidence: parseFloat(minConfidence) || 0.3
    });

    res.json({
      success: true,
      goals
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error inferring goals:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/goals/:userId/:goal/complete
 * Mark goal as completed
 */
router.post('/api/goals/:userId/:goal/complete', async (req, res) => {
  try {
    const { userId, goal } = req.params;

    await intentClassifier.completeGoal(userId, goal);

    res.json({
      success: true,
      message: `Goal ${goal} completed`
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error completing goal:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/goals/:userId/:goal/actions
 * Get recommended actions for goal
 */
router.get('/api/goals/:userId/:goal/actions', async (req, res) => {
  try {
    const { goal } = req.params;
    const actions = intentClassifier.getNextActionForGoal(goal);

    res.json({
      success: true,
      actions
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error getting actions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/goals/:userId/stats
 * Get goal completion statistics
 */
router.get('/api/goals/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params;
    const stats = await intentClassifier.getGoalCompletionStats(userId);

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error getting goal stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Cal Student Launcher
// ============================================================================

/**
 * GET /api/cal/progress
 * Get Cal's first website launch progress
 */
router.get('/api/cal/progress', async (req, res) => {
  try {
    const progress = await calLauncher.getProgress('cal');

    res.json({
      success: true,
      progress
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error getting Cal progress:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cal/milestone/:milestoneId
 * Complete milestone for Cal
 */
router.post('/api/cal/milestone/:milestoneId', async (req, res) => {
  try {
    const { milestoneId } = req.params;
    const { metadata } = req.body;

    const result = await calLauncher.completeMilestone('cal', milestoneId, metadata);

    res.json({
      success: true,
      result
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error completing milestone:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/cal/question
 * Track Cal asking a question
 */
router.post('/api/cal/question', async (req, res) => {
  try {
    const { question, metadata } = req.body;

    const result = await calLauncher.trackQuestion('cal', question, metadata);

    res.json({
      success: true,
      result
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error tracking question:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/cal/help
 * Get personalized help for Cal
 */
router.get('/api/cal/help', async (req, res) => {
  try {
    const help = await calLauncher.getPersonalizedHelp('cal');

    res.json({
      success: true,
      help
    });

  } catch (error) {
    console.error('[ProfileRoutes] Error getting help:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

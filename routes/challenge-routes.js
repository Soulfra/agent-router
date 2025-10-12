/**
 * Domain Challenge API Routes
 *
 * Teacher/student model: Submit challenges to 12 domain AIs, judge results
 */

const express = require('express');
const router = express.Router();
const DomainChallengeBuilder = require('../lib/domain-challenge-builder');
const actionsEngine = require('../lib/actions-engine');

// Initialize challenge builder (will be set by parent router)
let challengeBuilder = null;
let db = null;

/**
 * Initialize the router with database connection
 */
function init(database, ollamaUrl = 'http://localhost:11434') {
  db = database;
  challengeBuilder = new DomainChallengeBuilder(database, ollamaUrl);
  actionsEngine.initEngine(database);
}

/**
 * GET /api/challenges/test-ollama
 * Test Ollama connection and list available models
 */
router.get('/test-ollama', async (req, res) => {
  try {
    if (!challengeBuilder) {
      return res.status(500).json({ status: 'error', error: 'Challenge builder not initialized' });
    }

    const result = await challengeBuilder.testConnection();

    if (!result.connected) {
      return res.status(503).json({
        status: 'error',
        error: 'Ollama not available',
        message: result.error
      });
    }

    res.json({
      status: 'ok',
      connected: true,
      models: result.models.map(m => m.name),
      ollama_url: challengeBuilder.ollamaUrl
    });
  } catch (error) {
    console.error('Ollama test failed:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/challenges/create
 * Create new challenge and generate implementations from all 12 domains
 */
router.post('/create', async (req, res) => {
  try {
    if (!challengeBuilder) {
      return res.status(500).json({ status: 'error', error: 'Challenge builder not initialized' });
    }

    const { prompt, type = 'component', services = [] } = req.body;

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'Prompt is required'
      });
    }

    // This will take a while - consider WebSocket updates in production
    const result = await challengeBuilder.createChallenge(prompt, type, services);

    res.json({
      status: 'ok',
      challenge: result.challenge,
      implementations: result.implementations.length,
      domains_tested: result.domains,
      message: 'Challenge created and implementations generated',
      next_step: `/api/challenges/${result.challenge.challenge_id}`
    });
  } catch (error) {
    console.error('Failed to create challenge:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/challenges
 * Get all challenges (optionally filtered by status)
 */
router.get('/', async (req, res) => {
  try {
    if (!challengeBuilder) {
      return res.status(500).json({ status: 'error', error: 'Challenge builder not initialized' });
    }

    const { status } = req.query;
    const challenges = await challengeBuilder.getAllChallenges(status || null);

    res.json({
      status: 'ok',
      challenges,
      count: challenges.length,
      filter: status ? `status=${status}` : 'all'
    });
  } catch (error) {
    console.error('Failed to get challenges:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/challenges/:challengeId
 * Get challenge details with all implementations for judging
 */
router.get('/:challengeId', async (req, res) => {
  try {
    if (!challengeBuilder) {
      return res.status(500).json({ status: 'error', error: 'Challenge builder not initialized' });
    }

    const { challengeId } = req.params;
    const result = await challengeBuilder.getChallengeDetails(challengeId);

    res.json({
      status: 'ok',
      challenge: result.challenge,
      implementations: result.implementations,
      count: result.implementations.length
    });
  } catch (error) {
    console.error('Failed to get challenge details:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/challenges/:challengeId/judge
 * Submit judgment for an implementation
 */
router.post('/:challengeId/judge', async (req, res) => {
  try {
    if (!challengeBuilder) {
      return res.status(500).json({ status: 'error', error: 'Challenge builder not initialized' });
    }

    const { challengeId } = req.params;
    const {
      implementation_id,
      session_id,
      vote, // 'left' or 'right'
      feedback // { comment, creativity, functionality, codeQuality, brandAlignment }
    } = req.body;

    if (!implementation_id || !session_id || !vote) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: implementation_id, session_id, vote'
      });
    }

    if (!['left', 'right'].includes(vote)) {
      return res.status(400).json({
        status: 'error',
        error: 'Vote must be "left" (dislike) or "right" (like)'
      });
    }

    const judgment = await challengeBuilder.judgeImplementation(
      implementation_id,
      session_id,
      vote,
      feedback || null
    );

    // Trigger action (award XP for reviewing code)
    // Check if session is linked to a user
    const userSession = await db.query(`
      SELECT user_id FROM user_sessions WHERE session_id = $1
    `, [session_id]);

    if (userSession.rows.length > 0) {
      const userId = userSession.rows[0].user_id;
      try {
        await actionsEngine.executeAction(
          userId,
          'review_code',
          {
            implementationId: implementation_id,
            challengeId,
            vote,
            hasFeedback: !!feedback
          },
          null,
          session_id,
          req
        );
      } catch (actionError) {
        console.error('[Challenge] Action trigger error:', actionError);
        // Don't fail the judgment if action trigger fails
      }
    }

    res.json({
      status: 'ok',
      judgment,
      message: `Vote recorded: ${vote === 'right' ? 'liked' : 'disliked'}`
    });
  } catch (error) {
    console.error('Failed to submit judgment:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/challenges/:challengeId/complete
 * Mark challenge as complete and determine winner
 */
router.post('/:challengeId/complete', async (req, res) => {
  try {
    if (!challengeBuilder) {
      return res.status(500).json({ status: 'error', error: 'Challenge builder not initialized' });
    }

    const { challengeId } = req.params;
    const result = await challengeBuilder.completeChallenge(challengeId);

    res.json({
      status: 'ok',
      challenge: result.challenge,
      winner: {
        domain: result.challenge.winner_domain,
        brand: result.challenge.winner_brand,
        score: result.challenge.winner_score
      },
      message: `${result.challenge.winner_brand} wins with score ${result.challenge.winner_score}!`
    });
  } catch (error) {
    console.error('Failed to complete challenge:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/challenges/leaderboard
 * Get domain performance leaderboard
 */
router.get('/leaderboard', async (req, res) => {
  try {
    if (!challengeBuilder) {
      return res.status(500).json({ status: 'error', error: 'Challenge builder not initialized' });
    }

    const leaderboard = await challengeBuilder.getLeaderboard();

    res.json({
      status: 'ok',
      leaderboard,
      count: leaderboard.length
    });
  } catch (error) {
    console.error('Failed to get leaderboard:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/challenges/:challengeId/export-winner
 * Export winning implementation for training data
 */
router.get('/:challengeId/export-winner', async (req, res) => {
  try {
    if (!challengeBuilder) {
      return res.status(500).json({ status: 'error', error: 'Challenge builder not initialized' });
    }

    const { challengeId } = req.params;
    const winner = await challengeBuilder.exportWinner(challengeId);

    // Format as training data
    const trainingData = {
      prompt: winner.challenge_prompt,
      completion: winner.implementation_code,
      metadata: {
        domain: winner.domain_name,
        brand: winner.brand_name,
        score: winner.total_score,
        colors: {
          primary: winner.primary_color,
          secondary: winner.secondary_color
        },
        type: winner.challenge_type
      }
    };

    res.json({
      status: 'ok',
      winner,
      training_data: trainingData,
      message: 'Winner exported successfully'
    });
  } catch (error) {
    console.error('Failed to export winner:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

module.exports = { router, init };

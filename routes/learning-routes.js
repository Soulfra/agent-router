/**
 * Learning Platform API Routes
 *
 * RESTful API for the CryptoZombies-style learning platform.
 * Handles enrollment, progress tracking, lessons, mini-games, and leaderboards.
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function createLearningRoutes({ db, learningEngine, miniGameGenerator, dripCampaignManager }) {
  // ============================================================================
  // LEARNING PATHS
  // ============================================================================

  /**
   * GET /api/learning/paths
   * Get all available learning paths
   */
  router.get('/paths', async (req, res) => {
    try {
      const paths = await learningEngine.getAllLearningPaths();
      res.json({ success: true, paths });
    } catch (error) {
      console.error('[LearningRoutes] Get paths error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/learning/paths/:pathSlug
   * Get specific learning path with lessons
   */
  router.get('/paths/:pathSlug', async (req, res) => {
    try {
      const { pathSlug } = req.params;
      const lessons = await learningEngine.getLessons(pathSlug);

      res.json({ success: true, pathSlug, lessons });
    } catch (error) {
      console.error('[LearningRoutes] Get path error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // ENROLLMENT & PROGRESS
  // ============================================================================

  /**
   * POST /api/learning/enroll
   * Enroll user in a learning path
   *
   * Body: { userId, pathSlug }
   */
  router.post('/enroll', async (req, res) => {
    try {
      const { userId, pathSlug } = req.body;

      if (!userId || !pathSlug) {
        return res.status(400).json({
          success: false,
          error: 'userId and pathSlug are required'
        });
      }

      const enrollment = await learningEngine.enrollUser(userId, pathSlug);

      res.json({
        success: true,
        message: `Enrolled in ${pathSlug}`,
        enrollment
      });
    } catch (error) {
      console.error('[LearningRoutes] Enroll error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/learning/progress/:userId/:pathSlug
   * Get user's progress in a learning path
   */
  router.get('/progress/:userId/:pathSlug', async (req, res) => {
    try {
      const { userId, pathSlug } = req.params;
      const progress = await learningEngine.getUserProgress(userId, pathSlug);

      res.json({ success: true, progress });
    } catch (error) {
      console.error('[LearningRoutes] Get progress error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/learning/next-lesson/:userId/:pathSlug
   * Get user's next available lesson
   */
  router.get('/next-lesson/:userId/:pathSlug', async (req, res) => {
    try {
      const { userId, pathSlug } = req.params;
      const nextLesson = await learningEngine.getNextLesson(userId, pathSlug);

      if (!nextLesson) {
        return res.json({
          success: true,
          message: 'Path completed! No more lessons.',
          nextLesson: null
        });
      }

      res.json({ success: true, nextLesson });
    } catch (error) {
      console.error('[LearningRoutes] Get next lesson error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // LESSON COMPLETION
  // ============================================================================

  /**
   * POST /api/learning/complete-lesson
   * Mark a lesson as completed
   *
   * Body: { userId, lessonId, score, timeSpentMinutes, completionData }
   */
  router.post('/complete-lesson', async (req, res) => {
    try {
      const { userId, lessonId, score, timeSpentMinutes, completionData } = req.body;

      if (!userId || !lessonId) {
        return res.status(400).json({
          success: false,
          error: 'userId and lessonId are required'
        });
      }

      const result = await learningEngine.completeLesson(userId, lessonId, {
        score,
        timeSpentMinutes,
        ...completionData
      });

      res.json({
        success: true,
        message: `Lesson completed! +${result.xp_awarded} XP`,
        ...result
      });
    } catch (error) {
      console.error('[LearningRoutes] Complete lesson error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // ACHIEVEMENTS
  // ============================================================================

  /**
   * GET /api/learning/achievements/:userId
   * Get user's unlocked achievements
   */
  router.get('/achievements/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const achievements = await learningEngine.getUserAchievements(userId);

      res.json({ success: true, achievements });
    } catch (error) {
      console.error('[LearningRoutes] Get achievements error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // LEADERBOARDS
  // ============================================================================

  /**
   * GET /api/learning/leaderboard/:pathSlug
   * Get leaderboard for a specific path
   */
  router.get('/leaderboard/:pathSlug', async (req, res) => {
    try {
      const { pathSlug } = req.params;
      const limit = parseInt(req.query.limit) || 10;

      const leaderboard = await learningEngine.getLeaderboard(pathSlug, limit);

      res.json({ success: true, pathSlug, leaderboard });
    } catch (error) {
      console.error('[LearningRoutes] Get leaderboard error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/learning/leaderboard/global
   * Get global leaderboard across all paths
   */
  router.get('/leaderboard/global', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const leaderboard = await learningEngine.getGlobalLeaderboard(limit);

      res.json({ success: true, leaderboard });
    } catch (error) {
      console.error('[LearningRoutes] Get global leaderboard error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // MINI-GAMES
  // ============================================================================

  /**
   * GET /api/learning/mini-game/today/:pathSlug
   * Get today's mini-game for a path
   */
  router.get('/mini-game/today/:pathSlug', async (req, res) => {
    try {
      const { pathSlug } = req.params;
      const game = await miniGameGenerator.getTodaysGame(pathSlug);

      if (!game) {
        return res.json({
          success: true,
          message: 'No game available today. Check back tomorrow!',
          game: null
        });
      }

      // Don't expose solution to client
      const safeGame = { ...game };
      if (safeGame.game_data?.solution) {
        delete safeGame.game_data.solution;
      }
      if (safeGame.game_data?.correctAnswer) {
        delete safeGame.game_data.correctAnswer;
      }
      if (safeGame.game_data?.correctAnswers) {
        delete safeGame.game_data.correctAnswers;
      }

      res.json({ success: true, game: safeGame });
    } catch (error) {
      console.error('[LearningRoutes] Get today\'s game error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/learning/mini-game/attempt
   * Submit a mini-game attempt
   *
   * Body: { userId, gameId, attemptData }
   */
  router.post('/mini-game/attempt', async (req, res) => {
    try {
      const { userId, gameId, attemptData } = req.body;

      if (!userId || !gameId || !attemptData) {
        return res.status(400).json({
          success: false,
          error: 'userId, gameId, and attemptData are required'
        });
      }

      const result = await learningEngine.attemptMiniGame(userId, gameId, attemptData);

      res.json({
        success: true,
        message: result.success
          ? `Correct! +${result.xp_awarded} XP`
          : 'Try again tomorrow!',
        ...result
      });
    } catch (error) {
      console.error('[LearningRoutes] Mini-game attempt error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/learning/mini-game/stats/:gameId
   * Get statistics for a mini-game
   */
  router.get('/mini-game/stats/:gameId', async (req, res) => {
    try {
      const { gameId } = req.params;
      const stats = await miniGameGenerator.getGameStats(gameId);

      res.json({ success: true, stats });
    } catch (error) {
      console.error('[LearningRoutes] Get game stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/learning/mini-game/history/:userId
   * Get user's mini-game history
   */
  router.get('/mini-game/history/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit) || 10;

      const history = await miniGameGenerator.getUserGameHistory(userId, limit);

      res.json({ success: true, history });
    } catch (error) {
      console.error('[LearningRoutes] Get game history error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // DRIP CAMPAIGN TRACKING
  // ============================================================================

  /**
   * GET /api/drip/track/open/:sendId
   * Track email open (tracking pixel endpoint)
   */
  router.get('/drip/track/open/:sendId', async (req, res) => {
    try {
      const { sendId } = req.params;
      await dripCampaignManager.trackOpen(sendId);

      // Return 1x1 transparent pixel
      const pixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64'
      );

      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': pixel.length
      });
      res.end(pixel);
    } catch (error) {
      console.error('[LearningRoutes] Track open error:', error);
      res.status(200).end(); // Still return 200 to not break email clients
    }
  });

  /**
   * GET /api/drip/track/click/:sendId
   * Track link click and redirect
   */
  router.get('/drip/track/click/:sendId', async (req, res) => {
    try {
      const { sendId } = req.params;
      const { url } = req.query;

      const redirectUrl = await dripCampaignManager.trackClick(sendId, url);

      res.redirect(redirectUrl || 'https://calos.ai');
    } catch (error) {
      console.error('[LearningRoutes] Track click error:', error);
      res.redirect('https://calos.ai');
    }
  });

  /**
   * POST /api/drip/unsubscribe
   * Unsubscribe user from all campaigns
   *
   * Body: { userId }
   */
  router.post('/drip/unsubscribe', async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId is required'
        });
      }

      await dripCampaignManager.unsubscribeUser(userId);

      res.json({
        success: true,
        message: 'You have been unsubscribed from all campaigns'
      });
    } catch (error) {
      console.error('[LearningRoutes] Unsubscribe error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // ADMIN ENDPOINTS
  // ============================================================================

  /**
   * POST /api/learning/admin/generate-daily-games
   * Generate today's mini-games for all paths (admin only)
   */
  router.post('/admin/generate-daily-games', async (req, res) => {
    try {
      // TODO: Add admin authentication middleware
      const games = await miniGameGenerator.generateDailyGames();

      res.json({
        success: true,
        message: `Generated ${games.length} mini-games`,
        games
      });
    } catch (error) {
      console.error('[LearningRoutes] Generate daily games error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/learning/admin/process-drip-sends
   * Process pending drip campaign sends (admin only)
   */
  router.post('/admin/process-drip-sends', async (req, res) => {
    try {
      // TODO: Add admin authentication middleware
      const count = await dripCampaignManager.processPendingSends();

      res.json({
        success: true,
        message: `Processed ${count} pending sends`,
        count
      });
    } catch (error) {
      console.error('[LearningRoutes] Process drip sends error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/learning/admin/campaign-analytics/:campaignId
   * Get analytics for a drip campaign (admin only)
   */
  router.get('/admin/campaign-analytics/:campaignId', async (req, res) => {
    try {
      // TODO: Add admin authentication middleware
      const { campaignId } = req.params;
      const analytics = await dripCampaignManager.getCampaignAnalytics(campaignId);

      res.json({ success: true, analytics });
    } catch (error) {
      console.error('[LearningRoutes] Get campaign analytics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // COLLABORATIVE HINTS (Student Help System)
  // ============================================================================

  /**
   * POST /api/learning/hints
   * Leave a hint for other students
   *
   * Body: { userId, lessonId, hintText, hintType, spoilerLevel }
   */
  router.post('/hints', async (req, res) => {
    try {
      const { userId, lessonId, hintText, hintType, spoilerLevel } = req.body;

      if (!userId || !lessonId || !hintText) {
        return res.status(400).json({
          success: false,
          error: 'userId, lessonId, and hintText are required'
        });
      }

      const hint = await learningEngine.leaveHint(userId, lessonId, hintText, {
        hintType,
        spoilerLevel
      });

      res.json({
        success: true,
        message: 'Hint created! Other students will appreciate your help 🎓',
        hint
      });
    } catch (error) {
      console.error('[LearningRoutes] Leave hint error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/learning/hints/:lessonId
   * Get hints for a lesson
   */
  router.get('/hints/:lessonId', async (req, res) => {
    try {
      const { lessonId } = req.params;
      const limit = parseInt(req.query.limit) || 10;

      const hints = await learningEngine.getHintsForLesson(lessonId, limit);

      res.json({ success: true, hints });
    } catch (error) {
      console.error('[LearningRoutes] Get hints error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/learning/hints/:hintId/rate
   * Rate a hint (upvote/downvote)
   *
   * Body: { userId, rating, reason }
   * rating: 1 for upvote, -1 for downvote
   * reason: 'helpful', 'spoiler', 'spam', 'clever'
   */
  router.post('/hints/:hintId/rate', async (req, res) => {
    try {
      const { hintId } = req.params;
      const { userId, rating, reason } = req.body;

      if (!userId || !rating) {
        return res.status(400).json({
          success: false,
          error: 'userId and rating are required'
        });
      }

      if (rating !== 1 && rating !== -1) {
        return res.status(400).json({
          success: false,
          error: 'rating must be 1 (upvote) or -1 (downvote)'
        });
      }

      const ratingResult = await learningEngine.rateHint(userId, hintId, rating, reason);

      res.json({
        success: true,
        message: rating === 1 ? 'Marked as helpful!' : 'Marked as spoiler/spam',
        rating: ratingResult
      });
    } catch (error) {
      console.error('[LearningRoutes] Rate hint error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/learning/hints/leaderboard
   * Get hint leaderboard (most helpful hint-givers)
   */
  router.get('/hints/leaderboard', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const leaderboard = await learningEngine.getHintLeaderboard(limit);

      res.json({ success: true, leaderboard });
    } catch (error) {
      console.error('[LearningRoutes] Get hint leaderboard error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/learning/hints/user/:userId
   * Get user's hint stats and recent hints
   */
  router.get('/hints/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const hintStats = await learningEngine.getUserHintStats(userId);

      res.json({ success: true, ...hintStats });
    } catch (error) {
      console.error('[LearningRoutes] Get user hint stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // KNOWLEDGE INTEGRATION (Migration 068)
  // ============================================================================

  /**
   * GET /api/learning/lessons/:lessonId/common-errors
   * Get common debugging patterns for a lesson
   */
  router.get('/lessons/:lessonId/common-errors', async (req, res) => {
    try {
      const { lessonId } = req.params;
      const limit = parseInt(req.query.limit) || 5;

      // Use the view created in migration 068
      const result = await db.query(`
        SELECT
          pattern_name,
          problem_description,
          solution_description,
          error_count,
          resolution_rate,
          avg_resolution_time_seconds
        FROM lesson_common_errors
        WHERE lesson_id = $1
        ORDER BY error_count DESC
        LIMIT $2
      `, [lessonId, limit]);

      res.json({
        success: true,
        lessonId,
        commonErrors: result.rows
      });
    } catch (error) {
      console.error('[LearningRoutes] Get common errors error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/learning/lessons/:lessonId/debug-session
   * Record a debugging session during a lesson
   *
   * Body: {
   *   userId,
   *   errorType,
   *   errorMessage,
   *   stackTrace,
   *   studentCode,
   *   browserInfo,
   *   lessonStep
   * }
   */
  router.post('/lessons/:lessonId/debug-session', async (req, res) => {
    try {
      const { lessonId } = req.params;
      const {
        userId,
        errorType,
        errorMessage,
        stackTrace,
        studentCode,
        browserInfo,
        lessonStep
      } = req.body;

      if (!userId || !errorType || !errorMessage) {
        return res.status(400).json({
          success: false,
          error: 'userId, errorType, and errorMessage are required'
        });
      }

      // Try to match against existing patterns
      const patternMatch = await db.query(`
        SELECT id, pattern_name, solution_description
        FROM knowledge_patterns
        WHERE
          error_type = $1 OR
          keywords && $2::text[] OR
          problem_description ILIKE '%' || $3 || '%'
        ORDER BY occurrence_count DESC
        LIMIT 1
      `, [errorType, [errorType], errorMessage]);

      const patternId = patternMatch.rows[0]?.id || null;

      // Insert debug session
      const session = await db.query(`
        INSERT INTO lesson_debug_sessions (
          user_id,
          lesson_id,
          pattern_id,
          error_type,
          error_message,
          stack_trace,
          student_code,
          browser_info,
          lesson_step
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING session_id, pattern_id
      `, [
        userId,
        lessonId,
        patternId,
        errorType,
        errorMessage,
        stackTrace,
        studentCode,
        browserInfo,
        lessonStep
      ]);

      const response = {
        success: true,
        sessionId: session.rows[0].session_id,
        message: 'Debug session recorded'
      };

      // If we found a matching pattern, include the solution hint
      if (patternMatch.rows[0]) {
        response.hint = {
          pattern: patternMatch.rows[0].pattern_name,
          solution: patternMatch.rows[0].solution_description
        };
      }

      res.json(response);
    } catch (error) {
      console.error('[LearningRoutes] Record debug session error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PATCH /api/learning/debug-session/:sessionId/resolve
   * Mark a debug session as resolved
   *
   * Body: {
   *   resolutionMethod: 'hint' | 'pattern' | 'trial-and-error' | 'gave-up'
   * }
   */
  router.patch('/debug-session/:sessionId/resolve', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { resolutionMethod } = req.body;

      const result = await db.query(`
        UPDATE lesson_debug_sessions
        SET
          resolved = true,
          resolved_at = NOW(),
          resolution_time = EXTRACT(EPOCH FROM (NOW() - session_started_at)),
          resolution_method = $2
        WHERE session_id = $1
        RETURNING session_id, resolution_time
      `, [sessionId, resolutionMethod]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Debug session not found'
        });
      }

      res.json({
        success: true,
        sessionId: result.rows[0].session_id,
        resolutionTimeSeconds: result.rows[0].resolution_time
      });
    } catch (error) {
      console.error('[LearningRoutes] Resolve debug session error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createLearningRoutes;

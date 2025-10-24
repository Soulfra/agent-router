/**
 * Free Learning Routes
 *
 * Anonymous learning without account creation.
 * Privacy-first: Uses fingerprint IDs, restores original cookies on exit.
 *
 * Routes:
 * POST /api/learning/start-free - Create anonymous session
 * GET /api/learning/session/:fingerprintId - Get session stats
 * POST /api/learning/complete/:lessonId - Complete lesson (anonymous)
 * POST /api/learning/track-visit - Track homepage click
 * GET /api/learning/suggest-paths/:fingerprintId - Get suggested learning paths
 * POST /api/learning/migrate-to-account - Migrate anonymous session to user account
 *
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * POST /api/learning/start-free
 * Create anonymous learning session
 *
 * Body:
 * {
 *   fingerprintId: "abc123...",
 *   cookieInterests: {"privacy": 3, "developer": 5},
 *   cookieCategories: {"developer": 2, "privacy": 1},
 *   suggestedPaths: [{"path": "advanced-programming", "reason": "...", "confidence": "high"}]
 * }
 */
router.post('/start-free', async (req, res) => {
  try {
    const {
      fingerprintId,
      cookieInterests = {},
      cookieCategories = {},
      suggestedPaths = []
    } = req.body;

    if (!fingerprintId || fingerprintId.length !== 16) {
      return res.status(400).json({
        error: 'Invalid fingerprintId',
        message: 'fingerprintId must be 16 characters'
      });
    }

    // Get or create session
    const result = await pool.query(
      `SELECT * FROM get_or_create_anonymous_session($1, $2, $3, $4)`,
      [fingerprintId, cookieInterests, cookieCategories, suggestedPaths]
    );

    const session = result.rows[0];

    res.json({
      success: true,
      session: {
        id: session.id,
        fingerprintId: session.fingerprint_id,
        xp: session.xp,
        level: session.level,
        lessonsCompleted: session.lessons_completed,
        suggestedPaths: session.suggested_paths,
        createdAt: session.created_at,
        lastActiveAt: session.last_active_at
      },
      message: 'Start learning free! No account required.'
    });

  } catch (error) {
    console.error('[FreeLearning] Error starting session:', error);
    res.status(500).json({
      error: 'Failed to start learning session',
      message: error.message
    });
  }
});

/**
 * GET /api/learning/session/:fingerprintId
 * Get anonymous session stats
 */
router.get('/session/:fingerprintId', async (req, res) => {
  try {
    const { fingerprintId } = req.params;

    const result = await pool.query(
      `SELECT * FROM get_anonymous_session_stats($1)`,
      [fingerprintId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'No anonymous session found for this fingerprint'
      });
    }

    const stats = result.rows[0];

    res.json({
      success: true,
      stats: {
        sessionId: stats.session_id,
        xp: stats.xp,
        level: stats.level,
        lessonsCompleted: stats.lessons_completed,
        totalTimeSeconds: stats.total_time_seconds,
        suggestedPaths: stats.suggested_paths,
        topInterests: stats.top_interests,
        recentLessons: stats.recent_lessons,
        achievementsEarned: stats.achievements_earned
      }
    });

  } catch (error) {
    console.error('[FreeLearning] Error getting session:', error);
    res.status(500).json({
      error: 'Failed to get session stats',
      message: error.message
    });
  }
});

/**
 * POST /api/learning/complete/:lessonId
 * Complete a lesson (anonymous)
 *
 * Body:
 * {
 *   fingerprintId: "abc123...",
 *   domain: "soulfra.com",
 *   lessonSlug: "javascript-basics-1",
 *   timeSpentSeconds: 180,
 *   xpEarned: 10,
 *   codeSubmitted: "console.log('hello')",
 *   testResults: {"passed": 5, "failed": 0}
 * }
 */
router.post('/complete/:lessonId', async (req, res) => {
  try {
    const { lessonId } = req.params;
    const {
      fingerprintId,
      domain,
      lessonSlug,
      timeSpentSeconds,
      xpEarned = 10,
      codeSubmitted = null,
      testResults = null
    } = req.body;

    if (!fingerprintId) {
      return res.status(400).json({
        error: 'Missing fingerprintId',
        message: 'fingerprintId is required'
      });
    }

    if (!domain || !lessonSlug) {
      return res.status(400).json({
        error: 'Missing lesson details',
        message: 'domain and lessonSlug are required'
      });
    }

    // Complete lesson
    const result = await pool.query(
      `SELECT * FROM complete_anonymous_lesson($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        fingerprintId,
        lessonId,
        domain,
        lessonSlug,
        timeSpentSeconds,
        xpEarned,
        codeSubmitted,
        testResults
      ]
    );

    const completion = result.rows[0];

    // Get updated session stats
    const statsResult = await pool.query(
      `SELECT * FROM get_anonymous_session_stats($1)`,
      [fingerprintId]
    );

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      completion: {
        lessonId: completion.lesson_id,
        domain: completion.domain,
        lessonSlug: completion.lesson_slug,
        xpEarned: completion.xp_earned,
        completedAt: completion.completed_at,
        attempts: completion.attempts
      },
      session: {
        xp: stats.xp,
        level: stats.level,
        lessonsCompleted: stats.lessons_completed,
        totalTimeSeconds: stats.total_time_seconds
      },
      message: `Lesson completed! +${xpEarned} XP`
    });

  } catch (error) {
    console.error('[FreeLearning] Error completing lesson:', error);
    res.status(500).json({
      error: 'Failed to complete lesson',
      message: error.message
    });
  }
});

/**
 * POST /api/learning/track-visit
 * Track homepage visit/click
 *
 * Body:
 * {
 *   fingerprintId: "abc123...",
 *   url: "https://soulfra.com",
 *   pathname: "/",
 *   pageTitle: "CalOS - Start Learning Free",
 *   referrer: "https://google.com",
 *   elementClicked: "button",
 *   clickText: "Start Learning Free",
 *   clickPosition: {"x": 123, "y": 456},
 *   timeOnPageSeconds: 45,
 *   interestsDetected: ["developer", "privacy"]
 * }
 */
router.post('/track-visit', async (req, res) => {
  try {
    const {
      fingerprintId,
      url,
      pathname,
      pageTitle,
      referrer = null,
      elementClicked = null,
      clickText = null,
      clickPosition = null,
      timeOnPageSeconds = 0,
      interestsDetected = []
    } = req.body;

    if (!fingerprintId) {
      return res.status(400).json({
        error: 'Missing fingerprintId',
        message: 'fingerprintId is required'
      });
    }

    // Track visit
    const result = await pool.query(
      `SELECT * FROM track_anonymous_page_visit($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        fingerprintId,
        url,
        pathname,
        pageTitle,
        referrer,
        elementClicked,
        clickText,
        clickPosition,
        timeOnPageSeconds,
        interestsDetected
      ]
    );

    const visit = result.rows[0];

    res.json({
      success: true,
      visit: {
        id: visit.id,
        pathname: visit.pathname,
        elementClicked: visit.element_clicked,
        clickText: visit.click_text,
        timeOnPageSeconds: visit.time_on_page_seconds,
        interestsDetected: visit.interests_detected,
        visitedAt: visit.visited_at
      }
    });

  } catch (error) {
    console.error('[FreeLearning] Error tracking visit:', error);
    res.status(500).json({
      error: 'Failed to track visit',
      message: error.message
    });
  }
});

/**
 * GET /api/learning/suggest-paths/:fingerprintId
 * Get suggested learning paths based on cookies and behavior
 */
router.get('/suggest-paths/:fingerprintId', async (req, res) => {
  try {
    const { fingerprintId } = req.params;

    // Get session
    const sessionResult = await pool.query(
      `SELECT * FROM anonymous_learning_sessions WHERE fingerprint_id = $1 AND migrated_to_user_id IS NULL`,
      [fingerprintId]
    );

    if (sessionResult.rows.length === 0) {
      return res.json({
        success: true,
        suggestions: [{
          path: 'getting-started',
          reason: 'New visitor - start with the basics',
          confidence: 'low',
          firstLesson: {
            domain: 'soulfra.com',
            slug: 'welcome-to-calos',
            title: 'Welcome to CalOS'
          }
        }]
      });
    }

    const session = sessionResult.rows[0];

    // Get recent completions to understand progress
    const completionsResult = await pool.query(
      `SELECT domain, COUNT(*) as count
       FROM anonymous_lesson_completions
       WHERE session_id = $1
       GROUP BY domain
       ORDER BY count DESC
       LIMIT 3`,
      [session.id]
    );

    const suggestions = session.suggested_paths || [];

    // Add progress-based suggestions
    if (session.lessons_completed >= 5) {
      suggestions.push({
        path: 'intermediate-programming',
        reason: `${session.lessons_completed} lessons completed - ready for more`,
        confidence: 'high',
        domain: completionsResult.rows[0]?.domain || 'soulfra.com'
      });
    }

    res.json({
      success: true,
      suggestions: suggestions.length > 0 ? suggestions : [{
        path: 'getting-started',
        reason: 'Start your learning journey',
        confidence: 'medium'
      }],
      session: {
        xp: session.xp,
        level: session.level,
        lessonsCompleted: session.lessons_completed
      }
    });

  } catch (error) {
    console.error('[FreeLearning] Error suggesting paths:', error);
    res.status(500).json({
      error: 'Failed to suggest paths',
      message: error.message
    });
  }
});

/**
 * POST /api/learning/migrate-to-account
 * Migrate anonymous session to user account
 *
 * Body:
 * {
 *   fingerprintId: "abc123...",
 *   userId: 123
 * }
 */
router.post('/migrate-to-account', async (req, res) => {
  try {
    const { fingerprintId, userId } = req.body;

    if (!fingerprintId || !userId) {
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'fingerprintId and userId are required'
      });
    }

    // Migrate session
    const result = await pool.query(
      `SELECT migrate_anonymous_session_to_user($1, $2) as success`,
      [fingerprintId, userId]
    );

    const success = result.rows[0].success;

    if (!success) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'No anonymous session found to migrate'
      });
    }

    // Get migrated stats
    const statsResult = await pool.query(
      `SELECT xp, lessons_completed, total_time_seconds
       FROM anonymous_learning_sessions
       WHERE fingerprint_id = $1 AND migrated_to_user_id = $2`,
      [fingerprintId, userId]
    );

    const stats = statsResult.rows[0];

    res.json({
      success: true,
      migrated: {
        lessonsCompleted: stats.lessons_completed,
        xpTransferred: stats.xp,
        totalTimeSeconds: stats.total_time_seconds
      },
      message: 'Anonymous progress migrated to your account!'
    });

  } catch (error) {
    console.error('[FreeLearning] Error migrating session:', error);
    res.status(500).json({
      error: 'Failed to migrate session',
      message: error.message
    });
  }
});

/**
 * GET /api/learning/privacy-report/:fingerprintId
 * Get privacy report (what data we collected)
 */
router.get('/privacy-report/:fingerprintId', async (req, res) => {
  try {
    const { fingerprintId } = req.params;

    const sessionResult = await pool.query(
      `SELECT
        fingerprint_id,
        cookie_interests,
        cookie_categories,
        suggested_paths,
        xp,
        level,
        lessons_completed,
        total_time_seconds,
        created_at,
        last_active_at
       FROM anonymous_learning_sessions
       WHERE fingerprint_id = $1 AND migrated_to_user_id IS NULL`,
      [fingerprintId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    const session = sessionResult.rows[0];

    res.json({
      success: true,
      privacyReport: {
        guarantee: 'Zero raw cookie values stored. Original cookies restored on page exit.',
        dataStored: {
          fingerprintId: true,
          cookieValues: false,
          cookieCategories: true,
          interests: true,
          personalInfo: false,
          email: false,
          name: false
        },
        collected: {
          cookieCategories: Object.keys(session.cookie_categories || {}),
          interests: Object.keys(session.cookie_interests || {}),
          suggestedPaths: (session.suggested_paths || []).map(p => p.path),
          lessonsCompleted: session.lessons_completed,
          xp: session.xp,
          level: session.level,
          totalTimeSeconds: session.total_time_seconds
        },
        timeline: {
          firstVisit: session.created_at,
          lastActive: session.last_active_at
        },
        migration: {
          available: true,
          message: 'Create account to keep your progress forever'
        }
      }
    });

  } catch (error) {
    console.error('[FreeLearning] Error generating privacy report:', error);
    res.status(500).json({
      error: 'Failed to generate privacy report',
      message: error.message
    });
  }
});

module.exports = router;

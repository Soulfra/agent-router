/**
 * Voice Journal Routes
 *
 * API endpoints for daily voice journaling system:
 * - Start/stop autonomous mode
 * - Process recordings on-demand
 * - View session history
 * - Get analytics and streaks
 * - Manage schedules
 *
 * Routes:
 * POST   /api/voice-journal/start              - Start daily autonomous mode
 * POST   /api/voice-journal/stop               - Stop autonomous mode
 * POST   /api/voice-journal/process            - Process recording on-demand
 * GET    /api/voice-journal/status             - Get orchestrator status
 * GET    /api/voice-journal/sessions           - Get session history
 * GET    /api/voice-journal/sessions/:id       - Get specific session
 * GET    /api/voice-journal/analytics          - Get analytics & streaks
 * GET    /api/voice-journal/schedule           - Get current schedule
 * PUT    /api/voice-journal/schedule           - Update schedule
 * GET    /api/voice-journal/platforms          - Get platform status
 * POST   /api/voice-journal/test-publish       - Test publication (dry run)
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for audio uploads
const upload = multer({
  dest: '/tmp/voice-journal-uploads/',
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'audio/mpeg',
      'audio/mp4',
      'audio/m4a',
      'audio/wav',
      'audio/x-m4a'
    ];

    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(mp3|m4a|wav)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files allowed.'));
    }
  }
});

let orchestrator = null;

/**
 * Initialize orchestrator
 */
function initOrchestrator(orch) {
  orchestrator = orch;
}

/**
 * Ensure orchestrator is initialized
 */
function requireOrchestrator(req, res, next) {
  if (!orchestrator) {
    return res.status(503).json({
      error: 'Voice journal orchestrator not initialized',
      hint: 'Server may still be starting up'
    });
  }
  next();
}

/**
 * POST /api/voice-journal/start
 * Start daily autonomous mode
 */
router.post('/start', requireOrchestrator, async (req, res) => {
  try {
    const {
      userId,
      schedule = '09:00',
      timezone = 'America/New_York',
      autoPub = ['mastodon', 'blog'],
      autoExtract = true,
      autoRoute = true,
      promptType = 'daily-reflection'
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'userId required'
      });
    }

    const result = await orchestrator.start(userId, {
      schedule,
      timezone,
      autoPub,
      autoExtract,
      autoRoute,
      promptType
    });

    res.json({
      success: true,
      message: `Daily voice journal started for ${userId}`,
      schedule: result
    });
  } catch (error) {
    console.error('[VoiceJournalRoutes] Error starting:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * POST /api/voice-journal/stop
 * Stop daily autonomous mode
 */
router.post('/stop', requireOrchestrator, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'userId required'
      });
    }

    const result = await orchestrator.stop(userId);

    res.json({
      success: true,
      message: `Daily voice journal stopped for ${userId}`,
      result
    });
  } catch (error) {
    console.error('[VoiceJournalRoutes] Error stopping:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * POST /api/voice-journal/process
 * Process recording on-demand
 */
router.post('/process', requireOrchestrator, upload.single('audio'), async (req, res) => {
  try {
    const {
      userId,
      platforms = 'mastodon,blog',
      transcript = null,
      githubRepo = null
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'userId required'
      });
    }

    let audioPath = null;

    // Get audio path (from upload or body)
    if (req.file) {
      audioPath = req.file.path;
    } else if (req.body.audioPath) {
      audioPath = req.body.audioPath;
    } else {
      return res.status(400).json({
        error: 'Audio file required (upload or audioPath)'
      });
    }

    // Parse platforms
    const platformList = typeof platforms === 'string'
      ? platforms.split(',').map(p => p.trim())
      : platforms;

    // Process recording
    const session = await orchestrator.processRecording({
      userId,
      audioPath,
      transcript,
      platforms: platformList,
      metadata: {
        githubRepo,
        source: 'api',
        uploadedFile: req.file?.originalname
      }
    });

    res.json({
      success: true,
      message: 'Recording processed successfully',
      session: {
        sessionId: session.sessionId,
        status: session.status,
        narrative: {
          title: session.narrative?.outputs?.story?.title,
          themes: session.narrative?.analysis?.themes?.map(t => t.name),
          insights: session.narrative?.analysis?.insights?.length
        },
        routing: session.routing ? {
          primaryBrand: session.routing.routing.primary.brand,
          primaryDomain: session.routing.routing.primary.domain,
          confidence: session.routing.routing.primary.confidence
        } : null,
        published: session.published ? {
          platforms: Object.keys(session.published.published),
          urls: session.published.urls
        } : null,
        extracted: session.extracted ? {
          devTasks: session.extracted.devTasks.length,
          mathConcepts: session.extracted.mathConcepts.length,
          productIdeas: session.extracted.productIdeas.length,
          researchQuestions: session.extracted.researchQuestions.length
        } : null
      }
    });
  } catch (error) {
    console.error('[VoiceJournalRoutes] Error processing:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /api/voice-journal/status
 * Get orchestrator status
 */
router.get('/status', requireOrchestrator, (req, res) => {
  try {
    const { userId } = req.query;

    const status = orchestrator.getStatus(userId || null);

    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('[VoiceJournalRoutes] Error getting status:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /api/voice-journal/sessions
 * Get session history
 */
router.get('/sessions', requireOrchestrator, async (req, res) => {
  try {
    const {
      userId,
      limit = 30,
      offset = 0,
      status = null
    } = req.query;

    if (!userId) {
      return res.status(400).json({
        error: 'userId required'
      });
    }

    const history = await orchestrator.getSessionHistory(userId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      status
    });

    res.json({
      success: true,
      ...history
    });
  } catch (error) {
    console.error('[VoiceJournalRoutes] Error getting sessions:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /api/voice-journal/sessions/:id
 * Get specific session details
 */
router.get('/sessions/:id', requireOrchestrator, async (req, res) => {
  try {
    const { id } = req.params;

    if (!orchestrator.db) {
      return res.status(503).json({
        error: 'Database not configured'
      });
    }

    const result = await orchestrator.db.query(`
      SELECT *
      FROM voice_journal_sessions
      WHERE session_id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session: result.rows[0]
    });
  } catch (error) {
    console.error('[VoiceJournalRoutes] Error getting session:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /api/voice-journal/analytics
 * Get analytics and streaks
 */
router.get('/analytics', requireOrchestrator, async (req, res) => {
  try {
    const { userId, period = '30days' } = req.query;

    if (!userId) {
      return res.status(400).json({
        error: 'userId required'
      });
    }

    const analytics = await orchestrator.getAnalytics(userId, { period });

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('[VoiceJournalRoutes] Error getting analytics:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /api/voice-journal/schedule
 * Get current schedule
 */
router.get('/schedule', requireOrchestrator, async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        error: 'userId required'
      });
    }

    if (!orchestrator.db) {
      return res.status(503).json({
        error: 'Database not configured'
      });
    }

    const result = await orchestrator.db.query(`
      SELECT *
      FROM voice_journal_schedules
      WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'No schedule found',
        hint: 'Use POST /api/voice-journal/start to create one'
      });
    }

    res.json({
      success: true,
      schedule: result.rows[0]
    });
  } catch (error) {
    console.error('[VoiceJournalRoutes] Error getting schedule:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * PUT /api/voice-journal/schedule
 * Update schedule
 */
router.put('/schedule', requireOrchestrator, async (req, res) => {
  try {
    const {
      userId,
      schedule,
      timezone,
      autoPub,
      autoExtract,
      autoRoute,
      promptType
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'userId required'
      });
    }

    // Stop current schedule
    await orchestrator.stop(userId);

    // Start new schedule
    const result = await orchestrator.start(userId, {
      schedule,
      timezone,
      autoPub,
      autoExtract,
      autoRoute,
      promptType
    });

    res.json({
      success: true,
      message: 'Schedule updated',
      schedule: result
    });
  } catch (error) {
    console.error('[VoiceJournalRoutes] Error updating schedule:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /api/voice-journal/platforms
 * Get platform status
 */
router.get('/platforms', requireOrchestrator, (req, res) => {
  try {
    const status = orchestrator.autoPublisher.getPlatformStatus();

    res.json({
      success: true,
      platforms: status
    });
  } catch (error) {
    console.error('[VoiceJournalRoutes] Error getting platforms:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * POST /api/voice-journal/test-publish
 * Test publication (dry run)
 */
router.post('/test-publish', requireOrchestrator, async (req, res) => {
  try {
    const {
      userId,
      sessionId,
      platforms = ['mastodon', 'blog']
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: 'sessionId required'
      });
    }

    if (!orchestrator.db) {
      return res.status(503).json({
        error: 'Database not configured'
      });
    }

    // Get session
    const result = await orchestrator.db.query(`
      SELECT narrative_summary, primary_brand
      FROM voice_journal_sessions
      WHERE session_id = $1
    `, [sessionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    // Mock narrative for testing
    const narrative = {
      outputs: {
        story: {
          title: result.rows[0].narrative_summary?.title || 'Test Story',
          subtitle: 'Test subtitle',
          takeaway: 'Test takeaway'
        },
        blog: {
          title: result.rows[0].narrative_summary?.title || 'Test Blog',
          readingTime: 5,
          tags: ['test']
        },
        thread: {
          tweets: [
            { text: 'Test tweet 1' },
            { text: 'Test tweet 2' }
          ]
        }
      },
      analysis: {
        themes: result.rows[0].narrative_summary?.themes?.map(name => ({ name })) || []
      }
    };

    const routing = {
      routing: {
        primary: {
          brand: result.rows[0].primary_brand || 'calos',
          domain: 'calos.ai'
        }
      }
    };

    const testResult = await orchestrator.autoPublisher.testPublish({
      narrative,
      routing,
      platforms
    });

    res.json({
      success: true,
      message: 'Dry run complete',
      test: testResult
    });
  } catch (error) {
    console.error('[VoiceJournalRoutes] Error testing publish:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;
module.exports.initOrchestrator = initOrchestrator;

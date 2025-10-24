/**
 * Voice Project Routes
 *
 * API endpoints for voice-driven project context system.
 * Mobile-friendly voice recording → transcription → project tagging → export.
 *
 * Routes:
 * - POST /api/voice/yap - Record voice and route to project
 * - GET /api/voice/transcriptions - List user's transcriptions
 * - GET /api/voice/transcriptions/:id - Get specific transcription
 * - POST /api/voice/export - Export transcription to PDF/Markdown
 * - GET /api/voice/projects - List all projects
 * - GET /api/voice/projects/:slug - Get project details
 * - GET /api/voice/stats - Get voice router stats
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const VoiceProjectRouter = require('../lib/voice-project-router');
const ProjectLogScraper = require('../lib/project-log-scraper');
const ProjectExportEngine = require('../lib/project-export-engine');

// Database connection (injected via initRoutes)
let db = null;
let voiceRouter = null;
let logScraper = null;
let exportEngine = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;

  // Initialize services
  voiceRouter = new VoiceProjectRouter(db);
  logScraper = new ProjectLogScraper(db);
  exportEngine = new ProjectExportEngine(db);

  // Initialize async (don't block server startup)
  Promise.all([
    voiceRouter.initialize(),
    exportEngine.initialize()
  ]).then(() => {
    console.log('[VoiceProjectRoutes] Services initialized');
  }).catch(error => {
    console.error('[VoiceProjectRoutes] Initialization failed:', error);
  });

  return router;
}

// Configure multer for audio uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedFormats = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/x-m4a'];
    if (allowedFormats.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`));
    }
  }
});

/**
 * Middleware: Require user authentication
 */
async function requireUserAuth(req, res, next) {
  const userId = req.session?.userId || req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({
      status: 'error',
      error: 'Authentication required'
    });
  }

  try {
    const userQuery = await db.query(
      'SELECT user_id, email, username, tenant_id FROM users WHERE user_id = $1',
      [userId]
    );

    if (userQuery.rows.length === 0) {
      return res.status(401).json({
        status: 'error',
        error: 'User not found'
      });
    }

    req.user = userQuery.rows[0];

    // Set RLS context
    await db.query(
      'SELECT set_request_context($1, $2, $3)',
      [req.user.user_id, req.user.tenant_id, 'user']
    );

    next();
  } catch (error) {
    console.error('[VoiceProjectRoutes] Auth error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Authentication failed'
    });
  }
}

/**
 * POST /api/voice/yap
 * Main endpoint: Upload voice recording and process
 *
 * Body: FormData with 'audio' file
 * Optional query params:
 * - project: Force specific project slug
 * - device: Source device name
 */
router.post('/yap', requireUserAuth, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        error: 'No audio file provided'
      });
    }

    console.log(`[VoiceYap] Processing ${req.file.size} bytes from ${req.user.username}`);

    // Extract audio format from mimetype
    const audioFormat = req.file.mimetype.split('/')[1] || 'webm';

    // Get optional params
    const explicitProjectSlug = req.query.project || req.body.project || null;
    const sourceDevice = req.query.device || req.body.device || req.headers['user-agent']?.substring(0, 100) || 'unknown';

    // Get session ID if available
    const sessionResult = await db.query(
      `SELECT session_id FROM user_sessions
       WHERE user_id = $1 AND revoked = FALSE
       ORDER BY last_active_at DESC LIMIT 1`,
      [req.user.user_id]
    );
    const sessionId = sessionResult.rows[0]?.session_id || null;

    // Process voice
    const result = await voiceRouter.processVoice({
      audioBuffer: req.file.buffer,
      audioFormat,
      userId: req.user.user_id,
      sessionId,
      tenantId: req.user.tenant_id,
      sourceDevice,
      sourceIp: req.ip,
      explicitProjectSlug
    });

    res.json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('[VoiceYap] Error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Voice processing failed',
      details: error.message
    });
  }
});

/**
 * GET /api/voice/transcriptions
 * List user's recent transcriptions
 *
 * Query params:
 * - limit: Max results (default 50)
 * - project: Filter by project slug
 */
router.get('/transcriptions', requireUserAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const projectSlug = req.query.project || null;

    const transcriptions = projectSlug
      ? await voiceRouter.getProjectTranscriptions(projectSlug, limit)
      : await voiceRouter.getUserTranscriptions(req.user.user_id, limit);

    res.json({
      status: 'success',
      data: {
        transcriptions,
        total: transcriptions.length
      }
    });

  } catch (error) {
    console.error('[VoiceTranscriptions] Error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch transcriptions'
    });
  }
});

/**
 * GET /api/voice/transcriptions/:id
 * Get specific transcription with full details
 */
router.get('/transcriptions/:id', requireUserAuth, async (req, res) => {
  try {
    const transcription = await voiceRouter.getTranscription(req.params.id);

    if (!transcription) {
      return res.status(404).json({
        status: 'error',
        error: 'Transcription not found'
      });
    }

    // Check ownership
    if (transcription.user_id !== req.user.user_id) {
      return res.status(403).json({
        status: 'error',
        error: 'Access denied'
      });
    }

    // Get associated logs
    const logs = await logScraper.getTranscriptionLogs(req.params.id);

    res.json({
      status: 'success',
      data: {
        transcription,
        logs,
        log_count: logs.length
      }
    });

  } catch (error) {
    console.error('[VoiceTranscription] Error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch transcription'
    });
  }
});

/**
 * POST /api/voice/export
 * Export transcription to PDF/Markdown/etc
 *
 * Body:
 * {
 *   transcription_id: "uuid",
 *   format: "pdf" | "markdown" | "json" | "html",
 *   title: "optional custom title"
 * }
 */
router.post('/export', requireUserAuth, async (req, res) => {
  try {
    const {
      transcription_id,
      format = 'pdf',
      title = null,
      include_voice_transcript = true,
      include_session_logs = true,
      include_code_diffs = false,
      include_ai_responses = true
    } = req.body;

    if (!transcription_id) {
      return res.status(400).json({
        status: 'error',
        error: 'transcription_id is required'
      });
    }

    // Verify transcription exists and user owns it
    const transcription = await voiceRouter.getTranscription(transcription_id);

    if (!transcription) {
      return res.status(404).json({
        status: 'error',
        error: 'Transcription not found'
      });
    }

    if (transcription.user_id !== req.user.user_id) {
      return res.status(403).json({
        status: 'error',
        error: 'Access denied'
      });
    }

    // Export
    const result = await exportEngine.export({
      transcriptionId: transcription_id,
      projectId: transcription.project_id,
      userId: req.user.user_id,
      format,
      destination: 'local',
      includeVoiceTranscript: include_voice_transcript,
      includeSessionLogs: include_session_logs,
      includeCodeDiffs: include_code_diffs,
      includeAIResponses: include_ai_responses,
      title
    });

    res.json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('[VoiceExport] Error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Export failed',
      details: error.message
    });
  }
});

/**
 * GET /api/voice/exports/:id
 * Download export artifact
 */
router.get('/exports/:id', requireUserAuth, async (req, res) => {
  try {
    const artifact = await exportEngine.getArtifact(req.params.id);

    if (!artifact) {
      return res.status(404).json({
        status: 'error',
        error: 'Export not found'
      });
    }

    // Check ownership
    if (artifact.user_id !== req.user.user_id) {
      return res.status(403).json({
        status: 'error',
        error: 'Access denied'
      });
    }

    // Send file
    res.download(artifact.storage_path, artifact.filename);

  } catch (error) {
    console.error('[VoiceDownload] Error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Download failed'
    });
  }
});

/**
 * GET /api/voice/projects
 * List all available projects
 */
router.get('/projects', requireUserAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        project_id, project_slug, project_name, project_type,
        brand_name, brand_color, description, keywords,
        voice_sessions_count, total_transcriptions, status
      FROM project_contexts
      WHERE tenant_id = $1 AND status = 'active'
      ORDER BY project_name ASC
    `, [req.user.tenant_id]);

    res.json({
      status: 'success',
      data: {
        projects: result.rows,
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('[VoiceProjects] Error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch projects'
    });
  }
});

/**
 * GET /api/voice/projects/:slug
 * Get project details with activity summary
 */
router.get('/projects/:slug', requireUserAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM project_activity_summary
      WHERE project_slug = $1
    `, [req.params.slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Project not found'
      });
    }

    // Get recent yaps for this project
    const yapsResult = await db.query(`
      SELECT * FROM recent_voice_yaps
      WHERE project_id = $1
      LIMIT 20
    `, [result.rows[0].project_id]);

    res.json({
      status: 'success',
      data: {
        project: result.rows[0],
        recent_yaps: yapsResult.rows
      }
    });

  } catch (error) {
    console.error('[VoiceProjectDetail] Error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch project'
    });
  }
});

/**
 * GET /api/voice/stats
 * Get voice router and export engine stats
 */
router.get('/stats', requireUserAuth, async (req, res) => {
  try {
    res.json({
      status: 'success',
      data: {
        voice_router: voiceRouter.getStats(),
        log_scraper: logScraper.getStats(),
        export_engine: exportEngine.getStats()
      }
    });
  } catch (error) {
    console.error('[VoiceStats] Error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch stats'
    });
  }
});

/**
 * GET /api/voice/stats/daily
 * Get daily usage statistics (voice + learning sessions combined)
 *
 * Query params:
 * - from: Start date (YYYY-MM-DD) - defaults to 30 days ago
 * - to: End date (YYYY-MM-DD) - defaults to today
 */
router.get('/stats/daily', requireUserAuth, async (req, res) => {
  try {
    const from = req.query.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = req.query.to || new Date().toISOString().split('T')[0];

    const result = await db.query(`
      SELECT
        usage_date,
        voice_calls,
        voice_tokens,
        voice_cost_usd,
        voice_minutes,
        learning_calls,
        learning_tokens,
        learning_cost_usd,
        total_api_calls,
        total_tokens,
        total_cost_usd
      FROM user_daily_usage
      WHERE user_id = $1
        AND usage_date >= $2::date
        AND usage_date <= $3::date
      ORDER BY usage_date DESC
    `, [req.user.user_id, from, to]);

    // Calculate aggregates for the period
    const totals = result.rows.reduce((acc, row) => ({
      total_voice_calls: acc.total_voice_calls + parseInt(row.voice_calls || 0),
      total_voice_tokens: acc.total_voice_tokens + parseInt(row.voice_tokens || 0),
      total_voice_cost: acc.total_voice_cost + parseFloat(row.voice_cost_usd || 0),
      total_learning_calls: acc.total_learning_calls + parseInt(row.learning_calls || 0),
      total_learning_tokens: acc.total_learning_tokens + parseInt(row.learning_tokens || 0),
      total_learning_cost: acc.total_learning_cost + parseFloat(row.learning_cost_usd || 0),
      total_calls: acc.total_calls + parseInt(row.total_api_calls || 0),
      total_tokens: acc.total_tokens + parseInt(row.total_tokens || 0),
      total_cost: acc.total_cost + parseFloat(row.total_cost_usd || 0)
    }), {
      total_voice_calls: 0,
      total_voice_tokens: 0,
      total_voice_cost: 0,
      total_learning_calls: 0,
      total_learning_tokens: 0,
      total_learning_cost: 0,
      total_calls: 0,
      total_tokens: 0,
      total_cost: 0
    });

    res.json({
      status: 'success',
      data: {
        daily_stats: result.rows,
        period_totals: totals,
        date_range: { from, to }
      }
    });

  } catch (error) {
    console.error('[VoiceStatsDaily] Error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch daily stats'
    });
  }
});

/**
 * GET /api/voice/stats/cumulative
 * Get all-time cumulative usage statistics
 */
router.get('/stats/cumulative', requireUserAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM user_cumulative_usage
      WHERE user_id = $1
    `, [req.user.user_id]);

    if (result.rows.length === 0) {
      return res.json({
        status: 'success',
        data: {
          total_voice_calls: 0,
          total_voice_tokens: 0,
          total_voice_cost_usd: 0,
          total_learning_calls: 0,
          total_learning_tokens: 0,
          total_learning_cost_usd: 0,
          total_api_calls: 0,
          total_tokens_used: 0,
          total_cost_usd: 0
        }
      });
    }

    res.json({
      status: 'success',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('[VoiceStatsCumulative] Error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch cumulative stats'
    });
  }
});

/**
 * POST /api/voice/pipeline
 * Execute pipeline command and scrape logs
 *
 * Body:
 * {
 *   transcription_id: "uuid",
 *   command: "npm test",
 *   args: ["--coverage"],
 *   cwd: "/path/to/project",
 *   stage: "test"
 * }
 */
router.post('/pipeline', requireUserAuth, async (req, res) => {
  try {
    const {
      transcription_id,
      command,
      args = [],
      cwd = '/tmp',
      stage = 'manual',
      project_id
    } = req.body;

    if (!command || !project_id) {
      return res.status(400).json({
        status: 'error',
        error: 'command and project_id are required'
      });
    }

    // Execute and scrape
    const result = await logScraper.executeAndScrape({
      command,
      args,
      cwd,
      transcriptionId: transcription_id,
      projectId: project_id,
      userId: req.user.user_id,
      pipelineStage: stage
    });

    res.json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('[VoicePipeline] Error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Pipeline execution failed',
      details: error.message
    });
  }
});

module.exports = { router, initRoutes };

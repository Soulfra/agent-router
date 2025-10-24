const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const GuidedOAuthBuilder = require('../lib/guided-oauth-builder');
const OAuthProcessingLogger = require('../lib/oauth-processing-logger');

const router = express.Router();

// Initialize processing logger
const logger = new OAuthProcessingLogger();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../oauth-screenshots/uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `screenshot-${timestamp}-${Math.random().toString(36).substr(2, 9)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PNG and JPEG images are allowed'));
    }
  }
});

/**
 * POST /api/oauth/upload-screenshots
 * Upload screenshots for OAuth documentation generation
 *
 * Body (multipart/form-data):
 * - screenshots[] - Array of image files (PNG/JPEG)
 * - provider (optional) - OAuth provider (github/google/microsoft)
 * - appName (optional) - Application name
 * - stepTitles (optional) - JSON array of step titles
 */
router.post('/upload-screenshots', upload.array('screenshots', 10), async (req, res) => {
  const uploadId = crypto.randomBytes(16).toString('hex');

  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No screenshots uploaded' });
    }

    // Parse request parameters
    const provider = req.body.provider || 'auto-detect';
    const appName = req.body.appName || 'OAuth Application';
    const stepTitles = req.body.stepTitles ? JSON.parse(req.body.stepTitles) : [];
    const exportFormats = req.body.exportFormats ? JSON.parse(req.body.exportFormats) : ['gif'];
    const enableCursorAnimation = req.body.enableCursorAnimation !== 'false'; // Default: enabled

    console.log(`[OAuth Upload] [${uploadId}] Received ${files.length} screenshots`);

    // Create job in database
    logger.createJob(uploadId, {
      provider,
      appName,
      formatsRequested: exportFormats,
      screenshotCount: files.length
    });

    // Update status to processing
    logger.updateJobStatus(uploadId, 'processing');

    // Get file paths
    const screenshotPaths = files.map(f => f.path).sort();

    // Create builder
    const builder = new GuidedOAuthBuilder({
      baseDir: path.join(__dirname, '..'),
      screenshotsDir: path.dirname(screenshotPaths[0]),
      outputDir: path.join(__dirname, '../oauth-exports'),
      enableCursorAnimation
    });

    // Process screenshots
    console.log(`[OAuth Upload] [${uploadId}] Processing screenshots...`);
    console.log(`[OAuth Upload] [${uploadId}] Export formats: ${exportFormats.join(', ')}`);

    logger.logEvent(uploadId, 'processing_started', { exportFormats });

    const result = await builder.processUploadedScreenshots(screenshotPaths, {
      provider,
      appName,
      stepTitles,
      exportFormats
    });

    // Log credentials
    logger.logCredentials(uploadId, result.provider, {
      clientId: result.credentials.clientId,
      clientSecret: result.credentials.clientSecret,
      storedInKeyring: !!(result.credentials.clientId && result.credentials.clientSecret)
    });

    // Log exports
    for (const [format, exportPath] of Object.entries(result.exports)) {
      try {
        const stats = await fs.stat(exportPath);
        logger.logExport(uploadId, format, exportPath, {
          fileSize: stats.size
        });
      } catch (err) {
        logger.logExport(uploadId, format, exportPath);
      }
    }

    // Update status to completed
    logger.updateJobStatus(uploadId, 'completed');

    // Clean up uploaded files
    for (const file of files) {
      await fs.unlink(file.path).catch(() => {});
    }

    // Return result
    const exports = {};
    for (const [format, exportPath] of Object.entries(result.exports)) {
      exports[format] = `/oauth-exports/${path.basename(exportPath)}`;
    }

    res.json({
      success: true,
      uploadId,
      provider: result.provider,
      credentials: {
        clientId: result.credentials.clientId || null,
        clientSecret: result.credentials.clientSecret ? '*'.repeat(20) : null // Masked
      },
      exports,
      annotatedScreenshots: result.annotatedScreenshots.map(s => ({
        stepNumber: s.stepNumber,
        title: s.title,
        path: `/oauth-exports/${result.provider}/${path.basename(s.path)}`
      })),
      message: `Generated OAuth documentation for ${result.provider}`
    });

  } catch (error) {
    console.error(`[OAuth Upload] [${uploadId}] Error:`, error);

    // Log error
    logger.updateJobStatus(uploadId, 'failed', error.message);
    logger.logEvent(uploadId, 'processing_failed', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Failed to process screenshots',
      message: error.message,
      uploadId
    });
  }
});

/**
 * GET /api/oauth/status/:provider
 * Check if credentials exist for a provider
 */
router.get('/status/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const builder = new GuidedOAuthBuilder();

    const credentials = await builder.getStoredCredentials(provider);

    res.json({
      provider,
      hasCredentials: !!(credentials.clientId && credentials.clientSecret),
      clientId: credentials.clientId ? `${credentials.clientId.substring(0, 8)}...` : null
    });

  } catch (error) {
    console.error('[OAuth Status] Error:', error);
    res.status(500).json({
      error: 'Failed to check credentials',
      message: error.message
    });
  }
});

/**
 * GET /api/oauth/exports
 * List all generated OAuth documentation exports
 */
router.get('/exports', async (req, res) => {
  try {
    const exportsDir = path.join(__dirname, '../oauth-exports');
    const files = await fs.readdir(exportsDir);

    const gifs = files.filter(f => f.endsWith('.gif')).map(f => ({
      filename: f,
      provider: f.replace('-oauth-tutorial.gif', ''),
      path: `/oauth-exports/${f}`
    }));

    res.json({ exports: gifs });

  } catch (error) {
    console.error('[OAuth Exports] Error:', error);
    res.status(500).json({
      error: 'Failed to list exports',
      message: error.message
    });
  }
});

/**
 * GET /api/oauth/jobs/recent
 * Get recent processing jobs
 */
router.get('/jobs/recent', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const jobs = logger.getRecentJobs(limit);
    res.json({ jobs });
  } catch (error) {
    console.error('[OAuth Jobs] Error:', error);
    res.status(500).json({
      error: 'Failed to get recent jobs',
      message: error.message
    });
  }
});

/**
 * GET /api/oauth/jobs/:uploadId
 * Get job details with events and exports
 */
router.get('/jobs/:uploadId', (req, res) => {
  try {
    const { uploadId } = req.params;

    const job = logger.getJob(uploadId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const events = logger.getJobEvents(uploadId);
    const exports = logger.getJobExports(uploadId);
    const credentials = logger.getJobCredentials(uploadId);

    res.json({
      job: {
        ...job,
        formats_requested: job.formats_requested ? JSON.parse(job.formats_requested) : []
      },
      events,
      exports,
      credentials
    });
  } catch (error) {
    console.error('[OAuth Job] Error:', error);
    res.status(500).json({
      error: 'Failed to get job details',
      message: error.message
    });
  }
});

/**
 * GET /api/oauth/stats
 * Get processing statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = logger.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[OAuth Stats] Error:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/oauth/health
 * Check system dependencies and capabilities
 */
router.get('/health', async (req, res) => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const health = {
    status: 'ok',
    dependencies: {},
    capabilities: []
  };

  try {
    // Check ffmpeg
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      const version = stdout.split('\n')[0].match(/ffmpeg version ([^\s]+)/)?.[1];
      health.dependencies.ffmpeg = { available: true, version };
      health.capabilities.push('video_export', 'gif_export', 'audio_narration');
    } catch (error) {
      health.dependencies.ffmpeg = { available: false, error: 'Not installed' };
      health.status = 'degraded';
    }

    // Check tesseract
    try {
      const { stdout } = await execAsync('tesseract --version');
      const version = stdout.split('\n')[0].match(/tesseract ([^\s]+)/)?.[1];
      health.dependencies.tesseract = { available: true, version };
      health.capabilities.push('ocr', 'credential_extraction');
    } catch (error) {
      health.dependencies.tesseract = { available: false, error: 'Not installed' };
      health.status = 'degraded';
    }

    // Check macOS say command (TTS)
    try {
      await execAsync('which say');
      health.dependencies.say = { available: true, engine: 'macOS' };
      health.capabilities.push('tts_macos');
    } catch (error) {
      health.dependencies.say = { available: false };
    }

    // Check OpenAI API key (optional TTS)
    if (process.env.OPENAI_API_KEY) {
      health.dependencies.openai = { available: true, configured: true };
      health.capabilities.push('tts_openai');
    } else {
      health.dependencies.openai = { available: false, configured: false };
    }

    // Check Sharp (image processing)
    try {
      require('sharp');
      health.dependencies.sharp = { available: true };
      health.capabilities.push('image_annotation', 'image_processing');
    } catch (error) {
      health.dependencies.sharp = { available: false, error: 'Module not installed' };
      health.status = 'degraded';
    }

    res.json(health);

  } catch (error) {
    console.error('[OAuth Health] Error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

module.exports = router;

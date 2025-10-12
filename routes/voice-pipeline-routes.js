/**
 * Voice Pipeline API Routes
 *
 * REST API for voice-driven automation pipeline.
 * Accessible from phone, laptop, or any HTTP client.
 *
 * Endpoints:
 * - POST /api/voice/transcribe - Upload audio file
 * - POST /api/voice/submit - Submit text command
 * - GET /api/voice/jobs - List all jobs
 * - GET /api/voice/jobs/:jobId - Get job status
 * - POST /api/voice/jobs/:jobId/cancel - Cancel job
 * - GET /api/voice/stats - Get pipeline statistics
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const VoiceTranscriber = require('../agents/voice-transcriber');
const PipelineOrchestrator = require('../lib/pipeline-orchestrator');
const ArtifactBuilder = require('../lib/artifact-builder');

// Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

// Initialize services (will be set by parent router)
let voiceTranscriber = null;
let orchestrator = null;
let artifactBuilder = null;

/**
 * Initialize routes with dependencies
 */
function init(db, config = {}) {
  voiceTranscriber = new VoiceTranscriber();
  orchestrator = new PipelineOrchestrator(db, config);
  artifactBuilder = new ArtifactBuilder(config);

  // Setup orchestrator event listeners
  orchestrator.on('job:completed', async (data) => {
    console.log(`[Voice Pipeline] Job ${data.jobId} completed: ${data.deploymentUrl || 'No deployment'}`);
    // TODO: Send notification to user
  });

  orchestrator.on('job:failed', (data) => {
    console.error(`[Voice Pipeline] Job ${data.jobId} failed: ${data.error}`);
    // TODO: Send error notification to user
  });

  // Cleanup old jobs every hour
  setInterval(() => {
    orchestrator.cleanup();
  }, 60 * 60 * 1000);
}

/**
 * POST /api/voice/transcribe
 * Upload audio file and transcribe
 *
 * Body (multipart/form-data):
 * - audio: Audio file (webm, mp3, wav, etc.)
 * - format: Audio format (optional, detected from file)
 * - autoSubmit: Auto-submit transcription as command (default: false)
 */
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!voiceTranscriber) {
      return res.status(500).json({ error: 'Voice transcriber not initialized' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const format = req.body.format || req.file.mimetype.split('/')[1] || 'webm';
    const autoSubmit = req.body.autoSubmit === 'true';

    console.log(`[Voice Pipeline] Transcribing audio (${req.file.size} bytes, ${format})`);

    // Transcribe
    const transcription = await voiceTranscriber.transcribe(req.file.buffer, format);

    console.log(`[Voice Pipeline] Transcription: "${transcription}"`);

    // Auto-submit if requested
    let jobId = null;
    if (autoSubmit && orchestrator) {
      jobId = await orchestrator.submit(transcription, {
        source: 'voice',
        userAgent: req.headers['user-agent'],
        ip: req.ip
      });
    }

    res.json({
      status: 'ok',
      transcription,
      jobId: autoSubmit ? jobId : null,
      message: autoSubmit ? 'Transcribed and submitted for processing' : 'Transcribed successfully'
    });

  } catch (error) {
    console.error('[Voice Pipeline] Transcription failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/voice/submit
 * Submit text command directly (alternative to voice)
 *
 * Body:
 * - command: Text command (required)
 * - metadata: Additional metadata (optional)
 */
router.post('/submit', async (req, res) => {
  try {
    if (!orchestrator) {
      return res.status(500).json({ error: 'Pipeline orchestrator not initialized' });
    }

    const { command, metadata = {} } = req.body;

    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'Command is required' });
    }

    console.log(`[Voice Pipeline] Submitting command: "${command}"`);

    // Submit to orchestrator
    const jobId = await orchestrator.submit(command, {
      ...metadata,
      source: 'text',
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });

    const job = orchestrator.getJob(jobId);

    res.json({
      status: 'ok',
      jobId,
      job: {
        intent: job.intent,
        status: job.status,
        progress: job.progress
      },
      message: 'Command submitted for processing',
      pollUrl: `/api/voice/jobs/${jobId}`
    });

  } catch (error) {
    console.error('[Voice Pipeline] Submission failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voice/jobs
 * List all jobs (with optional filtering)
 *
 * Query params:
 * - status: Filter by status (queued, processing, completed, failed)
 * - limit: Max results (default: 50)
 */
router.get('/jobs', (req, res) => {
  try {
    if (!orchestrator) {
      return res.status(500).json({ error: 'Pipeline orchestrator not initialized' });
    }

    const { status, limit = 50 } = req.query;

    let jobs = orchestrator.getAllJobs();

    // Filter by status if provided
    if (status) {
      jobs = jobs.filter(job => job.status === status);
    }

    // Sort by creation time (newest first)
    jobs.sort((a, b) =>
      new Date(b.metadata.createdAt) - new Date(a.metadata.createdAt)
    );

    // Limit results
    jobs = jobs.slice(0, parseInt(limit));

    // Return summary (not full job details)
    const summary = jobs.map(job => ({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      intent: {
        action: job.intent.action,
        artifact: job.intent.artifact,
        domain: job.intent.domain
      },
      createdAt: job.metadata.createdAt,
      error: job.error,
      hasResult: !!job.result
    }));

    res.json({
      status: 'ok',
      jobs: summary,
      count: summary.length,
      total: orchestrator.getAllJobs().length
    });

  } catch (error) {
    console.error('[Voice Pipeline] Failed to list jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voice/jobs/:jobId
 * Get detailed job status
 */
router.get('/jobs/:jobId', (req, res) => {
  try {
    if (!orchestrator) {
      return res.status(500).json({ error: 'Pipeline orchestrator not initialized' });
    }

    const { jobId } = req.params;
    const job = orchestrator.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      status: 'ok',
      job: {
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        intent: job.intent,
        steps: job.steps,
        error: job.error,
        result: job.result,
        metadata: job.metadata
      }
    });

  } catch (error) {
    console.error('[Voice Pipeline] Failed to get job:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/voice/jobs/:jobId/cancel
 * Cancel a running job
 */
router.post('/jobs/:jobId/cancel', (req, res) => {
  try {
    if (!orchestrator) {
      return res.status(500).json({ error: 'Pipeline orchestrator not initialized' });
    }

    const { jobId } = req.params;
    const cancelled = orchestrator.cancelJob(jobId);

    if (!cancelled) {
      return res.status(400).json({ error: 'Job cannot be cancelled (not found or already completed)' });
    }

    res.json({
      status: 'ok',
      jobId,
      message: 'Job cancelled successfully'
    });

  } catch (error) {
    console.error('[Voice Pipeline] Failed to cancel job:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voice/stats
 * Get pipeline statistics
 */
router.get('/stats', (req, res) => {
  try {
    if (!orchestrator) {
      return res.status(500).json({ error: 'Pipeline orchestrator not initialized' });
    }

    const stats = orchestrator.getStats();

    res.json({
      status: 'ok',
      stats: {
        ...stats,
        averageProcessingTimeMs: stats.averageProcessingTime,
        averageProcessingTimeSec: Math.round(stats.averageProcessingTime / 1000)
      }
    });

  } catch (error) {
    console.error('[Voice Pipeline] Failed to get stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/voice/parse
 * Test intent parser without submitting job
 *
 * Body:
 * - command: Text to parse
 */
router.post('/parse', (req, res) => {
  try {
    if (!orchestrator) {
      return res.status(500).json({ error: 'Pipeline orchestrator not initialized' });
    }

    const { command } = req.body;

    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    const intent = orchestrator.intentParser.parse(command);
    const validation = orchestrator.intentParser.validate(intent);
    const prompt = orchestrator.intentParser.toChallengePrompt(intent);

    res.json({
      status: 'ok',
      intent,
      validation,
      challengePrompt: prompt
    });

  } catch (error) {
    console.error('[Voice Pipeline] Failed to parse command:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voice/active
 * Get active/queued jobs (for monitoring UI)
 */
router.get('/active', (req, res) => {
  try {
    if (!orchestrator) {
      return res.status(500).json({ error: 'Pipeline orchestrator not initialized' });
    }

    const active = orchestrator.getActiveJobs();

    res.json({
      status: 'ok',
      jobs: active.map(job => ({
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        intent: {
          action: job.intent.action,
          artifact: job.intent.artifact,
          domain: job.intent.domain
        },
        steps: job.steps,
        createdAt: job.metadata.createdAt
      })),
      count: active.length
    });

  } catch (error) {
    console.error('[Voice Pipeline] Failed to get active jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, init };

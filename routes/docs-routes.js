/**
 * Documentation API Routes
 *
 * Backend-first implementation that actually queries the database
 * NO UI mockups - just working endpoints with real data
 *
 * Endpoints:
 *   GET  /api/docs/providers        - List all documentation
 *   GET  /api/docs/snapshot/:id     - Get specific tutorial with annotations
 *   POST /api/docs/notes            - Save a note
 *   GET  /api/docs/notes/:id        - Get notes for a snapshot
 *   GET  /api/docs/test             - Health check
 *
 * Premium Content Control:
 *   - Free tier: GitHub OAuth tutorial only
 *   - Pro tier: All OAuth tutorials + video/GIF exports
 *   - Enterprise tier: Everything + custom features
 */

const express = require('express');
const path = require('path');
const TierGate = require('../middleware/tier-gate');
const QRGenerator = require('../lib/qr-generator');

function initDocsRoutes(db) {
  const router = express.Router();
  const tierGate = new TierGate({ db });
  const qrGen = new QRGenerator({ baseUrl: process.env.BASE_URL || 'https://calos.app' });

  /**
   * Helper middleware to check if user has required tier
   */
  const requireTier = (minimumTier) => {
    return async (req, res, next) => {
      // Run tier check first
      await tierGate.checkLimits(req, res, () => {
        const tierHierarchy = {
          anonymous: 0,
          free: 1,
          starter: 2,
          pro: 3,
          enterprise: 4,
          oss: 5
        };

        const userTierLevel = tierHierarchy[req.tier] || 0;
        const requiredTierLevel = tierHierarchy[minimumTier] || 0;

        if (userTierLevel >= requiredTierLevel) {
          next();
        } else {
          res.status(402).json({
            success: false,
            error: 'Payment Required',
            message: `This content requires ${minimumTier} tier or higher`,
            currentTier: req.tier,
            requiredTier: minimumTier,
            upgradeUrl: '/pricing.html'
          });
        }
      });
    };
  };

  /**
   * GET /api/docs/test
   * Health check to verify routes are wired up
   */
  router.get('/test', (req, res) => {
    res.json({
      success: true,
      message: 'Documentation API is working',
      timestamp: new Date().toISOString()
    });
  });

  /**
   * GET /api/docs/providers
   * List all available documentation/tutorials
   * Returns REAL data from database
   */
  router.get('/providers', async (req, res) => {
    try {
      const result = await db.query(`
        SELECT
          snapshot_id,
          provider,
          page_title,
          page_url,
          status,
          step_count,
          screenshot_dir,
          video_path,
          gif_path,
          created_at,
          last_verified_at
        FROM documentation_snapshots
        ORDER BY
          CASE status
            WHEN 'current' THEN 1
            WHEN 'outdated' THEN 2
            WHEN 'broken' THEN 3
            ELSE 4
          END,
          last_verified_at DESC NULLS LAST,
          created_at DESC
      `);

      console.log(`[DocsAPI] Found ${result.rows.length} providers`);

      res.json({
        success: true,
        count: result.rows.length,
        providers: result.rows
      });

    } catch (error) {
      console.error('[DocsAPI] Error fetching providers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch providers',
        message: error.message
      });
    }
  });

  /**
   * Helper function to fetch snapshot data
   */
  const fetchSnapshotData = async (id, res, db) => {
    try {
      // Get snapshot details
      const snapshotResult = await db.query(`
        SELECT
          snapshot_id,
          provider,
          page_title,
          page_url,
          status,
          step_count,
          screenshot_dir,
          base_screenshot_path,
          video_path,
          gif_path,
          pptx_path,
          pdf_path,
          metadata,
          created_at,
          updated_at,
          last_verified_at
        FROM documentation_snapshots
        WHERE snapshot_id = $1
      `, [id]);

      if (snapshotResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Snapshot not found'
        });
      }

      const snapshot = snapshotResult.rows[0];

      // Get annotations
      const annotationsResult = await db.query(`
        SELECT
          annotation_id,
          step_number,
          step_title,
          step_description,
          selector,
          annotation_type,
          position,
          text_content,
          color,
          start_time,
          duration
        FROM documentation_annotations
        WHERE snapshot_id = $1
        ORDER BY step_number ASC
      `, [id]);

      snapshot.annotations = annotationsResult.rows;

      console.log(`[DocsAPI] Loaded snapshot ${id} with ${annotationsResult.rows.length} annotations`);

      res.json({
        success: true,
        snapshot
      });
    } catch (error) {
      console.error('[DocsAPI] Error fetching snapshot:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch snapshot',
        message: error.message
      });
    }
  };

  /**
   * GET /api/docs/snapshot/:id
   * Get specific documentation snapshot with all annotations
   * PREMIUM: Pro tier required for non-GitHub providers
   */
  router.get('/snapshot/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // First, check which provider this is
      const providerCheck = await db.query(`
        SELECT provider FROM documentation_snapshots WHERE snapshot_id = $1
      `, [id]);

      if (providerCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Snapshot not found'
        });
      }

      const provider = providerCheck.rows[0].provider;

      // GitHub is free, others require Pro tier
      if (provider !== 'github') {
        // Run tier check
        return await tierGate.checkLimits(req, res, async () => {
          const tierHierarchy = { anonymous: 0, free: 1, starter: 2, pro: 3, enterprise: 4, oss: 5 };
          const userTierLevel = tierHierarchy[req.tier] || 0;

          if (userTierLevel < tierHierarchy['pro']) {
            return res.status(402).json({
              success: false,
              error: 'Payment Required',
              message: `${provider} tutorials require Pro tier or higher`,
              currentTier: req.tier,
              requiredTier: 'pro',
              upgradeUrl: '/pricing.html'
            });
          }

          // User has access, continue
          await fetchSnapshotData(id, res, db);
        });
      }

      // GitHub is free for all users
      await fetchSnapshotData(id, res, db);

    } catch (error) {
      console.error('[DocsAPI] Error fetching snapshot:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch snapshot',
        message: error.message
      });
    }
  });

  /**
   * POST /api/docs/notes
   * Save a user note tied to a specific timestamp
   */
  router.post('/notes', async (req, res) => {
    try {
      const { snapshot_id, timestamp, note_text, tags } = req.body;

      if (!snapshot_id || !note_text) {
        return res.status(400).json({
          success: false,
          error: 'snapshot_id and note_text are required'
        });
      }

      // TODO: Get user_id from session
      const user_id = null; // For now, allow anonymous notes

      const result = await db.query(`
        INSERT INTO user_notes (
          user_id,
          snapshot_id,
          timestamp,
          note_text,
          tags
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING note_id, created_at
      `, [user_id, snapshot_id, timestamp, note_text, tags || []]);

      console.log(`[DocsAPI] Saved note for snapshot ${snapshot_id}`);

      res.json({
        success: true,
        note: result.rows[0]
      });

    } catch (error) {
      console.error('[DocsAPI] Error saving note:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save note',
        message: error.message
      });
    }
  });

  /**
   * GET /api/docs/notes/:snapshotId
   * Get all notes for a snapshot
   */
  router.get('/notes/:snapshotId', async (req, res) => {
    try {
      const { snapshotId } = req.params;

      const result = await db.query(`
        SELECT
          note_id,
          timestamp,
          note_text,
          tags,
          created_at
        FROM user_notes
        WHERE snapshot_id = $1
        ORDER BY
          timestamp ASC NULLS LAST,
          created_at DESC
      `, [snapshotId]);

      console.log(`[DocsAPI] Found ${result.rows.length} notes for snapshot ${snapshotId}`);

      res.json({
        success: true,
        count: result.rows.length,
        notes: result.rows
      });

    } catch (error) {
      console.error('[DocsAPI] Error fetching notes:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch notes',
        message: error.message
      });
    }
  });

  /**
   * GET /api/docs/stats
   * Get documentation system stats
   */
  router.get('/stats', async (req, res) => {
    try {
      const stats = await db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'current') as current_count,
          COUNT(*) FILTER (WHERE status = 'outdated') as outdated_count,
          COUNT(*) FILTER (WHERE status = 'broken') as broken_count,
          COUNT(*) as total_count,
          MAX(created_at) as latest_created,
          MAX(last_verified_at) as latest_verified
        FROM documentation_snapshots
      `);

      const changeStats = await db.query(`
        SELECT
          COUNT(*) as total_changes,
          COUNT(*) FILTER (WHERE detected_at > NOW() - INTERVAL '7 days') as changes_last_week,
          COUNT(*) FILTER (WHERE auto_regenerated = true) as auto_regenerated_count
        FROM documentation_changes
      `);

      res.json({
        success: true,
        snapshots: stats.rows[0],
        changes: changeStats.rows[0]
      });

    } catch (error) {
      console.error('[DocsAPI] Error fetching stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch stats',
        message: error.message
      });
    }
  });

  /**
   * POST /api/docs/snapshot/:id/export
   * Create export job for documentation (video, gif, pptx)
   */
  router.post('/snapshot/:id/export', async (req, res) => {
    try {
      const { id } = req.params;
      const { format } = req.body; // 'video', 'gif', 'pptx'

      if (!format || !['video', 'gif', 'pptx', 'mp4', 'powerpoint'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Must be: video, gif, pptx'
        });
      }

      // Check if snapshot exists
      const snapshot = await db.query(
        `SELECT snapshot_id FROM documentation_snapshots WHERE snapshot_id = $1`,
        [id]
      );

      if (snapshot.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Snapshot not found'
        });
      }

      // Create export job
      const job = await db.query(
        `INSERT INTO documentation_exports (snapshot_id, export_format, status, requested_at)
         VALUES ($1, $2, 'pending', NOW())
         RETURNING export_id, status, progress`,
        [id, format]
      );

      console.log(`[DocsAPI] Created export job ${job.rows[0].export_id} for ${format}`);

      res.json({
        success: true,
        job_id: job.rows[0].export_id,
        format,
        status: 'pending',
        progress: 0,
        message: 'Export job created. Use GET /api/docs/export/:jobId to check progress.'
      });

    } catch (error) {
      console.error('[DocsAPI] Error creating export job:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create export job',
        message: error.message
      });
    }
  });

  /**
   * GET /api/docs/export/:jobId
   * Check export job status and download when ready
   */
  router.get('/export/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;

      const job = await db.query(
        `SELECT * FROM documentation_exports WHERE export_id = $1`,
        [jobId]
      );

      if (job.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Export job not found'
        });
      }

      const jobData = job.rows[0];

      if (jobData.status === 'completed') {
        res.json({
          success: true,
          status: 'completed',
          progress: 100,
          download_url: `/exports/${path.basename(jobData.output_path)}`,
          file_size: jobData.file_size_bytes,
          duration_ms: jobData.duration_ms,
          format: jobData.export_format
        });
      } else if (jobData.status === 'failed') {
        res.json({
          success: false,
          status: 'failed',
          error: jobData.error_message
        });
      } else {
        res.json({
          success: true,
          status: jobData.status, // 'pending' or 'processing'
          progress: jobData.progress || 0,
          message: `Export in progress... ${jobData.progress || 0}%`
        });
      }

    } catch (error) {
      console.error('[DocsAPI] Error fetching export job:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch export job',
        message: error.message
      });
    }
  });

  /**
   * GET /api/docs/snapshot/:id/qr
   * Generate QR code for tutorial that deeplinks to mobile
   */
  router.get('/snapshot/:id/qr', async (req, res) => {
    try {
      const { id } = req.params;

      // Get snapshot info
      const snapshot = await db.query(
        `SELECT provider, page_title FROM documentation_snapshots WHERE snapshot_id = $1`,
        [id]
      );

      if (snapshot.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Snapshot not found'
        });
      }

      const snapshotData = snapshot.rows[0];

      // Generate QR code that opens tutorial on mobile
      const qrDataUrl = await qrGen.generateTrackingQR('/tutorial', {
        id: id,
        provider: snapshotData.provider,
        title: snapshotData.page_title,
        ref: 'qr',
        type: 'tutorial',
        utm_source: 'qr_code',
        utm_medium: 'mobile',
        utm_campaign: 'documentation'
      });

      // Convert data URL to buffer
      const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);

    } catch (error) {
      console.error('[DocsAPI] Error generating QR code:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate QR code',
        message: error.message
      });
    }
  });

  console.log('[DocsAPI] Documentation routes initialized');
  console.log('[DocsAPI] Available endpoints:');
  console.log('[DocsAPI]   GET  /api/docs/test');
  console.log('[DocsAPI]   GET  /api/docs/providers');
  console.log('[DocsAPI]   GET  /api/docs/snapshot/:id');
  console.log('[DocsAPI]   POST /api/docs/notes');
  console.log('[DocsAPI]   GET  /api/docs/notes/:snapshotId');
  console.log('[DocsAPI]   GET  /api/docs/stats');
  console.log('[DocsAPI]   POST /api/docs/snapshot/:id/export');
  console.log('[DocsAPI]   GET  /api/docs/export/:jobId');
  console.log('[DocsAPI]   GET  /api/docs/snapshot/:id/qr');

  return router;
}

module.exports = initDocsRoutes;

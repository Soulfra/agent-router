/**
 * Edutech Platform API Routes
 *
 * Provides real-time data for the live dashboard
 */

const express = require('express');
const router = express.Router();
const EdutechReportGenerator = require('../scripts/generate-edutech-report');
const DevRagebaitGenerator = require('../lib/dev-ragebait-generator');
const { Pool } = require('pg');

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || process.env.USER,
  password: process.env.DB_PASSWORD || ''
});

/**
 * GET /api/edutech/report
 * Returns full platform report as JSON
 */
router.get('/report', async (req, res) => {
  try {
    const generator = new EdutechReportGenerator();
    const report = await generator.generate({ format: 'json' });
    await generator.close();

    res.json({
      success: true,
      report,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Edutech API] Error generating report:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/edutech/status
 * Quick status check (faster than full report)
 */
router.get('/status', async (req, res) => {
  try {
    const status = {};

    // Learning platform
    const pathsResult = await db.query("SELECT COUNT(*) as count FROM learning_paths WHERE status = 'active'");
    const lessonsResult = await db.query("SELECT COUNT(*) as count FROM lessons WHERE status = 'published'");
    const learnersResult = await db.query('SELECT COUNT(DISTINCT user_id) as count FROM user_progress');
    const xpResult = await db.query('SELECT SUM(total_xp_earned) as total FROM user_progress');

    status.learning = {
      paths: parseInt(pathsResult.rows[0].count),
      lessons: parseInt(lessonsResult.rows[0].count),
      learners: parseInt(learnersResult.rows[0].count),
      total_xp: parseInt(xpResult.rows[0].total || 0)
    };

    // Model versions
    const modelsCheck = await db.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'model_versions') as exists
    `);

    if (modelsCheck.rows[0].exists) {
      const modelsResult = await db.query('SELECT COUNT(*) as count FROM model_versions');
      status.models = {
        versions: parseInt(modelsResult.rows[0].count)
      };
    } else {
      status.models = { versions: 0 };
    }

    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Edutech API] Error getting status:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/edutech/test-meme
 * Generate a test meme
 */
router.post('/test-meme', async (req, res) => {
  try {
    const { templateId } = req.body;
    const template = templateId || 'npm-install';

    const generator = new DevRagebaitGenerator();
    const result = await generator.generate(template, {
      gifPath: `/tmp/test-meme-${Date.now()}.gif`,
      mp4Path: `/tmp/test-meme-${Date.now()}.mp4`
    });

    res.json({
      success: true,
      message: `Generated ${template} meme`,
      result: {
        template: result.template.name,
        gifPath: result.gif.path,
        gifSizeMB: result.gif.sizeMB,
        mp4Path: result.mp4.path,
        mp4SizeMB: result.mp4.sizeMB,
        caption: result.caption,
        hashtags: result.hashtags
      }
    });
  } catch (err) {
    console.error('[Edutech API] Error generating meme:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/edutech/meme-templates
 * List available meme templates
 */
router.get('/meme-templates', (req, res) => {
  try {
    const generator = new DevRagebaitGenerator();
    const templates = generator.getTemplates();

    res.json({
      success: true,
      templates
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/edutech/complete-lesson
 * Test lesson completion
 */
router.post('/complete-lesson', async (req, res) => {
  try {
    const { userId, lessonId, xp } = req.body;
    const testUserId = userId || 'test-user-' + Date.now();
    const testXp = xp || 100;

    // Get first lesson if not specified
    let testLessonId = lessonId;
    if (!testLessonId) {
      const lessonResult = await db.query('SELECT lesson_id FROM lessons LIMIT 1');
      if (lessonResult.rows.length > 0) {
        testLessonId = lessonResult.rows[0].lesson_id;
      }
    }

    // Create lesson completion record
    const result = await db.query(`
      INSERT INTO lesson_completions (user_id, lesson_id, xp_earned, completed_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `, [testUserId, testLessonId, testXp]);

    res.json({
      success: true,
      message: `Lesson completed! Earned ${testXp} XP`,
      completion: result.rows[0]
    });
  } catch (err) {
    console.error('[Edutech API] Error completing lesson:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/edutech/recent-activity
 * Get recent platform activity
 */
router.get('/recent-activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const completions = await db.query(`
      SELECT
        lc.user_id,
        l.lesson_title,
        lc.xp_earned,
        lc.completed_at
      FROM lesson_completions lc
      JOIN lessons l ON lc.lesson_id = l.lesson_id
      ORDER BY lc.completed_at DESC
      LIMIT $1
    `, [limit]);

    res.json({
      success: true,
      activity: completions.rows
    });
  } catch (err) {
    console.error('[Edutech API] Error getting activity:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;

/**
 * Compaction API Routes
 *
 * Endpoints for code compaction and AI evaluation
 */

const express = require('express');
const router = express.Router();
const CompactionPipeline = require('../lib/compaction-pipeline');
const CodeCompactor = require('../lib/code-compactor');

let db;
let pipeline;
let compactor;

/**
 * Initialize compaction routes
 */
function init(database) {
  db = database;
  pipeline = new CompactionPipeline({
    useOllama: true,
    useLocalGraders: true
  });
  compactor = new CodeCompactor();
  console.log('[Compaction API] Initialized');
}

/**
 * POST /api/compact
 * Compact code (minify HTML, CSS, JS)
 */
router.post('/', async (req, res) => {
  try {
    const { html, css, js, title } = req.body;

    if (!html && !css && !js) {
      return res.status(400).json({
        success: false,
        error: 'At least one of html, css, or js required'
      });
    }

    const result = compactor.compact({
      html: html || '',
      css: css || '',
      js: js || '',
      title: title || 'Compacted Project'
    });

    const report = compactor.generateReport(result);

    res.json({
      success: true,
      compacted: result.compacted,
      html5File: result.html5File,
      stats: result.stats,
      report: report
    });

  } catch (error) {
    console.error('Compaction error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/compact/grade
 * Compact code and run through full grading pipeline
 */
router.post('/grade', async (req, res) => {
  try {
    const { html, css, js, title, description, useOllama, useLocalGraders } = req.body;

    if (!html && !css && !js) {
      return res.status(400).json({
        success: false,
        error: 'At least one of html, css, or js required'
      });
    }

    // Configure pipeline
    const pipelineConfig = {
      useOllama: useOllama !== false,
      useLocalGraders: useLocalGraders !== false
    };

    const customPipeline = new CompactionPipeline(pipelineConfig);

    // Run full pipeline
    const result = await customPipeline.run({
      html: html || '',
      css: css || '',
      js: js || '',
      title: title || 'Project',
      description: description || ''
    });

    // Generate report
    const report = customPipeline.generateReport(result);

    // Store in database
    const compactionId = await storeCompactionResult({
      project: result.project,
      stages: result.stages,
      timing: result.timing,
      finalScores: result.finalScores,
      errors: result.errors,
      timestamp: result.timestamp
    });

    res.json({
      success: true,
      compactionId,
      result,
      report
    });

  } catch (error) {
    console.error('Grade error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * POST /api/compact/html5
 * Create HTML5 single-file format
 */
router.post('/html5', async (req, res) => {
  try {
    const { html, css, js, title } = req.body;

    const html5File = compactor.createHTML5SingleFile({
      html: html || '',
      css: css || '',
      js: js || '',
      title: title || 'Project'
    });

    res.json({
      success: true,
      html5File,
      size: html5File.length,
      tokens: Math.ceil(html5File.length / 4)
    });

  } catch (error) {
    console.error('HTML5 creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/compact/extract
 * Extract HTML, CSS, JS from single HTML file
 */
router.post('/extract', async (req, res) => {
  try {
    const { html } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'html required'
      });
    }

    const extracted = compactor.extractFromHTML(html);

    res.json({
      success: true,
      extracted,
      sizes: {
        html: extracted.html.length,
        css: extracted.css.length,
        js: extracted.js.length
      }
    });

  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/compact/:id
 * Get compaction result by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM compaction_results WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Compaction result not found'
      });
    }

    res.json({
      success: true,
      result: result.rows[0]
    });

  } catch (error) {
    console.error('Get compaction error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/compact/:id/report
 * Get formatted report for compaction result
 */
router.get('/:id/report', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM compaction_results WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Compaction result not found'
      });
    }

    const data = result.rows[0];

    // Reconstruct pipeline result
    const pipelineResult = {
      project: data.project,
      stages: data.stages,
      timing: data.timing,
      finalScores: data.final_scores,
      errors: data.errors || [],
      timestamp: data.created_at
    };

    const report = pipeline.generateReport(pipelineResult);

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/compact/history
 * Get recent compaction history
 */
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const results = await db.query(
      `SELECT id, project, final_scores, timing, created_at
       FROM compaction_results
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      success: true,
      results: results.rows,
      count: results.rows.length
    });

  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/compact/stats
 * Get compaction statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total_compactions,
        AVG((stages->'compaction'->'stats'->'reduction'->>'tokens')::numeric) as avg_token_reduction,
        AVG((stages->'compaction'->'stats'->'reduction'->>'size')::numeric) as avg_size_reduction,
        AVG((final_scores->>'combined')::numeric) as avg_combined_score
      FROM compaction_results
      WHERE stages->'compaction' IS NOT NULL
    `);

    const recentScores = await db.query(`
      SELECT
        (final_scores->>'local')::numeric as local_score,
        (final_scores->>'ollama')::numeric as ollama_score,
        (final_scores->>'combined')::numeric as combined_score,
        created_at
      FROM compaction_results
      WHERE final_scores IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      stats: stats.rows[0] || {},
      recentScores: recentScores.rows
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/compact/:id
 * Delete compaction result
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.query('DELETE FROM compaction_results WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Compaction result deleted'
    });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper: Store compaction result in database
 */
async function storeCompactionResult(data) {
  const result = await db.query(
    `INSERT INTO compaction_results
     (project, stages, timing, final_scores, errors)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      JSON.stringify(data.project),
      JSON.stringify(data.stages),
      JSON.stringify(data.timing),
      JSON.stringify(data.finalScores),
      JSON.stringify(data.errors || [])
    ]
  );

  return result.rows[0].id;
}

module.exports = { router, init };

/**
 * Experiment Routes (A/B Testing)
 *
 * Multi-variant testing framework:
 * - Create and manage experiments
 * - Assign users to variants
 * - Record results and metrics
 * - Get statistical analysis
 */

const express = require('express');
const router = express.Router();

const {
  requireAuth
} = require('../middleware/sso-auth');

// Dependencies (injected via initRoutes)
let db = null;
let experimentManager = null;

/**
 * Initialize routes with dependencies
 */
function initRoutes(database, experimentManagerInstance) {
  db = database;
  experimentManager = experimentManagerInstance;
  return router;
}

/**
 * POST /api/experiments/create
 * Create a new A/B test experiment
 *
 * Body: {
 *   name: string,
 *   description: string,
 *   experimentType: string ('model_version', 'wrapper', 'prompt', 'parameter', 'mixed'),
 *   domain: string (optional),
 *   userProfile: string (optional),
 *   variants: [{
 *     name: string,
 *     config: object,
 *     traffic: number (0-100),
 *     isControl: boolean
 *   }],
 *   primaryMetric: string (default: 'success_rate'),
 *   secondaryMetrics: string[],
 *   autoOptimize: boolean (default: true),
 *   minSampleSize: number (default: 100),
 *   duration: number (days, default: 14)
 * }
 */
router.post('/create', requireAuth, async (req, res) => {
  try {
    // TODO: Add admin check middleware
    const experimentSpec = req.body;

    if (!experimentSpec.name || !experimentSpec.variants) {
      return res.status(400).json({
        error: 'name and variants are required'
      });
    }

    const experimentId = await experimentManager.createExperiment(experimentSpec);

    res.json({
      success: true,
      experimentId
    });
  } catch (error) {
    console.error('[ExperimentRoutes] Error creating experiment:', error.message);
    res.status(400).json({
      error: error.message || 'Failed to create experiment'
    });
  }
});

/**
 * GET /api/experiments/active
 * List active experiments
 *
 * Query params:
 *   domain: Filter by domain (optional)
 *   userProfile: Filter by user profile (optional)
 */
router.get('/active', async (req, res) => {
  try {
    const { domain, userProfile } = req.query;

    const experiments = await experimentManager.listActiveExperiments({
      domain,
      userProfile
    });

    res.json({
      success: true,
      experiments,
      count: experiments.length
    });
  } catch (error) {
    console.error('[ExperimentRoutes] Error listing experiments:', error.message);
    res.status(500).json({
      error: 'Failed to list experiments'
    });
  }
});

/**
 * GET /api/experiments/:experimentId/assign
 * Assign authenticated user to an experiment variant
 *
 * Returns the variant configuration to use
 */
router.get('/:experimentId/assign', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const sessionId = req.user.sessionId;
    const { experimentId } = req.params;

    const variant = await experimentManager.assignVariant(
      parseInt(experimentId),
      userId,
      sessionId
    );

    res.json({
      success: true,
      variant
    });
  } catch (error) {
    console.error('[ExperimentRoutes] Error assigning variant:', error.message);
    res.status(500).json({
      error: 'Failed to assign variant'
    });
  }
});

/**
 * POST /api/experiments/:experimentId/record
 * Record experiment result for a user
 *
 * Body: {
 *   variantId: number,
 *   metrics: {
 *     success: boolean,
 *     responseTime: number (ms),
 *     cost: number (usd),
 *     satisfaction: number (1-5),
 *     conversion: boolean
 *   }
 * }
 */
router.post('/:experimentId/record', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { experimentId } = req.params;
    const { variantId, metrics } = req.body;

    if (!variantId || !metrics) {
      return res.status(400).json({
        error: 'variantId and metrics are required'
      });
    }

    await experimentManager.recordResult(
      parseInt(experimentId),
      variantId,
      userId,
      metrics
    );

    res.json({
      success: true,
      message: 'Result recorded'
    });
  } catch (error) {
    console.error('[ExperimentRoutes] Error recording result:', error.message);
    res.status(500).json({
      error: 'Failed to record result'
    });
  }
});

/**
 * GET /api/experiments/:experimentId/results
 * Get experiment results and statistical analysis
 */
router.get('/:experimentId/results', async (req, res) => {
  try {
    const { experimentId } = req.params;

    const results = await experimentManager.getExperimentResults(parseInt(experimentId));

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('[ExperimentRoutes] Error getting results:', error.message);
    res.status(500).json({
      error: 'Failed to get experiment results'
    });
  }
});

/**
 * POST /api/experiments/:experimentId/end
 * End an experiment and optionally declare a winner
 *
 * Body: {
 *   winnerVariantId: number (optional)
 * }
 */
router.post('/:experimentId/end', requireAuth, async (req, res) => {
  try {
    // TODO: Add admin check middleware
    const { experimentId } = req.params;
    const { winnerVariantId } = req.body;

    await experimentManager.endExperiment(
      parseInt(experimentId),
      winnerVariantId
    );

    res.json({
      success: true,
      message: 'Experiment ended'
    });
  } catch (error) {
    console.error('[ExperimentRoutes] Error ending experiment:', error.message);
    res.status(500).json({
      error: 'Failed to end experiment'
    });
  }
});

/**
 * GET /api/experiments/summary
 * Get summary of all experiments
 */
router.get('/summary', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM active_experiments_summary
       ORDER BY created_at DESC`
    );

    const experiments = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      experimentType: row.experiment_type,
      domain: row.domain,
      userProfile: row.user_profile,
      primaryMetric: row.primary_metric,
      status: row.status,
      variantCount: parseInt(row.variant_count),
      totalObservations: parseInt(row.total_observations),
      createdAt: row.created_at,
      endsAt: row.ends_at
    }));

    res.json({
      success: true,
      experiments
    });
  } catch (error) {
    console.error('[ExperimentRoutes] Error getting summary:', error.message);
    res.status(500).json({
      error: 'Failed to get experiments summary'
    });
  }
});

/**
 * GET /api/experiments/:experimentId/comparison
 * Get variant comparison view for an experiment
 */
router.get('/:experimentId/comparison', async (req, res) => {
  try {
    const { experimentId } = req.params;

    const result = await db.query(
      `SELECT * FROM experiment_results_comparison
       WHERE experiment_id = $1
       ORDER BY is_control DESC, success_rate DESC`,
      [experimentId]
    );

    const variants = result.rows.map(row => ({
      variantId: row.variant_id,
      variantName: row.variant_name,
      isControl: row.is_control,
      totalObservations: parseInt(row.total_observations),
      successRate: parseFloat(row.success_rate),
      avgResponseTime: parseFloat(row.avg_response_time_ms),
      avgCost: parseFloat(row.avg_cost_usd),
      avgSatisfaction: parseFloat(row.avg_satisfaction),
      conversionRate: parseFloat(row.conversion_rate),
      isSignificant: row.is_significant,
      pValue: parseFloat(row.p_value)
    }));

    res.json({
      success: true,
      experimentId: parseInt(experimentId),
      variants
    });
  } catch (error) {
    console.error('[ExperimentRoutes] Error getting comparison:', error.message);
    res.status(500).json({
      error: 'Failed to get variant comparison'
    });
  }
});

module.exports = { initRoutes };

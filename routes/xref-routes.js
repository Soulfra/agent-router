/**
 * Cross-Reference (XRef) System API Routes
 *
 * "xrefs hotkey: x" - Show all places a component is used
 *
 * Endpoints for the cross-reference tracking system:
 * - Find all usages of a component (xrefs)
 * - Find all dependencies of a component
 * - Build component graphs for visualization
 * - Get usage statistics
 * - Export xref data
 * - Find most used components
 * - Find orphaned components
 */

const express = require('express');
const router = express.Router();
const XRefMapper = require('../lib/xref-mapper');

let xrefMapper = null;
let db = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(components) {
  db = components.db;

  if (db) {
    xrefMapper = new XRefMapper({ db });
    console.log('✓ XRef routes initialized');
  } else {
    console.warn('⚠ XRef routes initialized without database');
  }

  return router;
}

/**
 * Middleware: Ensure xrefMapper is available
 */
function requireXRefMapper(req, res, next) {
  if (!xrefMapper) {
    return res.status(503).json({
      status: 'error',
      message: 'XRef mapper not initialized'
    });
  }
  next();
}

// ============================================================================
// Component Usages (XRefs)
// ============================================================================

/**
 * GET /api/xref/:componentType/:componentId/usages
 * Find all usages of a component ("xrefs hotkey: x")
 *
 * Example: GET /api/xref/pattern/123/usages
 * Returns: All requests/artifacts that use pattern #123
 */
router.get('/:componentType/:componentId/usages', requireXRefMapper, async (req, res) => {
  try {
    const { componentType, componentId } = req.params;
    const { limit = 100, relationshipType, successOnly } = req.query;

    const usages = await xrefMapper.findUsages(componentType, componentId, {
      limit: parseInt(limit),
      relationshipType: relationshipType || null,
      successOnly: successOnly === 'true'
    });

    res.json({
      status: 'success',
      component: { type: componentType, id: componentId },
      usageCount: usages.length,
      usages
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/xref/:componentType/:componentId/dependencies
 * Find all dependencies of a component
 *
 * Example: GET /api/xref/artifact/456/dependencies
 * Returns: All patterns/models/buckets that artifact #456 depends on
 */
router.get('/:componentType/:componentId/dependencies', requireXRefMapper, async (req, res) => {
  try {
    const { componentType, componentId } = req.params;
    const { limit = 100, relationshipType } = req.query;

    const dependencies = await xrefMapper.findDependencies(componentType, componentId, {
      limit: parseInt(limit),
      relationshipType: relationshipType || null
    });

    res.json({
      status: 'success',
      component: { type: componentType, id: componentId },
      dependencyCount: dependencies.length,
      dependencies
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Component Graphs (Visualization)
// ============================================================================

/**
 * GET /api/xref/:componentType/:componentId/graph
 * Build component relationship graph (D3.js format)
 *
 * Query params:
 * - depth: How many levels deep (default: 2)
 * - format: 'nodes-links' or 'hierarchical' (default: nodes-links)
 *
 * Example: GET /api/xref/bucket/bucket-code/graph?depth=3
 */
router.get('/:componentType/:componentId/graph', requireXRefMapper, async (req, res) => {
  try {
    const { componentType, componentId } = req.params;
    const { depth = 2, format = 'nodes-links' } = req.query;

    const graph = await xrefMapper.buildGraph(componentType, componentId, {
      depth: parseInt(depth),
      format
    });

    res.json({
      status: 'success',
      component: { type: componentType, id: componentId },
      format,
      depth: parseInt(depth),
      graph
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Component Statistics
// ============================================================================

/**
 * GET /api/xref/:componentType/:componentId/stats
 * Get usage statistics for a component
 *
 * Example: GET /api/xref/model/deepseek-r1/stats
 * Returns: Total uses, success rate, avg execution time, etc.
 */
router.get('/:componentType/:componentId/stats', requireXRefMapper, async (req, res) => {
  try {
    const { componentType, componentId } = req.params;

    const stats = await xrefMapper.getStats(componentType, componentId);

    if (!stats) {
      return res.status(404).json({
        status: 'error',
        message: 'No statistics found for this component'
      });
    }

    res.json({
      status: 'success',
      component: { type: componentType, id: componentId },
      stats
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/xref/:componentType/:componentId/export
 * Export complete xref data for a component (for debugging)
 *
 * Example: GET /api/xref/pattern/123/export
 * Returns: Usages, dependencies, and stats in one response
 */
router.get('/:componentType/:componentId/export', requireXRefMapper, async (req, res) => {
  try {
    const { componentType, componentId } = req.params;

    const exportData = await xrefMapper.export(componentType, componentId);

    if (!exportData) {
      return res.status(404).json({
        status: 'error',
        message: 'No data found for this component'
      });
    }

    res.json({
      status: 'success',
      data: exportData
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// System-Wide Queries
// ============================================================================

/**
 * GET /api/xref/most-used
 * Get most used components across the system
 *
 * Query params:
 * - componentType: Filter by type (optional)
 * - limit: Max results (default: 20)
 *
 * Example: GET /api/xref/most-used?componentType=pattern&limit=10
 */
router.get('/most-used', requireXRefMapper, async (req, res) => {
  try {
    const { componentType, limit = 20 } = req.query;

    const mostUsed = await xrefMapper.getMostUsed({
      componentType: componentType || null,
      limit: parseInt(limit)
    });

    res.json({
      status: 'success',
      count: mostUsed.length,
      components: mostUsed
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/xref/recently-used
 * Get recently used components
 *
 * Query params:
 * - componentType: Filter by type (optional)
 * - limit: Max results (default: 20)
 *
 * Example: GET /api/xref/recently-used?limit=50
 */
router.get('/recently-used', requireXRefMapper, async (req, res) => {
  try {
    const { componentType, limit = 20 } = req.query;

    const recentlyUsed = await xrefMapper.getRecentlyUsed({
      componentType: componentType || null,
      limit: parseInt(limit)
    });

    res.json({
      status: 'success',
      count: recentlyUsed.length,
      components: recentlyUsed
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/xref/orphans/:componentType
 * Find orphaned components (not used by anything)
 *
 * Example: GET /api/xref/orphans/pattern
 * Returns: All patterns that have never been used
 */
router.get('/orphans/:componentType', requireXRefMapper, async (req, res) => {
  try {
    const { componentType } = req.params;

    const orphans = await xrefMapper.findOrphans(componentType);

    res.json({
      status: 'success',
      componentType,
      orphanCount: orphans.length,
      orphans
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Manual Recording (for testing/debugging)
// ============================================================================

/**
 * POST /api/xref/record
 * Manually record a component relationship
 *
 * Body:
 * {
 *   "sourceType": "request",
 *   "sourceId": "abc-123",
 *   "targetType": "pattern",
 *   "targetId": "456",
 *   "relationshipType": "uses_pattern",
 *   "context": { "userId": "user-1", "sessionId": "sess-1" },
 *   "metadata": { "similarity": 0.85 },
 *   "executionTimeMs": 123,
 *   "success": true
 * }
 */
router.post('/record', requireXRefMapper, async (req, res) => {
  try {
    const {
      sourceType,
      sourceId,
      targetType,
      targetId,
      relationshipType,
      context = {},
      metadata = {},
      executionTimeMs = null,
      success = true,
      errorMessage = null
    } = req.body;

    // Validate required fields
    if (!sourceType || !sourceId || !targetType || !targetId || !relationshipType) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: sourceType, sourceId, targetType, targetId, relationshipType'
      });
    }

    const relationshipId = await xrefMapper.record({
      sourceType,
      sourceId,
      targetType,
      targetId,
      relationshipType,
      context,
      metadata,
      executionTimeMs,
      success,
      errorMessage
    });

    res.json({
      status: 'success',
      relationshipId,
      message: 'Relationship recorded'
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/xref/record-batch
 * Manually record multiple relationships at once
 *
 * Body: Array of relationship objects
 */
router.post('/record-batch', requireXRefMapper, async (req, res) => {
  try {
    const relationships = req.body;

    if (!Array.isArray(relationships)) {
      return res.status(400).json({
        status: 'error',
        message: 'Body must be an array of relationship objects'
      });
    }

    const count = await xrefMapper.recordBatch(relationships);

    res.json({
      status: 'success',
      count,
      message: `Recorded ${count} relationships`
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Health Check
// ============================================================================

/**
 * GET /api/xref/health
 * Check if xref system is operational
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    xrefMapper: xrefMapper ? 'initialized' : 'not initialized',
    database: db ? 'connected' : 'not connected'
  });
});

module.exports = { router, initRoutes };

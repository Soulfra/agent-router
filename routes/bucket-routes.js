/**
 * Bucket System API Routes
 *
 * Endpoints for the 12-bucket integration system:
 * - List and query buckets
 * - Execute requests through buckets
 * - View reasoning logs
 * - Manage todos and comments
 * - Version history
 * - Performance monitoring
 */

const express = require('express');
const router = express.Router();
const BucketMapReduce = require('../lib/bucket-map-reduce');

let bucketOrchestrator = null;

/**
 * Initialize routes with bucket orchestrator
 */
function initRoutes(components) {
  bucketOrchestrator = components.bucketOrchestrator;

  if (bucketOrchestrator) {
    console.log('✓ Bucket routes initialized');
  } else {
    console.warn('⚠ Bucket routes initialized without orchestrator');
  }

  return router;
}

/**
 * Middleware: Ensure orchestrator is available
 */
function requireOrchestrator(req, res, next) {
  if (!bucketOrchestrator) {
    return res.status(503).json({
      status: 'error',
      message: 'Bucket orchestrator not initialized'
    });
  }
  next();
}

// ============================================================================
// Bucket Listing & Info
// ============================================================================

/**
 * GET /api/buckets
 * List all buckets
 */
router.get('/', requireOrchestrator, async (req, res) => {
  try {
    const buckets = bucketOrchestrator.getAllBuckets();

    res.json({
      status: 'success',
      count: buckets.length,
      buckets
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/buckets/categories/:category
 * Get buckets by category (technical, creative, business)
 */
router.get('/categories/:category', requireOrchestrator, async (req, res) => {
  try {
    const { category } = req.params;

    const buckets = bucketOrchestrator.getBucketsByCategory(category);

    res.json({
      status: 'success',
      category,
      count: buckets.length,
      buckets
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/buckets/domains/:domain
 * Get buckets by domain context (code, creative, reasoning, fact, simple)
 */
router.get('/domains/:domain', requireOrchestrator, async (req, res) => {
  try {
    const { domain } = req.params;

    const buckets = bucketOrchestrator.getBucketsByDomain(domain);

    res.json({
      status: 'success',
      domain,
      count: buckets.length,
      buckets
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/buckets/:bucketId
 * Get specific bucket details
 */
router.get('/:bucketId', requireOrchestrator, async (req, res) => {
  try {
    const { bucketId } = req.params;

    const bucket = bucketOrchestrator.getBucket(bucketId);

    if (!bucket) {
      return res.status(404).json({
        status: 'error',
        message: `Bucket not found: ${bucketId}`
      });
    }

    const performance = await bucket.getPerformance();

    res.json({
      status: 'success',
      bucket: bucket.toJSON(),
      performance
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Request Execution
// ============================================================================

/**
 * POST /api/buckets/route
 * Route request to best bucket
 *
 * Body: { prompt, userId?, sessionId?, category?, domainContext? }
 */
router.post('/route', requireOrchestrator, async (req, res) => {
  try {
    const request = req.body;

    if (!request.prompt) {
      return res.status(400).json({
        status: 'error',
        message: 'prompt is required'
      });
    }

    const result = await bucketOrchestrator.route(request);

    res.json({
      status: 'success',
      ...result
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/buckets/broadcast
 * Send request to ALL buckets (testing/comparison)
 *
 * Body: { prompt, userId?, sessionId? }
 */
router.post('/broadcast', requireOrchestrator, async (req, res) => {
  try {
    const request = req.body;

    if (!request.prompt) {
      return res.status(400).json({
        status: 'error',
        message: 'prompt is required'
      });
    }

    const results = await bucketOrchestrator.broadcast(request);

    // Summary
    const summary = {
      totalBuckets: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      fastestBucket: results[0]?.bucketId,
      fastestTime: results[0]?.responseTime
    };

    res.json({
      status: 'success',
      summary,
      results
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/buckets/map-reduce
 * Process large document using map-reduce across buckets
 *
 * Body: {
 *   document: string (large document to process),
 *   systemPrompt?: string (instructions for each chunk),
 *   strategy?: 'auto' | 'concatenate' | 'summarize' | 'statistics' | 'structured',
 *   userId?: string,
 *   sessionId?: string,
 *   context?: object
 * }
 *
 * Returns: {
 *   response: aggregated result,
 *   metadata: {
 *     mapReduce: true,
 *     strategy: string,
 *     chunks: number,
 *     bucketsUsed: number,
 *     totalTime: number,
 *     stats: {...}
 *   }
 * }
 */
router.post('/map-reduce', requireOrchestrator, async (req, res) => {
  try {
    const { document, systemPrompt, strategy, userId, sessionId, context } = req.body;

    if (!document) {
      return res.status(400).json({
        status: 'error',
        message: 'document is required'
      });
    }

    // Initialize map-reduce processor
    const mapReduce = new BucketMapReduce({
      bucketOrchestrator,
      maxTokens: 4096,
      overlapTokens: 200,
      safetyMargin: 500
    });

    // Check if document needs map-reduce
    const needsChunking = mapReduce.needsMapReduce(document);

    if (!needsChunking) {
      // Document fits in single bucket, route normally
      const result = await bucketOrchestrator.route({
        prompt: document,
        userId,
        sessionId,
        context
      });

      return res.json({
        status: 'success',
        ...result,
        metadata: {
          mapReduce: false,
          reason: 'Document small enough for single bucket'
        }
      });
    }

    // Execute map-reduce
    const result = await mapReduce.execute({
      document,
      systemPrompt: systemPrompt || '',
      strategy: strategy || 'auto',
      userId,
      sessionId,
      context: context || {}
    });

    res.json({
      status: 'success',
      ...result
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/buckets/:bucketId/execute
 * Execute request through specific bucket
 *
 * Body: { prompt, userId?, sessionId?, context? }
 */
router.post('/:bucketId/execute', requireOrchestrator, async (req, res) => {
  try {
    const { bucketId } = req.params;
    const request = req.body;

    if (!request.prompt) {
      return res.status(400).json({
        status: 'error',
        message: 'prompt is required'
      });
    }

    const bucket = bucketOrchestrator.getBucket(bucketId);

    if (!bucket) {
      return res.status(404).json({
        status: 'error',
        message: `Bucket not found: ${bucketId}`
      });
    }

    const result = await bucket.execute(request);

    res.json({
      status: 'success',
      ...result
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Reasoning & Decision Logs
// ============================================================================

/**
 * GET /api/buckets/:bucketId/reasoning
 * Get reasoning log for bucket
 *
 * Query params:
 * - limit: Number of entries (default 10)
 */
router.get('/:bucketId/reasoning', requireOrchestrator, async (req, res) => {
  try {
    const { bucketId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const bucket = bucketOrchestrator.getBucket(bucketId);

    if (!bucket) {
      return res.status(404).json({
        status: 'error',
        message: `Bucket not found: ${bucketId}`
      });
    }

    const reasoningLog = await bucket.getReasoningLog(limit);

    res.json({
      status: 'success',
      bucketId,
      bucketName: bucket.bucketName,
      count: reasoningLog.length,
      reasoningLog
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Todos
// ============================================================================

/**
 * GET /api/buckets/:bucketId/todos
 * Get todos for bucket
 *
 * Query params:
 * - status: Filter by status (pending, in_progress, completed, etc.)
 */
router.get('/:bucketId/todos', requireOrchestrator, async (req, res) => {
  try {
    const { bucketId } = req.params;
    const { status } = req.query;

    const bucket = bucketOrchestrator.getBucket(bucketId);

    if (!bucket) {
      return res.status(404).json({
        status: 'error',
        message: `Bucket not found: ${bucketId}`
      });
    }

    const todos = await bucket.getTodos(status);

    res.json({
      status: 'success',
      bucketId,
      bucketName: bucket.bucketName,
      count: todos.length,
      todos
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/buckets/:bucketId/todos
 * Add todo to bucket
 *
 * Body: { title, description?, priority?, whyNeeded?, assignedTo? }
 */
router.post('/:bucketId/todos', requireOrchestrator, async (req, res) => {
  try {
    const { bucketId } = req.params;
    const todo = req.body;

    if (!todo.title) {
      return res.status(400).json({
        status: 'error',
        message: 'title is required'
      });
    }

    const bucket = bucketOrchestrator.getBucket(bucketId);

    if (!bucket) {
      return res.status(404).json({
        status: 'error',
        message: `Bucket not found: ${bucketId}`
      });
    }

    const todoId = await bucket.addTodo(todo);

    res.json({
      status: 'success',
      message: 'Todo added',
      todoId
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Comments
// ============================================================================

/**
 * POST /api/buckets/:bucketId/comments
 * Add comment to bucket
 *
 * Body: { author, text, authorType?, type? }
 */
router.post('/:bucketId/comments', requireOrchestrator, async (req, res) => {
  try {
    const { bucketId } = req.params;
    const comment = req.body;

    if (!comment.author || !comment.text) {
      return res.status(400).json({
        status: 'error',
        message: 'author and text are required'
      });
    }

    const bucket = bucketOrchestrator.getBucket(bucketId);

    if (!bucket) {
      return res.status(404).json({
        status: 'error',
        message: `Bucket not found: ${bucketId}`
      });
    }

    const commentId = await bucket.addComment(comment);

    res.json({
      status: 'success',
      message: 'Comment added',
      commentId
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Versions
// ============================================================================

/**
 * GET /api/buckets/:bucketId/versions
 * Get version history for bucket
 */
router.get('/:bucketId/versions', requireOrchestrator, async (req, res) => {
  try {
    const { bucketId } = req.params;

    const bucket = bucketOrchestrator.getBucket(bucketId);

    if (!bucket) {
      return res.status(404).json({
        status: 'error',
        message: `Bucket not found: ${bucketId}`
      });
    }

    const versions = await bucket.getVersionHistory();

    res.json({
      status: 'success',
      bucketId,
      bucketName: bucket.bucketName,
      currentVersion: bucket.currentVersion,
      count: versions.length,
      versions
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/buckets/:bucketId/versions
 * Create new version
 *
 * Body: { versionName, changesSummary, reasoning }
 */
router.post('/:bucketId/versions', requireOrchestrator, async (req, res) => {
  try {
    const { bucketId } = req.params;
    const { versionName, changesSummary, reasoning } = req.body;

    if (!versionName || !changesSummary || !reasoning) {
      return res.status(400).json({
        status: 'error',
        message: 'versionName, changesSummary, and reasoning are required'
      });
    }

    const bucket = bucketOrchestrator.getBucket(bucketId);

    if (!bucket) {
      return res.status(404).json({
        status: 'error',
        message: `Bucket not found: ${bucketId}`
      });
    }

    const versionNumber = await bucket.createVersion(versionName, changesSummary, reasoning);

    res.json({
      status: 'success',
      message: 'Version created',
      versionNumber
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Performance & Monitoring
// ============================================================================

/**
 * GET /api/buckets/:bucketId/performance
 * Get performance metrics for bucket
 */
router.get('/:bucketId/performance', requireOrchestrator, async (req, res) => {
  try {
    const { bucketId } = req.params;

    const bucket = bucketOrchestrator.getBucket(bucketId);

    if (!bucket) {
      return res.status(404).json({
        status: 'error',
        message: `Bucket not found: ${bucketId}`
      });
    }

    const performance = await bucket.getPerformance();

    res.json({
      status: 'success',
      bucketId,
      bucketName: bucket.bucketName,
      performance
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/buckets/performance/aggregate
 * Get aggregate performance across all buckets
 */
router.get('/performance/aggregate', requireOrchestrator, async (req, res) => {
  try {
    const aggregate = await bucketOrchestrator.getAggregatePerformance();

    res.json({
      status: 'success',
      aggregate
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/buckets/health
 * Get health status of bucket system
 */
router.get('/health', requireOrchestrator, async (req, res) => {
  try {
    const health = await bucketOrchestrator.getHealthStatus();

    const statusCode = health.status === 'healthy' ? 200 :
                       health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json({
      status: 'success',
      health
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/buckets/compare
 * Compare performance of multiple buckets
 *
 * Query params:
 * - bucketIds: Comma-separated bucket IDs
 */
router.get('/compare', requireOrchestrator, async (req, res) => {
  try {
    const { bucketIds } = req.query;

    if (!bucketIds) {
      return res.status(400).json({
        status: 'error',
        message: 'bucketIds query param required (comma-separated)'
      });
    }

    const ids = bucketIds.split(',').map(id => id.trim());

    const comparison = await bucketOrchestrator.compareBuckets(ids);

    res.json({
      status: 'success',
      comparison
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ============================================================================
// Management
// ============================================================================

/**
 * POST /api/buckets/:bucketId/pause
 * Pause bucket
 *
 * Body: { reason }
 */
router.post('/:bucketId/pause', requireOrchestrator, async (req, res) => {
  try {
    const { bucketId } = req.params;
    const { reason } = req.body;

    const bucket = bucketOrchestrator.getBucket(bucketId);

    if (!bucket) {
      return res.status(404).json({
        status: 'error',
        message: `Bucket not found: ${bucketId}`
      });
    }

    await bucket.pause(reason || 'Manual pause');

    res.json({
      status: 'success',
      message: `Bucket ${bucketId} paused`
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/buckets/:bucketId/resume
 * Resume paused bucket
 */
router.post('/:bucketId/resume', requireOrchestrator, async (req, res) => {
  try {
    const { bucketId } = req.params;

    const bucket = bucketOrchestrator.getBucket(bucketId);

    if (!bucket) {
      return res.status(404).json({
        status: 'error',
        message: `Bucket not found: ${bucketId}`
      });
    }

    await bucket.resume();

    res.json({
      status: 'success',
      message: `Bucket ${bucketId} resumed`
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/buckets/:bucketId/reload
 * Reload bucket from database
 */
router.post('/:bucketId/reload', requireOrchestrator, async (req, res) => {
  try {
    const { bucketId } = req.params;

    await bucketOrchestrator.reloadBucket(bucketId);

    res.json({
      status: 'success',
      message: `Bucket ${bucketId} reloaded`
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/buckets/reload-all
 * Reload all buckets from database
 */
router.post('/reload-all', requireOrchestrator, async (req, res) => {
  try {
    await bucketOrchestrator.reloadAll();

    res.json({
      status: 'success',
      message: 'All buckets reloaded'
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = { router, initRoutes };

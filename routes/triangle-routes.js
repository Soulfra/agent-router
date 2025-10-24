/**
 * Triangle Consensus Routes
 *
 * API endpoints for multi-provider consensus queries.
 * Sends same prompt to 3 AI providers, synthesizes consensus, generates story.
 *
 * Routes:
 * - POST /api/chat/triangle - Query with consensus
 * - POST /api/triangle/batch - Batch queries
 * - GET /api/triangle/history - View past queries (TODO)
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function initRoutes(db, triangleEngine) {
  if (!db) {
    throw new Error('Database connection required for triangle routes');
  }

  if (!triangleEngine) {
    throw new Error('TriangleConsensusEngine required for triangle routes');
  }

  /**
   * POST /api/chat/triangle
   * Query all 3 providers with consensus
   *
   * Request body:
   * {
   *   "prompt": "Your question",
   *   "providers": ["openai", "anthropic", "deepseek"], // optional
   *   "models": { "openai": "gpt-4", ... }, // optional
   *   "synthesize": true, // optional, default true
   *   "generateStory": true, // optional, default true
   *   "taskType": "code" // optional: code, creative, reasoning, fact, simple
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "responses": { openai: "...", anthropic: "...", deepseek: "..." },
   *   "consensus": "Synthesized answer",
   *   "confidence": 0.87,
   *   "story": "We consulted 3 AI experts...",
   *   "billing": { total_cost_usd: 0.081, ... }
   * }
   */
  router.post('/chat/triangle', async (req, res) => {
    try {
      const userId = req.session?.userId || req.headers['x-user-id'] || req.body.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const {
        prompt,
        providers,
        models,
        synthesize = true,
        generateStory = true,
        taskType
      } = req.body;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Prompt required and must be non-empty string'
        });
      }

      // Get user context
      const userResult = await db.query(
        'SELECT user_id, email, tenant_id FROM users WHERE user_id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        });
      }

      const user = userResult.rows[0];

      // Check if user can afford (rough estimate: $0.10 per triangle query)
      // NOTE: Skipping credit check for now - credits system migration may not be run yet
      /*
      const estimatedCostCents = 10;
      try {
        const balanceResult = await db.query(
          'SELECT can_afford($1, $2) as can_afford, get_user_balance($1) as balance',
          [userId, estimatedCostCents]
        );

        if (balanceResult.rows.length > 0 && !balanceResult.rows[0].can_afford) {
          return res.status(402).json({
            success: false,
            error: 'Insufficient credits',
            balance_cents: balanceResult.rows[0].balance,
            required_cents: estimatedCostCents,
            balance_usd: (balanceResult.rows[0].balance / 100).toFixed(2),
            required_usd: (estimatedCostCents / 100).toFixed(2)
          });
        }
      } catch (creditCheckError) {
        // Credits system not available - continue anyway
        console.warn('[TriangleRoutes] Credits check skipped:', creditCheckError.message);
      }
      */

      // Execute triangle query
      console.log(`[TriangleRoutes] User ${user.email} querying: "${prompt.substring(0, 50)}..."`);

      const result = await triangleEngine.query({
        prompt,
        providers,
        models,
        synthesize,
        generateStory,
        taskType,
        context: {
          userId: user.user_id,
          tenantId: user.tenant_id,
          sessionId: req.session?.id || null
        }
      });

      // Deduct user credits based on actual cost
      // NOTE: Skipping billing for now - credits system migration may not be run yet
      const actualCostCents = Math.ceil(result.billing.total_cost_usd * 100);
      console.log(`[TriangleRoutes] Would charge user $${(actualCostCents / 100).toFixed(2)} (billing skipped - credits system not available)`);

      /*
      try {
        await db.query(
          `SELECT deduct_credits(
            $1::uuid,
            $2::integer,
            'triangle_query',
            $3,
            NULL,
            $4::jsonb
          )`,
          [
            userId,
            actualCostCents,
            `Triangle query: "${prompt.substring(0, 50)}..."`,
            JSON.stringify({
              providers_queried: result.providers_queried,
              providers_succeeded: result.providers_succeeded,
              confidence: result.confidence,
              query_latency_ms: result.query_latency_ms
            })
          ]
        );

        console.log(`[TriangleRoutes] User charged $${(actualCostCents / 100).toFixed(2)}`);

      } catch (billingError) {
        console.error('[TriangleRoutes] Billing failed:', billingError.message);
        // Non-fatal: Return response but note billing failure
        result.billing.error = billingError.message;
      }
      */

      // Return result
      res.json(result);

    } catch (error) {
      console.error('[TriangleRoutes] Query failed:', error);
      res.status(500).json({
        success: false,
        error: 'Triangle query failed',
        details: error.message
      });
    }
  });

  /**
   * POST /api/triangle/batch
   * Batch triangle queries
   *
   * Request body:
   * {
   *   "prompts": ["Question 1", "Question 2", ...],
   *   "synthesize": true,
   *   "generateStory": true,
   *   "taskType": "reasoning"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "results": [...],
   *   "total_cost_usd": 0.243,
   *   "total_queries": 3
   * }
   */
  router.post('/triangle/batch', async (req, res) => {
    try {
      const userId = req.session?.userId || req.headers['x-user-id'] || req.body.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const {
        prompts,
        synthesize = true,
        generateStory = true,
        taskType
      } = req.body;

      if (!Array.isArray(prompts) || prompts.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'prompts array required and must be non-empty'
        });
      }

      if (prompts.length > 10) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 10 prompts per batch request'
        });
      }

      // Get user context
      const userResult = await db.query(
        'SELECT user_id, email, tenant_id FROM users WHERE user_id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        });
      }

      const user = userResult.rows[0];

      console.log(`[TriangleRoutes] User ${user.email} batch querying ${prompts.length} prompts`);

      // Execute batch query
      const results = await triangleEngine.batchQuery(prompts, {
        synthesize,
        generateStory,
        taskType,
        context: {
          userId: user.user_id,
          tenantId: user.tenant_id,
          sessionId: req.session?.id || null
        }
      });

      // Calculate total cost
      const totalCostUsd = results.reduce((sum, r) => {
        return sum + (r.billing?.total_cost_usd || 0);
      }, 0);

      const totalCostCents = Math.ceil(totalCostUsd * 100);

      // Deduct user credits
      try {
        await db.query(
          `SELECT deduct_credits(
            $1::uuid,
            $2::integer,
            'triangle_batch',
            $3,
            NULL,
            $4::jsonb
          )`,
          [
            userId,
            totalCostCents,
            `Triangle batch: ${prompts.length} queries`,
            JSON.stringify({
              total_queries: prompts.length,
              successful_queries: results.filter(r => r.success).length
            })
          ]
        );

        console.log(`[TriangleRoutes] User charged $${(totalCostCents / 100).toFixed(2)} for batch`);

      } catch (billingError) {
        console.error('[TriangleRoutes] Batch billing failed:', billingError.message);
      }

      // Return results
      res.json({
        success: true,
        results,
        total_queries: prompts.length,
        successful_queries: results.filter(r => r.success).length,
        failed_queries: results.filter(r => !r.success).length,
        total_cost_usd: totalCostUsd,
        total_cost_cents: totalCostCents
      });

    } catch (error) {
      console.error('[TriangleRoutes] Batch query failed:', error);
      res.status(500).json({
        success: false,
        error: 'Triangle batch query failed',
        details: error.message
      });
    }
  });

  /**
   * GET /api/triangle/stats
   * Get triangle usage statistics for current user
   *
   * Response:
   * {
   *   "success": true,
   *   "total_queries": 42,
   *   "total_cost_usd": 3.42,
   *   "avg_confidence": 0.85,
   *   "providers_used": { openai: 42, anthropic: 42, deepseek: 42 }
   * }
   */
  router.get('/triangle/stats', async (req, res) => {
    try {
      const userId = req.session?.userId || req.headers['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Get triangle query stats from credit_transactions
      const statsResult = await db.query(`
        SELECT
          COUNT(*) as total_queries,
          SUM(ABS(amount_cents)) as total_cost_cents,
          AVG((metadata->>'confidence')::FLOAT) as avg_confidence
        FROM credit_transactions
        WHERE user_id = $1
          AND type IN ('triangle_query', 'triangle_batch')
          AND created_at > NOW() - INTERVAL '30 days'
      `, [userId]);

      const stats = statsResult.rows[0] || {
        total_queries: 0,
        total_cost_cents: 0,
        avg_confidence: null
      };

      res.json({
        success: true,
        total_queries: parseInt(stats.total_queries) || 0,
        total_cost_cents: parseInt(stats.total_cost_cents) || 0,
        total_cost_usd: ((parseInt(stats.total_cost_cents) || 0) / 100).toFixed(2),
        avg_confidence: stats.avg_confidence ? parseFloat(stats.avg_confidence).toFixed(2) : null,
        period_days: 30
      });

    } catch (error) {
      console.error('[TriangleRoutes] Stats query failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch triangle stats',
        details: error.message
      });
    }
  });

  return router;
}

module.exports = { initRoutes };

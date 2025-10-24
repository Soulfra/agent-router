/**
 * Documentation API Routes
 *
 * Provides REST API for accessing version-aware documentation
 * Supports searching, fetching, and managing cached documentation
 *
 * Endpoints:
 * - GET /api/docs/:package/:version? - Get documentation for a package
 * - GET /api/docs/search?q=query - Search documentation
 * - POST /api/docs/fetch - Queue documentation fetch
 * - GET /api/docs/popular - Get popular packages
 * - GET /api/docs/deprecated - Get deprecated packages in use
 * - GET /api/docs/queue - Get fetch queue status
 * - POST /api/docs/usage/log - Log documentation usage (for analytics)
 */

const express = require('express');

/**
 * Initialize documentation routes
 *
 * @param {Object} db - Database connection
 * @param {Object} documentationRegistry - DocumentationRegistry instance
 * @returns {Object} Express router
 */
function initializeRoutes(db, documentationRegistry) {
  const router = express.Router();

  if (!db) {
    throw new Error('Database connection required for documentation routes');
  }

  if (!documentationRegistry) {
    throw new Error('DocumentationRegistry instance required');
  }

  /**
   * GET /api/docs/:package/:version?
   * Get documentation for a specific package version
   *
   * Query params:
   * - include: comma-separated list of sections to include (readme,types,examples,api)
   * - format: 'json' or 'markdown' (default: json)
   *
   * Response:
   * {
   *   package_name: "stripe",
   *   version: "12.0.0",
   *   readme: "...",
   *   documentation: {...},
   *   types: "...",
   *   is_cached: true,
   *   fetched_at: "2025-10-13T..."
   * }
   */
  router.get('/:package/:version?', async (req, res) => {
    try {
      const packageName = req.params.package;
      const version = req.params.version || 'latest';
      const include = req.query.include ? req.query.include.split(',') : ['readme', 'documentation', 'types'];
      const format = req.query.format || 'json';

      console.log(`[DocRoutes] GET /${packageName}/${version}`);

      // Get documentation
      const doc = await documentationRegistry.get(packageName, version);

      if (!doc) {
        // Not in cache - documentation has been queued for fetching
        return res.status(202).json({
          message: 'Documentation not cached, queued for fetching',
          package_name: packageName,
          version: version,
          status: 'queued'
        });
      }

      // Filter response based on 'include' parameter
      const response = {
        package_name: doc.packageName,
        version: doc.version,
        is_cached: doc.isCached,
        fetched_at: doc.fetchedAt
      };

      if (include.includes('readme')) {
        response.readme = doc.readme;
      }

      if (include.includes('documentation')) {
        response.documentation = doc.documentation;
      }

      if (include.includes('types')) {
        response.types = doc.types;
      }

      // Log usage (fire and forget)
      documentationRegistry.logUsage(packageName, version, {
        userId: req.user?.userId,
        sessionId: req.sessionId,
        query: req.query.q
      }).catch(err => console.error('[DocRoutes] Error logging usage:', err.message));

      res.json(response);

    } catch (error) {
      console.error('[DocRoutes] Error getting documentation:', error);
      res.status(500).json({
        error: 'Failed to get documentation',
        details: error.message
      });
    }
  });

  /**
   * GET /api/docs/search
   * Search documentation across all cached packages
   *
   * Query params:
   * - q: search query (required)
   * - limit: max results (default: 10, max: 50)
   *
   * Response:
   * {
   *   query: "stripe checkout",
   *   results: [
   *     {
   *       package_name: "stripe",
   *       version: "12.0.0",
   *       title: "Stripe API",
   *       summary: "...",
   *       relevance: 0.95
   *     }
   *   ],
   *   total: 3
   * }
   */
  router.get('/search', async (req, res) => {
    try {
      const query = req.query.q;

      if (!query) {
        return res.status(400).json({ error: 'Query parameter "q" required' });
      }

      const limit = Math.min(parseInt(req.query.limit) || 10, 50);

      console.log(`[DocRoutes] Searching for: "${query}"`);

      const results = await documentationRegistry.search(query, limit);

      res.json({
        query: query,
        results: results,
        total: results.length
      });

    } catch (error) {
      console.error('[DocRoutes] Error searching documentation:', error);
      res.status(500).json({
        error: 'Search failed',
        details: error.message
      });
    }
  });

  /**
   * POST /api/docs/fetch
   * Manually queue documentation fetch
   *
   * Request body:
   * {
   *   package_name: "openai",
   *   version: "4.0.0" (optional, defaults to "latest"),
   *   package_type: "npm" (optional),
   *   priority: 50 (optional, 0-100)
   * }
   *
   * Response:
   * {
   *   queue_id: "uuid",
   *   package_name: "openai",
   *   version: "latest",
   *   status: "queued"
   * }
   */
  router.post('/fetch', async (req, res) => {
    try {
      const { package_name, version, package_type, priority } = req.body;

      if (!package_name) {
        return res.status(400).json({ error: 'package_name required' });
      }

      const queueId = await documentationRegistry.queueFetch(
        package_name,
        version || 'latest',
        package_type || 'npm',
        priority || 0,
        req.user?.userId
      );

      res.json({
        queue_id: queueId,
        package_name: package_name,
        version: version || 'latest',
        status: 'queued'
      });

    } catch (error) {
      console.error('[DocRoutes] Error queuing fetch:', error);
      res.status(500).json({
        error: 'Failed to queue fetch',
        details: error.message
      });
    }
  });

  /**
   * GET /api/docs/popular
   * Get most popular packages (by usage in last 30 days)
   *
   * Response:
   * {
   *   packages: [
   *     {
   *       package_name: "stripe",
   *       version: "12.0.0",
   *       access_count: 150,
   *       unique_users: 25,
   *       helpfulness_score: 0.85,
   *       last_accessed: "2025-10-13T..."
   *     }
   *   ]
   * }
   */
  router.get('/popular', async (req, res) => {
    try {
      const packages = await documentationRegistry.getPopularPackages();

      res.json({ packages });

    } catch (error) {
      console.error('[DocRoutes] Error getting popular packages:', error);
      res.status(500).json({
        error: 'Failed to get popular packages',
        details: error.message
      });
    }
  });

  /**
   * GET /api/docs/deprecated
   * Get deprecated packages still in use (alert for upgrades)
   *
   * Response:
   * {
   *   packages: [
   *     {
   *       package_name: "moment",
   *       version: "2.29.1",
   *       deprecated_message: "Use dayjs or date-fns instead",
   *       replacement_package: "dayjs",
   *       active_users: 12,
   *       last_used: "2025-10-13T..."
   *     }
   *   ]
   * }
   */
  router.get('/deprecated', async (req, res) => {
    try {
      const packages = await documentationRegistry.getDeprecatedPackagesInUse();

      res.json({ packages });

    } catch (error) {
      console.error('[DocRoutes] Error getting deprecated packages:', error);
      res.status(500).json({
        error: 'Failed to get deprecated packages',
        details: error.message
      });
    }
  });

  /**
   * GET /api/docs/queue
   * Get fetch queue status
   *
   * Query params:
   * - status: filter by status (pending, processing, completed, failed)
   * - limit: max results (default: 50)
   *
   * Response:
   * {
   *   queue: [
   *     {
   *       queue_id: "uuid",
   *       package_name: "openai",
   *       version: "latest",
   *       status: "pending",
   *       priority: 50,
   *       attempts: 0,
   *       created_at: "2025-10-13T..."
   *     }
   *   ],
   *   stats: {
   *     pending: 10,
   *     processing: 2,
   *     completed: 150,
   *     failed: 3
   *   }
   * }
   */
  router.get('/queue', async (req, res) => {
    try {
      const status = req.query.status;
      const limit = parseInt(req.query.limit) || 50;

      let query = `
        SELECT
          queue_id,
          package_name,
          version,
          package_type,
          source,
          status,
          priority,
          attempts,
          max_attempts,
          error_message,
          created_at,
          last_attempt_at,
          completed_at
        FROM documentation_fetch_queue
      `;

      const params = [];

      if (status) {
        query += ` WHERE status = $1`;
        params.push(status);
        query += ` ORDER BY priority DESC, created_at ASC LIMIT $2`;
        params.push(limit);
      } else {
        query += ` ORDER BY created_at DESC LIMIT $1`;
        params.push(limit);
      }

      const result = await db.query(query, params);

      // Get stats
      const statsResult = await db.query(`
        SELECT
          status,
          COUNT(*) as count
        FROM documentation_fetch_queue
        GROUP BY status
      `);

      const stats = {};
      statsResult.rows.forEach(row => {
        stats[row.status] = parseInt(row.count);
      });

      res.json({
        queue: result.rows,
        stats: stats
      });

    } catch (error) {
      console.error('[DocRoutes] Error getting queue status:', error);
      res.status(500).json({
        error: 'Failed to get queue status',
        details: error.message
      });
    }
  });

  /**
   * POST /api/docs/usage/log
   * Log documentation usage (for analytics)
   *
   * Request body:
   * {
   *   package_name: "stripe",
   *   version: "12.0.0",
   *   section: "checkout.create" (optional),
   *   query: "how to create checkout session" (optional),
   *   use_case: "implementing payments" (optional),
   *   was_helpful: true (optional)
   * }
   *
   * Response:
   * {
   *   logged: true
   * }
   */
  router.post('/usage/log', async (req, res) => {
    try {
      const { package_name, version, section, query, use_case, was_helpful } = req.body;

      if (!package_name || !version) {
        return res.status(400).json({ error: 'package_name and version required' });
      }

      await documentationRegistry.logUsage(package_name, version, {
        section,
        query,
        useCase: use_case,
        userId: req.user?.userId,
        sessionId: req.sessionId
      });

      // If feedback provided, update it
      if (was_helpful !== undefined) {
        await db.query(
          `UPDATE documentation_usage
           SET was_helpful = $1
           WHERE package_name = $2 AND version = $3 AND user_id = $4
           ORDER BY accessed_at DESC
           LIMIT 1`,
          [was_helpful, package_name, version, req.user?.userId]
        );
      }

      res.json({ logged: true });

    } catch (error) {
      console.error('[DocRoutes] Error logging usage:', error);
      res.status(500).json({
        error: 'Failed to log usage',
        details: error.message
      });
    }
  });

  /**
   * GET /api/docs/packages/:package/versions
   * Get all versions of a package
   *
   * Response:
   * {
   *   package_name: "stripe",
   *   versions: [
   *     {
   *       version: "12.0.0",
   *       published_at: "2025-01-15T...",
   *       is_latest: true,
   *       is_deprecated: false,
   *       downloads_last_week: 150000
   *     }
   *   ]
   * }
   */
  router.get('/packages/:package/versions', async (req, res) => {
    try {
      const packageName = req.params.package;

      const result = await db.query(
        `SELECT
          version,
          published_at,
          is_prerelease,
          is_deprecated,
          changelog_entry,
          breaking_changes,
          new_features,
          bug_fixes,
          downloads_total,
          downloads_last_week,
          release_notes_url
        FROM package_version_timeline
        WHERE package_name = $1
        ORDER BY published_at DESC`,
        [packageName]
      );

      res.json({
        package_name: packageName,
        versions: result.rows,
        total: result.rows.length
      });

    } catch (error) {
      console.error('[DocRoutes] Error getting versions:', error);
      res.status(500).json({
        error: 'Failed to get versions',
        details: error.message
      });
    }
  });

  /**
   * GET /api/docs/packages/:package/:version/api
   * Get API endpoints documentation for a package
   *
   * Response:
   * {
   *   package_name: "stripe",
   *   version: "12.0.0",
   *   endpoints: [
   *     {
   *       method: "POST",
   *       path: "/v1/checkout/sessions",
   *       description: "Create a checkout session",
   *       parameters: [...],
   *       request_body: {...},
   *       response_schema: {...},
   *       examples: [...]
   *     }
   *   ]
   * }
   */
  router.get('/packages/:package/:version/api', async (req, res) => {
    try {
      const packageName = req.params.package;
      const version = req.params.version || 'latest';

      const result = await db.query(
        `SELECT
          method,
          path,
          description,
          parameters,
          request_body,
          response_schema,
          examples,
          is_deprecated,
          deprecated_since,
          replacement_endpoint,
          requires_auth,
          auth_types,
          rate_limit
        FROM documentation_api_endpoints
        WHERE package_name = $1 AND version = $2
        ORDER BY path, method`,
        [packageName, version]
      );

      res.json({
        package_name: packageName,
        version: version,
        endpoints: result.rows,
        total: result.rows.length
      });

    } catch (error) {
      console.error('[DocRoutes] Error getting API endpoints:', error);
      res.status(500).json({
        error: 'Failed to get API endpoints',
        details: error.message
      });
    }
  });

  return router;
}

module.exports = { initializeRoutes };

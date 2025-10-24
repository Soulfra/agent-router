/**
 * Search Analytics Routes
 *
 * Track user searches so CalRiven can autonomously research popular queries.
 * CalRiven appears omniscient by pre-caching answers to trending searches.
 *
 * Endpoints:
 * - POST /api/analytics/search - Log a search query
 * - GET /api/analytics/trending - Get trending searches
 * - GET /api/analytics/stats - Get search statistics
 */

const express = require('express');

function initRoutes(db) {
  const router = express.Router();

  /**
   * POST /api/analytics/search
   * Log a search query
   *
   * Body:
   * {
   *   "query": "pirate treasure 2025",
   *   "userId": "user_123",  // optional
   *   "source": "dashboard"  // optional
   * }
   */
  router.post('/search', async (req, res) => {
    try {
      const { query, userId = null, source = 'unknown' } = req.body;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query is required'
        });
      }

      // Create table if doesn't exist
      await createTableIfNotExists(db);

      // Insert search log
      await db.query(
        `INSERT INTO search_analytics (query, user_id, source, searched_at)
         VALUES ($1, $2, $3, NOW())`,
        [query, userId, source]
      );

      res.json({
        success: true,
        message: 'Search logged'
      });

    } catch (error) {
      console.error('[SearchAnalytics] Log error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/analytics/trending
   * Get trending searches
   *
   * Query params:
   * - limit: Number of results (default: 10)
   * - timeframe: 1h, 24h, 7d, 30d (default: 24h)
   */
  router.get('/trending', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const timeframe = req.query.timeframe || '24h';

      // Create table if doesn't exist
      await createTableIfNotExists(db);

      // Parse timeframe
      const interval = parseTimeframe(timeframe);

      // Get trending searches
      const result = await db.query(
        `SELECT
           query,
           COUNT(*) as search_count,
           COUNT(DISTINCT user_id) as unique_users,
           MAX(searched_at) as last_searched
         FROM search_analytics
         WHERE searched_at > NOW() - INTERVAL '${interval}'
         GROUP BY query
         ORDER BY search_count DESC
         LIMIT $1`,
        [limit]
      );

      res.json({
        success: true,
        timeframe,
        count: result.rows.length,
        trending: result.rows.map(row => ({
          query: row.query,
          searchCount: parseInt(row.search_count),
          uniqueUsers: parseInt(row.unique_users),
          lastSearched: row.last_searched
        }))
      });

    } catch (error) {
      console.error('[SearchAnalytics] Trending error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/analytics/stats
   * Get search statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      // Create table if doesn't exist
      await createTableIfNotExists(db);

      // Get total searches
      const totalResult = await db.query(
        'SELECT COUNT(*) as total FROM search_analytics'
      );

      // Get searches last 24h
      const last24hResult = await db.query(
        `SELECT COUNT(*) as total FROM search_analytics
         WHERE searched_at > NOW() - INTERVAL '24 hours'`
      );

      // Get unique queries
      const uniqueResult = await db.query(
        'SELECT COUNT(DISTINCT query) as total FROM search_analytics'
      );

      // Get unique users
      const usersResult = await db.query(
        'SELECT COUNT(DISTINCT user_id) as total FROM search_analytics WHERE user_id IS NOT NULL'
      );

      res.json({
        success: true,
        stats: {
          totalSearches: parseInt(totalResult.rows[0].total),
          last24Hours: parseInt(last24hResult.rows[0].total),
          uniqueQueries: parseInt(uniqueResult.rows[0].total),
          uniqueUsers: parseInt(usersResult.rows[0].total)
        }
      });

    } catch (error) {
      console.error('[SearchAnalytics] Stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

/**
 * Create search_analytics table if it doesn't exist
 */
async function createTableIfNotExists(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS search_analytics (
      id SERIAL PRIMARY KEY,
      query TEXT NOT NULL,
      user_id TEXT,
      source TEXT,
      searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Create indexes
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_search_analytics_query
    ON search_analytics(query)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_search_analytics_searched_at
    ON search_analytics(searched_at DESC)
  `);
}

/**
 * Parse timeframe to PostgreSQL interval
 */
function parseTimeframe(timeframe) {
  const map = {
    '1h': '1 hour',
    '24h': '24 hours',
    '7d': '7 days',
    '30d': '30 days'
  };

  return map[timeframe] || '24 hours';
}

module.exports = { initRoutes };

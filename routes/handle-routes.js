/**
 * Handle Routes (@username system)
 *
 * API endpoints for managing user handles (like Discord/Twitter)
 *
 * Endpoints:
 * - GET /api/handles/check/:handle - Check handle availability
 * - POST /api/handles/set - Set user's handle
 * - GET /api/handles/me - Get authenticated user's handle
 * - GET /api/handles/search - Search handles
 * - GET /api/handles/premium - Get premium handles for purchase
 * - POST /api/handles/purchase - Purchase premium handle
 * - GET /api/handles/history - Get handle change history
 * - GET /api/@:handle - Get user profile by handle (vanity URL)
 */

const express = require('express');

/**
 * Initialize handle routes
 *
 * @param {Object} db - Database connection
 * @param {Object} handleRegistry - HandleRegistry instance
 * @returns {Object} Express router
 */
function initializeRoutes(db, handleRegistry) {
  const router = express.Router();

  if (!db) {
    throw new Error('Database connection required for handle routes');
  }

  if (!handleRegistry) {
    throw new Error('HandleRegistry instance required');
  }

  /**
   * GET /api/handles/check/:handle
   * Check if handle is available
   *
   * Response:
   * {
   *   available: true,
   *   handle: "johndoe",
   *   normalized: "johndoe"
   * }
   *
   * OR
   *
   * {
   *   available: false,
   *   reason: "Handle already taken"
   * }
   */
  router.get('/check/:handle', async (req, res) => {
    try {
      const handle = req.params.handle;

      if (!handle || handle.length < 3 || handle.length > 30) {
        return res.status(400).json({
          available: false,
          reason: 'Handle must be 3-30 characters'
        });
      }

      const result = await handleRegistry.checkAvailability(handle);

      // If not available, suggest alternatives
      if (!result.available) {
        const suggestions = await handleRegistry.suggestAlternatives(handle, 5);
        result.suggestions = suggestions;
      }

      res.json(result);

    } catch (error) {
      console.error('[HandleRoutes] Error checking handle:', error);
      res.status(500).json({
        error: 'Failed to check handle availability',
        details: error.message
      });
    }
  });

  /**
   * POST /api/handles/set
   * Set authenticated user's handle
   *
   * Request body:
   * {
   *   handle: "johndoe"
   * }
   *
   * Response:
   * {
   *   success: true,
   *   handle: "johndoe",
   *   url: "/@johndoe"
   * }
   */
  router.post('/set', async (req, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { handle } = req.body;

      if (!handle) {
        return res.status(400).json({ error: 'Handle required' });
      }

      // Check changes remaining
      const changesRemaining = await handleRegistry.getChangesRemaining(userId);

      const currentHandle = await handleRegistry.getHandle(userId);

      if (currentHandle && changesRemaining <= 0) {
        return res.status(403).json({
          error: 'No handle changes remaining',
          currentHandle: currentHandle,
          changesRemaining: 0
        });
      }

      // Set handle
      const result = await handleRegistry.setHandle(userId, handle, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      if (result.success) {
        res.json({
          ...result,
          changesRemaining: currentHandle ? changesRemaining - 1 : changesRemaining
        });
      } else {
        res.status(400).json(result);
      }

    } catch (error) {
      console.error('[HandleRoutes] Error setting handle:', error);
      res.status(500).json({
        error: 'Failed to set handle',
        details: error.message
      });
    }
  });

  /**
   * GET /api/handles/me
   * Get authenticated user's handle and stats
   *
   * Response:
   * {
   *   handle: "johndoe",
   *   url: "/@johndoe",
   *   changesRemaining: 1,
   *   setAt: "2025-10-13T..."
   * }
   */
  router.get('/me', async (req, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const result = await db.query(
        `SELECT handle, handle_set_at, handle_changes_remaining
         FROM users
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = result.rows[0];

      res.json({
        handle: user.handle,
        url: user.handle ? `/@${user.handle}` : null,
        changesRemaining: user.handle_changes_remaining,
        setAt: user.handle_set_at
      });

    } catch (error) {
      console.error('[HandleRoutes] Error getting user handle:', error);
      res.status(500).json({
        error: 'Failed to get handle',
        details: error.message
      });
    }
  });

  /**
   * GET /api/handles/search
   * Search handles (autocomplete/suggestions)
   *
   * Query params:
   * - q: search query
   * - limit: max results (default: 10)
   *
   * Response:
   * {
   *   query: "john",
   *   results: [
   *     {
   *       userId: "uuid",
   *       handle: "johndoe",
   *       username: "John Doe",
   *       url: "/@johndoe"
   *     }
   *   ]
   * }
   */
  router.get('/search', async (req, res) => {
    try {
      const query = req.query.q;

      if (!query || query.length < 2) {
        return res.status(400).json({
          error: 'Query must be at least 2 characters'
        });
      }

      const limit = Math.min(parseInt(req.query.limit) || 10, 50);

      const results = await handleRegistry.searchHandles(query, limit);

      res.json({
        query: query,
        results: results,
        total: results.length
      });

    } catch (error) {
      console.error('[HandleRoutes] Error searching handles:', error);
      res.status(500).json({
        error: 'Search failed',
        details: error.message
      });
    }
  });

  /**
   * GET /api/handles/premium
   * Get premium handles available for purchase
   *
   * Response:
   * {
   *   handles: [
   *     {
   *       handle: "god",
   *       priceCents: 100000,
   *       priceDollars: "1000.00",
   *       reservedAt: "2025-10-13T..."
   *     }
   *   ]
   * }
   */
  router.get('/premium', async (req, res) => {
    try {
      const handles = await handleRegistry.getPremiumHandles();

      res.json({ handles });

    } catch (error) {
      console.error('[HandleRoutes] Error getting premium handles:', error);
      res.status(500).json({
        error: 'Failed to get premium handles',
        details: error.message
      });
    }
  });

  /**
   * POST /api/handles/purchase
   * Purchase premium handle
   *
   * Request body:
   * {
   *   handle: "god",
   *   paymentIntentId: "pi_..."
   * }
   *
   * Response:
   * {
   *   success: true,
   *   handle: "god",
   *   pricePaid: 100000,
   *   url: "/@god"
   * }
   */
  router.post('/purchase', async (req, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { handle, paymentIntentId } = req.body;

      if (!handle || !paymentIntentId) {
        return res.status(400).json({
          error: 'Handle and paymentIntentId required'
        });
      }

      const result = await handleRegistry.purchasePremiumHandle(
        userId,
        handle,
        paymentIntentId
      );

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error) {
      console.error('[HandleRoutes] Error purchasing premium handle:', error);
      res.status(500).json({
        error: 'Failed to purchase premium handle',
        details: error.message
      });
    }
  });

  /**
   * GET /api/handles/history
   * Get handle change history for authenticated user
   *
   * Response:
   * {
   *   history: [
   *     {
   *       oldHandle: null,
   *       newHandle: "johndoe",
   *       changeReason: "initial_set",
   *       changedAt: "2025-10-13T..."
   *     }
   *   ]
   * }
   */
  router.get('/history', async (req, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const limit = Math.min(parseInt(req.query.limit) || 10, 50);

      const history = await handleRegistry.getHandleHistory(userId, limit);

      res.json({
        history: history.map(h => ({
          oldHandle: h.old_handle,
          newHandle: h.new_handle,
          changeReason: h.change_reason,
          changedAt: h.changed_at
        }))
      });

    } catch (error) {
      console.error('[HandleRoutes] Error getting handle history:', error);
      res.status(500).json({
        error: 'Failed to get handle history',
        details: error.message
      });
    }
  });

  /**
   * GET /api/@:handle
   * Get user profile by handle (vanity URL)
   *
   * Response:
   * {
   *   userId: "uuid",
   *   handle: "johndoe",
   *   username: "John Doe",
   *   email: "john@example.com",
   *   createdAt: "2025-01-01T..."
   * }
   */
  router.get('/@:handle', async (req, res) => {
    try {
      const handle = req.params.handle;

      const user = await handleRegistry.getUserByHandle(handle);

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          handle: handle
        });
      }

      // Don't expose email unless user is viewing their own profile
      const isOwner = req.user?.userId === user.user_id;

      res.json({
        userId: user.user_id,
        handle: user.handle,
        username: user.username,
        email: isOwner ? user.email : undefined,
        createdAt: user.created_at,
        url: `/@${user.handle}`
      });

    } catch (error) {
      console.error('[HandleRoutes] Error getting user by handle:', error);
      res.status(500).json({
        error: 'Failed to get user',
        details: error.message
      });
    }
  });

  return router;
}

module.exports = { initializeRoutes };

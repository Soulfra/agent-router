/**
 * Activity Feed Routes (Real-time events)
 *
 * Live feed of platform activity - who's doing what RIGHT NOW.
 * Like Twitter/X feed but for platform events.
 *
 * Event types:
 * - Feature usage (user accessed X feature)
 * - AI requests (user queried Y model)
 * - Purchases (user bought Z feature)
 * - Achievements (user earned badge)
 * - Milestones (user hit 1000 uses)
 *
 * Reads from:
 * - feature_usage_analytics (feature access events)
 * - model_usage_events (AI requests)
 * - feature_access_overrides (purchases)
 * - user_devices (badge changes)
 *
 * Endpoints:
 * - GET /api/activity/live - Latest activity (polling)
 * - GET /api/activity/feed - Activity feed with pagination
 * - GET /api/activity/user/:userId - User-specific activity
 * - GET /api/activity/feature/:featureName - Feature-specific activity
 * - GET /api/activity/stats - Real-time platform stats
 * - GET /api/activity/stream - SSE endpoint for live streaming
 */

const express = require('express');
const router = express.Router();

// Will be injected via initRoutes
let db = null;

/**
 * Initialize routes with dependencies
 */
function initRoutes(database) {
  db = database;
  return router;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

async function requireAuth(req, res, next) {
  const userId = req.user?.userId || req.session?.userId;

  if (!userId) {
    return res.status(401).json({
      status: 'error',
      error: 'Authentication required'
    });
  }

  req.userId = userId;
  next();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format activity event
 */
function formatActivityEvent(event) {
  const eventMap = {
    'feature_usage': {
      icon: '🎯',
      template: (e) => `${e.username} used ${e.feature_name}`,
      color: 'blue'
    },
    'ai_request': {
      icon: '🤖',
      template: (e) => `${e.username} queried ${e.model_name}`,
      color: 'purple'
    },
    'purchase': {
      icon: '💰',
      template: (e) => `${e.username} purchased ${e.feature_name} for $${(e.price / 100).toFixed(2)}`,
      color: 'green'
    },
    'achievement': {
      icon: '🏆',
      template: (e) => `${e.username} earned ${e.badge} badge`,
      color: 'gold'
    },
    'milestone': {
      icon: '🎉',
      template: (e) => `${e.username} hit ${e.milestone} milestone`,
      color: 'orange'
    }
  };

  const config = eventMap[event.event_type] || {
    icon: '📊',
    template: (e) => `${e.username} activity`,
    color: 'gray'
  };

  return {
    eventId: event.event_id || `${event.event_type}_${Date.now()}`,
    eventType: event.event_type,
    icon: config.icon,
    message: config.template(event),
    color: config.color,
    user: {
      userId: event.user_id,
      username: event.username,
      badge: event.current_badge || 'none'
    },
    metadata: event.metadata || {},
    timestamp: event.timestamp,
    timeAgo: getTimeAgo(new Date(event.timestamp))
  };
}

/**
 * Convert timestamp to "X ago" format
 */
function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ============================================================================
// ACTIVITY FEED ENDPOINTS
// ============================================================================

/**
 * GET /api/activity/live
 * Latest activity (last 1 minute, for polling)
 *
 * Query params:
 * - since: timestamp to get events after (ISO string)
 */
router.get('/live', async (req, res) => {
  try {
    const since = req.query.since || new Date(Date.now() - 60000).toISOString(); // Last minute

    // Get feature usage events
    const featureEvents = await db.query(`
      SELECT
        'feature_usage' as event_type,
        fua.user_id,
        u.username,
        ud.current_badge,
        fua.feature_name,
        fua.used_at as timestamp,
        jsonb_build_object(
          'feature', fua.feature_name,
          'creditsDeducted', fua.credits_deducted,
          'endpoint', fua.endpoint
        ) as metadata
      FROM feature_usage_analytics fua
      JOIN users u ON u.user_id = fua.user_id
      LEFT JOIN user_devices ud ON ud.user_id = u.user_id
      WHERE fua.used_at > $1 AND fua.blocked = FALSE
      ORDER BY fua.used_at DESC
      LIMIT 20
    `, [since]);

    // Get AI request events
    const aiEvents = await db.query(`
      SELECT
        'ai_request' as event_type,
        mue.user_id,
        u.username,
        ud.current_badge,
        mue.model_name,
        mue.created_at as timestamp,
        jsonb_build_object(
          'model', mue.model_name,
          'tokens', mue.total_tokens,
          'cost', mue.cost_usd
        ) as metadata
      FROM model_usage_events mue
      JOIN users u ON u.user_id = mue.user_id
      LEFT JOIN user_devices ud ON ud.user_id = u.user_id
      WHERE mue.created_at > $1
      ORDER BY mue.created_at DESC
      LIMIT 20
    `, [since]);

    // Get purchase events
    const purchaseEvents = await db.query(`
      SELECT
        'purchase' as event_type,
        fao.user_id,
        u.username,
        ud.current_badge,
        fao.feature_name,
        fao.price_paid_cents as price,
        fao.created_at as timestamp,
        jsonb_build_object(
          'feature', fao.feature_name,
          'price', fao.price_paid_cents,
          'accessType', fao.access_type
        ) as metadata
      FROM feature_access_overrides fao
      JOIN users u ON u.user_id = fao.user_id
      LEFT JOIN user_devices ud ON ud.user_id = u.user_id
      WHERE fao.created_at > $1 AND fao.access_type = 'pay_per_feature'
      ORDER BY fao.created_at DESC
      LIMIT 20
    `, [since]);

    // Combine and sort all events
    const allEvents = [
      ...featureEvents.rows,
      ...aiEvents.rows,
      ...purchaseEvents.rows
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
     .slice(0, 50);

    // Format events
    const formattedEvents = allEvents.map(formatActivityEvent);

    res.json({
      status: 'success',
      data: {
        events: formattedEvents,
        count: formattedEvents.length,
        since,
        nextPoll: new Date(Date.now() + 10000).toISOString() // Poll again in 10s
      }
    });

  } catch (error) {
    console.error('[Activity] Live feed error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve live activity',
      details: error.message
    });
  }
});

/**
 * GET /api/activity/feed
 * Paginated activity feed
 *
 * Query params:
 * - limit: results per page (default: 50, max: 100)
 * - offset: pagination offset
 * - eventType: filter by event type
 */
router.get('/feed', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const eventType = req.query.eventType;

    let events = [];

    // Feature usage events
    if (!eventType || eventType === 'feature_usage') {
      const featureEvents = await db.query(`
        SELECT
          'feature_usage' as event_type,
          fua.user_id,
          u.username,
          ud.current_badge,
          fua.feature_name,
          fua.used_at as timestamp,
          jsonb_build_object(
            'feature', fua.feature_name,
            'creditsDeducted', fua.credits_deducted
          ) as metadata
        FROM feature_usage_analytics fua
        JOIN users u ON u.user_id = fua.user_id
        LEFT JOIN user_devices ud ON ud.user_id = u.user_id
        WHERE fua.blocked = FALSE
        ORDER BY fua.used_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      events.push(...featureEvents.rows);
    }

    // AI events
    if (!eventType || eventType === 'ai_request') {
      const aiEvents = await db.query(`
        SELECT
          'ai_request' as event_type,
          mue.user_id,
          u.username,
          ud.current_badge,
          mue.model_name,
          mue.created_at as timestamp,
          jsonb_build_object(
            'model', mue.model_name,
            'tokens', mue.total_tokens
          ) as metadata
        FROM model_usage_events mue
        JOIN users u ON u.user_id = mue.user_id
        LEFT JOIN user_devices ud ON ud.user_id = u.user_id
        ORDER BY mue.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      events.push(...aiEvents.rows);
    }

    // Purchase events
    if (!eventType || eventType === 'purchase') {
      const purchaseEvents = await db.query(`
        SELECT
          'purchase' as event_type,
          fao.user_id,
          u.username,
          ud.current_badge,
          fao.feature_name,
          fao.price_paid_cents as price,
          fao.created_at as timestamp,
          jsonb_build_object(
            'feature', fao.feature_name,
            'price', fao.price_paid_cents
          ) as metadata
        FROM feature_access_overrides fao
        JOIN users u ON u.user_id = fao.user_id
        LEFT JOIN user_devices ud ON ud.user_id = u.user_id
        WHERE fao.access_type = 'pay_per_feature'
        ORDER BY fao.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      events.push(...purchaseEvents.rows);
    }

    // Sort by timestamp
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    events = events.slice(0, limit);

    const formattedEvents = events.map(formatActivityEvent);

    res.json({
      status: 'success',
      data: {
        events: formattedEvents,
        count: formattedEvents.length,
        pagination: {
          limit,
          offset,
          nextOffset: offset + limit
        }
      }
    });

  } catch (error) {
    console.error('[Activity] Feed error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve activity feed',
      details: error.message
    });
  }
});

/**
 * GET /api/activity/user/:userId
 * User-specific activity timeline
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    // Get user info
    const userResult = await db.query(`
      SELECT username, email FROM users WHERE user_id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'User not found'
      });
    }

    // Feature events
    const featureEvents = await db.query(`
      SELECT
        'feature_usage' as event_type,
        $1 as user_id,
        $2 as username,
        ud.current_badge,
        fua.feature_name,
        fua.used_at as timestamp,
        jsonb_build_object('feature', fua.feature_name) as metadata
      FROM feature_usage_analytics fua
      LEFT JOIN user_devices ud ON ud.user_id = fua.user_id
      WHERE fua.user_id = $1 AND fua.blocked = FALSE
      ORDER BY fua.used_at DESC
      LIMIT $3
    `, [userId, userResult.rows[0].username, limit]);

    // AI events
    const aiEvents = await db.query(`
      SELECT
        'ai_request' as event_type,
        $1 as user_id,
        $2 as username,
        ud.current_badge,
        mue.model_name,
        mue.created_at as timestamp,
        jsonb_build_object('model', mue.model_name) as metadata
      FROM model_usage_events mue
      LEFT JOIN user_devices ud ON ud.user_id = mue.user_id
      WHERE mue.user_id = $1
      ORDER BY mue.created_at DESC
      LIMIT $3
    `, [userId, userResult.rows[0].username, limit]);

    // Purchases
    const purchases = await db.query(`
      SELECT
        'purchase' as event_type,
        $1 as user_id,
        $2 as username,
        ud.current_badge,
        fao.feature_name,
        fao.price_paid_cents as price,
        fao.created_at as timestamp,
        jsonb_build_object('feature', fao.feature_name, 'price', fao.price_paid_cents) as metadata
      FROM feature_access_overrides fao
      LEFT JOIN user_devices ud ON ud.user_id = fao.user_id
      WHERE fao.user_id = $1 AND fao.access_type = 'pay_per_feature'
      ORDER BY fao.created_at DESC
      LIMIT $3
    `, [userId, userResult.rows[0].username, limit]);

    // Combine and sort
    const allEvents = [
      ...featureEvents.rows,
      ...aiEvents.rows,
      ...purchases.rows
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
     .slice(0, limit);

    const formattedEvents = allEvents.map(formatActivityEvent);

    res.json({
      status: 'success',
      data: {
        user: {
          userId,
          username: userResult.rows[0].username
        },
        events: formattedEvents,
        count: formattedEvents.length
      }
    });

  } catch (error) {
    console.error('[Activity] User timeline error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve user activity',
      details: error.message
    });
  }
});

/**
 * GET /api/activity/feature/:featureName
 * Feature-specific activity
 */
router.get('/feature/:featureName', async (req, res) => {
  try {
    const { featureName } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    // Verify feature exists
    const featureCheck = await db.query(
      `SELECT display_name FROM feature_definitions WHERE feature_name = $1`,
      [featureName]
    );

    if (featureCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Feature not found'
      });
    }

    // Usage events
    const usageEvents = await db.query(`
      SELECT
        'feature_usage' as event_type,
        fua.user_id,
        u.username,
        ud.current_badge,
        $1 as feature_name,
        fua.used_at as timestamp,
        jsonb_build_object('creditsDeducted', fua.credits_deducted) as metadata
      FROM feature_usage_analytics fua
      JOIN users u ON u.user_id = fua.user_id
      LEFT JOIN user_devices ud ON ud.user_id = u.user_id
      WHERE fua.feature_name = $1 AND fua.blocked = FALSE
      ORDER BY fua.used_at DESC
      LIMIT $2
    `, [featureName, limit]);

    // Purchase events
    const purchaseEvents = await db.query(`
      SELECT
        'purchase' as event_type,
        fao.user_id,
        u.username,
        ud.current_badge,
        $1 as feature_name,
        fao.price_paid_cents as price,
        fao.created_at as timestamp,
        jsonb_build_object('price', fao.price_paid_cents) as metadata
      FROM feature_access_overrides fao
      JOIN users u ON u.user_id = fao.user_id
      LEFT JOIN user_devices ud ON ud.user_id = u.user_id
      WHERE fao.feature_name = $1 AND fao.access_type = 'pay_per_feature'
      ORDER BY fao.created_at DESC
      LIMIT $2
    `, [featureName, limit]);

    const allEvents = [
      ...usageEvents.rows,
      ...purchaseEvents.rows
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
     .slice(0, limit);

    const formattedEvents = allEvents.map(formatActivityEvent);

    res.json({
      status: 'success',
      data: {
        feature: {
          name: featureName,
          displayName: featureCheck.rows[0].display_name
        },
        events: formattedEvents,
        count: formattedEvents.length
      }
    });

  } catch (error) {
    console.error('[Activity] Feature activity error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve feature activity',
      details: error.message
    });
  }
});

/**
 * GET /api/activity/stats
 * Real-time platform statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const window = req.query.window || '5min'; // 5min, 1hour, 24hour

    const minutes = {
      '5min': 5,
      '15min': 15,
      '1hour': 60,
      '24hour': 1440
    }[window] || 5;

    const since = new Date(Date.now() - (minutes * 60 * 1000)).toISOString();

    // Active users (in time window)
    const activeUsers = await db.query(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM feature_usage_analytics
      WHERE used_at >= $1
    `, [since]);

    // Feature requests
    const featureRequests = await db.query(`
      SELECT COUNT(*) as count
      FROM feature_usage_analytics
      WHERE used_at >= $1 AND blocked = FALSE
    `, [since]);

    // AI requests
    const aiRequests = await db.query(`
      SELECT COUNT(*) as count
      FROM model_usage_events
      WHERE created_at >= $1
    `, [since]);

    // Purchases
    const purchases = await db.query(`
      SELECT
        COUNT(*) as count,
        SUM(price_paid_cents) as revenue
      FROM feature_access_overrides
      WHERE created_at >= $1 AND access_type = 'pay_per_feature'
    `, [since]);

    // Events per minute
    const eventsPerMinute = Math.round(
      (parseInt(featureRequests.rows[0].count) + parseInt(aiRequests.rows[0].count)) / minutes
    );

    res.json({
      status: 'success',
      data: {
        timeWindow: window,
        stats: {
          activeUsers: parseInt(activeUsers.rows[0].count || 0),
          featureRequests: parseInt(featureRequests.rows[0].count || 0),
          aiRequests: parseInt(aiRequests.rows[0].count || 0),
          purchases: parseInt(purchases.rows[0].count || 0),
          revenue: parseFloat((purchases.rows[0].revenue || 0) / 100).toFixed(2),
          eventsPerMinute
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[Activity] Stats error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve activity stats',
      details: error.message
    });
  }
});

/**
 * GET /api/activity/stream
 * Server-Sent Events (SSE) endpoint for live streaming
 *
 * Usage:
 * const eventSource = new EventSource('/api/activity/stream');
 * eventSource.onmessage = (event) => {
 *   const data = JSON.parse(event.data);
 *   console.log('New event:', data);
 * };
 */
router.get('/stream', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  let lastCheck = new Date().toISOString();
  let intervalId;

  // Poll for new events every 5 seconds
  intervalId = setInterval(async () => {
    try {
      // Get new events since last check
      const events = await db.query(`
        SELECT
          'feature_usage' as event_type,
          fua.user_id,
          u.username,
          ud.current_badge,
          fua.feature_name,
          fua.used_at as timestamp,
          jsonb_build_object('feature', fua.feature_name) as metadata
        FROM feature_usage_analytics fua
        JOIN users u ON u.user_id = fua.user_id
        LEFT JOIN user_devices ud ON ud.user_id = u.user_id
        WHERE fua.used_at > $1 AND fua.blocked = FALSE
        ORDER BY fua.used_at DESC
        LIMIT 10
      `, [lastCheck]);

      if (events.rows.length > 0) {
        const formattedEvents = events.rows.map(formatActivityEvent);

        formattedEvents.forEach(event => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        });

        lastCheck = events.rows[0].timestamp;
      }

    } catch (error) {
      console.error('[Activity] Stream error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    }
  }, 5000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(intervalId);
    console.log('[Activity] Stream closed');
  });
});

module.exports = { initRoutes };

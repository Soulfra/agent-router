/**
 * Idea Growth Tracking Routes
 *
 * "we can build our index while piggybacking... dogfeed based off what our own users want to do"
 *
 * NOT a traditional marketplace with votes/engagement.
 * Tracks ACTUAL USAGE: forked, implemented, iterated.
 *
 * React-style state management for ideas:
 * - Real-time momentum tracking
 * - Inflection point detection
 * - Potential scoring
 * - Observable patterns
 *
 * Endpoints:
 * - POST /api/growth/track - Track activity (usage, not votes)
 * - GET /api/growth/:ideaId - Get growth state
 * - GET /api/growth/:ideaId/timeline - Growth history
 * - GET /api/growth/high-potential - High-potential ideas (score > 50)
 * - GET /api/growth/trending - Trending ideas (accelerating growth)
 * - GET /api/growth/inflection - Ideas at inflection points
 * - GET /api/growth/dogfooding - CALOS usage dashboard
 * - POST /api/growth/subscribe - Subscribe to state changes
 * - POST /api/growth/migrate - Migrate high-potential idea
 */

const express = require('express');
const router = express.Router();
const IdeaGrowthTracker = require('../lib/idea-growth-tracker');
const IdeaStateManager = require('../lib/idea-state-manager');
const GooglePiggyback = require('../lib/google-piggyback');

// Will be injected via initRoutes
let db = null;
let growthTracker = null;
let stateManager = null;
let googlePiggyback = null;

/**
 * Initialize routes with dependencies
 */
function initRoutes(database) {
  db = database;

  // Initialize growth tracking system
  growthTracker = new IdeaGrowthTracker({ pool: db });
  stateManager = new IdeaStateManager({ pool: db, growthTracker });
  googlePiggyback = new GooglePiggyback({ pool: db });

  // Setup default effects (triggers on inflection points)
  stateManager.setupDefaultEffects();

  // Listen to state manager events
  stateManager.on('ideaTakeoff', (data) => {
    console.log(`🚀 [Growth] Idea ${data.ideaId} is taking off!`);
  });

  stateManager.on('highPotential', (data) => {
    console.log(`📈 [Growth] Idea ${data.ideaId} reached high potential: ${data.potential}`);
  });

  stateManager.on('ideaPeak', (data) => {
    console.log(`📊 [Growth] Idea ${data.ideaId} reached peak`);
  });

  stateManager.on('ideaDecline', (data) => {
    console.log(`📉 [Growth] Idea ${data.ideaId} losing momentum`);
  });

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

async function optionalAuth(req, res, next) {
  const userId = req.user?.userId || req.session?.userId;
  req.userId = userId || null;
  next();
}

// ============================================================================
// ROUTES: Activity Tracking
// ============================================================================

/**
 * POST /api/growth/track
 * Track activity (what user ACTUALLY DID with idea)
 *
 * Body:
 * {
 *   "ideaId": "idea_123",
 *   "activityType": "implemented",
 *   "metadata": {
 *     "repositoryUrl": "https://github.com/...",
 *     "description": "Built this feature in my app"
 *   }
 * }
 *
 * Activity types:
 * - viewed: Looked at idea
 * - forked: Copied to use
 * - implemented: Actually built it (HIGHEST VALUE)
 * - referenced: Mentioned in work
 * - iterated: Built on top of it
 */
router.post('/track', requireAuth, async (req, res) => {
  try {
    const { ideaId, activityType, metadata = {} } = req.body;

    if (!ideaId || !activityType) {
      return res.status(400).json({
        status: 'error',
        error: 'ideaId and activityType are required'
      });
    }

    // Add userId to metadata
    metadata.userId = req.userId;

    // Update state (triggers growth calculation and effects)
    const newState = await stateManager.updateState(ideaId, activityType, metadata);

    res.json({
      status: 'success',
      data: {
        ideaId,
        activityType,
        growth: newState.growth,
        inflection: newState.inflection,
        message: newState.inflection.isInflection
          ? `${newState.inflection.emoji} ${newState.inflection.message}`
          : null
      }
    });
  } catch (error) {
    console.error('[Growth] Error tracking activity:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES: Growth State
// ============================================================================

/**
 * GET /api/growth/:ideaId
 * Get current growth state
 */
router.get('/:ideaId', optionalAuth, async (req, res) => {
  try {
    const { ideaId } = req.params;

    const state = await stateManager.getState(ideaId);

    if (!state || !state.initialized) {
      return res.status(404).json({
        status: 'error',
        error: 'Idea not found or no growth data available'
      });
    }

    res.json({
      status: 'success',
      data: {
        ideaId,
        growth: state.growth,
        inflection: state.inflection,
        updatedAt: state.updatedAt
      }
    });
  } catch (error) {
    console.error('[Growth] Error getting state:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/growth/:ideaId/timeline
 * Get growth history (time series)
 */
router.get('/:ideaId/timeline', optionalAuth, async (req, res) => {
  try {
    const { ideaId } = req.params;
    const { limit = 100 } = req.query;

    const result = await db.query(`
      SELECT
        growth_state,
        inflection,
        updated_at
      FROM idea_growth_state
      WHERE idea_id = $1
      ORDER BY updated_at DESC
      LIMIT $2
    `, [ideaId, limit]);

    res.json({
      status: 'success',
      data: {
        ideaId,
        timeline: result.rows.map(row => ({
          growth: row.growth_state,
          inflection: row.inflection,
          timestamp: row.updated_at
        }))
      }
    });
  } catch (error) {
    console.error('[Growth] Error getting timeline:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES: Discovery & Analytics
// ============================================================================

/**
 * GET /api/growth/high-potential
 * Get high-potential ideas (score > threshold)
 */
router.get('/high-potential', optionalAuth, async (req, res) => {
  try {
    const { threshold = 50, limit = 20 } = req.query;

    const result = await db.query(`
      SELECT * FROM v_high_potential_ideas
      WHERE potential_score >= $1
      LIMIT $2
    `, [threshold, limit]);

    res.json({
      status: 'success',
      data: {
        threshold: parseInt(threshold),
        count: result.rows.length,
        ideas: result.rows.map(row => ({
          ideaId: row.idea_id,
          title: row.title,
          category: row.category,
          source: row.source,
          potentialScore: row.potential_score,
          momentum: row.momentum,
          growthStage: row.growth_stage,
          growth: row.growth_state,
          inflection: row.inflection,
          updatedAt: row.updated_at
        }))
      }
    });
  } catch (error) {
    console.error('[Growth] Error getting high-potential ideas:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/growth/trending
 * Get trending ideas (accelerating growth)
 */
router.get('/trending', optionalAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const result = await db.query(`
      SELECT * FROM v_trending_ideas
      LIMIT $1
    `, [limit]);

    res.json({
      status: 'success',
      data: {
        count: result.rows.length,
        ideas: result.rows.map(row => ({
          ideaId: row.idea_id,
          title: row.title,
          category: row.category,
          potentialScore: row.potential_score,
          momentum: row.momentum,
          velocity: parseFloat(row.velocity),
          acceleration: parseFloat(row.acceleration),
          growth: row.growth_state,
          updatedAt: row.updated_at
        }))
      }
    });
  } catch (error) {
    console.error('[Growth] Error getting trending ideas:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/growth/inflection
 * Get ideas at inflection points (growth direction changed)
 */
router.get('/inflection', optionalAuth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const result = await db.query(`
      SELECT * FROM v_ideas_at_inflection
      LIMIT $1
    `, [limit]);

    res.json({
      status: 'success',
      data: {
        count: result.rows.length,
        ideas: result.rows.map(row => ({
          ideaId: row.idea_id,
          title: row.title,
          category: row.category,
          inflectionType: row.inflection_type,
          emoji: row.emoji,
          message: row.message,
          previousVelocity: row.previous_velocity,
          currentVelocity: row.current_velocity,
          velocityChange: row.velocity_change,
          timestamp: row.updated_at
        }))
      }
    });
  } catch (error) {
    console.error('[Growth] Error getting inflection points:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/growth/dogfooding
 * CALOS usage dashboard (track our own idea usage)
 */
router.get('/dogfooding', optionalAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM v_dogfooding_dashboard
      ORDER BY potential_score DESC NULLS LAST
      LIMIT 50
    `);

    res.json({
      status: 'success',
      data: {
        count: result.rows.length,
        ideas: result.rows.map(row => ({
          ideaId: row.idea_id,
          title: row.title,
          category: row.category,
          implementers: row.implementers || 0,
          forkers: row.forkers || 0,
          iterators: row.iterators || 0,
          potentialScore: row.potential_score,
          growthStage: row.growth_stage,
          createdAt: row.created_at
        }))
      }
    });
  } catch (error) {
    console.error('[Growth] Error getting dogfooding dashboard:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/growth/activity-heatmap
 * What are users ACTUALLY doing with ideas?
 */
router.get('/activity-heatmap', optionalAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM v_activity_heatmap
      ORDER BY activity_date DESC, activity_count DESC
      LIMIT 100
    `);

    res.json({
      status: 'success',
      data: {
        heatmap: result.rows.map(row => ({
          activityType: row.activity_type,
          activityCount: row.activity_count,
          uniqueIdeas: row.unique_ideas,
          uniqueUsers: row.unique_users,
          date: row.activity_date
        }))
      }
    });
  } catch (error) {
    console.error('[Growth] Error getting activity heatmap:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES: Real-time State Management (React-style)
// ============================================================================

/**
 * POST /api/growth/subscribe
 * Subscribe to state changes (like useEffect)
 *
 * Body:
 * {
 *   "ideaId": "idea_123",
 *   "webhookUrl": "https://example.com/webhook"
 * }
 *
 * Note: For WebSocket support, use the WebSocket API instead
 */
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { ideaId, webhookUrl } = req.body;

    if (!ideaId || !webhookUrl) {
      return res.status(400).json({
        status: 'error',
        error: 'ideaId and webhookUrl are required'
      });
    }

    // Subscribe to state changes
    const unsubscribe = stateManager.subscribe(ideaId, async (newState) => {
      try {
        // Send webhook
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ideaId,
            growth: newState.growth,
            inflection: newState.inflection,
            timestamp: new Date()
          })
        });
      } catch (error) {
        console.error('[Growth] Webhook error:', error);
      }
    });

    // Store subscription (for cleanup)
    // In production, persist to database
    req.session.subscriptions = req.session.subscriptions || {};
    req.session.subscriptions[ideaId] = { webhookUrl, unsubscribe };

    res.json({
      status: 'success',
      message: `Subscribed to ${ideaId}`,
      data: { ideaId, webhookUrl }
    });
  } catch (error) {
    console.error('[Growth] Error subscribing:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/growth/:ideaId/observe
 * Observable stream (RxJS-like)
 *
 * Returns SSE (Server-Sent Events) stream
 */
router.get('/:ideaId/observe', optionalAuth, async (req, res) => {
  const { ideaId } = req.params;

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial state
  const currentState = await stateManager.getState(ideaId);
  res.write(`data: ${JSON.stringify(currentState)}\n\n`);

  // Subscribe to changes
  const unsubscribe = stateManager.subscribe(ideaId, (newState) => {
    res.write(`data: ${JSON.stringify(newState)}\n\n`);
  });

  // Cleanup on disconnect
  req.on('close', () => {
    unsubscribe();
  });
});

// ============================================================================
// ROUTES: Migration & Piggybacking
// ============================================================================

/**
 * POST /api/growth/migrate
 * Migrate high-potential idea to marketplace
 *
 * Body:
 * {
 *   "ideaId": "idea_123",
 *   "threshold": 70
 * }
 */
router.post('/migrate', requireAuth, async (req, res) => {
  try {
    const { ideaId, threshold = 70 } = req.body;

    if (!ideaId) {
      return res.status(400).json({
        status: 'error',
        error: 'ideaId is required'
      });
    }

    // Check if needs migration
    const needsMigration = await db.query(`
      SELECT needs_migration($1, $2) as should_migrate
    `, [ideaId, threshold]);

    if (!needsMigration.rows[0].should_migrate) {
      return res.status(400).json({
        status: 'error',
        error: `Idea does not meet migration threshold (${threshold})`
      });
    }

    // Get idea details
    const ideaDetails = await db.query(`
      SELECT * FROM idea_index WHERE idea_id = $1
    `, [ideaId]);

    if (ideaDetails.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Idea not found'
      });
    }

    const idea = ideaDetails.rows[0];

    // Migrate to marketplace
    const migrated = await db.query(`
      INSERT INTO marketplace_ideas (
        creator_id,
        title,
        description,
        category,
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      req.userId,
      idea.title,
      'Migrated from external source', // Could enhance with description
      idea.category,
      JSON.stringify({ source: idea.source, originalId: ideaId }),
      idea.created_at
    ]);

    const marketplaceId = migrated.rows[0].id;

    // Update index
    await db.query(`
      UPDATE idea_index
      SET marketplace_idea_id = $1, migrated_at = NOW()
      WHERE idea_id = $2
    `, [marketplaceId, ideaId]);

    res.json({
      status: 'success',
      message: 'Idea migrated to marketplace',
      data: {
        ideaId,
        marketplaceId,
        threshold
      }
    });
  } catch (error) {
    console.error('[Growth] Error migrating idea:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/growth/needs-migration
 * List ideas that need migration
 */
router.get('/needs-migration', optionalAuth, async (req, res) => {
  try {
    const { threshold = 70, limit = 20 } = req.query;

    const result = await db.query(`
      SELECT * FROM v_ideas_needing_migration
      WHERE potential_score >= $1
      LIMIT $2
    `, [threshold, limit]);

    res.json({
      status: 'success',
      data: {
        threshold: parseInt(threshold),
        count: result.rows.length,
        ideas: result.rows.map(row => ({
          ideaId: row.idea_id,
          title: row.title,
          source: row.source,
          sourceId: row.source_id,
          potentialScore: row.potential_score,
          createdAt: row.created_at
        }))
      }
    });
  } catch (error) {
    console.error('[Growth] Error getting migration candidates:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES: Batch Operations
// ============================================================================

/**
 * POST /api/growth/batch-track
 * Track multiple activities at once
 *
 * Body:
 * {
 *   "activities": [
 *     { "ideaId": "idea_1", "activityType": "viewed", "metadata": {} },
 *     { "ideaId": "idea_2", "activityType": "forked", "metadata": {} }
 *   ]
 * }
 */
router.post('/batch-track', requireAuth, async (req, res) => {
  try {
    const { activities } = req.body;

    if (!Array.isArray(activities) || activities.length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'activities array is required'
      });
    }

    // Add userId to all metadata
    const enrichedActivities = activities.map(activity => ({
      ...activity,
      metadata: {
        ...activity.metadata,
        userId: req.userId
      }
    }));

    // Batch update
    const results = await stateManager.batchUpdate(enrichedActivities);

    res.json({
      status: 'success',
      data: {
        count: results.length,
        results: results.map(state => ({
          ideaId: state.ideaId,
          potentialScore: state.growth.potential,
          inflection: state.inflection.isInflection
            ? `${state.inflection.emoji} ${state.inflection.type}`
            : null
        }))
      }
    });
  } catch (error) {
    console.error('[Growth] Error batch tracking:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES: Admin & Debug
// ============================================================================

/**
 * GET /api/growth/stats
 * System-wide growth statistics
 */
router.get('/stats', optionalAuth, async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM idea_index) as total_ideas,
        (SELECT COUNT(*) FROM idea_activities) as total_activities,
        (SELECT COUNT(DISTINCT idea_id) FROM idea_growth_state) as ideas_with_growth,
        (SELECT COUNT(*) FROM v_high_potential_ideas WHERE potential_score >= 70) as high_potential_count,
        (SELECT COUNT(*) FROM v_trending_ideas) as trending_count,
        (SELECT COUNT(*) FROM v_ideas_at_inflection WHERE inflection_type = 'TAKEOFF') as takeoff_count
    `);

    const activityBreakdown = await db.query(`
      SELECT activity_type, COUNT(*) as count
      FROM idea_activities
      WHERE timestamp > NOW() - INTERVAL '7 days'
      GROUP BY activity_type
      ORDER BY count DESC
    `);

    res.json({
      status: 'success',
      data: {
        overall: stats.rows[0],
        activityBreakdown: activityBreakdown.rows,
        stateManager: {
          cachedStates: stateManager.states.size,
          subscribers: stateManager.subscribers.size,
          effects: stateManager.effects.size
        }
      }
    });
  } catch (error) {
    console.error('[Growth] Error getting stats:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  initRoutes,
  router
};

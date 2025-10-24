/**
 * Community Data Acquisition Routes
 *
 * "Like Ryan Cohen buying GameStop: 55M PowerUp members + Game Informer data"
 *
 * API for:
 * - Unified community profiles (like PowerUp Rewards single view)
 * - Power user detection (like r/WallStreetBets superfans)
 * - Cohort analysis (segment users like GameStop does)
 * - Community momentum (detect inflection points)
 * - External community consolidation (acquire like Game Informer)
 *
 * Endpoints:
 * - GET /api/community/member/:userId - Full community profile
 * - GET /api/community/power-users - Top contributors
 * - GET /api/community/cohorts - Community segments
 * - GET /api/community/cohorts/:cohortName/momentum - Cohort growth
 * - GET /api/community/stats - Community statistics
 * - POST /api/community/consolidate - Import external community
 * - GET /api/community/leaderboard - Public leaderboard
 * - POST /api/community/activity - Record cross-system activity
 */

const express = require('express');
const router = express.Router();
const CommunityDataAcquisition = require('../lib/community-data-acquisition');

// Will be injected via initRoutes
let db = null;
let communityAcq = null;

/**
 * Initialize routes with dependencies
 */
function initRoutes(database) {
  db = database;
  communityAcq = new CommunityDataAcquisition({ pool: db });
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
// ROUTES: Community Profiles
// ============================================================================

/**
 * GET /api/community/member/:userId
 * Get unified community profile
 *
 * Like PowerUp Rewards: single view across all touchpoints
 * Shows: learning, reputation, growth, forum, social
 */
router.get('/member/:userId', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await communityAcq.getCommunityProfile(userId);

    res.json({
      status: 'success',
      data: profile
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error getting profile:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/community/me
 * Get current user's profile
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const profile = await communityAcq.getCommunityProfile(req.userId);

    res.json({
      status: 'success',
      data: profile
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error getting profile:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES: Power Users
// ============================================================================

/**
 * GET /api/community/power-users
 * Get power users (like r/WallStreetBets superfans)
 *
 * High engagement across multiple systems
 */
router.get('/power-users', optionalAuth, async (req, res) => {
  try {
    const { limit = 50, minPowerScore = 200 } = req.query;

    const powerUsers = await communityAcq.getPowerUsers({
      limit: parseInt(limit),
      minPowerScore: parseInt(minPowerScore)
    });

    res.json({
      status: 'success',
      data: {
        count: powerUsers.length,
        minPowerScore: parseInt(minPowerScore),
        users: powerUsers
      }
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error getting power users:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/community/leaderboard
 * Public leaderboard (for dogfooding transparency)
 */
router.get('/leaderboard', optionalAuth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const result = await db.query(`
      SELECT * FROM v_power_user_leaderboard
      LIMIT $1
    `, [limit]);

    res.json({
      status: 'success',
      data: {
        count: result.rows.length,
        leaderboard: result.rows.map((row, index) => ({
          rank: index + 1,
          userId: row.user_id,
          powerScore: row.power_score,
          tier: row.community_tier,
          cohort: row.primary_cohort,
          karma: row.karma,
          followers: row.followers,
          totalActivities: row.total_activities,
          activeSystems: row.active_systems,
          lastActivity: row.last_activity
        }))
      }
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error getting leaderboard:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES: Cohorts
// ============================================================================

/**
 * GET /api/community/cohorts
 * Get all community cohorts
 *
 * Like GameStop segmenting PowerUp members
 */
router.get('/cohorts', optionalAuth, async (req, res) => {
  try {
    const cohorts = await communityAcq.detectCohorts();

    res.json({
      status: 'success',
      data: cohorts
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error getting cohorts:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/community/cohorts/:cohortName
 * Get specific cohort details
 */
router.get('/cohorts/:cohortName', optionalAuth, async (req, res) => {
  try {
    const { cohortName } = req.params;

    const cohorts = await communityAcq.detectCohorts();
    const cohort = cohorts.cohorts[cohortName];

    if (!cohort) {
      return res.status(404).json({
        status: 'error',
        error: `Cohort not found: ${cohortName}`
      });
    }

    res.json({
      status: 'success',
      data: {
        name: cohortName,
        members: cohort,
        count: cohort.length
      }
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error getting cohort:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/community/cohorts/:cohortName/momentum
 * Track cohort momentum (like idea growth tracker, but for user segments)
 *
 * Detect when a cohort is "taking off"
 */
router.get('/cohorts/:cohortName/momentum', optionalAuth, async (req, res) => {
  try {
    const { cohortName } = req.params;

    const momentum = await communityAcq.trackCohortMomentum(cohortName);

    res.json({
      status: 'success',
      data: momentum
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error tracking momentum:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES: Statistics
// ============================================================================

/**
 * GET /api/community/stats
 * Community-wide statistics
 *
 * Like PowerUp Rewards dashboard
 */
router.get('/stats', optionalAuth, async (req, res) => {
  try {
    const stats = await communityAcq.getCommunityStats();

    res.json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error getting stats:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/community/growth
 * Community growth over time
 */
router.get('/growth', optionalAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM v_community_growth_timeline
      ORDER BY day DESC
      LIMIT 90
    `);

    res.json({
      status: 'success',
      data: {
        timeline: result.rows.map(row => ({
          date: row.day,
          members: parseInt(row.avg_members),
          activeMembers: parseInt(row.avg_active),
          activities: parseInt(row.avg_activities),
          momentum: parseFloat(row.avg_momentum)
        }))
      }
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error getting growth:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES: Activity Tracking
// ============================================================================

/**
 * POST /api/community/activity
 * Record cross-system activity
 *
 * Body:
 * {
 *   "systemName": "learning",
 *   "activityType": "lesson_completed",
 *   "referenceId": "lesson_123",
 *   "impactValue": 10,
 *   "metadata": {}
 * }
 */
router.post('/activity', requireAuth, async (req, res) => {
  try {
    const {
      systemName,
      activityType,
      referenceId = null,
      impactValue = 1,
      metadata = {}
    } = req.body;

    if (!systemName || !activityType) {
      return res.status(400).json({
        status: 'error',
        error: 'systemName and activityType are required'
      });
    }

    // Record activity (auto-updates power score)
    await db.query(`
      SELECT record_cross_system_activity($1, $2, $3, $4, $5, $6)
    `, [
      req.userId,
      systemName,
      activityType,
      referenceId,
      impactValue,
      JSON.stringify(metadata)
    ]);

    // Get updated profile
    const profile = await communityAcq.getCommunityProfile(req.userId);

    res.json({
      status: 'success',
      message: 'Activity recorded',
      data: {
        powerScore: profile.powerScore,
        tier: profile.communityTier
      }
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error recording activity:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES: External Community Consolidation
// ============================================================================

/**
 * POST /api/community/consolidate
 * Import external community (like acquiring Game Informer data)
 *
 * Body:
 * {
 *   "source": "discord_server_123",
 *   "users": [
 *     {
 *       "userId": "user123",
 *       "username": "john_doe",
 *       "email": "john@example.com",
 *       "metadata": {
 *         "joinDate": "2020-01-01",
 *         "messageCount": 500
 *       }
 *     }
 *   ]
 * }
 */
router.post('/consolidate', requireAuth, async (req, res) => {
  try {
    const { source, users } = req.body;

    if (!source || !Array.isArray(users)) {
      return res.status(400).json({
        status: 'error',
        error: 'source and users array are required'
      });
    }

    // Check authorization (only admins can consolidate)
    // In production, add proper admin check
    // const isAdmin = await checkAdminStatus(req.userId);
    // if (!isAdmin) return res.status(403).json({ ... });

    const results = await communityAcq.consolidateExternalCommunity(source, users);

    res.json({
      status: 'success',
      message: `Consolidated ${results.total} users from ${source}`,
      data: results
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error consolidating:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/community/sources
 * List all external community sources
 */
router.get('/sources', optionalAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        source_name,
        source_type,
        source_url,
        description,
        members_imported,
        activities_imported,
        last_import_at,
        created_at
      FROM external_community_sources
      ORDER BY created_at DESC
    `);

    res.json({
      status: 'success',
      data: {
        count: result.rows.length,
        sources: result.rows
      }
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error getting sources:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES: Cross-System Engagement
// ============================================================================

/**
 * GET /api/community/engagement/:userId
 * Get user's cross-system engagement
 */
router.get('/engagement/:userId', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await db.query(`
      SELECT * FROM v_cross_system_engagement
      WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.json({
        status: 'success',
        data: {
          userId,
          systemsUsed: 0,
          totalActivities: 0,
          totalImpact: 0,
          systemBreakdown: {}
        }
      });
    }

    const row = result.rows[0];

    res.json({
      status: 'success',
      data: {
        userId,
        systemsUsed: row.systems_used,
        totalActivities: row.total_activities,
        totalImpact: row.total_impact,
        lastActivity: row.last_activity,
        systemBreakdown: row.system_breakdown
      }
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error getting engagement:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/community/builders
 * Get top builders (users who IMPLEMENT ideas)
 *
 * Highest value users - they actually build things
 */
router.get('/builders', optionalAuth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const result = await db.query(`
      SELECT * FROM v_builder_activity
      WHERE total_impact > 0
      ORDER BY total_impact DESC
      LIMIT $1
    `, [limit]);

    res.json({
      status: 'success',
      data: {
        count: result.rows.length,
        builders: result.rows.map(row => ({
          userId: row.user_id,
          powerScore: row.power_score,
          tier: row.community_tier,
          implementations: row.implementations,
          forks: row.forks,
          iterations: row.iterations,
          totalImpact: row.total_impact
        }))
      }
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error getting builders:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES: Dogfooding Dashboard
// ============================================================================

/**
 * GET /api/community/dogfooding
 * Public dogfooding dashboard
 *
 * Like r/WallStreetBets transparency: show what CALOS team actually builds
 */
router.get('/dogfooding', optionalAuth, async (req, res) => {
  try {
    // Get CALOS team members (filter by domain or role)
    // For now, show top builders as proxy
    const result = await db.query(`
      SELECT
        cm.user_id,
        cm.power_score,
        cm.community_tier,
        cm.growth_score,
        ia.implementations,
        ia.forks,
        ia.iterations,
        ia.total_impact,
        ur.karma,
        (SELECT title FROM marketplace_ideas WHERE creator_id = cm.user_id ORDER BY created_at DESC LIMIT 1) as latest_idea
      FROM community_members cm
      LEFT JOIN v_builder_activity ia ON cm.user_id = ia.user_id
      LEFT JOIN user_reputation ur ON cm.user_id = ur.user_id
      WHERE cm.growth_score > 0
      ORDER BY cm.growth_score DESC
      LIMIT 20
    `);

    res.json({
      status: 'success',
      data: {
        message: 'What the CALOS team actually builds (dogfooding)',
        count: result.rows.length,
        builders: result.rows.map(row => ({
          userId: row.user_id,
          powerScore: row.power_score,
          tier: row.community_tier,
          growthScore: row.growth_score,
          implementations: row.implementations || 0,
          forks: row.forks || 0,
          iterations: row.iterations || 0,
          totalImpact: row.total_impact || 0,
          karma: row.karma,
          latestIdea: row.latest_idea
        }))
      }
    });
  } catch (error) {
    console.error('[CommunityAcquisition] Error getting dogfooding:', error);
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

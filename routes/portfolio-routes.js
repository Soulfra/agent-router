// Portfolio Routes - API Endpoints for Portfolio Hub System
//
// Public routes: GET /portfolio/:slug (public portfolios)
// Protected routes: /api/portfolio/* (requires authentication)

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const PortfolioHub = require('../lib/portfolio-hub');
const GitPortfolioSync = require('../lib/git-portfolio-sync');
const AuthorshipTracker = require('../lib/authorship-tracker');
const OSSTrendingAnalyzer = require('../lib/oss-trending-analyzer');
const MiningRewards = require('../lib/mining-rewards');

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Initialize services
const portfolioHub = new PortfolioHub(pool);
const gitSync = new GitPortfolioSync(pool);
const authorshipTracker = new AuthorshipTracker(pool);
const ossAnalyzer = new OSSTrendingAnalyzer(pool);
const miningRewards = new MiningRewards(pool);

// ============================================================================
// Public Routes
// ============================================================================

/**
 * GET /portfolio/:slug - Public portfolio view
 */
router.get('/portfolio/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // Get user ID from slug
    const userQuery = `
      SELECT user_id FROM portfolio_settings
      WHERE public_url_slug = $1 AND is_public = true
    `;

    const userResult = await pool.query(userQuery, [slug]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Portfolio not found or not public' });
    }

    const userId = userResult.rows[0].user_id;

    // Get portfolio data
    const overview = await portfolioHub.getOverview(userId);
    const gitSummary = await portfolioHub.getGitSummary(userId);
    const ipSummary = await portfolioHub.getIPSummary(userId);
    const timeline = await portfolioHub.getTimeline(userId, 50);
    const settings = await portfolioHub.getSettings(userId);

    // Get public IP registry
    const ipRegistry = await authorshipTracker.getPublicIPRegistry(userId);

    res.json({
      slug,
      overview,
      gitSummary,
      ipSummary,
      timeline,
      ipRegistry,
      settings: {
        theme: settings.theme,
        socialLinks: settings.social_links,
        showAiStats: settings.show_ai_stats,
        showGitStats: settings.show_git_stats,
        showEmbedStats: settings.show_embed_stats
      }
    });
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching public portfolio:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Protected Routes (Require Authentication)
// ============================================================================

// Simple auth middleware (replace with your actual auth system)
const requireAuth = (req, res, next) => {
  // Check session or JWT
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

/**
 * GET /api/portfolio/overview - Lifetime stats
 */
router.get('/api/portfolio/overview', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const overview = await portfolioHub.getOverview(userId);

    res.json(overview);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching overview:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/timeline - Unified activity feed
 */
router.get('/api/portfolio/timeline', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const limit = parseInt(req.query.limit) || 50;

    const timeline = await portfolioHub.getTimeline(userId, limit);

    res.json(timeline);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching timeline:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/git-summary - Git stats across platforms
 */
router.get('/api/portfolio/git-summary', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const summary = await portfolioHub.getGitSummary(userId);

    res.json(summary);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching git summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/ip-summary - Patents/trademarks summary
 */
router.get('/api/portfolio/ip-summary', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const summary = await portfolioHub.getIPSummary(userId);

    res.json(summary);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching IP summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/analytics/:date - Daily analytics
 */
router.get('/api/portfolio/analytics/:date?', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const date = req.params.date ? new Date(req.params.date) : null;

    const analytics = await portfolioHub.computeDailyAnalytics(userId, date);

    res.json(analytics);
  } catch (error) {
    console.error('[PortfolioRoutes] Error computing analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/portfolio/sync-git - Trigger git sync
 */
router.post('/api/portfolio/sync-git', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { platforms, tokens } = req.body;

    // Example: { github: 'username', gitlab: 'username', bitbucket: 'username' }
    // tokens: { github: 'token', gitlab: 'token', bitbucket: 'token' }

    const results = await gitSync.syncAll(userId, platforms, tokens);

    res.json({ success: true, results });
  } catch (error) {
    console.error('[PortfolioRoutes] Error syncing git:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/git-stats - Get current git stats
 */
router.get('/api/portfolio/git-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const stats = await gitSync.getStats(userId);

    res.json(stats);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching git stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/settings - Get portfolio settings
 */
router.get('/api/portfolio/settings', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const settings = await portfolioHub.getSettings(userId);

    res.json(settings);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/portfolio/settings - Update portfolio settings
 */
router.post('/api/portfolio/settings', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const settings = req.body;

    const updated = await portfolioHub.updateSettings(userId, settings);

    res.json(updated);
  } catch (error) {
    console.error('[PortfolioRoutes] Error updating settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Authorship/IP Registry Routes
// ============================================================================

/**
 * GET /api/portfolio/ip-registry - Get IP registry
 */
router.get('/api/portfolio/ip-registry', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const filters = {};

    if (req.query.ipType) filters.ipType = req.query.ipType;
    if (req.query.status) filters.status = req.query.status;
    if (req.query.isPublic) filters.isPublic = req.query.isPublic === 'true';

    const registry = await authorshipTracker.getIPRegistry(userId, filters);

    res.json(registry);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching IP registry:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/portfolio/register-ip - Register new IP with Soulfra proof
 */
router.post('/api/portfolio/register-ip', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const ip = req.body;

    const registered = await portfolioHub.registerIP(userId, ip);

    res.json(registered);
  } catch (error) {
    console.error('[PortfolioRoutes] Error registering IP:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/portfolio/ip/:id - Update IP status
 */
router.patch('/api/portfolio/ip/:id', requireAuth, async (req, res) => {
  try {
    const ipId = parseInt(req.params.id);
    const updates = req.body;

    const updated = await authorshipTracker.updateIP(ipId, updates);

    res.json(updated);
  } catch (error) {
    console.error('[PortfolioRoutes] Error updating IP:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/ip/:id/certificate - Generate proof certificate
 */
router.get('/api/portfolio/ip/:id/certificate', requireAuth, async (req, res) => {
  try {
    const ipId = parseInt(req.params.id);
    const certificate = await authorshipTracker.generateProofCertificate(ipId);

    res.json(certificate);
  } catch (error) {
    console.error('[PortfolioRoutes] Error generating certificate:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/ip/export - Export IP registry
 */
router.get('/api/portfolio/ip/export', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const includePrivate = req.query.includePrivate === 'true';

    const exported = await authorshipTracker.exportRegistry(userId, includePrivate);

    res.json(exported);
  } catch (error) {
    console.error('[PortfolioRoutes] Error exporting IP registry:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// OSS Trending Analysis Routes
// ============================================================================

/**
 * POST /api/portfolio/analyze-trending - Analyze trending OSS repos
 */
router.post('/api/portfolio/analyze-trending', requireAuth, async (req, res) => {
  try {
    const { language = '', limit = 20 } = req.body;

    const analysis = await ossAnalyzer.analyzeTrending(language, limit);

    res.json(analysis);
  } catch (error) {
    console.error('[PortfolioRoutes] Error analyzing trending:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/trending-analyses - Get recent OSS analyses
 */
router.get('/api/portfolio/trending-analyses', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const analyses = await ossAnalyzer.getRecentAnalyses(limit);

    res.json(analyses);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching analyses:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Mining/Rewards Routes
// ============================================================================

/**
 * GET /api/portfolio/mining/stats - Get mining statistics
 */
router.get('/api/portfolio/mining/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const stats = await miningRewards.getMiningStats(userId);

    res.json(stats);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching mining stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/rewards - Get user's rewards
 */
router.get('/api/portfolio/rewards', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const rewards = await miningRewards.getUserRewards(userId);

    res.json(rewards);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching rewards:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/portfolio/rewards/:id/redeem - Redeem reward
 */
router.post('/api/portfolio/rewards/:id/redeem', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const rewardId = parseInt(req.params.id);

    const redeemed = await miningRewards.redeemReward(userId, rewardId);

    res.json(redeemed);
  } catch (error) {
    console.error('[PortfolioRoutes] Error redeeming reward:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/leaderboard - Get karma leaderboard
 */
router.get('/api/portfolio/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const leaderboard = await miningRewards.getLeaderboard(limit);

    res.json(leaderboard);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching leaderboard:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/rank - Get user's rank
 */
router.get('/api/portfolio/rank', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const rank = await miningRewards.getUserRank(userId);

    res.json({ rank });
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching rank:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/portfolio/daily-login - Record daily login
 */
router.post('/api/portfolio/daily-login', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const result = await miningRewards.recordDailyLogin(userId);

    res.json(result);
  } catch (error) {
    console.error('[PortfolioRoutes] Error recording daily login:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/referral-code - Get/generate referral code
 */
router.get('/api/portfolio/referral-code', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const referralCode = await miningRewards.generateReferralCode(userId);

    res.json(referralCode);
  } catch (error) {
    console.error('[PortfolioRoutes] Error generating referral code:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/portfolio/referrals - Get user's referrals
 */
router.get('/api/portfolio/referrals', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const referrals = await miningRewards.getUserReferrals(userId);

    res.json(referrals);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching referrals:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Bucket Stats Routes
// ============================================================================

/**
 * GET /api/portfolio/bucket-stats - Get all bucket stats
 */
router.get('/api/portfolio/bucket-stats', requireAuth, async (req, res) => {
  try {
    const stats = await portfolioHub.getAllBucketStats();

    res.json(stats);
  } catch (error) {
    console.error('[PortfolioRoutes] Error fetching bucket stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/portfolio/bucket-stats/:bucketId - Update bucket stats
 */
router.post('/api/portfolio/bucket-stats/:bucketId', requireAuth, async (req, res) => {
  try {
    const { bucketId } = req.params;
    const stats = req.body;

    const updated = await portfolioHub.updateBucketStats(bucketId, stats);

    res.json(updated);
  } catch (error) {
    console.error('[PortfolioRoutes] Error updating bucket stats:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

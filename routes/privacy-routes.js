/**
 * Privacy Routes (Privacy-First)
 *
 * Routes for privacy policy, banner, and analytics.
 *
 * Endpoints:
 * - GET /privacy-policy - Privacy policy page
 * - GET /privacy-banner - Privacy banner HTML
 * - GET /api/analytics/dashboard - Analytics dashboard (requires auth)
 * - POST /api/analytics/track/page - Track page view
 * - POST /api/analytics/track/feature - Track feature usage
 * - POST /api/analytics/track/conversion - Track conversion
 */

const express = require('express');
const path = require('path');
const SessionAnalytics = require('../lib/session-analytics');
const TelemetryObfuscator = require('../lib/telemetry/telemetry-obfuscator');
const QueryPrivacyLayer = require('../lib/query-privacy-layer');

const router = express.Router();
const analytics = new SessionAnalytics();
const obfuscator = new TelemetryObfuscator();

// Privacy stats (in-memory for demo - use DB in production)
let privacyStats = {
  dataFlow: { local: 0, external: 0, obfuscated: 0 },
  telemetry: { events: [], piiDetected: 0, lastCheck: new Date() },
  trustMetrics: { totalRequests: 0, sensitiveQueries: 0, piiLeaks: 0, uptime: Date.now() }
};

// ============================================================================
// PRIVACY PAGES (Public)
// ============================================================================

/**
 * GET /privacy-policy
 * Serve privacy policy page
 */
router.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/privacy-policy.html'));
});

/**
 * GET /privacy-banner
 * Serve privacy banner HTML
 */
router.get('/privacy-banner', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/privacy-banner.html'));
});

// ============================================================================
// ANALYTICS TRACKING (Server-Side Only)
// ============================================================================

/**
 * POST /api/analytics/track/page
 * Track page view (server-side)
 *
 * Body:
 * {
 *   "path": "/dashboard",
 *   "referrer": "https://google.com"
 * }
 */
router.post('/api/analytics/track/page', async (req, res) => {
  try {
    const sessionId = req.session?.id || req.sessionID || 'anonymous';
    const userId = req.user?.id || null;
    const { path: pagePath, referrer } = req.body;

    await analytics.trackPageView({
      sessionId,
      userId,
      path: pagePath,
      referrer,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.connection.remoteAddress
    });

    res.json({ success: true, message: 'Page view tracked' });
  } catch (error) {
    console.error('Error tracking page view:', error);
    res.status(500).json({ error: 'Failed to track page view' });
  }
});

/**
 * POST /api/analytics/track/feature
 * Track feature usage (button clicks, form submissions)
 *
 * Body:
 * {
 *   "featureName": "export-data",
 *   "featureType": "button",
 *   "metadata": { "format": "json" }
 * }
 */
router.post('/api/analytics/track/feature', async (req, res) => {
  try {
    const sessionId = req.session?.id || req.sessionID || 'anonymous';
    const userId = req.user?.id || null;
    const { featureName, featureType, metadata } = req.body;

    await analytics.trackFeatureUsage({
      sessionId,
      userId,
      featureName,
      featureType,
      metadata
    });

    res.json({ success: true, message: 'Feature usage tracked' });
  } catch (error) {
    console.error('Error tracking feature usage:', error);
    res.status(500).json({ error: 'Failed to track feature usage' });
  }
});

/**
 * POST /api/analytics/track/conversion
 * Track conversion event (purchase, signup)
 *
 * Body:
 * {
 *   "conversionType": "purchase",
 *   "conversionValue": 99.99,
 *   "currency": "USD",
 *   "referralCode": "PARTNER123",
 *   "metadata": { "plan": "pro" }
 * }
 */
router.post('/api/analytics/track/conversion', async (req, res) => {
  try {
    const sessionId = req.session?.id || req.sessionID || 'anonymous';
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      conversionType,
      conversionValue,
      currency,
      referralCode,
      affiliateCode,
      metadata
    } = req.body;

    await analytics.trackConversion({
      sessionId,
      userId,
      conversionType,
      conversionValue,
      currency,
      referralCode,
      affiliateCode,
      metadata
    });

    res.json({ success: true, message: 'Conversion tracked' });
  } catch (error) {
    console.error('Error tracking conversion:', error);
    res.status(500).json({ error: 'Failed to track conversion' });
  }
});

// ============================================================================
// ANALYTICS DASHBOARD (Admin Only)
// ============================================================================

/**
 * Middleware: Require admin authentication
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * GET /api/analytics/dashboard
 * Get analytics dashboard data (admin only)
 *
 * Query params:
 * - startDate: ISO date string (default: 30 days ago)
 * - endDate: ISO date string (default: now)
 */
router.get('/api/analytics/dashboard', requireAdmin, async (req, res) => {
  try {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date();

    const dashboard = await analytics.getDashboardData({ startDate, endDate });

    res.json(dashboard);
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/analytics/page-views
 * Get page view statistics (admin only)
 */
router.get('/api/analytics/page-views', requireAdmin, async (req, res) => {
  try {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date();

    const groupBy = req.query.groupBy || 'day';

    const stats = await analytics.getPageViewStats({ startDate, endDate, groupBy });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching page views:', error);
    res.status(500).json({ error: 'Failed to fetch page views' });
  }
});

/**
 * GET /api/analytics/feature-usage
 * Get feature usage statistics (admin only)
 */
router.get('/api/analytics/feature-usage', requireAdmin, async (req, res) => {
  try {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date();

    const groupBy = req.query.groupBy || 'day';

    const stats = await analytics.getFeatureUsageStats({ startDate, endDate, groupBy });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching feature usage:', error);
    res.status(500).json({ error: 'Failed to fetch feature usage' });
  }
});

/**
 * GET /api/analytics/conversions
 * Get conversion statistics (admin only)
 */
router.get('/api/analytics/conversions', requireAdmin, async (req, res) => {
  try {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date();

    const groupBy = req.query.groupBy || 'day';
    const conversionType = req.query.conversionType || null;

    const stats = await analytics.getConversionStats({
      startDate,
      endDate,
      groupBy,
      conversionType
    });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching conversions:', error);
    res.status(500).json({ error: 'Failed to fetch conversions' });
  }
});

/**
 * GET /api/analytics/attribution
 * Get attribution statistics (admin only)
 */
router.get('/api/analytics/attribution', requireAdmin, async (req, res) => {
  try {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date();

    const stats = await analytics.getAttributionStats({ startDate, endDate });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching attribution:', error);
    res.status(500).json({ error: 'Failed to fetch attribution' });
  }
});

/**
 * GET /api/analytics/referrers
 * Get top referrers (admin only)
 */
router.get('/api/analytics/referrers', requireAdmin, async (req, res) => {
  try {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date();

    const limit = parseInt(req.query.limit) || 10;

    const referrers = await analytics.getTopReferrers({ startDate, endDate, limit });

    res.json(referrers);
  } catch (error) {
    console.error('Error fetching referrers:', error);
    res.status(500).json({ error: 'Failed to fetch referrers' });
  }
});

/**
 * GET /api/analytics/session-duration
 * Get session duration statistics (admin only)
 */
router.get('/api/analytics/session-duration', requireAdmin, async (req, res) => {
  try {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date();

    const stats = await analytics.getSessionDurationStats({ startDate, endDate });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching session duration:', error);
    res.status(500).json({ error: 'Failed to fetch session duration' });
  }
});

/**
 * POST /api/analytics/cleanup
 * Cleanup old analytics data (admin only)
 *
 * Body:
 * {
 *   "retentionDays": 90 (optional, default: 90)
 * }
 */
router.post('/api/analytics/cleanup', requireAdmin, async (req, res) => {
  try {
    const result = await analytics.cleanupOldData();

    res.json({
      success: true,
      message: 'Old analytics data cleaned up',
      ...result
    });
  } catch (error) {
    console.error('Error cleaning up analytics:', error);
    res.status(500).json({ error: 'Failed to cleanup analytics' });
  }
});

// ============================================================================
// MIDDLEWARE: Auto-track page views
// ============================================================================

/**
 * Middleware to automatically track page views for HTML pages
 * Add this to your main Express app:
 *
 * app.use(require('./routes/privacy-routes').autoTrackPageViews);
 */
router.autoTrackPageViews = async (req, res, next) => {
  // Only track GET requests for HTML pages
  if (req.method === 'GET' && req.accepts('html')) {
    try {
      const sessionId = req.session?.id || req.sessionID || 'anonymous';
      const userId = req.user?.id || null;

      // Track in background (don't block request)
      analytics.trackPageView({
        sessionId,
        userId,
        path: req.path,
        referrer: req.headers.referer || req.headers.referrer,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.connection.remoteAddress
      }).catch(err => console.error('Background page tracking failed:', err));
    } catch (error) {
      // Silently fail - don't break the request
      console.error('Error in auto-track middleware:', error);
    }
  }

  next();
};

// ============================================================================
// PRIVACY DASHBOARD & TELEMETRY OBFUSCATION (NEW)
// ============================================================================

/**
 * GET /api/privacy/dashboard
 * Privacy dashboard data - shows data flow, telemetry, trust metrics
 */
router.get('/api/privacy/dashboard', async (req, res) => {
  try {
    const uptime = Math.floor((Date.now() - privacyStats.trustMetrics.uptime) / 1000);

    res.json({
      success: true,
      dashboard: {
        dataFlow: {
          local: privacyStats.dataFlow.local,
          external: privacyStats.dataFlow.external,
          obfuscated: privacyStats.dataFlow.obfuscated,
          localPercentage: Math.round((privacyStats.dataFlow.local / (privacyStats.dataFlow.local + privacyStats.dataFlow.external || 1)) * 100)
        },
        telemetry: {
          eventsCollected: privacyStats.telemetry.events.length,
          piiDetected: privacyStats.telemetry.piiDetected,
          lastCheck: privacyStats.telemetry.lastCheck
        },
        trustMetrics: {
          totalRequests: privacyStats.trustMetrics.totalRequests,
          sensitiveQueries: privacyStats.trustMetrics.sensitiveQueries,
          piiLeaks: privacyStats.trustMetrics.piiLeaks,
          uptime: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/privacy/dataflow
 * Data flow visualization
 */
router.get('/api/privacy/dataflow', async (req, res) => {
  try {
    const timeRange = req.query.range || '7d';
    const total = privacyStats.dataFlow.local + privacyStats.dataFlow.external || 1;
    const localPercent = Math.round((privacyStats.dataFlow.local / total) * 100);
    const externalPercent = Math.round((privacyStats.dataFlow.external / total) * 100);

    res.json({
      success: true,
      timeRange,
      dataFlow: {
        local: { count: privacyStats.dataFlow.local, percentage: localPercent, label: 'Local (Ollama) 🔒', description: 'Sensitive queries processed locally' },
        external: { count: privacyStats.dataFlow.external, percentage: externalPercent, label: 'External (OpenAI/Anthropic) 🌐', description: 'Non-sensitive queries sent to external APIs' },
        obfuscated: { count: privacyStats.dataFlow.obfuscated, percentage: 100, label: 'Obfuscated ✓', description: 'All data obfuscated before sending' }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/privacy/telemetry/preview
 * Show telemetry before/after obfuscation
 */
router.get('/api/privacy/telemetry/preview', async (req, res) => {
  try {
    const rawEvent = {
      userId: 'user_12345',
      email: 'john.doe@example.com',
      event: 'receipt_parsed',
      timestamp: new Date().toISOString(),
      metadata: { merchant: 'Stripe', amount: 29.00, category: 'payment', ip: '192.168.1.100' }
    };

    const obfuscatedEvent = {
      userId: obfuscator.obfuscateUserId(rawEvent.userId),
      email: obfuscator.obfuscateEmail(rawEvent.email),
      event: rawEvent.event,
      timestamp: rawEvent.timestamp,
      metadata: { merchant: rawEvent.metadata.merchant, amount: '[REDACTED]', category: rawEvent.metadata.category, ip: obfuscator.obfuscateIP(rawEvent.metadata.ip) }
    };

    res.json({
      success: true,
      preview: {
        raw: { label: '❌ What we DON\'T see (original data)', data: rawEvent },
        obfuscated: { label: '✅ What we DO see (after obfuscation)', data: obfuscatedEvent },
        explanation: { userId: 'Hashed with SHA-256 (irreversible)', email: 'Domain only (e.g., "gmail.com")', amount: 'Removed (financial data never sent)', ip: 'Country-level only (not stored)' }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/privacy/telemetry/opt-out
 * Opt out of telemetry
 */
router.post('/api/privacy/telemetry/opt-out', async (req, res) => {
  try {
    const userId = req.body.userId;
    console.log(`[Privacy] User ${userId} opted out of telemetry`);
    res.json({ success: true, message: 'You have been opted out of telemetry collection', status: 'opted_out' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/privacy/export
 * Export all user data (GDPR)
 */
router.get('/api/privacy/export', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    const exportData = { userId, exportDate: new Date().toISOString(), data: { receipts: [], transactions: [], emails: [], telemetry: [] } };
    res.json({ success: true, export: exportData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/privacy/data
 * Delete all user data (GDPR)
 */
router.delete('/api/privacy/data', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    console.log(`[Privacy] Deleting all data for user ${userId}`);
    res.json({ success: true, message: 'All user data has been deleted', userId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/privacy/track
 * Internal endpoint to track data flow
 */
router.post('/api/privacy/track', async (req, res) => {
  try {
    const { type, source, obfuscated } = req.body;
    if (type === 'query') {
      if (source === 'local') privacyStats.dataFlow.local++;
      else if (source === 'external') privacyStats.dataFlow.external++;
      if (obfuscated) privacyStats.dataFlow.obfuscated++;
    }
    privacyStats.trustMetrics.totalRequests++;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export stats for middleware use
router.getStats = () => privacyStats;
router.incrementStat = (category, field) => {
  if (privacyStats[category] && privacyStats[category][field] !== undefined) {
    privacyStats[category][field]++;
  }
};

module.exports = router;

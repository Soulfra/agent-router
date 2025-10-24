/**
 * Embed Routes - API for Embeddable Script System
 *
 * Provides Osano-like embeddable scripts for any website.
 *
 * Public Endpoints (no auth):
 * - GET /embed/:siteId/config - Get site configuration
 * - POST /embed/:siteId/event - Track event
 * - GET /embed/:siteId/consent - Get consent status
 * - POST /embed/:siteId/consent - Save consent
 *
 * Protected Endpoints (requires auth):
 * - POST /api/embed/sites - Create site
 * - GET /api/embed/sites - List user's sites
 * - GET /api/embed/sites/:siteId - Get site details
 * - PATCH /api/embed/sites/:siteId - Update site
 * - DELETE /api/embed/sites/:siteId - Delete site
 * - GET /api/embed/sites/:siteId/analytics - Get analytics
 * - POST /api/embed/sites/:siteId/compute-analytics - Compute analytics
 */

const express = require('express');
const EmbedManager = require('../lib/embed-manager');

const router = express.Router();
const manager = new EmbedManager();

// ============================================================================
// PUBLIC ENDPOINTS (For embedded scripts)
// ============================================================================

/**
 * GET /embed/:siteId/config
 * Get site configuration for embedded script
 *
 * Returns public configuration (theme, consent text, enabled features)
 */
router.get('/embed/:siteId/config', async (req, res) => {
  try {
    const { siteId } = req.params;

    const site = await manager.getSite(siteId);

    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    if (site.status !== 'active') {
      return res.status(403).json({ error: 'Site is not active' });
    }

    // Return only public configuration
    res.json({
      siteId: site.site_id,
      domain: site.domain,
      name: site.name,
      config: site.config,
      theme: site.theme,
      consentText: site.consent_text,
      consentEnabled: site.consent_enabled,
      authEnabled: site.auth_enabled,
      analyticsEnabled: site.analytics_enabled
    });
  } catch (error) {
    console.error('Error fetching embed config:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

/**
 * POST /embed/:siteId/event
 * Track event from embedded script
 *
 * Body:
 * {
 *   "sessionId": "abc123",
 *   "visitorId": "xyz789",
 *   "eventType": "pageview",
 *   "eventName": "home_page_view",
 *   "eventData": { "custom": "data" },
 *   "pageUrl": "https://example.com/",
 *   "pageTitle": "Home",
 *   "referrer": "https://google.com"
 * }
 */
router.post('/embed/:siteId/event', async (req, res) => {
  try {
    const { siteId } = req.params;
    const event = req.body;

    // Verify site exists and is active
    const site = await manager.getSite(siteId);

    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    if (site.status !== 'active') {
      return res.status(403).json({ error: 'Site is not active' });
    }

    // Add request metadata
    event.userAgent = req.headers['user-agent'];
    event.ipAddress = req.ip || req.connection.remoteAddress;

    // Track event
    const result = await manager.trackEvent(siteId, event);

    res.json({
      success: true,
      eventId: result.id,
      timestamp: result.timestamp
    });
  } catch (error) {
    console.error('Error tracking embed event:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

/**
 * GET /embed/:siteId/consent
 * Get consent status for visitor
 *
 * Query params:
 * - visitorId: Visitor ID (required)
 */
router.get('/embed/:siteId/consent', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { visitorId } = req.query;

    if (!visitorId) {
      return res.status(400).json({ error: 'visitorId required' });
    }

    const consent = await manager.getConsent(siteId, visitorId);

    if (!consent) {
      return res.json({ hasConsent: false });
    }

    res.json({
      hasConsent: true,
      analyticsConsent: consent.analytics_consent,
      marketingConsent: consent.marketing_consent,
      functionalConsent: consent.functional_consent,
      grantedAt: consent.granted_at,
      expiresAt: consent.expires_at
    });
  } catch (error) {
    console.error('Error fetching consent:', error);
    res.status(500).json({ error: 'Failed to fetch consent' });
  }
});

/**
 * POST /embed/:siteId/consent
 * Save consent preferences
 *
 * Body:
 * {
 *   "visitorId": "xyz789",
 *   "analyticsConsent": true,
 *   "marketingConsent": false,
 *   "functionalConsent": true
 * }
 */
router.post('/embed/:siteId/consent', async (req, res) => {
  try {
    const { siteId } = req.params;
    const consent = req.body;

    // Verify site exists
    const site = await manager.getSite(siteId);

    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    if (site.status !== 'active') {
      return res.status(403).json({ error: 'Site is not active' });
    }

    // Add request metadata
    consent.ipAddress = req.ip || req.connection.remoteAddress;
    consent.userAgent = req.headers['user-agent'];

    // Save consent
    const result = await manager.saveConsent(siteId, consent);

    // Also track as event
    await manager.trackEvent(siteId, {
      sessionId: req.body.sessionId || 'unknown',
      visitorId: consent.visitorId,
      eventType: 'consent',
      eventName: 'consent_saved',
      eventData: {
        analytics: consent.analyticsConsent,
        marketing: consent.marketingConsent,
        functional: consent.functionalConsent
      },
      userAgent: consent.userAgent,
      ipAddress: consent.ipAddress
    });

    res.json({
      success: true,
      consentId: result.id,
      grantedAt: result.granted_at
    });
  } catch (error) {
    console.error('Error saving consent:', error);
    res.status(500).json({ error: 'Failed to save consent' });
  }
});

// ============================================================================
// PROTECTED ENDPOINTS (Require authentication)
// ============================================================================

/**
 * Middleware: Require authentication
 */
const requireAuth = (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

/**
 * Middleware: Verify site ownership
 */
const verifySiteOwnership = async (req, res, next) => {
  try {
    const { siteId } = req.params;
    const userId = req.user.id;

    const site = await manager.getSite(siteId);

    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }

    if (site.user_id !== userId) {
      return res.status(403).json({ error: 'You do not own this site' });
    }

    // Attach site to request
    req.embedSite = site;
    next();
  } catch (error) {
    console.error('Error verifying site ownership:', error);
    res.status(500).json({ error: 'Failed to verify ownership' });
  }
};

/**
 * POST /api/embed/sites
 * Create new embed site
 *
 * Body:
 * {
 *   "domain": "example.com",
 *   "name": "My Website",
 *   "description": "My personal blog",
 *   "allowedOrigins": ["https://example.com", "https://www.example.com"],
 *   "theme": { "primaryColor": "#667eea" }
 * }
 */
router.post('/api/embed/sites', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const data = { ...req.body, userId };

    const site = await manager.createSite(data);

    res.json({
      success: true,
      site: {
        siteId: site.site_id,
        apiKey: site.api_key,
        domain: site.domain,
        name: site.name,
        description: site.description,
        status: site.status,
        embedCode: manager.getEmbedCode(site.site_id),
        createdAt: site.created_at
      }
    });
  } catch (error) {
    console.error('Error creating embed site:', error);
    res.status(500).json({ error: 'Failed to create site' });
  }
});

/**
 * GET /api/embed/sites
 * List all sites for authenticated user
 */
router.get('/api/embed/sites', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const sites = await manager.getUserSites(userId);

    res.json({
      sites: sites.map(site => ({
        siteId: site.site_id,
        domain: site.domain,
        name: site.name,
        description: site.description,
        status: site.status,
        consentEnabled: site.consent_enabled,
        authEnabled: site.auth_enabled,
        analyticsEnabled: site.analytics_enabled,
        lastEventAt: site.last_event_at,
        createdAt: site.created_at,
        embedCode: manager.getEmbedCode(site.site_id)
      }))
    });
  } catch (error) {
    console.error('Error listing sites:', error);
    res.status(500).json({ error: 'Failed to list sites' });
  }
});

/**
 * GET /api/embed/sites/:siteId
 * Get site details (with API key)
 */
router.get('/api/embed/sites/:siteId', requireAuth, verifySiteOwnership, async (req, res) => {
  try {
    const site = req.embedSite;

    res.json({
      siteId: site.site_id,
      apiKey: site.api_key,
      domain: site.domain,
      name: site.name,
      description: site.description,
      allowedOrigins: site.allowed_origins,
      config: site.config,
      theme: site.theme,
      consentText: site.consent_text,
      consentEnabled: site.consent_enabled,
      authEnabled: site.auth_enabled,
      analyticsEnabled: site.analytics_enabled,
      webhookUrl: site.webhook_url,
      status: site.status,
      lastEventAt: site.last_event_at,
      createdAt: site.created_at,
      updatedAt: site.updated_at,
      embedCode: manager.getEmbedCode(site.site_id)
    });
  } catch (error) {
    console.error('Error fetching site:', error);
    res.status(500).json({ error: 'Failed to fetch site' });
  }
});

/**
 * PATCH /api/embed/sites/:siteId
 * Update site configuration
 *
 * Body: Any updateable fields (name, domain, theme, etc.)
 */
router.patch('/api/embed/sites/:siteId', requireAuth, verifySiteOwnership, async (req, res) => {
  try {
    const { siteId } = req.params;
    const updates = req.body;

    const site = await manager.updateSite(siteId, updates);

    res.json({
      success: true,
      site: {
        siteId: site.site_id,
        domain: site.domain,
        name: site.name,
        description: site.description,
        status: site.status,
        updatedAt: site.updated_at
      }
    });
  } catch (error) {
    console.error('Error updating site:', error);
    res.status(500).json({ error: 'Failed to update site' });
  }
});

/**
 * DELETE /api/embed/sites/:siteId
 * Delete site
 */
router.delete('/api/embed/sites/:siteId', requireAuth, verifySiteOwnership, async (req, res) => {
  try {
    const { siteId } = req.params;

    const deleted = await manager.deleteSite(siteId);

    res.json({
      success: true,
      deleted
    });
  } catch (error) {
    console.error('Error deleting site:', error);
    res.status(500).json({ error: 'Failed to delete site' });
  }
});

/**
 * GET /api/embed/sites/:siteId/analytics
 * Get analytics for site
 *
 * Query params:
 * - startDate: ISO date string (default: 30 days ago)
 * - endDate: ISO date string (default: today)
 */
router.get('/api/embed/sites/:siteId/analytics', requireAuth, verifySiteOwnership, async (req, res) => {
  try {
    const { siteId } = req.params;

    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date();

    const analytics = await manager.getAnalytics(siteId, startDate, endDate);

    // Calculate totals
    const totals = analytics.reduce((acc, day) => {
      acc.uniqueVisitors += day.unique_visitors;
      acc.totalSessions += day.total_sessions;
      acc.totalPageViews += day.total_page_views;
      acc.conversions += day.conversions;
      acc.conversionValue += parseFloat(day.conversion_value);
      return acc;
    }, {
      uniqueVisitors: 0,
      totalSessions: 0,
      totalPageViews: 0,
      conversions: 0,
      conversionValue: 0
    });

    res.json({
      siteId,
      startDate,
      endDate,
      totals,
      daily: analytics
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * POST /api/embed/sites/:siteId/compute-analytics
 * Manually compute analytics for a specific date
 *
 * Body:
 * {
 *   "date": "2024-01-15"
 * }
 */
router.post('/api/embed/sites/:siteId/compute-analytics', requireAuth, verifySiteOwnership, async (req, res) => {
  try {
    const { siteId } = req.params;
    const { date } = req.body;

    const targetDate = date ? new Date(date) : new Date();

    const analytics = await manager.computeAnalytics(siteId, targetDate);

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Error computing analytics:', error);
    res.status(500).json({ error: 'Failed to compute analytics' });
  }
});

/**
 * GET /api/embed/sites/:siteId/embed-code
 * Get embed code for site
 *
 * Query params:
 * - async: true/false (default: true)
 */
router.get('/api/embed/sites/:siteId/embed-code', requireAuth, verifySiteOwnership, async (req, res) => {
  try {
    const { siteId } = req.params;
    const async = req.query.async !== 'false';

    const embedCode = manager.getEmbedCode(siteId, { async });

    res.json({
      siteId,
      embedCode,
      instructions: [
        '1. Copy the code below',
        '2. Paste it in the <head> or before </body> of your HTML',
        '3. The script will automatically load and initialize'
      ]
    });
  } catch (error) {
    console.error('Error generating embed code:', error);
    res.status(500).json({ error: 'Failed to generate embed code' });
  }
});

// ============================================================================
// CORS MIDDLEWARE (for embed endpoints)
// ============================================================================

/**
 * CORS middleware for embed endpoints
 * Allows cross-origin requests from allowed origins
 */
router.use('/embed/*', async (req, res, next) => {
  const origin = req.headers.origin;

  if (!origin) {
    return next();
  }

  try {
    // Extract site ID from URL
    const siteIdMatch = req.path.match(/\/embed\/([^\/]+)/);

    if (!siteIdMatch) {
      return next();
    }

    const siteId = siteIdMatch[1];
    const site = await manager.getSite(siteId);

    if (!site) {
      return next();
    }

    // Check if origin is allowed
    if (manager.isOriginAllowed(site, origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    next();
  } catch (error) {
    console.error('CORS middleware error:', error);
    next();
  }
});

module.exports = router;

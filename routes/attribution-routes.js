/**
 * Attribution Routes
 *
 * Ad attribution dashboard and identity resolution API:
 * - View complete identity graphs
 * - Track attribution funnels (ad → click → signup → purchase)
 * - Analyze conversion paths
 * - Affiliate performance metrics
 *
 * "Reverse programmatic SEO" - track users back through digital ads
 */

const express = require('express');
const router = express.Router();
const IdentityResolver = require('../lib/identity-resolver');
const ReceiptParser = require('../lib/receipt-parser');
const GeoResolver = require('../lib/geo-resolver');
const QRGenerator = require('../lib/qr-generator');
const ParamValidator = require('../lib/param-validator');

// Dependencies (injected via initRoutes)
let db = null;
let identityResolver = null;
let receiptParser = null;
let geoResolver = null;
let qrGenerator = null;
let paramValidator = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database, options = {}) {
  db = database;

  identityResolver = new IdentityResolver({ db });
  receiptParser = new ReceiptParser({ db });
  geoResolver = new GeoResolver({ db });
  qrGenerator = new QRGenerator({ baseUrl: options.baseUrl || 'https://calos.ai' });
  paramValidator = new ParamValidator();

  return router;
}

// ============================================================================
// TRACK ATTRIBUTION EVENT
// ============================================================================

/**
 * POST /api/attribution/track
 * Track attribution event (ad click, landing, signup, purchase)
 *
 * Body:
 * {
 *   "event_type": "ad_click" | "landing" | "signup" | "purchase",
 *   "cookie_id": "GA1.2.xxx",
 *   "device_fingerprint": "hash",
 *   "user_id": "uuid" (optional),
 *   "utm_source": "google",
 *   "utm_medium": "cpc",
 *   "utm_campaign": "summer-2024",
 *   "affiliate_code": "GOOGLE-PARTNER",
 *   "ip_address": "1.2.3.4",
 *   "user_agent": "Mozilla/5.0...",
 *   "event_data": {...}
 * }
 */
router.post('/track', async (req, res) => {
  try {
    const {
      event_type,
      cookie_id,
      device_fingerprint,
      user_id,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      affiliate_code,
      referrer,
      event_data
    } = req.body;

    // Validate parameters
    const validation = paramValidator.validateAll({
      utm_source,
      utm_medium,
      utm_campaign,
      affiliate_code: affiliate_code || req.body.ref,
      cookie_id,
      device_fingerprint
    });

    if (!validation.valid && paramValidator.strictMode) {
      return res.status(400).json({
        success: false,
        errors: validation.errors
      });
    }

    // Get IP and user agent from request if not provided
    const ipAddress = req.body.ip_address || req.ip;
    const userAgent = req.body.user_agent || req.headers['user-agent'];

    // Resolve location
    let location = null;
    if (ipAddress && ipAddress !== '::1' && ipAddress !== '127.0.0.1') {
      location = await geoResolver.resolve(ipAddress);
    }

    // Track event
    const event = await identityResolver.trackAttributionEvent({
      event_type,
      cookie_id: validation.sanitized.cookie_id || cookie_id,
      device_fingerprint: validation.sanitized.device_fingerprint || device_fingerprint,
      user_id,
      utm_source: validation.sanitized.utm_source || utm_source,
      utm_medium: validation.sanitized.utm_medium || utm_medium,
      utm_campaign: validation.sanitized.utm_campaign || utm_campaign,
      utm_content,
      utm_term,
      affiliate_code: validation.sanitized.affiliate_code || affiliate_code,
      referrer,
      ip_address: ipAddress,
      user_agent: userAgent,
      platform: req.body.platform,
      event_data
    });

    res.json({
      success: true,
      event: {
        event_id: event.event_id,
        event_type: event.event_type,
        identity_id: event.identity_id,
        location: location ? geoResolver.formatLocation(location) : null
      }
    });

  } catch (error) {
    console.error('[AttributionRoutes] Track error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET IDENTITY GRAPH
// ============================================================================

/**
 * GET /api/attribution/identity/:userId
 * Get complete identity graph for user
 */
router.get('/identity/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const graph = await identityResolver.getIdentityGraph(userId);

    if (!graph) {
      return res.status(404).json({
        success: false,
        error: 'Identity not found'
      });
    }

    res.json({
      success: true,
      graph
    });

  } catch (error) {
    console.error('[AttributionRoutes] Get identity error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET ATTRIBUTION PATH
// ============================================================================

/**
 * GET /api/attribution/path/:userId
 * Get complete attribution path (ad → click → signup → purchase)
 */
router.get('/path/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const path = await identityResolver.getAttributionPath(userId);

    res.json({
      success: true,
      path,
      funnel: {
        ad_clicks: path.filter(e => e.event_type === 'ad_click').length,
        landings: path.filter(e => e.event_type === 'landing').length,
        signups: path.filter(e => e.event_type === 'signup').length,
        purchases: path.filter(e => e.event_type === 'purchase').length
      }
    });

  } catch (error) {
    console.error('[AttributionRoutes] Get path error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET ATTRIBUTION FUNNEL
// ============================================================================

/**
 * GET /api/attribution/funnel
 * Get attribution funnel metrics
 *
 * Query params:
 * - affiliate_code: Filter by affiliate
 * - start_date: Filter by date range
 * - end_date
 */
router.get('/funnel', async (req, res) => {
  try {
    const { affiliate_code, start_date, end_date } = req.query;

    let whereClause = '1=1';
    const params = [];
    let paramCount = 1;

    if (affiliate_code) {
      whereClause += ` AND affiliate_code = $${paramCount++}`;
      params.push(affiliate_code);
    }

    if (start_date) {
      whereClause += ` AND first_click >= $${paramCount++}`;
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ` AND first_click <= $${paramCount++}`;
      params.push(end_date);
    }

    const result = await db.query(`
      SELECT
        COUNT(*) as total_identities,
        COUNT(first_click) as clicked,
        COUNT(first_landing) as landed,
        COUNT(first_signup) as signed_up,
        COUNT(first_purchase) as purchased,
        ROUND(AVG(hours_to_convert), 2) as avg_hours_to_convert,
        ROUND(COUNT(first_purchase)::numeric / NULLIF(COUNT(first_click), 0) * 100, 2) as conversion_rate
      FROM attribution_funnel
      WHERE ${whereClause}
    `, params);

    res.json({
      success: true,
      funnel: result.rows[0]
    });

  } catch (error) {
    console.error('[AttributionRoutes] Funnel error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// PARSE RECEIPTS
// ============================================================================

/**
 * POST /api/attribution/parse-receipts
 * Parse email receipts for user
 *
 * Body:
 * {
 *   "user_id": "uuid",
 *   "messages": [{...}] // Email messages
 * }
 */
router.post('/parse-receipts', async (req, res) => {
  try {
    const { user_id, messages } = req.body;

    if (!user_id || !messages) {
      return res.status(400).json({
        success: false,
        error: 'user_id and messages required'
      });
    }

    const receipts = await receiptParser.batchParseReceipts(messages, user_id);

    // Match receipts to affiliate referrals
    for (const receipt of receipts) {
      await receiptParser.matchToAffiliate(receipt, user_id);
    }

    res.json({
      success: true,
      parsed: receipts.length,
      receipts
    });

  } catch (error) {
    console.error('[AttributionRoutes] Parse receipts error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GENERATE TRACKING QR CODE
// ============================================================================

/**
 * POST /api/attribution/qr/generate
 * Generate QR code with tracking parameters
 *
 * Body:
 * {
 *   "type": "voucher" | "affiliate" | "device-pair",
 *   "code": "CALOS-5USD-ABC123",
 *   "affiliate_code": "GOOGLE-PARTNER",
 *   "campaign": {...}
 * }
 */
router.post('/qr/generate', async (req, res) => {
  try {
    const { type, code, affiliate_code, campaign } = req.body;

    let qr;

    switch (type) {
      case 'voucher':
        qr = await qrGenerator.generateVoucherQR({ code }, affiliate_code);
        break;

      case 'affiliate':
        qr = await qrGenerator.generateAffiliateQR(affiliate_code, campaign);
        break;

      case 'device-pair':
        qr = await qrGenerator.generateDevicePairingQR(code);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid QR type'
        });
    }

    res.json({
      success: true,
      qr
    });

  } catch (error) {
    console.error('[AttributionRoutes] Generate QR error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// RESOLVE LOCATION
// ============================================================================

/**
 * GET /api/attribution/location/:ipAddress
 * Resolve IP address to location
 */
router.get('/location/:ipAddress', async (req, res) => {
  try {
    const { ipAddress } = req.params;

    const location = await geoResolver.resolve(ipAddress);

    if (!location) {
      return res.status(404).json({
        success: false,
        error: 'Could not resolve location'
      });
    }

    res.json({
      success: true,
      location: {
        formatted: geoResolver.formatLocation(location),
        coordinates: geoResolver.getCoordinates(location),
        ...location
      }
    });

  } catch (error) {
    console.error('[AttributionRoutes] Resolve location error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// AFFILIATE PERFORMANCE
// ============================================================================

/**
 * GET /api/attribution/affiliate/:affiliateCode/performance
 * Get affiliate performance metrics
 */
router.get('/affiliate/:affiliateCode/performance', async (req, res) => {
  try {
    const { affiliateCode } = req.params;

    // Get identities referred by affiliate
    const identities = await db.query(`
      SELECT COUNT(*) as total_referred
      FROM identity_graph
      WHERE affiliate_code = $1
    `, [affiliateCode]);

    // Get conversion funnel
    const funnel = await db.query(`
      SELECT
        COUNT(*) as total_identities,
        COUNT(first_purchase) as converted,
        ROUND(COUNT(first_purchase)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as conversion_rate,
        ROUND(AVG(hours_to_convert), 2) as avg_hours_to_convert
      FROM attribution_funnel
      WHERE affiliate_code = $1
    `, [affiliateCode]);

    // Get revenue
    const revenue = await db.query(`
      SELECT
        SUM(r.amount_cents) as total_revenue_cents,
        COUNT(r.receipt_id) as total_purchases
      FROM receipt_data r
      JOIN identity_graph ig ON ig.user_id = r.user_id
      WHERE ig.affiliate_code = $1
    `, [affiliateCode]);

    res.json({
      success: true,
      performance: {
        referred: identities.rows[0].total_referred,
        funnel: funnel.rows[0],
        revenue: revenue.rows[0]
      }
    });

  } catch (error) {
    console.error('[AttributionRoutes] Affiliate performance error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = { router, initRoutes };

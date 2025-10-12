/**
 * Domain Portfolio API Routes
 *
 * Manages Matthew Mauer's 12-domain portfolio
 */

const express = require('express');
const router = express.Router();
const DomainManager = require('../lib/domain-manager');

// Initialize domain manager (will be set by parent router)
let domainManager = null;

/**
 * Initialize the router with database connection
 */
function init(db) {
  domainManager = new DomainManager(db);
}

/**
 * GET /api/domains/portfolio
 * Get all active domains in the portfolio
 * Query params:
 *   - private=true : Include domains marked as private (public_display=false)
 */
router.get('/portfolio', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const includePrivate = req.query.private === 'true';
    const domains = await domainManager.getActiveDomains(includePrivate);

    res.json({
      status: 'ok',
      domains,
      count: domains.length,
      owner: 'Matthew Mauer',
      showing: includePrivate ? 'all' : 'public only'
    });
  } catch (error) {
    console.error('Failed to get portfolio:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * PUT /api/domains/:domain/visibility
 * Toggle public visibility for a domain
 */
router.put('/:domain/visibility', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const { domain } = req.params;
    const { public: isPublic } = req.body;

    if (typeof isPublic !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        error: 'Missing or invalid "public" field (must be boolean)'
      });
    }

    const updated = await domainManager.togglePublicDisplay(domain, isPublic);

    res.json({
      status: 'ok',
      domain: updated,
      message: `Domain visibility updated to ${isPublic ? 'public' : 'private'}`
    });
  } catch (error) {
    console.error('Failed to update visibility:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/domains/partners
 * Get partner suggestions for a domain
 */
router.get('/partners', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const { domain, count = 4 } = req.query;

    if (!domain) {
      return res.status(400).json({ status: 'error', error: 'Domain parameter required' });
    }

    const partners = await domainManager.getPartnerSuggestions(domain, parseInt(count));

    res.json({
      status: 'ok',
      partners,
      source: domain,
      count: partners.length
    });
  } catch (error) {
    console.error('Failed to get partners:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/domains/track-click
 * Track a partner link click
 */
router.post('/track-click', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const { source, target, session_id, referrer } = req.body;

    if (!source || !target || !session_id) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: source, target, session_id'
      });
    }

    const click = await domainManager.trackPartnerClick(source, target, session_id, referrer);

    res.json({
      status: 'ok',
      click_id: click.click_id,
      message: 'Click tracked successfully'
    });
  } catch (error) {
    console.error('Failed to track click:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/domains/track-conversion
 * Track a conversion (signup, purchase, etc.)
 */
router.post('/track-conversion', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const { session_id, domain, conversion_type, value = 0 } = req.body;

    if (!session_id || !domain || !conversion_type) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: session_id, domain, conversion_type'
      });
    }

    const event = await domainManager.trackConversion(session_id, domain, conversion_type, value);

    res.json({
      status: 'ok',
      event_id: event.event_id,
      message: 'Conversion tracked successfully'
    });
  } catch (error) {
    console.error('Failed to track conversion:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/domains/analytics
 * Get portfolio analytics summary
 */
router.get('/analytics', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const summary = await domainManager.getPortfolioSummary();

    res.json({
      status: 'ok',
      summary,
      owner: 'Matthew Mauer'
    });
  } catch (error) {
    console.error('Failed to get analytics:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/domains/keywords
 * Get keyword performance for AdWords
 */
router.get('/keywords', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const { limit = 50 } = req.query;
    const keywords = await domainManager.getKeywordPerformance(parseInt(limit));

    res.json({
      status: 'ok',
      keywords,
      count: keywords.length
    });
  } catch (error) {
    console.error('Failed to get keywords:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/domains/wordmap
 * Generate word map from recent activity
 */
router.get('/wordmap', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const { days = 30 } = req.query;
    const wordmap = await domainManager.generateWordMap(parseInt(days));

    res.json({
      status: 'ok',
      wordmap,
      days: parseInt(days)
    });
  } catch (error) {
    console.error('Failed to generate wordmap:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/domains/trademarks
 * Get all trademark registrations
 */
router.get('/trademarks', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const trademarks = await domainManager.getTrademarks();

    res.json({
      status: 'ok',
      trademarks,
      count: trademarks.length,
      owner: 'Matthew Mauer'
    });
  } catch (error) {
    console.error('Failed to get trademarks:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/domains/add
 * Add a new domain to the portfolio
 */
router.post('/add', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const domain = await domainManager.addDomain(req.body);

    res.json({
      status: 'ok',
      domain,
      message: 'Domain added successfully'
    });
  } catch (error) {
    console.error('Failed to add domain:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/domains/:domain/whois
 * Fetch WHOIS data for a domain
 */
router.post('/:domain/whois', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const { domain } = req.params;
    const whoisData = await domainManager.fetchWHOIS(domain);

    res.json({
      status: 'ok',
      whois: whoisData,
      message: 'WHOIS data updated'
    });
  } catch (error) {
    console.error('Failed to fetch WHOIS:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/domains/keywords/track
 * Add or update keyword tracking
 */
router.post('/keywords/track', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const keyword = await domainManager.trackKeyword(req.body);

    res.json({
      status: 'ok',
      keyword,
      message: 'Keyword tracked successfully'
    });
  } catch (error) {
    console.error('Failed to track keyword:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/domains/trademarks/add
 * Add trademark information
 */
router.post('/trademarks/add', async (req, res) => {
  try {
    if (!domainManager) {
      return res.status(500).json({ status: 'error', error: 'Domain manager not initialized' });
    }

    const trademark = await domainManager.addTrademark(req.body);

    res.json({
      status: 'ok',
      trademark,
      message: 'Trademark added successfully'
    });
  } catch (error) {
    console.error('Failed to add trademark:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

module.exports = { router, init };

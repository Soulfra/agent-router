/**
 * Subdomain Registry API Routes
 *
 * Endpoints for managing subdomains across all 12 BillionDollarGame brands.
 */

const express = require('express');
const router = express.Router();
const SubdomainRegistry = require('../lib/subdomain-registry');

// Initialize registry (singleton)
const registry = new SubdomainRegistry();
registry.init().catch(err => console.error('[SubdomainRoutes] Init error:', err));

/**
 * POST /api/subdomains/register
 * Register a new subdomain
 *
 * Body:
 * {
 *   subdomain: "john",
 *   parentDomain: "soulfra.com",
 *   userId: "user-123",
 *   owner: {
 *     username: "john",
 *     github: "john",
 *     discord: "john#1234",
 *     email: "john@example.com"
 *   },
 *   records: {
 *     CNAME: "john.github.io"
 *   },
 *   metadata: {
 *     description: "John's personal site",
 *     repo: "https://github.com/john/john.github.io",
 *     tags: ["portfolio", "developer"]
 *   }
 * }
 */
router.post('/register', async (req, res) => {
  try {
    const result = await registry.register(req.body);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[SubdomainRoutes] Register error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register subdomain',
      message: error.message
    });
  }
});

/**
 * GET /api/subdomains/:subdomain/:parentDomain
 * Get subdomain details
 */
router.get('/:subdomain/:parentDomain', async (req, res) => {
  try {
    const { subdomain, parentDomain } = req.params;
    const result = await registry.getSubdomain(subdomain, parentDomain);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[SubdomainRoutes] Get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subdomain',
      message: error.message
    });
  }
});

/**
 * GET /api/subdomains/user/:userId
 * Get all subdomains for a user
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await registry.getUserSubdomains(userId);

    res.json(result);
  } catch (error) {
    console.error('[SubdomainRoutes] User subdomains error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user subdomains',
      message: error.message
    });
  }
});

/**
 * GET /api/subdomains/list
 * Get all subdomains with optional filters
 *
 * Query params:
 * - status: active|pending
 * - parentDomain: soulfra.com|calriven.com|etc
 */
router.get('/list', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      parentDomain: req.query.parentDomain
    };

    const result = await registry.getAllSubdomains(filters);
    res.json(result);
  } catch (error) {
    console.error('[SubdomainRoutes] List error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list subdomains',
      message: error.message
    });
  }
});

/**
 * PUT /api/subdomains/:subdomain/:parentDomain
 * Update subdomain
 */
router.put('/:subdomain/:parentDomain', async (req, res) => {
  try {
    const { subdomain, parentDomain } = req.params;
    const result = await registry.update(subdomain, parentDomain, req.body);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[SubdomainRoutes] Update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update subdomain',
      message: error.message
    });
  }
});

/**
 * DELETE /api/subdomains/:subdomain/:parentDomain
 * Delete subdomain
 *
 * Body: { userId: "user-123" }
 */
router.delete('/:subdomain/:parentDomain', async (req, res) => {
  try {
    const { subdomain, parentDomain } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    const result = await registry.delete(subdomain, parentDomain, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[SubdomainRoutes] Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete subdomain',
      message: error.message
    });
  }
});

/**
 * POST /api/subdomains/:subdomain/:parentDomain/approve
 * Approve pending subdomain (admin only)
 */
router.post('/:subdomain/:parentDomain/approve', async (req, res) => {
  try {
    // TODO: Add admin auth middleware
    const { subdomain, parentDomain } = req.params;
    const result = await registry.approve(subdomain, parentDomain);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[SubdomainRoutes] Approve error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve subdomain',
      message: error.message
    });
  }
});

/**
 * GET /api/subdomains/stats
 * Get registry statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await registry.getStats();
    res.json(result);
  } catch (error) {
    console.error('[SubdomainRoutes] Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

module.exports = router;
module.exports.registry = registry; // Export singleton for use in other routes

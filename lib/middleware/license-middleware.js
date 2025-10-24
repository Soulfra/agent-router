/**
 * License Verification Middleware
 *
 * Express middleware to enforce license verification
 *
 * Usage:
 *   const { licenseMiddleware, licenseVerifier } = require('./lib/middleware/license-middleware');
 *
 *   // Apply globally
 *   app.use(licenseMiddleware);
 *
 *   // Or per-route
 *   app.get('/api/protected', licenseMiddleware, (req, res) => { ... });
 *
 * What it does:
 * 1. Checks if request is from localhost (always allow)
 * 2. Verifies license with license.calos.sh
 * 3. Attaches license info to req.license
 * 4. Shows warning banner if license expired/invalid (but still allows request)
 * 5. Never fully blocks requests (graceful degradation)
 *
 * License Tiers:
 * - Development (localhost): Free, no restrictions
 * - Community: Free, verify every 24h, limited features
 * - Pro ($29/mo): 5 domains, white-label, verify every 7 days
 * - Enterprise ($99/mo): Unlimited domains, air-gapped, verify every 30 days
 */

const LicenseVerifier = require('../license-verifier');

// Singleton verifier instance
let verifierInstance = null;

/**
 * Get or create verifier instance
 *
 * @param {Object} options
 * @returns {LicenseVerifier}
 */
function getVerifier(options = {}) {
  if (!verifierInstance) {
    verifierInstance = new LicenseVerifier(options);
  }
  return verifierInstance;
}

/**
 * License verification middleware
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function licenseMiddleware(req, res, next) {
  try {
    // Get verifier (initialize if needed)
    const verifier = getVerifier({ db: req.db || req.app.locals.db });

    if (!verifier.installId) {
      await verifier.initialize();
    }

    // Verify license
    const license = await verifier.verify(req);

    // Add white-label permission flag
    license.allowWhiteLabel = ['pro', 'enterprise'].includes(license.tier);

    // Attach to request
    req.license = license;

    // Add license headers (for debugging)
    res.setHeader('X-License-Tier', license.tier);
    res.setHeader('X-License-Valid', license.valid ? 'true' : 'false');
    res.setHeader('X-License-Allow-White-Label', license.allowWhiteLabel ? 'true' : 'false');

    if (license.warning) {
      res.setHeader('X-License-Warning', license.warning);
    }

    // Continue (never block requests, even if invalid)
    next();
  } catch (error) {
    console.error('[LicenseMiddleware] Error:', error.message);

    // Graceful fallback: Assume community tier
    req.license = {
      valid: true,
      tier: 'community',
      requiresVerification: true,
      warning: `License verification failed: ${error.message}`,
      features: {
        whiteLabel: false,
        multiDomain: false,
        apiAccess: false,
        prioritySupport: false
      },
      allowWhiteLabel: false  // Community tier can't white-label
    };

    next();
  }
}

/**
 * Require specific license tier
 *
 * Example:
 *   app.get('/api/enterprise-feature', requireTier('enterprise'), (req, res) => { ... });
 *
 * @param {string} tier - Required tier (pro, enterprise)
 * @returns {Function} Middleware
 */
function requireTier(tier) {
  const tierHierarchy = {
    development: 0,
    community: 1,
    pro: 2,
    enterprise: 3
  };

  return (req, res, next) => {
    const currentTier = req.license?.tier || 'community';
    const requiredLevel = tierHierarchy[tier];
    const currentLevel = tierHierarchy[currentTier];

    if (currentLevel < requiredLevel) {
      return res.status(403).json({
        error: 'License tier too low',
        required: tier,
        current: currentTier,
        message: `This feature requires a ${tier} license. Visit https://calos.sh/pricing to upgrade.`,
        upgradeUrl: 'https://calos.sh/pricing'
      });
    }

    next();
  };
}

/**
 * Require specific feature
 *
 * Example:
 *   app.get('/api/white-label', requireFeature('whiteLabel'), (req, res) => { ... });
 *
 * @param {string} feature - Required feature (whiteLabel, multiDomain, apiAccess, prioritySupport)
 * @returns {Function} Middleware
 */
function requireFeature(feature) {
  return (req, res, next) => {
    const hasFeature = req.license?.features?.[feature];

    if (!hasFeature) {
      return res.status(403).json({
        error: 'Feature not available',
        feature,
        message: `This feature is not available on your current plan. Visit https://calos.sh/pricing to upgrade.`,
        upgradeUrl: 'https://calos.sh/pricing'
      });
    }

    next();
  };
}

/**
 * Optional license check (doesn't block, just warns)
 *
 * Example:
 *   app.use(optionalLicenseCheck);
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function optionalLicenseCheck(req, res, next) {
  try {
    const verifier = getVerifier({ db: req.db || req.app.locals.db });

    if (!verifier.installId) {
      await verifier.initialize();
    }

    const license = await verifier.verify(req);
    req.license = license;

    // Just attach, don't block
    next();
  } catch (error) {
    console.error('[OptionalLicenseCheck] Error:', error.message);
    req.license = null;
    next();
  }
}

/**
 * License info endpoint
 *
 * GET /api/license
 *
 * Example:
 *   app.get('/api/license', licenseInfoEndpoint);
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function licenseInfoEndpoint(req, res) {
  try {
    const verifier = getVerifier({ db: req.db || req.app.locals.db });

    if (!verifier.installId) {
      await verifier.initialize();
    }

    const hostname = req.hostname || req.headers.host || 'localhost';
    const info = await verifier.getLicenseInfo(hostname);

    res.json({
      success: true,
      license: info,
      installId: verifier.installId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Clear license cache endpoint
 *
 * POST /api/license/clear-cache
 *
 * Example:
 *   app.post('/api/license/clear-cache', clearCacheEndpoint);
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function clearCacheEndpoint(req, res) {
  try {
    const verifier = getVerifier({ db: req.db || req.app.locals.db });

    if (!verifier.installId) {
      await verifier.initialize();
    }

    await verifier.clearCache();

    res.json({
      success: true,
      message: 'License cache cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Setup license routes
 *
 * Example:
 *   app.use('/api/license', setupLicenseRoutes());
 *
 * Routes:
 *   GET  /api/license          - Get license info
 *   POST /api/license/clear    - Clear cache
 *
 * @returns {Router} Express router
 */
function setupLicenseRoutes() {
  const express = require('express');
  const router = express.Router();

  router.get('/', licenseInfoEndpoint);
  router.post('/clear', clearCacheEndpoint);

  return router;
}

module.exports = {
  licenseMiddleware,
  requireTier,
  requireFeature,
  optionalLicenseCheck,
  licenseInfoEndpoint,
  clearCacheEndpoint,
  setupLicenseRoutes,
  getVerifier
};

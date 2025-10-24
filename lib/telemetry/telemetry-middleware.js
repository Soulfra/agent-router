/**
 * Telemetry Middleware
 *
 * Express middleware to automatically collect telemetry for all requests.
 *
 * Usage:
 *   const { telemetryMiddleware, getTelemetryCollector } = require('./lib/telemetry/telemetry-middleware');
 *
 *   app.use(telemetryMiddleware);  // Track all requests
 *
 * What it tracks:
 * - API requests (method, path, status code, duration)
 * - Errors (unhandled exceptions, API errors)
 * - Performance (response times, slow queries)
 * - Feature usage (based on endpoint patterns)
 *
 * Privacy:
 * - All data obfuscated (no PII)
 * - Respects tier settings (Enterprise can opt-out)
 */

const TelemetryCollector = require('./telemetry-collector');

// Singleton collector instance
let collectorInstance = null;

/**
 * Get or create telemetry collector
 *
 * @param {Object} options
 * @returns {TelemetryCollector}
 */
function getTelemetryCollector(options = {}) {
  if (!collectorInstance) {
    collectorInstance = new TelemetryCollector(options);
  }
  return collectorInstance;
}

/**
 * Telemetry middleware
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function telemetryMiddleware(req, res, next) {
  const startTime = Date.now();

  // Get collector (initialize if needed)
  const collector = getTelemetryCollector({
    db: req.db || req.app.locals.db,
    installId: req.app.locals.installId,
    tier: req.license?.tier || 'community'
  });

  if (!collector.installId || collector.installId === 'unknown') {
    // Skip telemetry if install ID not available yet
    next();
    return;
  }

  // Attach collector to request (for manual tracking)
  req.telemetry = collector;

  // Track request completion
  res.on('finish', async () => {
    const duration = Date.now() - startTime;

    try {
      // Track API request
      await collector.trackAPIRequest(req, res, duration);

      // Track feature usage based on endpoint
      const feature = _detectFeatureFromPath(req.path || req.url);
      if (feature) {
        await collector.trackFeatureUsage(feature, {
          method: req.method,
          statusCode: res.statusCode
        });
      }

      // Track slow requests (> 1s)
      if (duration > 1000) {
        await collector.trackPerformance('slow_request', {
          duration,
          path: req.path || req.url,
          method: req.method,
          metadata: {
            threshold: 1000
          }
        });
      }

      // Track errors (4xx, 5xx)
      if (res.statusCode >= 400) {
        await collector.trackError(
          new Error(`HTTP ${res.statusCode}`),
          {
            path: req.path || req.url,
            metadata: {
              method: req.method,
              statusCode: res.statusCode
            }
          }
        );
      }
    } catch (error) {
      // Don't fail request if telemetry fails
      console.error('[TelemetryMiddleware] Telemetry error:', error.message);
    }
  });

  next();
}

/**
 * Detect feature from request path
 *
 * @private
 * @param {string} path - Request path
 * @returns {string|null} - Feature name
 */
function _detectFeatureFromPath(path) {
  if (!path) return null;

  // Feature patterns
  const patterns = {
    '/api/pos': 'pos_transaction',
    '/api/crypto': 'crypto_payment',
    '/api/transcripts': 'transcript_upload',
    '/api/marketplace': 'marketplace_theme_install',
    '/api/forum': 'forum_post',
    '/api/quickbooks': 'quickbooks_sync',
    '/api/users/login': 'user_login',
    '/api/users/signup': 'user_signup'
  };

  for (const [pattern, feature] of Object.entries(patterns)) {
    if (path.startsWith(pattern)) {
      return feature;
    }
  }

  return null;
}

/**
 * Error handler middleware (track unhandled errors)
 *
 * Usage:
 *   app.use(telemetryErrorHandler);  // Add AFTER all routes
 *
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function telemetryErrorHandler(err, req, res, next) {
  try {
    const collector = req.telemetry || getTelemetryCollector({
      db: req.db || req.app.locals.db,
      installId: req.app.locals.installId,
      tier: req.license?.tier || 'community'
    });

    // Track error
    await collector.trackError(err, {
      path: req.path || req.url,
      userId: req.user?.id,
      metadata: {
        method: req.method,
        statusCode: res.statusCode || 500
      }
    });
  } catch (error) {
    console.error('[TelemetryErrorHandler] Failed to track error:', error.message);
  }

  // Pass error to next handler
  next(err);
}

/**
 * Track feature usage manually
 *
 * Usage:
 *   await trackFeature(req, 'pos_transaction', { amount: 4999 });
 *
 * @param {Object} req - Express request
 * @param {string} feature - Feature name
 * @param {Object} metadata - Additional metadata
 */
async function trackFeature(req, feature, metadata = {}) {
  try {
    const collector = req.telemetry || getTelemetryCollector({
      db: req.db || req.app.locals.db,
      installId: req.app.locals.installId,
      tier: req.license?.tier || 'community'
    });

    await collector.trackFeatureUsage(feature, metadata);
  } catch (error) {
    console.error('[TelemetryMiddleware] Failed to track feature:', error.message);
  }
}

/**
 * Track error manually
 *
 * Usage:
 *   await trackError(req, error, { context: 'payment_processing' });
 *
 * @param {Object} req - Express request
 * @param {Error|string} error - Error object or message
 * @param {Object} context - Error context
 */
async function trackError(req, error, context = {}) {
  try {
    const collector = req.telemetry || getTelemetryCollector({
      db: req.db || req.app.locals.db,
      installId: req.app.locals.installId,
      tier: req.license?.tier || 'community'
    });

    await collector.trackError(error, {
      ...context,
      path: req.path || req.url,
      userId: req.user?.id
    });
  } catch (err) {
    console.error('[TelemetryMiddleware] Failed to track error:', err.message);
  }
}

/**
 * Track session event manually
 *
 * Usage:
 *   await trackSession(req, 'start', { userId: user.id });
 *
 * @param {Object} req - Express request
 * @param {string} type - Session type (start, end, active)
 * @param {Object} sessionData - Session data
 */
async function trackSession(req, type, sessionData = {}) {
  try {
    const collector = req.telemetry || getTelemetryCollector({
      db: req.db || req.app.locals.db,
      installId: req.app.locals.installId,
      tier: req.license?.tier || 'community'
    });

    await collector.trackSession(type, sessionData);
  } catch (error) {
    console.error('[TelemetryMiddleware] Failed to track session:', error.message);
  }
}

/**
 * Track performance metric manually
 *
 * Usage:
 *   const start = Date.now();
 *   await doSomething();
 *   await trackPerformance(req, 'database_query', { duration: Date.now() - start });
 *
 * @param {Object} req - Express request
 * @param {string} metric - Metric name
 * @param {Object} data - Performance data
 */
async function trackPerformance(req, metric, data = {}) {
  try {
    const collector = req.telemetry || getTelemetryCollector({
      db: req.db || req.app.locals.db,
      installId: req.app.locals.installId,
      tier: req.license?.tier || 'community'
    });

    await collector.trackPerformance(metric, data);
  } catch (error) {
    console.error('[TelemetryMiddleware] Failed to track performance:', error.message);
  }
}

/**
 * Get telemetry summary endpoint
 *
 * GET /api/telemetry/summary?hours=24
 *
 * Usage:
 *   app.get('/api/telemetry/summary', telemetrySummaryEndpoint);
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function telemetrySummaryEndpoint(req, res) {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const collector = getTelemetryCollector({
      db: req.db || req.app.locals.db,
      installId: req.app.locals.installId,
      tier: req.license?.tier || 'community'
    });

    const summary = await collector.getTelemetrySummary(hours);

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Flush telemetry endpoint
 *
 * POST /api/telemetry/flush
 *
 * Usage:
 *   app.post('/api/telemetry/flush', telemetryFlushEndpoint);
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function telemetryFlushEndpoint(req, res) {
  try {
    const collector = getTelemetryCollector({
      db: req.db || req.app.locals.db,
      installId: req.app.locals.installId,
      tier: req.license?.tier || 'community'
    });

    await collector.flush();

    res.json({
      success: true,
      message: 'Telemetry flushed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Setup telemetry routes
 *
 * Usage:
 *   app.use('/api/telemetry', setupTelemetryRoutes());
 *
 * Routes:
 *   GET  /api/telemetry/summary?hours=24  - Get summary
 *   POST /api/telemetry/flush              - Flush buffer
 *
 * @returns {Router} Express router
 */
function setupTelemetryRoutes() {
  const express = require('express');
  const router = express.Router();

  router.get('/summary', telemetrySummaryEndpoint);
  router.post('/flush', telemetryFlushEndpoint);

  return router;
}

module.exports = {
  telemetryMiddleware,
  telemetryErrorHandler,
  getTelemetryCollector,
  trackFeature,
  trackError,
  trackSession,
  trackPerformance,
  telemetrySummaryEndpoint,
  telemetryFlushEndpoint,
  setupTelemetryRoutes
};

/**
 * CALOS Usage Tracking Middleware
 *
 * Real-time usage metering for billing
 *
 * Tracks:
 * - API requests (per endpoint)
 * - Transcripts (when uploaded)
 * - POS transactions (when processed)
 * - Crypto charges (when processed)
 * - Locations (when accessed)
 *
 * Usage:
 *   app.use(usageTrackingMiddleware);
 *
 * Configuration:
 *   process.env.USAGE_TRACKING_ENABLED=true
 *   process.env.USAGE_TRACKING_VERBOSE=false
 */

/**
 * Main usage tracking middleware
 *
 * Auto-tracks API requests for all routes
 */
async function usageTrackingMiddleware(req, res, next) {
  // Skip if disabled
  if (process.env.USAGE_TRACKING_ENABLED === 'false') {
    return next();
  }

  // Skip if no database
  if (!req.db) {
    return next();
  }

  // Skip if no user or license
  if (!req.user && !req.license) {
    return next();
  }

  // Get user ID and install ID
  const userId = req.user?.user_id;
  const installId = req.license?.installId || req.installId;

  // Skip if missing required data
  if (!userId || !installId) {
    return next();
  }

  // Track API request on response finish
  res.on('finish', async () => {
    try {
      // Only track successful requests (2xx, 3xx)
      if (res.statusCode >= 400) {
        return;
      }

      // Track API request
      await trackUsage(req.db, {
        userId,
        installId,
        usageType: 'api_request',
        usageCount: 1,
        metadata: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode
        }
      });

      if (process.env.USAGE_TRACKING_VERBOSE === 'true') {
        console.log(`[Usage] Tracked API request: ${req.method} ${req.path} (user: ${userId})`);
      }
    } catch (error) {
      console.error('[Usage] Failed to track API request:', error.message);
    }
  });

  next();
}

/**
 * Track specific usage event
 *
 * Usage:
 *   await trackUsage(req.db, {
 *     userId: 123,
 *     installId: 'abc123',
 *     usageType: 'transcript',
 *     usageCount: 1,
 *     metadata: { filename: 'meeting.mp3' }
 *   });
 */
async function trackUsage(db, options) {
  const {
    userId,
    installId,
    usageType,
    usageCount = 1,
    usageAmount = null,
    metadata = {}
  } = options;

  // Validation
  if (!userId || !installId || !usageType) {
    throw new Error('Missing required fields: userId, installId, or usageType');
  }

  // Valid usage types
  const validTypes = [
    'transcript',
    'pos_in_person',
    'pos_online',
    'crypto',
    'location',
    'api_request'
  ];

  if (!validTypes.includes(usageType)) {
    throw new Error(`Invalid usage type: ${usageType}`);
  }

  // Call database function to track usage
  await db.query(`
    SELECT track_usage_event($1, $2, $3, $4, $5, $6)
  `, [
    userId,
    installId,
    usageType,
    usageCount,
    usageAmount,
    JSON.stringify(metadata)
  ]);
}

/**
 * Track transcript upload
 *
 * Usage:
 *   await trackTranscript(req, { filename: 'meeting.mp3', duration: 3600 });
 */
async function trackTranscript(req, metadata = {}) {
  if (!req.db || !req.user || !req.license) {
    return;
  }

  await trackUsage(req.db, {
    userId: req.user.user_id,
    installId: req.license.installId,
    usageType: 'transcript',
    usageCount: 1,
    metadata
  });
}

/**
 * Track POS transaction
 *
 * Usage:
 *   await trackPOSTransaction(req, {
 *     amount: 49.99,
 *     isOnline: false,
 *     transactionId: 'txn_123'
 *   });
 */
async function trackPOSTransaction(req, options = {}) {
  const { amount, isOnline = false, ...metadata } = options;

  if (!req.db || !req.user || !req.license) {
    return;
  }

  if (!amount || amount <= 0) {
    throw new Error('Invalid transaction amount');
  }

  await trackUsage(req.db, {
    userId: req.user.user_id,
    installId: req.license.installId,
    usageType: isOnline ? 'pos_online' : 'pos_in_person',
    usageCount: 1,
    usageAmount: amount,
    metadata
  });
}

/**
 * Track crypto charge
 *
 * Usage:
 *   await trackCryptoCharge(req, {
 *     amount: 199.99,
 *     currency: 'BTC',
 *     chargeId: 'chg_123'
 *   });
 */
async function trackCryptoCharge(req, options = {}) {
  const { amount, ...metadata } = options;

  if (!req.db || !req.user || !req.license) {
    return;
  }

  if (!amount || amount <= 0) {
    throw new Error('Invalid charge amount');
  }

  await trackUsage(req.db, {
    userId: req.user.user_id,
    installId: req.license.installId,
    usageType: 'crypto',
    usageCount: 1,
    usageAmount: amount,
    metadata
  });
}

/**
 * Track location access
 *
 * Usage:
 *   await trackLocation(req, { locationId: 'loc_123', locationName: 'Store 1' });
 */
async function trackLocation(req, metadata = {}) {
  if (!req.db || !req.user || !req.license) {
    return;
  }

  await trackUsage(req.db, {
    userId: req.user.user_id,
    installId: req.license.installId,
    usageType: 'location',
    usageCount: 1,
    metadata
  });
}

/**
 * Get current usage for user
 *
 * Usage:
 *   const usage = await getCurrentUsage(req.db, userId, installId);
 *   console.log(usage.transcripts); // 15
 */
async function getCurrentUsage(db, userId, installId) {
  if (!db || !userId || !installId) {
    throw new Error('Missing required parameters');
  }

  // Get current billing period
  const periodResult = await db.query(`
    SELECT
      current_period_start,
      current_period_end
    FROM subscription_plans
    WHERE user_id = $1 AND install_id = $2
    LIMIT 1
  `, [userId, installId]);

  if (periodResult.rows.length === 0) {
    throw new Error('Subscription not found');
  }

  const { current_period_start, current_period_end } = periodResult.rows[0];

  // Get usage
  const usageResult = await db.query(`
    SELECT * FROM get_current_usage($1, $2, $3, $4)
  `, [userId, installId, current_period_start, current_period_end]);

  const usage = {
    transcripts: 0,
    posInPerson: 0,
    posOnline: 0,
    crypto: 0,
    locations: 0,
    apiRequests: 0,
    totalCost: 0
  };

  usageResult.rows.forEach(row => {
    const type = row.usage_type;
    const count = parseInt(row.usage_count);
    const cost = parseFloat(row.total_cost);

    if (type === 'transcript') {
      usage.transcripts = count;
    } else if (type === 'pos_in_person') {
      usage.posInPerson = count;
    } else if (type === 'pos_online') {
      usage.posOnline = count;
    } else if (type === 'crypto') {
      usage.crypto = count;
    } else if (type === 'location') {
      usage.locations = count;
    } else if (type === 'api_request') {
      usage.apiRequests = count;
    }

    usage.totalCost += cost;
  });

  return usage;
}

/**
 * Check if user is over tier limits
 *
 * Usage:
 *   const limits = await checkUsageLimits(req.db, userId, installId);
 *   if (limits.transcripts.overLimit) {
 *     throw new Error('Transcript limit exceeded');
 *   }
 */
async function checkUsageLimits(db, userId, installId) {
  if (!db || !userId || !installId) {
    throw new Error('Missing required parameters');
  }

  // Get tier
  const tierResult = await db.query(`
    SELECT tier_slug FROM subscription_plans
    WHERE user_id = $1 AND install_id = $2
    LIMIT 1
  `, [userId, installId]);

  if (tierResult.rows.length === 0) {
    throw new Error('Subscription not found');
  }

  const tierSlug = tierResult.rows[0].tier_slug;

  // Check limits
  const result = await db.query(`
    SELECT * FROM check_usage_limits($1, $2, $3)
  `, [userId, installId, tierSlug]);

  const limits = {};

  result.rows.forEach(row => {
    limits[row.usage_type] = {
      currentUsage: parseInt(row.current_usage),
      limit: row.limit_value || Infinity,
      overLimit: row.over_limit
    };
  });

  return limits;
}

/**
 * Express middleware to check usage limits before processing
 *
 * Usage:
 *   router.post('/api/transcripts', checkUsageLimitsMiddleware('transcript'), async (req, res) => {
 *     // Process transcript upload
 *   });
 */
function checkUsageLimitsMiddleware(usageType) {
  return async (req, res, next) => {
    try {
      // Skip if disabled
      if (process.env.USAGE_TRACKING_ENABLED === 'false') {
        return next();
      }

      // Skip if no database or user
      if (!req.db || !req.user || !req.license) {
        return next();
      }

      const userId = req.user.user_id;
      const installId = req.license.installId;

      // Check limits
      const limits = await checkUsageLimits(req.db, userId, installId);

      // Check if over limit for this usage type
      if (limits[usageType] && limits[usageType].overLimit) {
        return res.status(402).json({
          success: false,
          error: `Usage limit exceeded for ${usageType}`,
          currentUsage: limits[usageType].currentUsage,
          limit: limits[usageType].limit,
          upgradeUrl: '/pricing.html',
          message: `You've reached your ${usageType} limit. Upgrade to continue.`
        });
      }

      next();
    } catch (error) {
      console.error('[Usage] Check limits middleware error:', error);
      // Don't fail request if usage tracking fails
      next();
    }
  };
}

/**
 * Global usage limit enforcement middleware
 *
 * Automatically blocks requests when critical limits are exceeded
 * Add this to router AFTER authentication middleware
 *
 * Usage:
 *   app.use(globalUsageLimitMiddleware);
 */
async function globalUsageLimitMiddleware(req, res, next) {
  try {
    // Skip if disabled
    if (process.env.USAGE_LIMIT_ENFORCEMENT === 'false') {
      return next();
    }

    // Skip if no database, user, or license
    if (!req.db || !req.user || !req.license) {
      return next();
    }

    // Skip for pricing/license/auth routes (chicken-egg problem)
    const skipPaths = [
      '/api/pricing',
      '/api/license',
      '/api/auth',
      '/api/login',
      '/api/logout',
      '/pricing.html',
      '/pricing-calculator.html',
      '/usage-monitoring.html'
    ];

    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const userId = req.user.user_id;
    const installId = req.license.installId;

    // Check if any critical limits are exceeded
    const limits = await checkUsageLimits(req.db, userId, installId);

    // Check for critical violations (100%+ usage)
    const criticalViolations = [];
    Object.keys(limits).forEach(usageType => {
      const limit = limits[usageType];
      if (limit.overLimit && limit.limit !== Infinity) {
        const pct = (limit.currentUsage / limit.limit) * 100;
        if (pct >= 100) {
          criticalViolations.push({
            type: usageType,
            current: limit.currentUsage,
            limit: limit.limit,
            percent: Math.round(pct)
          });
        }
      }
    });

    // If critical violations exist, block the request
    if (criticalViolations.length > 0) {
      // Allow read-only operations (GET requests)
      if (req.method === 'GET') {
        // Attach warning header
        res.setHeader('X-Usage-Warning', 'Critical limits exceeded. Upgrade required.');
        return next();
      }

      // Block write operations (POST, PUT, DELETE, PATCH)
      console.warn(`[Usage] Blocked request for user ${userId}: Critical limits exceeded`, criticalViolations);

      return res.status(402).json({
        success: false,
        error: 'Usage limits exceeded',
        message: 'You have exceeded your usage limits. Please upgrade your plan to continue.',
        violations: criticalViolations,
        upgradeUrl: '/pricing.html',
        usageUrl: '/usage-monitoring.html'
      });
    }

    // Check for warning-level violations (80%+)
    const warnings = [];
    Object.keys(limits).forEach(usageType => {
      const limit = limits[usageType];
      if (limit.limit !== Infinity) {
        const pct = (limit.currentUsage / limit.limit) * 100;
        if (pct >= 80 && pct < 100) {
          warnings.push({
            type: usageType,
            current: limit.currentUsage,
            limit: limit.limit,
            percent: Math.round(pct)
          });
        }
      }
    });

    // Attach warnings to response headers
    if (warnings.length > 0) {
      res.setHeader('X-Usage-Warnings', JSON.stringify(warnings));
    }

    next();
  } catch (error) {
    console.error('[Usage] Global limit enforcement error:', error);
    // Don't fail requests if usage tracking fails
    next();
  }
}

module.exports = {
  usageTrackingMiddleware,
  globalUsageLimitMiddleware,
  trackUsage,
  trackTranscript,
  trackPOSTransaction,
  trackCryptoCharge,
  trackLocation,
  getCurrentUsage,
  checkUsageLimits,
  checkUsageLimitsMiddleware
};

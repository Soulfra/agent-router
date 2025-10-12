/**
 * Rate Limiting Middleware
 *
 * Tiered access control:
 * - Anonymous: 10 votes/hour (IP-based)
 * - Registered: 100 votes/hour (user-based)
 * - Email Verified: 500 votes/hour
 * - Trusted Device: Unlimited
 */

const crypto = require('crypto');

// In-memory store for rate limits
// Format: { key: { count: number, resetAt: timestamp } }
const rateLimitStore = new Map();

// Tier configurations
const RATE_LIMITS = {
  anonymous: { limit: 10, window: 3600000 },      // 10 per hour
  registered: { limit: 100, window: 3600000 },    // 100 per hour
  verified: { limit: 500, window: 3600000 },      // 500 per hour
  trusted: { limit: Infinity, window: 3600000 }   // unlimited
};

/**
 * Generate device fingerprint from request
 */
function generateDeviceFingerprint(req) {
  const components = [
    req.ip || req.connection.remoteAddress || 'unknown',
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || ''
  ];
  return crypto.createHash('sha256').update(components.join('|')).digest('hex').substring(0, 16);
}

/**
 * Determine user tier from request
 */
function getUserTier(req) {
  // Check if authenticated user
  if (req.user) {
    if (req.user.isTrustedDevice) {
      return 'trusted';
    }
    if (req.user.emailVerified) {
      return 'verified';
    }
    return 'registered';
  }

  return 'anonymous';
}

/**
 * Get rate limit key for user
 */
function getRateLimitKey(req, tier) {
  if (tier === 'anonymous') {
    // Use IP + device fingerprint for anonymous users
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const fingerprint = generateDeviceFingerprint(req);
    return `anon:${ip}:${fingerprint}`;
  }

  // Use user ID for authenticated users
  return `user:${req.user.id}`;
}

/**
 * Clean up expired entries (run periodically)
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

/**
 * Rate limiting middleware factory
 */
function createRateLimiter(options = {}) {
  const {
    message = 'Too many requests, please try again later',
    skipSuccessfulRequests = false
  } = options;

  return async (req, res, next) => {
    try {
      // Determine user tier
      const tier = getUserTier(req);
      const config = RATE_LIMITS[tier];

      // No limit for trusted users
      if (tier === 'trusted') {
        return next();
      }

      // Get rate limit key
      const key = getRateLimitKey(req, tier);
      const now = Date.now();

      // Get or create rate limit entry
      let entry = rateLimitStore.get(key);

      if (!entry || now > entry.resetAt) {
        // Create new entry
        entry = {
          count: 0,
          resetAt: now + config.window,
          tier
        };
        rateLimitStore.set(key, entry);
      }

      // Check if limit exceeded
      if (entry.count >= config.limit) {
        const resetIn = Math.ceil((entry.resetAt - now) / 1000);
        return res.status(429).json({
          status: 'error',
          error: message,
          code: 'RATE_LIMIT_EXCEEDED',
          tier,
          limit: config.limit,
          resetIn,
          suggestion: tier === 'anonymous'
            ? 'Sign in or verify your email for higher limits'
            : tier === 'registered'
            ? 'Verify your email for higher limits'
            : 'You can vote again soon'
        });
      }

      // Increment counter immediately (or after success if configured)
      if (!skipSuccessfulRequests) {
        entry.count++;
      }

      // Add rate limit info to response headers
      res.setHeader('X-RateLimit-Tier', tier);
      res.setHeader('X-RateLimit-Limit', config.limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.limit - entry.count));
      res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());

      // If skipSuccessfulRequests is true, increment after response
      if (skipSuccessfulRequests) {
        res.on('finish', () => {
          if (res.statusCode < 400) {
            entry.count++;
          }
        });
      }

      next();

    } catch (error) {
      console.error('[RateLimit] Error:', error);
      // Fail open - allow request on error
      next();
    }
  };
}

/**
 * Get current rate limit status for user
 */
function getRateLimitStatus(req) {
  const tier = getUserTier(req);
  const config = RATE_LIMITS[tier];
  const key = getRateLimitKey(req, tier);
  const entry = rateLimitStore.get(key);
  const now = Date.now();

  if (!entry || now > entry.resetAt) {
    return {
      tier,
      limit: config.limit,
      remaining: config.limit,
      resetAt: now + config.window
    };
  }

  return {
    tier,
    limit: config.limit,
    remaining: Math.max(0, config.limit - entry.count),
    resetAt: entry.resetAt
  };
}

module.exports = {
  createRateLimiter,
  getRateLimitStatus,
  RATE_LIMITS
};

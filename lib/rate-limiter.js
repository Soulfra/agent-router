/**
 * Token Bucket Rate Limiter
 *
 * Implements rate limiting based on reputation tiers:
 * - New accounts: 10 req/hour, 50 req/day
 * - Established: 100 req/hour, 500 req/day
 * - Trusted: 1000 req/hour, 5000 req/day
 * - Verified: Unlimited
 *
 * Uses token bucket algorithm:
 * - Bucket has max capacity (requests per hour/day)
 * - Tokens refill at constant rate
 * - Each request consumes 1 token
 * - Request rejected if no tokens available
 */

class RateLimiter {
  constructor(options = {}) {
    // Buckets stored per identity
    // In production: use Redis for distributed rate limiting
    this.buckets = new Map();

    // Cleanup interval
    this.cleanupInterval = setInterval(() => {
      this._cleanup();
    }, 60 * 60 * 1000); // Cleanup every hour
  }

  /**
   * Check if request is allowed and consume token
   * @param {string} identityID - Identity making request
   * @param {object} tier - Access tier with rate limits
   * @returns {object} Result with allowed status and rate limit info
   */
  checkLimit(identityID, tier) {
    // Verified accounts have unlimited access
    if (tier.name === 'verified' || tier.rateLimit.requestsPerHour === -1) {
      return {
        allowed: true,
        tier: tier.name,
        unlimited: true
      };
    }

    // Get or create bucket
    let bucket = this.buckets.get(identityID);

    if (!bucket) {
      bucket = this._createBucket(identityID, tier);
      this.buckets.set(identityID, bucket);
    } else {
      // Update tier if changed
      if (bucket.tier.name !== tier.name) {
        bucket.tier = tier;
        bucket.hourlyLimit = tier.rateLimit.requestsPerHour;
        bucket.dailyLimit = tier.rateLimit.requestsPerDay;
      }
    }

    // Refill tokens based on time elapsed
    this._refillBucket(bucket);

    // Check hourly limit
    if (bucket.hourlyTokens < 1) {
      return {
        allowed: false,
        reason: 'hourly_limit_exceeded',
        tier: tier.name,
        limits: {
          hourly: tier.rateLimit.requestsPerHour,
          daily: tier.rateLimit.requestsPerDay
        },
        remaining: {
          hourly: 0,
          daily: Math.floor(bucket.dailyTokens)
        },
        resetAt: {
          hourly: new Date(bucket.hourlyLastRefill + 60 * 60 * 1000),
          daily: new Date(bucket.dailyLastRefill + 24 * 60 * 60 * 1000)
        }
      };
    }

    // Check daily limit
    if (bucket.dailyTokens < 1) {
      return {
        allowed: false,
        reason: 'daily_limit_exceeded',
        tier: tier.name,
        limits: {
          hourly: tier.rateLimit.requestsPerHour,
          daily: tier.rateLimit.requestsPerDay
        },
        remaining: {
          hourly: Math.floor(bucket.hourlyTokens),
          daily: 0
        },
        resetAt: {
          hourly: new Date(bucket.hourlyLastRefill + 60 * 60 * 1000),
          daily: new Date(bucket.dailyLastRefill + 24 * 60 * 60 * 1000)
        }
      };
    }

    // Consume tokens
    bucket.hourlyTokens -= 1;
    bucket.dailyTokens -= 1;
    bucket.totalRequests += 1;
    bucket.lastRequest = Date.now();

    return {
      allowed: true,
      tier: tier.name,
      limits: {
        hourly: tier.rateLimit.requestsPerHour,
        daily: tier.rateLimit.requestsPerDay
      },
      remaining: {
        hourly: Math.floor(bucket.hourlyTokens),
        daily: Math.floor(bucket.dailyTokens)
      },
      resetAt: {
        hourly: new Date(bucket.hourlyLastRefill + 60 * 60 * 1000),
        daily: new Date(bucket.dailyLastRefill + 24 * 60 * 60 * 1000)
      },
      totalRequests: bucket.totalRequests
    };
  }

  /**
   * Create new bucket for identity
   * @private
   */
  _createBucket(identityID, tier) {
    const now = Date.now();

    return {
      identityID: identityID,
      tier: tier,
      hourlyLimit: tier.rateLimit.requestsPerHour,
      dailyLimit: tier.rateLimit.requestsPerDay,
      hourlyTokens: tier.rateLimit.requestsPerHour,
      dailyTokens: tier.rateLimit.requestsPerDay,
      hourlyLastRefill: now,
      dailyLastRefill: now,
      totalRequests: 0,
      createdAt: now,
      lastRequest: now
    };
  }

  /**
   * Refill bucket tokens based on time elapsed
   * @private
   */
  _refillBucket(bucket) {
    const now = Date.now();

    // Hourly refill
    const hourlyElapsed = now - bucket.hourlyLastRefill;
    const hourlyRefillRate = bucket.hourlyLimit / (60 * 60 * 1000); // tokens per ms
    const hourlyRefillAmount = hourlyElapsed * hourlyRefillRate;

    if (hourlyRefillAmount >= 1) {
      bucket.hourlyTokens = Math.min(
        bucket.hourlyLimit,
        bucket.hourlyTokens + hourlyRefillAmount
      );
      bucket.hourlyLastRefill = now;
    }

    // Daily refill
    const dailyElapsed = now - bucket.dailyLastRefill;
    const dailyRefillRate = bucket.dailyLimit / (24 * 60 * 60 * 1000); // tokens per ms
    const dailyRefillAmount = dailyElapsed * dailyRefillRate;

    if (dailyRefillAmount >= 1) {
      bucket.dailyTokens = Math.min(
        bucket.dailyLimit,
        bucket.dailyTokens + dailyRefillAmount
      );
      bucket.dailyLastRefill = now;
    }
  }

  /**
   * Get rate limit status for identity
   */
  getStatus(identityID) {
    const bucket = this.buckets.get(identityID);

    if (!bucket) {
      return {
        exists: false,
        message: 'No rate limit bucket found for this identity'
      };
    }

    // Refill before returning status
    this._refillBucket(bucket);

    return {
      exists: true,
      identityID: identityID,
      tier: bucket.tier.name,
      limits: {
        hourly: bucket.hourlyLimit,
        daily: bucket.dailyLimit
      },
      remaining: {
        hourly: Math.floor(bucket.hourlyTokens),
        daily: Math.floor(bucket.dailyTokens)
      },
      resetAt: {
        hourly: new Date(bucket.hourlyLastRefill + 60 * 60 * 1000),
        daily: new Date(bucket.dailyLastRefill + 24 * 60 * 60 * 1000)
      },
      totalRequests: bucket.totalRequests,
      createdAt: new Date(bucket.createdAt),
      lastRequest: new Date(bucket.lastRequest)
    };
  }

  /**
   * Reset rate limit for identity
   */
  reset(identityID) {
    const bucket = this.buckets.get(identityID);

    if (!bucket) {
      return { success: false, reason: 'bucket_not_found' };
    }

    const now = Date.now();
    bucket.hourlyTokens = bucket.hourlyLimit;
    bucket.dailyTokens = bucket.dailyLimit;
    bucket.hourlyLastRefill = now;
    bucket.dailyLastRefill = now;

    return {
      success: true,
      identityID: identityID,
      message: 'Rate limit reset'
    };
  }

  /**
   * Manually adjust rate limit for identity
   */
  setCustomLimit(identityID, hourlyLimit, dailyLimit) {
    let bucket = this.buckets.get(identityID);

    if (!bucket) {
      // Create new bucket with custom limits
      bucket = {
        identityID: identityID,
        tier: { name: 'custom', rateLimit: { requestsPerHour: hourlyLimit, requestsPerDay: dailyLimit } },
        hourlyLimit: hourlyLimit,
        dailyLimit: dailyLimit,
        hourlyTokens: hourlyLimit,
        dailyTokens: dailyLimit,
        hourlyLastRefill: Date.now(),
        dailyLastRefill: Date.now(),
        totalRequests: 0,
        createdAt: Date.now(),
        lastRequest: Date.now()
      };
      this.buckets.set(identityID, bucket);
    } else {
      bucket.hourlyLimit = hourlyLimit;
      bucket.dailyLimit = dailyLimit;
      bucket.tier = { name: 'custom', rateLimit: { requestsPerHour: hourlyLimit, requestsPerDay: dailyLimit } };
    }

    return {
      success: true,
      identityID: identityID,
      limits: { hourly: hourlyLimit, daily: dailyLimit }
    };
  }

  /**
   * Remove rate limit for identity
   */
  remove(identityID) {
    const deleted = this.buckets.delete(identityID);
    return {
      success: deleted,
      identityID: identityID
    };
  }

  /**
   * Cleanup old buckets (no requests in 7 days)
   * @private
   */
  _cleanup() {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    let cleaned = 0;

    for (const [identityID, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRequest > maxAge) {
        this.buckets.delete(identityID);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[RateLimiter] Cleaned ${cleaned} old buckets`);
    }

    return cleaned;
  }

  /**
   * Get statistics
   */
  getStats() {
    const buckets = Array.from(this.buckets.values());

    return {
      totalBuckets: buckets.length,
      byTier: {
        new: buckets.filter(b => b.tier.name === 'new').length,
        established: buckets.filter(b => b.tier.name === 'established').length,
        trusted: buckets.filter(b => b.tier.name === 'trusted').length,
        verified: buckets.filter(b => b.tier.name === 'verified').length,
        custom: buckets.filter(b => b.tier.name === 'custom').length
      },
      totalRequests: buckets.reduce((sum, b) => sum + b.totalRequests, 0)
    };
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = RateLimiter;

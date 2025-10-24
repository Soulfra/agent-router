/**
 * Feature Gate Manager
 *
 * Unified access control system for all platform features.
 * Single-line check like 2FA before transaction.
 *
 * Concept:
 * - Connection → Analysis (auth first, then feature access)
 * - Controlled leaks (only expose contractually allowed features)
 * - Pay-per-feature (monetize partials/beta access)
 * - Find top producers (analytics on feature usage/revenue)
 * - Single gate check (like Claude Code limits)
 *
 * Checks:
 * 1. User authenticated
 * 2. Subscription active
 * 3. Credits remaining (if required)
 * 4. Feature in user's tier
 * 5. Beta access granted (if beta)
 * 6. Pay-per-feature unlocked (if paid feature)
 * 7. Rate limits
 *
 * Usage:
 * const gate = new FeatureGateManager({ db });
 *
 * // Middleware
 * router.post('/endpoint',
 *   gate.require('secure_messaging', { checkCredits: true, minCredits: 100 }),
 *   handler
 * );
 *
 * // Manual check
 * const access = await gate.checkAccess(userId, 'secure_messaging');
 * if (!access.allowed) {
 *   return res.status(403).json({ error: access.reason });
 * }
 */

const { EventEmitter } = require('events');

class FeatureGateManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;

    if (!this.db) {
      throw new Error('Database connection required for FeatureGateManager');
    }

    // Cache for feature definitions
    this.featureCache = new Map();
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    console.log('[FeatureGate] Initialized');
  }

  /**
   * Middleware: Require feature access
   *
   * Usage:
   * router.post('/endpoint', gate.require('feature_name', options), handler)
   *
   * Options:
   * - checkCredits: boolean - Check if user has credits
   * - minCredits: number - Minimum credits required
   * - tierRequired: string - Minimum tier ('free', 'starter', 'pro', 'enterprise')
   * - deductCredits: number - Credits to deduct on access
   */
  require(featureName, options = {}) {
    return async (req, res, next) => {
      try {
        // Extract user ID from session or API key
        const userId = req.user?.userId || req.userId || req.session?.userId;
        const tenantId = req.tenantId;

        if (!userId && !tenantId) {
          return this._respondUnauthorized(res, 'Authentication required');
        }

        // Check feature access
        const access = await this.checkAccess(userId || tenantId, featureName, options);

        if (!access.allowed) {
          // Track blocked access attempt
          await this._logBlockedAccess(userId || tenantId, featureName, access.reason, req);

          return this._respondForbidden(res, access.reason, access.details);
        }

        // Attach access info to request
        req.featureAccess = {
          feature: featureName,
          tier: access.tier,
          creditsRemaining: access.creditsRemaining,
          accessType: access.accessType // 'subscription', 'pay_per_feature', 'beta', 'admin'
        };

        // Deduct credits if required
        if (options.deductCredits && options.deductCredits > 0) {
          await this._deductCredits(userId, options.deductCredits, featureName);
          req.featureAccess.creditsDeducted = options.deductCredits;
        }

        // Log successful access
        await this._logAccess(userId || tenantId, featureName, access.accessType, req);

        next();

      } catch (error) {
        console.error('[FeatureGate] Middleware error:', error);
        res.status(500).json({
          status: 'error',
          error: 'Feature gate check failed',
          details: error.message
        });
      }
    };
  }

  /**
   * Check if user/tenant has access to feature
   *
   * @param {string} userId - User ID or Tenant ID
   * @param {string} featureName - Feature name
   * @param {object} options - Check options
   * @returns {Promise<object>} { allowed, reason, details, tier, accessType }
   */
  async checkAccess(userId, featureName, options = {}) {
    try {
      // Get feature definition
      const feature = await this._getFeatureDefinition(featureName);

      if (!feature) {
        return {
          allowed: false,
          reason: 'Feature not found',
          details: { feature: featureName }
        };
      }

      // Check if feature is disabled
      if (feature.status === 'disabled') {
        return {
          allowed: false,
          reason: 'Feature temporarily disabled',
          details: { feature: featureName }
        };
      }

      // Get user/tenant info
      const userInfo = await this._getUserInfo(userId);

      if (!userInfo) {
        return {
          allowed: false,
          reason: 'User or tenant not found',
          details: { userId }
        };
      }

      // Check 1: Admin override (always allow)
      if (userInfo.is_admin) {
        return {
          allowed: true,
          accessType: 'admin',
          tier: 'admin',
          creditsRemaining: userInfo.credits_remaining
        };
      }

      // Check 2: Beta access (if feature is beta)
      if (feature.is_beta) {
        const hasBetaAccess = await this._checkBetaAccess(userId, featureName);

        if (!hasBetaAccess) {
          return {
            allowed: false,
            reason: 'Beta access required',
            details: {
              feature: featureName,
              message: 'This feature is in beta. Request access to try it.'
            }
          };
        }

        // Beta users get access
        return {
          allowed: true,
          accessType: 'beta',
          tier: userInfo.tier_code || 'beta',
          creditsRemaining: userInfo.credits_remaining
        };
      }

      // Check 3: Pay-per-feature unlock
      if (feature.is_paid_feature) {
        const hasFeatureUnlock = await this._checkFeatureUnlock(userId, featureName);

        if (hasFeatureUnlock) {
          return {
            allowed: true,
            accessType: 'pay_per_feature',
            tier: userInfo.tier_code,
            creditsRemaining: userInfo.credits_remaining
          };
        }

        // Fall through to tier/subscription check
      }

      // Check 4: Subscription status
      if (feature.requires_subscription) {
        if (!userInfo.subscription_active) {
          return {
            allowed: false,
            reason: 'Active subscription required',
            details: {
              feature: featureName,
              message: 'Subscribe to access this feature',
              subscriptionRequired: true,
              priceCents: feature.min_tier_price_cents
            }
          };
        }
      }

      // Check 5: Tier requirement
      if (feature.min_tier_code) {
        const tierRank = this._getTierRank(userInfo.tier_code);
        const requiredRank = this._getTierRank(feature.min_tier_code);

        if (tierRank < requiredRank) {
          return {
            allowed: false,
            reason: `${feature.min_tier_code} tier required`,
            details: {
              feature: featureName,
              currentTier: userInfo.tier_code,
              requiredTier: feature.min_tier_code,
              message: `Upgrade to ${feature.min_tier_code} to access this feature`,
              upgradeUrl: '/api/subscriptions/upgrade'
            }
          };
        }
      }

      // Check 6: Credits (if required)
      if (options.checkCredits || feature.requires_credits) {
        const minCredits = options.minCredits || feature.min_credits_required || 0;

        if (userInfo.credits_remaining < minCredits) {
          return {
            allowed: false,
            reason: 'Insufficient credits',
            details: {
              feature: featureName,
              creditsRemaining: userInfo.credits_remaining,
              creditsRequired: minCredits,
              message: 'Purchase credits to use this feature',
              purchaseUrl: '/api/credits/packages'
            }
          };
        }
      }

      // Check 7: Rate limits (feature-specific)
      if (feature.rate_limit_per_day) {
        const usage = await this._getFeatureUsageToday(userId, featureName);

        if (usage >= feature.rate_limit_per_day) {
          return {
            allowed: false,
            reason: 'Daily rate limit exceeded',
            details: {
              feature: featureName,
              limit: feature.rate_limit_per_day,
              used: usage,
              resetAt: this._getResetTime('day')
            }
          };
        }
      }

      // All checks passed
      return {
        allowed: true,
        accessType: 'subscription',
        tier: userInfo.tier_code,
        creditsRemaining: userInfo.credits_remaining
      };

    } catch (error) {
      console.error('[FeatureGate] Check access error:', error);
      // Fail closed (deny access on error)
      return {
        allowed: false,
        reason: 'Access check failed',
        details: { error: error.message }
      };
    }
  }

  /**
   * Check if user has access to multiple features
   * Useful for checking prerequisites
   *
   * @param {string} userId - User ID
   * @param {Array<string>} featureNames - Feature names
   * @returns {Promise<object>} { allAllowed, features: { feature1: { allowed, ... }, ... } }
   */
  async checkMultiple(userId, featureNames) {
    const results = {};

    for (const featureName of featureNames) {
      results[featureName] = await this.checkAccess(userId, featureName);
    }

    const allAllowed = Object.values(results).every(r => r.allowed);

    return {
      allAllowed,
      features: results
    };
  }

  /**
   * Grant beta access to user
   *
   * @param {string} userId - User ID
   * @param {string} featureName - Feature name
   * @param {string} grantedBy - Admin who granted access
   * @returns {Promise<boolean>} Success
   */
  async grantBetaAccess(userId, featureName, grantedBy = 'system') {
    try {
      await this.db.query(
        `INSERT INTO feature_beta_access (user_id, feature_name, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, feature_name) DO NOTHING`,
        [userId, featureName, grantedBy]
      );

      this.emit('beta_access_granted', { userId, featureName, grantedBy });

      return true;

    } catch (error) {
      console.error('[FeatureGate] Grant beta access error:', error);
      return false;
    }
  }

  /**
   * Unlock pay-per-feature for user
   *
   * @param {string} userId - User ID
   * @param {string} featureName - Feature name
   * @param {number} pricePaidCents - Price paid
   * @param {string} paymentIntentId - Stripe payment intent ID
   * @returns {Promise<boolean>} Success
   */
  async unlockFeature(userId, featureName, pricePaidCents, paymentIntentId) {
    try {
      await this.db.query(
        `INSERT INTO feature_access_overrides (
          user_id, feature_name, access_type, price_paid_cents, payment_intent_id
        ) VALUES ($1, $2, 'pay_per_feature', $3, $4)`,
        [userId, featureName, pricePaidCents, paymentIntentId]
      );

      this.emit('feature_unlocked', { userId, featureName, pricePaidCents });

      return true;

    } catch (error) {
      console.error('[FeatureGate] Unlock feature error:', error);
      return false;
    }
  }

  /**
   * Get feature usage analytics
   *
   * @param {string} featureName - Feature name (optional, all if not provided)
   * @param {object} options - { startDate, endDate, groupBy }
   * @returns {Promise<Array>} Usage stats
   */
  async getFeatureAnalytics(featureName = null, options = {}) {
    try {
      const query = featureName
        ? `SELECT * FROM feature_usage_summary WHERE feature_name = $1`
        : `SELECT * FROM feature_usage_summary ORDER BY total_uses DESC LIMIT 50`;

      const params = featureName ? [featureName] : [];

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[FeatureGate] Get analytics error:', error);
      return [];
    }
  }

  /**
   * Get top revenue-generating features
   *
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Top features by revenue
   */
  async getTopProducers(limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT
          feature_name,
          COUNT(*) as unlock_count,
          SUM(price_paid_cents) as total_revenue_cents,
          AVG(price_paid_cents) as avg_price_cents,
          MIN(created_at) as first_purchase,
          MAX(created_at) as latest_purchase
        FROM feature_access_overrides
        WHERE access_type = 'pay_per_feature'
        GROUP BY feature_name
        ORDER BY total_revenue_cents DESC
        LIMIT $1`,
        [limit]
      );

      return result.rows.map(row => ({
        feature: row.feature_name,
        unlockCount: parseInt(row.unlock_count),
        totalRevenue: parseFloat((row.total_revenue_cents / 100).toFixed(2)),
        avgPrice: parseFloat((row.avg_price_cents / 100).toFixed(2)),
        firstPurchase: row.first_purchase,
        latestPurchase: row.latest_purchase
      }));

    } catch (error) {
      console.error('[FeatureGate] Get top producers error:', error);
      return [];
    }
  }

  // ============================================================================
  // INTERNAL METHODS
  // ============================================================================

  /**
   * Get feature definition from database
   */
  async _getFeatureDefinition(featureName) {
    // Check cache
    const cached = this.featureCache.get(featureName);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.feature;
    }

    const result = await this.db.query(
      `SELECT * FROM feature_definitions WHERE feature_name = $1`,
      [featureName]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const feature = result.rows[0];

    // Cache it
    this.featureCache.set(featureName, {
      feature,
      cachedAt: Date.now()
    });

    return feature;
  }

  /**
   * Get user/tenant info
   */
  async _getUserInfo(userId) {
    const result = await this.db.query(
      `SELECT
        u.user_id,
        u.email,
        u.username,
        u.is_admin,
        uc.credits_remaining,
        tl.status as license_status,
        CASE WHEN tl.status = 'active' THEN TRUE ELSE FALSE END as subscription_active,
        pt.tier_code
      FROM users u
      LEFT JOIN user_credits uc ON uc.user_id = u.user_id
      LEFT JOIN tenant_licenses tl ON tl.tenant_id = u.tenant_id AND tl.status = 'active'
      LEFT JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
      WHERE u.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Check beta access
   */
  async _checkBetaAccess(userId, featureName) {
    const result = await this.db.query(
      `SELECT 1 FROM feature_beta_access
       WHERE user_id = $1 AND feature_name = $2
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId, featureName]
    );

    return result.rows.length > 0;
  }

  /**
   * Check feature unlock (pay-per-feature)
   */
  async _checkFeatureUnlock(userId, featureName) {
    const result = await this.db.query(
      `SELECT 1 FROM feature_access_overrides
       WHERE user_id = $1 AND feature_name = $2
       AND access_type = 'pay_per_feature'
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId, featureName]
    );

    return result.rows.length > 0;
  }

  /**
   * Get feature usage today
   */
  async _getFeatureUsageToday(userId, featureName) {
    const result = await this.db.query(
      `SELECT COUNT(*) as count
       FROM feature_usage_analytics
       WHERE user_id = $1 AND feature_name = $2
       AND used_at >= CURRENT_DATE`,
      [userId, featureName]
    );

    return parseInt(result.rows[0].count);
  }

  /**
   * Deduct credits
   */
  async _deductCredits(userId, amount, reason) {
    await this.db.query(
      `UPDATE user_credits
       SET credits_remaining = credits_remaining - $2
       WHERE user_id = $1`,
      [userId, amount]
    );

    console.log(`[FeatureGate] Deducted ${amount} credits from user ${userId} for ${reason}`);
  }

  /**
   * Log feature access
   */
  async _logAccess(userId, featureName, accessType, req) {
    try {
      await this.db.query(
        `INSERT INTO feature_usage_analytics (
          user_id, feature_name, access_type, ip_address, user_agent, endpoint
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          featureName,
          accessType,
          req.ip || req.headers['x-forwarded-for'],
          req.headers['user-agent'],
          req.path
        ]
      );
    } catch (error) {
      console.error('[FeatureGate] Log access error:', error);
    }
  }

  /**
   * Log blocked access attempt
   */
  async _logBlockedAccess(userId, featureName, reason, req) {
    try {
      await this.db.query(
        `INSERT INTO feature_usage_analytics (
          user_id, feature_name, access_type, blocked, block_reason, ip_address, endpoint
        ) VALUES ($1, $2, 'blocked', TRUE, $3, $4, $5)`,
        [userId, featureName, reason, req.ip, req.path]
      );
    } catch (error) {
      console.error('[FeatureGate] Log blocked access error:', error);
    }
  }

  /**
   * Get tier rank (for comparison)
   */
  _getTierRank(tierCode) {
    const ranks = {
      'free': 0,
      'starter': 1,
      'pro': 2,
      'enterprise': 3,
      'admin': 999
    };

    return ranks[tierCode] || 0;
  }

  /**
   * Get reset time for rate limits
   */
  _getResetTime(period) {
    const now = new Date();
    switch (period) {
      case 'day':
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.toISOString();
      default:
        return new Date(now.getTime() + 86400000).toISOString();
    }
  }

  /**
   * Respond with 401 Unauthorized
   */
  _respondUnauthorized(res, message) {
    return res.status(401).json({
      status: 'error',
      error: 'unauthorized',
      message: message || 'Authentication required'
    });
  }

  /**
   * Respond with 403 Forbidden
   */
  _respondForbidden(res, message, details = {}) {
    return res.status(403).json({
      status: 'error',
      error: 'feature_access_denied',
      message: message || 'Access denied',
      ...details
    });
  }
}

module.exports = FeatureGateManager;

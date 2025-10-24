/**
 * API Key Validation Middleware
 *
 * Validates user API keys for authenticated requests to CALOS endpoints.
 * Supports Bearer token authentication.
 *
 * Flow:
 * 1. Extract API key from Authorization header (Bearer token)
 * 2. Look up key in user_api_keys table
 * 3. Verify key is active and not expired
 * 4. Check rate limits
 * 5. Attach user info to req.user
 * 6. Log access
 *
 * Usage:
 *   const validateApiKey = require('./middleware/validate-api-key');
 *
 *   // Protect single route
 *   app.post('/api/llm/chat', validateApiKey, async (req, res) => {
 *     const { userId } = req.user;
 *     // ... handle request
 *   });
 *
 *   // Protect all routes under /api/
 *   app.use('/api/', validateApiKey);
 *
 * Headers:
 *   Authorization: Bearer calos_sk_abc123def456...
 *
 * Response on error:
 *   401 Unauthorized - Missing or invalid API key
 *   403 Forbidden - Key expired or inactive
 *   429 Too Many Requests - Rate limit exceeded
 */

const crypto = require('crypto');

class ApiKeyValidator {
  constructor(config = {}) {
    this.db = config.db;
    this.verbose = config.verbose || false;
    this.keyPrefix = 'calos_sk_'; // Standard prefix for CALOS API keys

    if (!this.db) {
      throw new Error('[ApiKeyValidator] Database connection required');
    }

    console.log('[ApiKeyValidator] Initialized');
  }

  /**
   * Express middleware to validate API key
   *
   * @returns {Function} Express middleware
   */
  middleware() {
    return async (req, res, next) => {
      try {
        // Extract API key from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing Authorization header',
            hint: 'Include "Authorization: Bearer calos_sk_..." header'
          });
        }

        // Parse Bearer token
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid Authorization header format',
            hint: 'Use "Authorization: Bearer <api_key>"'
          });
        }

        const apiKey = parts[1];

        // Validate key format
        if (!apiKey.startsWith(this.keyPrefix)) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid API key format',
            hint: `API keys must start with "${this.keyPrefix}"`
          });
        }

        // Hash the API key for lookup
        const hashedKey = this.hashApiKey(apiKey);

        // Look up in database
        const result = await this.db.query(`
          SELECT
            uak.id,
            uak.user_id,
            uak.key_name,
            uak.scopes,
            uak.rate_limit_per_hour,
            uak.rate_limit_per_day,
            uak.expires_at,
            uak.last_used_at,
            u.username,
            u.email
          FROM user_api_keys uak
          JOIN users u ON u.id = uak.user_id
          WHERE uak.key_hash = $1 AND uak.active = true
        `, [hashedKey]);

        if (result.rows.length === 0) {
          if (this.verbose) {
            console.log('[ApiKeyValidator] Invalid API key attempt');
          }
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid API key'
          });
        }

        const keyData = result.rows[0];

        // Check expiration
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
          if (this.verbose) {
            console.log(`[ApiKeyValidator] Expired API key: ${keyData.key_name}`);
          }
          return res.status(403).json({
            error: 'Forbidden',
            message: 'API key has expired',
            expiredAt: keyData.expires_at
          });
        }

        // Check rate limits
        const rateLimitCheck = await this.checkRateLimit(keyData.id, {
          hourlyLimit: keyData.rate_limit_per_hour,
          dailyLimit: keyData.rate_limit_per_day
        });

        if (!rateLimitCheck.allowed) {
          if (this.verbose) {
            console.log(`[ApiKeyValidator] Rate limit exceeded: ${keyData.key_name}`);
          }
          return res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
            limits: {
              hourly: {
                limit: keyData.rate_limit_per_hour,
                used: rateLimitCheck.hourlyUsed,
                remaining: keyData.rate_limit_per_hour - rateLimitCheck.hourlyUsed,
                resetsAt: rateLimitCheck.hourlyResetAt
              },
              daily: {
                limit: keyData.rate_limit_per_day,
                used: rateLimitCheck.dailyUsed,
                remaining: keyData.rate_limit_per_day - rateLimitCheck.dailyUsed,
                resetsAt: rateLimitCheck.dailyResetAt
              }
            }
          });
        }

        // Update last_used_at
        await this.db.query(`
          UPDATE user_api_keys
          SET last_used_at = NOW()
          WHERE id = $1
        `, [keyData.id]);

        // Attach user info to request
        req.user = {
          userId: keyData.user_id,
          username: keyData.username,
          email: keyData.email,
          apiKeyId: keyData.id,
          apiKeyName: keyData.key_name,
          scopes: keyData.scopes || []
        };

        // Add rate limit info to response headers
        res.set({
          'X-RateLimit-Limit-Hour': keyData.rate_limit_per_hour,
          'X-RateLimit-Remaining-Hour': keyData.rate_limit_per_hour - rateLimitCheck.hourlyUsed,
          'X-RateLimit-Reset-Hour': rateLimitCheck.hourlyResetAt.toISOString(),
          'X-RateLimit-Limit-Day': keyData.rate_limit_per_day,
          'X-RateLimit-Remaining-Day': keyData.rate_limit_per_day - rateLimitCheck.dailyUsed,
          'X-RateLimit-Reset-Day': rateLimitCheck.dailyResetAt.toISOString()
        });

        if (this.verbose) {
          console.log(`[ApiKeyValidator] Valid request: ${keyData.user_id}/${keyData.key_name}`);
        }

        next();

      } catch (error) {
        console.error('[ApiKeyValidator] Validation error:', error.message);
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to validate API key'
        });
      }
    };
  }

  /**
   * Hash API key for database lookup
   * (Don't store raw API keys in database)
   *
   * @param {string} apiKey - Raw API key
   * @returns {string} SHA-256 hash
   * @private
   */
  hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Check rate limits for an API key
   *
   * @param {string} keyId - API key ID
   * @param {Object} limits - Rate limits
   * @returns {Promise<Object>} Rate limit status
   * @private
   */
  async checkRateLimit(keyId, limits) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Count requests in last hour
    const hourlyResult = await this.db.query(`
      SELECT COUNT(*) as count
      FROM user_llm_usage
      WHERE api_key_id = $1 AND created_at > $2
    `, [keyId, oneHourAgo]);

    const hourlyUsed = parseInt(hourlyResult.rows[0]?.count || 0);

    // Count requests in last day
    const dailyResult = await this.db.query(`
      SELECT COUNT(*) as count
      FROM user_llm_usage
      WHERE api_key_id = $1 AND created_at > $2
    `, [keyId, oneDayAgo]);

    const dailyUsed = parseInt(dailyResult.rows[0]?.count || 0);

    // Check if within limits
    const allowed = hourlyUsed < limits.hourlyLimit && dailyUsed < limits.dailyLimit;

    return {
      allowed,
      hourlyUsed,
      dailyUsed,
      hourlyResetAt: new Date(oneHourAgo.getTime() + 60 * 60 * 1000),
      dailyResetAt: new Date(oneDayAgo.getTime() + 24 * 60 * 60 * 1000)
    };
  }

  /**
   * Generate a new API key
   *
   * @returns {string} API key (calos_sk_...)
   */
  generateApiKey() {
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return `${this.keyPrefix}${randomBytes}`;
  }

  /**
   * Check if user has required scope
   *
   * @param {Array} userScopes - User's scopes from API key
   * @param {string} requiredScope - Required scope
   * @returns {boolean} Has scope
   */
  hasScope(userScopes, requiredScope) {
    return userScopes.includes(requiredScope) || userScopes.includes('*');
  }
}

/**
 * Scope-checking middleware factory
 *
 * @param {string} requiredScope - Scope required for this endpoint
 * @returns {Function} Express middleware
 */
function requireScope(requiredScope) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No user authenticated'
      });
    }

    const scopes = req.user.scopes || [];
    const hasScope = scopes.includes(requiredScope) || scopes.includes('*');

    if (!hasScope) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Missing required scope: ${requiredScope}`,
        userScopes: scopes
      });
    }

    next();
  };
}

module.exports = ApiKeyValidator;
module.exports.requireScope = requireScope;

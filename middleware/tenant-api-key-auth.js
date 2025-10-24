/**
 * Tenant API Key Authentication Middleware
 *
 * Validates platform API keys (Layer 1) that customers use to access CALOS.
 * Format: Authorization: Bearer sk-tenant-{tenant_id}-{random}
 *
 * This is different from:
 * - Developer API keys (X-API-Key header) in middleware/api-auth.js
 * - BYOK keys (tenant's own OpenAI/Anthropic keys) in tenant_api_keys table
 */

const bcrypt = require('bcrypt');

class TenantAPIKeyAuth {
  constructor(db) {
    this.db = db;

    // Cache for validated keys (reduces database load)
    // Format: { keyHash: { tenant_id, key_id, validated_at, ... } }
    this.keyCache = new Map();
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    // Rate limit tracking (in-memory, could use Redis for distributed systems)
    this.rateLimitCounters = new Map();
  }

  /**
   * Middleware: Validate tenant API key
   * Usage: router.post('/endpoint', tenantAuth.validateKey, handler)
   */
  validateKey = async (req, res, next) => {
    const startTime = Date.now();

    try {
      // Extract API key from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return this._respondUnauthorized(res, 'Missing or invalid Authorization header. Expected: Bearer sk-tenant-...');
      }

      const apiKey = authHeader.substring(7).trim();

      if (!apiKey.startsWith('sk-tenant-')) {
        return this._respondUnauthorized(res, 'Invalid API key format. Expected: sk-tenant-{tenant_id}-{random}');
      }

      // Extract tenant_id from key format
      const parts = apiKey.split('-');
      if (parts.length < 3) {
        return this._respondUnauthorized(res, 'Malformed API key');
      }

      // parts[0] = 'sk', parts[1] = 'tenant', parts[2] = tenant_id, parts[3+] = random
      const tenantIdFromKey = parts[2];

      // Check cache first (avoid database hit for every request)
      const cached = this._getCachedKey(apiKey);
      if (cached) {
        // Validate cache isn't stale
        if (Date.now() - cached.validated_at < this.CACHE_TTL_MS) {
          req.apiKey = cached;
          req.tenantId = cached.tenant_id;

          // Still check rate limits
          const rateLimitOk = await this._checkRateLimits(cached.key_id, cached);
          if (!rateLimitOk.allowed) {
            return this._respondRateLimited(res, rateLimitOk);
          }

          // Log usage asynchronously
          setImmediate(() => {
            this._logUsage(req, cached.key_id, cached.tenant_id, startTime);
          });

          return next();
        } else {
          // Cache expired, remove it
          this.keyCache.delete(apiKey);
        }
      }

      // Query database for all active keys for this tenant
      // (We need to bcrypt compare against all possible keys)
      const result = await this.db.query(
        `SELECT
          k.key_id,
          k.tenant_id,
          k.key_hash,
          k.key_name,
          k.status,
          k.rate_limit_per_minute,
          k.rate_limit_per_hour,
          k.rate_limit_per_day,
          k.ip_whitelist,
          k.allowed_endpoints,
          k.expires_at,
          t.tenant_name,
          t.status AS tenant_status,
          tl.status AS license_status,
          pt.tier_code
        FROM calos_platform_api_keys k
        JOIN tenants t ON t.tenant_id = k.tenant_id
        LEFT JOIN tenant_licenses tl ON tl.tenant_id = k.tenant_id AND tl.status = 'active'
        LEFT JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
        WHERE k.tenant_id = $1 AND k.status = 'active'`,
        [tenantIdFromKey]
      );

      if (result.rows.length === 0) {
        return this._respondUnauthorized(res, 'Invalid or inactive API key');
      }

      // Try to match the key against all active keys (bcrypt compare)
      let matchedKey = null;
      for (const row of result.rows) {
        const isMatch = await bcrypt.compare(apiKey, row.key_hash);
        if (isMatch) {
          matchedKey = row;
          break;
        }
      }

      if (!matchedKey) {
        // Log failed attempt
        await this._logFailedAttempt(req, tenantIdFromKey, apiKey);
        return this._respondUnauthorized(res, 'Invalid API key');
      }

      // Check if key is expired
      if (matchedKey.expires_at && new Date(matchedKey.expires_at) < new Date()) {
        return this._respondUnauthorized(res, 'API key has expired');
      }

      // Check tenant status
      if (matchedKey.tenant_status !== 'active') {
        return this._respondForbidden(res, 'Tenant account is not active. Please contact support.');
      }

      // Check license status
      if (matchedKey.license_status !== 'active') {
        return this._respondForbidden(res, 'Subscription is not active. Please renew your subscription.');
      }

      // Check IP whitelist (if configured)
      if (matchedKey.ip_whitelist && matchedKey.ip_whitelist.length > 0) {
        const clientIp = this._getClientIp(req);
        if (!matchedKey.ip_whitelist.includes(clientIp)) {
          return this._respondForbidden(res, `IP address ${clientIp} is not whitelisted for this API key`);
        }
      }

      // Check allowed endpoints (if configured)
      if (matchedKey.allowed_endpoints && matchedKey.allowed_endpoints.length > 0) {
        const endpoint = req.path;
        const allowed = matchedKey.allowed_endpoints.some(pattern => {
          // Support wildcards like /v1/chat/*
          const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
          return regex.test(endpoint);
        });

        if (!allowed) {
          return this._respondForbidden(res, `Endpoint ${endpoint} is not allowed for this API key`);
        }
      }

      // Check rate limits
      const rateLimitResult = await this._checkRateLimits(matchedKey.key_id, matchedKey);
      if (!rateLimitResult.allowed) {
        return this._respondRateLimited(res, rateLimitResult);
      }

      // Cache the validated key
      this._cacheKey(apiKey, matchedKey);

      // Attach to request
      req.apiKey = {
        key_id: matchedKey.key_id,
        tenant_id: matchedKey.tenant_id,
        tenant_name: matchedKey.tenant_name,
        key_name: matchedKey.key_name,
        tier_code: matchedKey.tier_code,
        rate_limits: {
          per_minute: matchedKey.rate_limit_per_minute,
          per_hour: matchedKey.rate_limit_per_hour,
          per_day: matchedKey.rate_limit_per_day
        }
      };
      req.tenantId = matchedKey.tenant_id;
      req.tierCode = matchedKey.tier_code;

      // Log usage asynchronously (don't block response)
      setImmediate(() => {
        this._logUsage(req, matchedKey.key_id, matchedKey.tenant_id, startTime);
      });

      next();

    } catch (error) {
      console.error('[TenantAPIKeyAuth] Validation error:', error);
      res.status(500).json({
        status: 'error',
        error: 'Authentication failed'
      });
    }
  };

  /**
   * Check rate limits (minute, hour, day)
   */
  async _checkRateLimits(keyId, keyData) {
    try {
      // Check minute rate limit
      const minuteOk = await this.db.query(
        `SELECT check_platform_api_key_rate_limit($1, 'minute') AS allowed`,
        [keyId]
      );

      if (!minuteOk.rows[0].allowed) {
        return {
          allowed: false,
          period: 'minute',
          limit: keyData.rate_limit_per_minute,
          reset_at: this._getResetTime('minute')
        };
      }

      // Check hour rate limit
      const hourOk = await this.db.query(
        `SELECT check_platform_api_key_rate_limit($1, 'hour') AS allowed`,
        [keyId]
      );

      if (!hourOk.rows[0].allowed) {
        return {
          allowed: false,
          period: 'hour',
          limit: keyData.rate_limit_per_hour,
          reset_at: this._getResetTime('hour')
        };
      }

      // Check day rate limit
      const dayOk = await this.db.query(
        `SELECT check_platform_api_key_rate_limit($1, 'day') AS allowed`,
        [keyId]
      );

      if (!dayOk.rows[0].allowed) {
        return {
          allowed: false,
          period: 'day',
          limit: keyData.rate_limit_per_day,
          reset_at: this._getResetTime('day')
        };
      }

      return { allowed: true };

    } catch (error) {
      console.error('[TenantAPIKeyAuth] Rate limit check error:', error);
      // On error, allow the request (fail open)
      return { allowed: true };
    }
  }

  /**
   * Log API key usage
   */
  async _logUsage(req, keyId, tenantId, startTime) {
    try {
      const latency = Date.now() - startTime;
      const endpoint = req.path;
      const method = req.method;
      const statusCode = res.statusCode || 200;
      const clientIp = this._getClientIp(req);
      const userAgent = req.headers['user-agent'];

      await this.db.query(
        `SELECT log_platform_api_key_usage($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          keyId,
          tenantId,
          endpoint,
          method,
          statusCode,
          latency,
          clientIp,
          userAgent,
          req.id || null // Request ID if available
        ]
      );
    } catch (error) {
      console.error('[TenantAPIKeyAuth] Log usage error:', error);
    }
  }

  /**
   * Log failed authentication attempt
   */
  async _logFailedAttempt(req, tenantId, apiKey) {
    try {
      // Don't log full key, just prefix
      const keyPrefix = apiKey.substring(0, 20);
      console.warn(`[TenantAPIKeyAuth] Failed attempt: ${keyPrefix}... from ${this._getClientIp(req)}`);

      // TODO: Could track failed attempts per IP and implement blocking
    } catch (error) {
      console.error('[TenantAPIKeyAuth] Log failed attempt error:', error);
    }
  }

  /**
   * Cache validated key
   */
  _cacheKey(apiKey, keyData) {
    this.keyCache.set(apiKey, {
      key_id: keyData.key_id,
      tenant_id: keyData.tenant_id,
      tenant_name: keyData.tenant_name,
      key_name: keyData.key_name,
      tier_code: keyData.tier_code,
      rate_limit_per_minute: keyData.rate_limit_per_minute,
      rate_limit_per_hour: keyData.rate_limit_per_hour,
      rate_limit_per_day: keyData.rate_limit_per_day,
      validated_at: Date.now()
    });

    // Limit cache size (prevent memory leak)
    if (this.keyCache.size > 1000) {
      // Remove oldest entry
      const firstKey = this.keyCache.keys().next().value;
      this.keyCache.delete(firstKey);
    }
  }

  /**
   * Get cached key
   */
  _getCachedKey(apiKey) {
    return this.keyCache.get(apiKey);
  }

  /**
   * Get client IP address
   */
  _getClientIp(req) {
    return (
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Get rate limit reset time
   */
  _getResetTime(period) {
    const now = new Date();
    switch (period) {
      case 'minute':
        return new Date(now.getTime() + (60 - now.getSeconds()) * 1000).toISOString();
      case 'hour':
        return new Date(now.getTime() + (60 - now.getMinutes()) * 60 * 1000).toISOString();
      case 'day':
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.toISOString();
      default:
        return new Date(now.getTime() + 60000).toISOString();
    }
  }

  /**
   * Respond with 401 Unauthorized
   */
  _respondUnauthorized(res, message) {
    return res.status(401).json({
      status: 'error',
      error: 'unauthorized',
      message: message || 'Invalid or missing API key'
    });
  }

  /**
   * Respond with 403 Forbidden
   */
  _respondForbidden(res, message) {
    return res.status(403).json({
      status: 'error',
      error: 'forbidden',
      message: message || 'Access denied'
    });
  }

  /**
   * Respond with 429 Rate Limited
   */
  _respondRateLimited(res, rateLimitInfo) {
    res.set({
      'X-RateLimit-Limit': rateLimitInfo.limit,
      'X-RateLimit-Reset': rateLimitInfo.reset_at,
      'Retry-After': Math.ceil((new Date(rateLimitInfo.reset_at) - Date.now()) / 1000)
    });

    return res.status(429).json({
      status: 'error',
      error: 'rate_limit_exceeded',
      message: `Rate limit exceeded for ${rateLimitInfo.period}`,
      limit: rateLimitInfo.limit,
      period: rateLimitInfo.period,
      reset_at: rateLimitInfo.reset_at
    });
  }

  /**
   * Optional: Middleware to check subscription limits (tokens, costs)
   * Usage: router.post('/endpoint', tenantAuth.validateKey, tenantAuth.checkUsageLimits, handler)
   */
  checkUsageLimits = async (req, res, next) => {
    try {
      const tenantId = req.tenantId;

      if (!tenantId) {
        return res.status(500).json({
          status: 'error',
          error: 'Tenant ID not found. Ensure validateKey middleware runs first.'
        });
      }

      // Check if tenant is within usage limits (tokens, costs)
      const result = await this.db.query(
        `SELECT check_usage_limits($1) AS within_limits`,
        [tenantId]
      );

      if (!result.rows[0].within_limits) {
        return res.status(403).json({
          status: 'error',
          error: 'usage_limit_exceeded',
          message: 'You have exceeded your usage limits. Please upgrade your plan or add payment method.'
        });
      }

      next();

    } catch (error) {
      console.error('[TenantAPIKeyAuth] Usage limit check error:', error);
      // On error, allow the request (fail open)
      next();
    }
  };
}

module.exports = TenantAPIKeyAuth;

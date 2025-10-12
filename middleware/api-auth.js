/**
 * API Authentication Middleware
 * Validates API keys, checks rate limits, tracks usage
 */

const crypto = require('crypto');

class APIAuthMiddleware {
  constructor(db) {
    this.db = db;
  }

  /**
   * Validate API key from X-API-Key header
   */
  validateKey = async (req, res, next) => {
    try {
      const apiKey = req.headers['x-api-key'];

      if (!apiKey) {
        return res.status(401).json({
          status: 'error',
          error: 'Missing API key. Include X-API-Key header.'
        });
      }

      // Look up developer by API key
      const result = await this.db.query(`
        SELECT id, email, name, tier, status,
               rate_limit_per_hour, rate_limit_per_day,
               allowed_domains, ip_whitelist
        FROM developers
        WHERE api_key = $1 AND status = 'active'
      `, [apiKey]);

      if (result.rows.length === 0) {
        // Log failed attempt
        await this.logRequest(req, null, 401);
        return res.status(401).json({
          status: 'error',
          error: 'Invalid or inactive API key'
        });
      }

      const developer = result.rows[0];

      // Check IP whitelist if configured
      if (developer.ip_whitelist && developer.ip_whitelist.length > 0) {
        const clientIp = req.ip || req.connection.remoteAddress;
        if (!developer.ip_whitelist.includes(clientIp)) {
          await this.logRequest(req, developer.id, 403);
          return res.status(403).json({
            status: 'error',
            error: 'IP address not whitelisted'
          });
        }
      }

      // Check CORS origin if configured
      const origin = req.headers.origin || req.headers.referer;
      if (developer.allowed_domains && developer.allowed_domains.length > 0 && origin) {
        const originDomain = new URL(origin).hostname;
        const allowed = developer.allowed_domains.some(domain => {
          return originDomain === domain || originDomain.endsWith('.' + domain);
        });

        if (!allowed) {
          await this.logRequest(req, developer.id, 403);
          return res.status(403).json({
            status: 'error',
            error: 'Origin not allowed. Check your allowed domains.'
          });
        }
      }

      // Update last_used_at
      await this.db.query(`
        UPDATE developers
        SET last_used_at = NOW()
        WHERE id = $1
      `, [developer.id]);

      // Attach developer to request
      req.developer = developer;
      req.apiKey = apiKey;

      next();

    } catch (error) {
      console.error('[API Auth] Validation error:', error);
      res.status(500).json({
        status: 'error',
        error: 'Authentication failed'
      });
    }
  };

  /**
   * Check rate limits (per hour and per day)
   */
  checkRateLimit = async (req, res, next) => {
    try {
      const developerId = req.developer.id;
      const now = new Date();
      const hourBucket = new Date(now);
      hourBucket.setMinutes(0, 0, 0);

      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);

      // Check hourly limit
      const hourlyResult = await this.db.query(`
        SELECT COALESCE(SUM(requests_count), 0) as count
        FROM api_usage
        WHERE developer_id = $1 AND hour_bucket = $2
      `, [developerId, hourBucket]);

      const hourlyCount = parseInt(hourlyResult.rows[0].count);

      if (hourlyCount >= req.developer.rate_limit_per_hour) {
        await this.logRequest(req, developerId, 429);
        return res.status(429).json({
          status: 'error',
          error: 'Hourly rate limit exceeded',
          limit: req.developer.rate_limit_per_hour,
          used: hourlyCount,
          reset_at: new Date(hourBucket.getTime() + 3600000).toISOString()
        });
      }

      // Check daily limit
      const dailyResult = await this.db.query(`
        SELECT COALESCE(SUM(requests_count), 0) as count
        FROM api_usage
        WHERE developer_id = $1 AND hour_bucket >= $2
      `, [developerId, dayStart]);

      const dailyCount = parseInt(dailyResult.rows[0].count);

      if (dailyCount >= req.developer.rate_limit_per_day) {
        await this.logRequest(req, developerId, 429);
        return res.status(429).json({
          status: 'error',
          error: 'Daily rate limit exceeded',
          limit: req.developer.rate_limit_per_day,
          used: dailyCount,
          reset_at: new Date(dayStart.getTime() + 86400000).toISOString()
        });
      }

      // Attach rate limit info to request
      req.rateLimit = {
        hourly: { limit: req.developer.rate_limit_per_hour, used: hourlyCount },
        daily: { limit: req.developer.rate_limit_per_day, used: dailyCount }
      };

      next();

    } catch (error) {
      console.error('[API Auth] Rate limit check error:', error);
      res.status(500).json({
        status: 'error',
        error: 'Rate limit check failed'
      });
    }
  };

  /**
   * Track API usage (increment counters)
   */
  trackUsage = async (req, res, next) => {
    const startTime = Date.now();

    // Store original send function
    const originalSend = res.send;

    // Override send to capture response
    res.send = function(data) {
      const latency = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Restore original send
      res.send = originalSend;

      // Track usage asynchronously (don't block response)
      setImmediate(async () => {
        try {
          const developerId = req.developer?.id;
          if (!developerId) return;

          const now = new Date();
          const hourBucket = new Date(now);
          hourBucket.setMinutes(0, 0, 0);

          const endpoint = req.route ? req.route.path : req.path;
          const method = req.method;

          // Upsert api_usage
          await req.app.locals.db.query(`
            INSERT INTO api_usage (
              developer_id, endpoint, method, hour_bucket,
              requests_count, success_count, error_count,
              total_latency_ms
            )
            VALUES ($1, $2, $3, $4, 1, $5, $6, $7)
            ON CONFLICT (developer_id, endpoint, hour_bucket)
            DO UPDATE SET
              requests_count = api_usage.requests_count + 1,
              success_count = api_usage.success_count + $5,
              error_count = api_usage.error_count + $6,
              total_latency_ms = api_usage.total_latency_ms + $7,
              avg_latency_ms = (api_usage.total_latency_ms + $7) / (api_usage.requests_count + 1)
          `, [
            developerId,
            endpoint,
            method,
            hourBucket,
            statusCode < 400 ? 1 : 0,
            statusCode >= 400 ? 1 : 0,
            latency
          ]);

          // Log detailed request
          await req.app.locals.db.query(`
            INSERT INTO api_request_log (
              developer_id, api_key, endpoint, method,
              status_code, latency_ms, ip_address, user_agent, origin
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            developerId,
            req.apiKey,
            endpoint,
            method,
            statusCode,
            latency,
            req.ip || req.connection.remoteAddress,
            req.headers['user-agent'],
            req.headers.origin || req.headers.referer
          ]);

        } catch (error) {
          console.error('[API Auth] Usage tracking error:', error);
        }
      });

      // Send response
      return originalSend.call(this, data);
    };

    next();
  };

  /**
   * Log API request (for failed auth attempts)
   */
  async logRequest(req, developerId, statusCode) {
    try {
      await this.db.query(`
        INSERT INTO api_request_log (
          developer_id, api_key, endpoint, method,
          status_code, ip_address, user_agent, origin
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        developerId,
        req.headers['x-api-key'],
        req.path,
        req.method,
        statusCode,
        req.ip || req.connection.remoteAddress,
        req.headers['user-agent'],
        req.headers.origin || req.headers.referer
      ]);
    } catch (error) {
      console.error('[API Auth] Log request error:', error);
    }
  }

  /**
   * Generate secure API key
   */
  static generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate secure API secret
   */
  static generateApiSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate webhook secret for HMAC
   */
  static generateWebhookSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify webhook signature
   */
  static verifyWebhookSignature(payload, signature, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const expectedSignature = 'sha256=' + hmac.digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

module.exports = APIAuthMiddleware;

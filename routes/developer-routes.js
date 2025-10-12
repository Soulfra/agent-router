/**
 * Developer Portal API Routes
 * Register developers, manage API keys, view usage stats
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const APIAuthMiddleware = require('../middleware/api-auth');

// Database connection (injected via initRoutes)
let db = null;
let apiAuth = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;
  apiAuth = new APIAuthMiddleware(db);
  return router;
}

/**
 * Middleware wrapper to check if apiAuth is initialized
 */
const requireAuth = async (req, res, next) => {
  if (!apiAuth) {
    return res.status(503).json({
      status: 'error',
      error: 'API authentication not initialized'
    });
  }
  return apiAuth.validateKey(req, res, next);
};

/**
 * POST /api/developers/register
 * Register new developer account
 */
router.post('/register', async (req, res) => {
  try {
    const { email, name, company, tier = 'free' } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: email, name'
      });
    }

    // Check if email already registered
    const existingResult = await db.query(`
      SELECT id FROM developers WHERE email = $1
    `, [email]);

    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        status: 'error',
        error: 'Email already registered'
      });
    }

    // Generate API credentials
    const apiKey = APIAuthMiddleware.generateApiKey();
    const apiSecret = APIAuthMiddleware.generateApiSecret();

    // Set tier limits
    const tierLimits = {
      free: { hourly: 100, daily: 1000, batch: 100, webhooks: 1 },
      pro: { hourly: 1000, daily: 50000, batch: 1000, webhooks: 5 },
      enterprise: { hourly: 10000, daily: 1000000, batch: 10000, webhooks: 20 }
    };

    const limits = tierLimits[tier] || tierLimits.free;

    // Insert developer
    const result = await db.query(`
      INSERT INTO developers (
        email, name, company, api_key, api_secret,
        tier, rate_limit_per_hour, rate_limit_per_day,
        batch_size_limit, webhook_limit
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, email, name, tier, api_key, created_at
    `, [
      email, name, company, apiKey, apiSecret,
      tier, limits.hourly, limits.daily, limits.batch, limits.webhooks
    ]);

    const developer = result.rows[0];

    res.status(201).json({
      status: 'ok',
      message: 'Developer account created successfully',
      developer: {
        id: developer.id,
        email: developer.email,
        name: developer.name,
        tier: developer.tier,
        created_at: developer.created_at
      },
      credentials: {
        api_key: apiKey,
        api_secret: apiSecret,
        warning: 'Store these credentials securely. The API secret will not be shown again.'
      },
      limits: {
        rate_limit_per_hour: limits.hourly,
        rate_limit_per_day: limits.daily,
        batch_size_limit: limits.batch,
        webhook_limit: limits.webhooks
      }
    });

  } catch (error) {
    console.error('[Developer] Registration error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/developers/me
 * Get current developer info (requires API key)
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id, email, name, company, tier,
        rate_limit_per_hour, rate_limit_per_day,
        batch_size_limit, webhook_limit,
        allowed_domains, status, email_verified,
        created_at, last_used_at
      FROM developers
      WHERE id = $1
    `, [req.developer.id]);

    const developer = result.rows[0];

    res.json({
      status: 'ok',
      developer
    });

  } catch (error) {
    console.error('[Developer] Get profile error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/developers/usage
 * Get API usage statistics
 */
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get usage by endpoint
    const endpointResult = await db.query(`
      SELECT
        endpoint,
        SUM(requests_count) as total_requests,
        SUM(success_count) as successful,
        SUM(error_count) as errors,
        AVG(avg_latency_ms) as avg_latency
      FROM api_usage
      WHERE developer_id = $1 AND hour_bucket >= $2
      GROUP BY endpoint
      ORDER BY total_requests DESC
    `, [req.developer.id, startDate]);

    // Get usage over time
    const timelineResult = await db.query(`
      SELECT
        DATE(hour_bucket) as date,
        SUM(requests_count) as requests,
        SUM(success_count) as successes,
        SUM(error_count) as errors
      FROM api_usage
      WHERE developer_id = $1 AND hour_bucket >= $2
      GROUP BY DATE(hour_bucket)
      ORDER BY date ASC
    `, [req.developer.id, startDate]);

    // Get current rate limit usage
    const now = new Date();
    const hourBucket = new Date(now);
    hourBucket.setMinutes(0, 0, 0);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const hourlyResult = await db.query(`
      SELECT COALESCE(SUM(requests_count), 0) as count
      FROM api_usage
      WHERE developer_id = $1 AND hour_bucket = $2
    `, [req.developer.id, hourBucket]);

    const dailyResult = await db.query(`
      SELECT COALESCE(SUM(requests_count), 0) as count
      FROM api_usage
      WHERE developer_id = $1 AND hour_bucket >= $2
    `, [req.developer.id, dayStart]);

    res.json({
      status: 'ok',
      usage: {
        by_endpoint: endpointResult.rows,
        timeline: timelineResult.rows,
        current_limits: {
          hourly: {
            used: parseInt(hourlyResult.rows[0].count),
            limit: req.developer.rate_limit_per_hour,
            remaining: req.developer.rate_limit_per_hour - parseInt(hourlyResult.rows[0].count)
          },
          daily: {
            used: parseInt(dailyResult.rows[0].count),
            limit: req.developer.rate_limit_per_day,
            remaining: req.developer.rate_limit_per_day - parseInt(dailyResult.rows[0].count)
          }
        }
      }
    });

  } catch (error) {
    console.error('[Developer] Usage stats error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/developers/logs
 * Get recent API request logs
 */
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const { limit = 100, status } = req.query;

    let query = `
      SELECT
        id, endpoint, method, status_code, latency_ms,
        ip_address, user_agent, origin, requested_at
      FROM api_request_log
      WHERE developer_id = $1
    `;

    const params = [req.developer.id];

    if (status) {
      query += ` AND status_code = $2`;
      params.push(parseInt(status));
    }

    query += ` ORDER BY requested_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({
      status: 'ok',
      logs: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('[Developer] Logs error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/developers/webhooks
 * Register new webhook
 */
router.post('/webhooks', requireAuth, async (req, res) => {
  try {
    const { url, events, description } = req.body;

    if (!url || !events || !Array.isArray(events)) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: url, events (array)'
      });
    }

    // Check webhook limit
    const countResult = await db.query(`
      SELECT COUNT(*) as count
      FROM webhooks
      WHERE developer_id = $1 AND active = true
    `, [req.developer.id]);

    if (parseInt(countResult.rows[0].count) >= req.developer.webhook_limit) {
      return res.status(429).json({
        status: 'error',
        error: `Webhook limit reached (${req.developer.webhook_limit} for ${req.developer.tier} tier)`
      });
    }

    // Generate webhook secret
    const secret = APIAuthMiddleware.generateWebhookSecret();

    // Insert webhook
    const result = await db.query(`
      INSERT INTO webhooks (
        developer_id, url, events, secret, description
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, url, events, active, created_at
    `, [req.developer.id, url, events, secret, description]);

    const webhook = result.rows[0];

    res.status(201).json({
      status: 'ok',
      message: 'Webhook registered successfully',
      webhook: {
        ...webhook,
        secret,
        note: 'Store the webhook secret securely for signature verification'
      }
    });

  } catch (error) {
    console.error('[Developer] Webhook registration error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * GET /api/developers/webhooks
 * List all webhooks
 */
router.get('/webhooks', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id, url, events, active, description,
        last_triggered_at, last_success_at, last_failure_at,
        failure_count, created_at
      FROM webhooks
      WHERE developer_id = $1
      ORDER BY created_at DESC
    `, [req.developer.id]);

    res.json({
      status: 'ok',
      webhooks: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('[Developer] List webhooks error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * DELETE /api/developers/webhooks/:id
 * Delete webhook
 */
router.delete('/webhooks/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      DELETE FROM webhooks
      WHERE id = $1 AND developer_id = $2
      RETURNING id
    `, [id, req.developer.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Webhook not found'
      });
    }

    res.json({
      status: 'ok',
      message: 'Webhook deleted successfully'
    });

  } catch (error) {
    console.error('[Developer] Delete webhook error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * PATCH /api/developers/settings
 * Update developer settings
 */
router.patch('/settings', requireAuth, async (req, res) => {
  try {
    const { allowed_domains, name, company } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (allowed_domains !== undefined) {
      updates.push(`allowed_domains = $${paramCount++}`);
      values.push(allowed_domains);
    }
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (company !== undefined) {
      updates.push(`company = $${paramCount++}`);
      values.push(company);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'No valid fields to update'
      });
    }

    values.push(req.developer.id);

    const query = `
      UPDATE developers
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, email, name, company, allowed_domains
    `;

    const result = await db.query(query, values);

    res.json({
      status: 'ok',
      message: 'Settings updated successfully',
      developer: result.rows[0]
    });

  } catch (error) {
    console.error('[Developer] Update settings error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * POST /api/developers/rotate-key
 * Rotate API key (invalidate old, generate new)
 */
router.post('/rotate-key', requireAuth, async (req, res) => {
  try {
    const newApiKey = APIAuthMiddleware.generateApiKey();

    await db.query(`
      UPDATE developers
      SET api_key = $1
      WHERE id = $2
    `, [newApiKey, req.developer.id]);

    res.json({
      status: 'ok',
      message: 'API key rotated successfully',
      new_api_key: newApiKey,
      warning: 'Update your applications with the new API key. The old key is now invalid.'
    });

  } catch (error) {
    console.error('[Developer] Key rotation error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

module.exports = { router, initRoutes };

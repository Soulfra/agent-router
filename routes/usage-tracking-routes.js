/**
 * Usage Tracking Routes
 *
 * Tracks API usage from GitHub Pages bridge
 *
 * Endpoints:
 * - POST /api/usage/track - Track usage event
 */

const express = require('express');
const router = express.Router();

/**
 * POST /api/usage/track
 * Track a usage event from the bridge
 *
 * Body:
 * {
 *   endpoint: string,
 *   model: string,
 *   tokens: number,
 *   keySource: 'byok' | 'system',
 *   timestamp: number
 * }
 */
router.post('/track', async (req, res) => {
  try {
    const { endpoint, model, tokens, keySource, timestamp } = req.body;
    const userId = req.headers['x-user-id'] || 'anonymous';
    const deviceFingerprint = req.headers['x-device-fingerprint'];
    const clientIp = req.headers['x-client-ip'] || req.ip;
    const origin = req.headers.origin || req.headers.referer || 'unknown';

    // Detect provider from model
    let provider = 'unknown';
    if (model.includes('gpt') || model.includes('openai')) {
      provider = 'openai';
    } else if (model.includes('claude') || model.includes('anthropic')) {
      provider = 'anthropic';
    } else if (model.includes('deepseek')) {
      provider = 'deepseek';
    } else if (model.includes('ollama') || model.includes('llama')) {
      provider = 'ollama';
    }

    // Calculate cost (simple estimation)
    const costPerToken = {
      openai: 0.00003, // $0.03 per 1K tokens
      anthropic: 0.00003,
      deepseek: 0.000002, // Much cheaper
      ollama: 0 // FREE
    };

    const costCents = keySource === 'system'
      ? Math.ceil(tokens * (costPerToken[provider] || 0.00003))
      : 0;

    // Insert into database
    const result = await req.db.query(
      `INSERT INTO usage_events (
        user_id,
        device_fingerprint,
        client_ip,
        origin,
        is_github_pages,
        endpoint,
        method,
        provider,
        model,
        key_source,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        cost_cents,
        status_code,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, to_timestamp($17 / 1000.0))
      RETURNING id`,
      [
        userId,
        deviceFingerprint,
        clientIp,
        origin,
        origin.includes('github.io'),
        endpoint,
        'POST',
        provider,
        model,
        keySource,
        0, // We don't have prompt/completion breakdown from bridge
        tokens,
        tokens,
        costCents,
        200,
        'success',
        timestamp
      ]
    );

    res.json({
      success: true,
      tracked: true,
      id: result.rows[0].id
    });

  } catch (error) {
    console.error('[UsageTracking] Track error:', error);
    res.status(500).json({
      error: 'Failed to track usage',
      message: error.message
    });
  }
});

/**
 * GET /api/usage/stats
 * Get usage stats for current user
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'anonymous';

    // Get current month stats
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await req.db.query(
      `SELECT
        COUNT(*) as calls,
        SUM(total_tokens) as tokens,
        SUM(CASE WHEN key_source = 'byok' THEN 1 ELSE 0 END) as byok_calls,
        SUM(CASE WHEN key_source = 'system' THEN 1 ELSE 0 END) as system_calls,
        SUM(cost_cents) as cost_cents
      FROM usage_events
      WHERE user_id = $1
        AND status = 'success'
        AND created_at >= $2`,
      [userId, periodStart]
    );

    const stats = result.rows[0];

    res.json({
      success: true,
      calls: parseInt(stats.calls) || 0,
      tokens: parseInt(stats.tokens) || 0,
      byokCalls: parseInt(stats.byok_calls) || 0,
      systemCalls: parseInt(stats.system_calls) || 0,
      costCents: parseInt(stats.cost_cents) || 0
    });

  } catch (error) {
    console.error('[UsageTracking] Stats error:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

module.exports = router;

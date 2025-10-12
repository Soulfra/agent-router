/**
 * Webhook Routes
 *
 * Receives webhook events from GitHub, GitLab, etc.
 * Automatically triggers code indexing, model training, and content generation.
 *
 * This makes GitHub your "source of truth" - push code and everything updates automatically.
 */

const express = require('express');
const crypto = require('crypto');
const CodeIndexer = require('../lib/code-indexer');
const RoomManager = require('../lib/room-manager');

function createWebhookRoutes(db) {
  const router = express.Router();
  const indexer = new CodeIndexer(db);
  const roomManager = new RoomManager(db);

  /**
   * GitHub Webhook Endpoint
   * POST /api/webhook/github
   *
   * Events: push, pull_request, issues, etc.
   */
  router.post('/github', async (req, res) => {
    console.log('\n[Webhook] GitHub event received');

    try {
      // Verify webhook signature
      const signature = req.headers['x-hub-signature-256'];
      const event = req.headers['x-github-event'];

      if (!signature) {
        return res.status(401).json({ error: 'No signature' });
      }

      // Get webhook secret from database
      const secretResult = await db.query(
        `SELECT secret_token FROM webhook_endpoints
         WHERE source = 'github' AND is_active = true
         LIMIT 1`
      );

      if (secretResult.rows.length === 0) {
        console.log('[Webhook] No webhook configuration found');
        return res.status(404).json({ error: 'Webhook not configured' });
      }

      const secret = secretResult.rows[0].secret_token;

      // Verify signature
      if (secret && !verifyGitHubSignature(req.body, signature, secret)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Log event to database
      const endpointResult = await db.query(
        `SELECT id FROM webhook_endpoints WHERE source = 'github' AND is_active = true LIMIT 1`
      );

      const endpointId = endpointResult.rows[0]?.id;

      const eventResult = await db.query(
        `INSERT INTO webhook_events (endpoint_id, event_type, payload, headers, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id`,
        [
          endpointId,
          event,
          JSON.stringify(req.body),
          JSON.stringify(req.headers),
        ]
      );

      const eventId = eventResult.rows[0].id;

      // Handle event asynchronously
      handleGitHubEvent(event, req.body, eventId, db, indexer, roomManager).catch(error => {
        console.error('[Webhook] Error handling event:', error);
      });

      // Respond immediately
      res.status(200).json({ received: true, event_id: eventId });

    } catch (error) {
      console.error('[Webhook] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GitLab Webhook Endpoint
   * POST /api/webhook/gitlab
   */
  router.post('/gitlab', async (req, res) => {
    console.log('\n[Webhook] GitLab event received');

    try {
      const event = req.headers['x-gitlab-event'];
      const token = req.headers['x-gitlab-token'];

      // Verify token
      const secretResult = await db.query(
        `SELECT secret_token FROM webhook_endpoints
         WHERE source = 'gitlab' AND is_active = true
         LIMIT 1`
      );

      if (secretResult.rows.length === 0) {
        return res.status(404).json({ error: 'Webhook not configured' });
      }

      const secret = secretResult.rows[0].secret_token;

      if (secret && token !== secret) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Log and handle event
      res.status(200).json({ received: true });

      // TODO: Handle GitLab events similarly to GitHub

    } catch (error) {
      console.error('[Webhook] GitLab error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * List webhook configurations
   * GET /api/webhook/config
   */
  router.get('/config', async (req, res) => {
    try {
      const result = await db.query(`
        SELECT * FROM webhook_summary ORDER BY endpoint_name
      `);

      res.json({ webhooks: result.rows });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Create/update webhook configuration
   * POST /api/webhook/config
   */
  router.post('/config', async (req, res) => {
    try {
      const {
        endpointName,
        source,
        events,
        autoIndex,
        autoTrain,
        autoPublish,
        secretToken
      } = req.body;

      const endpointUrl = `/api/webhook/${source}`;

      const result = await db.query(
        `INSERT INTO webhook_endpoints (
          endpoint_name, endpoint_url, source, events, secret_token,
          auto_index, auto_train, auto_publish
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (endpoint_name) DO UPDATE
        SET events = EXCLUDED.events,
            secret_token = EXCLUDED.secret_token,
            auto_index = EXCLUDED.auto_index,
            auto_train = EXCLUDED.auto_train,
            auto_publish = EXCLUDED.auto_publish,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          endpointName,
          endpointUrl,
          source,
          events,
          secretToken,
          autoIndex !== false,
          autoTrain !== false,
          autoPublish !== false
        ]
      );

      res.json({ webhook: result.rows[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get webhook event history
   * GET /api/webhook/events
   */
  router.get('/events', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const status = req.query.status;

      let sql = `
        SELECT e.*, w.endpoint_name, w.source
        FROM webhook_events e
        JOIN webhook_endpoints w ON w.id = e.endpoint_id
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      if (status) {
        sql += ` AND e.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      sql += ` ORDER BY e.received_at DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await db.query(sql, params);

      res.json({ events: result.rows });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ============================================================================
// GitHub Event Handlers
// ============================================================================

async function handleGitHubEvent(event, payload, eventId, db, indexer, roomManager) {
  console.log(`[Webhook] Processing ${event} event...`);

  const actionsPerformed = [];

  try {
    // Update event status
    await db.query(
      'UPDATE webhook_events SET status = $1 WHERE id = $2',
      ['processing', eventId]
    );

    switch (event) {
      case 'push':
        await handlePushEvent(payload, db, indexer, roomManager, actionsPerformed);
        break;

      case 'pull_request':
        await handlePullRequestEvent(payload, db, actionsPerformed);
        break;

      case 'repository':
        await handleRepositoryEvent(payload, db, indexer, roomManager, actionsPerformed);
        break;

      case 'ping':
        console.log('[Webhook] Ping received - webhook configured successfully');
        actionsPerformed.push('ping_received');
        break;

      default:
        console.log(`[Webhook] Unhandled event: ${event}`);
    }

    // Mark as success
    await db.query(
      `UPDATE webhook_events
       SET status = 'success', processed_at = CURRENT_TIMESTAMP, actions_performed = $1
       WHERE id = $2`,
      [actionsPerformed, eventId]
    );

    console.log(`[Webhook] Event processed successfully: ${actionsPerformed.join(', ')}`);

  } catch (error) {
    console.error('[Webhook] Error processing event:', error.message);

    await db.query(
      `UPDATE webhook_events
       SET status = 'failed', processed_at = CURRENT_TIMESTAMP, error_message = $1
       WHERE id = $2`,
      [error.message, eventId]
    );
  }
}

/**
 * Handle push event - automatically index new/modified code
 */
async function handlePushEvent(payload, db, indexer, roomManager, actionsPerformed) {
  const repo = payload.repository;
  const repoFullName = repo.full_name;
  const ref = payload.ref;

  console.log(`[Webhook] Push to ${repoFullName} (${ref})`);

  // Check if auto-indexing is enabled
  const webhookConfig = await db.query(
    `SELECT auto_index, auto_train FROM webhook_endpoints
     WHERE source = 'github' AND is_active = true LIMIT 1`
  );

  if (webhookConfig.rows.length === 0 || !webhookConfig.rows[0].auto_index) {
    console.log('[Webhook] Auto-indexing disabled, skipping');
    return;
  }

  // Find or create repository record
  let repoResult = await db.query(
    'SELECT id FROM code_repositories WHERE repo_url = $1',
    [repo.html_url]
  );

  let repoId;

  if (repoResult.rows.length === 0) {
    // New repository - index it
    console.log('[Webhook] New repository, indexing...');

    const result = await indexer.indexGitHubRepo(repoFullName);
    repoId = result.repo.id;

    actionsPerformed.push('indexed_new_repo');

    // Auto-assign to rooms
    const rooms = await roomManager.autoAssignRepo(repoId);
    actionsPerformed.push(`assigned_to_${rooms.length}_rooms`);

  } else {
    // Existing repository - re-index
    repoId = repoResult.rows[0].id;

    console.log('[Webhook] Re-indexing existing repository...');

    const repoRecord = await db.query(
      'SELECT local_path FROM code_repositories WHERE id = $1',
      [repoId]
    );

    const localPath = repoRecord.rows[0].local_path;

    // Pull latest changes and re-scan
    const result = await indexer.indexGitHubRepo(repoFullName, localPath);

    actionsPerformed.push('reindexed_repo');
  }

  // Trigger model re-training if enabled
  if (webhookConfig.rows[0].auto_train) {
    await triggerModelTraining(repoId, db);
    actionsPerformed.push('queued_training');
  }
}

/**
 * Handle pull request event
 */
async function handlePullRequestEvent(payload, db, actionsPerformed) {
  const action = payload.action;
  const pr = payload.pull_request;

  console.log(`[Webhook] PR ${action}: ${pr.html_url}`);

  // Could trigger code review, tests, etc.
  actionsPerformed.push(`pr_${action}`);
}

/**
 * Handle repository event (created, deleted, etc.)
 */
async function handleRepositoryEvent(payload, db, indexer, roomManager, actionsPerformed) {
  const action = payload.action;
  const repo = payload.repository;

  console.log(`[Webhook] Repository ${action}: ${repo.full_name}`);

  if (action === 'created') {
    // New repo created - automatically index it
    const result = await indexer.indexGitHubRepo(repo.full_name);
    const rooms = await roomManager.autoAssignRepo(result.repo.id);

    actionsPerformed.push('indexed_new_repo');
    actionsPerformed.push(`assigned_to_${rooms.length}_rooms`);
  }
}

/**
 * Trigger model training for updated code
 */
async function triggerModelTraining(repoId, db) {
  // Get all rooms containing this repo
  const rooms = await db.query(
    `SELECT DISTINCT r.id, r.ollama_model_name
     FROM code_rooms r
     JOIN code_room_repositories rr ON rr.room_id = r.id
     WHERE rr.repo_id = $1`,
    [repoId]
  );

  for (const room of rooms.rows) {
    // Queue training job
    await db.query(
      `INSERT INTO ollama_training_jobs (
        room_id, model_name, base_model, status, triggered_by
      )
      VALUES ($1, $2, 'llama3.2:3b', 'pending', 'webhook')`,
      [room.id, room.ollama_model_name]
    );

    console.log(`[Webhook] Queued training for ${room.ollama_model_name}`);
  }
}

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

module.exports = createWebhookRoutes;

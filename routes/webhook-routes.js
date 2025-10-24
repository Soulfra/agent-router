/**
 * Webhook Routes
 *
 * Receives webhook events from external services:
 * - GitHub/GitLab: Code indexing, model training
 * - Stripe: Payment events, subscription updates
 * - Firebase: Authentication events, database changes
 * - PayPal: Payment notifications
 * - Twilio: SMS/call events (handled in twilio-routes.js)
 *
 * This implements the webhook pattern: External Service → POST → Your Server
 */

const express = require('express');
const crypto = require('crypto');
const CodeIndexer = require('../lib/code-indexer');
const RoomManager = require('../lib/room-manager');
const EmailSender = require('../lib/email-sender');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

function createWebhookRoutes(db) {
  const router = express.Router();
  const indexer = new CodeIndexer(db);
  const roomManager = new RoomManager(db);
  const emailSender = new EmailSender();

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
   * Stripe Webhook Endpoint
   * POST /api/webhook/stripe
   *
   * Configure in Stripe Dashboard:
   * Developers → Webhooks → Add endpoint
   * URL: https://your-domain.com/api/webhook/stripe
   */
  router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Webhook:Stripe] STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('[Webhook:Stripe] Signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    console.log(`[Webhook:Stripe] Received event: ${event.type}`);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleStripeCheckoutCompleted(event.data.object, db, emailSender);
          break;
        case 'invoice.paid':
          await handleStripeInvoicePaid(event.data.object, db, emailSender);
          break;
        case 'invoice.payment_failed':
          await handleStripeInvoicePaymentFailed(event.data.object, db, emailSender);
          break;
        case 'customer.subscription.deleted':
          await handleStripeSubscriptionDeleted(event.data.object, db, emailSender);
          break;
        default:
          console.log(`[Webhook:Stripe] Unhandled event: ${event.type}`);
      }

      res.json({ received: true, event_type: event.type });
    } catch (error) {
      console.error('[Webhook:Stripe] Error processing event:', error);
      res.json({ received: true, error: error.message });
    }
  });

  /**
   * Firebase Webhook Endpoint
   * POST /api/webhook/firebase
   */
  router.post('/firebase', express.json(), async (req, res) => {
    const signature = req.headers['x-firebase-signature'];
    const secret = process.env.FIREBASE_WEBHOOK_SECRET;

    if (secret) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('[Webhook:Firebase] Invalid signature');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }

    const { event, data } = req.body;
    console.log(`[Webhook:Firebase] Received event: ${event}`);

    try {
      switch (event) {
        case 'user.created':
          await handleFirebaseUserCreated(data, db);
          break;
        case 'user.deleted':
          await handleFirebaseUserDeleted(data, db);
          break;
        default:
          console.log(`[Webhook:Firebase] Unhandled event: ${event}`);
      }

      res.json({ received: true, event });
    } catch (error) {
      console.error('[Webhook:Firebase] Error processing event:', error);
      res.json({ received: true, error: error.message });
    }
  });

  /**
   * PayPal Webhook Endpoint
   * POST /api/webhook/paypal
   */
  router.post('/paypal', express.json(), async (req, res) => {
    const event = req.body;
    console.log(`[Webhook:PayPal] Received event: ${event.event_type}`);

    try {
      switch (event.event_type) {
        case 'PAYMENT.SALE.COMPLETED':
          await handlePayPalPaymentCompleted(event.resource, db);
          break;
        case 'BILLING.SUBSCRIPTION.CANCELLED':
          await handlePayPalSubscriptionCancelled(event.resource, db);
          break;
        default:
          console.log(`[Webhook:PayPal] Unhandled event: ${event.event_type}`);
      }

      res.json({ received: true, event_type: event.event_type });
    } catch (error) {
      console.error('[Webhook:PayPal] Error processing event:', error);
      res.json({ received: true, error: error.message });
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

// ============================================================================
// STRIPE EVENT HANDLERS
// ============================================================================

async function handleStripeCheckoutCompleted(session, db, emailSender) {
  const crypto = require('crypto');
  let tenantId = session.metadata?.tenant_id;
  const customerEmail = session.customer_email || session.customer_details?.email;
  const stripeCustomerId = session.customer;
  const stripeSubscriptionId = session.subscription;

  if (!customerEmail) {
    console.warn('[Webhook:Stripe] Checkout completed but no customer email');
    return;
  }

  console.log(`[Webhook:Stripe] Checkout completed for ${customerEmail}: $${session.amount_total / 100}`);

  // Check if user already exists
  const existingUser = await db.query(
    `SELECT u.user_id, u.tenant_id FROM users u WHERE u.email = $1`,
    [customerEmail]
  );

  if (existingUser.rows.length === 0) {
    // NEW USER - Create tenant + user
    console.log(`[Webhook:Stripe] Creating new account for ${customerEmail}`);

    const tenantName = customerEmail.split('@')[0];
    const newTenant = await db.query(
      `INSERT INTO tenants (tenant_name, status, created_at)
       VALUES ($1, 'active', NOW()) RETURNING tenant_id`,
      [tenantName]
    );

    tenantId = newTenant.rows[0].tenant_id;

    // Create user
    const loginToken = crypto.randomBytes(32).toString('hex');
    await db.query(
      `INSERT INTO users (email, tenant_id, login_token, login_token_expires, created_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW())`,
      [customerEmail, tenantId, loginToken]
    );

    // Create license with pro tier
    const proTier = await db.query(`SELECT tier_id FROM platform_tiers WHERE tier_code = 'pro'`);

    await db.query(
      `INSERT INTO tenant_licenses (tenant_id, tier_id, stripe_subscription_id, status, created_at)
       VALUES ($1, $2, $3, 'active', NOW())`,
      [tenantId, proTier.rows[0].tier_id, stripeSubscriptionId]
    );

    console.log(`[Webhook:Stripe] ✓ Created tenant ${tenantId} and user for ${customerEmail}`);

  } else {
    // EXISTING USER - Upgrade tier
    tenantId = existingUser.rows[0].tenant_id;
    console.log(`[Webhook:Stripe] Upgrading existing tenant ${tenantId}`);

    const proTier = await db.query(`SELECT tier_id FROM platform_tiers WHERE tier_code = 'pro'`);

    await db.query(
      `UPDATE tenant_licenses
       SET tier_id = $1, stripe_subscription_id = $2, status = 'active', updated_at = NOW()
       WHERE tenant_id = $3`,
      [proTier.rows[0].tier_id, stripeSubscriptionId, tenantId]
    );

    // Generate fresh login token
    const loginToken = crypto.randomBytes(32).toString('hex');
    await db.query(
      `UPDATE users
       SET login_token = $1, login_token_expires = NOW() + INTERVAL '7 days'
       WHERE email = $2`,
      [loginToken, customerEmail]
    );
  }

  // Get tier details for email
  const tierResult = await db.query(
    `SELECT pt.tier_name, pt.tier_code, pt.monthly_price_cents
     FROM tenant_licenses tl
     JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
     WHERE tl.tenant_id = $1`,
    [tenantId]
  );

  if (tierResult.rows.length === 0) {
    console.warn('[Webhook:Stripe] Could not find tier after creation');
    return;
  }

  const tier = tierResult.rows[0];

  // Send subscription confirmation email
  if (customerEmail && emailSender) {
    const nextBillingDate = new Date();
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    await emailSender.sendSubscriptionConfirmation(customerEmail, {
      plan: tier.tier_name,
      price: tier.monthly_price_cents / 100,
      billingPeriod: 'month',
      nextBillingDate: nextBillingDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    });

    console.log(`[Webhook:Stripe] Sent subscription confirmation to ${customerEmail}`);
  }
}

async function handleStripeInvoicePaid(invoice, db, emailSender) {
  const tenantId = invoice.metadata?.tenant_id;

  if (!tenantId) {
    console.warn('[Webhook:Stripe] Invoice paid but no tenant_id in metadata');
    return;
  }

  console.log(`[Webhook:Stripe] Invoice paid for tenant ${tenantId}: $${invoice.amount_paid / 100}`);

  // Update subscription status to active
  await db.query(
    `UPDATE tenant_licenses
     SET status = 'active', updated_at = NOW()
     WHERE tenant_id = $1 AND stripe_subscription_id = $2`,
    [tenantId, invoice.subscription]
  );

  // Get user email and tier info
  const userResult = await db.query(
    `SELECT u.email, pt.tier_name
     FROM users u
     JOIN tenant_licenses tl ON tl.tenant_id = u.tenant_id
     JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
     WHERE u.tenant_id = $1
     LIMIT 1`,
    [tenantId]
  );

  // Add credits if configured
  const tier = await db.query(
    `SELECT pt.credits_included
     FROM tenant_licenses tl
     JOIN platform_tiers pt ON pt.tier_id = tl.tier_id
     WHERE tl.tenant_id = $1`,
    [tenantId]
  );

  if (tier.rows.length > 0 && tier.rows[0].credits_included > 0) {
    await db.query(
      `INSERT INTO user_credits (user_id, credits_remaining, credits_purchased, purchase_date)
       SELECT u.user_id, $2, $2, NOW()
       FROM users u
       WHERE u.tenant_id = $1
       ON CONFLICT (user_id) DO UPDATE
       SET credits_remaining = user_credits.credits_remaining + $2`,
      [tenantId, tier.rows[0].credits_included]
    );
  }

  // Send payment confirmation email
  if (userResult.rows.length > 0 && emailSender) {
    const user = userResult.rows[0];

    await emailSender.sendPaymentConfirmation(user.email, {
      amount: invoice.amount_paid,
      currency: invoice.currency.toUpperCase(),
      plan: user.tier_name,
      invoiceUrl: invoice.invoice_pdf
    });

    console.log(`[Webhook:Stripe] Sent payment confirmation to ${user.email}`);
  }
}

async function handleStripeInvoicePaymentFailed(invoice, db, emailSender) {
  const tenantId = invoice.metadata?.tenant_id;

  if (!tenantId) {
    return;
  }

  console.error(`[Webhook:Stripe] Payment failed for tenant ${tenantId}`);

  // Mark subscription as past_due
  await db.query(
    `UPDATE tenant_licenses
     SET status = 'past_due', updated_at = NOW()
     WHERE tenant_id = $1 AND stripe_subscription_id = $2`,
    [tenantId, invoice.subscription]
  );

  // Get user email
  const userResult = await db.query(
    `SELECT u.email FROM users u WHERE u.tenant_id = $1 LIMIT 1`,
    [tenantId]
  );

  // Send payment failed notification
  if (userResult.rows.length > 0 && emailSender) {
    const user = userResult.rows[0];

    await emailSender.sendPaymentFailed(user.email, {
      reason: invoice.last_payment_error?.message || 'Card declined',
      retryUrl: `https://calos.app/billing/update-payment?tenant_id=${tenantId}`
    });

    console.log(`[Webhook:Stripe] Sent payment failed notification to ${user.email}`);
  }
}

async function handleStripeSubscriptionDeleted(subscription, db, emailSender) {
  const tenantId = subscription.metadata?.tenant_id;

  if (!tenantId) {
    return;
  }

  console.log(`[Webhook:Stripe] Subscription cancelled for tenant ${tenantId}`);

  // Downgrade to free tier
  const freeTier = await db.query(
    `SELECT tier_id FROM platform_tiers WHERE tier_code = 'free'`
  );

  await db.query(
    `UPDATE tenant_licenses
     SET tier_id = $2, status = 'cancelled', updated_at = NOW()
     WHERE tenant_id = $1`,
    [tenantId, freeTier.rows[0].tier_id]
  );

  // Get user email
  const userResult = await db.query(
    `SELECT u.email FROM users u WHERE u.tenant_id = $1 LIMIT 1`,
    [tenantId]
  );

  // Send cancellation notification (could add a new email template for this)
  if (userResult.rows.length > 0 && emailSender) {
    // For now, we can log this - you could create a sendSubscriptionCancelled method later
    console.log(`[Webhook:Stripe] Subscription cancelled for ${userResult.rows[0].email}`);
  }
}

// ============================================================================
// FIREBASE EVENT HANDLERS
// ============================================================================

async function handleFirebaseUserCreated(data, db) {
  const { uid, email, displayName } = data;

  console.log(`[Webhook:Firebase] User created: ${email}`);

  // Check if user already exists
  const existing = await db.query(
    `SELECT user_id FROM users WHERE email = $1`,
    [email]
  );

  if (existing.rows.length === 0) {
    // Create tenant and user
    const tenant = await db.query(
      `INSERT INTO tenants (tenant_name, status) VALUES ($1, 'active') RETURNING tenant_id`,
      [displayName || email.split('@')[0]]
    );

    await db.query(
      `INSERT INTO users (email, firebase_uid, tenant_id)
       VALUES ($1, $2, $3)`,
      [email, uid, tenant.rows[0].tenant_id]
    );

    console.log(`[Webhook:Firebase] Created CALOS account for ${email}`);
  }
}

async function handleFirebaseUserDeleted(data, db) {
  const { uid } = data;

  console.log(`[Webhook:Firebase] User deleted: ${uid}`);

  // Mark user as deleted
  await db.query(
    `UPDATE users SET status = 'deleted', updated_at = NOW()
     WHERE firebase_uid = $1`,
    [uid]
  );
}

// ============================================================================
// PAYPAL EVENT HANDLERS
// ============================================================================

async function handlePayPalPaymentCompleted(payment, db) {
  console.log(`[Webhook:PayPal] Payment completed: ${payment.id}`);

  const tenantId = payment.custom_id; // Pass tenant_id in custom_id field

  if (tenantId) {
    // Add credits based on payment amount
    const amount = parseFloat(payment.amount.total);
    const credits = Math.floor(amount * 100); // $1 = 100 credits

    await db.query(
      `INSERT INTO user_credits (user_id, credits_remaining, credits_purchased, purchase_date)
       SELECT u.user_id, $2, $2, NOW()
       FROM users u
       WHERE u.tenant_id = $1
       ON CONFLICT (user_id) DO UPDATE
       SET credits_remaining = user_credits.credits_remaining + $2`,
      [tenantId, credits]
    );

    console.log(`[Webhook:PayPal] Added ${credits} credits to tenant ${tenantId}`);
  }
}

async function handlePayPalSubscriptionCancelled(subscription, db) {
  console.log(`[Webhook:PayPal] Subscription cancelled: ${subscription.id}`);
  // Similar to Stripe subscription cancellation
}

module.exports = createWebhookRoutes;

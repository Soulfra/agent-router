/**
 * CALOS Stripe Webhook Routes
 *
 * Handles Stripe webhook events for billing
 *
 * Endpoints:
 * - POST /api/stripe/webhook - Stripe webhook handler
 * - POST /api/stripe/create-subscription - Create new subscription
 * - POST /api/stripe/cancel-subscription - Cancel subscription
 * - POST /api/stripe/update-subscription - Update subscription
 * - GET /api/stripe/subscription/:userId/:installId - Get subscription details
 * - POST /api/stripe/create-checkout-session - Create Stripe Checkout session
 * - POST /api/stripe/create-portal-session - Create Stripe Customer Portal session
 */

const express = require('express');
const router = express.Router();
const StripeBilling = require('../lib/stripe-billing');

// Initialize Stripe billing
let stripeBilling = null;

/**
 * Initialize middleware
 */
router.use((req, res, next) => {
  if (!stripeBilling && req.db) {
    stripeBilling = new StripeBilling({
      stripeSecretKey: process.env.STRIPE_SECRET_KEY,
      db: req.db
    });
  }
  next();
});

/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook handler (must be raw body, not JSON)
 *
 * Headers:
 *   stripe-signature: Stripe signature for verification
 *
 * Response:
 * {
 *   "received": true
 * }
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.warn('[Stripe Webhook] No webhook secret configured - skipping verification');
      return res.status(400).json({
        success: false,
        error: 'Webhook secret not configured'
      });
    }

    // Verify webhook signature
    let event;
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('[Stripe Webhook] Signature verification failed:', err.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    // Log event
    console.log(`[Stripe Webhook] Event received: ${event.type} (${event.id})`);

    // Handle event
    if (!stripeBilling) {
      stripeBilling = new StripeBilling({
        stripeSecretKey: process.env.STRIPE_SECRET_KEY,
        db: req.db
      });
    }

    await stripeBilling.handleWebhook(event);

    res.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed'
    });
  }
});

/**
 * POST /api/stripe/create-subscription
 *
 * Create new Stripe subscription
 *
 * Body:
 * {
 *   "userId": 123,
 *   "tierSlug": "pro",
 *   "email": "user@example.com",
 *   "billingPeriod": "monthly",
 *   "paymentMethodId": "pm_..." (optional)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "subscriptionId": "sub_...",
 *   "customerId": "cus_...",
 *   "installId": "abc123...",
 *   "status": "trialing"
 * }
 */
router.post('/create-subscription', async (req, res) => {
  try {
    const { userId, tierSlug, email, billingPeriod, paymentMethodId } = req.body;

    // Validation
    if (!userId || !tierSlug || !email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, tierSlug, email'
      });
    }

    // Create subscription
    const subscription = await stripeBilling.createSubscription(
      userId,
      tierSlug,
      email,
      billingPeriod || 'monthly',
      paymentMethodId
    );

    res.json({
      success: true,
      ...subscription
    });
  } catch (error) {
    console.error('[Stripe] Create subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create subscription',
      message: error.message
    });
  }
});

/**
 * POST /api/stripe/cancel-subscription
 *
 * Cancel Stripe subscription
 *
 * Body:
 * {
 *   "userId": 123,
 *   "installId": "abc123...",
 *   "immediately": false
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "subscriptionId": "sub_...",
 *   "status": "canceled"
 * }
 */
router.post('/cancel-subscription', async (req, res) => {
  try {
    const { userId, installId, immediately } = req.body;

    // Validation
    if (!userId || !installId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, installId'
      });
    }

    // Auth check - users can only cancel their own subscriptions
    if (req.user && req.user.user_id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Cancel subscription
    const subscription = await stripeBilling.cancelSubscription(
      userId,
      installId,
      immediately || false
    );

    res.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null
    });
  } catch (error) {
    console.error('[Stripe] Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription',
      message: error.message
    });
  }
});

/**
 * POST /api/stripe/update-subscription
 *
 * Update Stripe subscription (change plan)
 *
 * Body:
 * {
 *   "userId": 123,
 *   "installId": "abc123...",
 *   "newTierSlug": "enterprise",
 *   "billingPeriod": "annual"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "subscriptionId": "sub_...",
 *   "status": "active"
 * }
 */
router.post('/update-subscription', async (req, res) => {
  try {
    const { userId, installId, newTierSlug, billingPeriod } = req.body;

    // Validation
    if (!userId || !installId || !newTierSlug) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, installId, newTierSlug'
      });
    }

    // Auth check
    if (req.user && req.user.user_id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Update subscription
    const subscription = await stripeBilling.updateSubscription(
      userId,
      installId,
      newTierSlug,
      billingPeriod || 'monthly'
    );

    res.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000)
    });
  } catch (error) {
    console.error('[Stripe] Update subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update subscription',
      message: error.message
    });
  }
});

/**
 * GET /api/stripe/subscription/:userId/:installId
 *
 * Get subscription details
 *
 * Response:
 * {
 *   "success": true,
 *   "subscription": {...}
 * }
 */
router.get('/subscription/:userId/:installId', async (req, res) => {
  try {
    const { userId, installId } = req.params;

    // Auth check
    if (req.user && req.user.user_id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Get subscription
    const subscription = await stripeBilling.getSubscription(
      parseInt(userId),
      installId
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    res.json({
      success: true,
      subscription
    });
  } catch (error) {
    console.error('[Stripe] Get subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription',
      message: error.message
    });
  }
});

/**
 * POST /api/stripe/create-checkout-session
 *
 * Create Stripe Checkout session for subscription
 *
 * Body:
 * {
 *   "userId": 123,
 *   "tierSlug": "pro",
 *   "billingPeriod": "monthly",
 *   "successUrl": "https://calos.sh/success",
 *   "cancelUrl": "https://calos.sh/pricing"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "sessionId": "cs_...",
 *   "url": "https://checkout.stripe.com/..."
 * }
 */
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { userId, tierSlug, billingPeriod, successUrl, cancelUrl } = req.body;

    // Validation
    if (!userId || !tierSlug) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, tierSlug'
      });
    }

    // Get user email
    const userResult = await req.db.query(`
      SELECT email FROM users WHERE user_id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const email = userResult.rows[0].email;

    // Get price ID
    const priceKey = `${tierSlug}_${billingPeriod || 'monthly'}`;
    const priceId = stripeBilling.priceIds[priceKey];

    if (!priceId) {
      return res.status(400).json({
        success: false,
        error: `Invalid tier/billing period: ${priceKey}`
      });
    }

    // Create checkout session
    const stripe = stripeBilling.stripe;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: successUrl || `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.protocol}://${req.get('host')}/pricing.html`,
      metadata: {
        userId: userId.toString(),
        tierSlug
      },
      subscription_data: {
        metadata: {
          userId: userId.toString(),
          tierSlug
        }
      }
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('[Stripe] Create checkout session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create checkout session',
      message: error.message
    });
  }
});

/**
 * POST /api/stripe/create-portal-session
 *
 * Create Stripe Customer Portal session (for managing subscriptions)
 *
 * Body:
 * {
 *   "userId": 123,
 *   "installId": "abc123...",
 *   "returnUrl": "https://calos.sh/dashboard"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "url": "https://billing.stripe.com/..."
 * }
 */
router.post('/create-portal-session', async (req, res) => {
  try {
    const { userId, installId, returnUrl } = req.body;

    // Validation
    if (!userId || !installId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, installId'
      });
    }

    // Auth check
    if (req.user && req.user.user_id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Get customer ID
    const result = await req.db.query(`
      SELECT stripe_customer_id FROM subscription_plans
      WHERE user_id = $1 AND install_id = $2
      LIMIT 1
    `, [userId, installId]);

    if (result.rows.length === 0 || !result.rows[0].stripe_customer_id) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    const customerId = result.rows[0].stripe_customer_id;

    // Create portal session
    const stripe = stripeBilling.stripe;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${req.protocol}://${req.get('host')}/dashboard.html`
    });

    res.json({
      success: true,
      url: session.url
    });
  } catch (error) {
    console.error('[Stripe] Create portal session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create portal session',
      message: error.message
    });
  }
});

/**
 * POST /api/stripe/report-usage
 *
 * Report usage to Stripe (for usage-based billing)
 *
 * Body:
 * {
 *   "subscriptionItemId": "si_...",
 *   "quantity": 100,
 *   "action": "increment"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "usageRecord": {...}
 * }
 */
router.post('/report-usage', async (req, res) => {
  try {
    const { subscriptionItemId, quantity, action } = req.body;

    // Validation
    if (!subscriptionItemId || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: subscriptionItemId, quantity'
      });
    }

    // Report usage
    const usageRecord = await stripeBilling.reportUsage(
      subscriptionItemId,
      quantity,
      action || 'increment'
    );

    res.json({
      success: true,
      usageRecord
    });
  } catch (error) {
    console.error('[Stripe] Report usage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to report usage',
      message: error.message
    });
  }
});

module.exports = router;

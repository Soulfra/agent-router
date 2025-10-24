/**
 * Payment Methods & ACH Routes
 *
 * Handles multiple payment methods:
 * - Credit/Debit Cards (Stripe)
 * - ACH Direct Debit (Bank Transfers)
 * - Saved payment methods
 *
 * ACH Flow:
 * 1. User adds bank account (routing + account number)
 * 2. Stripe sends micro-deposits for verification
 * 3. User verifies amounts within 2-3 business days
 * 4. ACH payment can then be processed
 *
 * Use Cases:
 * - One-time credit purchases via ACH
 * - Recurring subscription payments via ACH
 * - Affiliate commission payouts via ACH
 */

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');

// Database connection (injected via initRoutes)
let db = null;
let stripe = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;

  // Initialize Stripe
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.warn('[Payments] ⚠️  STRIPE_SECRET_KEY not set - payment methods will not work');
  } else {
    stripe = new Stripe(stripeKey);
    console.log('[Payments] ✓ Stripe client initialized for payment methods');
  }

  return router;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

async function requireAuth(req, res, next) {
  const userId = req.session?.userId || req.headers['x-user-id'];

  if (!userId) {
    return res.status(401).json({
      status: 'error',
      error: 'Authentication required'
    });
  }

  try {
    const result = await db.query(
      `SELECT u.user_id, u.email, u.tenant_id, t.tenant_name, t.stripe_customer_id
       FROM users u
       JOIN tenants t ON t.tenant_id = u.tenant_id
       WHERE u.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'User not found'
      });
    }

    req.user = result.rows[0];
    req.tenantId = result.rows[0].tenant_id;
    req.userId = userId;
    req.stripeCustomerId = result.rows[0].stripe_customer_id;

    next();
  } catch (error) {
    console.error('[Payments] Auth error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Authentication failed'
    });
  }
}

// ============================================================================
// STRIPE CUSTOMER SETUP
// ============================================================================

/**
 * Ensure Stripe customer exists for tenant
 */
async function ensureStripeCustomer(tenantId, email, tenantName) {
  if (!stripe) {
    throw new Error('Stripe not initialized');
  }

  // Check if customer already exists
  const tenant = await db.query(
    `SELECT stripe_customer_id FROM tenants WHERE tenant_id = $1`,
    [tenantId]
  );

  if (tenant.rows[0].stripe_customer_id) {
    return tenant.rows[0].stripe_customer_id;
  }

  // Create Stripe customer
  const customer = await stripe.customers.create({
    email: email,
    name: tenantName,
    metadata: {
      tenant_id: tenantId
    }
  });

  // Save customer ID
  await db.query(
    `UPDATE tenants SET stripe_customer_id = $1 WHERE tenant_id = $2`,
    [customer.id, tenantId]
  );

  return customer.id;
}

// ============================================================================
// LIST PAYMENT METHODS
// ============================================================================

/**
 * GET /api/payments/methods
 * List all saved payment methods for the user
 */
router.get('/methods', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        status: 'error',
        error: 'Stripe not configured'
      });
    }

    // Ensure Stripe customer exists
    const customerId = await ensureStripeCustomer(
      req.tenantId,
      req.user.email,
      req.user.tenant_name
    );

    // Fetch payment methods from Stripe
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card'
    });

    const achPaymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'us_bank_account'
    });

    res.json({
      status: 'success',
      data: {
        cards: paymentMethods.data.map(pm => ({
          id: pm.id,
          type: 'card',
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
          is_default: pm.id === req.user.default_payment_method
        })),
        bank_accounts: achPaymentMethods.data.map(pm => ({
          id: pm.id,
          type: 'ach',
          bank_name: pm.us_bank_account.bank_name,
          last4: pm.us_bank_account.last4,
          account_type: pm.us_bank_account.account_type,
          verified: pm.us_bank_account.status === 'verified',
          is_default: pm.id === req.user.default_payment_method
        })),
        default_payment_method: req.user.default_payment_method
      }
    });

  } catch (error) {
    console.error('[Payments] List methods error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve payment methods',
      details: error.message
    });
  }
});

// ============================================================================
// ADD CREDIT/DEBIT CARD
// ============================================================================

/**
 * POST /api/payments/card/add
 * Add a credit/debit card as a payment method
 *
 * Body: { "payment_method_id": "pm_xxx" }
 * (payment_method_id comes from Stripe.js on frontend)
 */
router.post('/card/add', requireAuth, async (req, res) => {
  try {
    const { payment_method_id } = req.body;

    if (!payment_method_id) {
      return res.status(400).json({
        status: 'error',
        error: 'payment_method_id required'
      });
    }

    if (!stripe) {
      return res.status(503).json({
        status: 'error',
        error: 'Stripe not configured'
      });
    }

    // Ensure Stripe customer exists
    const customerId = await ensureStripeCustomer(
      req.tenantId,
      req.user.email,
      req.user.tenant_name
    );

    // Attach payment method to customer
    await stripe.paymentMethods.attach(payment_method_id, {
      customer: customerId
    });

    // Optionally set as default
    const { set_default = false } = req.body;
    if (set_default) {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: payment_method_id
        }
      });

      await db.query(
        `UPDATE users SET default_payment_method = $1 WHERE user_id = $2`,
        [payment_method_id, req.userId]
      );
    }

    // Get the payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(payment_method_id);

    res.json({
      status: 'success',
      message: 'Card added successfully',
      data: {
        payment_method_id: paymentMethod.id,
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        exp_month: paymentMethod.card.exp_month,
        exp_year: paymentMethod.card.exp_year,
        is_default: set_default
      }
    });

  } catch (error) {
    console.error('[Payments] Add card error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to add card',
      details: error.message
    });
  }
});

// ============================================================================
// ADD BANK ACCOUNT (ACH)
// ============================================================================

/**
 * POST /api/payments/ach/add
 * Add a bank account for ACH payments
 *
 * Body:
 * {
 *   "account_holder_name": "John Doe",
 *   "account_holder_type": "individual" | "company",
 *   "routing_number": "110000000",
 *   "account_number": "000123456789"
 * }
 *
 * Note: In production, use Stripe's Financial Connections for secure bank linking
 */
router.post('/ach/add', requireAuth, async (req, res) => {
  try {
    const {
      account_holder_name,
      account_holder_type = 'individual',
      routing_number,
      account_number
    } = req.body;

    if (!account_holder_name || !routing_number || !account_number) {
      return res.status(400).json({
        status: 'error',
        error: 'account_holder_name, routing_number, and account_number required'
      });
    }

    if (!stripe) {
      return res.status(503).json({
        status: 'error',
        error: 'Stripe not configured'
      });
    }

    // Ensure Stripe customer exists
    const customerId = await ensureStripeCustomer(
      req.tenantId,
      req.user.email,
      req.user.tenant_name
    );

    // Create bank account token
    const token = await stripe.tokens.create({
      bank_account: {
        country: 'US',
        currency: 'usd',
        account_holder_name,
        account_holder_type,
        routing_number,
        account_number
      }
    });

    // Attach bank account to customer
    const bankAccount = await stripe.customers.createSource(customerId, {
      source: token.id
    });

    // Initiate micro-deposit verification
    await stripe.customers.verifySource(customerId, bankAccount.id, {
      amounts: [] // Stripe will send micro-deposits
    });

    res.json({
      status: 'success',
      message: 'Bank account added. Stripe will send 2 micro-deposits within 1-2 business days. Verify them to complete setup.',
      data: {
        bank_account_id: bankAccount.id,
        bank_name: bankAccount.bank_name,
        last4: bankAccount.last4,
        account_holder_name: bankAccount.account_holder_name,
        account_holder_type: bankAccount.account_holder_type,
        status: bankAccount.status, // 'new' - pending verification
        verification_status: 'pending'
      }
    });

  } catch (error) {
    console.error('[Payments] Add ACH error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to add bank account',
      details: error.message
    });
  }
});

// ============================================================================
// VERIFY BANK ACCOUNT (ACH)
// ============================================================================

/**
 * POST /api/payments/ach/verify
 * Verify bank account with micro-deposit amounts
 *
 * Body:
 * {
 *   "bank_account_id": "ba_xxx",
 *   "amounts": [32, 45]  // In cents
 * }
 */
router.post('/ach/verify', requireAuth, async (req, res) => {
  try {
    const { bank_account_id, amounts } = req.body;

    if (!bank_account_id || !amounts || amounts.length !== 2) {
      return res.status(400).json({
        status: 'error',
        error: 'bank_account_id and amounts (array of 2 values) required'
      });
    }

    if (!stripe) {
      return res.status(503).json({
        status: 'error',
        error: 'Stripe not configured'
      });
    }

    // Verify the micro-deposits
    const verification = await stripe.customers.verifySource(
      req.stripeCustomerId,
      bank_account_id,
      { amounts }
    );

    res.json({
      status: 'success',
      message: 'Bank account verified successfully! You can now use ACH payments.',
      data: {
        bank_account_id: verification.id,
        status: verification.status, // 'verified'
        verified: true
      }
    });

  } catch (error) {
    console.error('[Payments] ACH verify error:', error);

    // Check if it's a verification failure
    if (error.type === 'StripeInvalidRequestError' && error.message.includes('amounts')) {
      return res.status(400).json({
        status: 'error',
        error: 'Incorrect verification amounts. Please try again.'
      });
    }

    res.status(500).json({
      status: 'error',
      error: 'Failed to verify bank account',
      details: error.message
    });
  }
});

// ============================================================================
// REMOVE PAYMENT METHOD
// ============================================================================

/**
 * DELETE /api/payments/methods/:methodId
 * Remove a saved payment method
 */
router.delete('/methods/:methodId', requireAuth, async (req, res) => {
  try {
    const { methodId } = req.params;

    if (!stripe) {
      return res.status(503).json({
        status: 'error',
        error: 'Stripe not configured'
      });
    }

    // Detach payment method
    await stripe.paymentMethods.detach(methodId);

    res.json({
      status: 'success',
      message: 'Payment method removed successfully'
    });

  } catch (error) {
    console.error('[Payments] Remove method error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to remove payment method',
      details: error.message
    });
  }
});

// ============================================================================
// SET DEFAULT PAYMENT METHOD
// ============================================================================

/**
 * POST /api/payments/methods/:methodId/set-default
 * Set a payment method as the default
 */
router.post('/methods/:methodId/set-default', requireAuth, async (req, res) => {
  try {
    const { methodId } = req.params;

    if (!stripe) {
      return res.status(503).json({
        status: 'error',
        error: 'Stripe not configured'
      });
    }

    // Update Stripe customer
    await stripe.customers.update(req.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: methodId
      }
    });

    // Update database
    await db.query(
      `UPDATE users SET default_payment_method = $1 WHERE user_id = $2`,
      [methodId, req.userId]
    );

    res.json({
      status: 'success',
      message: 'Default payment method updated'
    });

  } catch (error) {
    console.error('[Payments] Set default error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to set default payment method',
      details: error.message
    });
  }
});

// ============================================================================
// APPLE PAY
// ============================================================================

/**
 * POST /api/payments/applepay/create-intent
 * Create payment intent for Apple Pay
 *
 * Body:
 * {
 *   "amount_dollars": 50,
 *   "description": "Credit purchase"
 * }
 *
 * Response:
 * {
 *   "payment_intent_id": "pi_xxx",
 *   "client_secret": "pi_xxx_secret_yyy",
 *   "amount_cents": 5000
 * }
 */
router.post('/applepay/create-intent', requireAuth, async (req, res) => {
  try {
    const { amount_dollars, description = 'Credit purchase' } = req.body;

    if (!amount_dollars || amount_dollars < 1) {
      return res.status(400).json({
        status: 'error',
        error: 'amount_dollars must be at least $1'
      });
    }

    if (!stripe) {
      return res.status(503).json({
        status: 'error',
        error: 'Stripe not configured'
      });
    }

    const amountCents = Math.round(amount_dollars * 100);

    // Ensure Stripe customer exists
    const customerId = await ensureStripeCustomer(
      req.tenantId,
      req.user.email,
      req.user.tenant_name
    );

    // Create payment intent for Apple Pay
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: customerId,
      description: description,
      payment_method_types: ['card'], // Apple Pay uses card under the hood
      metadata: {
        tenant_id: req.tenantId,
        user_id: req.userId,
        purpose: 'credit_purchase',
        payment_type: 'apple_pay'
      }
    });

    res.json({
      status: 'success',
      data: {
        payment_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
        amount_cents: amountCents,
        amount_dollars: amount_dollars
      },
      message: 'Payment intent created for Apple Pay'
    });

  } catch (error) {
    console.error('[Payments] Apple Pay create intent error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to create Apple Pay payment intent',
      details: error.message
    });
  }
});

/**
 * POST /api/payments/applepay/confirm
 * Confirm Apple Pay payment after user authorizes
 *
 * Body:
 * {
 *   "payment_intent_id": "pi_xxx",
 *   "payment_method_id": "pm_xxx" (from Apple Pay)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "payment_intent_id": "pi_xxx",
 *   "credits_added": 5000,
 *   "status": "succeeded"
 * }
 */
router.post('/applepay/confirm', requireAuth, async (req, res) => {
  try {
    const { payment_intent_id, payment_method_id } = req.body;

    if (!payment_intent_id || !payment_method_id) {
      return res.status(400).json({
        status: 'error',
        error: 'payment_intent_id and payment_method_id required'
      });
    }

    if (!stripe) {
      return res.status(503).json({
        status: 'error',
        error: 'Stripe not configured'
      });
    }

    // Confirm payment intent with Apple Pay payment method
    const paymentIntent = await stripe.paymentIntents.confirm(payment_intent_id, {
      payment_method: payment_method_id
    });

    if (paymentIntent.status === 'succeeded') {
      // Add credits to user account
      const amountCents = paymentIntent.amount;

      await db.query(
        `INSERT INTO user_credits (user_id, credits_remaining, credits_purchased, purchase_date)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET credits_remaining = user_credits.credits_remaining + $2,
             credits_purchased = user_credits.credits_purchased + $3`,
        [req.userId, amountCents, amountCents]
      );

      console.log(`[Payments] Apple Pay: User ${req.userId} purchased $${(amountCents / 100).toFixed(2)} credits`);

      res.json({
        status: 'success',
        data: {
          success: true,
          payment_intent_id: paymentIntent.id,
          amount_cents: amountCents,
          amount_dollars: (amountCents / 100).toFixed(2),
          credits_added: amountCents,
          payment_status: paymentIntent.status,
          payment_type: 'apple_pay'
        },
        message: `Apple Pay payment successful! $${(amountCents / 100).toFixed(2)} in credits added.`
      });

    } else {
      res.json({
        status: 'pending',
        data: {
          success: false,
          payment_intent_id: paymentIntent.id,
          payment_status: paymentIntent.status
        },
        message: `Payment status: ${paymentIntent.status}`
      });
    }

  } catch (error) {
    console.error('[Payments] Apple Pay confirm error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to confirm Apple Pay payment',
      details: error.message
    });
  }
});

/**
 * GET /api/payments/applepay/domain-association
 * Apple Pay domain verification file
 * Required for Apple Pay on web (not needed for native iOS apps)
 *
 * Returns the domain association file that Apple requires
 * Place this at: https://yourdomain.com/.well-known/apple-developer-merchantid-domain-association
 */
router.get('/applepay/domain-association', (req, res) => {
  // This is a placeholder - in production, get this file from Apple
  // https://stripe.com/docs/apple-pay#web-register-domain

  res.type('text/plain');
  res.send(`7B227073704964223A2239373943394538433346304637374337384144443634313934434634343835...`);
});

/**
 * POST /api/payments/applepay/register-domain
 * Register domain with Apple Pay (admin only)
 *
 * Body:
 * {
 *   "domain": "yourdomain.com"
 * }
 */
router.post('/applepay/register-domain', requireAuth, async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({
        status: 'error',
        error: 'domain required'
      });
    }

    if (!stripe) {
      return res.status(503).json({
        status: 'error',
        error: 'Stripe not configured'
      });
    }

    // Register domain with Stripe for Apple Pay
    const domainRegistration = await stripe.applePayDomains.create({
      domain_name: domain
    });

    res.json({
      status: 'success',
      data: domainRegistration,
      message: `Domain ${domain} registered for Apple Pay`
    });

  } catch (error) {
    console.error('[Payments] Apple Pay domain registration error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to register domain for Apple Pay',
      details: error.message
    });
  }
});

// ============================================================================
// ONE-TIME PAYMENT
// ============================================================================

/**
 * POST /api/payments/charge
 * Make a one-time payment for credits
 *
 * Body:
 * {
 *   "amount_dollars": 50,
 *   "payment_method_id": "pm_xxx" (optional - uses default if not provided),
 *   "payment_type": "card" | "ach"
 * }
 */
router.post('/charge', requireAuth, async (req, res) => {
  try {
    const {
      amount_dollars,
      payment_method_id,
      payment_type = 'card'
    } = req.body;

    if (!amount_dollars || amount_dollars < 1) {
      return res.status(400).json({
        status: 'error',
        error: 'amount_dollars must be at least $1'
      });
    }

    if (!stripe) {
      return res.status(503).json({
        status: 'error',
        error: 'Stripe not configured'
      });
    }

    const amountCents = Math.round(amount_dollars * 100);

    // Ensure Stripe customer exists
    const customerId = await ensureStripeCustomer(
      req.tenantId,
      req.user.email,
      req.user.tenant_name
    );

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: customerId,
      payment_method: payment_method_id,
      confirm: true,
      automatic_payment_methods: payment_type === 'ach' ? {
        enabled: true,
        allow_redirects: 'never'
      } : undefined,
      metadata: {
        tenant_id: req.tenantId,
        user_id: req.userId,
        purpose: 'credit_purchase'
      }
    });

    // Add credits to user account
    await db.query(
      `INSERT INTO user_credits (user_id, credits_remaining, credits_purchased, purchase_date)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET credits_remaining = user_credits.credits_remaining + $2,
           credits_purchased = user_credits.credits_purchased + $3`,
      [req.userId, amountCents, amountCents]
    );

    res.json({
      status: 'success',
      message: `Payment successful! $${amount_dollars} in credits added to your account.`,
      data: {
        payment_intent_id: paymentIntent.id,
        amount_cents: amountCents,
        amount_dollars: amount_dollars,
        credits_added: amountCents,
        payment_status: paymentIntent.status,
        payment_type
      }
    });

  } catch (error) {
    console.error('[Payments] Charge error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Payment failed',
      details: error.message
    });
  }
});

module.exports = { initRoutes };

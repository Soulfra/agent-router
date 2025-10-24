/**
 * Credits Routes - Credit purchase and management system
 *
 * Handles prepaid credit purchases via Stripe, balance checking, transaction history,
 * and credit package management. Part of the "reverse phone plan" model where users
 * buy credits upfront and spend them on usage (calls, SMS, AI queries, etc.)
 *
 * Business Model:
 * - Users purchase credit packages with bonus credits (e.g., $10 → $11 in credits)
 * - Credits spent on usage: SMS $0.01, Calls $0.05/min, Phone verification $0.05
 * - 100% upfront payment + usage margins = better than subscriptions
 * - Profit margins: 26% on SMS, 74% on calls
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with database connection and Stripe client
 *
 * @param {Object} db - PostgreSQL database connection pool
 * @param {Object} stripe - Stripe client instance
 * @returns {Object} Express router
 */
function initializeRoutes(db, stripe) {
  if (!db) {
    throw new Error('Database connection required for credits routes');
  }

  if (!stripe) {
    console.warn('[Credits] Stripe client not provided - purchase endpoints will be disabled');
  }

  /**
   * GET /api/credits/balance
   * Get current credit balance for authenticated user
   *
   * Response:
   * {
   *   balance_cents: 1100,
   *   balance_dollars: "11.00",
   *   lifetime_purchased_cents: 2500,
   *   lifetime_spent_cents: 1400
   * }
   */
  router.get('/balance', async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get balance using database function
      const result = await db.query(
        'SELECT get_user_balance($1) as balance_cents',
        [userId]
      );

      const balanceCents = result.rows[0].balance_cents || 0;

      // Get additional stats from user_credits table
      const statsResult = await db.query(
        `SELECT
          balance_cents,
          lifetime_purchased_cents,
          lifetime_spent_cents,
          last_purchase_at,
          created_at
        FROM user_credits
        WHERE user_id = $1`,
        [userId]
      );

      if (statsResult.rows.length === 0) {
        // User has no credit record yet - create one
        await db.query(
          `INSERT INTO user_credits (user_id, balance_cents)
          VALUES ($1, 0)
          ON CONFLICT (user_id) DO NOTHING`,
          [userId]
        );

        return res.json({
          balance_cents: 0,
          balance_dollars: '0.00',
          lifetime_purchased_cents: 0,
          lifetime_spent_cents: 0,
          last_purchase_at: null
        });
      }

      const stats = statsResult.rows[0];

      res.json({
        balance_cents: stats.balance_cents,
        balance_dollars: (stats.balance_cents / 100).toFixed(2),
        lifetime_purchased_cents: stats.lifetime_purchased_cents,
        lifetime_purchased_dollars: (stats.lifetime_purchased_cents / 100).toFixed(2),
        lifetime_spent_cents: stats.lifetime_spent_cents,
        lifetime_spent_dollars: (stats.lifetime_spent_cents / 100).toFixed(2),
        last_purchase_at: stats.last_purchase_at,
        account_created_at: stats.created_at
      });

    } catch (error) {
      console.error('[Credits] Error fetching balance:', error);
      res.status(500).json({
        error: 'Failed to fetch balance',
        details: error.message
      });
    }
  });

  /**
   * GET /api/credits/transactions
   * Get transaction history for authenticated user
   *
   * Query params:
   * - limit: Number of transactions (default 50, max 500)
   * - offset: Pagination offset
   * - type: Filter by transaction type (purchase, deduction, bonus, refund)
   *
   * Response:
   * {
   *   transactions: [...],
   *   total: 150,
   *   limit: 50,
   *   offset: 0
   * }
   */
  router.get('/transactions', async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const limit = Math.min(parseInt(req.query.limit) || 50, 500);
      const offset = parseInt(req.query.offset) || 0;
      const type = req.query.type;

      let query = `
        SELECT
          transaction_id,
          amount_cents,
          transaction_type,
          description,
          stripe_payment_intent_id,
          twilio_sid,
          metadata,
          balance_after_cents,
          created_at
        FROM credit_transactions
        WHERE user_id = $1
      `;

      const params = [userId];

      // Add type filter if specified
      if (type) {
        params.push(type);
        query += ` AND transaction_type = $${params.length}`;
      }

      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await db.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM credit_transactions WHERE user_id = $1';
      const countParams = [userId];

      if (type) {
        countQuery += ' AND transaction_type = $2';
        countParams.push(type);
      }

      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      // Format transactions
      const transactions = result.rows.map(tx => ({
        transaction_id: tx.transaction_id,
        amount_cents: tx.amount_cents,
        amount_dollars: (Math.abs(tx.amount_cents) / 100).toFixed(2),
        is_credit: tx.amount_cents > 0,
        transaction_type: tx.transaction_type,
        description: tx.description,
        stripe_payment_intent_id: tx.stripe_payment_intent_id,
        twilio_sid: tx.twilio_sid,
        metadata: tx.metadata,
        balance_after_cents: tx.balance_after_cents,
        balance_after_dollars: (tx.balance_after_cents / 100).toFixed(2),
        created_at: tx.created_at
      }));

      res.json({
        transactions,
        total,
        limit,
        offset,
        has_more: offset + limit < total
      });

    } catch (error) {
      console.error('[Credits] Error fetching transactions:', error);
      res.status(500).json({
        error: 'Failed to fetch transactions',
        details: error.message
      });
    }
  });

  /**
   * GET /api/credits/packages
   * Get available credit packages for purchase
   *
   * Response:
   * {
   *   packages: [
   *     {
   *       package_id: "...",
   *       name: "Starter Pack",
   *       price_cents: 1000,
   *       price_dollars: "10.00",
   *       credits_cents: 1100,
   *       credits_dollars: "11.00",
   *       bonus_percent: 10,
   *       description: "Perfect for trying out the service"
   *     }
   *   ]
   * }
   */
  router.get('/packages', async (req, res) => {
    try {
      const result = await db.query(`
        SELECT
          package_id,
          package_name,
          price_cents,
          credits_cents,
          bonus_percent,
          description,
          is_active,
          sort_order
        FROM credit_packages
        WHERE is_active = true
        ORDER BY sort_order ASC, price_cents ASC
      `);

      const packages = result.rows.map(pkg => ({
        package_id: pkg.package_id,
        name: pkg.package_name,
        price_cents: pkg.price_cents,
        price_dollars: (pkg.price_cents / 100).toFixed(2),
        credits_cents: pkg.credits_cents,
        credits_dollars: (pkg.credits_cents / 100).toFixed(2),
        bonus_percent: pkg.bonus_percent,
        bonus_cents: pkg.credits_cents - pkg.price_cents,
        bonus_dollars: ((pkg.credits_cents - pkg.price_cents) / 100).toFixed(2),
        description: pkg.description,
        sort_order: pkg.sort_order
      }));

      res.json({ packages });

    } catch (error) {
      console.error('[Credits] Error fetching packages:', error);
      res.status(500).json({
        error: 'Failed to fetch packages',
        details: error.message
      });
    }
  });

  /**
   * POST /api/credits/purchase
   * Create Stripe checkout session for credit purchase
   *
   * Request body:
   * {
   *   package_id: "uuid",
   *   success_url: "https://example.com/success",  // Optional
   *   cancel_url: "https://example.com/cancel"     // Optional
   * }
   *
   * Response:
   * {
   *   session_id: "cs_test_...",
   *   checkout_url: "https://checkout.stripe.com/..."
   * }
   */
  router.post('/purchase', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({
          error: 'Payment processing unavailable',
          details: 'Stripe not configured'
        });
      }

      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { package_id, success_url, cancel_url } = req.body;

      if (!package_id) {
        return res.status(400).json({ error: 'package_id required' });
      }

      // Get package details
      const packageResult = await db.query(
        `SELECT
          package_id,
          package_name,
          price_cents,
          credits_cents,
          description,
          is_active
        FROM credit_packages
        WHERE package_id = $1 AND is_active = true`,
        [package_id]
      );

      if (packageResult.rows.length === 0) {
        return res.status(404).json({ error: 'Package not found or inactive' });
      }

      const pkg = packageResult.rows[0];

      // Get user email for Stripe
      const userResult = await db.query(
        'SELECT email, username FROM users WHERE user_id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];

      // Create Stripe checkout session
      const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: pkg.package_name,
                description: `${pkg.description} - Receive $${(pkg.credits_cents / 100).toFixed(2)} in credits`,
              },
              unit_amount: pkg.price_cents,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: success_url || `${baseUrl}/credits/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancel_url || `${baseUrl}/credits/cancel`,
        customer_email: user.email,
        client_reference_id: userId,
        metadata: {
          user_id: userId,
          package_id: pkg.package_id,
          credits_cents: pkg.credits_cents,
          username: user.username
        }
      });

      // Log checkout session creation
      console.log(`[Credits] Created Stripe checkout session for user ${userId}: ${session.id}`);

      res.json({
        session_id: session.id,
        checkout_url: session.url
      });

    } catch (error) {
      console.error('[Credits] Error creating checkout session:', error);
      res.status(500).json({
        error: 'Failed to create checkout session',
        details: error.message
      });
    }
  });

  /**
   * POST /api/credits/webhook/stripe
   * Stripe webhook handler for payment completion
   *
   * Listens for checkout.session.completed events and credits user account
   *
   * IMPORTANT: This endpoint must be configured in Stripe dashboard:
   * https://dashboard.stripe.com/webhooks
   *
   * Webhook URL: https://yourdomain.com/api/credits/webhook/stripe
   * Events to listen for: checkout.session.completed
   */
  router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      if (!stripe) {
        return res.status(503).json({ error: 'Stripe not configured' });
      }

      const sig = req.headers['stripe-signature'];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.error('[Credits] STRIPE_WEBHOOK_SECRET not configured');
        return res.status(500).json({ error: 'Webhook not configured' });
      }

      let event;

      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        console.error('[Credits] Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: 'Webhook signature verification failed' });
      }

      // Handle checkout.session.completed event
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        const userId = session.metadata.user_id;
        const packageId = session.metadata.package_id;
        const creditsCents = parseInt(session.metadata.credits_cents);
        const paymentIntentId = session.payment_intent;

        console.log(`[Credits] Processing payment for user ${userId}: $${(session.amount_total / 100).toFixed(2)}`);

        // Add credits to user account
        const result = await db.query(
          `SELECT add_credits(
            $1::uuid,
            $2::integer,
            'purchase',
            $3,
            $4,
            $5::jsonb
          ) as transaction_id`,
          [
            userId,
            creditsCents,
            `Credit purchase: ${session.metadata.credits_cents / 100} credits for $${session.amount_total / 100}`,
            paymentIntentId,
            JSON.stringify({
              stripe_session_id: session.id,
              package_id: packageId,
              amount_paid_cents: session.amount_total
            })
          ]
        );

        const transactionId = result.rows[0].transaction_id;

        console.log(`[Credits] Successfully added ${creditsCents} cents to user ${userId}. Transaction: ${transactionId}`);

        // Get new balance
        const balanceResult = await db.query(
          'SELECT get_user_balance($1) as balance',
          [userId]
        );

        const newBalance = balanceResult.rows[0].balance;

        console.log(`[Credits] User ${userId} new balance: $${(newBalance / 100).toFixed(2)}`);
      }

      res.json({ received: true });

    } catch (error) {
      console.error('[Credits] Webhook error:', error);
      res.status(500).json({
        error: 'Webhook processing failed',
        details: error.message
      });
    }
  });

  /**
   * GET /api/credits/can-afford/:amount_cents
   * Check if user can afford a specific amount
   *
   * Response:
   * {
   *   can_afford: true,
   *   current_balance: 1100,
   *   required_amount: 500,
   *   shortfall: 0
   * }
   */
  router.get('/can-afford/:amount_cents', async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const amountCents = parseInt(req.params.amount_cents);

      if (isNaN(amountCents) || amountCents < 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      // Check if user can afford
      const result = await db.query(
        'SELECT can_afford($1, $2) as can_afford, get_user_balance($1) as balance',
        [userId, amountCents]
      );

      const canAfford = result.rows[0].can_afford;
      const balance = result.rows[0].balance;

      res.json({
        can_afford: canAfford,
        current_balance: balance,
        current_balance_dollars: (balance / 100).toFixed(2),
        required_amount: amountCents,
        required_amount_dollars: (amountCents / 100).toFixed(2),
        shortfall: canAfford ? 0 : amountCents - balance,
        shortfall_dollars: canAfford ? '0.00' : ((amountCents - balance) / 100).toFixed(2)
      });

    } catch (error) {
      console.error('[Credits] Error checking affordability:', error);
      res.status(500).json({
        error: 'Failed to check affordability',
        details: error.message
      });
    }
  });

  /**
   * GET /api/credits/summary
   * Get comprehensive credit summary for user dashboard
   *
   * Response:
   * {
   *   balance: {...},
   *   recent_transactions: [...],
   *   spending_by_category: {...},
   *   low_balance_warning: false
   * }
   */
  router.get('/summary', async (req, res) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get balance
      const balanceResult = await db.query(
        'SELECT * FROM user_credit_summary WHERE user_id = $1',
        [userId]
      );

      const balance = balanceResult.rows[0] || {
        balance_cents: 0,
        lifetime_purchased_cents: 0,
        lifetime_spent_cents: 0
      };

      // Get recent transactions (last 10)
      const txResult = await db.query(`
        SELECT
          transaction_id,
          amount_cents,
          transaction_type,
          description,
          created_at
        FROM credit_transactions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [userId]);

      const recentTransactions = txResult.rows.map(tx => ({
        transaction_id: tx.transaction_id,
        amount_cents: tx.amount_cents,
        amount_dollars: (Math.abs(tx.amount_cents) / 100).toFixed(2),
        is_credit: tx.amount_cents > 0,
        transaction_type: tx.transaction_type,
        description: tx.description,
        created_at: tx.created_at
      }));

      // Get spending breakdown by category (last 30 days)
      const spendingResult = await db.query(`
        SELECT
          transaction_type,
          COUNT(*) as transaction_count,
          SUM(ABS(amount_cents)) as total_spent_cents
        FROM credit_transactions
        WHERE user_id = $1
          AND amount_cents < 0
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY transaction_type
        ORDER BY total_spent_cents DESC
      `, [userId]);

      const spendingByCategory = {};
      spendingResult.rows.forEach(row => {
        spendingByCategory[row.transaction_type] = {
          transaction_count: parseInt(row.transaction_count),
          total_spent_cents: parseInt(row.total_spent_cents),
          total_spent_dollars: (parseInt(row.total_spent_cents) / 100).toFixed(2)
        };
      });

      // Check for low balance warning (< $5)
      const lowBalanceWarning = balance.balance_cents < 500;

      res.json({
        balance: {
          balance_cents: balance.balance_cents,
          balance_dollars: (balance.balance_cents / 100).toFixed(2),
          lifetime_purchased_cents: balance.lifetime_purchased_cents,
          lifetime_purchased_dollars: (balance.lifetime_purchased_cents / 100).toFixed(2),
          lifetime_spent_cents: balance.lifetime_spent_cents,
          lifetime_spent_dollars: (balance.lifetime_spent_cents / 100).toFixed(2)
        },
        recent_transactions: recentTransactions,
        spending_by_category: spendingByCategory,
        low_balance_warning: lowBalanceWarning,
        recommended_action: lowBalanceWarning ? 'Add credits to avoid service interruption' : null
      });

    } catch (error) {
      console.error('[Credits] Error fetching summary:', error);
      res.status(500).json({
        error: 'Failed to fetch summary',
        details: error.message
      });
    }
  });

  return router;
}

module.exports = { initializeRoutes };

/**
 * CALOS Stripe Billing Integration
 *
 * Handles usage-based billing with Stripe
 *
 * Features:
 * - Creates and manages subscriptions
 * - Reports usage metering to Stripe
 * - Handles subscription lifecycle (trial, active, past_due, canceled)
 * - Syncs billing data with database
 * - Supports both flat-rate and usage-based pricing
 *
 * Usage:
 *   const StripeBilling = require('./stripe-billing');
 *   const billing = new StripeBilling({ stripeSecretKey, db });
 *   await billing.createSubscription(userId, tierSlug, email);
 *   await billing.reportUsage(subscriptionId, usageType, quantity);
 */

const stripe = require('stripe');

class StripeBilling {
  constructor(options = {}) {
    this.stripeSecretKey = options.stripeSecretKey || process.env.STRIPE_SECRET_KEY;
    this.db = options.db;

    if (!this.stripeSecretKey) {
      throw new Error('[Stripe Billing] Stripe secret key required');
    }

    if (!this.db) {
      throw new Error('[Stripe Billing] Database required');
    }

    this.stripe = stripe(this.stripeSecretKey);

    // Stripe price IDs (from Stripe Dashboard)
    // TODO: Replace with actual price IDs from Stripe
    this.priceIds = {
      community_monthly: process.env.STRIPE_COMMUNITY_MONTHLY_PRICE_ID || 'price_community_monthly',
      pro_monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly',
      pro_annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || 'price_pro_annual',
      enterprise_monthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID || 'price_enterprise_monthly',
      enterprise_annual: process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID || 'price_enterprise_annual'
    };

    console.log('[Stripe Billing] Initialized');
  }

  /**
   * Create new subscription
   *
   * @param {number} userId - User ID
   * @param {string} tierSlug - Tier slug (community, pro, enterprise)
   * @param {string} email - Customer email
   * @param {string} billingPeriod - monthly or annual
   * @param {string} paymentMethodId - Stripe payment method ID (optional for trial)
   * @returns {object} Subscription data
   */
  async createSubscription(userId, tierSlug, email, billingPeriod = 'monthly', paymentMethodId = null) {
    try {
      console.log(`[Stripe Billing] Creating subscription for user ${userId}: ${tierSlug} (${billingPeriod})`);

      // Get tier details
      const tierResult = await this.db.query(`
        SELECT * FROM license_tiers WHERE tier_slug = $1
      `, [tierSlug]);

      if (tierResult.rows.length === 0) {
        throw new Error(`Tier not found: ${tierSlug}`);
      }

      const tier = tierResult.rows[0];

      // Create or get Stripe customer
      let customer;
      const existingCustomer = await this.db.query(`
        SELECT stripe_customer_id FROM subscription_plans
        WHERE user_id = $1 AND stripe_customer_id IS NOT NULL
        LIMIT 1
      `, [userId]);

      if (existingCustomer.rows.length > 0 && existingCustomer.rows[0].stripe_customer_id) {
        customer = await this.stripe.customers.retrieve(existingCustomer.rows[0].stripe_customer_id);
      } else {
        customer = await this.stripe.customers.create({
          email,
          metadata: {
            userId: userId.toString()
          }
        });
      }

      console.log(`[Stripe Billing] Customer: ${customer.id}`);

      // Attach payment method (if provided)
      if (paymentMethodId) {
        await this.stripe.paymentMethods.attach(paymentMethodId, {
          customer: customer.id
        });

        await this.stripe.customers.update(customer.id, {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        });
      }

      // Get price ID
      const priceKey = `${tierSlug}_${billingPeriod}`;
      const priceId = this.priceIds[priceKey];

      if (!priceId) {
        throw new Error(`Price not found for ${priceKey}`);
      }

      // Create subscription
      const subscriptionParams = {
        customer: customer.id,
        items: [
          {
            price: priceId
          }
        ],
        metadata: {
          userId: userId.toString(),
          tierSlug
        },
        expand: ['latest_invoice.payment_intent']
      };

      // Add trial if tier supports it
      if (tier.trial_days > 0) {
        subscriptionParams.trial_period_days = tier.trial_days;
      }

      const subscription = await this.stripe.subscriptions.create(subscriptionParams);

      console.log(`[Stripe Billing] Subscription created: ${subscription.id}`);

      // Generate install ID
      const crypto = require('crypto');
      const installId = crypto.randomBytes(16).toString('hex');

      // Save to database
      const now = new Date();
      const periodEnd = new Date(subscription.current_period_end * 1000);
      const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

      await this.db.query(`
        INSERT INTO subscription_plans (
          user_id,
          install_id,
          tier_id,
          tier_slug,
          billing_period,
          status,
          current_period_start,
          current_period_end,
          trial_ends_at,
          stripe_customer_id,
          stripe_subscription_id,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        ON CONFLICT (user_id, install_id) DO UPDATE SET
          tier_id = EXCLUDED.tier_id,
          tier_slug = EXCLUDED.tier_slug,
          billing_period = EXCLUDED.billing_period,
          status = EXCLUDED.status,
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          trial_ends_at = EXCLUDED.trial_ends_at,
          stripe_subscription_id = EXCLUDED.stripe_subscription_id,
          updated_at = NOW()
      `, [
        userId,
        installId,
        tier.tier_id,
        tierSlug,
        billingPeriod,
        subscription.status === 'trialing' ? 'trial' : 'active',
        now,
        periodEnd,
        trialEnd,
        customer.id,
        subscription.id
      ]);

      return {
        subscriptionId: subscription.id,
        customerId: customer.id,
        installId,
        status: subscription.status,
        trialEnd,
        periodEnd
      };
    } catch (error) {
      console.error('[Stripe Billing] Failed to create subscription:', error);
      throw error;
    }
  }

  /**
   * Report usage to Stripe (for usage-based billing)
   *
   * @param {string} subscriptionItemId - Stripe subscription item ID
   * @param {number} quantity - Quantity to report
   * @param {string} action - 'increment' or 'set'
   * @returns {object} Usage record
   */
  async reportUsage(subscriptionItemId, quantity, action = 'increment') {
    try {
      const usageRecord = await this.stripe.subscriptionItems.createUsageRecord(
        subscriptionItemId,
        {
          quantity,
          timestamp: Math.floor(Date.now() / 1000),
          action
        }
      );

      console.log(`[Stripe Billing] Usage reported: ${quantity} units for ${subscriptionItemId}`);
      return usageRecord;
    } catch (error) {
      console.error('[Stripe Billing] Failed to report usage:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   *
   * @param {number} userId - User ID
   * @param {string} installId - Install ID
   * @param {boolean} immediately - Cancel immediately vs at period end
   * @returns {object} Canceled subscription
   */
  async cancelSubscription(userId, installId, immediately = false) {
    try {
      console.log(`[Stripe Billing] Canceling subscription for user ${userId} (install: ${installId})`);

      // Get subscription
      const result = await this.db.query(`
        SELECT stripe_subscription_id FROM subscription_plans
        WHERE user_id = $1 AND install_id = $2
        LIMIT 1
      `, [userId, installId]);

      if (result.rows.length === 0 || !result.rows[0].stripe_subscription_id) {
        throw new Error('Subscription not found');
      }

      const stripeSubscriptionId = result.rows[0].stripe_subscription_id;

      // Cancel in Stripe
      const subscription = immediately
        ? await this.stripe.subscriptions.cancel(stripeSubscriptionId)
        : await this.stripe.subscriptions.update(stripeSubscriptionId, {
            cancel_at_period_end: true
          });

      // Update database
      await this.db.query(`
        UPDATE subscription_plans
        SET status = $1, updated_at = NOW()
        WHERE user_id = $2 AND install_id = $3
      `, [
        immediately ? 'canceled' : 'active',
        userId,
        installId
      ]);

      console.log(`[Stripe Billing] Subscription canceled: ${stripeSubscriptionId}`);

      return subscription;
    } catch (error) {
      console.error('[Stripe Billing] Failed to cancel subscription:', error);
      throw error;
    }
  }

  /**
   * Update subscription (change plan)
   *
   * @param {number} userId - User ID
   * @param {string} installId - Install ID
   * @param {string} newTierSlug - New tier slug
   * @param {string} billingPeriod - monthly or annual
   * @returns {object} Updated subscription
   */
  async updateSubscription(userId, installId, newTierSlug, billingPeriod = 'monthly') {
    try {
      console.log(`[Stripe Billing] Updating subscription for user ${userId}: ${newTierSlug}`);

      // Get current subscription
      const result = await this.db.query(`
        SELECT stripe_subscription_id, stripe_customer_id FROM subscription_plans
        WHERE user_id = $1 AND install_id = $2
        LIMIT 1
      `, [userId, installId]);

      if (result.rows.length === 0 || !result.rows[0].stripe_subscription_id) {
        throw new Error('Subscription not found');
      }

      const stripeSubscriptionId = result.rows[0].stripe_subscription_id;

      // Get new tier
      const tierResult = await this.db.query(`
        SELECT * FROM license_tiers WHERE tier_slug = $1
      `, [newTierSlug]);

      if (tierResult.rows.length === 0) {
        throw new Error(`Tier not found: ${newTierSlug}`);
      }

      const tier = tierResult.rows[0];

      // Get new price ID
      const priceKey = `${newTierSlug}_${billingPeriod}`;
      const newPriceId = this.priceIds[priceKey];

      if (!newPriceId) {
        throw new Error(`Price not found for ${priceKey}`);
      }

      // Retrieve current subscription
      const currentSubscription = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);

      // Update subscription
      const subscription = await this.stripe.subscriptions.update(stripeSubscriptionId, {
        items: [
          {
            id: currentSubscription.items.data[0].id,
            price: newPriceId
          }
        ],
        proration_behavior: 'create_prorations',
        metadata: {
          tierSlug: newTierSlug
        }
      });

      // Update database
      const periodEnd = new Date(subscription.current_period_end * 1000);

      await this.db.query(`
        UPDATE subscription_plans
        SET
          tier_id = $1,
          tier_slug = $2,
          billing_period = $3,
          current_period_end = $4,
          updated_at = NOW()
        WHERE user_id = $5 AND install_id = $6
      `, [
        tier.tier_id,
        newTierSlug,
        billingPeriod,
        periodEnd,
        userId,
        installId
      ]);

      console.log(`[Stripe Billing] Subscription updated: ${stripeSubscriptionId}`);

      return subscription;
    } catch (error) {
      console.error('[Stripe Billing] Failed to update subscription:', error);
      throw error;
    }
  }

  /**
   * Handle webhook event from Stripe
   *
   * @param {object} event - Stripe webhook event
   * @returns {void}
   */
  async handleWebhook(event) {
    try {
      console.log(`[Stripe Billing] Webhook received: ${event.type}`);

      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;

        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object);
          break;

        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object);
          break;

        case 'customer.subscription.trial_will_end':
          await this.handleTrialWillEnd(event.data.object);
          break;

        default:
          console.log(`[Stripe Billing] Unhandled webhook: ${event.type}`);
      }
    } catch (error) {
      console.error('[Stripe Billing] Webhook handling error:', error);
      throw error;
    }
  }

  /**
   * Handle subscription update webhook
   */
  async handleSubscriptionUpdate(subscription) {
    try {
      const userId = parseInt(subscription.metadata.userId);
      const tierSlug = subscription.metadata.tierSlug;
      const periodEnd = new Date(subscription.current_period_end * 1000);

      await this.db.query(`
        UPDATE subscription_plans
        SET
          status = $1,
          current_period_end = $2,
          updated_at = NOW()
        WHERE stripe_subscription_id = $3
      `, [
        subscription.status === 'trialing' ? 'trial' : subscription.status,
        periodEnd,
        subscription.id
      ]);

      console.log(`[Stripe Billing] Subscription updated: ${subscription.id}`);
    } catch (error) {
      console.error('[Stripe Billing] Failed to handle subscription update:', error);
    }
  }

  /**
   * Handle subscription deleted webhook
   */
  async handleSubscriptionDeleted(subscription) {
    try {
      await this.db.query(`
        UPDATE subscription_plans
        SET status = 'canceled', updated_at = NOW()
        WHERE stripe_subscription_id = $1
      `, [subscription.id]);

      console.log(`[Stripe Billing] Subscription canceled: ${subscription.id}`);
    } catch (error) {
      console.error('[Stripe Billing] Failed to handle subscription deletion:', error);
    }
  }

  /**
   * Handle payment succeeded webhook
   */
  async handlePaymentSucceeded(invoice) {
    try {
      console.log(`[Stripe Billing] Payment succeeded: ${invoice.id}`);

      // Update subscription status to active
      if (invoice.subscription) {
        await this.db.query(`
          UPDATE subscription_plans
          SET status = 'active', updated_at = NOW()
          WHERE stripe_subscription_id = $1
        `, [invoice.subscription]);
      }
    } catch (error) {
      console.error('[Stripe Billing] Failed to handle payment success:', error);
    }
  }

  /**
   * Handle payment failed webhook
   */
  async handlePaymentFailed(invoice) {
    try {
      console.log(`[Stripe Billing] Payment failed: ${invoice.id}`);

      // Update subscription status to past_due
      if (invoice.subscription) {
        await this.db.query(`
          UPDATE subscription_plans
          SET status = 'past_due', updated_at = NOW()
          WHERE stripe_subscription_id = $1
        `, [invoice.subscription]);
      }
    } catch (error) {
      console.error('[Stripe Billing] Failed to handle payment failure:', error);
    }
  }

  /**
   * Handle trial will end webhook
   */
  async handleTrialWillEnd(subscription) {
    try {
      console.log(`[Stripe Billing] Trial ending soon: ${subscription.id}`);

      // TODO: Send email notification to user about trial ending
      const userId = parseInt(subscription.metadata.userId);

      const userResult = await this.db.query(`
        SELECT email FROM users WHERE user_id = $1
      `, [userId]);

      if (userResult.rows.length > 0) {
        const email = userResult.rows[0].email;
        console.log(`[Stripe Billing] Trial ending notification for ${email}`);
        // Send email via email service
      }
    } catch (error) {
      console.error('[Stripe Billing] Failed to handle trial ending:', error);
    }
  }

  /**
   * Get subscription details
   *
   * @param {number} userId - User ID
   * @param {string} installId - Install ID
   * @returns {object} Subscription details
   */
  async getSubscription(userId, installId) {
    try {
      const result = await this.db.query(`
        SELECT
          sp.*,
          lt.tier_name,
          lt.features,
          lt.base_price_monthly,
          lt.base_price_annual
        FROM subscription_plans sp
        JOIN license_tiers lt ON sp.tier_slug = lt.tier_slug
        WHERE sp.user_id = $1 AND sp.install_id = $2
        LIMIT 1
      `, [userId, installId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('[Stripe Billing] Failed to get subscription:', error);
      return null;
    }
  }
}

module.exports = StripeBilling;

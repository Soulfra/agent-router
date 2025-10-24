/**
 * Affiliate Program Routes
 *
 * API endpoints for affiliate tracking:
 * - Click tracking
 * - Conversion tracking
 * - Affiliate dashboard
 * - Performance analytics
 * - Payout management
 */

const express = require('express');
const router = express.Router();

module.exports = (db, affiliateTracker) => {

  /**
   * Track affiliate click
   * GET /affiliate/click/:referralCode
   */
  router.get('/click/:referralCode', async (req, res) => {
    try {
      const { referralCode } = req.params;

      const metadata = {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        referrer: req.headers['referer'],
        landingPage: req.query.landing || req.headers['referer']
      };

      const result = await affiliateTracker.trackClick(referralCode, metadata);

      if (result) {
        // Set cookie for attribution
        res.cookie('affiliate_ref', referralCode, {
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production'
        });

        // Redirect to landing page or home
        const redirectUrl = req.query.redirect || '/';
        res.redirect(redirectUrl);
      } else {
        res.status(400).json({ error: 'Invalid referral code' });
      }

    } catch (error) {
      console.error('[AffiliateRoutes] Click error:', error.message);
      res.status(500).json({ error: 'Failed to track click' });
    }
  });

  /**
   * Generate referral code for affiliate
   * POST /affiliate/generate-code
   */
  router.post('/generate-code', async (req, res) => {
    try {
      const { affiliateId, programName } = req.body;

      if (!affiliateId) {
        return res.status(400).json({ error: 'affiliateId required' });
      }

      const code = await affiliateTracker.generateReferralCode(affiliateId, programName || 'default');

      res.json({
        success: true,
        referralCode: code,
        trackingUrl: `${req.protocol}://${req.get('host')}/affiliate/click/${code}`
      });

    } catch (error) {
      console.error('[AffiliateRoutes] Code generation error:', error.message);
      res.status(500).json({ error: 'Failed to generate code' });
    }
  });

  /**
   * Track conversion (webhook or direct call)
   * POST /affiliate/conversion
   */
  router.post('/conversion', async (req, res) => {
    try {
      const {
        referralCode,
        customerId,
        saleAmountCents,
        subscriptionId,
        productName,
        metadata
      } = req.body;

      // Try to get referral code from cookie if not provided
      const refCode = referralCode || req.cookies.affiliate_ref;

      if (!refCode) {
        return res.status(400).json({ error: 'No referral code found' });
      }

      const result = await affiliateTracker.trackConversion(refCode, {
        customerId,
        saleAmountCents: parseInt(saleAmountCents),
        subscriptionId,
        productName,
        metadata
      });

      if (result) {
        res.json({
          success: true,
          conversionId: result.conversionId,
          commissionAmount: result.commissionAmountCents / 100
        });
      } else {
        res.status(400).json({ error: 'Failed to track conversion' });
      }

    } catch (error) {
      console.error('[AffiliateRoutes] Conversion error:', error.message);
      res.status(500).json({ error: 'Failed to track conversion' });
    }
  });

  /**
   * Track recurring commission (for subscription renewals)
   * POST /affiliate/recurring
   */
  router.post('/recurring', async (req, res) => {
    try {
      const {
        subscriptionId,
        customerId,
        amountCents,
        productName,
        metadata
      } = req.body;

      if (!subscriptionId) {
        return res.status(400).json({ error: 'subscriptionId required' });
      }

      const conversionId = await affiliateTracker.trackRecurringCommission(subscriptionId, {
        customerId,
        amountCents: parseInt(amountCents),
        productName,
        metadata
      });

      if (conversionId) {
        res.json({
          success: true,
          conversionId
        });
      } else {
        res.status(400).json({ error: 'Failed to track recurring commission' });
      }

    } catch (error) {
      console.error('[AffiliateRoutes] Recurring commission error:', error.message);
      res.status(500).json({ error: 'Failed to track recurring commission' });
    }
  });

  /**
   * Get affiliate dashboard data
   * GET /affiliate/dashboard/:affiliateId
   */
  router.get('/dashboard/:affiliateId', async (req, res) => {
    try {
      const { affiliateId } = req.params;

      const dashboard = await affiliateTracker.getAffiliateDashboard(affiliateId);

      if (dashboard) {
        res.json({
          success: true,
          data: {
            ...dashboard,
            unpaidCommission: dashboard.unpaidCommissionCents / 100,
            performance: {
              ...dashboard.performance,
              totalCommission: dashboard.performance.total_commission_cents / 100,
              approvedCommission: dashboard.performance.approved_commission_cents / 100,
              pendingCommission: dashboard.performance.pending_commission_cents / 100
            }
          }
        });
      } else {
        res.status(404).json({ error: 'Affiliate not found' });
      }

    } catch (error) {
      console.error('[AffiliateRoutes] Dashboard error:', error.message);
      res.status(500).json({ error: 'Failed to load dashboard' });
    }
  });

  /**
   * Get affiliate performance stats
   * GET /affiliate/performance/:affiliateId
   */
  router.get('/performance/:affiliateId', async (req, res) => {
    try {
      const { affiliateId } = req.params;
      const { days } = req.query;

      const performance = await affiliateTracker.getAffiliatePerformance(
        affiliateId,
        parseInt(days) || 30
      );

      res.json({
        success: true,
        data: {
          ...performance,
          totalCommission: performance.total_commission_cents / 100,
          approvedCommission: performance.approved_commission_cents / 100,
          pendingCommission: performance.pending_commission_cents / 100
        }
      });

    } catch (error) {
      console.error('[AffiliateRoutes] Performance error:', error.message);
      res.status(500).json({ error: 'Failed to load performance' });
    }
  });

  /**
   * Get top performing affiliates
   * GET /affiliate/leaderboard
   */
  router.get('/leaderboard', async (req, res) => {
    try {
      const { limit, program } = req.query;

      const affiliates = await affiliateTracker.getTopAffiliates(
        parseInt(limit) || 10,
        program || null
      );

      res.json({
        success: true,
        data: affiliates.map(a => ({
          ...a,
          totalCommission: a.total_commission_cents / 100
        }))
      });

    } catch (error) {
      console.error('[AffiliateRoutes] Leaderboard error:', error.message);
      res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });

  /**
   * Approve a conversion (admin only)
   * POST /affiliate/approve/:conversionId
   */
  router.post('/approve/:conversionId', async (req, res) => {
    try {
      const { conversionId } = req.params;

      // TODO: Add authentication check for admin users

      await affiliateTracker.approveConversion(conversionId);

      res.json({
        success: true,
        message: 'Conversion approved'
      });

    } catch (error) {
      console.error('[AffiliateRoutes] Approval error:', error.message);
      res.status(500).json({ error: 'Failed to approve conversion' });
    }
  });

  /**
   * Process payout for affiliate (admin only)
   * POST /affiliate/payout/:affiliateId
   */
  router.post('/payout/:affiliateId', async (req, res) => {
    try {
      const { affiliateId } = req.params;
      const { programName } = req.body;

      // TODO: Add authentication check for admin users

      const payout = await affiliateTracker.processPayout(affiliateId, programName || null);

      if (payout) {
        res.json({
          success: true,
          data: {
            payoutId: payout.payoutId,
            amount: payout.amountCents / 100,
            conversionCount: payout.conversionCount
          }
        });
      } else {
        res.status(400).json({
          error: 'No eligible conversions for payout or below minimum threshold'
        });
      }

    } catch (error) {
      console.error('[AffiliateRoutes] Payout error:', error.message);
      res.status(500).json({ error: 'Failed to process payout' });
    }
  });

  /**
   * Get all referral codes for an affiliate
   * GET /affiliate/codes/:affiliateId
   */
  router.get('/codes/:affiliateId', async (req, res) => {
    try {
      const { affiliateId } = req.params;

      const result = await db.query(`
        SELECT
          referral_code,
          program_name,
          created_at,
          (SELECT COUNT(*) FROM affiliate_clicks WHERE referral_code = arc.referral_code) as clicks,
          (SELECT COUNT(*) FROM affiliate_conversions WHERE referral_code = arc.referral_code) as conversions
        FROM affiliate_referral_codes arc
        WHERE affiliate_id = $1
        ORDER BY created_at DESC
      `, [affiliateId]);

      res.json({
        success: true,
        data: result.rows.map(code => ({
          ...code,
          trackingUrl: `${req.protocol}://${req.get('host')}/affiliate/click/${code.referral_code}`
        }))
      });

    } catch (error) {
      console.error('[AffiliateRoutes] Codes error:', error.message);
      res.status(500).json({ error: 'Failed to load referral codes' });
    }
  });

  /**
   * Get conversion history for affiliate
   * GET /affiliate/conversions/:affiliateId
   */
  router.get('/conversions/:affiliateId', async (req, res) => {
    try {
      const { affiliateId } = req.params;
      const { limit, offset } = req.query;

      const result = await db.query(`
        SELECT
          conversion_id,
          program_name,
          referral_code,
          sale_amount_cents,
          commission_amount_cents,
          product_name,
          conversion_date,
          status,
          is_recurring
        FROM affiliate_conversions
        WHERE affiliate_id = $1
        ORDER BY conversion_date DESC
        LIMIT $2 OFFSET $3
      `, [affiliateId, parseInt(limit) || 50, parseInt(offset) || 0]);

      res.json({
        success: true,
        data: result.rows.map(c => ({
          ...c,
          saleAmount: c.sale_amount_cents / 100,
          commissionAmount: c.commission_amount_cents / 100
        }))
      });

    } catch (error) {
      console.error('[AffiliateRoutes] Conversions error:', error.message);
      res.status(500).json({ error: 'Failed to load conversions' });
    }
  });

  /**
   * Get payout history for affiliate
   * GET /affiliate/payouts/:affiliateId
   */
  router.get('/payouts/:affiliateId', async (req, res) => {
    try {
      const { affiliateId } = req.params;

      const result = await db.query(`
        SELECT
          payout_id,
          program_name,
          amount_cents,
          conversion_count,
          status,
          created_at,
          paid_at
        FROM affiliate_payouts
        WHERE affiliate_id = $1
        ORDER BY created_at DESC
      `, [affiliateId]);

      res.json({
        success: true,
        data: result.rows.map(p => ({
          ...p,
          amount: p.amount_cents / 100
        }))
      });

    } catch (error) {
      console.error('[AffiliateRoutes] Payouts error:', error.message);
      res.status(500).json({ error: 'Failed to load payouts' });
    }
  });

  /**
   * Stripe webhook for tracking conversions
   * POST /affiliate/webhook/stripe
   */
  router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const event = req.body;

      // Handle different event types
      switch (event.type) {
        case 'checkout.session.completed':
          // Track initial conversion
          const session = event.data.object;
          if (session.client_reference_id) {
            await affiliateTracker.trackConversion(session.client_reference_id, {
              customerId: session.customer,
              saleAmountCents: session.amount_total,
              subscriptionId: session.subscription,
              productName: 'Stripe Subscription',
              metadata: { sessionId: session.id }
            });
          }
          break;

        case 'invoice.payment_succeeded':
          // Track recurring commission
          const invoice = event.data.object;
          if (invoice.subscription) {
            await affiliateTracker.trackRecurringCommission(invoice.subscription, {
              customerId: invoice.customer,
              amountCents: invoice.amount_paid,
              productName: 'Stripe Subscription Renewal',
              metadata: { invoiceId: invoice.id }
            });
          }
          break;
      }

      res.json({ received: true });

    } catch (error) {
      console.error('[AffiliateRoutes] Webhook error:', error.message);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  return router;
};

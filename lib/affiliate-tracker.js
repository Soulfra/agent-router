/**
 * Affiliate Program Tracker
 *
 * Track conversions and commissions across multiple affiliate programs:
 * - Stripe referrals
 * - Amazon Associates
 * - Ahrefs affiliate program
 * - Custom affiliate programs
 *
 * Features:
 * - Click tracking with unique referral codes
 * - Conversion attribution
 * - Commission calculation
 * - Multi-tier referral support
 * - Performance analytics
 * - Payout tracking
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class AffiliateTracker extends EventEmitter {
  constructor(db, options = {}) {
    super();
    this.db = db;
    this.enabled = options.enabled !== false;
    this.cookieDuration = options.cookieDuration || 30; // days
    this.defaultCommissionRate = options.defaultCommissionRate || 0.20; // 20%

    // Supported affiliate programs
    this.programs = {
      stripe: {
        name: 'Stripe',
        commissionRate: 0.20, // 20% of monthly subscription
        payoutThreshold: 100.00 // $100 minimum payout
      },
      amazon: {
        name: 'Amazon Associates',
        commissionRate: 0.04, // 4% average
        payoutThreshold: 10.00 // $10 minimum
      },
      ahrefs: {
        name: 'Ahrefs',
        commissionRate: 0.20, // 20% recurring
        payoutThreshold: 500.00 // $500 minimum
      },
      calos_sdk: {
        name: 'CALOS SDK',
        commissionRate: 0.30, // 30% first year
        payoutThreshold: 100.00
      }
    };

    console.log('[AffiliateTracker] Initialized', {
      enabled: this.enabled,
      programs: Object.keys(this.programs).length
    });
  }

  /**
   * Generate unique referral code for affiliate
   */
  async generateReferralCode(affiliateId, programName = 'default') {
    const randomPart = crypto.randomBytes(4).toString('hex');
    const code = `${programName.substring(0, 3).toUpperCase()}-${affiliateId}-${randomPart}`.toUpperCase();

    // Store in database
    await this.db.query(`
      INSERT INTO affiliate_referral_codes (
        affiliate_id,
        program_name,
        referral_code,
        created_at
      ) VALUES ($1, $2, $3, NOW())
    `, [affiliateId, programName, code]);

    return code;
  }

  /**
   * Track affiliate click
   */
  async trackClick(referralCode, metadata = {}) {
    if (!this.enabled) return null;

    console.log('[AffiliateTracker] Click tracked:', referralCode);

    try {
      // Get affiliate info from referral code
      const result = await this.db.query(`
        SELECT affiliate_id, program_name
        FROM affiliate_referral_codes
        WHERE referral_code = $1
      `, [referralCode]);

      if (result.rows.length === 0) {
        console.error('[AffiliateTracker] Invalid referral code:', referralCode);
        return null;
      }

      const { affiliate_id, program_name } = result.rows[0];

      // Insert click record
      const clickResult = await this.db.query(`
        INSERT INTO affiliate_clicks (
          affiliate_id,
          program_name,
          referral_code,
          ip_address,
          user_agent,
          referrer_url,
          landing_page,
          metadata,
          clicked_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING click_id
      `, [
        affiliate_id,
        program_name,
        referralCode,
        metadata.ipAddress || null,
        metadata.userAgent || null,
        metadata.referrer || null,
        metadata.landingPage || null,
        JSON.stringify(metadata)
      ]);

      const clickId = clickResult.rows[0].click_id;

      // Emit event
      this.emit('click', {
        clickId,
        affiliateId: affiliate_id,
        programName: program_name,
        referralCode
      });

      return {
        clickId,
        affiliateId: affiliate_id,
        referralCode,
        expiresAt: new Date(Date.now() + this.cookieDuration * 24 * 60 * 60 * 1000)
      };

    } catch (error) {
      console.error('[AffiliateTracker] Click tracking error:', error.message);
      return null;
    }
  }

  /**
   * Track conversion (sale/signup)
   */
  async trackConversion(referralCode, conversionData) {
    if (!this.enabled) return null;

    console.log('[AffiliateTracker] Conversion tracked:', referralCode);

    try {
      // Get affiliate info
      const affiliateResult = await this.db.query(`
        SELECT affiliate_id, program_name
        FROM affiliate_referral_codes
        WHERE referral_code = $1
      `, [referralCode]);

      if (affiliateResult.rows.length === 0) {
        console.error('[AffiliateTracker] Invalid referral code for conversion:', referralCode);
        return null;
      }

      const { affiliate_id, program_name } = affiliateResult.rows[0];

      // Calculate commission
      const program = this.programs[program_name] || {};
      const commissionRate = program.commissionRate || this.defaultCommissionRate;
      const saleAmountCents = conversionData.saleAmountCents || 0;
      const commissionAmountCents = Math.round(saleAmountCents * commissionRate);

      // Insert conversion record
      const conversionResult = await this.db.query(`
        INSERT INTO affiliate_conversions (
          affiliate_id,
          program_name,
          referral_code,
          customer_id,
          sale_amount_cents,
          commission_amount_cents,
          commission_rate,
          subscription_id,
          product_name,
          metadata,
          conversion_date,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), 'pending')
        RETURNING conversion_id
      `, [
        affiliate_id,
        program_name,
        referralCode,
        conversionData.customerId || null,
        saleAmountCents,
        commissionAmountCents,
        commissionRate,
        conversionData.subscriptionId || null,
        conversionData.productName || null,
        JSON.stringify(conversionData.metadata || {})
      ]);

      const conversionId = conversionResult.rows[0].conversion_id;

      // Update affiliate stats
      await this.updateAffiliateStats(affiliate_id);

      // Emit event
      this.emit('conversion', {
        conversionId,
        affiliateId: affiliate_id,
        programName: program_name,
        saleAmount: saleAmountCents / 100,
        commissionAmount: commissionAmountCents / 100
      });

      return {
        conversionId,
        affiliateId: affiliate_id,
        commissionAmountCents
      };

    } catch (error) {
      console.error('[AffiliateTracker] Conversion tracking error:', error.message);
      return null;
    }
  }

  /**
   * Track recurring commission (for subscriptions)
   */
  async trackRecurringCommission(subscriptionId, periodData) {
    if (!this.enabled) return null;

    console.log('[AffiliateTracker] Recurring commission:', subscriptionId);

    try {
      // Find original conversion
      const originalConversion = await this.db.query(`
        SELECT
          affiliate_id,
          program_name,
          referral_code,
          commission_rate
        FROM affiliate_conversions
        WHERE subscription_id = $1
        ORDER BY conversion_date ASC
        LIMIT 1
      `, [subscriptionId]);

      if (originalConversion.rows.length === 0) {
        console.error('[AffiliateTracker] No original conversion found for subscription:', subscriptionId);
        return null;
      }

      const { affiliate_id, program_name, referral_code, commission_rate } = originalConversion.rows[0];

      // Calculate recurring commission
      const saleAmountCents = periodData.amountCents || 0;
      const commissionAmountCents = Math.round(saleAmountCents * commission_rate);

      // Insert recurring commission record
      const result = await this.db.query(`
        INSERT INTO affiliate_conversions (
          affiliate_id,
          program_name,
          referral_code,
          customer_id,
          sale_amount_cents,
          commission_amount_cents,
          commission_rate,
          subscription_id,
          product_name,
          metadata,
          conversion_date,
          status,
          is_recurring
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), 'pending', true)
        RETURNING conversion_id
      `, [
        affiliate_id,
        program_name,
        referral_code,
        periodData.customerId,
        saleAmountCents,
        commissionAmountCents,
        commission_rate,
        subscriptionId,
        periodData.productName || null,
        JSON.stringify(periodData.metadata || {})
      ]);

      // Update stats
      await this.updateAffiliateStats(affiliate_id);

      return result.rows[0].conversion_id;

    } catch (error) {
      console.error('[AffiliateTracker] Recurring commission error:', error.message);
      return null;
    }
  }

  /**
   * Update affiliate statistics
   */
  async updateAffiliateStats(affiliateId) {
    try {
      await this.db.query(`
        UPDATE affiliates
        SET
          total_clicks = (
            SELECT COUNT(*) FROM affiliate_clicks WHERE affiliate_id = $1
          ),
          total_conversions = (
            SELECT COUNT(*) FROM affiliate_conversions WHERE affiliate_id = $1
          ),
          total_commission_cents = (
            SELECT COALESCE(SUM(commission_amount_cents), 0)
            FROM affiliate_conversions
            WHERE affiliate_id = $1 AND status = 'approved'
          ),
          last_conversion_date = (
            SELECT MAX(conversion_date)
            FROM affiliate_conversions
            WHERE affiliate_id = $1
          )
        WHERE affiliate_id = $1
      `, [affiliateId]);
    } catch (error) {
      console.error('[AffiliateTracker] Stats update error:', error.message);
    }
  }

  /**
   * Get affiliate performance
   */
  async getAffiliatePerformance(affiliateId, dateRange = 30) {
    try {
      const result = await this.db.query(`
        SELECT
          COUNT(DISTINCT ac.click_id) as total_clicks,
          COUNT(DISTINCT acv.conversion_id) as total_conversions,
          ROUND(COUNT(DISTINCT acv.conversion_id)::numeric / NULLIF(COUNT(DISTINCT ac.click_id), 0) * 100, 2) as conversion_rate,
          COALESCE(SUM(acv.commission_amount_cents), 0) as total_commission_cents,
          COALESCE(SUM(CASE WHEN acv.status = 'approved' THEN acv.commission_amount_cents ELSE 0 END), 0) as approved_commission_cents,
          COALESCE(SUM(CASE WHEN acv.status = 'pending' THEN acv.commission_amount_cents ELSE 0 END), 0) as pending_commission_cents
        FROM affiliates a
        LEFT JOIN affiliate_clicks ac ON a.affiliate_id = ac.affiliate_id
          AND ac.clicked_at >= NOW() - INTERVAL '${dateRange} days'
        LEFT JOIN affiliate_conversions acv ON a.affiliate_id = acv.affiliate_id
          AND acv.conversion_date >= NOW() - INTERVAL '${dateRange} days'
        WHERE a.affiliate_id = $1
        GROUP BY a.affiliate_id
      `, [affiliateId]);

      return result.rows[0] || {};
    } catch (error) {
      console.error('[AffiliateTracker] Performance query error:', error.message);
      return {};
    }
  }

  /**
   * Get top affiliates
   */
  async getTopAffiliates(limit = 10, programName = null) {
    try {
      let query = `
        SELECT
          a.affiliate_id,
          a.affiliate_name,
          a.email,
          COUNT(DISTINCT acv.conversion_id) as conversions,
          COALESCE(SUM(acv.commission_amount_cents), 0) as total_commission_cents,
          MAX(acv.conversion_date) as last_conversion
        FROM affiliates a
        LEFT JOIN affiliate_conversions acv ON a.affiliate_id = acv.affiliate_id
      `;

      const params = [];
      if (programName) {
        query += ` WHERE acv.program_name = $1`;
        params.push(programName);
      }

      query += `
        GROUP BY a.affiliate_id, a.affiliate_name, a.email
        ORDER BY total_commission_cents DESC
        LIMIT $${params.length + 1}
      `;
      params.push(limit);

      const result = await this.db.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('[AffiliateTracker] Top affiliates query error:', error.message);
      return [];
    }
  }

  /**
   * Approve conversion (make commission payable)
   */
  async approveConversion(conversionId) {
    try {
      await this.db.query(`
        UPDATE affiliate_conversions
        SET status = 'approved', approved_at = NOW()
        WHERE conversion_id = $1
      `, [conversionId]);

      // Get affiliate_id to update stats
      const result = await this.db.query(
        'SELECT affiliate_id FROM affiliate_conversions WHERE conversion_id = $1',
        [conversionId]
      );

      if (result.rows.length > 0) {
        await this.updateAffiliateStats(result.rows[0].affiliate_id);
      }

      console.log('[AffiliateTracker] Conversion approved:', conversionId);
    } catch (error) {
      console.error('[AffiliateTracker] Approval error:', error.message);
    }
  }

  /**
   * Process payout for affiliate
   */
  async processPayout(affiliateId, programName = null) {
    try {
      // Get approved unpaid conversions
      let query = `
        SELECT
          conversion_id,
          commission_amount_cents
        FROM affiliate_conversions
        WHERE affiliate_id = $1
          AND status = 'approved'
          AND payout_id IS NULL
      `;

      const params = [affiliateId];

      if (programName) {
        query += ` AND program_name = $2`;
        params.push(programName);
      }

      const conversions = await this.db.query(query, params);

      if (conversions.rows.length === 0) {
        console.log('[AffiliateTracker] No conversions to pay out for affiliate:', affiliateId);
        return null;
      }

      // Calculate total payout
      const totalCents = conversions.rows.reduce((sum, row) => sum + parseInt(row.commission_amount_cents), 0);

      // Check minimum payout threshold
      const program = programName ? this.programs[programName] : null;
      const threshold = program ? program.payoutThreshold * 100 : 10000; // $100 default

      if (totalCents < threshold) {
        console.log(`[AffiliateTracker] Payout below threshold: $${totalCents / 100} < $${threshold / 100}`);
        return null;
      }

      // Create payout record
      const payoutResult = await this.db.query(`
        INSERT INTO affiliate_payouts (
          affiliate_id,
          program_name,
          amount_cents,
          conversion_count,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, 'pending', NOW())
        RETURNING payout_id
      `, [affiliateId, programName, totalCents, conversions.rows.length]);

      const payoutId = payoutResult.rows[0].payout_id;

      // Link conversions to payout
      const conversionIds = conversions.rows.map(r => r.conversion_id);
      await this.db.query(`
        UPDATE affiliate_conversions
        SET payout_id = $1
        WHERE conversion_id = ANY($2)
      `, [payoutId, conversionIds]);

      console.log(`[AffiliateTracker] Payout created: ${payoutId} ($${totalCents / 100})`);

      return {
        payoutId,
        amountCents: totalCents,
        conversionCount: conversions.rows.length
      };

    } catch (error) {
      console.error('[AffiliateTracker] Payout processing error:', error.message);
      return null;
    }
  }

  /**
   * Get affiliate dashboard data
   */
  async getAffiliateDashboard(affiliateId) {
    try {
      const performance = await this.getAffiliatePerformance(affiliateId, 30);

      const unpaidResult = await this.db.query(`
        SELECT COALESCE(SUM(commission_amount_cents), 0) as unpaid_cents
        FROM affiliate_conversions
        WHERE affiliate_id = $1
          AND status = 'approved'
          AND payout_id IS NULL
      `, [affiliateId]);

      const recentConversions = await this.db.query(`
        SELECT
          conversion_id,
          program_name,
          sale_amount_cents,
          commission_amount_cents,
          product_name,
          conversion_date,
          status
        FROM affiliate_conversions
        WHERE affiliate_id = $1
        ORDER BY conversion_date DESC
        LIMIT 10
      `, [affiliateId]);

      return {
        performance,
        unpaidCommissionCents: parseInt(unpaidResult.rows[0].unpaid_cents),
        recentConversions: recentConversions.rows
      };

    } catch (error) {
      console.error('[AffiliateTracker] Dashboard query error:', error.message);
      return null;
    }
  }
}

module.exports = AffiliateTracker;

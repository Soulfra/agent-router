/**
 * Mailer Engine
 *
 * Manage physical mailer campaigns and coupon codes
 * - Create campaigns (monthly/yearly mailings like Bucky Book)
 * - Generate and track coupon codes
 * - Redeem coupons and apply benefits
 * - Track deliveries and redemptions
 */

// Database connection (injected via initEngine)
let db = null;

/**
 * Initialize engine with database connection
 */
function initEngine(database) {
  db = database;
}

/**
 * Create a new mailer campaign
 *
 * @param {Object} campaignData - Campaign details
 * @returns {Promise<Object>} Created campaign
 */
async function createCampaign(campaignData) {
  try {
    const {
      campaignName,
      campaignType = 'monthly',
      description,
      mailDate,
      expectedDeliveryStart,
      expectedDeliveryEnd,
      targetAgeBrackets = null,
      targetRegions = null,
      targetUserIds = null,
      mailerFormat = 'postcard',
      printQuantity,
      printCostCents,
      postageCostCents,
      couponsPerMailer = 1,
      createdBy
    } = campaignData;

    const result = await db.query(`
      INSERT INTO mailer_campaigns (
        campaign_name,
        campaign_type,
        description,
        mail_date,
        expected_delivery_start,
        expected_delivery_end,
        target_age_brackets,
        target_regions,
        target_user_ids,
        mailer_format,
        print_quantity,
        print_cost_cents,
        postage_cost_cents,
        coupons_per_mailer,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      campaignName,
      campaignType,
      description,
      mailDate,
      expectedDeliveryStart,
      expectedDeliveryEnd,
      targetAgeBrackets,
      targetRegions,
      targetUserIds,
      mailerFormat,
      printQuantity,
      printCostCents,
      postageCostCents,
      couponsPerMailer,
      createdBy
    ]);

    return result.rows[0];

  } catch (error) {
    console.error('[Mailer Engine] Create campaign error:', error);
    throw error;
  }
}

/**
 * Generate coupon codes for a campaign
 *
 * @param {string} campaignId - Campaign UUID
 * @param {number} count - Number of coupons to generate
 * @param {Object} benefitConfig - Benefit configuration
 * @returns {Promise<Array>} Generated coupons
 */
async function generateCoupons(campaignId, count, benefitConfig) {
  try {
    const {
      couponType,
      benefitData,
      validFrom,
      validUntil,
      maxUses = 1
    } = benefitConfig;

    const coupons = [];

    for (let i = 0; i < count; i++) {
      const result = await db.query(
        'SELECT create_coupon_code($1, $2, $3, $4, $5, $6)',
        [
          campaignId,
          couponType,
          JSON.stringify(benefitData),
          validFrom,
          validUntil,
          maxUses
        ]
      );

      const couponId = result.rows[0].create_coupon_code;

      // Get the full coupon details
      const coupon = await db.query(
        'SELECT * FROM coupon_codes WHERE coupon_id = $1',
        [couponId]
      );

      coupons.push(coupon.rows[0]);
    }

    return coupons;

  } catch (error) {
    console.error('[Mailer Engine] Generate coupons error:', error);
    throw error;
  }
}

/**
 * Redeem a coupon code
 *
 * @param {string} couponCode - Coupon code to redeem
 * @param {string} userId - User redeeming the coupon
 * @param {string} sessionId - Optional session ID
 * @param {string} ipAddress - Optional IP address
 * @returns {Promise<Object>} Redemption result
 */
async function redeemCoupon(couponCode, userId, sessionId = null, ipAddress = null) {
  try {
    const result = await db.query(
      'SELECT * FROM redeem_coupon($1, $2, $3, $4)',
      [couponCode, userId, sessionId, ipAddress]
    );

    const redemption = result.rows[0];

    if (!redemption.success) {
      return {
        success: false,
        error: redemption.message
      };
    }

    // Apply benefits based on coupon type
    const appliedBenefits = await applyCouponBenefits(
      userId,
      redemption.coupon_id,
      redemption.benefits_applied
    );

    return {
      success: true,
      message: redemption.message,
      couponId: redemption.coupon_id,
      benefits: appliedBenefits
    };

  } catch (error) {
    console.error('[Mailer Engine] Redeem coupon error:', error);
    throw error;
  }
}

/**
 * Apply coupon benefits to user
 *
 * @param {string} userId - User UUID
 * @param {string} couponId - Coupon UUID
 * @param {Object} benefits - Benefits to apply
 * @returns {Promise<Object>} Applied benefits
 */
async function applyCouponBenefits(userId, couponId, benefits) {
  const applied = [];

  try {
    // XP Boost
    if (benefits.multiplier && benefits.duration_hours) {
      // Store XP boost in a temporary table or user metadata
      await db.query(`
        INSERT INTO user_active_effects (user_id, effect_type, effect_data, expires_at)
        VALUES ($1, 'xp_boost', $2, NOW() + INTERVAL '1 hour' * $3)
      `, [userId, JSON.stringify({ multiplier: benefits.multiplier }), benefits.duration_hours]);

      applied.push({
        type: 'xp_boost',
        multiplier: benefits.multiplier,
        duration: benefits.duration_hours
      });
    }

    // League Entry
    if (benefits.league_type) {
      // This would be handled by the leagues engine
      applied.push({
        type: 'league_entry',
        leagueType: benefits.league_type,
        tier: benefits.tier
      });
    }

    // Free Actions
    if (benefits.action_code && benefits.count) {
      // Store free action credits
      await db.query(`
        INSERT INTO user_free_action_credits (user_id, action_code, credits_remaining, source)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, action_code)
        DO UPDATE SET credits_remaining = user_free_action_credits.credits_remaining + $3
      `, [userId, benefits.action_code, benefits.count, 'coupon:' + couponId]);

      applied.push({
        type: 'free_actions',
        actionCode: benefits.action_code,
        count: benefits.count
      });
    }

    // Custom benefits
    if (benefits.free_actions) {
      for (const [actionCode, count] of Object.entries(benefits.free_actions)) {
        await db.query(`
          INSERT INTO user_free_action_credits (user_id, action_code, credits_remaining, source)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id, action_code)
          DO UPDATE SET credits_remaining = user_free_action_credits.credits_remaining + $3
        `, [userId, actionCode, count, 'coupon:' + couponId]);

        applied.push({
          type: 'free_actions',
          actionCode,
          count
        });
      }
    }

    return applied;

  } catch (error) {
    console.error('[Mailer Engine] Apply coupon benefits error:', error);
    throw error;
  }
}

/**
 * Get campaign details with statistics
 *
 * @param {string} campaignId - Campaign UUID
 * @returns {Promise<Object>} Campaign details
 */
async function getCampaignDetails(campaignId) {
  try {
    const result = await db.query(
      'SELECT * FROM mailer_campaign_summary WHERE campaign_id = $1',
      [campaignId]
    );

    return result.rows[0] || null;

  } catch (error) {
    console.error('[Mailer Engine] Get campaign details error:', error);
    return null;
  }
}

/**
 * Get all campaigns with optional filtering
 *
 * @param {Object} filters - Optional filters (status, campaign_type)
 * @returns {Promise<Array>} Campaigns
 */
async function getAllCampaigns(filters = {}) {
  try {
    let query = 'SELECT * FROM mailer_campaign_summary WHERE 1=1';
    const params = [];

    if (filters.status) {
      params.push(filters.status);
      query += ` AND status = $${params.length}`;
    }

    if (filters.campaignType) {
      params.push(filters.campaignType);
      query += ` AND campaign_type = $${params.length}`;
    }

    query += ' ORDER BY mail_date DESC';

    const result = await db.query(query, params);
    return result.rows;

  } catch (error) {
    console.error('[Mailer Engine] Get all campaigns error:', error);
    return [];
  }
}

/**
 * Get user's available coupons
 *
 * @param {string} userId - User UUID
 * @returns {Promise<Array>} User's coupons
 */
async function getUserCoupons(userId) {
  try {
    const result = await db.query(
      'SELECT * FROM user_coupon_inventory WHERE user_id = $1',
      [userId]
    );

    return result.rows;

  } catch (error) {
    console.error('[Mailer Engine] Get user coupons error:', error);
    return [];
  }
}

/**
 * Validate coupon code (check without redeeming)
 *
 * @param {string} couponCode - Coupon code to validate
 * @returns {Promise<Object>} Validation result
 */
async function validateCoupon(couponCode) {
  try {
    const result = await db.query(`
      SELECT
        cc.*,
        mc.campaign_name,
        CASE
          WHEN cc.times_redeemed > 0 THEN 'used'
          WHEN CURRENT_DATE > cc.valid_until THEN 'expired'
          WHEN CURRENT_DATE < cc.valid_from THEN 'not_yet_valid'
          WHEN cc.uses_remaining IS NOT NULL AND cc.uses_remaining <= 0 THEN 'used_up'
          WHEN NOT cc.enabled THEN 'disabled'
          ELSE 'valid'
        END AS status
      FROM coupon_codes cc
      JOIN mailer_campaigns mc ON mc.campaign_id = cc.campaign_id
      WHERE cc.coupon_code = $1
    `, [couponCode]);

    if (result.rows.length === 0) {
      return {
        valid: false,
        reason: 'Coupon code not found'
      };
    }

    const coupon = result.rows[0];

    return {
      valid: coupon.status === 'valid',
      reason: coupon.status === 'valid' ? 'Coupon is valid' : `Coupon is ${coupon.status}`,
      coupon: coupon.status === 'valid' ? {
        couponType: coupon.coupon_type,
        benefits: coupon.benefit_data,
        validFrom: coupon.valid_from,
        validUntil: coupon.valid_until,
        usesRemaining: coupon.uses_remaining
      } : null
    };

  } catch (error) {
    console.error('[Mailer Engine] Validate coupon error:', error);
    return {
      valid: false,
      reason: 'System error'
    };
  }
}

/**
 * Track mailer delivery
 *
 * @param {string} campaignId - Campaign UUID
 * @param {string} userId - User UUID (optional)
 * @param {Object} mailingAddress - Mailing address
 * @param {Array} couponIds - Coupon IDs included in mailer
 * @returns {Promise<Object>} Delivery record
 */
async function trackDelivery(campaignId, userId, mailingAddress, couponIds) {
  try {
    const result = await db.query(`
      INSERT INTO mailer_deliveries (
        campaign_id,
        user_id,
        mailing_address,
        mailed_at,
        coupon_ids
      )
      VALUES ($1, $2, $3, CURRENT_DATE, $4)
      RETURNING *
    `, [campaignId, userId, JSON.stringify(mailingAddress), couponIds]);

    return result.rows[0];

  } catch (error) {
    console.error('[Mailer Engine] Track delivery error:', error);
    throw error;
  }
}

/**
 * Get benefit templates
 *
 * @returns {Promise<Array>} Benefit templates
 */
async function getBenefitTemplates() {
  try {
    const result = await db.query(
      'SELECT * FROM coupon_benefit_templates WHERE enabled = TRUE ORDER BY template_name'
    );

    return result.rows;

  } catch (error) {
    console.error('[Mailer Engine] Get benefit templates error:', error);
    return [];
  }
}

/**
 * Get coupon redemption statistics
 *
 * @returns {Promise<Array>} Redemption stats by type
 */
async function getRedemptionStats() {
  try {
    const result = await db.query('SELECT * FROM coupon_redemption_stats');
    return result.rows;

  } catch (error) {
    console.error('[Mailer Engine] Get redemption stats error:', error);
    return [];
  }
}

module.exports = {
  initEngine,
  createCampaign,
  generateCoupons,
  redeemCoupon,
  applyCouponBenefits,
  getCampaignDetails,
  getAllCampaigns,
  getUserCoupons,
  validateCoupon,
  trackDelivery,
  getBenefitTemplates,
  getRedemptionStats
};

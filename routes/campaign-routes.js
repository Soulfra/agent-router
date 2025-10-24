/**
 * Campaign Routes - Ad Gateway API
 *
 * Simple API for agencies/advertisers to:
 * - Create advertising campaigns
 * - Track performance
 * - View A/B test results
 * - Manage budgets
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with dependencies
 */
function initRoutes(db, campaignManager) {
  if (!db) {
    throw new Error('Database connection required for campaign routes');
  }

  if (!campaignManager) {
    throw new Error('CampaignManager required for campaign routes');
  }

  /**
   * POST /api/campaigns
   * Create new advertising campaign
   *
   * Request body:
   * {
   *   "campaign_name": "Q1 2024 Crypto Campaign",
   *   "budget_cents": 100000,
   *   "target_vertical": "crypto",
   *   "ad_copy": "Trade smarter with AI",
   *   "landing_page_url": "https://example.com/crypto",
   *   "use_client_keys": false,
   *   "pricing_model": "commission"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "campaign": {...},
   *   "experiment_id": 123
   * }
   */
  router.post('/campaigns', async (req, res) => {
    try {
      const userId = req.session?.userId || req.headers['x-user-id'] || req.body.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const {
        advertiser_id,
        campaign_name,
        campaign_description,
        target_vertical = 'all',
        budget_cents,
        daily_budget_cents,
        ad_copy,
        landing_page_url,
        use_client_keys = false,
        client_has_openai = false,
        client_has_anthropic = false,
        client_has_deepseek = false,
        pricing_model = 'commission',
        commission_rate,
        starts_at,
        ends_at
      } = req.body;

      // Optional: Get tenant_id from user if available
      let tenantId = null;
      try {
        const userResult = await db.query(
          'SELECT id FROM users WHERE id = $1',
          [userId]
        );
        if (userResult.rows.length === 0) {
          return res.status(401).json({
            success: false,
            error: 'User not found'
          });
        }
      } catch (error) {
        console.warn('[CampaignRoutes] User lookup failed:', error.message);
      }

      const result = await campaignManager.createCampaign({
        advertiser_id,
        tenant_id: tenantId,
        created_by: userId,
        campaign_name,
        campaign_description,
        target_vertical,
        budget_cents,
        daily_budget_cents,
        ad_copy,
        landing_page_url,
        use_client_keys,
        client_has_openai,
        client_has_anthropic,
        client_has_deepseek,
        pricing_model,
        commission_rate,
        starts_at,
        ends_at
      });

      res.json(result);

    } catch (error) {
      console.error('[CampaignRoutes] Create campaign failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create campaign',
        details: error.message
      });
    }
  });

  /**
   * GET /api/campaigns
   * List all campaigns
   *
   * Query params:
   * - status: 'active', 'paused', 'completed'
   * - advertiser_id: Filter by advertiser
   *
   * Response:
   * {
   *   "success": true,
   *   "campaigns": [...]
   * }
   */
  router.get('/campaigns', async (req, res) => {
    try {
      const userId = req.session?.userId || req.headers['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const { status, advertiser_id } = req.query;

      const campaigns = await campaignManager.listCampaigns({
        status,
        advertiser_id
      });

      res.json({
        success: true,
        campaigns,
        count: campaigns.length
      });

    } catch (error) {
      console.error('[CampaignRoutes] List campaigns failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list campaigns',
        details: error.message
      });
    }
  });

  /**
   * GET /api/campaigns/:id
   * Get campaign details
   */
  router.get('/campaigns/:id', async (req, res) => {
    try {
      const userId = req.session?.userId || req.headers['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const campaignId = req.params.id;

      const campaign = await campaignManager.getCampaignPerformance(campaignId);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      res.json({
        success: true,
        campaign
      });

    } catch (error) {
      console.error('[CampaignRoutes] Get campaign failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get campaign',
        details: error.message
      });
    }
  });

  /**
   * POST /api/campaigns/:id/start
   * Start campaign
   */
  router.post('/campaigns/:id/start', async (req, res) => {
    try {
      const userId = req.session?.userId || req.headers['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const campaignId = req.params.id;

      const campaign = await campaignManager.startCampaign(campaignId);

      res.json({
        success: true,
        campaign,
        message: 'Campaign started successfully'
      });

    } catch (error) {
      console.error('[CampaignRoutes] Start campaign failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start campaign',
        details: error.message
      });
    }
  });

  /**
   * POST /api/campaigns/:id/pause
   * Pause campaign
   */
  router.post('/campaigns/:id/pause', async (req, res) => {
    try {
      const userId = req.session?.userId || req.headers['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const campaignId = req.params.id;

      const campaign = await campaignManager.pauseCampaign(campaignId);

      res.json({
        success: true,
        campaign,
        message: 'Campaign paused successfully'
      });

    } catch (error) {
      console.error('[CampaignRoutes] Pause campaign failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to pause campaign',
        details: error.message
      });
    }
  });

  /**
   * GET /api/campaigns/:id/variants
   * Get A/B test variant performance
   */
  router.get('/campaigns/:id/variants', async (req, res) => {
    try {
      const userId = req.session?.userId || req.headers['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const campaignId = req.params.id;

      const variants = await campaignManager.getVariantPerformance(campaignId);

      res.json({
        success: true,
        variants,
        count: variants.length
      });

    } catch (error) {
      console.error('[CampaignRoutes] Get variants failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get variants',
        details: error.message
      });
    }
  });

  /**
   * POST /api/campaigns/track/impression
   * Track campaign impression
   *
   * Request body:
   * {
   *   "campaign_id": "uuid",
   *   "variant_id": "uuid"
   * }
   */
  router.post('/campaigns/track/impression', async (req, res) => {
    try {
      const { campaign_id, variant_id } = req.body;

      await campaignManager.trackImpression(campaign_id, variant_id);

      res.json({
        success: true,
        message: 'Impression tracked'
      });

    } catch (error) {
      console.error('[CampaignRoutes] Track impression failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to track impression',
        details: error.message
      });
    }
  });

  /**
   * POST /api/campaigns/track/click
   * Track campaign click
   */
  router.post('/campaigns/track/click', async (req, res) => {
    try {
      const { campaign_id, variant_id } = req.body;

      await campaignManager.trackClick(campaign_id, variant_id);

      res.json({
        success: true,
        message: 'Click tracked'
      });

    } catch (error) {
      console.error('[CampaignRoutes] Track click failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to track click',
        details: error.message
      });
    }
  });

  /**
   * POST /api/campaigns/track/conversion
   * Track campaign conversion
   *
   * Request body:
   * {
   *   "campaign_id": "uuid",
   *   "variant_id": "uuid",
   *   "conversion_type": "purchase",
   *   "conversion_value_cents": 5000,
   *   "ai_cost_cents": 10
   * }
   */
  router.post('/campaigns/track/conversion', async (req, res) => {
    try {
      const {
        campaign_id,
        variant_id,
        conversion_type,
        conversion_value_cents,
        ai_cost_cents,
        metadata
      } = req.body;

      const conversionId = await campaignManager.recordConversion({
        campaign_id,
        variant_id,
        conversion_type,
        conversion_value_cents,
        ai_cost_cents,
        metadata
      });

      res.json({
        success: true,
        conversion_id: conversionId,
        message: 'Conversion tracked'
      });

    } catch (error) {
      console.error('[CampaignRoutes] Track conversion failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to track conversion',
        details: error.message
      });
    }
  });

  return router;
}

module.exports = { initRoutes };

/**
 * Campaign Manager - Ad Gateway System
 *
 * "Bring us your ad budget, we'll A/B test it across our AI infrastructure"
 *
 * Integrates:
 * - Existing A/B testing (lib/ai-ab-testing.js, lib/experiment-manager.js)
 * - Existing affiliate system (lib/affiliate-tracker.js)
 * - Existing BYOK system (lib/vault-bridge.js)
 * - Multi-provider AI routing (lib/multi-provider-router.js)
 * - Triangle Consensus (lib/triangle-consensus-engine.js)
 *
 * Business Model:
 * 1. Agencies bring ad budgets
 * 2. We A/B test across AI models + verticals
 * 3. Auto-optimize to winning variants
 * 4. Track conversions + revenue attribution
 * 5. Revenue: Commission (25%) + API markup (50% if using our keys) + platform fees
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class CampaignManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.experimentManager = options.experimentManager;
    this.affiliateTracker = options.affiliateTracker;
    this.multiProviderRouter = options.multiProviderRouter;
    this.triangleEngine = options.triangleEngine;

    // Default configuration
    this.config = {
      defaultCommissionRate: 0.25, // 25% commission
      platformFeeRate: 0.05, // 5% platform fee when using client keys
      apiMarkupRate: 0.50, // 50% markup when using platform keys
      defaultVariants: 3, // Default number of A/B test variants
      autoOptimizeThreshold: 100, // Min conversions before auto-optimization
      minBudgetCents: 10000 // Minimum $100 budget
    };

    console.log('[CampaignManager] Initialized');
  }

  /**
   * Create new advertising campaign with A/B testing
   *
   * @param {object} campaignSpec - Campaign specification
   * @returns {Promise<object>} - Campaign details with experiment IDs
   */
  async createCampaign(campaignSpec) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    const {
      advertiser_id,
      tenant_id,
      created_by,
      campaign_name,
      campaign_description,
      target_vertical = 'all', // 'crypto', 'publishing', 'gaming', 'dev_tools', 'all'
      budget_cents,
      daily_budget_cents,
      ad_copy,
      landing_page_url,
      use_client_keys = false,
      client_has_openai = false,
      client_has_anthropic = false,
      client_has_deepseek = false,
      pricing_model = 'commission',
      commission_rate = this.config.defaultCommissionRate,
      auto_optimize = true,
      starts_at,
      ends_at
    } = campaignSpec;

    // Validation
    if (budget_cents < this.config.minBudgetCents) {
      throw new Error(`Minimum budget is $${this.config.minBudgetCents / 100}`);
    }

    if (!campaign_name || campaign_name.trim().length === 0) {
      throw new Error('Campaign name is required');
    }

    try {
      await this.db.query('BEGIN');

      // Step 1: Create A/B test experiment
      const experimentId = await this._createExperiment({
        campaign_name,
        target_vertical,
        use_client_keys,
        client_has_openai,
        client_has_anthropic,
        client_has_deepseek
      });

      // Step 2: Create campaign
      const campaignResult = await this.db.query(`
        INSERT INTO ad_campaigns (
          advertiser_id,
          tenant_id,
          created_by,
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
          experiment_id,
          auto_optimize,
          pricing_model,
          commission_rate,
          starts_at,
          ends_at,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'draft')
        RETURNING *
      `, [
        advertiser_id, tenant_id, created_by, campaign_name, campaign_description,
        target_vertical, budget_cents, daily_budget_cents, ad_copy, landing_page_url,
        use_client_keys, client_has_openai, client_has_anthropic, client_has_deepseek,
        experimentId, auto_optimize, pricing_model, commission_rate,
        starts_at, ends_at
      ]);

      const campaign = campaignResult.rows[0];

      // Step 3: Create campaign variants (automatically)
      await this._createVariants(campaign.campaign_id, experimentId, use_client_keys, {
        client_has_openai,
        client_has_anthropic,
        client_has_deepseek
      });

      await this.db.query('COMMIT');

      console.log(`[CampaignManager] Created campaign: ${campaign_name} (${campaign.campaign_id})`);
      console.log(`[CampaignManager] Linked to experiment: ${experimentId}`);

      this.emit('campaign_created', {
        campaign_id: campaign.campaign_id,
        campaign_name,
        experiment_id: experimentId
      });

      return {
        success: true,
        campaign,
        experiment_id: experimentId
      };

    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('[CampaignManager] Failed to create campaign:', error);
      throw error;
    }
  }

  /**
   * Create A/B test experiment for campaign
   * Uses existing experiment-manager.js system
   *
   * @private
   */
  async _createExperiment({ campaign_name, target_vertical, use_client_keys, client_has_openai, client_has_anthropic, client_has_deepseek }) {
    if (!this.experimentManager) {
      console.warn('[CampaignManager] ExperimentManager not available, creating experiment directly');
      return null;
    }

    // Determine which AI providers to test
    const providers = [];

    if (!use_client_keys) {
      // Using platform keys - test all 3
      providers.push('openai', 'anthropic', 'deepseek');
    } else {
      // Using client keys - only test providers they have
      if (client_has_openai) providers.push('openai');
      if (client_has_anthropic) providers.push('anthropic');
      if (client_has_deepseek) providers.push('deepseek');

      // Fill in with platform keys for providers they don't have
      if (!client_has_openai) providers.push('openai-platform');
      if (!client_has_anthropic) providers.push('anthropic-platform');
      if (!client_has_deepseek) providers.push('deepseek-platform');
    }

    // Create variants for experiment
    const trafficPercent = 100 / providers.length; // Equal traffic split as percentage
    const variants = providers.map((provider, index) => ({
      name: `Variant ${String.fromCharCode(65 + index)} - ${provider}`,
      config: {
        provider: provider.replace('-platform', ''),
        model: this._getDefaultModel(provider.replace('-platform', '')),
        use_platform_key: provider.includes('-platform')
      },
      traffic: trafficPercent
    }));

    const experimentSpec = {
      name: `${campaign_name} - A/B Test`,
      description: `AI provider A/B test for campaign: ${campaign_name}`,
      experimentType: 'ai_provider',
      domain: target_vertical,
      variants,
      primaryMetric: 'conversion_rate',
      secondaryMetrics: ['cost_per_conversion', 'roi'],
      autoOptimize: true,
      minSampleSize: 100,
      duration: 30 // days
    };

    const experimentId = await this.experimentManager.createExperiment(experimentSpec);
    console.log(`[CampaignManager] Created experiment: ${experimentId}`);

    return experimentId;
  }

  /**
   * Create campaign variants (A, B, C variants for A/B testing)
   *
   * @private
   */
  async _createVariants(campaignId, experimentId, useClientKeys, clientKeys) {
    const providers = [];

    // Determine which providers to test
    if (!useClientKeys) {
      providers.push(
        { provider: 'openai', model: 'gpt-4' },
        { provider: 'anthropic', model: 'claude-3-sonnet-20240229' },
        { provider: 'deepseek', model: 'deepseek-chat' }
      );
    } else {
      if (clientKeys.client_has_openai) {
        providers.push({ provider: 'openai', model: 'gpt-4', use_client: true });
      }
      if (clientKeys.client_has_anthropic) {
        providers.push({ provider: 'anthropic', model: 'claude-3-sonnet-20240229', use_client: true });
      }
      if (clientKeys.client_has_deepseek) {
        providers.push({ provider: 'deepseek', model: 'deepseek-chat', use_client: true });
      }

      // Fill gaps with platform keys
      if (!clientKeys.client_has_openai) {
        providers.push({ provider: 'openai', model: 'gpt-4', use_client: false });
      }
      if (!clientKeys.client_has_anthropic) {
        providers.push({ provider: 'anthropic', model: 'claude-3-sonnet-20240229', use_client: false });
      }
      if (!clientKeys.client_has_deepseek) {
        providers.push({ provider: 'deepseek', model: 'deepseek-chat', use_client: false });
      }
    }

    const trafficWeight = 1 / providers.length;

    for (let i = 0; i < providers.length; i++) {
      const { provider, model, use_client } = providers[i];

      await this.db.query(`
        INSERT INTO campaign_variants (
          campaign_id,
          variant_name,
          variant_description,
          ai_provider,
          ai_model,
          traffic_weight,
          system_prompt
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        campaignId,
        `Variant ${String.fromCharCode(65 + i)}`,
        `${provider} (${model}) ${use_client ? '- Client Key' : '- Platform Key'}`,
        provider,
        model,
        trafficWeight,
        'You are a helpful AI assistant for an advertising campaign.'
      ]);
    }

    console.log(`[CampaignManager] Created ${providers.length} variants for campaign ${campaignId}`);
  }

  /**
   * Get default AI model for provider
   *
   * @private
   */
  _getDefaultModel(provider) {
    const models = {
      openai: 'gpt-4',
      anthropic: 'claude-3-sonnet-20240229',
      deepseek: 'deepseek-chat'
    };
    return models[provider] || 'gpt-4';
  }

  /**
   * Start campaign (activate it)
   */
  async startCampaign(campaignId) {
    const result = await this.db.query(`
      UPDATE ad_campaigns
      SET status = 'active',
          starts_at = COALESCE(starts_at, NOW()),
          updated_at = NOW()
      WHERE campaign_id = $1
      RETURNING *
    `, [campaignId]);

    if (result.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    const campaign = result.rows[0];
    console.log(`[CampaignManager] Started campaign: ${campaign.campaign_name}`);

    this.emit('campaign_started', { campaign_id: campaignId });

    return campaign;
  }

  /**
   * Pause campaign
   */
  async pauseCampaign(campaignId) {
    const result = await this.db.query(`
      UPDATE ad_campaigns
      SET status = 'paused',
          paused_at = NOW(),
          updated_at = NOW()
      WHERE campaign_id = $1
      RETURNING *
    `, [campaignId]);

    if (result.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    return result.rows[0];
  }

  /**
   * Track campaign impression
   */
  async trackImpression(campaignId, variantId) {
    await this.db.query(
      'SELECT track_campaign_impression($1, $2)',
      [campaignId, variantId]
    );

    this.emit('impression', { campaign_id: campaignId, variant_id: variantId });
  }

  /**
   * Track campaign click
   */
  async trackClick(campaignId, variantId) {
    await this.db.query(
      'SELECT track_campaign_click($1, $2)',
      [campaignId, variantId]
    );

    this.emit('click', { campaign_id: campaignId, variant_id: variantId });
  }

  /**
   * Record conversion with full attribution
   */
  async recordConversion({ campaign_id, variant_id, conversion_type, conversion_value_cents, ai_cost_cents, metadata = {} }) {
    const result = await this.db.query(
      'SELECT record_campaign_conversion($1, $2, $3, $4, $5, $6) as conversion_id',
      [campaign_id, variant_id, conversion_type, conversion_value_cents, ai_cost_cents, JSON.stringify(metadata)]
    );

    const conversionId = result.rows[0].conversion_id;

    console.log(`[CampaignManager] Recorded conversion: ${conversion_type} ($${conversion_value_cents / 100})`);

    this.emit('conversion', {
      campaign_id,
      variant_id,
      conversion_id: conversionId,
      conversion_type,
      conversion_value_cents
    });

    return conversionId;
  }

  /**
   * Get campaign performance
   */
  async getCampaignPerformance(campaignId) {
    const result = await this.db.query(
      'SELECT * FROM campaign_performance WHERE campaign_id = $1',
      [campaignId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get variant performance for campaign
   */
  async getVariantPerformance(campaignId) {
    const result = await this.db.query(
      'SELECT * FROM variant_performance WHERE campaign_id = $1 ORDER BY conversions DESC',
      [campaignId]
    );

    return result.rows;
  }

  /**
   * List all campaigns
   */
  async listCampaigns(filters = {}) {
    let query = 'SELECT * FROM campaign_performance WHERE 1=1';
    const params = [];

    if (filters.advertiser_id) {
      params.push(filters.advertiser_id);
      query += ` AND advertiser_id = $${params.length}`;
    }

    if (filters.status) {
      params.push(filters.status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await this.db.query(query, params);
    return result.rows;
  }
}

module.exports = CampaignManager;

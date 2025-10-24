/**
 * Brand Engagement Analytics
 *
 * Tracks user engagement across multiple brands and AI models.
 *
 * Features:
 * - Track engagement per brand (CALOS, Soulfra, talkshitwithfriends, etc.)
 * - Monitor which AI models users prefer
 * - Cross-brand analytics
 * - Model personality preference tracking
 * - Funny moment detection
 *
 * Use Case: "See which brands people engage with and what models they like"
 */

const axios = require('axios');

class BrandEngagementAnalytics {
  constructor(options = {}) {
    this.db = options.db;
    this.ollamaClient = options.ollamaClient;

    this.config = {
      ollamaModel: options.ollamaModel || 'mistral:latest',
      ollamaHost: options.ollamaHost || 'http://127.0.0.1:11434',

      // Brand list
      brands: options.brands || [
        'calos',
        'soulfra',
        'calriven',
        'vibecoding',
        'talkshitwithfriends',
        'roughsparks',
        'deathtodata'
      ],

      // Model tracking
      models: options.models || [
        'mistral',
        'llama3.2',
        'codellama',
        'qwen2.5-coder',
        'calos-model'
      ]
    };

    // In-memory engagement tracking
    this.brandEngagement = new Map(); // brand -> engagement data
    this.modelPreferences = new Map(); // model -> usage count
    this.funnyMoments = [];

    // Initialize brand engagement
    for (const brand of this.config.brands) {
      this.brandEngagement.set(brand, {
        interactions: 0,
        uniqueUsers: new Set(),
        messages: 0,
        avgSessionLength: 0,
        modelUsage: new Map()
      });
    }

    console.log('[BrandEngagementAnalytics] Initialized');
    console.log(`  Tracking ${this.config.brands.length} brands`);
    console.log(`  Tracking ${this.config.models.length} models`);
  }

  /**
   * Track brand interaction
   */
  async trackInteraction({ brand, userId, model, messageLength, sessionId, metadata = {} }) {
    try {
      // Validate brand
      if (!this.config.brands.includes(brand)) {
        console.warn(`[BrandEngagementAnalytics] Unknown brand: ${brand}`);
        return { success: false, error: 'Unknown brand' };
      }

      // Update in-memory tracking
      const engagement = this.brandEngagement.get(brand);
      engagement.interactions++;
      engagement.messages++;
      engagement.uniqueUsers.add(userId);

      // Track model usage per brand
      if (model) {
        if (!engagement.modelUsage.has(model)) {
          engagement.modelUsage.set(model, 0);
        }
        engagement.modelUsage.set(model, engagement.modelUsage.get(model) + 1);

        // Update global model preferences
        this.modelPreferences.set(model, (this.modelPreferences.get(model) || 0) + 1);
      }

      // Store in database
      if (this.db) {
        await this.db.query(`
          INSERT INTO brand_engagement_metrics (
            brand,
            user_id,
            model,
            message_length,
            session_id,
            metadata,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
          brand,
          userId,
          model,
          messageLength,
          sessionId,
          JSON.stringify(metadata)
        ]);
      }

      return {
        success: true,
        brand,
        totalInteractions: engagement.interactions,
        uniqueUsers: engagement.uniqueUsers.size
      };

    } catch (error) {
      console.error('[BrandEngagementAnalytics] Error tracking interaction:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Track model interaction (which AI model was used)
   */
  async trackModelInteraction({ model, userId, brand, prompt, response, rating = null }) {
    if (!this.db) return null;

    try {
      const result = await this.db.query(`
        INSERT INTO model_interaction_tracking (
          model,
          user_id,
          brand,
          prompt_length,
          response_length,
          rating,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING interaction_id
      `, [
        model,
        userId,
        brand,
        prompt.length,
        response.length,
        rating
      ]);

      return result.rows[0]?.interaction_id;
    } catch (error) {
      console.warn('[BrandEngagementAnalytics] Failed to track model interaction:', error.message);
      return null;
    }
  }

  /**
   * Detect and log funny moments
   */
  async logFunnyMoment({ brand, botId, message, context, funniness = 5 }) {
    const moment = {
      momentId: this._generateId(),
      brand,
      botId,
      message,
      context,
      funniness,
      timestamp: new Date()
    };

    // Store in memory
    this.funnyMoments.push(moment);

    // Store in database
    if (this.db) {
      try {
        await this.db.query(`
          INSERT INTO funny_moments (
            moment_id,
            brand,
            bot_id,
            message,
            context,
            funniness,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
          moment.momentId,
          moment.brand,
          moment.botId,
          moment.message,
          JSON.stringify(moment.context),
          moment.funniness
        ]);
      } catch (error) {
        console.warn('[BrandEngagementAnalytics] Failed to log funny moment:', error.message);
      }
    }

    return moment;
  }

  /**
   * Get brand engagement summary
   */
  async getBrandEngagement(brand = null) {
    if (!this.db) {
      // Return in-memory data
      if (brand) {
        const engagement = this.brandEngagement.get(brand);
        return {
          success: true,
          brand,
          data: engagement ? {
            interactions: engagement.interactions,
            uniqueUsers: engagement.uniqueUsers.size,
            messages: engagement.messages,
            modelUsage: Object.fromEntries(engagement.modelUsage)
          } : null
        };
      }

      // All brands
      const allBrands = {};
      for (const [brandName, engagement] of this.brandEngagement.entries()) {
        allBrands[brandName] = {
          interactions: engagement.interactions,
          uniqueUsers: engagement.uniqueUsers.size,
          messages: engagement.messages,
          modelUsage: Object.fromEntries(engagement.modelUsage)
        };
      }

      return {
        success: true,
        brands: allBrands
      };
    }

    try {
      const params = [];
      let query = `
        SELECT
          brand,
          COUNT(*) as total_interactions,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(*) as total_messages,
          AVG(message_length) as avg_message_length,
          COUNT(DISTINCT session_id) as total_sessions
        FROM brand_engagement_metrics
      `;

      if (brand) {
        query += ` WHERE brand = $1`;
        params.push(brand);
      }

      query += ` GROUP BY brand ORDER BY total_interactions DESC`;

      const result = await this.db.query(query, params);

      // Get model usage per brand
      const modelUsageQuery = brand
        ? `SELECT model, COUNT(*) as count FROM brand_engagement_metrics WHERE brand = $1 AND model IS NOT NULL GROUP BY model`
        : `SELECT brand, model, COUNT(*) as count FROM brand_engagement_metrics WHERE model IS NOT NULL GROUP BY brand, model`;

      const modelUsage = await this.db.query(modelUsageQuery, brand ? [brand] : []);

      return {
        success: true,
        data: brand ? result.rows[0] : result.rows,
        modelUsage: modelUsage.rows
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get model preference statistics
   */
  async getModelPreferences(brand = null) {
    if (!this.db) {
      return {
        success: true,
        models: Object.fromEntries(this.modelPreferences)
      };
    }

    try {
      const params = [];
      let query = `
        SELECT
          model,
          COUNT(*) as usage_count,
          COUNT(DISTINCT user_id) as unique_users,
          AVG(CASE WHEN rating IS NOT NULL THEN rating END) as avg_rating
        FROM model_interaction_tracking
      `;

      if (brand) {
        query += ` WHERE brand = $1`;
        params.push(brand);
      }

      query += ` GROUP BY model ORDER BY usage_count DESC`;

      const result = await this.db.query(query, params);

      return {
        success: true,
        models: result.rows
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get cross-brand analytics (users engaging with multiple brands)
   */
  async getCrossBrandAnalytics() {
    if (!this.db) {
      return {
        success: false,
        error: 'Database required for cross-brand analytics'
      };
    }

    try {
      // Users who interact with multiple brands
      const multiBrandUsers = await this.db.query(`
        SELECT
          user_id,
          COUNT(DISTINCT brand) as brands_used,
          array_agg(DISTINCT brand) as brands,
          COUNT(*) as total_interactions
        FROM brand_engagement_metrics
        GROUP BY user_id
        HAVING COUNT(DISTINCT brand) > 1
        ORDER BY brands_used DESC
        LIMIT 50
      `);

      // Brand pair affinity (which brands are used together)
      const brandPairs = await this.db.query(`
        SELECT
          b1.brand as brand1,
          b2.brand as brand2,
          COUNT(DISTINCT b1.user_id) as shared_users
        FROM brand_engagement_metrics b1
        JOIN brand_engagement_metrics b2
          ON b1.user_id = b2.user_id
          AND b1.brand < b2.brand
        GROUP BY b1.brand, b2.brand
        ORDER BY shared_users DESC
        LIMIT 20
      `);

      return {
        success: true,
        multiBrandUsers: multiBrandUsers.rows,
        brandPairs: brandPairs.rows
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get funny moments
   */
  async getFunnyMoments(brand = null, limit = 20) {
    if (!this.db) {
      return {
        success: true,
        moments: brand
          ? this.funnyMoments.filter(m => m.brand === brand).slice(-limit)
          : this.funnyMoments.slice(-limit)
      };
    }

    try {
      const params = [];
      let query = `
        SELECT
          fm.*,
          b.name as bot_name
        FROM funny_moments fm
        LEFT JOIN bots b ON b.bot_id = fm.bot_id
      `;

      if (brand) {
        query += ` WHERE fm.brand = $1`;
        params.push(brand);
      }

      query += ` ORDER BY fm.funniness DESC, fm.created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.db.query(query, params);

      return {
        success: true,
        moments: result.rows
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get engagement timeline (daily/hourly breakdown)
   */
  async getEngagementTimeline(brand, timeframe = '7 days') {
    if (!this.db) {
      return {
        success: false,
        error: 'Database required for timeline'
      };
    }

    try {
      const result = await this.db.query(`
        SELECT
          DATE_TRUNC('hour', created_at) as time_bucket,
          COUNT(*) as interactions,
          COUNT(DISTINCT user_id) as unique_users,
          array_agg(DISTINCT model) FILTER (WHERE model IS NOT NULL) as models_used
        FROM brand_engagement_metrics
        WHERE brand = $1
          AND created_at > NOW() - INTERVAL '${timeframe}'
        GROUP BY time_bucket
        ORDER BY time_bucket DESC
      `, [brand]);

      return {
        success: true,
        timeline: result.rows
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get top performing brands
   */
  async getTopBrands(limit = 10) {
    const engagement = await this.getBrandEngagement();

    if (!engagement.success) {
      return engagement;
    }

    const brands = Array.isArray(engagement.data)
      ? engagement.data
      : Object.entries(engagement.brands || {}).map(([brand, data]) => ({
          brand,
          ...data
        }));

    // Sort by interactions
    brands.sort((a, b) => b.total_interactions - a.total_interactions || b.interactions - a.interactions);

    return {
      success: true,
      topBrands: brands.slice(0, limit)
    };
  }

  /**
   * Generate unique ID
   */
  _generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = BrandEngagementAnalytics;

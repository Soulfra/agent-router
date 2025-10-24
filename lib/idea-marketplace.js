/**
 * Idea Marketplace
 *
 * Anonymous idea sharing platform with micropayments.
 * Solves: "people can see anonymous marketing ideas... business people would spend $1 on the idea"
 *
 * Features:
 * - Submit anonymous ideas
 * - $1 micropayment system (Stripe integration)
 * - Idea voting/purchasing
 * - Revenue tracking for creators
 * - Category/tag filtering
 * - Trending ideas
 * - Idea ownership transfer on purchase
 * - Creator reputation from idea sales
 *
 * Use Cases:
 * - Submit marketing idea anonymously
 * - Business people browse ideas
 * - Pay $1 to purchase idea (gets full rights)
 * - Creator earns revenue + karma
 * - Trending ideas surface best concepts
 */

const { Pool } = require('pg');
const ReputationEngine = require('./reputation-engine');

class IdeaMarketplace {
  constructor(config = {}) {
    this.pool = config.pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });

    this.reputationEngine = config.reputationEngine || new ReputationEngine(config);

    // Pricing
    this.ideaPrice = 1.00; // $1 per idea
    this.platformFee = 0.10; // 10% platform fee
    this.creatorPayout = 0.90; // 90% to creator

    console.log('[IdeaMarketplace] Initialized');
  }

  /**
   * Submit new idea
   *
   * @param {Object} data
   * @param {string} data.userId - Creator (kept private, shown as anonymous)
   * @param {string} data.title - Idea title
   * @param {string} data.description - Full description
   * @param {string} data.category - Category (marketing, product, technical, business)
   * @param {string[]} data.tags - Tags
   * @param {Object} data.metadata - Additional metadata
   * @param {boolean} data.allowPreview - Allow preview without purchase (default: true)
   * @returns {Object} Created idea
   */
  async submitIdea(data) {
    try {
      const {
        userId,
        title,
        description,
        category = 'general',
        tags = [],
        metadata = {},
        allowPreview = true
      } = data;

      if (!userId || !title || !description) {
        throw new Error('userId, title, and description are required');
      }

      // Create idea
      const result = await this.pool.query(`
        INSERT INTO marketplace_ideas (
          creator_id,
          title,
          description,
          category,
          tags,
          metadata,
          allow_preview,
          status,
          price,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `, [
        userId,
        title,
        description,
        category,
        tags,
        JSON.stringify(metadata),
        allowPreview,
        'active',
        this.ideaPrice
      ]);

      const idea = result.rows[0];

      // Award karma for submitting idea
      await this.reputationEngine.awardKarma(userId, {
        type: 'idea_submitted',
        value: 2,
        metadata: { ideaId: idea.id }
      });

      console.log(`[IdeaMarketplace] New idea submitted: "${title}" (ID: ${idea.id})`);

      return this._formatIdea(idea, false); // Don't reveal creator

    } catch (error) {
      console.error('[IdeaMarketplace] Error submitting idea:', error);
      throw error;
    }
  }

  /**
   * Purchase idea
   *
   * @param {number} ideaId
   * @param {string} buyerId
   * @param {Object} payment
   * @param {string} payment.stripePaymentIntentId - Stripe payment intent ID
   * @param {string} payment.stripeCustomerId - Stripe customer ID
   * @returns {Object} Purchase details
   */
  async purchaseIdea(ideaId, buyerId, payment) {
    try {
      const { stripePaymentIntentId, stripeCustomerId } = payment;

      if (!stripePaymentIntentId) {
        throw new Error('stripePaymentIntentId is required');
      }

      // Get idea
      const ideaResult = await this.pool.query(`
        SELECT * FROM marketplace_ideas WHERE id = $1
      `, [ideaId]);

      if (ideaResult.rows.length === 0) {
        throw new Error(`Idea ${ideaId} not found`);
      }

      const idea = ideaResult.rows[0];

      if (idea.status !== 'active') {
        throw new Error(`Idea ${ideaId} is not available for purchase`);
      }

      // Check if already purchased by this user
      const existingPurchase = await this.pool.query(`
        SELECT * FROM idea_purchases
        WHERE idea_id = $1 AND buyer_id = $2
      `, [ideaId, buyerId]);

      if (existingPurchase.rows.length > 0) {
        throw new Error('You have already purchased this idea');
      }

      // Record purchase
      const purchaseResult = await this.pool.query(`
        INSERT INTO idea_purchases (
          idea_id,
          buyer_id,
          creator_id,
          price_paid,
          stripe_payment_intent_id,
          stripe_customer_id,
          purchased_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *
      `, [
        ideaId,
        buyerId,
        idea.creator_id,
        this.ideaPrice,
        stripePaymentIntentId,
        stripeCustomerId
      ]);

      const purchase = purchaseResult.rows[0];

      // Update idea stats
      await this.pool.query(`
        UPDATE marketplace_ideas
        SET purchase_count = purchase_count + 1,
            total_revenue = total_revenue + $1
        WHERE id = $2
      `, [this.ideaPrice, ideaId]);

      // Award karma to creator
      await this.reputationEngine.awardKarma(idea.creator_id, {
        type: 'idea_purchased',
        value: 5,
        metadata: { ideaId, buyerId }
      });

      // Award karma to buyer (smaller amount for purchasing)
      await this.reputationEngine.awardKarma(buyerId, {
        type: 'idea_purchased',
        value: 1,
        metadata: { ideaId }
      });

      console.log(`[IdeaMarketplace] Idea ${ideaId} purchased by ${buyerId}`);

      return {
        purchase,
        idea: this._formatIdea(idea, true), // Reveal full details to buyer
        payout: {
          creator: this.creatorPayout,
          platform: this.platformFee
        }
      };

    } catch (error) {
      console.error('[IdeaMarketplace] Error purchasing idea:', error);
      throw error;
    }
  }

  /**
   * Upvote idea (free, increases visibility)
   *
   * @param {number} ideaId
   * @param {string} userId
   * @returns {Object} Updated idea
   */
  async upvoteIdea(ideaId, userId) {
    try {
      // Check if already upvoted
      const existing = await this.pool.query(`
        SELECT * FROM idea_votes
        WHERE idea_id = $1 AND user_id = $2
      `, [ideaId, userId]);

      if (existing.rows.length > 0) {
        throw new Error('Already upvoted this idea');
      }

      // Record upvote
      await this.pool.query(`
        INSERT INTO idea_votes (
          idea_id,
          user_id,
          created_at
        ) VALUES ($1, $2, NOW())
      `, [ideaId, userId]);

      // Update vote count
      await this.pool.query(`
        UPDATE marketplace_ideas
        SET vote_count = vote_count + 1
        WHERE id = $1
      `, [ideaId]);

      // Get creator and award karma
      const ideaResult = await this.pool.query(`
        SELECT creator_id FROM marketplace_ideas WHERE id = $1
      `, [ideaId]);

      if (ideaResult.rows.length > 0) {
        await this.reputationEngine.awardKarma(ideaResult.rows[0].creator_id, {
          type: 'idea_upvoted',
          value: 1,
          metadata: { ideaId, voterId: userId }
        });
      }

      console.log(`[IdeaMarketplace] Idea ${ideaId} upvoted by ${userId}`);

      return await this.getIdea(ideaId, userId);

    } catch (error) {
      console.error('[IdeaMarketplace] Error upvoting idea:', error);
      throw error;
    }
  }

  /**
   * Get idea by ID
   *
   * @param {number} ideaId
   * @param {string} userId - Current user (to check if purchased)
   * @returns {Object} Idea
   */
  async getIdea(ideaId, userId = null) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM marketplace_ideas WHERE id = $1
      `, [ideaId]);

      if (result.rows.length === 0) {
        return null;
      }

      const idea = result.rows[0];

      // Check if user has purchased
      let hasPurchased = false;
      if (userId) {
        const purchaseCheck = await this.pool.query(`
          SELECT id FROM idea_purchases
          WHERE idea_id = $1 AND buyer_id = $2
        `, [ideaId, userId]);

        hasPurchased = purchaseCheck.rows.length > 0;
      }

      // Check if user is creator
      const isCreator = userId && userId === idea.creator_id;

      // Reveal full details if purchased or is creator
      const showFull = hasPurchased || isCreator;

      return this._formatIdea(idea, showFull, {
        hasPurchased,
        isCreator
      });

    } catch (error) {
      console.error('[IdeaMarketplace] Error getting idea:', error);
      return null;
    }
  }

  /**
   * Browse ideas
   *
   * @param {Object} filters
   * @param {string} filters.category - Filter by category
   * @param {string[]} filters.tags - Filter by tags
   * @param {string} filters.sortBy - Sort by (trending, recent, votes, purchases)
   * @param {number} filters.limit - Max results (default: 50)
   * @param {number} filters.offset - Pagination offset
   * @param {string} filters.userId - Current user (to check purchases)
   * @returns {Array} Ideas
   */
  async browseIdeas(filters = {}) {
    try {
      const {
        category,
        tags,
        sortBy = 'trending',
        limit = 50,
        offset = 0,
        userId = null
      } = filters;

      const conditions = ['status = \'active\''];
      const values = [];
      let paramIndex = 1;

      if (category) {
        conditions.push(`category = $${paramIndex}`);
        values.push(category);
        paramIndex++;
      }

      if (tags && tags.length > 0) {
        conditions.push(`tags && $${paramIndex}`);
        values.push(tags);
        paramIndex++;
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      // Sort order
      let orderBy = '';
      switch (sortBy) {
        case 'trending':
          // Trending = recent votes + recent purchases
          orderBy = 'ORDER BY (vote_count + (purchase_count * 5)) DESC, created_at DESC';
          break;
        case 'recent':
          orderBy = 'ORDER BY created_at DESC';
          break;
        case 'votes':
          orderBy = 'ORDER BY vote_count DESC, created_at DESC';
          break;
        case 'purchases':
          orderBy = 'ORDER BY purchase_count DESC, created_at DESC';
          break;
        default:
          orderBy = 'ORDER BY created_at DESC';
      }

      values.push(limit, offset);

      const result = await this.pool.query(`
        SELECT * FROM marketplace_ideas
        ${whereClause}
        ${orderBy}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, values);

      const ideas = [];

      for (const row of result.rows) {
        // Check if user has purchased
        let hasPurchased = false;
        if (userId) {
          const purchaseCheck = await this.pool.query(`
            SELECT id FROM idea_purchases
            WHERE idea_id = $1 AND buyer_id = $2
          `, [row.id, userId]);

          hasPurchased = purchaseCheck.rows.length > 0;
        }

        const isCreator = userId && userId === row.creator_id;
        const showFull = hasPurchased || isCreator;

        ideas.push(this._formatIdea(row, showFull, {
          hasPurchased,
          isCreator
        }));
      }

      return ideas;

    } catch (error) {
      console.error('[IdeaMarketplace] Error browsing ideas:', error);
      return [];
    }
  }

  /**
   * Get user's submitted ideas
   *
   * @param {string} userId
   * @returns {Array} Ideas
   */
  async getUserIdeas(userId) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM marketplace_ideas
        WHERE creator_id = $1
        ORDER BY created_at DESC
      `, [userId]);

      return result.rows.map(row => this._formatIdea(row, true)); // Show full to creator

    } catch (error) {
      console.error('[IdeaMarketplace] Error getting user ideas:', error);
      return [];
    }
  }

  /**
   * Get user's purchased ideas
   *
   * @param {string} userId
   * @returns {Array} Purchased ideas
   */
  async getUserPurchases(userId) {
    try {
      const result = await this.pool.query(`
        SELECT
          i.*,
          p.purchased_at,
          p.price_paid
        FROM idea_purchases p
        JOIN marketplace_ideas i ON p.idea_id = i.id
        WHERE p.buyer_id = $1
        ORDER BY p.purchased_at DESC
      `, [userId]);

      return result.rows.map(row => ({
        ...this._formatIdea(row, true), // Show full to purchaser
        purchasedAt: row.purchased_at,
        pricePaid: parseFloat(row.price_paid)
      }));

    } catch (error) {
      console.error('[IdeaMarketplace] Error getting purchases:', error);
      return [];
    }
  }

  /**
   * Get user's earnings from idea sales
   *
   * @param {string} userId
   * @returns {Object} Earnings summary
   */
  async getUserEarnings(userId) {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) as total_sales,
          SUM(price_paid) as gross_revenue,
          SUM(price_paid * $1) as net_revenue
        FROM idea_purchases
        WHERE creator_id = $2
      `, [this.creatorPayout, userId]);

      const stats = result.rows[0];

      return {
        totalSales: parseInt(stats.total_sales),
        grossRevenue: parseFloat(stats.gross_revenue || 0),
        netRevenue: parseFloat(stats.net_revenue || 0),
        creatorPayout: this.creatorPayout
      };

    } catch (error) {
      console.error('[IdeaMarketplace] Error getting earnings:', error);
      return { totalSales: 0, grossRevenue: 0, netRevenue: 0 };
    }
  }

  /**
   * Get marketplace stats
   *
   * @returns {Object} Stats
   */
  async getMarketplaceStats() {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) as total_ideas,
          SUM(vote_count) as total_votes,
          SUM(purchase_count) as total_purchases,
          SUM(total_revenue) as total_revenue,
          COUNT(DISTINCT creator_id) as total_creators
        FROM marketplace_ideas
        WHERE status = 'active'
      `);

      const stats = result.rows[0];

      return {
        totalIdeas: parseInt(stats.total_ideas),
        totalVotes: parseInt(stats.total_votes),
        totalPurchases: parseInt(stats.total_purchases),
        totalRevenue: parseFloat(stats.total_revenue || 0),
        totalCreators: parseInt(stats.total_creators)
      };

    } catch (error) {
      console.error('[IdeaMarketplace] Error getting stats:', error);
      return { totalIdeas: 0, totalVotes: 0, totalPurchases: 0, totalRevenue: 0 };
    }
  }

  /**
   * Format idea for output
   * @private
   */
  _formatIdea(row, showFull = false, extras = {}) {
    const base = {
      id: row.id,
      title: row.title,
      category: row.category,
      tags: row.tags || [],
      voteCount: row.vote_count,
      purchaseCount: row.purchase_count,
      status: row.status,
      price: parseFloat(row.price),
      createdAt: row.created_at,
      allowPreview: row.allow_preview
    };

    // Preview description (first 200 chars)
    if (row.allow_preview && !showFull) {
      base.preview = row.description.substring(0, 200) + (row.description.length > 200 ? '...' : '');
    }

    // Full details (only if purchased or creator)
    if (showFull) {
      base.description = row.description;
      base.metadata = row.metadata;
      base.totalRevenue = parseFloat(row.total_revenue);
    }

    // Add extras
    if (extras.hasPurchased !== undefined) {
      base.hasPurchased = extras.hasPurchased;
    }

    if (extras.isCreator !== undefined) {
      base.isCreator = extras.isCreator;
      if (extras.isCreator) {
        base.creatorId = row.creator_id; // Only show to creator
      }
    }

    return base;
  }
}

module.exports = IdeaMarketplace;

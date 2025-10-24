/**
 * App Template Registry
 *
 * Pre-built app templates users can "install":
 * - Dating app
 * - Politics forum
 * - Game lobby
 * - Chat room
 * - E-commerce store
 *
 * Similar to:
 * - Bonk Game SDK: pre-built game templates
 * - WordPress themes: installable templates
 * - Replit templates: instant sandbox with boilerplate
 */

class AppTemplates {
  constructor(options = {}) {
    this.db = options.db;

    console.log('[AppTemplates] Initialized');
  }

  /**
   * Get all available templates
   *
   * @param {string} category - Filter by category (optional)
   * @returns {Promise<array>} - Templates
   */
  async listTemplates(category = null) {
    try {
      let query = `
        SELECT
          template_id,
          name,
          description,
          icon,
          category,
          tags,
          features,
          price_cents,
          install_count,
          rating,
          created_at
        FROM app_templates
        WHERE status = 'active'
      `;

      const params = [];

      if (category) {
        query += ` AND category = $1`;
        params.push(category);
      }

      query += ` ORDER BY install_count DESC, created_at DESC`;

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[AppTemplates] List templates error:', error);
      return [];
    }
  }

  /**
   * Get template by ID
   *
   * @param {string} templateId - Template ID
   * @returns {Promise<object>} - Template
   */
  async getTemplate(templateId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM app_templates
        WHERE template_id = $1 AND status = 'active'
      `, [templateId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('[AppTemplates] Get template error:', error);
      return null;
    }
  }

  /**
   * Create new template
   *
   * @param {object} template - Template data
   * @returns {Promise<object>} - Created template
   */
  async createTemplate(template) {
    try {
      const {
        template_id,
        name,
        description,
        icon,
        category,
        tags = [],
        features = [],
        schema_sql = null,
        config = {},
        price_cents = 0
      } = template;

      const result = await this.db.query(`
        INSERT INTO app_templates (
          template_id,
          name,
          description,
          icon,
          category,
          tags,
          features,
          schema_sql,
          config,
          price_cents,
          status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', NOW())
        RETURNING *
      `, [
        template_id,
        name,
        description,
        icon,
        category,
        JSON.stringify(tags),
        JSON.stringify(features),
        schema_sql,
        JSON.stringify(config),
        price_cents
      ]);

      console.log(`[AppTemplates] Created template ${template_id}`);

      return result.rows[0];

    } catch (error) {
      console.error('[AppTemplates] Create template error:', error);
      throw error;
    }
  }

  /**
   * Increment install count
   *
   * @param {string} templateId - Template ID
   * @returns {Promise<void>}
   */
  async incrementInstallCount(templateId) {
    try {
      await this.db.query(`
        UPDATE app_templates
        SET install_count = install_count + 1
        WHERE template_id = $1
      `, [templateId]);

    } catch (error) {
      console.error('[AppTemplates] Increment install count error:', error);
    }
  }

  /**
   * Update template rating
   *
   * @param {string} templateId - Template ID
   * @param {number} rating - Rating (1-5)
   * @returns {Promise<void>}
   */
  async updateRating(templateId, rating) {
    try {
      await this.db.query(`
        UPDATE app_templates
        SET rating = (
          SELECT AVG(rating)
          FROM app_ratings
          WHERE template_id = $1
        )
        WHERE template_id = $1
      `, [templateId]);

    } catch (error) {
      console.error('[AppTemplates] Update rating error:', error);
    }
  }

  /**
   * Search templates
   *
   * @param {string} query - Search query
   * @returns {Promise<array>} - Matching templates
   */
  async searchTemplates(query) {
    try {
      const result = await this.db.query(`
        SELECT
          template_id,
          name,
          description,
          icon,
          category,
          tags,
          features,
          price_cents,
          install_count,
          rating
        FROM app_templates
        WHERE status = 'active'
          AND (
            name ILIKE $1
            OR description ILIKE $1
            OR tags::text ILIKE $1
          )
        ORDER BY install_count DESC
        LIMIT 20
      `, [`%${query}%`]);

      return result.rows;

    } catch (error) {
      console.error('[AppTemplates] Search templates error:', error);
      return [];
    }
  }

  /**
   * Get featured templates
   *
   * @returns {Promise<array>} - Featured templates
   */
  async getFeaturedTemplates() {
    try {
      const result = await this.db.query(`
        SELECT
          template_id,
          name,
          description,
          icon,
          category,
          tags,
          features,
          price_cents,
          install_count,
          rating
        FROM app_templates
        WHERE status = 'active'
          AND featured = true
        ORDER BY install_count DESC
        LIMIT 10
      `);

      return result.rows;

    } catch (error) {
      console.error('[AppTemplates] Get featured templates error:', error);
      return [];
    }
  }

  /**
   * Seed default templates
   *
   * @returns {Promise<void>}
   */
  async seedDefaultTemplates() {
    try {
      const templates = [
        {
          template_id: 'dating',
          name: 'Dating App',
          description: 'Tinder-style dating app with swipe cards, matches, and chat',
          icon: '💕',
          category: 'social',
          tags: ['dating', 'social', 'chat', 'matching'],
          features: [
            'Swipe cards',
            'Match algorithm',
            'Direct messaging',
            'Profile photos',
            'Location-based matching'
          ],
          schema_sql: `
            CREATE TABLE profiles (
              profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL,
              bio TEXT,
              photos JSONB,
              location JSONB,
              preferences JSONB,
              created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE matches (
              match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user1_id UUID NOT NULL,
              user2_id UUID NOT NULL,
              matched_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE swipes (
              swipe_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              swiper_id UUID NOT NULL,
              swiped_id UUID NOT NULL,
              direction TEXT NOT NULL, -- 'left' or 'right'
              created_at TIMESTAMP DEFAULT NOW()
            );
          `,
          config: {
            swipe_limit_per_day: 100,
            match_radius_miles: 50,
            min_age: 18,
            max_age: 99
          },
          price_cents: 0
        },
        {
          template_id: 'politics',
          name: 'Politics Forum',
          description: 'Reddit-style forum for political discussions',
          icon: '🗳️',
          category: 'community',
          tags: ['politics', 'forum', 'debate', 'community'],
          features: [
            'Threaded discussions',
            'Upvote/downvote',
            'Topic categories',
            'User reputation',
            'Moderation tools'
          ],
          schema_sql: `
            CREATE TABLE posts (
              post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL,
              title TEXT NOT NULL,
              body TEXT,
              category TEXT,
              upvotes INT DEFAULT 0,
              downvotes INT DEFAULT 0,
              created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE comments (
              comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              post_id UUID NOT NULL,
              user_id UUID NOT NULL,
              parent_id UUID,
              body TEXT NOT NULL,
              upvotes INT DEFAULT 0,
              downvotes INT DEFAULT 0,
              created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE votes (
              vote_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL,
              target_id UUID NOT NULL,
              target_type TEXT NOT NULL, -- 'post' or 'comment'
              direction INT NOT NULL, -- 1 or -1
              created_at TIMESTAMP DEFAULT NOW()
            );
          `,
          config: {
            categories: ['News', 'Discussion', 'Polls', 'Debate'],
            min_karma_to_post: 0,
            vote_weight_by_reputation: true
          },
          price_cents: 0
        },
        {
          template_id: 'gaming',
          name: 'Game Lobby',
          description: 'Multiplayer game lobby with matchmaking and leaderboards',
          icon: '🎮',
          category: 'gaming',
          tags: ['gaming', 'multiplayer', 'matchmaking', 'leaderboard'],
          features: [
            'Matchmaking system',
            'Leaderboards',
            'Player stats',
            'Team creation',
            'Tournament brackets'
          ],
          schema_sql: `
            CREATE TABLE players (
              player_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL,
              username TEXT NOT NULL,
              rating INT DEFAULT 1000,
              wins INT DEFAULT 0,
              losses INT DEFAULT 0,
              created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE matches (
              match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              player1_id UUID NOT NULL,
              player2_id UUID NOT NULL,
              winner_id UUID,
              duration_seconds INT,
              created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE leaderboard (
              user_id UUID PRIMARY KEY,
              rank INT,
              rating INT,
              wins INT,
              losses INT,
              updated_at TIMESTAMP DEFAULT NOW()
            );
          `,
          config: {
            matchmaking_algorithm: 'elo',
            rating_k_factor: 32,
            max_rating_difference: 200
          },
          price_cents: 0
        },
        {
          template_id: 'chat',
          name: 'Chat Room',
          description: 'Real-time chat with rooms, DMs, and reactions',
          icon: '💬',
          category: 'social',
          tags: ['chat', 'messaging', 'real-time', 'social'],
          features: [
            'Multiple chat rooms',
            'Direct messages',
            'Message reactions',
            'Typing indicators',
            'Read receipts'
          ],
          schema_sql: `
            CREATE TABLE rooms (
              room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              name TEXT NOT NULL,
              description TEXT,
              created_by UUID NOT NULL,
              created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE messages (
              message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              room_id UUID,
              sender_id UUID NOT NULL,
              recipient_id UUID,
              content TEXT NOT NULL,
              reactions JSONB,
              created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE room_members (
              room_id UUID NOT NULL,
              user_id UUID NOT NULL,
              joined_at TIMESTAMP DEFAULT NOW(),
              PRIMARY KEY (room_id, user_id)
            );
          `,
          config: {
            max_message_length: 2000,
            max_rooms_per_user: 50,
            message_retention_days: 90
          },
          price_cents: 0
        },
        {
          template_id: 'ecommerce',
          name: 'E-Commerce Store',
          description: 'Shopify-style online store with cart and checkout',
          icon: '🛒',
          category: 'business',
          tags: ['ecommerce', 'store', 'shopping', 'payments'],
          features: [
            'Product catalog',
            'Shopping cart',
            'Stripe checkout',
            'Order management',
            'Inventory tracking'
          ],
          schema_sql: `
            CREATE TABLE products (
              product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              name TEXT NOT NULL,
              description TEXT,
              price_cents INT NOT NULL,
              inventory INT DEFAULT 0,
              images JSONB,
              created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE orders (
              order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL,
              items JSONB NOT NULL,
              total_cents INT NOT NULL,
              status TEXT DEFAULT 'pending',
              created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE cart_items (
              cart_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL,
              product_id UUID NOT NULL,
              quantity INT NOT NULL,
              added_at TIMESTAMP DEFAULT NOW()
            );
          `,
          config: {
            currency: 'USD',
            tax_rate: 0.08,
            shipping_flat_rate_cents: 500
          },
          price_cents: 0
        }
      ];

      for (const template of templates) {
        // Check if already exists
        const existing = await this.db.query(`
          SELECT template_id FROM app_templates WHERE template_id = $1
        `, [template.template_id]);

        if (existing.rows.length === 0) {
          await this.createTemplate(template);
          console.log(`[AppTemplates] Seeded template: ${template.name}`);
        }
      }

      console.log('[AppTemplates] Default templates seeded');

    } catch (error) {
      console.error('[AppTemplates] Seed templates error:', error);
    }
  }
}

module.exports = AppTemplates;

// Starter Selector
//
// Pokémon-style "Choose Your Starter" system
// Shows 12 buckets (like starters) with personalities

class StarterSelector {
  constructor(pool) {
    this.pool = pool;
  }

  // ============================================================================
  // Starter Selection
  // ============================================================================

  /**
   * Get all available starters (12 buckets)
   * @param {object} filters - Optional filters (category, status)
   */
  async getAvailableStarters(filters = {}) {
    const whereClauses = ['bi.status = $1'];
    const values = ['active'];
    let paramIndex = 2;

    if (filters.category) {
      whereClauses.push(`bi.category = $${paramIndex++}`);
      values.push(filters.category);
    }

    const query = `
      SELECT
        bi.bucket_id,
        bi.bucket_name,
        bi.bucket_slug,
        bi.category,
        bi.domain_context,
        bi.ollama_model,
        bi.model_family,
        bi.description,
        bi.tags,
        dp.domain_id,
        dp.domain_name,
        dp.brand_name,
        dp.brand_tagline,
        dp.primary_color,
        dp.secondary_color,
        dp.logo_url,
        bp.users_count,
        bp.primary_users_count,
        bp.viewed_count,
        bp.chosen_count
      FROM bucket_instances bi
      LEFT JOIN domain_portfolio dp ON bi.domain_context = dp.domain_name
      LEFT JOIN bucket_popularity bp ON bi.bucket_id = bp.bucket_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY bi.category, bi.bucket_name
    `;

    const result = await this.pool.query(query, values);

    // Format as starters with personality
    return result.rows.map(row => this.formatStarter(row));
  }

  /**
   * Format bucket as starter
   * @param {object} bucket - Bucket data from database
   */
  formatStarter(bucket) {
    // Generate personality based on category and domain
    const personality = this.generatePersonality(bucket);

    // Generate stats (Pokémon-style)
    const stats = this.generateStats(bucket);

    // Rarity tier based on popularity
    const rarity = this.calculateRarity(bucket);

    return {
      id: bucket.bucket_id,
      name: bucket.bucket_name,
      slug: bucket.bucket_slug,
      type: bucket.category, // Like Pokémon type (creative, technical, business)

      // Branding
      domain: {
        id: bucket.domain_id,
        name: bucket.domain_name,
        brandName: bucket.brand_name,
        tagline: bucket.brand_tagline,
        colors: {
          primary: bucket.primary_color,
          secondary: bucket.secondary_color
        },
        logo: bucket.logo_url
      },

      // AI Model
      model: {
        name: bucket.ollama_model,
        family: bucket.model_family
      },

      // Personality
      personality,

      // Stats (Pokémon-style)
      stats,

      // Rarity
      rarity,

      // Popularity
      popularity: {
        totalUsers: bucket.users_count || 0,
        primaryUsers: bucket.primary_users_count || 0,
        viewCount: bucket.viewed_count || 0,
        chosenCount: bucket.chosen_count || 0
      },

      // Description
      description: bucket.description || this.generateDescription(bucket),

      // Tags
      tags: bucket.tags || []
    };
  }

  /**
   * Generate personality traits for starter
   * @param {object} bucket - Bucket data
   */
  generatePersonality(bucket) {
    const personalities = {
      // Creative buckets
      creative: {
        traits: ['Imaginative', 'Artistic', 'Innovative'],
        strengths: ['Creative writing', 'Art generation', 'Brainstorming'],
        weaknesses: ['Technical precision', 'Data analysis'],
        voice: 'Playful and expressive',
        emoji: '🎨'
      },

      // Technical buckets
      technical: {
        traits: ['Analytical', 'Precise', 'Methodical'],
        strengths: ['Code generation', 'Debugging', 'Architecture'],
        weaknesses: ['Creative writing', 'Emotional content'],
        voice: 'Clear and technical',
        emoji: '🔧'
      },

      // Business buckets
      business: {
        traits: ['Strategic', 'Professional', 'Results-driven'],
        strengths: ['Business planning', 'Analytics', 'Reports'],
        weaknesses: ['Creative content', 'Casual conversation'],
        voice: 'Professional and concise',
        emoji: '💼'
      }
    };

    const category = bucket.category?.toLowerCase() || 'technical';
    const base = personalities[category] || personalities.technical;

    // Add domain-specific flavor
    if (bucket.domain_name?.includes('soul')) {
      base.traits.push('Mystical');
      base.emoji = '🌀';
    } else if (bucket.domain_name?.includes('death')) {
      base.traits.push('Privacy-focused');
      base.emoji = '🔒';
    } else if (bucket.domain_name?.includes('matthew')) {
      base.traits.push('Personal');
      base.emoji = '👤';
    }

    return base;
  }

  /**
   * Generate Pokémon-style stats
   * @param {object} bucket - Bucket data
   */
  generateStats(bucket) {
    // Base stats vary by model family
    const baseStats = {
      llama: { speed: 75, creativity: 85, accuracy: 80, cost: 70 },
      codellama: { speed: 70, creativity: 60, accuracy: 95, cost: 75 },
      mistral: { speed: 85, creativity: 75, accuracy: 85, cost: 65 },
      'gemma2': { speed: 90, creativity: 70, accuracy: 80, cost: 60 }
    };

    const modelFamily = bucket.model_family?.toLowerCase() || 'llama';
    const stats = baseStats[modelFamily] || baseStats.llama;

    // Adjust based on category
    if (bucket.category === 'creative') {
      stats.creativity += 10;
      stats.accuracy -= 5;
    } else if (bucket.category === 'technical') {
      stats.accuracy += 10;
      stats.creativity -= 5;
    }

    return {
      speed: Math.min(100, stats.speed),
      creativity: Math.min(100, stats.creativity),
      accuracy: Math.min(100, stats.accuracy),
      cost: Math.min(100, stats.cost),
      total: stats.speed + stats.creativity + stats.accuracy + stats.cost
    };
  }

  /**
   * Calculate rarity tier
   * @param {object} bucket - Bucket data
   */
  calculateRarity(bucket) {
    const popularityScore = (bucket.primary_users_count || 0) + (bucket.chosen_count || 0);

    if (popularityScore > 100) return { tier: 'Common', color: '#9CA3AF' };
    if (popularityScore > 50) return { tier: 'Uncommon', color: '#10B981' };
    if (popularityScore > 20) return { tier: 'Rare', color: '#3B82F6' };
    if (popularityScore > 5) return { tier: 'Epic', color: '#8B5CF6' };
    return { tier: 'Legendary', color: '#F59E0B' };
  }

  /**
   * Generate description if not provided
   * @param {object} bucket - Bucket data
   */
  generateDescription(bucket) {
    const templates = {
      creative: `${bucket.brand_name || bucket.bucket_name} is your creative companion, powered by ${bucket.ollama_model}. Perfect for artistic projects, content creation, and imaginative brainstorming.`,
      technical: `${bucket.brand_name || bucket.bucket_name} is your technical assistant, running ${bucket.ollama_model}. Ideal for coding, debugging, and architectural discussions.`,
      business: `${bucket.brand_name || bucket.bucket_name} is your business partner, driven by ${bucket.ollama_model}. Great for strategy, analytics, and professional communications.`
    };

    const category = bucket.category?.toLowerCase() || 'technical';
    return templates[category] || templates.technical;
  }

  // ============================================================================
  // Starter Info
  // ============================================================================

  /**
   * Get detailed info for a specific starter
   * @param {string} bucketId - Bucket ID
   */
  async getStarterInfo(bucketId) {
    const query = `
      SELECT
        bi.*,
        dp.*,
        bp.users_count,
        bp.primary_users_count,
        bp.viewed_count,
        bp.chosen_count
      FROM bucket_instances bi
      LEFT JOIN domain_portfolio dp ON bi.domain_context = dp.domain_name
      LEFT JOIN bucket_popularity bp ON bi.bucket_id = bp.bucket_id
      WHERE bi.bucket_id = $1
    `;

    const result = await this.pool.query(query, [bucketId]);

    if (result.rows.length === 0) {
      throw new Error('Starter not found');
    }

    return this.formatStarter(result.rows[0]);
  }

  /**
   * Get starter recommendations for user
   * @param {number} userId - User ID (optional, for personalized recommendations)
   * @param {object} preferences - User preferences
   */
  async getRecommendedStarters(userId = null, preferences = {}) {
    // Get all starters
    const starters = await this.getAvailableStarters();

    // Score each starter based on preferences
    const scored = starters.map(starter => {
      let score = 0;

      // Prefer certain categories
      if (preferences.category && starter.type === preferences.category) {
        score += 50;
      }

      // Prefer certain model families
      if (preferences.modelFamily && starter.model.family === preferences.modelFamily) {
        score += 30;
      }

      // Prefer less popular (make user feel special)
      if (starter.rarity.tier === 'Legendary' || starter.rarity.tier === 'Epic') {
        score += 20;
      }

      // Prefer high stats
      score += starter.stats.total / 10;

      return { ...starter, recommendationScore: score };
    });

    // Sort by score
    scored.sort((a, b) => b.recommendationScore - a.recommendationScore);

    // Return top 3
    return scored.slice(0, 3);
  }

  // ============================================================================
  // Starter Selection Tracking
  // ============================================================================

  /**
   * Log starter interaction
   * @param {number} userId - User ID (optional)
   * @param {string} sessionId - Session ID for anonymous users
   * @param {string} eventType - Event type ('viewed', 'hovered', 'clicked', 'chosen')
   * @param {string} bucketId - Bucket ID
   */
  async logStarterInteraction(userId, sessionId, eventType, bucketId, metadata = {}) {
    const query = `
      INSERT INTO starter_selection_log (
        user_id, session_id, event_type, bucket_id, user_agent, ip_hash, time_spent_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      userId || null,
      sessionId,
      eventType,
      bucketId,
      metadata.userAgent || null,
      metadata.ipHash || null,
      metadata.timeSpentMs || null
    ]);

    return result.rows[0];
  }

  /**
   * Get starter selection analytics
   * @param {string} bucketId - Bucket ID (optional, for specific bucket)
   */
  async getSelectionAnalytics(bucketId = null) {
    const whereClause = bucketId ? 'WHERE bucket_id = $1' : '';
    const values = bucketId ? [bucketId] : [];

    const query = `
      SELECT
        bucket_id,
        event_type,
        COUNT(*) as count,
        AVG(time_spent_ms) as avg_time_ms
      FROM starter_selection_log
      ${whereClause}
      GROUP BY bucket_id, event_type
      ORDER BY count DESC
    `;

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  // ============================================================================
  // Comparison
  // ============================================================================

  /**
   * Compare two starters side-by-side
   * @param {string} bucketId1 - First bucket ID
   * @param {string} bucketId2 - Second bucket ID
   */
  async compareStarters(bucketId1, bucketId2) {
    const [starter1, starter2] = await Promise.all([
      this.getStarterInfo(bucketId1),
      this.getStarterInfo(bucketId2)
    ]);

    return {
      starter1,
      starter2,
      comparison: {
        speedDiff: starter1.stats.speed - starter2.stats.speed,
        creativityDiff: starter1.stats.creativity - starter2.stats.creativity,
        accuracyDiff: starter1.stats.accuracy - starter2.stats.accuracy,
        costDiff: starter1.stats.cost - starter2.stats.cost,
        popularityDiff: starter1.popularity.totalUsers - starter2.popularity.totalUsers
      }
    };
  }
}

module.exports = StarterSelector;

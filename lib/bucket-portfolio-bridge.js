// Bucket-Portfolio Bridge
//
// Connects the 12-bucket starter system to the Portfolio Hub
// Makes portfolios bucket-branded and domain-specific

class BucketPortfolioBridge {
  constructor(pool) {
    this.pool = pool;
  }

  // ============================================================================
  // User Bucket Assignment (Starter Selection)
  // ============================================================================

  /**
   * Get user's primary bucket (their chosen starter)
   * @param {number} userId - User ID
   */
  async getUserBucket(userId) {
    const query = `
      SELECT * FROM user_bucket_profile
      WHERE user_id = $1 AND is_primary_bucket = true
      LIMIT 1
    `;

    const result = await this.pool.query(query, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Assign bucket to user (choose starter)
   * @param {number} userId - User ID
   * @param {string} bucketId - Bucket ID
   * @param {boolean} isPrimary - Is this their primary bucket?
   */
  async assignBucket(userId, bucketId, isPrimary = true) {
    const query = `SELECT assign_bucket_to_user($1, $2, $3)`;
    const result = await this.pool.query(query, [userId, bucketId, isPrimary]);
    return result.rows[0];
  }

  /**
   * Get all buckets assigned to user
   * @param {number} userId - User ID
   */
  async getUserBuckets(userId) {
    const query = `
      SELECT * FROM user_bucket_profile
      WHERE user_id = $1
      ORDER BY is_primary_bucket DESC, assigned_at DESC
    `;

    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  // ============================================================================
  // Portfolio Initialization (Bucket-Branded)
  // ============================================================================

  /**
   * Initialize portfolio themed to user's bucket
   * @param {number} userId - User ID
   * @param {string} bucketId - Bucket ID (optional, uses primary if not provided)
   */
  async initBucketPortfolio(userId, bucketId = null) {
    // Get bucket
    let bucket;
    if (bucketId) {
      bucket = await this.getBucketInfo(bucketId);
    } else {
      bucket = await this.getUserBucket(userId);
    }

    if (!bucket) {
      throw new Error('No bucket assigned to user');
    }

    // Get domain theme for this bucket
    const theme = await this.getDomainTheme(bucket.domain_id);

    // Initialize portfolio settings with bucket branding
    const query = `
      INSERT INTO portfolio_settings (
        user_id, bucket_id, domain_id, starter_chosen_at,
        theme, bucket_personality, is_public, show_ai_stats, show_git_stats
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id) DO UPDATE SET
        bucket_id = EXCLUDED.bucket_id,
        domain_id = EXCLUDED.domain_id,
        theme = EXCLUDED.theme,
        bucket_personality = EXCLUDED.bucket_personality,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const bucketPersonality = {
      bucketName: bucket.bucket_name,
      bucketSlug: bucket.bucket_slug,
      category: bucket.category,
      ollamaModel: bucket.ollama_model,
      domainName: bucket.domain_name,
      brandName: bucket.brand_name
    };

    const result = await this.pool.query(query, [
      userId,
      bucket.bucket_id,
      bucket.domain_id,
      bucket.starter_chosen_at || new Date(),
      JSON.stringify(theme || {}),
      JSON.stringify(bucketPersonality),
      false, // Not public by default
      true,  // Show AI stats
      true   // Show git stats
    ]);

    return result.rows[0];
  }

  /**
   * Get bucket information
   * @param {string} bucketId - Bucket ID
   */
  async getBucketInfo(bucketId) {
    const query = `
      SELECT
        bi.*,
        dp.domain_name,
        dp.brand_name,
        dp.primary_color,
        dp.category as domain_category
      FROM bucket_instances bi
      LEFT JOIN domain_portfolio dp ON bi.domain_context = dp.domain_name
      WHERE bi.bucket_id = $1
    `;

    const result = await this.pool.query(query, [bucketId]);
    return result.rows[0] || null;
  }

  // ============================================================================
  // Domain Branding
  // ============================================================================

  /**
   * Get domain theme for branding
   * @param {string} domainId - Domain UUID
   */
  async getDomainTheme(domainId) {
    if (!domainId) return this.getDefaultTheme();

    const query = `
      SELECT * FROM domain_portfolio_themes
      WHERE domain_id = $1 AND is_active = true
      ORDER BY is_default DESC, created_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [domainId]);

    if (result.rows.length === 0) {
      // Create default theme for this domain
      return this.createDefaultDomainTheme(domainId);
    }

    return this.formatTheme(result.rows[0]);
  }

  /**
   * Create default theme for domain
   * @param {string} domainId - Domain UUID
   */
  async createDefaultDomainTheme(domainId) {
    // Get domain colors
    const domainQuery = `
      SELECT domain_name, brand_name, primary_color, secondary_color, category
      FROM domain_portfolio
      WHERE domain_id = $1
    `;

    const domainResult = await this.pool.query(domainQuery, [domainId]);
    const domain = domainResult.rows[0];

    if (!domain) return this.getDefaultTheme();

    const themeQuery = `
      INSERT INTO domain_portfolio_themes (
        domain_id, theme_name, primary_color, secondary_color,
        background_gradient, layout_style, personality_traits, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const gradient = `linear-gradient(135deg, ${domain.primary_color || '#667eea'} 0%, ${domain.secondary_color || '#764ba2'} 100%)`;
    const personality = this.getPersonalityForCategory(domain.category);

    const result = await this.pool.query(themeQuery, [
      domainId,
      `${domain.brand_name} Default`,
      domain.primary_color || '#667eea',
      domain.secondary_color || '#764ba2',
      gradient,
      'timeline',
      personality,
      true
    ]);

    return this.formatTheme(result.rows[0]);
  }

  /**
   * Get personality traits for category
   * @param {string} category - Category name
   */
  getPersonalityForCategory(category) {
    const personalities = {
      creative: ['creative', 'artistic', 'innovative'],
      technical: ['technical', 'precise', 'analytical'],
      business: ['professional', 'strategic', 'results-driven'],
      interactive: ['engaging', 'responsive', 'user-focused'],
      social: ['collaborative', 'community-driven', 'supportive'],
      visual: ['aesthetic', 'visual', 'design-focused']
    };

    return personalities[category?.toLowerCase()] || ['balanced', 'versatile', 'adaptable'];
  }

  /**
   * Format theme for frontend
   * @param {object} theme - Theme from database
   */
  formatTheme(theme) {
    return {
      primaryColor: theme.primary_color,
      secondaryColor: theme.secondary_color,
      accentColor: theme.accent_color,
      backgroundGradient: theme.background_gradient,
      backgroundImage: theme.background_image_url,
      fontFamily: theme.font_family,
      headingFont: theme.heading_font,
      layout: theme.layout_style,
      customCSS: theme.custom_css,
      customJS: theme.custom_js
    };
  }

  /**
   * Get default theme (fallback)
   */
  getDefaultTheme() {
    return {
      primaryColor: '#667eea',
      secondaryColor: '#764ba2',
      accentColor: '#f093fb',
      backgroundGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: 'Inter, sans-serif',
      layout: 'timeline'
    };
  }

  // ============================================================================
  // Bucket Activity Sync
  // ============================================================================

  /**
   * Sync bucket activity to portfolio timeline
   * @param {string} bucketId - Bucket ID
   * @param {Date} since - Sync activity since this date
   */
  async syncBucketActivity(bucketId, since = null) {
    const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24h

    const query = `SELECT sync_bucket_activity_to_timeline($1, $2)`;
    const result = await this.pool.query(query, [bucketId, sinceDate]);

    return {
      bucketId,
      syncedCount: result.rows[0]?.sync_bucket_activity_to_timeline || 0,
      since: sinceDate
    };
  }

  /**
   * Sync all buckets for a user
   * @param {number} userId - User ID
   * @param {Date} since - Sync since this date
   */
  async syncUserBucketActivity(userId, since = null) {
    const buckets = await this.getUserBuckets(userId);
    const results = [];

    for (const bucket of buckets) {
      try {
        const result = await this.syncBucketActivity(bucket.bucket_id, since);
        results.push(result);
      } catch (error) {
        console.error(`[BucketPortfolioBridge] Error syncing bucket ${bucket.bucket_id}:`, error.message);
        results.push({ bucketId: bucket.bucket_id, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get bucket portfolio stats
   * @param {string} bucketId - Bucket ID
   * @param {Date} date - Date (defaults to today)
   */
  async getBucketStats(bucketId, date = null) {
    const dateStr = date ? date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    const query = `
      SELECT * FROM bucket_portfolio_stats
      WHERE bucket_id = $1 AND date = $2
    `;

    const result = await this.pool.query(query, [bucketId, dateStr]);
    return result.rows[0] || null;
  }

  /**
   * Compute bucket stats for a date
   * @param {string} bucketId - Bucket ID
   * @param {Date} date - Date to compute
   */
  async computeBucketStats(bucketId, date = null) {
    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split('T')[0];

    // Get bucket activity for the date
    const statsQuery = `
      SELECT
        COUNT(*) FILTER (WHERE decision_type IS NOT NULL) as reasoning_logs_count,
        COUNT(*) FILTER (WHERE todo_id IS NOT NULL) as todos_count,
        COUNT(*) FILTER (WHERE status = 'completed') as todos_completed
      FROM (
        SELECT decision_type, NULL as todo_id, NULL as status
        FROM bucket_reasoning_log
        WHERE bucket_id = $1 AND DATE(timestamp) = $2
        UNION ALL
        SELECT NULL, todo_id, status
        FROM bucket_todos
        WHERE bucket_id = $1 AND DATE(created_at) = $2
      ) combined
    `;

    const statsResult = await this.pool.query(statsQuery, [bucketId, dateStr]);
    const stats = statsResult.rows[0];

    // Get usage stats from bucket_instances
    const usageQuery = `
      SELECT total_requests, avg_response_time_ms
      FROM bucket_instances
      WHERE bucket_id = $1
    `;

    const usageResult = await this.pool.query(usageQuery, [bucketId]);
    const usage = usageResult.rows[0];

    // Upsert stats
    const upsertQuery = `
      INSERT INTO bucket_portfolio_stats (
        bucket_id, date,
        reasoning_logs_count, todos_created, todos_completed,
        requests_processed, avg_response_time_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (bucket_id, date) DO UPDATE SET
        reasoning_logs_count = EXCLUDED.reasoning_logs_count,
        todos_created = EXCLUDED.todos_created,
        todos_completed = EXCLUDED.todos_completed,
        requests_processed = EXCLUDED.requests_processed,
        avg_response_time_ms = EXCLUDED.avg_response_time_ms,
        computed_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await this.pool.query(upsertQuery, [
      bucketId,
      dateStr,
      stats.reasoning_logs_count || 0,
      stats.todos_count || 0,
      stats.todos_completed || 0,
      usage?.total_requests || 0,
      usage?.avg_response_time_ms || 0
    ]);

    return result.rows[0];
  }

  // ============================================================================
  // Bucket Personality
  // ============================================================================

  /**
   * Get bucket's personality and branding
   * @param {string} bucketId - Bucket ID
   */
  async getBucketPersonality(bucketId) {
    const bucket = await this.getBucketInfo(bucketId);
    if (!bucket) return null;

    const theme = await this.getDomainTheme(bucket.domain_id);

    return {
      bucket: {
        id: bucket.bucket_id,
        name: bucket.bucket_name,
        slug: bucket.bucket_slug,
        category: bucket.category,
        ollamaModel: bucket.ollama_model,
        modelFamily: bucket.model_family
      },
      domain: {
        id: bucket.domain_id,
        name: bucket.domain_name,
        brandName: bucket.brand_name,
        category: bucket.domain_category
      },
      theme,
      stats: await this.getBucketStats(bucketId)
    };
  }

  // ============================================================================
  // Portfolio with Bucket Branding
  // ============================================================================

  /**
   * Get complete portfolio with bucket branding
   * @param {number} userId - User ID
   */
  async getPortfolioWithBranding(userId) {
    const bucket = await this.getUserBucket(userId);

    if (!bucket) {
      return {
        hasBucket: false,
        needsStarterSelection: true
      };
    }

    const personality = await this.getBucketPersonality(bucket.bucket_id);

    return {
      hasBucket: true,
      bucket: personality.bucket,
      domain: personality.domain,
      theme: personality.theme,
      stats: personality.stats,
      starterChosenAt: bucket.starter_chosen_at,
      portfolioSlug: bucket.portfolio_slug
    };
  }
}

module.exports = BucketPortfolioBridge;

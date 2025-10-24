// Portfolio Hub - Unified Analytics Aggregation Engine
//
// Aggregates data from:
// - AI chat logs (ai_conversations)
// - Embed analytics (embed_events, embed_analytics)
// - Git activity (GitHub, GitLab, Bitbucket)
// - Multi-database stats (12 buckets)
// - Intellectual property (patents, trademarks, authorship)
//
// Creates a professional portfolio showcase with cryptographic proof of authorship

const crypto = require('crypto');

class PortfolioHub {
  constructor(pool) {
    this.pool = pool;
  }

  // ============================================================================
  // Portfolio Timeline - Unified Activity Feed
  // ============================================================================

  /**
   * Aggregate recent activity across all sources into timeline
   * @param {number} userId - User ID
   * @param {number} limit - Number of events to fetch
   * @returns {Array} Timeline events
   */
  async getTimeline(userId, limit = 50) {
    const query = `
      SELECT * FROM portfolio_timeline
      WHERE user_id = $1
      ORDER BY event_timestamp DESC
      LIMIT $2
    `;
    const result = await this.pool.query(query, [userId, limit]);
    return result.rows;
  }

  /**
   * Add event to portfolio timeline
   * @param {object} event - Event data
   */
  async addTimelineEvent(event) {
    const {
      userId,
      eventType,
      eventCategory,
      title,
      description,
      eventData = {},
      relatedType,
      relatedId,
      relatedUrl,
      source,
      sourceId,
      isPublic = false,
      isFeatured = false,
      eventTimestamp = new Date()
    } = event;

    const query = `
      INSERT INTO portfolio_timeline (
        user_id, event_type, event_category, title, description,
        event_data, related_type, related_id, related_url,
        source, source_id, is_public, is_featured, event_timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      userId, eventType, eventCategory, title, description,
      JSON.stringify(eventData), relatedType, relatedId, relatedUrl,
      source, sourceId, isPublic, isFeatured, eventTimestamp
    ]);

    return result.rows[0];
  }

  /**
   * Sync AI conversation logs to timeline
   * @param {number} userId - User ID
   * @param {Date} since - Sync events since this date
   */
  async syncAIConversations(userId, since = null) {
    const sinceClause = since ? `AND created_at > $2` : '';
    const params = since ? [userId, since] : [userId];

    const query = `
      SELECT id, model, purpose, total_tokens, cost_usd, created_at
      FROM ai_conversations
      WHERE user_id = $1 ${sinceClause}
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, params);
    const conversations = result.rows;

    for (const conv of conversations) {
      await this.addTimelineEvent({
        userId,
        eventType: 'chat',
        eventCategory: 'ai',
        title: `AI Chat: ${conv.purpose || 'General'}`,
        description: `Used ${conv.model} (${conv.total_tokens} tokens, $${conv.cost_usd})`,
        eventData: {
          model: conv.model,
          tokens: conv.total_tokens,
          cost: conv.cost_usd,
          purpose: conv.purpose
        },
        relatedType: 'ai_conversation',
        relatedId: conv.id.toString(),
        source: 'ai_conversations',
        sourceId: conv.id.toString(),
        eventTimestamp: conv.created_at
      });
    }

    return conversations.length;
  }

  /**
   * Sync embed analytics to timeline
   * @param {number} userId - User ID
   * @param {Date} since - Sync events since this date
   */
  async syncEmbedAnalytics(userId, since = null) {
    const sinceClause = since ? `AND ee.timestamp > $2` : '';
    const params = since ? [userId, since] : [userId];

    const query = `
      SELECT ee.id, ee.site_id, ee.event_type, ee.event_name,
             ee.event_data, ee.timestamp, es.name as site_name
      FROM embed_events ee
      JOIN embed_sites es ON ee.site_id = es.site_id
      WHERE es.user_id = $1 ${sinceClause}
      AND ee.event_type IN ('pageview', 'conversion', 'consent')
      ORDER BY ee.timestamp DESC
    `;

    const result = await this.pool.query(query, params);
    const events = result.rows;

    for (const evt of events) {
      let title = '';
      if (evt.event_type === 'pageview') title = `Page View: ${evt.site_name}`;
      else if (evt.event_type === 'conversion') title = `Conversion: ${evt.event_name}`;
      else if (evt.event_type === 'consent') title = `Consent Given: ${evt.site_name}`;

      await this.addTimelineEvent({
        userId,
        eventType: evt.event_type,
        eventCategory: 'analytics',
        title,
        description: `Event on ${evt.site_name}`,
        eventData: evt.event_data || {},
        relatedType: 'embed_event',
        relatedId: evt.id.toString(),
        source: 'embed_events',
        sourceId: evt.id.toString(),
        eventTimestamp: evt.timestamp
      });
    }

    return events.length;
  }

  // ============================================================================
  // Portfolio Analytics - Aggregated Stats
  // ============================================================================

  /**
   * Compute daily portfolio analytics for a user
   * @param {number} userId - User ID
   * @param {Date} date - Date to compute (defaults to yesterday)
   */
  async computeDailyAnalytics(userId, date = null) {
    if (!date) {
      date = new Date();
      date.setDate(date.getDate() - 1); // Yesterday
    }

    const dateStr = date.toISOString().split('T')[0];

    // AI/Chat stats
    const aiStats = await this.pool.query(`
      SELECT
        COUNT(*) as conversations_count,
        COALESCE(SUM(total_tokens), 0) as tokens_used,
        COALESCE(SUM(cost_usd), 0) as cost_usd
      FROM ai_conversations
      WHERE user_id = $1
      AND DATE(created_at) = $2
    `, [userId, dateStr]);

    // Git stats (will be populated by git-portfolio-sync.js)
    const gitStats = await this.pool.query(`
      SELECT
        COALESCE(SUM(commits_this_month), 0) as commits_count,
        COALESCE(SUM(total_prs), 0) as prs_count,
        COALESCE(SUM(total_stars), 0) as stars_gained
      FROM git_portfolio_stats
      WHERE user_id = $1
      AND DATE(last_synced_at) = $2
    `, [userId, dateStr]);

    // Embed analytics stats
    const embedStats = await this.pool.query(`
      SELECT
        COUNT(*) as events_count,
        COUNT(DISTINCT session_id) as unique_visitors,
        COUNT(*) FILTER (WHERE event_type = 'pageview') as pageviews
      FROM embed_events ee
      JOIN embed_sites es ON ee.site_id = es.site_id
      WHERE es.user_id = $1
      AND DATE(ee.timestamp) = $2
    `, [userId, dateStr]);

    // Authorship stats
    const ipStats = await this.pool.query(`
      SELECT
        COUNT(*) as filings_count,
        COUNT(*) FILTER (WHERE ip_type = 'patent') as patents_filed,
        COUNT(*) FILTER (WHERE ip_type = 'trademark') as trademarks_filed
      FROM authorship_registry
      WHERE user_id = $1
      AND DATE(created_at) = $2
    `, [userId, dateStr]);

    // Bucket stats (will be populated by bucket stats collector)
    const bucketStats = await this.pool.query(`
      SELECT
        COALESCE(SUM(records_created_today), 0) as records_created,
        COALESCE(SUM(queries_today), 0) as queries_executed
      FROM bucket_database_stats
      WHERE DATE(computed_at) = $1
    `, [dateStr]);

    // Total activities
    const totalActivities =
      parseInt(aiStats.rows[0].conversations_count) +
      parseInt(gitStats.rows[0].commits_count) +
      parseInt(embedStats.rows[0].events_count) +
      parseInt(ipStats.rows[0].filings_count);

    // Insert/update analytics
    const upsertQuery = `
      INSERT INTO portfolio_analytics (
        user_id, date,
        ai_conversations_count, ai_tokens_used, ai_cost_usd,
        git_commits_count, git_prs_count, git_stars_gained,
        embed_events_count, embed_pageviews, embed_unique_visitors,
        ip_filings_count, patents_filed, trademarks_filed,
        bucket_records_created, bucket_queries_executed,
        total_activities
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (user_id, date) DO UPDATE SET
        ai_conversations_count = EXCLUDED.ai_conversations_count,
        ai_tokens_used = EXCLUDED.ai_tokens_used,
        ai_cost_usd = EXCLUDED.ai_cost_usd,
        git_commits_count = EXCLUDED.git_commits_count,
        git_prs_count = EXCLUDED.git_prs_count,
        git_stars_gained = EXCLUDED.git_stars_gained,
        embed_events_count = EXCLUDED.embed_events_count,
        embed_pageviews = EXCLUDED.embed_pageviews,
        embed_unique_visitors = EXCLUDED.embed_unique_visitors,
        ip_filings_count = EXCLUDED.ip_filings_count,
        patents_filed = EXCLUDED.patents_filed,
        trademarks_filed = EXCLUDED.trademarks_filed,
        bucket_records_created = EXCLUDED.bucket_records_created,
        bucket_queries_executed = EXCLUDED.bucket_queries_executed,
        total_activities = EXCLUDED.total_activities,
        computed_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await this.pool.query(upsertQuery, [
      userId, dateStr,
      aiStats.rows[0].conversations_count,
      aiStats.rows[0].tokens_used,
      aiStats.rows[0].cost_usd,
      gitStats.rows[0].commits_count,
      gitStats.rows[0].prs_count,
      gitStats.rows[0].stars_gained,
      embedStats.rows[0].events_count,
      embedStats.rows[0].pageviews,
      embedStats.rows[0].unique_visitors,
      ipStats.rows[0].filings_count,
      ipStats.rows[0].patents_filed,
      ipStats.rows[0].trademarks_filed,
      bucketStats.rows[0].records_created,
      bucketStats.rows[0].queries_executed,
      totalActivities
    ]);

    return result.rows[0];
  }

  /**
   * Get portfolio overview for a user
   * @param {number} userId - User ID
   */
  async getOverview(userId) {
    const query = `SELECT * FROM portfolio_overview WHERE user_id = $1`;
    const result = await this.pool.query(query, [userId]);
    return result.rows[0];
  }

  /**
   * Get git portfolio summary
   * @param {number} userId - User ID
   */
  async getGitSummary(userId) {
    const query = `SELECT * FROM git_portfolio_summary WHERE user_id = $1`;
    const result = await this.pool.query(query, [userId]);
    return result.rows[0];
  }

  /**
   * Get IP registry summary
   * @param {number} userId - User ID
   */
  async getIPSummary(userId) {
    const query = `SELECT * FROM ip_registry_summary WHERE user_id = $1`;
    const result = await this.pool.query(query, [userId]);
    return result.rows[0];
  }

  // ============================================================================
  // Bucket Database Stats
  // ============================================================================

  /**
   * Update bucket database stats
   * @param {string} bucketId - Bucket ID
   * @param {object} stats - Stats object
   */
  async updateBucketStats(bucketId, stats) {
    const {
      bucketName,
      totalTables,
      totalRecords,
      databaseSizeMb,
      recordsCreatedToday,
      recordsUpdatedToday,
      recordsDeletedToday,
      queriesToday,
      topTables = [],
      lastWriteAt = null,
      lastReadAt = null
    } = stats;

    const query = `
      INSERT INTO bucket_database_stats (
        bucket_id, bucket_name, total_tables, total_records, database_size_mb,
        records_created_today, records_updated_today, records_deleted_today,
        queries_today, top_tables, last_write_at, last_read_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (bucket_id) DO UPDATE SET
        bucket_name = EXCLUDED.bucket_name,
        total_tables = EXCLUDED.total_tables,
        total_records = EXCLUDED.total_records,
        database_size_mb = EXCLUDED.database_size_mb,
        records_created_today = EXCLUDED.records_created_today,
        records_updated_today = EXCLUDED.records_updated_today,
        records_deleted_today = EXCLUDED.records_deleted_today,
        queries_today = EXCLUDED.queries_today,
        top_tables = EXCLUDED.top_tables,
        last_write_at = EXCLUDED.last_write_at,
        last_read_at = EXCLUDED.last_read_at,
        computed_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      bucketId, bucketName, totalTables, totalRecords, databaseSizeMb,
      recordsCreatedToday, recordsUpdatedToday, recordsDeletedToday,
      queriesToday, JSON.stringify(topTables), lastWriteAt, lastReadAt
    ]);

    return result.rows[0];
  }

  /**
   * Get all bucket stats
   */
  async getAllBucketStats() {
    const query = `
      SELECT * FROM bucket_database_stats
      ORDER BY computed_at DESC
    `;
    const result = await this.pool.query(query);
    return result.rows;
  }

  // ============================================================================
  // Portfolio Settings
  // ============================================================================

  /**
   * Get portfolio settings for user
   * @param {number} userId - User ID
   */
  async getSettings(userId) {
    const query = `SELECT * FROM portfolio_settings WHERE user_id = $1`;
    const result = await this.pool.query(query, [userId]);

    if (result.rows.length === 0) {
      // Create default settings
      return this.updateSettings(userId, {});
    }

    return result.rows[0];
  }

  /**
   * Update portfolio settings
   * @param {number} userId - User ID
   * @param {object} settings - Settings to update
   */
  async updateSettings(userId, settings) {
    const {
      isPublic = false,
      publicUrlSlug = null,
      showAiStats = true,
      showGitStats = true,
      showEmbedStats = true,
      showIpRegistry = false,
      theme = { primaryColor: '#667eea', layout: 'timeline' },
      socialLinks = {},
      autoExportEnabled = false,
      exportFormat = 'json',
      exportSchedule = null
    } = settings;

    const query = `
      INSERT INTO portfolio_settings (
        user_id, is_public, public_url_slug,
        show_ai_stats, show_git_stats, show_embed_stats, show_ip_registry,
        theme, social_links,
        auto_export_enabled, export_format, export_schedule
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id) DO UPDATE SET
        is_public = EXCLUDED.is_public,
        public_url_slug = EXCLUDED.public_url_slug,
        show_ai_stats = EXCLUDED.show_ai_stats,
        show_git_stats = EXCLUDED.show_git_stats,
        show_embed_stats = EXCLUDED.show_embed_stats,
        show_ip_registry = EXCLUDED.show_ip_registry,
        theme = EXCLUDED.theme,
        social_links = EXCLUDED.social_links,
        auto_export_enabled = EXCLUDED.auto_export_enabled,
        export_format = EXCLUDED.export_format,
        export_schedule = EXCLUDED.export_schedule,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      userId, isPublic, publicUrlSlug,
      showAiStats, showGitStats, showEmbedStats, showIpRegistry,
      JSON.stringify(theme), JSON.stringify(socialLinks),
      autoExportEnabled, exportFormat, exportSchedule
    ]);

    return result.rows[0];
  }

  // ============================================================================
  // Authorship Registry Helpers
  // ============================================================================

  /**
   * Create Soulfra signature for authorship proof
   * @param {string} content - Content to sign
   * @param {string} signedBy - Signer identifier
   * @param {string} previousHash - Previous entry hash for chain
   */
  createSoulfraSignature(content, signedBy, previousHash = null) {
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // In production, use actual Ed25519 signing
    // For now, create a deterministic signature placeholder
    const signatureData = `${hash}:${signedBy}:${previousHash || 'genesis'}`;
    const signature = crypto.createHash('sha256').update(signatureData).digest('hex');

    return {
      hash,
      signature,
      signedAt: new Date(),
      signedBy,
      previousHash
    };
  }

  /**
   * Register intellectual property with Soulfra proof
   * @param {number} userId - User ID
   * @param {object} ip - IP details
   */
  async registerIP(userId, ip) {
    const {
      ipType,
      title,
      description,
      filingNumber = null,
      filingDate = null,
      registrationNumber = null,
      registrationDate = null,
      status = 'draft',
      relatedFiles = [],
      relatedRepos = [],
      relatedCommits = [],
      relatedCode = {},
      tags = [],
      category = null,
      jurisdiction = 'US',
      isPublic = false
    } = ip;

    // Create Soulfra signature
    const content = JSON.stringify({ title, description, ipType, userId });
    const signedBy = `user:${userId}`;

    // Get previous hash for chain
    const prevQuery = `
      SELECT soulfra_hash FROM authorship_registry
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const prevResult = await this.pool.query(prevQuery, [userId]);
    const previousHash = prevResult.rows.length > 0 ? prevResult.rows[0].soulfra_hash : null;

    const soulfra = this.createSoulfraSignature(content, signedBy, previousHash);

    // Build proof chain
    const proofChain = {
      hash: soulfra.hash,
      signature: soulfra.signature,
      signedBy: soulfra.signedBy,
      signedAt: soulfra.signedAt,
      previousHash: soulfra.previousHash,
      content: { title, ipType }
    };

    const query = `
      INSERT INTO authorship_registry (
        user_id, ip_type, title, description,
        filing_number, filing_date, registration_number, registration_date, status,
        related_files, related_repos, related_commits, related_code,
        soulfra_hash, soulfra_signature, signed_at, signed_by,
        previous_hash, proof_chain,
        tags, category, jurisdiction, is_public
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      userId, ipType, title, description,
      filingNumber, filingDate, registrationNumber, registrationDate, status,
      relatedFiles, relatedRepos, relatedCommits, JSON.stringify(relatedCode),
      soulfra.hash, soulfra.signature, soulfra.signedAt, soulfra.signedBy,
      soulfra.previousHash, JSON.stringify(proofChain),
      tags, category, jurisdiction, isPublic
    ]);

    // Add to timeline
    await this.addTimelineEvent({
      userId,
      eventType: 'patent_filed',
      eventCategory: 'ip',
      title: `${ipType}: ${title}`,
      description: `Registered ${ipType} with Soulfra proof`,
      eventData: { ipType, status, jurisdiction },
      relatedType: 'authorship_registry',
      relatedId: result.rows[0].id.toString(),
      source: 'authorship_registry',
      sourceId: result.rows[0].id.toString(),
      isPublic
    });

    return result.rows[0];
  }
}

module.exports = PortfolioHub;

/**
 * Metrics Aggregator
 *
 * Aggregates metrics from various systems into builder case studies:
 * - Revenue metrics (from payment/affiliate systems)
 * - Activity metrics (commits, deployments, API calls)
 * - User metrics (signups, active users)
 * - Collaboration metrics (messages, partnerships)
 * - Ecosystem metrics (cross-references, dependencies)
 *
 * Runs periodically to generate daily/weekly/monthly snapshots
 */

class MetricsAggregator {
  constructor(options = {}) {
    this.db = options.db;
    this.builderCaseStudy = options.builderCaseStudy;

    if (!this.db) {
      throw new Error('Database connection required');
    }

    console.log('[MetricsAggregator] Initialized');
  }

  /**
   * Aggregate metrics for a user for a specific period
   *
   * @param {string} userId - User ID
   * @param {string} periodType - 'daily', 'weekly', 'monthly'
   * @param {Date} periodStart - Period start date
   * @returns {Promise<object>} Aggregated metrics
   */
  async aggregateMetrics(userId, periodType, periodStart) {
    try {
      const periodEnd = this._calculatePeriodEnd(periodType, periodStart);

      // Get case study
      const caseStudy = await this._getCaseStudy(userId);
      if (!caseStudy) {
        throw new Error('No case study found for user');
      }

      // Aggregate from various sources
      const metrics = {
        // Activity metrics
        commits: await this._getCommits(userId, periodStart, periodEnd),
        deployments: await this._getDeployments(userId, periodStart, periodEnd),
        api_calls: await this._getAPICalls(userId, periodStart, periodEnd),
        active_projects: await this._getActiveProjects(userId, periodStart, periodEnd),

        // Revenue metrics
        revenue_cents: await this._getRevenue(userId, periodStart, periodEnd),
        mrr_cents: await this._getMRR(userId),
        arr_cents: await this._getARR(userId),
        new_customers: await this._getNewCustomers(userId, periodStart, periodEnd),
        churned_customers: await this._getChurnedCustomers(userId, periodStart, periodEnd),

        // User metrics
        total_users: await this._getTotalUsers(userId),
        active_users: await this._getActiveUsers(userId, periodStart, periodEnd),
        new_signups: await this._getNewSignups(userId, periodStart, periodEnd),

        // Collaboration metrics
        collaborations_started: await this._getCollaborationsStarted(userId, periodStart, periodEnd),
        collaborations_completed: await this._getCollaborationsCompleted(userId, periodStart, periodEnd),
        messages_sent: await this._getMessagesSent(userId, periodStart, periodEnd),

        // Ecosystem metrics
        times_referenced: await this._getTimesReferenced(userId, periodStart, periodEnd),
        new_dependencies: await this._getNewDependencies(userId, periodStart, periodEnd)
      };

      // Record metrics
      const recorded = await this.builderCaseStudy.recordMetrics(
        caseStudy.case_study_id,
        userId,
        periodType,
        periodStart,
        metrics
      );

      console.log(`[MetricsAggregator] Aggregated ${periodType} metrics for user ${userId}`);

      return recorded;

    } catch (error) {
      console.error('[MetricsAggregator] Error aggregating metrics:', error);
      throw error;
    }
  }

  /**
   * Aggregate metrics for all active builders
   *
   * @param {string} periodType - 'daily', 'weekly', 'monthly'
   * @param {Date} periodStart - Period start date
   */
  async aggregateAll(periodType, periodStart) {
    try {
      // Get all active case studies
      const result = await this.db.query(
        `SELECT user_id, case_study_id FROM builder_case_studies WHERE active = true`
      );

      console.log(`[MetricsAggregator] Aggregating ${periodType} metrics for ${result.rows.length} builders`);

      // Aggregate for each user
      const promises = result.rows.map(row =>
        this.aggregateMetrics(row.user_id, periodType, periodStart)
          .catch(error => {
            console.error(`[MetricsAggregator] Error for user ${row.user_id}:`, error.message);
            return null;
          })
      );

      await Promise.all(promises);

      console.log(`[MetricsAggregator] Completed ${periodType} aggregation for all builders`);

    } catch (error) {
      console.error('[MetricsAggregator] Error aggregating all:', error);
      throw error;
    }
  }

  /**
   * Run daily aggregation (call this from cron/scheduler)
   */
  async runDailyAggregation() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.aggregateAll('daily', today);
  }

  /**
   * Run weekly aggregation (call this from cron/scheduler)
   */
  async runWeeklyAggregation() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    await this.aggregateAll('weekly', startOfWeek);
  }

  /**
   * Run monthly aggregation (call this from cron/scheduler)
   */
  async runMonthlyAggregation() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    await this.aggregateAll('monthly', startOfMonth);
  }

  // ============================================================================
  // Metric Collection Methods
  // ============================================================================

  async _getCommits(userId, periodStart, periodEnd) {
    // TODO: Integrate with Git/GitHub tracking
    // For now, return 0
    return 0;
  }

  async _getDeployments(userId, periodStart, periodEnd) {
    // Count voice transcriptions with deployment intent
    const result = await this.db.query(
      `SELECT COUNT(*) AS count FROM voice_transcriptions
       WHERE user_id = $1
         AND created_at >= $2
         AND created_at < $3
         AND detected_intent LIKE '%deploy%'`,
      [userId, periodStart, periodEnd]
    );

    return parseInt(result.rows[0].count);
  }

  async _getAPICalls(userId, periodStart, periodEnd) {
    // Count API usage from usage_events
    const result = await this.db.query(
      `SELECT COUNT(*) AS count FROM usage_events
       WHERE user_id = $1
         AND created_at >= $2
         AND created_at < $3
         AND event_type = 'api_call'`,
      [userId, periodStart, periodEnd]
    );

    return parseInt(result.rows[0].count || 0);
  }

  async _getActiveProjects(userId, periodStart, periodEnd) {
    // Count projects with activity in period
    const result = await this.db.query(
      `SELECT COUNT(DISTINCT project_id) AS count
       FROM voice_transcriptions
       WHERE user_id = $1
         AND created_at >= $2
         AND created_at < $3`,
      [userId, periodStart, periodEnd]
    );

    return parseInt(result.rows[0].count);
  }

  async _getRevenue(userId, periodStart, periodEnd) {
    // Get revenue from affiliate commissions
    const result = await this.db.query(
      `SELECT COALESCE(SUM(revenue_cents), 0) AS total
       FROM affiliate_commissions
       WHERE tenant_id IN (SELECT tenant_id FROM tenants WHERE owner_id = $1)
         AND earned_at >= $2
         AND earned_at < $3`,
      [userId, periodStart, periodEnd]
    );

    return parseInt(result.rows[0].total || 0);
  }

  async _getMRR(userId) {
    // Get current MRR from subscriptions/recurring revenue
    // TODO: Integrate with subscription system
    return 0;
  }

  async _getARR(userId) {
    // ARR = MRR * 12
    const mrr = await this._getMRR(userId);
    return mrr * 12;
  }

  async _getNewCustomers(userId, periodStart, periodEnd) {
    // Count new users in user's tenant
    const result = await this.db.query(
      `SELECT COUNT(*) AS count FROM users
       WHERE tenant_id IN (SELECT tenant_id FROM tenants WHERE owner_id = $1)
         AND created_at >= $2
         AND created_at < $3`,
      [userId, periodStart, periodEnd]
    );

    return parseInt(result.rows[0].count || 0);
  }

  async _getChurnedCustomers(userId, periodStart, periodEnd) {
    // TODO: Integrate with subscription churn tracking
    return 0;
  }

  async _getTotalUsers(userId) {
    // Count total users in user's tenant
    const result = await this.db.query(
      `SELECT COUNT(*) AS count FROM users
       WHERE tenant_id IN (SELECT tenant_id FROM tenants WHERE owner_id = $1)`,
      [userId]
    );

    return parseInt(result.rows[0].count || 0);
  }

  async _getActiveUsers(userId, periodStart, periodEnd) {
    // Count users with sessions in period
    const result = await this.db.query(
      `SELECT COUNT(DISTINCT user_id) AS count FROM user_sessions
       WHERE tenant_id IN (SELECT tenant_id FROM tenants WHERE owner_id = $1)
         AND created_at >= $2
         AND created_at < $3`,
      [userId, periodStart, periodEnd]
    );

    return parseInt(result.rows[0].count || 0);
  }

  async _getNewSignups(userId, periodStart, periodEnd) {
    return await this._getNewCustomers(userId, periodStart, periodEnd);
  }

  async _getCollaborationsStarted(userId, periodStart, periodEnd) {
    // TODO: Integrate with collaboration system
    return 0;
  }

  async _getCollaborationsCompleted(userId, periodStart, periodEnd) {
    // TODO: Integrate with collaboration system
    return 0;
  }

  async _getMessagesSent(userId, periodStart, periodEnd) {
    // Count messages from mailbox system
    const result = await this.db.query(
      `SELECT COUNT(*) AS count FROM mailbox_messages
       WHERE sender_id = $1
         AND sent_at >= $2
         AND sent_at < $3`,
      [userId, periodStart, periodEnd]
    );

    return parseInt(result.rows[0].count || 0);
  }

  async _getTimesReferenced(userId, periodStart, periodEnd) {
    // Count new cross-references to user's projects
    const result = await this.db.query(
      `SELECT COUNT(*) AS count FROM project_cross_references
       WHERE target_user_id = $1
         AND first_referenced_at >= $2
         AND first_referenced_at < $3`,
      [userId, periodStart, periodEnd]
    );

    return parseInt(result.rows[0].count || 0);
  }

  async _getNewDependencies(userId, periodStart, periodEnd) {
    // Count new cross-references from user's projects
    const result = await this.db.query(
      `SELECT COUNT(*) AS count FROM project_cross_references
       WHERE source_user_id = $1
         AND first_referenced_at >= $2
         AND first_referenced_at < $3`,
      [userId, periodStart, periodEnd]
    );

    return parseInt(result.rows[0].count || 0);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  async _getCaseStudy(userId) {
    const result = await this.db.query(
      `SELECT * FROM builder_case_studies WHERE user_id = $1 AND active = true LIMIT 1`,
      [userId]
    );

    return result.rows[0] || null;
  }

  _calculatePeriodEnd(periodType, periodStart) {
    const start = new Date(periodStart);
    const end = new Date(start);

    switch (periodType) {
      case 'daily':
        end.setDate(end.getDate() + 1);
        break;
      case 'weekly':
        end.setDate(end.getDate() + 7);
        break;
      case 'monthly':
        end.setMonth(end.getMonth() + 1);
        break;
    }

    return end;
  }
}

module.exports = MetricsAggregator;

/**
 * Builder Case Study Manager
 *
 * Manages living case studies for $1 builders:
 * - Auto-tracks progress from investment to company
 * - Generates dashboards showing MRR, users, ecosystem influence
 * - Creates cross-reference graphs of project dependencies
 * - Auto-generates narratives with CalRiven AI
 * - Exports as PDF/Markdown for sharing
 *
 * Think of it as: "Your $1 investment gets you a self-documenting startup journey"
 */

class BuilderCaseStudy {
  constructor(options = {}) {
    this.db = options.db;
    this.calrivenPersona = options.calrivenPersona; // AI for narrative generation

    if (!this.db) {
      throw new Error('Database connection required');
    }

    console.log('[BuilderCaseStudy] Initialized');
  }

  /**
   * Initialize case study for new builder (after $1 payment)
   *
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @param {number} investmentCents - Amount invested (default 100 = $1)
   * @returns {Promise<object>} Created case study
   */
  async initializeCaseStudy(userId, tenantId, investmentCents = 100) {
    try {
      const result = await this.db.query(
        `SELECT initialize_builder_case_study($1, $2, $3) AS case_study_id`,
        [userId, tenantId, investmentCents]
      );

      const caseStudyId = result.rows[0].case_study_id;

      console.log(`[BuilderCaseStudy] Initialized case study ${caseStudyId} for user ${userId}`);

      return await this.getCaseStudy(caseStudyId);

    } catch (error) {
      console.error('[BuilderCaseStudy] Error initializing:', error);
      throw error;
    }
  }

  /**
   * Get case study by ID
   *
   * @param {string} caseStudyId - Case study ID
   * @returns {Promise<object>} Case study data
   */
  async getCaseStudy(caseStudyId) {
    try {
      const result = await this.db.query(
        `SELECT * FROM builder_case_studies WHERE case_study_id = $1`,
        [caseStudyId]
      );

      if (result.rows.length === 0) {
        throw new Error('Case study not found');
      }

      return result.rows[0];

    } catch (error) {
      console.error('[BuilderCaseStudy] Error getting case study:', error);
      throw error;
    }
  }

  /**
   * Get case study for user
   *
   * @param {string} userId - User ID
   * @returns {Promise<object>} Case study data
   */
  async getCaseStudyByUser(userId) {
    try {
      const result = await this.db.query(
        `SELECT * FROM builder_case_studies WHERE user_id = $1 AND active = true LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('[BuilderCaseStudy] Error getting case study by user:', error);
      throw error;
    }
  }

  /**
   * Get case study by public slug
   *
   * @param {string} slug - Public dashboard slug
   * @returns {Promise<object>} Case study data
   */
  async getCaseStudyBySlug(slug) {
    try {
      const result = await this.db.query(
        `SELECT * FROM builder_case_studies WHERE public_dashboard_slug = $1 AND public_dashboard_enabled = true`,
        [slug]
      );

      if (result.rows.length === 0) {
        throw new Error('Case study not found');
      }

      return result.rows[0];

    } catch (error) {
      console.error('[BuilderCaseStudy] Error getting case study by slug:', error);
      throw error;
    }
  }

  /**
   * Record milestone achievement
   *
   * @param {string} userId - User ID
   * @param {string} milestoneType - Type of milestone
   * @param {string} title - Milestone title
   * @param {string} description - Description
   * @param {string} projectId - Related project (optional)
   * @returns {Promise<object>} Created milestone
   */
  async recordMilestone(userId, milestoneType, title, description = null, projectId = null) {
    try {
      const result = await this.db.query(
        `SELECT record_builder_milestone($1, $2, $3, $4, $5) AS milestone_id`,
        [userId, milestoneType, title, description, projectId]
      );

      const milestoneId = result.rows[0].milestone_id;

      // Get milestone details
      const milestone = await this.db.query(
        `SELECT * FROM builder_milestones WHERE milestone_id = $1`,
        [milestoneId]
      );

      console.log(`[BuilderCaseStudy] Recorded milestone ${milestoneType} for user ${userId}`);

      return milestone.rows[0];

    } catch (error) {
      console.error('[BuilderCaseStudy] Error recording milestone:', error);
      throw error;
    }
  }

  /**
   * Get milestones for case study
   *
   * @param {string} caseStudyId - Case study ID
   * @param {number} limit - Max results
   * @returns {Promise<array>} Milestones
   */
  async getMilestones(caseStudyId, limit = 50) {
    try {
      const result = await this.db.query(
        `SELECT * FROM builder_milestones
         WHERE case_study_id = $1
         ORDER BY achieved_at DESC
         LIMIT $2`,
        [caseStudyId, limit]
      );

      return result.rows;

    } catch (error) {
      console.error('[BuilderCaseStudy] Error getting milestones:', error);
      throw error;
    }
  }

  /**
   * Get dashboard metrics for case study
   *
   * @param {string} caseStudyId - Case study ID
   * @returns {Promise<object>} Dashboard data with metrics, charts, milestones
   */
  async getDashboard(caseStudyId) {
    try {
      // Get case study
      const caseStudy = await this.getCaseStudy(caseStudyId);

      // Get recent milestones
      const milestones = await this.getMilestones(caseStudyId, 10);

      // Get time-series metrics (last 12 months)
      const metrics = await this.db.query(
        `SELECT * FROM builder_metrics
         WHERE case_study_id = $1
           AND period_type = 'monthly'
           AND period_start >= NOW() - INTERVAL '12 months'
         ORDER BY period_start ASC`,
        [caseStudyId]
      );

      // Get ecosystem connections
      const connections = await this.getEcosystemConnections(caseStudy.user_id);

      // Get recent snapshot
      const snapshot = await this.db.query(
        `SELECT * FROM case_study_snapshots
         WHERE case_study_id = $1
         ORDER BY snapshot_date DESC
         LIMIT 1`,
        [caseStudyId]
      );

      return {
        case_study: caseStudy,
        milestones: milestones,
        metrics: metrics.rows,
        ecosystem: connections,
        latest_snapshot: snapshot.rows[0] || null,
        dashboard_url: `/builder/${caseStudy.public_dashboard_slug}`
      };

    } catch (error) {
      console.error('[BuilderCaseStudy] Error getting dashboard:', error);
      throw error;
    }
  }

  /**
   * Get ecosystem connections for user's projects
   *
   * @param {string} userId - User ID
   * @returns {Promise<object>} Connections graph data
   */
  async getEcosystemConnections(userId) {
    try {
      // Get projects where user is referenced by others
      const referencedBy = await this.db.query(
        `SELECT * FROM ecosystem_graph
         WHERE target_user_id = $1
         ORDER BY reference_count DESC
         LIMIT 20`,
        [userId]
      );

      // Get projects user references
      const references = await this.db.query(
        `SELECT * FROM ecosystem_graph
         WHERE source_user_id = $1
         ORDER BY reference_count DESC
         LIMIT 20`,
        [userId]
      );

      return {
        referenced_by: referencedBy.rows,
        references: references.rows,
        total_referenced_by: referencedBy.rows.length,
        total_references: references.rows.length
      };

    } catch (error) {
      console.error('[BuilderCaseStudy] Error getting ecosystem:', error);
      throw error;
    }
  }

  /**
   * Record metrics for a period
   *
   * @param {string} caseStudyId - Case study ID
   * @param {string} userId - User ID
   * @param {string} periodType - 'daily', 'weekly', 'monthly'
   * @param {Date} periodStart - Period start date
   * @param {object} metrics - Metrics data
   * @returns {Promise<object>} Recorded metrics
   */
  async recordMetrics(caseStudyId, userId, periodType, periodStart, metrics) {
    try {
      const periodEnd = this._calculatePeriodEnd(periodType, periodStart);

      const result = await this.db.query(
        `INSERT INTO builder_metrics (
          case_study_id, user_id, period_type, period_start, period_end,
          commits, deployments, api_calls, active_projects,
          revenue_cents, mrr_cents, arr_cents, new_customers, churned_customers,
          total_users, active_users, new_signups,
          collaborations_started, collaborations_completed, messages_sent,
          times_referenced, new_dependencies
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17,
          $18, $19, $20,
          $21, $22
        )
        ON CONFLICT (case_study_id, period_type, period_start)
        DO UPDATE SET
          commits = EXCLUDED.commits,
          deployments = EXCLUDED.deployments,
          api_calls = EXCLUDED.api_calls,
          revenue_cents = EXCLUDED.revenue_cents,
          mrr_cents = EXCLUDED.mrr_cents,
          total_users = EXCLUDED.total_users,
          updated_at = NOW()
        RETURNING *`,
        [
          caseStudyId, userId, periodType, periodStart, periodEnd,
          metrics.commits || 0,
          metrics.deployments || 0,
          metrics.api_calls || 0,
          metrics.active_projects || 0,
          metrics.revenue_cents || 0,
          metrics.mrr_cents || 0,
          metrics.arr_cents || 0,
          metrics.new_customers || 0,
          metrics.churned_customers || 0,
          metrics.total_users || 0,
          metrics.active_users || 0,
          metrics.new_signups || 0,
          metrics.collaborations_started || 0,
          metrics.collaborations_completed || 0,
          metrics.messages_sent || 0,
          metrics.times_referenced || 0,
          metrics.new_dependencies || 0
        ]
      );

      // Update case study cached metrics
      await this._updateCaseStudyMetrics(caseStudyId);

      console.log(`[BuilderCaseStudy] Recorded ${periodType} metrics for ${caseStudyId}`);

      return result.rows[0];

    } catch (error) {
      console.error('[BuilderCaseStudy] Error recording metrics:', error);
      throw error;
    }
  }

  /**
   * Generate case study snapshot with CalRiven AI narrative
   *
   * @param {string} caseStudyId - Case study ID
   * @returns {Promise<object>} Generated snapshot
   */
  async generateSnapshot(caseStudyId) {
    try {
      const dashboard = await this.getDashboard(caseStudyId);
      const caseStudy = dashboard.case_study;

      // Generate narrative with CalRiven AI
      let narrative = null;
      if (this.calrivenPersona) {
        narrative = await this._generateNarrative(dashboard);
      } else {
        narrative = this._generateBasicNarrative(dashboard);
      }

      // Create snapshot
      const result = await this.db.query(
        `INSERT INTO case_study_snapshots (
          case_study_id, user_id, snapshot_date, snapshot_title,
          narrative, metrics_summary, milestones_achieved, charts_data, ecosystem_graph
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          caseStudyId,
          caseStudy.user_id,
          new Date(),
          `${caseStudy.company_name || 'Builder'} - ${new Date().toLocaleDateString()}`,
          narrative,
          JSON.stringify({
            mrr: caseStudy.monthly_recurring_revenue_cents,
            total_revenue: caseStudy.total_revenue_cents,
            projects: caseStudy.total_projects,
            ecosystem_influence: caseStudy.ecosystem_influence_score
          }),
          JSON.stringify(dashboard.milestones.slice(0, 5)),
          JSON.stringify(this._buildChartsData(dashboard.metrics)),
          JSON.stringify(dashboard.ecosystem)
        ]
      );

      // Update case study narrative
      await this.db.query(
        `UPDATE builder_case_studies
         SET latest_narrative = $1, narrative_updated_at = NOW()
         WHERE case_study_id = $2`,
        [narrative, caseStudyId]
      );

      console.log(`[BuilderCaseStudy] Generated snapshot for ${caseStudyId}`);

      return result.rows[0];

    } catch (error) {
      console.error('[BuilderCaseStudy] Error generating snapshot:', error);
      throw error;
    }
  }

  /**
   * Get builder leaderboard
   *
   * @param {number} limit - Max results
   * @param {string} sortBy - Sort field ('ecosystem', 'revenue', 'milestones')
   * @returns {Promise<array>} Leaderboard data
   */
  async getLeaderboard(limit = 50, sortBy = 'ecosystem') {
    try {
      let orderBy = 'ecosystem_influence_score DESC, monthly_recurring_revenue_cents DESC';

      if (sortBy === 'revenue') {
        orderBy = 'monthly_recurring_revenue_cents DESC, ecosystem_influence_score DESC';
      } else if (sortBy === 'milestones') {
        orderBy = 'total_milestones DESC, ecosystem_influence_score DESC';
      }

      const result = await this.db.query(
        `SELECT * FROM builder_leaderboard
         ORDER BY ${orderBy}
         LIMIT $1`,
        [limit]
      );

      return result.rows;

    } catch (error) {
      console.error('[BuilderCaseStudy] Error getting leaderboard:', error);
      throw error;
    }
  }

  /**
   * Update case study metadata
   *
   * @param {string} caseStudyId - Case study ID
   * @param {object} updates - Fields to update
   * @returns {Promise<object>} Updated case study
   */
  async updateCaseStudy(caseStudyId, updates) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic update query
      for (const [key, value] of Object.entries(updates)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }

      values.push(caseStudyId);

      const result = await this.db.query(
        `UPDATE builder_case_studies
         SET ${fields.join(', ')}, updated_at = NOW()
         WHERE case_study_id = $${paramCount}
         RETURNING *`,
        values
      );

      console.log(`[BuilderCaseStudy] Updated case study ${caseStudyId}`);

      return result.rows[0];

    } catch (error) {
      console.error('[BuilderCaseStudy] Error updating case study:', error);
      throw error;
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Calculate period end date based on period type
   */
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

  /**
   * Update case study cached metrics from latest data
   */
  async _updateCaseStudyMetrics(caseStudyId) {
    try {
      // Get latest monthly metrics
      const result = await this.db.query(
        `SELECT * FROM builder_metrics
         WHERE case_study_id = $1
           AND period_type = 'monthly'
         ORDER BY period_start DESC
         LIMIT 1`,
        [caseStudyId]
      );

      if (result.rows.length > 0) {
        const latest = result.rows[0];

        await this.db.query(
          `UPDATE builder_case_studies
           SET
             monthly_recurring_revenue_cents = $1,
             total_revenue_cents = total_revenue_cents + $2,
             total_users = $3,
             total_api_calls = total_api_calls + $4,
             updated_at = NOW()
           WHERE case_study_id = $5`,
          [
            latest.mrr_cents,
            latest.revenue_cents,
            latest.total_users,
            latest.api_calls,
            caseStudyId
          ]
        );
      }

    } catch (error) {
      console.error('[BuilderCaseStudy] Error updating metrics:', error);
    }
  }

  /**
   * Build charts data for dashboard
   */
  _buildChartsData(metrics) {
    return {
      revenue_chart: {
        labels: metrics.map(m => m.period_start),
        data: metrics.map(m => m.revenue_cents / 100)
      },
      mrr_chart: {
        labels: metrics.map(m => m.period_start),
        data: metrics.map(m => m.mrr_cents / 100)
      },
      users_chart: {
        labels: metrics.map(m => m.period_start),
        data: metrics.map(m => m.total_users)
      },
      commits_chart: {
        labels: metrics.map(m => m.period_start),
        data: metrics.map(m => m.commits)
      }
    };
  }

  /**
   * Generate narrative with CalRiven AI
   */
  async _generateNarrative(dashboard) {
    const caseStudy = dashboard.case_study;
    const daysSinceStart = Math.floor((new Date() - new Date(caseStudy.investment_date)) / (1000 * 60 * 60 * 24));

    const topic = `Builder journey update: ${daysSinceStart} days since $${caseStudy.invested_cents / 100} investment. ` +
                 `Current stage: ${caseStudy.builder_stage}. ` +
                 `Metrics: ${caseStudy.total_projects} projects, ` +
                 `$${caseStudy.monthly_recurring_revenue_cents / 100} MRR, ` +
                 `${caseStudy.projects_referenced_by_others} projects using their code. ` +
                 `Recent milestones: ${dashboard.milestones.slice(0, 3).map(m => m.milestone_title).join(', ')}`;

    const reflection = await this.calrivenPersona.reflect(topic);

    return reflection.thought;
  }

  /**
   * Generate basic narrative without AI
   */
  _generateBasicNarrative(dashboard) {
    const caseStudy = dashboard.case_study;
    const daysSinceStart = Math.floor((new Date() - new Date(caseStudy.investment_date)) / (1000 * 60 * 60 * 24));

    return `Builder Journey Update

${daysSinceStart} days since investing $${caseStudy.invested_cents / 100}.

Current Progress:
- Stage: ${caseStudy.builder_stage}
- Projects: ${caseStudy.total_projects}
- MRR: $${caseStudy.monthly_recurring_revenue_cents / 100}
- Total Revenue: $${caseStudy.total_revenue_cents / 100}
- Ecosystem Influence: ${caseStudy.ecosystem_influence_score}

Recent Milestones:
${dashboard.milestones.slice(0, 5).map((m, i) => `${i + 1}. ${m.milestone_title} (${m.days_since_investment} days)`).join('\n')}

Keep building!`;
  }
}

module.exports = BuilderCaseStudy;

/**
 * Milestone Detector
 *
 * Auto-detects and records builder milestones:
 * - First project, first deploy, first revenue
 * - Ecosystem milestones (first integration, becoming influencer)
 * - Growth milestones ($100, $1k, $10k revenue)
 *
 * Hooks into various systems to detect achievements automatically
 */

class MilestoneDetector {
  constructor(options = {}) {
    this.db = options.db;
    this.builderCaseStudy = options.builderCaseStudy;

    if (!this.db) {
      throw new Error('Database connection required');
    }

    console.log('[MilestoneDetector] Initialized');
  }

  /**
   * Check for milestone after project creation
   *
   * @param {string} userId - User ID
   * @param {string} projectId - Project ID
   */
  async checkProjectMilestones(userId, projectId) {
    try {
      // Get user's project count
      const result = await this.db.query(
        `SELECT COUNT(*) AS count FROM project_contexts WHERE owner_user_id = $1`,
        [userId]
      );

      const projectCount = parseInt(result.rows[0].count);

      // First project milestone
      if (projectCount === 1) {
        await this._recordMilestone(
          userId,
          'first_project',
          'Created First Project',
          'Started your first project!',
          projectId
        );
      }

    } catch (error) {
      console.error('[MilestoneDetector] Error checking project milestones:', error);
    }
  }

  /**
   * Check for deployment milestones
   *
   * @param {string} userId - User ID
   * @param {string} projectId - Project ID
   */
  async checkDeploymentMilestones(userId, projectId) {
    try {
      const caseStudy = await this._getCaseStudy(userId);
      if (!caseStudy) return;

      // Check if this is first deployment
      if (!caseStudy.days_to_first_deploy) {
        await this._recordMilestone(
          userId,
          'first_deployment',
          'First Deployment!',
          'Your code is live! First deployment successful.',
          projectId
        );
      }

    } catch (error) {
      console.error('[MilestoneDetector] Error checking deployment milestones:', error);
    }
  }

  /**
   * Check for revenue milestones
   *
   * @param {string} userId - User ID
   * @param {number} revenueCents - New revenue amount
   */
  async checkRevenueMilestones(userId, revenueCents) {
    try {
      const caseStudy = await this._getCaseStudy(userId);
      if (!caseStudy) return;

      const previousRevenue = caseStudy.total_revenue_cents || 0;
      const newRevenue = previousRevenue + revenueCents;

      // First revenue
      if (previousRevenue === 0 && revenueCents > 0) {
        await this._recordMilestone(
          userId,
          'first_revenue',
          'First Revenue!',
          `Made first $${(revenueCents / 100).toFixed(2)} in revenue!`,
          null
        );
      }

      // $100 milestone
      if (previousRevenue < 10000 && newRevenue >= 10000) {
        await this._recordMilestone(
          userId,
          'first_100_revenue',
          'Hit $100 Revenue!',
          'Crossed $100 in total revenue!',
          null
        );
      }

      // $1k milestone
      if (previousRevenue < 100000 && newRevenue >= 100000) {
        await this._recordMilestone(
          userId,
          'first_1k_revenue',
          'Hit $1,000 Revenue!',
          'Crossed $1,000 in total revenue!',
          null
        );
      }

      // $10k milestone
      if (previousRevenue < 1000000 && newRevenue >= 1000000) {
        await this._recordMilestone(
          userId,
          'first_10k_revenue',
          'Hit $10,000 Revenue!',
          'Crossed $10,000 in total revenue!',
          null
        );
      }

    } catch (error) {
      console.error('[MilestoneDetector] Error checking revenue milestones:', error);
    }
  }

  /**
   * Check for collaboration milestones
   *
   * @param {string} userId - User ID
   */
  async checkCollaborationMilestones(userId) {
    try {
      const caseStudy = await this._getCaseStudy(userId);
      if (!caseStudy) return;

      // Check if this is first collaboration
      if (caseStudy.total_collaborations === 0) {
        await this._recordMilestone(
          userId,
          'first_collaboration',
          'First Collaboration!',
          'Started collaborating with another builder!',
          null
        );
      }

    } catch (error) {
      console.error('[MilestoneDetector] Error checking collaboration milestones:', error);
    }
  }

  /**
   * Check for ecosystem milestones
   *
   * @param {string} userId - User ID
   */
  async checkEcosystemMilestones(userId) {
    try {
      const caseStudy = await this._getCaseStudy(userId);
      if (!caseStudy) return;

      const referencedBy = caseStudy.projects_referenced_by_others || 0;

      // First integration (someone uses your code)
      if (referencedBy === 1) {
        await this._recordMilestone(
          userId,
          'first_integration',
          'First Integration!',
          'Another builder is using your code!',
          null
        );
      }

      // Ecosystem contributor (5+ projects using your code)
      if (referencedBy === 5) {
        await this._recordMilestone(
          userId,
          'ecosystem_contributor',
          'Ecosystem Contributor',
          '5 projects are now using your code!',
          null
        );
      }

      // Ecosystem influencer (10+ projects using your code)
      if (referencedBy === 10) {
        await this._recordMilestone(
          userId,
          'ecosystem_influencer',
          'Ecosystem Influencer',
          '10+ projects depend on your work!',
          null
        );
      }

    } catch (error) {
      console.error('[MilestoneDetector] Error checking ecosystem milestones:', error);
    }
  }

  /**
   * Check for API/usage milestones
   *
   * @param {string} userId - User ID
   */
  async checkUsageMilestones(userId) {
    try {
      const caseStudy = await this._getCaseStudy(userId);
      if (!caseStudy) return;

      const apiCalls = caseStudy.total_api_calls || 0;

      // First API call
      if (apiCalls === 1) {
        await this._recordMilestone(
          userId,
          'first_public_api',
          'First API Call!',
          'Your API received its first call!',
          null
        );
      }

    } catch (error) {
      console.error('[MilestoneDetector] Error checking usage milestones:', error);
    }
  }

  /**
   * Auto-detect all milestones for user
   * Run this periodically to catch any missed milestones
   *
   * @param {string} userId - User ID
   */
  async detectAll(userId) {
    try {
      await this.checkEcosystemMilestones(userId);
      // Other checks can be added here

    } catch (error) {
      console.error('[MilestoneDetector] Error detecting all milestones:', error);
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Get case study for user
   */
  async _getCaseStudy(userId) {
    const result = await this.db.query(
      `SELECT * FROM builder_case_studies WHERE user_id = $1 AND active = true LIMIT 1`,
      [userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Record milestone (if not already recorded)
   */
  async _recordMilestone(userId, milestoneType, title, description, projectId) {
    try {
      // Check if milestone already exists
      const existing = await this.db.query(
        `SELECT 1 FROM builder_milestones bm
         JOIN builder_case_studies bcs ON bm.case_study_id = bcs.case_study_id
         WHERE bcs.user_id = $1 AND bm.milestone_type = $2`,
        [userId, milestoneType]
      );

      if (existing.rows.length > 0) {
        console.log(`[MilestoneDetector] Milestone ${milestoneType} already recorded for user ${userId}`);
        return;
      }

      // Record new milestone
      await this.db.query(
        `SELECT record_builder_milestone($1, $2, $3, $4, $5)`,
        [userId, milestoneType, title, description, projectId]
      );

      console.log(`[MilestoneDetector] 🎉 Milestone recorded: ${title} for user ${userId}`);

    } catch (error) {
      console.error('[MilestoneDetector] Error recording milestone:', error);
    }
  }
}

module.exports = MilestoneDetector;

/**
 * Builder Case Study API Routes
 *
 * Endpoints for $1 builder journeys:
 * - Auto-updating dashboards showing MRR, users, ecosystem influence
 * - Milestone tracking (first deploy, first revenue, etc.)
 * - Cross-reference graphs showing project dependencies
 * - CalRiven AI-generated narratives
 * - Public portfolio pages
 */

const express = require('express');
const BuilderCaseStudy = require('../lib/builder-case-study');

function initBuilderRoutes(db, calrivenPersona = null) {
  const router = express.Router();
  const builderCaseStudy = new BuilderCaseStudy({ db, calrivenPersona });

  // Middleware: Require authentication (placeholder)
  const requireAuth = (req, res, next) => {
    // TODO: Integrate with actual auth system
    req.userId = 1; // Hardcoded for now
    next();
  };

  /**
   * POST /api/builder/initialize
   * Initialize case study for new builder (after $1 payment)
   */
  router.post('/initialize', requireAuth, async (req, res) => {
    try {
      const { tenant_id, investment_cents = 100 } = req.body;

      const caseStudy = await builderCaseStudy.initializeCaseStudy(
        req.userId,
        tenant_id,
        investment_cents
      );

      res.json({
        success: true,
        case_study: caseStudy,
        message: 'Your builder journey has begun! Track your progress at /builder/dashboard'
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error initializing:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/builder/dashboard
   * Get current user's dashboard
   */
  router.get('/dashboard', requireAuth, async (req, res) => {
    try {
      const caseStudy = await builderCaseStudy.getCaseStudyByUser(req.userId);

      if (!caseStudy) {
        return res.status(404).json({
          error: 'No case study found. Initialize with POST /api/builder/initialize'
        });
      }

      const dashboard = await builderCaseStudy.getDashboard(caseStudy.case_study_id);

      res.json({
        success: true,
        dashboard
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error getting dashboard:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/builder/:slug
   * Get public dashboard by slug
   */
  router.get('/:slug', async (req, res) => {
    try {
      const { slug } = req.params;

      const caseStudy = await builderCaseStudy.getCaseStudyBySlug(slug);
      const dashboard = await builderCaseStudy.getDashboard(caseStudy.case_study_id);

      res.json({
        success: true,
        dashboard,
        public: true
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error getting public dashboard:', error);
      res.status(404).json({ error: 'Dashboard not found or not public' });
    }
  });

  /**
   * POST /api/builder/milestones
   * Record milestone achievement
   */
  router.post('/milestones', requireAuth, async (req, res) => {
    try {
      const { milestone_type, title, description, project_id } = req.body;

      if (!milestone_type || !title) {
        return res.status(400).json({
          error: 'Missing required fields: milestone_type, title'
        });
      }

      const milestone = await builderCaseStudy.recordMilestone(
        req.userId,
        milestone_type,
        title,
        description,
        project_id
      );

      res.json({
        success: true,
        milestone,
        message: `Milestone achieved: ${title}!`
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error recording milestone:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/builder/milestones
   * Get current user's milestones
   */
  router.get('/milestones', requireAuth, async (req, res) => {
    try {
      const { limit = 50 } = req.query;

      const caseStudy = await builderCaseStudy.getCaseStudyByUser(req.userId);

      if (!caseStudy) {
        return res.status(404).json({ error: 'No case study found' });
      }

      const milestones = await builderCaseStudy.getMilestones(
        caseStudy.case_study_id,
        parseInt(limit)
      );

      res.json({
        success: true,
        milestones,
        count: milestones.length
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error getting milestones:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/builder/metrics
   * Record metrics for a period
   */
  router.post('/metrics', requireAuth, async (req, res) => {
    try {
      const { period_type, period_start, metrics } = req.body;

      if (!period_type || !period_start || !metrics) {
        return res.status(400).json({
          error: 'Missing required fields: period_type, period_start, metrics'
        });
      }

      const caseStudy = await builderCaseStudy.getCaseStudyByUser(req.userId);

      if (!caseStudy) {
        return res.status(404).json({ error: 'No case study found' });
      }

      const recorded = await builderCaseStudy.recordMetrics(
        caseStudy.case_study_id,
        req.userId,
        period_type,
        new Date(period_start),
        metrics
      );

      res.json({
        success: true,
        metrics: recorded
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error recording metrics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/builder/ecosystem
   * Get ecosystem connections (cross-references)
   */
  router.get('/ecosystem', requireAuth, async (req, res) => {
    try {
      const connections = await builderCaseStudy.getEcosystemConnections(req.userId);

      res.json({
        success: true,
        ecosystem: connections
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error getting ecosystem:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/builder/snapshot
   * Generate case study snapshot with CalRiven AI narrative
   */
  router.post('/snapshot', requireAuth, async (req, res) => {
    try {
      const caseStudy = await builderCaseStudy.getCaseStudyByUser(req.userId);

      if (!caseStudy) {
        return res.status(404).json({ error: 'No case study found' });
      }

      const snapshot = await builderCaseStudy.generateSnapshot(caseStudy.case_study_id);

      res.json({
        success: true,
        snapshot,
        message: 'Case study snapshot generated!'
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error generating snapshot:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/builder/leaderboard
   * Get builder leaderboard
   */
  router.get('/leaderboard', async (req, res) => {
    try {
      const { limit = 50, sort_by = 'ecosystem' } = req.query;

      const leaderboard = await builderCaseStudy.getLeaderboard(
        parseInt(limit),
        sort_by
      );

      res.json({
        success: true,
        leaderboard,
        count: leaderboard.length
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error getting leaderboard:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PUT /api/builder/settings
   * Update case study settings
   */
  router.put('/settings', requireAuth, async (req, res) => {
    try {
      const caseStudy = await builderCaseStudy.getCaseStudyByUser(req.userId);

      if (!caseStudy) {
        return res.status(404).json({ error: 'No case study found' });
      }

      const allowedFields = [
        'company_name',
        'company_tagline',
        'company_url',
        'builder_stage',
        'public_dashboard_enabled',
        'public_dashboard_slug'
      ];

      const updates = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const updated = await builderCaseStudy.updateCaseStudy(
        caseStudy.case_study_id,
        updates
      );

      res.json({
        success: true,
        case_study: updated
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error updating settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/builder/stats
   * Get aggregate statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      const stats = await db.query(`
        SELECT
          COUNT(*) AS total_builders,
          SUM(total_projects) AS total_projects,
          SUM(total_revenue_cents)::BIGINT AS total_revenue_cents,
          SUM(monthly_recurring_revenue_cents)::BIGINT AS total_mrr_cents,
          AVG(ecosystem_influence_score) AS avg_ecosystem_score,
          COUNT(*) FILTER (WHERE builder_stage = 'revenue') AS builders_with_revenue,
          COUNT(*) FILTER (WHERE builder_stage = 'scaling') AS builders_scaling
        FROM builder_case_studies
        WHERE active = true
      `);

      const recentMilestones = await db.query(`
        SELECT * FROM recent_builder_milestones
        LIMIT 20
      `);

      res.json({
        success: true,
        stats: stats.rows[0],
        recent_milestones: recentMilestones.rows
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error getting stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/builder/project-xref
   * Record project cross-reference (when Project A uses Project B)
   */
  router.post('/project-xref', requireAuth, async (req, res) => {
    try {
      const { source_project_id, target_project_id, reference_type, description } = req.body;

      if (!source_project_id || !target_project_id || !reference_type) {
        return res.status(400).json({
          error: 'Missing required fields: source_project_id, target_project_id, reference_type'
        });
      }

      const result = await db.query(
        `SELECT record_project_xref($1, $2, $3, $4) AS xref_id`,
        [source_project_id, target_project_id, reference_type, description]
      );

      res.json({
        success: true,
        xref_id: result.rows[0].xref_id,
        message: 'Cross-reference recorded!'
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error recording xref:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/builder/recent-activity
   * Get recent activity feed (milestones, metrics updates)
   */
  router.get('/recent-activity', async (req, res) => {
    try {
      const { limit = 50 } = req.query;

      const milestones = await db.query(
        `SELECT * FROM recent_builder_milestones LIMIT $1`,
        [parseInt(limit)]
      );

      res.json({
        success: true,
        activity: milestones.rows
      });

    } catch (error) {
      console.error('[BuilderRoutes] Error getting activity:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = initBuilderRoutes;

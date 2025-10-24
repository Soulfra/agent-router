/**
 * Project Registry Routes
 *
 * Apache-style self-service project management
 *
 * Endpoints:
 * - POST /api/projects - Create new project
 * - GET /api/projects - List user's projects
 * - GET /api/projects/:name - Get project details
 * - PUT /api/projects/:name - Update project
 * - DELETE /api/projects/:name - Delete project
 * - GET /api/projects/:name/usage - Get project usage stats
 * - GET /api/projects/billing/multi - Multi-project billing dashboard
 */

const express = require('express');
const router = express.Router();
const ProjectRegistry = require('../lib/project-registry');

/**
 * POST /api/projects
 * Create a new GitHub Pages project
 *
 * Body:
 * {
 *   projectName: string,
 *   repoUrl: string (optional),
 *   githubPagesUrl: string (optional),
 *   databaseName: string (optional),
 *   tier: string (optional, default 'trial'),
 *   description: string (optional),
 *   tags: string[] (optional)
 * }
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user?.userId || req.headers['x-user-id'] || 'anonymous';

    const {
      projectName,
      repoUrl,
      githubPagesUrl,
      databaseName,
      tier,
      description,
      tags
    } = req.body;

    if (!projectName) {
      return res.status(400).json({
        error: 'Project name is required'
      });
    }

    const registry = new ProjectRegistry(req.db);

    const project = await registry.createProject({
      projectName,
      repoUrl,
      githubPagesUrl,
      databaseName,
      userId,
      tier,
      description,
      tags
    });

    res.json({
      success: true,
      project
    });

  } catch (error) {
    console.error('[ProjectRegistry] Create error:', error);
    res.status(500).json({
      error: 'Failed to create project',
      message: error.message
    });
  }
});

/**
 * GET /api/projects
 * List all projects for current user
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.userId || req.headers['x-user-id'] || 'anonymous';

    const registry = new ProjectRegistry(req.db);
    const projects = await registry.getUserProjects(userId);

    res.json({
      success: true,
      projects
    });

  } catch (error) {
    console.error('[ProjectRegistry] List error:', error);
    res.status(500).json({
      error: 'Failed to list projects',
      message: error.message
    });
  }
});

/**
 * GET /api/projects/:name
 * Get project details
 */
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;

    const registry = new ProjectRegistry(req.db);
    const project = await registry.getProject(name);

    if (!project) {
      return res.status(404).json({
        error: 'Project not found'
      });
    }

    res.json({
      success: true,
      project
    });

  } catch (error) {
    console.error('[ProjectRegistry] Get error:', error);
    res.status(500).json({
      error: 'Failed to get project',
      message: error.message
    });
  }
});

/**
 * PUT /api/projects/:name
 * Update project
 */
router.put('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const updates = req.body;

    const registry = new ProjectRegistry(req.db);
    const project = await registry.updateProject(name, updates);

    res.json({
      success: true,
      project
    });

  } catch (error) {
    console.error('[ProjectRegistry] Update error:', error);
    res.status(500).json({
      error: 'Failed to update project',
      message: error.message
    });
  }
});

/**
 * DELETE /api/projects/:name
 * Delete project
 */
router.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;

    const registry = new ProjectRegistry(req.db);
    await registry.deleteProject(name);

    res.json({
      success: true,
      deleted: name
    });

  } catch (error) {
    console.error('[ProjectRegistry] Delete error:', error);
    res.status(500).json({
      error: 'Failed to delete project',
      message: error.message
    });
  }
});

/**
 * GET /api/projects/:name/usage
 * Get usage stats for a project
 */
router.get('/:name/usage', async (req, res) => {
  try {
    const { name } = req.params;
    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);

    const registry = new ProjectRegistry(req.db);
    const usage = await registry.getProjectUsage(name, year, month);

    res.json({
      success: true,
      ...usage
    });

  } catch (error) {
    console.error('[ProjectRegistry] Usage error:', error);
    res.status(500).json({
      error: 'Failed to get project usage',
      message: error.message
    });
  }
});

/**
 * GET /api/projects/billing/multi
 * Multi-project billing dashboard
 */
router.get('/billing/multi', async (req, res) => {
  try {
    const userId = req.user?.userId || req.headers['x-user-id'] || 'anonymous';

    const registry = new ProjectRegistry(req.db);
    const billing = await registry.getMultiProjectBilling(userId);

    res.json({
      success: true,
      ...billing
    });

  } catch (error) {
    console.error('[ProjectRegistry] Multi-billing error:', error);
    res.status(500).json({
      error: 'Failed to get multi-project billing',
      message: error.message
    });
  }
});

module.exports = router;

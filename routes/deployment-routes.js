/**
 * Deployment API Routes
 *
 * Staging → Production promotion endpoints
 * Craigslist-style environment management
 */

const express = require('express');
const router = express.Router();
const DeploymentManager = require('../lib/deployment-manager');
const ThemeSwitcher = require('../lib/theme-switcher');

let deploymentManager;
let themeSwitcher;

/**
 * Initialize deployment routes
 */
function init(db) {
  deploymentManager = new DeploymentManager(db);
  themeSwitcher = new ThemeSwitcher();
  console.log('[Deployment API] Initialized');
}

/**
 * GET /api/deployment/environment
 * Get current environment info
 */
router.get('/environment', async (req, res) => {
  try {
    const environment = deploymentManager.getEnvironment();
    const theme = await themeSwitcher.getCurrentTheme();

    res.json({
      success: true,
      environment: {
        ...environment,
        theme: theme.name,
        themeLabel: theme.label,
        themeFeatures: theme.features
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/deployment/status
 * Check deployment status
 */
router.get('/status', async (req, res) => {
  try {
    const isLocked = await deploymentManager.isDeploymentLocked();

    const status = {
      isLocked,
      environment: deploymentManager.environment,
      currentTheme: await themeSwitcher.getCurrentTheme(),
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/deployment/promotable
 * Get content ready for promotion
 */
router.get('/promotable', async (req, res) => {
  try {
    const content = await deploymentManager.getPromotableContent();

    res.json({
      success: true,
      content,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/deployment/promote
 * Promote staging → production
 */
router.post('/promote', async (req, res) => {
  try {
    const { deployer = 'api', skipBackup = false, dryRun = false } = req.body;

    // Check if already locked
    if (await deploymentManager.isDeploymentLocked()) {
      return res.status(409).json({
        success: false,
        error: 'Deployment already in progress'
      });
    }

    // Only allow from staging environment
    const currentEnv = deploymentManager.environment;
    if (currentEnv === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Cannot promote from production environment'
      });
    }

    // Start promotion
    const result = await deploymentManager.promoteToProduction({
      deployer,
      skipBackup,
      dryRun
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/deployment/history
 * Get deployment history (backups)
 */
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await deploymentManager.getDeploymentHistory(limit);

    res.json({
      success: true,
      history,
      total: history.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/deployment/rollback
 * Rollback to previous deployment
 */
router.post('/rollback', async (req, res) => {
  try {
    const { backupName } = req.body;

    if (!backupName) {
      return res.status(400).json({
        success: false,
        error: 'backupName required'
      });
    }

    const result = await deploymentManager.rollback(backupName);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/theme
 * Get current theme
 */
router.get('/theme', async (req, res) => {
  try {
    const metadata = await themeSwitcher.getThemeMetadata();

    res.json({
      success: true,
      theme: metadata
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/theme/switch
 * Switch theme
 */
router.post('/theme/switch', async (req, res) => {
  try {
    const { theme } = req.body;

    if (!theme) {
      return res.status(400).json({
        success: false,
        error: 'theme name required'
      });
    }

    const newTheme = await themeSwitcher.switchTheme(theme);

    res.json({
      success: true,
      theme: newTheme
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/theme/available
 * Get available themes
 */
router.get('/theme/available', (req, res) => {
  try {
    const themes = themeSwitcher.getAvailableThemes();

    res.json({
      success: true,
      themes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = { router, init };

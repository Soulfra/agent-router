/**
 * App Store Routes
 *
 * Virtual app store API:
 * - Browse templates
 * - Install apps (virtual provisioning)
 * - Manage launcher state
 * - QR session verification
 * - Biometric authentication
 *
 * "Installing app" = creating folder on server + subdomain + database
 */

const express = require('express');
const router = express.Router();
const AppProvisioner = require('../lib/app-provisioner');
const AppTemplates = require('../lib/app-templates');
const LauncherState = require('../lib/launcher-state');
const QRSessionManager = require('../lib/qr-session-manager');
const BiometricAuth = require('../lib/biometric-auth');

// Dependencies (injected via initRoutes)
let db = null;
let appProvisioner = null;
let appTemplates = null;
let launcherState = null;
let qrSessionManager = null;
let biometricAuth = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database, options = {}) {
  db = database;

  appProvisioner = new AppProvisioner({
    db,
    baseUrl: options.baseUrl || 'calos.ai',
    instancesPath: options.instancesPath,
    templatesPath: options.templatesPath
  });

  appTemplates = new AppTemplates({ db });
  launcherState = new LauncherState({ db });
  qrSessionManager = new QRSessionManager({ db });
  biometricAuth = new BiometricAuth({
    db,
    rpName: options.rpName || 'CALOS',
    rpId: options.rpId || 'calos.ai',
    origin: options.origin || 'https://calos.ai'
  });

  return router;
}

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * GET /api/appstore/templates
 * List available app templates
 */
router.get('/templates', async (req, res) => {
  try {
    const { category, search, featured } = req.query;

    let templates;

    if (search) {
      templates = await appTemplates.searchTemplates(search);
    } else if (featured) {
      templates = await appTemplates.getFeaturedTemplates();
    } else {
      templates = await appTemplates.listTemplates(category);
    }

    res.json({
      success: true,
      templates
    });

  } catch (error) {
    console.error('[AppStoreRoutes] List templates error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/appstore/templates/:templateId
 * Get template details
 */
router.get('/templates/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;

    const template = await appTemplates.getTemplate(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    res.json({
      success: true,
      template
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Get template error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// APP INSTALLATION
// ============================================================================

/**
 * POST /api/appstore/install
 * Install app (virtual provisioning)
 *
 * Body:
 * {
 *   "user_id": "uuid",
 *   "template_id": "dating",
 *   "folder_id": "uuid" (optional)
 * }
 */
router.post('/install', async (req, res) => {
  try {
    const { user_id, template_id, folder_id } = req.body;

    if (!user_id || !template_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id and template_id required'
      });
    }

    // Start QR session for installation
    const qrSession = await qrSessionManager.startSession({
      user_id,
      session_type: 'app_install',
      metadata: { template_id }
    });

    // Install app
    const app = await appProvisioner.installApp(user_id, template_id, {
      folderId: folder_id
    });

    // Increment install count
    await appTemplates.incrementInstallCount(template_id);

    res.json({
      success: true,
      app,
      qr_session: {
        session_id: qrSession.session_id,
        qr_code: qrSession.qr_code,
        expires_in: qrSession.expires_in
      }
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Install error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/appstore/uninstall
 * Uninstall app
 *
 * Body:
 * {
 *   "user_id": "uuid",
 *   "app_id": "uuid"
 * }
 */
router.post('/uninstall', async (req, res) => {
  try {
    const { user_id, app_id } = req.body;

    if (!user_id || !app_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id and app_id required'
      });
    }

    await appProvisioner.uninstallApp(user_id, app_id);

    res.json({
      success: true,
      message: 'App uninstalled'
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Uninstall error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/appstore/installed/:userId
 * Get user's installed apps
 */
router.get('/installed/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const apps = await appProvisioner.getInstalledApps(userId);

    res.json({
      success: true,
      apps,
      total: apps.length
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Get installed apps error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// LAUNCHER STATE
// ============================================================================

/**
 * GET /api/appstore/launcher/:userId
 * Get launcher state (apps + folders)
 */
router.get('/launcher/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const state = await launcherState.getLauncherState(userId);

    res.json({
      success: true,
      launcher: state
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Get launcher error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/appstore/launcher/folder
 * Create launcher folder
 *
 * Body:
 * {
 *   "user_id": "uuid",
 *   "name": "Social Apps",
 *   "icon": "📱"
 * }
 */
router.post('/launcher/folder', async (req, res) => {
  try {
    const { user_id, name, icon } = req.body;

    if (!user_id || !name) {
      return res.status(400).json({
        success: false,
        error: 'user_id and name required'
      });
    }

    const folder = await launcherState.createFolder(user_id, name, icon);

    res.json({
      success: true,
      folder
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Create folder error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/appstore/launcher/folder/:folderId
 * Delete launcher folder
 */
router.delete('/launcher/folder/:folderId', async (req, res) => {
  try {
    const { folderId } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id required'
      });
    }

    const deleted = await launcherState.deleteFolder(user_id, folderId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Folder not found'
      });
    }

    res.json({
      success: true,
      message: 'Folder deleted'
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Delete folder error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/appstore/launcher/move
 * Move app to folder
 *
 * Body:
 * {
 *   "user_id": "uuid",
 *   "app_id": "uuid",
 *   "folder_id": "uuid" (null = root)
 * }
 */
router.put('/launcher/move', async (req, res) => {
  try {
    const { user_id, app_id, folder_id } = req.body;

    if (!user_id || !app_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id and app_id required'
      });
    }

    const moved = await launcherState.moveAppToFolder(user_id, app_id, folder_id);

    if (!moved) {
      return res.status(404).json({
        success: false,
        error: 'App not found'
      });
    }

    res.json({
      success: true,
      message: 'App moved'
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Move app error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/appstore/launcher/reorder
 * Reorder apps or folders
 *
 * Body:
 * {
 *   "user_id": "uuid",
 *   "type": "apps" | "folders",
 *   "positions": [{id, position}]
 * }
 */
router.put('/launcher/reorder', async (req, res) => {
  try {
    const { user_id, type, positions } = req.body;

    if (!user_id || !type || !positions) {
      return res.status(400).json({
        success: false,
        error: 'user_id, type, and positions required'
      });
    }

    let reordered = false;

    if (type === 'apps') {
      reordered = await launcherState.reorderApps(user_id, positions);
    } else if (type === 'folders') {
      reordered = await launcherState.reorderFolders(user_id, positions);
    }

    res.json({
      success: reordered,
      message: reordered ? 'Reordered successfully' : 'Reorder failed'
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Reorder error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/appstore/launcher/search/:userId
 * Search launcher apps
 */
router.get('/launcher/search/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'q (query) parameter required'
      });
    }

    const apps = await launcherState.searchApps(userId, q);

    res.json({
      success: true,
      apps
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Search apps error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/appstore/launcher/recent/:userId
 * Get recently used apps
 */
router.get('/launcher/recent/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit } = req.query;

    const apps = await launcherState.getRecentlyUsed(userId, parseInt(limit) || 10);

    res.json({
      success: true,
      apps
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Get recent apps error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/appstore/launcher/launch
 * Log app launch
 *
 * Body:
 * {
 *   "user_id": "uuid",
 *   "app_id": "uuid"
 * }
 */
router.post('/launcher/launch', async (req, res) => {
  try {
    const { user_id, app_id } = req.body;

    if (!user_id || !app_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id and app_id required'
      });
    }

    await launcherState.logAppLaunch(user_id, app_id);

    res.json({
      success: true
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Log launch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// QR SESSION VERIFICATION
// ============================================================================

/**
 * POST /api/appstore/qr/start
 * Start QR session
 *
 * Body:
 * {
 *   "user_id": "uuid",
 *   "session_type": "login" | "purchase" | "profile_setup" | "app_install",
 *   "metadata": {}
 * }
 */
router.post('/qr/start', async (req, res) => {
  try {
    const { user_id, session_type, metadata } = req.body;

    if (!user_id || !session_type) {
      return res.status(400).json({
        success: false,
        error: 'user_id and session_type required'
      });
    }

    const session = await qrSessionManager.startSession({
      user_id,
      session_type,
      metadata
    });

    res.json({
      success: true,
      session
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Start QR session error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/appstore/qr/verify
 * Verify QR session (scan at end)
 *
 * Body:
 * {
 *   "session_token": "token",
 *   "completion_data": {}
 * }
 */
router.post('/qr/verify', async (req, res) => {
  try {
    const { session_token, completion_data } = req.body;

    if (!session_token) {
      return res.status(400).json({
        success: false,
        error: 'session_token required'
      });
    }

    const result = await qrSessionManager.verifySession(session_token, completion_data);

    res.json({
      success: result.verified,
      result
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Verify QR session error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/appstore/qr/status/:sessionId
 * Get QR session status
 */
router.get('/qr/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await qrSessionManager.getSessionStatus(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Get session status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// BIOMETRIC AUTHENTICATION
// ============================================================================

/**
 * POST /api/appstore/biometric/register/options
 * Get WebAuthn registration options
 *
 * Body:
 * {
 *   "user_id": "uuid",
 *   "email": "user@example.com"
 * }
 */
router.post('/biometric/register/options', async (req, res) => {
  try {
    const { user_id, email } = req.body;

    if (!user_id || !email) {
      return res.status(400).json({
        success: false,
        error: 'user_id and email required'
      });
    }

    const options = await biometricAuth.generateRegistrationOptions(user_id, email);

    res.json({
      success: true,
      options
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Biometric registration options error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/appstore/biometric/register/verify
 * Verify WebAuthn registration
 *
 * Body:
 * {
 *   "challenge_id": "uuid",
 *   "credential": {...}
 * }
 */
router.post('/biometric/register/verify', async (req, res) => {
  try {
    const { challenge_id, credential } = req.body;

    if (!challenge_id || !credential) {
      return res.status(400).json({
        success: false,
        error: 'challenge_id and credential required'
      });
    }

    const result = await biometricAuth.verifyRegistration(challenge_id, credential);

    res.json({
      success: true,
      credential: result
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Biometric registration verify error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/appstore/biometric/auth/options
 * Get WebAuthn authentication options
 *
 * Body:
 * {
 *   "email": "user@example.com" (optional)
 * }
 */
router.post('/biometric/auth/options', async (req, res) => {
  try {
    const { email } = req.body;

    const options = await biometricAuth.generateAuthenticationOptions(email);

    res.json({
      success: true,
      options
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Biometric auth options error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/appstore/biometric/auth/verify
 * Verify WebAuthn authentication
 *
 * Body:
 * {
 *   "challenge_id": "uuid",
 *   "credential": {...}
 * }
 */
router.post('/biometric/auth/verify', async (req, res) => {
  try {
    const { challenge_id, credential } = req.body;

    if (!challenge_id || !credential) {
      return res.status(400).json({
        success: false,
        error: 'challenge_id and credential required'
      });
    }

    const result = await biometricAuth.verifyAuthentication(challenge_id, credential);

    res.json({
      success: true,
      user: result
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Biometric auth verify error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/appstore/biometric/credentials/:userId
 * List user's biometric credentials
 */
router.get('/biometric/credentials/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const credentials = await biometricAuth.listCredentials(userId);

    res.json({
      success: true,
      credentials
    });

  } catch (error) {
    console.error('[AppStoreRoutes] List credentials error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/appstore/biometric/credentials/:credentialId
 * Remove biometric credential
 */
router.delete('/biometric/credentials/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id required'
      });
    }

    const removed = await biometricAuth.removeCredential(user_id, credentialId);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found'
      });
    }

    res.json({
      success: true,
      message: 'Credential removed'
    });

  } catch (error) {
    console.error('[AppStoreRoutes] Remove credential error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = { router, initRoutes };

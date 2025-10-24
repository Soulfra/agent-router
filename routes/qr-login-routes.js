/**
 * QR Login API Routes
 *
 * Backend API endpoints for QR code authentication
 * - Secure credential storage (server-side)
 * - Rate limiting
 * - Session management
 * - Analytics
 *
 * Endpoints:
 * - POST /api/v1/qr-login/session - Create QR session
 * - POST /api/v1/qr-login/verify - Verify session (iPhone)
 * - GET /api/v1/qr-login/poll/:sessionId - Poll for verification (Desktop)
 * - GET /api/v1/qr-login/stats - Get system stats
 *
 * @version 1.0.0
 * @license MIT
 */

const express = require('express');
const router = express.Router();
const QRLoginManager = require('../lib/qr-login-manager');

// Initialize QR Login Manager
let qrLoginManager = null;

/**
 * Initialize QR Login Manager (lazy)
 */
async function getQRLoginManager() {
  if (!qrLoginManager) {
    qrLoginManager = new QRLoginManager({
      spreadsheetId: process.env.GOOGLE_SHEETS_DB_ID,
      credentialsPath: process.env.GOOGLE_SHEETS_CREDENTIALS_PATH,
      sheetName: 'qr_sessions',
      maxRequestsPerMinute: 20
    });

    await qrLoginManager.init();

    // Start cleanup interval (every 10 minutes)
    setInterval(() => {
      qrLoginManager.cleanupExpiredSessions();
    }, 10 * 60 * 1000);
  }

  return qrLoginManager;
}

/**
 * Get client IP address
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         'unknown';
}

/**
 * POST /api/v1/qr-login/session
 * Create QR login session
 *
 * Body: {
 *   deviceFingerprint: string
 * }
 *
 * Response: {
 *   sessionId: string,
 *   qrPayload: string (JSON),
 *   expiresAt: number,
 *   sheetUrl: string
 * }
 */
router.post('/session', async (req, res) => {
  try {
    const { deviceFingerprint } = req.body;

    if (!deviceFingerprint) {
      return res.status(400).json({
        error: 'deviceFingerprint is required'
      });
    }

    const manager = await getQRLoginManager();
    const ip = getClientIP(req);

    const session = await manager.createSession(deviceFingerprint, ip);

    res.json({
      success: true,
      ...session
    });

  } catch (error) {
    console.error('[QRLoginRoutes] Create session error:', error);

    if (error.message.includes('Rate limit')) {
      return res.status(429).json({
        error: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to create session',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/qr-login/verify
 * Verify session (iPhone scans QR)
 *
 * Body: {
 *   sessionId: string,
 *   phoneFingerprint: string,
 *   userId: string
 * }
 *
 * Response: {
 *   success: boolean,
 *   sessionId: string,
 *   userId: string
 * }
 */
router.post('/verify', async (req, res) => {
  try {
    const { sessionId, phoneFingerprint, userId } = req.body;

    if (!sessionId || !phoneFingerprint || !userId) {
      return res.status(400).json({
        error: 'sessionId, phoneFingerprint, and userId are required'
      });
    }

    const manager = await getQRLoginManager();
    const ip = getClientIP(req);

    const result = await manager.verifySession(sessionId, phoneFingerprint, userId, ip);

    res.json(result);

  } catch (error) {
    console.error('[QRLoginRoutes] Verify session error:', error);

    if (error.message.includes('Rate limit')) {
      return res.status(429).json({
        error: error.message
      });
    }

    if (error.message.includes('not found') || error.message.includes('expired')) {
      return res.status(404).json({
        error: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to verify session',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/qr-login/poll/:sessionId
 * Poll for verification status (Desktop)
 *
 * Response: {
 *   verified: boolean,
 *   session?: {
 *     sessionId: string,
 *     userId: string,
 *     phoneFingerprint: string,
 *     verifiedAt: number
 *   },
 *   error?: string
 * }
 */
router.get('/poll/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        error: 'sessionId is required'
      });
    }

    const manager = await getQRLoginManager();
    const ip = getClientIP(req);

    const status = await manager.pollForVerification(sessionId, ip);

    res.json(status);

  } catch (error) {
    console.error('[QRLoginRoutes] Poll verification error:', error);

    if (error.message.includes('Rate limit')) {
      return res.status(429).json({
        error: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to poll for verification',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/qr-login/stats
 * Get system statistics
 *
 * Response: {
 *   total: number,
 *   pending: number,
 *   verified: number,
 *   expired: number
 * }
 */
router.get('/stats', async (req, res) => {
  try {
    const manager = await getQRLoginManager();
    const stats = await manager.getStats();

    res.json(stats);

  } catch (error) {
    console.error('[QRLoginRoutes] Get stats error:', error);

    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/qr-login/health
 * Health check endpoint
 *
 * Response: {
 *   status: string,
 *   uptime: number,
 *   googleSheetsConnected: boolean
 * }
 */
router.get('/health', async (req, res) => {
  try {
    const manager = await getQRLoginManager();

    res.json({
      status: 'ok',
      uptime: process.uptime(),
      googleSheetsConnected: manager.sheetsDB.initialized,
      version: '1.0.0'
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

module.exports = router;

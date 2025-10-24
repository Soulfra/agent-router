/**
 * Device Pairing Routes
 *
 * Multi-device authentication and pairing:
 * - QR code device pairing
 * - WiFi proximity auto-pairing
 * - Device trust management
 * - Pairing history and audit
 */

const express = require('express');
const router = express.Router();
const DevicePairingManager = require('../lib/device-pairing');

const {
  requireAuth,
  extractDeviceFingerprint
} = require('../middleware/sso-auth');

// Dependencies (injected via initRoutes)
let db = null;
let devicePairing = null;

/**
 * Initialize routes with database connection
 */
function initRoutes(database) {
  db = database;
  devicePairing = new DevicePairingManager({ db });
  return router;
}

/**
 * POST /api/auth/pair/initiate
 * Generate QR code for device pairing
 *
 * Body: {
 *   sourceDeviceId: "device_123"
 * }
 */
router.post('/pair/initiate', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sourceDeviceId } = req.body;

    if (!sourceDeviceId) {
      return res.status(400).json({
        error: 'sourceDeviceId is required'
      });
    }

    // Generate pairing code
    const pairingSession = await devicePairing.generatePairingCode(userId, sourceDeviceId);

    res.json({
      success: true,
      pairing: pairingSession
    });
  } catch (error) {
    console.error('[DevicePairingRoutes] Error initiating pairing:', error.message);
    res.status(500).json({
      error: error.message || 'Failed to initiate pairing'
    });
  }
});

/**
 * POST /api/auth/pair/complete
 * Complete device pairing with code
 *
 * Body: {
 *   pairingCode: "ABC123...",
 *   deviceInfo: {
 *     fingerprint: "hash",
 *     userAgent: "...",
 *     platform: "iOS",
 *     nickname: "My iPhone"
 *   }
 * }
 */
router.post('/pair/complete', async (req, res) => {
  try {
    const { pairingCode, deviceInfo } = req.body;

    if (!pairingCode || !deviceInfo) {
      return res.status(400).json({
        error: 'pairingCode and deviceInfo are required'
      });
    }

    // Required device fields
    if (!deviceInfo.fingerprint) {
      return res.status(400).json({
        error: 'deviceInfo.fingerprint is required'
      });
    }

    // Complete pairing
    const result = await devicePairing.completePairing(pairingCode, {
      fingerprint: deviceInfo.fingerprint,
      userAgent: deviceInfo.userAgent || req.headers['user-agent'],
      platform: deviceInfo.platform,
      ipAddress: req.ip,
      nickname: deviceInfo.nickname
    });

    res.json({
      success: true,
      device: result
    });
  } catch (error) {
    console.error('[DevicePairingRoutes] Error completing pairing:', error.message);
    res.status(400).json({
      error: error.message || 'Failed to complete pairing'
    });
  }
});

/**
 * POST /api/auth/pair/wifi-proximity
 * Auto-pair device via WiFi proximity
 *
 * Body: {
 *   sourceDeviceId: "device_123",
 *   newDeviceFingerprint: "hash",
 *   networkInfo: {
 *     ssid: "MyWiFi",
 *     bssid: "00:11:22:33:44:55",
 *     localIp: "192.168.1.100"
 *   }
 * }
 */
router.post('/pair/wifi-proximity', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sourceDeviceId, newDeviceFingerprint, networkInfo } = req.body;

    if (!sourceDeviceId || !newDeviceFingerprint || !networkInfo) {
      return res.status(400).json({
        error: 'sourceDeviceId, newDeviceFingerprint, and networkInfo are required'
      });
    }

    if (!networkInfo.ssid) {
      return res.status(400).json({
        error: 'networkInfo.ssid is required'
      });
    }

    // Attempt WiFi proximity pairing
    const result = await devicePairing.detectWiFiProximity(
      userId,
      sourceDeviceId,
      newDeviceFingerprint,
      networkInfo
    );

    res.json({
      success: true,
      device: result
    });
  } catch (error) {
    console.error('[DevicePairingRoutes] WiFi proximity error:', error.message);
    res.status(400).json({
      error: error.message || 'WiFi proximity pairing failed'
    });
  }
});

/**
 * GET /api/auth/devices
 * List all paired devices for authenticated user
 */
router.get('/devices', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const devices = await devicePairing.getUserDevices(userId);

    res.json({
      success: true,
      devices
    });
  } catch (error) {
    console.error('[DevicePairingRoutes] Error getting devices:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve devices'
    });
  }
});

/**
 * POST /api/auth/devices/:deviceId/trust
 * Manually elevate device trust level
 */
router.post('/devices/:deviceId/trust', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.params;

    // Elevate trust
    const newTrustLevel = await devicePairing.elevateDeviceTrust(userId, deviceId);

    res.json({
      success: true,
      deviceId,
      trustLevel: newTrustLevel
    });
  } catch (error) {
    console.error('[DevicePairingRoutes] Trust elevation error:', error.message);
    res.status(400).json({
      error: error.message || 'Failed to elevate trust'
    });
  }
});

/**
 * DELETE /api/auth/devices/:deviceId
 * Revoke device access
 */
router.delete('/devices/:deviceId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.params;

    await devicePairing.revokeDevice(userId, deviceId);

    res.json({
      success: true,
      message: 'Device revoked successfully'
    });
  } catch (error) {
    console.error('[DevicePairingRoutes] Error revoking device:', error.message);
    res.status(400).json({
      error: error.message || 'Failed to revoke device'
    });
  }
});

/**
 * GET /api/auth/pairing-history
 * Get pairing event history
 *
 * Query params:
 *   limit: Number of events (default: 50)
 */
router.get('/pairing-history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    const history = await devicePairing.getPairingHistory(userId, limit);

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('[DevicePairingRoutes] Error getting history:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve pairing history'
    });
  }
});

/**
 * GET /api/auth/pairing-sessions/active
 * Get active pairing sessions for user
 */
router.get('/pairing-sessions/active', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT
        id, pairing_method, pairing_code,
        created_at, expires_at,
        EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_until_expiry
       FROM device_pairing_sessions
       WHERE user_id = $1
         AND status = 'pending'
         AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    );

    const sessions = result.rows.map(row => ({
      id: row.id,
      pairingMethod: row.pairing_method,
      pairingCode: row.pairing_code,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      secondsUntilExpiry: Math.floor(row.seconds_until_expiry)
    }));

    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('[DevicePairingRoutes] Error getting active sessions:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve active sessions'
    });
  }
});

/**
 * POST /api/auth/pairing-sessions/:sessionId/cancel
 * Cancel an active pairing session
 */
router.post('/pairing-sessions/:sessionId/cancel', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    // Verify ownership and cancel
    const result = await db.query(
      `UPDATE device_pairing_sessions
       SET status = 'cancelled'
       WHERE id = $1
         AND user_id = $2
         AND status = 'pending'
       RETURNING id`,
      [sessionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Pairing session not found or already completed'
      });
    }

    res.json({
      success: true,
      message: 'Pairing session cancelled'
    });
  } catch (error) {
    console.error('[DevicePairingRoutes] Error cancelling session:', error.message);
    res.status(500).json({
      error: 'Failed to cancel session'
    });
  }
});

/**
 * GET /api/auth/trust-levels
 * Get trust level definitions (for UI display)
 */
router.get('/trust-levels', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        trust_level, display_name, description,
        permissions, icon, color
       FROM trust_level_definitions
       ORDER BY
         CASE trust_level
           WHEN 'unverified' THEN 1
           WHEN 'verified' THEN 2
           WHEN 'trusted' THEN 3
           ELSE 4
         END`
    );

    const trustLevels = result.rows.map(row => ({
      level: row.trust_level,
      displayName: row.display_name,
      description: row.description,
      permissions: row.permissions,
      icon: row.icon,
      color: row.color
    }));

    res.json({
      success: true,
      trustLevels
    });
  } catch (error) {
    console.error('[DevicePairingRoutes] Error getting trust levels:', error.message);
    res.status(500).json({
      error: 'Failed to retrieve trust levels'
    });
  }
});

module.exports = { initRoutes };

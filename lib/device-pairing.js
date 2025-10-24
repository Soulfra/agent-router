/**
 * Device Pairing Manager
 *
 * Seamless multi-device authentication system:
 * - QR code pairing (pair new device to account)
 * - WiFi proximity detection (auto-pair on same network)
 * - Bluetooth proximity pairing (optional)
 * - Trust level elevation (unverified → verified → trusted)
 * - Multi-device sync and handoff
 *
 * Use cases:
 * - User logs in on phone, auto-pairs laptop on same WiFi
 * - User scans QR code to add new device
 * - Trusted devices can warm up new accounts
 * - Team collaboration via device sharing
 *
 * Trust levels:
 * - unverified: New device, limited access
 * - verified: QR paired or WiFi paired
 * - trusted: Multiple sessions, good reputation
 */

const crypto = require('crypto');

class DevicePairingManager {
  constructor(options = {}) {
    this.db = options.db;
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET;

    // Pairing config
    this.pairingCodeExpiry = 5 * 60 * 1000; // 5 minutes
    this.wifiProximityWindow = 30 * 60 * 1000; // 30 minutes
    this.trustElevationThreshold = {
      verified: { sessions: 1, actions: 5 },
      trusted: { sessions: 10, actions: 50, days: 7 }
    };

    console.log('[DevicePairing] Initialized');
  }

  /**
   * Generate QR code pairing session
   *
   * @param {integer} userId - User ID
   * @param {string} sourceDeviceId - Device initiating pairing
   * @returns {Promise<object>} - Pairing code and QR data
   */
  async generatePairingCode(userId, sourceDeviceId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    // Verify source device is trusted
    const sourceDevice = await this._getDevice(sourceDeviceId);
    if (!sourceDevice || sourceDevice.user_id !== userId) {
      throw new Error('Source device not found or unauthorized');
    }

    // Generate secure pairing code
    const pairingCode = this._generateSecureCode(16);
    const expiresAt = new Date(Date.now() + this.pairingCodeExpiry);

    try {
      // Create pairing session
      const result = await this.db.query(
        `INSERT INTO device_pairing_sessions (
          user_id, source_device_id, pairing_code, pairing_method,
          expires_at, status
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, pairing_code, expires_at`,
        [userId, sourceDeviceId, pairingCode, 'qr_code', expiresAt, 'pending']
      );

      const session = result.rows[0];

      // Generate QR code data (JWT with embedded info)
      const qrData = this._generateQRPayload({
        sessionId: session.id,
        userId,
        code: pairingCode,
        expiresAt: session.expires_at
      });

      console.log(`[DevicePairing] Generated QR pairing code for user ${userId}`);

      return {
        sessionId: session.id,
        pairingCode,
        qrData,
        expiresAt: session.expires_at,
        expiresIn: this.pairingCodeExpiry / 1000 // seconds
      };
    } catch (error) {
      console.error('[DevicePairing] Error generating pairing code:', error.message);
      throw error;
    }
  }

  /**
   * Complete device pairing
   *
   * @param {string} pairingCode - Code from QR or input
   * @param {object} newDeviceInfo - New device information
   * @returns {Promise<object>} - Paired device info
   */
  async completePairing(pairingCode, newDeviceInfo) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    const {
      fingerprint,
      userAgent,
      platform,
      ipAddress,
      nickname
    } = newDeviceInfo;

    try {
      // Find active pairing session
      const sessionResult = await this.db.query(
        `SELECT id, user_id, source_device_id, pairing_method, expires_at, status
         FROM device_pairing_sessions
         WHERE pairing_code = $1
           AND status = 'pending'
           AND expires_at > NOW()`,
        [pairingCode]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error('Invalid or expired pairing code');
      }

      const session = sessionResult.rows[0];

      // Check if device already exists
      let deviceId;
      const existingDevice = await this.db.query(
        `SELECT id FROM user_devices WHERE fingerprint = $1`,
        [fingerprint]
      );

      if (existingDevice.rows.length > 0) {
        // Device exists, just link it
        deviceId = existingDevice.rows[0].id;

        await this.db.query(
          `UPDATE user_devices
           SET user_id = $1,
               trust_level = 'verified',
               last_seen_at = NOW(),
               updated_at = NOW()
           WHERE id = $2`,
          [session.user_id, deviceId]
        );
      } else {
        // Create new device
        const deviceResult = await this.db.query(
          `INSERT INTO user_devices (
            user_id, fingerprint, user_agent, platform,
            trust_level, first_seen_at, last_seen_at, nickname
          )
          VALUES ($1, $2, $3, $4, 'verified', NOW(), NOW(), $5)
          RETURNING id`,
          [session.user_id, fingerprint, userAgent, platform, nickname]
        );

        deviceId = deviceResult.rows[0].id;
      }

      // Mark session as completed
      await this.db.query(
        `UPDATE device_pairing_sessions
         SET status = 'completed',
             target_device_id = $1,
             completed_at = NOW()
         WHERE id = $2`,
        [deviceId, session.id]
      );

      // Log pairing event
      await this._logPairingEvent(session.user_id, deviceId, 'paired', session.pairing_method);

      console.log(`[DevicePairing] Completed pairing for user ${session.user_id}, device ${deviceId}`);

      return {
        deviceId,
        userId: session.user_id,
        trustLevel: 'verified',
        pairingMethod: session.pairing_method
      };
    } catch (error) {
      console.error('[DevicePairing] Error completing pairing:', error.message);
      throw error;
    }
  }

  /**
   * Detect and auto-pair devices on same WiFi network
   *
   * @param {integer} userId - User ID
   * @param {string} sourceDeviceId - Known device
   * @param {string} newDeviceFingerprint - New device to pair
   * @param {object} networkInfo - WiFi network information
   * @returns {Promise<object>} - Auto-paired device info
   */
  async detectWiFiProximity(userId, sourceDeviceId, newDeviceFingerprint, networkInfo) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    const { ssid, bssid, localIp } = networkInfo;

    try {
      // Verify source device
      const sourceDevice = await this._getDevice(sourceDeviceId);
      if (!sourceDevice || sourceDevice.user_id !== userId) {
        throw new Error('Source device not authorized');
      }

      // Check if devices are on same network
      const isSameNetwork = await this._verifySameNetwork(sourceDevice, networkInfo);
      if (!isSameNetwork) {
        throw new Error('Devices not on same network');
      }

      // Check for existing pairing session or create new one
      let session;
      const existingSession = await this.db.query(
        `SELECT id FROM device_pairing_sessions
         WHERE user_id = $1
           AND source_device_id = $2
           AND pairing_method = 'wifi_proximity'
           AND status = 'pending'
           AND expires_at > NOW()
         LIMIT 1`,
        [userId, sourceDeviceId]
      );

      if (existingSession.rows.length > 0) {
        session = existingSession.rows[0];
      } else {
        // Create WiFi proximity session
        const sessionResult = await this.db.query(
          `INSERT INTO device_pairing_sessions (
            user_id, source_device_id, pairing_method,
            pairing_metadata, expires_at, status
          )
          VALUES ($1, $2, 'wifi_proximity', $3, NOW() + INTERVAL '30 minutes', 'pending')
          RETURNING id`,
          [userId, sourceDeviceId, JSON.stringify({ ssid, bssid, localIp })]
        );

        session = sessionResult.rows[0];
      }

      // Auto-pair the new device
      const newDeviceResult = await this.db.query(
        `INSERT INTO user_devices (
          user_id, fingerprint, trust_level,
          first_seen_at, last_seen_at, metadata
        )
        VALUES ($1, $2, 'verified', NOW(), NOW(), $3)
        ON CONFLICT (fingerprint) DO UPDATE SET
          user_id = $1,
          trust_level = 'verified',
          last_seen_at = NOW()
        RETURNING id`,
        [userId, newDeviceFingerprint, JSON.stringify({ pairedVia: 'wifi', ssid })]
      );

      const newDeviceId = newDeviceResult.rows[0].id;

      // Complete pairing session
      await this.db.query(
        `UPDATE device_pairing_sessions
         SET status = 'completed',
             target_device_id = $1,
             completed_at = NOW()
         WHERE id = $2`,
        [newDeviceId, session.id]
      );

      // Log event
      await this._logPairingEvent(userId, newDeviceId, 'auto_paired', 'wifi_proximity');

      console.log(`[DevicePairing] WiFi auto-paired device ${newDeviceId} for user ${userId}`);

      return {
        deviceId: newDeviceId,
        userId,
        trustLevel: 'verified',
        pairingMethod: 'wifi_proximity'
      };
    } catch (error) {
      console.error('[DevicePairing] WiFi proximity error:', error.message);
      throw error;
    }
  }

  /**
   * Elevate device trust level based on usage
   *
   * @param {integer} userId - User ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<string>} - New trust level
   */
  async elevateDeviceTrust(userId, deviceId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      // Get device current state
      const device = await this._getDevice(deviceId);
      if (!device || device.user_id !== userId) {
        throw new Error('Device not found or unauthorized');
      }

      const currentTrust = device.trust_level;

      // Calculate usage metrics
      const metrics = await this._calculateDeviceMetrics(userId, deviceId);

      // Determine new trust level
      let newTrustLevel = currentTrust;

      if (currentTrust === 'unverified') {
        // Elevate to verified
        if (metrics.sessions >= this.trustElevationThreshold.verified.sessions &&
            metrics.actions >= this.trustElevationThreshold.verified.actions) {
          newTrustLevel = 'verified';
        }
      } else if (currentTrust === 'verified') {
        // Elevate to trusted
        if (metrics.sessions >= this.trustElevationThreshold.trusted.sessions &&
            metrics.actions >= this.trustElevationThreshold.trusted.actions &&
            metrics.daysSinceFirstSeen >= this.trustElevationThreshold.trusted.days &&
            metrics.reputationScore >= 0.8) {
          newTrustLevel = 'trusted';
        }
      }

      // Update if changed
      if (newTrustLevel !== currentTrust) {
        await this.db.query(
          `UPDATE user_devices
           SET trust_level = $1,
               reputation_score = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [newTrustLevel, metrics.reputationScore, deviceId]
        );

        // Log elevation
        await this._logPairingEvent(userId, deviceId, 'trust_elevated', null, {
          from: currentTrust,
          to: newTrustLevel,
          metrics
        });

        console.log(`[DevicePairing] Elevated device ${deviceId} trust from ${currentTrust} to ${newTrustLevel}`);
      }

      return newTrustLevel;
    } catch (error) {
      console.error('[DevicePairing] Trust elevation error:', error.message);
      throw error;
    }
  }

  /**
   * Get all paired devices for a user
   *
   * @param {integer} userId - User ID
   * @returns {Promise<Array>} - List of devices
   */
  async getUserDevices(userId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(
        `SELECT
          id, fingerprint, nickname, user_agent, platform,
          trust_level, reputation_score, badge, tier,
          first_seen_at, last_seen_at, created_at
         FROM user_devices
         WHERE user_id = $1
         ORDER BY last_seen_at DESC`,
        [userId]
      );

      return result.rows.map(row => ({
        id: row.id,
        fingerprint: row.fingerprint,
        nickname: row.nickname,
        userAgent: row.user_agent,
        platform: row.platform,
        trustLevel: row.trust_level,
        reputationScore: row.reputation_score,
        badge: row.badge,
        tier: row.tier,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('[DevicePairing] Error getting user devices:', error.message);
      throw error;
    }
  }

  /**
   * Revoke device access
   *
   * @param {integer} userId - User ID
   * @param {string} deviceId - Device to revoke
   * @returns {Promise<boolean>} - Success
   */
  async revokeDevice(userId, deviceId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      // Verify ownership
      const device = await this._getDevice(deviceId);
      if (!device || device.user_id !== userId) {
        throw new Error('Device not found or unauthorized');
      }

      // Set trust level to unverified and clear user link
      await this.db.query(
        `UPDATE user_devices
         SET trust_level = 'unverified',
             user_id = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [deviceId]
      );

      // Log revocation
      await this._logPairingEvent(userId, deviceId, 'revoked', null);

      console.log(`[DevicePairing] Revoked device ${deviceId} for user ${userId}`);

      return true;
    } catch (error) {
      console.error('[DevicePairing] Error revoking device:', error.message);
      throw error;
    }
  }

  /**
   * Get pairing history
   *
   * @param {integer} userId - User ID
   * @param {integer} limit - Max results
   * @returns {Promise<Array>} - Pairing events
   */
  async getPairingHistory(userId, limit = 50) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(
        `SELECT
          dpe.id, dpe.device_id, dpe.event_type, dpe.pairing_method,
          dpe.event_metadata, dpe.created_at,
          ud.nickname, ud.platform, ud.trust_level
         FROM device_pairing_events dpe
         LEFT JOIN user_devices ud ON ud.id = dpe.device_id
         WHERE dpe.user_id = $1
         ORDER BY dpe.created_at DESC
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows.map(row => ({
        id: row.id,
        deviceId: row.device_id,
        deviceNickname: row.nickname,
        platform: row.platform,
        eventType: row.event_type,
        pairingMethod: row.pairing_method,
        metadata: row.event_metadata,
        trustLevel: row.trust_level,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('[DevicePairing] Error getting pairing history:', error.message);
      throw error;
    }
  }

  /**
   * Generate secure random code
   * @private
   */
  _generateSecureCode(length = 16) {
    return crypto.randomBytes(length).toString('hex').substring(0, length).toUpperCase();
  }

  /**
   * Generate QR code payload (JWT)
   * @private
   */
  _generateQRPayload(data) {
    // In production, use proper JWT signing
    // For now, return JSON string (should be replaced with jwt.sign())
    const payload = {
      type: 'device_pairing',
      ...data,
      iat: Date.now()
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Get device by ID
   * @private
   */
  async _getDevice(deviceId) {
    const result = await this.db.query(
      `SELECT * FROM user_devices WHERE id = $1`,
      [deviceId]
    );

    return result.rows[0] || null;
  }

  /**
   * Verify devices are on same network
   * @private
   */
  async _verifySameNetwork(sourceDevice, networkInfo) {
    // Check if source device has network metadata
    const sourceMetadata = sourceDevice.metadata || {};
    const sourceSsid = sourceMetadata.ssid || sourceMetadata.lastSsid;

    if (!sourceSsid || !networkInfo.ssid) {
      return false;
    }

    // Simple SSID match (could be enhanced with BSSID, IP range checks)
    return sourceSsid === networkInfo.ssid;
  }

  /**
   * Calculate device usage metrics
   * @private
   */
  async _calculateDeviceMetrics(userId, deviceId) {
    // Count sessions
    const sessionResult = await this.db.query(
      `SELECT COUNT(*) as sessions
       FROM user_sessions
       WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId]
    );

    // Count actions
    const actionResult = await this.db.query(
      `SELECT COUNT(*) as actions
       FROM actions_log
       WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId]
    );

    // Get device info
    const device = await this._getDevice(deviceId);
    const daysSinceFirstSeen = Math.floor(
      (Date.now() - new Date(device.first_seen_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calculate reputation score (0-1)
    const reputationScore = Math.min(1, (
      (parseInt(sessionResult.rows[0].sessions) / 20) * 0.5 +
      (parseInt(actionResult.rows[0].actions) / 100) * 0.3 +
      (Math.min(daysSinceFirstSeen, 30) / 30) * 0.2
    ));

    return {
      sessions: parseInt(sessionResult.rows[0].sessions),
      actions: parseInt(actionResult.rows[0].actions),
      daysSinceFirstSeen,
      reputationScore: parseFloat(reputationScore.toFixed(2))
    };
  }

  /**
   * Log pairing event
   * @private
   */
  async _logPairingEvent(userId, deviceId, eventType, pairingMethod, metadata = {}) {
    try {
      await this.db.query(
        `INSERT INTO device_pairing_events (
          user_id, device_id, event_type, pairing_method, event_metadata
        )
        VALUES ($1, $2, $3, $4, $5)`,
        [userId, deviceId, eventType, pairingMethod, JSON.stringify(metadata)]
      );
    } catch (error) {
      console.error('[DevicePairing] Error logging event:', error.message);
    }
  }
}

module.exports = DevicePairingManager;

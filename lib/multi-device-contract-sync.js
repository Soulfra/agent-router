/**
 * Multi-Device Contract Sync
 *
 * Real-time contract synchronization across multiple devices (phone, computer, tablet).
 * DocuSign-like multi-device signing experience with:
 * - QR code pairing (phone ↔ computer)
 * - WiFi proximity auto-pairing
 * - WebSocket real-time sync
 * - Broadcast signature to all devices
 * - Same contract state across all devices
 *
 * Use Cases:
 * 1. Start session on phone → Computer auto-pairs (same WiFi)
 * 2. Work on either device → Both see changes in real-time
 * 3. Sign on phone → Computer sees signature immediately
 * 4. Review contract on computer → Phone shows same state
 * 5. QR code at start and end (DocuSign verification)
 *
 * Integration:
 * - Ollama Session Contract (lib/ollama-session-contract.js)
 * - QR Session Manager (lib/qr-session-manager.js)
 * - Device Pairing (lib/device-pairing.js)
 * - WebSocket (ws library)
 */

const crypto = require('crypto');
const QRSessionManager = require('./qr-session-manager');
const DevicePairing = require('./device-pairing');
const OllamaSessionContract = require('./ollama-session-contract');

class MultiDeviceContractSync {
  constructor(config = {}) {
    this.db = config.db;
    this.verbose = config.verbose || false;

    // WebSocket server (passed from router)
    this.wss = config.wss;

    // Connected clients: Map<sessionId, Set<WebSocket>>
    this.connections = new Map();

    // Device info: Map<WebSocket, deviceInfo>
    this.devices = new Map();

    // Managers
    this.qrManager = new QRSessionManager({ db: this.db });
    this.devicePairing = new DevicePairing({ db: this.db });
    this.contractManager = new OllamaSessionContract({ db: this.db });

    // Session state cache: Map<sessionId, state>
    this.sessionState = new Map();
  }

  // ============================================================================
  // SESSION LIFECYCLE
  // ============================================================================

  /**
   * Start multi-device contract session
   *
   * @param {Object} options - Session options
   * @returns {Promise<Object>} Session info with QR code
   */
  async startSession(options = {}) {
    try {
      const {
        userId,
        sessionName,
        primaryModel = 'ollama:mistral',
        domainId = null,
        device = 'desktop' // 'desktop', 'mobile', 'tablet'
      } = options;

      // Create Ollama streaming session
      const sessionResult = await this.db.query(`
        INSERT INTO ollama_streaming_sessions (
          user_id,
          domain_id,
          primary_model,
          primary_provider,
          session_name,
          status,
          contract_status,
          version,
          version_history
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING session_id, created_at
      `, [
        userId,
        domainId,
        primaryModel,
        primaryModel.startsWith('ollama:') ? 'ollama' : 'openai',
        sessionName || 'New Contract Session',
        'active',
        'draft',
        1,
        JSON.stringify([{
          version: 1,
          timestamp: new Date().toISOString(),
          reason: 'session_started',
          device
        }])
      ]);

      const sessionId = sessionResult.rows[0].session_id;
      const createdAt = sessionResult.rows[0].created_at;

      // Generate QR code for session (DocuSign-like verification)
      const qrCode = await this.qrManager.generateSessionQR({
        sessionId,
        userId,
        purpose: 'contract_session',
        expiresIn: 24 * 60 * 60 * 1000 // 24 hours
      });

      // Initialize session state
      this.sessionState.set(sessionId, {
        sessionId,
        userId,
        contractStatus: 'draft',
        devices: new Set([device]),
        qrCodeStart: qrCode.data,
        qrCodeEnd: null, // Generated when contract signed
        startedAt: createdAt,
        lastActivity: new Date()
      });

      this._log(`✅ Session started: ${sessionId} on ${device}`);

      return {
        success: true,
        sessionId,
        userId,
        qrCode: qrCode.data,
        qrCodeUrl: qrCode.url,
        contractStatus: 'draft',
        device,
        message: 'Session started. Scan QR code to pair other devices.'
      };

    } catch (error) {
      console.error('[MultiDeviceContractSync] Start session error:', error.message);
      throw error;
    }
  }

  /**
   * Pair new device to existing session
   *
   * @param {Object} options - Pairing options
   * @returns {Promise<Object>} Pairing result
   */
  async pairDevice(options = {}) {
    try {
      const {
        sessionId,
        userId,
        deviceId,
        deviceType, // 'desktop', 'mobile', 'tablet'
        pairingMethod = 'qr' // 'qr', 'wifi', 'manual'
      } = options;

      // Verify session exists
      const sessionResult = await this.db.query(`
        SELECT session_id, user_id, contract_status, is_immutable
        FROM ollama_streaming_sessions
        WHERE session_id = $1 AND user_id = $2
      `, [sessionId, userId]);

      if (sessionResult.rows.length === 0) {
        throw new Error('Session not found or access denied');
      }

      const session = sessionResult.rows[0];

      // Pair device using device pairing system
      const pairingResult = await this.devicePairing.pairDevice({
        userId,
        deviceId,
        deviceType,
        method: pairingMethod
      });

      // Add device to session state
      const state = this.sessionState.get(sessionId);
      if (state) {
        state.devices.add(deviceType);
        state.lastActivity = new Date();
      }

      // Broadcast to all connected devices
      await this._broadcastToSession(sessionId, {
        type: 'device_paired',
        sessionId,
        device: deviceType,
        pairingMethod,
        timestamp: new Date().toISOString()
      });

      this._log(`✅ Device paired: ${deviceType} via ${pairingMethod}`);

      return {
        success: true,
        sessionId,
        device: deviceType,
        pairingMethod,
        contractStatus: session.contract_status,
        message: 'Device paired successfully. Contract synced.'
      };

    } catch (error) {
      console.error('[MultiDeviceContractSync] Pair device error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // REAL-TIME SYNC (WEBSOCKET)
  // ============================================================================

  /**
   * Register WebSocket connection for session
   *
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} deviceInfo - Device information
   */
  async registerConnection(ws, deviceInfo = {}) {
    try {
      const { sessionId, userId, deviceType, deviceId } = deviceInfo;

      // Verify session access
      const sessionResult = await this.db.query(`
        SELECT session_id, user_id, contract_status
        FROM ollama_streaming_sessions
        WHERE session_id = $1 AND user_id = $2
      `, [sessionId, userId]);

      if (sessionResult.rows.length === 0) {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Session not found or access denied'
        }));
        ws.close();
        return;
      }

      // Add connection to session
      if (!this.connections.has(sessionId)) {
        this.connections.set(sessionId, new Set());
      }
      this.connections.get(sessionId).add(ws);

      // Store device info
      this.devices.set(ws, {
        sessionId,
        userId,
        deviceType,
        deviceId,
        connectedAt: new Date()
      });

      // Send current state to new connection
      const currentState = await this._getSessionState(sessionId);
      ws.send(JSON.stringify({
        type: 'sync',
        state: currentState,
        timestamp: new Date().toISOString()
      }));

      // Broadcast device connected event
      await this._broadcastToSession(sessionId, {
        type: 'device_connected',
        device: deviceType,
        timestamp: new Date().toISOString()
      }, ws); // Exclude sender

      this._log(`📱 Device connected: ${deviceType} to session ${sessionId}`);

      // Handle disconnection
      ws.on('close', () => {
        this._handleDisconnection(ws);
      });

    } catch (error) {
      console.error('[MultiDeviceContractSync] Register connection error:', error.message);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message
      }));
      ws.close();
    }
  }

  /**
   * Handle WebSocket disconnection
   *
   * @param {WebSocket} ws - WebSocket connection
   */
  _handleDisconnection(ws) {
    const deviceInfo = this.devices.get(ws);
    if (!deviceInfo) return;

    const { sessionId, deviceType } = deviceInfo;

    // Remove from connections
    const sessionConnections = this.connections.get(sessionId);
    if (sessionConnections) {
      sessionConnections.delete(ws);
      if (sessionConnections.size === 0) {
        this.connections.delete(sessionId);
      }
    }

    // Remove device info
    this.devices.delete(ws);

    // Broadcast device disconnected event
    this._broadcastToSession(sessionId, {
      type: 'device_disconnected',
      device: deviceType,
      timestamp: new Date().toISOString()
    });

    this._log(`📴 Device disconnected: ${deviceType} from session ${sessionId}`);
  }

  /**
   * Broadcast message to all devices in session
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} message - Message to broadcast
   * @param {WebSocket} excludeWs - Exclude this connection (optional)
   */
  async _broadcastToSession(sessionId, message, excludeWs = null) {
    const sessionConnections = this.connections.get(sessionId);
    if (!sessionConnections) return;

    const messageStr = JSON.stringify(message);

    for (const ws of sessionConnections) {
      if (ws !== excludeWs && ws.readyState === 1) { // 1 = OPEN
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error('[MultiDeviceContractSync] Broadcast error:', error.message);
        }
      }
    }
  }

  /**
   * Get current session state
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Session state
   */
  async _getSessionState(sessionId) {
    try {
      const sessionResult = await this.db.query(`
        SELECT
          session_id,
          user_id,
          session_name,
          primary_model,
          status,
          contract_status,
          version,
          created_at,
          ended_at,
          total_cost_usd,
          approved_cost_usd,
          signed_at,
          soulfra_hash,
          is_immutable
        FROM ollama_streaming_sessions
        WHERE session_id = $1
      `, [sessionId]);

      if (sessionResult.rows.length === 0) {
        throw new Error('Session not found');
      }

      const session = sessionResult.rows[0];

      // Get messages
      const messagesResult = await this.db.query(`
        SELECT message_id, role, content, timestamp, model, tokens, cost_usd
        FROM ollama_session_messages
        WHERE session_id = $1
        ORDER BY timestamp ASC
      `, [sessionId]);

      const messages = messagesResult.rows;

      return {
        sessionId: session.session_id,
        userId: session.user_id,
        sessionName: session.session_name,
        primaryModel: session.primary_model,
        status: session.status,
        contractStatus: session.contract_status,
        version: session.version,
        createdAt: session.created_at,
        endedAt: session.ended_at,
        totalCost: parseFloat(session.total_cost_usd || 0),
        approvedCost: parseFloat(session.approved_cost_usd || 0),
        signedAt: session.signed_at,
        soulfraHash: session.soulfra_hash,
        isImmutable: session.is_immutable,
        messageCount: messages.length,
        messages: messages.map(m => ({
          id: m.message_id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          model: m.model,
          tokens: m.tokens,
          cost: parseFloat(m.cost_usd || 0)
        }))
      };

    } catch (error) {
      console.error('[MultiDeviceContractSync] Get session state error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // CONTRACT WORKFLOW SYNC
  // ============================================================================

  /**
   * Sync contract review to all devices
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Review result
   */
  async syncReview(sessionId) {
    try {
      // Enter review mode
      const reviewResult = await this.contractManager.enterReview(sessionId);

      // Broadcast to all devices
      await this._broadcastToSession(sessionId, {
        type: 'contract_review',
        sessionId,
        reviewData: reviewResult.reviewData,
        timestamp: new Date().toISOString()
      });

      this._log(`📋 Contract review synced: ${sessionId}`);

      return reviewResult;

    } catch (error) {
      console.error('[MultiDeviceContractSync] Sync review error:', error.message);
      throw error;
    }
  }

  /**
   * Sync contract approval to all devices
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} options - Approval options
   * @returns {Promise<Object>} Approval result
   */
  async syncApproval(sessionId, options = {}) {
    try {
      // Approve costs
      const approvalResult = await this.contractManager.approveCosts(sessionId, options);

      // Broadcast to all devices
      await this._broadcastToSession(sessionId, {
        type: 'contract_approved',
        sessionId,
        approvedCost: approvalResult.approvedCost,
        approvedCeiling: approvalResult.approvedCeiling,
        timestamp: new Date().toISOString()
      });

      this._log(`✅ Contract approval synced: ${sessionId}`);

      return approvalResult;

    } catch (error) {
      console.error('[MultiDeviceContractSync] Sync approval error:', error.message);
      throw error;
    }
  }

  /**
   * Sync contract signature to all devices
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} options - Signature options
   * @returns {Promise<Object>} Signature result
   */
  async syncSignature(sessionId, options = {}) {
    try {
      // Sign contract
      const signatureResult = await this.contractManager.signContract(sessionId, options);

      // Generate end QR code (same as start for verification)
      const state = this.sessionState.get(sessionId);
      if (state) {
        state.qrCodeEnd = state.qrCodeStart; // DocuSign-like: QR at start === QR at end
        state.contractStatus = 'signed';
      }

      // Broadcast to all devices
      await this._broadcastToSession(sessionId, {
        type: 'contract_signed',
        sessionId,
        signedAt: signatureResult.signedAt,
        soulfraHash: signatureResult.soulfraHash,
        publicShareUrl: signatureResult.publicShareUrl,
        qrCodeEnd: state?.qrCodeStart, // Show same QR for verification
        timestamp: new Date().toISOString()
      });

      this._log(`🔏 Contract signature synced: ${sessionId}`);

      return {
        ...signatureResult,
        qrCodeEnd: state?.qrCodeStart
      };

    } catch (error) {
      console.error('[MultiDeviceContractSync] Sync signature error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // WIFI AUTO-PAIRING
  // ============================================================================

  /**
   * Auto-pair devices on same WiFi network
   *
   * @param {Object} options - Auto-pair options
   * @returns {Promise<Object>} Pairing result
   */
  async autoPairWifi(options = {}) {
    try {
      const {
        userId,
        sessionId,
        deviceId,
        deviceType,
        ipAddress,
        networkSsid
      } = options;

      // Check if devices are on same network
      const existingDevices = await this.devicePairing.getDevicesByUser(userId);
      const sameNetworkDevices = existingDevices.filter(d =>
        d.network_ssid === networkSsid && d.device_id !== deviceId
      );

      if (sameNetworkDevices.length === 0) {
        return {
          success: false,
          message: 'No devices on same network'
        };
      }

      // Auto-pair with WiFi proximity
      const pairingResult = await this.pairDevice({
        sessionId,
        userId,
        deviceId,
        deviceType,
        pairingMethod: 'wifi'
      });

      this._log(`📡 Auto-paired via WiFi: ${deviceType} on ${networkSsid}`);

      return {
        success: true,
        ...pairingResult,
        networkSsid,
        pairedWith: sameNetworkDevices.map(d => d.device_type)
      };

    } catch (error) {
      console.error('[MultiDeviceContractSync] Auto-pair WiFi error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get active devices for session
   *
   * @param {string} sessionId - Session UUID
   * @returns {Array<Object>} Active devices
   */
  getActiveDevices(sessionId) {
    const sessionConnections = this.connections.get(sessionId);
    if (!sessionConnections) return [];

    const devices = [];
    for (const ws of sessionConnections) {
      const deviceInfo = this.devices.get(ws);
      if (deviceInfo) {
        devices.push({
          deviceType: deviceInfo.deviceType,
          deviceId: deviceInfo.deviceId,
          connectedAt: deviceInfo.connectedAt
        });
      }
    }

    return devices;
  }

  /**
   * Get sync statistics
   *
   * @returns {Object} Stats
   */
  getStats() {
    const activeSessions = this.connections.size;
    let totalConnections = 0;

    for (const sessionConnections of this.connections.values()) {
      totalConnections += sessionConnections.size;
    }

    return {
      activeSessions,
      totalConnections,
      averageDevicesPerSession: activeSessions > 0 ? (totalConnections / activeSessions).toFixed(2) : 0,
      sessionStates: this.sessionState.size
    };
  }

  /**
   * Log message if verbose mode enabled
   * @private
   */
  _log(message) {
    if (this.verbose) {
      console.log(`[MultiDeviceContractSync] ${message}`);
    }
  }
}

module.exports = MultiDeviceContractSync;

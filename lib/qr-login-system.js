/**
 * QR Code Login System
 *
 * Enables device pairing via QR code scan:
 * 1. Desktop generates QR code with session ID
 * 2. iPhone scans QR code
 * 3. iPhone sends auth token via WebSocket
 * 4. Desktop receives token and completes login
 *
 * Features:
 * - Session-based authentication
 * - WebSocket real-time pairing
 * - 5-minute session expiry
 * - Device fingerprint integration
 * - Support for OAuth providers (Google, Twitter, GitHub, LinkedIn)
 */

const crypto = require('crypto');
const QRCode = require('qrcode');

class QRLoginSystem {
  constructor() {
    this.sessions = new Map(); // sessionId -> { userId, deviceId, expiresAt, status }
    this.websockets = new Map(); // sessionId -> WebSocket
    this.SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    // Clean up expired sessions every minute
    setInterval(() => this.cleanupExpiredSessions(), 60 * 1000);
  }

  /**
   * Generate QR code for desktop login
   * Returns: { sessionId, qrCode (data URL), expiresAt }
   */
  async generateQRCode(options = {}) {
    const sessionId = this.generateSessionId();
    const expiresAt = Date.now() + this.SESSION_TIMEOUT;

    // Store session
    this.sessions.set(sessionId, {
      sessionId,
      status: 'pending', // pending -> scanned -> verified
      createdAt: Date.now(),
      expiresAt,
      deviceId: options.deviceId || null,
      userId: null,
      metadata: options.metadata || {}
    });

    // Generate QR code payload
    const payload = {
      sessionId,
      timestamp: Date.now(),
      type: 'qr-login',
      callbackUrl: options.callbackUrl || 'https://soulfra.github.io/qr-verify'
    };

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
      width: 300,
      margin: 2,
      color: {
        dark: '#667eea',
        light: '#ffffff'
      }
    });

    return {
      sessionId,
      qrCode: qrDataUrl,
      expiresAt,
      expiresIn: this.SESSION_TIMEOUT
    };
  }

  /**
   * Verify QR code scan from iPhone
   * Called when iPhone scans QR and sends back auth token
   */
  async verifyQRScan(sessionId, authData) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error('Session not found or expired');
    }

    if (session.status === 'verified') {
      throw new Error('Session already verified');
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      throw new Error('Session expired');
    }

    // Update session with auth data
    session.status = 'verified';
    session.userId = authData.userId;
    session.deviceId = authData.deviceId;
    session.fingerprintId = authData.fingerprintId;
    session.verifiedAt = Date.now();
    session.authMethod = authData.authMethod || 'device-fingerprint';

    // If OAuth was used, store provider info
    if (authData.oauth) {
      session.oauth = {
        provider: authData.oauth.provider, // google, twitter, github, linkedin
        email: authData.oauth.email,
        name: authData.oauth.name,
        profileUrl: authData.oauth.profileUrl
      };
    }

    this.sessions.set(sessionId, session);

    // Notify desktop via WebSocket
    this.notifyDesktop(sessionId, {
      type: 'login-success',
      session: this.getSessionData(session)
    });

    return {
      success: true,
      sessionId,
      userId: session.userId
    };
  }

  /**
   * Check session status from desktop
   * Polls this endpoint while waiting for iPhone scan
   */
  getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { exists: false, status: 'not-found' };
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return { exists: false, status: 'expired' };
    }

    return {
      exists: true,
      status: session.status,
      verified: session.status === 'verified',
      expiresAt: session.expiresAt,
      expiresIn: session.expiresAt - Date.now(),
      ...(session.status === 'verified' ? {
        session: this.getSessionData(session)
      } : {})
    };
  }

  /**
   * Register WebSocket for real-time notifications
   * Desktop calls this to receive instant login notification
   */
  registerWebSocket(sessionId, ws) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
      return false;
    }

    this.websockets.set(sessionId, ws);

    // Send initial status
    ws.send(JSON.stringify({
      type: 'status',
      status: session.status,
      expiresAt: session.expiresAt
    }));

    // Clean up on disconnect
    ws.on('close', () => {
      this.websockets.delete(sessionId);
    });

    return true;
  }

  /**
   * Notify desktop via WebSocket
   */
  notifyDesktop(sessionId, data) {
    const ws = this.websockets.get(sessionId);

    if (ws && ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Create login token for authenticated session
   * Returns JWT-style token for API access
   */
  createLoginToken(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session || session.status !== 'verified') {
      throw new Error('Session not verified');
    }

    // Create JWT-style token (simplified - use jsonwebtoken in production)
    const payload = {
      userId: session.userId,
      deviceId: session.deviceId,
      fingerprintId: session.fingerprintId,
      sessionId: session.sessionId,
      authMethod: session.authMethod,
      issuedAt: Date.now(),
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    };

    if (session.oauth) {
      payload.oauth = session.oauth;
    }

    const token = Buffer.from(JSON.stringify(payload)).toString('base64url');

    return {
      token,
      expiresAt: payload.expiresAt,
      userId: session.userId
    };
  }

  /**
   * Verify login token
   */
  verifyLoginToken(token) {
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64url').toString());

      if (Date.now() > payload.expiresAt) {
        throw new Error('Token expired');
      }

      return {
        valid: true,
        userId: payload.userId,
        deviceId: payload.deviceId,
        fingerprintId: payload.fingerprintId,
        authMethod: payload.authMethod,
        oauth: payload.oauth
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Generate secure session ID
   */
  generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Get session data for client (sanitized)
   */
  getSessionData(session) {
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      deviceId: session.deviceId,
      fingerprintId: session.fingerprintId,
      authMethod: session.authMethod,
      verifiedAt: session.verifiedAt,
      oauth: session.oauth || null
    };
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
        this.websockets.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[QR Login] Cleaned ${cleaned} expired sessions`);
    }
  }

  /**
   * Get system stats
   */
  getStats() {
    const sessions = Array.from(this.sessions.values());

    return {
      totalSessions: sessions.length,
      pendingSessions: sessions.filter(s => s.status === 'pending').length,
      verifiedSessions: sessions.filter(s => s.status === 'verified').length,
      activeWebsockets: this.websockets.size,
      byAuthMethod: sessions.reduce((acc, s) => {
        acc[s.authMethod || 'unknown'] = (acc[s.authMethod || 'unknown'] || 0) + 1;
        return acc;
      }, {}),
      byOAuthProvider: sessions
        .filter(s => s.oauth)
        .reduce((acc, s) => {
          acc[s.oauth.provider] = (acc[s.oauth.provider] || 0) + 1;
          return acc;
        }, {})
    };
  }
}

module.exports = QRLoginSystem;

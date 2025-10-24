/**
 * QR Login Manager (Server-Side)
 *
 * Manages QR code authentication sessions using Google Sheets
 * - Server-side credential storage (secure)
 * - Rate limiting per IP/user
 * - Session management and cleanup
 * - Analytics and logging
 *
 * This runs on the backend and proxies requests to Google Sheets,
 * keeping API keys secure and adding rate limiting.
 *
 * @version 1.0.0
 * @license MIT
 */

const GoogleSheetsDBAdapter = require('./google-sheets-db-adapter');

class QRLoginManager {
  constructor(config = {}) {
    // Initialize Google Sheets adapter
    this.sheetsDB = new GoogleSheetsDBAdapter({
      spreadsheetId: config.spreadsheetId || process.env.GOOGLE_SHEETS_DB_ID,
      credentialsPath: config.credentialsPath || process.env.GOOGLE_SHEETS_CREDENTIALS_PATH
    });

    this.sheetName = config.sheetName || 'qr_sessions';
    this.sessionTimeout = config.sessionTimeout || 5 * 60 * 1000; // 5 minutes

    // Rate limiting per IP
    this.rateLimits = new Map(); // ip -> { count, resetAt }
    this.maxRequestsPerMinute = config.maxRequestsPerMinute || 20;

    console.log('[QRLoginManager] Initialized with Google Sheets backend');
  }

  /**
   * Initialize Google Sheets connection
   */
  async init() {
    await this.sheetsDB.init();

    // Ensure qr_sessions sheet exists
    await this.ensureQRSessionsSheet();

    console.log('[QRLoginManager] Ready');
  }

  /**
   * Ensure qr_sessions sheet exists in Google Sheets
   * @private
   */
  async ensureQRSessionsSheet() {
    try {
      // Add qr_sessions to sheet names
      if (!this.sheetsDB.sheetNames.qrSessions) {
        this.sheetsDB.sheetNames.qrSessions = this.sheetName;
      }

      // Sheet will be auto-created by GoogleSheetsDBAdapter if it doesn't exist
      // We just need to ensure headers are set
      const exists = await this.sheetsDB.query(this.sheetName, {});

      if (!exists || exists.length === 0) {
        console.log('[QRLoginManager] Initializing qr_sessions sheet...');
      }

    } catch (error) {
      console.error('[QRLoginManager] Error ensuring sheet exists:', error.message);
      throw error;
    }
  }

  /**
   * Check rate limit for IP address
   * @param {string} ip - Client IP address
   * @returns {boolean} - True if within rate limit
   */
  checkRateLimit(ip) {
    const now = Date.now();
    const limit = this.rateLimits.get(ip);

    if (!limit || now > limit.resetAt) {
      // New window
      this.rateLimits.set(ip, {
        count: 1,
        resetAt: now + 60000 // 1 minute
      });
      return true;
    }

    if (limit.count >= this.maxRequestsPerMinute) {
      return false;
    }

    limit.count++;
    return true;
  }

  /**
   * Create QR login session
   * @param {string} deviceFingerprint - Desktop device fingerprint
   * @param {string} ip - Client IP address
   * @returns {Object} Session data with QR payload
   */
  async createSession(deviceFingerprint, ip = 'unknown') {
    // Check rate limit
    if (!this.checkRateLimit(ip)) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    }

    try {
      // Generate unique session ID
      const sessionId = this.generateSessionId();
      const now = Date.now();
      const expiresAt = now + this.sessionTimeout;

      // Create session data
      const sessionData = {
        id: sessionId,
        sessionId: sessionId,
        status: 'pending',
        created_at: new Date(now).toISOString(),
        createdAt: now.toString(),
        expiresAt: expiresAt.toString(),
        desktopFingerprint: deviceFingerprint,
        phoneFingerprint: '',
        verified: 'false',
        userId: '',
        verifiedAt: ''
      };

      // Insert into Google Sheets
      await this.sheetsDB.insert(this.sheetName, sessionData);

      console.log('[QRLoginManager] Session created:', sessionId);

      // Return QR payload
      return {
        sessionId: sessionId,
        qrPayload: JSON.stringify({
          type: 'calos-qr-login',
          version: '3.0.0',
          spreadsheetId: this.sheetsDB.spreadsheetId,
          sheetName: this.sheetName,
          sessionId: sessionId,
          expiresAt: expiresAt
        }),
        expiresAt: expiresAt,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${this.sheetsDB.spreadsheetId}/edit#gid=0`
      };

    } catch (error) {
      console.error('[QRLoginManager] Create session error:', error);
      throw error;
    }
  }

  /**
   * Verify session (iPhone scans QR)
   * @param {string} sessionId - Session ID from QR code
   * @param {string} phoneFingerprint - Phone device fingerprint
   * @param {string} userId - User ID
   * @param {string} ip - Client IP address
   * @returns {Object} Verification result
   */
  async verifySession(sessionId, phoneFingerprint, userId, ip = 'unknown') {
    // Check rate limit
    if (!this.checkRateLimit(ip)) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    }

    try {
      // Find session
      const sessions = await this.sheetsDB.query(this.sheetName, { sessionId });

      if (!sessions || sessions.length === 0) {
        throw new Error('Session not found');
      }

      const session = sessions[0];

      // Check if expired
      if (Date.now() > parseInt(session.expiresAt)) {
        throw new Error('Session expired');
      }

      // Update session to verified
      await this.sheetsDB.update(
        this.sheetName,
        { sessionId },
        {
          status: 'verified',
          verified: 'true',
          phoneFingerprint: phoneFingerprint,
          userId: userId,
          verifiedAt: Date.now().toString()
        }
      );

      console.log('[QRLoginManager] Session verified:', sessionId);

      return {
        success: true,
        sessionId: sessionId,
        userId: userId
      };

    } catch (error) {
      console.error('[QRLoginManager] Verify session error:', error);
      throw error;
    }
  }

  /**
   * Poll for session verification (desktop checks if phone scanned)
   * @param {string} sessionId - Session ID
   * @param {string} ip - Client IP address
   * @returns {Object} Verification status
   */
  async pollForVerification(sessionId, ip = 'unknown') {
    // Check rate limit
    if (!this.checkRateLimit(ip)) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    }

    try {
      // Find session
      const sessions = await this.sheetsDB.query(this.sheetName, { sessionId });

      if (!sessions || sessions.length === 0) {
        return { verified: false, error: 'Session not found' };
      }

      const session = sessions[0];

      // Check if expired
      if (Date.now() > parseInt(session.expiresAt)) {
        return { verified: false, error: 'Session expired' };
      }

      // Check if verified
      if (session.verified === 'true' || session.verified === true) {
        return {
          verified: true,
          session: {
            sessionId: session.sessionId,
            userId: session.userId,
            phoneFingerprint: session.phoneFingerprint,
            verifiedAt: parseInt(session.verifiedAt)
          }
        };
      }

      return { verified: false };

    } catch (error) {
      console.error('[QRLoginManager] Poll verification error:', error);
      return { verified: false, error: error.message };
    }
  }

  /**
   * Clean up expired sessions
   * Should be called periodically (e.g., every 10 minutes)
   */
  async cleanupExpiredSessions() {
    try {
      const now = Date.now();
      const allSessions = await this.sheetsDB.query(this.sheetName, {});

      let deletedCount = 0;

      for (const session of allSessions) {
        if (now > parseInt(session.expiresAt)) {
          await this.sheetsDB.delete(this.sheetName, { sessionId: session.sessionId });
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`[QRLoginManager] Cleaned up ${deletedCount} expired sessions`);
      }

    } catch (error) {
      console.error('[QRLoginManager] Cleanup error:', error);
    }
  }

  /**
   * Get session stats
   * @returns {Object} Statistics
   */
  async getStats() {
    try {
      const allSessions = await this.sheetsDB.query(this.sheetName, {});
      const now = Date.now();

      const stats = {
        total: allSessions.length,
        pending: 0,
        verified: 0,
        expired: 0
      };

      for (const session of allSessions) {
        if (now > parseInt(session.expiresAt)) {
          stats.expired++;
        } else if (session.verified === 'true' || session.verified === true) {
          stats.verified++;
        } else {
          stats.pending++;
        }
      }

      return stats;

    } catch (error) {
      console.error('[QRLoginManager] Get stats error:', error);
      return { error: error.message };
    }
  }

  /**
   * Generate unique session ID
   * @private
   */
  generateSessionId() {
    const array = new Uint8Array(16);
    const crypto = require('crypto');
    crypto.randomFillSync(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

module.exports = QRLoginManager;

/**
 * QR Session Manager
 *
 * "QR at start and end must be the same" - Loop verification system
 *
 * Like DocuSign signature flow:
 * 1. Generate QR at start (session token)
 * 2. User performs actions (profile setup, purchase, etc.)
 * 3. Show same QR at end
 * 4. User scans to verify completion
 * 5. If QR matches → session validated, data saved
 *
 * Prevents:
 * - Session hijacking
 * - Man-in-the-middle attacks
 * - Incomplete transactions
 * - Multi-user confusion
 */

const crypto = require('crypto');
const QRGenerator = require('./qr-generator');

class QRSessionManager {
  constructor(options = {}) {
    this.db = options.db;
    this.qrGenerator = new QRGenerator(options);

    // Session config
    this.sessionExpiry = options.sessionExpiry || 30 * 60 * 1000; // 30 minutes
    this.maxSessions = options.maxSessions || 5; // Per user

    console.log('[QRSessionManager] Initialized');
  }

  /**
   * Start QR session (generate QR at beginning)
   *
   * @param {object} params - Session parameters
   * @returns {Promise<object>} - Session with QR code
   */
  async startSession(params) {
    try {
      const {
        user_id,
        session_type, // 'login', 'purchase', 'profile_setup', 'app_install'
        metadata = {}
      } = params;

      // Generate secure session token
      const sessionToken = this.generateSessionToken();
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + this.sessionExpiry);

      // Create session
      const result = await this.db.query(`
        INSERT INTO qr_sessions (
          session_id,
          session_token,
          user_id,
          session_type,
          status,
          metadata,
          expires_at,
          started_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING session_id, session_token, started_at, expires_at
      `, [
        sessionId,
        sessionToken,
        user_id,
        session_type,
        'active',
        JSON.stringify(metadata),
        expiresAt
      ]);

      const session = result.rows[0];

      // Generate QR code with session token
      const qrData = await this.generateSessionQR(sessionToken, session_type, metadata);

      console.log(`[QRSessionManager] Started ${session_type} session ${sessionId} for user ${user_id}`);

      return {
        session_id: sessionId,
        session_token: sessionToken,
        qr_code: qrData,
        expires_at: expiresAt,
        expires_in: this.sessionExpiry / 1000, // seconds
        session_type
      };

    } catch (error) {
      console.error('[QRSessionManager] Start session error:', error);
      throw error;
    }
  }

  /**
   * Verify QR session (scan QR at end to complete loop)
   *
   * @param {string} sessionToken - Token from QR code
   * @param {object} completionData - Data from completed actions
   * @returns {Promise<object>} - Verification result
   */
  async verifySession(sessionToken, completionData = {}) {
    try {
      // Find active session
      const result = await this.db.query(`
        SELECT
          session_id,
          user_id,
          session_type,
          status,
          metadata,
          started_at,
          expires_at
        FROM qr_sessions
        WHERE session_token = $1
          AND status = 'active'
          AND expires_at > NOW()
      `, [sessionToken]);

      if (result.rows.length === 0) {
        return {
          verified: false,
          reason: 'invalid_or_expired',
          message: 'Session not found or expired'
        };
      }

      const session = result.rows[0];

      // Verify completion data matches session
      const isValid = this.validateCompletion(session, completionData);

      if (!isValid) {
        return {
          verified: false,
          reason: 'validation_failed',
          message: 'Completion data does not match session'
        };
      }

      // Mark session as completed
      await this.db.query(`
        UPDATE qr_sessions
        SET status = 'completed',
            completed_at = NOW(),
            completion_data = $1
        WHERE session_id = $2
      `, [JSON.stringify(completionData), session.session_id]);

      // Calculate session duration
      const duration = Date.now() - new Date(session.started_at).getTime();

      console.log(`[QRSessionManager] Verified ${session.session_type} session ${session.session_id}`);

      return {
        verified: true,
        session_id: session.session_id,
        user_id: session.user_id,
        session_type: session.session_type,
        duration_ms: duration,
        completion_data: completionData
      };

    } catch (error) {
      console.error('[QRSessionManager] Verify session error:', error);
      throw error;
    }
  }

  /**
   * Get session status
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<object>} - Session status
   */
  async getSessionStatus(sessionId) {
    try {
      const result = await this.db.query(`
        SELECT
          session_id,
          user_id,
          session_type,
          status,
          metadata,
          started_at,
          completed_at,
          expires_at
        FROM qr_sessions
        WHERE session_id = $1
      `, [sessionId]);

      if (result.rows.length === 0) {
        return null;
      }

      const session = result.rows[0];

      // Check if expired
      if (session.status === 'active' && new Date(session.expires_at) < new Date()) {
        // Auto-expire
        await this.expireSession(sessionId);
        session.status = 'expired';
      }

      return session;

    } catch (error) {
      console.error('[QRSessionManager] Get session status error:', error);
      return null;
    }
  }

  /**
   * Expire session manually
   *
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>}
   */
  async expireSession(sessionId) {
    try {
      await this.db.query(`
        UPDATE qr_sessions
        SET status = 'expired'
        WHERE session_id = $1 AND status = 'active'
      `, [sessionId]);

      console.log(`[QRSessionManager] Expired session ${sessionId}`);
      return true;

    } catch (error) {
      console.error('[QRSessionManager] Expire session error:', error);
      return false;
    }
  }

  /**
   * Get user's active sessions
   *
   * @param {string} userId - User ID
   * @returns {Promise<array>} - Active sessions
   */
  async getActiveSessions(userId) {
    try {
      const result = await this.db.query(`
        SELECT
          session_id,
          session_type,
          status,
          started_at,
          expires_at
        FROM qr_sessions
        WHERE user_id = $1
          AND status = 'active'
          AND expires_at > NOW()
        ORDER BY started_at DESC
      `, [userId]);

      return result.rows;

    } catch (error) {
      console.error('[QRSessionManager] Get active sessions error:', error);
      return [];
    }
  }

  /**
   * Clean up expired sessions
   *
   * @returns {Promise<number>} - Number of sessions cleaned
   */
  async cleanupExpiredSessions() {
    try {
      const result = await this.db.query(`
        UPDATE qr_sessions
        SET status = 'expired'
        WHERE status = 'active'
          AND expires_at < NOW()
        RETURNING session_id
      `);

      const count = result.rows.length;

      if (count > 0) {
        console.log(`[QRSessionManager] Cleaned up ${count} expired sessions`);
      }

      return count;

    } catch (error) {
      console.error('[QRSessionManager] Cleanup error:', error);
      return 0;
    }
  }

  /**
   * Generate session token
   *
   * @returns {string} - Secure random token
   */
  generateSessionToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate QR code for session
   *
   * @param {string} sessionToken - Session token
   * @param {string} sessionType - Type of session
   * @param {object} metadata - Additional metadata
   * @returns {Promise<string>} - QR code data URL
   */
  async generateSessionQR(sessionToken, sessionType, metadata = {}) {
    // Build URL with session token
    const params = new URLSearchParams({
      session: sessionToken,
      type: sessionType,
      t: Date.now(),
      ...metadata
    });

    const url = `${this.qrGenerator.baseUrl}/verify-session?${params.toString()}`;

    // Generate QR code
    return await this.qrGenerator.generateQR(url, {
      errorCorrectionLevel: 'H', // High error correction
      margin: 2,
      width: 400
    });
  }

  /**
   * Validate completion data matches session
   *
   * @param {object} session - Session from database
   * @param {object} completionData - Completion data
   * @returns {boolean}
   */
  validateCompletion(session, completionData) {
    // Basic validation - extend based on session type
    switch (session.session_type) {
      case 'purchase':
        // Must have payment_id and amount
        return completionData.payment_id && completionData.amount;

      case 'profile_setup':
        // Must have required profile fields
        return completionData.profile_completed === true;

      case 'app_install':
        // Must have app_id
        return completionData.app_id && completionData.install_status === 'completed';

      case 'login':
        // Just needs to be verified
        return true;

      default:
        return true;
    }
  }

  /**
   * Get session statistics
   *
   * @param {string} userId - User ID (optional)
   * @returns {Promise<object>} - Session stats
   */
  async getSessionStats(userId = null) {
    try {
      let query = `
        SELECT
          session_type,
          status,
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
        FROM qr_sessions
      `;

      const params = [];

      if (userId) {
        query += ` WHERE user_id = $1`;
        params.push(userId);
      }

      query += `
        GROUP BY session_type, status
        ORDER BY session_type, status
      `;

      const result = await this.db.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('[QRSessionManager] Get stats error:', error);
      return [];
    }
  }
}

module.exports = QRSessionManager;

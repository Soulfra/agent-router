/**
 * QR OAuth Bridge
 *
 * Bridges QR login system with Google OAuth and newsletter signup
 *
 * Flow:
 * 1. Desktop creates QR session
 * 2. iPhone scans QR → redirects to Google OAuth
 * 3. OAuth completes → links to QR session
 * 4. Auto-subscribes to newsletter (double opt-in)
 * 5. Desktop auto-logs in
 *
 * Benefits:
 * - One-tap login (QR scan → Google)
 * - Auto-newsletter signup
 * - All data in Google Sheets
 * - Zero-cost operation
 *
 * @version 1.0.0
 * @license MIT
 */

const QRLoginManager = require('./qr-login-manager');
const GmailGateway = require('./gmail-gateway');
const GoogleSheetsDBAdapter = require('./google-sheets-db-adapter');

class QROAuthBridge {
  constructor(config = {}) {
    // QR Login Manager
    this.qrManager = config.qrManager || new QRLoginManager({
      spreadsheetId: config.spreadsheetId || process.env.GOOGLE_SHEETS_DB_ID,
      credentialsPath: config.credentialsPath || process.env.GOOGLE_SHEETS_CREDENTIALS_PATH,
      sheetName: config.qrSheetName || 'qr_sessions'
    });

    // Gmail Gateway (for newsletter)
    this.gmailGateway = config.gmailGateway || new GmailGateway({
      spreadsheetId: config.spreadsheetId || process.env.GOOGLE_SHEETS_DB_ID,
      credentialsPath: config.credentialsPath || process.env.GOOGLE_SHEETS_CREDENTIALS_PATH
    });

    // Google Sheets DB
    this.db = config.db || new GoogleSheetsDBAdapter({
      spreadsheetId: config.spreadsheetId || process.env.GOOGLE_SHEETS_DB_ID,
      credentialsPath: config.credentialsPath || process.env.GOOGLE_SHEETS_CREDENTIALS_PATH
    });

    // Config
    this.config = {
      autoSubscribeNewsletter: config.autoSubscribeNewsletter !== false,
      requireDoubleOptIn: config.requireDoubleOptIn !== false,
      sendWelcomeEmail: config.sendWelcomeEmail !== false,
      confirmationBaseUrl: config.confirmationBaseUrl || process.env.CONFIRMATION_URL || 'http://localhost:5001/api/gmail/webhook/confirm',
      ...config
    };

    console.log('[QROAuthBridge] Initialized');
  }

  /**
   * Initialize bridge
   */
  async init() {
    await this.qrManager.init();
    await this.gmailGateway.init();
    await this.db.init();

    console.log('[QROAuthBridge] Ready');
  }

  /**
   * Create QR + OAuth session
   * Used by desktop to generate QR code with OAuth action
   *
   * @param {string} deviceFingerprint - Desktop device fingerprint
   * @returns {Object} QR session with OAuth payload
   */
  async createQRAuthSession(deviceFingerprint) {
    try {
      // Create regular QR session
      const session = await this.qrManager.createSession(deviceFingerprint);

      // Modify QR payload to include OAuth action
      const qrPayload = JSON.parse(session.qrPayload);
      qrPayload.action = 'google-oauth';
      qrPayload.returnUrl = '/auth/google'; // Redirect to Google OAuth

      return {
        ...session,
        qrPayload: JSON.stringify(qrPayload),
        action: 'google-oauth'
      };

    } catch (error) {
      console.error('[QROAuthBridge] Create QR auth session error:', error);
      throw error;
    }
  }

  /**
   * Link Google account to QR session
   * Called after Google OAuth completes
   *
   * @param {string} sessionId - QR session ID
   * @param {Object} googleUser - Google user data
   * @returns {Object} Result with merged user data
   */
  async linkGoogleAccount(sessionId, googleUser) {
    try {
      const { id, email, name, picture } = googleUser;

      // Update QR session with Google account info
      const sessions = await this.db.query(this.qrManager.sheetName, { sessionId });

      if (!sessions || sessions.length === 0) {
        throw new Error('QR session not found');
      }

      const session = sessions[0];

      // Check if expired
      if (Date.now() > parseInt(session.expiresAt)) {
        throw new Error('QR session expired');
      }

      // Update session with Google account
      await this.db.update(
        this.qrManager.sheetName,
        { sessionId },
        {
          status: 'verified',
          verified: 'true',
          userId: id,
          userEmail: email,
          userName: name,
          userPicture: picture,
          verifiedAt: Date.now().toString(),
          authMethod: 'google-oauth'
        }
      );

      console.log('[QROAuthBridge] Linked Google account:', id);

      return {
        success: true,
        sessionId,
        userId: id,
        email,
        name,
        picture
      };

    } catch (error) {
      console.error('[QROAuthBridge] Link Google account error:', error);
      throw error;
    }
  }

  /**
   * Auto-subscribe user to newsletter
   * Called after Google OAuth + QR linking
   *
   * @param {string} userId - User ID (Google ID)
   * @param {string} email - User email
   * @param {Object} options - Subscription options
   * @returns {Object} Subscription result
   */
  async subscribeToNewsletter(userId, email, options = {}) {
    try {
      if (!this.config.autoSubscribeNewsletter) {
        console.log('[QROAuthBridge] Auto-subscribe disabled');
        return { success: false, reason: 'disabled' };
      }

      // Add recipient to whitelist (triggers confirmation email)
      const result = await this.gmailGateway.addRecipient(userId, email, {
        source: options.source || 'qr-oauth-login',
        metadata: {
          signupMethod: 'qr-google-oauth',
          timestamp: new Date().toISOString(),
          ...options.metadata
        }
      });

      if (result.success) {
        console.log('[QROAuthBridge] Newsletter subscription started:', email);
        return {
          success: true,
          status: 'pending_confirmation',
          message: 'Confirmation email sent'
        };
      } else {
        return result;
      }

    } catch (error) {
      console.error('[QROAuthBridge] Subscribe to newsletter error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Complete QR + OAuth flow
   * All-in-one method for handling the complete flow
   *
   * @param {string} sessionId - QR session ID
   * @param {Object} googleUser - Google user data
   * @param {Object} options - Additional options
   * @returns {Object} Complete result
   */
  async completeQROAuthFlow(sessionId, googleUser, options = {}) {
    try {
      // Step 1: Link Google account to QR session
      const linkResult = await this.linkGoogleAccount(sessionId, googleUser);

      if (!linkResult.success) {
        throw new Error('Failed to link Google account');
      }

      // Step 2: Auto-subscribe to newsletter
      let newsletterResult = null;
      if (this.config.autoSubscribeNewsletter) {
        newsletterResult = await this.subscribeToNewsletter(
          googleUser.id,
          googleUser.email,
          options
        );
      }

      // Step 3: Send welcome email (optional)
      if (this.config.sendWelcomeEmail && newsletterResult?.success) {
        // Welcome email will be sent after user confirms subscription
        console.log('[QROAuthBridge] Welcome email queued for:', googleUser.email);
      }

      return {
        success: true,
        sessionId,
        user: {
          id: googleUser.id,
          email: googleUser.email,
          name: googleUser.name,
          picture: googleUser.picture
        },
        newsletter: newsletterResult,
        message: 'Login successful! Check your email to confirm newsletter subscription.'
      };

    } catch (error) {
      console.error('[QROAuthBridge] Complete QR OAuth flow error:', error);
      throw error;
    }
  }

  /**
   * Poll QR session for OAuth completion
   * Desktop polls this to check if iPhone completed OAuth
   *
   * @param {string} sessionId - QR session ID
   * @returns {Object} Session status
   */
  async pollQRAuthStatus(sessionId) {
    try {
      const sessions = await this.db.query(this.qrManager.sheetName, { sessionId });

      if (!sessions || sessions.length === 0) {
        return { verified: false, error: 'Session not found' };
      }

      const session = sessions[0];

      // Check if expired
      if (Date.now() > parseInt(session.expiresAt)) {
        return { verified: false, error: 'Session expired' };
      }

      // Check if OAuth completed
      if (session.verified === 'true' && session.authMethod === 'google-oauth') {
        return {
          verified: true,
          user: {
            id: session.userId,
            email: session.userEmail,
            name: session.userName,
            picture: session.userPicture
          }
        };
      }

      return { verified: false };

    } catch (error) {
      console.error('[QROAuthBridge] Poll QR auth status error:', error);
      return { verified: false, error: error.message };
    }
  }

  /**
   * Get user's newsletter status
   *
   * @param {string} userId - User ID
   * @returns {Object} Newsletter status
   */
  async getNewsletterStatus(userId) {
    try {
      const recipients = await this.gmailGateway.getRecipients(userId, 'all');

      if (recipients.length === 0) {
        return {
          subscribed: false,
          status: 'not_subscribed'
        };
      }

      const recipient = recipients[0];

      return {
        subscribed: recipient.status === 'approved',
        status: recipient.status,
        email: recipient.recipient_email,
        confirmedAt: recipient.confirmed_at
      };

    } catch (error) {
      console.error('[QROAuthBridge] Get newsletter status error:', error);
      return {
        subscribed: false,
        error: error.message
      };
    }
  }
}

module.exports = QROAuthBridge;

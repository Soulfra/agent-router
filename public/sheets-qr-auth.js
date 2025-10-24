/**
 * Google Sheets QR Authentication (Browser Version)
 *
 * Serverless auth using Google Sheets as anonymous storage
 * - No backend server needed
 * - Works cross-device (desktop ↔ iPhone)
 * - No CORS issues
 * - Works on static GitHub Pages
 * - Free (10M cells, 100 requests/min)
 *
 * How it works:
 * 1. Desktop creates row in Google Sheets with session data
 * 2. QR code contains spreadsheet ID + session ID
 * 3. iPhone reads row, updates status to "verified"
 * 4. Desktop polls Google Sheets for status change
 * 5. Both devices paired!
 *
 * @version 1.0.0
 * @license MIT
 */

class SheetsQRAuth {
  constructor(config = {}) {
    // Load config from localStorage if not provided
    const savedConfig = this.loadConfig();

    // Public Google Sheet (anyone with link can view/edit)
    // Create your own at: sheets.google.com
    // Share → Anyone with link → Editor
    this.spreadsheetId = config.spreadsheetId || savedConfig.spreadsheetId || null;
    this.sheetName = config.sheetName || savedConfig.sheetName || 'qr_sessions';
    this.apiKey = config.apiKey || savedConfig.apiKey || null;

    this.SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    // Backend API detection
    this.backendUrl = config.backendUrl || this.detectBackendUrl();
    this.useBackend = false; // Will be set after detection

    console.log('[SheetsQRAuth] Initialized', {
      hasSpreadsheetId: !!this.spreadsheetId,
      hasApiKey: !!this.apiKey,
      backendUrl: this.backendUrl
    });
  }

  /**
   * Load config from localStorage
   * @private
   */
  loadConfig() {
    try {
      const saved = localStorage.getItem('calos_sheets_config');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.warn('[SheetsQRAuth] Failed to load config from localStorage:', error);
    }
    return {};
  }

  /**
   * Save config to localStorage
   */
  saveConfig(config) {
    try {
      const merged = {
        ...this.loadConfig(),
        ...config
      };
      localStorage.setItem('calos_sheets_config', JSON.stringify(merged));

      // Update instance values
      if (config.spreadsheetId) this.spreadsheetId = config.spreadsheetId;
      if (config.sheetName) this.sheetName = config.sheetName;
      if (config.apiKey) this.apiKey = config.apiKey;

      console.log('[SheetsQRAuth] Config saved');
      return true;
    } catch (error) {
      console.error('[SheetsQRAuth] Failed to save config:', error);
      return false;
    }
  }

  /**
   * Check if configured
   */
  isConfigured() {
    return !!(this.spreadsheetId && this.apiKey);
  }

  /**
   * Clear saved config
   */
  clearConfig() {
    localStorage.removeItem('calos_sheets_config');
    this.spreadsheetId = null;
    this.apiKey = null;
    console.log('[SheetsQRAuth] Config cleared');
  }

  /**
   * Detect backend API URL
   * @private
   */
  detectBackendUrl() {
    // Try localhost first (development)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:5001/api/v1/qr-login';
    }

    // Check if on GitHub Pages
    if (window.location.hostname.includes('github.io')) {
      // GitHub Pages - no backend, use direct Sheets API
      return null;
    }

    // Otherwise assume backend is on same origin
    return `${window.location.origin}/api/v1/qr-login`;
  }

  /**
   * Check if backend API is available
   * @private
   */
  async checkBackendAvailable() {
    if (!this.backendUrl) return false;

    try {
      const response = await fetch(`${this.backendUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[SheetsQRAuth] Backend available:', data.version || 'unknown');
        return true;
      }

      return false;

    } catch (error) {
      console.log('[SheetsQRAuth] Backend not available, using direct Sheets API');
      return false;
    }
  }

  /**
   * Create session for QR login
   * Returns: { sessionId, qrPayload, expiresAt }
   */
  async createSession(deviceFingerprint) {
    try {
      // Check if backend is available
      this.useBackend = await this.checkBackendAvailable();

      if (this.useBackend) {
        // Use backend API
        const response = await fetch(`${this.backendUrl}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceFingerprint })
        });

        if (!response.ok) {
          throw new Error(`Backend error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[SheetsQRAuth] Session created via backend');
        return data;
      }

      // Fallback to direct Google Sheets API
      console.log('[SheetsQRAuth] Using direct Sheets API');

      // Generate unique session ID
      const sessionId = this.generateSessionId();

      // Create session data
      const sessionData = {
        sessionId: sessionId,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + this.SESSION_TIMEOUT,
        desktopFingerprint: deviceFingerprint,
        phoneFingerprint: null,
        verified: false,
        userId: null
      };

      // Insert row into Google Sheets
      await this.insertRow(sessionData);

      // QR payload contains spreadsheet ID + session ID
      const qrPayload = {
        type: 'calos-qr-login',
        version: '3.0.0',
        spreadsheetId: this.spreadsheetId,
        sheetName: this.sheetName,
        sessionId: sessionId,
        expiresAt: sessionData.expiresAt
      };

      return {
        sessionId: sessionId,
        qrPayload: JSON.stringify(qrPayload),
        expiresAt: sessionData.expiresAt,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit#gid=0`
      };

    } catch (error) {
      console.error('[SheetsQRAuth] Create session error:', error);
      throw error;
    }
  }

  /**
   * Verify QR scan from iPhone
   * Updates session row to "verified"
   */
  async verifySession(sessionId, phoneFingerprint, userId) {
    try {
      // Check if backend is available
      this.useBackend = await this.checkBackendAvailable();

      if (this.useBackend) {
        // Use backend API
        const response = await fetch(`${this.backendUrl}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, phoneFingerprint, userId })
        });

        if (!response.ok) {
          throw new Error(`Backend error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[SheetsQRAuth] Session verified via backend');
        return data;
      }

      // Fallback to direct Google Sheets API
      console.log('[SheetsQRAuth] Using direct Sheets API');

      // Update session row
      const updates = {
        status: 'verified',
        verified: true,
        phoneFingerprint: phoneFingerprint,
        userId: userId,
        verifiedAt: Date.now()
      };

      await this.updateRow(sessionId, updates);

      return {
        success: true,
        sessionId: sessionId,
        userId: userId
      };

    } catch (error) {
      console.error('[SheetsQRAuth] Verify session error:', error);
      throw error;
    }
  }

  /**
   * Poll for verification (desktop checks if phone scanned)
   */
  async pollForVerification(sessionId) {
    try {
      // Check if backend is available (only once, then cache)
      if (this.useBackend === undefined) {
        this.useBackend = await this.checkBackendAvailable();
      }

      if (this.useBackend) {
        // Use backend API
        const response = await fetch(`${this.backendUrl}/poll/${sessionId}`);

        if (!response.ok) {
          throw new Error(`Backend error: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
      }

      // Fallback to direct Google Sheets API
      // Read session row from Google Sheets
      const session = await this.readRow(sessionId);

      if (!session) {
        return { verified: false, error: 'Session not found' };
      }

      // Check if expired
      if (Date.now() > session.expiresAt) {
        return { verified: false, error: 'Session expired' };
      }

      // Check if verified
      if (session.verified && session.status === 'verified') {
        return {
          verified: true,
          session: session
        };
      }

      return { verified: false };

    } catch (error) {
      console.error('[SheetsQRAuth] Poll verification error:', error);
      return { verified: false, error: error.message };
    }
  }

  /**
   * Insert row into Google Sheets using REST API
   * @private
   */
  async insertRow(data) {
    try {
      // Convert data to row array
      const row = [
        data.sessionId,
        data.status,
        data.createdAt,
        data.expiresAt,
        data.desktopFingerprint || '',
        data.phoneFingerprint || '',
        data.verified ? 'true' : 'false',
        data.userId || '',
        data.verifiedAt || ''
      ];

      // Append row using Google Sheets API v4
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${this.sheetName}!A:I:append?valueInputOption=RAW&key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [row]
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to insert row: ${error.error?.message || response.statusText}`);
      }

      console.log('[SheetsQRAuth] Inserted session:', data.sessionId);
      return await response.json();

    } catch (error) {
      console.error('[SheetsQRAuth] Insert row error:', error);
      throw error;
    }
  }

  /**
   * Read row from Google Sheets
   * @private
   */
  async readRow(sessionId) {
    try {
      // Get all rows
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${this.sheetName}!A:I?key=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to read rows: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const rows = data.values || [];

      if (rows.length === 0) {
        return null;
      }

      // Find row with matching sessionId (column A)
      const rowIndex = rows.findIndex((row, idx) => idx > 0 && row[0] === sessionId);

      if (rowIndex === -1) {
        return null;
      }

      const row = rows[rowIndex];

      // Parse row data
      return {
        sessionId: row[0],
        status: row[1],
        createdAt: parseInt(row[2]),
        expiresAt: parseInt(row[3]),
        desktopFingerprint: row[4],
        phoneFingerprint: row[5],
        verified: row[6] === 'true',
        userId: row[7],
        verifiedAt: row[8] ? parseInt(row[8]) : null,
        _rowIndex: rowIndex
      };

    } catch (error) {
      console.error('[SheetsQRAuth] Read row error:', error);
      throw error;
    }
  }

  /**
   * Update row in Google Sheets
   * @private
   */
  async updateRow(sessionId, updates) {
    try {
      // First, read the row to get its index
      const session = await this.readRow(sessionId);

      if (!session) {
        throw new Error('Session not found');
      }

      // Build updated row
      const updatedRow = [
        session.sessionId,
        updates.status || session.status,
        session.createdAt,
        session.expiresAt,
        session.desktopFingerprint,
        updates.phoneFingerprint || session.phoneFingerprint,
        (updates.verified !== undefined ? updates.verified : session.verified) ? 'true' : 'false',
        updates.userId || session.userId,
        updates.verifiedAt || session.verifiedAt || ''
      ];

      // Update row using Google Sheets API v4
      const rowNum = session._rowIndex + 1; // Convert to 1-indexed
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${this.sheetName}!A${rowNum}:I${rowNum}?valueInputOption=RAW&key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [updatedRow]
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to update row: ${error.error?.message || response.statusText}`);
      }

      console.log('[SheetsQRAuth] Updated session:', sessionId);
      return await response.json();

    } catch (error) {
      console.error('[SheetsQRAuth] Update row error:', error);
      throw error;
    }
  }

  /**
   * Generate unique session ID
   * @private
   */
  generateSessionId() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // ==================== TRIAL MANAGEMENT ====================

  /**
   * Get trial data for a user
   * @param {string} userId - User ID
   * @returns {Object|null} Trial data or null if not found
   */
  async getTrialData(userId) {
    try {
      const sheetName = 'trials';
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A:H?key=${this.apiKey}`;

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      const rows = data.values || [];

      // Find row with matching userId
      const rowIndex = rows.findIndex((row, idx) => idx > 0 && row[0] === userId);
      if (rowIndex === -1) return null;

      const row = rows[rowIndex];
      return {
        userId: row[0],
        email: row[1],
        name: row[2],
        trialDays: parseInt(row[3]) || 30,
        bonusDays: parseInt(row[4]) || 0,
        startedAt: parseInt(row[5]),
        status: row[6] || 'active',
        updatedAt: parseInt(row[7]) || Date.now(),
        _rowIndex: rowIndex
      };
    } catch (error) {
      console.error('[SheetsQRAuth] Get trial data error:', error);
      return null;
    }
  }

  /**
   * Create trial for a user
   * @param {string} userId - User ID
   * @param {Object} options - Trial options
   * @returns {Object} Created trial data
   */
  async createTrial(userId, options = {}) {
    try {
      const sheetName = 'trials';
      const trialData = {
        userId,
        email: options.email || '',
        name: options.name || '',
        trialDays: options.trialDays || 30,
        bonusDays: options.bonusDays || 0,
        startedAt: options.startedAt || Date.now(),
        status: options.status || 'active',
        updatedAt: Date.now()
      };

      const row = [
        trialData.userId,
        trialData.email,
        trialData.name,
        trialData.trialDays,
        trialData.bonusDays,
        trialData.startedAt,
        trialData.status,
        trialData.updatedAt
      ];

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A:H:append?valueInputOption=RAW&key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [row] })
      });

      if (!response.ok) {
        throw new Error('Failed to create trial');
      }

      console.log('[SheetsQRAuth] Trial created:', userId);
      return trialData;
    } catch (error) {
      console.error('[SheetsQRAuth] Create trial error:', error);
      throw error;
    }
  }

  /**
   * Update trial data
   * @param {string} userId - User ID
   * @param {Object} updates - Fields to update
   */
  async updateTrial(userId, updates) {
    try {
      const trial = await this.getTrialData(userId);
      if (!trial) {
        throw new Error('Trial not found');
      }

      const sheetName = 'trials';
      const updatedRow = [
        trial.userId,
        updates.email || trial.email,
        updates.name || trial.name,
        updates.trialDays !== undefined ? updates.trialDays : trial.trialDays,
        updates.bonusDays !== undefined ? updates.bonusDays : trial.bonusDays,
        trial.startedAt,
        updates.status || trial.status,
        Date.now()
      ];

      const rowNum = trial._rowIndex + 1;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A${rowNum}:H${rowNum}?valueInputOption=RAW&key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [updatedRow] })
      });

      if (!response.ok) {
        throw new Error('Failed to update trial');
      }

      console.log('[SheetsQRAuth] Trial updated:', userId);
    } catch (error) {
      console.error('[SheetsQRAuth] Update trial error:', error);
      throw error;
    }
  }

  // ==================== REFERRAL MANAGEMENT ====================

  /**
   * Get referral data for a user
   * @param {string} userId - User ID
   * @returns {Object|null} Referral data or null if not found
   */
  async getReferralData(userId) {
    try {
      const sheetName = 'referrals';
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A:G?key=${this.apiKey}`;

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      const rows = data.values || [];

      // Find row with matching userId
      const rowIndex = rows.findIndex((row, idx) => idx > 0 && row[0] === userId);
      if (rowIndex === -1) return null;

      const row = rows[rowIndex];
      return {
        userId: row[0],
        code: row[1],
        referralCount: parseInt(row[2]) || 0,
        bonusDaysEarned: parseInt(row[3]) || 0,
        createdAt: parseInt(row[4]),
        updatedAt: parseInt(row[5]),
        referredBy: row[6] || null,
        _rowIndex: rowIndex
      };
    } catch (error) {
      console.error('[SheetsQRAuth] Get referral data error:', error);
      return null;
    }
  }

  /**
   * Create referral code for a user
   * @param {string} userId - User ID
   * @param {string} code - Referral code
   * @param {Object} options - Additional options
   * @returns {Object} Created referral data
   */
  async createReferralCode(userId, code, options = {}) {
    try {
      const sheetName = 'referrals';
      const referralData = {
        userId,
        code,
        referralCount: options.referralCount || 0,
        bonusDaysEarned: options.bonusDaysEarned || 0,
        createdAt: options.createdAt || Date.now(),
        updatedAt: Date.now(),
        referredBy: options.referredBy || null
      };

      const row = [
        referralData.userId,
        referralData.code,
        referralData.referralCount,
        referralData.bonusDaysEarned,
        referralData.createdAt,
        referralData.updatedAt,
        referralData.referredBy || ''
      ];

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A:G:append?valueInputOption=RAW&key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [row] })
      });

      if (!response.ok) {
        throw new Error('Failed to create referral code');
      }

      console.log('[SheetsQRAuth] Referral code created:', code);
      return referralData;
    } catch (error) {
      console.error('[SheetsQRAuth] Create referral code error:', error);
      throw error;
    }
  }

  /**
   * Increment referral count
   * @param {string} userId - User ID
   * @param {number} bonusDays - Bonus days to add (default: 7)
   */
  async incrementReferralCount(userId, bonusDays = 7) {
    try {
      const referral = await this.getReferralData(userId);
      if (!referral) {
        throw new Error('Referral not found');
      }

      const sheetName = 'referrals';
      const newCount = referral.referralCount + 1;
      const newBonusDays = referral.bonusDaysEarned + bonusDays;

      const updatedRow = [
        referral.userId,
        referral.code,
        newCount,
        newBonusDays,
        referral.createdAt,
        Date.now(),
        referral.referredBy || ''
      ];

      const rowNum = referral._rowIndex + 1;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A${rowNum}:G${rowNum}?valueInputOption=RAW&key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [updatedRow] })
      });

      if (!response.ok) {
        throw new Error('Failed to increment referral count');
      }

      console.log('[SheetsQRAuth] Referral count incremented:', userId, newCount);

      // Also update trial bonus days
      await this.updateTrial(userId, { bonusDays: newBonusDays });
    } catch (error) {
      console.error('[SheetsQRAuth] Increment referral count error:', error);
      throw error;
    }
  }

  /**
   * Find user by referral code
   * @param {string} code - Referral code
   * @returns {Object|null} Referral data or null if not found
   */
  async findUserByReferralCode(code) {
    try {
      const sheetName = 'referrals';
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A:G?key=${this.apiKey}`;

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      const rows = data.values || [];

      // Find row with matching code
      const rowIndex = rows.findIndex((row, idx) => idx > 0 && row[1] === code);
      if (rowIndex === -1) return null;

      const row = rows[rowIndex];
      return {
        userId: row[0],
        code: row[1],
        referralCount: parseInt(row[2]) || 0,
        bonusDaysEarned: parseInt(row[3]) || 0,
        createdAt: parseInt(row[4]),
        updatedAt: parseInt(row[5]),
        referredBy: row[6] || null
      };
    } catch (error) {
      console.error('[SheetsQRAuth] Find user by referral code error:', error);
      return null;
    }
  }

  // ==================== NEWSLETTER MANAGEMENT ====================

  /**
   * Add newsletter recipient
   * @param {Object} options - Recipient options
   */
  async addNewsletterRecipient(options) {
    try {
      const sheetName = 'newsletter_recipients';
      const row = [
        options.userId,
        options.email,
        options.name || '',
        options.source || 'qr-login',
        options.status || 'pending_confirmation',
        options.createdAt || Date.now(),
        options.confirmedAt || '',
        options.unsubscribedAt || ''
      ];

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A:H:append?valueInputOption=RAW&key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [row] })
      });

      if (!response.ok) {
        throw new Error('Failed to add newsletter recipient');
      }

      console.log('[SheetsQRAuth] Newsletter recipient added:', options.email);
    } catch (error) {
      console.error('[SheetsQRAuth] Add newsletter recipient error:', error);
      throw error;
    }
  }
}

// Export for use in HTML pages
window.SheetsQRAuth = SheetsQRAuth;

/**
 * Two-Factor Authentication (2FA)
 *
 * Implements TOTP (Time-based One-Time Password) for user account security
 *
 * Supports:
 * - Authenticator apps (Google Authenticator, Authy, 1Password, etc.)
 * - QR code generation for easy setup
 * - Backup codes for account recovery
 * - Rate limiting on verification attempts
 *
 * Flow:
 * 1. User enables 2FA
 * 2. System generates secret key
 * 3. User scans QR code with authenticator app
 * 4. User enters 6-digit code to verify setup
 * 5. System generates backup codes
 * 6. On login, user must provide 6-digit code
 *
 * Security Features:
 * - Secrets encrypted at rest
 * - Rate limiting (5 attempts per 15 minutes)
 * - Time window tolerance (±1 period)
 * - Backup codes for recovery
 *
 * Storage: Google Sheets
 *
 * Usage:
 *   const tfa = new TwoFactorAuth({ db });
 *
 *   // Setup 2FA
 *   const setup = await tfa.setupTwoFactor('user123', 'user@example.com');
 *   // Display setup.qrCodeDataUrl to user
 *
 *   // Verify setup
 *   const verified = await tfa.verifySetup('user123', '123456');
 *
 *   // Verify login code
 *   const valid = await tfa.verifyCode('user123', '123456');
 */

const { TOTP, Secret } = require('otpauth');
const crypto = require('crypto');
const qrcode = require('qrcode');
const GoogleSheetsDBAdapter = require('./google-sheets-db-adapter');
const SimpleEncryption = require('./simple-encryption');

class TwoFactorAuth {
  constructor(config = {}) {
    // Database adapter
    this.db = config.db || new GoogleSheetsDBAdapter();

    // Encryption for secrets
    this.encryption = config.encryption || new SimpleEncryption(
      config.encryptionKey || process.env.ENCRYPTION_KEY
    );

    // TOTP settings
    this.issuer = config.issuer || 'CALOS';
    this.digits = config.digits || 6;
    this.period = config.period || 30; // seconds
    this.window = config.window || 1; // Allow ±1 time period

    // Rate limiting
    this.maxAttempts = config.maxAttempts || 5;
    this.attemptWindow = config.attemptWindow || 15 * 60 * 1000; // 15 minutes

    // Backup codes
    this.backupCodeCount = config.backupCodeCount || 10;

    console.log('[TwoFactorAuth] Initialized');
  }

  /**
   * Initialize (ensure 2fa table exists)
   */
  async init() {
    await this.db.init();

    // Ensure 2fa sheet exists
    if (!this.db.sheetNames.twoFactor) {
      this.db.sheetNames.twoFactor = 'two_factor_auth';
    }

    console.log('[TwoFactorAuth] Ready');
  }

  /**
   * Setup 2FA for user
   *
   * @param {string} userId - User ID
   * @param {string} userEmail - User email
   * @returns {Object} Setup data (secret, QR code, backup codes)
   */
  async setupTwoFactor(userId, userEmail) {
    try {
      await this.init();

      // Check if already enabled
      const existing = await this.db.findOne(this.db.sheetNames.twoFactor, {
        user_id: userId,
        enabled: 'true'
      });

      if (existing) {
        return {
          success: false,
          error: '2FA already enabled',
          hint: 'Disable first before re-enabling'
        };
      }

      // Generate secret
      const secret = new Secret({ size: 20 });

      // Create TOTP instance
      const totp = new TOTP({
        issuer: this.issuer,
        label: userEmail,
        algorithm: 'SHA1',
        digits: this.digits,
        period: this.period,
        secret: secret
      });

      // Generate QR code
      const otpauthUrl = totp.toString();
      const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();

      // Encrypt secret and backup codes
      const encryptedSecret = this.encryption.encrypt(secret.base32);
      const encryptedBackupCodes = backupCodes.map(code => this.encryption.encrypt(code));

      // Store in database (not yet enabled)
      await this.db.insert(this.db.sheetNames.twoFactor, {
        user_id: userId,
        user_email: userEmail,
        secret: encryptedSecret,
        backup_codes: JSON.stringify(encryptedBackupCodes),
        used_backup_codes: JSON.stringify([]),
        enabled: 'false',
        verified: 'false',
        created_at: new Date().toISOString(),
        last_verified_at: null,
        failed_attempts: 0,
        last_attempt_at: null
      });

      console.log(`[TwoFactorAuth] Setup initiated for ${userId}`);

      return {
        success: true,
        secret: secret.base32,
        qrCodeDataUrl,
        backupCodes,
        otpauthUrl
      };

    } catch (error) {
      console.error('[TwoFactorAuth] Error setting up 2FA:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify 2FA setup (must be called to enable)
   *
   * @param {string} userId - User ID
   * @param {string} token - 6-digit code from authenticator app
   * @returns {Object} Verification result
   */
  async verifySetup(userId, token) {
    try {
      await this.init();

      // Find unverified 2FA record
      const record = await this.db.findOne(this.db.sheetNames.twoFactor, {
        user_id: userId,
        verified: 'false'
      });

      if (!record) {
        return {
          success: false,
          error: '2FA setup not found or already verified'
        };
      }

      // Decrypt secret
      const secret = this.encryption.decrypt(record.secret);

      // Verify token
      const isValid = this.verifyToken(secret, token);

      if (!isValid) {
        return {
          success: false,
          error: 'Invalid code'
        };
      }

      // Mark as verified and enabled
      await this.db.update(
        this.db.sheetNames.twoFactor,
        { user_id: userId },
        {
          verified: 'true',
          enabled: 'true',
          last_verified_at: new Date().toISOString()
        }
      );

      console.log(`[TwoFactorAuth] Setup verified for ${userId}`);

      return {
        success: true,
        message: '2FA enabled successfully'
      };

    } catch (error) {
      console.error('[TwoFactorAuth] Error verifying setup:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify 2FA code (for login)
   *
   * @param {string} userId - User ID
   * @param {string} token - 6-digit code
   * @returns {boolean} Valid
   */
  async verifyCode(userId, token) {
    try {
      await this.init();

      // Find enabled 2FA record
      const record = await this.db.findOne(this.db.sheetNames.twoFactor, {
        user_id: userId,
        enabled: 'true'
      });

      if (!record) {
        return false;
      }

      // Check rate limiting
      const rateLimitExceeded = await this.checkRateLimit(record);
      if (rateLimitExceeded) {
        console.warn(`[TwoFactorAuth] Rate limit exceeded for ${userId}`);
        return false;
      }

      // Check if it's a backup code
      const isBackupCode = await this.verifyBackupCode(record, token);
      if (isBackupCode) {
        await this.markBackupCodeUsed(record, token);
        await this.updateLastVerified(userId);
        return true;
      }

      // Decrypt secret
      const secret = this.encryption.decrypt(record.secret);

      // Verify token
      const isValid = this.verifyToken(secret, token);

      if (!isValid) {
        await this.recordFailedAttempt(userId);
        return false;
      }

      // Reset failed attempts and update last verified
      await this.db.update(
        this.db.sheetNames.twoFactor,
        { user_id: userId },
        {
          failed_attempts: 0,
          last_verified_at: new Date().toISOString()
        }
      );

      return true;

    } catch (error) {
      console.error('[TwoFactorAuth] Error verifying code:', error);
      return false;
    }
  }

  /**
   * Verify TOTP token
   * @private
   */
  verifyToken(secretBase32, token) {
    try {
      const totp = new TOTP({
        secret: Secret.fromBase32(secretBase32),
        algorithm: 'SHA1',
        digits: this.digits,
        period: this.period
      });

      // Validate with time window
      const delta = totp.validate({
        token,
        window: this.window
      });

      return delta !== null;

    } catch (error) {
      console.error('[TwoFactorAuth] Error verifying token:', error);
      return false;
    }
  }

  /**
   * Verify backup code
   * @private
   */
  async verifyBackupCode(record, code) {
    try {
      const encryptedBackupCodes = JSON.parse(record.backup_codes || '[]');
      const usedBackupCodes = JSON.parse(record.used_backup_codes || '[]');

      for (const encryptedCode of encryptedBackupCodes) {
        const backupCode = this.encryption.decrypt(encryptedCode);

        if (backupCode === code && !usedBackupCodes.includes(encryptedCode)) {
          return true;
        }
      }

      return false;

    } catch (error) {
      console.error('[TwoFactorAuth] Error verifying backup code:', error);
      return false;
    }
  }

  /**
   * Mark backup code as used
   * @private
   */
  async markBackupCodeUsed(record, code) {
    try {
      const encryptedBackupCodes = JSON.parse(record.backup_codes || '[]');
      const usedBackupCodes = JSON.parse(record.used_backup_codes || '[]');

      // Find matching encrypted code
      for (const encryptedCode of encryptedBackupCodes) {
        const backupCode = this.encryption.decrypt(encryptedCode);

        if (backupCode === code) {
          usedBackupCodes.push(encryptedCode);

          await this.db.update(
            this.db.sheetNames.twoFactor,
            { user_id: record.user_id },
            {
              used_backup_codes: JSON.stringify(usedBackupCodes)
            }
          );

          console.log(`[TwoFactorAuth] Backup code used for ${record.user_id}`);
          break;
        }
      }

    } catch (error) {
      console.error('[TwoFactorAuth] Error marking backup code used:', error);
    }
  }

  /**
   * Check rate limiting
   * @private
   */
  async checkRateLimit(record) {
    const now = Date.now();
    const failedAttempts = parseInt(record.failed_attempts || 0);
    const lastAttempt = record.last_attempt_at ? new Date(record.last_attempt_at).getTime() : 0;

    if (failedAttempts >= this.maxAttempts) {
      const timeSinceLastAttempt = now - lastAttempt;

      if (timeSinceLastAttempt < this.attemptWindow) {
        return true; // Rate limit exceeded
      } else {
        // Reset counter after window expires
        await this.db.update(
          this.db.sheetNames.twoFactor,
          { user_id: record.user_id },
          {
            failed_attempts: 0
          }
        );
      }
    }

    return false;
  }

  /**
   * Record failed attempt
   * @private
   */
  async recordFailedAttempt(userId) {
    try {
      const record = await this.db.findOne(this.db.sheetNames.twoFactor, {
        user_id: userId
      });

      if (record) {
        const failedAttempts = parseInt(record.failed_attempts || 0) + 1;

        await this.db.update(
          this.db.sheetNames.twoFactor,
          { user_id: userId },
          {
            failed_attempts: failedAttempts,
            last_attempt_at: new Date().toISOString()
          }
        );
      }

    } catch (error) {
      console.error('[TwoFactorAuth] Error recording failed attempt:', error);
    }
  }

  /**
   * Update last verified timestamp
   * @private
   */
  async updateLastVerified(userId) {
    try {
      await this.db.update(
        this.db.sheetNames.twoFactor,
        { user_id: userId },
        {
          last_verified_at: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('[TwoFactorAuth] Error updating last verified:', error);
    }
  }

  /**
   * Disable 2FA for user
   *
   * @param {string} userId - User ID
   * @param {string} token - Current valid 2FA code (required)
   * @returns {boolean} Success
   */
  async disableTwoFactor(userId, token) {
    try {
      await this.init();

      // Verify code first
      const isValid = await this.verifyCode(userId, token);

      if (!isValid) {
        return {
          success: false,
          error: 'Invalid code'
        };
      }

      // Disable 2FA
      await this.db.update(
        this.db.sheetNames.twoFactor,
        { user_id: userId },
        {
          enabled: 'false'
        }
      );

      console.log(`[TwoFactorAuth] Disabled for ${userId}`);

      return {
        success: true,
        message: '2FA disabled'
      };

    } catch (error) {
      console.error('[TwoFactorAuth] Error disabling 2FA:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if user has 2FA enabled
   *
   * @param {string} userId - User ID
   * @returns {boolean} Enabled
   */
  async isEnabled(userId) {
    try {
      await this.init();

      const record = await this.db.findOne(this.db.sheetNames.twoFactor, {
        user_id: userId,
        enabled: 'true'
      });

      return record !== null;

    } catch (error) {
      console.error('[TwoFactorAuth] Error checking if enabled:', error);
      return false;
    }
  }

  /**
   * Generate backup codes
   * @private
   */
  generateBackupCodes() {
    const codes = [];

    for (let i = 0; i < this.backupCodeCount; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }

    return codes;
  }

  /**
   * Regenerate backup codes
   *
   * @param {string} userId - User ID
   * @param {string} token - Current valid 2FA code (required)
   * @returns {Object} New backup codes
   */
  async regenerateBackupCodes(userId, token) {
    try {
      await this.init();

      // Verify code first
      const isValid = await this.verifyCode(userId, token);

      if (!isValid) {
        return {
          success: false,
          error: 'Invalid code'
        };
      }

      // Generate new backup codes
      const backupCodes = this.generateBackupCodes();
      const encryptedBackupCodes = backupCodes.map(code => this.encryption.encrypt(code));

      // Update database
      await this.db.update(
        this.db.sheetNames.twoFactor,
        { user_id: userId },
        {
          backup_codes: JSON.stringify(encryptedBackupCodes),
          used_backup_codes: JSON.stringify([])
        }
      );

      console.log(`[TwoFactorAuth] Regenerated backup codes for ${userId}`);

      return {
        success: true,
        backupCodes
      };

    } catch (error) {
      console.error('[TwoFactorAuth] Error regenerating backup codes:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get 2FA status for user
   *
   * @param {string} userId - User ID
   * @returns {Object} Status
   */
  async getStatus(userId) {
    try {
      await this.init();

      const record = await this.db.findOne(this.db.sheetNames.twoFactor, {
        user_id: userId
      });

      if (!record) {
        return {
          enabled: false,
          setup: false
        };
      }

      const encryptedBackupCodes = JSON.parse(record.backup_codes || '[]');
      const usedBackupCodes = JSON.parse(record.used_backup_codes || '[]');

      return {
        enabled: record.enabled === 'true',
        verified: record.verified === 'true',
        setup: record.verified === 'true',
        backupCodesRemaining: encryptedBackupCodes.length - usedBackupCodes.length,
        lastVerifiedAt: record.last_verified_at,
        createdAt: record.created_at
      };

    } catch (error) {
      console.error('[TwoFactorAuth] Error getting status:', error);
      return {
        enabled: false,
        setup: false,
        error: error.message
      };
    }
  }
}

module.exports = TwoFactorAuth;

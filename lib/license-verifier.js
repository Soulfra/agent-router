/**
 * License Verifier
 *
 * "Phone Home" license verification system for CALOS Business OS
 *
 * Model: VS Code / Unity style licensing
 * - Localhost = Always free, no verification
 * - Production = Verify with license.calos.sh
 *
 * What We Collect:
 * - Domain (example.com, isadev.com, isasoftware.com)
 * - Routes/endpoints (user's custom routes)
 * - Themes (installed marketplace themes)
 * - Usage stats (anonymized)
 * - Install ID (unique identifier)
 *
 * License Tiers:
 * - Development (localhost): Free forever, no verification
 * - Community: Free, verify every 24h, share data OR contribute
 * - Pro ($29/mo): 5 domains, verify every 7 days, white-label
 * - Enterprise ($99/mo): Unlimited domains, verify every 30 days, air-gapped
 *
 * Graceful Degradation:
 * - License server down? 24h grace period
 * - After grace period: Warning banner (still works)
 * - Never fully disable (unlike Unity lol)
 */

const axios = require('axios');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class LicenseVerifier {
  constructor(options = {}) {
    this.licenseServerUrl = options.licenseServerUrl || process.env.LICENSE_SERVER_URL || 'https://license.calos.sh';
    this.db = options.db;  // PostgreSQL client (optional, for caching)

    // Cache settings
    this.cacheFile = options.cacheFile || path.join(os.homedir(), '.calos', 'license-cache.json');
    this.gracePeriodHours = options.gracePeriodHours || 24;

    // Verification intervals (milliseconds)
    this.verificationIntervals = {
      development: 0,                      // No verification
      community: 24 * 60 * 60 * 1000,      // 24 hours
      pro: 7 * 24 * 60 * 60 * 1000,        // 7 days
      enterprise: 30 * 24 * 60 * 60 * 1000 // 30 days
    };

    // Install ID (unique per installation)
    this.installId = null;

    // Cache in memory
    this._cache = null;
    this._cacheLoadTime = null;
  }

  /**
   * Initialize verifier (load install ID + cache)
   */
  async initialize() {
    // Load or generate install ID
    this.installId = await this._loadOrGenerateInstallId();

    // Load cached license
    this._cache = await this._loadCache();

    console.log(`[LicenseVerifier] Initialized (Install ID: ${this.installId})`);
  }

  /**
   * Main verification method
   *
   * @param {Object} req - Express request object (to detect domain)
   * @returns {Promise<Object>} License status
   */
  async verify(req) {
    const hostname = req.hostname || req.headers.host || 'localhost';

    // Check if localhost (always allow, no verification)
    if (this._isLocalhost(hostname)) {
      return {
        valid: true,
        tier: 'development',
        requiresVerification: false,
        message: 'Development mode (localhost)',
        hostname,
        features: {
          whiteLabel: false,
          multiDomain: false,
          apiAccess: false,
          prioritySupport: false
        }
      };
    }

    // Check cache first (avoid hammering license server)
    const cached = this._getCachedLicense(hostname);
    if (cached && this._isCacheValid(cached)) {
      return cached;
    }

    // Phone home to license server
    try {
      const license = await this._verifyWithServer({
        hostname,
        installId: this.installId,
        routes: await this._getRegisteredRoutes(),
        themes: await this._getInstalledThemes(),
        stats: await this._getUsageStats()
      });

      // Cache the result
      await this._cacheResult(hostname, license);

      return license;
    } catch (error) {
      // Graceful degradation: License server down
      console.error('[LicenseVerifier] License server error:', error.message);

      // Check if we're in grace period
      if (cached && this._isInGracePeriod(cached)) {
        return {
          ...cached,
          warning: `License server unreachable. Grace period: ${this._getGracePeriodRemaining(cached)}`
        };
      }

      // Beyond grace period: Warning banner but still works
      return {
        valid: true,
        tier: 'community',
        requiresVerification: true,
        warning: 'License server unreachable. Please verify license when possible.',
        hostname,
        features: {
          whiteLabel: false,
          multiDomain: false,
          apiAccess: false,
          prioritySupport: false
        }
      };
    }
  }

  /**
   * Check if hostname is localhost/development
   *
   * @private
   * @param {string} hostname
   * @returns {boolean}
   */
  _isLocalhost(hostname) {
    const localhostPatterns = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      /^192\.168\.\d{1,3}\.\d{1,3}$/,  // 192.168.x.x
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,  // 10.x.x.x
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,  // 172.16.x.x - 172.31.x.x
      /\.local$/,  // example.local
      /\.localhost$/  // example.localhost
    ];

    return localhostPatterns.some(pattern => {
      if (typeof pattern === 'string') {
        return hostname === pattern;
      } else {
        return pattern.test(hostname);
      }
    });
  }

  /**
   * Verify with license server (phone home)
   *
   * @private
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async _verifyWithServer(data) {
    // Include telemetry data with verification
    const telemetryData = await this._getBatchedTelemetry();

    const response = await axios.post(`${this.licenseServerUrl}/verify`, {
      ...data,
      telemetry: telemetryData  // Include batched telemetry
    }, {
      timeout: 5000,
      headers: {
        'User-Agent': `CALOS-License-Verifier/1.0.0 (${os.platform()}; ${os.arch()})`,
        'Content-Type': 'application/json'
      }
    });

    const license = response.data;

    // Save to database (if available)
    if (this.db) {
      await this.db.query(`
        INSERT INTO license_verifications (
          install_id,
          hostname,
          tier,
          features,
          verification_data,
          verified_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        this.installId,
        data.hostname,
        license.tier,
        JSON.stringify(license.features),
        JSON.stringify(data)
      ]);
    }

    return license;
  }

  /**
   * Get batched telemetry data for verification
   *
   * @private
   * @returns {Promise<Object>}
   */
  async _getBatchedTelemetry() {
    if (!this.db) return {};

    try {
      // Get telemetry summary from last 24h
      const result = await this.db.query(`
        SELECT * FROM get_telemetry_summary($1, 1)
      `, [this.installId]);

      // Get recent errors
      const errors = await this.db.query(`
        SELECT
          error_type,
          error_name,
          occurrence_count
        FROM telemetry_errors
        WHERE install_id = $1
          AND last_seen_at >= NOW() - INTERVAL '24 hours'
        ORDER BY occurrence_count DESC
        LIMIT 10
      `, [this.installId]);

      // Get performance stats
      const performance = await this.db.query(`
        SELECT
          metric_name,
          AVG(duration_ms) as avg_duration,
          MAX(duration_ms) as max_duration,
          COUNT(*) as count
        FROM telemetry_performance
        WHERE install_id = $1
          AND created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY metric_name
        ORDER BY count DESC
        LIMIT 10
      `, [this.installId]);

      return {
        summary: result.rows,
        errors: errors.rows,
        performance: performance.rows,
        period: '24h'
      };
    } catch (error) {
      console.error('[LicenseVerifier] Failed to get telemetry:', error.message);
      return {};
    }
  }

  /**
   * Get registered routes (user's custom routes)
   *
   * @private
   * @returns {Promise<Array<string>>}
   */
  async _getRegisteredRoutes() {
    if (!this.db) return [];

    try {
      // Look for custom routes in database
      const result = await this.db.query(`
        SELECT DISTINCT route_path
        FROM custom_routes
        WHERE created_at >= NOW() - INTERVAL '30 days'
        ORDER BY route_path
      `);

      return result.rows.map(r => r.route_path);
    } catch (error) {
      console.error('[LicenseVerifier] Failed to get routes:', error.message);
      return [];
    }
  }

  /**
   * Get installed themes (marketplace themes)
   *
   * @private
   * @returns {Promise<Array<Object>>}
   */
  async _getInstalledThemes() {
    if (!this.db) return [];

    try {
      const result = await this.db.query(`
        SELECT
          t.theme_id,
          t.name,
          t.slug,
          t.category,
          t.version,
          t.author_name,
          i.installed_at
        FROM marketplace_installations i
        JOIN marketplace_themes t ON i.theme_id = t.theme_id
        WHERE i.status = 'active'
        ORDER BY i.installed_at DESC
        LIMIT 50
      `);

      return result.rows.map(r => ({
        themeId: r.theme_id,
        name: r.name,
        slug: r.slug,
        category: r.category,
        version: r.version,
        author: r.author_name,
        installedAt: r.installed_at
      }));
    } catch (error) {
      console.error('[LicenseVerifier] Failed to get themes:', error.message);
      return [];
    }
  }

  /**
   * Get usage stats (anonymized)
   *
   * @private
   * @returns {Promise<Object>}
   */
  async _getUsageStats() {
    if (!this.db) {
      return {
        users: 0,
        transcripts: 0,
        posTransactions: 0,
        cryptoCharges: 0,
        forumPosts: 0
      };
    }

    try {
      // Get counts (anonymized, no PII)
      const [users, transcripts, posTransactions, cryptoCharges, forumPosts] = await Promise.all([
        this.db.query(`SELECT COUNT(DISTINCT user_id) as count FROM users WHERE created_at >= NOW() - INTERVAL '30 days'`),
        this.db.query(`SELECT COUNT(*) as count FROM business_transcripts WHERE created_at >= NOW() - INTERVAL '30 days'`),
        this.db.query(`SELECT COUNT(*) as count FROM pos_transactions WHERE created_at >= NOW() - INTERVAL '30 days'`),
        this.db.query(`SELECT COUNT(*) as count FROM crypto_charges WHERE created_at >= NOW() - INTERVAL '30 days'`),
        this.db.query(`SELECT COUNT(*) as count FROM forum_posts WHERE created_at >= NOW() - INTERVAL '30 days'`)
      ]);

      return {
        users: parseInt(users.rows[0]?.count || 0),
        transcripts: parseInt(transcripts.rows[0]?.count || 0),
        posTransactions: parseInt(posTransactions.rows[0]?.count || 0),
        cryptoCharges: parseInt(cryptoCharges.rows[0]?.count || 0),
        forumPosts: parseInt(forumPosts.rows[0]?.count || 0)
      };
    } catch (error) {
      console.error('[LicenseVerifier] Failed to get usage stats:', error.message);
      return {
        users: 0,
        transcripts: 0,
        posTransactions: 0,
        cryptoCharges: 0,
        forumPosts: 0
      };
    }
  }

  /**
   * Load or generate install ID
   *
   * @private
   * @returns {Promise<string>}
   */
  async _loadOrGenerateInstallId() {
    const installIdFile = path.join(os.homedir(), '.calos', 'install-id');

    try {
      // Try to load existing install ID
      const installId = await fs.readFile(installIdFile, 'utf-8');
      return installId.trim();
    } catch (error) {
      // Generate new install ID
      const installId = crypto.randomBytes(16).toString('hex');

      // Save to file
      await fs.mkdir(path.dirname(installIdFile), { recursive: true });
      await fs.writeFile(installIdFile, installId, 'utf-8');

      console.log(`[LicenseVerifier] Generated new install ID: ${installId}`);
      return installId;
    }
  }

  /**
   * Load cached license
   *
   * @private
   * @returns {Promise<Object|null>}
   */
  async _loadCache() {
    try {
      const cacheData = await fs.readFile(this.cacheFile, 'utf-8');
      this._cacheLoadTime = Date.now();
      return JSON.parse(cacheData);
    } catch (error) {
      return {};
    }
  }

  /**
   * Get cached license for hostname
   *
   * @private
   * @param {string} hostname
   * @returns {Object|null}
   */
  _getCachedLicense(hostname) {
    if (!this._cache || !this._cache[hostname]) {
      return null;
    }

    return this._cache[hostname];
  }

  /**
   * Check if cached license is still valid
   *
   * @private
   * @param {Object} cached
   * @returns {boolean}
   */
  _isCacheValid(cached) {
    if (!cached.cachedAt) return false;

    const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
    const maxAge = this.verificationIntervals[cached.tier] || this.verificationIntervals.community;

    return cacheAge < maxAge;
  }

  /**
   * Check if cached license is in grace period
   *
   * @private
   * @param {Object} cached
   * @returns {boolean}
   */
  _isInGracePeriod(cached) {
    if (!cached.cachedAt) return false;

    const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
    const gracePeriod = this.gracePeriodHours * 60 * 60 * 1000;

    return cacheAge < gracePeriod;
  }

  /**
   * Get grace period remaining (human readable)
   *
   * @private
   * @param {Object} cached
   * @returns {string}
   */
  _getGracePeriodRemaining(cached) {
    if (!cached.cachedAt) return '0h';

    const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
    const gracePeriod = this.gracePeriodHours * 60 * 60 * 1000;
    const remaining = Math.max(0, gracePeriod - cacheAge);

    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

    return `${hours}h ${minutes}m`;
  }

  /**
   * Cache license result
   *
   * @private
   * @param {string} hostname
   * @param {Object} license
   * @returns {Promise<void>}
   */
  async _cacheResult(hostname, license) {
    // Add to in-memory cache
    this._cache = this._cache || {};
    this._cache[hostname] = {
      ...license,
      cachedAt: new Date().toISOString()
    };

    // Save to file
    try {
      await fs.mkdir(path.dirname(this.cacheFile), { recursive: true });
      await fs.writeFile(this.cacheFile, JSON.stringify(this._cache, null, 2), 'utf-8');
    } catch (error) {
      console.error('[LicenseVerifier] Failed to save cache:', error.message);
    }
  }

  /**
   * Clear cache (for testing)
   *
   * @returns {Promise<void>}
   */
  async clearCache() {
    this._cache = {};
    this._cacheLoadTime = null;

    try {
      await fs.unlink(this.cacheFile);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Get license info for display
   *
   * @param {string} hostname
   * @returns {Promise<Object>}
   */
  async getLicenseInfo(hostname) {
    const cached = this._getCachedLicense(hostname);

    if (!cached) {
      return {
        hostname,
        status: 'not_verified',
        message: 'License not yet verified for this domain'
      };
    }

    const isValid = this._isCacheValid(cached);
    const isInGracePeriod = this._isInGracePeriod(cached);

    return {
      hostname,
      tier: cached.tier,
      valid: cached.valid,
      status: isValid ? 'valid' : (isInGracePeriod ? 'grace_period' : 'expired'),
      cachedAt: cached.cachedAt,
      features: cached.features,
      message: cached.message,
      warning: cached.warning,
      gracePeriodRemaining: isInGracePeriod ? this._getGracePeriodRemaining(cached) : null
    };
  }
}

module.exports = LicenseVerifier;

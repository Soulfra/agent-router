/**
 * Model Version Manager
 *
 * Manages multiple versions of domain-specific models:
 * - Track versions per domain
 * - Control traffic splitting (% to each version)
 * - Deploy new versions
 * - Rollback versions
 * - A/B test different base models or configurations
 *
 * Example:
 * - soulfra-model v1 (codellama:7b) vs v2 (qwen2.5-coder)
 * - publishing-model default vs publishing-model-concise
 */

class ModelVersionManager {
  constructor(options = {}) {
    this.db = options.db;
    this.ollamaAdapter = options.ollamaAdapter;

    // Cache for quick lookups
    this.versionCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.lastCacheUpdate = 0;

    console.log('[ModelVersionManager] Initialized');
  }

  /**
   * Register a new model version
   *
   * @param {object} version - Version configuration
   * @param {string} version.domain - Domain (e.g., 'cryptography')
   * @param {string} version.versionName - Version identifier (e.g., 'v1', 'v2-experimental')
   * @param {string} version.baseModel - Ollama base model
   * @param {string} version.modelfilePath - Path to Modelfile
   * @param {object} version.config - Configuration overrides
   * @param {string} version.status - 'testing', 'active', 'retired'
   * @param {integer} version.trafficPercent - Traffic allocation (0-100)
   * @returns {Promise<integer>} - Version ID
   */
  async registerVersion(version) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    const {
      domain,
      versionName,
      baseModel,
      modelfilePath,
      config = {},
      status = 'testing',
      trafficPercent = 0
    } = version;

    // Validate inputs
    if (!domain || !versionName || !baseModel) {
      throw new Error('domain, versionName, and baseModel are required');
    }

    try {
      const result = await this.db.query(
        `INSERT INTO model_versions (
          domain, version_name, base_model, modelfile_path, config, status, traffic_percent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (domain, version_name) DO UPDATE SET
          base_model = $3,
          modelfile_path = $4,
          config = $5,
          status = $6,
          traffic_percent = $7,
          updated_at = NOW()
        RETURNING id`,
        [domain, versionName, baseModel, modelfilePath, JSON.stringify(config), status, trafficPercent]
      );

      const versionId = result.rows[0].id;

      // Invalidate cache
      this._invalidateCache();

      console.log(`[VersionManager] Registered ${domain}:${versionName} (${status}, ${trafficPercent}% traffic)`);

      return versionId;
    } catch (error) {
      console.error('[VersionManager] Error registering version:', error.message);
      throw error;
    }
  }

  /**
   * Select version for a domain (with traffic splitting)
   *
   * @param {string} domain - Domain name
   * @param {string} userId - User ID (for consistent assignment)
   * @param {object} options - Selection options
   * @returns {Promise<object>} - Selected version
   */
  async selectVersion(domain, userId = null, options = {}) {
    const versions = await this.getActiveVersions(domain);

    if (versions.length === 0) {
      // No versions registered, use default
      return this._getDefaultVersion(domain);
    }

    if (versions.length === 1) {
      // Only one version, use it
      return versions[0];
    }

    // Multiple versions - use traffic splitting
    // If userId provided, use consistent hashing for sticky assignment
    if (userId) {
      return this._selectVersionConsistent(versions, userId);
    }

    // Random selection based on traffic percentages
    return this._selectVersionRandom(versions);
  }

  /**
   * Get all active versions for a domain
   *
   * @param {string} domain - Domain name
   * @returns {Promise<Array>} - Active versions
   */
  async getActiveVersions(domain) {
    const versions = await this.getAllVersions(domain);
    return versions.filter(v => v.status === 'active' && v.trafficPercent > 0);
  }

  /**
   * Get all versions for a domain
   *
   * @param {string} domain - Domain name
   * @returns {Promise<Array>} - All versions
   */
  async getAllVersions(domain) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    // Check cache
    const cacheKey = `versions:${domain}`;
    if (this._isCacheValid() && this.versionCache.has(cacheKey)) {
      return this.versionCache.get(cacheKey);
    }

    try {
      const result = await this.db.query(
        `SELECT
          id, domain, version_name, base_model, modelfile_path,
          config, status, traffic_percent, created_at, updated_at
         FROM model_versions
         WHERE domain = $1
         ORDER BY created_at DESC`,
        [domain]
      );

      const versions = result.rows.map(row => ({
        id: row.id,
        domain: row.domain,
        versionName: row.version_name,
        baseModel: row.base_model,
        modelfilePath: row.modelfile_path,
        config: row.config,
        status: row.status,
        trafficPercent: row.traffic_percent,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      // Cache it
      this.versionCache.set(cacheKey, versions);
      this.lastCacheUpdate = Date.now();

      return versions;
    } catch (error) {
      console.error('[VersionManager] Error getting versions:', error.message);
      throw error;
    }
  }

  /**
   * Update version traffic allocation
   *
   * @param {string} domain - Domain name
   * @param {string} versionName - Version name
   * @param {integer} trafficPercent - New traffic percentage
   * @returns {Promise<boolean>} - Success
   */
  async setTrafficPercent(domain, versionName, trafficPercent) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    if (trafficPercent < 0 || trafficPercent > 100) {
      throw new Error('Traffic percent must be between 0 and 100');
    }

    try {
      await this.db.query(
        `UPDATE model_versions
         SET traffic_percent = $1, updated_at = NOW()
         WHERE domain = $2 AND version_name = $3`,
        [trafficPercent, domain, versionName]
      );

      this._invalidateCache();

      console.log(`[VersionManager] Set ${domain}:${versionName} traffic to ${trafficPercent}%`);
      return true;
    } catch (error) {
      console.error('[VersionManager] Error setting traffic:', error.message);
      throw error;
    }
  }

  /**
   * Update version status
   *
   * @param {string} domain - Domain name
   * @param {string} versionName - Version name
   * @param {string} status - New status ('testing', 'active', 'retired')
   * @returns {Promise<boolean>} - Success
   */
  async setVersionStatus(domain, versionName, status) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    const validStatuses = ['testing', 'active', 'retired'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    try {
      await this.db.query(
        `UPDATE model_versions
         SET status = $1, updated_at = NOW()
         WHERE domain = $2 AND version_name = $3`,
        [status, domain, versionName]
      );

      this._invalidateCache();

      console.log(`[VersionManager] Set ${domain}:${versionName} status to ${status}`);
      return true;
    } catch (error) {
      console.error('[VersionManager] Error setting status:', error.message);
      throw error;
    }
  }

  /**
   * Rollback to previous version
   *
   * @param {string} domain - Domain name
   * @param {string} currentVersion - Current version to retire
   * @param {string} previousVersion - Previous version to activate
   * @returns {Promise<boolean>} - Success
   */
  async rollback(domain, currentVersion, previousVersion) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      // Start transaction
      await this.db.query('BEGIN');

      // Retire current version
      await this.db.query(
        `UPDATE model_versions
         SET status = 'retired', traffic_percent = 0
         WHERE domain = $1 AND version_name = $2`,
        [domain, currentVersion]
      );

      // Activate previous version
      await this.db.query(
        `UPDATE model_versions
         SET status = 'active', traffic_percent = 100
         WHERE domain = $1 AND version_name = $2`,
        [domain, previousVersion]
      );

      await this.db.query('COMMIT');

      this._invalidateCache();

      console.log(`[VersionManager] Rolled back ${domain} from ${currentVersion} to ${previousVersion}`);
      return true;
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('[VersionManager] Rollback error:', error.message);
      throw error;
    }
  }

  /**
   * Get version performance statistics
   *
   * @param {string} domain - Domain name
   * @param {string} versionName - Version name
   * @param {integer} days - Days of history
   * @returns {Promise<object>} - Performance stats
   */
  async getVersionStats(domain, versionName, days = 7) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE status = 'success')::REAL / COUNT(*)::REAL as success_rate,
          AVG(response_time_ms) as avg_response_time,
          AVG(cost_usd) as avg_cost,
          COUNT(DISTINCT user_id) as unique_users
         FROM model_usage_log
         WHERE model_version = $1
           AND use_case_category = $2
           AND timestamp > NOW() - INTERVAL '${days} days'`,
        [versionName, domain]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return {
        domain,
        versionName,
        totalRequests: parseInt(result.rows[0].total_requests),
        successRate: parseFloat(result.rows[0].success_rate) || 0,
        avgResponseTime: parseFloat(result.rows[0].avg_response_time) || 0,
        avgCost: parseFloat(result.rows[0].avg_cost) || 0,
        uniqueUsers: parseInt(result.rows[0].unique_users) || 0,
        days
      };
    } catch (error) {
      console.error('[VersionManager] Error getting stats:', error.message);
      throw error;
    }
  }

  /**
   * List all installed Ollama models
   *
   * @returns {Promise<Array>} - Installed models
   */
  async listInstalledModels() {
    if (!this.ollamaAdapter) {
      throw new Error('Ollama adapter not configured');
    }

    try {
      const models = await this.ollamaAdapter.listInstalledModels();
      return models;
    } catch (error) {
      console.error('[VersionManager] Error listing models:', error.message);
      throw error;
    }
  }

  /**
   * Select version using consistent hashing (sticky assignment)
   * @private
   */
  _selectVersionConsistent(versions, userId) {
    // Simple hash function
    const hash = this._hashString(`${userId}`);

    // Calculate cumulative ranges
    let cumulative = 0;
    const ranges = versions.map(v => {
      const start = cumulative;
      cumulative += v.trafficPercent;
      return { version: v, start, end: cumulative };
    });

    // Map hash to 0-100 range
    const value = hash % 100;

    // Find matching version
    for (const range of ranges) {
      if (value >= range.start && value < range.end) {
        return range.version;
      }
    }

    // Fallback to first version
    return versions[0];
  }

  /**
   * Select version randomly based on traffic weights
   * @private
   */
  _selectVersionRandom(versions) {
    const random = Math.random() * 100;

    let cumulative = 0;
    for (const version of versions) {
      cumulative += version.trafficPercent;
      if (random < cumulative) {
        return version;
      }
    }

    // Fallback to first version
    return versions[0];
  }

  /**
   * Get default version (fallback when no versions registered)
   * @private
   */
  _getDefaultVersion(domain) {
    // Map domains to default model names
    const defaults = {
      'cryptography': 'soulfra-model',
      'data': 'deathtodata-model',
      'publishing': 'publishing-model',
      'calos': 'calos-model',
      'whimsical': 'drseuss-model',
      'code': 'codellama:7b-instruct',
      'creative': 'llama3.2:3b',
      'reasoning': 'llama3.2:3b'
    };

    return {
      domain,
      versionName: 'default',
      baseModel: defaults[domain] || 'llama3.2:3b',
      config: {},
      status: 'active',
      trafficPercent: 100,
      isDefault: true
    };
  }

  /**
   * Simple string hash function
   * @private
   */
  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Check if cache is still valid
   * @private
   */
  _isCacheValid() {
    return (Date.now() - this.lastCacheUpdate) < this.cacheExpiry;
  }

  /**
   * Invalidate version cache
   * @private
   */
  _invalidateCache() {
    this.versionCache.clear();
    this.lastCacheUpdate = 0;
  }
}

module.exports = ModelVersionManager;

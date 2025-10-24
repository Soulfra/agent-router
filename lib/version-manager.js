/**
 * Version Manager
 *
 * Unified versioning system for CALOS:
 * - Session versioning (track changes to Ollama sessions)
 * - Embed script versioning (semantic versioning for calos-embed.js)
 * - Document export versioning
 * - Migration/compatibility management
 *
 * Features:
 * - Semantic versioning (MAJOR.MINOR.PATCH)
 * - Version history tracking
 * - Session forking (create new version from existing)
 * - Backward compatibility checks
 * - Auto-increment on major changes
 * - Version comparison and validation
 */

const semver = require('semver');

class VersionManager {
  constructor(config = {}) {
    this.db = config.db;
    this.verbose = config.verbose || false;

    // Current versions
    this.EMBED_SCRIPT_VERSION = '1.0.0';
    this.SOULFRA_VERSION = '1.0.0';
    this.API_VERSION = '1.0.0';
  }

  // ============================================================================
  // SESSION VERSIONING
  // ============================================================================

  /**
   * Increment session version
   * Called when major changes occur (domain switch, model upgrade, etc.)
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} change - Change description
   * @returns {Promise<Object>} New version info
   */
  async incrementSessionVersion(sessionId, change = {}) {
    try {
      if (!this.db) {
        throw new Error('Database required for session versioning');
      }

      // Get current session
      const result = await this.db.query(`
        SELECT version, version_history, is_immutable
        FROM ollama_streaming_sessions
        WHERE session_id = $1
      `, [sessionId]);

      if (result.rows.length === 0) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const session = result.rows[0];

      // Cannot version immutable sessions
      if (session.is_immutable) {
        throw new Error('Cannot modify version of signed/immutable session');
      }

      const currentVersion = session.version || 1;
      const newVersion = currentVersion + 1;

      // Build version history entry
      const historyEntry = {
        version: newVersion,
        previousVersion: currentVersion,
        timestamp: new Date().toISOString(),
        reason: change.reason || 'unknown',
        changes: change.changes || {},
        metadata: change.metadata || {}
      };

      // Update version history
      const versionHistory = session.version_history || [];
      versionHistory.push(historyEntry);

      // Update session
      await this.db.query(`
        UPDATE ollama_streaming_sessions
        SET
          version = $2,
          version_history = $3,
          updated_at = NOW()
        WHERE session_id = $1
      `, [sessionId, newVersion, JSON.stringify(versionHistory)]);

      this._log(`Session ${sessionId} version incremented: ${currentVersion} → ${newVersion}`);

      return {
        success: true,
        sessionId,
        previousVersion: currentVersion,
        newVersion,
        change: historyEntry
      };

    } catch (error) {
      console.error('[VersionManager] Increment session version error:', error.message);
      throw error;
    }
  }

  /**
   * Fork session (create new version from existing)
   * Useful for creating variations or experiments
   *
   * @param {string} parentSessionId - Parent session UUID
   * @param {Object} options - Fork options
   * @returns {Promise<Object>} New session info
   */
  async forkSession(parentSessionId, options = {}) {
    try {
      if (!this.db) {
        throw new Error('Database required for session forking');
      }

      const { userId, sessionName, copyMessages = true } = options;

      // Get parent session
      const parentResult = await this.db.query(`
        SELECT * FROM ollama_streaming_sessions
        WHERE session_id = $1
      `, [parentSessionId]);

      if (parentResult.rows.length === 0) {
        throw new Error(`Parent session ${parentSessionId} not found`);
      }

      const parent = parentResult.rows[0];

      // Create new session as fork
      const insertResult = await this.db.query(`
        INSERT INTO ollama_streaming_sessions (
          user_id,
          domain_id,
          brand_id,
          room_id,
          primary_model,
          primary_provider,
          session_name,
          parent_session_id,
          version,
          version_history,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING session_id, version
      `, [
        userId || parent.user_id,
        parent.domain_id,
        parent.brand_id,
        parent.room_id,
        parent.primary_model,
        parent.primary_provider,
        sessionName || `Fork of ${parent.session_name || parent.session_id}`,
        parentSessionId,
        1, // Start at version 1
        JSON.stringify([{
          version: 1,
          timestamp: new Date().toISOString(),
          reason: 'forked_from_parent',
          parentSessionId,
          parentVersion: parent.version
        }]),
        'active'
      ]);

      const newSessionId = insertResult.rows[0].session_id;

      // Copy messages if requested
      if (copyMessages) {
        await this.db.query(`
          INSERT INTO ollama_session_messages (
            session_id,
            role,
            content,
            timestamp,
            model,
            provider,
            tokens,
            cost_usd,
            metadata
          )
          SELECT
            $1,
            role,
            content,
            timestamp,
            model,
            provider,
            tokens,
            cost_usd,
            metadata
          FROM ollama_session_messages
          WHERE session_id = $2
        `, [newSessionId, parentSessionId]);
      }

      this._log(`Session forked: ${parentSessionId} → ${newSessionId}`);

      return {
        success: true,
        parentSessionId,
        newSessionId,
        version: 1,
        messagesCopied: copyMessages
      };

    } catch (error) {
      console.error('[VersionManager] Fork session error:', error.message);
      throw error;
    }
  }

  /**
   * Get session version history
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Array>} Version history
   */
  async getSessionVersionHistory(sessionId) {
    try {
      if (!this.db) {
        throw new Error('Database required');
      }

      const result = await this.db.query(`
        SELECT version, version_history, parent_session_id
        FROM ollama_streaming_sessions
        WHERE session_id = $1
      `, [sessionId]);

      if (result.rows.length === 0) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const session = result.rows[0];

      return {
        success: true,
        sessionId,
        currentVersion: session.version,
        parentSessionId: session.parent_session_id,
        history: session.version_history || []
      };

    } catch (error) {
      console.error('[VersionManager] Get session version history error:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // EMBED SCRIPT VERSIONING
  // ============================================================================

  /**
   * Get embed script version
   *
   * @returns {string} Semantic version (e.g., "1.2.3")
   */
  getEmbedVersion() {
    return this.EMBED_SCRIPT_VERSION;
  }

  /**
   * Check if embed version is compatible with current API
   *
   * @param {string} embedVersion - Embed script version
   * @returns {boolean} Is compatible
   */
  isEmbedVersionCompatible(embedVersion) {
    try {
      // Major version must match
      const currentMajor = semver.major(this.EMBED_SCRIPT_VERSION);
      const embedMajor = semver.major(embedVersion);

      if (currentMajor !== embedMajor) {
        return false;
      }

      // Embed version must be <= current version (no future versions)
      return semver.lte(embedVersion, this.EMBED_SCRIPT_VERSION);

    } catch (error) {
      console.error('[VersionManager] Invalid embed version:', embedVersion);
      return false;
    }
  }

  /**
   * Bump embed version
   *
   * @param {string} level - "major", "minor", or "patch"
   * @returns {string} New version
   */
  bumpEmbedVersion(level = 'patch') {
    const newVersion = semver.inc(this.EMBED_SCRIPT_VERSION, level);
    this.EMBED_SCRIPT_VERSION = newVersion;
    this._log(`Embed version bumped to ${newVersion}`);
    return newVersion;
  }

  // ============================================================================
  // DOCUMENT EXPORT VERSIONING
  // ============================================================================

  /**
   * Get document export version
   * Based on document format (PDF, JSON, etc.)
   *
   * @param {string} format - "pdf", "json", "csv"
   * @returns {string} Document format version
   */
  getDocumentVersion(format) {
    const versions = {
      pdf: '1.0.0',
      json: '1.0.0',
      csv: '1.0.0'
    };

    return versions[format] || '1.0.0';
  }

  /**
   * Check if document version is compatible
   *
   * @param {string} format - Document format
   * @param {string} version - Document version
   * @returns {boolean} Is compatible
   */
  isDocumentVersionCompatible(format, version) {
    const currentVersion = this.getDocumentVersion(format);

    try {
      // Major version must match
      return semver.major(version) === semver.major(currentVersion);
    } catch (error) {
      return false;
    }
  }

  // ============================================================================
  // MIGRATION & COMPATIBILITY
  // ============================================================================

  /**
   * Check overall system version compatibility
   *
   * @param {Object} versions - Versions to check
   * @returns {Object} Compatibility report
   */
  checkCompatibility(versions = {}) {
    const {
      embedVersion = null,
      apiVersion = null,
      soulfraVersion = null
    } = versions;

    const report = {
      compatible: true,
      warnings: [],
      errors: []
    };

    // Check embed version
    if (embedVersion) {
      if (!this.isEmbedVersionCompatible(embedVersion)) {
        report.compatible = false;
        report.errors.push(`Incompatible embed version: ${embedVersion} (current: ${this.EMBED_SCRIPT_VERSION})`);
      } else if (semver.lt(embedVersion, this.EMBED_SCRIPT_VERSION)) {
        report.warnings.push(`Embed version ${embedVersion} is outdated (current: ${this.EMBED_SCRIPT_VERSION})`);
      }
    }

    // Check API version
    if (apiVersion && apiVersion !== this.API_VERSION) {
      if (semver.major(apiVersion) !== semver.major(this.API_VERSION)) {
        report.compatible = false;
        report.errors.push(`Incompatible API version: ${apiVersion} (current: ${this.API_VERSION})`);
      }
    }

    // Check Soulfra version
    if (soulfraVersion && soulfraVersion !== this.SOULFRA_VERSION) {
      if (semver.major(soulfraVersion) !== semver.major(this.SOULFRA_VERSION)) {
        report.compatible = false;
        report.errors.push(`Incompatible Soulfra version: ${soulfraVersion} (current: ${this.SOULFRA_VERSION})`);
      }
    }

    return report;
  }

  /**
   * Get system versions
   *
   * @returns {Object} All current versions
   */
  getSystemVersions() {
    return {
      embedScript: this.EMBED_SCRIPT_VERSION,
      api: this.API_VERSION,
      soulfra: this.SOULFRA_VERSION,
      documentFormats: {
        pdf: this.getDocumentVersion('pdf'),
        json: this.getDocumentVersion('json'),
        csv: this.getDocumentVersion('csv')
      }
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Log message if verbose mode enabled
   * @private
   */
  _log(message) {
    if (this.verbose) {
      console.log(`[VersionManager] ${message}`);
    }
  }
}

module.exports = VersionManager;

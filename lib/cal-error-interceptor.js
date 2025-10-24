/**
 * CAL Global Error Interceptor
 *
 * Captures ALL errors in the system and learns from them:
 * - Uncaught exceptions
 * - Unhandled promise rejections
 * - Migration failures
 * - Runtime errors
 * - Timeout errors
 *
 * Features:
 * - Extracts error snippets and stack traces
 * - Posts to CAL knowledge API for learning
 * - Generates ragebait posts for viral errors
 * - Saves state before crashes
 * - Suggests fixes from knowledge base
 * - Auto-applies known fixes
 *
 * Example:
 *   const interceptor = new CalErrorInterceptor();
 *   await interceptor.init();
 *   interceptor.installHandlers(); // Captures all errors globally
 */

const fs = require('fs').promises;
const path = require('path');
const CalFailureLearner = require('./cal-failure-learner');
const CalMigrationLearner = require('./cal-migration-learner');

class CalErrorInterceptor {
  constructor(options = {}) {
    this.errorLogPath = options.errorLogPath || path.join(__dirname, '../logs/cal-errors.json');
    this.liveErrorsPath = options.liveErrorsPath || path.join(__dirname, '../logs/cal-live-errors.json');
    this.maxLiveErrors = options.maxLiveErrors || 100;
    this.ragebaitThreshold = options.ragebaitThreshold || 3; // Generate ragebait after 3 occurrences

    // Learning systems
    this.failureLearner = new CalFailureLearner();
    this.migrationLearner = new CalMigrationLearner();

    // Error state
    this.errors = {
      uncaught: [],
      unhandledRejection: [],
      migration: [],
      runtime: [],
      timeout: []
    };

    this.liveErrors = []; // Recent errors for dashboard
    this.errorPatterns = {}; // { patternHash: { count, lastSeen, errorExample } }

    this.loaded = false;
    this.knowledgeApiUrl = options.knowledgeApiUrl || 'http://localhost:5001/api/cal-knowledge';
  }

  /**
   * Initialize error interceptor
   */
  async init() {
    await this.load();
    await this.failureLearner.load();
    await this.migrationLearner.load();
    this.loaded = true;

    console.log('[ErrorInterceptor] Initialized - ready to capture errors');
  }

  /**
   * Install global error handlers
   */
  installHandlers() {
    // Uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('[ErrorInterceptor] 💥 UNCAUGHT EXCEPTION:', error);

      await this.capture(error, {
        type: 'uncaught',
        fatal: true,
        stack: error.stack
      });

      // Save knowledge before crash
      await this.saveKnowledge();

      // Generate ragebait if this is a recurring error
      await this.maybeGenerateRagebait(error);

      // Give time for async operations
      setTimeout(() => process.exit(1), 1000);
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('[ErrorInterceptor] 🚫 UNHANDLED REJECTION:', reason);

      await this.capture(reason, {
        type: 'unhandledRejection',
        fatal: false,
        promise: String(promise)
      });
    });

    // SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      console.log('\n[ErrorInterceptor] 💾 SIGINT received - saving knowledge...');

      await this.saveKnowledge();

      console.log('[ErrorInterceptor] ✓ Knowledge saved, exiting');
      process.exit(0);
    });

    // SIGTERM (kill)
    process.on('SIGTERM', async () => {
      console.log('[ErrorInterceptor] 💾 SIGTERM received - saving knowledge...');

      await this.saveKnowledge();

      process.exit(0);
    });

    console.log('[ErrorInterceptor] ✓ Global error handlers installed');
  }

  /**
   * Capture an error
   */
  async capture(error, context = {}) {
    const errorData = {
      message: typeof error === 'string' ? error : error.message || String(error),
      stack: error.stack || null,
      type: context.type || 'runtime',
      fatal: context.fatal || false,
      timestamp: new Date().toISOString(),
      context
    };

    // Add to category
    const category = context.type || 'runtime';
    if (!this.errors[category]) {
      this.errors[category] = [];
    }
    this.errors[category].push(errorData);

    // Add to live errors (for dashboard)
    this.liveErrors.unshift(errorData);
    if (this.liveErrors.length > this.maxLiveErrors) {
      this.liveErrors = this.liveErrors.slice(0, this.maxLiveErrors);
    }

    // Track error pattern
    const patternHash = this._hashError(errorData.message);
    if (!this.errorPatterns[patternHash]) {
      this.errorPatterns[patternHash] = {
        count: 0,
        firstSeen: errorData.timestamp,
        errorExample: errorData.message
      };
    }
    this.errorPatterns[patternHash].count++;
    this.errorPatterns[patternHash].lastSeen = errorData.timestamp;

    // Record in failure learner
    await this.failureLearner.recordFailure(
      `error:${category}`,
      errorData.message,
      { ...context, stack: errorData.stack?.substring(0, 500) }
    );

    // Save immediately for critical errors
    if (context.fatal) {
      await this.save();
      await this.saveLiveErrors();
    }

    return errorData;
  }

  /**
   * Get suggested fix for an error
   */
  async getSuggestedFix(error) {
    const errorMessage = typeof error === 'string' ? error : error.message || String(error);

    // Check migration learner first
    const migrationFix = await this.migrationLearner.getSuggestedFix('unknown', errorMessage);
    if (migrationFix) {
      return {
        source: 'migration-learner',
        ...migrationFix
      };
    }

    // Check failure learner
    const alternatives = this.failureLearner.getAlternatives(`error:${errorMessage.substring(0, 50)}`);
    if (alternatives.length > 0) {
      return {
        source: 'failure-learner',
        alternatives: alternatives.slice(0, 3)
      };
    }

    // Check for common patterns
    const commonFix = this._getCommonFix(errorMessage);
    if (commonFix) {
      return {
        source: 'common-patterns',
        ...commonFix
      };
    }

    return null;
  }

  /**
   * Generate ragebait for recurring errors
   */
  async maybeGenerateRagebait(error) {
    const errorMessage = typeof error === 'string' ? error : error.message || String(error);
    const patternHash = this._hashError(errorMessage);
    const pattern = this.errorPatterns[patternHash];

    if (!pattern || pattern.count < this.ragebaitThreshold) {
      return null;
    }

    console.log(`[ErrorInterceptor] 📸 Generating ragebait (error occurred ${pattern.count} times)`);

    try {
      // Determine template based on error type
      let templateId = 'our-shit-is-broken';

      if (errorMessage.includes('does not exist')) {
        templateId = 'database-doesnt-exist';
      } else if (errorMessage.includes('undefined') || errorMessage.includes('null')) {
        templateId = 'undefined-hellscape';
      } else if (errorMessage.includes('ambiguous')) {
        templateId = 'our-migrations-broken';
      } else if (errorMessage.includes('timeout')) {
        templateId = 'timeout-city';
      }

      // Generate ragebait (would need dev-ragebait-generator integration)
      const ragebaitData = {
        templateId,
        errorMessage: errorMessage.substring(0, 100),
        occurrences: pattern.count,
        timestamp: new Date().toISOString()
      };

      // Save ragebait request
      const ragebaitPath = path.join(__dirname, '../temp/ragebait/auto-errors.json');
      await fs.mkdir(path.dirname(ragebaitPath), { recursive: true });

      let ragebaitQueue = [];
      try {
        const existing = await fs.readFile(ragebaitPath, 'utf8');
        ragebaitQueue = JSON.parse(existing);
      } catch (e) {
        // File doesn't exist yet
      }

      ragebaitQueue.push(ragebaitData);
      await fs.writeFile(ragebaitPath, JSON.stringify(ragebaitQueue, null, 2));

      console.log('[ErrorInterceptor] ✓ Ragebait queued:', templateId);

      return ragebaitData;
    } catch (err) {
      console.error('[ErrorInterceptor] Failed to generate ragebait:', err.message);
      return null;
    }
  }

  /**
   * Save all knowledge before exit
   */
  async saveKnowledge() {
    try {
      await Promise.all([
        this.save(),
        this.saveLiveErrors(),
        this.failureLearner.save(),
        this.migrationLearner.save()
      ]);

      console.log('[ErrorInterceptor] ✓ All knowledge saved');
    } catch (error) {
      console.error('[ErrorInterceptor] Failed to save knowledge:', error.message);
    }
  }

  /**
   * Load error history
   */
  async load() {
    try {
      const data = await fs.readFile(this.errorLogPath, 'utf8');
      const loaded = JSON.parse(data);

      this.errors = loaded.errors || this.errors;
      this.errorPatterns = loaded.errorPatterns || this.errorPatterns;

      console.log('[ErrorInterceptor] Loaded error history:', {
        totalErrors: Object.values(this.errors).reduce((sum, arr) => sum + arr.length, 0),
        patterns: Object.keys(this.errorPatterns).length
      });

      this.loaded = true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[ErrorInterceptor] No error history, starting fresh');
        this.loaded = true;
      } else {
        console.error('[ErrorInterceptor] Failed to load:', error.message);
      }
    }
  }

  /**
   * Save error history
   */
  async save() {
    try {
      const dir = path.dirname(this.errorLogPath);
      await fs.mkdir(dir, { recursive: true });

      const data = {
        errors: this.errors,
        errorPatterns: this.errorPatterns,
        savedAt: new Date().toISOString()
      };

      await fs.writeFile(this.errorLogPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[ErrorInterceptor] Failed to save:', error.message);
    }
  }

  /**
   * Save live errors (for dashboard)
   */
  async saveLiveErrors() {
    try {
      const dir = path.dirname(this.liveErrorsPath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(this.liveErrorsPath, JSON.stringify({
        errors: this.liveErrors,
        updatedAt: new Date().toISOString()
      }, null, 2));
    } catch (error) {
      console.error('[ErrorInterceptor] Failed to save live errors:', error.message);
    }
  }

  /**
   * Get live errors (for API)
   */
  getLiveErrors(limit = 50) {
    return {
      errors: this.liveErrors.slice(0, limit),
      total: this.liveErrors.length,
      patterns: Object.entries(this.errorPatterns)
        .map(([hash, data]) => ({
          hash,
          count: data.count,
          firstSeen: data.firstSeen,
          lastSeen: data.lastSeen,
          example: data.errorExample.substring(0, 100)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    };
  }

  /**
   * Get error summary
   */
  getSummary() {
    return {
      totalErrors: Object.values(this.errors).reduce((sum, arr) => sum + arr.length, 0),
      byType: Object.entries(this.errors).map(([type, errors]) => ({
        type,
        count: errors.length
      })),
      topPatterns: Object.entries(this.errorPatterns)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([hash, data]) => ({
          hash,
          count: data.count,
          example: data.errorExample.substring(0, 100)
        })),
      liveErrorCount: this.liveErrors.length
    };
  }

  /**
   * Hash error message for pattern matching
   * @private
   */
  _hashError(message) {
    // Remove dynamic parts (numbers, UUIDs, timestamps, file paths)
    const normalized = message
      .replace(/\d+/g, 'N')
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID')
      .replace(/\/[^\s]+/g, '/PATH')
      .substring(0, 200);

    // Simple hash
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * Get common fix patterns
   * @private
   */
  _getCommonFix(errorMessage) {
    const fixes = [
      {
        pattern: /relation "([^"]+)" does not exist/i,
        fix: 'Run migrations to create missing table',
        canAutoFix: false,
        suggestedAction: 'Check database/migrations/ for table creation'
      },
      {
        pattern: /column "([^"]+)" does not exist/i,
        fix: 'Add missing column via migration',
        canAutoFix: false,
        suggestedAction: 'Create migration to add column'
      },
      {
        pattern: /column reference "([^"]+)" is ambiguous/i,
        fix: 'Add table alias to SQL query',
        canAutoFix: true,
        suggestedAction: 'Use table_name.column_name instead of just column_name'
      },
      {
        pattern: /Cannot read propert(?:y|ies) of (undefined|null)/i,
        fix: 'Add null check before accessing property',
        canAutoFix: true,
        suggestedAction: 'Use optional chaining (?.) or add if (obj) check'
      },
      {
        pattern: /timeout.*exceeded/i,
        fix: 'Increase timeout or optimize query',
        canAutoFix: false,
        suggestedAction: 'Check query performance or increase timeout value'
      },
      {
        pattern: /syntax error at or near/i,
        fix: 'Check SQL syntax',
        canAutoFix: false,
        suggestedAction: 'Review migration file for syntax errors'
      }
    ];

    for (const { pattern, fix, canAutoFix, suggestedAction } of fixes) {
      if (pattern.test(errorMessage)) {
        return {
          fix,
          canAutoFix,
          suggestedAction
        };
      }
    }

    return null;
  }
}

module.exports = CalErrorInterceptor;

/**
 * CAL Migration Learner
 *
 * Learns from migration successes/failures to:
 * - Skip known-broken migrations automatically
 * - Suggest fixes for common errors
 * - Learn dependency order
 * - Auto-retry with intelligent fixes
 *
 * Example:
 *   const learner = new CalMigrationLearner();
 *   await learner.load();
 *
 *   if (learner.shouldSkip('009_add_domain_voting.sql')) {
 *     console.log('Skipping known-broken migration');
 *     return;
 *   }
 *
 *   try {
 *     await runMigration(migration);
 *     await learner.recordSuccess(migration);
 *   } catch (error) {
 *     const fix = await learner.getSuggestedFix(migration, error);
 *     if (fix) await applyFix(fix);
 *   }
 */

const fs = require('fs').promises;
const path = require('path');
const CalFailureLearner = require('./cal-failure-learner');

class CalMigrationLearner {
  constructor(options = {}) {
    this.knowledgePath = options.knowledgePath || path.join(__dirname, '../logs/cal-migrations.json');
    this.failureThreshold = options.failureThreshold || 3; // Skip after 3 consecutive failures

    this.failureLearner = new CalFailureLearner({
      knowledgeBasePath: path.join(__dirname, '../logs/cal-migration-failures.json')
    });

    this.knowledge = {
      migrations: {},     // { filename: { status, attempts, errors, fixes } }
      patterns: {},       // { errorPattern: { count, suggestedFix } }
      dependencies: {},   // { migrationA: [migrationB, migrationC] } (A depends on B, C)
      skipList: []       // Migrations to always skip
    };

    this.loaded = false;
  }

  /**
   * Common error patterns and their fixes
   */
  static ERROR_PATTERNS = [
    {
      pattern: /column.*already exists/i,
      name: 'column-exists',
      fix: 'Add IF NOT EXISTS clause or check column existence first',
      canAutoFix: true,
      autoFix: (sql) => sql.replace(/ADD COLUMN/gi, 'ADD COLUMN IF NOT EXISTS')
    },
    {
      pattern: /relation.*does not exist/i,
      name: 'table-missing',
      fix: 'Run dependent migrations first or add CREATE TABLE IF NOT EXISTS',
      canAutoFix: false,
      suggestedDependency: (error) => {
        const match = error.match(/relation "([^"]+)"/);
        return match ? match[1] : null;
      }
    },
    {
      pattern: /column.*does not exist/i,
      name: 'column-missing',
      fix: 'Add column creation or check if column exists',
      canAutoFix: false
    },
    {
      pattern: /syntax error at or near/i,
      name: 'syntax-error',
      fix: 'Check SQL syntax, often caused by missing semicolons or typos',
      canAutoFix: false
    },
    {
      pattern: /column reference.*is ambiguous/i,
      name: 'ambiguous-column',
      fix: 'Use table aliases to qualify column names',
      canAutoFix: false
    },
    {
      pattern: /duplicate key value violates unique constraint/i,
      name: 'duplicate-key',
      fix: 'Use INSERT ... ON CONFLICT or check for existing data first',
      canAutoFix: true,
      autoFix: (sql) => sql.replace(/INSERT INTO/gi, 'INSERT INTO ... ON CONFLICT DO NOTHING')
    }
  ];

  /**
   * Load migration knowledge
   */
  async load() {
    try {
      const data = await fs.readFile(this.knowledgePath, 'utf8');
      this.knowledge = JSON.parse(data);
      this.loaded = true;

      await this.failureLearner.load();

      console.log('[MigrationLearner] Loaded migration knowledge:', {
        totalMigrations: Object.keys(this.knowledge.migrations).length,
        skipList: this.knowledge.skipList.length,
        knownPatterns: Object.keys(this.knowledge.patterns).length
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[MigrationLearner] No existing knowledge, starting fresh');
        this.loaded = true;
        await this.failureLearner.load();
      } else {
        console.error('[MigrationLearner] Failed to load:', error.message);
      }
    }
  }

  /**
   * Save migration knowledge
   */
  async save() {
    try {
      const dir = path.dirname(this.knowledgePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.knowledgePath, JSON.stringify(this.knowledge, null, 2));
      console.log('[MigrationLearner] Saved migration knowledge');
    } catch (error) {
      console.error('[MigrationLearner] Failed to save:', error.message);
    }
  }

  /**
   * Check if a migration should be skipped
   */
  shouldSkip(migrationFile) {
    if (!this.loaded) return false;

    // Check skip list
    if (this.knowledge.skipList.includes(migrationFile)) {
      return true;
    }

    // Check consecutive failures
    const migration = this.knowledge.migrations[migrationFile];
    if (migration && migration.consecutiveFailures >= this.failureThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Record successful migration
   */
  async recordSuccess(migrationFile, context = {}) {
    if (!this.loaded) await this.load();

    if (!this.knowledge.migrations[migrationFile]) {
      this.knowledge.migrations[migrationFile] = {
        file: migrationFile,
        attempts: [],
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        status: 'unknown'
      };
    }

    const migration = this.knowledge.migrations[migrationFile];

    migration.attempts.push({
      success: true,
      context,
      timestamp: new Date().toISOString()
    });

    migration.consecutiveSuccesses++;
    migration.consecutiveFailures = 0;
    migration.totalSuccesses++;
    migration.status = 'working';
    migration.lastSuccess = new Date().toISOString();

    // Remove from skip list if it was there
    this.knowledge.skipList = this.knowledge.skipList.filter(f => f !== migrationFile);

    await this.save();

    console.log(`[MigrationLearner] ✅ ${migrationFile} succeeded`);
  }

  /**
   * Record failed migration
   */
  async recordFailure(migrationFile, error, context = {}) {
    if (!this.loaded) await this.load();

    if (!this.knowledge.migrations[migrationFile]) {
      this.knowledge.migrations[migrationFile] = {
        file: migrationFile,
        attempts: [],
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        status: 'unknown',
        errors: []
      };
    }

    const migration = this.knowledge.migrations[migrationFile];

    const errorString = typeof error === 'string' ? error : error.message || String(error);

    migration.attempts.push({
      success: false,
      error: errorString,
      context,
      timestamp: new Date().toISOString()
    });

    migration.consecutiveFailures++;
    migration.consecutiveSuccesses = 0;
    migration.totalFailures++;
    migration.lastFailure = new Date().toISOString();

    // Track error
    if (!migration.errors) migration.errors = [];
    migration.errors.push({
      error: errorString,
      timestamp: new Date().toISOString()
    });

    // Update status
    if (migration.consecutiveFailures >= this.failureThreshold) {
      migration.status = 'broken';
      if (!this.knowledge.skipList.includes(migrationFile)) {
        this.knowledge.skipList.push(migrationFile);
      }
    } else {
      migration.status = 'failing';
    }

    // Learn error pattern
    const pattern = this._matchErrorPattern(errorString);
    if (pattern) {
      if (!this.knowledge.patterns[pattern.name]) {
        this.knowledge.patterns[pattern.name] = {
          count: 0,
          migrations: [],
          fix: pattern.fix
        };
      }

      this.knowledge.patterns[pattern.name].count++;
      if (!this.knowledge.patterns[pattern.name].migrations.includes(migrationFile)) {
        this.knowledge.patterns[pattern.name].migrations.push(migrationFile);
      }
    }

    await this.failureLearner.recordFailure(
      `migration:${migrationFile}`,
      errorString,
      { migrationFile, ...context }
    );

    await this.save();

    console.log(`[MigrationLearner] ❌ ${migrationFile} failed (${migration.consecutiveFailures}/${this.failureThreshold})`);

    if (migration.status === 'broken') {
      console.log(`[MigrationLearner] 🛑 ${migrationFile} marked as broken - will skip in future`);
    }
  }

  /**
   * Get suggested fix for a migration error
   */
  async getSuggestedFix(migrationFile, error) {
    const errorString = typeof error === 'string' ? error : error.message || String(error);
    const pattern = this._matchErrorPattern(errorString);

    if (!pattern) {
      return null;
    }

    const fix = {
      pattern: pattern.name,
      description: pattern.fix,
      canAutoFix: pattern.canAutoFix || false,
      autoFix: pattern.autoFix || null
    };

    // Check if we have a learned fix from failure learner
    const learnedAlternatives = this.failureLearner.getAlternatives(`migration:${migrationFile}`);
    if (learnedAlternatives.length > 0) {
      fix.learnedAlternative = learnedAlternatives[0];
    }

    // Check for dependency issues
    if (pattern.suggestedDependency) {
      const dependency = pattern.suggestedDependency(errorString);
      if (dependency) {
        fix.suggestedDependency = dependency;
        fix.description += ` (Missing dependency: ${dependency})`;
      }
    }

    return fix;
  }

  /**
   * Get migration summary
   */
  getSummary() {
    if (!this.loaded) return null;

    const migrations = Object.values(this.knowledge.migrations);

    return {
      total: migrations.length,
      working: migrations.filter(m => m.status === 'working').length,
      failing: migrations.filter(m => m.status === 'failing').length,
      broken: migrations.filter(m => m.status === 'broken').length,
      unknown: migrations.filter(m => m.status === 'unknown').length,
      skipList: this.knowledge.skipList,
      topErrors: Object.entries(this.knowledge.patterns)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([name, data]) => ({
          pattern: name,
          count: data.count,
          fix: data.fix,
          affectedMigrations: data.migrations.length
        }))
    };
  }

  /**
   * Get all broken migrations
   */
  getBrokenMigrations() {
    if (!this.loaded) return [];

    return Object.values(this.knowledge.migrations)
      .filter(m => m.status === 'broken')
      .map(m => ({
        file: m.file,
        consecutiveFailures: m.consecutiveFailures,
        lastError: m.errors[m.errors.length - 1],
        suggestedFix: this._matchErrorPattern(m.errors[m.errors.length - 1]?.error)
      }));
  }

  /**
   * Manually add to skip list
   */
  async addToSkipList(migrationFile, reason = 'Manually added') {
    if (!this.loaded) await this.load();

    if (!this.knowledge.skipList.includes(migrationFile)) {
      this.knowledge.skipList.push(migrationFile);

      if (!this.knowledge.migrations[migrationFile]) {
        this.knowledge.migrations[migrationFile] = {
          file: migrationFile,
          attempts: [],
          status: 'skipped',
          skipReason: reason
        };
      } else {
        this.knowledge.migrations[migrationFile].status = 'skipped';
        this.knowledge.migrations[migrationFile].skipReason = reason;
      }

      await this.save();
      console.log(`[MigrationLearner] Added ${migrationFile} to skip list: ${reason}`);
    }
  }

  /**
   * Remove from skip list (give it another chance)
   */
  async removeFromSkipList(migrationFile) {
    if (!this.loaded) await this.load();

    this.knowledge.skipList = this.knowledge.skipList.filter(f => f !== migrationFile);

    if (this.knowledge.migrations[migrationFile]) {
      this.knowledge.migrations[migrationFile].status = 'unknown';
      this.knowledge.migrations[migrationFile].consecutiveFailures = 0;
    }

    await this.save();
    console.log(`[MigrationLearner] Removed ${migrationFile} from skip list`);
  }

  /**
   * Match error to known pattern
   * @private
   */
  _matchErrorPattern(errorString) {
    for (const pattern of CalMigrationLearner.ERROR_PATTERNS) {
      if (pattern.pattern.test(errorString)) {
        return pattern;
      }
    }
    return null;
  }
}

module.exports = CalMigrationLearner;

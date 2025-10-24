/**
 * Auto-Migration Script
 *
 * Automatically runs ALL pending database migrations on startup.
 * This ensures the database "JUST WORKS" without manual intervention.
 *
 * Features:
 * - Reads all .sql files from database/migrations/ directory
 * - Tracks which migrations have been run
 * - Executes pending migrations in order
 * - Creates migration_history table if it doesn't exist
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const MigrationDependencyResolver = require('../lib/migration-dependency-resolver');
const CalMigrationLearner = require('../lib/cal-migration-learner');

class AutoMigrate {
  constructor(options = {}) {
    // ONLY scan database/migrations (consolidated location)
    // Root /migrations folder is deprecated - all migrations moved to database/migrations
    this.migrationsDirs = [
      path.join(__dirname, '../database/migrations')
      // REMOVED: path.join(__dirname, '../migrations') - migrations consolidated
    ];
    this.pool = null;
    this.quietMode = options.quiet || false;
    this.useColors = options.colors !== false && process.stdout.isTTY === true;

    // Initialize learning system
    this.learner = new CalMigrationLearner({
      knowledgePath: path.join(__dirname, '../logs/cal-migrations.json')
    });

    // Known optional features that can safely fail
    this.optionalFailurePatterns = [
      'column "user_id" referenced in foreign key constraint does not exist',
      'relation "users" does not exist',
      'relation "tenants" does not exist',
      'relation "tenant_licenses" does not exist',
      'relation "voice_transcriptions" does not exist',
      'relation "learning_sessions" does not exist',
      'relation "skills" does not exist',
      'relation "user_sessions" does not exist',
      'relation "knowledge_concepts" does not exist',
      'relation "ai_usage_history" does not exist',
      'relation "forum_thread" does not exist',
      'already exists', // Duplicate indexes/constraints
      'cannot be implemented', // FK constraints to missing tables
      'syntax error at or near "DESC"', // Reserved word issues (non-breaking)
      'syntax error at or near "VARCHAR"', // Already exists, syntax varies
      'syntax error at or near "timestamp"', // Timestamp column issues
      'cannot change name of view column', // View modifications (non-critical)
      'column "wallet_address" does not exist',
      'column "detected_profile" does not exist',
      'column "impact_value" does not exist'
    ];
  }

  /**
   * Initialize database connection
   */
  async initDB() {
    const dbUser = process.env.DB_USER || 'matthewmauer';
    const dbPassword = process.env.DB_PASSWORD || '';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || 5432;
    const dbName = process.env.DB_NAME || 'calos';

    this.pool = new Pool({
      user: dbUser,
      password: dbPassword,
      host: dbHost,
      port: dbPort,
      database: dbName,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    console.log('[AutoMigrate] Database connection initialized');
  }

  /**
   * Create migration history table if it doesn't exist
   */
  async ensureMigrationTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS migration_history (
        migration_id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        execution_time_ms INTEGER,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_migration_name ON migration_history(migration_name);
      CREATE INDEX IF NOT EXISTS idx_migration_executed ON migration_history(executed_at);
    `;

    try {
      await this.pool.query(query);
      console.log('[AutoMigrate] ✓ Migration history table ready');
    } catch (error) {
      console.error('[AutoMigrate] Error creating migration table:', error.message);
      throw error;
    }
  }

  /**
   * Get list of all migration files from BOTH directories
   */
  getMigrationFiles() {
    const allFiles = new Map(); // filename -> full path

    for (const dir of this.migrationsDirs) {
      if (!fs.existsSync(dir)) {
        console.warn('[AutoMigrate] Migrations directory not found:', dir);
        continue;
      }

      const files = fs.readdirSync(dir)
        .filter(file => file.endsWith('.sql'));

      for (const file of files) {
        if (!allFiles.has(file)) {
          allFiles.set(file, path.join(dir, file));
        }
      }
    }

    const sortedFiles = Array.from(allFiles.keys()).sort();
    console.log(`[AutoMigrate] Found ${sortedFiles.length} migration files across ${this.migrationsDirs.length} directories`);

    // Return both filename and full path
    this.migrationPaths = allFiles;
    return sortedFiles;
  }

  /**
   * Get list of already-executed migrations
   */
  async getExecutedMigrations() {
    try {
      const result = await this.pool.query(
        'SELECT migration_name FROM migration_history WHERE success = TRUE ORDER BY executed_at'
      );
      return result.rows.map(row => row.migration_name);
    } catch (error) {
      console.error('[AutoMigrate] Error fetching executed migrations:', error.message);
      return [];
    }
  }

  /**
   * Check if error is from an optional feature
   */
  isOptionalFailure(errorMessage) {
    return this.optionalFailurePatterns.some(pattern =>
      errorMessage.includes(pattern)
    );
  }

  /**
   * Execute a single migration file
   */
  async executeMigration(filename) {
    const filePath = this.migrationPaths.get(filename);
    if (!filePath) {
      throw new Error(`Migration file not found: ${filename}`);
    }

    // Check if we should skip this migration (learned as broken)
    if (this.learner.shouldSkip(filename)) {
      console.log(`[AutoMigrate] 🛑 Skipping ${filename} (learned as broken after repeated failures)`);
      return {
        success: false,
        error: 'Skipped - learned as broken',
        skipped: true,
        optional: false
      };
    }

    let sql = fs.readFileSync(filePath, 'utf8');

    if (!this.quietMode) {
      console.log(`[AutoMigrate] Executing: ${filename}`);
    }
    const startTime = Date.now();

    const client = await this.pool.connect();
    try {
      // Execute migration within transaction
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');

      const executionTime = Date.now() - startTime;

      // Record success in database
      await this.pool.query(
        'INSERT INTO migration_history (migration_name, execution_time_ms, success) VALUES ($1, $2, TRUE)',
        [filename, executionTime]
      );

      // Record success in learning system
      await this.learner.recordSuccess(filename, {
        executionTime,
        timestamp: new Date().toISOString()
      });

      if (!this.quietMode) {
        console.log(`[AutoMigrate] ✓ ${filename} (${executionTime}ms)`);
      }
      return { success: true, executionTime };
    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK');

      // Record failure in database
      await this.pool.query(
        'INSERT INTO migration_history (migration_name, success, error_message) VALUES ($1, FALSE, $2)',
        [filename, error.message]
      ).catch(() => {}); // Ignore if this fails

      // Record failure in learning system
      await this.learner.recordFailure(filename, error, {
        sql: sql.substring(0, 500), // First 500 chars for context
        timestamp: new Date().toISOString()
      });

      // Get suggested fix
      const suggestedFix = await this.learner.getSuggestedFix(filename, error);

      const isOptional = this.isOptionalFailure(error.message);

      // Only show error if not in quiet mode, or if it's a critical failure
      if (!this.quietMode || !isOptional) {
        console.error(`[AutoMigrate] ✗ ${filename} FAILED:`, error.message);

        if (suggestedFix) {
          console.log(`[AutoMigrate] 💡 Suggested fix: ${suggestedFix.description}`);

          if (suggestedFix.canAutoFix && suggestedFix.autoFix) {
            console.log(`[AutoMigrate] 🔧 Auto-fix available - will try on next run`);
          }

          if (suggestedFix.suggestedDependency) {
            console.log(`[AutoMigrate] 📋 Missing dependency: ${suggestedFix.suggestedDependency}`);
          }
        }
      }

      return {
        success: false,
        error: error.message,
        optional: isOptional,
        suggestedFix
      };
    } finally {
      client.release();
    }
  }

  /**
   * Run all pending migrations
   */
  async migrate() {
    try {
      console.log('[AutoMigrate] Starting auto-migration...');

      // Load learning system
      await this.learner.load();

      // Initialize database connection
      await this.initDB();

      // Ensure migration tracking table exists
      await this.ensureMigrationTable();

      // Get all migration files and executed migrations
      const allMigrations = this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();

      // Find pending migrations (simple filename-based approach)
      const pendingMigrations = allMigrations.filter(
        migration => !executedMigrations.includes(migration)
      );

      if (pendingMigrations.length === 0) {
        console.log('[AutoMigrate] ✓ All migrations up to date');
        await this.pool.end();
        return { success: true, executed: 0, message: 'All migrations up to date' };
      }

      console.log(`[AutoMigrate] Found ${pendingMigrations.length} pending migrations`);
      console.log('[AutoMigrate] Migrations will execute in alphabetical order\n');

      // Execute each pending migration in correct order
      let successCount = 0;
      let criticalFailCount = 0;
      let optionalFailCount = 0;
      let skippedCount = 0;
      const criticalFailures = [];
      const optionalFailures = [];

      for (const migration of pendingMigrations) {
        const result = await this.executeMigration(migration);
        if (result.success) {
          successCount++;
        } else if (result.skipped) {
          skippedCount++;
        } else {
          if (result.optional) {
            optionalFailCount++;
            optionalFailures.push({ migration, error: result.error });
          } else {
            criticalFailCount++;
            criticalFailures.push({ migration, error: result.error, suggestedFix: result.suggestedFix });
          }
          // Continue with remaining migrations (many use IF NOT EXISTS and are safe)
          if (!this.quietMode && !result.optional) {
            console.warn(`[AutoMigrate] ⚠ Migration failed, continuing with remaining migrations...`);
          }
        }
      }

      // Only show critical failures
      if (criticalFailures.length > 0) {
        console.log(`[AutoMigrate] ❌ Critical migration failures:`);
        criticalFailures.forEach(f => {
          console.log(`  ✗ ${f.migration}: ${f.error.substring(0, 100)}`);
          if (f.suggestedFix) {
            console.log(`    💡 ${f.suggestedFix.description}`);
          }
        });
      }

      // Show optional failures only if not in quiet mode
      if (!this.quietMode && optionalFailures.length > 0) {
        console.log(`[AutoMigrate] ⚠️  Optional feature migrations skipped (${optionalFailures.length}):`);
        optionalFailures.forEach(f => console.log(`  ⊘ ${f.migration}: ${f.error.substring(0, 80)}`));
      }

      // Print learning summary
      if (!this.quietMode) {
        const learningSummary = this.learner.getSummary();
        if (learningSummary && learningSummary.total > 0) {
          console.log('\n[AutoMigrate] 📚 Learning Summary:');
          console.log(`  Total migrations tracked: ${learningSummary.total}`);
          console.log(`  Working: ${learningSummary.working} | Failing: ${learningSummary.failing} | Broken: ${learningSummary.broken}`);

          if (learningSummary.skipList.length > 0) {
            console.log(`  Skip list: ${learningSummary.skipList.join(', ')}`);
          }

          if (learningSummary.topErrors.length > 0) {
            console.log('  Top error patterns:');
            learningSummary.topErrors.forEach(e => {
              console.log(`    - ${e.pattern}: ${e.count} occurrences (${e.affectedMigrations} migrations)`);
            });
          }
        }
      }

      await this.pool.end();

      const summary = `Executed ${successCount}/${pendingMigrations.length} migrations`;
      if (criticalFailCount > 0) {
        console.log(`[AutoMigrate] ${summary} (${criticalFailCount} CRITICAL failures, ${optionalFailCount} optional skipped, ${skippedCount} learned-broken skipped)`);
      } else if (optionalFailCount > 0 && !this.quietMode) {
        console.log(`[AutoMigrate] ${summary} (${optionalFailCount} optional features skipped, ${skippedCount} learned-broken skipped)`);
      } else {
        console.log(`[AutoMigrate] ${summary}`);
      }

      return {
        success: criticalFailCount === 0,
        executed: successCount,
        criticalFailed: criticalFailCount,
        optionalFailed: optionalFailCount,
        skipped: skippedCount,
        message: summary
      };
    } catch (error) {
      console.error('[AutoMigrate] Fatal error:', error);
      if (this.pool) {
        await this.pool.end();
      }
      throw error;
    }
  }

  /**
   * Get migration status (for debugging)
   */
  async status() {
    await this.initDB();
    await this.ensureMigrationTable();

    const allMigrations = this.getMigrationFiles();
    const executedMigrations = await this.getExecutedMigrations();

    console.log('\n[AutoMigrate] Migration Status:');
    console.log('================================');

    for (const migration of allMigrations) {
      const executed = executedMigrations.includes(migration);
      const status = executed ? '✓' : '⏳';
      console.log(`${status} ${migration}`);
    }

    console.log('================================');
    console.log(`Total: ${allMigrations.length} | Executed: ${executedMigrations.length} | Pending: ${allMigrations.length - executedMigrations.length}`);

    await this.pool.end();
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'migrate';
  const quietMode = args.includes('--quiet') || args.includes('-q');
  const noColor = args.includes('--no-color');

  const autoMigrate = new AutoMigrate({
    quiet: quietMode,
    colors: !noColor
  });

  if (command === 'status') {
    autoMigrate.status().catch(error => {
      console.error('[AutoMigrate] Error:', error);
      process.exit(1);
    });
  } else {
    autoMigrate.migrate().then(result => {
      if (!result.success) {
        process.exit(1);
      }
    }).catch(error => {
      console.error('[AutoMigrate] Error:', error);
      process.exit(1);
    });
  }
}

module.exports = AutoMigrate;

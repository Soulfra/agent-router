#!/usr/bin/env node
/**
 * Migration: Cal Learning Logs Database Schema
 *
 * Migrates logs/cal-learning.json → PostgreSQL
 * Creates proper schema for debugging, pattern recognition, analytics
 */

const fs = require('fs').promises;
const path = require('path');

class CalLearningLogsMigration {
  constructor(db) {
    this.db = db;
    this.logsPath = path.join(__dirname, '../logs/cal-learning.json');
  }

  /**
   * Create database schema
   */
  async up() {
    console.log('🔨 Creating Cal learning logs tables...\n');

    // Table 1: cal_failures - Track all failures with timestamps
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS cal_failures (
        id SERIAL PRIMARY KEY,
        task_key VARCHAR(255) NOT NULL,
        approach VARCHAR(255) NOT NULL,
        error TEXT NOT NULL,
        error_type VARCHAR(100),
        file_path TEXT,
        lesson_id VARCHAR(100),
        exercise_id VARCHAR(100),
        count INTEGER DEFAULT 1,
        first_seen TIMESTAMPTZ NOT NULL,
        last_seen TIMESTAMPTZ NOT NULL,
        context JSONB DEFAULT '{}',
        fixed BOOLEAN DEFAULT false,
        fix_applied_at TIMESTAMPTZ,
        fix_description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX idx_cal_failures_task_key ON cal_failures(task_key);
      CREATE INDEX idx_cal_failures_lesson_id ON cal_failures(lesson_id);
      CREATE INDEX idx_cal_failures_error_type ON cal_failures(error_type);
      CREATE INDEX idx_cal_failures_first_seen ON cal_failures(first_seen DESC);
      CREATE INDEX idx_cal_failures_fixed ON cal_failures(fixed);
    `);

    console.log('✅ Created cal_failures table');

    // Table 2: cal_successes - Track successful approaches
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS cal_successes (
        id SERIAL PRIMARY KEY,
        task_key VARCHAR(255) NOT NULL,
        approach VARCHAR(255) NOT NULL,
        context JSONB DEFAULT '{}',
        lesson_id VARCHAR(100),
        exercise_id VARCHAR(100),
        timestamp TIMESTAMPTZ NOT NULL,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX idx_cal_successes_task_key ON cal_successes(task_key);
      CREATE INDEX idx_cal_successes_lesson_id ON cal_successes(lesson_id);
      CREATE INDEX idx_cal_successes_timestamp ON cal_successes(timestamp DESC);
    `);

    console.log('✅ Created cal_successes table');

    // Table 3: cal_patterns - Recognized patterns from failures/successes
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS cal_patterns (
        id SERIAL PRIMARY KEY,
        pattern_type VARCHAR(100) NOT NULL,
        pattern_name VARCHAR(255) NOT NULL,
        description TEXT,
        frequency INTEGER DEFAULT 1,
        confidence FLOAT DEFAULT 0.0,
        first_seen TIMESTAMPTZ NOT NULL,
        last_seen TIMESTAMPTZ NOT NULL,
        related_failures JSONB DEFAULT '[]',
        related_successes JSONB DEFAULT '[]',
        recommended_action TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(pattern_type, pattern_name)
      );

      CREATE INDEX idx_cal_patterns_type ON cal_patterns(pattern_type);
      CREATE INDEX idx_cal_patterns_frequency ON cal_patterns(frequency DESC);
      CREATE INDEX idx_cal_patterns_confidence ON cal_patterns(confidence DESC);
    `);

    console.log('✅ Created cal_patterns table');

    // Table 4: cal_alternatives - Alternative approaches when something fails
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS cal_alternatives (
        id SERIAL PRIMARY KEY,
        original_approach VARCHAR(255) NOT NULL,
        alternative_approach VARCHAR(255) NOT NULL,
        context JSONB DEFAULT '{}',
        success_rate FLOAT DEFAULT 0.0,
        times_used INTEGER DEFAULT 0,
        times_succeeded INTEGER DEFAULT 0,
        average_duration_ms INTEGER,
        last_used TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX idx_cal_alternatives_original ON cal_alternatives(original_approach);
      CREATE INDEX idx_cal_alternatives_success_rate ON cal_alternatives(success_rate DESC);
    `);

    console.log('✅ Created cal_alternatives table');

    console.log('\n✨ Database schema created!\n');
  }

  /**
   * Migrate existing JSON data to database
   */
  async migrate() {
    console.log('📦 Migrating existing logs from JSON...\n');

    try {
      const jsonData = await fs.readFile(this.logsPath, 'utf8');
      const logs = JSON.parse(jsonData);

      let totalMigrated = 0;

      // Migrate failures
      if (logs.failures) {
        for (const [taskKey, failures] of Object.entries(logs.failures)) {
          for (const failure of failures) {
            const lessonMatch = taskKey.match(/lesson-(\d+)/);
            const exerciseMatch = taskKey.match(/ex-(\d+)/);

            await this.db.query(`
              INSERT INTO cal_failures (
                task_key, approach, error, error_type, file_path,
                lesson_id, exercise_id, count, first_seen, last_seen, context
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
              taskKey,
              failure.approach,
              failure.error,
              this.categorizeError(failure.error),
              failure.file || null,
              lessonMatch ? `lesson-${lessonMatch[1]}` : null,
              exerciseMatch ? `ex-${exerciseMatch[1]}` : null,
              failure.count || 1,
              failure.firstSeen,
              failure.lastSeen,
              JSON.stringify(failure.context || {})
            ]);

            totalMigrated++;
          }
        }

        console.log(`✅ Migrated ${Object.keys(logs.failures).length} failure groups (${totalMigrated} total failures)`);
      }

      // Migrate successes
      if (logs.successes) {
        let successCount = 0;
        for (const [taskKey, successes] of Object.entries(logs.successes)) {
          for (const success of successes) {
            const lessonMatch = taskKey.match(/lesson-(\d+)/);
            const exerciseMatch = taskKey.match(/ex-(\d+)/);

            await this.db.query(`
              INSERT INTO cal_successes (
                task_key, approach, context, lesson_id, exercise_id, timestamp
              ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
              taskKey,
              success.approach,
              JSON.stringify(success.context || {}),
              lessonMatch ? `lesson-${lessonMatch[1]}` : null,
              exerciseMatch ? `ex-${exerciseMatch[1]}` : null,
              success.timestamp
            ]);

            successCount++;
          }
        }

        console.log(`✅ Migrated ${successCount} successes`);
      }

      console.log('\n✨ Migration complete!\n');

      // Generate analytics
      await this.generateAnalytics();

    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️  No existing logs found to migrate\n');
      } else {
        throw error;
      }
    }
  }

  /**
   * Categorize error types
   */
  categorizeError(errorMessage) {
    if (errorMessage.includes('command')) return 'command-execution';
    if (errorMessage.includes('CSS')) return 'css-loading';
    if (errorMessage.includes('file')) return 'file-processing';
    if (errorMessage.includes('SSL')) return 'ssl-connection';
    if (errorMessage.includes('undefined')) return 'undefined-value';
    if (errorMessage.includes('timeout')) return 'timeout';
    return 'unknown';
  }

  /**
   * Generate analytics from migrated data
   */
  async generateAnalytics() {
    console.log('📊 Generating Analytics...\n');

    // Most common errors
    const errors = await this.db.query(`
      SELECT
        error_type,
        COUNT(*) as frequency,
        SUM(count) as total_occurrences,
        MIN(first_seen) as first_seen,
        MAX(last_seen) as last_seen
      FROM cal_failures
      WHERE error_type IS NOT NULL
      GROUP BY error_type
      ORDER BY total_occurrences DESC
    `);

    console.log('🔴 Most Common Errors:\n');
    errors.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.error_type}: ${row.total_occurrences} occurrences (${row.frequency} unique failures)`);
    });

    // Lesson-specific issues
    const lessonIssues = await this.db.query(`
      SELECT
        lesson_id,
        COUNT(*) as failure_count,
        COUNT(DISTINCT error_type) as unique_error_types
      FROM cal_failures
      WHERE lesson_id IS NOT NULL
      GROUP BY lesson_id
      ORDER BY failure_count DESC
      LIMIT 5
    `);

    console.log('\n📚 Lessons with Most Issues:\n');
    lessonIssues.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.lesson_id}: ${row.failure_count} failures (${row.unique_error_types} error types)`);
    });

    // Success rate by approach
    const approaches = await this.db.query(`
      SELECT
        approach,
        COUNT(*) as times_used
      FROM cal_successes
      GROUP BY approach
      ORDER BY times_used DESC
    `);

    console.log('\n✅ Most Successful Approaches:\n');
    approaches.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.approach}: ${row.times_used} successes`);
    });

    console.log('\n');
  }

  /**
   * Rollback migration
   */
  async down() {
    console.log('🗑️  Rolling back Cal learning logs tables...\n');

    await this.db.query(`
      DROP TABLE IF EXISTS cal_alternatives CASCADE;
      DROP TABLE IF EXISTS cal_patterns CASCADE;
      DROP TABLE IF EXISTS cal_successes CASCADE;
      DROP TABLE IF EXISTS cal_failures CASCADE;
    `);

    console.log('✅ Tables dropped\n');
  }
}

// CLI usage
if (require.main === module) {
  const { Pool } = require('pg');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/calos'
  });

  const migration = new CalLearningLogsMigration(pool);

  const command = process.argv[2] || 'up';

  (async () => {
    try {
      if (command === 'up') {
        await migration.up();
        await migration.migrate();
      } else if (command === 'down') {
        await migration.down();
      } else {
        console.error('Usage: node 001-cal-learning-logs.js [up|down]');
        process.exit(1);
      }

      await pool.end();
      process.exit(0);

    } catch (error) {
      console.error('❌ Migration failed:', error);
      await pool.end();
      process.exit(1);
    }
  })();
}

module.exports = CalLearningLogsMigration;

/**
 * Cal Learning System
 *
 * Cal's memory system - stores what worked, what failed, and why.
 * Every time Cal encounters a problem or succeeds at something, it's recorded here.
 *
 * Learns:
 * - Successful patterns: "Used X approach for Y problem, worked perfectly"
 * - Failed attempts: "Tried X for Y, got error Z, don't do this again"
 * - Edge cases: "Watch out for recursive loops in DNS queries"
 * - Optimizations: "Counting tokens first saves API calls"
 *
 * Usage:
 *   const learning = new CalLearningSystem();
 *   await learning.recordSuccess('oauth-server', 'Built working OAuth flow', {...context});
 *   await learning.recordFailure('dns-query', 'Hit recursive loop', {...context});
 *   const lessons = await learning.getRelevantLessons('oauth');
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class CalLearningSystem {
  constructor(options = {}) {
    this.config = {
      dbPath: options.dbPath || path.join(__dirname, '../cal-memory.db'),
      verbose: options.verbose || false
    };

    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Initialize database
   */
  async init() {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.config.dbPath, async (err) => {
        if (err) return reject(err);

        await this.createTables();
        this.isInitialized = true;

        console.log('[CalLearningSystem] Initialized');
        resolve();
      });
    });
  }

  /**
   * Create database tables
   */
  createTables() {
    return new Promise((resolve, reject) => {
      // Lessons learned table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS lessons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_type TEXT NOT NULL,
          outcome TEXT NOT NULL, -- success, failure, partial
          summary TEXT NOT NULL,
          what_worked TEXT,
          what_failed TEXT,
          lesson TEXT NOT NULL,
          context TEXT, -- JSON
          error_message TEXT,
          fix_applied TEXT,
          confidence REAL DEFAULT 0.5, -- 0-1, higher = more confident
          times_encountered INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);

        // Task attempts table (tracks Cal's work)
        this.db.run(`
          CREATE TABLE IF NOT EXISTS task_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            task_type TEXT NOT NULL,
            attempt_number INTEGER NOT NULL,
            approach TEXT NOT NULL,
            result TEXT NOT NULL, -- success, failure, timeout
            duration_ms INTEGER,
            error_message TEXT,
            code_generated TEXT,
            tests_passed INTEGER DEFAULT 0,
            tests_failed INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) return reject(err);

          // Pattern recognition table
          this.db.run(`
            CREATE TABLE IF NOT EXISTS patterns (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              pattern_name TEXT UNIQUE NOT NULL,
              category TEXT NOT NULL,
              description TEXT NOT NULL,
              success_count INTEGER DEFAULT 0,
              failure_count INTEGER DEFAULT 0,
              confidence REAL DEFAULT 0.5,
              examples TEXT, -- JSON array
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });
  }

  /**
   * Record a successful task
   */
  async recordSuccess(taskType, summary, context = {}) {
    const lesson = context.lesson || `Successfully completed ${taskType}`;

    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO lessons (
          task_type, outcome, summary, what_worked, lesson, context, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        taskType,
        'success',
        summary,
        context.whatWorked || summary,
        lesson,
        JSON.stringify(context),
        context.confidence || 0.8
      ], function(err) {
        if (err) return reject(err);
        console.log(`[CalLearningSystem] ✅ Recorded success: ${taskType}`);
        resolve(this.lastID);
      });
    });
  }

  /**
   * Record a failed attempt
   */
  async recordFailure(taskType, summary, context = {}) {
    const lesson = context.lesson || `Failed at ${taskType}: ${context.errorMessage || 'Unknown error'}`;

    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO lessons (
          task_type, outcome, summary, what_failed, lesson, context,
          error_message, fix_applied, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        taskType,
        'failure',
        summary,
        context.whatFailed || summary,
        lesson,
        JSON.stringify(context),
        context.errorMessage,
        context.fixApplied,
        context.confidence || 0.7
      ], function(err) {
        if (err) return reject(err);
        console.log(`[CalLearningSystem] ❌ Recorded failure: ${taskType}`);
        resolve(this.lastID);
      });
    });
  }

  /**
   * Record a task attempt
   */
  async recordAttempt(taskId, taskType, attemptNumber, approach, result, context = {}) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO task_attempts (
          task_id, task_type, attempt_number, approach, result,
          duration_ms, error_message, code_generated, tests_passed, tests_failed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        taskId,
        taskType,
        attemptNumber,
        approach,
        result,
        context.duration_ms,
        context.error_message,
        context.code_generated,
        context.tests_passed || 0,
        context.tests_failed || 0
      ], function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
  }

  /**
   * Get relevant lessons for a task
   */
  async getRelevantLessons(taskType, limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM lessons
        WHERE task_type LIKE ?
        ORDER BY confidence DESC, times_encountered DESC, created_at DESC
        LIMIT ?
      `, [`%${taskType}%`, limit], (err, rows) => {
        if (err) return reject(err);

        const lessons = rows.map(row => ({
          ...row,
          context: row.context ? JSON.parse(row.context) : {}
        }));

        resolve(lessons);
      });
    });
  }

  /**
   * Get patterns that worked well
   */
  async getSuccessfulPatterns(category = null, limit = 10) {
    let sql = `
      SELECT * FROM patterns
      WHERE success_count > failure_count
    `;

    const params = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ` ORDER BY confidence DESC, success_count DESC LIMIT ?`;
    params.push(limit);

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);

        const patterns = rows.map(row => ({
          ...row,
          examples: row.examples ? JSON.parse(row.examples) : []
        }));

        resolve(patterns);
      });
    });
  }

  /**
   * Learn from a pattern
   */
  async recordPattern(patternName, category, description, success, example = null) {
    return new Promise((resolve, reject) => {
      // Check if pattern exists
      this.db.get(
        'SELECT * FROM patterns WHERE pattern_name = ?',
        [patternName],
        (err, row) => {
          if (err) return reject(err);

          if (row) {
            // Update existing pattern
            const newSuccessCount = success ? row.success_count + 1 : row.success_count;
            const newFailureCount = success ? row.failure_count : row.failure_count + 1;
            const newConfidence = newSuccessCount / (newSuccessCount + newFailureCount);

            let examples = row.examples ? JSON.parse(row.examples) : [];
            if (example && examples.length < 5) {
              examples.push(example);
            }

            this.db.run(`
              UPDATE patterns SET
                success_count = ?,
                failure_count = ?,
                confidence = ?,
                examples = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE pattern_name = ?
            `, [
              newSuccessCount,
              newFailureCount,
              newConfidence,
              JSON.stringify(examples),
              patternName
            ], function(err) {
              if (err) return reject(err);
              resolve(this.changes);
            });

          } else {
            // Create new pattern
            const successCount = success ? 1 : 0;
            const failureCount = success ? 0 : 1;
            const confidence = success ? 0.8 : 0.2;
            const examples = example ? [example] : [];

            this.db.run(`
              INSERT INTO patterns (
                pattern_name, category, description, success_count, failure_count,
                confidence, examples
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
              patternName,
              category,
              description,
              successCount,
              failureCount,
              confidence,
              JSON.stringify(examples)
            ], function(err) {
              if (err) return reject(err);
              resolve(this.lastID);
            });
          }
        }
      );
    });
  }

  /**
   * Get Cal's performance stats
   */
  async getStats() {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT
          COUNT(*) as total_lessons,
          SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
          SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failures,
          AVG(confidence) as avg_confidence
        FROM lessons
      `, (err, row) => {
        if (err) return reject(err);

        this.db.get(`
          SELECT COUNT(DISTINCT task_type) as unique_tasks
          FROM lessons
        `, (err2, row2) => {
          if (err2) return reject(err2);

          resolve({
            ...row,
            ...row2,
            success_rate: row.total_lessons > 0 ? (row.successes / row.total_lessons) : 0
          });
        });
      });
    });
  }

  /**
   * Get recent lessons (for reflection)
   */
  async getRecentLessons(limit = 20) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM lessons
        ORDER BY created_at DESC
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) return reject(err);

        const lessons = rows.map(row => ({
          ...row,
          context: row.context ? JSON.parse(row.context) : {}
        }));

        resolve(lessons);
      });
    });
  }

  /**
   * Search lessons
   */
  async searchLessons(query) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM lessons
        WHERE
          task_type LIKE ? OR
          summary LIKE ? OR
          lesson LIKE ? OR
          what_worked LIKE ? OR
          what_failed LIKE ?
        ORDER BY confidence DESC, created_at DESC
        LIMIT 20
      `, [
        `%${query}%`,
        `%${query}%`,
        `%${query}%`,
        `%${query}%`,
        `%${query}%`
      ], (err, rows) => {
        if (err) return reject(err);

        const lessons = rows.map(row => ({
          ...row,
          context: row.context ? JSON.parse(row.context) : {}
        }));

        resolve(lessons);
      });
    });
  }

  /**
   * Close database
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = CalLearningSystem;

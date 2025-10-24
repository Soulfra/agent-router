/**
 * CALOS Learning API Debugger
 *
 * Diagnoses "failed to fetch" errors and teaches you how to fix them.
 *
 * Usage:
 *   node scripts/debug-learning-api.js
 *
 * What it checks:
 * - Server is running
 * - Database connection works
 * - Required tables exist
 * - API endpoints respond correctly
 * - Data is seeded
 *
 * Provides clear fixes for each error found.
 */

const { Pool } = require('pg');
const fetch = require('node-fetch');

const API_BASE = process.env.API_BASE || 'http://localhost:5001';
const DB_URL = process.env.DATABASE_URL || 'postgresql://matthewmauer@localhost:5432/calos';

const REQUIRED_TABLES = [
  'learning_paths',
  'lessons',
  'user_progress',
  'lesson_completions',
  'achievements',
  'user_achievements',
  'mini_games',
  'mini_game_attempts'
];

const REQUIRED_ENDPOINTS = [
  { method: 'GET', path: '/api/learning/paths', description: 'Get all learning paths' },
  { method: 'GET', path: '/api/learning/paths/calriven', description: 'Get CalRiven path' },
  { method: 'GET', path: '/api/learning/next-lesson/test_user/calriven', description: 'Get next lesson' },
  { method: 'GET', path: '/api/learning/progress/test_user/calriven', description: 'Get user progress' }
];

class LearningAPIDebugger {
  constructor() {
    this.db = new Pool({ connectionString: DB_URL });
    this.errors = [];
    this.warnings = [];
    this.successes = [];
  }

  /**
   * Main debug routine
   */
  async debug() {
    console.log('\n🔍 CALOS Learning API Debugger\n');
    console.log('='.repeat(60));

    await this.checkServer();
    await this.checkDatabase();
    await this.checkTables();
    await this.checkEndpoints();
    await this.checkData();

    this.printSummary();
    this.printFixes();

    await this.db.end();
  }

  /**
   * Check if server is running
   */
  async checkServer() {
    process.stdout.write('Checking server... ');

    try {
      const response = await fetch(`${API_BASE}/health`, { timeout: 2000 });

      if (response.ok) {
        this.success(`Server is running on ${API_BASE}`);
      } else {
        this.error(`Server returned HTTP ${response.status}`, {
          fix: `Check server logs for errors:\n  tail -f logs/server.log`,
          command: 'npm start'
        });
      }
    } catch (error) {
      this.error(`Server is not responding at ${API_BASE}`, {
        fix: `Start the server:\n  npm start\n\nOr check if it's running on a different port:\n  lsof -i :5001`,
        command: 'npm start'
      });
    }
  }

  /**
   * Check database connection
   */
  async checkDatabase() {
    process.stdout.write('Checking database... ');

    try {
      await this.db.query('SELECT 1');
      this.success(`Database connected: ${DB_URL.split('@')[1]}`);
    } catch (error) {
      this.error(`Database connection failed`, {
        fix: `Check PostgreSQL is running:\n  brew services list | grep postgresql\n\nOr start it:\n  brew services start postgresql`,
        command: 'brew services start postgresql',
        error: error.message
      });
    }
  }

  /**
   * Check required tables exist
   */
  async checkTables() {
    process.stdout.write('Checking tables... ');

    const missingTables = [];

    for (const tableName of REQUIRED_TABLES) {
      try {
        await this.db.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
      } catch (error) {
        missingTables.push(tableName);
      }
    }

    if (missingTables.length === 0) {
      this.success(`All ${REQUIRED_TABLES.length} required tables exist`);
    } else {
      this.error(`Missing ${missingTables.length} tables: ${missingTables.join(', ')}`, {
        fix: `Run the migration to create tables:\n  psql $DATABASE_URL -f migrations/020_learning_platform.sql\n\nOr use auto-migrate:\n  npm run migrate`,
        command: 'npm run migrate',
        tables: missingTables
      });
    }
  }

  /**
   * Check API endpoints
   */
  async checkEndpoints() {
    console.log('\nChecking API endpoints...');

    for (const endpoint of REQUIRED_ENDPOINTS) {
      process.stdout.write(`  ${endpoint.method} ${endpoint.path}... `);

      try {
        const response = await fetch(`${API_BASE}${endpoint.path}`, {
          method: endpoint.method,
          timeout: 3000
        });

        const data = await response.json();

        if (response.ok && data.success !== false) {
          console.log('✅');
          this.successes.push(`${endpoint.method} ${endpoint.path}`);
        } else {
          console.log('❌');
          this.error(`${endpoint.method} ${endpoint.path} returned error`, {
            fix: `Check server logs for details`,
            response: data,
            status: response.status
          });
        }
      } catch (error) {
        console.log('❌');
        this.error(`${endpoint.method} ${endpoint.path} failed`, {
          fix: `Ensure server is running and routes are mounted in router.js`,
          error: error.message
        });
      }
    }
  }

  /**
   * Check if data is seeded
   */
  async checkData() {
    process.stdout.write('Checking seeded data... ');

    try {
      const pathsResult = await this.db.query('SELECT COUNT(*) FROM learning_paths');
      const pathCount = parseInt(pathsResult.rows[0].count);

      const lessonsResult = await this.db.query('SELECT COUNT(*) FROM lessons');
      const lessonCount = parseInt(lessonsResult.rows[0].count);

      if (pathCount === 0) {
        this.warning('No learning paths seeded', {
          fix: `Seed learning paths:\n  node scripts/seed-learning-paths.js\n\nOr import from repo-builder:\n  node agents/repo-builder-agent.js --status`,
          command: 'node scripts/seed-learning-paths.js'
        });
      } else {
        this.success(`${pathCount} learning paths, ${lessonCount} lessons seeded`);
      }
    } catch (error) {
      // Table doesn't exist, already caught in checkTables
    }
  }

  /**
   * Log success
   */
  success(message) {
    console.log('✅');
    this.successes.push(message);
  }

  /**
   * Log warning
   */
  warning(message, details) {
    console.log('⚠️');
    this.warnings.push({ message, details });
  }

  /**
   * Log error
   */
  error(message, details) {
    console.log('❌');
    this.errors.push({ message, details });
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary\n');

    console.log(`✅ ${this.successes.length} checks passed`);
    console.log(`⚠️  ${this.warnings.length} warnings`);
    console.log(`❌ ${this.errors.length} errors`);

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('\n🎉 All checks passed! API is working correctly.\n');
      console.log('Test the learning hub:');
      console.log(`  https://soulfra.github.io/learn/\n`);
    }
  }

  /**
   * Print fixes
   */
  printFixes() {
    if (this.errors.length === 0 && this.warnings.length === 0) return;

    console.log('\n' + '='.repeat(60));
    console.log('🛠️  How to Fix\n');

    // Errors
    if (this.errors.length > 0) {
      console.log('ERRORS:\n');
      this.errors.forEach((err, i) => {
        console.log(`${i + 1}. ${err.message}`);
        if (err.details.fix) {
          console.log(`   Fix: ${err.details.fix}`);
        }
        if (err.details.command) {
          console.log(`   Command: ${err.details.command}`);
        }
        if (err.details.error) {
          console.log(`   Error: ${err.details.error}`);
        }
        console.log('');
      });
    }

    // Warnings
    if (this.warnings.length > 0) {
      console.log('WARNINGS:\n');
      this.warnings.forEach((warn, i) => {
        console.log(`${i + 1}. ${warn.message}`);
        if (warn.details.fix) {
          console.log(`   Fix: ${warn.details.fix}`);
        }
        if (warn.details.command) {
          console.log(`   Command: ${warn.details.command}`);
        }
        console.log('');
      });
    }

    // Quick fix script
    console.log('💡 Quick fix (run these in order):');
    console.log('');

    const fixes = [];

    if (this.errors.some(e => e.message.includes('Server is not responding'))) {
      fixes.push('npm start');
    }

    if (this.errors.some(e => e.message.includes('Database connection failed'))) {
      fixes.push('brew services start postgresql');
    }

    if (this.errors.some(e => e.message.includes('Missing') && e.message.includes('tables'))) {
      fixes.push('npm run migrate');
    }

    if (this.warnings.some(w => w.message.includes('No learning paths'))) {
      fixes.push('node scripts/seed-learning-paths.js');
    }

    fixes.forEach((cmd, i) => {
      console.log(`   ${i + 1}. ${cmd}`);
    });

    console.log('');
  }
}

// Run debugger
(async () => {
  const checker = new LearningAPIDebugger();
  await checker.debug();
  process.exit(0);
})();

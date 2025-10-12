#!/usr/bin/env node

/**
 * CalOS Database Migration Runner
 *
 * Automatically runs pending database migrations in order.
 * Tracks which migrations have been applied to avoid re-running them.
 *
 * Usage:
 *   node database/run-migrations.js              # Run pending migrations
 *   node database/run-migrations.js --status     # Show migration status
 *   node database/run-migrations.js --rollback   # Rollback last migration
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration
const dbType = process.env.DB_TYPE || 'postgres';
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
};

// Migration tracking table
const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64),
    execution_time_ms INTEGER
  );
`;

// Initialize database pool
let db;

if (dbType === 'postgres') {
  db = new Pool(dbConfig);
} else if (dbType === 'sqlite') {
  console.error('❌ SQLite migrations not yet implemented');
  console.error('   Use PostgreSQL for now: DB_TYPE=postgres');
  process.exit(1);
}

/**
 * Calculate checksum for migration file
 */
function calculateChecksum(content) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Ensure migrations tracking table exists
 */
async function initMigrationsTable() {
  try {
    await db.query(MIGRATIONS_TABLE);
    console.log('✓ Migration tracking table ready');
  } catch (error) {
    console.error('❌ Failed to create migrations table:', error.message);
    throw error;
  }
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations() {
  const result = await db.query(`
    SELECT migration_name, applied_at, checksum, execution_time_ms
    FROM schema_migrations
    ORDER BY migration_name
  `);
  return result.rows;
}

/**
 * Get list of migration files
 */
function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.log('ℹ️  No migrations directory found');
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();  // Sort to ensure correct order

  return files.map(filename => ({
    filename,
    path: path.join(migrationsDir, filename),
    content: fs.readFileSync(path.join(migrationsDir, filename), 'utf8')
  }));
}

/**
 * Apply a single migration
 */
async function applyMigration(migration) {
  const startTime = Date.now();

  try {
    console.log(`\n📝 Applying: ${migration.filename}`);

    // Start transaction
    await db.query('BEGIN');

    // Execute migration SQL
    await db.query(migration.content);

    // Calculate checksum
    const checksum = calculateChecksum(migration.content);

    // Record migration
    const executionTime = Date.now() - startTime;
    await db.query(`
      INSERT INTO schema_migrations (migration_name, checksum, execution_time_ms)
      VALUES ($1, $2, $3)
    `, [migration.filename, checksum, executionTime]);

    // Commit transaction
    await db.query('COMMIT');

    console.log(`✅ Applied successfully (${executionTime}ms)`);
    return true;

  } catch (error) {
    // Rollback on error
    await db.query('ROLLBACK');
    console.error(`❌ Migration failed: ${error.message}`);
    throw error;
  }
}

/**
 * Run pending migrations
 */
async function runPendingMigrations() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  🗄️  CalOS Database Migration Runner                 ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  console.log(`Database: ${dbConfig.database}`);
  console.log(`Type: ${dbType}\n`);

  // Initialize migrations table
  await initMigrationsTable();

  // Get applied and available migrations
  const applied = await getAppliedMigrations();
  const available = getMigrationFiles();

  const appliedNames = new Set(applied.map(m => m.migration_name));

  // Find pending migrations
  const pending = available.filter(m => !appliedNames.has(m.filename));

  if (pending.length === 0) {
    console.log('✨ No pending migrations. Database is up to date!\n');
    return;
  }

  console.log(`Found ${pending.length} pending migration(s):\n`);

  pending.forEach(m => {
    console.log(`  • ${m.filename}`);
  });

  console.log('');

  // Apply each pending migration
  for (const migration of pending) {
    await applyMigration(migration);
  }

  console.log('\n✨ All migrations applied successfully!\n');
}

/**
 * Show migration status
 */
async function showStatus() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  Migration Status                                     ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  await initMigrationsTable();

  const applied = await getAppliedMigrations();
  const available = getMigrationFiles();

  const appliedNames = new Set(applied.map(m => m.migration_name));

  console.log(`Database: ${dbConfig.database}\n`);
  console.log(`Total migrations: ${available.length}`);
  console.log(`Applied: ${applied.length}`);
  console.log(`Pending: ${available.length - applied.length}\n`);

  if (available.length === 0) {
    console.log('ℹ️  No migrations found in database/migrations/\n');
    return;
  }

  console.log('Migration Status:\n');

  available.forEach(migration => {
    const appliedRecord = applied.find(a => a.migration_name === migration.filename);

    if (appliedRecord) {
      console.log(`✅ ${migration.filename}`);
      console.log(`   Applied: ${appliedRecord.applied_at.toISOString()}`);
      console.log(`   Execution time: ${appliedRecord.execution_time_ms}ms\n`);
    } else {
      console.log(`⏳ ${migration.filename} (pending)\n`);
    }
  });
}

/**
 * Rollback last migration
 */
async function rollbackLastMigration() {
  console.log('\n⚠️  Migration rollback not yet implemented');
  console.log('   Manual rollback:');
  console.log('   1. Write a down migration SQL file');
  console.log('   2. Delete record from schema_migrations table\n');
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  try {
    if (args.includes('--status')) {
      await showStatus();
    } else if (args.includes('--rollback')) {
      await rollbackLastMigration();
    } else {
      await runPendingMigrations();
    }

    await db.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration runner failed:', error.message);
    console.error(error.stack);
    await db.end();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  runPendingMigrations,
  showStatus,
  getAppliedMigrations,
  getMigrationFiles
};

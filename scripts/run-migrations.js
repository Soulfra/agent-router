#!/usr/bin/env node
/**
 * Run Database Migrations
 *
 * Automatically detects and runs pending migrations.
 * Safe to run multiple times (skips already-applied migrations).
 *
 * Usage:
 *   node scripts/run-migrations.js
 *   node scripts/run-migrations.js --force 066
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const force = args.includes('--force');
const forceNumber = force ? args[args.indexOf('--force') + 1] : null;

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || 'matthewmauer',
  password: process.env.DB_PASSWORD || ''
});

const MIGRATIONS_DIR = path.join(__dirname, '../database/migrations');

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║       CALOS Database Migration Runner          ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  try {
    // Ensure migration tracking table exists
    await createMigrationTable();

    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations();
    console.log(`Applied migrations: ${appliedMigrations.size}\n`);

    // Get all migration files
    const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${migrationFiles.length} migration files\n`);

    // Run pending migrations
    let applied = 0;
    let skipped = 0;

    for (const file of migrationFiles) {
      const migrationNumber = extractMigrationNumber(file);

      if (forceNumber && migrationNumber !== forceNumber) {
        continue; // Only run specific migration if --force used
      }

      if (!force && appliedMigrations.has(file)) {
        console.log(`⏭️  ${file} (already applied)`);
        skipped++;
        continue;
      }

      console.log(`⏳  Running ${file}...`);

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');

      try {
        await db.query('BEGIN');
        await db.query(sql);
        await recordMigration(file);
        await db.query('COMMIT');

        console.log(`✅  ${file} applied successfully\n`);
        applied++;

      } catch (error) {
        await db.query('ROLLBACK');
        console.error(`❌  ${file} failed:`);
        console.error(`   ${error.message}\n`);

        if (error.message.includes('already exists') || error.message.includes('does not exist')) {
          console.log(`   (This is usually safe to ignore - object might already exist)\n`);
        } else {
          console.error(`   Stack trace:`);
          console.error(error.stack);
          throw error;
        }
      }
    }

    console.log('─'.repeat(50));
    console.log(`✅ Applied: ${applied}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`📦 Total: ${migrationFiles.length}`);
    console.log('─'.repeat(50));

    if (applied > 0) {
      console.log('\n✅ Migrations complete!');
    } else {
      console.log('\n✅ All migrations already applied - database is up to date');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await db.end();
  }
}

async function createMigrationTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      migration_file VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations() {
  const result = await db.query('SELECT migration_file FROM _migrations');
  return new Set(result.rows.map(row => row.migration_file));
}

async function recordMigration(file) {
  await db.query(
    'INSERT INTO _migrations (migration_file) VALUES ($1) ON CONFLICT DO NOTHING',
    [file]
  );
}

function extractMigrationNumber(filename) {
  const match = filename.match(/^(\d+)_/);
  return match ? match[1] : null;
}

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
CALOS Database Migration Runner

Automatically detects and runs pending database migrations.
Safe to run multiple times - skips already-applied migrations.

Usage:
  npm run migrate              # Run all pending migrations
  npm run migrate -- --force 066   # Force re-run specific migration

Options:
  --force <number>   Force re-run a specific migration number
  --help, -h         Show this help

Examples:
  # Apply all pending migrations
  npm run migrate

  # Force re-run migration 066 (ai_conversations)
  npm run migrate -- --force 066

  # Force re-run migration 067 (icon_emoji)
  npm run migrate -- --force 067

Migration Files:
  Location: database/migrations/
  Format: NNN_description.sql (e.g., 066_ai_conversations.sql)

Migration Tracking:
  Applied migrations are recorded in the _migrations table.
  You can check applied migrations with:
    psql -d calos -c "SELECT * FROM _migrations ORDER BY applied_at;"
`);
  process.exit(0);
}

main();

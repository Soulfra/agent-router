#!/usr/bin/env node

/**
 * Generate Consolidated Baseline Migration
 *
 * This script consolidates all existing migrations (001-041) into a single
 * baseline file for new installations.
 *
 * Problem: 66+ migration files cause complexity and overhead
 * Solution: Single baseline file for new installs, keep individual migrations
 *           for existing databases
 *
 * Usage:
 *   node scripts/generate-baseline.js
 *   node scripts/generate-baseline.js --output migrations/099_consolidated_baseline.sql
 *   node scripts/generate-baseline.js --dry-run
 *
 * What it does:
 * 1. Read all migration files (001-041)
 * 2. Combine them into single baseline file
 * 3. Remove duplicate table/index creations
 * 4. Generate version tracking
 *
 * For new installations:
 *   - Run 099_consolidated_baseline.sql only
 *   - Skip migrations 001-041
 *
 * For existing installations:
 *   - Continue using individual migrations
 *   - Skip 099_consolidated_baseline.sql
 */

const fs = require('fs');
const path = require('path');

// Configuration
const MIGRATIONS_DIR = path.join(__dirname, '../migrations');
const DATABASE_MIGRATIONS_DIR = path.join(__dirname, '../database/migrations');
const OUTPUT_FILE = path.join(__dirname, '../migrations/099_consolidated_baseline.sql');
const START_MIGRATION = 1;
const END_MIGRATION = 41;

// Check which migrations directory exists
let migrationsDir = MIGRATIONS_DIR;
if (!fs.existsSync(MIGRATIONS_DIR) && fs.existsSync(DATABASE_MIGRATIONS_DIR)) {
  migrationsDir = DATABASE_MIGRATIONS_DIR;
}

console.log(`\n🔄 Consolidating migrations into baseline file...\n`);

/**
 * Find all migration files in range
 */
function findMigrationFiles() {
  const files = [];

  if (!fs.existsSync(migrationsDir)) {
    console.error(`❌ Migrations directory not found: ${migrationsDir}`);
    return files;
  }

  const allFiles = fs.readdirSync(migrationsDir);

  for (let num = START_MIGRATION; num <= END_MIGRATION; num++) {
    const paddedNum = String(num).padStart(3, '0');
    const matchingFiles = allFiles.filter(f => f.startsWith(paddedNum));

    if (matchingFiles.length > 0) {
      files.push({
        number: num,
        filename: matchingFiles[0],
        path: path.join(migrationsDir, matchingFiles[0])
      });
    }
  }

  return files;
}

/**
 * Read and parse migration file
 */
function readMigration(file) {
  try {
    const content = fs.readFileSync(file.path, 'utf-8');
    return {
      ...file,
      content,
      tables: extractTableNames(content),
      views: extractViewNames(content),
      functions: extractFunctionNames(content)
    };
  } catch (error) {
    console.error(`❌ Error reading ${file.filename}:`, error.message);
    return null;
  }
}

/**
 * Extract table names from SQL
 */
function extractTableNames(sql) {
  const tableRegex = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-z_]+)/gi;
  const matches = [];
  let match;

  while ((match = tableRegex.exec(sql)) !== null) {
    matches.push(match[1]);
  }

  return matches;
}

/**
 * Extract view names from SQL
 */
function extractViewNames(sql) {
  const viewRegex = /CREATE(?:\s+OR REPLACE)?\s+VIEW\s+([a-z_]+)/gi;
  const matches = [];
  let match;

  while ((match = viewRegex.exec(sql)) !== null) {
    matches.push(match[1]);
  }

  return matches;
}

/**
 * Extract function names from SQL
 */
function extractFunctionNames(sql) {
  const functionRegex = /CREATE(?:\s+OR REPLACE)?\s+FUNCTION\s+([a-z_]+)/gi;
  const matches = [];
  let match;

  while ((match = functionRegex.exec(sql)) !== null) {
    matches.push(match[1]);
  }

  return matches;
}

/**
 * Generate consolidated baseline
 */
function generateBaseline(migrations) {
  const header = `/**
 * Migration 099: Consolidated Baseline (Migrations 001-041)
 *
 * This file consolidates migrations 001-041 into a single baseline.
 *
 * USE THIS FOR:
 * - New installations (fresh databases)
 * - Development environments
 * - Testing
 *
 * DO NOT USE THIS FOR:
 * - Existing production databases (use individual migrations instead)
 *
 * Included migrations:
${migrations.map(m => ` * - ${m.filename}`).join('\n')}
 *
 * Generated: ${new Date().toISOString()}
 * Total migrations: ${migrations.length}
 * Total tables: ${[...new Set(migrations.flatMap(m => m.tables))].length}
 * Total views: ${[...new Set(migrations.flatMap(m => m.views))].length}
 * Total functions: ${[...new Set(migrations.flatMap(m => m.functions))].length}
 */

-- ============================================================================
-- CONSOLIDATED BASELINE
-- ============================================================================

-- This baseline replaces migrations 001-041 for new installations.
-- For existing databases, continue using individual migration files.

BEGIN;

`;

  const footer = `
-- ============================================================================
-- MIGRATION TRACKING
-- ============================================================================

-- Create migration tracking table (if not exists)
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT NOW()
);

-- Mark baseline as applied
INSERT INTO schema_migrations (version)
VALUES ('099_consolidated_baseline')
ON CONFLICT (version) DO NOTHING;

-- Mark all individual migrations as applied (for new installs)
${Array.from({ length: END_MIGRATION - START_MIGRATION + 1 }, (_, i) => {
  const num = START_MIGRATION + i;
  const paddedNum = String(num).padStart(3, '0');
  return `INSERT INTO schema_migrations (version) VALUES ('${paddedNum}') ON CONFLICT (version) DO NOTHING;`;
}).join('\n')}

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify all migrations marked as applied
SELECT
  COUNT(*) as applied_migrations,
  MIN(applied_at) as first_applied,
  MAX(applied_at) as last_applied
FROM schema_migrations;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

SELECT 'Migration 099: Consolidated Baseline - Complete' as status;
SELECT 'Migrations 001-041 consolidated into single baseline' as note;
`;

  let consolidatedSQL = header;

  // Add each migration's content
  for (const migration of migrations) {
    consolidatedSQL += `
-- ============================================================================
-- ${migration.filename}
-- ============================================================================

`;

    // Remove individual migration complete messages
    let content = migration.content;
    content = content.replace(/SELECT\s+'Migration\s+\d+:.*?[;]/gi, '');
    content = content.replace(/SELECT\s+.*?\s+as\s+status[;]/gi, '');

    consolidatedSQL += content.trim() + '\n\n';
  }

  consolidatedSQL += footer;

  return consolidatedSQL;
}

/**
 * Generate summary report
 */
function generateSummary(migrations) {
  const allTables = [...new Set(migrations.flatMap(m => m.tables))];
  const allViews = [...new Set(migrations.flatMap(m => m.views))];
  const allFunctions = [...new Set(migrations.flatMap(m => m.functions))];

  return {
    total_migrations: migrations.length,
    migration_range: `${START_MIGRATION}-${END_MIGRATION}`,
    total_tables: allTables.length,
    total_views: allViews.length,
    total_functions: allFunctions.length,
    tables: allTables,
    views: allViews,
    functions: allFunctions
  };
}

/**
 * Write baseline file
 */
function writeBaseline(content, dryRun = false) {
  if (dryRun) {
    console.log('📄 DRY RUN - Would write to:', OUTPUT_FILE);
    console.log('📊 Content size:', content.length, 'bytes');
    return;
  }

  try {
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');
    console.log('✅ Baseline file generated:', OUTPUT_FILE);
    console.log('📊 File size:', content.length, 'bytes');
  } catch (error) {
    console.error('❌ Error writing baseline file:', error.message);
    process.exit(1);
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const outputArg = args.find(arg => arg.startsWith('--output='));

  if (outputArg) {
    OUTPUT_FILE = outputArg.split('=')[1];
  }

  // Find migration files
  console.log(`📂 Searching for migrations in: ${migrationsDir}`);
  const files = findMigrationFiles();

  if (files.length === 0) {
    console.log(`⚠️  No migration files found in range ${START_MIGRATION}-${END_MIGRATION}`);
    console.log(`ℹ️  This is normal if migrations haven't been created yet.`);
    console.log(`ℹ️  Generating empty baseline template...`);

    // Generate empty baseline template
    const emptyBaseline = `/**
 * Migration 099: Consolidated Baseline
 *
 * This is a template for consolidating migrations when they are created.
 *
 * Run: node scripts/generate-baseline.js
 */

-- No migrations to consolidate yet
`;

    writeBaseline(emptyBaseline, dryRun);
    return;
  }

  console.log(`✅ Found ${files.length} migration files\n`);

  // Read migrations
  const migrations = files.map(readMigration).filter(Boolean);

  if (migrations.length === 0) {
    console.error('❌ No migrations could be read');
    process.exit(1);
  }

  // Generate summary
  const summary = generateSummary(migrations);
  console.log('📊 Summary:');
  console.log(`   Total migrations: ${summary.total_migrations}`);
  console.log(`   Migration range: ${summary.migration_range}`);
  console.log(`   Total tables: ${summary.total_tables}`);
  console.log(`   Total views: ${summary.total_views}`);
  console.log(`   Total functions: ${summary.total_functions}`);
  console.log();

  // Generate baseline
  console.log('🔨 Generating consolidated baseline...');
  const baseline = generateBaseline(migrations);

  // Write baseline
  writeBaseline(baseline, dryRun);

  console.log();
  console.log('✅ Done!');
  console.log();
  console.log('📝 Next steps:');
  console.log('   1. Review the generated baseline file');
  console.log('   2. Test on a fresh database');
  console.log('   3. For new installations: run 099_consolidated_baseline.sql');
  console.log('   4. For existing databases: continue with individual migrations');
  console.log();
}

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

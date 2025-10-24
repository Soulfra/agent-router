#!/usr/bin/env node

/**
 * Migration Renumbering Script
 *
 * Consolidates and renumbers all migrations sequentially.
 *
 * Strategy:
 * 1. Collect ALL migrations from both directories
 * 2. Sort by original number + filename (preserve logical order)
 * 3. Renumber sequentially 001-138
 * 4. Move to database/migrations/
 * 5. Update migration_history table
 *
 * Usage:
 *   node scripts/renumber-migrations.js --dry-run   # Preview changes
 *   node scripts/renumber-migrations.js --execute   # Apply changes
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Configuration
const DB_MIGRATIONS_DIR = path.join(__dirname, '../database/migrations');
const ROOT_MIGRATIONS_DIR = path.join(__dirname, '../migrations');
const BACKUP_DIR = path.join(__dirname, '../database/migrations-backup');

class MigrationRenumberer {
  constructor(options = {}) {
    this.dryRun = options.dryRun !== false;
    this.verbose = options.verbose || false;
    this.migrations = [];
    this.mapping = {}; // old name → new name
  }

  /**
   * Main execution
   */
  async run() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Migration Renumbering Script');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log(`Mode: ${this.dryRun ? '🔍 DRY RUN (preview only)' : '⚠️  EXECUTE (will modify files)'}`);
    console.log('');

    try {
      // Step 1: Collect all migrations
      console.log('Step 1: Collecting migrations...');
      await this.collectMigrations();
      console.log(`  ✓ Found ${this.migrations.length} migrations`);
      console.log('');

      // Step 2: Sort and assign new numbers
      console.log('Step 2: Sorting and assigning new numbers...');
      this.sortAndNumber();
      console.log(`  ✓ Assigned numbers 001-${String(this.migrations.length).padStart(3, '0')}`);
      console.log('');

      // Step 3: Show preview
      console.log('Step 3: Preview changes...');
      this.showPreview();
      console.log('');

      if (this.dryRun) {
        console.log('═══════════════════════════════════════════════════════');
        console.log('  DRY RUN COMPLETE');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('To apply these changes, run:');
        console.log('  node scripts/renumber-migrations.js --execute');
        console.log('');
        return;
      }

      // Step 4: Backup existing migrations
      console.log('Step 4: Creating backup...');
      await this.createBackup();
      console.log(`  ✓ Backup created: ${BACKUP_DIR}`);
      console.log('');

      // Step 5: Rename files
      console.log('Step 5: Renaming migration files...');
      await this.renameMigrations();
      console.log(`  ✓ Renamed ${this.migrations.length} files`);
      console.log('');

      // Step 6: Update migration_history table
      console.log('Step 6: Updating migration_history table...');
      await this.updateMigrationHistory();
      console.log('  ✓ Database updated');
      console.log('');

      // Step 7: Clean up root migrations folder
      console.log('Step 7: Cleaning up root migrations folder...');
      await this.cleanupRootMigrations();
      console.log('  ✓ Root migrations folder cleaned');
      console.log('');

      console.log('═══════════════════════════════════════════════════════');
      console.log('  ✅ RENUMBERING COMPLETE');
      console.log('═══════════════════════════════════════════════════════');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Review the changes');
      console.log('  2. Test migrations: npm run migrate');
      console.log('  3. Backup located at: ' + BACKUP_DIR);
      console.log('');

    } catch (error) {
      console.error('');
      console.error('❌ Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }

  /**
   * Collect all migration files from both directories
   */
  async collectMigrations() {
    const dbMigrations = this.readMigrationsDir(DB_MIGRATIONS_DIR, 'database/migrations');
    const rootMigrations = this.readMigrationsDir(ROOT_MIGRATIONS_DIR, 'migrations');

    this.migrations = [...dbMigrations, ...rootMigrations];
  }

  /**
   * Read migrations from a directory
   */
  readMigrationsDir(dir, label) {
    if (!fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .map(filename => {
        const match = filename.match(/^(\d+)/);
        const number = match ? parseInt(match[1]) : 999;

        return {
          originalFilename: filename,
          originalNumber: number,
          originalPath: path.join(dir, filename),
          source: label,
          name: filename.replace(/^\d+[-_]/, '') // Remove number prefix
        };
      });

    return files;
  }

  /**
   * Sort migrations and assign new sequential numbers
   */
  sortAndNumber() {
    // Sort by: original number, then filename
    this.migrations.sort((a, b) => {
      if (a.originalNumber !== b.originalNumber) {
        return a.originalNumber - b.originalNumber;
      }
      return a.originalFilename.localeCompare(b.originalFilename);
    });

    // Assign new numbers
    this.migrations.forEach((migration, index) => {
      const newNumber = String(index + 1).padStart(3, '0');
      migration.newNumber = newNumber;
      migration.newFilename = `${newNumber}_${migration.name}`;
      migration.newPath = path.join(DB_MIGRATIONS_DIR, migration.newFilename);

      // Store mapping
      this.mapping[migration.originalFilename] = migration.newFilename;
    });
  }

  /**
   * Show preview of changes
   */
  showPreview() {
    console.log('  Changes to be made:');
    console.log('');

    let shown = 0;
    const MAX_SHOW = 20;

    for (const migration of this.migrations) {
      if (shown < MAX_SHOW || this.verbose) {
        const arrow = migration.originalFilename !== migration.newFilename ? '→' : '✓';
        console.log(`    ${arrow} ${migration.originalFilename}`);
        if (migration.originalFilename !== migration.newFilename) {
          console.log(`      → ${migration.newFilename}`);
        }
        shown++;
      }
    }

    if (shown < this.migrations.length && !this.verbose) {
      console.log(`    ... and ${this.migrations.length - shown} more`);
      console.log('    (run with --verbose to see all)');
    }
  }

  /**
   * Create backup of existing migrations
   */
  async createBackup() {
    if (fs.existsSync(BACKUP_DIR)) {
      // Remove old backup
      fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
    }

    // Create backup directory
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    // Copy all migrations to backup
    for (const migration of this.migrations) {
      const backupPath = path.join(BACKUP_DIR, path.basename(migration.originalPath));
      fs.copyFileSync(migration.originalPath, backupPath);
    }

    // Create README
    const readme = `# Migration Backup

Created: ${new Date().toISOString()}

This is a backup of all migrations before renumbering.

Original locations:
- database/migrations/ (${this.migrations.filter(m => m.source.includes('database')).length} files)
- migrations/ (${this.migrations.filter(m => m.source.includes('migrations')).length} files)

To restore:
1. Stop the server
2. Copy files back to original locations
3. Restart server

DO NOT DELETE THIS BACKUP until you've verified the renumbering worked.
`;

    fs.writeFileSync(path.join(BACKUP_DIR, 'README.md'), readme);
  }

  /**
   * Rename migration files
   */
  async renameMigrations() {
    // First, move root migrations to database/migrations
    for (const migration of this.migrations) {
      if (migration.source.includes('migrations') && !migration.source.includes('database')) {
        // Copy to database/migrations with new name
        fs.copyFileSync(migration.originalPath, migration.newPath);
      } else {
        // Rename in place (database/migrations)
        if (migration.originalPath !== migration.newPath) {
          fs.renameSync(migration.originalPath, migration.newPath);
        }
      }
    }
  }

  /**
   * Update migration_history table with name mapping
   */
  async updateMigrationHistory() {
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || ''
    });

    try {
      // Check if migration_history exists
      const tableExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'migration_history'
        );
      `);

      if (!tableExists.rows[0].exists) {
        console.log('    ℹ️  migration_history table does not exist yet');
        await pool.end();
        return;
      }

      // Get current migrations
      const result = await pool.query('SELECT migration_name FROM migration_history');
      const appliedMigrations = result.rows.map(r => r.migration_name);

      // Update each mapping
      let updated = 0;
      for (const [oldName, newName] of Object.entries(this.mapping)) {
        if (appliedMigrations.includes(oldName) && oldName !== newName) {
          await pool.query(
            'UPDATE migration_history SET migration_name = $1 WHERE migration_name = $2',
            [newName, oldName]
          );
          console.log(`    ✓ Updated: ${oldName} → ${newName}`);
          updated++;
        }
      }

      console.log(`    ℹ️  Updated ${updated} migration_history records`);

      await pool.end();
    } catch (error) {
      console.error('    ⚠️  Could not update migration_history:', error.message);
      console.error('       You may need to manually update the table');
    }
  }

  /**
   * Clean up root migrations folder
   */
  async cleanupRootMigrations() {
    if (fs.existsSync(ROOT_MIGRATIONS_DIR)) {
      // Remove all .sql files
      const files = fs.readdirSync(ROOT_MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
      for (const file of files) {
        fs.unlinkSync(path.join(ROOT_MIGRATIONS_DIR, file));
      }

      // If empty, remove directory
      const remaining = fs.readdirSync(ROOT_MIGRATIONS_DIR);
      if (remaining.length === 0) {
        fs.rmdirSync(ROOT_MIGRATIONS_DIR);
      } else {
        console.log(`    ℹ️  migrations/ directory not empty (has ${remaining.length} non-SQL files)`);
      }
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = !args.includes('--execute');
const verbose = args.includes('--verbose');

// Run
const renumberer = new MigrationRenumberer({ dryRun, verbose });
renumberer.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

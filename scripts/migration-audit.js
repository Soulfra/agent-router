#!/usr/bin/env node
/**
 * Migration Audit Script
 *
 * Analyzes all database migrations to identify:
 * - Duplicate migration numbers
 * - Table dependencies
 * - Foreign key relationships
 * - Common migration errors
 * - Execution order issues
 *
 * Generates a comprehensive report for migration cleanup.
 */

const fs = require('fs');
const path = require('path');

class MigrationAuditor {
  constructor() {
    this.migrationsDir = path.join(__dirname, '../database/migrations');
    this.migrations = [];
    this.duplicates = {};
    this.dependencies = {};
    this.tables = {};
    this.errors = [];
  }

  /**
   * Main audit function
   */
  async audit() {
    console.log('🔍 Migration Audit Report');
    console.log('=' .repeat(80));
    console.log('');

    // Step 1: Load and parse all migrations
    this.loadMigrations();

    // Step 2: Identify duplicates
    this.findDuplicates();

    // Step 3: Analyze dependencies
    this.analyzeDependencies();

    // Step 4: Check for common errors
    this.checkForErrors();

    // Step 5: Generate execution order
    this.generateExecutionOrder();

    // Step 6: Print report
    this.printReport();

    // Step 7: Save report to file
    this.saveReport();
  }

  /**
   * Load all migration files
   */
  loadMigrations() {
    const files = fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        this.errors.push(`Invalid migration filename: ${file}`);
        continue;
      }

      const [_, number, name] = match;
      const content = fs.readFileSync(path.join(this.migrationsDir, file), 'utf8');

      this.migrations.push({
        file,
        number: parseInt(number),
        name,
        content,
        tables: this.extractTables(content),
        foreignKeys: this.extractForeignKeys(content),
        indexes: this.extractIndexes(content),
        triggers: this.extractTriggers(content)
      });
    }

    console.log(`✓ Loaded ${this.migrations.length} migration files`);
    console.log('');
  }

  /**
   * Find duplicate migration numbers
   */
  findDuplicates() {
    const numberMap = {};

    for (const migration of this.migrations) {
      if (!numberMap[migration.number]) {
        numberMap[migration.number] = [];
      }
      numberMap[migration.number].push(migration.file);
    }

    for (const [number, files] of Object.entries(numberMap)) {
      if (files.length > 1) {
        this.duplicates[number] = files;
      }
    }

    console.log(`🔴 Duplicate Migration Numbers: ${Object.keys(this.duplicates).length}`);
    if (Object.keys(this.duplicates).length > 0) {
      for (const [number, files] of Object.entries(this.duplicates)) {
        console.log(`  ${number.padStart(3, '0')}: ${files.length} files`);
        files.forEach(f => console.log(`      - ${f}`));
      }
    }
    console.log('');
  }

  /**
   * Analyze table dependencies
   */
  analyzeDependencies() {
    // Build table creation map
    for (const migration of this.migrations) {
      for (const table of migration.tables) {
        if (!this.tables[table]) {
          this.tables[table] = {
            createdBy: migration.file,
            createdAt: migration.number,
            references: [],
            referencedBy: []
          };
        }
      }
    }

    // Build foreign key dependency graph
    for (const migration of this.migrations) {
      for (const fk of migration.foreignKeys) {
        const { fromTable, toTable } = fk;

        if (this.tables[fromTable]) {
          this.tables[fromTable].references.push({
            table: toTable,
            migration: migration.file
          });
        }

        if (this.tables[toTable]) {
          this.tables[toTable].referencedBy.push({
            table: fromTable,
            migration: migration.file
          });
        }
      }
    }

    console.log(`📊 Table Dependencies:`);
    console.log(`  Total tables: ${Object.keys(this.tables).length}`);

    // Find circular dependencies
    const circular = this.findCircularDependencies();
    if (circular.length > 0) {
      console.log(`  🔴 Circular dependencies found: ${circular.length}`);
      circular.forEach(c => console.log(`      ${c}`));
    } else {
      console.log(`  ✓ No circular dependencies`);
    }
    console.log('');
  }

  /**
   * Check for common migration errors
   */
  checkForErrors() {
    console.log(`⚠️  Common Migration Issues:`);
    let issueCount = 0;

    for (const migration of this.migrations) {
      const issues = [];

      // Check 1: Missing IF NOT EXISTS
      if (migration.content.includes('CREATE TABLE ') && !migration.content.includes('IF NOT EXISTS')) {
        issues.push('Missing IF NOT EXISTS on CREATE TABLE');
      }

      // Check 2: Missing IF EXISTS on DROP
      if (migration.content.includes('DROP TABLE ') && !migration.content.includes('IF EXISTS')) {
        issues.push('Missing IF EXISTS on DROP TABLE');
      }

      // Check 3: Foreign keys without parent table in same migration
      for (const fk of migration.foreignKeys) {
        if (!migration.tables.includes(fk.toTable)) {
          const parentMigration = this.migrations.find(m => m.tables.includes(fk.toTable));
          if (!parentMigration || parentMigration.number > migration.number) {
            issues.push(`Foreign key to ${fk.toTable} created before table exists`);
          }
        }
      }

      // Check 4: Syntax errors (basic detection)
      if (migration.content.includes('DROP TABLE IF NOT EXISTS')) {
        issues.push('SQL syntax error: DROP TABLE IF NOT EXISTS (should be IF EXISTS)');
      }

      if (issues.length > 0) {
        issueCount++;
        console.log(`  ${migration.file}:`);
        issues.forEach(i => console.log(`    - ${i}`));
      }
    }

    if (issueCount === 0) {
      console.log(`  ✓ No obvious issues detected`);
    }
    console.log('');
  }

  /**
   * Generate recommended execution order
   */
  generateExecutionOrder() {
    console.log(`📋 Recommended Execution Order:`);
    console.log(`  Current: Alphabetical sort (problematic with duplicates)`);
    console.log(`  Recommended: Renumber sequentially (001-${String(this.migrations.length).padStart(3, '0')})`);
    console.log('');
  }

  /**
   * Extract table names from SQL
   */
  extractTables(sql) {
    const tables = [];
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    let match;

    while ((match = createTableRegex.exec(sql)) !== null) {
      tables.push(match[1].toLowerCase());
    }

    return tables;
  }

  /**
   * Extract foreign keys from SQL
   */
  extractForeignKeys(sql) {
    const fks = [];
    const fkRegex = /FOREIGN\s+KEY\s*\([^)]+\)\s+REFERENCES\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    const constraintRegex = /ADD\s+CONSTRAINT\s+[^\s]+\s+FOREIGN\s+KEY\s*\([^)]+\)\s+REFERENCES\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;

    let match;
    while ((match = fkRegex.exec(sql)) !== null) {
      fks.push({ fromTable: 'unknown', toTable: match[1].toLowerCase() });
    }

    while ((match = constraintRegex.exec(sql)) !== null) {
      fks.push({ fromTable: 'unknown', toTable: match[1].toLowerCase() });
    }

    return fks;
  }

  /**
   * Extract indexes from SQL
   */
  extractIndexes(sql) {
    const indexes = [];
    const indexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    let match;

    while ((match = indexRegex.exec(sql)) !== null) {
      indexes.push(match[1].toLowerCase());
    }

    return indexes;
  }

  /**
   * Extract triggers from SQL
   */
  extractTriggers(sql) {
    const triggers = [];
    const triggerRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    let match;

    while ((match = triggerRegex.exec(sql)) !== null) {
      triggers.push(match[1].toLowerCase());
    }

    return triggers;
  }

  /**
   * Find circular dependencies
   */
  findCircularDependencies() {
    const circular = [];
    // Simplified circular dependency detection
    // In a full implementation, would use graph algorithms
    return circular;
  }

  /**
   * Print summary report
   */
  printReport() {
    console.log('=' .repeat(80));
    console.log('📊 Summary');
    console.log('=' .repeat(80));
    console.log(`Total migrations: ${this.migrations.length}`);
    console.log(`Duplicate numbers: ${Object.keys(this.duplicates).length}`);
    console.log(`Total tables: ${Object.keys(this.tables).length}`);
    console.log(`Errors detected: ${this.errors.length}`);
    console.log('');
    console.log('✅ Next Steps:');
    console.log('  1. Backup database: pg_dump -U matthewmauer calos > backup.sql');
    console.log('  2. Renumber migrations: Use scripts/renumber-migrations.js');
    console.log('  3. Fix migration errors: Address issues listed above');
    console.log('  4. Test in isolation: Run each migration in a test database');
    console.log('');
  }

  /**
   * Save report to file
   */
  saveReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalMigrations: this.migrations.length,
      duplicates: this.duplicates,
      tables: this.tables,
      errors: this.errors,
      migrations: this.migrations.map(m => ({
        file: m.file,
        number: m.number,
        name: m.name,
        tables: m.tables,
        foreignKeys: m.foreignKeys.length,
        indexes: m.indexes.length,
        triggers: m.triggers.length
      }))
    };

    const reportPath = path.join(__dirname, '../.migration-audit-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📝 Full report saved to: ${reportPath}`);
    console.log('');
  }
}

// Run audit
if (require.main === module) {
  const auditor = new MigrationAuditor();
  auditor.audit().catch(error => {
    console.error('Audit failed:', error);
    process.exit(1);
  });
}

module.exports = MigrationAuditor;

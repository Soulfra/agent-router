/**
 * Migration Dependency Resolver
 *
 * Analyzes SQL migrations to build dependency graph and determine correct execution order.
 * Solves foreign key dependency issues by using topological sort.
 *
 * Example:
 *   Migration 011 requires users table (FK to user_id)
 *   Migration 010 creates users table
 *   → Must run 010 before 011
 *
 * Features:
 * - Parse SQL for CREATE TABLE and FOREIGN KEY statements
 * - Build dependency graph
 * - Topological sort for correct order
 * - Detect circular dependencies
 * - Validation before execution
 */

const fs = require('fs');
const path = require('path');

class MigrationDependencyResolver {
  constructor(migrationsDir) {
    this.migrationsDir = migrationsDir;
    this.migrationFiles = [];
    this.dependencies = new Map(); // migration -> [dependencies]
    this.tables = new Map();        // table -> migration that creates it
    this.verbose = false;
  }

  /**
   * Analyze all migration files and build dependency graph
   */
  async analyze() {
    // Get all SQL files
    this.migrationFiles = fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    if (this.verbose) {
      console.log(`[MigrationResolver] Analyzing ${this.migrationFiles.length} migrations...`);
    }

    // Parse each migration
    for (const file of this.migrationFiles) {
      await this.parseMigration(file);
    }

    // Build dependency graph
    this.buildDependencyGraph();

    return {
      totalMigrations: this.migrationFiles.length,
      tablesCreated: this.tables.size,
      dependencies: Array.from(this.dependencies.entries()).filter(([_, deps]) => deps.length > 0).length
    };
  }

  /**
   * Parse a migration file to extract table creations and foreign key references
   */
  async parseMigration(filename) {
    const filepath = path.join(this.migrationsDir, filename);
    const sql = fs.readFileSync(filepath, 'utf-8');

    const migration = {
      filename,
      createdTables: [],
      referencedTables: []
    };

    // Extract CREATE TABLE statements
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)/gi;
    let match;
    while ((match = createTableRegex.exec(sql)) !== null) {
      const tableName = match[1].toLowerCase();
      migration.createdTables.push(tableName);
      this.tables.set(tableName, filename);
    }

    // Extract FOREIGN KEY references
    // Patterns:
    //   FOREIGN KEY (...) REFERENCES table_name(...)
    //   REFERENCES table_name(...)
    //   column_name UUID REFERENCES table_name(...)
    const foreignKeyRegex = /REFERENCES\s+([a-z_]+)\s*\(/gi;
    while ((match = foreignKeyRegex.exec(sql)) !== null) {
      const referencedTable = match[1].toLowerCase();
      if (!migration.referencedTables.includes(referencedTable)) {
        migration.referencedTables.push(referencedTable);
      }
    }

    // Store migration metadata
    if (!this.dependencies.has(filename)) {
      this.dependencies.set(filename, []);
    }

    // Store for graph building
    this._migrationMetadata = this._migrationMetadata || new Map();
    this._migrationMetadata.set(filename, migration);

    if (this.verbose && (migration.createdTables.length > 0 || migration.referencedTables.length > 0)) {
      console.log(`[MigrationResolver] ${filename}:`);
      if (migration.createdTables.length > 0) {
        console.log(`  Creates: ${migration.createdTables.join(', ')}`);
      }
      if (migration.referencedTables.length > 0) {
        console.log(`  References: ${migration.referencedTables.join(', ')}`);
      }
    }
  }

  /**
   * Build dependency graph from parsed migrations
   */
  buildDependencyGraph() {
    for (const [filename, metadata] of this._migrationMetadata.entries()) {
      const deps = [];

      // For each table this migration references via FK
      for (const referencedTable of metadata.referencedTables) {
        // Find which migration creates that table
        const creatorMigration = this.tables.get(referencedTable);

        if (creatorMigration && creatorMigration !== filename) {
          // This migration depends on the creator migration
          if (!deps.includes(creatorMigration)) {
            deps.push(creatorMigration);
          }
        }
      }

      this.dependencies.set(filename, deps);
    }
  }

  /**
   * Get migrations in correct execution order using topological sort
   */
  getExecutionOrder() {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set(); // For cycle detection

    const visit = (filename) => {
      if (visited.has(filename)) return;
      if (visiting.has(filename)) {
        throw new Error(`Circular dependency detected involving ${filename}`);
      }

      visiting.add(filename);

      // Visit dependencies first
      const deps = this.dependencies.get(filename) || [];
      for (const dep of deps) {
        visit(dep);
      }

      visiting.delete(filename);
      visited.add(filename);
      sorted.push(filename);
    };

    // Visit all migrations
    for (const filename of this.migrationFiles) {
      visit(filename);
    }

    return sorted;
  }

  /**
   * Get pending migrations in correct order
   */
  async getPendingMigrations(executedMigrations = []) {
    await this.analyze();

    const executionOrder = this.getExecutionOrder();

    // Filter to only pending migrations
    const pending = executionOrder.filter(file => !executedMigrations.includes(file));

    return pending;
  }

  /**
   * Validate that all FK dependencies can be satisfied
   */
  validate() {
    const errors = [];

    for (const [filename, metadata] of this._migrationMetadata.entries()) {
      for (const referencedTable of metadata.referencedTables) {
        if (!this.tables.has(referencedTable)) {
          errors.push({
            migration: filename,
            error: `References table '${referencedTable}' which is never created`
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get dependency graph for visualization
   */
  getDependencyGraph() {
    const graph = {};

    for (const [filename, deps] of this.dependencies.entries()) {
      if (deps.length > 0) {
        graph[filename] = deps;
      }
    }

    return graph;
  }

  /**
   * Print analysis report
   */
  printReport() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Migration Dependency Analysis');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`Total Migrations: ${this.migrationFiles.length}`);
    console.log(`Tables Created: ${this.tables.size}`);

    const depsWithRefs = Array.from(this.dependencies.entries()).filter(([_, deps]) => deps.length > 0);
    console.log(`Migrations with Dependencies: ${depsWithRefs.length}\n`);

    // Validation
    const validation = this.validate();
    if (validation.valid) {
      console.log('✅ All FK dependencies can be satisfied\n');
    } else {
      console.log('⚠️  Validation Errors:\n');
      validation.errors.forEach(err => {
        console.log(`  ${err.migration}: ${err.error}`);
      });
      console.log('');
    }

    // Execution order
    const executionOrder = this.getExecutionOrder();
    console.log('📋 Correct Execution Order:\n');

    executionOrder.forEach((file, index) => {
      const deps = this.dependencies.get(file) || [];
      const metadata = this._migrationMetadata.get(file);

      console.log(`  ${index + 1}. ${file}`);

      if (deps.length > 0) {
        console.log(`     ↳ Requires: ${deps.join(', ')}`);
      }

      if (metadata && metadata.createdTables.length > 0) {
        console.log(`     ↳ Creates: ${metadata.createdTables.join(', ')}`);
      }
    });

    console.log('\n═══════════════════════════════════════════════════════\n');
  }
}

module.exports = MigrationDependencyResolver;

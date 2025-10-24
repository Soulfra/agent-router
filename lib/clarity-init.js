#!/usr/bin/env node

/**
 * Clarity Initialization System
 *
 * Ensures proper startup order for the Clarity system:
 * 1. PostgreSQL connectivity
 * 2. Run database migrations
 * 3. Initialize MinIO
 * 4. Bootstrap critical packages
 * 5. Verify system health
 *
 * Usage:
 *   node lib/clarity-init.js
 *   npm run clarity:init
 */

require('dotenv').config();
const { Pool } = require('pg');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const MinIOModelClient = require('./minio-client');
const DependencyMirror = require('./dependency-mirror');
const URLIndex = require('./url-index');
const ClarityEngine = require('./clarity-engine');

class ClarityInitializer {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.skipBootstrap = options.skipBootstrap || false;

    // Critical packages that should always be vendored
    this.criticalPackages = [
      { name: 'left-pad', version: '1.3.0', reason: 'Famous left-pad incident example' },
      { name: 'express', version: 'latest', reason: 'Core web framework' },
      { name: 'axios', version: 'latest', reason: 'Core HTTP client' },
      { name: 'dotenv', version: 'latest', reason: 'Environment configuration' }
    ];

    this.db = null;
    this.minioClient = null;
    this.dependencyMirror = null;
    this.urlIndex = null;
    this.clarityEngine = null;
  }

  /**
   * Run full initialization
   */
  async init() {
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║  🔍 Clarity System Initialization                     ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    try {
      // Step 1: PostgreSQL
      await this.step1_PostgreSQL();

      // Step 2: Migrations
      await this.step2_Migrations();

      // Step 3: MinIO
      await this.step3_MinIO();

      // Step 4: Bootstrap
      if (!this.skipBootstrap) {
        await this.step4_Bootstrap();
      }

      // Step 5: Health Check
      await this.step5_HealthCheck();

      console.log('\n✨ Clarity system initialization complete!\n');
      return true;

    } catch (error) {
      console.error(`\n❌ Initialization failed: ${error.message}\n`);
      if (this.verbose) {
        console.error(error.stack);
      }
      return false;
    } finally {
      if (this.db) {
        await this.db.end();
      }
    }
  }

  /**
   * Step 1: Check PostgreSQL connectivity
   */
  async step1_PostgreSQL() {
    console.log('Step 1: PostgreSQL Connection');
    console.log('-'.repeat(50));

    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || ''
    };

    console.log(`  Host: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`  Database: ${dbConfig.database}`);
    console.log(`  User: ${dbConfig.user}\n`);

    try {
      this.db = new Pool(dbConfig);

      // Test connection
      const result = await this.db.query('SELECT version()');
      const version = result.rows[0].version;

      console.log(`  ✓ Connected to PostgreSQL`);
      if (this.verbose) {
        console.log(`    ${version.substring(0, 60)}...`);
      }
      console.log('');

    } catch (error) {
      console.error(`  ✗ PostgreSQL connection failed: ${error.message}\n`);
      throw error;
    }
  }

  /**
   * Step 2: Run database migrations
   */
  async step2_Migrations() {
    console.log('Step 2: Database Migrations');
    console.log('-'.repeat(50));

    try {
      // Check if migrations table exists
      const tableExists = await this.db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'schema_migrations'
        )
      `);

      if (!tableExists.rows[0].exists) {
        console.log('  First-time setup detected\n');
      }

      // Run migrations
      console.log('  Running migrations...');

      const migrationScript = path.join(__dirname, '..', 'database', 'run-migrations.js');

      if (fs.existsSync(migrationScript)) {
        execSync(`node ${migrationScript}`, { stdio: 'inherit' });
        console.log('');
      } else {
        console.log('  ⚠ Migration script not found, skipping\n');
      }

    } catch (error) {
      console.error(`  ✗ Migrations failed: ${error.message}\n`);
      throw error;
    }
  }

  /**
   * Step 3: Initialize MinIO
   */
  async step3_MinIO() {
    console.log('Step 3: MinIO Object Storage');
    console.log('-'.repeat(50));

    try {
      this.minioClient = new MinIOModelClient({
        db: this.db,
        endPoint: process.env.MINIO_ENDPOINT || 'localhost',
        port: parseInt(process.env.MINIO_PORT) || 9000,
        accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
      });

      console.log(`  Endpoint: ${this.minioClient.config.endPoint}:${this.minioClient.config.port}\n`);

      // Test connection and create bucket
      const available = await this.minioClient.isAvailable();

      if (available) {
        console.log('  ✓ MinIO is available');

        // Initialize bucket
        await this.minioClient.init();

        // Initialize packages bucket
        this.dependencyMirror = new DependencyMirror({
          db: this.db,
          minioClient: this.minioClient.client,
          bucketName: 'calos-packages'
        });

        await this.dependencyMirror.init();

        console.log('  ✓ Buckets initialized\n');

      } else {
        console.log('  ⚠ MinIO not available (this is optional)\n');
      }

    } catch (error) {
      console.log(`  ⚠ MinIO setup failed: ${error.message}`);
      console.log('  MinIO is optional - continuing without it\n');
      this.minioClient = null;
      this.dependencyMirror = null;
    }
  }

  /**
   * Step 4: Bootstrap critical packages
   */
  async step4_Bootstrap() {
    console.log('Step 4: Bootstrap Critical Packages');
    console.log('-'.repeat(50));

    if (!this.dependencyMirror) {
      console.log('  ⚠ MinIO not available, skipping bootstrap\n');
      return;
    }

    console.log(`  Vendoring ${this.criticalPackages.length} critical packages...\n`);

    for (const pkg of this.criticalPackages) {
      try {
        console.log(`  Vendoring ${pkg.name}@${pkg.version}...`);

        await this.dependencyMirror.vendor(pkg.name, pkg.version, {
          reason: pkg.reason,
          analyzeDependencies: false // Don't analyze deps during bootstrap
        });

        // Mark as critical
        await this.dependencyMirror.markCritical(pkg.name, pkg.version);

        console.log(`    ✓ ${pkg.name}@${pkg.version}`);

      } catch (error) {
        console.log(`    ⚠ Failed to vendor ${pkg.name}: ${error.message}`);
        // Continue with other packages
      }
    }

    console.log('');
  }

  /**
   * Step 5: Health check
   */
  async step5_HealthCheck() {
    console.log('Step 5: System Health Check');
    console.log('-'.repeat(50));

    // Initialize systems
    this.urlIndex = new URLIndex({ db: this.db });
    this.clarityEngine = new ClarityEngine({
      db: this.db,
      dependencyMirror: this.dependencyMirror,
      urlIndex: this.urlIndex
    });

    // Check database tables
    const tables = await this.checkTables();
    console.log(`  ✓ Database tables: ${tables.length}`);

    if (this.verbose) {
      console.log(`    ${tables.join(', ')}`);
    }

    // Check vendored packages
    if (this.dependencyMirror) {
      const packages = await this.dependencyMirror.list({ limit: 10 });
      console.log(`  ✓ Vendored packages: ${packages.length}`);
    }

    // Check URL index
    const urlStats = await this.urlIndex.statistics();
    console.log(`  ✓ Tracked URLs: ${urlStats.total_urls || 0}`);

    console.log('');
  }

  /**
   * Check which tables exist
   */
  async checkTables() {
    const result = await this.db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'vendored_packages',
          'package_dependencies',
          'url_index',
          'package_usage_log',
          'funding_registry',
          'package_intelligence',
          'dependency_snapshots'
        )
      ORDER BY table_name
    `);

    return result.rows.map(r => r.table_name);
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    skipBootstrap: args.includes('--skip-bootstrap')
  };

  const initializer = new ClarityInitializer(options);
  const success = await initializer.init();

  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = ClarityInitializer;

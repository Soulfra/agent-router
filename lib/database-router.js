/**
 * Database Router
 *
 * Route queries to different databases based on project
 * Like Maven's repository system but for PostgreSQL databases
 *
 * Features:
 * - Multiple database support (one per project or shared)
 * - Auto-create tables in project databases
 * - Query routing based on project name
 * - Connection pooling per database
 *
 * Usage:
 *   const dbRouter = new DatabaseRouter();
 *   const db = await dbRouter.getProjectDatabase('soulfra');
 *   await db.query('SELECT * FROM usage_events');
 */

const { Pool } = require('pg');

class DatabaseRouter {
  constructor() {
    this.pools = new Map(); // Map<databaseName, Pool>
    this.defaultPool = null;
  }

  /**
   * Initialize default database connection
   */
  async initializeDefault(connectionString) {
    if (this.defaultPool) {
      return this.defaultPool;
    }

    this.defaultPool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    console.log('[DatabaseRouter] Initialized default database');
    return this.defaultPool;
  }

  /**
   * Get database pool for a project
   * If project has its own database, return that
   * Otherwise return shared/default database
   */
  async getProjectDatabase(projectName, defaultDb) {
    try {
      // Query project registry to find database name
      const result = await defaultDb.query(
        `SELECT database_name FROM github_pages_projects WHERE project_name = $1`,
        [projectName]
      );

      if (result.rowCount === 0) {
        console.log(`[DatabaseRouter] Project '${projectName}' not found, using default DB`);
        return this.defaultPool || defaultDb;
      }

      const databaseName = result.rows[0].database_name;

      // If no custom database, use default
      if (!databaseName || databaseName === 'default' || databaseName === '') {
        return this.defaultPool || defaultDb;
      }

      // Check if we already have a pool for this database
      if (this.pools.has(databaseName)) {
        return this.pools.get(databaseName);
      }

      // Create new pool for this database
      const pool = await this.createDatabasePool(databaseName);
      this.pools.set(databaseName, pool);

      console.log(`[DatabaseRouter] Created pool for database: ${databaseName}`);
      return pool;

    } catch (error) {
      console.error('[DatabaseRouter] Get project database error:', error);
      // Fallback to default
      return this.defaultPool || defaultDb;
    }
  }

  /**
   * Create a new database pool
   */
  async createDatabasePool(databaseName) {
    const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/calos';

    // Replace database name in connection string
    const baseUrl = connectionString.substring(0, connectionString.lastIndexOf('/'));
    const newConnectionString = `${baseUrl}/${databaseName}`;

    const pool = new Pool({
      connectionString: newConnectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    // Test connection
    try {
      const client = await pool.connect();
      client.release();
      console.log(`[DatabaseRouter] Connected to database: ${databaseName}`);
    } catch (error) {
      console.error(`[DatabaseRouter] Failed to connect to ${databaseName}:`, error.message);
      // If connection fails, return null and fallback to default
      return null;
    }

    return pool;
  }

  /**
   * Create project database schema (usage_events table, etc.)
   */
  async initializeProjectDatabase(databaseName, defaultDb) {
    try {
      // First, create the database if it doesn't exist
      // Note: This requires CREATEDB privilege
      try {
        await defaultDb.query(`CREATE DATABASE ${databaseName}`);
        console.log(`[DatabaseRouter] Created database: ${databaseName}`);
      } catch (error) {
        if (error.code === '42P04') {
          console.log(`[DatabaseRouter] Database ${databaseName} already exists`);
        } else {
          console.error(`[DatabaseRouter] Create database error:`, error.message);
          return false;
        }
      }

      // Get pool for the new database
      const projectDb = await this.createDatabasePool(databaseName);
      if (!projectDb) {
        console.error(`[DatabaseRouter] Could not connect to ${databaseName}`);
        return false;
      }

      // Run migrations (create tables)
      await this.runProjectMigrations(projectDb);

      console.log(`[DatabaseRouter] Initialized schema for ${databaseName}`);
      return true;

    } catch (error) {
      console.error('[DatabaseRouter] Initialize project database error:', error);
      return false;
    }
  }

  /**
   * Run migrations on a project database
   */
  async runProjectMigrations(projectDb) {
    try {
      // Create usage_events table
      await projectDb.query(`
        CREATE TABLE IF NOT EXISTS usage_events (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255),
          device_fingerprint VARCHAR(255),
          client_ip VARCHAR(50),
          origin TEXT,
          is_github_pages BOOLEAN DEFAULT FALSE,
          endpoint VARCHAR(255),
          method VARCHAR(10),
          provider VARCHAR(50),
          model VARCHAR(255),
          key_source VARCHAR(50),
          prompt_tokens INTEGER DEFAULT 0,
          completion_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          cost_cents INTEGER DEFAULT 0,
          duration_ms INTEGER,
          status_code INTEGER,
          status VARCHAR(50),
          created_at TIMESTAMPTZ DEFAULT NOW(),

          INDEX idx_usage_user_time (user_id, created_at DESC),
          INDEX idx_usage_provider (provider, created_at DESC),
          INDEX idx_usage_origin (origin, created_at DESC)
        )
      `);

      console.log('[DatabaseRouter] Created usage_events table');

    } catch (error) {
      console.error('[DatabaseRouter] Run migrations error:', error);
    }
  }

  /**
   * Close all database connections
   */
  async closeAll() {
    if (this.defaultPool) {
      await this.defaultPool.end();
    }

    for (const [name, pool] of this.pools.entries()) {
      await pool.end();
      console.log(`[DatabaseRouter] Closed pool for ${name}`);
    }

    this.pools.clear();
  }

  /**
   * Get all database pools (for monitoring)
   */
  getPools() {
    return Array.from(this.pools.entries()).map(([name, pool]) => ({
      database: name,
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    }));
  }
}

module.exports = DatabaseRouter;

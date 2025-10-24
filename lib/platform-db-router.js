/**
 * Platform Database Router
 *
 * Routes database queries to the correct database based on:
 * - Platform (X, Kik, web, etc.)
 * - Device type (Gameboy, TV remote, Electron, phone)
 * - IP address (local vs cloud)
 * - Sub-agent context
 *
 * Features:
 * - Multi-platform database sharding
 * - Device-specific database isolation
 * - Automatic connection pooling per platform
 * - Query routing based on context
 * - Read replica support
 * - Fallback to default database
 */

const { Pool } = require('pg');
const EventEmitter = require('events');

class PlatformDatabaseRouter extends EventEmitter {
  constructor(options = {}) {
    super();

    // Default database config
    this.defaultConfig = {
      user: options.dbUser || process.env.DB_USER || 'matthewmauer',
      password: options.dbPassword || process.env.DB_PASSWORD || '',
      host: options.dbHost || process.env.DB_HOST || 'localhost',
      port: options.dbPort || process.env.DB_PORT || 5432,
      database: options.dbName || process.env.DB_NAME || 'calos',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    };

    // Platform-specific database configurations
    this.platformConfigs = new Map();

    // Device-specific database configurations
    this.deviceConfigs = new Map();

    // Active connection pools: Map<databaseId, Pool>
    this.pools = new Map();

    // Create default pool
    this.pools.set('default', new Pool(this.defaultConfig));

    // Platform → database mapping
    this.platformDatabases = {
      'x': 'x_platform_db',           // Twitter/X
      'kik': 'kik_platform_db',       // Kik messenger
      'web': 'default',               // Web platform uses default
      'gameboy': 'gameboy_device_db', // Gameboy device
      'tv-remote': 'tv_device_db',    // TV remote
      'electron': 'electron_app_db',  // Electron desktop app
      'phone': 'mobile_db',           // Generic phone
      'desktop': 'desktop_db',        // Generic desktop
      'cloud': 'cloud_db'             // Cloud services
    };

    // IP-based routing rules
    this.localIPPatterns = [
      /^127\./,           // localhost
      /^192\.168\./,      // private network
      /^10\./,            // private network
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./ // private network
    ];

    // Read replica support
    this.readReplicas = new Map(); // Map<databaseId, Array<replicaPool>>
    this.useReadReplicas = options.useReadReplicas !== false;

    // Query stats
    this.stats = {
      totalQueries: 0,
      queriesByPlatform: {},
      queriesByDevice: {},
      queriesByDatabase: {},
      failedQueries: 0
    };

    console.log('[PlatformDatabaseRouter] Initialized with default database:', this.defaultConfig.database);
  }

  /**
   * Register a platform-specific database
   */
  registerPlatformDatabase(platform, config) {
    const databaseId = this.platformDatabases[platform] || `${platform}_db`;

    // Merge with default config
    const fullConfig = { ...this.defaultConfig, ...config };

    // Create pool if not exists
    if (!this.pools.has(databaseId)) {
      this.pools.set(databaseId, new Pool(fullConfig));
      console.log(`[PlatformDatabaseRouter] Registered database for platform "${platform}": ${databaseId}`);
    }

    this.platformConfigs.set(platform, { databaseId, config: fullConfig });

    return databaseId;
  }

  /**
   * Register a device-specific database
   */
  registerDeviceDatabase(deviceType, config) {
    const databaseId = this.platformDatabases[deviceType] || `${deviceType}_db`;

    // Merge with default config
    const fullConfig = { ...this.defaultConfig, ...config };

    // Create pool if not exists
    if (!this.pools.has(databaseId)) {
      this.pools.set(databaseId, new Pool(fullConfig));
      console.log(`[PlatformDatabaseRouter] Registered database for device "${deviceType}": ${databaseId}`);
    }

    this.deviceConfigs.set(deviceType, { databaseId, config: fullConfig });

    return databaseId;
  }

  /**
   * Get database pool based on context
   */
  getPool(context = {}) {
    let databaseId = 'default';

    // Priority 1: Explicit database ID in context
    if (context.databaseId) {
      databaseId = context.databaseId;
    }
    // Priority 2: Platform-specific database
    else if (context.platform && this.platformDatabases[context.platform]) {
      databaseId = this.platformDatabases[context.platform];
    }
    // Priority 3: Device-specific database
    else if (context.deviceType && this.platformDatabases[context.deviceType]) {
      databaseId = this.platformDatabases[context.deviceType];
    }
    // Priority 4: IP-based routing
    else if (context.ipAddress) {
      if (this.isLocalIP(context.ipAddress)) {
        databaseId = context.isLocal === false ? 'cloud_db' : 'default';
      } else {
        databaseId = 'cloud_db';
      }
    }

    // Get pool or fall back to default
    let pool = this.pools.get(databaseId);
    if (!pool) {
      console.warn(`[PlatformDatabaseRouter] Database "${databaseId}" not found, using default`);
      pool = this.pools.get('default');
      databaseId = 'default';
    }

    return { pool, databaseId };
  }

  /**
   * Execute query with automatic routing
   */
  async query(sql, params = [], context = {}) {
    this.stats.totalQueries++;

    const { pool, databaseId } = this.getPool(context);

    // Update stats
    this.stats.queriesByDatabase[databaseId] = (this.stats.queriesByDatabase[databaseId] || 0) + 1;
    if (context.platform) {
      this.stats.queriesByPlatform[context.platform] = (this.stats.queriesByPlatform[context.platform] || 0) + 1;
    }
    if (context.deviceType) {
      this.stats.queriesByDevice[context.deviceType] = (this.stats.queriesByDevice[context.deviceType] || 0) + 1;
    }

    try {
      // Check if this is a read query and we should use replica
      const isReadQuery = this.isReadQuery(sql);
      if (isReadQuery && this.useReadReplicas) {
        const replica = this.getReadReplica(databaseId);
        if (replica) {
          const result = await replica.query(sql, params);
          this.emit('query', { databaseId, replica: true, sql, success: true });
          return result;
        }
      }

      // Execute on primary
      const result = await pool.query(sql, params);
      this.emit('query', { databaseId, replica: false, sql, success: true });
      return result;
    } catch (error) {
      this.stats.failedQueries++;
      this.emit('query_error', { databaseId, sql, error: error.message });
      console.error(`[PlatformDatabaseRouter] Query failed on ${databaseId}:`, error.message);
      throw error;
    }
  }

  /**
   * Execute query from sub-agent context
   */
  async queryFromContext(subAgentContext, sql, params = []) {
    const dbConfig = subAgentContext.getDatabaseConfig();
    return this.query(sql, params, dbConfig);
  }

  /**
   * Get a database client (for transactions)
   */
  async getClient(context = {}) {
    const { pool, databaseId } = this.getPool(context);
    const client = await pool.connect();

    // Attach metadata
    client._routerMetadata = { databaseId, context };

    return client;
  }

  /**
   * Check if IP is local
   */
  isLocalIP(ip) {
    if (!ip) return false;
    if (ip === 'localhost' || ip === '::1') return true;

    for (const pattern of this.localIPPatterns) {
      if (pattern.test(ip)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if query is a read query
   */
  isReadQuery(sql) {
    const upperSQL = sql.trim().toUpperCase();
    return upperSQL.startsWith('SELECT') ||
           upperSQL.startsWith('WITH') ||
           upperSQL.startsWith('SHOW') ||
           upperSQL.startsWith('DESCRIBE') ||
           upperSQL.startsWith('EXPLAIN');
  }

  /**
   * Register read replica for a database
   */
  registerReadReplica(databaseId, config) {
    const fullConfig = { ...this.defaultConfig, ...config };
    const replicaPool = new Pool(fullConfig);

    if (!this.readReplicas.has(databaseId)) {
      this.readReplicas.set(databaseId, []);
    }

    this.readReplicas.get(databaseId).push(replicaPool);

    console.log(`[PlatformDatabaseRouter] Registered read replica for ${databaseId}`);

    return replicaPool;
  }

  /**
   * Get read replica (round-robin)
   */
  getReadReplica(databaseId) {
    const replicas = this.readReplicas.get(databaseId);
    if (!replicas || replicas.length === 0) {
      return null;
    }

    // Simple round-robin
    const replica = replicas[Math.floor(Math.random() * replicas.length)];
    return replica;
  }

  /**
   * Create database if not exists (for platform/device setup)
   */
  async createDatabaseIfNotExists(databaseId, databaseName) {
    // Connect to default database to create new one
    const pool = this.pools.get('default');

    try {
      // Check if database exists
      const result = await pool.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [databaseName]
      );

      if (result.rows.length === 0) {
        // Create database
        await pool.query(`CREATE DATABASE ${databaseName}`);
        console.log(`[PlatformDatabaseRouter] Created database: ${databaseName}`);
      }

      return true;
    } catch (error) {
      console.error(`[PlatformDatabaseRouter] Error creating database ${databaseName}:`, error.message);
      throw error;
    }
  }

  /**
   * Initialize platform databases
   */
  async initializePlatformDatabases() {
    console.log('[PlatformDatabaseRouter] Initializing platform databases...');

    const platforms = Object.entries(this.platformDatabases);

    for (const [platform, databaseId] of platforms) {
      if (databaseId === 'default') continue;

      try {
        // For now, just ensure pool exists (in production, create actual separate databases)
        if (!this.pools.has(databaseId)) {
          const config = {
            ...this.defaultConfig,
            // In production, would use: database: databaseId
            // For now, use default database with schema isolation
          };

          this.pools.set(databaseId, new Pool(config));
          console.log(`[PlatformDatabaseRouter] Initialized pool for ${platform}: ${databaseId}`);
        }
      } catch (error) {
        console.error(`[PlatformDatabaseRouter] Error initializing ${platform}:`, error.message);
      }
    }

    console.log(`[PlatformDatabaseRouter] Initialized ${this.pools.size} database pools`);
  }

  /**
   * Get routing stats
   */
  getStats() {
    return {
      totalQueries: this.stats.totalQueries,
      failedQueries: this.stats.failedQueries,
      successRate: this.stats.totalQueries > 0
        ? ((this.stats.totalQueries - this.stats.failedQueries) / this.stats.totalQueries * 100).toFixed(2) + '%'
        : '100%',
      queriesByPlatform: this.stats.queriesByPlatform,
      queriesByDevice: this.stats.queriesByDevice,
      queriesByDatabase: this.stats.queriesByDatabase,
      activePools: this.pools.size,
      platforms: Object.keys(this.platformDatabases).length,
      readReplicas: Array.from(this.readReplicas.entries()).map(([db, replicas]) => ({
        database: db,
        replicaCount: replicas.length
      }))
    };
  }

  /**
   * Get pool info
   */
  getPoolInfo(databaseId = null) {
    if (databaseId) {
      const pool = this.pools.get(databaseId);
      if (!pool) return null;

      return {
        databaseId,
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      };
    }

    // Return all pools
    const poolsInfo = {};
    for (const [id, pool] of this.pools.entries()) {
      poolsInfo[id] = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      };
    }

    return poolsInfo;
  }

  /**
   * Close all database connections
   */
  async closeAll() {
    console.log(`[PlatformDatabaseRouter] Closing ${this.pools.size} database pools...`);

    const closePromises = [];

    // Close primary pools
    for (const [databaseId, pool] of this.pools.entries()) {
      closePromises.push(
        pool.end().then(() => {
          console.log(`[PlatformDatabaseRouter] Closed pool: ${databaseId}`);
        }).catch(err => {
          console.error(`[PlatformDatabaseRouter] Error closing ${databaseId}:`, err.message);
        })
      );
    }

    // Close read replicas
    for (const [databaseId, replicas] of this.readReplicas.entries()) {
      for (const replica of replicas) {
        closePromises.push(
          replica.end().then(() => {
            console.log(`[PlatformDatabaseRouter] Closed read replica for: ${databaseId}`);
          }).catch(err => {
            console.error(`[PlatformDatabaseRouter] Error closing replica:`, err.message);
          })
        );
      }
    }

    await Promise.all(closePromises);

    this.pools.clear();
    this.readReplicas.clear();

    console.log('[PlatformDatabaseRouter] All connections closed');
  }

  /**
   * Test connection for a platform
   */
  async testConnection(context = {}) {
    const { pool, databaseId } = this.getPool(context);

    try {
      const result = await pool.query('SELECT NOW(), current_database()');
      return {
        success: true,
        databaseId,
        timestamp: result.rows[0].now,
        database: result.rows[0].current_database
      };
    } catch (error) {
      return {
        success: false,
        databaseId,
        error: error.message
      };
    }
  }
}

module.exports = PlatformDatabaseRouter;

/**
 * Database Shard Manager
 *
 * Implements horizontal database sharding with consistent hashing for scalable
 * distributed data storage. Routes queries to appropriate shards based on shard keys.
 *
 * Features:
 * - Consistent hashing for minimal rebalancing
 * - Virtual nodes for better distribution
 * - Multi-shard query support
 * - Automatic failover and health monitoring
 * - Query routing based on shard keys
 * - Replication support
 */

const { Pool } = require('pg');
const crypto = require('crypto');

class ConsistentHashRing {
  constructor(virtualNodes = 150) {
    this.virtualNodes = virtualNodes;
    this.ring = new Map(); // hash -> node index
    this.sortedKeys = [];
  }

  /**
   * Add a node to the hash ring with virtual nodes
   */
  addNode(nodeIndex) {
    for (let i = 0; i < this.virtualNodes; i++) {
      const virtualKey = `${nodeIndex}:${i}`;
      const hash = this._hash(virtualKey);
      this.ring.set(hash, nodeIndex);
    }

    this.sortedKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  /**
   * Remove a node from the hash ring
   */
  removeNode(nodeIndex) {
    for (let i = 0; i < this.virtualNodes; i++) {
      const virtualKey = `${nodeIndex}:${i}`;
      const hash = this._hash(virtualKey);
      this.ring.delete(hash);
    }

    this.sortedKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  /**
   * Get node index for a given key
   */
  getNode(key) {
    if (this.sortedKeys.length === 0) {
      throw new Error('No nodes available in hash ring');
    }

    const hash = this._hash(key);

    // Find first node with hash >= key hash
    for (const nodeHash of this.sortedKeys) {
      if (nodeHash >= hash) {
        return this.ring.get(nodeHash);
      }
    }

    // Wrap around to first node
    return this.ring.get(this.sortedKeys[0]);
  }

  /**
   * Hash function using MD5
   */
  _hash(key) {
    return parseInt(
      crypto.createHash('md5')
        .update(String(key))
        .digest('hex')
        .substring(0, 8),
      16
    );
  }

  /**
   * Get distribution stats
   */
  getStats() {
    return {
      totalVirtualNodes: this.ring.size,
      virtualNodesPerNode: this.virtualNodes,
      uniqueNodes: new Set(this.ring.values()).size
    };
  }
}

class DatabaseShardManager {
  constructor(options = {}) {
    // Hash ring for consistent hashing
    this.hashRing = new ConsistentHashRing(options.virtualNodes || 150);

    // Shard pools
    this.shards = [];
    this.shardHealth = new Map(); // shard index -> health status

    // Configuration
    this.replicationFactor = options.replicationFactor || 1;
    this.healthCheckInterval = options.healthCheckInterval || 30000; // 30s

    // Statistics
    this.stats = {
      totalQueries: 0,
      queriesByShardKey: {},
      failovers: 0,
      rebalances: 0
    };

    // Start health monitoring
    if (options.autoHealthCheck !== false) {
      this._startHealthMonitoring();
    }
  }

  /**
   * Add a shard to the cluster
   *
   * @param {Object} config - Shard database configuration
   * @returns {number} Shard index
   */
  addShard(config) {
    const shardIndex = this.shards.length;

    // Create connection pool
    const pool = new Pool({
      host: config.host || 'localhost',
      port: config.port || 5432,
      database: config.database || 'calos',
      user: config.user || process.env.USER,
      password: config.password || '',
      max: config.maxConnections || 20,
      idleTimeoutMillis: config.idleTimeout || 30000,
      connectionTimeoutMillis: config.connectionTimeout || 2000
    });

    this.shards.push({
      index: shardIndex,
      pool,
      config,
      name: config.name || `shard-${shardIndex}`,
      weight: config.weight || 1
    });

    // Add to hash ring
    this.hashRing.addNode(shardIndex);

    // Initialize health status
    this.shardHealth.set(shardIndex, {
      healthy: true,
      lastCheck: new Date(),
      consecutiveFailures: 0
    });

    this.stats.rebalances++;

    console.log(`[ShardManager] Added shard ${shardIndex} (${config.name || config.host})`);

    return shardIndex;
  }

  /**
   * Remove a shard from the cluster
   *
   * @param {number} shardIndex - Index of shard to remove
   */
  async removeShard(shardIndex) {
    if (shardIndex >= this.shards.length) {
      throw new Error(`Shard ${shardIndex} does not exist`);
    }

    const shard = this.shards[shardIndex];

    // Remove from hash ring
    this.hashRing.removeNode(shardIndex);

    // Close connections
    await shard.pool.end();

    // Remove from arrays
    this.shards[shardIndex] = null;
    this.shardHealth.delete(shardIndex);

    this.stats.rebalances++;

    console.log(`[ShardManager] Removed shard ${shardIndex} (${shard.name})`);
  }

  /**
   * Execute query on appropriate shard based on shard key
   *
   * @param {string} shardKey - Key to determine shard (user_id, domain, etc.)
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Object} Query result
   */
  async query(shardKey, sql, params = []) {
    this.stats.totalQueries++;

    if (!this.stats.queriesByShardKey[shardKey]) {
      this.stats.queriesByShardKey[shardKey] = 0;
    }
    this.stats.queriesByShardKey[shardKey]++;

    // Get shard for key
    const shardIndex = this.hashRing.getNode(shardKey);
    const shard = this.shards[shardIndex];

    if (!shard) {
      throw new Error(`Shard ${shardIndex} not found for key ${shardKey}`);
    }

    // Check health
    const health = this.shardHealth.get(shardIndex);
    if (!health.healthy) {
      // Try failover to next shard
      console.warn(`[ShardManager] Shard ${shardIndex} unhealthy, attempting failover`);
      return await this._queryWithFailover(shardKey, sql, params, [shardIndex]);
    }

    try {
      const result = await shard.pool.query(sql, params);

      // Reset failure count on success
      health.consecutiveFailures = 0;

      return result;
    } catch (error) {
      console.error(`[ShardManager] Query failed on shard ${shardIndex}:`, error.message);

      // Increment failure count
      health.consecutiveFailures++;
      if (health.consecutiveFailures >= 3) {
        health.healthy = false;
        console.error(`[ShardManager] Marking shard ${shardIndex} as unhealthy`);
      }

      // Attempt failover
      return await this._queryWithFailover(shardKey, sql, params, [shardIndex]);
    }
  }

  /**
   * Execute query on all shards (for global operations)
   *
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Array} Array of results from each shard
   */
  async queryAll(sql, params = []) {
    const results = await Promise.allSettled(
      this.shards
        .filter(shard => shard !== null)
        .map(async (shard) => {
          const health = this.shardHealth.get(shard.index);
          if (!health.healthy) {
            return { shard: shard.index, error: 'Shard unhealthy' };
          }

          try {
            const result = await shard.pool.query(sql, params);
            return { shard: shard.index, result };
          } catch (error) {
            return { shard: shard.index, error: error.message };
          }
        })
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') {
        return r.value;
      } else {
        return { shard: i, error: r.reason?.message || 'Unknown error' };
      }
    });
  }

  /**
   * Query with automatic failover
   * @private
   */
  async _queryWithFailover(shardKey, sql, params, excludedShards = []) {
    this.stats.failovers++;

    // Find next healthy shard
    for (const shard of this.shards) {
      if (!shard || excludedShards.includes(shard.index)) {
        continue;
      }

      const health = this.shardHealth.get(shard.index);
      if (health.healthy) {
        console.log(`[ShardManager] Failover to shard ${shard.index}`);
        try {
          return await shard.pool.query(sql, params);
        } catch (error) {
          console.error(`[ShardManager] Failover failed on shard ${shard.index}:`, error.message);
          excludedShards.push(shard.index);
          continue;
        }
      }
    }

    throw new Error('No healthy shards available for failover');
  }

  /**
   * Health check for all shards
   * @private
   */
  async _healthCheck() {
    for (const shard of this.shards) {
      if (!shard) continue;

      const health = this.shardHealth.get(shard.index);

      try {
        await shard.pool.query('SELECT 1');
        health.healthy = true;
        health.lastCheck = new Date();
        health.consecutiveFailures = 0;
      } catch (error) {
        health.consecutiveFailures++;
        if (health.consecutiveFailures >= 3) {
          health.healthy = false;
          console.error(`[ShardManager] Health check failed for shard ${shard.index}: ${error.message}`);
        }
        health.lastCheck = new Date();
      }
    }
  }

  /**
   * Start automatic health monitoring
   * @private
   */
  _startHealthMonitoring() {
    this.healthCheckTimer = setInterval(async () => {
      await this._healthCheck();
    }, this.healthCheckInterval);

    console.log(`[ShardManager] Health monitoring started (interval: ${this.healthCheckInterval}ms)`);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      console.log('[ShardManager] Health monitoring stopped');
    }
  }

  /**
   * Get shard for a given key (for debugging/monitoring)
   *
   * @param {string} shardKey - Key to lookup
   * @returns {Object} Shard info
   */
  getShardForKey(shardKey) {
    const shardIndex = this.hashRing.getNode(shardKey);
    const shard = this.shards[shardIndex];
    const health = this.shardHealth.get(shardIndex);

    return {
      shardIndex,
      shardName: shard?.name,
      healthy: health?.healthy,
      host: shard?.config.host
    };
  }

  /**
   * Get cluster statistics
   */
  getStats() {
    const healthyShards = Array.from(this.shardHealth.values())
      .filter(h => h.healthy).length;

    const totalShards = this.shards.filter(s => s !== null).length;

    return {
      ...this.stats,
      totalShards,
      healthyShards,
      unhealthyShards: totalShards - healthyShards,
      healthCheckInterval: this.healthCheckInterval,
      replicationFactor: this.replicationFactor,
      hashRingStats: this.hashRing.getStats(),
      shardHealth: Array.from(this.shardHealth.entries()).map(([index, health]) => ({
        shard: index,
        name: this.shards[index]?.name,
        ...health
      }))
    };
  }

  /**
   * Get distribution of keys across shards (for testing/monitoring)
   */
  getDistribution(keys) {
    const distribution = {};

    for (const key of keys) {
      const shardIndex = this.hashRing.getNode(key);
      if (!distribution[shardIndex]) {
        distribution[shardIndex] = {
          count: 0,
          keys: [],
          shard: this.shards[shardIndex]?.name
        };
      }
      distribution[shardIndex].count++;
      distribution[shardIndex].keys.push(key);
    }

    return distribution;
  }

  /**
   * Close all shard connections
   */
  async close() {
    this.stopHealthMonitoring();

    await Promise.all(
      this.shards
        .filter(shard => shard !== null)
        .map(shard => shard.pool.end())
    );

    console.log('[ShardManager] All shard connections closed');
  }
}

module.exports = DatabaseShardManager;

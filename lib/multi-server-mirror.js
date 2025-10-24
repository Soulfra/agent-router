// Multi-Server Mirror System
//
// Primary deployment: Google Cloud (Cloud Run or GKE)
// Mirror replicas: Render, Railway, Replit
// Key-based access with eventual consistency

const axios = require('axios');
const crypto = require('crypto');

class MultiServerMirror {
  constructor(config = {}) {
    this.isPrimary = config.isPrimary || process.env.IS_PRIMARY_SERVER === 'true';
    this.primaryUrl = config.primaryUrl || process.env.PRIMARY_SERVER_URL;
    this.mirrorKey = config.mirrorKey || process.env.MIRROR_API_KEY;

    // Registered mirrors
    this.mirrors = config.mirrors || this.loadMirrorsFromEnv();

    // Sync queue
    this.syncQueue = [];
    this.syncInProgress = false;
    this.syncInterval = config.syncInterval || 5 * 60 * 1000; // 5 minutes

    // Health check
    this.healthCheckInterval = config.healthCheckInterval || 60 * 1000; // 1 minute
    this.mirrorHealth = new Map();

    console.log(`[MultiServerMirror] Initialized (${this.isPrimary ? 'PRIMARY' : 'MIRROR'})`);

    if (!this.isPrimary && this.primaryUrl) {
      console.log(`[MultiServerMirror] Connected to primary: ${this.primaryUrl}`);
    }

    if (this.isPrimary && this.mirrors.length > 0) {
      console.log(`[MultiServerMirror] Managing ${this.mirrors.length} mirrors`);
    }
  }

  /**
   * Load mirror configuration from environment
   */
  loadMirrorsFromEnv() {
    const mirrors = [];
    const mirrorUrls = process.env.MIRROR_SERVERS?.split(',') || [];

    for (const url of mirrorUrls) {
      if (url.trim()) {
        mirrors.push({
          url: url.trim(),
          name: new URL(url.trim()).hostname,
          key: process.env[`MIRROR_KEY_${mirrors.length + 1}`] || this.mirrorKey
        });
      }
    }

    return mirrors;
  }

  // ============================================================================
  // Write Operations (Primary Only)
  // ============================================================================

  /**
   * Record write operation for syncing
   * @param {string} operation - Operation type (insert, update, delete)
   * @param {string} table - Table name
   * @param {object} data - Data affected
   */
  recordWrite(operation, table, data) {
    if (!this.isPrimary) {
      throw new Error('Write operations only allowed on primary server');
    }

    const event = {
      id: crypto.randomBytes(16).toString('hex'),
      operation,
      table,
      data,
      timestamp: new Date().toISOString()
    };

    this.syncQueue.push(event);

    // Trigger sync if queue is large
    if (this.syncQueue.length >= 100) {
      this.syncToMirrors();
    }

    return event;
  }

  /**
   * Sync write operations to all mirrors
   */
  async syncToMirrors() {
    if (!this.isPrimary || this.syncInProgress || this.syncQueue.length === 0) {
      return;
    }

    this.syncInProgress = true;
    const eventsToSync = [...this.syncQueue];
    this.syncQueue = [];

    console.log(`[MultiServerMirror] Syncing ${eventsToSync.length} events to ${this.mirrors.length} mirrors`);

    for (const mirror of this.mirrors) {
      try {
        await this.syncToMirror(mirror, eventsToSync);
        console.log(`[MultiServerMirror] Synced to ${mirror.name}`);
      } catch (error) {
        console.error(`[MultiServerMirror] Failed to sync to ${mirror.name}:`, error.message);
        // Re-queue failed events (simple retry logic)
        this.syncQueue.push(...eventsToSync);
      }
    }

    this.syncInProgress = false;
  }

  /**
   * Sync events to a specific mirror
   * @param {object} mirror - Mirror configuration
   * @param {array} events - Events to sync
   */
  async syncToMirror(mirror, events) {
    const response = await axios.post(`${mirror.url}/api/mirror/sync`, {
      events
    }, {
      headers: {
        'Authorization': `Bearer ${mirror.key}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    return response.data;
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync() {
    if (!this.isPrimary) {
      console.warn('[MultiServerMirror] Periodic sync only runs on primary server');
      return;
    }

    this.syncTimer = setInterval(() => {
      this.syncToMirrors();
    }, this.syncInterval);

    console.log(`[MultiServerMirror] Periodic sync started (every ${this.syncInterval / 1000}s)`);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('[MultiServerMirror] Periodic sync stopped');
    }
  }

  // ============================================================================
  // Read Operations (All Servers)
  // ============================================================================

  /**
   * Fetch fresh data from primary (mirror servers only)
   * @param {string} endpoint - API endpoint to fetch
   * @param {object} params - Query parameters
   */
  async fetchFromPrimary(endpoint, params = {}) {
    if (this.isPrimary) {
      throw new Error('Primary server cannot fetch from itself');
    }

    if (!this.primaryUrl) {
      throw new Error('Primary server URL not configured');
    }

    try {
      const response = await axios.get(`${this.primaryUrl}${endpoint}`, {
        params,
        headers: {
          'Authorization': `Bearer ${this.mirrorKey}`
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      console.error('[MultiServerMirror] Error fetching from primary:', error.message);
      throw error;
    }
  }

  /**
   * Apply synced events (mirror servers only)
   * @param {array} events - Events from primary
   */
  async applyEvents(events) {
    if (this.isPrimary) {
      throw new Error('Primary server does not apply events from mirrors');
    }

    const results = [];

    for (const event of events) {
      try {
        const result = await this.applyEvent(event);
        results.push({ success: true, event: event.id, result });
      } catch (error) {
        console.error(`[MultiServerMirror] Error applying event ${event.id}:`, error.message);
        results.push({ success: false, event: event.id, error: error.message });
      }
    }

    return results;
  }

  /**
   * Apply single event
   * @param {object} event - Event to apply
   */
  async applyEvent(event) {
    // This would integrate with your database layer
    // For now, just log the event
    console.log(`[MultiServerMirror] Applying event: ${event.operation} on ${event.table}`);

    // In production, this would execute the actual database operation
    // Example:
    // if (event.operation === 'insert') {
    //   await pool.query(`INSERT INTO ${event.table} ...`, event.data);
    // }

    return { applied: true, eventId: event.id };
  }

  // ============================================================================
  // Health Checks
  // ============================================================================

  /**
   * Check health of all mirrors (primary only)
   */
  async checkMirrorHealth() {
    if (!this.isPrimary) return;

    for (const mirror of this.mirrors) {
      try {
        const start = Date.now();
        const response = await axios.get(`${mirror.url}/health`, { timeout: 5000 });
        const latency = Date.now() - start;

        this.mirrorHealth.set(mirror.name, {
          status: 'healthy',
          latency,
          lastCheck: new Date(),
          data: response.data
        });
      } catch (error) {
        this.mirrorHealth.set(mirror.name, {
          status: 'unhealthy',
          error: error.message,
          lastCheck: new Date()
        });
      }
    }

    return Object.fromEntries(this.mirrorHealth);
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    if (!this.isPrimary) {
      console.warn('[MultiServerMirror] Health checks only run on primary server');
      return;
    }

    this.healthCheckTimer = setInterval(() => {
      this.checkMirrorHealth();
    }, this.healthCheckInterval);

    console.log(`[MultiServerMirror] Health checks started (every ${this.healthCheckInterval / 1000}s)`);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      console.log('[MultiServerMirror] Health checks stopped');
    }
  }

  /**
   * Get mirror status
   */
  getMirrorStatus() {
    return {
      isPrimary: this.isPrimary,
      primaryUrl: this.primaryUrl,
      mirrors: this.mirrors.map(m => ({
        name: m.name,
        url: m.url,
        health: this.mirrorHealth.get(m.name) || { status: 'unknown' }
      })),
      syncQueue: this.syncQueue.length,
      syncInProgress: this.syncInProgress
    };
  }

  // ============================================================================
  // Failover
  // ============================================================================

  /**
   * Promote mirror to primary (in case of primary failure)
   */
  async promoteToPrimary() {
    if (this.isPrimary) {
      throw new Error('Already primary server');
    }

    console.log('[MultiServerMirror] Promoting to primary server...');

    this.isPrimary = true;
    this.primaryUrl = null;

    // Start primary-only services
    this.startPeriodicSync();
    this.startHealthChecks();

    console.log('[MultiServerMirror] Promoted to primary');

    return { isPrimary: true };
  }

  /**
   * Demote primary to mirror (manual override)
   * @param {string} newPrimaryUrl - New primary server URL
   */
  async demoteToMirror(newPrimaryUrl) {
    if (!this.isPrimary) {
      throw new Error('Already a mirror server');
    }

    console.log(`[MultiServerMirror] Demoting to mirror, new primary: ${newPrimaryUrl}`);

    this.isPrimary = false;
    this.primaryUrl = newPrimaryUrl;

    // Stop primary-only services
    this.stopPeriodicSync();
    this.stopHealthChecks();

    console.log('[MultiServerMirror] Demoted to mirror');

    return { isPrimary: false, primaryUrl: newPrimaryUrl };
  }

  // ============================================================================
  // Key Management
  // ============================================================================

  /**
   * Generate mirror API key
   * @param {string} mirrorName - Mirror server name
   */
  generateMirrorKey(mirrorName) {
    const key = `mirror_${crypto.randomBytes(32).toString('hex')}`;

    // In production, store this in database
    console.log(`[MultiServerMirror] Generated key for ${mirrorName}: ${key}`);

    return key;
  }

  /**
   * Verify mirror API key
   * @param {string} key - API key to verify
   */
  verifyMirrorKey(key) {
    // In production, verify against database
    return key === this.mirrorKey || key.startsWith('mirror_');
  }

  /**
   * Register new mirror
   * @param {string} url - Mirror server URL
   * @param {string} name - Mirror name
   */
  registerMirror(url, name) {
    if (!this.isPrimary) {
      throw new Error('Only primary server can register mirrors');
    }

    const key = this.generateMirrorKey(name);

    this.mirrors.push({
      url,
      name,
      key
    });

    console.log(`[MultiServerMirror] Registered mirror: ${name} (${url})`);

    return { url, name, key };
  }

  /**
   * Unregister mirror
   * @param {string} name - Mirror name
   */
  unregisterMirror(name) {
    if (!this.isPrimary) {
      throw new Error('Only primary server can unregister mirrors');
    }

    const index = this.mirrors.findIndex(m => m.name === name);

    if (index === -1) {
      throw new Error(`Mirror ${name} not found`);
    }

    this.mirrors.splice(index, 1);
    this.mirrorHealth.delete(name);

    console.log(`[MultiServerMirror] Unregistered mirror: ${name}`);

    return { success: true };
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * Get server role
   */
  getRole() {
    return this.isPrimary ? 'primary' : 'mirror';
  }

  /**
   * Get full status
   */
  getStatus() {
    return {
      role: this.getRole(),
      primaryUrl: this.primaryUrl,
      mirrors: this.mirrors.length,
      mirrorHealth: Object.fromEntries(this.mirrorHealth),
      syncQueue: this.syncQueue.length,
      syncInProgress: this.syncInProgress,
      syncInterval: this.syncInterval,
      healthCheckInterval: this.healthCheckInterval
    };
  }
}

module.exports = MultiServerMirror;

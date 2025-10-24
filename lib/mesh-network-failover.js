/**
 * Mesh Network Failover System
 *
 * P2P fallback for when centralized regions go down (US East outage scenario)
 *
 * Architecture:
 *   Primary: Region-based servers (US/EU/Asia)
 *      ↓ (outage detected)
 *   Fallback: Peer-to-peer mesh network
 *      ↓
 *   Distributed cache + eventual consistency
 *
 * Use Case:
 *   - US East goes down → EU region takes over
 *   - EU region overloaded → Mesh network distributes load
 *   - All regions down → P2P nodes serve cached responses
 */

const dgram = require('dgram');
const crypto = require('crypto');
const EventEmitter = require('events');

class MeshNetworkFailover extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      // Primary regions
      primaryRegions: options.primaryRegions || [
        { region: 'us-east', ip: process.env.US_EAST_IP, port: 5001 },
        { region: 'eu-central', ip: process.env.EU_CENTRAL_IP, port: 5001 },
        { region: 'asia-pacific', ip: process.env.ASIA_PACIFIC_IP, port: 5001 }
      ],

      // Mesh network config
      meshPort: options.meshPort || 6001,
      discoveryPort: options.discoveryPort || 6002,
      maxPeers: options.maxPeers || 50,
      heartbeatInterval: options.heartbeatInterval || 30000, // 30s

      // Failover thresholds
      healthCheckTimeout: options.healthCheckTimeout || 5000, // 5s
      maxFailures: options.maxFailures || 3,

      // Cache config
      cacheTTL: options.cacheTTL || 3600000, // 1 hour
      maxCacheSize: options.maxCacheSize || 10000 // 10k responses
    };

    // Internal state
    this.peers = new Map(); // { peerId: { ip, port, lastSeen, health } }
    this.cache = new Map(); // { requestHash: { response, timestamp } }
    this.regionHealth = new Map(); // { region: { failures: 0, lastCheck: timestamp } }
    this.meshServer = null;
    this.discoveryServer = null;
    this.activeRegion = null;
    this.meshModeEnabled = false;
  }

  /**
   * Initialize mesh network
   */
  async init() {
    // Set up UDP servers for mesh communication
    this.meshServer = dgram.createSocket('udp4');
    this.discoveryServer = dgram.createSocket('udp4');

    // Mesh server (data transfer)
    this.meshServer.on('message', (msg, rinfo) => {
      this._handleMeshMessage(msg, rinfo);
    });

    this.meshServer.bind(this.config.meshPort, () => {
      console.log(`🕸️  Mesh network listening on port ${this.config.meshPort}`);
    });

    // Discovery server (peer discovery)
    this.discoveryServer.on('message', (msg, rinfo) => {
      this._handleDiscoveryMessage(msg, rinfo);
    });

    this.discoveryServer.bind(this.config.discoveryPort, () => {
      console.log(`🔍 Peer discovery listening on port ${this.config.discoveryPort}`);
      this._broadcastPresence(); // Announce to network
    });

    // Start health checks
    this._startHealthChecks();

    // Start peer cleanup
    this._startPeerCleanup();

    return this;
  }

  /**
   * Route request with automatic failover
   */
  async route(request) {
    const requestHash = this._hashRequest(request);

    // Try primary regions first
    const activeRegion = this._selectHealthyRegion();

    if (activeRegion) {
      try {
        const response = await this._forwardToRegion(activeRegion, request);
        this._cacheResponse(requestHash, response);
        return { response, source: `region:${activeRegion.region}` };
      } catch (err) {
        console.error(`❌ Region ${activeRegion.region} failed:`, err.message);
        this._markRegionUnhealthy(activeRegion.region);
      }
    }

    // All regions down → Enable mesh mode
    console.warn('⚠️  All regions down, switching to mesh network');
    this.meshModeEnabled = true;
    this.emit('mesh-mode-enabled');

    // Check local cache first
    const cachedResponse = this._getCachedResponse(requestHash);
    if (cachedResponse) {
      return { response: cachedResponse, source: 'cache:local' };
    }

    // Query mesh network peers
    const meshResponse = await this._queryMeshNetwork(request);
    if (meshResponse) {
      this._cacheResponse(requestHash, meshResponse);
      return { response: meshResponse, source: 'mesh:peer' };
    }

    // Everything failed
    throw new Error('No healthy regions or peers available');
  }

  /**
   * Select healthiest region
   */
  _selectHealthyRegion() {
    const healthyRegions = this.config.primaryRegions.filter(region => {
      const health = this.regionHealth.get(region.region);
      return !health || health.failures < this.config.maxFailures;
    });

    if (healthyRegions.length === 0) return null;

    // Simple round-robin (can be replaced with latency-based selection)
    return healthyRegions[Math.floor(Math.random() * healthyRegions.length)];
  }

  /**
   * Forward request to region
   */
  async _forwardToRegion(region, request) {
    const url = `http://${region.ip}:${region.port}/api/route`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Mark region healthy
      this.regionHealth.set(region.region, { failures: 0, lastCheck: Date.now() });

      return await response.json();
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  /**
   * Mark region as unhealthy
   */
  _markRegionUnhealthy(regionName) {
    const health = this.regionHealth.get(regionName) || { failures: 0, lastCheck: 0 };
    health.failures += 1;
    health.lastCheck = Date.now();
    this.regionHealth.set(regionName, health);

    if (health.failures >= this.config.maxFailures) {
      console.error(`🚨 Region ${regionName} marked as unhealthy (${health.failures} failures)`);
      this.emit('region-unhealthy', { region: regionName, failures: health.failures });
    }
  }

  /**
   * Query mesh network for response
   */
  async _queryMeshNetwork(request) {
    if (this.peers.size === 0) {
      console.warn('⚠️  No mesh peers available');
      return null;
    }

    const requestHash = this._hashRequest(request);
    const message = JSON.stringify({ type: 'query', hash: requestHash, request });

    // Broadcast query to all peers
    const promises = Array.from(this.peers.values()).map(peer => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

        this.meshServer.send(message, peer.port, peer.ip, (err) => {
          clearTimeout(timeout);
          if (err) reject(err);
          else resolve();
        });
      }).catch(() => null); // Ignore individual failures
    });

    await Promise.all(promises);

    // Wait for first peer response (handled in _handleMeshMessage)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 10000);

      this.once(`mesh-response:${requestHash}`, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
  }

  /**
   * Handle mesh network messages
   */
  _handleMeshMessage(msg, rinfo) {
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === 'query') {
        // Peer is querying us
        const cachedResponse = this._getCachedResponse(data.hash);
        if (cachedResponse) {
          const reply = JSON.stringify({ type: 'response', hash: data.hash, response: cachedResponse });
          this.meshServer.send(reply, rinfo.port, rinfo.address);
        }
      }

      if (data.type === 'response') {
        // Peer sent us a cached response
        this.emit(`mesh-response:${data.hash}`, data.response);
      }
    } catch (err) {
      console.error('❌ Invalid mesh message:', err.message);
    }
  }

  /**
   * Handle peer discovery messages
   */
  _handleDiscoveryMessage(msg, rinfo) {
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === 'announce') {
        // New peer announcing presence
        const peerId = `${rinfo.address}:${data.meshPort}`;

        if (!this.peers.has(peerId) && this.peers.size < this.config.maxPeers) {
          this.peers.set(peerId, {
            ip: rinfo.address,
            port: data.meshPort,
            lastSeen: Date.now(),
            health: 'healthy'
          });

          console.log(`🆕 New peer discovered: ${peerId} (${this.peers.size} total)`);
          this.emit('peer-discovered', peerId);
        }

        // Update last seen
        const peer = this.peers.get(peerId);
        if (peer) {
          peer.lastSeen = Date.now();
        }
      }
    } catch (err) {
      console.error('❌ Invalid discovery message:', err.message);
    }
  }

  /**
   * Broadcast presence to network
   */
  _broadcastPresence() {
    const message = JSON.stringify({
      type: 'announce',
      meshPort: this.config.meshPort
    });

    // Broadcast to local network (can be extended to WAN)
    const broadcastAddress = '255.255.255.255';
    this.discoveryServer.setBroadcast(true);
    this.discoveryServer.send(message, this.config.discoveryPort, broadcastAddress);

    // Re-broadcast every 30s
    setTimeout(() => this._broadcastPresence(), this.config.heartbeatInterval);
  }

  /**
   * Start health checks for regions
   */
  _startHealthChecks() {
    setInterval(async () => {
      for (const region of this.config.primaryRegions) {
        try {
          const url = `http://${region.ip}:${region.port}/health`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);

          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);

          if (response.ok) {
            // Reset failures on successful health check
            this.regionHealth.set(region.region, { failures: 0, lastCheck: Date.now() });

            // Disable mesh mode if region is healthy again
            if (this.meshModeEnabled) {
              console.log(`✅ Region ${region.region} recovered, disabling mesh mode`);
              this.meshModeEnabled = false;
              this.emit('mesh-mode-disabled');
            }
          }
        } catch (err) {
          this._markRegionUnhealthy(region.region);
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Clean up stale peers
   */
  _startPeerCleanup() {
    setInterval(() => {
      const now = Date.now();
      const staleTimeout = this.config.heartbeatInterval * 3; // 90s

      for (const [peerId, peer] of this.peers.entries()) {
        if (now - peer.lastSeen > staleTimeout) {
          console.log(`🗑️  Removing stale peer: ${peerId}`);
          this.peers.delete(peerId);
          this.emit('peer-removed', peerId);
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Cache response
   */
  _cacheResponse(requestHash, response) {
    // Evict oldest if cache is full
    if (this.cache.size >= this.config.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(requestHash, {
      response,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached response
   */
  _getCachedResponse(requestHash) {
    const cached = this.cache.get(requestHash);

    if (!cached) return null;

    // Check if cache expired
    if (Date.now() - cached.timestamp > this.config.cacheTTL) {
      this.cache.delete(requestHash);
      return null;
    }

    return cached.response;
  }

  /**
   * Hash request for caching
   */
  _hashRequest(request) {
    const canonical = JSON.stringify(request);
    return crypto.createHash('sha256').update(canonical).digest('hex').substring(0, 16);
  }

  /**
   * Shutdown mesh network
   */
  async shutdown() {
    if (this.meshServer) this.meshServer.close();
    if (this.discoveryServer) this.discoveryServer.close();
    console.log('🛑 Mesh network shut down');
  }
}

module.exports = MeshNetworkFailover;

/**
 * Domain Ecosystem Orchestrator
 *
 * Coordinates multiple paired domains working together.
 * Manages cross-domain communication, service discovery, and health monitoring.
 *
 * This is the glue that makes the domain pairing strategy work.
 */

const EventEmitter = require('events');
const DomainRegistry = require('./domain-registry');
const domainPairing = require('./domain-pairing');
const { IPCPipeSystem } = require('./ipc-pipe-system');

class DomainEcosystem extends EventEmitter {
  constructor(options = {}) {
    super();

    // Domain registry
    this.registry = new DomainRegistry();

    // IPC system for cross-domain communication
    this.ipc = options.ipcSystem || new IPCPipeSystem();

    // Cross-domain pipes: Map<{from, to}, pipeId>
    this.crossDomainPipes = new Map();

    // Service proxies: Map<service, proxyFunction>
    this.serviceProxies = new Map();

    // Health check interval
    this.healthCheckInterval = options.healthCheckInterval || 30000; // 30 seconds
    this.healthCheckTimer = null;

    // Enabled domains
    this.enabledDomains = options.domains || [];

    // Stats
    this.stats = {
      crossDomainCalls: 0,
      failedCalls: 0,
      totalServices: 0
    };

    console.log('[DomainEcosystem] Initialized with', this.enabledDomains.length, 'domains');

    // Listen to registry events
    this.registry.on('domain_registered', (info) => {
      this.onDomainRegistered(info);
    });

    this.registry.on('domain_unregistered', (info) => {
      this.onDomainUnregistered(info);
    });
  }

  /**
   * Initialize the ecosystem
   */
  async initialize() {
    console.log('[DomainEcosystem] Initializing ecosystem...');

    // Register enabled domains
    for (const domain of this.enabledDomains) {
      try {
        await this.registerDomain(domain);
      } catch (error) {
        console.error(`[DomainEcosystem] Failed to register ${domain}:`, error.message);
      }
    }

    // Validate configuration
    const validation = this.registry.validate();
    if (!validation.valid) {
      console.error('[DomainEcosystem] Configuration errors:', validation.errors);
    }
    if (validation.warnings.length > 0) {
      console.warn('[DomainEcosystem] Configuration warnings:', validation.warnings);
    }

    // Start health monitoring
    this.startHealthMonitoring();

    // Create cross-domain pipes
    await this.createCrossDomainPipes();

    console.log('[DomainEcosystem] Ecosystem initialized');
    console.log('[DomainEcosystem] Active domains:', this.registry.activeDomains.size);
    console.log('[DomainEcosystem] Available services:', this.registry.serviceEndpoints.size);

    this.emit('initialized', {
      domains: this.registry.activeDomains.size,
      services: this.registry.serviceEndpoints.size
    });
  }

  /**
   * Register a domain
   */
  async registerDomain(domain, options = {}) {
    const config = domainPairing.getDomain(domain);
    if (!config) {
      throw new Error(`Unknown domain: ${domain}`);
    }

    // Check dependencies
    const deps = domainPairing.getRequiredDependencies(domain);
    for (const requiredDomain of deps) {
      if (!this.registry.isActive(requiredDomain)) {
        console.warn(`[DomainEcosystem] ${domain} requires ${requiredDomain} which is not active`);
      }
    }

    // Register in registry
    const domainInfo = this.registry.register(domain, options);

    // Create service proxies
    for (const service of config.provides || []) {
      this.createServiceProxy(service, domain);
    }

    this.emit('domain_registered', domainInfo);

    return domainInfo;
  }

  /**
   * Unregister a domain
   */
  async unregisterDomain(domain) {
    // Remove service proxies
    const config = domainPairing.getDomain(domain);
    if (config) {
      for (const service of config.provides || []) {
        this.serviceProxies.delete(service);
      }
    }

    // Unregister from registry
    const result = this.registry.unregister(domain);

    this.emit('domain_unregistered', { domain });

    return result;
  }

  /**
   * Create cross-domain communication pipes
   */
  async createCrossDomainPipes() {
    console.log('[DomainEcosystem] Creating cross-domain pipes...');

    let pipeCount = 0;

    for (const domain of this.registry.activeDomains.keys()) {
      const pairedDomains = domainPairing.getPairedDomains(domain);

      for (const pair of pairedDomains) {
        if (!this.registry.isActive(pair.domain)) continue;

        // Create bidirectional pipe
        const pipeKey = this.getPipeKey(domain, pair.domain);

        if (!this.crossDomainPipes.has(pipeKey)) {
          const pipeId = this.ipc.createPipe(domain, pair.domain, {
            protocol: 'ipc',
            bidirectional: true,
            metadata: { type: 'cross-domain' }
          });

          this.crossDomainPipes.set(pipeKey, pipeId);
          pipeCount++;
        }
      }
    }

    console.log(`[DomainEcosystem] Created ${pipeCount} cross-domain pipes`);
  }

  /**
   * Get pipe key for domain pair
   */
  getPipeKey(domain1, domain2) {
    // Always use alphabetical order for consistency
    return [domain1, domain2].sort().join('↔');
  }

  /**
   * Create service proxy
   */
  createServiceProxy(service, domain) {
    const endpoint = this.registry.getServiceEndpoint(service);
    if (!endpoint) return;

    // Create proxy function
    const proxyFn = async (method, params) => {
      this.stats.crossDomainCalls++;

      try {
        // In production, make HTTP/WebSocket call to endpoint
        // For now, emit event for local handling
        const result = await this.callService(service, domain, method, params);

        return result;
      } catch (error) {
        this.stats.failedCalls++;
        console.error(`[DomainEcosystem] Service call failed: ${service}.${method}`, error.message);
        throw error;
      }
    };

    this.serviceProxies.set(service, proxyFn);
    this.stats.totalServices++;
  }

  /**
   * Call a service
   */
  async callService(service, domain, method, params) {
    const endpoint = this.registry.getServiceEndpoint(service);
    if (!endpoint) {
      throw new Error(`Service not available: ${service}`);
    }

    // Emit event for service call
    this.emit('service_call', {
      service,
      domain,
      method,
      params,
      timestamp: new Date()
    });

    // In production, make actual HTTP/WebSocket call
    // For now, return mock response
    return {
      success: true,
      service,
      method,
      result: `Mock result for ${service}.${method}`
    };
  }

  /**
   * Get service proxy
   */
  getService(service) {
    return this.serviceProxies.get(service) || null;
  }

  /**
   * Check if service is available
   */
  hasService(service) {
    return this.registry.isServiceAvailable(service);
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.healthCheckInterval);

    console.log(`[DomainEcosystem] Health monitoring started (${this.healthCheckInterval}ms interval)`);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Perform health checks on all domains
   */
  async performHealthChecks() {
    for (const domain of this.registry.activeDomains.keys()) {
      try {
        // In production, ping domain endpoint
        const health = await this.checkDomainHealth(domain);

        this.registry.updateHealth(domain, health.status, {
          responseTime: health.responseTime,
          lastCheck: new Date()
        });
      } catch (error) {
        this.registry.updateHealth(domain, 'unhealthy', {
          error: error.message,
          lastCheck: new Date()
        });
      }
    }

    // Emit ecosystem health
    const ecosystemHealth = this.registry.getEcosystemHealth();
    this.emit('health_check', ecosystemHealth);
  }

  /**
   * Check individual domain health
   */
  async checkDomainHealth(domain) {
    // In production, make actual health check HTTP request
    // For now, return mock healthy status
    return {
      status: 'healthy',
      responseTime: Math.random() * 100 // Mock response time
    };
  }

  /**
   * Handle domain registered event
   */
  async onDomainRegistered(domainInfo) {
    console.log(`[DomainEcosystem] Domain registered: ${domainInfo.domain}`);

    // Create pipes to paired domains
    const pairedDomains = domainPairing.getPairedDomains(domainInfo.domain);
    for (const pair of pairedDomains) {
      if (this.registry.isActive(pair.domain)) {
        const pipeKey = this.getPipeKey(domainInfo.domain, pair.domain);

        if (!this.crossDomainPipes.has(pipeKey)) {
          const pipeId = this.ipc.createPipe(domainInfo.domain, pair.domain, {
            protocol: 'ipc',
            bidirectional: true,
            metadata: { type: 'cross-domain' }
          });

          this.crossDomainPipes.set(pipeKey, pipeId);
        }
      }
    }
  }

  /**
   * Handle domain unregistered event
   */
  async onDomainUnregistered(info) {
    console.log(`[DomainEcosystem] Domain unregistered: ${info.domain}`);

    // Close pipes involving this domain
    for (const [pipeKey, pipeId] of this.crossDomainPipes.entries()) {
      if (pipeKey.includes(info.domain)) {
        this.ipc.closePipe(pipeId);
        this.crossDomainPipes.delete(pipeKey);
      }
    }
  }

  /**
   * Get ecosystem stats
   */
  getStats() {
    return {
      ...this.stats,
      registry: this.registry.getStats(),
      health: this.registry.getEcosystemHealth(),
      pipes: this.crossDomainPipes.size,
      ipc: this.ipc.getStats()
    };
  }

  /**
   * Get ecosystem status
   */
  getStatus() {
    const stats = this.getStats();

    return {
      status: stats.health.overallStatus,
      domains: stats.registry.activeDomains,
      services: stats.registry.availableServices,
      health: stats.health,
      pipes: stats.pipes,
      calls: {
        total: stats.crossDomainCalls,
        failed: stats.failedCalls,
        successRate: stats.crossDomainCalls > 0
          ? ((stats.crossDomainCalls - stats.failedCalls) / stats.crossDomainCalls * 100).toFixed(2) + '%'
          : '100%'
      }
    };
  }

  /**
   * Shutdown ecosystem
   */
  async shutdown() {
    console.log('[DomainEcosystem] Shutting down...');

    // Stop health monitoring
    this.stopHealthMonitoring();

    // Close all pipes
    for (const pipeId of this.crossDomainPipes.values()) {
      this.ipc.closePipe(pipeId);
    }
    this.crossDomainPipes.clear();

    // Unregister all domains
    for (const domain of Array.from(this.registry.activeDomains.keys())) {
      await this.unregisterDomain(domain);
    }

    // Shutdown IPC
    await this.ipc.shutdown();

    this.removeAllListeners();

    console.log('[DomainEcosystem] Shutdown complete');
  }
}

module.exports = DomainEcosystem;

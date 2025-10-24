/**
 * Domain Registry
 *
 * Tracks which domains are active in the current runtime.
 * Allows dynamic discovery of available paired services.
 */

const EventEmitter = require('events');
const domainPairing = require('./domain-pairing');

class DomainRegistry extends EventEmitter {
  constructor() {
    super();

    // Active domains: Map<domain, domainInfo>
    this.activeDomains = new Map();

    // Service endpoints: Map<service, {domain, endpoint}>
    this.serviceEndpoints = new Map();

    // Domain health status
    this.healthStatus = new Map();

    console.log('[DomainRegistry] Initialized');
  }

  /**
   * Register a domain as active
   */
  register(domain, options = {}) {
    const config = domainPairing.getDomain(domain);
    if (!config) {
      throw new Error(`Unknown domain: ${domain}`);
    }

    const domainInfo = {
      domain,
      config,
      registeredAt: new Date(),
      status: 'active',
      baseUrl: options.baseUrl || `https://${domain}`,
      version: options.version || '1.0.0',
      metadata: options.metadata || {}
    };

    this.activeDomains.set(domain, domainInfo);

    // Register service endpoints
    for (const service of config.provides || []) {
      this.registerService(service, domain, domainInfo.baseUrl);
    }

    // Initialize health status
    this.healthStatus.set(domain, {
      status: 'healthy',
      lastCheck: new Date(),
      uptime: 0
    });

    console.log(`[DomainRegistry] Registered ${domain} (${config.provides?.length || 0} services)`);

    this.emit('domain_registered', domainInfo);

    return domainInfo;
  }

  /**
   * Register a service endpoint
   */
  registerService(service, domain, baseUrl) {
    const config = domainPairing.getDomain(domain);
    if (!config) return;

    const endpointPath = config.endpoints?.[service] || `/api/v1/service/${service}`;
    const fullEndpoint = `${baseUrl}${endpointPath}`;

    this.serviceEndpoints.set(service, {
      domain,
      endpoint: fullEndpoint,
      registeredAt: new Date()
    });

    console.log(`[DomainRegistry] Registered service: ${service} → ${fullEndpoint}`);
  }

  /**
   * Unregister a domain
   */
  unregister(domain) {
    const domainInfo = this.activeDomains.get(domain);
    if (!domainInfo) {
      return false;
    }

    // Remove service endpoints
    const config = domainInfo.config;
    for (const service of config.provides || []) {
      this.serviceEndpoints.delete(service);
    }

    // Remove domain
    this.activeDomains.delete(domain);
    this.healthStatus.delete(domain);

    console.log(`[DomainRegistry] Unregistered ${domain}`);

    this.emit('domain_unregistered', { domain });

    return true;
  }

  /**
   * Check if a domain is active
   */
  isActive(domain) {
    return this.activeDomains.has(domain);
  }

  /**
   * Get active domain info
   */
  getDomain(domain) {
    return this.activeDomains.get(domain) || null;
  }

  /**
   * Get all active domains
   */
  getAllDomains() {
    return Array.from(this.activeDomains.values());
  }

  /**
   * Find service endpoint
   */
  getServiceEndpoint(service) {
    return this.serviceEndpoints.get(service) || null;
  }

  /**
   * Check if a service is available
   */
  isServiceAvailable(service) {
    return this.serviceEndpoints.has(service);
  }

  /**
   * Get all available services
   */
  getAvailableServices() {
    return Array.from(this.serviceEndpoints.keys());
  }

  /**
   * Get services provided by a domain
   */
  getDomainServices(domain) {
    const config = domainPairing.getDomain(domain);
    if (!config) return [];

    return config.provides || [];
  }

  /**
   * Check if required dependencies are met
   */
  checkDependencies(domain) {
    const required = domainPairing.getRequiredDependencies(domain);
    const missing = [];

    for (const requiredDomain of required) {
      if (!this.isActive(requiredDomain)) {
        missing.push(requiredDomain);
      }
    }

    return {
      satisfied: missing.length === 0,
      missing
    };
  }

  /**
   * Get paired domains that are active
   */
  getActivePairs(domain) {
    const pairedDomains = domainPairing.getPairedDomains(domain);
    return pairedDomains.filter(pair => this.isActive(pair.domain));
  }

  /**
   * Update domain health status
   */
  updateHealth(domain, status, metadata = {}) {
    if (!this.activeDomains.has(domain)) {
      return false;
    }

    this.healthStatus.set(domain, {
      status, // 'healthy', 'degraded', 'unhealthy'
      lastCheck: new Date(),
      ...metadata
    });

    this.emit('health_updated', { domain, status, metadata });

    return true;
  }

  /**
   * Get domain health
   */
  getHealth(domain) {
    return this.healthStatus.get(domain) || null;
  }

  /**
   * Get overall ecosystem health
   */
  getEcosystemHealth() {
    const health = {
      totalDomains: this.activeDomains.size,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      domains: {}
    };

    for (const [domain, status] of this.healthStatus.entries()) {
      health.domains[domain] = status;

      if (status.status === 'healthy') health.healthy++;
      else if (status.status === 'degraded') health.degraded++;
      else if (status.status === 'unhealthy') health.unhealthy++;
    }

    health.overallStatus = health.unhealthy > 0 ? 'unhealthy'
      : health.degraded > 0 ? 'degraded'
      : 'healthy';

    return health;
  }

  /**
   * Validate ecosystem configuration
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Validate domain pairing config
    const pairingErrors = domainPairing.validatePairingConfig();
    errors.push(...pairingErrors);

    // Check for missing dependencies
    for (const [domain, domainInfo] of this.activeDomains.entries()) {
      const deps = this.checkDependencies(domain);
      if (!deps.satisfied) {
        warnings.push(`${domain} is missing required dependencies: ${deps.missing.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get registry stats
   */
  getStats() {
    return {
      activeDomains: this.activeDomains.size,
      availableServices: this.serviceEndpoints.size,
      health: this.getEcosystemHealth(),
      domains: this.getAllDomains().map(d => ({
        domain: d.domain,
        services: d.config.provides?.length || 0,
        status: this.healthStatus.get(d.domain)?.status || 'unknown'
      }))
    };
  }

  /**
   * Export registry state (for debugging/monitoring)
   */
  exportState() {
    return {
      timestamp: new Date(),
      activeDomains: Array.from(this.activeDomains.entries()),
      serviceEndpoints: Array.from(this.serviceEndpoints.entries()),
      healthStatus: Array.from(this.healthStatus.entries()),
      stats: this.getStats()
    };
  }
}

module.exports = DomainRegistry;

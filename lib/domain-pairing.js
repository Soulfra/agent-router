/**
 * Domain Pairing Configuration
 *
 * Defines how domains work together in the ecosystem.
 * Each domain provides services and requires services from paired domains.
 *
 * The pairing strategy creates a network effect where:
 * - Domains can be forked independently
 * - But are more valuable when paired together
 * - Each domain specializes in one piece of the ecosystem
 */

module.exports = {
  /**
   * CALOS.ai - Agent Runtime Service
   * The operating system for AI agents
   */
  'calos.ai': {
    provides: [
      'agent-runtime',      // Core agent execution
      'worker-context',     // Sub-agent context inheritance
      'ipc',                // Inter-process communication
      'platform-routing',   // Multi-platform database routing
      'device-management'   // Device-specific isolation
    ],
    requires: [
      'soulfra.com/auth',         // User authentication
      'soulfra.com/sso',          // Single sign-on
      'deathtodata.com/search',   // Context overflow search
      'roughsparks.com/content'   // Agent-generated content
    ],
    pairs: ['soulfra.com', 'deathtodata.com'],
    description: 'Operating system for AI agents',
    package: '@calos/agent-runtime',
    endpoints: {
      runtime: '/api/v1/service/runtime',
      workers: '/api/v1/service/workers',
      context: '/api/v1/service/context'
    },
    dependencies: {
      required: ['soulfra.com'],  // Must have auth
      optional: ['deathtodata.com', 'roughsparks.com']
    },
    color: '#00BFFF',  // Deep sky blue
    icon: '🤖'
  },

  /**
   * Soulfra.com - Universal SSO & Authentication
   * The identity layer for the ecosystem
   */
  'soulfra.com': {
    provides: [
      'auth',              // Authentication
      'sso',               // Single sign-on
      'oauth',             // OAuth providers
      'voice-auth',        // Voice signature auth
      'proof-of-life'      // Liveness detection
    ],
    requires: [
      'calos.ai/agent-runtime',   // Agent runtime for auth workers
      'roughsparks.com/content'   // Profile content generation
    ],
    pairs: ['calos.ai', 'roughsparks.com'],
    description: 'Universal SSO and authentication',
    package: '@soulfra/auth-gateway',
    endpoints: {
      auth: '/api/v1/service/auth',
      oauth: '/api/v1/service/oauth',
      voice: '/api/v1/service/voice-auth'
    },
    dependencies: {
      required: ['calos.ai'],  // Needs runtime for auth agents
      optional: ['roughsparks.com']
    },
    color: '#9370DB',  // Medium purple
    icon: '🔐'
  },

  /**
   * DeathToData.com - Search Engine & SEO
   * The indexing and discovery layer
   */
  'deathtodata.com': {
    provides: [
      'search',            // Search engine
      'seo',               // Programmatic SEO
      'indexing',          // Content indexing
      'context-fetch',     // External context fetching
      'overflow-handler'   // Context overflow management
    ],
    requires: [
      'calos.ai/agent-runtime', // Agent runtime for search workers
      'roughsparks.com/content' // Content to index
    ],
    pairs: ['calos.ai', 'roughsparks.com'],
    description: 'Search engine philosophy and programmatic SEO',
    package: '@deathtodata/search-engine',
    endpoints: {
      search: '/api/v1/service/search',
      index: '/api/v1/service/index',
      overflow: '/api/v1/service/overflow'
    },
    dependencies: {
      required: ['calos.ai'],  // Needs runtime for indexing agents
      optional: ['roughsparks.com']
    },
    color: '#FF4500',  // Orange red
    icon: '🔍'
  },

  /**
   * RoughSparks.com - Content Generation
   * The creative and content layer
   */
  'roughsparks.com': {
    provides: [
      'content',           // Content generation
      'multi-brand',       // Multi-brand posting
      'cal-riven',         // Cal Riven agent
      'voice-sync',        // Voice cross-device sync
      'creative'           // Creative sparks
    ],
    requires: [
      'calos.ai/agent-runtime', // Agent runtime for content workers
      'soulfra.com/auth',       // Attribution and identity
      'deathtodata.com/search'  // Topic discovery
    ],
    pairs: ['calos.ai', 'soulfra.com', 'deathtodata.com'],
    description: 'Creative sparks and idea generation',
    package: '@roughsparks/content-gen',
    endpoints: {
      generate: '/api/v1/service/generate',
      brands: '/api/v1/service/brands',
      voice: '/api/v1/service/voice'
    },
    dependencies: {
      required: ['calos.ai'],  // Needs runtime for content agents
      optional: ['soulfra.com', 'deathtodata.com']
    },
    color: '#FFD700',  // Gold
    icon: '✨'
  }
};

/**
 * Get domain configuration
 */
function getDomain(domain) {
  return module.exports[domain] || null;
}

/**
 * Get all paired domains for a domain
 */
function getPairedDomains(domain) {
  const config = getDomain(domain);
  if (!config) return [];

  return config.pairs.map(pairedDomain => ({
    domain: pairedDomain,
    config: getDomain(pairedDomain)
  }));
}

/**
 * Check if two domains are paired
 */
function arePaired(domain1, domain2) {
  const config1 = getDomain(domain1);
  if (!config1) return false;

  return config1.pairs.includes(domain2);
}

/**
 * Get required dependencies for a domain
 */
function getRequiredDependencies(domain) {
  const config = getDomain(domain);
  if (!config) return [];

  return config.dependencies.required || [];
}

/**
 * Get optional dependencies for a domain
 */
function getOptionalDependencies(domain) {
  const config = getDomain(domain);
  if (!config) return [];

  return config.dependencies.optional || [];
}

/**
 * Get all services provided by a domain
 */
function getProvidedServices(domain) {
  const config = getDomain(domain);
  if (!config) return [];

  return config.provides || [];
}

/**
 * Get all services required by a domain
 */
function getRequiredServices(domain) {
  const config = getDomain(domain);
  if (!config) return [];

  return config.requires || [];
}

/**
 * Find which domain provides a specific service
 */
function findServiceProvider(service) {
  for (const [domain, config] of Object.entries(module.exports)) {
    if (typeof config === 'object' && config.provides?.includes(service)) {
      return domain;
    }
  }
  return null;
}

/**
 * Validate domain pairing configuration
 */
function validatePairingConfig() {
  const errors = [];

  for (const [domain, config] of Object.entries(module.exports)) {
    if (typeof config !== 'object') continue;

    // Check that all required services exist
    for (const requirement of config.requires || []) {
      const [requiredDomain, service] = requirement.split('/');
      const providerConfig = getDomain(requiredDomain);

      if (!providerConfig) {
        errors.push(`${domain} requires ${requiredDomain} which doesn't exist`);
      } else if (!providerConfig.provides?.includes(service)) {
        errors.push(`${domain} requires ${service} from ${requiredDomain}, but it doesn't provide it`);
      }
    }

    // Check that all paired domains exist
    for (const pairedDomain of config.pairs || []) {
      if (!getDomain(pairedDomain)) {
        errors.push(`${domain} is paired with ${pairedDomain} which doesn't exist`);
      }
    }
  }

  return errors;
}

module.exports.getDomain = getDomain;
module.exports.getPairedDomains = getPairedDomains;
module.exports.arePaired = arePaired;
module.exports.getRequiredDependencies = getRequiredDependencies;
module.exports.getOptionalDependencies = getOptionalDependencies;
module.exports.getProvidedServices = getProvidedServices;
module.exports.getRequiredServices = getRequiredServices;
module.exports.findServiceProvider = findServiceProvider;
module.exports.validatePairingConfig = validatePairingConfig;

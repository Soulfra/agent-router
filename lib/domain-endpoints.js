/**
 * Domain API Endpoints
 *
 * Provides HTTP endpoints that allow domains to communicate with each other.
 * These endpoints handle ping, health checks, and service calls between domains.
 */

const domainPairing = require('./domain-pairing');

/**
 * Setup domain endpoints on Express app
 */
function setupDomainEndpoints(app, options = {}) {
  const currentDomain = options.domain || 'calos.ai';
  const config = domainPairing.getDomain(currentDomain);

  if (!config) {
    console.warn(`[DomainEndpoints] Unknown domain: ${currentDomain}`);
    return;
  }

  console.log(`[DomainEndpoints] Setting up endpoints for ${currentDomain}`);

  /**
   * Ping endpoint - verify domain is alive
   * GET /api/v1/ping
   */
  app.get('/api/v1/ping', (req, res) => {
    res.json({
      domain: currentDomain,
      status: 'healthy',
      timestamp: Date.now(),
      services: config.provides || [],
      version: '1.0.0',
      uptime: process.uptime()
    });
  });

  /**
   * Service health check
   * GET /api/v1/health/:service
   */
  app.get('/api/v1/health/:service', (req, res) => {
    const service = req.params.service;
    const provides = config.provides || [];

    const available = provides.includes(service);

    res.json({
      service,
      available,
      domain: currentDomain,
      timestamp: Date.now(),
      responseTime: 0 // Could track actual service response time
    });
  });

  /**
   * Cross-domain service call
   * POST /api/v1/service/:serviceName/:method
   */
  app.post('/api/v1/service/:serviceName/:method', async (req, res) => {
    const { serviceName, method } = req.params;
    const { params, fromDomain, timestamp, requestId } = req.body;

    const requestReceivedAt = Date.now();

    console.log(`[DomainEndpoints] ${fromDomain || 'Unknown'} → ${currentDomain}: ${serviceName}.${method}`);

    // Verify we provide this service
    const provides = config.provides || [];
    if (!provides.includes(serviceName)) {
      return res.status(404).json({
        success: false,
        error: `Service ${serviceName} not provided by ${currentDomain}`,
        availableServices: provides,
        timestamp: Date.now()
      });
    }

    try {
      // Process service call
      const result = await processServiceCall(serviceName, method, params, {
        fromDomain,
        currentDomain,
        requestId
      });

      const responseTimestamp = Date.now();

      res.json({
        success: true,
        result,
        requestId,
        requestTimestamp: timestamp,
        receivedAt: requestReceivedAt,
        responseTimestamp,
        processingTime: responseTimestamp - requestReceivedAt,
        domain: currentDomain
      });

    } catch (error) {
      console.error(`[DomainEndpoints] Error processing ${serviceName}.${method}:`, error.message);

      res.status(500).json({
        success: false,
        error: error.message,
        requestId,
        requestTimestamp: timestamp,
        responseTimestamp: Date.now(),
        domain: currentDomain
      });
    }
  });

  /**
   * Get domain info
   * GET /api/v1/domain/info
   */
  app.get('/api/v1/domain/info', (req, res) => {
    res.json({
      domain: currentDomain,
      description: config.description,
      package: config.package,
      provides: config.provides || [],
      requires: config.requires || [],
      pairs: config.pairs || [],
      endpoints: config.endpoints || {},
      color: config.color,
      icon: config.icon,
      timestamp: Date.now()
    });
  });

  /**
   * Get domain dependencies
   * GET /api/v1/domain/dependencies
   */
  app.get('/api/v1/domain/dependencies', (req, res) => {
    res.json({
      domain: currentDomain,
      required: config.dependencies?.required || [],
      optional: config.dependencies?.optional || [],
      timestamp: Date.now()
    });
  });

  console.log(`[DomainEndpoints] ✓ Endpoints registered for ${currentDomain}`);
}

/**
 * Process a service call
 */
async function processServiceCall(service, method, params, context) {
  const { fromDomain, currentDomain, requestId } = context;

  // Route to appropriate service handler based on service name
  switch (service) {
    case 'agent-runtime':
      return await handleAgentRuntimeService(method, params);

    case 'auth':
      return await handleAuthService(method, params);

    case 'search':
      return await handleSearchService(method, params);

    case 'content':
      return await handleContentService(method, params);

    case 'worker-context':
      return await handleWorkerContextService(method, params);

    case 'ipc':
      return await handleIPCService(method, params);

    case 'sso':
      return await handleSSOService(method, params);

    case 'oauth':
      return await handleOAuthService(method, params);

    case 'voice-auth':
      return await handleVoiceAuthService(method, params);

    case 'proof-of-life':
      return await handleProofOfLifeService(method, params);

    case 'seo':
      return await handleSEOService(method, params);

    case 'indexing':
      return await handleIndexingService(method, params);

    case 'context-fetch':
      return await handleContextFetchService(method, params);

    case 'overflow-handler':
      return await handleOverflowHandlerService(method, params);

    case 'multi-brand':
      return await handleMultiBrandService(method, params);

    case 'cal-riven':
      return await handleCalRivenService(method, params);

    case 'voice-sync':
      return await handleVoiceSyncService(method, params);

    case 'creative':
      return await handleCreativeService(method, params);

    default:
      throw new Error(`Unknown service: ${service}`);
  }
}

// Service handlers (mock implementations for now)

async function handleAgentRuntimeService(method, params) {
  switch (method) {
    case 'spawn':
      return { agentId: crypto.randomUUID(), spawned: true };
    case 'status':
      return { status: 'running', agents: 5 };
    default:
      return { method, processed: true };
  }
}

async function handleAuthService(method, params) {
  switch (method) {
    case 'authenticate':
      return { authenticated: true, userId: params.userId || 'user123' };
    case 'verify':
      return { valid: true };
    default:
      return { method, processed: true };
  }
}

async function handleSearchService(method, params) {
  switch (method) {
    case 'search':
      return { results: [], query: params.query };
    case 'index':
      return { indexed: true };
    default:
      return { method, processed: true };
  }
}

async function handleContentService(method, params) {
  switch (method) {
    case 'generate':
      return { content: 'Generated content', topic: params.topic };
    case 'post':
      return { posted: true };
    default:
      return { method, processed: true };
  }
}

async function handleWorkerContextService(method, params) {
  return { method, processed: true, service: 'worker-context' };
}

async function handleIPCService(method, params) {
  return { method, processed: true, service: 'ipc' };
}

async function handleSSOService(method, params) {
  return { method, processed: true, service: 'sso' };
}

async function handleOAuthService(method, params) {
  return { method, processed: true, service: 'oauth' };
}

async function handleVoiceAuthService(method, params) {
  return { method, processed: true, service: 'voice-auth' };
}

async function handleProofOfLifeService(method, params) {
  return { method, processed: true, service: 'proof-of-life' };
}

async function handleSEOService(method, params) {
  return { method, processed: true, service: 'seo' };
}

async function handleIndexingService(method, params) {
  return { method, processed: true, service: 'indexing' };
}

async function handleContextFetchService(method, params) {
  return { method, processed: true, service: 'context-fetch' };
}

async function handleOverflowHandlerService(method, params) {
  return { method, processed: true, service: 'overflow-handler' };
}

async function handleMultiBrandService(method, params) {
  return { method, processed: true, service: 'multi-brand' };
}

async function handleCalRivenService(method, params) {
  return { method, processed: true, service: 'cal-riven' };
}

async function handleVoiceSyncService(method, params) {
  return { method, processed: true, service: 'voice-sync' };
}

async function handleCreativeService(method, params) {
  return { method, processed: true, service: 'creative' };
}

const crypto = require('crypto');

module.exports = { setupDomainEndpoints };

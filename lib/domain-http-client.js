/**
 * Domain HTTP Client
 *
 * Makes actual HTTP requests between domains with timestamps and timeout detection.
 * Enables one domain to request services from another domain and verify the response.
 */

const axios = require('axios');
const EventEmitter = require('events');
const crypto = require('crypto');

class DomainHTTPClient extends EventEmitter {
  constructor(registry, options = {}) {
    super();

    // Domain registry (to look up service endpoints)
    this.registry = registry;

    // Current domain (the one making requests)
    this.currentDomain = options.currentDomain || null;

    // HTTP client config
    this.defaultTimeout = options.timeout || 5000; // 5 seconds
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000; // 1 second

    // Pending requests tracking
    this.pendingRequests = new Map();

    // Stats
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeoutRequests: 0,
      averageResponseTime: 0,
      requestsByDomain: {}
    };

    console.log('[DomainHTTPClient] Initialized');
  }

  /**
   * Call a service on another domain
   */
  async callService(domain, service, method, params = {}, options = {}) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    // Get service endpoint
    const serviceInfo = this.registry.getServiceEndpoint(service);
    if (!serviceInfo) {
      return {
        success: false,
        error: `Service not found: ${service}`,
        requestTimestamp: startTime,
        responseTimestamp: Date.now(),
        isHanging: false
      };
    }

    const endpoint = serviceInfo.endpoint;
    const timeout = options.timeout || this.defaultTimeout;

    // Track pending request
    this.trackRequest(requestId, domain, service, startTime);

    this.stats.totalRequests++;
    if (!this.stats.requestsByDomain[domain]) {
      this.stats.requestsByDomain[domain] = 0;
    }
    this.stats.requestsByDomain[domain]++;

    try {
      console.log(`[DomainHTTPClient] ${this.currentDomain || 'Unknown'} → ${domain}: ${service}.${method}`);

      // Make HTTP request
      const response = await axios.post(`${endpoint}/${method}`, {
        params,
        fromDomain: this.currentDomain,
        timestamp: startTime,
        requestId
      }, {
        timeout,
        headers: {
          'X-Request-ID': requestId,
          'X-From-Domain': this.currentDomain || 'unknown',
          'X-Service': service,
          'Content-Type': 'application/json'
        }
      });

      const endTime = Date.now();
      const roundTripTime = endTime - startTime;

      // Update stats
      this.stats.successfulRequests++;
      this.updateAverageResponseTime(roundTripTime);

      // Remove from pending
      this.pendingRequests.delete(requestId);

      // Emit success event
      this.emit('request_success', {
        requestId,
        domain,
        service,
        method,
        roundTripTime
      });

      return {
        success: true,
        data: response.data,
        requestId,
        requestTimestamp: startTime,
        responseTimestamp: endTime,
        roundTripTime,
        isHanging: false,
        statusCode: response.status
      };

    } catch (error) {
      const endTime = Date.now();
      const roundTripTime = endTime - startTime;

      this.stats.failedRequests++;

      const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      if (isTimeout) {
        this.stats.timeoutRequests++;
      }

      // Remove from pending
      this.pendingRequests.delete(requestId);

      // Emit error event
      this.emit('request_error', {
        requestId,
        domain,
        service,
        method,
        error: error.message,
        isTimeout
      });

      console.error(`[DomainHTTPClient] Request failed: ${domain}/${service}.${method}`, error.message);

      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        requestId,
        requestTimestamp: startTime,
        responseTimestamp: endTime,
        roundTripTime,
        isHanging: isTimeout,
        statusCode: error.response?.status || null
      };
    }
  }

  /**
   * Ping a domain to check if it's alive
   */
  async ping(domain) {
    const startTime = Date.now();
    const domainInfo = this.registry.getDomain(domain);

    if (!domainInfo) {
      return {
        success: false,
        error: 'Domain not registered',
        timestamp: Date.now()
      };
    }

    try {
      const response = await axios.get(`${domainInfo.baseUrl}/api/v1/ping`, {
        timeout: 3000,
        headers: {
          'X-From-Domain': this.currentDomain || 'unknown'
        }
      });

      const endTime = Date.now();

      return {
        success: true,
        domain: response.data.domain,
        status: response.data.status,
        services: response.data.services,
        requestTimestamp: startTime,
        responseTimestamp: response.data.timestamp,
        roundTripTime: endTime - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        requestTimestamp: startTime,
        responseTimestamp: Date.now(),
        isHanging: error.code === 'ECONNABORTED'
      };
    }
  }

  /**
   * Health check for a specific service
   */
  async healthCheck(domain, service) {
    const startTime = Date.now();
    const domainInfo = this.registry.getDomain(domain);

    if (!domainInfo) {
      return {
        success: false,
        error: 'Domain not registered',
        timestamp: Date.now()
      };
    }

    try {
      const response = await axios.get(`${domainInfo.baseUrl}/api/v1/health/${service}`, {
        timeout: 3000
      });

      const endTime = Date.now();

      return {
        success: true,
        service: response.data.service,
        available: response.data.available,
        requestTimestamp: startTime,
        responseTimestamp: response.data.timestamp,
        roundTripTime: endTime - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        requestTimestamp: startTime,
        responseTimestamp: Date.now()
      };
    }
  }

  /**
   * Track pending request
   */
  trackRequest(requestId, domain, service, startTime) {
    this.pendingRequests.set(requestId, {
      requestId,
      domain,
      service,
      startTime,
      status: 'pending'
    });

    // Set timeout to detect hanging
    setTimeout(() => {
      if (this.pendingRequests.has(requestId)) {
        this.handleHangingRequest(requestId);
      }
    }, this.defaultTimeout + 5000); // Give extra 5s buffer
  }

  /**
   * Handle hanging request
   */
  handleHangingRequest(requestId) {
    const request = this.pendingRequests.get(requestId);
    if (!request) return;

    const elapsedTime = Date.now() - request.startTime;

    console.warn(`[DomainHTTPClient] Request ${requestId} to ${request.domain}/${request.service} hanging for ${elapsedTime}ms`);

    request.status = 'timeout';
    this.emit('request_timeout', {
      requestId,
      domain: request.domain,
      service: request.service,
      elapsedTime
    });

    // Remove from pending
    this.pendingRequests.delete(requestId);
  }

  /**
   * Update average response time
   */
  updateAverageResponseTime(newTime) {
    const total = this.stats.successfulRequests;
    const currentAvg = this.stats.averageResponseTime;

    this.stats.averageResponseTime = ((currentAvg * (total - 1)) + newTime) / total;
  }

  /**
   * Get all pending requests
   */
  getPendingRequests() {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      pendingRequests: this.pendingRequests.size,
      successRate: this.stats.totalRequests > 0
        ? ((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '100%',
      timeoutRate: this.stats.totalRequests > 0
        ? ((this.stats.timeoutRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      averageResponseTime: Math.round(this.stats.averageResponseTime) + 'ms'
    };
  }

  /**
   * Retry failed request
   */
  async retryRequest(originalResult, options = {}) {
    const { domain, service, method, params } = options;
    let attempts = 0;
    let lastError = null;

    while (attempts < this.maxRetries) {
      attempts++;

      console.log(`[DomainHTTPClient] Retry attempt ${attempts}/${this.maxRetries} for ${domain}/${service}`);

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempts));

      const result = await this.callService(domain, service, method, params, options);

      if (result.success) {
        this.emit('retry_success', {
          domain,
          service,
          attempts
        });
        return result;
      }

      lastError = result.error;
    }

    this.emit('retry_failed', {
      domain,
      service,
      attempts,
      error: lastError
    });

    return {
      success: false,
      error: `Failed after ${attempts} retries: ${lastError}`,
      attempts
    };
  }

  /**
   * Batch request multiple services
   */
  async batchCall(requests) {
    const results = await Promise.allSettled(
      requests.map(req =>
        this.callService(req.domain, req.service, req.method, req.params, req.options)
      )
    );

    return results.map((result, index) => ({
      request: requests[index],
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason : null
    }));
  }
}

module.exports = DomainHTTPClient;

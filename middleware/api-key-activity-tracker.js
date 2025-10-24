/**
 * API Key Activity Tracker
 *
 * Middleware that tracks API key usage across services and logs
 * relationships to the Triple Store for fraud detection.
 *
 * Purpose: Verify API keys belong to legitimate owners by tracking
 * usage patterns. Detect stolen/shared keys via suspicious patterns
 * like multi-IP usage or unusual service access.
 */

const crypto = require('crypto');

class ApiKeyActivityTracker {
  constructor({ tripleStore, db }) {
    if (!tripleStore) {
      throw new Error('TripleStore required for API key activity tracking');
    }
    this.tripleStore = tripleStore;
    this.db = db;
  }

  /**
   * Middleware that tracks every service access
   */
  trackActivity = async (req, res, next) => {
    // Skip if no API key info (should be set by tenant-api-key-auth middleware)
    if (!req.keyId || !req.tenantId) {
      return next();
    }

    // Determine which service was accessed
    const service = this.determineService(req.path);
    if (service === 'unknown' || service === 'librarian') {
      return next(); // Don't track librarian or unknown endpoints
    }

    // Create activity ID for this request
    const activityId = crypto.randomUUID();

    // Store in res.locals for downstream middleware
    res.locals.activityId = activityId;
    res.locals.trackedService = service;

    // Log asynchronously (don't block request)
    setImmediate(async () => {
      try {
        await this.logToTripleStore(req.keyId, service, activityId, req);
        await this.logToActivityLog(activityId, req.keyId, req.tenantId, service, req);
      } catch (error) {
        console.error('[ApiKeyActivityTracker] Failed to log activity:', error);
      }
    });

    next();
  };

  /**
   * Determine which service was accessed from request path
   */
  determineService(path) {
    if (path.startsWith('/api/gaming')) return 'gaming';
    if (path.startsWith('/api/git')) return 'git';
    if (path.startsWith('/api/copilot')) return 'copilot';
    if (path.startsWith('/api/ocr')) return 'ocr';
    if (path.startsWith('/api/visual')) return 'visual';
    if (path.startsWith('/api/librarian')) return 'librarian';
    return 'unknown';
  }

  /**
   * Log relationships to Triple Store for fraud detection queries
   */
  async logToTripleStore(keyId, service, activityId, req) {
    const timestamp = new Date().toISOString();

    // Create symbolic URIs
    const keyURI = `api_key:${keyId}`;
    const activityURI = `activity:${activityId}`;
    const serviceEndpoint = req.path.replace('/api/', '').replace(/\//g, '_');
    const serviceURI = `${service}:${serviceEndpoint}`;
    const timestampURI = `timestamp:${timestamp}`;
    const ipURI = `ip:${req.ip}`;

    // Store key → service relationship
    await this.tripleStore.addTriple(keyURI, 'accessed', serviceURI, {
      activity_id: activityId,
      timestamp,
      method: req.method,
      ip: req.ip
    });

    // Store activity → key relationship
    await this.tripleStore.addTriple(activityURI, 'usedKey', keyURI);

    // Store activity → service relationship
    await this.tripleStore.addTriple(activityURI, 'accessedService', serviceURI);

    // Store activity → timestamp relationship
    await this.tripleStore.addTriple(activityURI, 'occurredAt', timestampURI);

    // Store key → IP relationship (for multi-IP fraud detection)
    await this.tripleStore.addTriple(keyURI, 'usedFromIP', ipURI, {
      timestamp,
      user_agent: req.headers['user-agent']
    });

    // Store IP → key relationship (for detecting one IP using many keys)
    await this.tripleStore.addTriple(ipURI, 'usedKey', keyURI, {
      timestamp
    });
  }

  /**
   * Log to agent_activity_log table for detailed tracking
   */
  async logToActivityLog(activityId, keyId, tenantId, service, req) {
    if (!this.db) {
      return; // Skip if no database
    }

    try {
      await this.db.query(`
        INSERT INTO agent_activity_log (
          activity_id,
          agent,
          user_id,
          session_id,
          device_id,
          identity_id,
          origin_domain,
          input,
          client_ip,
          geolocation,
          full_context,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `, [
        activityId,
        service, // agent = which service
        req.userId || null,
        req.sessionId || null,
        req.deviceId || null,
        req.identityId || null,
        req.headers['origin'] || null,
        JSON.stringify({
          path: req.path,
          method: req.method,
          query: req.query,
          body: req.method === 'POST' ? req.body : null
        }),
        req.ip,
        req.geoLocation || null,
        JSON.stringify({
          api_key_id: keyId,
          tenant_id: tenantId,
          user_agent: req.headers['user-agent'],
          referer: req.headers['referer']
        })
      ]);
    } catch (error) {
      console.error('[ApiKeyActivityTracker] Failed to log to activity table:', error);
    }
  }

  /**
   * Detect suspicious activity for an API key
   * Returns flags for:
   * - Multi-IP usage (potential sharing/theft)
   * - Full service access (unusual pattern)
   * - High frequency (potential abuse)
   */
  async detectSuspiciousActivity(keyId, options = {}) {
    const timeWindow = options.timeWindow || '24 hours';
    const keyURI = `api_key:${keyId}`;

    // Get all IPs this key used
    const ipTriples = await this.tripleStore.query(keyURI, 'usedFromIP', '?');
    const uniqueIPs = new Set(ipTriples.map(t => t['?'].replace('ip:', '')));

    // Get all services accessed
    const serviceTriples = await this.tripleStore.query(keyURI, 'accessed', '?');
    const serviceTypes = new Set(
      serviceTriples.map(t => {
        const [service] = t['?'].split(':');
        return service;
      })
    );

    // Flags
    const multiIPFlag = uniqueIPs.size > 3; // More than 3 IPs = suspicious
    const fullAccessFlag = serviceTypes.size >= 4; // Accessing 4+ services = unusual
    const highFrequencyFlag = serviceTriples.length > 100; // More than 100 requests = high usage

    return {
      keyId,
      suspicious: multiIPFlag || fullAccessFlag || highFrequencyFlag,
      flags: {
        multi_ip: multiIPFlag,
        full_service_access: fullAccessFlag,
        high_frequency: highFrequencyFlag
      },
      details: {
        unique_ips: uniqueIPs.size,
        ip_list: Array.from(uniqueIPs),
        services_accessed: serviceTypes.size,
        service_list: Array.from(serviceTypes),
        total_requests: serviceTriples.length
      }
    };
  }

  /**
   * Get usage history for an API key
   */
  async getKeyUsageHistory(keyId, limit = 100) {
    const keyURI = `api_key:${keyId}`;

    // Get all access triples
    const accesses = await this.tripleStore.query(keyURI, 'accessed', '?');

    // Sort by timestamp (metadata)
    const sorted = accesses
      .map(t => ({
        service: t['?'],
        timestamp: t.metadata?.timestamp,
        ip: t.metadata?.ip,
        method: t.metadata?.method
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    return sorted;
  }

  /**
   * Verify if an API key is being used from a known IP
   */
  async verifyKeyFromIP(keyId, ipAddress) {
    const keyURI = `api_key:${keyId}`;
    const ipURI = `ip:${ipAddress}`;

    // Check if this key has been used from this IP before
    const ipTriples = await this.tripleStore.query(keyURI, 'usedFromIP', ipURI);

    if (ipTriples.length > 0) {
      return {
        verified: true,
        first_seen: ipTriples[0].metadata?.timestamp,
        total_uses: ipTriples.length
      };
    }

    // New IP for this key
    const allIPs = await this.tripleStore.query(keyURI, 'usedFromIP', '?');

    return {
      verified: false,
      first_use_from_this_ip: true,
      previously_used_ips: allIPs.length,
      warning: allIPs.length > 0 ? 'Key used from new IP address' : null
    };
  }

  /**
   * Check if an IP is using multiple API keys (credential stuffing detection)
   */
  async detectCredentialStuffing(ipAddress) {
    const ipURI = `ip:${ipAddress}`;

    // Get all keys used from this IP
    const keyTriples = await this.tripleStore.query(ipURI, 'usedKey', '?');
    const uniqueKeys = new Set(keyTriples.map(t => t['?'].replace('api_key:', '')));

    const stuffingFlag = uniqueKeys.size > 5; // More than 5 keys = suspicious

    return {
      ipAddress,
      suspicious: stuffingFlag,
      unique_keys_used: uniqueKeys.size,
      warning: stuffingFlag ? 'IP using many different API keys - potential credential stuffing' : null
    };
  }
}

module.exports = ApiKeyActivityTracker;

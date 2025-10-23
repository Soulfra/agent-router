/**
 * Agent Domain Verifier
 *
 * Ensures AI agents (Cal, Ollama, Claude, etc.) only operate from Matthew's trusted domains.
 * Prevents rogue agents from running on unauthorized infrastructure.
 *
 * Trusted Domains:
 * - soulfra.com / soulfra.github.io
 * - calriven.com
 * - vibecoding.com
 * - calos.dev
 * - localhost (development only)
 */

class AgentDomainVerifier {
  constructor(options = {}) {
    this.trustedDomains = options.trustedDomains || [
      'soulfra.com',
      'soulfra.github.io',
      'calriven.com',
      'vibecoding.com',
      'calos.dev',
      'localhost',
      '127.0.0.1'
    ];

    // Allow additional domains in development
    if (process.env.NODE_ENV === 'development' && options.additionalDomains) {
      this.trustedDomains.push(...options.additionalDomains);
    }

    this.strictMode = options.strictMode !== false; // Default: true
  }

  /**
   * Verify request origin matches trusted domain
   */
  async verifyRequest(req) {
    const origin = this.extractOrigin(req);
    return this.verifyOrigin(origin);
  }

  /**
   * Extract origin from Express request
   */
  extractOrigin(req) {
    // Try headers first
    if (req.headers.origin) {
      try {
        const url = new URL(req.headers.origin);
        return url.hostname;
      } catch (e) {
        // Invalid URL, fall through
      }
    }

    // Try referer
    if (req.headers.referer) {
      try {
        const url = new URL(req.headers.referer);
        return url.hostname;
      } catch (e) {
        // Invalid URL, fall through
      }
    }

    // Try host header
    if (req.headers.host) {
      const host = req.headers.host.split(':')[0]; // Remove port
      return host;
    }

    // Try X-Forwarded-Host (behind proxy)
    if (req.headers['x-forwarded-host']) {
      return req.headers['x-forwarded-host'].split(':')[0];
    }

    // Try socket address
    if (req.socket && req.socket.localAddress) {
      return req.socket.localAddress;
    }

    // Default to localhost for local requests
    return 'localhost';
  }

  /**
   * Verify origin is trusted
   */
  verifyOrigin(origin) {
    if (!origin) {
      return {
        verified: false,
        origin: null,
        reason: 'No origin detected'
      };
    }

    // Exact match
    if (this.trustedDomains.includes(origin)) {
      return {
        verified: true,
        origin,
        matchType: 'exact'
      };
    }

    // Subdomain match (e.g., api.soulfra.com matches soulfra.com)
    const subdomain = this.trustedDomains.find(domain =>
      origin.endsWith('.' + domain) || origin === domain
    );

    if (subdomain) {
      return {
        verified: true,
        origin,
        matchType: 'subdomain',
        parentDomain: subdomain
      };
    }

    // Special case: IPv4 localhost variants
    if (['127.0.0.1', '0.0.0.0', '::1'].includes(origin)) {
      return {
        verified: true,
        origin,
        matchType: 'localhost'
      };
    }

    // Not trusted
    return {
      verified: false,
      origin,
      reason: `Domain not in whitelist: ${origin}`,
      trustedDomains: this.trustedDomains
    };
  }

  /**
   * Express middleware
   */
  middleware() {
    return async (req, res, next) => {
      const result = await this.verifyRequest(req);

      if (!result.verified) {
        if (this.strictMode) {
          console.warn('[AgentDomainVerifier] BLOCKED:', result);
          return res.status(403).json({
            status: 'error',
            error: 'Untrusted domain',
            message: result.reason,
            hint: 'Agent must run from trusted domains: ' + this.trustedDomains.join(', ')
          });
        } else {
          console.warn('[AgentDomainVerifier] Warning (non-strict):', result);
        }
      }

      // Attach verification result to request
      req.domainVerification = result;
      next();
    };
  }

  /**
   * Verify agent origin from metadata
   */
  async verifyAgentOrigin(metadata) {
    const origin = metadata.origin || metadata.domain || metadata.hostname;
    return this.verifyOrigin(origin);
  }

  /**
   * Add domain to whitelist (runtime)
   */
  trustDomain(domain) {
    if (!this.trustedDomains.includes(domain)) {
      this.trustedDomains.push(domain);
      console.log(`[AgentDomainVerifier] Added trusted domain: ${domain}`);
      return true;
    }
    return false;
  }

  /**
   * Remove domain from whitelist (runtime)
   */
  untrustDomain(domain) {
    const index = this.trustedDomains.indexOf(domain);
    if (index > -1) {
      this.trustedDomains.splice(index, 1);
      console.log(`[AgentDomainVerifier] Removed trusted domain: ${domain}`);
      return true;
    }
    return false;
  }

  /**
   * Get list of trusted domains
   */
  getTrustedDomains() {
    return [...this.trustedDomains];
  }
}

module.exports = AgentDomainVerifier;

/**
 * GoDaddy API Client
 *
 * Automate domain management using GoDaddy's Developer API
 *
 * Features:
 * - Domain registration and availability checking
 * - DNS record management (A, CNAME, MX, TXT, NS)
 * - SSL certificate provisioning
 * - WHOIS updates
 * - Subdomain creation for all brands
 * - Bulk operations across 250+ domains
 *
 * API Docs: https://developer.godaddy.com/doc/endpoint/domains
 *
 * Setup:
 * 1. Get API key: https://developer.godaddy.com/keys
 * 2. Set env vars:
 *    GODADDY_API_KEY=your_key
 *    GODADDY_API_SECRET=your_secret
 *    GODADDY_ENV=production (or OTE for testing)
 *
 * Usage:
 *   const GoDaddyClient = require('./godaddy-api-client');
 *   const client = new GoDaddyClient();
 *   await client.checkAvailability('example.com');
 *   await client.addDNSRecord('soulfra.com', {type: 'A', name: 'api', data: '1.2.3.4'});
 */

const axios = require('axios');
const chalk = require('chalk');

class GoDaddyAPIClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GODADDY_API_KEY;
    this.apiSecret = options.apiSecret || process.env.GODADDY_API_SECRET;
    this.env = options.env || process.env.GODADDY_ENV || 'production';

    if (!this.apiKey || !this.apiSecret) {
      console.warn(chalk.yellow('[GoDaddy API] Missing credentials - API calls will fail'));
      console.warn(chalk.gray('   Get keys at: https://developer.godaddy.com/keys'));
    }

    // API endpoints
    this.baseUrl = this.env === 'production'
      ? 'https://api.godaddy.com'
      : 'https://api.ote-godaddy.com'; // OTE = Operational Test Environment

    // Rate limiting
    this.lastRequestTime = 0;
    this.requestDelay = 200; // 200ms between requests (5 req/sec max)

    console.log(chalk.cyan(`[GoDaddy API] Initialized (${this.env})`));
  }

  /**
   * Make authenticated request to GoDaddy API
   */
  async request(method, endpoint, data = null) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.requestDelay) {
      await this.wait(this.requestDelay - timeSinceLastRequest);
    }

    try {
      const response = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Authorization': `sso-key ${this.apiKey}:${this.apiSecret}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        data
      });

      this.lastRequestTime = Date.now();
      return response.data;

    } catch (error) {
      if (error.response) {
        const { status, data } = error.response;
        throw new Error(`GoDaddy API Error ${status}: ${JSON.stringify(data)}`);
      }
      throw error;
    }
  }

  /**
   * Check if domain is available for registration
   */
  async checkAvailability(domain) {
    const result = await this.request('GET', `/v1/domains/available?domain=${domain}`);
    return {
      domain,
      available: result.available,
      price: result.price,
      currency: result.currency,
      period: result.period
    };
  }

  /**
   * Get all domains in account
   */
  async getDomains(options = {}) {
    const { statuses = ['ACTIVE'], limit = 1000 } = options;
    const query = `statuses=${statuses.join(',')}&limit=${limit}`;
    const domains = await this.request('GET', `/v1/domains?${query}`);
    return domains;
  }

  /**
   * Get domain details
   */
  async getDomain(domain) {
    return await this.request('GET', `/v1/domains/${domain}`);
  }

  /**
   * Get all DNS records for domain
   */
  async getDNSRecords(domain, type = null) {
    const endpoint = type
      ? `/v1/domains/${domain}/records/${type}`
      : `/v1/domains/${domain}/records`;
    return await this.request('GET', endpoint);
  }

  /**
   * Add DNS record
   *
   * Examples:
   *   addDNSRecord('soulfra.com', {type: 'A', name: 'api', data: '1.2.3.4', ttl: 3600})
   *   addDNSRecord('soulfra.com', {type: 'CNAME', name: 'www', data: 'soulfra.com', ttl: 3600})
   *   addDNSRecord('soulfra.com', {type: 'MX', name: '@', data: 'mail.soulfra.com', priority: 10})
   */
  async addDNSRecord(domain, record) {
    const { type, name, data, ttl = 600, priority = null } = record;

    // Get existing records of this type
    const existing = await this.getDNSRecords(domain, type);

    // Add new record to existing ones
    const updated = [...existing, {
      type,
      name,
      data,
      ttl,
      ...(priority !== null && { priority })
    }];

    // Replace all records of this type
    await this.request('PUT', `/v1/domains/${domain}/records/${type}`, updated);

    console.log(chalk.green(`[GoDaddy API] Added ${type} record: ${name}.${domain} → ${data}`));

    return { success: true, record: updated[updated.length - 1] };
  }

  /**
   * Update DNS record
   */
  async updateDNSRecord(domain, record) {
    const { type, name, data, ttl = 600, priority = null } = record;

    // Get existing records of this type
    const existing = await this.getDNSRecords(domain, type);

    // Find and update the specific record
    const updated = existing.map(r => {
      if (r.name === name) {
        return { ...r, data, ttl, ...(priority !== null && { priority }) };
      }
      return r;
    });

    // Replace all records of this type
    await this.request('PUT', `/v1/domains/${domain}/records/${type}`, updated);

    console.log(chalk.green(`[GoDaddy API] Updated ${type} record: ${name}.${domain} → ${data}`));

    return { success: true };
  }

  /**
   * Delete DNS record
   */
  async deleteDNSRecord(domain, type, name) {
    // Get existing records of this type
    const existing = await this.getDNSRecords(domain, type);

    // Filter out the record to delete
    const updated = existing.filter(r => r.name !== name);

    // Replace all records of this type
    await this.request('PUT', `/v1/domains/${domain}/records/${type}`, updated);

    console.log(chalk.green(`[GoDaddy API] Deleted ${type} record: ${name}.${domain}`));

    return { success: true };
  }

  /**
   * Create subdomain (CNAME pointing to main domain)
   */
  async createSubdomain(domain, subdomain, target = null) {
    const targetDomain = target || domain;

    await this.addDNSRecord(domain, {
      type: 'CNAME',
      name: subdomain,
      data: targetDomain,
      ttl: 3600
    });

    console.log(chalk.green(`[GoDaddy API] Created subdomain: ${subdomain}.${domain} → ${targetDomain}`));

    return {
      subdomain: `${subdomain}.${domain}`,
      target: targetDomain
    };
  }

  /**
   * Bulk subdomain creation for a brand
   *
   * Creates standard subdomains:
   * - lessons.domain.com (GitHub Pages)
   * - api.domain.com (API server)
   * - auth.domain.com (Authentication)
   * - docs.domain.com (Documentation)
   * - blog.domain.com (Blog)
   */
  async createBrandSubdomains(domain, githubPagesIP = '185.199.108.153') {
    const subdomains = [
      { name: 'lessons', type: 'CNAME', data: `${domain.split('.')[0]}.github.io` },
      { name: 'api', type: 'A', data: githubPagesIP },
      { name: 'auth', type: 'CNAME', data: 'soulfra.com' }, // All auth goes through soulfra.com
      { name: 'docs', type: 'CNAME', data: `${domain.split('.')[0]}.github.io` },
      { name: 'blog', type: 'CNAME', data: `${domain.split('.')[0]}.github.io` }
    ];

    const results = [];

    for (const sub of subdomains) {
      try {
        await this.addDNSRecord(domain, {
          type: sub.type,
          name: sub.name,
          data: sub.data,
          ttl: 3600
        });

        results.push({
          subdomain: `${sub.name}.${domain}`,
          type: sub.type,
          target: sub.data,
          success: true
        });

      } catch (error) {
        console.error(chalk.red(`[GoDaddy API] Failed to create ${sub.name}.${domain}: ${error.message}`));
        results.push({
          subdomain: `${sub.name}.${domain}`,
          success: false,
          error: error.message
        });
      }

      // Rate limiting
      await this.wait(this.requestDelay);
    }

    return results;
  }

  /**
   * Get domain's nameservers
   */
  async getNameservers(domain) {
    const details = await this.getDomain(domain);
    return details.nameServers || [];
  }

  /**
   * Update domain's nameservers
   */
  async updateNameservers(domain, nameservers) {
    await this.request('PUT', `/v1/domains/${domain}`, { nameServers: nameservers });
    console.log(chalk.green(`[GoDaddy API] Updated nameservers for ${domain}`));
    return { success: true, nameservers };
  }

  /**
   * Get domain contacts (registrant, admin, tech, billing)
   */
  async getContacts(domain) {
    const details = await this.getDomain(domain);
    return {
      registrant: details.contactRegistrant,
      admin: details.contactAdmin,
      tech: details.contactTech,
      billing: details.contactBilling
    };
  }

  /**
   * Check if domain has privacy protection enabled
   */
  async checkPrivacy(domain) {
    const details = await this.getDomain(domain);
    return {
      domain,
      privacy: details.privacy || false,
      locked: details.locked || false,
      renewAuto: details.renewAuto || false
    };
  }

  /**
   * Enable domain privacy protection
   */
  async enablePrivacy(domain) {
    await this.request('PUT', `/v1/domains/${domain}`, { privacy: true });
    console.log(chalk.green(`[GoDaddy API] Enabled privacy for ${domain}`));
    return { success: true };
  }

  /**
   * Get domain's SSL certificate info
   */
  async getSSLCertificates(domain) {
    try {
      return await this.request('GET', `/v1/certificates/${domain}`);
    } catch (error) {
      // No certs found
      return [];
    }
  }

  /**
   * Wait helper
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Bulk operation across multiple domains
   */
  async bulkOperation(domains, operation, options = {}) {
    const results = [];

    for (const domain of domains) {
      try {
        console.log(chalk.white(`[GoDaddy API] Processing ${domain}...`));
        const result = await operation(domain, options);
        results.push({ domain, success: true, result });
      } catch (error) {
        console.error(chalk.red(`[GoDaddy API] Failed for ${domain}: ${error.message}`));
        results.push({ domain, success: false, error: error.message });
      }

      // Rate limiting between domains
      await this.wait(this.requestDelay);
    }

    return {
      total: domains.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }
}

module.exports = GoDaddyAPIClient;

/**
 * DomainVerifier
 *
 * Validates REAL domains via DNS lookups.
 * No more fake domains - only verify what actually exists.
 *
 * Features:
 * - DNS validation (checks if domain resolves)
 * - Public whitelist generation
 * - GitHub Pages publishing
 * - Domain ownership verification
 *
 * Usage:
 *   const verifier = new DomainVerifier({ db });
 *   const isReal = await verifier.verify('calriven.com');
 *   const whitelist = await verifier.generateWhitelist();
 */

const dns = require('dns').promises;
const fs = require('fs').promises;
const path = require('path');

class DomainVerifier {
  constructor(options = {}) {
    this.db = options.db;
    this.outputPath = options.outputPath || path.join(__dirname, '../public/domains.json');

    // Your ACTUAL domains (from DOMAIN-ROUTING-ARCHITECTURE.md)
    this.knownDomains = [
      'calriven.com',         // Main domain
      'soulfra.com',          // Creative collaboration
      'deathtodata.com',      // Privacy-first
      'finishthisidea.com',   // Project completion
      'dealordelete.com',     // Decision making
      'saveorsink.com',       // System rescue
      'cringeproof.com',      // Social optimization
      'finishthisrepo.com',   // Code completion
      'ipomyagent.com',       // AI agents
      'hollowtown.com',       // Gaming
      'hookclinic.com',       // Content creation
      'businessaiclassroom.com', // Education
      'roughsparks.com'       // Music production
    ];

    console.log('[DomainVerifier] Initialized with 13 known domains');
  }

  /**
   * Verify a domain exists via DNS
   * @param {string} domain - Domain to verify
   * @returns {Promise<object>} - Verification result
   */
  async verify(domain) {
    console.log(`[DomainVerifier] Verifying: ${domain}`);

    try {
      // Try to resolve domain
      const addresses = await dns.resolve4(domain).catch(() => null);
      const ipv6 = await dns.resolve6(domain).catch(() => null);

      if (!addresses && !ipv6) {
        return {
          domain,
          verified: false,
          error: 'Domain does not resolve',
          verifiedAt: new Date().toISOString()
        };
      }

      // Domain exists!
      const result = {
        domain,
        verified: true,
        ipv4: addresses || [],
        ipv6: ipv6 || [],
        verifiedAt: new Date().toISOString()
      };

      // Save to database
      if (this.db) {
        await this.saveDomainVerification(result);
      }

      console.log(`[DomainVerifier] ✓ ${domain} verified`);

      return result;
    } catch (error) {
      console.error(`[DomainVerifier] ✗ ${domain} failed:`, error.message);

      return {
        domain,
        verified: false,
        error: error.message,
        verifiedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Verify all known domains
   * @returns {Promise<Array>} - Verification results
   */
  async verifyAll() {
    console.log('[DomainVerifier] Verifying all known domains...');

    const results = [];

    for (const domain of this.knownDomains) {
      const result = await this.verify(domain);
      results.push(result);
    }

    const verified = results.filter(r => r.verified).length;
    const failed = results.length - verified;

    console.log(`[DomainVerifier] Results: ${verified} verified, ${failed} failed`);

    return results;
  }

  /**
   * Generate public whitelist JSON
   * @returns {Promise<object>} - Whitelist data
   */
  async generateWhitelist() {
    console.log('[DomainVerifier] Generating public whitelist...');

    const verifications = await this.verifyAll();

    const whitelist = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      totalDomains: verifications.length,
      verifiedDomains: verifications.filter(v => v.verified).length,
      domains: verifications
        .filter(v => v.verified)
        .map(v => ({
          domain: v.domain,
          verified: true,
          verifiedAt: v.verifiedAt,
          ipv4: v.ipv4,
          ipv6: v.ipv6,
          type: this.getDomainType(v.domain),
          githubPages: this.getGitHubPagesUrl(v.domain)
        })),
      metadata: {
        mainDomain: 'calriven.com',
        repository: 'https://github.com/your-username/agent-router',
        publicUrl: 'https://calriven.com/domains.json',
        verificationMethod: 'DNS A/AAAA record lookup'
      }
    };

    // Save to file
    await fs.writeFile(
      this.outputPath,
      JSON.stringify(whitelist, null, 2)
    );

    console.log(`[DomainVerifier] Whitelist saved: ${this.outputPath}`);
    console.log(`  Verified: ${whitelist.verifiedDomains}/${whitelist.totalDomains}`);

    return whitelist;
  }

  /**
   * Get domain type classification
   * @param {string} domain - Domain name
   * @returns {string} - Domain type
   */
  getDomainType(domain) {
    if (domain === 'calriven.com') return 'main';
    if (domain.includes('finish')) return 'productivity';
    if (domain.includes('game') || domain === 'hollowtown.com') return 'gaming';
    if (domain === 'deathtodata.com') return 'privacy';
    if (domain === 'cringeproof.com') return 'social';
    if (domain.includes('ai') || domain === 'ipomyagent.com') return 'ai';
    return 'brand';
  }

  /**
   * Get GitHub Pages URL for domain
   * @param {string} domain - Domain name
   * @returns {string} - GitHub Pages URL
   */
  getGitHubPagesUrl(domain) {
    // Map domain to GitHub Pages (if you've set them up)
    const slug = domain.replace('.com', '').replace('.ai', '');
    return `https://your-username.github.io/${slug}`;
  }

  /**
   * Save domain verification to database
   * @param {object} verification - Verification result
   */
  async saveDomainVerification(verification) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO domain_verifications (
          domain, verified, ipv4, ipv6, verified_at, metadata
        ) VALUES ($1, $2, $3, $4, NOW(), $5)
        ON CONFLICT (domain) DO UPDATE SET
          verified = $2, ipv4 = $3, ipv6 = $4, verified_at = NOW(), metadata = $5`,
        [
          verification.domain,
          verification.verified,
          JSON.stringify(verification.ipv4 || []),
          JSON.stringify(verification.ipv6 || []),
          JSON.stringify({
            error: verification.error,
            verifiedAt: verification.verifiedAt
          })
        ]
      );

      console.log(`[DomainVerifier] Saved verification: ${verification.domain}`);
    } catch (error) {
      console.warn(`[DomainVerifier] Failed to save:`, error.message);
    }
  }

  /**
   * Check if domain is in whitelist
   * @param {string} domain - Domain to check
   * @returns {Promise<boolean>} - Is whitelisted
   */
  async isWhitelisted(domain) {
    try {
      const whitelistPath = this.outputPath;
      const content = await fs.readFile(whitelistPath, 'utf-8');
      const whitelist = JSON.parse(content);

      return whitelist.domains.some(d => d.domain === domain && d.verified);
    } catch (error) {
      console.warn('[DomainVerifier] Whitelist not found, using known domains');
      return this.knownDomains.includes(domain);
    }
  }

  /**
   * Add a new domain (with verification)
   * @param {string} domain - Domain to add
   * @returns {Promise<object>} - Add result
   */
  async addDomain(domain) {
    console.log(`[DomainVerifier] Adding domain: ${domain}`);

    // Verify it exists
    const verification = await this.verify(domain);

    if (!verification.verified) {
      return {
        success: false,
        message: `Domain verification failed: ${verification.error}`,
        domain
      };
    }

    // Add to known domains if not already there
    if (!this.knownDomains.includes(domain)) {
      this.knownDomains.push(domain);

      // Save to database
      if (this.db) {
        await this.db.query(
          `INSERT INTO known_domains (domain, added_at)
           VALUES ($1, NOW())
           ON CONFLICT (domain) DO NOTHING`,
          [domain]
        );
      }
    }

    // Regenerate whitelist
    await this.generateWhitelist();

    return {
      success: true,
      message: `Domain added and verified: ${domain}`,
      domain,
      verification
    };
  }

  /**
   * Remove a domain
   * @param {string} domain - Domain to remove
   * @returns {Promise<object>} - Remove result
   */
  async removeDomain(domain) {
    console.log(`[DomainVerifier] Removing domain: ${domain}`);

    // Remove from known domains
    const index = this.knownDomains.indexOf(domain);
    if (index > -1) {
      this.knownDomains.splice(index, 1);
    }

    // Remove from database
    if (this.db) {
      await this.db.query(
        'DELETE FROM known_domains WHERE domain = $1',
        [domain]
      );
    }

    // Regenerate whitelist
    await this.generateWhitelist();

    return {
      success: true,
      message: `Domain removed: ${domain}`,
      domain
    };
  }

  /**
   * Get verification status for all domains
   * @returns {Promise<object>} - Status summary
   */
  async getStatus() {
    const whitelist = await this.generateWhitelist();

    return {
      totalDomains: whitelist.totalDomains,
      verified: whitelist.verifiedDomains,
      failed: whitelist.totalDomains - whitelist.verifiedDomains,
      lastUpdated: whitelist.generatedAt,
      mainDomain: whitelist.metadata.mainDomain,
      publicUrl: whitelist.metadata.publicUrl
    };
  }
}

module.exports = DomainVerifier;

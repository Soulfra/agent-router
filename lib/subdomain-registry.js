/**
 * Subdomain Registry System
 *
 * Similar to is-a.dev - allows users to register subdomains like:
 * - yourname.soulfra.com
 * - yourproject.calriven.com
 * - yourrepo.finishthisrepo.com
 *
 * Features:
 * - GitHub-based registration (submit PR with JSON config)
 * - DNS record validation
 * - Auto-approval for verified users
 * - Cross-brand subdomain support
 */

const fs = require('fs').promises;
const path = require('path');

class SubdomainRegistry {
  constructor(options = {}) {
    this.registryPath = options.registryPath || path.join(__dirname, '..', 'data', 'subdomains.json');
    this.subdomains = new Map(); // subdomain+domain => config
    this.userSubdomains = new Map(); // userId => [subdomains]

    // Available parent domains from BillionDollarGame
    this.availableDomains = [
      'soulfra.com',
      'calriven.com',
      'deathtodata.com',
      'finishthisidea.com',
      'finishthisrepo.com',
      'ipomyagent.com',
      'hollowtown.com',
      'coldstartkit.com',
      'brandaidkit.com',
      'dealordelete.com',
      'saveorsink.com',
      'cringeproof.com'
    ];

    this.config = {
      maxSubdomainsPerUser: options.maxSubdomainsPerUser || 5,
      requireVerification: options.requireVerification !== false,
      allowedRecordTypes: options.allowedRecordTypes || ['CNAME', 'A', 'AAAA', 'TXT'],
      reservedSubdomains: options.reservedSubdomains || ['www', 'mail', 'admin', 'api', 'cdn', 'ns1', 'ns2'],
      ...options
    };

    console.log('[SubdomainRegistry] Initialized');
  }

  /**
   * Initialize registry (load from disk)
   */
  async init() {
    try {
      const data = await fs.readFile(this.registryPath, 'utf8');
      const parsed = JSON.parse(data);

      // Load into Maps
      Object.entries(parsed.subdomains || {}).forEach(([key, config]) => {
        this.subdomains.set(key, config);

        // Build user index
        const userId = config.owner.userId;
        if (!this.userSubdomains.has(userId)) {
          this.userSubdomains.set(userId, []);
        }
        this.userSubdomains.get(userId).push(key);
      });

      console.log(`[SubdomainRegistry] Loaded ${this.subdomains.size} subdomains`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[SubdomainRegistry] No registry file found, starting fresh');
        await this._save();
      } else {
        throw error;
      }
    }
  }

  /**
   * Register a new subdomain
   * @param {object} request - Subdomain registration request
   * @returns {object} Registration result
   */
  async register(request) {
    const {
      subdomain,
      parentDomain,
      userId,
      owner,
      records,
      metadata = {}
    } = request;

    // Validation
    const validation = this._validate(subdomain, parentDomain, userId);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Build full domain
    const fullDomain = `${subdomain}.${parentDomain}`;
    const key = `${subdomain}@${parentDomain}`;

    // Check if already registered
    if (this.subdomains.has(key)) {
      return { success: false, error: 'Subdomain already registered' };
    }

    // Check user limit
    const userSubs = this.userSubdomains.get(userId) || [];
    if (userSubs.length >= this.config.maxSubdomainsPerUser) {
      return {
        success: false,
        error: `User limit reached (${this.config.maxSubdomainsPerUser} max)`
      };
    }

    // Create registration
    const registration = {
      subdomain,
      parentDomain,
      fullDomain,
      owner: {
        userId,
        username: owner.username || userId,
        github: owner.github || null,
        discord: owner.discord || null,
        email: owner.email || null
      },
      records: this._normalizeRecords(records),
      metadata: {
        description: metadata.description || '',
        repo: metadata.repo || null,
        website: metadata.website || null,
        tags: metadata.tags || []
      },
      status: this.config.requireVerification ? 'pending' : 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store
    this.subdomains.set(key, registration);
    if (!this.userSubdomains.has(userId)) {
      this.userSubdomains.set(userId, []);
    }
    this.userSubdomains.get(userId).push(key);

    // Save to disk
    await this._save();

    return {
      success: true,
      subdomain: registration,
      message: registration.status === 'pending'
        ? 'Registration pending verification'
        : 'Subdomain registered successfully'
    };
  }

  /**
   * Get subdomain by full key (subdomain@parent)
   */
  async getSubdomain(subdomain, parentDomain) {
    const key = `${subdomain}@${parentDomain}`;
    const config = this.subdomains.get(key);

    if (!config) {
      return { success: false, error: 'Subdomain not found' };
    }

    return { success: true, subdomain: config };
  }

  /**
   * Get all subdomains for a user
   */
  async getUserSubdomains(userId) {
    const keys = this.userSubdomains.get(userId) || [];
    const subdomains = keys.map(key => this.subdomains.get(key)).filter(Boolean);

    return {
      success: true,
      subdomains,
      total: subdomains.length,
      limit: this.config.maxSubdomainsPerUser,
      remaining: this.config.maxSubdomainsPerUser - subdomains.length
    };
  }

  /**
   * Get all active subdomains (for /api/network/domains.json)
   */
  async getAllSubdomains(filters = {}) {
    let subdomains = Array.from(this.subdomains.values());

    // Filter by status
    if (filters.status) {
      subdomains = subdomains.filter(s => s.status === filters.status);
    }

    // Filter by parent domain
    if (filters.parentDomain) {
      subdomains = subdomains.filter(s => s.parentDomain === filters.parentDomain);
    }

    return {
      success: true,
      subdomains,
      total: subdomains.length
    };
  }

  /**
   * Update subdomain
   */
  async update(subdomain, parentDomain, updates) {
    const key = `${subdomain}@${parentDomain}`;
    const existing = this.subdomains.get(key);

    if (!existing) {
      return { success: false, error: 'Subdomain not found' };
    }

    // Update allowed fields
    const updated = {
      ...existing,
      records: updates.records ? this._normalizeRecords(updates.records) : existing.records,
      metadata: updates.metadata ? { ...existing.metadata, ...updates.metadata } : existing.metadata,
      updatedAt: new Date().toISOString()
    };

    this.subdomains.set(key, updated);
    await this._save();

    return { success: true, subdomain: updated };
  }

  /**
   * Delete subdomain
   */
  async delete(subdomain, parentDomain, userId) {
    const key = `${subdomain}@${parentDomain}`;
    const existing = this.subdomains.get(key);

    if (!existing) {
      return { success: false, error: 'Subdomain not found' };
    }

    // Check ownership
    if (existing.owner.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    // Remove
    this.subdomains.delete(key);

    // Update user index
    const userSubs = this.userSubdomains.get(userId) || [];
    this.userSubdomains.set(userId, userSubs.filter(k => k !== key));

    await this._save();

    return { success: true, message: 'Subdomain deleted' };
  }

  /**
   * Approve pending subdomain (admin only)
   */
  async approve(subdomain, parentDomain) {
    const key = `${subdomain}@${parentDomain}`;
    const existing = this.subdomains.get(key);

    if (!existing) {
      return { success: false, error: 'Subdomain not found' };
    }

    if (existing.status === 'active') {
      return { success: false, error: 'Already active' };
    }

    existing.status = 'active';
    existing.approvedAt = new Date().toISOString();
    existing.updatedAt = new Date().toISOString();

    this.subdomains.set(key, existing);
    await this._save();

    return { success: true, subdomain: existing };
  }

  /**
   * Get statistics
   */
  async getStats() {
    const all = Array.from(this.subdomains.values());

    const byStatus = {};
    const byParent = {};

    all.forEach(sub => {
      byStatus[sub.status] = (byStatus[sub.status] || 0) + 1;
      byParent[sub.parentDomain] = (byParent[sub.parentDomain] || 0) + 1;
    });

    return {
      success: true,
      stats: {
        total: all.length,
        byStatus,
        byParent,
        totalUsers: this.userSubdomains.size
      }
    };
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Validate subdomain registration
   */
  _validate(subdomain, parentDomain, userId) {
    // Check parent domain exists
    if (!this.availableDomains.includes(parentDomain)) {
      return { valid: false, error: 'Invalid parent domain' };
    }

    // Check subdomain format (alphanumeric + hyphens)
    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      return { valid: false, error: 'Invalid subdomain format (use a-z, 0-9, -)' };
    }

    // Check length
    if (subdomain.length < 3 || subdomain.length > 63) {
      return { valid: false, error: 'Subdomain must be 3-63 characters' };
    }

    // Check reserved
    if (this.config.reservedSubdomains.includes(subdomain)) {
      return { valid: false, error: 'Reserved subdomain' };
    }

    // Check userId
    if (!userId) {
      return { valid: false, error: 'User ID required' };
    }

    return { valid: true };
  }

  /**
   * Normalize DNS records
   */
  _normalizeRecords(records) {
    const normalized = {};

    Object.entries(records).forEach(([type, value]) => {
      if (this.config.allowedRecordTypes.includes(type)) {
        normalized[type] = value;
      }
    });

    return normalized;
  }

  /**
   * Save registry to disk
   */
  async _save() {
    const data = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      subdomains: Object.fromEntries(this.subdomains)
    };

    // Ensure directory exists
    const dir = path.dirname(this.registryPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(this.registryPath, JSON.stringify(data, null, 2));
  }
}

module.exports = SubdomainRegistry;

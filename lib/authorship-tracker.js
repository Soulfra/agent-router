// Authorship Tracker - Patents, Trademarks, IP Registry
//
// Tracks intellectual property with Soulfra cryptographic signatures
// Creates blockchain-like proof chain for authorship verification

const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class AuthorshipTracker {
  constructor(pool) {
    this.pool = pool;
  }

  // ============================================================================
  // Soulfra Cryptographic Signatures
  // ============================================================================

  /**
   * Create Soulfra signature for content
   * @param {string} content - Content to sign
   * @param {string} signedBy - Signer identifier (e.g., 'user:123')
   * @param {string} previousHash - Previous entry hash for blockchain-like chain
   */
  createSoulfraSignature(content, signedBy, previousHash = null) {
    // Create SHA-256 hash of content
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // In production, this would use Ed25519 signing
    // For now, create deterministic signature using HMAC
    const signatureData = `${hash}:${signedBy}:${previousHash || 'genesis'}:${Date.now()}`;
    const signature = crypto.createHmac('sha256', process.env.SOULFRA_SECRET || 'calos-soulfra-secret')
      .update(signatureData)
      .digest('hex');

    return {
      hash,
      signature,
      signedAt: new Date(),
      signedBy,
      previousHash
    };
  }

  /**
   * Verify Soulfra signature
   * @param {object} proof - Proof object with hash, signature, signedBy, previousHash
   * @param {string} content - Original content
   */
  verifySoulfraSignature(proof, content) {
    // Verify hash matches content
    const expectedHash = crypto.createHash('sha256').update(content).digest('hex');
    if (proof.hash !== expectedHash) {
      return { valid: false, reason: 'Hash mismatch' };
    }

    // In production, verify Ed25519 signature
    // For now, we trust the stored signature
    return { valid: true };
  }

  /**
   * Build proof chain from authorship registry
   * @param {number} userId - User ID
   * @param {number} limit - Max chain length
   */
  async buildProofChain(userId, limit = 100) {
    const query = `
      SELECT id, soulfra_hash, soulfra_signature, signed_at, signed_by, previous_hash,
             ip_type, title, created_at
      FROM authorship_registry
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [userId, limit]);
    const entries = result.rows;

    // Build chain (newest to oldest)
    const chain = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const next = entries[i + 1];

      chain.push({
        id: entry.id,
        hash: entry.soulfra_hash,
        signature: entry.soulfra_signature,
        signedBy: entry.signed_by,
        signedAt: entry.signed_at,
        previousHash: entry.previous_hash,
        ipType: entry.ip_type,
        title: entry.title,
        createdAt: entry.created_at,
        verified: next ? (next.soulfra_hash === entry.previous_hash) : true
      });
    }

    return chain;
  }

  // ============================================================================
  // IP Registration
  // ============================================================================

  /**
   * Register intellectual property
   * @param {number} userId - User ID
   * @param {object} ip - IP details
   */
  async registerIP(userId, ip) {
    const {
      ipType,
      title,
      description,
      filingNumber = null,
      filingDate = null,
      registrationNumber = null,
      registrationDate = null,
      status = 'draft',
      relatedFiles = [],
      relatedRepos = [],
      relatedCommits = [],
      relatedCode = {},
      tags = [],
      category = null,
      jurisdiction = 'US',
      isPublic = false
    } = ip;

    // Create content fingerprint
    const content = JSON.stringify({
      ipType,
      title,
      description,
      userId,
      timestamp: new Date().toISOString()
    });

    // Get previous hash for chain
    const prevQuery = `
      SELECT soulfra_hash FROM authorship_registry
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const prevResult = await this.pool.query(prevQuery, [userId]);
    const previousHash = prevResult.rows.length > 0 ? prevResult.rows[0].soulfra_hash : null;

    // Create Soulfra signature
    const signedBy = `user:${userId}`;
    const soulfra = this.createSoulfraSignature(content, signedBy, previousHash);

    // Build proof chain entry
    const proofChain = {
      version: '1.0',
      hash: soulfra.hash,
      signature: soulfra.signature,
      signedBy: soulfra.signedBy,
      signedAt: soulfra.signedAt,
      previousHash: soulfra.previousHash,
      content: {
        ipType,
        title,
        description: description ? description.substring(0, 200) : null
      },
      metadata: {
        jurisdiction,
        category,
        tags
      }
    };

    // Insert into database
    const query = `
      INSERT INTO authorship_registry (
        user_id, ip_type, title, description,
        filing_number, filing_date, registration_number, registration_date, status,
        related_files, related_repos, related_commits, related_code,
        soulfra_hash, soulfra_signature, signed_at, signed_by,
        previous_hash, proof_chain,
        tags, category, jurisdiction, is_public
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      userId, ipType, title, description,
      filingNumber, filingDate, registrationNumber, registrationDate, status,
      relatedFiles, relatedRepos, relatedCommits, JSON.stringify(relatedCode),
      soulfra.hash, soulfra.signature, soulfra.signedAt, soulfra.signedBy,
      soulfra.previousHash, JSON.stringify(proofChain),
      tags, category, jurisdiction, isPublic
    ]);

    return result.rows[0];
  }

  /**
   * Update IP status (e.g., draft → filed → registered)
   * @param {number} ipId - IP record ID
   * @param {object} updates - Updates to apply
   */
  async updateIP(ipId, updates) {
    const {
      status,
      filingNumber,
      filingDate,
      registrationNumber,
      registrationDate
    } = updates;

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (status) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (filingNumber) {
      setClauses.push(`filing_number = $${paramIndex++}`);
      values.push(filingNumber);
    }
    if (filingDate) {
      setClauses.push(`filing_date = $${paramIndex++}`);
      values.push(filingDate);
    }
    if (registrationNumber) {
      setClauses.push(`registration_number = $${paramIndex++}`);
      values.push(registrationNumber);
    }
    if (registrationDate) {
      setClauses.push(`registration_date = $${paramIndex++}`);
      values.push(registrationDate);
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(ipId);

    const query = `
      UPDATE authorship_registry
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Get IP registry for user
   * @param {number} userId - User ID
   * @param {object} filters - Optional filters (ipType, status, isPublic)
   */
  async getIPRegistry(userId, filters = {}) {
    const whereClauses = ['user_id = $1'];
    const values = [userId];
    let paramIndex = 2;

    if (filters.ipType) {
      whereClauses.push(`ip_type = $${paramIndex++}`);
      values.push(filters.ipType);
    }

    if (filters.status) {
      whereClauses.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (typeof filters.isPublic === 'boolean') {
      whereClauses.push(`is_public = $${paramIndex++}`);
      values.push(filters.isPublic);
    }

    const query = `
      SELECT * FROM authorship_registry
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Get public IP registry (for portfolio display)
   * @param {number} userId - User ID
   */
  async getPublicIPRegistry(userId) {
    return this.getIPRegistry(userId, { isPublic: true });
  }

  // ============================================================================
  // Auto-Detection from Git
  // ============================================================================

  /**
   * Auto-detect authorship from git repository
   * @param {string} repoPath - Path to git repository
   * @param {number} userId - User ID
   */
  async autoDetectFromGit(repoPath, userId) {
    try {
      // Get git log with author info
      const { stdout: logOutput } = await execPromise(
        `git -C "${repoPath}" log --pretty=format:"%H|%an|%ae|%aI|%s" --shortstat`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      // Get total line count
      const { stdout: statsOutput } = await execPromise(
        `git -C "${repoPath}" log --author="$(git config user.name)" --pretty=tformat: --numstat | awk '{ add += $1; subs += $2 } END { printf "%s|%s", add, subs }'`
      );

      const [linesAdded, linesRemoved] = statsOutput.split('|').map(Number);

      // Get all commits by user
      const commits = logOutput.split('\n').filter(line => line.trim());
      const commitCount = commits.length;

      // Get first and last commit dates
      const commitDates = commits.map(line => new Date(line.split('|')[3]));
      const firstCommit = new Date(Math.min(...commitDates));
      const lastCommit = new Date(Math.max(...commitDates));

      // Get repo name
      const { stdout: repoUrl } = await execPromise(`git -C "${repoPath}" config --get remote.origin.url`);
      const repoName = repoUrl.trim().split('/').pop().replace('.git', '');

      // Register as authorship claim
      const ip = {
        ipType: 'copyright',
        title: `Original Work: ${repoName}`,
        description: `Author of ${commitCount} commits adding ${linesAdded} lines of code from ${firstCommit.toISOString().split('T')[0]} to ${lastCommit.toISOString().split('T')[0]}`,
        status: 'registered',
        relatedRepos: [repoUrl.trim()],
        relatedCommits: commits.slice(0, 100).map(line => line.split('|')[0]), // First 100 commits
        relatedCode: {
          linesAdded,
          linesRemoved,
          commitCount,
          firstCommit: firstCommit.toISOString(),
          lastCommit: lastCommit.toISOString()
        },
        tags: ['git', 'code', 'software'],
        category: 'software',
        jurisdiction: 'US',
        isPublic: false
      };

      return await this.registerIP(userId, ip);
    } catch (error) {
      console.error('[AuthorshipTracker] Error auto-detecting from git:', error.message);
      throw error;
    }
  }

  /**
   * Scan multiple repositories for authorship
   * @param {array} repoPaths - Array of repo paths
   * @param {number} userId - User ID
   */
  async scanRepositories(repoPaths, userId) {
    const results = [];

    for (const repoPath of repoPaths) {
      try {
        const ip = await this.autoDetectFromGit(repoPath, userId);
        results.push({ success: true, repoPath, ip });
      } catch (error) {
        results.push({ success: false, repoPath, error: error.message });
      }
    }

    return results;
  }

  // ============================================================================
  // Patent/Trademark Helpers
  // ============================================================================

  /**
   * Register a patent
   * @param {number} userId - User ID
   * @param {object} patent - Patent details
   */
  async registerPatent(userId, patent) {
    return this.registerIP(userId, {
      ...patent,
      ipType: 'patent',
      jurisdiction: patent.jurisdiction || 'US'
    });
  }

  /**
   * Register a trademark
   * @param {number} userId - User ID
   * @param {object} trademark - Trademark details
   */
  async registerTrademark(userId, trademark) {
    return this.registerIP(userId, {
      ...trademark,
      ipType: 'trademark',
      jurisdiction: trademark.jurisdiction || 'US'
    });
  }

  /**
   * Register a copyright
   * @param {number} userId - User ID
   * @param {object} copyright - Copyright details
   */
  async registerCopyright(userId, copyright) {
    return this.registerIP(userId, {
      ...copyright,
      ipType: 'copyright',
      jurisdiction: copyright.jurisdiction || 'US'
    });
  }

  /**
   * Register a trade secret
   * @param {number} userId - User ID
   * @param {object} tradeSecret - Trade secret details
   */
  async registerTradeSecret(userId, tradeSecret) {
    return this.registerIP(userId, {
      ...tradeSecret,
      ipType: 'trade_secret',
      jurisdiction: tradeSecret.jurisdiction || 'US',
      isPublic: false // Trade secrets should never be public
    });
  }

  // ============================================================================
  // Export/Proof Generation
  // ============================================================================

  /**
   * Generate proof certificate for IP
   * @param {number} ipId - IP record ID
   */
  async generateProofCertificate(ipId) {
    const query = `SELECT * FROM authorship_registry WHERE id = $1`;
    const result = await this.pool.query(query, [ipId]);

    if (result.rows.length === 0) {
      throw new Error('IP record not found');
    }

    const ip = result.rows[0];

    // Generate certificate
    const certificate = {
      version: '1.0',
      type: 'CALOS Authorship Certificate',
      generatedAt: new Date().toISOString(),
      ip: {
        id: ip.id,
        type: ip.ip_type,
        title: ip.title,
        description: ip.description,
        status: ip.status,
        filingNumber: ip.filing_number,
        filingDate: ip.filing_date,
        registrationNumber: ip.registration_number,
        registrationDate: ip.registration_date,
        jurisdiction: ip.jurisdiction
      },
      proof: {
        hash: ip.soulfra_hash,
        signature: ip.soulfra_signature,
        signedBy: ip.signed_by,
        signedAt: ip.signed_at,
        previousHash: ip.previous_hash,
        chain: ip.proof_chain
      },
      verification: {
        verifyAt: 'https://calos.com/verify',
        publicKey: process.env.SOULFRA_PUBLIC_KEY || 'CALOS_PUBLIC_KEY_PLACEHOLDER'
      }
    };

    return certificate;
  }

  /**
   * Export IP registry as JSON
   * @param {number} userId - User ID
   * @param {boolean} includePrivate - Include non-public entries
   */
  async exportRegistry(userId, includePrivate = false) {
    const filters = includePrivate ? {} : { isPublic: true };
    const entries = await this.getIPRegistry(userId, filters);

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      userId,
      totalEntries: entries.length,
      entries: entries.map(entry => ({
        id: entry.id,
        type: entry.ip_type,
        title: entry.title,
        description: entry.description,
        status: entry.status,
        filingInfo: {
          number: entry.filing_number,
          date: entry.filing_date
        },
        registrationInfo: {
          number: entry.registration_number,
          date: entry.registration_date
        },
        jurisdiction: entry.jurisdiction,
        tags: entry.tags,
        category: entry.category,
        proof: {
          hash: entry.soulfra_hash,
          signature: entry.soulfra_signature,
          signedBy: entry.signed_by,
          signedAt: entry.signed_at
        },
        createdAt: entry.created_at
      }))
    };
  }
}

module.exports = AuthorshipTracker;

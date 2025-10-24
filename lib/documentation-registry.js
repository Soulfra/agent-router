/**
 * Documentation Registry
 *
 * Fetches and caches library documentation from multiple sources:
 * - npm registry API
 * - GitHub releases
 * - Unpkg CDN
 * - Archive.org for historical versions
 *
 * Enables AI agents to access proper documentation for any library version.
 *
 * Usage:
 * const docRegistry = new DocumentationRegistry({ db });
 * const docs = await docRegistry.get('stripe', '12.0.0');
 * await docRegistry.fetch('openai', 'latest');
 */

const crypto = require('crypto');

class DocumentationRegistry {
  constructor(options = {}) {
    this.db = options.db;

    if (!this.db) {
      throw new Error('Database connection required for DocumentationRegistry');
    }

    // Configuration
    this.npmRegistry = options.npmRegistry || 'https://registry.npmjs.org';
    this.unpkgCDN = options.unpkgCDN || 'https://unpkg.com';
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.cacheTTL = options.cacheTTL || 604800; // 7 days

    // Worker for background fetching
    this.fetchWorkerRunning = false;
  }

  /**
   * Get documentation for a package version
   * Returns cached version if available, otherwise queues fetch
   *
   * @param {string} packageName - Package name (e.g., 'stripe')
   * @param {string} version - Version (e.g., '12.0.0', 'latest')
   * @param {string} packageType - 'npm', 'github', 'pypi', etc.
   * @returns {Promise<object|null>} Documentation or null if not cached
   */
  async get(packageName, version = 'latest', packageType = 'npm') {
    try {
      const result = await this.db.query(
        `SELECT * FROM get_documentation($1, $2, $3)`,
        [packageName, version === 'latest' ? null : version, packageType]
      );

      if (result.rows.length === 0) {
        // Not in cache - queue fetch
        console.log(`[DocRegistry] ${packageName}@${version} not cached, queuing fetch...`);
        await this.queueFetch(packageName, version, packageType);
        return null;
      }

      const doc = result.rows[0];

      // Check if cache is stale
      const cacheAge = Date.now() - new Date(doc.fetched_at).getTime();
      if (cacheAge > this.cacheTTL * 1000) {
        console.log(`[DocRegistry] ${packageName}@${version} cache stale, re-fetching...`);
        await this.queueFetch(packageName, version, packageType, 50); // Higher priority for refreshes
      }

      return {
        packageName: doc.package_name,
        version: doc.version,
        readme: doc.readme,
        documentation: doc.documentation,
        types: doc.types,
        isCached: doc.is_cached,
        fetchedAt: doc.fetched_at
      };

    } catch (error) {
      console.error(`[DocRegistry] Error getting documentation:`, error.message);
      return null;
    }
  }

  /**
   * Queue documentation fetch (async background processing)
   *
   * @param {string} packageName - Package name
   * @param {string} version - Version
   * @param {string} packageType - Package type
   * @param {number} priority - Priority (higher = more important)
   * @param {string} requestedBy - User ID who requested
   * @returns {Promise<string>} Queue ID
   */
  async queueFetch(packageName, version = 'latest', packageType = 'npm', priority = 0, requestedBy = null) {
    try {
      const result = await this.db.query(
        `SELECT queue_documentation_fetch($1, $2, $3, $4, $5, $6) as queue_id`,
        [packageName, version, packageType, packageType, priority, requestedBy]
      );

      const queueId = result.rows[0].queue_id;
      console.log(`[DocRegistry] Queued fetch for ${packageName}@${version} (queue_id: ${queueId})`);

      // Start worker if not running
      if (!this.fetchWorkerRunning) {
        this.startFetchWorker();
      }

      return queueId;

    } catch (error) {
      console.error(`[DocRegistry] Error queuing fetch:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch documentation from npm registry
   *
   * @param {string} packageName - Package name
   * @param {string} version - Version
   * @returns {Promise<object>} Documentation data
   */
  async fetchFromNpm(packageName, version = 'latest') {
    try {
      const url = `${this.npmRegistry}/${packageName}/${version === 'latest' ? '' : version}`;
      console.log(`[DocRegistry] Fetching from npm: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`npm registry returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Get the actual version if 'latest' was requested
      const actualVersion = version === 'latest' ? data['dist-tags']?.latest || Object.keys(data.versions || {}).pop() : version;

      const versionData = data.versions?.[actualVersion] || data;

      return {
        packageName: versionData.name || packageName,
        version: actualVersion,
        description: versionData.description || '',
        readme: versionData.readme || data.readme || '',
        homepage: versionData.homepage || '',
        repository: typeof versionData.repository === 'string' ? versionData.repository : versionData.repository?.url || '',
        license: versionData.license || '',
        author: typeof versionData.author === 'string' ? versionData.author : versionData.author?.name || '',
        keywords: versionData.keywords || [],
        dependencies: versionData.dependencies || {},
        devDependencies: versionData.devDependencies || {},
        peerDependencies: versionData.peerDependencies || {},
        isLatest: version === 'latest',
        isDeprecated: !!versionData.deprecated,
        deprecatedMessage: versionData.deprecated || null
      };

    } catch (error) {
      console.error(`[DocRegistry] Error fetching from npm:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch TypeScript definitions from CDN
   *
   * @param {string} packageName - Package name
   * @param {string} version - Version
   * @returns {Promise<string|null>} TypeScript definitions or null
   */
  async fetchTypesFromCDN(packageName, version) {
    try {
      // Try multiple possible paths for .d.ts files
      const paths = [
        `/${packageName}@${version}/index.d.ts`,
        `/${packageName}@${version}/dist/index.d.ts`,
        `/${packageName}@${version}/types/index.d.ts`,
        `/${packageName}@${version}/lib/index.d.ts`
      ];

      for (const path of paths) {
        try {
          const url = `${this.unpkgCDN}${path}`;
          const response = await fetch(url);

          if (response.ok) {
            const types = await response.text();
            console.log(`[DocRegistry] Found types at ${url}`);
            return types;
          }
        } catch (err) {
          // Try next path
        }
      }

      console.log(`[DocRegistry] No TypeScript definitions found for ${packageName}@${version}`);
      return null;

    } catch (error) {
      console.error(`[DocRegistry] Error fetching types:`, error.message);
      return null;
    }
  }

  /**
   * Fetch documentation from GitHub releases
   *
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} version - Version/tag
   * @returns {Promise<object>} Documentation data
   */
  async fetchFromGitHub(owner, repo, version = 'latest') {
    try {
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CALOS-Documentation-Registry'
      };

      if (this.githubToken) {
        headers['Authorization'] = `Bearer ${this.githubToken}`;
      }

      // Get release info
      const releaseUrl = version === 'latest'
        ? `https://api.github.com/repos/${owner}/${repo}/releases/latest`
        : `https://api.github.com/repos/${owner}/${repo}/releases/tags/${version}`;

      const releaseResponse = await fetch(releaseUrl, { headers });

      if (!releaseResponse.ok) {
        throw new Error(`GitHub API returned ${releaseResponse.status}`);
      }

      const releaseData = await releaseResponse.json();

      // Get README
      const readmeUrl = `https://api.github.com/repos/${owner}/${repo}/readme`;
      const readmeResponse = await fetch(readmeUrl, { headers });
      let readme = '';

      if (readmeResponse.ok) {
        const readmeData = await readmeResponse.json();
        readme = Buffer.from(readmeData.content, 'base64').toString('utf-8');
      }

      return {
        packageName: `${owner}/${repo}`,
        version: releaseData.tag_name,
        description: releaseData.body || '',
        readme: readme,
        homepage: `https://github.com/${owner}/${repo}`,
        repository: `https://github.com/${owner}/${repo}`,
        changelog: releaseData.body || '',
        isLatest: version === 'latest',
        isDeprecated: false
      };

    } catch (error) {
      console.error(`[DocRegistry] Error fetching from GitHub:`, error.message);
      throw error;
    }
  }

  /**
   * Process documentation fetch queue (background worker)
   */
  async processFetchQueue() {
    try {
      // Get next pending item
      const result = await this.db.query(`
        SELECT * FROM documentation_fetch_queue
        WHERE status = 'pending' AND attempts < max_attempts
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        return false; // No more items
      }

      const item = result.rows[0];

      console.log(`[DocRegistry] Processing fetch: ${item.package_name}@${item.version}`);

      // Mark as processing
      await this.db.query(
        `UPDATE documentation_fetch_queue
         SET status = 'processing', last_attempt_at = NOW(), attempts = attempts + 1
         WHERE queue_id = $1`,
        [item.queue_id]
      );

      try {
        // Fetch documentation based on source
        let docData;

        if (item.source === 'npm') {
          docData = await this.fetchFromNpm(item.package_name, item.version);

          // Also try to fetch types
          const types = await this.fetchTypesFromCDN(item.package_name, docData.version);
          if (types) {
            docData.types = types;
          }

        } else if (item.source === 'github') {
          // Parse owner/repo from package name
          const [owner, repo] = item.package_name.split('/');
          docData = await this.fetchFromGitHub(owner, repo, item.version);

        } else {
          throw new Error(`Unsupported source: ${item.source}`);
        }

        // Calculate content hash
        const contentHash = crypto
          .createHash('sha256')
          .update(JSON.stringify(docData))
          .digest('hex');

        // Store in cache
        await this.db.query(
          `INSERT INTO documentation_cache (
            package_name,
            version,
            package_type,
            source,
            source_url,
            readme,
            documentation,
            types,
            description,
            author,
            license,
            homepage,
            repository,
            keywords,
            dependencies,
            dev_dependencies,
            peer_dependencies,
            is_latest,
            is_deprecated,
            deprecated_message,
            content_hash,
            verified,
            verified_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
          ON CONFLICT (package_name, version, package_type)
          DO UPDATE SET
            readme = EXCLUDED.readme,
            documentation = EXCLUDED.documentation,
            types = EXCLUDED.types,
            description = EXCLUDED.description,
            author = EXCLUDED.author,
            license = EXCLUDED.license,
            homepage = EXCLUDED.homepage,
            repository = EXCLUDED.repository,
            keywords = EXCLUDED.keywords,
            dependencies = EXCLUDED.dependencies,
            dev_dependencies = EXCLUDED.dev_dependencies,
            peer_dependencies = EXCLUDED.peer_dependencies,
            is_latest = EXCLUDED.is_latest,
            is_deprecated = EXCLUDED.is_deprecated,
            deprecated_message = EXCLUDED.deprecated_message,
            content_hash = EXCLUDED.content_hash,
            fetched_at = NOW(),
            verified = true,
            verified_at = NOW()`,
          [
            docData.packageName,
            docData.version,
            item.package_type,
            item.source,
            docData.repository || docData.homepage || '',
            docData.readme || '',
            JSON.stringify(docData.documentation || {}),
            docData.types || null,
            docData.description || '',
            docData.author || '',
            docData.license || '',
            docData.homepage || '',
            docData.repository || '',
            docData.keywords || [],
            JSON.stringify(docData.dependencies || {}),
            JSON.stringify(docData.devDependencies || {}),
            JSON.stringify(docData.peerDependencies || {}),
            docData.isLatest || false,
            docData.isDeprecated || false,
            docData.deprecatedMessage || null,
            contentHash,
            true,
            new Date()
          ]
        );

        // Mark as completed
        await this.db.query(
          `UPDATE documentation_fetch_queue
           SET status = 'completed', completed_at = NOW()
           WHERE queue_id = $1`,
          [item.queue_id]
        );

        console.log(`[DocRegistry] Successfully cached ${docData.packageName}@${docData.version}`);

        return true; // Successfully processed

      } catch (error) {
        // Mark as failed
        await this.db.query(
          `UPDATE documentation_fetch_queue
           SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
               error_message = $2
           WHERE queue_id = $1`,
          [item.queue_id, error.message]
        );

        console.error(`[DocRegistry] Failed to fetch ${item.package_name}@${item.version}:`, error.message);

        return true; // Continue processing queue even on failure
      }

    } catch (error) {
      console.error(`[DocRegistry] Error in fetch queue processor:`, error.message);
      return false;
    }
  }

  /**
   * Start background fetch worker
   */
  async startFetchWorker() {
    if (this.fetchWorkerRunning) {
      return;
    }

    this.fetchWorkerRunning = true;
    console.log(`[DocRegistry] Starting fetch worker...`);

    const processLoop = async () => {
      while (this.fetchWorkerRunning) {
        const hasMore = await this.processFetchQueue();

        if (!hasMore) {
          // No more items, wait before checking again
          await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10s
        } else {
          // Small delay between items to avoid overwhelming APIs
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1s between fetches
        }
      }

      console.log(`[DocRegistry] Fetch worker stopped`);
    };

    processLoop().catch(error => {
      console.error(`[DocRegistry] Fetch worker crashed:`, error);
      this.fetchWorkerRunning = false;
    });
  }

  /**
   * Stop background fetch worker
   */
  stopFetchWorker() {
    this.fetchWorkerRunning = false;
  }

  /**
   * Search documentation
   *
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Search results
   */
  async search(query, limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT * FROM search_documentation($1, $2)`,
        [query, limit]
      );

      return result.rows.map(row => ({
        packageName: row.package_name,
        version: row.version,
        title: row.title,
        summary: row.summary,
        relevance: parseFloat(row.relevance)
      }));

    } catch (error) {
      console.error(`[DocRegistry] Error searching documentation:`, error.message);
      return [];
    }
  }

  /**
   * Get popular packages
   *
   * @returns {Promise<Array>} Popular packages
   */
  async getPopularPackages() {
    try {
      const result = await this.db.query(`
        SELECT * FROM popular_packages
        LIMIT 50
      `);

      return result.rows;

    } catch (error) {
      console.error(`[DocRegistry] Error getting popular packages:`, error.message);
      return [];
    }
  }

  /**
   * Get deprecated packages in use
   *
   * @returns {Promise<Array>} Deprecated packages still being used
   */
  async getDeprecatedPackagesInUse() {
    try {
      const result = await this.db.query(`
        SELECT * FROM deprecated_packages_in_use
      `);

      return result.rows;

    } catch (error) {
      console.error(`[DocRegistry] Error getting deprecated packages:`, error.message);
      return [];
    }
  }

  /**
   * Log documentation usage (for analytics)
   *
   * @param {string} packageName - Package name
   * @param {string} version - Version
   * @param {object} options - Additional options
   */
  async logUsage(packageName, version, options = {}) {
    try {
      await this.db.query(
        `INSERT INTO documentation_usage (
          package_name,
          version,
          section,
          user_id,
          session_id,
          query,
          use_case
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          packageName,
          version,
          options.section || null,
          options.userId || null,
          options.sessionId || null,
          options.query || null,
          options.useCase || null
        ]
      );

    } catch (error) {
      console.error(`[DocRegistry] Error logging usage:`, error.message);
    }
  }
}

module.exports = DocumentationRegistry;

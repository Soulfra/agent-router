/**
 * Bucket Orchestrator
 *
 * Manages all 12 buckets and routes requests to appropriate bucket(s).
 *
 * Capabilities:
 * - Route to single best bucket
 * - Broadcast to all buckets (testing/comparison)
 * - Aggregate results from multiple buckets
 * - Monitor bucket health
 * - Coordinate cross-bucket workflows
 */

const BucketInstance = require('./bucket-instance');
const ArtifactStorage = require('./artifact-storage');

class BucketOrchestrator {
  constructor(options = {}) {
    this.db = options.db;
    this.usageTracker = options.usageTracker;
    this.modelWrapper = options.modelWrapper;
    this.workflowBuilder = options.workflowBuilder;

    // Initialize artifact storage
    this.artifactStorage = this.db ? new ArtifactStorage({ db: this.db }) : null;

    // All buckets (loaded on init)
    this.buckets = new Map();

    // Categories
    this.categories = {
      technical: [],
      creative: [],
      business: []
    };

    // Domain mapping
    this.domainMap = new Map();

    console.log('[BucketOrchestrator] Initialized');
  }

  /**
   * Initialize: Load all buckets from database
   */
  async init() {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    console.log('[BucketOrchestrator] Loading buckets...');

    try {
      const result = await this.db.query(`
        SELECT bucket_id FROM bucket_instances
        WHERE status = 'active'
        ORDER BY category, bucket_name
      `);

      const dependencies = {
        db: this.db,
        usageTracker: this.usageTracker,
        modelWrapper: this.modelWrapper,
        workflowBuilder: this.workflowBuilder,
        artifactStorage: this.artifactStorage
      };

      for (const row of result.rows) {
        const bucket = await BucketInstance.load(row.bucket_id, this.db, dependencies);

        this.buckets.set(bucket.bucketId, bucket);

        // Categorize
        const category = bucket.category.toLowerCase();
        if (this.categories[category]) {
          this.categories[category].push(bucket.bucketId);
        }

        // Domain mapping
        if (bucket.domainContext) {
          if (!this.domainMap.has(bucket.domainContext)) {
            this.domainMap.set(bucket.domainContext, []);
          }
          this.domainMap.get(bucket.domainContext).push(bucket.bucketId);
        }
      }

      console.log(`[BucketOrchestrator] Loaded ${this.buckets.size} buckets`);
      console.log(`  Technical: ${this.categories.technical.length}`);
      console.log(`  Creative: ${this.categories.creative.length}`);
      console.log(`  Business: ${this.categories.business.length}`);

      return this.buckets.size;

    } catch (error) {
      console.error('[BucketOrchestrator] Init error:', error.message);
      throw error;
    }
  }

  /**
   * Route request to best bucket
   *
   * @param {object} request - { prompt, userId, sessionId, category?, domainContext? }
   * @returns {Promise<object>} - Response from bucket
   */
  async route(request) {
    // Select bucket based on request
    const bucket = await this._selectBucket(request);

    if (!bucket) {
      throw new Error('No suitable bucket found for request');
    }

    console.log(`[BucketOrchestrator] Routing to: ${bucket.bucketName}`);

    // Execute through bucket
    return await bucket.execute(request);
  }

  /**
   * Broadcast request to all buckets (for testing/comparison)
   *
   * @param {object} request - { prompt, userId, sessionId }
   * @returns {Promise<Array>} - Responses from all buckets
   */
  async broadcast(request) {
    console.log(`[BucketOrchestrator] Broadcasting to ${this.buckets.size} buckets`);

    const promises = [];

    for (const bucket of this.buckets.values()) {
      if (bucket.status === 'active') {
        promises.push(
          bucket.execute(request)
            .then(result => ({ ...result, bucketId: bucket.bucketId }))
            .catch(error => ({
              success: false,
              bucketId: bucket.bucketId,
              bucketName: bucket.bucketName,
              error: error.message
            }))
        );
      }
    }

    const results = await Promise.all(promises);

    // Sort by response time
    results.sort((a, b) => (a.responseTime || 0) - (b.responseTime || 0));

    return results;
  }

  /**
   * Route to multiple buckets in a category
   *
   * @param {string} category - 'technical', 'creative', 'business'
   * @param {object} request - Request object
   * @returns {Promise<Array>} - Responses from category buckets
   */
  async routeToCategory(category, request) {
    const categoryLower = category.toLowerCase();

    if (!this.categories[categoryLower]) {
      throw new Error(`Unknown category: ${category}`);
    }

    const bucketIds = this.categories[categoryLower];

    console.log(`[BucketOrchestrator] Routing to ${bucketIds.length} ${category} buckets`);

    const promises = bucketIds.map(bucketId => {
      const bucket = this.buckets.get(bucketId);
      return bucket.execute(request)
        .then(result => ({ ...result, bucketId }))
        .catch(error => ({
          success: false,
          bucketId,
          bucketName: bucket.bucketName,
          error: error.message
        }));
    });

    return await Promise.all(promises);
  }

  /**
   * Route to buckets matching domain context
   *
   * @param {string} domainContext - 'code', 'creative', 'reasoning', etc.
   * @param {object} request - Request object
   * @returns {Promise<Array>} - Responses from matching buckets
   */
  async routeToDomain(domainContext, request) {
    const bucketIds = this.domainMap.get(domainContext);

    if (!bucketIds || bucketIds.length === 0) {
      throw new Error(`No buckets for domain: ${domainContext}`);
    }

    console.log(`[BucketOrchestrator] Routing to ${bucketIds.length} buckets for domain: ${domainContext}`);

    const promises = bucketIds.map(bucketId => {
      const bucket = this.buckets.get(bucketId);
      return bucket.execute(request)
        .then(result => ({ ...result, bucketId }))
        .catch(error => ({
          success: false,
          bucketId,
          bucketName: bucket.bucketName,
          error: error.message
        }));
    });

    return await Promise.all(promises);
  }

  /**
   * Select best bucket for request
   * @private
   */
  async _selectBucket(request) {
    // Explicit bucket ID
    if (request.bucketId) {
      return this.buckets.get(request.bucketId);
    }

    // Explicit category
    if (request.category) {
      const categoryLower = request.category.toLowerCase();
      const bucketIds = this.categories[categoryLower];
      if (bucketIds && bucketIds.length > 0) {
        // Return first bucket in category (TODO: rank by performance)
        return this.buckets.get(bucketIds[0]);
      }
    }

    // Explicit domain context
    if (request.domainContext) {
      const bucketIds = this.domainMap.get(request.domainContext);
      if (bucketIds && bucketIds.length > 0) {
        // Return first bucket for domain (TODO: rank by performance)
        return this.buckets.get(bucketIds[0]);
      }
    }

    // Classify prompt to determine best bucket
    const classification = this._classifyPrompt(request.prompt);

    // Find buckets matching classification
    if (classification.category) {
      const bucketIds = this.categories[classification.category];
      if (bucketIds && bucketIds.length > 0) {
        return this.buckets.get(bucketIds[0]);
      }
    }

    if (classification.domainContext) {
      const bucketIds = this.domainMap.get(classification.domainContext);
      if (bucketIds && bucketIds.length > 0) {
        return this.buckets.get(bucketIds[0]);
      }
    }

    // Default: use general support bucket
    return this.buckets.get('bucket-support') || this.buckets.values().next().value;
  }

  /**
   * Classify prompt to determine category and domain
   * @private
   */
  _classifyPrompt(prompt) {
    const lower = prompt.toLowerCase();

    // Technical patterns
    if (/(code|function|debug|implement|algorithm|class|api|deploy|server|database)/i.test(lower)) {
      if (/(deploy|server|docker|kubernetes|infrastructure)/i.test(lower)) {
        return { category: 'technical', domainContext: 'code', bucketSlug: 'devops' };
      }
      if (/(data|analyze|statistics|chart|graph)/i.test(lower)) {
        return { category: 'technical', domainContext: 'reasoning', bucketSlug: 'data' };
      }
      return { category: 'technical', domainContext: 'code', bucketSlug: 'code' };
    }

    // Creative patterns
    if (/(art|design|creative|visual|aesthetic|style|draw|paint)/i.test(lower)) {
      return { category: 'creative', domainContext: 'creative', bucketSlug: 'art' };
    }
    if (/(story|write|poem|narrative|character|plot)/i.test(lower)) {
      return { category: 'creative', domainContext: 'creative', bucketSlug: 'writing' };
    }
    if (/(music|audio|sound|song|composition)/i.test(lower)) {
      return { category: 'creative', domainContext: 'creative', bucketSlug: 'music' };
    }
    if (/(video|film|movie|scene|screenplay)/i.test(lower)) {
      return { category: 'creative', domainContext: 'creative', bucketSlug: 'video' };
    }

    // Business patterns
    if (/(consult|proposal|architect|strategy|business)/i.test(lower)) {
      return { category: 'business', domainContext: 'reasoning', bucketSlug: 'consulting' };
    }
    if (/(teach|learn|course|workshop|education)/i.test(lower)) {
      return { category: 'business', domainContext: 'fact', bucketSlug: 'education' };
    }
    if (/(research|market|analyze|competitive|trend)/i.test(lower)) {
      return { category: 'business', domainContext: 'reasoning', bucketSlug: 'research' };
    }

    // Quick/simple queries
    if (lower.length < 50 || /(what|where|when|how|define)/i.test(lower)) {
      return { category: 'business', domainContext: 'simple', bucketSlug: 'support' };
    }

    // Default: support bucket
    return { category: 'business', domainContext: 'simple', bucketSlug: 'support' };
  }

  /**
   * Get bucket by ID
   */
  getBucket(bucketId) {
    return this.buckets.get(bucketId);
  }

  /**
   * Get all buckets
   */
  getAllBuckets() {
    return Array.from(this.buckets.values()).map(b => b.toJSON());
  }

  /**
   * Get buckets by category
   */
  getBucketsByCategory(category) {
    const categoryLower = category.toLowerCase();
    const bucketIds = this.categories[categoryLower] || [];

    return bucketIds.map(id => this.buckets.get(id)).filter(b => b).map(b => b.toJSON());
  }

  /**
   * Get buckets by domain context
   */
  getBucketsByDomain(domainContext) {
    const bucketIds = this.domainMap.get(domainContext) || [];

    return bucketIds.map(id => this.buckets.get(id)).filter(b => b).map(b => b.toJSON());
  }

  /**
   * Get aggregate performance across all buckets
   */
  async getAggregatePerformance() {
    const performances = await Promise.all(
      Array.from(this.buckets.values()).map(bucket => bucket.getPerformance())
    );

    const aggregate = {
      totalBuckets: this.buckets.size,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgSuccessRate: 0,
      avgResponseTime: 0,
      totalCost: 0,
      totalReasoningLogs: 0,
      totalPendingTodos: 0,
      byCategory: {
        technical: { requests: 0, successRate: 0, avgResponseTime: 0 },
        creative: { requests: 0, successRate: 0, avgResponseTime: 0 },
        business: { requests: 0, successRate: 0, avgResponseTime: 0 }
      }
    };

    for (const perf of performances) {
      aggregate.totalRequests += perf.totalRequests;
      aggregate.totalCost += perf.totalCost;
      aggregate.totalReasoningLogs += perf.reasoningCount;
      aggregate.totalPendingTodos += perf.pendingTodos;
    }

    // Calculate averages
    if (performances.length > 0) {
      aggregate.avgSuccessRate = performances.reduce((sum, p) => sum + p.successRate, 0) / performances.length;
      aggregate.avgResponseTime = performances.reduce((sum, p) => sum + p.avgResponseMs, 0) / performances.length;
    }

    return aggregate;
  }

  /**
   * Get bucket health status
   */
  async getHealthStatus() {
    const health = {
      status: 'healthy',
      activeBuckets: 0,
      pausedBuckets: 0,
      issues: []
    };

    for (const bucket of this.buckets.values()) {
      if (bucket.status === 'active') {
        health.activeBuckets++;

        // Check for issues
        const perf = await bucket.getPerformance();

        if (perf.successRate < 0.8 && perf.totalRequests > 10) {
          health.issues.push({
            bucketId: bucket.bucketId,
            bucketName: bucket.bucketName,
            issue: 'low_success_rate',
            value: perf.successRate,
            message: `Success rate ${(perf.successRate * 100).toFixed(1)}% is below 80%`
          });
        }

        if (perf.avgResponseMs > 5000) {
          health.issues.push({
            bucketId: bucket.bucketId,
            bucketName: bucket.bucketName,
            issue: 'slow_response',
            value: perf.avgResponseMs,
            message: `Average response time ${perf.avgResponseMs.toFixed(0)}ms exceeds 5s`
          });
        }

        if (perf.pendingTodos > 10) {
          health.issues.push({
            bucketId: bucket.bucketId,
            bucketName: bucket.bucketName,
            issue: 'pending_todos',
            value: perf.pendingTodos,
            message: `${perf.pendingTodos} pending todos need attention`
          });
        }

      } else {
        health.pausedBuckets++;
      }
    }

    if (health.issues.length > 0) {
      health.status = 'degraded';
    }

    if (health.activeBuckets === 0) {
      health.status = 'critical';
    }

    return health;
  }

  /**
   * Compare bucket performance
   *
   * @param {Array<string>} bucketIds - Buckets to compare
   * @returns {Promise<object>} - Comparison data
   */
  async compareBuckets(bucketIds) {
    const comparison = {
      buckets: [],
      winner: null
    };

    for (const bucketId of bucketIds) {
      const bucket = this.buckets.get(bucketId);
      if (!bucket) continue;

      const perf = await bucket.getPerformance();

      comparison.buckets.push({
        bucketId,
        bucketName: bucket.bucketName,
        ollamaModel: bucket.ollamaModel,
        performance: perf
      });
    }

    // Determine winner (highest success rate, then fastest)
    if (comparison.buckets.length > 0) {
      comparison.buckets.sort((a, b) => {
        if (b.performance.successRate !== a.performance.successRate) {
          return b.performance.successRate - a.performance.successRate;
        }
        return a.performance.avgResponseMs - b.performance.avgResponseMs;
      });

      comparison.winner = comparison.buckets[0].bucketId;
    }

    return comparison;
  }

  /**
   * Reload bucket from database
   */
  async reloadBucket(bucketId) {
    const dependencies = {
      db: this.db,
      usageTracker: this.usageTracker,
      modelWrapper: this.modelWrapper,
      workflowBuilder: this.workflowBuilder,
      artifactStorage: this.artifactStorage
    };

    const bucket = await BucketInstance.load(bucketId, this.db, dependencies);
    this.buckets.set(bucketId, bucket);

    console.log(`[BucketOrchestrator] Reloaded: ${bucket.bucketName}`);

    return bucket;
  }

  /**
   * Reload all buckets
   */
  async reloadAll() {
    console.log('[BucketOrchestrator] Reloading all buckets...');

    this.buckets.clear();
    this.categories = { technical: [], creative: [], business: [] };
    this.domainMap.clear();

    await this.init();

    console.log('[BucketOrchestrator] Reload complete');
  }

  // ============================================================================
  // Portal Management
  // ============================================================================

  /**
   * Get buckets formatted as starters (Pokémon-style)
   */
  async getStarterBuckets() {
    const starters = [];

    for (const bucket of this.buckets.values()) {
      if (bucket.status !== 'active') continue;

      const perf = await bucket.getPerformance();

      // Format as starter
      starters.push({
        id: bucket.bucketId,
        name: bucket.bucketName,
        slug: bucket.bucketSlug,
        type: bucket.category,
        model: {
          name: bucket.ollamaModel,
          family: bucket.modelFamily
        },
        domain: bucket.domainContext,
        stats: {
          speed: this._calculateSpeedStat(perf.avgResponseMs),
          accuracy: Math.round(perf.successRate * 100),
          cost: this._calculateCostStat(perf.totalCost / Math.max(perf.totalRequests, 1)),
          total: 0 // Will be calculated
        },
        performance: {
          totalRequests: perf.totalRequests,
          successRate: perf.successRate,
          avgResponseMs: perf.avgResponseMs,
          totalCost: perf.totalCost
        }
      });
    }

    // Calculate total stats
    starters.forEach(starter => {
      starter.stats.total = starter.stats.speed + starter.stats.accuracy + starter.stats.cost;
    });

    return starters;
  }

  /**
   * Calculate speed stat (0-100) from response time
   * @private
   */
  _calculateSpeedStat(avgResponseMs) {
    // 0ms = 100, 5000ms = 0
    if (avgResponseMs <= 0) return 100;
    if (avgResponseMs >= 5000) return 0;

    return Math.round(100 - (avgResponseMs / 5000) * 100);
  }

  /**
   * Calculate cost stat (0-100) from average cost
   * @private
   */
  _calculateCostStat(avgCostUsd) {
    // $0 = 100, $0.01 = 0
    if (avgCostUsd <= 0) return 100;
    if (avgCostUsd >= 0.01) return 0;

    return Math.round(100 - (avgCostUsd / 0.01) * 100);
  }

  /**
   * Execute bucket battle (for multiplayer)
   *
   * @param {string} bucket1Id - First bucket ID
   * @param {string} bucket2Id - Second bucket ID
   * @param {string} prompt - Battle prompt
   * @returns {Promise<object>} - Battle results
   */
  async executeBattle(bucket1Id, bucket2Id, prompt) {
    const bucket1 = this.buckets.get(bucket1Id);
    const bucket2 = this.buckets.get(bucket2Id);

    if (!bucket1 || !bucket2) {
      throw new Error('One or both buckets not found');
    }

    console.log(`[BucketOrchestrator] Battle: ${bucket1.bucketName} vs ${bucket2.bucketName}`);

    const startTime1 = Date.now();
    const result1 = await bucket1.chat([{ role: 'user', content: prompt }]);
    const responseTime1 = Date.now() - startTime1;

    const startTime2 = Date.now();
    const result2 = await bucket2.chat([{ role: 'user', content: prompt }]);
    const responseTime2 = Date.now() - startTime2;

    return {
      bucket1: {
        bucketId: bucket1Id,
        bucketName: bucket1.bucketName,
        response: result1.content,
        responseTimeMs: responseTime1,
        tokens: result1.usage?.total_tokens || 0,
        costUsd: result1.costUsd || 0
      },
      bucket2: {
        bucketId: bucket2Id,
        bucketName: bucket2.bucketName,
        response: result2.content,
        responseTimeMs: responseTime2,
        tokens: result2.usage?.total_tokens || 0,
        costUsd: result2.costUsd || 0
      },
      winner: responseTime1 < responseTime2 ? 'bucket1' : 'bucket2',
      winnerReason: `${Math.min(responseTime1, responseTime2)}ms vs ${Math.max(responseTime1, responseTime2)}ms`
    };
  }

  /**
   * Execute collaborative workflow (multi-bucket chain)
   *
   * @param {Array<string>} bucketIds - Bucket IDs in chain order
   * @param {string} initialPrompt - Starting prompt
   * @returns {Promise<object>} - Workflow results
   */
  async executeCollaborativeWorkflow(bucketIds, initialPrompt) {
    const results = [];
    let currentPrompt = initialPrompt;

    for (const bucketId of bucketIds) {
      const bucket = this.buckets.get(bucketId);

      if (!bucket) {
        results.push({
          bucketId,
          error: 'Bucket not found',
          response: null
        });
        continue;
      }

      const startTime = Date.now();
      const result = await bucket.chat([{ role: 'user', content: currentPrompt }]);
      const responseTime = Date.now() - startTime;

      results.push({
        bucketId,
        bucketName: bucket.bucketName,
        prompt: currentPrompt,
        response: result.content,
        responseTimeMs: responseTime,
        tokens: result.usage?.total_tokens || 0,
        costUsd: result.costUsd || 0
      });

      // Next bucket receives previous bucket's output
      currentPrompt = result.content;
    }

    return {
      steps: results,
      finalOutput: results[results.length - 1]?.response || null,
      totalTime: results.reduce((sum, r) => sum + (r.responseTimeMs || 0), 0),
      totalCost: results.reduce((sum, r) => sum + (r.costUsd || 0), 0)
    };
  }
}

module.exports = BucketOrchestrator;

/**
 * Use Case Analyzer
 *
 * Discovers REAL use case categories from actual usage patterns.
 * Not predefined categories - cluster prompts by similarity and discover:
 * - "80% of GPT-4 requests are casual chat (starbucks menus)"
 * - "Technical code queries are rare"
 * - "People ask about X, Y, Z most often"
 *
 * Uses simple keyword clustering for now.
 * TODO: Replace with ML-based clustering (K-means, DBSCAN on embeddings)
 */

class UseCaseAnalyzer {
  constructor(options = {}) {
    this.db = options.db;

    // Minimum samples needed to declare a new category
    this.minSamplesForCategory = options.minSamplesForCategory || 10;

    // Known categories (seeded, can discover more)
    this.categories = new Map();
  }

  /**
   * Analyze usage logs and discover patterns
   *
   * @param {string} timeframe - e.g., '1 week', '1 month'
   * @returns {Promise<object>} - Discovered patterns
   */
  async analyze(timeframe = '1 week') {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    console.log(`[UseCaseAnalyzer] Analyzing ${timeframe} of data...`);

    // Get all usage logs in timeframe
    const logs = await this._getLogs(timeframe);

    if (logs.length === 0) {
      console.log('[UseCaseAnalyzer] No data to analyze');
      return { categories: [], patterns: [] };
    }

    console.log(`[UseCaseAnalyzer] Loaded ${logs.length} requests`);

    // Cluster by similarity
    const clusters = this._clusterPrompts(logs);

    console.log(`[UseCaseAnalyzer] Found ${clusters.length} clusters`);

    // Convert clusters to categories
    const discoveries = [];

    for (const cluster of clusters) {
      if (cluster.samples.length >= this.minSamplesForCategory) {
        const category = this._clusterToCategory(cluster);

        discoveries.push(category);

        // Save to database
        await this._saveCategory(category);
      }
    }

    // Analyze model routing patterns
    const routing Patterns = await this._analyzeRouting(logs);

    return {
      categories: discoveries,
      routingPatterns,
      totalRequests: logs.length,
      timeframe
    };
  }

  /**
   * Get usage logs from database
   * @private
   */
  async _getLogs(timeframe) {
    try {
      const result = await this.db.query(`
        SELECT
          prompt_text,
          prompt_length,
          model_id,
          model_type,
          model_provider,
          use_case_category,
          response_time_ms,
          status,
          cost_usd,
          had_followup,
          timestamp
        FROM model_usage_log
        WHERE timestamp > NOW() - INTERVAL '${timeframe}'
          AND prompt_text IS NOT NULL
        ORDER BY timestamp DESC
      `);

      return result.rows;

    } catch (error) {
      console.error('[UseCaseAnalyzer] Load logs error:', error.message);
      return [];
    }
  }

  /**
   * Cluster prompts by similarity (keyword-based for now)
   * @private
   */
  _clusterPrompts(logs) {
    const clusters = [];

    // Group by keywords
    const keywordGroups = new Map();

    for (const log of logs) {
      const keywords = this._extractKeywords(log.promptText);

      for (const keyword of keywords) {
        if (!keywordGroups.has(keyword)) {
          keywordGroups.set(keyword, []);
        }
        keywordGroups.get(keyword).push(log);
      }
    }

    // Convert to clusters (sort by size)
    for (const [keyword, samples] of keywordGroups.entries()) {
      if (samples.length >= 3) {  // At least 3 samples
        clusters.push({
          keyword,
          samples,
          avgLength: samples.reduce((sum, s) => sum + s.promptLength, 0) / samples.length,
          avgResponseTime: samples.reduce((sum, s) => sum + (s.responseTimeMs || 0), 0) / samples.length,
          modelsUsed: [...new Set(samples.map(s => s.modelId))]
        });
      }
    }

    // Sort by sample count
    clusters.sort((a, b) => b.samples.length - a.samples.length);

    return clusters;
  }

  /**
   * Extract keywords from prompt
   * @private
   */
  _extractKeywords(prompt) {
    if (!prompt) return [];

    const lower = prompt.toLowerCase();

    const keywords = [];

    // Common patterns
    if (/(what|where|when|how|menu|hours|store|open|price)/i.test(lower)) {
      keywords.push('casual_info');
    }

    if (/(starbucks|restaurant|food|coffee|eat|drink)/i.test(lower)) {
      keywords.push('food_dining');
    }

    if (/(code|function|debug|implement|error|class)/i.test(lower)) {
      keywords.push('technical_code');
    }

    if (/(write|story|poem|creative|draft)/i.test(lower)) {
      keywords.push('creative_writing');
    }

    if (/(analyze|calculate|data|statistics|trend)/i.test(lower)) {
      keywords.push('data_analysis');
    }

    if (/(define|what is|explain|meaning)/i.test(lower)) {
      keywords.push('quick_definition');
    }

    // Length-based
    if (lower.length < 30) {
      keywords.push('short_query');
    } else if (lower.length > 200) {
      keywords.push('long_query');
    }

    return keywords.length > 0 ? keywords : ['general'];
  }

  /**
   * Convert cluster to category
   * @private
   */
  _clusterToCategory(cluster) {
    // Determine category name from keyword
    const categoryNames = {
      'casual_info': 'Casual Information',
      'food_dining': 'Food & Dining Queries',
      'technical_code': 'Technical Code',
      'creative_writing': 'Creative Writing',
      'data_analysis': 'Data Analysis',
      'quick_definition': 'Quick Definitions',
      'short_query': 'Short Questions',
      'long_query': 'Complex Inquiries',
      'general': 'General Queries'
    };

    const categoryName = categoryNames[cluster.keyword] || cluster.keyword;
    const categorySlug = cluster.keyword;

    // Extract example prompts
    const examplePrompts = cluster.samples.slice(0, 5).map(s => s.promptText);

    // Extract keywords from all prompts
    const allKeywords = new Set();
    for (const sample of cluster.samples) {
      const words = sample.promptText.toLowerCase().match(/\b\w{4,}\b/g) || [];
      words.forEach(w => allKeywords.add(w));
    }

    return {
      categoryName,
      categorySlug,
      sampleCount: cluster.samples.length,
      examplePrompts,
      keywords: Array.from(allKeywords).slice(0, 20),
      typicalPromptLength: Math.round(cluster.avgLength),
      typicalResponseTime: Math.round(cluster.avgResponseTime),
      modelsUsed: cluster.modelsUsed,
      requiresFastResponse: cluster.avgResponseTime < 3000,
      requiresHighAccuracy: false,  // TODO: infer from followup rate
      costSensitive: true
    };
  }

  /**
   * Save discovered category to database
   * @private
   */
  async _saveCategory(category) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO model_use_cases (
          category_name,
          category_slug,
          sample_count,
          example_prompts,
          keywords,
          typical_prompt_length,
          typical_response_length,
          requires_fast_response,
          requires_high_accuracy,
          cost_sensitive
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (category_slug) DO UPDATE SET
          sample_count = EXCLUDED.sample_count,
          example_prompts = EXCLUDED.example_prompts,
          keywords = EXCLUDED.keywords,
          typical_prompt_length = EXCLUDED.typical_prompt_length
      `, [
        category.categoryName,
        category.categorySlug,
        category.sampleCount,
        JSON.stringify(category.examplePrompts),
        category.keywords,
        category.typicalPromptLength,
        category.typicalResponseTime,
        category.requiresFastResponse,
        category.requiresHighAccuracy,
        category.costSensitive
      ]);

      console.log(`[UseCaseAnalyzer] Saved category: ${category.categoryName} (${category.sampleCount} samples)`);

    } catch (error) {
      console.error('[UseCaseAnalyzer] Save category error:', error.message);
    }
  }

  /**
   * Analyze routing patterns (which models handle what)
   * @private
   */
  async _analyzeRouting(logs) {
    const patterns = {
      byModel: {},
      byCategory: {},
      inefficiencies: []
    };

    // Group by model
    for (const log of logs) {
      if (!patterns.byModel[log.modelId]) {
        patterns.byModel[log.modelId] = {
          totalRequests: 0,
          categories: {},
          avgCost: 0,
          avgTime: 0
        };
      }

      const modelStats = patterns.byModel[log.modelId];
      modelStats.totalRequests++;

      const category = log.useCaseCategory || 'unknown';
      modelStats.categories[category] = (modelStats.categories[category] || 0) + 1;

      modelStats.avgCost += log.costUsd || 0;
      modelStats.avgTime += log.responseTimeMs || 0;
    }

    // Calculate averages
    for (const [modelId, stats] of Object.entries(patterns.byModel)) {
      stats.avgCost /= stats.totalRequests;
      stats.avgTime /= stats.totalRequests;
    }

    // Detect inefficiencies
    // Example: Expensive model used for cheap category
    for (const [modelId, stats] of Object.entries(patterns.byModel)) {
      if (stats.avgCost > 0.01) {  // Expensive
        const casualCount = stats.categories['casual_chat'] || 0;

        if (casualCount > stats.totalRequests * 0.3) {  // >30% casual
          patterns.inefficiencies.push({
            type: 'expensive_for_casual',
            modelId,
            message: `${modelId} used for ${casualCount} casual queries (costs $${stats.avgCost.toFixed(4)}/req)`,
            suggestion: 'Route casual queries to Ollama (free)'
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Get discovered categories
   */
  async getCategories() {
    if (!this.db) return [];

    try {
      const result = await this.db.query(`
        SELECT * FROM model_use_cases
        ORDER BY sample_count DESC
      `);

      return result.rows;

    } catch (error) {
      console.error('[UseCaseAnalyzer] Get categories error:', error.message);
      return [];
    }
  }
}

module.exports = UseCaseAnalyzer;

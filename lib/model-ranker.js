/**
 * Model Ranker
 *
 * Ranks models per use case based on ACTUAL performance metrics:
 * - Success rate
 * - Response time
 * - Cost
 * - User satisfaction (implicit: followup rate, abandonment)
 *
 * Output: "For casual_chat, best model is ollama:mistral (fast, free, good enough)"
 *
 * Key insight: Stop defaulting to GPT-4 for everything. Use data to decide.
 */

class ModelRanker {
  constructor(options = {}) {
    this.db = options.db;
    this.minSamplesForRanking = options.minSamplesForRanking || 5;

    // Ranking weights (can be tuned)
    this.weights = {
      success: 0.40,      // 40% weight on success rate
      speed: 0.30,        // 30% weight on speed
      cost: 0.20,         // 20% weight on cost
      satisfaction: 0.10  // 10% weight on user satisfaction
    };
  }

  /**
   * Refresh all rankings from usage data
   *
   * @returns {Promise<number>} - Number of rankings updated
   */
  async refreshAll() {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    console.log('[ModelRanker] Refreshing all rankings...');

    try {
      // Call database function
      const result = await this.db.query('SELECT refresh_model_rankings()');

      const count = result.rows[0].refresh_model_rankings;

      console.log(`[ModelRanker] Updated ${count} rankings`);

      return count;

    } catch (error) {
      console.error('[ModelRanker] Refresh error:', error.message);
      throw error;
    }
  }

  /**
   * Get rankings for a specific use case
   *
   * @param {string} useCase - Use case category
   * @returns {Promise<object>} - Rankings with best, alternatives, stats
   */
  async getRankings(useCase) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(`
        SELECT
          model_id,
          model_provider,
          total_requests,
          success_rate,
          avg_response_time_ms,
          avg_cost_per_request,
          avg_followup_rate,
          ranking_score
        FROM model_rankings
        WHERE use_case_category = $1
          AND total_requests >= $2
        ORDER BY ranking_score DESC
      `, [useCase, this.minSamplesForRanking]);

      if (result.rows.length === 0) {
        return {
          useCase,
          best: null,
          alternatives: [],
          message: 'No data yet - need more samples'
        };
      }

      const [best, ...alternatives] = result.rows;

      return {
        useCase,
        best: {
          modelId: best.modelId,
          provider: best.modelProvider,
          score: parseFloat(best.rankingScore),
          successRate: parseFloat(best.successRate),
          avgTimeMs: parseFloat(best.avgResponseTimeMs),
          avgCost: parseFloat(best.avgCostPerRequest),
          totalRequests: best.totalRequests
        },
        alternatives: alternatives.slice(0, 3).map(alt => ({
          modelId: alt.modelId,
          provider: alt.modelProvider,
          score: parseFloat(alt.rankingScore),
          successRate: parseFloat(alt.successRate),
          avgTimeMs: parseFloat(alt.avgResponseTimeMs),
          avgCost: parseFloat(alt.avgCostPerRequest)
        })),
        stats: {
          totalModels: result.rows.length,
          dataAvailable: true
        }
      };

    } catch (error) {
      console.error('[ModelRanker] Get rankings error:', error.message);
      throw error;
    }
  }

  /**
   * Get best model for a use case
   *
   * @param {string} useCase - Use case category
   * @returns {Promise<string>} - Best model ID
   */
  async getBestModel(useCase) {
    const rankings = await this.getRankings(useCase);

    if (!rankings.best) {
      // No data - return default
      if (useCase === 'casual_chat' || useCase === 'quick_lookup') {
        return 'ollama:mistral';  // Default to fast, free
      }
      return 'gpt-4';  // Conservative default
    }

    return rankings.best.modelId;
  }

  /**
   * Compare two models for a use case
   *
   * @param {string} useCase - Use case category
   * @param {string} modelA - First model
   * @param {string} modelB - Second model
   * @returns {Promise<object>} - Comparison
   */
  async compareModels(useCase, modelA, modelB) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(`
        SELECT
          model_id,
          total_requests,
          success_rate,
          avg_response_time_ms,
          avg_cost_per_request,
          avg_followup_rate,
          ranking_score
        FROM model_rankings
        WHERE use_case_category = $1
          AND model_id IN ($2, $3)
      `, [useCase, modelA, modelB]);

      if (result.rows.length < 2) {
        return {
          useCase,
          modelA,
          modelB,
          comparison: 'insufficient_data',
          message: 'Not enough data for both models'
        };
      }

      const statsA = result.rows.find(r => r.modelId === modelA);
      const statsB = result.rows.find(r => r.modelId === modelB);

      return {
        useCase,
        modelA: {
          modelId: modelA,
          score: parseFloat(statsA.rankingScore),
          successRate: parseFloat(statsA.successRate),
          avgTimeMs: parseFloat(statsA.avgResponseTimeMs),
          avgCost: parseFloat(statsA.avgCostPerRequest),
          samples: statsA.totalRequests
        },
        modelB: {
          modelId: modelB,
          score: parseFloat(statsB.rankingScore),
          successRate: parseFloat(statsB.successRate),
          avgTimeMs: parseFloat(statsB.avgResponseTimeMs),
          avgCost: parseFloat(statsB.avgCostPerRequest),
          samples: statsB.totalRequests
        },
        winner: statsA.rankingScore > statsB.rankingScore ? modelA : modelB,
        speedWinner: statsA.avgResponseTimeMs < statsB.avgResponseTimeMs ? modelA : modelB,
        costWinner: statsA.avgCostPerRequest < statsB.avgCostPerRequest ? modelA : modelB,
        qualityWinner: statsA.successRate > statsB.successRate ? modelA : modelB
      };

    } catch (error) {
      console.error('[ModelRanker] Compare error:', error.message);
      throw error;
    }
  }

  /**
   * Get all rankings summary
   *
   * @returns {Promise<object>} - All use cases with best models
   */
  async getAllRankings() {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      // Get all use cases
      const useCases = await this.db.query(`
        SELECT DISTINCT use_case_category
        FROM model_rankings
        WHERE total_requests >= $1
      `, [this.minSamplesForRanking]);

      const summary = {};

      for (const row of useCases.rows) {
        const useCase = row.useCaseCategory;
        const rankings = await this.getRankings(useCase);
        summary[useCase] = rankings;
      }

      return summary;

    } catch (error) {
      console.error('[ModelRanker] Get all rankings error:', error.message);
      throw error;
    }
  }

  /**
   * Analyze cost savings from better routing
   *
   * @returns {Promise<object>} - Potential savings analysis
   */
  async analyzeSavings() {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      // Calculate actual cost
      const actualResult = await this.db.query(`
        SELECT SUM(cost_usd) as actual_cost
        FROM model_usage_log
        WHERE timestamp > NOW() - INTERVAL '1 month'
      `);

      const actualCost = parseFloat(actualResult.rows[0].actualCost) || 0;

      // Calculate optimal cost (if we used best model for each category)
      const optimalResult = await this.db.query(`
        SELECT
          l.use_case_category,
          COUNT(*) as requests,
          r.avg_cost_per_request as optimal_cost
        FROM model_usage_log l
        LEFT JOIN LATERAL (
          SELECT avg_cost_per_request
          FROM model_rankings
          WHERE use_case_category = l.use_case_category
          ORDER BY ranking_score DESC
          LIMIT 1
        ) r ON true
        WHERE l.timestamp > NOW() - INTERVAL '1 month'
          AND l.use_case_category IS NOT NULL
        GROUP BY l.use_case_category, r.avg_cost_per_request
      `);

      let optimalCost = 0;
      for (const row of optimalResult.rows) {
        optimalCost += row.requests * (parseFloat(row.optimalCost) || 0);
      }

      const savings = actualCost - optimalCost;
      const savingsPercent = actualCost > 0 ? (savings / actualCost) * 100 : 0;

      return {
        actualCost: actualCost.toFixed(2),
        optimalCost: optimalCost.toFixed(2),
        potentialSavings: savings.toFixed(2),
        savingsPercent: savingsPercent.toFixed(1) + '%',
        message: savings > 0
          ? `Could save $${savings.toFixed(2)}/month (${savingsPercent.toFixed(1)}%) by using best models per use case`
          : 'Already using optimal routing!'
      };

    } catch (error) {
      console.error('[ModelRanker] Analyze savings error:', error.message);
      throw error;
    }
  }

  /**
   * Get model performance over time
   *
   * @param {string} modelId - Model to analyze
   * @param {string} useCase - Use case category
   * @param {string} timeframe - e.g., '1 week'
   * @returns {Promise<Array>} - Time series data
   */
  async getPerformanceTrend(modelId, useCase, timeframe = '1 week') {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(`
        SELECT
          DATE_TRUNC('day', timestamp) as day,
          COUNT(*) as requests,
          COUNT(*) FILTER (WHERE status = 'success')::REAL / COUNT(*)::REAL as success_rate,
          AVG(response_time_ms) as avg_time_ms,
          AVG(cost_usd) as avg_cost
        FROM model_usage_log
        WHERE model_id = $1
          AND use_case_category = $2
          AND timestamp > NOW() - INTERVAL '${timeframe}'
        GROUP BY day
        ORDER BY day ASC
      `, [modelId, useCase]);

      return result.rows.map(row => ({
        date: row.day,
        requests: row.requests,
        successRate: parseFloat(row.successRate),
        avgTimeMs: parseFloat(row.avgTimeMs),
        avgCost: parseFloat(row.avgCost)
      }));

    } catch (error) {
      console.error('[ModelRanker] Performance trend error:', error.message);
      throw error;
    }
  }
}

module.exports = ModelRanker;

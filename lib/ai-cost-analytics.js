/**
 * AI Cost Analytics Engine
 *
 * "See if the curve is going up or down when we wiggle something"
 *
 * Problem:
 * - Need to track AI costs over time
 * - Detect cost trends (increasing/decreasing)
 * - Compare provider efficiency
 * - Know when costs spike
 *
 * Solution:
 * - Aggregate cost data into time-series "candles"
 * - Calculate cost trends and projections
 * - Track provider performance metrics
 * - Store historical data for analysis
 *
 * Features:
 * - Cost candles (OHLC) per provider
 * - Trend detection (slope calculation)
 * - Provider comparison metrics
 * - Cost projections
 */

const crypto = require('crypto');

class AICostAnalytics {
  constructor(options = {}) {
    this.db = options.db;
    this.aiInstanceRegistry = options.aiInstanceRegistry;

    // Timeframes for candle aggregation
    this.timeframes = {
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000
    };

    // In-memory candle cache
    this.candleCache = new Map();

    // Trend cache (to avoid recalculating)
    this.trendCache = new Map();
    this.trendCacheTTL = 60000; // 1 minute

    console.log('[AICostAnalytics] Initialized');
  }

  /**
   * Record AI usage event for analytics
   *
   * @param {object} event - Usage event
   * @returns {Promise<void>}
   */
  async recordUsage(event) {
    if (!this.db) {
      console.warn('[AICostAnalytics] No database, skipping usage recording');
      return;
    }

    const {
      instanceName,
      provider,
      model,
      tokens,
      promptTokens,      // Context tokens (input)
      completionTokens,  // Response tokens (output)
      cost,
      latency,
      success,
      errorMessage
    } = event;

    // Calculate totals if individual token counts provided
    const totalTokens = (promptTokens || 0) + (completionTokens || 0) || tokens || 0;
    const prompt = promptTokens || (tokens ? Math.round(tokens * 0.7) : 0);
    const completion = completionTokens || (tokens ? Math.round(tokens * 0.3) : 0);

    try {
      await this.db.query(
        `INSERT INTO ai_usage_history (
          instance_name, provider, model, tokens, prompt_tokens, completion_tokens,
          cost_usd, latency_ms, success, error_message, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [instanceName, provider, model, totalTokens, prompt, completion, cost, latency, success, errorMessage]
      );
    } catch (error) {
      console.error('[AICostAnalytics] Error recording usage:', error.message);
    }
  }

  /**
   * Compute cost candles for a time period
   *
   * @param {object} options - Candle options
   * @returns {Promise<Array>} Cost candles
   */
  async computeCostCandles({ provider, instanceName, timeframe = '1h', from, to }) {
    if (!this.db) {
      console.warn('[AICostAnalytics] No database, returning empty candles');
      return [];
    }

    const timeframeMs = this.timeframes[timeframe];
    if (!timeframeMs) {
      throw new Error(`Invalid timeframe: ${timeframe}`);
    }

    const fromDate = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const toDate = to || new Date();

    console.log(`[AICostAnalytics] Computing ${timeframe} candles for ${provider || instanceName || 'all'}`);

    try {
      let query = `
        SELECT
          date_trunc('${this._timeframeToSQL(timeframe)}', created_at) as bucket,
          SUM(cost_usd) as total_cost,
          COUNT(*) as request_count,
          SUM(tokens) as total_tokens,
          SUM(prompt_tokens) as total_prompt_tokens,
          SUM(completion_tokens) as total_completion_tokens,
          AVG(prompt_tokens) as avg_prompt_tokens,
          MAX(prompt_tokens) as max_prompt_tokens,
          AVG(latency_ms) as avg_latency,
          SUM(CASE WHEN success THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as success_rate,

          -- OHLC for cost
          (array_agg(cost_usd ORDER BY created_at ASC))[1] as cost_open,
          MAX(cost_usd) as cost_high,
          MIN(cost_usd) as cost_low,
          (array_agg(cost_usd ORDER BY created_at DESC))[1] as cost_close
        FROM ai_usage_history
        WHERE created_at >= $1 AND created_at < $2
      `;

      const params = [fromDate, toDate];
      let paramIndex = 3;

      if (provider) {
        query += ` AND provider = $${paramIndex++}`;
        params.push(provider);
      }

      if (instanceName) {
        query += ` AND instance_name = $${paramIndex++}`;
        params.push(instanceName);
      }

      query += `
        GROUP BY bucket
        ORDER BY bucket ASC
      `;

      const result = await this.db.query(query, params);

      return result.rows.map(row => ({
        timestamp: row.bucket,
        totalCost: parseFloat(row.total_cost) || 0,
        requestCount: parseInt(row.request_count) || 0,
        totalTokens: parseInt(row.total_tokens) || 0,
        totalPromptTokens: parseInt(row.total_prompt_tokens) || 0,
        totalCompletionTokens: parseInt(row.total_completion_tokens) || 0,
        avgPromptTokens: parseFloat(row.avg_prompt_tokens) || 0,
        maxPromptTokens: parseInt(row.max_prompt_tokens) || 0,
        avgLatency: parseFloat(row.avg_latency) || 0,
        successRate: parseFloat(row.success_rate) || 0,
        ohlc: {
          open: parseFloat(row.cost_open) || 0,
          high: parseFloat(row.cost_high) || 0,
          low: parseFloat(row.cost_low) || 0,
          close: parseFloat(row.cost_close) || 0
        }
      }));

    } catch (error) {
      console.error('[AICostAnalytics] Error computing candles:', error.message);
      return [];
    }
  }

  /**
   * Detect cost trend (is it going up or down?)
   *
   * @param {object} options - Trend options
   * @returns {Promise<object>} Trend analysis
   */
  async detectTrend({ provider, instanceName, lookbackPeriod = '24h' }) {
    const cacheKey = `${provider || instanceName || 'all'}:${lookbackPeriod}`;

    // Check trend cache
    const cached = this.trendCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.trendCacheTTL) {
      return cached.trend;
    }

    console.log(`[AICostAnalytics] Detecting trend for ${cacheKey}`);

    // Parse lookback period
    const lookbackMs = this._parseLookbackPeriod(lookbackPeriod);
    const from = new Date(Date.now() - lookbackMs);

    // Get hourly candles
    const candles = await this.computeCostCandles({
      provider,
      instanceName,
      timeframe: '1h',
      from
    });

    if (candles.length < 2) {
      return {
        trend: 'insufficient_data',
        slope: 0,
        direction: 'flat',
        confidence: 0,
        message: 'Not enough data to determine trend'
      };
    }

    // Calculate linear regression slope
    const slope = this._calculateSlope(candles.map((c, i) => ({
      x: i,
      y: c.totalCost
    })));

    const avgCost = candles.reduce((sum, c) => sum + c.totalCost, 0) / candles.length;
    const percentChange = avgCost > 0 ? (slope / avgCost) * 100 : 0;

    let direction, confidence, message;

    if (Math.abs(percentChange) < 5) {
      direction = 'flat';
      confidence = 0.8;
      message = 'Costs are stable';
    } else if (slope > 0) {
      direction = 'increasing';
      confidence = 0.9;
      message = `Costs trending UP ${percentChange.toFixed(1)}%`;
    } else {
      direction = 'decreasing';
      confidence = 0.9;
      message = `Costs trending DOWN ${Math.abs(percentChange).toFixed(1)}%`;
    }

    const trend = {
      trend: direction,
      slope,
      percentChange,
      direction,
      confidence,
      message,
      dataPoints: candles.length,
      avgCost: avgCost.toFixed(4),
      lookbackPeriod
    };

    // Cache result
    this.trendCache.set(cacheKey, {
      trend,
      timestamp: Date.now()
    });

    return trend;
  }

  /**
   * Compare provider efficiency
   *
   * @param {object} options - Comparison options
   * @returns {Promise<Array>} Provider comparison
   */
  async compareProviders({ from, to, minRequests = 10 }) {
    if (!this.db) {
      console.warn('[AICostAnalytics] No database, returning empty comparison');
      return [];
    }

    const fromDate = from || new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    const toDate = to || new Date();

    console.log('[AICostAnalytics] Comparing providers');

    try {
      const result = await this.db.query(
        `SELECT
          provider,
          instance_name,
          COUNT(*) as total_requests,
          SUM(cost_usd) as total_cost,
          AVG(cost_usd) as avg_cost_per_request,
          SUM(tokens) as total_tokens,
          AVG(tokens) as avg_tokens_per_request,
          AVG(latency_ms) as avg_latency,
          SUM(CASE WHEN success THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as success_rate,

          -- Cost efficiency (cost per 1k tokens)
          CASE
            WHEN SUM(tokens) > 0 THEN (SUM(cost_usd) / SUM(tokens)) * 1000
            ELSE 0
          END as cost_per_1k_tokens
        FROM ai_usage_history
        WHERE created_at >= $1 AND created_at < $2
        GROUP BY provider, instance_name
        HAVING COUNT(*) >= $3
        ORDER BY total_cost DESC`,
        [fromDate, toDate, minRequests]
      );

      return result.rows.map(row => ({
        provider: row.provider,
        instanceName: row.instance_name,
        totalRequests: parseInt(row.total_requests),
        totalCost: parseFloat(row.total_cost),
        avgCostPerRequest: parseFloat(row.avg_cost_per_request),
        totalTokens: parseInt(row.total_tokens),
        avgTokensPerRequest: parseFloat(row.avg_tokens_per_request),
        avgLatency: parseFloat(row.avg_latency),
        successRate: parseFloat(row.success_rate),
        costPer1kTokens: parseFloat(row.cost_per_1k_tokens),
        efficiency: this._calculateEfficiencyScore(row)
      }));

    } catch (error) {
      console.error('[AICostAnalytics] Error comparing providers:', error.message);
      return [];
    }
  }

  /**
   * Project future costs based on current trend
   *
   * @param {object} options - Projection options
   * @returns {Promise<object>} Cost projection
   */
  async projectCosts({ provider, instanceName, projectionPeriod = '7d' }) {
    console.log(`[AICostAnalytics] Projecting costs for ${projectionPeriod}`);

    // Get current trend
    const trend = await this.detectTrend({
      provider,
      instanceName,
      lookbackPeriod: '24h'
    });

    // Get recent average cost
    const recentCandles = await this.computeCostCandles({
      provider,
      instanceName,
      timeframe: '1h',
      from: new Date(Date.now() - 24 * 60 * 60 * 1000)
    });

    const avgHourlyCost = recentCandles.length > 0
      ? recentCandles.reduce((sum, c) => sum + c.totalCost, 0) / recentCandles.length
      : 0;

    // Project into future
    const projectionMs = this._parseLookbackPeriod(projectionPeriod);
    const projectionHours = projectionMs / (60 * 60 * 1000);

    const baseCost = avgHourlyCost * projectionHours;
    const trendImpact = trend.slope * projectionHours;
    const projectedCost = Math.max(0, baseCost + trendImpact);

    return {
      currentHourlyCost: avgHourlyCost.toFixed(4),
      projectionPeriod,
      projectedCost: projectedCost.toFixed(2),
      trend: trend.direction,
      confidence: trend.confidence,
      message: `If current trend continues, expect $${projectedCost.toFixed(2)} over ${projectionPeriod}`
    };
  }

  /**
   * Get analytics summary
   *
   * @returns {Promise<object>} Analytics summary
   */
  async getSummary() {
    const [providers, trend24h, projection7d] = await Promise.all([
      this.compareProviders({ from: new Date(Date.now() - 24 * 60 * 60 * 1000) }),
      this.detectTrend({ lookbackPeriod: '24h' }),
      this.projectCosts({ projectionPeriod: '7d' })
    ]);

    const totalCost24h = providers.reduce((sum, p) => sum + p.totalCost, 0);
    const freeProviders = providers.filter(p => p.totalCost === 0);
    const paidProviders = providers.filter(p => p.totalCost > 0);

    return {
      last24Hours: {
        totalCost: totalCost24h.toFixed(4),
        totalRequests: providers.reduce((sum, p) => sum + p.totalRequests, 0),
        providers: providers.length,
        freeProviders: freeProviders.length,
        paidProviders: paidProviders.length
      },
      trend: trend24h,
      projection: projection7d,
      topProviders: providers.slice(0, 5)
    };
  }

  /**
   * Calculate linear regression slope
   * @private
   */
  _calculateSlope(points) {
    const n = points.length;
    if (n < 2) return 0;

    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope || 0;
  }

  /**
   * Calculate efficiency score
   * @private
   */
  _calculateEfficiencyScore(row) {
    // Weighted score: cost (40%), latency (30%), success rate (30%)
    const costScore = row.cost_per_1k_tokens === 0 ? 100 : Math.max(0, 100 - (parseFloat(row.cost_per_1k_tokens) * 100));
    const latencyScore = Math.max(0, 100 - (parseFloat(row.avg_latency) / 100));
    const successScore = parseFloat(row.success_rate) * 100;

    return ((costScore * 0.4) + (latencyScore * 0.3) + (successScore * 0.3)).toFixed(1);
  }

  /**
   * Parse lookback period string to milliseconds
   * @private
   */
  _parseLookbackPeriod(period) {
    const match = period.match(/^(\d+)([hmdrw])$/);
    if (!match) {
      throw new Error(`Invalid lookback period: ${period}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    const units = {
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000,
      'w': 7 * 24 * 60 * 60 * 1000
    };

    return value * units[unit];
  }

  /**
   * Convert timeframe to SQL time bucket
   * @private
   */
  _timeframeToSQL(timeframe) {
    const mapping = {
      '5m': 'minute',
      '15m': 'minute',
      '1h': 'hour',
      '4h': 'hour',
      '1d': 'day',
      '1w': 'week'
    };

    return mapping[timeframe] || 'hour';
  }

  /**
   * Clear trend cache
   */
  clearCache() {
    this.trendCache.clear();
    this.candleCache.clear();
    console.log('[AICostAnalytics] Cache cleared');
  }
}

module.exports = AICostAnalytics;

/**
 * Arbitrage Detector
 *
 * Detects price discrepancies across multiple data sources that may indicate
 * arbitrage opportunities, data quality issues, or API problems.
 *
 * Features:
 * - Multi-source price comparison
 * - Spread calculation (% difference between highest and lowest price)
 * - Arbitrage opportunity detection (when spread > threshold)
 * - Source reliability scoring
 * - Historical opportunity tracking
 */

const { Pool } = require('pg');

class ArbitrageDetector {
  constructor(options = {}) {
    this.db = options.db || new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || process.env.USER,
      password: process.env.DB_PASSWORD || ''
    });

    // Minimum spread percentage to consider as arbitrage opportunity
    this.minSpreadPercent = options.minSpreadPercent || 2.0; // 2% default

    // Maximum acceptable spread (if spread > this, likely a data error)
    this.maxSpreadPercent = options.maxSpreadPercent || 20.0; // 20% default

    // Statistics
    this.stats = {
      opportunities: 0,
      dataErrors: 0,
      totalComparisons: 0
    };
  }

  /**
   * Detect arbitrage by comparing prices from multiple sources
   * @param {string} symbol - Asset symbol (BTC, ETH, AU, AG, etc.)
   * @param {Array} prices - Array of price objects with {source, price, timestamp}
   * @returns {Object} Arbitrage analysis result
   */
  async detectArbitrage(symbol, prices) {
    if (!Array.isArray(prices) || prices.length < 2) {
      throw new Error('Need at least 2 prices to compare');
    }

    this.stats.totalComparisons++;

    // Filter out invalid prices
    const validPrices = prices.filter(p => p.price && p.price > 0 && p.source);

    if (validPrices.length < 2) {
      return {
        symbol,
        hasArbitrage: false,
        reason: 'Insufficient valid prices for comparison'
      };
    }

    // Find min and max prices
    let minPrice = validPrices[0];
    let maxPrice = validPrices[0];

    for (const priceObj of validPrices) {
      if (priceObj.price < minPrice.price) minPrice = priceObj;
      if (priceObj.price > maxPrice.price) maxPrice = priceObj;
    }

    // Calculate spread
    const spread = maxPrice.price - minPrice.price;
    const spreadPercent = (spread / minPrice.price) * 100;

    // Determine if this is arbitrage or data error
    const isArbitrage = spreadPercent >= this.minSpreadPercent && spreadPercent <= this.maxSpreadPercent;
    const isDataError = spreadPercent > this.maxSpreadPercent;

    const result = {
      symbol,
      hasArbitrage: isArbitrage,
      hasDataError: isDataError,
      spread: {
        absolute: spread,
        percent: spreadPercent
      },
      minPrice: {
        source: minPrice.source,
        price: minPrice.price,
        timestamp: minPrice.timestamp
      },
      maxPrice: {
        source: maxPrice.source,
        price: maxPrice.price,
        timestamp: maxPrice.timestamp
      },
      allPrices: validPrices,
      avgPrice: validPrices.reduce((sum, p) => sum + p.price, 0) / validPrices.length,
      medianPrice: this._calculateMedian(validPrices.map(p => p.price))
    };

    // Log to database if arbitrage or error detected
    if (isArbitrage) {
      this.stats.opportunities++;
      await this._logOpportunity(result);
      console.log(`[ArbitrageDetector] 🎯 Arbitrage detected for ${symbol}: ${spreadPercent.toFixed(2)}% spread (${minPrice.source}: $${minPrice.price} vs ${maxPrice.source}: $${maxPrice.price})`);
    } else if (isDataError) {
      this.stats.dataErrors++;
      await this._logOpportunity(result);
      console.error(`[ArbitrageDetector] ⚠️  Data error for ${symbol}: ${spreadPercent.toFixed(2)}% spread - likely bad data from ${maxPrice.source}`);
    }

    return result;
  }

  /**
   * Get recent arbitrage opportunities
   * @param {Object} filters - Optional filters
   * @returns {Array} Recent opportunities
   */
  async getOpportunities(filters = {}) {
    const {
      minSpread = this.minSpreadPercent,
      symbol = null,
      hours = 24,
      limit = 100
    } = filters;

    try {
      const query = `
        SELECT *
        FROM arbitrage_opportunities
        WHERE spread_percent >= $1
          AND detected_at > NOW() - INTERVAL '${hours} hours'
          ${symbol ? 'AND symbol = $2' : ''}
        ORDER BY spread_percent DESC, detected_at DESC
        LIMIT $${symbol ? 3 : 2}
      `;

      const params = symbol ? [minSpread, symbol, limit] : [minSpread, limit];
      const result = await this.db.query(query, params);

      return result.rows || [];
    } catch (error) {
      console.error('[ArbitrageDetector] Error fetching opportunities:', error.message);
      return [];
    }
  }

  /**
   * Get source reliability scores
   * @returns {Array} Sources ranked by reliability
   */
  async getSourceReliability() {
    try {
      const result = await this.db.query(`
        SELECT
          source_name,
          total_fetches,
          successful_fetches,
          failed_fetches,
          ROUND((successful_fetches::float / NULLIF(total_fetches, 0) * 100)::numeric, 2) as success_rate,
          avg_spread_percent,
          reliability_score,
          last_updated
        FROM price_sources
        ORDER BY reliability_score DESC
      `);

      return result.rows || [];
    } catch (error) {
      console.error('[ArbitrageDetector] Error fetching source reliability:', error.message);
      return [];
    }
  }

  /**
   * Update source statistics after a fetch
   * @param {string} sourceName - Source name
   * @param {boolean} success - Whether fetch was successful
   * @param {number} spreadPercent - Spread vs other sources (if applicable)
   */
  async updateSourceStats(sourceName, success, spreadPercent = null) {
    try {
      // Calculate reliability score (success rate weighted, penalized by spread)
      const spreadPenalty = spreadPercent ? Math.min(spreadPercent / 10, 5) : 0;

      await this.db.query(`
        INSERT INTO price_sources (
          source_name,
          total_fetches,
          successful_fetches,
          failed_fetches,
          avg_spread_percent,
          reliability_score,
          last_updated
        ) VALUES (
          $1, 1, $2, $3, $4, $5, CURRENT_TIMESTAMP
        )
        ON CONFLICT (source_name)
        DO UPDATE SET
          total_fetches = price_sources.total_fetches + 1,
          successful_fetches = price_sources.successful_fetches + $2,
          failed_fetches = price_sources.failed_fetches + $3,
          avg_spread_percent = COALESCE(
            (price_sources.avg_spread_percent * price_sources.total_fetches + COALESCE($4, 0)) /
            (price_sources.total_fetches + 1),
            $4
          ),
          reliability_score = (
            (price_sources.successful_fetches + $2)::float /
            (price_sources.total_fetches + 1) * 100
          ) - COALESCE(
            (price_sources.avg_spread_percent * price_sources.total_fetches + COALESCE($4, 0)) /
            (price_sources.total_fetches + 1) / 10,
            0
          ),
          last_updated = CURRENT_TIMESTAMP
      `, [
        sourceName,
        success ? 1 : 0,
        success ? 0 : 1,
        spreadPercent,
        100 - spreadPenalty
      ]);
    } catch (error) {
      // Don't fail if stats update fails
      if (!error.message.includes('does not exist')) {
        console.error('[ArbitrageDetector] Error updating source stats:', error.message);
      }
    }
  }

  /**
   * Get statistics
   * @returns {Object} Detector statistics
   */
  getStats() {
    return {
      ...this.stats,
      arbitrageRate: this.stats.totalComparisons > 0
        ? (this.stats.opportunities / this.stats.totalComparisons * 100).toFixed(2) + '%'
        : '0%',
      errorRate: this.stats.totalComparisons > 0
        ? (this.stats.dataErrors / this.stats.totalComparisons * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Log arbitrage opportunity to database
   * @private
   */
  async _logOpportunity(result) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO arbitrage_opportunities (
          symbol,
          source1,
          price1,
          source2,
          price2,
          spread_absolute,
          spread_percent,
          is_data_error,
          detected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      `, [
        result.symbol,
        result.minPrice.source,
        result.minPrice.price,
        result.maxPrice.source,
        result.maxPrice.price,
        result.spread.absolute,
        result.spread.percent,
        result.hasDataError || false
      ]);
    } catch (error) {
      // Don't fail if logging fails - table might not exist yet
      if (!error.message.includes('does not exist')) {
        console.error('[ArbitrageDetector] Error logging opportunity:', error.message);
      }
    }
  }

  /**
   * Calculate median of array
   * @private
   */
  _calculateMedian(numbers) {
    const sorted = numbers.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
  }
}

module.exports = ArbitrageDetector;

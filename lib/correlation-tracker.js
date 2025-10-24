/**
 * Correlation Tracker
 *
 * Tracks price correlations between different assets to identify relationships
 * like inverse correlations (BTC vs Gold) or positive correlations (tech stocks).
 *
 * Features:
 * - Pearson correlation coefficient calculation
 * - Rolling correlation windows (24h, 7d, 30d)
 * - Inverse relationship detection
 * - Correlation strength classification
 * - Historical correlation tracking
 * - Alert on correlation changes
 */

const { Pool } = require('pg');

class CorrelationTracker {
  constructor(options = {}) {
    this.db = options.db || new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || process.env.USER,
      password: process.env.DB_PASSWORD || ''
    });

    // Common correlation pairs to track
    this.defaultPairs = options.pairs || [
      // Crypto vs Commodities (often inverse)
      { symbol1: 'BTC', symbol2: 'GOLD', type: 'inverse_expected' },
      { symbol1: 'ETH', symbol2: 'GOLD', type: 'inverse_expected' },
      { symbol1: 'BTC', symbol2: 'SILVER', type: 'inverse_expected' },

      // Crypto pairs (often positive)
      { symbol1: 'BTC', symbol2: 'ETH', type: 'positive_expected' },
      { symbol1: 'BTC', symbol2: 'SOL', type: 'positive_expected' },

      // Tech stocks (often positive)
      { symbol1: 'AAPL', symbol2: 'MSFT', type: 'positive_expected' },
      { symbol1: 'GOOGL', symbol2: 'MSFT', type: 'positive_expected' },
      { symbol1: 'TSLA', symbol2: 'BTC', type: 'positive_expected' }
    ];

    // Correlation thresholds
    this.strongCorrelation = 0.7;   // |r| > 0.7 = strong
    this.moderateCorrelation = 0.4; // |r| > 0.4 = moderate
    // |r| <= 0.4 = weak

    // Statistics
    this.stats = {
      correlationsCalculated: 0,
      strongCorrelations: 0,
      inverseCorrelations: 0
    };
  }

  /**
   * Calculate correlation between two assets over a time window
   *
   * @param {string} symbol1 - First asset symbol
   * @param {string} symbol2 - Second asset symbol
   * @param {Object} options - Calculation options
   * @returns {Object} Correlation analysis result
   */
  async calculateCorrelation(symbol1, symbol2, options = {}) {
    const {
      hours = 24,       // Time window
      minDataPoints = 10 // Minimum data points needed
    } = options;

    try {
      // Fetch price history for both symbols
      const prices1 = await this._getPriceHistory(symbol1, hours);
      const prices2 = await this._getPriceHistory(symbol2, hours);

      if (prices1.length < minDataPoints || prices2.length < minDataPoints) {
        return {
          symbol1,
          symbol2,
          error: 'Insufficient data',
          dataPoints: Math.min(prices1.length, prices2.length),
          minRequired: minDataPoints
        };
      }

      // Align time series (match timestamps)
      const aligned = this._alignTimeSeries(prices1, prices2);

      if (aligned.length < minDataPoints) {
        return {
          symbol1,
          symbol2,
          error: 'Insufficient aligned data points',
          dataPoints: aligned.length,
          minRequired: minDataPoints
        };
      }

      // Calculate Pearson correlation coefficient
      const correlation = this._pearsonCorrelation(
        aligned.map(p => p.price1),
        aligned.map(p => p.price2)
      );

      // Classify correlation strength
      const strength = this._classifyStrength(correlation);
      const relationship = this._classifyRelationship(correlation);

      this.stats.correlationsCalculated++;
      if (Math.abs(correlation) >= this.strongCorrelation) {
        this.stats.strongCorrelations++;
      }
      if (correlation < -this.moderateCorrelation) {
        this.stats.inverseCorrelations++;
      }

      const result = {
        symbol1,
        symbol2,
        correlation: parseFloat(correlation.toFixed(4)),
        strength,
        relationship,
        dataPoints: aligned.length,
        timeWindow: `${hours}h`,
        timestamp: new Date(),
        interpretation: this._interpretCorrelation(correlation, symbol1, symbol2)
      };

      // Store correlation in database
      await this._storeCorrelation(result, hours);

      return result;
    } catch (error) {
      console.error(`[CorrelationTracker] Error calculating correlation for ${symbol1} vs ${symbol2}:`, error.message);
      throw error;
    }
  }

  /**
   * Calculate correlations for all default pairs
   *
   * @param {Object} options - Calculation options
   * @returns {Array} Array of correlation results
   */
  async calculateAllCorrelations(options = {}) {
    const results = [];

    for (const pair of this.defaultPairs) {
      try {
        const result = await this.calculateCorrelation(
          pair.symbol1,
          pair.symbol2,
          options
        );
        result.expectedType = pair.type;
        results.push(result);
      } catch (error) {
        console.error(`[CorrelationTracker] Failed to calculate ${pair.symbol1} vs ${pair.symbol2}:`, error.message);
        results.push({
          symbol1: pair.symbol1,
          symbol2: pair.symbol2,
          error: error.message,
          expectedType: pair.type
        });
      }
    }

    return results;
  }

  /**
   * Get historical correlations from database
   *
   * @param {string} symbol1 - First asset symbol
   * @param {string} symbol2 - Second asset symbol
   * @param {Object} options - Query options
   * @returns {Array} Historical correlation data
   */
  async getCorrelationHistory(symbol1, symbol2, options = {}) {
    const { days = 30, timeframe = '24h' } = options;

    try {
      const result = await this.db.query(`
        SELECT
          symbol1,
          symbol2,
          correlation,
          strength,
          relationship,
          data_points,
          timeframe,
          calculated_at
        FROM price_correlations
        WHERE (symbol1 = $1 AND symbol2 = $2)
           OR (symbol1 = $2 AND symbol2 = $1)
        AND timeframe = $3
        AND calculated_at >= NOW() - INTERVAL '${parseInt(days)} days'
        ORDER BY calculated_at DESC
      `, [symbol1.toUpperCase(), symbol2.toUpperCase(), timeframe]);

      return result.rows || [];
    } catch (error) {
      console.error('[CorrelationTracker] Error fetching correlation history:', error.message);
      return [];
    }
  }

  /**
   * Get current correlations for all tracked pairs
   *
   * @param {string} timeframe - Time window (24h, 7d, 30d)
   * @returns {Array} Current correlations
   */
  async getCurrentCorrelations(timeframe = '24h') {
    try {
      const result = await this.db.query(`
        SELECT DISTINCT ON (symbol1, symbol2)
          symbol1,
          symbol2,
          correlation,
          strength,
          relationship,
          data_points,
          calculated_at
        FROM price_correlations
        WHERE timeframe = $1
        ORDER BY symbol1, symbol2, calculated_at DESC
      `, [timeframe]);

      return result.rows || [];
    } catch (error) {
      console.error('[CorrelationTracker] Error fetching current correlations:', error.message);
      return [];
    }
  }

  /**
   * Detect correlation anomalies (unexpected changes)
   *
   * @param {string} symbol1 - First asset symbol
   * @param {string} symbol2 - Second asset symbol
   * @returns {Object} Anomaly detection result
   */
  async detectAnomalies(symbol1, symbol2) {
    try {
      // Get recent correlation (last 24h)
      const recent = await this.calculateCorrelation(symbol1, symbol2, { hours: 24 });

      // Get historical average (last 30 days)
      const history = await this.getCorrelationHistory(symbol1, symbol2, { days: 30 });

      if (history.length < 5) {
        return {
          symbol1,
          symbol2,
          hasAnomaly: false,
          reason: 'Insufficient historical data'
        };
      }

      const avgCorrelation = history.reduce((sum, h) => sum + parseFloat(h.correlation), 0) / history.length;
      const stdDev = this._standardDeviation(history.map(h => parseFloat(h.correlation)));

      // Detect anomaly if current correlation is > 2 std deviations from average
      const zScore = Math.abs((recent.correlation - avgCorrelation) / stdDev);
      const hasAnomaly = zScore > 2;

      return {
        symbol1,
        symbol2,
        hasAnomaly,
        currentCorrelation: recent.correlation,
        historicalAverage: parseFloat(avgCorrelation.toFixed(4)),
        standardDeviation: parseFloat(stdDev.toFixed(4)),
        zScore: parseFloat(zScore.toFixed(2)),
        interpretation: hasAnomaly
          ? `Unusual correlation detected: ${recent.correlation} vs avg ${avgCorrelation.toFixed(4)} (${zScore.toFixed(1)}σ)`
          : 'Correlation within normal range'
      };
    } catch (error) {
      console.error('[CorrelationTracker] Error detecting anomalies:', error.message);
      throw error;
    }
  }

  /**
   * Get price history for a symbol
   * @private
   */
  async _getPriceHistory(symbol, hours) {
    try {
      const result = await this.db.query(`
        SELECT
          price,
          source_timestamp as timestamp,
          recorded_at
        FROM price_history
        WHERE symbol = $1
          AND source_timestamp >= NOW() - INTERVAL '${parseInt(hours)} hours'
        ORDER BY source_timestamp ASC
      `, [symbol.toUpperCase()]);

      return result.rows.map(row => ({
        price: parseFloat(row.price),
        timestamp: row.timestamp || row.recorded_at
      }));
    } catch (error) {
      // If source_timestamp doesn't exist yet, fall back to recorded_at
      if (error.message.includes('source_timestamp')) {
        const result = await this.db.query(`
          SELECT
            price,
            recorded_at as timestamp
          FROM price_history
          WHERE symbol = $1
            AND recorded_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
          ORDER BY recorded_at ASC
        `, [symbol.toUpperCase()]);

        return result.rows.map(row => ({
          price: parseFloat(row.price),
          timestamp: row.timestamp
        }));
      }
      throw error;
    }
  }

  /**
   * Align two time series by matching timestamps
   * @private
   */
  _alignTimeSeries(series1, series2) {
    const aligned = [];
    const tolerance = 5 * 60 * 1000; // 5 minutes tolerance

    for (const point1 of series1) {
      const match = series2.find(point2 => {
        const timeDiff = Math.abs(new Date(point1.timestamp) - new Date(point2.timestamp));
        return timeDiff <= tolerance;
      });

      if (match) {
        aligned.push({
          price1: point1.price,
          price2: match.price,
          timestamp: point1.timestamp
        });
      }
    }

    return aligned;
  }

  /**
   * Calculate Pearson correlation coefficient
   * @private
   */
  _pearsonCorrelation(x, y) {
    const n = x.length;

    if (n !== y.length || n === 0) {
      throw new Error('Arrays must have the same non-zero length');
    }

    // Calculate means
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    // Calculate correlation
    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    if (denomX === 0 || denomY === 0) {
      return 0; // No correlation if either series has no variance
    }

    return numerator / Math.sqrt(denomX * denomY);
  }

  /**
   * Calculate standard deviation
   * @private
   */
  _standardDeviation(values) {
    const n = values.length;
    if (n === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / n;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / n;

    return Math.sqrt(variance);
  }

  /**
   * Classify correlation strength
   * @private
   */
  _classifyStrength(correlation) {
    const abs = Math.abs(correlation);

    if (abs >= this.strongCorrelation) {
      return 'strong';
    } else if (abs >= this.moderateCorrelation) {
      return 'moderate';
    } else {
      return 'weak';
    }
  }

  /**
   * Classify correlation relationship
   * @private
   */
  _classifyRelationship(correlation) {
    if (correlation >= this.moderateCorrelation) {
      return 'positive';
    } else if (correlation <= -this.moderateCorrelation) {
      return 'inverse';
    } else {
      return 'neutral';
    }
  }

  /**
   * Interpret correlation for humans
   * @private
   */
  _interpretCorrelation(correlation, symbol1, symbol2) {
    const abs = Math.abs(correlation);

    if (abs < 0.2) {
      return `${symbol1} and ${symbol2} show no significant correlation`;
    } else if (correlation >= this.strongCorrelation) {
      return `${symbol1} and ${symbol2} move strongly together (${(correlation * 100).toFixed(0)}% correlation)`;
    } else if (correlation >= this.moderateCorrelation) {
      return `${symbol1} and ${symbol2} tend to move together (${(correlation * 100).toFixed(0)}% correlation)`;
    } else if (correlation <= -this.strongCorrelation) {
      return `${symbol1} and ${symbol2} move strongly in opposite directions (${(correlation * 100).toFixed(0)}% inverse correlation)`;
    } else if (correlation <= -this.moderateCorrelation) {
      return `${symbol1} and ${symbol2} tend to move in opposite directions (${(correlation * 100).toFixed(0)}% inverse correlation)`;
    } else {
      return `${symbol1} and ${symbol2} show weak correlation (${(correlation * 100).toFixed(0)}%)`;
    }
  }

  /**
   * Store correlation result in database
   * @private
   */
  async _storeCorrelation(result, hours) {
    if (!this.db) return;

    try {
      const timeframe = hours === 24 ? '24h' :
                        hours === 168 ? '7d' :
                        hours === 720 ? '30d' :
                        `${hours}h`;

      await this.db.query(`
        INSERT INTO price_correlations (
          symbol1,
          symbol2,
          correlation,
          strength,
          relationship,
          data_points,
          timeframe,
          calculated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        result.symbol1.toUpperCase(),
        result.symbol2.toUpperCase(),
        result.correlation,
        result.strength,
        result.relationship,
        result.dataPoints,
        timeframe,
        result.timestamp
      ]);
    } catch (error) {
      // Don't fail if table doesn't exist yet
      if (!error.message.includes('does not exist')) {
        console.error('[CorrelationTracker] Error storing correlation:', error.message);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      trackedPairs: this.defaultPairs.length,
      strongCorrelationThreshold: this.strongCorrelation,
      moderateCorrelationThreshold: this.moderateCorrelation
    };
  }
}

module.exports = CorrelationTracker;

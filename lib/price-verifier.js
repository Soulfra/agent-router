/**
 * Price Verifier
 *
 * Validates price data for sanity, detects anomalies, and provides
 * confidence scores for price data quality.
 *
 * Features:
 * - Sanity checks (reasonable price bounds)
 * - Rate-of-change detection (flag sudden spikes/crashes)
 * - Historical comparison
 * - Confidence scoring
 */

class PriceVerifier {
  constructor(options = {}) {
    this.db = options.db || null;

    // Reasonable price bounds for different assets
    this.bounds = {
      // Crypto (USD)
      'BTC': { min: 1000, max: 500000 },
      'ETH': { min: 50, max: 50000 },
      'SOL': { min: 1, max: 10000 },
      'BNB': { min: 10, max: 5000 },
      'ADA': { min: 0.1, max: 100 },

      // Stocks (USD)
      'AAPL': { min: 50, max: 500 },
      'GOOGL': { min: 50, max: 500 },
      'TSLA': { min: 50, max: 2000 },
      'MSFT': { min: 100, max: 1000 },
      'AMZN': { min: 50, max: 500 },

      // Commodities (USD per ounce)
      'AU': { min: 1500, max: 3000 },      // Gold
      'GOLD': { min: 1500, max: 3000 },
      'AG': { min: 15, max: 50 },          // Silver
      'SILVER': { min: 15, max: 50 },
      'PT': { min: 800, max: 2000 },       // Platinum
      'PLATINUM': { min: 800, max: 2000 },
      'PD': { min: 1000, max: 4000 },      // Palladium
      'PALLADIUM': { min: 1000, max: 4000 }
    };

    // Maximum rate of change per interval (20% in 5 minutes is suspicious)
    this.maxChangePercent = 20;
    this.changeCheckInterval = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Verify price data
   * @param {object} priceData - Price data to verify
   * @param {string} priceData.symbol - Asset symbol
   * @param {number} priceData.price - Current price
   * @param {string} priceData.source - Data source
   * @returns {Promise<object>} Verification result with confidence score
   */
  async verify(priceData) {
    const { symbol, price, source } = priceData;

    const checks = {
      boundsCheck: this._checkBounds(symbol, price),
      changeRateCheck: await this._checkChangeRate(symbol, price),
      timestampCheck: this._checkTimestamp(priceData.lastUpdate || new Date()),
      sourceCheck: this._checkSource(source)
    };

    // Calculate confidence score (0-100)
    const confidence = this._calculateConfidence(checks);

    // Determine if price is verified
    const verified = confidence >= 70; // 70% threshold for "verified"

    // Collect warnings/issues
    const issues = this._collectIssues(checks);

    return {
      verified,
      confidence,
      checks,
      issues,
      recommendation: this._getRecommendation(confidence, issues)
    };
  }

  /**
   * Check if price is within reasonable bounds
   * @private
   */
  _checkBounds(symbol, price) {
    const bounds = this.bounds[symbol.toUpperCase()];

    if (!bounds) {
      // Unknown symbol - accept but flag low confidence
      return {
        pass: true,
        confidence: 50,
        message: `Unknown symbol ${symbol}, no bounds available`
      };
    }

    if (price < bounds.min || price > bounds.max) {
      return {
        pass: false,
        confidence: 0,
        message: `Price $${price} outside reasonable range [$${bounds.min} - $${bounds.max}]`
      };
    }

    return {
      pass: true,
      confidence: 100,
      message: `Price within expected range`
    };
  }

  /**
   * Check rate of change (detect sudden spikes/crashes)
   * @private
   */
  async _checkChangeRate(symbol, currentPrice) {
    if (!this.db) {
      return {
        pass: true,
        confidence: 50,
        message: 'No database, skipping historical comparison'
      };
    }

    try {
      // Get price from 5 minutes ago
      const result = await this.db.query(`
        SELECT price
        FROM price_history
        WHERE symbol = $1
          AND recorded_at <= NOW() - INTERVAL '5 minutes'
        ORDER BY recorded_at DESC
        LIMIT 1
      `, [symbol.toUpperCase()]);

      if (result.rows.length === 0) {
        return {
          pass: true,
          confidence: 80,
          message: 'No recent historical data for comparison'
        };
      }

      const previousPrice = parseFloat(result.rows[0].price);
      const changePercent = Math.abs(((currentPrice - previousPrice) / previousPrice) * 100);

      if (changePercent > this.maxChangePercent) {
        return {
          pass: false,
          confidence: 30,
          message: `Suspicious ${changePercent.toFixed(1)}% change in 5 minutes`,
          previousPrice,
          changePercent
        };
      }

      return {
        pass: true,
        confidence: 100,
        message: `Reasonable ${changePercent.toFixed(1)}% change`,
        changePercent
      };

    } catch (error) {
      console.error('[PriceVerifier] Error checking change rate:', error.message);
      return {
        pass: true,
        confidence: 50,
        message: `Error checking historical data: ${error.message}`
      };
    }
  }

  /**
   * Check timestamp validity
   * @private
   */
  _checkTimestamp(timestamp) {
    const now = Date.now();
    const timestampMs = new Date(timestamp).getTime();

    // Check if timestamp is in the future (clock skew)
    if (timestampMs > now + 60000) { // Allow 1 minute future for clock drift
      return {
        pass: false,
        confidence: 20,
        message: `Timestamp ${Math.round((timestampMs - now) / 1000)}s in the future (clock skew?)`
      };
    }

    // Check if timestamp is too old (stale data)
    const ageMinutes = (now - timestampMs) / (60 * 1000);
    if (ageMinutes > 10) {
      return {
        pass: false,
        confidence: 60,
        message: `Data is ${Math.round(ageMinutes)} minutes old (stale)`
      };
    }

    return {
      pass: true,
      confidence: 100,
      message: `Timestamp is recent (${Math.round(ageMinutes)}m old)`
    };
  }

  /**
   * Check data source reliability
   * @private
   */
  _checkSource(source) {
    const trustedSources = {
      'coingecko': 90,
      'yahoo': 85,
      'alphavantage': 85,
      'binance': 95,
      'coinbase': 95
    };

    const confidence = trustedSources[source?.toLowerCase()] || 50;

    return {
      pass: true,
      confidence,
      message: `Source: ${source} (confidence: ${confidence}%)`
    };
  }

  /**
   * Calculate overall confidence score
   * @private
   */
  _calculateConfidence(checks) {
    const weights = {
      boundsCheck: 0.3,
      changeRateCheck: 0.3,
      timestampCheck: 0.2,
      sourceCheck: 0.2
    };

    let totalConfidence = 0;
    let totalWeight = 0;

    for (const [check, weight] of Object.entries(weights)) {
      if (checks[check]) {
        totalConfidence += checks[check].confidence * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? Math.round(totalConfidence / totalWeight) : 0;
  }

  /**
   * Collect issues from failed checks
   * @private
   */
  _collectIssues(checks) {
    const issues = [];

    for (const [checkName, result] of Object.entries(checks)) {
      if (!result.pass) {
        issues.push({
          check: checkName,
          message: result.message,
          confidence: result.confidence
        });
      }
    }

    return issues;
  }

  /**
   * Get recommendation based on verification result
   * @private
   */
  _getRecommendation(confidence, issues) {
    if (confidence >= 90) {
      return 'HIGH_CONFIDENCE: Use this data';
    }

    if (confidence >= 70) {
      return 'MEDIUM_CONFIDENCE: Use with caution';
    }

    if (confidence >= 50) {
      return 'LOW_CONFIDENCE: Consider fallback sources';
    }

    return 'REJECT: Do not use this data, fetch from alternative source';
  }

  /**
   * Add or update bounds for a symbol
   */
  setBounds(symbol, min, max) {
    this.bounds[symbol.toUpperCase()] = { min, max };
  }

  /**
   * Get current bounds for a symbol
   */
  getBounds(symbol) {
    return this.bounds[symbol.toUpperCase()] || null;
  }
}

module.exports = PriceVerifier;

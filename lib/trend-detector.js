/**
 * Trend Detector with Inflection Point Analysis
 *
 * Detects derivative sign changes: "is the curve going up or down?"
 *
 * Instead of:
 *   "slope: 0.000042"  ← meaningless to humans
 *
 * You get:
 *   "FLAT → RISING ⚠️  Costs starting to increase"
 *   "RISING → FALLING 🎉 Costs decreasing"
 *   "PEAK DETECTED 📈 Hit maximum, now declining"
 */

class TrendDetector {
  constructor() {
    this.history = []; // Store last N trend snapshots for derivative comparison
    this.maxHistory = 10;
  }

  /**
   * Analyze trend with inflection point detection
   * @param {Array} candles - Time-series cost data
   * @returns {Object} Trend analysis with human-readable messages
   */
  analyzeTrend(candles) {
    if (!candles || candles.length === 0) {
      return {
        state: 'NO_DATA',
        emoji: '⚪',
        message: 'No data available',
        inflectionPoint: false,
        derivative: { current: 0, previous: 0, change: 0 }
      };
    }

    // Calculate average cost for relative thresholds
    const avgCost = candles.reduce((sum, c) => sum + (c.totalCost || c.cost || 0), 0) / candles.length;

    // Calculate slopes for multiple windows
    const shortTermSlope = this._calculateSlope(candles.slice(-3)); // Last 3 points
    const mediumTermSlope = this._calculateSlope(candles.slice(-5)); // Last 5 points
    const longTermSlope = this._calculateSlope(candles.slice(-10)); // Last 10 points

    // Current derivative (rate of change)
    const currentDerivative = shortTermSlope;

    // Get previous derivative from history
    const previousDerivative = this.history.length > 0
      ? this.history[this.history.length - 1].derivative
      : 0;

    // Detect derivative sign change (inflection point!)
    const signChange = this._detectSignChange(previousDerivative, currentDerivative, avgCost);

    // Classify current state
    const state = this._classifyState(currentDerivative, mediumTermSlope, avgCost);

    // Generate human-readable message
    const message = this._generateMessage(state, signChange);

    // Store in history
    this.history.push({
      timestamp: Date.now(),
      derivative: currentDerivative,
      state: state.type
    });

    // Keep history limited
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return {
      state: state.type,
      emoji: state.emoji,
      message,
      inflectionPoint: signChange.isInflection,
      transition: signChange.transition,
      derivative: {
        current: currentDerivative,
        previous: previousDerivative,
        change: currentDerivative - previousDerivative,
        shortTerm: shortTermSlope,
        mediumTerm: mediumTermSlope,
        longTerm: longTermSlope
      },
      confidence: this._calculateConfidence(candles, currentDerivative)
    };
  }

  /**
   * Calculate slope using linear regression
   * @private
   */
  _calculateSlope(points) {
    if (!points || points.length < 2) return 0;

    const n = points.length;
    const data = points.map((point, index) => ({
      x: index,
      y: point.totalCost || point.cost || 0
    }));

    const sumX = data.reduce((sum, p) => sum + p.x, 0);
    const sumY = data.reduce((sum, p) => sum + p.y, 0);
    const sumXY = data.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = data.reduce((sum, p) => sum + p.x * p.x, 0);

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    return slope;
  }

  /**
   * Detect if derivative changed sign (inflection point)
   * @private
   */
  _detectSignChange(previous, current, avgCost = 1) {
    // Use percentage-based thresholds instead of absolute
    const RELATIVE_THRESHOLD = 0.05; // 5% change is meaningful
    const MIN_ABSOLUTE_CHANGE = 0.10; // $0.10/hour minimum

    // Calculate if change is meaningful (either absolute or relative)
    const isMeaningful = (slope) => {
      const relativeChange = Math.abs(slope) / (avgCost || 1);
      return Math.abs(slope) >= MIN_ABSOLUTE_CHANGE ||
             relativeChange >= RELATIVE_THRESHOLD;
    };

    // Classify signs
    const prevSign = !isMeaningful(previous) ? 'flat'
      : previous > 0 ? 'positive'
      : 'negative';

    const currSign = !isMeaningful(current) ? 'flat'
      : current > 0 ? 'positive'
      : 'negative';

    // Detect transitions
    const isInflection = prevSign !== currSign;
    const transition = isInflection ? `${prevSign} → ${currSign}` : null;

    // Human-readable transition types
    let transitionType = null;
    if (isInflection) {
      if (prevSign === 'flat' && currSign === 'positive') {
        transitionType = 'STARTED_RISING';
      } else if (prevSign === 'flat' && currSign === 'negative') {
        transitionType = 'STARTED_FALLING';
      } else if (prevSign === 'positive' && currSign === 'flat') {
        transitionType = 'PLATEAU_AFTER_RISE';
      } else if (prevSign === 'positive' && currSign === 'negative') {
        transitionType = 'PEAK';
      } else if (prevSign === 'negative' && currSign === 'flat') {
        transitionType = 'PLATEAU_AFTER_FALL';
      } else if (prevSign === 'negative' && currSign === 'positive') {
        transitionType = 'VALLEY';
      }
    }

    return {
      isInflection,
      transition,
      transitionType,
      prevSign,
      currSign
    };
  }

  /**
   * Classify current state based on derivative
   * @private
   */
  _classifyState(shortTerm, mediumTerm, avgCost = 1) {
    const RELATIVE_THRESHOLD = 0.05; // 5% change
    const MIN_ABSOLUTE_CHANGE = 0.10; // $0.10/hour

    // Check if slope is meaningful
    const isMeaningful = (slope) => {
      const relativeChange = Math.abs(slope) / (avgCost || 1);
      return Math.abs(slope) >= MIN_ABSOLUTE_CHANGE ||
             relativeChange >= RELATIVE_THRESHOLD;
    };

    if (!isMeaningful(shortTerm)) {
      return { type: 'FLAT', emoji: '➡️' };
    } else if (shortTerm > 0) {
      // Rising - check if accelerating
      if (mediumTerm > 0 && shortTerm > mediumTerm * 1.5) {
        return { type: 'RISING_FAST', emoji: '📈' };
      }
      return { type: 'RISING', emoji: '📈' };
    } else {
      // Falling - check if accelerating
      if (mediumTerm < 0 && shortTerm < mediumTerm * 1.5) {
        return { type: 'FALLING_FAST', emoji: '📉' };
      }
      return { type: 'FALLING', emoji: '📉' };
    }
  }

  /**
   * Generate human-readable message
   * @private
   */
  _generateMessage(state, signChange) {
    // If inflection point, prioritize that message
    if (signChange.isInflection) {
      switch (signChange.transitionType) {
        case 'STARTED_RISING':
          return '⚠️  Costs starting to increase (was flat, now rising)';
        case 'STARTED_FALLING':
          return '🎉 Costs starting to decrease (was flat, now falling)';
        case 'PEAK':
          return '📈 Hit peak! Costs were rising, now falling';
        case 'VALLEY':
          return '📉 Hit valley! Costs were falling, now rising';
        case 'PLATEAU_AFTER_RISE':
          return '⏸️  Costs plateauing after increase';
        case 'PLATEAU_AFTER_FALL':
          return '⏸️  Costs plateauing after decrease';
        default:
          return `${signChange.emoji} Derivative changed: ${signChange.transition}`;
      }
    }

    // Otherwise, describe current state
    switch (state.type) {
      case 'FLAT':
        return 'Costs stable (no significant change)';
      case 'RISING':
        return 'Costs increasing steadily';
      case 'RISING_FAST':
        return '🚨 Costs increasing rapidly!';
      case 'FALLING':
        return 'Costs decreasing steadily';
      case 'FALLING_FAST':
        return '✅ Costs decreasing rapidly!';
      case 'NO_DATA':
        return 'No data available';
      default:
        return 'Unknown trend';
    }
  }

  /**
   * Calculate confidence based on data quality
   * @private
   */
  _calculateConfidence(candles, derivative) {
    if (!candles || candles.length === 0) return 0;

    let confidence = 0;

    // More data points = higher confidence
    if (candles.length >= 10) confidence += 0.4;
    else if (candles.length >= 5) confidence += 0.2;
    else confidence += 0.1;

    // Strong derivative = higher confidence
    if (Math.abs(derivative) > 0.01) confidence += 0.3;
    else if (Math.abs(derivative) > 0.001) confidence += 0.2;
    else confidence += 0.1;

    // Consistent trend = higher confidence
    const recentSlopes = [];
    for (let i = Math.max(0, candles.length - 5); i < candles.length - 1; i++) {
      const slope = (candles[i + 1].totalCost - candles[i].totalCost);
      recentSlopes.push(slope);
    }

    if (recentSlopes.length > 0) {
      const allSameSign = recentSlopes.every(s => s >= 0) || recentSlopes.every(s => s <= 0);
      if (allSameSign) confidence += 0.3;
      else confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Get trend history for visualization
   */
  getHistory() {
    return this.history;
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
  }
}

module.exports = TrendDetector;

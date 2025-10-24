/**
 * Capacity Monitor - "Glass of Water" Visualization
 *
 * Shows how full the glass is:
 *   Context Used: [████████░░] 82% (164K/200K tokens)
 *   Cost This Hour: [███░░░░░░░] 30% ($0.45/$1.50 limit)
 *
 * Provides visual bars and capacity tracking for:
 * - Context window usage
 * - Token budgets
 * - Cost limits
 * - Request rates
 */

class CapacityMonitor {
  constructor(options = {}) {
    // Capacity limits
    this.limits = {
      contextWindow: options.contextWindow || 200000, // 200K tokens (Sonnet default)
      tokensPerHour: options.tokensPerHour || 100000, // 100K tokens/hour
      costPerHour: options.costPerHour || 1.50, // $1.50/hour
      costPerDay: options.costPerDay || 10.00, // $10/day
      requestsPerMinute: options.requestsPerMinute || 60 // 60 req/min
    };

    // Current usage (tracked externally, passed in)
    this.usage = {
      contextUsed: 0,
      tokensThisHour: 0,
      costThisHour: 0,
      costToday: 0,
      requestsThisMinute: 0
    };

    // Bar characters
    this.barChars = {
      filled: '█',
      empty: '░',
      width: 10
    };
  }

  /**
   * Update current usage
   * @param {Object} usage - Current usage stats
   */
  updateUsage(usage) {
    this.usage = {
      ...this.usage,
      ...usage
    };
  }

  /**
   * Generate visual capacity report
   * @returns {Object} Capacity data with visual bars
   */
  getCapacityReport() {
    return {
      context: this._generateCapacity(
        'Context Window',
        this.usage.contextUsed,
        this.limits.contextWindow,
        'tokens'
      ),
      tokensPerHour: this._generateCapacity(
        'Tokens This Hour',
        this.usage.tokensThisHour,
        this.limits.tokensPerHour,
        'tokens'
      ),
      costPerHour: this._generateCapacity(
        'Cost This Hour',
        this.usage.costThisHour,
        this.limits.costPerHour,
        'USD'
      ),
      costPerDay: this._generateCapacity(
        'Cost Today',
        this.usage.costToday,
        this.limits.costPerDay,
        'USD'
      ),
      requestsPerMinute: this._generateCapacity(
        'Requests This Minute',
        this.usage.requestsThisMinute,
        this.limits.requestsPerMinute,
        'requests'
      )
    };
  }

  /**
   * Generate capacity data for a single metric
   * @private
   */
  _generateCapacity(name, used, limit, unit) {
    // Handle null safety (a!=0 assurance)
    used = used ?? 0;
    limit = limit ?? 1;

    const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    const bar = this._generateBar(percent);
    const status = this._getStatus(percent);

    // Format values based on unit
    const formattedUsed = this._formatValue(used, unit);
    const formattedLimit = this._formatValue(limit, unit);

    return {
      name,
      used,
      limit,
      percent: Math.round(percent * 10) / 10, // 1 decimal place
      bar,
      status: status.type,
      emoji: status.emoji,
      color: status.color,
      formatted: {
        used: formattedUsed,
        limit: formattedLimit,
        display: `${bar} ${percent.toFixed(1)}% (${formattedUsed}/${formattedLimit})`
      }
    };
  }

  /**
   * Generate visual bar
   * @private
   */
  _generateBar(percent) {
    const filled = Math.round((percent / 100) * this.barChars.width);
    const empty = this.barChars.width - filled;

    return this.barChars.filled.repeat(filled) + this.barChars.empty.repeat(empty);
  }

  /**
   * Get status based on percentage
   * @private
   */
  _getStatus(percent) {
    if (percent >= 90) {
      return { type: 'CRITICAL', emoji: '🔴', color: 'red' };
    } else if (percent >= 75) {
      return { type: 'WARNING', emoji: '🟡', color: 'yellow' };
    } else if (percent >= 50) {
      return { type: 'MODERATE', emoji: '🟠', color: 'orange' };
    } else {
      return { type: 'HEALTHY', emoji: '🟢', color: 'green' };
    }
  }

  /**
   * Format value based on unit
   * @private
   */
  _formatValue(value, unit) {
    value = value ?? 0; // a!=0 assurance

    if (unit === 'tokens') {
      if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`;
      } else if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
      }
      return value.toString();
    } else if (unit === 'USD') {
      return `$${value.toFixed(2)}`;
    } else {
      return value.toString();
    }
  }

  /**
   * Get overall system capacity (a!=0 assured)
   * @returns {Object} Overall capacity summary
   */
  getOverallCapacity() {
    const report = this.getCapacityReport();

    // Find most constrained resource
    const capacities = Object.values(report);
    const mostConstrained = capacities.reduce((max, c) =>
      (c.percent ?? 0) > (max.percent ?? 0) ? c : max,
      { percent: 0 }
    );

    // Overall status
    const overallPercent = mostConstrained.percent ?? 0;
    const status = this._getStatus(overallPercent);

    return {
      status: status.type,
      emoji: status.emoji,
      color: status.color,
      percent: overallPercent.toFixed(1),
      mostConstrained: mostConstrained.name,
      message: this._getCapacityMessage(status.type, mostConstrained.name)
    };
  }

  /**
   * Get human-readable capacity message
   * @private
   */
  _getCapacityMessage(status, constrainedResource) {
    switch (status) {
      case 'CRITICAL':
        return `🚨 ${constrainedResource} near limit!`;
      case 'WARNING':
        return `⚠️  ${constrainedResource} getting high`;
      case 'MODERATE':
        return `${constrainedResource} at moderate level`;
      case 'HEALTHY':
        return `✅ All systems have capacity`;
      default:
        return 'Status unknown';
    }
  }

  /**
   * Print capacity report to console
   */
  printReport() {
    const report = this.getCapacityReport();

    console.log('');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  📊 System Capacity ("Glass of Water")                 ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('');

    for (const [key, capacity] of Object.entries(report)) {
      console.log(`${capacity.emoji} ${capacity.name}:`);
      console.log(`   ${capacity.formatted.display}`);
      console.log('');
    }

    const overall = this.getOverallCapacity();
    console.log('─────────────────────────────────────────────────────────');
    console.log(`Overall Status: ${overall.emoji} ${overall.status} - ${overall.message}`);
    console.log('');
  }

  /**
   * Check if any capacity is exceeded
   * @returns {Array} List of exceeded capacities
   */
  getExceeded() {
    const report = this.getCapacityReport();
    return Object.values(report).filter(c => (c.percent ?? 0) >= 100);
  }

  /**
   * Check if any capacity is in warning zone
   * @returns {Array} List of warning capacities
   */
  getWarnings() {
    const report = this.getCapacityReport();
    return Object.values(report).filter(c => {
      const percent = c.percent ?? 0;
      return percent >= 75 && percent < 100;
    });
  }

  /**
   * Set custom limits
   */
  setLimits(limits) {
    this.limits = {
      ...this.limits,
      ...limits
    };
  }

  /**
   * Get current limits
   */
  getLimits() {
    return { ...this.limits };
  }

  /**
   * Reset usage counters
   */
  resetUsage() {
    this.usage = {
      contextUsed: 0,
      tokensThisHour: 0,
      costThisHour: 0,
      costToday: 0,
      requestsThisMinute: 0
    };
  }
}

module.exports = CapacityMonitor;

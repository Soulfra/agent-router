/**
 * AI Cost Alert System
 *
 * "Orange warning lights when costs spike"
 *
 * Problem:
 * - Need to know when AI costs are getting too high
 * - Should auto-switch to cheaper providers before budget exceeded
 * - Track alert history for pattern detection
 * - Color-coded status like HealthMonitor (🟢🟡🔴)
 *
 * Solution:
 * - Circuit breaker thresholds per provider/instance
 * - Real-time cost monitoring with alerts
 * - Auto-fallback to cheaper alternatives
 * - Alert history and pattern learning
 *
 * Features:
 * - Cost thresholds: 🟢 Normal, 🟡 Warning (orange!), 🔴 Critical
 * - Alert when costs spike unexpectedly
 * - Auto-switch to cheaper providers when thresholds hit
 * - Track alert patterns over time
 */

const EventEmitter = require('events');

class AICostAlerts extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.aiInstanceRegistry = options.aiInstanceRegistry;
    this.aiCostAnalytics = options.aiCostAnalytics;

    // Status levels (matching HealthMonitor)
    this.STATUS = {
      HEALTHY: { emoji: '🟢', color: 'green', level: 0, name: 'HEALTHY' },
      WARNING: { emoji: '🟡', color: 'yellow', level: 1, name: 'WARNING' },  // The "orange"!
      CRITICAL: { emoji: '🔴', color: 'red', level: 2, name: 'CRITICAL' },
      DISABLED: { emoji: '⚫', color: 'gray', level: -1, name: 'DISABLED' }
    };

    // Default thresholds (can be overridden per instance)
    this.defaultThresholds = {
      // Cost thresholds (USD per day)
      costPerDay: {
        warning: 1.00,      // 🟡 Yellow at $1/day
        critical: 5.00      // 🔴 Red at $5/day
      },

      // Cost per request thresholds
      costPerRequest: {
        warning: 0.01,      // 🟡 Yellow at $0.01/request
        critical: 0.05      // 🔴 Red at $0.05/request
      },

      // Token cost thresholds (USD per 1k tokens)
      costPer1kTokens: {
        warning: 0.002,     // 🟡 Yellow at $0.002/1k tokens
        critical: 0.01      // 🔴 Red at $0.01/1k tokens
      },

      // Trend thresholds (% increase)
      trendIncrease: {
        warning: 20,        // 🟡 Yellow at 20% increase
        critical: 50        // 🔴 Red at 50% increase
      },

      // Error rate thresholds
      errorRate: {
        warning: 0.10,      // 🟡 Yellow at 10% errors
        critical: 0.25      // 🔴 Red at 25% errors
      },

      // Latency thresholds (ms)
      latency: {
        warning: 3000,      // 🟡 Yellow at 3s
        critical: 10000     // 🔴 Red at 10s
      }
    };

    // Per-instance custom thresholds
    this.customThresholds = new Map();

    // Current alert states per instance
    this.alertStates = new Map();

    // Alert history
    this.alertHistory = [];
    this.maxHistorySize = 1000;

    // Circuit breaker states
    this.circuitBreakers = new Map();

    // Auto-fallback configuration
    this.fallbackEnabled = true;
    this.fallbackRules = new Map();

    console.log('[AICostAlerts] Initialized');
  }

  /**
   * Set custom thresholds for an instance
   *
   * @param {string} instanceName - Instance name
   * @param {object} thresholds - Custom thresholds
   */
  setThresholds(instanceName, thresholds) {
    this.customThresholds.set(instanceName, {
      ...this.defaultThresholds,
      ...thresholds
    });

    console.log(`[AICostAlerts] Custom thresholds set for ${instanceName}`);
  }

  /**
   * Get thresholds for an instance
   *
   * @param {string} instanceName - Instance name
   * @returns {object} Thresholds
   */
  getThresholds(instanceName) {
    return this.customThresholds.get(instanceName) || this.defaultThresholds;
  }

  /**
   * Check current costs against thresholds
   *
   * @param {string} instanceName - Instance name
   * @returns {Promise<object>} Alert status
   */
  async checkThresholds(instanceName) {
    if (!this.aiCostAnalytics) {
      console.warn('[AICostAlerts] No analytics engine, cannot check thresholds');
      return this._createStatus(this.STATUS.DISABLED, 'Analytics disabled');
    }

    const thresholds = this.getThresholds(instanceName);

    try {
      // Get cost data for last 24 hours
      const [providers, trend] = await Promise.all([
        this.aiCostAnalytics.compareProviders({
          from: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }),
        this.aiCostAnalytics.detectTrend({
          instanceName,
          lookbackPeriod: '24h'
        })
      ]);

      // Find this instance's data
      const instanceData = providers.find(p => p.instanceName === instanceName);

      if (!instanceData) {
        return this._createStatus(this.STATUS.HEALTHY, 'No usage data yet');
      }

      // Check all threshold categories
      const checks = [];

      // 1. Cost per day
      const costPerDay = instanceData.totalCost;
      if (costPerDay >= thresholds.costPerDay.critical) {
        checks.push({
          category: 'costPerDay',
          status: this.STATUS.CRITICAL,
          message: `Daily cost $${costPerDay.toFixed(2)} ≥ $${thresholds.costPerDay.critical} threshold`,
          value: costPerDay,
          threshold: thresholds.costPerDay.critical
        });
      } else if (costPerDay >= thresholds.costPerDay.warning) {
        checks.push({
          category: 'costPerDay',
          status: this.STATUS.WARNING,
          message: `Daily cost $${costPerDay.toFixed(2)} ≥ $${thresholds.costPerDay.warning} threshold`,
          value: costPerDay,
          threshold: thresholds.costPerDay.warning
        });
      }

      // 2. Cost per request
      const costPerRequest = instanceData.avgCostPerRequest;
      if (costPerRequest >= thresholds.costPerRequest.critical) {
        checks.push({
          category: 'costPerRequest',
          status: this.STATUS.CRITICAL,
          message: `Cost per request $${costPerRequest.toFixed(4)} ≥ $${thresholds.costPerRequest.critical} threshold`,
          value: costPerRequest,
          threshold: thresholds.costPerRequest.critical
        });
      } else if (costPerRequest >= thresholds.costPerRequest.warning) {
        checks.push({
          category: 'costPerRequest',
          status: this.STATUS.WARNING,
          message: `Cost per request $${costPerRequest.toFixed(4)} ≥ $${thresholds.costPerRequest.warning} threshold`,
          value: costPerRequest,
          threshold: thresholds.costPerRequest.warning
        });
      }

      // 3. Cost per 1k tokens
      const costPer1k = instanceData.costPer1kTokens;
      if (costPer1k >= thresholds.costPer1kTokens.critical) {
        checks.push({
          category: 'costPer1kTokens',
          status: this.STATUS.CRITICAL,
          message: `Cost per 1k tokens $${costPer1k.toFixed(4)} ≥ $${thresholds.costPer1kTokens.critical} threshold`,
          value: costPer1k,
          threshold: thresholds.costPer1kTokens.critical
        });
      } else if (costPer1k >= thresholds.costPer1kTokens.warning) {
        checks.push({
          category: 'costPer1kTokens',
          status: this.STATUS.WARNING,
          message: `Cost per 1k tokens $${costPer1k.toFixed(4)} ≥ $${thresholds.costPer1kTokens.warning} threshold`,
          value: costPer1k,
          threshold: thresholds.costPer1kTokens.warning
        });
      }

      // 4. Trend increase
      if (trend.direction === 'increasing') {
        const trendPercent = Math.abs(trend.percentChange);
        if (trendPercent >= thresholds.trendIncrease.critical) {
          checks.push({
            category: 'trendIncrease',
            status: this.STATUS.CRITICAL,
            message: `Cost trend +${trendPercent.toFixed(1)}% ≥ ${thresholds.trendIncrease.critical}% threshold`,
            value: trendPercent,
            threshold: thresholds.trendIncrease.critical
          });
        } else if (trendPercent >= thresholds.trendIncrease.warning) {
          checks.push({
            category: 'trendIncrease',
            status: this.STATUS.WARNING,
            message: `Cost trend +${trendPercent.toFixed(1)}% ≥ ${thresholds.trendIncrease.warning}% threshold`,
            value: trendPercent,
            threshold: thresholds.trendIncrease.warning
          });
        }
      }

      // 5. Error rate
      const errorRate = 1 - instanceData.successRate;
      if (errorRate >= thresholds.errorRate.critical) {
        checks.push({
          category: 'errorRate',
          status: this.STATUS.CRITICAL,
          message: `Error rate ${(errorRate * 100).toFixed(1)}% ≥ ${(thresholds.errorRate.critical * 100)}% threshold`,
          value: errorRate,
          threshold: thresholds.errorRate.critical
        });
      } else if (errorRate >= thresholds.errorRate.warning) {
        checks.push({
          category: 'errorRate',
          status: this.STATUS.WARNING,
          message: `Error rate ${(errorRate * 100).toFixed(1)}% ≥ ${(thresholds.errorRate.warning * 100)}% threshold`,
          value: errorRate,
          threshold: thresholds.errorRate.warning
        });
      }

      // 6. Latency
      const latency = instanceData.avgLatency;
      if (latency >= thresholds.latency.critical) {
        checks.push({
          category: 'latency',
          status: this.STATUS.CRITICAL,
          message: `Latency ${latency.toFixed(0)}ms ≥ ${thresholds.latency.critical}ms threshold`,
          value: latency,
          threshold: thresholds.latency.critical
        });
      } else if (latency >= thresholds.latency.warning) {
        checks.push({
          category: 'latency',
          status: this.STATUS.WARNING,
          message: `Latency ${latency.toFixed(0)}ms ≥ ${thresholds.latency.warning}ms threshold`,
          value: latency,
          threshold: thresholds.latency.warning
        });
      }

      // Determine overall status (highest severity)
      let overallStatus = this.STATUS.HEALTHY;
      const alerts = [];

      for (const check of checks) {
        if (check.status.level > overallStatus.level) {
          overallStatus = check.status;
        }
        alerts.push(check);
      }

      const result = {
        instanceName,
        status: overallStatus,
        alerts,
        checks: {
          costPerDay: { value: costPerDay, threshold: thresholds.costPerDay },
          costPerRequest: { value: costPerRequest, threshold: thresholds.costPerRequest },
          costPer1kTokens: { value: costPer1k, threshold: thresholds.costPer1kTokens },
          trend: { value: trend.percentChange, threshold: thresholds.trendIncrease },
          errorRate: { value: errorRate, threshold: thresholds.errorRate },
          latency: { value: latency, threshold: thresholds.latency }
        },
        timestamp: new Date()
      };

      // Update alert state
      this._updateAlertState(instanceName, result);

      return result;

    } catch (error) {
      console.error(`[AICostAlerts] Error checking thresholds for ${instanceName}:`, error.message);
      return this._createStatus(this.STATUS.DISABLED, `Error: ${error.message}`);
    }
  }

  /**
   * Check all instances
   *
   * @returns {Promise<Array>} Alert statuses for all instances
   */
  async checkAllInstances() {
    if (!this.aiInstanceRegistry) {
      console.warn('[AICostAlerts] No instance registry');
      return [];
    }

    const instances = this.aiInstanceRegistry.listInstances();
    const results = [];

    for (const instance of instances) {
      if (instance.enabled) {
        const status = await this.checkThresholds(instance.name);
        results.push(status);
      }
    }

    return results;
  }

  /**
   * Set up circuit breaker for an instance
   *
   * @param {string} instanceName - Instance name
   * @param {object} options - Circuit breaker options
   */
  setCircuitBreaker(instanceName, options = {}) {
    const breaker = {
      instanceName,
      enabled: options.enabled !== false,
      threshold: options.threshold || this.STATUS.CRITICAL,
      cooldownMs: options.cooldownMs || 60000, // 1 minute default
      state: 'closed',  // closed = normal, open = tripped
      tripCount: 0,
      lastTripTime: null,
      ...options
    };

    this.circuitBreakers.set(instanceName, breaker);
    console.log(`[AICostAlerts] Circuit breaker set for ${instanceName}`);
  }

  /**
   * Check if circuit breaker is tripped
   *
   * @param {string} instanceName - Instance name
   * @returns {boolean} True if tripped
   */
  isCircuitBreakerTripped(instanceName) {
    const breaker = this.circuitBreakers.get(instanceName);
    if (!breaker || !breaker.enabled) {
      return false;
    }

    // Check if in cooldown period
    if (breaker.state === 'open' && breaker.lastTripTime) {
      const cooldownExpired = Date.now() - breaker.lastTripTime > breaker.cooldownMs;
      if (cooldownExpired) {
        // Reset to half-open (allow one test request)
        breaker.state = 'half-open';
        console.log(`[AICostAlerts] Circuit breaker ${instanceName} entering half-open state`);
      }
    }

    return breaker.state === 'open';
  }

  /**
   * Trip circuit breaker
   *
   * @param {string} instanceName - Instance name
   * @param {string} reason - Trip reason
   */
  tripCircuitBreaker(instanceName, reason) {
    const breaker = this.circuitBreakers.get(instanceName);
    if (!breaker) {
      console.warn(`[AICostAlerts] No circuit breaker for ${instanceName}`);
      return;
    }

    breaker.state = 'open';
    breaker.tripCount++;
    breaker.lastTripTime = Date.now();

    console.log(`[AICostAlerts] 🔴 Circuit breaker TRIPPED for ${instanceName}: ${reason}`);

    this.emit('circuit_breaker_tripped', {
      instanceName,
      reason,
      tripCount: breaker.tripCount,
      timestamp: new Date()
    });

    // Log to database if available
    this._logCircuitBreakerEvent(instanceName, 'tripped', reason);
  }

  /**
   * Reset circuit breaker
   *
   * @param {string} instanceName - Instance name
   */
  resetCircuitBreaker(instanceName) {
    const breaker = this.circuitBreakers.get(instanceName);
    if (!breaker) {
      return;
    }

    breaker.state = 'closed';
    console.log(`[AICostAlerts] 🟢 Circuit breaker RESET for ${instanceName}`);

    this.emit('circuit_breaker_reset', {
      instanceName,
      timestamp: new Date()
    });

    this._logCircuitBreakerEvent(instanceName, 'reset', 'Manual reset');
  }

  /**
   * Set up auto-fallback rule
   *
   * @param {string} instanceName - Primary instance
   * @param {object} options - Fallback options
   */
  setFallbackRule(instanceName, options = {}) {
    const rule = {
      primaryInstance: instanceName,
      fallbackInstances: options.fallbackInstances || [],
      triggerStatus: options.triggerStatus || this.STATUS.CRITICAL,
      autoRestore: options.autoRestore !== false,
      restoreThreshold: options.restoreThreshold || this.STATUS.HEALTHY,
      restoreCooldownMs: options.restoreCooldownMs || 300000, // 5 minutes
      currentlyUsingFallback: false,
      fallbackStartTime: null,
      ...options
    };

    this.fallbackRules.set(instanceName, rule);
    console.log(`[AICostAlerts] Fallback rule set for ${instanceName} -> ${rule.fallbackInstances.join(', ')}`);
  }

  /**
   * Get recommended instance (with fallback logic)
   *
   * @param {string} requestedInstance - Requested instance
   * @returns {Promise<object>} Recommended instance and reason
   */
  async getRecommendedInstance(requestedInstance) {
    // Check circuit breaker
    if (this.isCircuitBreakerTripped(requestedInstance)) {
      return {
        instance: null,
        original: requestedInstance,
        reason: 'circuit_breaker_tripped',
        message: `Circuit breaker tripped for ${requestedInstance}`
      };
    }

    // Check fallback rules
    const rule = this.fallbackRules.get(requestedInstance);
    if (!rule || !this.fallbackEnabled) {
      return {
        instance: requestedInstance,
        original: requestedInstance,
        reason: 'no_fallback_rule',
        message: 'Using requested instance'
      };
    }

    // Check current status
    const status = await this.checkThresholds(requestedInstance);

    // If status is at or above trigger level, use fallback
    if (status.status.level >= rule.triggerStatus.level) {
      // Find best fallback instance
      const fallback = await this._findBestFallback(rule.fallbackInstances);

      if (fallback) {
        if (!rule.currentlyUsingFallback) {
          rule.currentlyUsingFallback = true;
          rule.fallbackStartTime = Date.now();
          console.log(`[AICostAlerts] 🟡 Switching from ${requestedInstance} to ${fallback} (status: ${status.status.emoji})`);

          this.emit('fallback_activated', {
            primaryInstance: requestedInstance,
            fallbackInstance: fallback,
            reason: status.alerts,
            timestamp: new Date()
          });
        }

        return {
          instance: fallback,
          original: requestedInstance,
          reason: 'fallback_activated',
          message: `Using fallback ${fallback} due to ${status.status.name}`,
          alerts: status.alerts
        };
      }
    }

    // If currently using fallback, check if we can restore
    if (rule.currentlyUsingFallback && rule.autoRestore) {
      const cooldownExpired = Date.now() - rule.fallbackStartTime > rule.restoreCooldownMs;

      if (cooldownExpired && status.status.level <= rule.restoreThreshold.level) {
        rule.currentlyUsingFallback = false;
        rule.fallbackStartTime = null;
        console.log(`[AICostAlerts] 🟢 Restoring ${requestedInstance} (status: ${status.status.emoji})`);

        this.emit('fallback_restored', {
          primaryInstance: requestedInstance,
          timestamp: new Date()
        });
      }
    }

    return {
      instance: requestedInstance,
      original: requestedInstance,
      reason: 'using_primary',
      message: 'Using primary instance'
    };
  }

  /**
   * Get alert summary
   *
   * @returns {Promise<object>} Alert summary
   */
  async getAlertSummary() {
    const allStatuses = await this.checkAllInstances();

    const summary = {
      healthy: allStatuses.filter(s => s.status.level === this.STATUS.HEALTHY.level),
      warning: allStatuses.filter(s => s.status.level === this.STATUS.WARNING.level),
      critical: allStatuses.filter(s => s.status.level === this.STATUS.CRITICAL.level),
      disabled: allStatuses.filter(s => s.status.level === this.STATUS.DISABLED.level),
      total: allStatuses.length,
      timestamp: new Date()
    };

    // Add circuit breaker info
    summary.circuitBreakers = {
      total: this.circuitBreakers.size,
      tripped: Array.from(this.circuitBreakers.values()).filter(b => b.state === 'open').length
    };

    // Add fallback info
    summary.fallbacks = {
      total: this.fallbackRules.size,
      active: Array.from(this.fallbackRules.values()).filter(r => r.currentlyUsingFallback).length
    };

    return summary;
  }

  /**
   * Get alert history
   *
   * @param {object} options - Filter options
   * @returns {Array} Alert history
   */
  getAlertHistory(options = {}) {
    let history = [...this.alertHistory];

    if (options.instanceName) {
      history = history.filter(h => h.instanceName === options.instanceName);
    }

    if (options.status) {
      history = history.filter(h => h.status.name === options.status);
    }

    if (options.limit) {
      history = history.slice(0, options.limit);
    }

    return history;
  }

  /**
   * Create status object
   * @private
   */
  _createStatus(status, message) {
    return {
      status,
      message,
      timestamp: new Date()
    };
  }

  /**
   * Update alert state
   * @private
   */
  _updateAlertState(instanceName, result) {
    const prevState = this.alertStates.get(instanceName);

    // Store new state
    this.alertStates.set(instanceName, result);

    // Add to history
    this.alertHistory.unshift({
      instanceName,
      status: result.status,
      alerts: result.alerts,
      timestamp: result.timestamp
    });

    // Trim history
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(0, this.maxHistorySize);
    }

    // Emit events for state changes
    if (prevState && prevState.status.level !== result.status.level) {
      this.emit('alert_state_changed', {
        instanceName,
        previousStatus: prevState.status,
        newStatus: result.status,
        alerts: result.alerts,
        timestamp: result.timestamp
      });

      // Check if we should trip circuit breaker
      const breaker = this.circuitBreakers.get(instanceName);
      if (breaker && breaker.enabled && result.status.level >= breaker.threshold.level) {
        this.tripCircuitBreaker(instanceName, `Status changed to ${result.status.name}`);
      }
    }

    // Emit alert event if not healthy
    if (result.status.level > this.STATUS.HEALTHY.level) {
      this.emit('alert', result);
    }
  }

  /**
   * Find best fallback instance
   * @private
   */
  async _findBestFallback(fallbackInstances) {
    if (!fallbackInstances || fallbackInstances.length === 0) {
      return null;
    }

    // Check all fallback instances
    const candidates = [];

    for (const instanceName of fallbackInstances) {
      // Skip if circuit breaker tripped
      if (this.isCircuitBreakerTripped(instanceName)) {
        continue;
      }

      const status = await this.checkThresholds(instanceName);

      // Only use healthy instances
      if (status.status.level === this.STATUS.HEALTHY.level) {
        candidates.push({
          instanceName,
          status
        });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Return first healthy candidate (could add more sophisticated selection logic)
    return candidates[0].instanceName;
  }

  /**
   * Log circuit breaker event to database
   * @private
   */
  async _logCircuitBreakerEvent(instanceName, event, reason) {
    if (!this.db) {
      return;
    }

    try {
      await this.db.query(
        `INSERT INTO ai_circuit_breaker_events (
          instance_name, event, reason, created_at
        ) VALUES ($1, $2, $3, NOW())`,
        [instanceName, event, reason]
      );
    } catch (error) {
      console.error('[AICostAlerts] Error logging circuit breaker event:', error.message);
    }
  }
}

module.exports = AICostAlerts;

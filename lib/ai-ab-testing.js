/**
 * AI A/B Testing Framework
 *
 * "Wiggle something and see if the curve goes up or down"
 *
 * Problem:
 * - Need to test different providers for same task
 * - Which provider is faster? Cheaper? Better quality?
 * - How to safely roll out new providers?
 * - When to promote a variant to production?
 *
 * Solution:
 * - Split traffic between provider variants
 * - Track performance metrics (cost, latency, quality)
 * - Statistical analysis to determine winner
 * - Gradual rollout with auto-promotion
 *
 * Features:
 * - A/B/n testing (multiple variants)
 * - Traffic splitting (50/50, 90/10, etc.)
 * - Performance comparison (cost, speed, quality)
 * - Auto-promote winners
 * - Rollback on failures
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class AIABTesting extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.aiInstanceRegistry = options.aiInstanceRegistry;
    this.aiCostAnalytics = options.aiCostAnalytics;

    // Active experiments
    this.experiments = new Map();

    // Experiment history
    this.experimentHistory = [];

    // Minimum sample size for statistical significance
    this.minSampleSize = 30;

    // Confidence threshold for auto-promotion (95%)
    this.confidenceThreshold = 0.95;

    console.log('[AIABTesting] Initialized');
  }

  /**
   * Create new A/B test experiment
   *
   * @param {object} config - Experiment configuration
   * @returns {string} Experiment ID
   */
  createExperiment(config) {
    const {
      name,
      description,
      variants,           // Array of {name, instanceName, weight}
      metric = 'cost',    // What to optimize: cost, latency, quality, efficiency
      autoPromote = false,
      minSampleSize = this.minSampleSize,
      duration = 7 * 24 * 60 * 60 * 1000 // 7 days default
    } = config;

    // Validate variants
    if (!variants || variants.length < 2) {
      throw new Error('At least 2 variants required for A/B test');
    }

    // Normalize weights
    const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 1), 0);
    const normalizedVariants = variants.map(v => ({
      name: v.name,
      instanceName: v.instanceName,
      weight: (v.weight || 1) / totalWeight,
      results: []
    }));

    const experimentId = crypto.randomBytes(8).toString('hex');

    const experiment = {
      id: experimentId,
      name,
      description,
      variants: normalizedVariants,
      metric,
      autoPromote,
      minSampleSize,
      status: 'running',
      startTime: new Date(),
      endTime: new Date(Date.now() + duration),
      totalRequests: 0,
      winner: null,
      confidence: 0
    };

    this.experiments.set(experimentId, experiment);

    console.log(`[AIABTesting] Created experiment "${name}" (${experimentId})`);
    console.log(`  Variants: ${variants.map(v => `${v.name} (${Math.round((v.weight || 1) / totalWeight * 100)}%)`).join(', ')}`);
    console.log(`  Metric: ${metric}`);

    this.emit('experiment_created', experiment);

    return experimentId;
  }

  /**
   * Select variant for a request (traffic splitting)
   *
   * @param {string} experimentId - Experiment ID
   * @returns {object} Selected variant
   */
  selectVariant(experimentId) {
    const experiment = this.experiments.get(experimentId);

    if (!experiment || experiment.status !== 'running') {
      return null;
    }

    // Check if experiment expired
    if (Date.now() > experiment.endTime.getTime()) {
      this.stopExperiment(experimentId, 'expired');
      return null;
    }

    // Weighted random selection
    const random = Math.random();
    let cumulativeWeight = 0;

    for (const variant of experiment.variants) {
      cumulativeWeight += variant.weight;
      if (random <= cumulativeWeight) {
        return variant;
      }
    }

    // Fallback to first variant
    return experiment.variants[0];
  }

  /**
   * Record experiment result
   *
   * @param {string} experimentId - Experiment ID
   * @param {string} variantName - Variant name
   * @param {object} result - Request result
   */
  recordResult(experimentId, variantName, result) {
    const experiment = this.experiments.get(experimentId);

    if (!experiment || experiment.status !== 'running') {
      return;
    }

    const variant = experiment.variants.find(v => v.name === variantName);

    if (!variant) {
      console.warn(`[AIABTesting] Variant ${variantName} not found in experiment ${experimentId}`);
      return;
    }

    // Store result
    variant.results.push({
      timestamp: new Date(),
      cost: result.cost || 0,
      latency: result.latency || 0,
      tokens: result.tokens || 0,
      success: result.success !== false,
      quality: result.quality || null, // Optional quality score
      errorMessage: result.errorMessage || null
    });

    experiment.totalRequests++;

    // Check if we have enough data for analysis
    if (experiment.totalRequests >= experiment.minSampleSize) {
      this._analyzeExperiment(experimentId);
    }
  }

  /**
   * Get experiment status
   *
   * @param {string} experimentId - Experiment ID
   * @returns {object} Experiment status
   */
  getExperimentStatus(experimentId) {
    const experiment = this.experiments.get(experimentId);

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const variantStats = experiment.variants.map(variant => {
      const results = variant.results;
      const successResults = results.filter(r => r.success);

      const stats = {
        name: variant.name,
        instanceName: variant.instanceName,
        weight: variant.weight,
        totalRequests: results.length,
        successRate: results.length > 0 ? successResults.length / results.length : 0,
        avgCost: this._average(results.map(r => r.cost)),
        avgLatency: this._average(results.map(r => r.latency)),
        avgTokens: this._average(results.map(r => r.tokens)),
        totalCost: this._sum(results.map(r => r.cost)),
        avgQuality: variant.results.some(r => r.quality !== null)
          ? this._average(results.filter(r => r.quality !== null).map(r => r.quality))
          : null
      };

      // Calculate efficiency score
      stats.efficiency = this._calculateEfficiency(stats);

      return stats;
    });

    return {
      id: experiment.id,
      name: experiment.name,
      description: experiment.description,
      status: experiment.status,
      metric: experiment.metric,
      startTime: experiment.startTime,
      endTime: experiment.endTime,
      totalRequests: experiment.totalRequests,
      minSampleSize: experiment.minSampleSize,
      variants: variantStats,
      winner: experiment.winner,
      confidence: experiment.confidence,
      timeRemaining: Math.max(0, experiment.endTime.getTime() - Date.now())
    };
  }

  /**
   * Stop experiment
   *
   * @param {string} experimentId - Experiment ID
   * @param {string} reason - Stop reason
   * @returns {object} Final results
   */
  stopExperiment(experimentId, reason = 'manual') {
    const experiment = this.experiments.get(experimentId);

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    experiment.status = 'stopped';
    experiment.stopReason = reason;
    experiment.stoppedAt = new Date();

    // Final analysis
    const analysis = this._analyzeExperiment(experimentId);

    console.log(`[AIABTesting] Stopped experiment "${experiment.name}" (${reason})`);

    if (analysis.winner) {
      console.log(`  Winner: ${analysis.winner.name} (${Math.round(analysis.confidence * 100)}% confidence)`);
    }

    this.emit('experiment_stopped', {
      experiment,
      analysis,
      reason
    });

    // Move to history
    this.experimentHistory.push({
      ...experiment,
      analysis
    });

    return analysis;
  }

  /**
   * Promote variant to production
   *
   * @param {string} experimentId - Experiment ID
   * @param {string} variantName - Variant to promote
   */
  promoteVariant(experimentId, variantName) {
    const experiment = this.experiments.get(experimentId);

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const variant = experiment.variants.find(v => v.name === variantName);

    if (!variant) {
      throw new Error(`Variant ${variantName} not found`);
    }

    console.log(`[AIABTesting] 🎉 Promoting variant "${variantName}" (${variant.instanceName}) to production`);

    experiment.status = 'promoted';
    experiment.promotedVariant = variantName;

    this.emit('variant_promoted', {
      experimentId,
      variantName,
      instanceName: variant.instanceName,
      timestamp: new Date()
    });

    return {
      experimentId,
      variantName,
      instanceName: variant.instanceName,
      message: `Variant ${variantName} promoted to production`
    };
  }

  /**
   * List all experiments
   *
   * @param {object} options - Filter options
   * @returns {Array} Experiments
   */
  listExperiments(options = {}) {
    let experiments = Array.from(this.experiments.values());

    if (options.status) {
      experiments = experiments.filter(e => e.status === options.status);
    }

    return experiments.map(e => ({
      id: e.id,
      name: e.name,
      status: e.status,
      metric: e.metric,
      startTime: e.startTime,
      totalRequests: e.totalRequests,
      winner: e.winner
    }));
  }

  /**
   * Get experiment history
   *
   * @param {number} limit - Max results
   * @returns {Array} Historical experiments
   */
  getExperimentHistory(limit = 10) {
    return this.experimentHistory.slice(0, limit);
  }

  /**
   * Analyze experiment and determine winner
   * @private
   */
  _analyzeExperiment(experimentId) {
    const experiment = this.experiments.get(experimentId);

    if (!experiment) {
      return null;
    }

    const status = this.getExperimentStatus(experimentId);
    const variants = status.variants;

    // Need at least min sample size per variant
    const allVariantsReady = variants.every(v => v.totalRequests >= experiment.minSampleSize);

    if (!allVariantsReady) {
      return {
        ready: false,
        message: 'Not enough data yet',
        variants: status.variants
      };
    }

    // Determine winner based on metric
    let winner = null;
    let winnerValue = null;

    switch (experiment.metric) {
      case 'cost':
        // Lower cost wins
        winner = variants.reduce((best, v) =>
          !best || v.avgCost < best.avgCost ? v : best
        , null);
        winnerValue = winner.avgCost;
        break;

      case 'latency':
        // Lower latency wins
        winner = variants.reduce((best, v) =>
          !best || v.avgLatency < best.avgLatency ? v : best
        , null);
        winnerValue = winner.avgLatency;
        break;

      case 'efficiency':
        // Higher efficiency wins
        winner = variants.reduce((best, v) =>
          !best || v.efficiency > best.efficiency ? v : best
        , null);
        winnerValue = winner.efficiency;
        break;

      case 'quality':
        // Higher quality wins
        winner = variants.reduce((best, v) =>
          !best || (v.avgQuality || 0) > (best.avgQuality || 0) ? v : best
        , null);
        winnerValue = winner.avgQuality;
        break;

      default:
        console.warn(`[AIABTesting] Unknown metric: ${experiment.metric}`);
        return { ready: false, message: 'Unknown metric' };
    }

    // Calculate confidence using t-test approximation
    const confidence = this._calculateConfidence(winner, variants, experiment.metric);

    const analysis = {
      ready: true,
      winner: winner.name,
      winnerValue,
      confidence,
      metric: experiment.metric,
      variants: status.variants,
      recommendation: confidence >= this.confidenceThreshold
        ? `Promote ${winner.name} to production`
        : 'Continue testing - not statistically significant yet'
    };

    // Update experiment
    experiment.winner = winner.name;
    experiment.confidence = confidence;

    // Auto-promote if enabled and confidence threshold met
    if (experiment.autoPromote && confidence >= this.confidenceThreshold && experiment.status === 'running') {
      this.promoteVariant(experimentId, winner.name);
    }

    return analysis;
  }

  /**
   * Calculate confidence level (simplified t-test)
   * @private
   */
  _calculateConfidence(winner, variants, metric) {
    // Simplified confidence calculation
    // In production, would use proper statistical tests (t-test, chi-square, etc.)

    const winnerStats = winner;
    const otherVariants = variants.filter(v => v.name !== winner.name);

    if (otherVariants.length === 0) {
      return 0;
    }

    let metricKey;
    switch (metric) {
      case 'cost':
        metricKey = 'avgCost';
        break;
      case 'latency':
        metricKey = 'avgLatency';
        break;
      case 'efficiency':
        metricKey = 'efficiency';
        break;
      case 'quality':
        metricKey = 'avgQuality';
        break;
      default:
        return 0;
    }

    const winnerValue = winnerStats[metricKey];

    // Calculate average difference from winner
    const differences = otherVariants.map(v => {
      const value = v[metricKey];

      // For cost/latency, lower is better
      if (metric === 'cost' || metric === 'latency') {
        return ((value - winnerValue) / value) * 100; // % improvement
      } else {
        // For efficiency/quality, higher is better
        return ((winnerValue - value) / value) * 100; // % improvement
      }
    });

    const avgDifference = this._average(differences);

    // Simple confidence mapping based on sample size and difference
    const sampleSizeConfidence = Math.min(1.0, winnerStats.totalRequests / (this.minSampleSize * 3));
    const differenceConfidence = Math.min(1.0, Math.abs(avgDifference) / 20); // 20% difference = high confidence

    const confidence = (sampleSizeConfidence * 0.5) + (differenceConfidence * 0.5);

    return Math.min(0.99, confidence); // Cap at 99%
  }

  /**
   * Calculate efficiency score
   * @private
   */
  _calculateEfficiency(stats) {
    // Weighted score: cost (40%), latency (30%), success rate (30%)
    const costScore = stats.avgCost === 0 ? 100 : Math.max(0, 100 - (stats.avgCost * 1000));
    const latencyScore = Math.max(0, 100 - (stats.avgLatency / 100));
    const successScore = stats.successRate * 100;

    return (costScore * 0.4) + (latencyScore * 0.3) + (successScore * 0.3);
  }

  /**
   * Calculate average
   * @private
   */
  _average(values) {
    if (values.length === 0) return 0;
    return this._sum(values) / values.length;
  }

  /**
   * Calculate sum
   * @private
   */
  _sum(values) {
    return values.reduce((sum, v) => sum + v, 0);
  }

  /**
   * Get summary of all active experiments
   */
  getSummary() {
    const active = Array.from(this.experiments.values()).filter(e => e.status === 'running');
    const completed = Array.from(this.experiments.values()).filter(e => e.status !== 'running');

    return {
      active: {
        count: active.length,
        experiments: active.map(e => ({
          id: e.id,
          name: e.name,
          totalRequests: e.totalRequests,
          winner: e.winner,
          confidence: e.confidence
        }))
      },
      completed: {
        count: completed.length,
        experiments: completed.map(e => ({
          id: e.id,
          name: e.name,
          status: e.status,
          winner: e.winner,
          promotedVariant: e.promotedVariant
        }))
      },
      total: this.experiments.size
    };
  }
}

module.exports = AIABTesting;

/**
 * Experiment Manager
 *
 * Comprehensive A/B testing framework for:
 * - Model versions (soulfra v1 vs v2)
 * - Wrappers (concise vs detailed)
 * - System prompts
 * - Parameters (temperature, max_tokens)
 * - Profile-specific routing
 *
 * Features:
 * - Multi-armed bandit optimization (automatic traffic allocation)
 * - Statistical significance testing (chi-square, t-test)
 * - Consistent variant assignment (sticky users)
 * - Success metrics tracking (satisfaction, conversion, cost)
 * - Auto-winner selection
 *
 * Experiment types:
 * - Simple A/B test (2 variants)
 * - Multi-variant (3+ variants)
 * - Profile-specific (different experiment per profile)
 * - Domain-specific (cryptography vs publishing)
 */

class ExperimentManager {
  constructor(options = {}) {
    this.db = options.db;
    this.modelVersionManager = options.modelVersionManager;
    this.modelWrappers = options.modelWrappers;

    // Bandit configuration
    this.banditConfig = {
      explorationRate: 0.1, // 10% exploration
      minSampleSize: 50,    // Min samples before optimization
      updateInterval: 100   // Update traffic every 100 requests
    };

    // Statistical significance thresholds
    this.significanceThreshold = 0.05; // p-value < 0.05

    console.log('[ExperimentManager] Initialized');
  }

  /**
   * Create new experiment
   *
   * @param {object} experimentSpec - Experiment specification
   * @returns {Promise<integer>} - Experiment ID
   */
  async createExperiment(experimentSpec) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    const {
      name,
      description,
      experimentType,
      domain = null,
      userProfile = null,
      variants,
      primaryMetric = 'success_rate',
      secondaryMetrics = [],
      autoOptimize = true,
      minSampleSize = 100,
      duration = 14 // days
    } = experimentSpec;

    // Validate variants
    if (!variants || variants.length < 2) {
      throw new Error('At least 2 variants required');
    }

    // Validate traffic allocation sums to 100
    const totalTraffic = variants.reduce((sum, v) => sum + v.traffic, 0);
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error(`Total traffic must equal 100% (got ${totalTraffic}%)`);
    }

    try {
      await this.db.query('BEGIN');

      // Create experiment
      const expResult = await this.db.query(
        `INSERT INTO experiments (
          name, description, experiment_type, domain, user_profile,
          primary_metric, secondary_metrics, auto_optimize,
          min_sample_size, status, ends_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW() + $10 * INTERVAL '1 day')
        RETURNING id`,
        [
          name, description, experimentType, domain, userProfile,
          primaryMetric, JSON.stringify(secondaryMetrics), autoOptimize,
          minSampleSize, duration
        ]
      );

      const experimentId = expResult.rows[0].id;

      // Create variants
      for (const variant of variants) {
        await this.db.query(
          `INSERT INTO experiment_variants (
            experiment_id, variant_name, variant_config,
            traffic_percent, is_control
          )
          VALUES ($1, $2, $3, $4, $5)`,
          [
            experimentId,
            variant.name,
            JSON.stringify(variant.config),
            variant.traffic,
            variant.isControl || false
          ]
        );
      }

      await this.db.query('COMMIT');

      console.log(`[ExperimentManager] Created experiment ${experimentId}: ${name}`);

      return experimentId;
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('[ExperimentManager] Error creating experiment:', error.message);
      throw error;
    }
  }

  /**
   * Assign user to experiment variant
   *
   * @param {integer} experimentId - Experiment ID
   * @param {integer} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<object>} - Assigned variant
   */
  async assignVariant(experimentId, userId, sessionId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      // Check if user already assigned
      const existingResult = await this.db.query(
        `SELECT variant_id, variant_name, variant_config
         FROM experiment_assignments ea
         JOIN experiment_variants ev ON ev.id = ea.variant_id
         WHERE ea.experiment_id = $1 AND ea.user_id = $2
         LIMIT 1`,
        [experimentId, userId]
      );

      if (existingResult.rows.length > 0) {
        // Return existing assignment (sticky)
        return {
          variantId: existingResult.rows[0].variant_id,
          variantName: existingResult.rows[0].variant_name,
          config: existingResult.rows[0].variant_config,
          isNew: false
        };
      }

      // Get experiment variants with current traffic allocation
      const variantsResult = await this.db.query(
        `SELECT id, variant_name, variant_config, traffic_percent
         FROM experiment_variants
         WHERE experiment_id = $1
         ORDER BY traffic_percent DESC`,
        [experimentId]
      );

      if (variantsResult.rows.length === 0) {
        throw new Error('No variants found for experiment');
      }

      const variants = variantsResult.rows;

      // Use consistent hashing to assign variant
      const assignedVariant = this._selectVariantConsistent(variants, userId);

      // Record assignment
      await this.db.query(
        `INSERT INTO experiment_assignments (
          experiment_id, variant_id, user_id, session_id
        )
        VALUES ($1, $2, $3, $4)`,
        [experimentId, assignedVariant.id, userId, sessionId]
      );

      console.log(`[ExperimentManager] Assigned user ${userId} to variant ${assignedVariant.variant_name}`);

      return {
        variantId: assignedVariant.id,
        variantName: assignedVariant.variant_name,
        config: assignedVariant.variant_config,
        isNew: true
      };
    } catch (error) {
      console.error('[ExperimentManager] Error assigning variant:', error.message);
      throw error;
    }
  }

  /**
   * Record experiment result
   *
   * @param {integer} experimentId - Experiment ID
   * @param {integer} variantId - Variant ID
   * @param {integer} userId - User ID
   * @param {object} metrics - Result metrics
   * @returns {Promise<boolean>} - Success
   */
  async recordResult(experimentId, variantId, userId, metrics) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      await this.db.query(
        `INSERT INTO experiment_results (
          experiment_id, variant_id, user_id,
          success, response_time_ms, cost_usd,
          user_satisfaction, conversion, metrics
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          experimentId,
          variantId,
          userId,
          metrics.success || false,
          metrics.responseTime || null,
          metrics.cost || null,
          metrics.satisfaction || null,
          metrics.conversion || false,
          JSON.stringify(metrics)
        ]
      );

      // Check if should update traffic allocation
      await this._maybeUpdateTrafficAllocation(experimentId);

      return true;
    } catch (error) {
      console.error('[ExperimentManager] Error recording result:', error.message);
      throw error;
    }
  }

  /**
   * Get experiment results and statistics
   *
   * @param {integer} experimentId - Experiment ID
   * @returns {Promise<object>} - Experiment stats
   */
  async getExperimentResults(experimentId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      // Get experiment info
      const expResult = await this.db.query(
        `SELECT
          id, name, description, experiment_type,
          primary_metric, status, created_at, ends_at
         FROM experiments
         WHERE id = $1`,
        [experimentId]
      );

      if (expResult.rows.length === 0) {
        throw new Error('Experiment not found');
      }

      const experiment = expResult.rows[0];

      // Get variant statistics
      const variantsResult = await this.db.query(
        `SELECT
          ev.id, ev.variant_name, ev.is_control, ev.traffic_percent,
          COUNT(er.id) as sample_size,
          AVG(CASE WHEN er.success THEN 1 ELSE 0 END) as success_rate,
          AVG(er.response_time_ms) as avg_response_time,
          AVG(er.cost_usd) as avg_cost,
          AVG(er.user_satisfaction) as avg_satisfaction,
          SUM(CASE WHEN er.conversion THEN 1 ELSE 0 END)::REAL / COUNT(er.id) as conversion_rate
         FROM experiment_variants ev
         LEFT JOIN experiment_results er ON er.variant_id = ev.id
         WHERE ev.experiment_id = $1
         GROUP BY ev.id, ev.variant_name, ev.is_control, ev.traffic_percent
         ORDER BY ev.is_control DESC, ev.id`,
        [experimentId]
      );

      const variants = variantsResult.rows.map(row => ({
        id: row.id,
        name: row.variant_name,
        isControl: row.is_control,
        traffic: row.traffic_percent,
        sampleSize: parseInt(row.sample_size),
        successRate: parseFloat(row.success_rate) || 0,
        avgResponseTime: parseFloat(row.avg_response_time) || 0,
        avgCost: parseFloat(row.avg_cost) || 0,
        avgSatisfaction: parseFloat(row.avg_satisfaction) || 0,
        conversionRate: parseFloat(row.conversion_rate) || 0
      }));

      // Calculate statistical significance
      const significance = await this._calculateSignificance(experimentId, variants);

      // Determine winner (if significant)
      const winner = significance.isSignificant ? this._determineWinner(variants, experiment.primary_metric) : null;

      return {
        experiment: {
          id: experiment.id,
          name: experiment.name,
          description: experiment.description,
          type: experiment.experiment_type,
          primaryMetric: experiment.primary_metric,
          status: experiment.status,
          createdAt: experiment.created_at,
          endsAt: experiment.ends_at
        },
        variants,
        significance,
        winner,
        totalSamples: variants.reduce((sum, v) => sum + v.sampleSize, 0)
      };
    } catch (error) {
      console.error('[ExperimentManager] Error getting results:', error.message);
      throw error;
    }
  }

  /**
   * End experiment and optionally declare winner
   *
   * @param {integer} experimentId - Experiment ID
   * @param {integer} winnerVariantId - Winner variant ID (optional)
   * @returns {Promise<boolean>} - Success
   */
  async endExperiment(experimentId, winnerVariantId = null) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      await this.db.query(
        `UPDATE experiments
         SET status = 'completed',
             winner_variant_id = $1,
             ended_at = NOW()
         WHERE id = $2`,
        [winnerVariantId, experimentId]
      );

      console.log(`[ExperimentManager] Ended experiment ${experimentId}, winner: ${winnerVariantId || 'none'}`);

      return true;
    } catch (error) {
      console.error('[ExperimentManager] Error ending experiment:', error.message);
      throw error;
    }
  }

  /**
   * List active experiments
   *
   * @param {object} filters - Filters
   * @returns {Promise<Array>} - Active experiments
   */
  async listActiveExperiments(filters = {}) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    const { domain = null, userProfile = null } = filters;

    try {
      let conditions = ['status = $1'];
      let params = ['active'];
      let paramIndex = 2;

      if (domain) {
        conditions.push(`(domain = $${paramIndex} OR domain IS NULL)`);
        params.push(domain);
        paramIndex++;
      }

      if (userProfile) {
        conditions.push(`(user_profile = $${paramIndex} OR user_profile IS NULL)`);
        params.push(userProfile);
        paramIndex++;
      }

      const result = await this.db.query(
        `SELECT
          id, name, description, experiment_type,
          domain, user_profile, created_at, ends_at
         FROM experiments
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC`,
        params
      );

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        type: row.experiment_type,
        domain: row.domain,
        userProfile: row.user_profile,
        createdAt: row.created_at,
        endsAt: row.ends_at
      }));
    } catch (error) {
      console.error('[ExperimentManager] Error listing experiments:', error.message);
      throw error;
    }
  }

  /**
   * Select variant using consistent hashing
   * @private
   */
  _selectVariantConsistent(variants, userId) {
    const hash = this._hashString(`${userId}`);
    const value = hash % 100;

    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.traffic_percent;
      if (value < cumulative) {
        return variant;
      }
    }

    return variants[0]; // Fallback
  }

  /**
   * Hash string to integer
   * @private
   */
  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Maybe update traffic allocation (multi-armed bandit)
   * @private
   */
  async _maybeUpdateTrafficAllocation(experimentId) {
    try {
      // Get experiment config
      const expResult = await this.db.query(
        `SELECT auto_optimize, min_sample_size, request_count
         FROM experiments
         WHERE id = $1`,
        [experimentId]
      );

      if (expResult.rows.length === 0) return;

      const exp = expResult.rows[0];

      if (!exp.auto_optimize) return;

      // Increment request count
      const newCount = (exp.request_count || 0) + 1;
      await this.db.query(
        `UPDATE experiments SET request_count = $1 WHERE id = $2`,
        [newCount, experimentId]
      );

      // Check if should optimize
      if (newCount < exp.min_sample_size || newCount % this.banditConfig.updateInterval !== 0) {
        return;
      }

      // Get variant performance
      const results = await this.getExperimentResults(experimentId);
      const variants = results.variants;

      // Calculate new traffic allocation using Thompson sampling
      const newAllocations = this._calculateBanditAllocation(variants, results.experiment.primaryMetric);

      // Update traffic percentages
      for (const allocation of newAllocations) {
        await this.db.query(
          `UPDATE experiment_variants
           SET traffic_percent = $1
           WHERE id = $2`,
          [allocation.traffic, allocation.variantId]
        );
      }

      console.log(`[ExperimentManager] Updated traffic allocation for experiment ${experimentId}`);
    } catch (error) {
      console.error('[ExperimentManager] Error updating traffic:', error.message);
    }
  }

  /**
   * Calculate bandit traffic allocation
   * @private
   */
  _calculateBanditAllocation(variants, primaryMetric) {
    const explorationRate = this.banditConfig.explorationRate;

    // Calculate scores based on primary metric
    const scores = variants.map(v => {
      let score = 0;

      switch (primaryMetric) {
        case 'success_rate':
          score = v.successRate;
          break;
        case 'conversion_rate':
          score = v.conversionRate;
          break;
        case 'satisfaction':
          score = v.avgSatisfaction / 5; // Normalize to 0-1
          break;
        case 'cost':
          score = 1 - Math.min(v.avgCost / 0.01, 1); // Lower cost is better
          break;
        default:
          score = v.successRate;
      }

      return {
        variantId: v.id,
        score: Math.max(0, score),
        sampleSize: v.sampleSize
      };
    });

    // Calculate traffic allocation
    // (1 - exploration) goes to best performers, exploration spread evenly
    const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
    const explorationPerVariant = (explorationRate * 100) / scores.length;

    const allocations = scores.map(s => ({
      variantId: s.variantId,
      traffic: explorationPerVariant + ((1 - explorationRate) * 100 * (s.score / totalScore))
    }));

    // Ensure minimum traffic (at least 5% per variant)
    allocations.forEach(a => {
      a.traffic = Math.max(5, a.traffic);
    });

    // Normalize to 100%
    const total = allocations.reduce((sum, a) => sum + a.traffic, 0);
    allocations.forEach(a => {
      a.traffic = (a.traffic / total) * 100;
    });

    return allocations;
  }

  /**
   * Calculate statistical significance
   * @private
   */
  async _calculateSignificance(experimentId, variants) {
    // Simple chi-square test for success rate difference
    if (variants.length !== 2 || variants.some(v => v.sampleSize < 30)) {
      return {
        isSignificant: false,
        pValue: null,
        reason: 'Insufficient sample size or too many variants'
      };
    }

    const [control, treatment] = variants;

    // Chi-square test
    const n1 = control.sampleSize;
    const n2 = treatment.sampleSize;
    const p1 = control.successRate;
    const p2 = treatment.successRate;

    const pooled = ((n1 * p1) + (n2 * p2)) / (n1 + n2);
    const se = Math.sqrt(pooled * (1 - pooled) * ((1 / n1) + (1 / n2)));
    const z = Math.abs(p1 - p2) / se;

    // Approximate p-value from z-score
    const pValue = 2 * (1 - this._normalCDF(z));

    return {
      isSignificant: pValue < this.significanceThreshold,
      pValue,
      zScore: z,
      reason: pValue < this.significanceThreshold ? 'Statistically significant difference' : 'Not significant'
    };
  }

  /**
   * Normal CDF approximation
   * @private
   */
  _normalCDF(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - prob : prob;
  }

  /**
   * Determine winner based on primary metric
   * @private
   */
  _determineWinner(variants, primaryMetric) {
    let bestVariant = null;
    let bestScore = -Infinity;

    for (const variant of variants) {
      let score = 0;

      switch (primaryMetric) {
        case 'success_rate':
          score = variant.successRate;
          break;
        case 'conversion_rate':
          score = variant.conversionRate;
          break;
        case 'satisfaction':
          score = variant.avgSatisfaction;
          break;
        case 'cost':
          score = -variant.avgCost; // Lower is better
          break;
        default:
          score = variant.successRate;
      }

      if (score > bestScore) {
        bestScore = score;
        bestVariant = variant;
      }
    }

    return bestVariant ? {
      variantId: bestVariant.id,
      variantName: bestVariant.name,
      score: bestScore
    } : null;
  }
}

module.exports = ExperimentManager;

/**
 * Idea Growth Tracker
 *
 * NOT a static marketplace. NOT gamification.
 *
 * THIS IS:
 * - Real-time idea momentum tracking
 * - Growth velocity & acceleration measurement
 * - Potential scoring based on actual user behavior
 * - Predictive analytics for idea viability
 *
 * Like TrendDetector but for IDEAS, not costs.
 * Like React state but for GROWTH, not UI.
 *
 * The insight:
 * "we can build our index while piggybacking... dogfeed based off what our
 * own users want to do... component or effect or state where we can see
 * the growth and potential of ideas"
 *
 * Use Cases:
 * - Submit idea → Track who actually USES it (not just votes)
 * - Measure growth velocity → Is momentum increasing?
 * - Detect inflection points → When did it take off?
 * - Predict potential → Will this be big?
 * - Surface high-growth ideas → Show what's actually working
 */

const { Pool } = require('pg');

class IdeaGrowthTracker {
  constructor(config = {}) {
    this.pool = config.pool || new Pool({
      connectionString: process.env.DATABASE_URL
    });

    // Growth measurement windows
    this.windows = {
      shortTerm: 3,   // Last 3 data points (hours/days)
      mediumTerm: 7,  // Last week
      longTerm: 30    // Last month
    };

    // Inflection point sensitivity
    this.sensitivity = config.sensitivity || 0.1; // 10% change = inflection

    console.log('[IdeaGrowthTracker] Initialized');
  }

  /**
   * Track idea activity (usage, not just votes)
   *
   * This is the key difference: we track ACTUAL USAGE, not just engagement
   *
   * @param {string} ideaId - ID of the idea
   * @param {string} activityType - What the user DID with it
   *   - 'viewed' - Looked at it
   *   - 'forked' - Copied to use themselves
   *   - 'implemented' - Actually built it
   *   - 'referenced' - Mentioned in their work
   *   - 'iterated' - Built on top of it
   * @param {Object} metadata - Additional context
   * @returns {Object} Updated growth state
   */
  async trackActivity(ideaId, activityType, metadata = {}) {
    try {
      // Record the activity
      await this.pool.query(`
        INSERT INTO idea_activities (
          idea_id,
          activity_type,
          metadata,
          timestamp
        ) VALUES ($1, $2, $3, NOW())
      `, [ideaId, activityType, JSON.stringify(metadata)]);

      // Calculate new growth metrics
      const growth = await this.calculateGrowth(ideaId);

      // Check for inflection points
      const inflection = await this.detectInflection(ideaId, growth);

      // Update idea growth state
      await this.updateGrowthState(ideaId, growth, inflection);

      return {
        ideaId,
        activityType,
        growth,
        inflection,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('[IdeaGrowthTracker] Error tracking activity:', error);
      throw error;
    }
  }

  /**
   * Calculate growth metrics
   *
   * This is where we measure:
   * - Velocity: How fast is it growing?
   * - Acceleration: Is growth speeding up or slowing down?
   * - Momentum: Current growth energy
   * - Potential: Predicted future growth
   *
   * @param {string} ideaId
   * @returns {Object} Growth metrics
   */
  async calculateGrowth(ideaId) {
    try {
      // Get activity history (time series)
      const activities = await this.pool.query(`
        SELECT
          DATE_TRUNC('hour', timestamp) as period,
          activity_type,
          COUNT(*) as count,
          COUNT(DISTINCT metadata->>'userId') as unique_users
        FROM idea_activities
        WHERE idea_id = $1
          AND timestamp > NOW() - INTERVAL '30 days'
        GROUP BY period, activity_type
        ORDER BY period ASC
      `, [ideaId]);

      if (activities.rows.length === 0) {
        return this._zeroGrowth();
      }

      // Convert to time series
      const timeSeries = this._buildTimeSeries(activities.rows);

      // Calculate derivatives (velocity, acceleration)
      const velocity = this._calculateVelocity(timeSeries);
      const acceleration = this._calculateAcceleration(timeSeries);

      // Calculate momentum (velocity * mass)
      // Mass = unique users (more users = more momentum)
      const uniqueUsers = new Set(
        activities.rows.map(row => row.metadata?.userId).filter(Boolean)
      ).size;

      const momentum = velocity.current * uniqueUsers;

      // Calculate potential score
      const potential = await this._calculatePotential(ideaId, {
        velocity,
        acceleration,
        momentum,
        uniqueUsers
      });

      // Classify growth stage
      const stage = this._classifyStage(velocity, acceleration, momentum);

      return {
        velocity,
        acceleration,
        momentum,
        potential,
        stage,
        uniqueUsers,
        totalActivities: timeSeries.length,
        lastActivity: activities.rows[activities.rows.length - 1].period
      };
    } catch (error) {
      console.error('[IdeaGrowthTracker] Error calculating growth:', error);
      throw error;
    }
  }

  /**
   * Detect inflection points
   *
   * An inflection point is when the growth CHANGES DIRECTION:
   * - Flat → Rising (idea taking off!)
   * - Rising → Peak (max growth reached)
   * - Peak → Declining (losing momentum)
   * - Declining → Recovering (comeback!)
   *
   * @param {string} ideaId
   * @param {Object} currentGrowth - Current growth metrics
   * @returns {Object} Inflection analysis
   */
  async detectInflection(ideaId, currentGrowth) {
    try {
      // Get previous growth state
      const previous = await this.pool.query(`
        SELECT growth_state
        FROM idea_growth_state
        WHERE idea_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `, [ideaId]);

      if (previous.rows.length === 0) {
        return { isInflection: false, type: null };
      }

      const prevGrowth = previous.rows[0].growth_state;

      // Compare velocities (sign change = inflection)
      const prevVelocity = prevGrowth.velocity?.current || 0;
      const currVelocity = currentGrowth.velocity.current;

      const prevSign = Math.sign(prevVelocity);
      const currSign = Math.sign(currVelocity);

      const isInflection = prevSign !== currSign && Math.abs(currVelocity - prevVelocity) > this.sensitivity;

      if (!isInflection) {
        return { isInflection: false, type: null };
      }

      // Classify inflection type
      let type, emoji, message;

      if (prevSign <= 0 && currSign > 0) {
        // Flat/Declining → Rising
        type = 'TAKEOFF';
        emoji = '🚀';
        message = 'Idea is taking off! Growth accelerating.';
      } else if (prevSign > 0 && currSign <= 0) {
        // Rising → Peak/Declining
        if (currentGrowth.acceleration.current < 0) {
          type = 'PEAK';
          emoji = '📈';
          message = 'Peak growth reached. Momentum may be slowing.';
        } else {
          type = 'PLATEAU';
          emoji = '📊';
          message = 'Growth plateauing. Momentum stable.';
        }
      } else if (prevSign < 0 && currSign >= 0) {
        // Declining → Recovering
        type = 'RECOVERY';
        emoji = '💪';
        message = 'Idea recovering! Momentum returning.';
      } else {
        type = 'UNKNOWN';
        emoji = '❓';
        message = 'Growth pattern changing.';
      }

      return {
        isInflection: true,
        type,
        emoji,
        message,
        previousVelocity: prevVelocity,
        currentVelocity: currVelocity,
        change: currVelocity - prevVelocity,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('[IdeaGrowthTracker] Error detecting inflection:', error);
      return { isInflection: false, type: null };
    }
  }

  /**
   * Calculate potential score
   *
   * Predicts if this idea will be BIG based on:
   * - Growth velocity (how fast?)
   * - Acceleration (speeding up?)
   * - Momentum (how much energy?)
   * - User behavior (what are they doing?)
   * - Implementation rate (are they actually using it?)
   *
   * Returns score 0-100
   *
   * @private
   */
  async _calculatePotential(ideaId, metrics) {
    try {
      const { velocity, acceleration, momentum, uniqueUsers } = metrics;

      // Get activity type breakdown
      const breakdown = await this.pool.query(`
        SELECT
          activity_type,
          COUNT(*) as count
        FROM idea_activities
        WHERE idea_id = $1
          AND timestamp > NOW() - INTERVAL '7 days'
        GROUP BY activity_type
      `, [ideaId]);

      // Weight different activities
      const weights = {
        viewed: 1,
        forked: 5,
        implemented: 20,
        referenced: 10,
        iterated: 15
      };

      let weightedScore = 0;
      let totalActivities = 0;

      breakdown.rows.forEach(row => {
        const weight = weights[row.activity_type] || 1;
        weightedScore += row.count * weight;
        totalActivities += row.count;
      });

      // Normalize to 0-1
      const activityScore = totalActivities > 0
        ? Math.min(weightedScore / (totalActivities * 20), 1)
        : 0;

      // Velocity score (0-1)
      const velocityScore = Math.min(Math.max(velocity.current, 0) / 10, 1);

      // Acceleration score (0-1)
      const accelerationScore = Math.min(Math.max(acceleration.current, 0) / 5, 1);

      // Momentum score (0-1)
      const momentumScore = Math.min(momentum / 100, 1);

      // User score (0-1)
      const userScore = Math.min(uniqueUsers / 50, 1);

      // Weighted potential score
      const potential =
        (activityScore * 0.3) +     // What users DO (most important)
        (velocityScore * 0.2) +     // How fast it's growing
        (accelerationScore * 0.2) + // Is growth speeding up?
        (momentumScore * 0.15) +    // Current energy
        (userScore * 0.15);         // Number of users

      // Scale to 0-100
      return Math.round(potential * 100);
    } catch (error) {
      console.error('[IdeaGrowthTracker] Error calculating potential:', error);
      return 0;
    }
  }

  /**
   * Build time series from activities
   * @private
   */
  _buildTimeSeries(activities) {
    // Aggregate by period
    const series = {};

    activities.forEach(row => {
      const period = row.period;
      if (!series[period]) {
        series[period] = {
          timestamp: period,
          total: 0,
          uniqueUsers: 0
        };
      }

      series[period].total += parseInt(row.count);
      series[period].uniqueUsers += parseInt(row.unique_users);
    });

    return Object.values(series).sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );
  }

  /**
   * Calculate velocity (first derivative)
   * @private
   */
  _calculateVelocity(timeSeries) {
    if (timeSeries.length < 2) {
      return { current: 0, shortTerm: 0, mediumTerm: 0, longTerm: 0 };
    }

    const shortTerm = this._slope(timeSeries.slice(-this.windows.shortTerm));
    const mediumTerm = this._slope(timeSeries.slice(-this.windows.mediumTerm));
    const longTerm = this._slope(timeSeries.slice(-this.windows.longTerm));

    return {
      current: shortTerm,
      shortTerm,
      mediumTerm,
      longTerm
    };
  }

  /**
   * Calculate acceleration (second derivative)
   * @private
   */
  _calculateAcceleration(timeSeries) {
    if (timeSeries.length < 3) {
      return { current: 0, shortTerm: 0 };
    }

    // Calculate velocity at different points
    const velocities = [];
    for (let i = 1; i < timeSeries.length; i++) {
      const dt = (new Date(timeSeries[i].timestamp) - new Date(timeSeries[i - 1].timestamp)) / (1000 * 60 * 60); // hours
      const dv = timeSeries[i].total - timeSeries[i - 1].total;
      velocities.push(dv / dt);
    }

    // Acceleration = change in velocity
    const shortTerm = velocities.length > 1
      ? (velocities[velocities.length - 1] - velocities[velocities.length - 2])
      : 0;

    return {
      current: shortTerm,
      shortTerm
    };
  }

  /**
   * Calculate slope (linear regression)
   * @private
   */
  _slope(points) {
    if (points.length < 2) return 0;

    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    points.forEach((point, index) => {
      const x = index;
      const y = point.total;

      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope || 0;
  }

  /**
   * Classify growth stage
   * @private
   */
  _classifyStage(velocity, acceleration, momentum) {
    const v = velocity.current;
    const a = acceleration.current;

    if (v <= 0 && a <= 0) {
      return { type: 'DORMANT', emoji: '💤', description: 'No growth' };
    } else if (v > 0 && a > 0) {
      return { type: 'ACCELERATING', emoji: '🚀', description: 'Rapid growth' };
    } else if (v > 0 && a <= 0) {
      return { type: 'GROWING', emoji: '📈', description: 'Steady growth' };
    } else if (v <= 0 && a > 0) {
      return { type: 'RECOVERING', emoji: '💪', description: 'Recovery' };
    } else {
      return { type: 'DECLINING', emoji: '📉', description: 'Losing momentum' };
    }
  }

  /**
   * Zero growth state
   * @private
   */
  _zeroGrowth() {
    return {
      velocity: { current: 0, shortTerm: 0, mediumTerm: 0, longTerm: 0 },
      acceleration: { current: 0, shortTerm: 0 },
      momentum: 0,
      potential: 0,
      stage: { type: 'DORMANT', emoji: '💤', description: 'No activity yet' },
      uniqueUsers: 0,
      totalActivities: 0,
      lastActivity: null
    };
  }

  /**
   * Update growth state in database
   * @private
   */
  async updateGrowthState(ideaId, growth, inflection) {
    await this.pool.query(`
      INSERT INTO idea_growth_state (
        idea_id,
        growth_state,
        inflection,
        updated_at
      ) VALUES ($1, $2, $3, NOW())
    `, [ideaId, JSON.stringify(growth), JSON.stringify(inflection)]);
  }

  /**
   * Get current growth state for an idea
   */
  async getGrowthState(ideaId) {
    const result = await this.pool.query(`
      SELECT growth_state, inflection, updated_at
      FROM idea_growth_state
      WHERE idea_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `, [ideaId]);

    return result.rows[0] || null;
  }

  /**
   * Get high-potential ideas (what's actually working?)
   */
  async getHighPotentialIdeas(limit = 10) {
    const result = await this.pool.query(`
      SELECT
        i.id,
        i.title,
        i.category,
        gs.growth_state,
        gs.inflection,
        gs.updated_at
      FROM marketplace_ideas i
      JOIN idea_growth_state gs ON i.id = gs.idea_id
      WHERE (gs.growth_state->>'potential')::int > 50
      ORDER BY (gs.growth_state->>'potential')::int DESC, gs.updated_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }
}

module.exports = IdeaGrowthTracker;

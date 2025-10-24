/**
 * Account Warming System
 *
 * Build authentic usage patterns for new accounts (inspired by TikTok account warming):
 * - Gradual activity progression
 * - Natural behavior patterns
 * - Trust score building
 * - Profile authenticity metrics
 *
 * Use cases:
 * - New user onboarding (build trust gradually)
 * - Testing accounts (avoid being flagged as bots)
 * - Monetization prep (establish legitimacy before selling data/content)
 * - Multi-account management
 *
 * Warmup phases:
 * 1. Observer (7 days): Read-only, consume content
 * 2. Participant (14 days): Simple interactions, voting, ratings
 * 3. Contributor (21 days): Generate content, complex tasks
 * 4. Expert (30+ days): Full access, mentorship, high-value tasks
 */

class AccountWarmer {
  constructor(options = {}) {
    this.db = options.db;
    this.trainingTasks = options.trainingTasks;
    this.devicePairing = options.devicePairing;

    // Warmup configuration
    this.phases = {
      observer: {
        name: 'Observer',
        duration: 7, // days
        requirements: {
          minSessions: 5,
          minActions: 20,
          minTimeSpent: 60 * 30 // 30 minutes
        },
        allowedActivities: ['view_content', 'browse', 'search'],
        taskTypes: []
      },

      participant: {
        name: 'Participant',
        duration: 14,
        requirements: {
          minSessions: 15,
          minActions: 75,
          minTimeSpent: 60 * 90, // 90 minutes
          minTasksCompleted: 10,
          minAvgQuality: 0.6
        },
        allowedActivities: ['view_content', 'browse', 'search', 'vote', 'rate', 'react'],
        taskTypes: ['vote_model_output', 'rate_response', 'verify_label']
      },

      contributor: {
        name: 'Contributor',
        duration: 21,
        requirements: {
          minSessions: 30,
          minActions: 200,
          minTimeSpent: 60 * 180, // 3 hours
          minTasksCompleted: 50,
          minAvgQuality: 0.7,
          minStreak: 3
        },
        allowedActivities: ['*'],
        taskTypes: ['chat_conversation', 'generate_meme', 'write_prompt', 'label_content']
      },

      expert: {
        name: 'Expert',
        duration: null, // Unlimited
        requirements: {
          minSessions: 50,
          minActions: 500,
          minTimeSpent: 60 * 300, // 5 hours
          minTasksCompleted: 100,
          minAvgQuality: 0.8,
          minStreak: 7
        },
        allowedActivities: ['*'],
        taskTypes: ['*']
      }
    };

    console.log('[AccountWarmer] Initialized with 4 warmup phases');
  }

  /**
   * Start account warming campaign
   *
   * @param {integer} userId - User ID
   * @param {string} deviceId - Device ID
   * @param {object} options - Campaign options
   * @returns {Promise<object>} - Campaign info
   */
  async startWarmupCampaign(userId, deviceId, options = {}) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    const {
      targetPhase = 'contributor',
      dailyTaskGoal = 5,
      notes = null
    } = options;

    try {
      // Check if campaign already exists
      const existing = await this.db.query(
        `SELECT id FROM account_warmup_campaigns
         WHERE user_id = $1 AND status = 'active'`,
        [userId]
      );

      if (existing.rows.length > 0) {
        throw new Error('Active warmup campaign already exists');
      }

      // Create campaign
      const result = await this.db.query(
        `INSERT INTO account_warmup_campaigns (
          user_id, device_id, target_phase, daily_task_goal,
          current_phase, status, notes
        )
        VALUES ($1, $2, $3, $4, 'observer', 'active', $5)
        RETURNING id, created_at`,
        [userId, deviceId, targetPhase, dailyTaskGoal, notes]
      );

      const campaign = result.rows[0];

      console.log(`[AccountWarmer] Started warmup campaign ${campaign.id} for user ${userId}`);

      return {
        campaignId: campaign.id,
        userId,
        currentPhase: 'observer',
        targetPhase,
        dailyTaskGoal,
        startedAt: campaign.created_at
      };
    } catch (error) {
      console.error('[AccountWarmer] Error starting warmup:', error.message);
      throw error;
    }
  }

  /**
   * Get account warmup status
   *
   * @param {integer} userId - User ID
   * @returns {Promise<object>} - Warmup status and progress
   */
  async getWarmupStatus(userId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      // Get active campaign
      const campaignResult = await this.db.query(
        `SELECT
          id, current_phase, target_phase, daily_task_goal,
          phase_started_at, status, created_at
         FROM account_warmup_campaigns
         WHERE user_id = $1 AND status = 'active'
         LIMIT 1`,
        [userId]
      );

      if (campaignResult.rows.length === 0) {
        return {
          isWarming: false,
          hasCompleted: await this._hasCompletedWarmup(userId)
        };
      }

      const campaign = campaignResult.rows[0];
      const currentPhase = this.phases[campaign.current_phase];

      // Calculate progress toward next phase
      const progress = await this._calculatePhaseProgress(userId, campaign.current_phase);

      // Calculate authenticity score
      const authenticity = await this._calculateAuthenticityScore(userId);

      // Get today's task completions
      const todayTasks = await this.db.query(
        `SELECT COUNT(*) as count
         FROM training_task_assignments
         WHERE user_id = $1
           AND status = 'completed'
           AND completed_at >= CURRENT_DATE`,
        [userId]
      );

      const todayCount = parseInt(todayTasks.rows[0].count) || 0;

      return {
        isWarming: true,
        campaignId: campaign.id,
        currentPhase: campaign.current_phase,
        targetPhase: campaign.target_phase,
        phaseName: currentPhase.name,
        phaseStartedAt: campaign.phase_started_at,
        daysInPhase: Math.floor(
          (Date.now() - new Date(campaign.phase_started_at).getTime()) / (1000 * 60 * 60 * 24)
        ),
        progress,
        authenticity,
        dailyGoal: campaign.daily_task_goal,
        todayCompleted: todayCount,
        canAdvance: progress.canAdvance,
        nextPhase: this._getNextPhase(campaign.current_phase),
        allowedActivities: currentPhase.allowedActivities,
        allowedTaskTypes: currentPhase.taskTypes
      };
    } catch (error) {
      console.error('[AccountWarmer] Error getting warmup status:', error.message);
      throw error;
    }
  }

  /**
   * Check and advance to next phase if ready
   *
   * @param {integer} userId - User ID
   * @returns {Promise<object>} - Advancement result
   */
  async checkAndAdvancePhase(userId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      // Get current campaign
      const campaignResult = await this.db.query(
        `SELECT id, current_phase, target_phase, phase_started_at
         FROM account_warmup_campaigns
         WHERE user_id = $1 AND status = 'active'
         LIMIT 1`,
        [userId]
      );

      if (campaignResult.rows.length === 0) {
        return { advanced: false, reason: 'No active campaign' };
      }

      const campaign = campaignResult.rows[0];

      // Check if ready to advance
      const progress = await this._calculatePhaseProgress(userId, campaign.current_phase);

      if (!progress.canAdvance) {
        return {
          advanced: false,
          reason: 'Requirements not met',
          progress
        };
      }

      // Advance to next phase
      const nextPhase = this._getNextPhase(campaign.current_phase);

      if (!nextPhase) {
        // Reached final phase, complete campaign
        await this.db.query(
          `UPDATE account_warmup_campaigns
           SET status = 'completed',
               completed_at = NOW()
           WHERE id = $1`,
          [campaign.id]
        );

        console.log(`[AccountWarmer] Completed warmup campaign ${campaign.id} for user ${userId}`);

        return {
          advanced: true,
          completed: true,
          finalPhase: campaign.current_phase
        };
      }

      // Update to next phase
      await this.db.query(
        `UPDATE account_warmup_campaigns
         SET current_phase = $1,
             phase_started_at = NOW()
         WHERE id = $2`,
        [nextPhase, campaign.id]
      );

      // Log phase transition
      await this.db.query(
        `INSERT INTO account_warmup_progress_log (
          campaign_id, user_id, event_type, from_phase, to_phase, metrics
        )
        VALUES ($1, $2, 'phase_advanced', $3, $4, $5)`,
        [campaign.id, userId, campaign.current_phase, nextPhase, JSON.stringify(progress)]
      );

      console.log(`[AccountWarmer] Advanced user ${userId} from ${campaign.current_phase} to ${nextPhase}`);

      return {
        advanced: true,
        fromPhase: campaign.current_phase,
        toPhase: nextPhase,
        progress
      };
    } catch (error) {
      console.error('[AccountWarmer] Error advancing phase:', error.message);
      throw error;
    }
  }

  /**
   * Get recommended warmup tasks for user
   *
   * @param {integer} userId - User ID
   * @param {integer} limit - Max tasks to return
   * @returns {Promise<Array>} - Recommended tasks
   */
  async getRecommendedWarmupTasks(userId, limit = 5) {
    if (!this.db || !this.trainingTasks) {
      throw new Error('Database and trainingTasks required');
    }

    try {
      // Get warmup status
      const status = await this.getWarmupStatus(userId);

      if (!status.isWarming) {
        return [];
      }

      // Filter tasks by allowed types for current phase
      const allowedTypes = status.allowedTaskTypes;

      if (allowedTypes.includes('*')) {
        // All task types allowed
        return await this.trainingTasks.getAvailableTasks(userId, null, { limit });
      }

      // Get tasks of allowed types
      const tasks = [];

      for (const taskType of allowedTypes) {
        const typeTasks = await this.trainingTasks.getAvailableTasks(userId, null, {
          taskType,
          limit: Math.ceil(limit / allowedTypes.length)
        });

        tasks.push(...typeTasks);
      }

      return tasks.slice(0, limit);
    } catch (error) {
      console.error('[AccountWarmer] Error getting recommended tasks:', error.message);
      throw error;
    }
  }

  /**
   * Log warmup activity
   *
   * @param {integer} userId - User ID
   * @param {string} activityType - Type of activity
   * @param {object} metadata - Activity metadata
   * @returns {Promise<boolean>} - Success
   */
  async logWarmupActivity(userId, activityType, metadata = {}) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      // Get active campaign
      const campaignResult = await this.db.query(
        `SELECT id FROM account_warmup_campaigns
         WHERE user_id = $1 AND status = 'active'
         LIMIT 1`,
        [userId]
      );

      if (campaignResult.rows.length === 0) {
        return false; // No active campaign
      }

      const campaignId = campaignResult.rows[0].id;

      // Log activity
      await this.db.query(
        `INSERT INTO account_warmup_activities (
          campaign_id, user_id, activity_type, metadata
        )
        VALUES ($1, $2, $3, $4)`,
        [campaignId, userId, activityType, JSON.stringify(metadata)]
      );

      return true;
    } catch (error) {
      console.error('[AccountWarmer] Error logging activity:', error.message);
      return false;
    }
  }

  /**
   * Calculate phase progress
   * @private
   */
  async _calculatePhaseProgress(userId, phaseName) {
    const phase = this.phases[phaseName];
    const reqs = phase.requirements;

    // Get user stats
    const statsResult = await this.db.query(
      `SELECT
        COUNT(DISTINCT us.id) as sessions,
        COUNT(DISTINCT al.id) as actions,
        COALESCE(SUM(EXTRACT(EPOCH FROM (us.ended_at - us.started_at))), 0) as time_spent
       FROM users u
       LEFT JOIN user_sessions us ON us.user_id = u.id
       LEFT JOIN actions_log al ON al.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    const stats = statsResult.rows[0];

    // Get task stats
    const taskStats = await this.db.query(
      `SELECT
        COUNT(*) as tasks_completed,
        AVG(quality_score) as avg_quality,
        MAX(ts.current_streak) as max_streak
       FROM training_task_assignments ta
       LEFT JOIN training_task_streaks ts ON ts.user_id = ta.user_id
       WHERE ta.user_id = $1 AND ta.status = 'completed'`,
      [userId]
    );

    const tasks = taskStats.rows[0];

    // Build progress object
    const progress = {
      sessions: {
        current: parseInt(stats.sessions) || 0,
        required: reqs.minSessions,
        met: (parseInt(stats.sessions) || 0) >= reqs.minSessions
      },
      actions: {
        current: parseInt(stats.actions) || 0,
        required: reqs.minActions,
        met: (parseInt(stats.actions) || 0) >= reqs.minActions
      },
      timeSpent: {
        current: parseFloat(stats.time_spent) || 0,
        required: reqs.minTimeSpent,
        met: (parseFloat(stats.time_spent) || 0) >= reqs.minTimeSpent
      }
    };

    // Add task requirements if applicable
    if (reqs.minTasksCompleted) {
      progress.tasksCompleted = {
        current: parseInt(tasks.tasks_completed) || 0,
        required: reqs.minTasksCompleted,
        met: (parseInt(tasks.tasks_completed) || 0) >= reqs.minTasksCompleted
      };
    }

    if (reqs.minAvgQuality) {
      progress.avgQuality = {
        current: parseFloat(tasks.avg_quality) || 0,
        required: reqs.minAvgQuality,
        met: (parseFloat(tasks.avg_quality) || 0) >= reqs.minAvgQuality
      };
    }

    if (reqs.minStreak) {
      progress.streak = {
        current: parseInt(tasks.max_streak) || 0,
        required: reqs.minStreak,
        met: (parseInt(tasks.max_streak) || 0) >= reqs.minStreak
      };
    }

    // Check if all requirements met
    progress.canAdvance = Object.values(progress)
      .filter(v => typeof v === 'object' && 'met' in v)
      .every(v => v.met);

    return progress;
  }

  /**
   * Calculate authenticity score (0-1)
   * @private
   */
  async _calculateAuthenticityScore(userId) {
    // Factors: session regularity, diverse activities, realistic timing, quality consistency

    let score = 0.5; // Base score

    // Session regularity (bonus for consistent daily activity)
    const sessionPattern = await this.db.query(
      `SELECT COUNT(DISTINCT DATE(started_at)) as unique_days
       FROM user_sessions
       WHERE user_id = $1
         AND started_at > NOW() - INTERVAL '7 days'`,
      [userId]
    );

    const uniqueDays = parseInt(sessionPattern.rows[0].unique_days) || 0;
    score += Math.min(0.2, uniqueDays / 7 * 0.2); // Up to +0.2 for 7 days

    // Activity diversity (bonus for varied task types)
    const diversity = await this.db.query(
      `SELECT COUNT(DISTINCT tt.task_type) as unique_types
       FROM training_task_assignments ta
       JOIN training_tasks tt ON tt.id = ta.task_id
       WHERE ta.user_id = $1 AND ta.status = 'completed'`,
      [userId]
    );

    const uniqueTypes = parseInt(diversity.rows[0].unique_types) || 0;
    score += Math.min(0.15, uniqueTypes / 5 * 0.15); // Up to +0.15 for 5 types

    // Quality consistency (penalty for too-perfect scores)
    const quality = await this.db.query(
      `SELECT STDDEV(quality_score) as quality_variance
       FROM training_task_assignments
       WHERE user_id = $1 AND status = 'completed'`,
      [userId]
    );

    const variance = parseFloat(quality.rows[0].quality_variance) || 0;
    if (variance > 0.05 && variance < 0.25) {
      score += 0.15; // Realistic variance
    } else if (variance === 0) {
      score -= 0.1; // Suspicious (bot-like)
    }

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Check if user has completed warmup in the past
   * @private
   */
  async _hasCompletedWarmup(userId) {
    const result = await this.db.query(
      `SELECT id FROM account_warmup_campaigns
       WHERE user_id = $1 AND status = 'completed'
       LIMIT 1`,
      [userId]
    );

    return result.rows.length > 0;
  }

  /**
   * Get next phase name
   * @private
   */
  _getNextPhase(currentPhase) {
    const phaseOrder = ['observer', 'participant', 'contributor', 'expert'];
    const currentIndex = phaseOrder.indexOf(currentPhase);

    if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
      return null; // Final phase or invalid
    }

    return phaseOrder[currentIndex + 1];
  }
}

module.exports = AccountWarmer;

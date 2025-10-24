/**
 * Training Tasks Framework
 *
 * Gamified data collection system where users perform tasks to earn XP and rewards:
 * - Voting on model outputs (A/B testing feedback)
 * - Chat conversations (generate training data)
 * - Content labeling and rating
 * - Meme generation and creative tasks
 * - Quality assurance and verification
 *
 * Benefits:
 * - Users: Earn XP, skills, badges, and potential cash rewards
 * - System: Collect high-quality training data
 * - Business: Sell curated datasets
 *
 * Anti-cheat measures:
 * - Quality scoring (consensus, time spent, patterns)
 * - Cooldowns and rate limits
 * - Device trust requirements
 * - Random verification tasks
 */

class TrainingTasksManager {
  constructor(options = {}) {
    this.db = options.db;
    this.skillsEngine = options.skillsEngine;
    this.actionsEngine = options.actionsEngine;

    // Task configuration
    this.taskTypes = {
      // Voting tasks (A/B testing, preference rating)
      vote_model_output: {
        name: 'Vote on Model Output',
        description: 'Compare two AI responses and pick the better one',
        baseXp: 5,
        minTrustLevel: 'unverified',
        cooldown: 10, // seconds
        skill: 'judgement',
        verificationRate: 0.1 // 10% get verification tasks
      },

      rate_response: {
        name: 'Rate Response Quality',
        description: 'Rate an AI response on multiple dimensions',
        baseXp: 10,
        minTrustLevel: 'verified',
        cooldown: 15,
        skill: 'judgement'
      },

      // Chat tasks (conversation generation)
      chat_conversation: {
        name: 'Chat with AI',
        description: 'Have a conversation to generate training data',
        baseXp: 20,
        minTrustLevel: 'verified',
        cooldown: 60,
        skill: 'communication',
        minLength: 100 // characters
      },

      // Content generation
      generate_meme: {
        name: 'Generate Meme',
        description: 'Create a meme based on prompt',
        baseXp: 15,
        minTrustLevel: 'verified',
        cooldown: 30,
        skill: 'creativity'
      },

      write_prompt: {
        name: 'Write Creative Prompt',
        description: 'Write a creative prompt for AI testing',
        baseXp: 25,
        minTrustLevel: 'verified',
        cooldown: 45,
        skill: 'creativity'
      },

      // Labeling tasks
      label_content: {
        name: 'Label Content',
        description: 'Categorize or tag content',
        baseXp: 8,
        minTrustLevel: 'verified',
        cooldown: 5,
        skill: 'organization'
      },

      verify_label: {
        name: 'Verify Label',
        description: 'Check if existing label is correct',
        baseXp: 5,
        minTrustLevel: 'verified',
        cooldown: 5,
        skill: 'judgement'
      },

      // Quality assurance
      flag_inappropriate: {
        name: 'Flag Inappropriate Content',
        description: 'Report content that violates guidelines',
        baseXp: 10,
        minTrustLevel: 'verified',
        cooldown: 10,
        skill: 'moderation'
      },

      review_submission: {
        name: 'Review Submission',
        description: 'Review another user\'s task submission',
        baseXp: 15,
        minTrustLevel: 'trusted',
        cooldown: 20,
        skill: 'judgement'
      }
    };

    console.log(`[TrainingTasks] Initialized with ${Object.keys(this.taskTypes).length} task types`);
  }

  /**
   * Get available tasks for user
   *
   * @param {integer} userId - User ID
   * @param {string} deviceId - Device ID
   * @param {object} filters - Task filters
   * @returns {Promise<Array>} - Available tasks
   */
  async getAvailableTasks(userId, deviceId, filters = {}) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    const {
      taskType = null,
      skill = null,
      limit = 10
    } = filters;

    try {
      // Get user's device trust level
      const deviceResult = await this.db.query(
        `SELECT trust_level FROM user_devices WHERE id = $1`,
        [deviceId]
      );

      if (deviceResult.rows.length === 0) {
        throw new Error('Device not found');
      }

      const deviceTrust = deviceResult.rows[0].trust_level;

      // Get user's recent task completions (for cooldowns)
      const recentTasks = await this._getRecentTaskCompletions(userId, deviceId);

      // Build query conditions
      let conditions = ['tt.status = $1'];
      let params = ['available'];
      let paramIndex = 2;

      if (taskType) {
        conditions.push(`tt.task_type = $${paramIndex}`);
        params.push(taskType);
        paramIndex++;
      }

      if (skill) {
        conditions.push(`tt.skill = $${paramIndex}`);
        params.push(skill);
        paramIndex++;
      }

      // Get available tasks from pool
      const result = await this.db.query(
        `SELECT
          tt.id, tt.task_type, tt.task_data, tt.priority,
          tt.estimated_time_seconds, tt.base_xp_reward,
          tt.skill, tt.created_at
         FROM training_tasks tt
         WHERE ${conditions.join(' AND ')}
         ORDER BY tt.priority DESC, tt.created_at ASC
         LIMIT $${paramIndex}`,
        [...params, limit * 3] // Get extra to filter
      );

      // Filter by trust level and cooldowns
      const availableTasks = [];

      for (const row of result.rows) {
        const taskConfig = this.taskTypes[row.task_type];

        if (!taskConfig) continue;

        // Check trust level
        if (!this._checkTrustLevel(deviceTrust, taskConfig.minTrustLevel)) {
          continue;
        }

        // Check cooldown
        if (this._isOnCooldown(row.task_type, recentTasks, taskConfig.cooldown)) {
          continue;
        }

        availableTasks.push({
          id: row.id,
          taskType: row.task_type,
          taskName: taskConfig.name,
          description: taskConfig.description,
          taskData: row.task_data,
          priority: row.priority,
          estimatedTime: row.estimated_time_seconds,
          xpReward: row.base_xp_reward || taskConfig.baseXp,
          skill: row.skill,
          createdAt: row.created_at
        });

        if (availableTasks.length >= limit) break;
      }

      return availableTasks;
    } catch (error) {
      console.error('[TrainingTasks] Error getting available tasks:', error.message);
      throw error;
    }
  }

  /**
   * Claim a task (assign to user)
   *
   * @param {integer} taskId - Task ID
   * @param {integer} userId - User ID
   * @param {string} deviceId - Device ID
   * @returns {Promise<object>} - Claimed task info
   */
  async claimTask(taskId, userId, deviceId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      // Start transaction
      await this.db.query('BEGIN');

      // Check if task is still available
      const taskResult = await this.db.query(
        `SELECT id, task_type, task_data, base_xp_reward, skill, estimated_time_seconds
         FROM training_tasks
         WHERE id = $1 AND status = 'available'
         FOR UPDATE`,
        [taskId]
      );

      if (taskResult.rows.length === 0) {
        await this.db.query('ROLLBACK');
        throw new Error('Task not available or already claimed');
      }

      const task = taskResult.rows[0];

      // Mark as claimed
      await this.db.query(
        `UPDATE training_tasks
         SET status = 'claimed',
             assigned_user_id = $1,
             assigned_device_id = $2,
             claimed_at = NOW()
         WHERE id = $3`,
        [userId, deviceId, taskId]
      );

      // Create task assignment record
      await this.db.query(
        `INSERT INTO training_task_assignments (
          task_id, user_id, device_id, status
        )
        VALUES ($1, $2, $3, 'in_progress')`,
        [taskId, userId, deviceId]
      );

      await this.db.query('COMMIT');

      console.log(`[TrainingTasks] User ${userId} claimed task ${taskId}`);

      return {
        taskId: task.id,
        taskType: task.task_type,
        taskData: task.task_data,
        xpReward: task.base_xp_reward,
        skill: task.skill,
        estimatedTime: task.estimated_time_seconds
      };
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('[TrainingTasks] Error claiming task:', error.message);
      throw error;
    }
  }

  /**
   * Submit task completion
   *
   * @param {integer} taskId - Task ID
   * @param {integer} userId - User ID
   * @param {string} deviceId - Device ID
   * @param {object} submission - Task submission data
   * @returns {Promise<object>} - Completion result with rewards
   */
  async submitTask(taskId, userId, deviceId, submission) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      // Get task assignment
      const assignmentResult = await this.db.query(
        `SELECT ta.id, ta.task_id, ta.started_at,
                tt.task_type, tt.base_xp_reward, tt.skill, tt.task_data
         FROM training_task_assignments ta
         JOIN training_tasks tt ON tt.id = ta.task_id
         WHERE ta.task_id = $1
           AND ta.user_id = $2
           AND ta.device_id = $3
           AND ta.status = 'in_progress'`,
        [taskId, userId, deviceId]
      );

      if (assignmentResult.rows.length === 0) {
        throw new Error('Task assignment not found or already completed');
      }

      const assignment = assignmentResult.rows[0];
      const taskConfig = this.taskTypes[assignment.task_type];

      if (!taskConfig) {
        throw new Error(`Unknown task type: ${assignment.task_type}`);
      }

      // Calculate time spent
      const timeSpent = Math.floor(
        (Date.now() - new Date(assignment.started_at).getTime()) / 1000
      );

      // Validate submission
      const validation = await this._validateSubmission(
        assignment.task_type,
        submission,
        taskConfig,
        timeSpent
      );

      if (!validation.valid) {
        throw new Error(`Invalid submission: ${validation.reason}`);
      }

      // Calculate quality score
      const qualityScore = await this._calculateQualityScore(
        assignment.task_type,
        submission,
        taskConfig,
        timeSpent
      );

      // Calculate final XP (base * quality multiplier)
      const baseXp = assignment.base_xp_reward || taskConfig.baseXp;
      const xpMultiplier = 0.5 + (qualityScore * 0.5); // 0.5x to 1.0x based on quality
      const finalXp = Math.floor(baseXp * xpMultiplier);

      // Start transaction
      await this.db.query('BEGIN');

      // Mark task as completed
      await this.db.query(
        `UPDATE training_tasks
         SET status = 'completed',
             completed_at = NOW()
         WHERE id = $1`,
        [taskId]
      );

      // Update assignment
      await this.db.query(
        `UPDATE training_task_assignments
         SET status = 'completed',
             completed_at = NOW(),
             submission_data = $1,
             quality_score = $2,
             time_spent_seconds = $3,
             xp_earned = $4
         WHERE id = $5`,
        [JSON.stringify(submission), qualityScore, timeSpent, finalXp, assignment.id]
      );

      // Award XP via skills engine
      if (this.skillsEngine) {
        await this.skillsEngine.awardXP(
          userId,
          assignment.skill || 'general',
          finalXp,
          `training_task_${assignment.task_type}`,
          'training_tasks'
        );
      }

      // Execute action (for additional rewards via actions engine)
      if (this.actionsEngine) {
        await this.actionsEngine.executeAction(
          userId,
          `complete_training_task_${assignment.task_type}`,
          { taskId, qualityScore, xpEarned: finalXp },
          null, // domain
          null, // session
          null  // req
        );
      }

      await this.db.query('COMMIT');

      console.log(`[TrainingTasks] User ${userId} completed task ${taskId} - ${finalXp} XP`);

      return {
        success: true,
        taskId,
        taskType: assignment.task_type,
        qualityScore,
        timeSpent,
        xpEarned: finalXp,
        skill: assignment.skill
      };
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error('[TrainingTasks] Error submitting task:', error.message);
      throw error;
    }
  }

  /**
   * Create new task in pool
   *
   * @param {object} taskSpec - Task specification
   * @returns {Promise<integer>} - Task ID
   */
  async createTask(taskSpec) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    const {
      taskType,
      taskData,
      priority = 1,
      baseXpReward = null,
      skill = null,
      estimatedTime = null,
      expiresAt = null
    } = taskSpec;

    // Validate task type
    const taskConfig = this.taskTypes[taskType];
    if (!taskConfig) {
      throw new Error(`Unknown task type: ${taskType}`);
    }

    try {
      const result = await this.db.query(
        `INSERT INTO training_tasks (
          task_type, task_data, priority, base_xp_reward,
          skill, estimated_time_seconds, expires_at, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'available')
        RETURNING id`,
        [
          taskType,
          JSON.stringify(taskData),
          priority,
          baseXpReward || taskConfig.baseXp,
          skill || taskConfig.skill,
          estimatedTime || taskConfig.estimatedTime || 60,
          expiresAt
        ]
      );

      const taskId = result.rows[0].id;

      console.log(`[TrainingTasks] Created task ${taskId} of type ${taskType}`);

      return taskId;
    } catch (error) {
      console.error('[TrainingTasks] Error creating task:', error.message);
      throw error;
    }
  }

  /**
   * Get user's task statistics
   *
   * @param {integer} userId - User ID
   * @returns {Promise<object>} - Task stats
   */
  async getUserTaskStats(userId) {
    if (!this.db) {
      throw new Error('Database connection required');
    }

    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) as total_completed,
          SUM(xp_earned) as total_xp,
          AVG(quality_score) as avg_quality,
          SUM(time_spent_seconds) as total_time_seconds,
          COUNT(DISTINCT task_id) as unique_tasks
         FROM training_task_assignments
         WHERE user_id = $1 AND status = 'completed'`,
        [userId]
      );

      const byType = await this.db.query(
        `SELECT
          tt.task_type,
          COUNT(*) as completed,
          AVG(ta.quality_score) as avg_quality
         FROM training_task_assignments ta
         JOIN training_tasks tt ON tt.id = ta.task_id
         WHERE ta.user_id = $1 AND ta.status = 'completed'
         GROUP BY tt.task_type`,
        [userId]
      );

      return {
        totalCompleted: parseInt(result.rows[0].total_completed) || 0,
        totalXpEarned: parseInt(result.rows[0].total_xp) || 0,
        avgQuality: parseFloat(result.rows[0].avg_quality) || 0,
        totalTimeSeconds: parseInt(result.rows[0].total_time_seconds) || 0,
        uniqueTasks: parseInt(result.rows[0].unique_tasks) || 0,
        byType: byType.rows.map(row => ({
          taskType: row.task_type,
          completed: parseInt(row.completed),
          avgQuality: parseFloat(row.avg_quality)
        }))
      };
    } catch (error) {
      console.error('[TrainingTasks] Error getting user stats:', error.message);
      throw error;
    }
  }

  /**
   * Get recent task completions (for cooldown checks)
   * @private
   */
  async _getRecentTaskCompletions(userId, deviceId) {
    const result = await this.db.query(
      `SELECT tt.task_type, ta.completed_at
       FROM training_task_assignments ta
       JOIN training_tasks tt ON tt.id = ta.task_id
       WHERE ta.user_id = $1
         AND ta.device_id = $2
         AND ta.status = 'completed'
         AND ta.completed_at > NOW() - INTERVAL '5 minutes'
       ORDER BY ta.completed_at DESC`,
      [userId, deviceId]
    );

    return result.rows;
  }

  /**
   * Check if task type is on cooldown
   * @private
   */
  _isOnCooldown(taskType, recentTasks, cooldownSeconds) {
    const recent = recentTasks.find(t => t.task_type === taskType);
    if (!recent) return false;

    const timeSinceCompletion = (Date.now() - new Date(recent.completed_at).getTime()) / 1000;
    return timeSinceCompletion < cooldownSeconds;
  }

  /**
   * Check if device trust level meets requirement
   * @private
   */
  _checkTrustLevel(deviceTrust, requiredTrust) {
    const levels = { unverified: 0, verified: 1, trusted: 2 };
    return (levels[deviceTrust] || 0) >= (levels[requiredTrust] || 0);
  }

  /**
   * Validate task submission
   * @private
   */
  async _validateSubmission(taskType, submission, taskConfig, timeSpent) {
    // Basic validation
    if (!submission || typeof submission !== 'object') {
      return { valid: false, reason: 'Invalid submission format' };
    }

    // Check minimum time (anti-spam)
    if (timeSpent < 3) {
      return { valid: false, reason: 'Completed too quickly (likely spam)' };
    }

    // Task-specific validation
    switch (taskType) {
      case 'chat_conversation':
        if (!submission.message || submission.message.length < taskConfig.minLength) {
          return { valid: false, reason: 'Message too short' };
        }
        break;

      case 'vote_model_output':
        if (!submission.choice || !['A', 'B'].includes(submission.choice)) {
          return { valid: false, reason: 'Invalid vote choice' };
        }
        break;

      case 'rate_response':
        if (!submission.rating || submission.rating < 1 || submission.rating > 5) {
          return { valid: false, reason: 'Invalid rating' };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Calculate quality score (0-1)
   * @private
   */
  async _calculateQualityScore(taskType, submission, taskConfig, timeSpent) {
    let score = 0.7; // Base score

    // Time spent factor (too fast = suspicious, reasonable time = bonus)
    const expectedTime = taskConfig.estimatedTime || 30;
    if (timeSpent < expectedTime * 0.3) {
      score -= 0.2; // Too fast
    } else if (timeSpent >= expectedTime * 0.5 && timeSpent <= expectedTime * 2) {
      score += 0.1; // Good timing
    }

    // Length/effort factor
    if (submission.message) {
      const length = submission.message.length;
      if (length > 200) score += 0.1;
      if (length > 500) score += 0.1;
    }

    // Detailed feedback bonus
    if (submission.feedback && submission.feedback.length > 50) {
      score += 0.1;
    }

    return Math.min(1.0, Math.max(0.0, score));
  }
}

module.exports = TrainingTasksManager;

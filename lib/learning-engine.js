/**
 * Learning Engine - CryptoZombies-Style Gamified Learning Platform
 *
 * Powers the progressive learning experience across 12 branded domains.
 * Handles XP, levels, streaks, achievements, and lesson progression.
 *
 * Features:
 * - Progressive lesson unlocking with prerequisites
 * - XP and level system (sqrt formula)
 * - Daily streak tracking
 * - Achievement system (badges, trophies)
 * - Integration with domain challenges
 * - Leaderboards (per-path and global)
 */

class LearningEngine {
  constructor(db) {
    this.db = db;
    console.log('[LearningEngine] Initialized');
  }

  /**
   * Enroll user in a learning path
   *
   * @param {string} userId - User ID
   * @param {string} pathSlug - Learning path slug (e.g., 'soulfra-mastery')
   * @returns {Promise<Object>} Enrollment record
   */
  async enrollUser(userId, pathSlug) {
    try {
      // Get learning path
      const pathResult = await this.db.query(
        'SELECT * FROM learning_paths WHERE path_slug = $1 AND status = $2',
        [pathSlug, 'active']
      );

      if (pathResult.rows.length === 0) {
        throw new Error(`Learning path not found: ${pathSlug}`);
      }

      const path = pathResult.rows[0];

      // Check if already enrolled
      const existingResult = await this.db.query(
        'SELECT * FROM user_progress WHERE user_id = $1 AND path_id = $2',
        [userId, path.path_id]
      );

      if (existingResult.rows.length > 0) {
        console.log(`[LearningEngine] User ${userId} already enrolled in ${pathSlug}`);
        return existingResult.rows[0];
      }

      // Create enrollment
      const enrollResult = await this.db.query(
        `INSERT INTO user_progress (
          user_id, path_id, total_xp_earned, current_streak_days,
          longest_streak_days, completion_percentage, started_at
        ) VALUES ($1, $2, 0, 0, 0, 0.00, NOW())
        RETURNING *`,
        [userId, path.path_id]
      );

      console.log(`[LearningEngine] User ${userId} enrolled in ${pathSlug}`);

      // Trigger welcome drip campaign
      await this.triggerDripCampaign(userId, path.path_id, 'user_enrolled');

      return enrollResult.rows[0];
    } catch (error) {
      console.error('[LearningEngine] Enrollment error:', error);
      throw error;
    }
  }

  /**
   * Get user's current progress in a learning path
   *
   * @param {string} userId - User ID
   * @param {string} pathSlug - Learning path slug
   * @returns {Promise<Object>} Progress data with level, XP, streak
   */
  async getUserProgress(userId, pathSlug) {
    try {
      const result = await this.db.query(
        `SELECT
          up.*,
          lp.path_name,
          lp.path_slug,
          lp.total_lessons,
          lp.icon_emoji,
          dp.domain_name,
          dp.primary_color,
          calculate_user_level(up.total_xp_earned) AS current_level,
          (SELECT COUNT(*) FROM lesson_completions lc
           JOIN lessons l ON lc.lesson_id = l.lesson_id
           WHERE lc.user_id = up.user_id AND l.path_id = up.path_id) AS completed_lessons
        FROM user_progress up
        JOIN learning_paths lp ON up.path_id = lp.path_id
        JOIN domain_portfolio dp ON lp.domain_id = dp.domain_id
        WHERE up.user_id = $1 AND lp.path_slug = $2`,
        [userId, pathSlug]
      );

      if (result.rows.length === 0) {
        throw new Error(`User not enrolled in path: ${pathSlug}`);
      }

      return result.rows[0];
    } catch (error) {
      console.error('[LearningEngine] Get progress error:', error);
      throw error;
    }
  }

  /**
   * Get next available lesson for user
   *
   * @param {string} userId - User ID
   * @param {string} pathSlug - Learning path slug
   * @returns {Promise<Object>} Next lesson or null if path complete
   */
  async getNextLesson(userId, pathSlug) {
    try {
      const result = await this.db.query(
        `WITH user_path AS (
          SELECT up.progress_id, lp.path_id
          FROM user_progress up
          JOIN learning_paths lp ON up.path_id = lp.path_id
          WHERE up.user_id = $1 AND lp.path_slug = $2
        ),
        completed_lessons AS (
          SELECT l.lesson_id
          FROM lesson_completions lc
          JOIN lessons l ON lc.lesson_id = l.lesson_id
          WHERE lc.user_id = $1 AND l.path_id = (SELECT path_id FROM user_path)
        )
        SELECT l.*, dc.challenge_title, dc.challenge_prompt
        FROM lessons l
        LEFT JOIN domain_challenges dc ON l.challenge_id = dc.challenge_id
        WHERE l.path_id = (SELECT path_id FROM user_path)
          AND l.active = true
          AND l.lesson_id NOT IN (SELECT lesson_id FROM completed_lessons)
          AND (
            l.requires_lesson_id IS NULL OR
            l.requires_lesson_id IN (SELECT lesson_id FROM completed_lessons)
          )
        ORDER BY l.lesson_number
        LIMIT 1`,
        [userId, pathSlug]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('[LearningEngine] Get next lesson error:', error);
      throw error;
    }
  }

  /**
   * Complete a lesson and award XP
   *
   * @param {string} userId - User ID
   * @param {string} lessonId - Lesson UUID
   * @param {Object} completionData - Additional data (score, time_spent, etc.)
   * @returns {Promise<Object>} Completion record with XP awarded
   */
  async completeLesson(userId, lessonId, completionData = {}) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Get lesson details
      const lessonResult = await client.query(
        `SELECT l.*, lp.path_slug
         FROM lessons l
         JOIN learning_paths lp ON l.path_id = lp.path_id
         WHERE l.lesson_id = $1`,
        [lessonId]
      );

      if (lessonResult.rows.length === 0) {
        throw new Error(`Lesson not found: ${lessonId}`);
      }

      const lesson = lessonResult.rows[0];

      // Check if already completed
      const existingResult = await client.query(
        'SELECT * FROM lesson_completions WHERE user_id = $1 AND lesson_id = $2',
        [userId, lessonId]
      );

      if (existingResult.rows.length > 0) {
        console.log(`[LearningEngine] Lesson ${lessonId} already completed by ${userId}`);
        await client.query('COMMIT');
        return existingResult.rows[0];
      }

      // Check prerequisite
      if (lesson.requires_lesson_id) {
        const prereqResult = await client.query(
          'SELECT * FROM lesson_completions WHERE user_id = $1 AND lesson_id = $2',
          [userId, lesson.requires_lesson_id]
        );

        if (prereqResult.rows.length === 0) {
          throw new Error('Prerequisite lesson not completed');
        }
      }

      // Get user's progress_id for this path
      const progressResult = await client.query(
        `SELECT progress_id FROM user_progress
         WHERE user_id = $1 AND path_id = $2`,
        [userId, lesson.path_id]
      );

      if (progressResult.rows.length === 0) {
        throw new Error('User not enrolled in this learning path');
      }

      const progress_id = progressResult.rows[0].progress_id;

      // Record completion
      const completionResult = await client.query(
        `INSERT INTO lesson_completions (
          user_id, lesson_id, progress_id, time_spent_seconds,
          perfect_score, attempts, xp_earned, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *`,
        [
          userId,
          lessonId,
          progress_id,
          completionData.timeSpentSeconds || 1,
          completionData.perfect || false,
          completionData.attempts || 1,
          lesson.xp_reward
        ]
      );

      console.log(`[LearningEngine] Lesson ${lessonId} completed by ${userId} - ${lesson.xp_reward} XP awarded`);

      // Update streak
      await this.updateUserStreak(userId, lesson.path_id, client);

      // Commit the transaction before checking achievements
      // (achievements shouldn't block lesson completion)
      await client.query('COMMIT');

      // Check for achievements (after commit, so errors don't abort the transaction)
      try {
        await this.checkAchievements(userId, lesson.path_id);
      } catch (error) {
        console.error('[LearningEngine] Achievement check failed, but lesson is already saved:', error.message);
      }

      // Trigger drip campaign for lesson completion
      try {
        await this.triggerDripCampaign(userId, lesson.path_id, 'lesson_completed', {
          lesson_number: lesson.lesson_number,
          lesson_title: lesson.lesson_title
        });
      } catch (error) {
        console.error('[LearningEngine] Drip campaign failed, but lesson is already saved:', error.message);
      }

      // Get updated progress
      const progress = await this.getUserProgress(userId, lesson.path_slug);

      return {
        completion: completionResult.rows[0],
        xp_awarded: lesson.xp_reward,
        progress
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[LearningEngine] Complete lesson error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update user's daily streak
   *
   * @param {string} userId - User ID
   * @param {string} pathId - Learning path UUID
   * @param {Object} client - Database client (transaction)
   */
  async updateUserStreak(userId, pathId, client = null) {
    const db = client || this.db;

    try {
      const result = await db.query(
        `SELECT
          user_id,
          path_id,
          last_activity_date,
          current_streak_days,
          longest_streak_days
        FROM user_progress
        WHERE user_id = $1 AND path_id = $2`,
        [userId, pathId]
      );

      if (result.rows.length === 0) return;

      const progress = result.rows[0];
      const lastCompleted = progress.last_activity_date;
      const now = new Date();

      let newStreak = progress.current_streak_days;
      let longestStreak = progress.longest_streak_days;

      if (!lastCompleted) {
        // First lesson ever
        newStreak = 1;
      } else {
        const daysSinceLastLesson = Math.floor((now - lastCompleted) / (1000 * 60 * 60 * 24));

        if (daysSinceLastLesson === 0) {
          // Same day - maintain streak
          // newStreak stays the same
        } else if (daysSinceLastLesson === 1) {
          // Next day - increment streak
          newStreak += 1;
        } else {
          // Streak broken - reset to 1
          newStreak = 1;
        }
      }

      // Update longest streak if current exceeds it
      if (newStreak > longestStreak) {
        longestStreak = newStreak;
      }

      await db.query(
        `UPDATE user_progress
         SET current_streak_days = $1,
             longest_streak_days = $2,
             last_activity_date = CURRENT_DATE
         WHERE user_id = $3 AND path_id = $4`,
        [newStreak, longestStreak, userId, pathId]
      );

      console.log(`[LearningEngine] Streak updated for ${userId}: ${newStreak} days`);

      // Check for streak achievements
      if (newStreak === 3 || newStreak === 7 || newStreak === 30 || newStreak === 100) {
        await this.unlockAchievement(userId, `streak_${newStreak}`, db);
      }
    } catch (error) {
      console.error('[LearningEngine] Update streak error:', error);
      throw error;
    }
  }

  /**
   * Check and unlock achievements based on user progress
   *
   * @param {string} userId - User ID
   * @param {string} pathId - Learning path UUID
   * @param {Object} client - Database client (transaction)
   */
  async checkAchievements(userId, pathId, client = null) {
    const db = client || this.db;

    try {
      // Get user progress
      const progressResult = await db.query(
        `SELECT
          up.*,
          calculate_user_level(up.total_xp_earned) AS current_level,
          (SELECT COUNT(*) FROM lesson_completions lc
           JOIN lessons l ON lc.lesson_id = l.lesson_id
           WHERE lc.user_id = up.user_id AND l.path_id = up.path_id) AS completed_lessons,
          lp.total_lessons
        FROM user_progress up
        JOIN learning_paths lp ON up.path_id = lp.path_id
        WHERE up.user_id = $1 AND up.path_id = $2`,
        [userId, pathId]
      );

      if (progressResult.rows.length === 0) return;

      const progress = progressResult.rows[0];
      const level = progress.current_level;
      const completedLessons = progress.completed_lessons;
      const totalLessons = progress.total_lessons;
      const completionPct = (completedLessons / totalLessons) * 100;

      // Level-based achievements
      if (level === 1) await this.unlockAchievement(userId, 'first_level', db);
      if (level === 5) await this.unlockAchievement(userId, 'level_5', db);
      if (level === 10) await this.unlockAchievement(userId, 'level_10', db);
      if (level === 25) await this.unlockAchievement(userId, 'level_25', db);
      if (level === 50) await this.unlockAchievement(userId, 'level_50', db);

      // Lesson completion achievements
      if (completedLessons === 1) await this.unlockAchievement(userId, 'first_lesson', db);
      if (completedLessons === 10) await this.unlockAchievement(userId, 'ten_lessons', db);
      if (completionPct >= 50) await this.unlockAchievement(userId, 'halfway_there', db);
      if (completionPct >= 100) await this.unlockAchievement(userId, 'path_complete', db);

      // Check for speed achievements (lesson completed in < X seconds)
      const recentCompletion = await db.query(
        `SELECT time_spent_seconds
         FROM lesson_completions
         WHERE user_id = $1
         ORDER BY completed_at DESC
         LIMIT 1`,
        [userId]
      );

      if (recentCompletion.rows.length > 0) {
        const timeSpent = recentCompletion.rows[0].time_spent_seconds;
        if (timeSpent && timeSpent <= 300) { // 5 minutes = 300 seconds
          await this.unlockAchievement(userId, 'speed_demon', db);
        }
      }

      console.log(`[LearningEngine] Achievements checked for ${userId}`);
    } catch (error) {
      console.error('[LearningEngine] Check achievements error:', error);
      throw error;
    }
  }

  /**
   * Unlock an achievement for a user
   *
   * @param {string} userId - User ID
   * @param {string} achievementSlug - Achievement slug
   * @param {Object} client - Database client (transaction)
   */
  async unlockAchievement(userId, achievementSlug, client = null) {
    const db = client || this.db;

    try {
      // Get achievement
      const achResult = await db.query(
        'SELECT * FROM achievements WHERE achievement_slug = $1',
        [achievementSlug]
      );

      if (achResult.rows.length === 0) {
        console.warn(`[LearningEngine] Achievement not found: ${achievementSlug}`);
        return;
      }

      const achievement = achResult.rows[0];

      // Check if already unlocked
      const existingResult = await db.query(
        'SELECT * FROM user_achievements WHERE user_id = $1 AND achievement_id = $2',
        [userId, achievement.achievement_id]
      );

      if (existingResult.rows.length > 0) {
        console.log(`[LearningEngine] Achievement ${achievementSlug} already unlocked for ${userId}`);
        return;
      }

      // Unlock achievement
      await db.query(
        'INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES ($1, $2, NOW())',
        [userId, achievement.achievement_id]
      );

      console.log(`[LearningEngine] 🏆 Achievement unlocked: ${achievement.achievement_name} for ${userId}`);

      // Trigger celebration drip campaign
      await this.triggerDripCampaign(userId, null, 'achievement_unlocked', {
        achievement_name: achievement.achievement_name,
        achievement_description: achievement.achievement_description,
        badge_icon: achievement.badge_icon
      });
    } catch (error) {
      console.error('[LearningEngine] Unlock achievement error:', error);
      // Don't throw - achievements shouldn't block lesson completion
    }
  }

  /**
   * Get user's achievements
   *
   * @param {string} userId - User ID
   * @returns {Promise<Array>} List of achievements
   */
  async getUserAchievements(userId) {
    try {
      const result = await this.db.query(
        `SELECT
          a.*,
          ua.unlocked_at,
          ua.notified
        FROM user_achievements ua
        JOIN achievements a ON ua.achievement_id = a.achievement_id
        WHERE ua.user_id = $1
        ORDER BY ua.unlocked_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      console.error('[LearningEngine] Get achievements error:', error);
      throw error;
    }
  }

  /**
   * Get leaderboard for a learning path
   *
   * @param {string} pathSlug - Learning path slug
   * @param {number} limit - Number of users to return
   * @returns {Promise<Array>} Ranked users
   */
  async getLeaderboard(pathSlug, limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT *
         FROM learning_leaderboard
         WHERE path_slug = $1
         ORDER BY rank
         LIMIT $2`,
        [pathSlug, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('[LearningEngine] Get leaderboard error:', error);
      throw error;
    }
  }

  /**
   * Get global leaderboard across all paths
   *
   * @param {number} limit - Number of users to return
   * @returns {Promise<Array>} Ranked users
   */
  async getGlobalLeaderboard(limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT
          user_id,
          SUM(total_xp_earned) AS total_xp,
          MAX(calculate_user_level(total_xp_earned)) AS max_level,
          COUNT(*) AS paths_enrolled,
          MAX(current_streak_days) AS best_streak
        FROM user_progress
        GROUP BY user_id
        ORDER BY total_xp DESC
        LIMIT $1`,
        [limit]
      );

      // Add rank
      const leaderboard = result.rows.map((row, index) => ({
        ...row,
        rank: index + 1
      }));

      return leaderboard;
    } catch (error) {
      console.error('[LearningEngine] Get global leaderboard error:', error);
      throw error;
    }
  }

  /**
   * Attempt a mini-game (daily Wordle-style challenge)
   *
   * @param {string} userId - User ID
   * @param {string} gameId - Mini-game UUID
   * @param {Object} attemptData - User's attempt (answer, guesses, etc.)
   * @returns {Promise<Object>} Attempt result with XP if successful
   */
  async attemptMiniGame(userId, gameId, attemptData) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Get game
      const gameResult = await client.query(
        'SELECT * FROM mini_games WHERE game_id = $1 AND active = true',
        [gameId]
      );

      if (gameResult.rows.length === 0) {
        throw new Error(`Mini-game not found: ${gameId}`);
      }

      const game = gameResult.rows[0];

      // Check if already attempted today
      const existingResult = await client.query(
        `SELECT * FROM mini_game_attempts
         WHERE user_id = $1 AND game_id = $2 AND DATE(attempted_at) = CURRENT_DATE`,
        [userId, gameId]
      );

      if (existingResult.rows.length > 0) {
        throw new Error('You have already attempted this mini-game today');
      }

      // Validate attempt (game-specific logic)
      const success = this.validateMiniGameAttempt(game.game_type, game.game_data, attemptData);

      // Record attempt
      const attemptResult = await client.query(
        `INSERT INTO mini_game_attempts (
          user_id, game_id, attempted_at, success, attempt_data
        ) VALUES ($1, $2, NOW(), $3, $4)
        RETURNING *`,
        [userId, gameId, success, JSON.stringify(attemptData)]
      );

      let xpAwarded = 0;

      if (success) {
        // Award XP to all enrolled paths
        const pathsResult = await client.query(
          'SELECT path_id FROM user_progress WHERE user_id = $1',
          [userId]
        );

        for (const row of pathsResult.rows) {
          await client.query(
            'UPDATE user_progress SET total_xp_earned = total_xp_earned + $1 WHERE user_id = $2 AND path_id = $3',
            [game.xp_reward, userId, row.path_id]
          );
        }

        xpAwarded = game.xp_reward;

        console.log(`[LearningEngine] Mini-game ${gameId} completed by ${userId} - ${xpAwarded} XP awarded`);
      }

      await client.query('COMMIT');

      return {
        attempt: attemptResult.rows[0],
        success,
        xp_awarded: xpAwarded
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[LearningEngine] Mini-game attempt error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validate mini-game attempt (game-specific logic)
   *
   * @param {string} gameType - Game type (codeordle, api_battle, etc.)
   * @param {Object} gameData - Game configuration
   * @param {Object} attemptData - User's attempt
   * @returns {boolean} Success or failure
   */
  validateMiniGameAttempt(gameType, gameData, attemptData) {
    switch (gameType) {
      case 'codeordle':
        // Check if user guessed the code word
        return attemptData.guess?.toLowerCase() === gameData.solution?.toLowerCase();

      case 'api_battle':
        // Check if user identified the correct API provider
        return attemptData.selectedProvider === gameData.correctProvider;

      case 'pattern_match':
        // Check if user matched the pattern
        return attemptData.userPattern === gameData.targetPattern;

      case 'data_cleaner':
        // Check if user correctly normalized the messy data
        // attemptData.cleanedRecords should match gameData.cleaned
        if (!attemptData.cleanedRecords || !Array.isArray(attemptData.cleanedRecords)) {
          return false;
        }
        // Allow 80% accuracy (4 out of 5 correct)
        const correctCount = attemptData.cleanedRecords.filter((cleaned, i) =>
          cleaned.trim().toLowerCase() === gameData.cleaned[i]?.toLowerCase()
        ).length;
        return correctCount >= Math.floor(gameData.cleaned.length * 0.8);

      case 'breach_hunter':
        // Check if user correctly identified which services leaked
        // attemptData.identifiedBreaches should match gameData.breached
        if (!attemptData.identifiedBreaches || !Array.isArray(attemptData.identifiedBreaches)) {
          return false;
        }
        const identified = new Set(attemptData.identifiedBreaches.map(s => s.toLowerCase()));
        const actual = new Set(gameData.breached.map(s => s.toLowerCase()));
        // Must identify all breached services (no false positives allowed)
        return identified.size === actual.size &&
               [...identified].every(s => actual.has(s));

      case 'record_matcher':
        // Check if user correctly grouped duplicate records
        // attemptData.groups should match gameData.correctGroups
        if (!attemptData.groups || !Array.isArray(attemptData.groups)) {
          return false;
        }
        // Convert both to comparable format (sorted sets)
        const userGroups = attemptData.groups.map(g => new Set(g.sort())).sort();
        const correctGroups = gameData.correctGroups.map(g => new Set(g.sort())).sort();
        // Allow 80% accuracy
        const matchingGroups = userGroups.filter((ug, i) => {
          const cg = correctGroups[i];
          if (!cg) return false;
          return ug.size === cg.size && [...ug].every(id => cg.has(id));
        }).length;
        return matchingGroups >= Math.floor(correctGroups.length * 0.8);

      case 'osint_detective':
        // Check if user discovered the correct information
        // attemptData.discoveries should include most of gameData.discoverable
        if (!attemptData.discoveries || !Array.isArray(attemptData.discoveries)) {
          return false;
        }
        // Allow discovering 60% of the information
        const discoveredCount = attemptData.discoveries.filter(d =>
          gameData.discoverable.some(correct =>
            correct.toLowerCase().includes(d.toLowerCase()) ||
            d.toLowerCase().includes(correct.toLowerCase())
          )
        ).length;
        return discoveredCount >= Math.ceil(gameData.discoverable.length * 0.6);

      case 'identity_verifier':
        // Check if user answered verification questions correctly
        // attemptData.answers should match gameData.questions[].correct
        if (!attemptData.answers || !Array.isArray(attemptData.answers)) {
          return false;
        }
        const correctAnswers = attemptData.answers.filter((answer, i) =>
          answer === gameData.questions[i]?.correct
        ).length;
        // Must get at least 80% of questions right
        return correctAnswers >= Math.ceil(gameData.questions.length * 0.8);

      default:
        console.warn(`[LearningEngine] Unknown game type: ${gameType}`);
        return false;
    }
  }

  /**
   * Get today's mini-game for a domain
   *
   * @param {string} pathSlug - Learning path slug
   * @returns {Promise<Object>} Today's mini-game or null
   */
  async getTodaysMiniGame(pathSlug) {
    try {
      const result = await this.db.query(
        `SELECT mg.*
         FROM mini_games mg
         JOIN learning_paths lp ON mg.path_id = lp.path_id
         WHERE lp.path_slug = $1
           AND mg.available_date = CURRENT_DATE
           AND mg.active = true
         LIMIT 1`,
        [pathSlug]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('[LearningEngine] Get today\'s mini-game error:', error);
      throw error;
    }
  }

  /**
   * Trigger drip campaign
   *
   * @param {string} userId - User ID
   * @param {string} pathId - Learning path UUID (optional)
   * @param {string} triggerEvent - Event name
   * @param {Object} context - Additional context data
   */
  async triggerDripCampaign(userId, pathId, triggerEvent, context = {}) {
    try {
      // Find matching campaigns
      const result = await this.db.query(
        `SELECT dc.*, dm.*
         FROM drip_campaigns dc
         JOIN drip_messages dm ON dc.campaign_id = dm.campaign_id
         WHERE dc.trigger_event = $1
           AND dc.active = true
           AND (dc.path_id IS NULL OR dc.path_id = $2)
         ORDER BY dm.sequence_number`,
        [triggerEvent, pathId]
      );

      if (result.rows.length === 0) {
        console.log(`[LearningEngine] No drip campaigns found for event: ${triggerEvent}`);
        return;
      }

      // Schedule messages
      for (const message of result.rows) {
        const sendAt = new Date(Date.now() + message.delay_minutes * 60 * 1000);

        await this.db.query(
          `INSERT INTO drip_sends (
            user_id, campaign_id, message_id, send_at, status, context
          ) VALUES ($1, $2, $3, $4, 'scheduled', $5)`,
          [userId, message.campaign_id, message.message_id, sendAt, JSON.stringify(context)]
        );
      }

      console.log(`[LearningEngine] Drip campaign triggered: ${triggerEvent} for user ${userId}`);
    } catch (error) {
      console.error('[LearningEngine] Trigger drip campaign error:', error);
      // Don't throw - drip campaigns are non-critical
    }
  }

  /**
   * Get all learning paths
   *
   * @returns {Promise<Array>} All learning paths with domain info
   */
  async getAllLearningPaths() {
    try {
      const result = await this.db.query(
        `SELECT
          lp.*,
          dp.domain_name,
          dp.primary_color,
          dp.brand_tagline as tagline
        FROM learning_paths lp
        JOIN domain_portfolio dp ON lp.domain_id = dp.domain_id
        WHERE lp.status = 'active'
        ORDER BY lp.path_name`
      );

      return result.rows;
    } catch (error) {
      console.error('[LearningEngine] Get all paths error:', error);
      throw error;
    }
  }

  /**
   * Get lessons for a learning path
   *
   * @param {string} pathSlug - Learning path slug
   * @returns {Promise<Array>} All lessons in order
   */
  async getLessons(pathSlug) {
    try {
      const result = await this.db.query(
        `SELECT l.*
         FROM lessons l
         JOIN learning_paths lp ON l.path_id = lp.path_id
         WHERE lp.path_slug = $1 AND l.status = $2
         ORDER BY l.lesson_number`,
        [pathSlug, 'published']
      );

      return result.rows;
    } catch (error) {
      console.error('[LearningEngine] Get lessons error:', error);
      throw error;
    }
  }

  // ============================================================================
  // COLLABORATIVE HINT SYSTEM
  // ============================================================================

  /**
   * Leave a hint for other students
   *
   * @param {string} userId - User leaving the hint
   * @param {string} lessonId - Lesson UUID
   * @param {string} hintText - Hint content (can include emojis, leet speak, icons)
   * @param {Object} options - Additional options (hint_type, spoiler_level)
   * @returns {Promise<Object>} Created hint
   */
  async leaveHint(userId, lessonId, hintText, options = {}) {
    try {
      // Get lesson and path info
      const lessonResult = await this.db.query(
        'SELECT path_id FROM lessons WHERE lesson_id = $1',
        [lessonId]
      );

      if (lessonResult.rows.length === 0) {
        throw new Error(`Lesson not found: ${lessonId}`);
      }

      const pathId = lessonResult.rows[0].path_id;

      // Create hint
      const result = await this.db.query(
        `INSERT INTO student_hints (
          lesson_id, path_id, user_id, hint_text, hint_type, spoiler_level, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *`,
        [
          lessonId,
          pathId,
          userId,
          hintText,
          options.hintType || 'cryptic',
          options.spoilerLevel || 1
        ]
      );

      console.log(`[LearningEngine] Hint created for lesson ${lessonId} by ${userId}`);

      return result.rows[0];
    } catch (error) {
      console.error('[LearningEngine] Leave hint error:', error);
      throw error;
    }
  }

  /**
   * Get hints for a lesson
   *
   * @param {string} lessonId - Lesson UUID
   * @param {number} limit - Number of hints to return
   * @returns {Promise<Array>} Hints sorted by helpfulness
   */
  async getHintsForLesson(lessonId, limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT * FROM student_hints
         WHERE lesson_id = $1 AND visible = true
         ORDER BY helpfulness_score DESC, created_at DESC
         LIMIT $2`,
        [lessonId, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('[LearningEngine] Get hints error:', error);
      throw error;
    }
  }

  /**
   * Rate a hint (upvote/downvote)
   *
   * @param {string} userId - User rating the hint
   * @param {string} hintId - Hint UUID
   * @param {number} rating - 1 for upvote, -1 for downvote
   * @param {string} reason - Optional reason ('helpful', 'spoiler', 'spam', 'clever')
   * @returns {Promise<Object>} Rating result
   */
  async rateHint(userId, hintId, rating, reason = null) {
    try {
      // Check if user already rated this hint
      const existingResult = await this.db.query(
        'SELECT * FROM hint_ratings WHERE hint_id = $1 AND user_id = $2',
        [hintId, userId]
      );

      if (existingResult.rows.length > 0) {
        throw new Error('You have already rated this hint');
      }

      // Record rating (triggers automatic score update via DB trigger)
      const result = await this.db.query(
        `INSERT INTO hint_ratings (hint_id, user_id, rating, reason, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING *`,
        [hintId, userId, rating, reason]
      );

      console.log(`[LearningEngine] Hint ${hintId} rated ${rating} by ${userId}`);

      return result.rows[0];
    } catch (error) {
      console.error('[LearningEngine] Rate hint error:', error);
      throw error;
    }
  }

  /**
   * Get hint leaderboard (most helpful hint-givers)
   *
   * @param {number} limit - Number of users to return
   * @returns {Promise<Array>} Ranked users by hint helpfulness
   */
  async getHintLeaderboard(limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT * FROM hint_leaderboard LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      console.error('[LearningEngine] Get hint leaderboard error:', error);
      throw error;
    }
  }

  /**
   * Get user's hints and stats
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User's hint stats and recent hints
   */
  async getUserHintStats(userId) {
    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) AS total_hints,
          SUM(helpfulness_score) AS total_helpfulness,
          SUM(xp_earned) AS total_xp_from_hints,
          AVG(helpfulness_score)::DECIMAL(5,2) AS avg_helpfulness,
          COUNT(CASE WHEN visible = false THEN 1 END) AS hidden_hints
        FROM student_hints
        WHERE user_id = $1`,
        [userId]
      );

      const stats = result.rows[0];

      // Get recent hints
      const hintsResult = await this.db.query(
        `SELECT sh.*, l.lesson_title, lp.path_name
         FROM student_hints sh
         JOIN lessons l ON sh.lesson_id = l.lesson_id
         JOIN learning_paths lp ON sh.path_id = lp.path_id
         WHERE sh.user_id = $1
         ORDER BY sh.created_at DESC
         LIMIT 5`,
        [userId]
      );

      return {
        stats,
        recentHints: hintsResult.rows
      };
    } catch (error) {
      console.error('[LearningEngine] Get user hint stats error:', error);
      throw error;
    }
  }
}

module.exports = LearningEngine;

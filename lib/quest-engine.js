/**
 * Quest Engine
 *
 * Core gamification engine that manages quests, progress tracking, and rewards.
 *
 * Integrates with:
 * - Affiliate tracker (invite quests)
 * - Forum system (discussion quests)
 * - Room/portal system (collaboration quests)
 * - DND Dungeon Master AI (narrative guidance)
 *
 * Quest Types:
 * - invite: Invite friends to join
 * - forum: Post discussions, get upvotes
 * - collaboration: Join rooms/portals, complete tasks
 * - achievement: Unlock through milestones
 * - onboarding: Complete account setup
 *
 * Usage:
 *   const engine = new QuestEngine({ db, dungeonMaster });
 *   await engine.trackInvite(userId, invitedUserId);
 *   await engine.trackForumPost(userId, threadId, upvotes);
 *   const quests = await engine.getUserQuests(userId);
 *   await engine.claimReward(userId, questId);
 */

const { EventEmitter } = require('events');

class QuestEngine extends EventEmitter {
  constructor(config = {}) {
    super();

    this.db = config.db;
    this.dungeonMaster = config.dungeonMaster || null; // DND Master AI
    this.enabled = config.enabled !== false;

    if (!this.db) {
      throw new Error('[QuestEngine] Database required');
    }

    console.log('[QuestEngine] Initialized');
  }

  /**
   * Get all quests for a user (available, in-progress, completed)
   */
  async getUserQuests(userId) {
    const result = await this.db.query(`
      SELECT
        q.*,
        uqp.progress_id,
        uqp.status,
        uqp.current_count,
        uqp.current_value,
        uqp.progress_data,
        uqp.started_at,
        uqp.completed_at,
        uqp.claimed_at,
        uqp.expires_at,
        -- Check if available
        is_quest_available($1, q.quest_id) as is_available
      FROM quests q
      LEFT JOIN user_quest_progress uqp
        ON q.quest_id = uqp.quest_id AND uqp.user_id = $1
      WHERE q.is_active = true
        AND (q.is_hidden = false OR uqp.quest_id IS NOT NULL)
      ORDER BY q.sort_order, q.quest_id
    `, [userId]);

    return result.rows;
  }

  /**
   * Get quests filtered by status
   */
  async getQuestsByStatus(userId, status = 'available') {
    const quests = await this.getUserQuests(userId);

    return quests.filter(q => {
      if (status === 'available') {
        return q.is_available && (!q.status || q.status === 'available');
      }
      return q.status === status;
    });
  }

  /**
   * Get quest by slug
   */
  async getQuestBySlug(questSlug) {
    const result = await this.db.query(
      'SELECT * FROM quests WHERE quest_slug = $1 AND is_active = true',
      [questSlug]
    );

    return result.rows[0];
  }

  /**
   * Initialize quest for user (make it available)
   */
  async initializeQuest(userId, questId) {
    try {
      const result = await this.db.query(
        'SELECT initialize_quest($1, $2) as progress_id',
        [userId, questId]
      );

      const progressId = result.rows[0].progress_id;

      this.emit('quest:unlocked', { userId, questId, progressId });

      console.log(`[QuestEngine] Quest unlocked for user ${userId}: quest ${questId}`);

      return progressId;
    } catch (error) {
      console.error('[QuestEngine] Initialize quest error:', error.message);
      throw error;
    }
  }

  /**
   * Update quest progress
   */
  async updateProgress(userId, questId, incrementCount = 1, incrementValue = 0, metadata = {}) {
    if (!this.enabled) return false;

    try {
      const result = await this.db.query(
        'SELECT update_quest_progress($1, $2, $3, $4, $5) as is_complete',
        [userId, questId, incrementCount, incrementValue, JSON.stringify(metadata)]
      );

      const isComplete = result.rows[0].is_complete;

      this.emit('quest:progress', { userId, questId, incrementCount, incrementValue, isComplete });

      if (isComplete) {
        console.log(`[QuestEngine] Quest completed! User ${userId}, quest ${questId}`);
        this.emit('quest:completed', { userId, questId });
      }

      return isComplete;
    } catch (error) {
      console.error('[QuestEngine] Update progress error:', error.message);
      throw error;
    }
  }

  /**
   * Track invite (for invite quests)
   */
  async trackInvite(userId, invitedUserId) {
    console.log(`[QuestEngine] Tracking invite: ${userId} invited ${invitedUserId}`);

    // Find invite quests
    const quests = await this.getQuestsByType('invite');

    for (const quest of quests) {
      await this.updateProgress(
        userId,
        quest.quest_id,
        1, // increment count
        0, // no value for invites
        { invited_user_id: invitedUserId, invited_at: new Date().toISOString() }
      );
    }
  }

  /**
   * Track forum post (for forum quests)
   */
  async trackForumPost(userId, threadId, upvotes = 0) {
    console.log(`[QuestEngine] Tracking forum post: user ${userId}, thread ${threadId}, ${upvotes} upvotes`);

    // Find forum quests
    const quests = await this.getQuestsByType('forum');

    for (const quest of quests) {
      await this.updateProgress(
        userId,
        quest.quest_id,
        1, // increment count (1 post)
        upvotes, // increment value (upvotes)
        { thread_id: threadId, posted_at: new Date().toISOString() }
      );
    }
  }

  /**
   * Track room join (for collaboration quests)
   */
  async trackRoomJoin(userId, roomId) {
    console.log(`[QuestEngine] Tracking room join: user ${userId}, room ${roomId}`);

    const quests = await this.db.query(`
      SELECT * FROM quests
      WHERE quest_type = 'collaboration'
        AND quest_slug = 'room-explorer'
        AND is_active = true
    `);

    for (const quest of quests.rows) {
      await this.updateProgress(
        userId,
        quest.quest_id,
        1,
        0,
        { room_id: roomId, joined_at: new Date().toISOString() }
      );
    }
  }

  /**
   * Track portal hosting (for collaboration quests)
   */
  async trackPortalTask(userId, portalId, taskId) {
    console.log(`[QuestEngine] Tracking portal task: user ${userId}, portal ${portalId}, task ${taskId}`);

    const quests = await this.db.query(`
      SELECT * FROM quests
      WHERE quest_type = 'collaboration'
        AND quest_slug = 'portal-host'
        AND is_active = true
    `);

    for (const quest of quests.rows) {
      await this.updateProgress(
        userId,
        quest.quest_id,
        1,
        0,
        { portal_id: portalId, task_id: taskId, completed_at: new Date().toISOString() }
      );
    }
  }

  /**
   * Get quests by type
   */
  async getQuestsByType(questType) {
    const result = await this.db.query(
      'SELECT * FROM quests WHERE quest_type = $1 AND is_active = true',
      [questType]
    );

    return result.rows;
  }

  /**
   * Claim quest reward
   */
  async claimReward(userId, questId) {
    // Get quest and progress
    const questResult = await this.db.query(
      'SELECT * FROM quests WHERE quest_id = $1',
      [questId]
    );

    if (questResult.rows.length === 0) {
      throw new Error('Quest not found');
    }

    const quest = questResult.rows[0];

    const progressResult = await this.db.query(
      'SELECT * FROM user_quest_progress WHERE user_id = $1 AND quest_id = $2',
      [userId, questId]
    );

    if (progressResult.rows.length === 0) {
      throw new Error('Quest progress not found');
    }

    const progress = progressResult.rows[0];

    if (progress.status !== 'completed') {
      throw new Error('Quest not completed');
    }

    if (progress.claimed_at) {
      throw new Error('Reward already claimed');
    }

    // Apply reward
    const reward = await this._applyReward(userId, quest, progress);

    // Mark as claimed
    await this.db.query(
      'UPDATE user_quest_progress SET claimed_at = NOW(), status = $1 WHERE user_id = $2 AND quest_id = $3',
      ['claimed', userId, questId]
    );

    // Log reward claim
    await this.db.query(`
      INSERT INTO quest_rewards_claimed (
        user_id, quest_id, progress_id, reward_type, reward_data,
        app_unlocked, feature_unlocked, karma_awarded, badge_awarded
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      userId,
      questId,
      progress.progress_id,
      quest.reward_type,
      quest.reward_data,
      reward.app_unlocked || null,
      reward.feature_unlocked || null,
      reward.karma_awarded || null,
      reward.badge_awarded || null
    ]);

    this.emit('quest:claimed', { userId, questId, reward });

    console.log(`[QuestEngine] Reward claimed! User ${userId}, quest ${questId}`, reward);

    return reward;
  }

  /**
   * Apply quest reward (internal)
   */
  async _applyReward(userId, quest, progress) {
    const rewardType = quest.reward_type;
    const rewardData = quest.reward_data;
    const reward = { type: rewardType };

    switch (rewardType) {
      case 'app_unlock':
        // Unlock apps
        const apps = rewardData.apps || [];
        reward.apps_unlocked = apps;
        reward.app_unlocked = apps.join(', ');

        // TODO: Update user permissions to unlock apps
        console.log(`[QuestEngine] Unlocking apps for user ${userId}:`, apps);
        break;

      case 'feature_unlock':
        // Unlock feature
        const feature = rewardData.feature;
        reward.feature_unlocked = feature;

        // TODO: Update user permissions/features
        console.log(`[QuestEngine] Unlocking feature for user ${userId}:`, feature);
        break;

      case 'tier_upgrade':
        // Upgrade tier
        const tier = rewardData.tier;
        reward.tier_upgraded = tier;

        // TODO: Update user tier
        console.log(`[QuestEngine] Upgrading tier for user ${userId}:`, tier);
        break;

      case 'karma':
        // Award karma
        const karma = rewardData.karma || 0;
        reward.karma_awarded = karma;

        // TODO: Add karma to user account
        console.log(`[QuestEngine] Awarding ${karma} karma to user ${userId}`);
        break;

      case 'badge':
        // Award badge
        const badge = rewardData.badge;
        reward.badge_awarded = badge;

        // TODO: Add badge to user profile
        console.log(`[QuestEngine] Awarding badge to user ${userId}:`, badge);
        break;

      default:
        console.warn('[QuestEngine] Unknown reward type:', rewardType);
    }

    return reward;
  }

  /**
   * Get DND Master narratives for user (unread)
   */
  async getDungeonMasterNarratives(userId, markAsShown = false) {
    const result = await this.db.query(`
      SELECT * FROM dungeon_master_narrative
      WHERE user_id = $1 AND was_shown = false
      ORDER BY created_at ASC
    `, [userId]);

    const narratives = result.rows;

    if (markAsShown && narratives.length > 0) {
      const narrativeIds = narratives.map(n => n.narrative_id);
      await this.db.query(`
        UPDATE dungeon_master_narrative
        SET was_shown = true, shown_at = NOW()
        WHERE narrative_id = ANY($1)
      `, [narrativeIds]);
    }

    return narratives;
  }

  /**
   * Get quest statistics for user
   */
  async getUserStats(userId) {
    const result = await this.db.query(`
      SELECT * FROM user_quest_summary
      WHERE user_id = $1
    `, [userId]);

    return result.rows[0] || {
      user_id: userId,
      quests_completed: 0,
      quests_in_progress: 0,
      quests_available: 0,
      total_karma_earned: 0
    };
  }

  /**
   * Get global quest leaderboard
   */
  async getLeaderboard(limit = 100) {
    const result = await this.db.query(`
      SELECT * FROM quest_leaderboard
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Check for new quests that should be unlocked
   */
  async checkForNewQuests(userId) {
    // Get all quests
    const quests = await this.db.query('SELECT * FROM quests WHERE is_active = true');

    const unlocked = [];

    for (const quest of quests.rows) {
      // Check if available
      const availableResult = await this.db.query(
        'SELECT is_quest_available($1, $2) as is_available',
        [userId, quest.quest_id]
      );

      const isAvailable = availableResult.rows[0].is_available;

      if (isAvailable) {
        // Check if already initialized
        const progressResult = await this.db.query(
          'SELECT * FROM user_quest_progress WHERE user_id = $1 AND quest_id = $2',
          [userId, quest.quest_id]
        );

        if (progressResult.rows.length === 0) {
          // Initialize quest
          await this.initializeQuest(userId, quest.quest_id);
          unlocked.push(quest);
        }
      }
    }

    return unlocked;
  }

  /**
   * Process expired quests
   */
  async processExpiredQuests() {
    const result = await this.db.query(`
      UPDATE user_quest_progress
      SET status = 'expired'
      WHERE status != 'completed'
        AND status != 'expired'
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
      RETURNING user_id, quest_id
    `);

    for (const row of result.rows) {
      console.log(`[QuestEngine] Quest expired: user ${row.user_id}, quest ${row.quest_id}`);

      await this.db.query(`
        INSERT INTO quest_events (user_id, quest_id, event_type)
        VALUES ($1, $2, 'expired')
      `, [row.user_id, row.quest_id]);

      this.emit('quest:expired', { userId: row.user_id, questId: row.quest_id });
    }

    return result.rows.length;
  }

  /**
   * Create custom quest (for admins/automation)
   */
  async createQuest(questData) {
    const result = await this.db.query(`
      INSERT INTO quests (
        quest_slug, quest_name, quest_description, quest_type, difficulty,
        required_count, required_value, required_data,
        reward_type, reward_data, reward_description,
        prerequisite_quest_ids, unlocks_quest_ids,
        icon_emoji, is_hidden, is_repeatable, expiry_days,
        narrative_intro, narrative_progress, narrative_complete,
        sort_order, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      )
      RETURNING *
    `, [
      questData.quest_slug,
      questData.quest_name,
      questData.quest_description,
      questData.quest_type,
      questData.difficulty || 'easy',
      questData.required_count || 1,
      questData.required_value || null,
      JSON.stringify(questData.required_data || {}),
      questData.reward_type,
      JSON.stringify(questData.reward_data),
      questData.reward_description || null,
      questData.prerequisite_quest_ids || null,
      questData.unlocks_quest_ids || null,
      questData.icon_emoji || '🎯',
      questData.is_hidden !== undefined ? questData.is_hidden : false,
      questData.is_repeatable !== undefined ? questData.is_repeatable : false,
      questData.expiry_days || null,
      questData.narrative_intro || null,
      questData.narrative_progress || null,
      questData.narrative_complete || null,
      questData.sort_order || 0,
      questData.is_active !== undefined ? questData.is_active : true
    ]);

    console.log(`[QuestEngine] Quest created:`, result.rows[0].quest_slug);

    return result.rows[0];
  }
}

module.exports = QuestEngine;

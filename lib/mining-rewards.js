// Mining/Rewards System
//
// Extends reputation-engine.js with mining/reward mechanics
// Awards karma points for contributions → redeemable rewards
// Integrates with portfolio timeline for activity tracking

const crypto = require('crypto');

class MiningRewards {
  constructor(pool, reputationEngine = null) {
    this.pool = pool;
    this.reputationEngine = reputationEngine;

    // Reward multipliers by activity type
    this.activityRewards = {
      // Code contributions
      'git_commit': 10,
      'git_pr_opened': 25,
      'git_pr_merged': 50,
      'git_issue_opened': 15,
      'git_issue_closed': 30,

      // AI/Chat contributions
      'ai_conversation': 5,
      'ai_feedback': 10,
      'ai_model_comparison': 20,

      // Embed/Analytics
      'embed_site_created': 100,
      'embed_conversion': 20,
      'embed_milestone_10k_views': 500,

      // Authorship/IP
      'patent_filed': 1000,
      'trademark_filed': 500,
      'copyright_registered': 250,

      // Community
      'forum_post': 5,
      'forum_helpful_answer': 25,
      'content_published': 50,
      'tutorial_created': 100,

      // Gaming (from gaming-adapter.js)
      'quest_completed': 50,
      'level_up': 100,
      'achievement_unlocked': 75,

      // System
      'bug_reported': 30,
      'feature_suggested': 20,
      'daily_login': 1,
      'referral': 250
    };

    // Badge/tier bonuses (from reputation-engine.js)
    this.badgeBonuses = {
      'newcomer': 1.0, // No bonus
      'contributor': 1.2, // 20% bonus
      'veteran': 1.5, // 50% bonus
      'legend': 2.0 // 100% bonus
    };

    // Reward tiers (karma → rewards)
    this.rewardTiers = [
      { karma: 100, reward: 'Bronze Badge', type: 'badge' },
      { karma: 500, reward: 'Silver Badge', type: 'badge' },
      { karma: 1000, reward: 'Free Month Premium', type: 'premium' },
      { karma: 2500, reward: 'Gold Badge', type: 'badge' },
      { karma: 5000, reward: 'Custom Domain', type: 'feature' },
      { karma: 10000, reward: 'Platinum Badge', type: 'badge' },
      { karma: 25000, reward: 'Free Year Premium', type: 'premium' },
      { karma: 50000, reward: 'Founder Badge', type: 'badge' },
      { karma: 100000, reward: 'Lifetime Premium', type: 'premium' }
    ];
  }

  // ============================================================================
  // Karma Mining
  // ============================================================================

  /**
   * Award karma for activity
   * @param {number} userId - User ID
   * @param {string} activityType - Type of activity
   * @param {object} metadata - Additional metadata
   */
  async mineKarma(userId, activityType, metadata = {}) {
    try {
      // Get base reward
      const baseReward = this.activityRewards[activityType] || 0;

      if (baseReward === 0) {
        console.warn(`[MiningRewards] Unknown activity type: ${activityType}`);
        return null;
      }

      // Get user's current badge tier for multiplier
      let multiplier = 1.0;

      if (this.reputationEngine) {
        const reputation = await this.reputationEngine.getReputationProfile(userId);
        const badge = reputation.badge || 'newcomer';
        multiplier = this.badgeBonuses[badge] || 1.0;
      }

      // Calculate final karma
      const karma = Math.floor(baseReward * multiplier);

      // Record mining event
      const query = `
        INSERT INTO karma_mining_events (
          user_id, activity_type, base_reward, multiplier, karma_earned, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        userId,
        activityType,
        baseReward,
        multiplier,
        karma,
        JSON.stringify(metadata)
      ]);

      // Update user's total karma
      await this.pool.query(`
        UPDATE user_reputation
        SET karma = karma + $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
      `, [karma, userId]);

      // Check for reward unlocks
      await this.checkRewardUnlocks(userId);

      return {
        activityType,
        baseReward,
        multiplier,
        karmaEarned: karma,
        event: result.rows[0]
      };
    } catch (error) {
      console.error('[MiningRewards] Error mining karma:', error.message);
      throw error;
    }
  }

  /**
   * Batch mine karma from portfolio timeline
   * @param {number} userId - User ID
   * @param {Date} since - Mine activities since this date
   */
  async batchMineFromTimeline(userId, since = null) {
    const sinceClause = since ? `AND event_timestamp > $2` : '';
    const params = since ? [userId, since] : [userId];

    const query = `
      SELECT event_type, event_data, event_timestamp
      FROM portfolio_timeline
      WHERE user_id = $1 ${sinceClause}
      AND event_type NOT IN (
        SELECT DISTINCT activity_type FROM karma_mining_events WHERE user_id = $1
      )
      ORDER BY event_timestamp ASC
    `;

    const result = await this.pool.query(query, params);
    const events = result.rows;

    const mined = [];

    for (const event of events) {
      // Map event_type to activity_type
      const activityType = this.mapEventTypeToActivity(event.event_type);

      if (activityType && this.activityRewards[activityType]) {
        try {
          const reward = await this.mineKarma(userId, activityType, event.event_data);
          mined.push(reward);
        } catch (err) {
          console.error(`[MiningRewards] Error mining event:`, err.message);
        }
      }
    }

    return {
      eventsProcessed: events.length,
      karmaMined: mined.length,
      totalKarma: mined.reduce((sum, r) => sum + r.karmaEarned, 0),
      details: mined
    };
  }

  /**
   * Map portfolio event_type to mining activity_type
   * @param {string} eventType - Event type from portfolio_timeline
   */
  mapEventTypeToActivity(eventType) {
    const mapping = {
      'chat': 'ai_conversation',
      'commit': 'git_commit',
      'pageview': null, // Don't reward pageviews
      'consent': null,
      'patent_filed': 'patent_filed',
      'trademark': 'trademark_filed',
      'conversion': 'embed_conversion'
    };

    return mapping[eventType] || null;
  }

  // ============================================================================
  // Reward Unlocks
  // ============================================================================

  /**
   * Check if user unlocked new rewards
   * @param {number} userId - User ID
   */
  async checkRewardUnlocks(userId) {
    // Get user's current karma
    const karmaQuery = `
      SELECT karma FROM user_reputation WHERE user_id = $1
    `;
    const karmaResult = await this.pool.query(karmaQuery, [userId]);

    if (karmaResult.rows.length === 0) return [];

    const currentKarma = karmaResult.rows[0].karma;

    // Get already unlocked rewards
    const unlockedQuery = `
      SELECT karma_threshold FROM user_rewards WHERE user_id = $1
    `;
    const unlockedResult = await this.pool.query(unlockedQuery, [userId]);
    const unlockedThresholds = unlockedResult.rows.map(r => r.karma_threshold);

    // Find new unlocks
    const newUnlocks = this.rewardTiers.filter(tier =>
      tier.karma <= currentKarma && !unlockedThresholds.includes(tier.karma)
    );

    // Grant new rewards
    const granted = [];

    for (const tier of newUnlocks) {
      const query = `
        INSERT INTO user_rewards (
          user_id, karma_threshold, reward_name, reward_type, unlocked_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        userId,
        tier.karma,
        tier.reward,
        tier.type
      ]);

      granted.push(result.rows[0]);

      // Trigger reward notification (future: emit event for notification system)
      console.log(`[MiningRewards] User ${userId} unlocked: ${tier.reward}`);
    }

    return granted;
  }

  /**
   * Get user's rewards
   * @param {number} userId - User ID
   */
  async getUserRewards(userId) {
    const query = `
      SELECT * FROM user_rewards
      WHERE user_id = $1
      ORDER BY karma_threshold ASC
    `;

    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  /**
   * Redeem reward
   * @param {number} userId - User ID
   * @param {number} rewardId - Reward ID
   */
  async redeemReward(userId, rewardId) {
    const query = `
      UPDATE user_rewards
      SET redeemed_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2 AND redeemed_at IS NULL
      RETURNING *
    `;

    const result = await this.pool.query(query, [rewardId, userId]);

    if (result.rows.length === 0) {
      throw new Error('Reward not found or already redeemed');
    }

    return result.rows[0];
  }

  // ============================================================================
  // Leaderboard
  // ============================================================================

  /**
   * Get global karma leaderboard
   * @param {number} limit - Number of users to fetch
   */
  async getLeaderboard(limit = 100) {
    const query = `
      SELECT user_id, karma, badge, trust_score, created_at
      FROM user_reputation
      ORDER BY karma DESC
      LIMIT $1
    `;

    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }

  /**
   * Get user's rank
   * @param {number} userId - User ID
   */
  async getUserRank(userId) {
    const query = `
      SELECT COUNT(*) + 1 as rank
      FROM user_reputation
      WHERE karma > (SELECT karma FROM user_reputation WHERE user_id = $1)
    `;

    const result = await this.pool.query(query, [userId]);
    return result.rows[0]?.rank || null;
  }

  // ============================================================================
  // Mining Statistics
  // ============================================================================

  /**
   * Get mining stats for user
   * @param {number} userId - User ID
   */
  async getMiningStats(userId) {
    const query = `
      SELECT
        COUNT(*) as total_events,
        SUM(karma_earned) as total_karma_earned,
        AVG(karma_earned) as avg_karma_per_event,
        MAX(karma_earned) as max_karma_earned,
        MIN(created_at) as first_event,
        MAX(created_at) as last_event
      FROM karma_mining_events
      WHERE user_id = $1
    `;

    const result = await this.pool.query(query, [userId]);
    const stats = result.rows[0];

    // Get breakdown by activity type
    const breakdownQuery = `
      SELECT activity_type, COUNT(*) as count, SUM(karma_earned) as karma
      FROM karma_mining_events
      WHERE user_id = $1
      GROUP BY activity_type
      ORDER BY karma DESC
    `;

    const breakdownResult = await this.pool.query(breakdownQuery, [userId]);

    return {
      ...stats,
      breakdown: breakdownResult.rows
    };
  }

  /**
   * Get global mining statistics
   */
  async getGlobalMiningStats() {
    const query = `
      SELECT
        COUNT(DISTINCT user_id) as total_miners,
        COUNT(*) as total_events,
        SUM(karma_earned) as total_karma_mined,
        AVG(karma_earned) as avg_karma_per_event
      FROM karma_mining_events
    `;

    const result = await this.pool.query(query);
    return result.rows[0];
  }

  // ============================================================================
  // Referral System
  // ============================================================================

  /**
   * Generate referral code for user
   * @param {number} userId - User ID
   */
  async generateReferralCode(userId) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();

    const query = `
      INSERT INTO referral_codes (user_id, code)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code
      RETURNING *
    `;

    const result = await this.pool.query(query, [userId, code]);
    return result.rows[0];
  }

  /**
   * Track referral usage
   * @param {string} code - Referral code
   * @param {number} newUserId - New user ID
   */
  async trackReferral(code, newUserId) {
    // Find referrer
    const referrerQuery = `
      SELECT user_id FROM referral_codes WHERE code = $1
    `;

    const referrerResult = await this.pool.query(referrerQuery, [code]);

    if (referrerResult.rows.length === 0) {
      throw new Error('Invalid referral code');
    }

    const referrerId = referrerResult.rows[0].user_id;

    // Record referral
    const query = `
      INSERT INTO referrals (referrer_id, referred_user_id, code)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await this.pool.query(query, [referrerId, newUserId, code]);

    // Award karma to referrer
    await this.mineKarma(referrerId, 'referral', {
      referredUserId: newUserId,
      code
    });

    return result.rows[0];
  }

  /**
   * Get user's referrals
   * @param {number} userId - User ID
   */
  async getUserReferrals(userId) {
    const query = `
      SELECT * FROM referrals
      WHERE referrer_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  // ============================================================================
  // Daily Streak Bonus
  // ============================================================================

  /**
   * Record daily login and award streak bonus
   * @param {number} userId - User ID
   */
  async recordDailyLogin(userId) {
    const today = new Date().toISOString().split('T')[0];

    // Check if already logged in today
    const checkQuery = `
      SELECT * FROM daily_logins
      WHERE user_id = $1 AND DATE(login_date) = $2
    `;

    const checkResult = await this.pool.query(checkQuery, [userId, today]);

    if (checkResult.rows.length > 0) {
      return { alreadyLogged: true, streak: null };
    }

    // Record login
    const query = `
      INSERT INTO daily_logins (user_id, login_date)
      VALUES ($1, $2)
      RETURNING *
    `;

    await this.pool.query(query, [userId, today]);

    // Calculate streak
    const streakQuery = `
      SELECT COUNT(*) as streak
      FROM daily_logins
      WHERE user_id = $1
      AND login_date >= CURRENT_DATE - INTERVAL '30 days'
    `;

    const streakResult = await this.pool.query(streakQuery, [userId]);
    const streak = parseInt(streakResult.rows[0].streak);

    // Award base daily login karma
    await this.mineKarma(userId, 'daily_login');

    // Bonus for streaks (every 7 days)
    if (streak % 7 === 0 && streak > 0) {
      const bonusKarma = streak * 5; // 5 karma per day in streak
      await this.pool.query(`
        UPDATE user_reputation
        SET karma = karma + $1
        WHERE user_id = $2
      `, [bonusKarma, userId]);
    }

    return { alreadyLogged: false, streak, bonusKarma: streak % 7 === 0 ? streak * 5 : 0 };
  }
}

module.exports = MiningRewards;

/**
 * Gmail Rate Limiter
 *
 * Prevents abuse by limiting email sends per user/recipient
 *
 * Limits:
 * - Per User: 50/hour, 500/day, 10,000/month
 * - Per Recipient: 10/day (prevent harassment)
 * - Global: 100/hour, 500/day (protect free SMTP)
 *
 * Storage: Google Sheets
 *
 * Reset Strategy:
 * - Hourly: Top of next hour
 * - Daily: Midnight UTC
 * - Monthly: 1st of month
 *
 * Usage:
 *   const limiter = new GmailRateLimiter({ db });
 *   const check = await limiter.checkLimit('user123', 'recipient@example.com');
 *   if (check.allowed) {
 *     // Send email
 *     await limiter.recordSend('user123', 'recipient@example.com');
 *   }
 */

const GoogleSheetsDBAdapter = require('./google-sheets-db-adapter');

class GmailRateLimiter {
  constructor(config = {}) {
    // Database adapter
    this.db = config.db || new GoogleSheetsDBAdapter();

    // User limits (per user)
    this.userLimits = {
      hourly: config.userHourlyLimit || 50,
      daily: config.userDailyLimit || 500,
      monthly: config.userMonthlyLimit || 10000
    };

    // Recipient limits (per user + recipient pair)
    this.recipientLimits = {
      daily: config.recipientDailyLimit || 10
    };

    // Global limits (all users combined)
    this.globalLimits = {
      hourly: config.globalHourlyLimit || 100,
      daily: config.globalDailyLimit || 500
    };

    console.log('[GmailRateLimiter] Initialized');
  }

  /**
   * Initialize (ensure rate_limits table exists)
   */
  async init() {
    await this.db.init();

    // Ensure rate_limits sheet exists
    if (!this.db.sheetNames.rateLimits) {
      this.db.sheetNames.rateLimits = 'rate_limits';
    }

    console.log('[GmailRateLimiter] Ready');
  }

  /**
   * Check if send is allowed
   *
   * @param {string} userId - User ID
   * @param {string} recipientEmail - Recipient email (optional)
   * @returns {Object} Check result
   */
  async checkLimit(userId, recipientEmail = null) {
    try {
      await this.init();

      const now = new Date();

      // Check user limits
      const userCheck = await this.checkUserLimits(userId, now);
      if (!userCheck.allowed) {
        return userCheck;
      }

      // Check recipient limits (if provided)
      if (recipientEmail) {
        const recipientCheck = await this.checkRecipientLimits(userId, recipientEmail, now);
        if (!recipientCheck.allowed) {
          return recipientCheck;
        }
      }

      // Check global limits
      const globalCheck = await this.checkGlobalLimits(now);
      if (!globalCheck.allowed) {
        return globalCheck;
      }

      return {
        allowed: true,
        reason: 'Within limits'
      };

    } catch (error) {
      console.error('[GmailRateLimiter] Error checking limit:', error);
      return {
        allowed: false,
        reason: 'Error checking limits',
        error: error.message
      };
    }
  }

  /**
   * Check user limits
   * @private
   */
  async checkUserLimits(userId, now) {
    const limits = await this.getUserLimits(userId);

    // Hourly check
    if (limits.hourly.current >= this.userLimits.hourly) {
      return {
        allowed: false,
        reason: 'Hourly user limit exceeded',
        limit: this.userLimits.hourly,
        current: limits.hourly.current,
        resetAt: limits.hourly.resetAt
      };
    }

    // Daily check
    if (limits.daily.current >= this.userLimits.daily) {
      return {
        allowed: false,
        reason: 'Daily user limit exceeded',
        limit: this.userLimits.daily,
        current: limits.daily.current,
        resetAt: limits.daily.resetAt
      };
    }

    // Monthly check
    if (limits.monthly.current >= this.userLimits.monthly) {
      return {
        allowed: false,
        reason: 'Monthly user limit exceeded',
        limit: this.userLimits.monthly,
        current: limits.monthly.current,
        resetAt: limits.monthly.resetAt
      };
    }

    return { allowed: true };
  }

  /**
   * Check recipient limits
   * @private
   */
  async checkRecipientLimits(userId, recipientEmail, now) {
    const key = `${userId}:${recipientEmail}`;
    const limits = await this.getRecipientLimits(key);

    if (limits.daily.current >= this.recipientLimits.daily) {
      return {
        allowed: false,
        reason: 'Daily recipient limit exceeded',
        limit: this.recipientLimits.daily,
        current: limits.daily.current,
        resetAt: limits.daily.resetAt,
        recipient: recipientEmail
      };
    }

    return { allowed: true };
  }

  /**
   * Check global limits
   * @private
   */
  async checkGlobalLimits(now) {
    const limits = await this.getGlobalLimits();

    // Hourly check
    if (limits.hourly.current >= this.globalLimits.hourly) {
      return {
        allowed: false,
        reason: 'Global hourly limit exceeded',
        limit: this.globalLimits.hourly,
        current: limits.hourly.current,
        resetAt: limits.hourly.resetAt
      };
    }

    // Daily check
    if (limits.daily.current >= this.globalLimits.daily) {
      return {
        allowed: false,
        reason: 'Global daily limit exceeded',
        limit: this.globalLimits.daily,
        current: limits.daily.current,
        resetAt: limits.daily.resetAt
      };
    }

    return { allowed: true };
  }

  /**
   * Record a send (increment counters)
   *
   * @param {string} userId - User ID
   * @param {string} recipientEmail - Recipient email (optional)
   */
  async recordSend(userId, recipientEmail = null) {
    try {
      await this.init();

      const now = new Date();

      // Record user send
      await this.incrementUserCounters(userId, now);

      // Record recipient send (if provided)
      if (recipientEmail) {
        const key = `${userId}:${recipientEmail}`;
        await this.incrementRecipientCounters(key, now);
      }

      // Record global send
      await this.incrementGlobalCounters(now);

      console.log(`[GmailRateLimiter] Recorded send for ${userId}`);

    } catch (error) {
      console.error('[GmailRateLimiter] Error recording send:', error);
    }
  }

  /**
   * Get user limits
   *
   * @param {string} userId - User ID
   * @returns {Object} Limits
   */
  async getUserLimits(userId) {
    const now = new Date();

    // Find user rate limit record
    let record = await this.db.findOne(this.db.sheetNames.rateLimits, {
      entity_type: 'user',
      entity_id: userId
    });

    // Create if doesn't exist
    if (!record) {
      record = await this.createUserLimitRecord(userId);
    }

    // Parse and check resets
    const hourlyResetAt = new Date(record.hourly_reset_at);
    const dailyResetAt = new Date(record.daily_reset_at);
    const monthlyResetAt = new Date(record.monthly_reset_at);

    // Reset if needed
    let hourlyCount = parseInt(record.hourly_count || 0);
    let dailyCount = parseInt(record.daily_count || 0);
    let monthlyCount = parseInt(record.monthly_count || 0);
    let totalCount = parseInt(record.total_count || 0);

    if (now >= hourlyResetAt) {
      hourlyCount = 0;
    }

    if (now >= dailyResetAt) {
      dailyCount = 0;
    }

    if (now >= monthlyResetAt) {
      monthlyCount = 0;
    }

    return {
      hourly: {
        current: hourlyCount,
        limit: this.userLimits.hourly,
        resetAt: this.getNextHourlyReset(now).toISOString()
      },
      daily: {
        current: dailyCount,
        limit: this.userLimits.daily,
        resetAt: this.getNextDailyReset(now).toISOString()
      },
      monthly: {
        current: monthlyCount,
        limit: this.userLimits.monthly,
        resetAt: this.getNextMonthlyReset(now).toISOString()
      },
      total: totalCount
    };
  }

  /**
   * Get recipient limits
   * @private
   */
  async getRecipientLimits(key) {
    const now = new Date();

    // Find recipient rate limit record
    let record = await this.db.findOne(this.db.sheetNames.rateLimits, {
      entity_type: 'recipient',
      entity_id: key
    });

    // Create if doesn't exist
    if (!record) {
      record = await this.createRecipientLimitRecord(key);
    }

    // Parse and check resets
    const dailyResetAt = new Date(record.daily_reset_at);

    let dailyCount = parseInt(record.daily_count || 0);

    if (now >= dailyResetAt) {
      dailyCount = 0;
    }

    return {
      daily: {
        current: dailyCount,
        limit: this.recipientLimits.daily,
        resetAt: this.getNextDailyReset(now).toISOString()
      }
    };
  }

  /**
   * Get global limits
   * @private
   */
  async getGlobalLimits() {
    const now = new Date();

    // Find global rate limit record
    let record = await this.db.findOne(this.db.sheetNames.rateLimits, {
      entity_type: 'global',
      entity_id: 'all'
    });

    // Create if doesn't exist
    if (!record) {
      record = await this.createGlobalLimitRecord();
    }

    // Parse and check resets
    const hourlyResetAt = new Date(record.hourly_reset_at);
    const dailyResetAt = new Date(record.daily_reset_at);

    let hourlyCount = parseInt(record.hourly_count || 0);
    let dailyCount = parseInt(record.daily_count || 0);

    if (now >= hourlyResetAt) {
      hourlyCount = 0;
    }

    if (now >= dailyResetAt) {
      dailyCount = 0;
    }

    return {
      hourly: {
        current: hourlyCount,
        limit: this.globalLimits.hourly,
        resetAt: this.getNextHourlyReset(now).toISOString()
      },
      daily: {
        current: dailyCount,
        limit: this.globalLimits.daily,
        resetAt: this.getNextDailyReset(now).toISOString()
      }
    };
  }

  /**
   * Increment user counters
   * @private
   */
  async incrementUserCounters(userId, now) {
    const limits = await this.getUserLimits(userId);

    await this.db.update(
      this.db.sheetNames.rateLimits,
      { entity_type: 'user', entity_id: userId },
      {
        hourly_count: limits.hourly.current + 1,
        daily_count: limits.daily.current + 1,
        monthly_count: limits.monthly.current + 1,
        total_count: limits.total + 1,
        hourly_reset_at: limits.hourly.resetAt,
        daily_reset_at: limits.daily.resetAt,
        monthly_reset_at: limits.monthly.resetAt,
        last_send_at: now.toISOString()
      }
    );
  }

  /**
   * Increment recipient counters
   * @private
   */
  async incrementRecipientCounters(key, now) {
    const limits = await this.getRecipientLimits(key);

    await this.db.update(
      this.db.sheetNames.rateLimits,
      { entity_type: 'recipient', entity_id: key },
      {
        daily_count: limits.daily.current + 1,
        daily_reset_at: limits.daily.resetAt,
        last_send_at: now.toISOString()
      }
    );
  }

  /**
   * Increment global counters
   * @private
   */
  async incrementGlobalCounters(now) {
    const limits = await this.getGlobalLimits();

    await this.db.update(
      this.db.sheetNames.rateLimits,
      { entity_type: 'global', entity_id: 'all' },
      {
        hourly_count: limits.hourly.current + 1,
        daily_count: limits.daily.current + 1,
        hourly_reset_at: limits.hourly.resetAt,
        daily_reset_at: limits.daily.resetAt,
        last_send_at: now.toISOString()
      }
    );
  }

  /**
   * Create user limit record
   * @private
   */
  async createUserLimitRecord(userId) {
    const now = new Date();

    const data = {
      entity_type: 'user',
      entity_id: userId,
      hourly_count: 0,
      daily_count: 0,
      monthly_count: 0,
      total_count: 0,
      hourly_reset_at: this.getNextHourlyReset(now).toISOString(),
      daily_reset_at: this.getNextDailyReset(now).toISOString(),
      monthly_reset_at: this.getNextMonthlyReset(now).toISOString(),
      last_send_at: null,
      created_at: now.toISOString()
    };

    await this.db.insert(this.db.sheetNames.rateLimits, data);

    return data;
  }

  /**
   * Create recipient limit record
   * @private
   */
  async createRecipientLimitRecord(key) {
    const now = new Date();

    const data = {
      entity_type: 'recipient',
      entity_id: key,
      daily_count: 0,
      daily_reset_at: this.getNextDailyReset(now).toISOString(),
      last_send_at: null,
      created_at: now.toISOString()
    };

    await this.db.insert(this.db.sheetNames.rateLimits, data);

    return data;
  }

  /**
   * Create global limit record
   * @private
   */
  async createGlobalLimitRecord() {
    const now = new Date();

    const data = {
      entity_type: 'global',
      entity_id: 'all',
      hourly_count: 0,
      daily_count: 0,
      hourly_reset_at: this.getNextHourlyReset(now).toISOString(),
      daily_reset_at: this.getNextDailyReset(now).toISOString(),
      last_send_at: null,
      created_at: now.toISOString()
    };

    await this.db.insert(this.db.sheetNames.rateLimits, data);

    return data;
  }

  /**
   * Get next hourly reset time (top of next hour)
   * @private
   */
  getNextHourlyReset(now) {
    const next = new Date(now);
    next.setHours(next.getHours() + 1);
    next.setMinutes(0);
    next.setSeconds(0);
    next.setMilliseconds(0);
    return next;
  }

  /**
   * Get next daily reset time (midnight UTC)
   * @private
   */
  getNextDailyReset(now) {
    const next = new Date(now);
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(0);
    next.setUTCMinutes(0);
    next.setUTCSeconds(0);
    next.setUTCMilliseconds(0);
    return next;
  }

  /**
   * Get next monthly reset time (1st of next month)
   * @private
   */
  getNextMonthlyReset(now) {
    const next = new Date(now);
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(1);
    next.setUTCHours(0);
    next.setUTCMinutes(0);
    next.setUTCSeconds(0);
    next.setUTCMilliseconds(0);
    return next;
  }

  /**
   * Get global statistics
   *
   * @returns {Object} Global stats
   */
  async getGlobalStats() {
    try {
      await this.init();

      const globalLimits = await this.getGlobalLimits();

      return {
        hourly: {
          current: globalLimits.hourly.current,
          limit: this.globalLimits.hourly,
          percentage: (globalLimits.hourly.current / this.globalLimits.hourly * 100).toFixed(1),
          resetAt: globalLimits.hourly.resetAt
        },
        daily: {
          current: globalLimits.daily.current,
          limit: this.globalLimits.daily,
          percentage: (globalLimits.daily.current / this.globalLimits.daily * 100).toFixed(1),
          resetAt: globalLimits.daily.resetAt
        }
      };

    } catch (error) {
      console.error('[GmailRateLimiter] Error getting global stats:', error);
      return null;
    }
  }

  /**
   * Reset user limits (admin function)
   *
   * @param {string} userId - User ID
   * @param {string} period - Period to reset ('hourly', 'daily', 'monthly', 'all')
   */
  async resetUserLimits(userId, period = 'all') {
    try {
      await this.init();

      const updates = {};

      if (period === 'hourly' || period === 'all') {
        updates.hourly_count = 0;
      }

      if (period === 'daily' || period === 'all') {
        updates.daily_count = 0;
      }

      if (period === 'monthly' || period === 'all') {
        updates.monthly_count = 0;
      }

      await this.db.update(
        this.db.sheetNames.rateLimits,
        { entity_type: 'user', entity_id: userId },
        updates
      );

      console.log(`[GmailRateLimiter] Reset ${period} limits for user ${userId}`);

      return true;

    } catch (error) {
      console.error('[GmailRateLimiter] Error resetting user limits:', error);
      return false;
    }
  }
}

module.exports = GmailRateLimiter;

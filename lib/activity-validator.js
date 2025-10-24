/**
 * Activity Validator
 *
 * Validates subdomain ownership based on user activity.
 * Implements 30-day activity rule: subdomains expire if user inactive for 30 days.
 *
 * Activity Sources:
 * - User logins
 * - API usage
 * - Discord activity
 * - GitHub commits
 * - Leaderboard rankings (top 1000 = immunity)
 *
 * Features:
 * - Auto-expire inactive subdomains
 * - Send warnings before expiration (7 days, 3 days, 1 day)
 * - Transfer expired domains to auction
 * - VIP immunity for top performers
 */

const fs = require('fs').promises;
const path = require('path');

class ActivityValidator {
  constructor(options = {}) {
    this.activityLogPath = options.activityLogPath || path.join(__dirname, '..', 'data', 'user-activity.json');
    this.userActivity = new Map(); // userId => { lastActivity, activities: [], score }

    this.config = {
      expirationDays: options.expirationDays || 30, // Subdomain expires after 30 days
      warningDays: options.warningDays || [7, 3, 1], // Send warnings at these thresholds
      leaderboardImmunityRank: options.leaderboardImmunityRank || 1000, // Top 1000 never expire
      activityTypes: options.activityTypes || [
        'login',
        'api_call',
        'discord_message',
        'github_commit',
        'subdomain_visit',
        'contribution',
        'purchase'
      ],
      activityScores: options.activityScores || {
        login: 1,
        api_call: 0.5,
        discord_message: 2,
        github_commit: 5,
        subdomain_visit: 0.2,
        contribution: 10,
        purchase: 20
      },
      ...options
    };

    console.log('[ActivityValidator] Initialized');
  }

  /**
   * Initialize validator (load activity log)
   */
  async init() {
    try {
      const data = await fs.readFile(this.activityLogPath, 'utf8');
      const parsed = JSON.parse(data);

      // Load activity data
      Object.entries(parsed.users || {}).forEach(([userId, activityData]) => {
        this.userActivity.set(userId, activityData);
      });

      console.log(`[ActivityValidator] Loaded activity for ${this.userActivity.size} users`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[ActivityValidator] No activity log found, starting fresh');
        await this._save();
      } else {
        throw error;
      }
    }
  }

  /**
   * Log user activity
   * @param {string} userId - User ID
   * @param {string} activityType - Type of activity (login, api_call, etc.)
   * @param {object} metadata - Additional activity metadata
   */
  async logActivity(userId, activityType, metadata = {}) {
    if (!this.config.activityTypes.includes(activityType)) {
      return { success: false, error: `Invalid activity type: ${activityType}` };
    }

    // Get or create user activity record
    if (!this.userActivity.has(userId)) {
      this.userActivity.set(userId, {
        userId,
        lastActivity: null,
        activities: [],
        score: 0,
        rank: null,
        warnings: []
      });
    }

    const userRecord = this.userActivity.get(userId);

    // Add activity
    const activity = {
      type: activityType,
      timestamp: new Date().toISOString(),
      score: this.config.activityScores[activityType] || 0,
      metadata
    };

    userRecord.activities.push(activity);
    userRecord.lastActivity = activity.timestamp;
    userRecord.score += activity.score;

    // Limit activity history (keep last 1000)
    if (userRecord.activities.length > 1000) {
      userRecord.activities = userRecord.activities.slice(-1000);
    }

    await this._save();

    return {
      success: true,
      activity,
      totalScore: userRecord.score,
      lastActivity: userRecord.lastActivity
    };
  }

  /**
   * Check if user is active (logged activity within expiration window)
   * @param {string} userId - User ID
   * @returns {boolean} True if active
   */
  isUserActive(userId) {
    const userRecord = this.userActivity.get(userId);

    if (!userRecord || !userRecord.lastActivity) {
      return false; // No activity = inactive
    }

    const lastActivity = new Date(userRecord.lastActivity);
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - this.config.expirationDays);

    return lastActivity > expirationDate;
  }

  /**
   * Check if user has leaderboard immunity (top performer)
   * @param {string} userId - User ID
   * @returns {boolean} True if immune to expiration
   */
  hasImmunity(userId) {
    const userRecord = this.userActivity.get(userId);

    if (!userRecord || !userRecord.rank) {
      return false;
    }

    return userRecord.rank <= this.config.leaderboardImmunityRank;
  }

  /**
   * Get days until expiration for a user
   * @param {string} userId - User ID
   * @returns {number|null} Days remaining (null if immune or no activity)
   */
  getDaysUntilExpiration(userId) {
    // Check immunity first
    if (this.hasImmunity(userId)) {
      return null; // Immune = never expires
    }

    const userRecord = this.userActivity.get(userId);

    if (!userRecord || !userRecord.lastActivity) {
      return 0; // No activity = already expired
    }

    const lastActivity = new Date(userRecord.lastActivity);
    const now = new Date();
    const daysSinceActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
    const daysRemaining = this.config.expirationDays - daysSinceActivity;

    return Math.max(0, daysRemaining);
  }

  /**
   * Get users who need expiration warnings
   * @returns {array} Users who should receive warnings
   */
  async getUsersNeedingWarnings() {
    const warnings = [];

    for (const [userId, userRecord] of this.userActivity.entries()) {
      // Skip users with immunity
      if (this.hasImmunity(userId)) {
        continue;
      }

      const daysRemaining = this.getDaysUntilExpiration(userId);

      // Check if user needs a warning
      for (const warningDay of this.config.warningDays) {
        if (daysRemaining === warningDay) {
          // Check if we already sent this warning
          const alreadyWarned = userRecord.warnings.some(
            w => w.daysRemaining === warningDay &&
            new Date(w.sentAt) > new Date(Date.now() - 86400000) // Within last 24 hours
          );

          if (!alreadyWarned) {
            warnings.push({
              userId,
              daysRemaining: warningDay,
              lastActivity: userRecord.lastActivity,
              score: userRecord.score
            });
          }
        }
      }
    }

    return warnings;
  }

  /**
   * Mark warning as sent
   * @param {string} userId - User ID
   * @param {number} daysRemaining - Days remaining when warning sent
   */
  async recordWarningSent(userId, daysRemaining) {
    const userRecord = this.userActivity.get(userId);

    if (!userRecord) {
      return { success: false, error: 'User not found' };
    }

    userRecord.warnings.push({
      daysRemaining,
      sentAt: new Date().toISOString()
    });

    await this._save();

    return { success: true };
  }

  /**
   * Get expired users (should lose their subdomains)
   * @returns {array} Users whose subdomains should expire
   */
  async getExpiredUsers() {
    const expired = [];

    for (const [userId, userRecord] of this.userActivity.entries()) {
      // Skip users with immunity
      if (this.hasImmunity(userId)) {
        continue;
      }

      const daysRemaining = this.getDaysUntilExpiration(userId);

      if (daysRemaining === 0) {
        expired.push({
          userId,
          lastActivity: userRecord.lastActivity,
          score: userRecord.score,
          daysSinceActivity: this.config.expirationDays
        });
      }
    }

    return expired;
  }

  /**
   * Get user activity summary
   * @param {string} userId - User ID
   */
  getUserSummary(userId) {
    const userRecord = this.userActivity.get(userId);

    if (!userRecord) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    const daysRemaining = this.getDaysUntilExpiration(userId);

    return {
      success: true,
      user: {
        userId,
        lastActivity: userRecord.lastActivity,
        totalActivities: userRecord.activities.length,
        score: userRecord.score,
        rank: userRecord.rank || 'Unranked',
        hasImmunity: this.hasImmunity(userId),
        daysUntilExpiration: daysRemaining,
        status: daysRemaining === null ? 'immune' : daysRemaining > 7 ? 'active' : daysRemaining > 0 ? 'warning' : 'expired',
        recentActivities: userRecord.activities.slice(-10).reverse() // Last 10 activities
      }
    };
  }

  /**
   * Update user leaderboard rank (called by leaderboard system)
   * @param {string} userId - User ID
   * @param {number} rank - Leaderboard rank
   */
  async updateUserRank(userId, rank) {
    const userRecord = this.userActivity.get(userId);

    if (!userRecord) {
      // Create new record if doesn't exist
      this.userActivity.set(userId, {
        userId,
        lastActivity: null,
        activities: [],
        score: 0,
        rank,
        warnings: []
      });
    } else {
      userRecord.rank = rank;
    }

    await this._save();

    return {
      success: true,
      rank,
      hasImmunity: this.hasImmunity(userId)
    };
  }

  /**
   * Get activity statistics
   */
  async getStats() {
    const totalUsers = this.userActivity.size;
    const activeUsers = Array.from(this.userActivity.values()).filter(u => this.isUserActive(u.userId)).length;
    const immuneUsers = Array.from(this.userActivity.values()).filter(u => this.hasImmunity(u.userId)).length;
    const expiredUsers = await this.getExpiredUsers();
    const warningUsers = await this.getUsersNeedingWarnings();

    return {
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        immuneUsers,
        expiredUsers: expiredUsers.length,
        warningUsers: warningUsers.length,
        expirationPolicy: `${this.config.expirationDays} days`,
        immunityThreshold: `Top ${this.config.leaderboardImmunityRank}`
      }
    };
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Save activity log to disk
   */
  async _save() {
    const data = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      users: Object.fromEntries(this.userActivity)
    };

    // Ensure directory exists
    const dir = path.dirname(this.activityLogPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(this.activityLogPath, JSON.stringify(data, null, 2));
  }
}

module.exports = ActivityValidator;

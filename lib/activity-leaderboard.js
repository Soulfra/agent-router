/**
 * Activity Leaderboard / Hiscore System
 *
 * Gaming-style leaderboard tracking user activity across all 12 brands.
 * Top performers get subdomain immunity (never expire).
 *
 * Features:
 * - Global leaderboard (all users across all brands)
 * - Per-brand leaderboards
 * - Weekly/monthly/all-time rankings
 * - Achievements & badges
 * - Streak tracking
 * - Top 1000 get immunity from subdomain expiration
 */

const fs = require('fs').promises;
const path = require('path');

class ActivityLeaderboard {
  constructor(options = {}) {
    this.leaderboardPath = options.leaderboardPath || path.join(__dirname, '..', 'data', 'leaderboard.json');
    this.players = new Map(); // userId => player data
    this.rankings = {
      global: [],
      weekly: [],
      monthly: [],
      perBrand: {} // brandDomain => []
    };

    this.config = {
      immunityThreshold: options.immunityThreshold || 1000, // Top 1000 = immunity
      achievementThresholds: options.achievementThresholds || {
        commits: [10, 50, 100, 500, 1000],
        logins: [7, 30, 90, 365],
        score: [100, 500, 1000, 5000, 10000]
      },
      streakBonusMultiplier: options.streakBonusMultiplier || 1.1, // 10% bonus per streak day
      updateInterval: options.updateInterval || 3600000, // Recalculate rankings every hour
      ...options
    };

    this.brandDomains = [
      'soulfra.com',
      'calriven.com',
      'deathtodata.com',
      'finishthisidea.com',
      'finishthisrepo.com',
      'ipomyagent.com',
      'hollowtown.com',
      'coldstartkit.com',
      'brandaidkit.com',
      'dealordelete.com',
      'saveorsink.com',
      'cringeproof.com'
    ];

    console.log('[ActivityLeaderboard] Initialized');
  }

  /**
   * Initialize leaderboard (load from disk)
   */
  async init() {
    try {
      const data = await fs.readFile(this.leaderboardPath, 'utf8');
      const parsed = JSON.parse(data);

      // Load player data
      Object.entries(parsed.players || {}).forEach(([userId, playerData]) => {
        this.players.set(userId, playerData);
      });

      this.rankings = parsed.rankings || this.rankings;

      console.log(`[ActivityLeaderboard] Loaded ${this.players.size} players`);

      // Recalculate rankings
      await this.recalculateRankings();

    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[ActivityLeaderboard] No leaderboard found, starting fresh');
        await this._save();
      } else {
        throw error;
      }
    }
  }

  /**
   * Record player activity (called by ActivityValidator)
   * @param {string} userId - User ID
   * @param {number} score - Score to add
   * @param {string} brandDomain - Brand where activity occurred
   * @param {object} metadata - Activity metadata
   */
  async recordActivity(userId, score, brandDomain, metadata = {}) {
    // Get or create player
    if (!this.players.has(userId)) {
      this.players.set(userId, {
        userId,
        username: metadata.username || userId,
        totalScore: 0,
        weeklyScore: 0,
        monthlyScore: 0,
        globalRank: null,
        weeklyRank: null,
        monthlyRank: null,
        brandScores: {}, // Per-brand scores
        achievements: [],
        streakDays: 0,
        lastActivityDate: null,
        joinedAt: new Date().toISOString()
      });
    }

    const player = this.players.get(userId);

    // Add score
    player.totalScore += score;

    // Track per-brand score
    if (brandDomain) {
      if (!player.brandScores[brandDomain]) {
        player.brandScores[brandDomain] = 0;
      }
      player.brandScores[brandDomain] += score;
    }

    // Update streak
    this._updateStreak(player);

    // Check for new achievements
    const newAchievements = this._checkAchievements(player, metadata);

    // Save
    await this._save();

    return {
      success: true,
      player: {
        userId,
        totalScore: player.totalScore,
        globalRank: player.globalRank,
        streakDays: player.streakDays,
        newAchievements
      }
    };
  }

  /**
   * Recalculate all rankings
   */
  async recalculateRankings() {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Reset weekly/monthly scores
    this.players.forEach(player => {
      player.weeklyScore = 0;
      player.monthlyScore = 0;
    });

    // Global rankings (all-time)
    this.rankings.global = Array.from(this.players.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((player, index) => {
        player.globalRank = index + 1;
        return {
          rank: index + 1,
          userId: player.userId,
          username: player.username,
          score: player.totalScore,
          streakDays: player.streakDays,
          hasImmunity: (index + 1) <= this.config.immunityThreshold
        };
      });

    // Weekly rankings
    this.rankings.weekly = Array.from(this.players.values())
      .sort((a, b) => b.weeklyScore - a.totalScore) // Use total for now, implement weekly tracking later
      .slice(0, 100)
      .map((player, index) => ({
        rank: index + 1,
        userId: player.userId,
        username: player.username,
        score: player.weeklyScore || player.totalScore
      }));

    // Monthly rankings
    this.rankings.monthly = Array.from(this.players.values())
      .sort((a, b) => b.monthlyScore - a.totalScore)
      .slice(0, 100)
      .map((player, index) => ({
        rank: index + 1,
        userId: player.userId,
        username: player.username,
        score: player.monthlyScore || player.totalScore
      }));

    // Per-brand rankings
    this.brandDomains.forEach(brandDomain => {
      this.rankings.perBrand[brandDomain] = Array.from(this.players.values())
        .filter(p => p.brandScores[brandDomain] && p.brandScores[brandDomain] > 0)
        .sort((a, b) => (b.brandScores[brandDomain] || 0) - (a.brandScores[brandDomain] || 0))
        .slice(0, 50)
        .map((player, index) => ({
          rank: index + 1,
          userId: player.userId,
          username: player.username,
          score: player.brandScores[brandDomain]
        }));
    });

    await this._save();

    return { success: true, recalculatedAt: new Date().toISOString() };
  }

  /**
   * Get global leaderboard
   * @param {number} limit - Number of players to return
   */
  getGlobalLeaderboard(limit = 100) {
    return {
      success: true,
      leaderboard: this.rankings.global.slice(0, limit),
      total: this.rankings.global.length,
      immunityThreshold: this.config.immunityThreshold
    };
  }

  /**
   * Get weekly leaderboard
   */
  getWeeklyLeaderboard(limit = 100) {
    return {
      success: true,
      leaderboard: this.rankings.weekly.slice(0, limit),
      period: 'weekly'
    };
  }

  /**
   * Get monthly leaderboard
   */
  getMonthlyLeaderboard(limit = 100) {
    return {
      success: true,
      leaderboard: this.rankings.monthly.slice(0, limit),
      period: 'monthly'
    };
  }

  /**
   * Get brand-specific leaderboard
   * @param {string} brandDomain - Brand domain (e.g., soulfra.com)
   */
  getBrandLeaderboard(brandDomain, limit = 50) {
    const leaderboard = this.rankings.perBrand[brandDomain] || [];

    return {
      success: true,
      brand: brandDomain,
      leaderboard: leaderboard.slice(0, limit),
      total: leaderboard.length
    };
  }

  /**
   * Get player profile
   * @param {string} userId - User ID
   */
  getPlayerProfile(userId) {
    const player = this.players.get(userId);

    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    return {
      success: true,
      player: {
        userId: player.userId,
        username: player.username,
        totalScore: player.totalScore,
        globalRank: player.globalRank,
        weeklyRank: player.weeklyRank,
        monthlyRank: player.monthlyRank,
        hasImmunity: player.globalRank && player.globalRank <= this.config.immunityThreshold,
        streakDays: player.streakDays,
        achievements: player.achievements,
        brandScores: player.brandScores,
        joinedAt: player.joinedAt
      }
    };
  }

  /**
   * Get player's rank
   * @param {string} userId - User ID
   * @returns {number|null} Global rank
   */
  getPlayerRank(userId) {
    const player = this.players.get(userId);
    return player ? player.globalRank : null;
  }

  /**
   * Check if player has immunity
   * @param {string} userId - User ID
   * @returns {boolean} True if in top N (immunity threshold)
   */
  hasImmunity(userId) {
    const rank = this.getPlayerRank(userId);
    return rank !== null && rank <= this.config.immunityThreshold;
  }

  /**
   * Get leaderboard statistics
   */
  async getStats() {
    const totalPlayers = this.players.size;
    const immunePlayers = this.rankings.global.filter(p => p.hasImmunity).length;
    const activePlayers = this.rankings.global.filter(p => p.score > 0).length;

    return {
      success: true,
      stats: {
        totalPlayers,
        activePlayers,
        immunePlayers,
        immunityThreshold: this.config.immunityThreshold,
        topScore: this.rankings.global[0]?.score || 0,
        avgScore: totalPlayers > 0 ?
          Math.round(this.rankings.global.reduce((sum, p) => sum + p.score, 0) / totalPlayers) : 0
      }
    };
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Update player streak
   */
  _updateStreak(player) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!player.lastActivityDate) {
      player.streakDays = 1;
      player.lastActivityDate = today.toISOString();
      return;
    }

    const lastActivity = new Date(player.lastActivityDate);
    const lastActivityDay = new Date(lastActivity.getFullYear(), lastActivity.getMonth(), lastActivity.getDate());

    const daysDiff = Math.floor((today - lastActivityDay) / (1000 * 60 * 60 * 24));

    if (daysDiff === 0) {
      // Same day, no change
      return;
    } else if (daysDiff === 1) {
      // Next day, increment streak
      player.streakDays++;
    } else {
      // Streak broken
      player.streakDays = 1;
    }

    player.lastActivityDate = today.toISOString();
  }

  /**
   * Check for new achievements
   */
  _checkAchievements(player, metadata) {
    const newAchievements = [];

    // Streak achievements
    if (player.streakDays === 7 && !player.achievements.includes('7day_streak')) {
      newAchievements.push('7day_streak');
      player.achievements.push('7day_streak');
    }

    if (player.streakDays === 30 && !player.achievements.includes('30day_streak')) {
      newAchievements.push('30day_streak');
      player.achievements.push('30day_streak');
    }

    // Score achievements
    this.config.achievementThresholds.score.forEach(threshold => {
      const achievementId = `score_${threshold}`;
      if (player.totalScore >= threshold && !player.achievements.includes(achievementId)) {
        newAchievements.push(achievementId);
        player.achievements.push(achievementId);
      }
    });

    // Top rank achievements
    if (player.globalRank === 1 && !player.achievements.includes('rank_1')) {
      newAchievements.push('rank_1');
      player.achievements.push('rank_1');
    }

    if (player.globalRank <= 10 && !player.achievements.includes('top_10')) {
      newAchievements.push('top_10');
      player.achievements.push('top_10');
    }

    if (player.globalRank <= 100 && !player.achievements.includes('top_100')) {
      newAchievements.push('top_100');
      player.achievements.push('top_100');
    }

    return newAchievements;
  }

  /**
   * Save leaderboard to disk
   */
  async _save() {
    const data = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      players: Object.fromEntries(this.players),
      rankings: this.rankings
    };

    // Ensure directory exists
    const dir = path.dirname(this.leaderboardPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(this.leaderboardPath, JSON.stringify(data, null, 2));
  }
}

module.exports = ActivityLeaderboard;

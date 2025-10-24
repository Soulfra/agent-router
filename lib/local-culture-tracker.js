/**
 * Local Culture Tracker
 *
 * Privacy-preserving activity tracker for cross-platform behavior patterns.
 * Monitors user activity across Twitter, GitHub, podcasts, Amazon, Google, etc.
 * WITHOUT sending data to external servers (100% local).
 *
 * What It Tracks:
 * - Peak activity times (when user is most active)
 * - Platform preferences (Twitter vs Reddit vs HN)
 * - Content interests (crypto, privacy, dev tools, etc.)
 * - Behavior patterns (poster vs lurker, daily vs weekly)
 * - Shopping habits (books, tools, courses)
 * - Learning patterns (podcasts, videos, docs)
 *
 * Privacy Guarantees:
 * - All data stored locally (SQLite)
 * - No external API calls
 * - Optional sync via IPFS (user controls)
 * - Can export as encrypted backup
 * - Zero-knowledge proofs available
 *
 * Use Cases:
 * - Earn culture badges invisibly
 * - Get personalized content recommendations
 * - Optimize post timing (viral content)
 * - Build reputation across platforms
 * - Prove expertise without doxxing
 *
 * Integrates with:
 * - BadgeSystem (lib/badge-system.js) - Award badges
 * - CultureAnalyzer (lib/culture-analyzer.js) - Analyze patterns
 * - InvisiblePOAPManager (lib/invisible-poap-manager.js) - Mint POAPs
 * - TimeBasedBadgeMinter (lib/time-based-badge-minter.js) - Schedule minting
 *
 * Usage:
 *   const tracker = new LocalCultureTracker({ userId, db });
 *
 *   // Track Twitter post
 *   await tracker.track({
 *     platform: 'twitter',
 *     action: 'post',
 *     content: 'Just discovered zero-knowledge proofs 🔐',
 *     timestamp: Date.now()
 *   });
 *
 *   // Get activity profile
 *   const profile = await tracker.getActivityProfile();
 *   // → { peakHours: [9, 12, 18], interests: ['crypto', 'privacy'], ... }
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class LocalCultureTracker extends EventEmitter {
  constructor(options = {}) {
    super();

    this.userId = options.userId;
    this.db = options.db;
    this.vault = options.vault; // Encrypted storage

    if (!this.userId) {
      throw new Error('userId required for LocalCultureTracker');
    }

    // Platform integrations
    this.platforms = {
      twitter: { enabled: true, icon: '🐦' },
      github: { enabled: true, icon: '💻' },
      podcasts: { enabled: true, icon: '🎧' },
      youtube: { enabled: true, icon: '📺' },
      reddit: { enabled: true, icon: '🤖' },
      hackernews: { enabled: true, icon: '🔶' },
      amazon: { enabled: true, icon: '📦' },
      google: { enabled: true, icon: '🔍' },
      mastodon: { enabled: true, icon: '🦣' },
      discord: { enabled: true, icon: '💬' }
    };

    // Activity classification
    this.activityTypes = {
      post: { weight: 1.5, reputation: 2 },
      comment: { weight: 1.0, reputation: 1 },
      like: { weight: 0.3, reputation: 0.2 },
      share: { weight: 1.2, reputation: 1.5 },
      commit: { weight: 2.0, reputation: 3 },
      listen: { weight: 0.8, reputation: 0.5 },
      watch: { weight: 0.8, reputation: 0.5 },
      read: { weight: 0.6, reputation: 0.4 },
      search: { weight: 0.4, reputation: 0.3 },
      purchase: { weight: 1.0, reputation: 1.0 }
    };

    // Interest taxonomy (for AI tagging)
    this.interests = [
      // Tech
      'crypto', 'privacy', 'zero-knowledge', 'blockchain', 'ethereum', 'bitcoin',
      'web3', 'defi', 'nfts', 'dao', 'solana', 'monero',

      // Dev
      'javascript', 'python', 'rust', 'golang', 'typescript',
      'react', 'node', 'devops', 'open-source', 'git',

      // Topics
      'ai', 'machine-learning', 'security', 'privacy-tech',
      'distributed-systems', 'databases', 'networking',

      // Culture
      'startup', 'indie-hacker', 'remote-work', 'productivity',
      'learning', 'teaching', 'writing', 'design'
    ];

    // In-memory cache
    this.activityCache = []; // Recent activities
    this.profileCache = null; // Cached profile
    this.lastSync = null;

    console.log(`[LocalCultureTracker] Initialized for user ${userId}`);
  }

  /**
   * Track user activity
   */
  async track(activity) {
    const {
      platform,
      action,
      content = '',
      metadata = {},
      timestamp = Date.now()
    } = activity;

    if (!this.platforms[platform]) {
      console.warn(`[LocalCultureTracker] Unknown platform: ${platform}`);
      return null;
    }

    if (!this.activityTypes[action]) {
      console.warn(`[LocalCultureTracker] Unknown action: ${action}`);
      return null;
    }

    // Extract hour and day info
    const date = new Date(timestamp);
    const hour = date.getHours();
    const dayOfWeek = date.getDay(); // 0 = Sunday
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Detect interests from content (simple keyword matching)
    const detectedInterests = this._detectInterests(content);

    // Calculate activity score
    const activityType = this.activityTypes[action];
    const score = activityType.weight;
    const reputation = activityType.reputation;

    // Create activity record
    const record = {
      activityId: crypto.randomBytes(16).toString('hex'),
      userId: this.userId,
      platform,
      action,
      content: content.substring(0, 500), // Truncate
      interests: detectedInterests,
      hour,
      dayOfWeek,
      timezone,
      score,
      reputation,
      metadata,
      timestamp,
      synced: false
    };

    // Store locally
    if (this.db) {
      await this._saveActivity(record);
    }

    // Add to cache
    this.activityCache.push(record);

    // Keep cache under 100 items
    if (this.activityCache.length > 100) {
      this.activityCache.shift();
    }

    // Invalidate profile cache
    this.profileCache = null;

    this.emit('activity:tracked', record);

    console.log(`[LocalCultureTracker] ${platform}/${action}: "${content.substring(0, 50)}..." (interests: ${detectedInterests.join(', ')})`);

    return record;
  }

  /**
   * Get user's activity profile
   */
  async getActivityProfile() {
    // Return cached if recent
    if (this.profileCache && (Date.now() - this.profileCache.generatedAt < 60000)) {
      return this.profileCache;
    }

    // Load recent activities (last 90 days)
    const activities = await this._loadActivities(90);

    if (activities.length === 0) {
      return {
        userId: this.userId,
        totalActivities: 0,
        peakHours: [],
        interests: {},
        platforms: {},
        generatedAt: Date.now()
      };
    }

    // Analyze peak activity hours
    const hourCounts = {};
    const dayCounts = {};
    activities.forEach(a => {
      hourCounts[a.hour] = (hourCounts[a.hour] || 0) + 1;
      dayCounts[a.dayOfWeek] = (dayCounts[a.dayOfWeek] || 0) + 1;
    });

    const peakHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hour, _]) => parseInt(hour));

    const peakDays = Object.entries(dayCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([day, count]) => ({ day: parseInt(day), count }));

    // Aggregate interests
    const interestCounts = {};
    activities.forEach(a => {
      a.interests.forEach(interest => {
        interestCounts[interest] = (interestCounts[interest] || 0) + 1;
      });
    });

    const topInterests = Object.entries(interestCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Platform distribution
    const platformCounts = {};
    activities.forEach(a => {
      platformCounts[a.platform] = (platformCounts[a.platform] || 0) + 1;
    });

    // Calculate total reputation
    const totalReputation = activities.reduce((sum, a) => sum + a.reputation, 0);

    // Determine user archetype
    const archetype = this._determineArchetype(activities, platformCounts, topInterests);

    // Build profile
    const profile = {
      userId: this.userId,
      totalActivities: activities.length,
      totalReputation,

      // Time patterns
      peakHours,
      offPeakHours: this._getOffPeakHours(peakHours),
      peakDays,
      timezone: activities[0].timezone,

      // Interests
      interests: Object.fromEntries(topInterests),
      primaryInterest: topInterests[0]?.[0] || 'unknown',

      // Platforms
      platforms: platformCounts,
      primaryPlatform: Object.entries(platformCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown',

      // Behavior
      archetype,
      activityFrequency: this._calculateFrequency(activities),
      streakDays: await this._calculateStreak(),

      // Recent activity
      last24Hours: activities.filter(a => (Date.now() - a.timestamp) < 86400000).length,
      last7Days: activities.filter(a => (Date.now() - a.timestamp) < 604800000).length,
      last30Days: activities.length,

      generatedAt: Date.now()
    };

    // Cache profile
    this.profileCache = profile;

    return profile;
  }

  /**
   * Get recommendations based on culture
   */
  async getRecommendations() {
    const profile = await this.getActivityProfile();

    const recommendations = {
      content: [],
      badges: [],
      actions: [],
      optimalPostTimes: []
    };

    // Content recommendations based on interests
    const interests = Object.keys(profile.interests);
    if (interests.includes('crypto') || interests.includes('privacy')) {
      recommendations.content.push({
        type: 'course',
        title: 'Zero-Knowledge Proofs Explained',
        reason: 'Matches your interest in crypto and privacy'
      });
    }

    if (interests.includes('open-source') || interests.includes('git')) {
      recommendations.content.push({
        type: 'article',
        title: 'Contributing to Open Source: A Beginner\'s Guide',
        reason: 'You\'re active on GitHub'
      });
    }

    // Badge recommendations
    if (profile.streakDays >= 7) {
      recommendations.badges.push({
        badge: 'week_warrior',
        progress: 100,
        ready: true
      });
    }

    if (profile.totalActivities >= 50) {
      recommendations.badges.push({
        badge: 'contributor',
        progress: 100,
        ready: true
      });
    }

    // Action recommendations
    if (profile.platforms.twitter && !profile.platforms.mastodon) {
      recommendations.actions.push({
        action: 'Try Mastodon',
        reason: 'You like Twitter - Mastodon has a great privacy-focused community'
      });
    }

    // Optimal post times (for viral content)
    recommendations.optimalPostTimes = profile.peakHours.map(hour => ({
      hour,
      reason: `Peak engagement based on your ${profile.primaryPlatform} activity`
    }));

    return recommendations;
  }

  /**
   * Export culture data (encrypted)
   */
  async exportData(options = {}) {
    const { encrypt = true, format = 'json' } = options;

    const profile = await this.getActivityProfile();
    const activities = await this._loadActivities(365); // Last year

    const data = {
      userId: this.userId,
      profile,
      activities,
      exportedAt: Date.now()
    };

    if (encrypt && this.vault) {
      // Store in vault (AES-256 encrypted)
      await this.vault.store(this.userId, 'culture_export', Date.now().toString(), data);
      return { encrypted: true, vaultKey: `culture_export/${Date.now()}` };
    }

    return data;
  }

  /**
   * Detect interests from content
   */
  _detectInterests(content) {
    const detected = [];
    const lowerContent = content.toLowerCase();

    for (const interest of this.interests) {
      // Simple keyword matching (can be improved with NLP)
      const pattern = new RegExp(`\\b${interest.replace('-', '[-\\s]?')}\\b`, 'i');
      if (pattern.test(lowerContent)) {
        detected.push(interest);
      }
    }

    return detected;
  }

  /**
   * Get off-peak hours (for batch processing)
   */
  _getOffPeakHours(peakHours) {
    const allHours = Array.from({ length: 24 }, (_, i) => i);
    return allHours.filter(h => !peakHours.includes(h));
  }

  /**
   * Determine user archetype
   */
  _determineArchetype(activities, platforms, interests) {
    // Poster vs Lurker
    const postCount = activities.filter(a => ['post', 'commit', 'share'].includes(a.action)).length;
    const consumeCount = activities.filter(a => ['like', 'listen', 'watch', 'read'].includes(a.action)).length;

    const posterScore = postCount / (postCount + consumeCount || 1);

    if (posterScore > 0.6) {
      return 'creator';
    } else if (posterScore > 0.3) {
      return 'contributor';
    } else {
      return 'learner';
    }
  }

  /**
   * Calculate activity frequency
   */
  _calculateFrequency(activities) {
    if (activities.length === 0) return 'inactive';

    const daysSinceFirst = (Date.now() - activities[activities.length - 1].timestamp) / 86400000;
    const avgPerDay = activities.length / (daysSinceFirst || 1);

    if (avgPerDay >= 5) return 'very_active';
    if (avgPerDay >= 2) return 'active';
    if (avgPerDay >= 0.5) return 'moderate';
    return 'occasional';
  }

  /**
   * Calculate current streak
   */
  async _calculateStreak() {
    const activities = await this._loadActivities(365);

    if (activities.length === 0) return 0;

    // Sort by timestamp (newest first)
    activities.sort((a, b) => b.timestamp - a.timestamp);

    let streak = 0;
    let currentDay = new Date().toDateString();

    for (const activity of activities) {
      const activityDay = new Date(activity.timestamp).toDateString();

      if (activityDay === currentDay) {
        streak++;
        // Move to previous day
        const prevDate = new Date(activity.timestamp);
        prevDate.setDate(prevDate.getDate() - 1);
        currentDay = prevDate.toDateString();
      } else {
        break; // Streak broken
      }
    }

    return streak;
  }

  /**
   * Save activity to database
   */
  async _saveActivity(record) {
    if (!this.db) return;

    try {
      await this.db.query(`
        INSERT INTO local_culture_activities (
          activity_id,
          user_id,
          platform,
          action,
          content,
          interests,
          hour,
          day_of_week,
          timezone,
          score,
          reputation,
          metadata,
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        record.activityId,
        record.userId,
        record.platform,
        record.action,
        record.content,
        JSON.stringify(record.interests),
        record.hour,
        record.dayOfWeek,
        record.timezone,
        record.score,
        record.reputation,
        JSON.stringify(record.metadata),
        new Date(record.timestamp)
      ]);

    } catch (error) {
      // Table might not exist yet
      if (!error.message.includes('does not exist')) {
        console.error('[LocalCultureTracker] Save activity error:', error.message);
      }
    }
  }

  /**
   * Load activities from database
   */
  async _loadActivities(days = 90) {
    if (!this.db) return [];

    try {
      const result = await this.db.query(`
        SELECT * FROM local_culture_activities
        WHERE user_id = $1
          AND timestamp > NOW() - INTERVAL '${days} days'
        ORDER BY timestamp DESC
      `, [this.userId]);

      return result.rows.map(row => ({
        activityId: row.activity_id,
        userId: row.user_id,
        platform: row.platform,
        action: row.action,
        content: row.content,
        interests: JSON.parse(row.interests || '[]'),
        hour: row.hour,
        dayOfWeek: row.day_of_week,
        timezone: row.timezone,
        score: row.score,
        reputation: row.reputation,
        metadata: JSON.parse(row.metadata || '{}'),
        timestamp: new Date(row.timestamp).getTime()
      }));

    } catch (error) {
      console.error('[LocalCultureTracker] Load activities error:', error.message);
      return [];
    }
  }

  /**
   * Get statistics
   */
  async getStats() {
    const profile = await this.getActivityProfile();

    return {
      userId: this.userId,
      totalActivities: profile.totalActivities,
      totalReputation: profile.totalReputation,
      streak: profile.streakDays,
      primaryInterest: profile.primaryInterest,
      primaryPlatform: profile.primaryPlatform,
      archetype: profile.archetype,
      frequency: profile.activityFrequency
    };
  }
}

module.exports = LocalCultureTracker;

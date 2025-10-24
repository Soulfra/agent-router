/**
 * Cookie Origin Story Engine
 *
 * CryptoZombies-style gamification for privacy awareness.
 * Turns boring cookie tracking into engaging storytelling.
 *
 * Features:
 * - Analyzes cookie snapshots to build "origin stories"
 * - Creates achievements: "Cookie Miner", "Tracker Slayer", "Privacy Ninja"
 * - Gamifies privacy journey with levels and leaderboards
 * - Viral sharing: "My first tracking cookie was..."
 *
 * Just like CryptoZombies made Solidity fun by building zombie armies,
 * we make privacy fun by archaeology of your tracking history.
 *
 * Example:
 *   const engine = new CookieOriginStoryEngine({ db });
 *   const story = await engine.buildOriginStory(userId, cookieSnapshot);
 *   // { firstCookie, totalEncountered, privacyScore, achievements, narrative }
 */

const crypto = require('crypto');

class CookieOriginStoryEngine {
  constructor(options = {}) {
    this.db = options.db;
    this.verbose = options.verbose || false;

    // Achievement definitions
    this.achievements = {
      // Discovery achievements
      cookieMiner: {
        id: 'cookie_miner',
        name: 'Cookie Miner ⛏️',
        description: 'Discover 100 unique cookies',
        threshold: 100,
        xp: 50
      },
      trackerArchaeologist: {
        id: 'tracker_archaeologist',
        name: 'Tracker Archaeologist 🏺',
        description: 'Find cookies from 10+ different domains',
        threshold: 10,
        xp: 75
      },
      ancientCookie: {
        id: 'ancient_cookie',
        name: 'Ancient Cookie 📜',
        description: 'Find a cookie older than 5 years',
        threshold: 1,
        xp: 100
      },

      // Privacy achievements
      trackerSlayer: {
        id: 'tracker_slayer',
        name: 'Tracker Slayer ⚔️',
        description: 'Block 500 tracking cookies',
        threshold: 500,
        xp: 100
      },
      privacyNinja: {
        id: 'privacy_ninja',
        name: 'Privacy Ninja 🥷',
        description: 'Use 3+ privacy tools',
        threshold: 3,
        xp: 150
      },
      ghostMode: {
        id: 'ghost_mode',
        name: 'Ghost Mode 👻',
        description: 'Have fewer than 10 cookies',
        threshold: 1,
        xp: 200
      },

      // Awareness achievements
      cookieConnoisseur: {
        id: 'cookie_connoisseur',
        name: 'Cookie Connoisseur 🍪',
        description: 'Identify 50+ cookie types',
        threshold: 50,
        xp: 125
      },
      dataDetective: {
        id: 'data_detective',
        name: 'Data Detective 🔍',
        description: 'Track your data across 25+ sites',
        threshold: 25,
        xp: 175
      }
    };

    // Cookie type database (for storytelling)
    this.cookieTypes = {
      // Analytics
      '_ga': { name: 'Google Analytics', type: 'analytics', company: 'Google', malicious: false },
      '_gid': { name: 'Google Analytics ID', type: 'analytics', company: 'Google', malicious: false },
      '__utma': { name: 'Google Analytics (Legacy)', type: 'analytics', company: 'Google', malicious: false },
      '__utmz': { name: 'Google Analytics Campaign', type: 'analytics', company: 'Google', malicious: false },

      // Advertising
      '_fbp': { name: 'Facebook Pixel', type: 'advertising', company: 'Facebook', malicious: false },
      'IDE': { name: 'DoubleClick', type: 'advertising', company: 'Google', malicious: false },
      'test_cookie': { name: 'DoubleClick Test', type: 'advertising', company: 'Google', malicious: false },

      // Social
      'datr': { name: 'Facebook Login', type: 'social', company: 'Facebook', malicious: false },
      'fr': { name: 'Facebook Ads', type: 'advertising', company: 'Facebook', malicious: false },

      // Session
      'PHPSESSID': { name: 'PHP Session', type: 'session', company: 'Various', malicious: false },
      'JSESSIONID': { name: 'Java Session', type: 'session', company: 'Various', malicious: false }
    };

    console.log('[CookieOriginStoryEngine] Initialized');
  }

  /**
   * Build complete origin story for user
   */
  async buildOriginStory(userId, cookieSnapshot) {
    const story = {
      userId,
      timestamp: new Date().toISOString(),
      firstCookie: null,
      totalEncountered: 0,
      trackersBlocked: 0,
      privacyScore: 0,
      level: 1,
      xp: 0,
      achievements: [],
      timeline: [],
      narrative: ''
    };

    try {
      // Extract cookies from snapshot
      const cookies = this.extractCookiesFromSnapshot(cookieSnapshot);
      story.totalEncountered = cookies.length;

      // Find first/oldest cookie
      story.firstCookie = this.findFirstCookie(cookies);

      // Calculate privacy metrics
      story.trackersBlocked = this.countTrackersBl ocked(cookies);
      story.privacyScore = this.calculatePrivacyScore(cookies);

      // Check achievements
      story.achievements = await this.checkAchievements(userId, cookies);

      // Calculate level based on achievements
      story.xp = story.achievements.reduce((sum, a) => sum + a.xp, 0);
      story.level = Math.floor(story.xp / 100) + 1;

      // Build timeline
      story.timeline = this.buildTimeline(cookies);

      // Generate narrative
      story.narrative = this.generateNarrative(story);

      // Save to database if available
      if (this.db) {
        await this.saveOriginStory(userId, story);
      }

      return story;

    } catch (error) {
      console.error('[CookieOriginStoryEngine] Error building origin story:', error);
      throw error;
    }
  }

  /**
   * Extract cookies from snapshot (integrates with cookie-snapshot-manager.js)
   */
  extractCookiesFromSnapshot(snapshot) {
    if (!snapshot || !snapshot.originalCookies) {
      return [];
    }

    const cookies = [];

    for (const [name, value] of Object.entries(snapshot.originalCookies)) {
      const cookieInfo = this.cookieTypes[name] || {
        name: name,
        type: 'unknown',
        company: 'Unknown',
        malicious: false
      };

      cookies.push({
        name,
        value,
        ...cookieInfo,
        detectedAt: snapshot.snapshotTime || new Date().toISOString()
      });
    }

    return cookies;
  }

  /**
   * Find the "first" tracking cookie (oldest analytics/advertising cookie)
   */
  findFirstCookie(cookies) {
    // Filter for tracking cookies only
    const trackingCookies = cookies.filter(c =>
      c.type === 'analytics' || c.type === 'advertising'
    );

    if (trackingCookies.length === 0) {
      return null;
    }

    // For now, just return the first tracking cookie
    // TODO: Add actual timestamp parsing from cookie metadata
    const firstCookie = trackingCookies[0];

    return {
      name: firstCookie.name,
      type: firstCookie.type,
      company: firstCookie.company,
      detectedAt: firstCookie.detectedAt,
      estimatedAge: this.estimateCookieAge(firstCookie),
      narrative: this.generateFirstCookieNarrative(firstCookie)
    };
  }

  /**
   * Estimate cookie age (placeholder - would parse actual cookie timestamps in production)
   */
  estimateCookieAge(cookie) {
    // Placeholder: Randomly assign ages for demo
    const ageInDays = Math.floor(Math.random() * 2000) + 365; // 1-6 years
    const ageInYears = Math.floor(ageInDays / 365);
    const remainingDays = ageInDays % 365;

    return {
      days: ageInDays,
      formatted: `${ageInYears} years, ${remainingDays} days`
    };
  }

  /**
   * Generate narrative for first cookie encounter
   */
  generateFirstCookieNarrative(cookie) {
    const narratives = {
      analytics: [
        `Your digital footprint began with a ${cookie.company} tracker on a quiet day in ${this.estimateYear(cookie)}.`,
        `The first time ${cookie.company} saw you was through ${cookie.name}, marking the start of your tracked journey.`,
        `Like a digital archaeologist, you can trace your online history back to this ${cookie.company} cookie.`
      ],
      advertising: [
        `Your first advertising cookie was ${cookie.name} from ${cookie.company}, the beginning of personalized ads.`,
        `${cookie.company} was the first to "know" you through ${cookie.name}, opening the floodgates to targeted marketing.`,
        `The ad tech industry met you through ${cookie.name}, a ${cookie.company} identifier.`
      ],
      social: [
        `Your social web presence started with ${cookie.company}'s ${cookie.name} cookie.`,
        `${cookie.company} connected your identity across the web using ${cookie.name}.`
      ]
    };

    const options = narratives[cookie.type] || [`Your first cookie was ${cookie.name} from ${cookie.company}.`];
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Estimate year from cookie age
   */
  estimateYear(cookie) {
    const age = this.estimateCookieAge(cookie);
    const yearsAgo = Math.floor(age.days / 365);
    const year = new Date().getFullYear() - yearsAgo;
    return year;
  }

  /**
   * Count how many trackers user has blocked
   */
  countTrackersBlocked(cookies) {
    // Placeholder: Would integrate with actual privacy tool data
    // For demo, estimate based on cookies found
    const trackingCookies = cookies.filter(c =>
      c.type === 'analytics' || c.type === 'advertising'
    );

    // Assume user blocked 70% of trackers (average for privacy-conscious users)
    return Math.floor(trackingCookies.length / 0.3 * 0.7);
  }

  /**
   * Calculate privacy score (0-100, higher is more private)
   */
  calculatePrivacyScore(cookies) {
    const trackingCookies = cookies.filter(c =>
      c.type === 'analytics' || c.type === 'advertising'
    );

    // Score based on:
    // - Fewer cookies = higher score
    // - Fewer tracking cookies = higher score
    // - More session-only cookies = higher score

    const totalCookies = cookies.length;
    const trackingRatio = trackingCookies.length / Math.max(totalCookies, 1);

    let score = 100;

    // Penalize for high total cookie count
    if (totalCookies > 100) score -= 20;
    else if (totalCookies > 50) score -= 10;

    // Penalize for high tracking ratio
    score -= Math.floor(trackingRatio * 50);

    // Ensure score is 0-100
    score = Math.max(0, Math.min(100, score));

    return score;
  }

  /**
   * Check which achievements user has unlocked
   */
  async checkAchievements(userId, cookies) {
    const unlocked = [];

    const stats = {
      totalCookies: cookies.length,
      uniqueDomains: new Set(cookies.map(c => c.company)).size,
      trackersBlocked: this.countTrackersBlocked(cookies),
      cookieTypes: new Set(cookies.map(c => c.type)).size
    };

    // Cookie Miner
    if (stats.totalCookies >= this.achievements.cookieMiner.threshold) {
      unlocked.push({
        ...this.achievements.cookieMiner,
        unlockedAt: new Date().toISOString()
      });
    }

    // Tracker Archaeologist
    if (stats.uniqueDomains >= this.achievements.trackerArchaeologist.threshold) {
      unlocked.push({
        ...this.achievements.trackerArchaeologist,
        unlockedAt: new Date().toISOString()
      });
    }

    // Tracker Slayer
    if (stats.trackersBlocked >= this.achievements.trackerSlayer.threshold) {
      unlocked.push({
        ...this.achievements.trackerSlayer,
        unlockedAt: new Date().toISOString()
      });
    }

    // Ghost Mode (< 10 cookies)
    if (stats.totalCookies < 10) {
      unlocked.push({
        ...this.achievements.ghostMode,
        unlockedAt: new Date().toISOString()
      });
    }

    // Cookie Connoisseur
    if (stats.cookieTypes >= this.achievements.cookieConnoisseur.threshold) {
      unlocked.push({
        ...this.achievements.cookieConnoisseur,
        unlockedAt: new Date().toISOString()
      });
    }

    return unlocked;
  }

  /**
   * Build timeline of cookie encounters
   */
  buildTimeline(cookies) {
    // Group cookies by type
    const timeline = [];

    const byType = cookies.reduce((acc, cookie) => {
      acc[cookie.type] = (acc[cookie.type] || 0) + 1;
      return acc;
    }, {});

    for (const [type, count] of Object.entries(byType)) {
      timeline.push({
        type,
        count,
        percentage: Math.round((count / cookies.length) * 100)
      });
    }

    return timeline.sort((a, b) => b.count - a.count);
  }

  /**
   * Generate engaging narrative for origin story
   */
  generateNarrative(story) {
    const lines = [];

    lines.push('🍪 Your Cookie Origin Story\n');

    // First cookie narrative
    if (story.firstCookie) {
      lines.push('📍 First Tracking Cookie:');
      lines.push(`   - ${story.firstCookie.name} (${story.firstCookie.company})`);
      lines.push(`   - Detected: ${new Date(story.firstCookie.detectedAt).toLocaleDateString()}`);
      lines.push(`   - Estimated Age: ${story.firstCookie.estimatedAge.formatted}`);
      lines.push('');
      lines.push(`   "${story.firstCookie.narrative}"`);
      lines.push('');
    }

    // Privacy journey
    lines.push('🏆 Your Privacy Journey:');
    lines.push(`   - Total Cookies Encountered: ${story.totalEncountered.toLocaleString()}`);
    lines.push(`   - Trackers Blocked: ${story.trackersBlocked.toLocaleString()} (${Math.round((story.trackersBlocked / (story.trackersBlocked + story.totalEncountered)) * 100)}%)`);

    // Privacy score with letter grade
    const grade = story.privacyScore >= 90 ? 'A+' :
                  story.privacyScore >= 80 ? 'A' :
                  story.privacyScore >= 70 ? 'B' :
                  story.privacyScore >= 60 ? 'C' : 'D';
    lines.push(`   - Privacy Score: ${grade} (${story.privacyScore}/100)`);
    lines.push(`   - Level: ${story.level} (${story.xp} XP)`);
    lines.push('');

    // Achievements
    if (story.achievements.length > 0) {
      lines.push('🎯 Achievements Unlocked:');
      for (const achievement of story.achievements) {
        lines.push(`   ${achievement.name} - ${achievement.description}`);
      }
      lines.push('');
    }

    // Timeline
    if (story.timeline.length > 0) {
      lines.push('📊 Cookie Breakdown:');
      for (const item of story.timeline) {
        lines.push(`   - ${item.type}: ${item.count} (${item.percentage}%)`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Save origin story to database
   */
  async saveOriginStory(userId, story) {
    if (!this.db) {
      return;
    }

    try {
      await this.db.query(
        `INSERT INTO cookie_origin_stories (
          user_id,
          first_cookie,
          total_encountered,
          trackers_blocked,
          privacy_score,
          level,
          xp,
          achievements,
          timeline,
          narrative,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          first_cookie = EXCLUDED.first_cookie,
          total_encountered = EXCLUDED.total_encountered,
          trackers_blocked = EXCLUDED.trackers_blocked,
          privacy_score = EXCLUDED.privacy_score,
          level = EXCLUDED.level,
          xp = EXCLUDED.xp,
          achievements = EXCLUDED.achievements,
          timeline = EXCLUDED.timeline,
          narrative = EXCLUDED.narrative,
          updated_at = NOW()`,
        [
          userId,
          JSON.stringify(story.firstCookie),
          story.totalEncountered,
          story.trackersBlocked,
          story.privacyScore,
          story.level,
          story.xp,
          JSON.stringify(story.achievements),
          JSON.stringify(story.timeline),
          story.narrative
        ]
      );

    } catch (error) {
      console.error('[CookieOriginStoryEngine] Error saving origin story:', error);
    }
  }

  /**
   * Get leaderboard (top privacy scores)
   */
  async getLeaderboard(limit = 10) {
    if (!this.db) {
      return [];
    }

    try {
      const result = await this.db.query(
        `SELECT user_id, privacy_score, level, xp, trackers_blocked
         FROM cookie_origin_stories
         ORDER BY privacy_score DESC, level DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows;

    } catch (error) {
      console.error('[CookieOriginStoryEngine] Error fetching leaderboard:', error);
      return [];
    }
  }
}

module.exports = CookieOriginStoryEngine;

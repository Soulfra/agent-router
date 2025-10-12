/**
 * Verification Badge & Reputation System
 *
 * Inspired by Habbo Hotel checkmarks and gaming tier systems.
 * Users earn badges through consistent voting, email verification, and trust scores.
 */

const VERIFICATION_BADGES = {
  newcomer: {
    id: 'newcomer',
    icon: '👤',
    name: 'Newcomer',
    description: 'New to the community',
    color: '#94a3b8',
    requires: {
      votes: 0
    }
  },

  email_verified: {
    id: 'email_verified',
    icon: '✉️',
    name: 'Email Verified',
    description: 'Verified email address',
    color: '#3b82f6',
    requires: {
      email_verified: true
    }
  },

  contributor: {
    id: 'contributor',
    icon: '✓',
    name: 'Contributor',
    description: 'Active community member',
    color: '#10b981',
    requires: {
      votes: 10,
      trust_score: 0.3
    }
  },

  trusted_voter: {
    id: 'trusted_voter',
    icon: '✓✓',
    name: 'Trusted Voter',
    description: 'Highly reliable voter',
    color: '#059669',
    requires: {
      votes: 50,
      trust_score: 0.6,
      consistency: 0.7
    }
  },

  veteran: {
    id: 'veteran',
    icon: '⭐',
    name: 'Veteran',
    description: 'Long-time community member',
    color: '#f59e0b',
    requires: {
      votes: 200,
      days_active: 30,
      trust_score: 0.75
    }
  },

  legend: {
    id: 'legend',
    icon: '👑',
    name: 'Legend',
    description: 'Elite community contributor',
    color: '#ef4444',
    requires: {
      votes: 1000,
      days_active: 90,
      trust_score: 0.9,
      reputation: 0.95
    }
  },

  moderator: {
    id: 'moderator',
    icon: '🛡️',
    name: 'Moderator',
    description: 'Community moderator',
    color: '#8b5cf6',
    requires: {
      manual_grant: true
    }
  }
};

class BadgeSystem {
  constructor() {
    this.badges = VERIFICATION_BADGES;
  }

  /**
   * Calculate which badge a user has earned
   */
  calculateBadge(userStats) {
    const {
      votes = 0,
      trust_score = 0,
      consistency = 0,
      days_active = 0,
      reputation = 0,
      email_verified = false,
      is_moderator = false
    } = userStats;

    // Check from highest to lowest tier
    const badgeOrder = ['moderator', 'legend', 'veteran', 'trusted_voter', 'contributor', 'email_verified', 'newcomer'];

    for (const badgeId of badgeOrder) {
      const badge = this.badges[badgeId];

      if (this.meetsRequirements(userStats, badge.requires)) {
        return badge;
      }
    }

    // Default to newcomer
    return this.badges.newcomer;
  }

  /**
   * Check if user meets badge requirements
   */
  meetsRequirements(userStats, requirements) {
    for (const [key, value] of Object.entries(requirements)) {
      if (key === 'manual_grant') {
        if (!userStats.is_moderator) return false;
      } else if (userStats[key] === undefined || userStats[key] < value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get next badge and progress towards it
   */
  getNextBadge(userStats) {
    const currentBadge = this.calculateBadge(userStats);

    // Find next badge in tier
    const tierOrder = ['newcomer', 'email_verified', 'contributor', 'trusted_voter', 'veteran', 'legend'];
    const currentIndex = tierOrder.indexOf(currentBadge.id);

    if (currentIndex === -1 || currentIndex === tierOrder.length - 1) {
      return null; // At max tier
    }

    const nextBadge = this.badges[tierOrder[currentIndex + 1]];
    const progress = this.calculateProgress(userStats, nextBadge.requires);

    return {
      badge: nextBadge,
      progress,
      remaining: this.calculateRemaining(userStats, nextBadge.requires)
    };
  }

  /**
   * Calculate progress percentage towards next badge
   */
  calculateProgress(userStats, requirements) {
    let totalRequirements = 0;
    let metRequirements = 0;

    for (const [key, value] of Object.entries(requirements)) {
      if (key === 'manual_grant') continue;

      totalRequirements++;
      const userValue = userStats[key] || 0;

      if (typeof value === 'boolean') {
        if (userValue === value) metRequirements++;
      } else {
        const progress = Math.min(userValue / value, 1);
        metRequirements += progress;
      }
    }

    return totalRequirements > 0 ? (metRequirements / totalRequirements) * 100 : 0;
  }

  /**
   * Calculate what's remaining to unlock next badge
   */
  calculateRemaining(userStats, requirements) {
    const remaining = {};

    for (const [key, value] of Object.entries(requirements)) {
      if (key === 'manual_grant') continue;

      const userValue = userStats[key] || 0;

      if (typeof value === 'boolean') {
        if (userValue !== value) {
          remaining[key] = 'Required';
        }
      } else if (userValue < value) {
        remaining[key] = value - userValue;
      }
    }

    return remaining;
  }

  /**
   * Get all available badges
   */
  getAllBadges() {
    return Object.values(this.badges);
  }

  /**
   * Calculate trust score based on voting behavior
   */
  calculateTrustScore(voteHistory) {
    if (!voteHistory || voteHistory.length === 0) return 0;

    let score = 0.5; // Start at neutral

    // Factor 1: Consistency (not rapid-fire)
    const avgTimeBetween = this.calculateAvgTimeBetween(voteHistory);
    if (avgTimeBetween > 2000) score += 0.15; // Good pacing

    // Factor 2: Variety (voting for different items)
    const uniqueItems = new Set(voteHistory.map(v => v.winner_id)).size;
    const varietyRatio = uniqueItems / voteHistory.length;
    score += varietyRatio * 0.2;

    // Factor 3: Vote duration (thoughtful voting)
    const avgDuration = voteHistory.reduce((sum, v) => sum + (v.vote_duration_ms || 0), 0) / voteHistory.length;
    if (avgDuration > 1000 && avgDuration < 30000) {
      score += 0.15; // Thoughtful, not too slow
    }

    // Factor 4: No suspicious flags
    const suspiciousVotes = voteHistory.filter(v => v.is_suspicious).length;
    score -= (suspiciousVotes / voteHistory.length) * 0.5;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate average time between votes
   */
  calculateAvgTimeBetween(voteHistory) {
    if (voteHistory.length < 2) return 0;

    let totalTime = 0;
    for (let i = 1; i < voteHistory.length; i++) {
      const timeDiff = new Date(voteHistory[i].voted_at) - new Date(voteHistory[i - 1].voted_at);
      totalTime += timeDiff;
    }

    return totalTime / (voteHistory.length - 1);
  }
}

module.exports = BadgeSystem;

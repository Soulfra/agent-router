/**
 * Tier Progression System with Dual Thresholds
 *
 * Inspired by RuneScape's dual-metric system:
 * - Continuous accumulation (XP to 200M) = elo_rating
 * - Discrete levels (1-99) = rank
 * - Categorical tiers (Novice/Expert/Master) = tier
 *
 * Key Concept: Different entry/exit thresholds prevent "bouncing"
 * between tiers when score fluctuates near boundary.
 */

class TierProgressionSystem {
  constructor() {
    // Define tier thresholds with hysteresis
    this.tiers = [
      {
        name: 'Novice',
        level: 1,
        entryThreshold: 0,
        exitThreshold: 0,  // Can't drop below Novice
        color: '#8B4513',
        icon: '🌱',
        description: 'Just starting out'
      },
      {
        name: 'Apprentice',
        level: 2,
        entryThreshold: 1200,
        exitThreshold: 1150,  // Must drop to 1150 to exit (50pt buffer)
        color: '#A9A9A9',
        icon: '⚙️',
        description: 'Learning the basics'
      },
      {
        name: 'Intermediate',
        level: 3,
        entryThreshold: 1400,
        exitThreshold: 1350,  // Must drop to 1350 to exit (50pt buffer)
        color: '#4682B4',
        icon: '📈',
        description: 'Making progress'
      },
      {
        name: 'Advanced',
        level: 4,
        entryThreshold: 1600,
        exitThreshold: 1550,  // Must drop to 1550 to exit (50pt buffer)
        color: '#9370DB',
        icon: '💎',
        description: 'Above average'
      },
      {
        name: 'Expert',
        level: 5,
        entryThreshold: 1800,
        exitThreshold: 1750,  // Must drop to 1750 to exit (50pt buffer)
        color: '#FFD700',
        icon: '⭐',
        description: 'Highly skilled'
      },
      {
        name: 'Master',
        level: 6,
        entryThreshold: 2000,
        exitThreshold: 1950,  // Must drop to 1950 to exit (50pt buffer)
        color: '#FF6347',
        icon: '🔥',
        description: 'Elite performance'
      },
      {
        name: 'Grandmaster',
        level: 7,
        entryThreshold: 2200,
        exitThreshold: 2150,  // Must drop to 2150 to exit (50pt buffer)
        color: '#FF1493',
        icon: '👑',
        description: 'World-class'
      },
      {
        name: 'Legendary',
        level: 8,
        entryThreshold: 2400,
        exitThreshold: 2350,  // Must drop to 2350 to exit (50pt buffer)
        color: '#00FFFF',
        icon: '🌟',
        description: 'Transcendent'
      }
    ];
  }

  /**
   * Calculate current tier based on ELO rating
   * Uses hysteresis to prevent tier bouncing
   *
   * @param {number} currentRating - Current ELO rating
   * @param {string} currentTier - Current tier name (for hysteresis)
   * @returns {object} New tier info
   */
  calculateTier(currentRating, currentTier = null) {
    // If no current tier, find first matching tier (entry)
    if (!currentTier) {
      for (let i = this.tiers.length - 1; i >= 0; i--) {
        if (currentRating >= this.tiers[i].entryThreshold) {
          return this.tiers[i];
        }
      }
      return this.tiers[0]; // Default to Novice
    }

    // Find current tier object
    const currentTierObj = this.tiers.find(t => t.name === currentTier);
    if (!currentTierObj) {
      return this.calculateTier(currentRating, null); // Recalculate if invalid
    }

    // Check if we should exit current tier (drop down)
    // Must drop below EXIT threshold (not entry!) to drop tier
    const currentTierIndex = this.tiers.indexOf(currentTierObj);
    if (currentTierIndex > 0 && currentRating < currentTierObj.exitThreshold) {
      // Dropped below exit threshold, move down
      return this.tiers[currentTierIndex - 1];
    }

    // Check if we should exit current tier (move up)
    // Must reach ENTRY threshold of next tier to move up
    if (currentTierIndex < this.tiers.length - 1 &&
        currentRating >= this.tiers[currentTierIndex + 1].entryThreshold) {
      // Reached next tier's entry, move up
      return this.tiers[currentTierIndex + 1];
    }

    // Stay in current tier (within hysteresis buffer zone)
    return currentTierObj;
  }

  /**
   * Calculate rank (1-99 style) based on rating
   * Maps rating to discrete level
   *
   * @param {number} rating - Current ELO rating
   * @returns {number} Rank (1-99)
   */
  calculateRank(rating) {
    // Map ELO rating to RuneScape-style levels (1-99)
    // Using logarithmic scaling so higher levels are harder

    const minRating = 0;
    const maxRating = 3000; // Cap for rank 99

    if (rating <= minRating) return 1;
    if (rating >= maxRating) return 99;

    // Logarithmic scale (similar to RuneScape XP curve)
    const normalizedRating = (rating - minRating) / (maxRating - minRating);
    const level = Math.floor(1 + (98 * Math.pow(normalizedRating, 0.7)));

    return Math.max(1, Math.min(99, level));
  }

  /**
   * Check for "whistle" events (threshold crossings)
   * Returns events that should trigger notifications
   *
   * @param {number} oldRating - Previous rating
   * @param {number} newRating - New rating
   * @param {string} oldTier - Previous tier
   * @param {string} newTier - New tier
   * @returns {array} Array of event objects
   */
  checkThresholdEvents(oldRating, newRating, oldTier, newTier) {
    const events = [];

    // Tier change event
    if (oldTier !== newTier) {
      const tierObj = this.tiers.find(t => t.name === newTier);
      const direction = this.tiers.findIndex(t => t.name === newTier) >
                       this.tiers.findIndex(t => t.name === oldTier) ? 'up' : 'down';

      events.push({
        type: 'tier_change',
        direction: direction,
        oldTier: oldTier,
        newTier: newTier,
        tierIcon: tierObj.icon,
        message: direction === 'up'
          ? `🎉 Promoted to ${newTier}! ${tierObj.icon}`
          : `Dropped to ${newTier} ${tierObj.icon}`,
        timestamp: new Date()
      });
    }

    // Milestone events (round numbers)
    const milestones = [1000, 1500, 2000, 2500, 3000];
    for (const milestone of milestones) {
      if (oldRating < milestone && newRating >= milestone) {
        events.push({
          type: 'milestone',
          rating: milestone,
          message: `🏆 Reached ${milestone} ELO!`,
          timestamp: new Date()
        });
      }
    }

    // Peak rating event
    if (newRating > oldRating) {
      events.push({
        type: 'personal_best',
        rating: newRating,
        message: `⭐ New personal best: ${newRating}!`,
        timestamp: new Date()
      });
    }

    return events;
  }

  /**
   * Get progress to next tier
   * @param {number} currentRating - Current ELO rating
   * @param {string} currentTier - Current tier name
   * @returns {object} Progress info
   */
  getProgressToNextTier(currentRating, currentTier) {
    const currentTierObj = this.tiers.find(t => t.name === currentTier);
    const currentIndex = this.tiers.indexOf(currentTierObj);

    if (currentIndex === this.tiers.length - 1) {
      return {
        isMaxTier: true,
        progress: 100,
        pointsNeeded: 0,
        nextTier: null
      };
    }

    const nextTier = this.tiers[currentIndex + 1];
    const pointsNeeded = nextTier.entryThreshold - currentRating;
    const tierRange = nextTier.entryThreshold - currentTierObj.entryThreshold;
    const progress = Math.max(0, Math.min(100,
      ((currentRating - currentTierObj.entryThreshold) / tierRange) * 100
    ));

    return {
      isMaxTier: false,
      progress: Math.round(progress),
      pointsNeeded: Math.max(0, pointsNeeded),
      nextTier: nextTier.name,
      nextTierIcon: nextTier.icon
    };
  }

  /**
   * Get all tier information
   * @returns {array} All tiers with thresholds
   */
  getAllTiers() {
    return this.tiers;
  }
}

module.exports = TierProgressionSystem;

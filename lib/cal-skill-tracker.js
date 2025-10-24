/**
 * CAL Skill Tracker
 *
 * Tracks which skills/tasks CAL has mastered so he can:
 * - Skip steps that are already working
 * - Focus only on failing components
 * - Know when he's "leveled up" in a skill
 * - Remember what approaches work for which tasks
 *
 * Example:
 *   const tracker = new CalSkillTracker();
 *   await tracker.recordAttempt('css-loading', true, { approach: 'inline-styles' });
 *   const shouldSkip = await tracker.isMastered('css-loading');
 *   const nextTask = await tracker.getNextTaskToLearn();
 */

const fs = require('fs').promises;
const path = require('path');

class CalSkillTracker {
  constructor(options = {}) {
    this.skillsPath = options.skillsPath || path.join(__dirname, '../logs/cal-skills.json');
    this.masteryThreshold = options.masteryThreshold || 3; // 3 consecutive successes = mastered
    this.degradationThreshold = options.degradationThreshold || 2; // 2 consecutive failures after mastery = needs relearning

    this.skills = {
      // skillId: {
      //   level: 0-5 (novice, beginner, intermediate, advanced, expert, master),
      //   attempts: [],
      //   consecutiveSuccesses: 0,
      //   consecutiveFailures: 0,
      //   mastered: false,
      //   masteredAt: null,
      //   successfulApproaches: [],
      //   lastPracticed: null
      // }
    };

    this.loaded = false;
  }

  /**
   * Skill levels
   */
  static LEVELS = {
    NOVICE: 0,       // Never tried or just started
    BEGINNER: 1,     // 1-2 successes
    INTERMEDIATE: 2, // 3-5 successes
    ADVANCED: 3,     // 6-10 successes, understands edge cases
    EXPERT: 4,       // 11-20 successes, can handle complex scenarios
    MASTER: 5        // 20+ successes, mastered and consistent
  };

  /**
   * Load skills from disk
   */
  async load() {
    try {
      const data = await fs.readFile(this.skillsPath, 'utf8');
      this.skills = JSON.parse(data);
      this.loaded = true;

      const masteredCount = Object.values(this.skills).filter(s => s.mastered).length;
      console.log('[SkillTracker] Loaded skill tracker:', {
        totalSkills: Object.keys(this.skills).length,
        masteredSkills: masteredCount
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[SkillTracker] No existing skills database, starting fresh');
        this.loaded = true;
      } else {
        console.error('[SkillTracker] Failed to load skills:', error.message);
      }
    }
  }

  /**
   * Save skills to disk
   */
  async save() {
    try {
      const dir = path.dirname(this.skillsPath);
      await fs.mkdir(dir, { recursive: true});
      await fs.writeFile(this.skillsPath, JSON.stringify(this.skills, null, 2));
      console.log('[SkillTracker] Saved skills database');
    } catch (error) {
      console.error('[SkillTracker] Failed to save skills:', error.message);
    }
  }

  /**
   * Record an attempt at a skill
   *
   * @param {string} skillId - Skill identifier
   * @param {boolean} success - Whether attempt succeeded
   * @param {Object} context - { approach, duration, errorType, etc. }
   */
  async recordAttempt(skillId, success, context = {}) {
    if (!this.loaded) await this.load();

    // Initialize skill if new
    if (!this.skills[skillId]) {
      this.skills[skillId] = {
        skillId,
        level: CalSkillTracker.LEVELS.NOVICE,
        attempts: [],
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        mastered: false,
        masteredAt: null,
        successfulApproaches: [],
        lastPracticed: null,
        totalSuccesses: 0,
        totalFailures: 0
      };
    }

    const skill = this.skills[skillId];

    // Record attempt
    skill.attempts.push({
      success,
      context,
      timestamp: new Date().toISOString()
    });

    skill.lastPracticed = new Date().toISOString();

    // Update counters
    if (success) {
      skill.totalSuccesses++;
      skill.consecutiveSuccesses++;
      skill.consecutiveFailures = 0;

      // Track successful approach
      if (context.approach && !skill.successfulApproaches.includes(context.approach)) {
        skill.successfulApproaches.push(context.approach);
      }

      // Check for mastery
      if (skill.consecutiveSuccesses >= this.masteryThreshold && !skill.mastered) {
        skill.mastered = true;
        skill.masteredAt = new Date().toISOString();
        console.log(`🎉 [SkillTracker] ${skillId} MASTERED! (${skill.consecutiveSuccesses} consecutive successes)`);
      }

    } else {
      skill.totalFailures++;
      skill.consecutiveFailures++;
      skill.consecutiveSuccesses = 0;

      // Check for skill degradation
      if (skill.mastered && skill.consecutiveFailures >= this.degradationThreshold) {
        skill.mastered = false;
        console.log(`⚠️  [SkillTracker] ${skillId} degraded - needs relearning (${skill.consecutiveFailures} consecutive failures)`);
      }
    }

    // Update level based on total successes
    skill.level = this._calculateLevel(skill.totalSuccesses);

    await this.save();

    return {
      skillId,
      level: skill.level,
      mastered: skill.mastered,
      consecutiveSuccesses: skill.consecutiveSuccesses,
      consecutiveFailures: skill.consecutiveFailures,
      levelName: this._getLevelName(skill.level)
    };
  }

  /**
   * Check if a skill is mastered
   */
  isMastered(skillId) {
    if (!this.loaded || !this.skills[skillId]) return false;
    return this.skills[skillId].mastered;
  }

  /**
   * Get skill details
   */
  getSkill(skillId) {
    if (!this.loaded || !this.skills[skillId]) {
      return {
        skillId,
        exists: false,
        level: CalSkillTracker.LEVELS.NOVICE,
        levelName: 'Novice',
        mastered: false
      };
    }

    const skill = this.skills[skillId];
    return {
      ...skill,
      exists: true,
      levelName: this._getLevelName(skill.level),
      successRate: skill.attempts.length > 0
        ? (skill.totalSuccesses / skill.attempts.length * 100).toFixed(1) + '%'
        : 'N/A'
    };
  }

  /**
   * Get all mastered skills
   */
  getMasteredSkills() {
    if (!this.loaded) return [];

    return Object.keys(this.skills)
      .filter(skillId => this.skills[skillId].mastered)
      .map(skillId => this.getSkill(skillId));
  }

  /**
   * Get skills that need work (not mastered)
   */
  getSkillsNeedingWork() {
    if (!this.loaded) return [];

    return Object.keys(this.skills)
      .filter(skillId => !this.skills[skillId].mastered)
      .map(skillId => this.getSkill(skillId))
      .sort((a, b) => b.totalFailures - a.totalFailures); // Sort by most failures first
  }

  /**
   * Get next recommended task to practice
   */
  async getNextTaskToLearn() {
    const needingWork = this.getSkillsNeedingWork();

    if (needingWork.length === 0) {
      return null; // All skills mastered!
    }

    // Prioritize by:
    // 1. Skills with recent failures
    // 2. Skills with lowest level
    // 3. Skills not practiced recently

    return needingWork.sort((a, b) => {
      // Recent failures (higher priority)
      if (a.consecutiveFailures > 0 && b.consecutiveFailures === 0) return -1;
      if (b.consecutiveFailures > 0 && a.consecutiveFailures === 0) return 1;

      // Level (learn basics first)
      if (a.level !== b.level) return a.level - b.level;

      // Last practiced (practice stale skills)
      if (!a.lastPracticed) return -1;
      if (!b.lastPracticed) return 1;

      return new Date(a.lastPracticed) - new Date(b.lastPracticed);
    })[0];
  }

  /**
   * Get learning summary
   */
  async getSummary() {
    if (!this.loaded) await this.load();

    const allSkills = Object.values(this.skills);
    const masteredSkills = allSkills.filter(s => s.mastered);
    const totalAttempts = allSkills.reduce((sum, s) => sum + s.attempts.length, 0);
    const totalSuccesses = allSkills.reduce((sum, s) => sum + s.totalSuccesses, 0);

    return {
      totalSkills: allSkills.length,
      masteredSkills: masteredSkills.length,
      skillsNeedingWork: allSkills.length - masteredSkills.length,
      totalAttempts,
      totalSuccesses,
      overallSuccessRate: totalAttempts > 0
        ? (totalSuccesses / totalAttempts * 100).toFixed(1) + '%'
        : 'N/A',
      levelDistribution: this._getLevelDistribution(),
      nextTaskToLearn: await this.getNextTaskToLearn()
    };
  }

  /**
   * Calculate skill level based on successes
   * @private
   */
  _calculateLevel(totalSuccesses) {
    if (totalSuccesses === 0) return CalSkillTracker.LEVELS.NOVICE;
    if (totalSuccesses <= 2) return CalSkillTracker.LEVELS.BEGINNER;
    if (totalSuccesses <= 5) return CalSkillTracker.LEVELS.INTERMEDIATE;
    if (totalSuccesses <= 10) return CalSkillTracker.LEVELS.ADVANCED;
    if (totalSuccesses <= 20) return CalSkillTracker.LEVELS.EXPERT;
    return CalSkillTracker.LEVELS.MASTER;
  }

  /**
   * Get level name from level number
   * @private
   */
  _getLevelName(level) {
    const names = ['Novice', 'Beginner', 'Intermediate', 'Advanced', 'Expert', 'Master'];
    return names[level] || 'Unknown';
  }

  /**
   * Get distribution of skills across levels
   * @private
   */
  _getLevelDistribution() {
    const distribution = {
      novice: 0,
      beginner: 0,
      intermediate: 0,
      advanced: 0,
      expert: 0,
      master: 0
    };

    Object.values(this.skills).forEach(skill => {
      const levelName = this._getLevelName(skill.level).toLowerCase();
      if (distribution[levelName] !== undefined) {
        distribution[levelName]++;
      }
    });

    return distribution;
  }
}

module.exports = CalSkillTracker;

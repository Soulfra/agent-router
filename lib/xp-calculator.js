/**
 * XP Calculator
 *
 * RuneScape-style XP calculations for CalOS skills system
 * Calculate levels, XP requirements, training time, and efficiency
 */

/**
 * Calculate level from total XP using RuneScape formula
 * @param {number} xp - Total XP
 * @returns {number} Level (1-99)
 */
function calculateLevelFromXP(xp) {
  if (xp <= 0) return 1;

  let level = 1;
  let xpRequired = 0;

  // Use RuneScape XP formula
  for (let lvl = 1; lvl <= 99; lvl++) {
    xpRequired = calculateXPForLevel(lvl);
    if (xp >= xpRequired) {
      level = lvl;
    } else {
      break;
    }
  }

  return level;
}

/**
 * Calculate total XP required for a specific level
 * Uses RuneScape formula: floor(sum(floor(level + 300 * 2^(level / 7))) / 4)
 * @param {number} level - Target level (1-99)
 * @returns {number} XP required
 */
function calculateXPForLevel(level) {
  if (level <= 1) return 0;

  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.floor(i + 300 * Math.pow(2, i / 7));
  }

  return Math.floor(total / 4);
}

/**
 * Calculate XP needed from current level to target level
 * @param {number} currentLevel - Current level
 * @param {number} targetLevel - Target level
 * @returns {Object} XP breakdown
 */
function calculateXPNeeded(currentLevel, targetLevel) {
  const currentXP = calculateXPForLevel(currentLevel);
  const targetXP = calculateXPForLevel(targetLevel);
  const xpNeeded = targetXP - currentXP;

  return {
    currentLevel,
    targetLevel,
    currentXP,
    targetXP,
    xpNeeded,
    percentComplete: targetLevel > currentLevel ?
      Math.round((currentXP / targetXP) * 100) : 100
  };
}

/**
 * Calculate XP remaining in current level
 * @param {number} currentXP - Current total XP
 * @returns {Object} Level progress information
 */
function calculateLevelProgress(currentXP) {
  const currentLevel = calculateLevelFromXP(currentXP);
  const xpForCurrentLevel = calculateXPForLevel(currentLevel);
  const xpForNextLevel = calculateXPForLevel(currentLevel + 1);
  const xpIntoLevel = currentXP - xpForCurrentLevel;
  const xpToNextLevel = xpForNextLevel - currentXP;
  const xpForThisLevel = xpForNextLevel - xpForCurrentLevel;

  return {
    currentLevel,
    currentXP,
    xpIntoLevel,
    xpToNextLevel,
    xpForThisLevel,
    percentToNextLevel: Math.round((xpIntoLevel / xpForThisLevel) * 100)
  };
}

/**
 * Calculate training time to reach goal
 * @param {number} xpNeeded - XP needed to reach goal
 * @param {number} xpPerHour - XP gain rate per hour
 * @returns {Object} Time breakdown
 */
function calculateTrainingTime(xpNeeded, xpPerHour) {
  if (xpPerHour <= 0) {
    return {
      hours: 0,
      days: 0,
      weeks: 0,
      displayTime: 'N/A'
    };
  }

  const hours = xpNeeded / xpPerHour;
  const days = hours / 24;
  const weeks = days / 7;

  let displayTime;
  if (hours < 1) {
    displayTime = `${Math.ceil(hours * 60)} minutes`;
  } else if (hours < 24) {
    displayTime = `${Math.round(hours * 10) / 10} hours`;
  } else if (days < 7) {
    displayTime = `${Math.round(days * 10) / 10} days`;
  } else {
    displayTime = `${Math.round(weeks * 10) / 10} weeks`;
  }

  return {
    hours: Math.round(hours * 100) / 100,
    days: Math.round(days * 100) / 100,
    weeks: Math.round(weeks * 100) / 100,
    displayTime
  };
}

/**
 * Calculate XP per hour for an action
 * @param {number} xpPerAction - XP gained per action
 * @param {number} actionsPerHour - How many actions per hour
 * @param {number} multiplier - XP multiplier (e.g., 2.0 for double XP)
 * @returns {number} XP per hour
 */
function calculateXPPerHour(xpPerAction, actionsPerHour, multiplier = 1.0) {
  return Math.round(xpPerAction * actionsPerHour * multiplier);
}

/**
 * Calculate actions per hour considering cooldown
 * @param {number} cooldownSeconds - Cooldown between actions
 * @returns {number} Maximum actions per hour
 */
function calculateActionsPerHour(cooldownSeconds) {
  if (cooldownSeconds <= 0) {
    // No cooldown, assume reasonable limit
    return 720; // ~1 per 5 seconds
  }

  const actionsPerHour = 3600 / cooldownSeconds;
  return Math.floor(actionsPerHour);
}

/**
 * Calculate efficiency of different training methods
 * @param {Array} actions - Array of action objects with {name, xp, cooldown}
 * @returns {Array} Sorted by efficiency (XP/hour)
 */
function compareActionEfficiency(actions) {
  return actions.map(action => {
    const actionsPerHour = calculateActionsPerHour(action.cooldown || 0);
    const xpPerHour = calculateXPPerHour(action.xp, actionsPerHour);

    return {
      name: action.name,
      xp: action.xp,
      cooldown: action.cooldown,
      actionsPerHour,
      xpPerHour,
      rank: 0 // Will be set after sorting
    };
  })
  .sort((a, b) => b.xpPerHour - a.xpPerHour)
  .map((action, index) => ({
    ...action,
    rank: index + 1
  }));
}

/**
 * Calculate actions needed to reach goal
 * @param {number} xpNeeded - XP needed
 * @param {number} xpPerAction - XP per action
 * @param {number} multiplier - XP multiplier
 * @returns {number} Actions needed
 */
function calculateActionsNeeded(xpNeeded, xpPerAction, multiplier = 1.0) {
  if (xpPerAction <= 0) return 0;
  return Math.ceil(xpNeeded / (xpPerAction * multiplier));
}

/**
 * Generate XP table for level range
 * @param {number} startLevel - Starting level
 * @param {number} endLevel - Ending level
 * @returns {Array} Array of level objects with XP data
 */
function generateXPTable(startLevel = 1, endLevel = 99) {
  const table = [];

  for (let level = startLevel; level <= endLevel; level++) {
    const xpRequired = calculateXPForLevel(level);
    const xpToNext = level < 99 ?
      calculateXPForLevel(level + 1) - xpRequired : 0;

    table.push({
      level,
      xpRequired,
      xpToNext,
      formattedXP: formatNumber(xpRequired),
      formattedXPToNext: formatNumber(xpToNext)
    });
  }

  return table;
}

/**
 * Calculate skill milestone levels
 * @returns {Object} Milestone level XP requirements
 */
function getSkillMilestones() {
  const milestones = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];

  return milestones.map(level => ({
    level,
    xpRequired: calculateXPForLevel(level),
    formattedXP: formatNumber(calculateXPForLevel(level)),
    description: getMilestoneDescription(level)
  }));
}

/**
 * Get milestone description
 * @param {number} level - Level milestone
 * @returns {string} Description
 */
function getMilestoneDescription(level) {
  if (level === 1) return 'Starting level';
  if (level === 10) return 'Apprentice';
  if (level === 20) return 'Novice';
  if (level === 30) return 'Intermediate';
  if (level === 40) return 'Skilled';
  if (level === 50) return 'Expert';
  if (level === 60) return 'Advanced';
  if (level === 70) return 'Master';
  if (level === 80) return 'Grandmaster';
  if (level === 90) return 'Legend';
  if (level === 99) return 'Max Level';
  return '';
}

/**
 * Format large numbers with commas
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Calculate total level (sum of all skill levels)
 * @param {Array} skills - Array of {level} objects
 * @returns {Object} Total level stats
 */
function calculateTotalLevel(skills) {
  const totalLevel = skills.reduce((sum, skill) => sum + skill.level, 0);
  const maxTotalLevel = skills.length * 99;
  const percentComplete = Math.round((totalLevel / maxTotalLevel) * 100);

  return {
    totalLevel,
    maxTotalLevel,
    percentComplete,
    skillCount: skills.length
  };
}

/**
 * Calculate combat level equivalent (arbitrary weighting)
 * @param {Object} skills - Object with skill levels
 * @returns {number} Combat level (1-126 scale)
 */
function calculateCombatLevel(skills) {
  // Weight different skills differently
  const weights = {
    Security: 0.325,
    Development: 0.325,
    Creativity: 0.250,
    Trading: 0.100
  };

  let combatLevel = 0;
  for (const [skill, weight] of Object.entries(weights)) {
    if (skills[skill]) {
      combatLevel += skills[skill] * weight;
    }
  }

  return Math.floor(combatLevel);
}

/**
 * Parse URL query parameters for calculator state
 * @param {string} queryString - URL query string
 * @returns {Object} Parsed calculator state
 */
function parseCalculatorURL(queryString) {
  const params = new URLSearchParams(queryString);

  return {
    skill: params.get('skill') || null,
    currentLevel: parseInt(params.get('current')) || null,
    currentXP: parseInt(params.get('xp')) || null,
    targetLevel: parseInt(params.get('target')) || null,
    multiplier: parseFloat(params.get('multiplier')) || 1.0
  };
}

/**
 * Generate shareable calculator URL
 * @param {Object} state - Calculator state
 * @returns {string} URL query string
 */
function generateCalculatorURL(state) {
  const params = new URLSearchParams();

  if (state.skill) params.set('skill', state.skill);
  if (state.currentLevel) params.set('current', state.currentLevel);
  if (state.currentXP) params.set('xp', state.currentXP);
  if (state.targetLevel) params.set('target', state.targetLevel);
  if (state.multiplier && state.multiplier !== 1.0) {
    params.set('multiplier', state.multiplier);
  }

  return params.toString();
}

/**
 * Create SEO-friendly slug from skill name
 * @param {string} skillName - Skill name (e.g., "Voting")
 * @returns {string} URL slug (e.g., "voting")
 */
function createSkillSlug(skillName) {
  return skillName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateLevelFromXP,
    calculateXPForLevel,
    calculateXPNeeded,
    calculateLevelProgress,
    calculateTrainingTime,
    calculateXPPerHour,
    calculateActionsPerHour,
    compareActionEfficiency,
    calculateActionsNeeded,
    generateXPTable,
    getSkillMilestones,
    formatNumber,
    calculateTotalLevel,
    calculateCombatLevel,
    parseCalculatorURL,
    generateCalculatorURL,
    createSkillSlug
  };
}

// Export for browser
if (typeof window !== 'undefined') {
  window.XPCalculator = {
    calculateLevelFromXP,
    calculateXPForLevel,
    calculateXPNeeded,
    calculateLevelProgress,
    calculateTrainingTime,
    calculateXPPerHour,
    calculateActionsPerHour,
    compareActionEfficiency,
    calculateActionsNeeded,
    generateXPTable,
    getSkillMilestones,
    formatNumber,
    calculateTotalLevel,
    calculateCombatLevel,
    parseCalculatorURL,
    generateCalculatorURL,
    createSkillSlug
  };
}

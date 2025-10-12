/**
 * ELO Rating Calculator
 *
 * Implements chess-style ELO rating system for comparing ANY items:
 * - Cooking recipes
 * - Game characters
 * - Product ideas
 * - Design options
 * - Etc.
 *
 * Based on the Elo rating system created by Arpad Elo
 * https://en.wikipedia.org/wiki/Elo_rating_system
 */

class EloCalculator {
  constructor(options = {}) {
    // K-factor determines how much ratings change per match
    // Higher K = more volatile ratings (good for new players)
    // Lower K = more stable ratings (good for established players)
    this.kFactor = options.kFactor || 32; // Standard for active players

    // Starting rating for new items
    this.defaultRating = options.defaultRating || 1500;

    // Rating floors and ceilings
    this.minRating = options.minRating || 100;
    this.maxRating = options.maxRating || 3000;
  }

  /**
   * Calculate expected score for a match
   * Returns probability (0-1) that player A will beat player B
   */
  calculateExpected(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  /**
   * Update ratings after a match
   * @param {number} winnerRating - Current rating of winner
   * @param {number} loserRating - Current rating of loser
   * @param {number} actualScore - 1 for win, 0.5 for draw, 0 for loss
   * @returns {Object} { winner: newRating, loser: newRating, change: ratingChange }
   */
  updateRatings(winnerRating, loserRating, actualScore = 1) {
    // Calculate expected scores
    const expectedWin = this.calculateExpected(winnerRating, loserRating);
    const expectedLose = this.calculateExpected(loserRating, winnerRating);

    // Calculate rating changes
    const winnerChange = this.kFactor * (actualScore - expectedWin);
    const loserChange = this.kFactor * ((1 - actualScore) - expectedLose);

    // Apply changes
    let newWinnerRating = Math.round(winnerRating + winnerChange);
    let newLoserRating = Math.round(loserRating + loserChange);

    // Enforce bounds
    newWinnerRating = Math.max(this.minRating, Math.min(this.maxRating, newWinnerRating));
    newLoserRating = Math.max(this.minRating, Math.min(this.maxRating, newLoserRating));

    return {
      winner: newWinnerRating,
      loser: newLoserRating,
      change: Math.abs(Math.round(winnerChange)),
      probability: expectedWin
    };
  }

  /**
   * Calculate rating change for a specific result
   * Useful for displaying "what if" scenarios
   */
  calculateChange(currentRating, opponentRating, actualScore) {
    const expected = this.calculateExpected(currentRating, opponentRating);
    const change = this.kFactor * (actualScore - expected);
    return Math.round(change);
  }

  /**
   * Get K-factor based on rating and match count
   * Implements variable K-factor like FIDE (chess federation)
   */
  getAdaptiveKFactor(rating, matchesPlayed) {
    // New items (< 30 matches) get higher K for faster convergence
    if (matchesPlayed < 30) {
      return 40;
    }

    // Established items
    if (rating < 2400) {
      return 32;
    }

    // Top-rated items get lower K for stability
    return 24;
  }

  /**
   * Calculate rating confidence
   * Returns how reliable this rating is (0-100%)
   */
  calculateConfidence(matchesPlayed) {
    // Confidence increases with match count, plateaus around 100 matches
    const confidence = (1 - Math.exp(-matchesPlayed / 30)) * 100;
    return Math.min(Math.round(confidence), 100);
  }

  /**
   * Predict match outcome
   * Returns detailed prediction for a matchup
   */
  predictMatch(ratingA, ratingB) {
    const probabilityA = this.calculateExpected(ratingA, ratingB);
    const probabilityB = 1 - probabilityA;

    // Rating difference analysis
    const diff = Math.abs(ratingA - ratingB);
    let matchupType;
    if (diff < 50) matchupType = 'Even matchup';
    else if (diff < 150) matchupType = 'Slight favorite';
    else if (diff < 300) matchupType = 'Moderate favorite';
    else matchupType = 'Heavy favorite';

    return {
      probabilityA: Math.round(probabilityA * 100),
      probabilityB: Math.round(probabilityB * 100),
      favorite: ratingA > ratingB ? 'A' : 'B',
      ratingDiff: diff,
      matchupType,
      expectedChangeIfAWins: this.calculateChange(ratingA, ratingB, 1),
      expectedChangeIfBWins: this.calculateChange(ratingB, ratingA, 1)
    };
  }

  /**
   * Calculate performance rating
   * What rating would you need to achieve these results?
   */
  calculatePerformanceRating(opponents, scores) {
    if (opponents.length === 0) return this.defaultRating;

    const averageOpponentRating = opponents.reduce((sum, r) => sum + r, 0) / opponents.length;
    const totalScore = scores.reduce((sum, s) => sum + s, 0);
    const scorePercentage = totalScore / opponents.length;

    // Solve for rating that would give this expected score
    // Expected = 1 / (1 + 10^((opponent - performance) / 400))
    // Rearranging: performance = opponent - 400 * log10((1 / expected) - 1)

    if (scorePercentage === 0) {
      return Math.round(averageOpponentRating - 400);
    } else if (scorePercentage === 1) {
      return Math.round(averageOpponentRating + 400);
    }

    const performanceRating = averageOpponentRating - 400 * Math.log10((1 / scorePercentage) - 1);
    return Math.round(performanceRating);
  }

  /**
   * Find optimal matchup
   * Returns items closest in rating for fair comparison
   */
  findClosestRated(targetRating, availableItems, count = 1) {
    return availableItems
      .map(item => ({
        ...item,
        diff: Math.abs(item.rating - targetRating)
      }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, count);
  }

  /**
   * Generate leaderboard rankings
   * With tier classifications
   */
  classifyRating(rating) {
    if (rating < 1000) return { tier: 'Novice', color: '#94a3b8', icon: '🌱' };
    if (rating < 1200) return { tier: 'Beginner', color: '#64748b', icon: '🥉' };
    if (rating < 1400) return { tier: 'Intermediate', color: '#06b6d4', icon: '🥈' };
    if (rating < 1600) return { tier: 'Advanced', color: '#3b82f6', icon: '🥇' };
    if (rating < 1800) return { tier: 'Expert', color: '#8b5cf6', icon: '💎' };
    if (rating < 2000) return { tier: 'Master', color: '#ec4899', icon: '👑' };
    if (rating < 2200) return { tier: 'Grandmaster', color: '#f59e0b', icon: '⭐' };
    return { tier: 'Legend', color: '#ef4444', icon: '🔥' };
  }

  /**
   * Batch update ratings for tournament
   * Updates multiple items at once efficiently
   */
  batchUpdate(matches) {
    const updates = new Map();

    for (const match of matches) {
      const result = this.updateRatings(
        match.winnerRating,
        match.loserRating,
        match.actualScore || 1
      );

      updates.set(match.winnerId, {
        oldRating: match.winnerRating,
        newRating: result.winner,
        change: result.change,
        type: 'winner'
      });

      updates.set(match.loserId, {
        oldRating: match.loserRating,
        newRating: result.loser,
        change: result.change,
        type: 'loser'
      });
    }

    return Array.from(updates.entries()).map(([id, data]) => ({ id, ...data }));
  }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EloCalculator;
} else if (typeof window !== 'undefined') {
  window.EloCalculator = EloCalculator;
}

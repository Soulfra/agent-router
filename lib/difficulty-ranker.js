/**
 * Difficulty Ranker
 *
 * Maps code complexity metrics to difficulty rankings:
 * - Sudoku-style: Trivial/Easy/Medium/Hard/Expert/Master
 * - Crossword-style: Monday/Tuesday/.../Saturday/Sunday
 * - LeetCode-style: Trivial/Easy/Medium/Hard
 * - Gaming: Tutorial/Normal/Hard/Nightmare/Infernal
 *
 * Uses multiple factors:
 * - Code depth (from CodeDepthAnalyzer)
 * - Edge complexity (from EdgeDetector)
 * - Cyclomatic complexity
 * - Time complexity (O(n), O(n²), etc.)
 */

class DifficultyRanker {
  constructor() {
    // Difficulty thresholds
    this.thresholds = {
      trivial: { maxDepth: 0, maxEdges: 5, maxComplexity: 2 },
      easy: { maxDepth: 2, maxEdges: 15, maxComplexity: 5 },
      medium: { maxDepth: 5, maxEdges: 30, maxComplexity: 10 },
      hard: { maxDepth: 8, maxEdges: 50, maxComplexity: 20 },
      expert: { maxDepth: 12, maxEdges: 80, maxComplexity: 35 },
      master: { maxDepth: Infinity, maxEdges: Infinity, maxComplexity: Infinity }
    };

    // Ranking systems
    this.rankingSystems = {
      sudoku: ['Tutorial (1-star)', 'Easy (2-star)', 'Medium (3-star)', 'Hard (4-star)', 'Expert (5-star)', 'Master (5+ star)'],
      crossword: ['Monday (easiest)', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday/Sunday (hardest)'],
      leetcode: ['Trivial', 'Easy', 'Medium', 'Medium-Hard', 'Hard', 'Hard+'],
      gaming: ['Tutorial', 'Normal', 'Hard', 'Nightmare', 'Infernal', 'Impossible'],
      climbing: ['5.5 (Beginner)', '5.7 (Easy)', '5.9 (Moderate)', '5.11 (Hard)', '5.13 (Expert)', '5.15 (Elite)']
    };
  }

  /**
   * Rank code difficulty
   * @param {object} depthAnalysis - From CodeDepthAnalyzer
   * @param {object} edgeAnalysis - From EdgeDetector
   * @returns {object} Difficulty ranking
   */
  rank(depthAnalysis, edgeAnalysis) {
    // Calculate composite score
    const composite = this.calculateCompositeScore(depthAnalysis, edgeAnalysis);

    // Determine base difficulty
    const baseDifficulty = this.determineDifficulty(composite);

    // Map to all ranking systems
    const rankings = this.mapToRankingSystems(baseDifficulty);

    // Generate detailed breakdown
    const breakdown = this.generateBreakdown(composite, depthAnalysis, edgeAnalysis);

    return {
      baseDifficulty,
      composite,
      rankings,
      breakdown,
      stars: this.getStarRating(baseDifficulty),
      color: this.getDifficultyColor(baseDifficulty),
      description: this.getDifficultyDescription(baseDifficulty),
      estimatedTime: this.estimateSolvingTime(baseDifficulty, composite)
    };
  }

  /**
   * Calculate composite difficulty score
   */
  calculateCompositeScore(depthAnalysis, edgeAnalysis) {
    const weights = {
      depth: 0.35,
      edges: 0.25,
      complexity: 0.20,
      algorithms: 0.15,
      nesting: 0.05
    };

    const scores = {
      depth: depthAnalysis.overallDepth || 0,
      edges: this.normalizeEdgeScore(edgeAnalysis.totalEdges),
      complexity: this.normalizeComplexityScore(edgeAnalysis.complexity?.total || 0),
      algorithms: depthAnalysis.algorithms?.maxDepth || 0,
      nesting: depthAnalysis.nesting?.score || 0
    };

    const weighted = Object.keys(weights).reduce((sum, key) => {
      return sum + (scores[key] * weights[key]);
    }, 0);

    return {
      raw: scores,
      weights,
      weighted,
      normalized: this.normalizeToScale(weighted, 0, 15, 0, 100)
    };
  }

  /**
   * Normalize edge count to 0-10 scale
   */
  normalizeEdgeScore(totalEdges) {
    // 0 edges = 0, 100 edges = 10, logarithmic scale
    if (totalEdges === 0) return 0;
    return Math.min(10, Math.log10(totalEdges + 1) * 3);
  }

  /**
   * Normalize complexity to 0-10 scale
   */
  normalizeComplexityScore(complexity) {
    // 0 complexity = 0, 50 complexity = 10
    return Math.min(10, complexity / 5);
  }

  /**
   * Normalize value to different scale
   */
  normalizeToScale(value, inMin, inMax, outMin, outMax) {
    return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
  }

  /**
   * Determine difficulty category
   */
  determineDifficulty(composite) {
    const { weighted } = composite;

    if (weighted < 0) return 'trivial';
    if (weighted < 2) return 'easy';
    if (weighted < 5) return 'medium';
    if (weighted < 8) return 'hard';
    if (weighted < 12) return 'expert';
    return 'master';
  }

  /**
   * Map base difficulty to all ranking systems
   */
  mapToRankingSystems(baseDifficulty) {
    const index = ['trivial', 'easy', 'medium', 'hard', 'expert', 'master'].indexOf(baseDifficulty);

    return {
      sudoku: this.rankingSystems.sudoku[index],
      crossword: this.rankingSystems.crossword[index],
      leetcode: this.rankingSystems.leetcode[index],
      gaming: this.rankingSystems.gaming[index],
      climbing: this.rankingSystems.climbing[index]
    };
  }

  /**
   * Generate detailed breakdown
   */
  generateBreakdown(composite, depthAnalysis, edgeAnalysis) {
    const breakdown = [];

    // Depth breakdown
    if (composite.raw.depth > 0) {
      breakdown.push({
        factor: 'Code Depth',
        score: composite.raw.depth.toFixed(2),
        weight: (composite.weights.depth * 100).toFixed(0) + '%',
        contribution: (composite.raw.depth * composite.weights.depth).toFixed(2),
        details: [
          `Variables: ${depthAnalysis.variables?.averageDepth?.toFixed(2) || 0}`,
          `Functions: ${depthAnalysis.functions?.averageDepth?.toFixed(2) || 0}`,
          `Algorithms: ${depthAnalysis.algorithms?.maxDepth || 0}`
        ]
      });
    }

    // Edge breakdown
    if (edgeAnalysis.totalEdges > 0) {
      breakdown.push({
        factor: 'Edge Complexity',
        score: composite.raw.edges.toFixed(2),
        weight: (composite.weights.edges * 100).toFixed(0) + '%',
        contribution: (composite.raw.edges * composite.weights.edges).toFixed(2),
        details: [
          `Objects: ${edgeAnalysis.objects?.totalEdges || 0} edges`,
          `Functions: ${edgeAnalysis.functions?.totalEdges || 0} edges`,
          `Dependencies: ${edgeAnalysis.dependencies?.totalEdges || 0} edges`,
          `Call Graph: ${edgeAnalysis.callGraph?.edges?.length || 0} calls`
        ]
      });
    }

    // Complexity breakdown
    if (edgeAnalysis.complexity) {
      breakdown.push({
        factor: 'Cyclomatic Complexity',
        score: composite.raw.complexity.toFixed(2),
        weight: (composite.weights.complexity * 100).toFixed(0) + '%',
        contribution: (composite.raw.complexity * composite.weights.complexity).toFixed(2),
        details: [
          `Call Graph: ${edgeAnalysis.complexity.callGraph?.toFixed(2) || 0}`,
          `Data Flow: ${edgeAnalysis.complexity.dataFlow?.toFixed(2) || 0}`,
          `Objects: ${edgeAnalysis.complexity.objects?.toFixed(2) || 0}`
        ]
      });
    }

    // Algorithm breakdown
    if (depthAnalysis.algorithms?.count > 0) {
      breakdown.push({
        factor: 'Algorithm Complexity',
        score: composite.raw.algorithms.toFixed(2),
        weight: (composite.weights.algorithms * 100).toFixed(0) + '%',
        contribution: (composite.raw.algorithms * composite.weights.algorithms).toFixed(2),
        details: depthAnalysis.algorithms.items.map(a => a.description)
      });
    }

    // Nesting breakdown
    if (depthAnalysis.nesting?.maxDepth > 0) {
      breakdown.push({
        factor: 'Nesting Depth',
        score: composite.raw.nesting.toFixed(2),
        weight: (composite.weights.nesting * 100).toFixed(0) + '%',
        contribution: (composite.raw.nesting * composite.weights.nesting).toFixed(2),
        details: [
          `Max Depth: ${depthAnalysis.nesting.maxDepth}`,
          `Score: ${depthAnalysis.nesting.score}`
        ]
      });
    }

    return breakdown;
  }

  /**
   * Get star rating (1-5)
   */
  getStarRating(difficulty) {
    const ratings = {
      trivial: 1,
      easy: 2,
      medium: 3,
      hard: 4,
      expert: 5,
      master: 5
    };

    return ratings[difficulty] || 3;
  }

  /**
   * Get difficulty color
   */
  getDifficultyColor(difficulty) {
    const colors = {
      trivial: '#28a745', // Green
      easy: '#5cb85c',    // Light green
      medium: '#ffc107',  // Yellow
      hard: '#fd7e14',    // Orange
      expert: '#dc3545',  // Red
      master: '#6f42c1'   // Purple
    };

    return colors[difficulty] || '#6c757d';
  }

  /**
   * Get difficulty description
   */
  getDifficultyDescription(difficulty) {
    const descriptions = {
      trivial: 'Simple variables and constants. No logic required.',
      easy: 'Basic functions with simple control flow. Straightforward logic.',
      medium: 'Loops, conditionals, and some nesting. Requires planning.',
      hard: 'Recursion, algorithms, and complex logic. Needs experience.',
      expert: 'Advanced algorithms, graph traversal, dynamic programming.',
      master: 'Expert-level patterns, distributed systems, cutting-edge techniques.'
    };

    return descriptions[difficulty] || '';
  }

  /**
   * Estimate solving time based on difficulty
   */
  estimateSolvingTime(difficulty, composite) {
    // Base time estimates (in minutes)
    const baseTimes = {
      trivial: 5,
      easy: 15,
      medium: 30,
      hard: 60,
      expert: 120,
      master: 240
    };

    const baseTime = baseTimes[difficulty] || 30;

    // Adjust based on normalized score
    const multiplier = 1 + (composite.normalized / 100);

    const estimatedMinutes = baseTime * multiplier;

    return {
      minutes: Math.round(estimatedMinutes),
      display: this.formatTime(estimatedMinutes),
      range: {
        min: Math.round(estimatedMinutes * 0.5),
        max: Math.round(estimatedMinutes * 2)
      }
    };
  }

  /**
   * Format time for display
   */
  formatTime(minutes) {
    if (minutes < 60) {
      return `${Math.round(minutes)} minutes`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);

    if (mins === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }

    return `${hours}h ${mins}m`;
  }

  /**
   * Compare two difficulty rankings
   */
  compare(ranking1, ranking2) {
    const difficultyOrder = ['trivial', 'easy', 'medium', 'hard', 'expert', 'master'];

    const index1 = difficultyOrder.indexOf(ranking1.baseDifficulty);
    const index2 = difficultyOrder.indexOf(ranking2.baseDifficulty);

    if (index1 < index2) {
      return {
        result: 'easier',
        difference: index2 - index1,
        message: `${ranking1.baseDifficulty} is ${index2 - index1} level${index2 - index1 !== 1 ? 's' : ''} easier than ${ranking2.baseDifficulty}`
      };
    } else if (index1 > index2) {
      return {
        result: 'harder',
        difference: index1 - index2,
        message: `${ranking1.baseDifficulty} is ${index1 - index2} level${index1 - index2 !== 1 ? 's' : ''} harder than ${ranking2.baseDifficulty}`
      };
    } else {
      return {
        result: 'equal',
        difference: 0,
        message: `Both are ${ranking1.baseDifficulty} difficulty`
      };
    }
  }

  /**
   * Get difficulty badge (for UI)
   */
  getBadge(difficulty) {
    const star = '⭐';
    const stars = star.repeat(this.getStarRating(difficulty));

    return {
      text: difficulty.toUpperCase(),
      stars,
      color: this.getDifficultyColor(difficulty),
      icon: this.getDifficultyIcon(difficulty)
    };
  }

  /**
   * Get difficulty icon
   */
  getDifficultyIcon(difficulty) {
    const icons = {
      trivial: '🟢',
      easy: '🔵',
      medium: '🟡',
      hard: '🟠',
      expert: '🔴',
      master: '🟣'
    };

    return icons[difficulty] || '⚪';
  }

  /**
   * Generate ranking report
   */
  generateReport(ranking) {
    let report = '';

    report += '🎯 Difficulty Ranking Report\n';
    report += '═'.repeat(60) + '\n\n';

    // Header
    const badge = this.getBadge(ranking.baseDifficulty);
    report += `${badge.icon} ${badge.text} ${badge.stars}\n`;
    report += `${ranking.description}\n\n`;

    // Rankings across systems
    report += '📊 Difficulty Comparisons:\n';
    report += `   Sudoku:    ${ranking.rankings.sudoku}\n`;
    report += `   Crossword: ${ranking.rankings.crossword}\n`;
    report += `   LeetCode:  ${ranking.rankings.leetcode}\n`;
    report += `   Gaming:    ${ranking.rankings.gaming}\n`;
    report += `   Climbing:  ${ranking.rankings.climbing}\n\n`;

    // Composite score
    report += '📈 Composite Score:\n';
    report += `   Weighted Score: ${ranking.composite.weighted.toFixed(2)}\n`;
    report += `   Normalized:     ${ranking.composite.normalized.toFixed(1)}/100\n\n`;

    // Time estimate
    report += '⏱️  Estimated Solving Time:\n';
    report += `   ${ranking.estimatedTime.display}\n`;
    report += `   Range: ${ranking.estimatedTime.range.min}-${ranking.estimatedTime.range.max} minutes\n\n`;

    // Breakdown
    if (ranking.breakdown.length > 0) {
      report += '🔍 Difficulty Breakdown:\n\n';

      for (const item of ranking.breakdown) {
        report += `   ${item.factor} (${item.weight}):\n`;
        report += `     Score: ${item.score}\n`;
        report += `     Contribution: ${item.contribution}\n`;

        if (item.details && item.details.length > 0) {
          report += '     Details:\n';
          for (const detail of item.details) {
            report += `       - ${detail}\n`;
          }
        }

        report += '\n';
      }
    }

    return report;
  }
}

module.exports = DifficultyRanker;

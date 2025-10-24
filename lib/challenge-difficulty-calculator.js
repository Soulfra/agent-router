/**
 * Challenge Difficulty Calculator
 *
 * Calculates difficulty for coding challenges by analyzing:
 * 1. Problem requirements (what needs to be built)
 * 2. Expected solution complexity
 * 3. Required concepts and algorithms
 * 4. Time/space complexity targets
 *
 * Predicts difficulty BEFORE solution is written.
 * Also validates solution difficulty matches challenge.
 */

const CodeDepthAnalyzer = require('./code-depth-analyzer');
const EdgeDetector = require('./edge-detector');
const DifficultyRanker = require('./difficulty-ranker');

class ChallengeDifficultyCalculator {
  constructor() {
    this.depthAnalyzer = new CodeDepthAnalyzer();
    this.edgeDetector = new EdgeDetector();
    this.difficultyRanker = new DifficultyRanker();

    // Concept difficulty weights
    this.conceptWeights = {
      // Data structures
      'array': 1,
      'object': 1,
      'set': 2,
      'map': 2,
      'stack': 3,
      'queue': 3,
      'linked-list': 4,
      'tree': 5,
      'graph': 6,
      'heap': 6,
      'trie': 7,

      // Algorithms
      'linear-search': 1,
      'binary-search': 3,
      'sorting': 3,
      'two-pointer': 4,
      'sliding-window': 4,
      'recursion': 5,
      'backtracking': 6,
      'dynamic-programming': 7,
      'greedy': 5,
      'divide-conquer': 6,
      'bfs': 6,
      'dfs': 6,
      'dijkstra': 8,
      'union-find': 7,

      // Patterns
      'iteration': 1,
      'nested-loops': 3,
      'conditionals': 1,
      'state-management': 4,
      'async': 4,
      'promises': 4,
      'callbacks': 3,
      'event-handlers': 3,
      'api-calls': 4,

      // Techniques
      'string-manipulation': 2,
      'math': 3,
      'bit-manipulation': 5,
      'prefix-sum': 4,
      'memoization': 5,
      'caching': 4
    };

    // Complexity weights
    this.complexityWeights = {
      time: {
        'O(1)': 0,
        'O(log n)': 2,
        'O(n)': 3,
        'O(n log n)': 5,
        'O(n²)': 6,
        'O(n³)': 8,
        'O(2^n)': 9,
        'O(n!)': 10
      },
      space: {
        'O(1)': 0,
        'O(log n)': 1,
        'O(n)': 2,
        'O(n²)': 4,
        'O(2^n)': 6
      }
    };
  }

  /**
   * Calculate challenge difficulty from description
   * @param {object} challenge - Challenge definition
   * @returns {object} Difficulty analysis
   */
  calculateFromDescription(challenge) {
    const {
      title,
      description,
      requirements = [],
      concepts = [],
      constraints = {},
      examples = []
    } = challenge;

    // Analyze required concepts
    const conceptAnalysis = this.analyzeRequiredConcepts(concepts, description);

    // Analyze constraints
    const constraintAnalysis = this.analyzeConstraints(constraints);

    // Analyze requirements
    const requirementAnalysis = this.analyzeRequirements(requirements, description);

    // Analyze examples
    const exampleAnalysis = this.analyzeExamples(examples);

    // Calculate composite difficulty
    const composite = this.calculateCompositeFromDescription({
      concepts: conceptAnalysis,
      constraints: constraintAnalysis,
      requirements: requirementAnalysis,
      examples: exampleAnalysis
    });

    // Map to difficulty ranking
    const difficulty = this.mapToDifficulty(composite.weighted);

    return {
      challenge: { title, description },
      difficulty,
      composite,
      concepts: conceptAnalysis,
      constraints: constraintAnalysis,
      requirements: requirementAnalysis,
      examples: exampleAnalysis,
      predictions: this.generatePredictions(difficulty, composite)
    };
  }

  /**
   * Analyze required concepts
   */
  analyzeRequiredConcepts(concepts, description) {
    const analysis = {
      explicit: [],
      implicit: [],
      totalWeight: 0,
      maxWeight: 0
    };

    // Explicit concepts (provided in challenge)
    for (const concept of concepts) {
      const normalized = concept.toLowerCase().replace(/\s+/g, '-');
      const weight = this.conceptWeights[normalized] || 3;

      analysis.explicit.push({
        name: concept,
        weight,
        difficulty: this.weightToDifficulty(weight)
      });

      analysis.totalWeight += weight;
      analysis.maxWeight = Math.max(analysis.maxWeight, weight);
    }

    // Implicit concepts (detected from description)
    const implicitConcepts = this.detectImplicitConcepts(description);
    for (const concept of implicitConcepts) {
      const weight = this.conceptWeights[concept] || 2;

      analysis.implicit.push({
        name: concept,
        weight,
        difficulty: this.weightToDifficulty(weight)
      });

      analysis.totalWeight += weight * 0.5; // Lower weight for implicit
      analysis.maxWeight = Math.max(analysis.maxWeight, weight);
    }

    return analysis;
  }

  /**
   * Detect implicit concepts from description
   */
  detectImplicitConcepts(description) {
    const concepts = [];
    const lower = description.toLowerCase();

    // Data structures
    if (/array|list/i.test(lower)) concepts.push('array');
    if (/object|dictionary|hash/i.test(lower)) concepts.push('object');
    if (/set/i.test(lower)) concepts.push('set');
    if (/map|mapping/i.test(lower)) concepts.push('map');
    if (/stack/i.test(lower)) concepts.push('stack');
    if (/queue/i.test(lower)) concepts.push('queue');
    if (/tree/i.test(lower)) concepts.push('tree');
    if (/graph|node|edge|connected/i.test(lower)) concepts.push('graph');

    // Algorithms
    if (/search/i.test(lower)) concepts.push('linear-search');
    if (/binary search|sorted/i.test(lower)) concepts.push('binary-search');
    if (/sort/i.test(lower)) concepts.push('sorting');
    if (/recursive|recursion/i.test(lower)) concepts.push('recursion');
    if (/dynamic programming|dp|memoization/i.test(lower)) concepts.push('dynamic-programming');
    if (/bfs|breadth.*first/i.test(lower)) concepts.push('bfs');
    if (/dfs|depth.*first/i.test(lower)) concepts.push('dfs');

    // Patterns
    if (/loop|iterate/i.test(lower)) concepts.push('iteration');
    if (/nested loop|double loop/i.test(lower)) concepts.push('nested-loops');
    if (/state/i.test(lower)) concepts.push('state-management');
    if (/async|await|promise/i.test(lower)) concepts.push('async');
    if (/api|fetch|http/i.test(lower)) concepts.push('api-calls');

    return [...new Set(concepts)];
  }

  /**
   * Analyze constraints
   */
  analyzeConstraints(constraints) {
    const {
      timeComplexity,
      spaceComplexity,
      inputSize,
      edgeCases = []
    } = constraints;

    const analysis = {
      time: null,
      space: null,
      inputSize: null,
      edgeCases: [],
      totalWeight: 0
    };

    // Time complexity
    if (timeComplexity) {
      const timeWeight = this.complexityWeights.time[timeComplexity] || 3;
      analysis.time = {
        requirement: timeComplexity,
        weight: timeWeight,
        difficulty: this.weightToDifficulty(timeWeight)
      };
      analysis.totalWeight += timeWeight;
    }

    // Space complexity
    if (spaceComplexity) {
      const spaceWeight = this.complexityWeights.space[spaceComplexity] || 2;
      analysis.space = {
        requirement: spaceComplexity,
        weight: spaceWeight,
        difficulty: this.weightToDifficulty(spaceWeight)
      };
      analysis.totalWeight += spaceWeight * 0.5; // Space less important
    }

    // Input size (larger = harder)
    if (inputSize) {
      const sizeWeight = this.calculateInputSizeWeight(inputSize);
      analysis.inputSize = {
        requirement: inputSize,
        weight: sizeWeight,
        difficulty: this.weightToDifficulty(sizeWeight)
      };
      analysis.totalWeight += sizeWeight;
    }

    // Edge cases
    for (const edgeCase of edgeCases) {
      analysis.edgeCases.push({
        description: edgeCase,
        weight: 1
      });
      analysis.totalWeight += 1;
    }

    return analysis;
  }

  /**
   * Calculate input size weight
   */
  calculateInputSizeWeight(inputSize) {
    if (typeof inputSize === 'string') {
      // Parse "n <= 1000", "10^5", etc.
      const match = inputSize.match(/(\d+)(?:\^(\d+))?/);
      if (match) {
        const base = parseInt(match[1]);
        const exp = match[2] ? parseInt(match[2]) : 0;
        const size = Math.pow(base, exp || 1);

        if (size <= 100) return 1;
        if (size <= 1000) return 2;
        if (size <= 10000) return 3;
        if (size <= 100000) return 4;
        return 5;
      }
    }

    return 2; // Default
  }

  /**
   * Analyze requirements
   */
  analyzeRequirements(requirements, description) {
    const analysis = {
      count: requirements.length,
      items: [],
      totalWeight: 0
    };

    for (const req of requirements) {
      const weight = this.estimateRequirementWeight(req);

      analysis.items.push({
        description: req,
        weight,
        difficulty: this.weightToDifficulty(weight)
      });

      analysis.totalWeight += weight;
    }

    return analysis;
  }

  /**
   * Estimate requirement weight
   */
  estimateRequirementWeight(requirement) {
    const lower = requirement.toLowerCase();

    // Complex requirements
    if (/optim|efficien|fast/i.test(lower)) return 4;
    if (/handle.*error|edge case/i.test(lower)) return 3;
    if (/valid|check|ensure/i.test(lower)) return 2;
    if (/return|output|print/i.test(lower)) return 1;

    return 2; // Default
  }

  /**
   * Analyze examples
   */
  analyzeExamples(examples) {
    const analysis = {
      count: examples.length,
      complexity: 'simple',
      weight: 0
    };

    if (examples.length === 0) {
      analysis.weight = 2; // No examples = harder to understand
      analysis.complexity = 'unclear';
    } else if (examples.length === 1) {
      analysis.weight = 1;
      analysis.complexity = 'simple';
    } else if (examples.length <= 3) {
      analysis.weight = 0;
      analysis.complexity = 'clear';
    } else {
      analysis.weight = 1; // Too many examples = complex problem
      analysis.complexity = 'complex';
    }

    return analysis;
  }

  /**
   * Calculate composite score from description analysis
   */
  calculateCompositeFromDescription(analysis) {
    const weights = {
      concepts: 0.40,
      constraints: 0.30,
      requirements: 0.20,
      examples: 0.10
    };

    const scores = {
      concepts: analysis.concepts.maxWeight,
      constraints: analysis.constraints.totalWeight,
      requirements: analysis.requirements.totalWeight / Math.max(1, analysis.requirements.count),
      examples: analysis.examples.weight
    };

    const weighted = Object.keys(weights).reduce((sum, key) => {
      return sum + (scores[key] * weights[key]);
    }, 0);

    return {
      raw: scores,
      weights,
      weighted
    };
  }

  /**
   * Map weighted score to difficulty
   */
  mapToDifficulty(weighted) {
    if (weighted < 2) return 'easy';
    if (weighted < 4) return 'medium';
    if (weighted < 6) return 'hard';
    return 'expert';
  }

  /**
   * Map weight to difficulty label
   */
  weightToDifficulty(weight) {
    if (weight <= 2) return 'easy';
    if (weight <= 4) return 'medium';
    if (weight <= 6) return 'hard';
    return 'expert';
  }

  /**
   * Generate predictions
   */
  generatePredictions(difficulty, composite) {
    return {
      expectedDepth: this.predictExpectedDepth(difficulty, composite),
      expectedEdges: this.predictExpectedEdges(difficulty, composite),
      expectedLines: this.predictExpectedLines(difficulty, composite),
      expectedFunctions: this.predictExpectedFunctions(difficulty, composite),
      expectedTime: this.predictSolvingTime(difficulty, composite)
    };
  }

  /**
   * Predict expected code depth
   */
  predictExpectedDepth(difficulty, composite) {
    const ranges = {
      easy: { min: 0, max: 3 },
      medium: { min: 2, max: 6 },
      hard: { min: 5, max: 10 },
      expert: { min: 8, max: 15 }
    };

    return ranges[difficulty] || ranges.medium;
  }

  /**
   * Predict expected edge count
   */
  predictExpectedEdges(difficulty, composite) {
    const ranges = {
      easy: { min: 5, max: 20 },
      medium: { min: 15, max: 40 },
      hard: { min: 30, max: 70 },
      expert: { min: 60, max: 150 }
    };

    return ranges[difficulty] || ranges.medium;
  }

  /**
   * Predict expected lines of code
   */
  predictExpectedLines(difficulty, composite) {
    const ranges = {
      easy: { min: 10, max: 30 },
      medium: { min: 25, max: 60 },
      hard: { min: 50, max: 120 },
      expert: { min: 100, max: 250 }
    };

    return ranges[difficulty] || ranges.medium;
  }

  /**
   * Predict expected number of functions
   */
  predictExpectedFunctions(difficulty, composite) {
    const ranges = {
      easy: { min: 1, max: 2 },
      medium: { min: 2, max: 4 },
      hard: { min: 3, max: 6 },
      expert: { min: 5, max: 10 }
    };

    return ranges[difficulty] || ranges.medium;
  }

  /**
   * Predict solving time
   */
  predictSolvingTime(difficulty, composite) {
    const times = {
      easy: 15,
      medium: 30,
      hard: 60,
      expert: 120
    };

    const baseTime = times[difficulty] || 30;
    const multiplier = 1 + (composite.weighted / 10);

    return {
      minutes: Math.round(baseTime * multiplier),
      range: {
        min: Math.round(baseTime * multiplier * 0.5),
        max: Math.round(baseTime * multiplier * 2)
      }
    };
  }

  /**
   * Validate solution matches challenge difficulty
   * @param {object} challenge - Challenge definition
   * @param {string} solution - Solution code
   * @param {string} language - Programming language
   * @returns {object} Validation result
   */
  validateSolution(challenge, solution, language = 'javascript') {
    // Calculate challenge difficulty
    const challengeDifficulty = this.calculateFromDescription(challenge);

    // Analyze solution
    const depthAnalysis = this.depthAnalyzer.analyze(solution, language);
    const edgeAnalysis = this.edgeDetector.analyze(solution, language);
    const solutionRanking = this.difficultyRanker.rank(depthAnalysis, edgeAnalysis);

    // Compare difficulties
    const comparison = this.compareDifficulties(
      challengeDifficulty.difficulty,
      solutionRanking.baseDifficulty
    );

    // Check predictions
    const predictionCheck = this.checkPredictions(
      challengeDifficulty.predictions,
      depthAnalysis,
      edgeAnalysis
    );

    return {
      challenge: challengeDifficulty,
      solution: {
        depth: depthAnalysis,
        edges: edgeAnalysis,
        ranking: solutionRanking
      },
      comparison,
      predictionCheck,
      valid: comparison.match,
      feedback: this.generateValidationFeedback(comparison, predictionCheck)
    };
  }

  /**
   * Compare challenge and solution difficulties
   */
  compareDifficulties(challengeDifficulty, solutionDifficulty) {
    const order = ['trivial', 'easy', 'medium', 'hard', 'expert', 'master'];
    const challengeIndex = order.indexOf(challengeDifficulty);
    const solutionIndex = order.indexOf(solutionDifficulty);

    const match = Math.abs(challengeIndex - solutionIndex) <= 1; // Allow 1 level difference

    return {
      challenge: challengeDifficulty,
      solution: solutionDifficulty,
      match,
      difference: solutionIndex - challengeIndex,
      message: match
        ? `✅ Solution difficulty matches challenge`
        : `⚠️ Solution is ${Math.abs(solutionIndex - challengeIndex)} level${Math.abs(solutionIndex - challengeIndex) !== 1 ? 's' : ''} ${solutionIndex > challengeIndex ? 'harder' : 'easier'} than challenge`
    };
  }

  /**
   * Check if solution matches predictions
   */
  checkPredictions(predictions, depthAnalysis, edgeAnalysis) {
    const checks = [];

    // Check depth
    const actualDepth = depthAnalysis.overallDepth;
    const depthInRange = actualDepth >= predictions.expectedDepth.min &&
                         actualDepth <= predictions.expectedDepth.max;

    checks.push({
      metric: 'Code Depth',
      expected: `${predictions.expectedDepth.min}-${predictions.expectedDepth.max}`,
      actual: actualDepth.toFixed(2),
      pass: depthInRange
    });

    // Check edges
    const actualEdges = edgeAnalysis.totalEdges;
    const edgesInRange = actualEdges >= predictions.expectedEdges.min &&
                         actualEdges <= predictions.expectedEdges.max;

    checks.push({
      metric: 'Total Edges',
      expected: `${predictions.expectedEdges.min}-${predictions.expectedEdges.max}`,
      actual: actualEdges.toString(),
      pass: edgesInRange
    });

    // Check functions
    const actualFunctions = depthAnalysis.functions?.count || 0;
    const functionsInRange = actualFunctions >= predictions.expectedFunctions.min &&
                             actualFunctions <= predictions.expectedFunctions.max;

    checks.push({
      metric: 'Functions',
      expected: `${predictions.expectedFunctions.min}-${predictions.expectedFunctions.max}`,
      actual: actualFunctions.toString(),
      pass: functionsInRange
    });

    const passCount = checks.filter(c => c.pass).length;

    return {
      checks,
      passCount,
      totalCount: checks.length,
      passRate: (passCount / checks.length) * 100
    };
  }

  /**
   * Generate validation feedback
   */
  generateValidationFeedback(comparison, predictionCheck) {
    const feedback = [];

    if (comparison.match) {
      feedback.push('✅ Solution difficulty is appropriate for the challenge.');
    } else {
      if (comparison.difference > 0) {
        feedback.push('⚠️ Solution is more complex than necessary. Consider simplifying.');
      } else {
        feedback.push('⚠️ Solution might be too simple. Check if all requirements are met.');
      }
    }

    if (predictionCheck.passRate >= 66) {
      feedback.push(`✅ Solution metrics match expectations (${predictionCheck.passCount}/${predictionCheck.totalCount} checks passed).`);
    } else {
      feedback.push(`⚠️ Solution metrics differ from expectations (${predictionCheck.passCount}/${predictionCheck.totalCount} checks passed).`);
    }

    return feedback;
  }

  /**
   * Generate challenge report
   */
  generateReport(challengeAnalysis) {
    let report = '';

    report += '🎯 Challenge Difficulty Analysis\n';
    report += '═'.repeat(60) + '\n\n';

    report += `📝 Challenge: ${challengeAnalysis.challenge.title}\n\n`;
    report += `🏆 Difficulty: ${challengeAnalysis.difficulty.toUpperCase()}\n\n`;

    // Concepts
    if (challengeAnalysis.concepts.explicit.length > 0) {
      report += '💡 Required Concepts:\n';
      for (const concept of challengeAnalysis.concepts.explicit) {
        report += `   - ${concept.name} (${concept.difficulty})\n`;
      }
      report += '\n';
    }

    // Constraints
    if (challengeAnalysis.constraints.time) {
      report += '⏱️  Constraints:\n';
      report += `   Time: ${challengeAnalysis.constraints.time.requirement}\n`;
      if (challengeAnalysis.constraints.space) {
        report += `   Space: ${challengeAnalysis.constraints.space.requirement}\n`;
      }
      report += '\n';
    }

    // Predictions
    report += '🔮 Expected Solution:\n';
    report += `   Depth: ${challengeAnalysis.predictions.expectedDepth.min}-${challengeAnalysis.predictions.expectedDepth.max}\n`;
    report += `   Edges: ${challengeAnalysis.predictions.expectedEdges.min}-${challengeAnalysis.predictions.expectedEdges.max}\n`;
    report += `   Lines: ${challengeAnalysis.predictions.expectedLines.min}-${challengeAnalysis.predictions.expectedLines.max}\n`;
    report += `   Functions: ${challengeAnalysis.predictions.expectedFunctions.min}-${challengeAnalysis.predictions.expectedFunctions.max}\n`;
    report += `   Time: ${challengeAnalysis.predictions.expectedTime.minutes} minutes\n`;

    return report;
  }
}

module.exports = ChallengeDifficultyCalculator;

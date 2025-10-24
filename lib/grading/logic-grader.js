/**
 * Logic Grader
 *
 * Evaluates code algorithms and structure - "pipes and plumbing"
 * Focuses on logic quality, not styling
 *
 * Integrated with Code Depth Analyzer for advanced complexity scoring
 */

const CodeDepthAnalyzer = require('../code-depth-analyzer');
const EdgeDetector = require('../edge-detector');
const DifficultyRanker = require('../difficulty-ranker');

class LogicGrader {
  constructor() {
    // Scoring weights
    this.weights = {
      algorithmQuality: 0.25,
      codeStructure: 0.20,
      efficiency: 0.20,
      bestPractices: 0.15,
      errorHandling: 0.10,
      codeDepth: 0.10  // New: Code depth/complexity scoring
    };

    // Depth analysis tools
    this.depthAnalyzer = new CodeDepthAnalyzer();
    this.edgeDetector = new EdgeDetector();
    this.difficultyRanker = new DifficultyRanker();

    // Complexity patterns
    this.complexityPatterns = {
      loops: /\b(?:for|while|forEach|map|filter|reduce)\b/g,
      conditionals: /\b(?:if|else|switch|case|\?|&&|\|\|)\b/g,
      functions: /\b(?:function|=>|def)\b/g,
      recursion: /\b\w+\s*\([^)]*\)\s*{[^}]*\1\s*\(/g
    };

    // Best practice patterns
    this.bestPractices = {
      javascript: {
        constLet: /\b(?:const|let)\b/g,
        var: /\bvar\b/g,
        arrowFunctions: /=>/g,
        destructuring: /(?:const|let)\s*{\s*\w+/g,
        asyncAwait: /\b(?:async|await)\b/g,
        promises: /\.(?:then|catch|finally)\b/g
      },
      python: {
        listComprehension: /\[.+for\s+\w+\s+in\s+.+\]/g,
        generators: /\byield\b/g,
        decorators: /@\w+/g,
        typeHints: /:\s*(?:int|str|float|bool|list|dict|tuple)/g,
        contextManagers: /\bwith\b/g
      }
    };

    // Anti-patterns (code smells)
    this.antiPatterns = {
      magicNumbers: /\b\d{3,}\b/g, // Numbers without context
      deepNesting: /{\s*(?:[^{}]*{){4,}/g, // 4+ levels of nesting
      longFunctions: null, // Checked by line count
      duplicateCode: null, // Checked by pattern analysis
      globalVariables: /\bglobal\b|\bwindow\.\w+\s*=/g
    };
  }

  /**
   * Main evaluation function
   */
  async evaluate(code, language = 'javascript', metadata = {}) {
    // Detect language if not provided
    if (!language || language === 'unknown') {
      language = this.detectLanguage(code);
    }

    // Run depth analysis (new)
    const depthAnalysis = this.depthAnalyzer.analyze(code, language);
    const edgeAnalysis = this.edgeDetector.analyze(code, language);
    const difficultyRanking = this.difficultyRanker.rank(depthAnalysis, edgeAnalysis);

    const scores = {
      algorithmQuality: this.evaluateAlgorithmQuality(code, language),
      codeStructure: this.evaluateCodeStructure(code, language),
      efficiency: this.evaluateEfficiency(code, language),
      bestPractices: this.evaluateBestPractices(code, language),
      errorHandling: this.evaluateErrorHandling(code, language),
      codeDepth: this.evaluateCodeDepth(depthAnalysis, edgeAnalysis, difficultyRanking)
    };

    // Calculate weighted overall score
    const overall = Object.entries(scores).reduce((total, [key, score]) => {
      return total + (score * this.weights[key]);
    }, 0);

    // Generate feedback (now includes depth insights)
    const feedback = this.generateFeedback(scores, code, language, depthAnalysis, difficultyRanking);

    // Calculate complexity metrics (enhanced with depth analysis)
    const complexity = this.calculateComplexity(code, language, depthAnalysis);

    return {
      overall: Math.round(overall * 100) / 100,
      breakdown: scores,
      feedback,
      complexity,
      depthAnalysis,     // New: Full depth analysis
      edgeAnalysis,      // New: Edge complexity
      difficultyRanking, // New: Sudoku-style ranking
      metadata: {
        ...metadata,
        language,
        lineCount: code.split('\n').length,
        characterCount: code.length,
        timestamp: new Date().toISOString(),
        grader: 'logic',
        version: '2.0' // Updated version
      }
    };
  }

  /**
   * Evaluate algorithm quality - "pipes and plumbing"
   */
  evaluateAlgorithmQuality(code, language) {
    let score = 60; // Base score

    // Check for data structures usage
    const dataStructures = this.detectDataStructures(code, language);

    if (dataStructures.hasArrays) score += 5;
    if (dataStructures.hasObjects) score += 5;
    if (dataStructures.hasSets) score += 8;
    if (dataStructures.hasMaps) score += 8;
    if (dataStructures.hasCustomClasses) score += 10;

    // Check for algorithm patterns
    const algorithms = this.detectAlgorithms(code, language);

    if (algorithms.sorting) score += 8;
    if (algorithms.searching) score += 8;
    if (algorithms.recursion) score += 10;
    if (algorithms.dynamicProgramming) score += 15;
    if (algorithms.graphTraversal) score += 15;

    // Check for functional programming patterns
    const functional = this.detectFunctionalPatterns(code, language);

    if (functional.map) score += 5;
    if (functional.filter) score += 5;
    if (functional.reduce) score += 8;
    if (functional.compose) score += 10;

    return Math.min(100, score);
  }

  /**
   * Evaluate code structure and organization
   */
  evaluateCodeStructure(code, language) {
    let score = 60; // Base score

    // Check for functions/methods
    const functions = (code.match(this.complexityPatterns.functions) || []).length;

    if (functions > 0) {
      score += 10;
    }

    if (functions >= 3) {
      score += 10;
    }

    // Check for classes
    const hasClasses = /\bclass\s+\w+/.test(code);
    if (hasClasses) {
      score += 15;
    }

    // Check for modules/imports
    const hasImports = /\b(?:import|require|from)\b/.test(code);
    if (hasImports) {
      score += 10;
    }

    // Check function length (shorter is better)
    const avgFunctionLength = this.calculateAverageFunctionLength(code);
    if (avgFunctionLength < 20) {
      score += 10;
    } else if (avgFunctionLength > 50) {
      score -= 10;
    }

    // Check for comments/documentation
    const hasComments = this.hasDocumentation(code, language);
    if (hasComments) {
      score += 5;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Evaluate efficiency (Big O considerations)
   */
  evaluateEfficiency(code, language) {
    let score = 70; // Base score

    // Check for nested loops (O(n²) or worse)
    const nestedLoops = this.countNestedLoops(code);

    if (nestedLoops === 0) {
      score += 15; // No loops or single loops only
    } else if (nestedLoops === 1) {
      score += 5; // One nested loop (O(n²))
    } else if (nestedLoops >= 2) {
      score -= 15; // Multiple nested loops (O(n³) or worse)
    }

    // Check for efficient data structure usage
    if (/\bSet\b|\bMap\b/.test(code)) {
      score += 10; // Using O(1) lookup structures
    }

    // Check for array operations in loops (inefficient)
    const inefficientPatterns = code.match(/for.*{[^}]*(?:push|concat|splice)/g);
    if (inefficientPatterns && inefficientPatterns.length > 0) {
      score -= 10;
    }

    // Check for memoization/caching
    if (/memo|cache|stored/.test(code)) {
      score += 15;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Evaluate best practices for language
   */
  evaluateBestPractices(code, language) {
    let score = 60; // Base score

    const practices = this.bestPractices[language] || {};

    if (language === 'javascript') {
      // Check for const/let over var
      const constLetCount = (code.match(practices.constLet) || []).length;
      const varCount = (code.match(practices.var) || []).length;

      if (constLetCount > 0 && varCount === 0) {
        score += 15;
      } else if (varCount > 0) {
        score -= 10;
      }

      // Arrow functions
      if ((code.match(practices.arrowFunctions) || []).length > 0) {
        score += 8;
      }

      // Destructuring
      if ((code.match(practices.destructuring) || []).length > 0) {
        score += 8;
      }

      // Async/await
      if ((code.match(practices.asyncAwait) || []).length > 0) {
        score += 10;
      }
    }

    if (language === 'python') {
      // List comprehensions
      if ((code.match(practices.listComprehension) || []).length > 0) {
        score += 10;
      }

      // Generators
      if ((code.match(practices.generators) || []).length > 0) {
        score += 12;
      }

      // Type hints
      if ((code.match(practices.typeHints) || []).length > 0) {
        score += 10;
      }

      // Context managers
      if ((code.match(practices.contextManagers) || []).length > 0) {
        score += 8;
      }
    }

    // Check for anti-patterns
    score -= this.detectAntiPatterns(code, language);

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Evaluate error handling
   */
  evaluateErrorHandling(code, language) {
    let score = 50; // Base score

    // Check for try-catch blocks
    const hasTryCatch = /\btry\b[\s\S]*?\bcatch\b/.test(code);
    if (hasTryCatch) {
      score += 25;
    }

    // Check for error checking
    const hasErrorChecks = /\bif\s*\([^)]*(?:error|err|null|undefined|!|\bfalse)\b/.test(code);
    if (hasErrorChecks) {
      score += 15;
    }

    // Check for input validation
    const hasValidation = /\bif\s*\([^)]*(?:length|typeof|instanceof|isNaN)\b/.test(code);
    if (hasValidation) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Evaluate code depth and complexity (NEW)
   * Uses advanced depth analysis for Sudoku-style difficulty scoring
   */
  evaluateCodeDepth(depthAnalysis, edgeAnalysis, difficultyRanking) {
    let score = 50; // Base score

    // Reward appropriate complexity for the task
    const difficulty = difficultyRanking.baseDifficulty;

    // Score based on difficulty achieved
    const difficultyScores = {
      trivial: 60,  // Too simple
      easy: 70,
      medium: 85,   // Sweet spot
      hard: 90,
      expert: 95,
      master: 100
    };

    score = difficultyScores[difficulty] || 70;

    // Bonus for good balance
    if (depthAnalysis.overallDepth >= 2 && depthAnalysis.overallDepth <= 6) {
      score += 5; // Good complexity balance
    }

    // Bonus for edge efficiency
    if (edgeAnalysis.edgeDensity > 0 && edgeAnalysis.edgeDensity < 1) {
      score += 5; // Good edge density
    }

    // Penalty for excessive complexity
    if (depthAnalysis.overallDepth > 12) {
      score -= 10; // Over-engineered
    }

    // Bonus for using advanced algorithms
    if (depthAnalysis.algorithms?.maxDepth >= 6) {
      score += 10; // Advanced algorithm usage
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Detect language from code patterns
   */
  detectLanguage(code) {
    const pythonScore = (code.match(/\bdef\b|\bimport\b|\bfrom\b|\bclass\b.*:/g) || []).length;
    const jsScore = (code.match(/\bfunction\b|\bconst\b|\blet\b|=>/g) || []).length;

    if (pythonScore > jsScore) return 'python';
    if (jsScore > pythonScore) return 'javascript';

    // Check syntax patterns
    if (/:\s*$|\bdef\s+\w+\s*\(/m.test(code)) return 'python';
    if (/{\s*$|\bfunction\s+\w+\s*\(/m.test(code)) return 'javascript';

    return 'unknown';
  }

  /**
   * Detect data structures
   */
  detectDataStructures(code, language) {
    return {
      hasArrays: /\[|\bArray\b|\blist\b/.test(code),
      hasObjects: /{.*:.*}|\bObject\b|\bdict\b/.test(code),
      hasSets: /\bSet\b|\bset\(/.test(code),
      hasMaps: /\bMap\b|\bdict\b/.test(code),
      hasCustomClasses: /\bclass\s+\w+/.test(code)
    };
  }

  /**
   * Detect algorithm patterns
   */
  detectAlgorithms(code, language) {
    return {
      sorting: /\.sort\b|\bsorted\b/.test(code),
      searching: /\.find\b|\.search\b|\.indexOf\b|\bin\b/.test(code),
      recursion: this.hasRecursion(code),
      dynamicProgramming: /memo|cache|dp\[/.test(code),
      graphTraversal: /\b(?:bfs|dfs|traverse|visit|queue|stack)\b/i.test(code)
    };
  }

  /**
   * Detect functional programming patterns
   */
  detectFunctionalPatterns(code, language) {
    return {
      map: /\.map\(/.test(code),
      filter: /\.filter\(/.test(code),
      reduce: /\.reduce\(/.test(code),
      compose: /compose|pipeline/.test(code)
    };
  }

  /**
   * Check for recursion
   */
  hasRecursion(code) {
    // Extract function names and check if they call themselves
    const functionMatches = code.match(/(?:function|def)\s+(\w+)/g);

    if (!functionMatches) return false;

    for (const match of functionMatches) {
      const funcName = match.split(/\s+/)[1];
      const regex = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
      const calls = code.match(regex);

      if (calls && calls.length > 1) return true; // Definition + recursive call
    }

    return false;
  }

  /**
   * Count nested loops
   */
  countNestedLoops(code) {
    let maxDepth = 0;
    let currentDepth = 0;

    const loopPattern = /\b(?:for|while|forEach|map|filter)\b/g;
    const lines = code.split('\n');

    for (const line of lines) {
      if (loopPattern.test(line)) {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      }

      // Reset depth on closing braces (simplified)
      if (/}/.test(line)) {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }

    return Math.max(0, maxDepth - 1); // Subtract 1 since single loop = 0 nesting
  }

  /**
   * Calculate average function length
   */
  calculateAverageFunctionLength(code) {
    const functions = code.match(/(?:function|def)\s+\w+[^{]*{[\s\S]*?^}/gm);

    if (!functions || functions.length === 0) return 0;

    const totalLines = functions.reduce((sum, func) => {
      return sum + func.split('\n').length;
    }, 0);

    return totalLines / functions.length;
  }

  /**
   * Check for documentation
   */
  hasDocumentation(code, language) {
    if (language === 'javascript') {
      return /\/\*\*|\/\//.test(code);
    }

    if (language === 'python') {
      return /#|"""/.test(code);
    }

    return false;
  }

  /**
   * Detect anti-patterns and return penalty
   */
  detectAntiPatterns(code, language) {
    let penalty = 0;

    // Magic numbers
    const magicNumbers = (code.match(this.antiPatterns.magicNumbers) || []).length;
    penalty += Math.min(15, magicNumbers * 3);

    // Deep nesting
    if (this.antiPatterns.deepNesting.test(code)) {
      penalty += 10;
    }

    // Global variables
    if ((code.match(this.antiPatterns.globalVariables) || []).length > 0) {
      penalty += 10;
    }

    return penalty;
  }

  /**
   * Calculate complexity metrics (ENHANCED with depth analysis)
   */
  calculateComplexity(code, language, depthAnalysis = null) {
    const loops = (code.match(this.complexityPatterns.loops) || []).length;
    const conditionals = (code.match(this.complexityPatterns.conditionals) || []).length;
    const functions = (code.match(this.complexityPatterns.functions) || []).length;

    // Cyclomatic complexity (simplified)
    const cyclomaticComplexity = 1 + conditionals + loops;

    const result = {
      loops,
      conditionals,
      functions,
      cyclomaticComplexity,
      complexityLevel: this.getComplexityLevel(cyclomaticComplexity)
    };

    // Add depth analysis metrics if available
    if (depthAnalysis) {
      result.codeDepth = {
        overall: depthAnalysis.overallDepth,
        max: depthAnalysis.maxDepth,
        difficulty: depthAnalysis.difficultyRank,
        stars: depthAnalysis.stars,
        algorithms: depthAnalysis.algorithms?.count || 0,
        sudokuEquivalent: depthAnalysis.comparisons?.sudoku || 'Unknown'
      };
    }

    return result;
  }

  /**
   * Get complexity level label
   */
  getComplexityLevel(complexity) {
    if (complexity <= 5) return 'simple';
    if (complexity <= 10) return 'moderate';
    if (complexity <= 20) return 'complex';
    return 'very complex';
  }

  /**
   * Generate human-readable feedback (ENHANCED with depth insights)
   */
  generateFeedback(scores, code, language, depthAnalysis = null, difficultyRanking = null) {
    const feedback = {
      strengths: [],
      improvements: [],
      suggestions: []
    };

    // Algorithm quality feedback
    if (scores.algorithmQuality >= 80) {
      feedback.strengths.push('Strong algorithm design and data structure usage');
    } else if (scores.algorithmQuality < 60) {
      feedback.improvements.push('Consider using more efficient algorithms and data structures');
      feedback.suggestions.push('Explore Sets/Maps for O(1) lookups instead of arrays');
    }

    // Code structure feedback
    if (scores.codeStructure >= 80) {
      feedback.strengths.push('Well-organized code with clear structure');
    } else if (scores.codeStructure < 60) {
      feedback.improvements.push('Break code into smaller, reusable functions');
      feedback.suggestions.push('Keep functions under 20 lines for better readability');
    }

    // Efficiency feedback
    if (scores.efficiency >= 80) {
      feedback.strengths.push('Efficient implementation with good time complexity');
    } else if (scores.efficiency < 60) {
      feedback.improvements.push('Avoid nested loops and optimize time complexity');
      feedback.suggestions.push('Consider memoization for recursive functions');
    }

    // Best practices feedback
    if (scores.bestPractices >= 80) {
      feedback.strengths.push(`Follows ${language} best practices well`);
    } else if (scores.bestPractices < 60) {
      if (language === 'javascript') {
        feedback.improvements.push('Use const/let instead of var, prefer arrow functions');
        feedback.suggestions.push('Consider async/await for asynchronous code');
      } else if (language === 'python') {
        feedback.improvements.push('Use list comprehensions and context managers');
        feedback.suggestions.push('Add type hints for better code clarity');
      }
    }

    // Error handling feedback
    if (scores.errorHandling >= 80) {
      feedback.strengths.push('Robust error handling and validation');
    } else if (scores.errorHandling < 60) {
      feedback.improvements.push('Add try-catch blocks and input validation');
      feedback.suggestions.push('Handle edge cases and potential errors');
    }

    // Code depth feedback (NEW)
    if (depthAnalysis && difficultyRanking) {
      const difficulty = difficultyRanking.baseDifficulty;
      const sudoku = depthAnalysis.comparisons?.sudoku || '';

      if (scores.codeDepth >= 85) {
        feedback.strengths.push(`Excellent code complexity balance - ${difficulty} difficulty (${sudoku})`);
      } else if (scores.codeDepth < 70) {
        if (depthAnalysis.overallDepth < 2) {
          feedback.improvements.push('Code is too simple - consider adding more sophisticated logic');
          feedback.suggestions.push('Explore using more advanced algorithms or data structures');
        } else if (depthAnalysis.overallDepth > 12) {
          feedback.improvements.push('Code is over-engineered - simplify where possible');
          feedback.suggestions.push('Break complex logic into smaller, more manageable pieces');
        }
      }

      // Specific algorithm feedback
      if (depthAnalysis.algorithms?.count > 0) {
        const algoList = depthAnalysis.algorithms.items.map(a => a.type).join(', ');
        feedback.strengths.push(`Uses advanced algorithms: ${algoList}`);
      }
    }

    return feedback;
  }

  /**
   * Get detailed analysis report
   */
  generateReport(evaluationResult, code, language) {
    const dataStructures = this.detectDataStructures(code, language);
    const algorithms = this.detectAlgorithms(code, language);
    const functional = this.detectFunctionalPatterns(code, language);

    return {
      ...evaluationResult,
      analysis: {
        dataStructures,
        algorithms,
        functionalPatterns: functional,
        codeMetrics: {
          lines: code.split('\n').length,
          functions: (code.match(this.complexityPatterns.functions) || []).length,
          avgFunctionLength: this.calculateAverageFunctionLength(code),
          nestedLoops: this.countNestedLoops(code)
        }
      }
    };
  }
}

module.exports = LogicGrader;

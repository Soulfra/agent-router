/**
 * Code Depth Analyzer
 *
 * Analyzes code complexity using depth scoring:
 * - Negative depths: Simple variables and primitives
 * - Zero depth: Basic functions with no dependencies
 * - Positive depths: Complex algorithms, nesting, APIs
 *
 * Think of it like Sudoku difficulty:
 * - Depth -3 to 0: Easy
 * - Depth 0 to 3: Medium
 * - Depth 3 to 7: Hard
 * - Depth 7+: Expert/Master
 */

class CodeDepthAnalyzer {
  constructor() {
    // Depth weights for different code elements
    this.depthWeights = {
      variable: -2,
      simpleFunction: 0,
      functionCall: 1,
      conditional: 1,
      loop: 2,
      nestedLoop: 3,
      recursion: 5,
      async: 3,
      promise: 3,
      apiCall: 4,
      dynamicProgramming: 6,
      graphAlgorithm: 7,
      stateManagement: 4,
      eventHandlers: 2
    };
  }

  /**
   * Analyze code depth and complexity
   * @param {string} code - Code to analyze
   * @param {string} language - Programming language
   * @returns {object} Depth analysis result
   */
  analyze(code, language = 'javascript') {
    const analysis = {
      language,
      variables: this.analyzeVariables(code, language),
      functions: this.analyzeFunctions(code, language),
      algorithms: this.analyzeAlgorithms(code, language),
      dependencies: this.analyzeDependencies(code, language),
      nesting: this.analyzeNesting(code, language)
    };

    // Calculate overall depth
    analysis.depthScores = this.calculateDepthScores(analysis);
    analysis.overallDepth = analysis.depthScores.weighted;
    analysis.maxDepth = analysis.depthScores.max;

    // Determine difficulty rank
    analysis.difficultyRank = this.getDifficultyRank(analysis.overallDepth);
    analysis.stars = this.getStarRating(analysis.overallDepth);

    // Generate comparisons
    analysis.comparisons = this.generateComparisons(analysis.overallDepth);

    return analysis;
  }

  /**
   * Analyze variables and their complexity
   */
  analyzeVariables(code, language) {
    const variables = [];

    // Match variable declarations
    let varMatches;
    if (language === 'javascript') {
      varMatches = code.match(/(?:const|let|var)\s+(\w+)\s*=\s*([^;]+)/g);
    } else if (language === 'python') {
      varMatches = code.match(/(\w+)\s*=\s*([^#\n]+)/g);
    }

    if (varMatches) {
      for (const match of varMatches) {
        const [, name, value] = match.match(/(\w+)\s*=\s*(.+)/) || [];

        if (!name) continue;

        const varAnalysis = {
          name,
          depth: this.calculateVariableDepth(value),
          type: this.detectVariableType(value),
          edges: this.countVariableEdges(value)
        };

        variables.push(varAnalysis);
      }
    }

    return {
      count: variables.length,
      items: variables,
      averageDepth: this.calculateAverage(variables.map(v => v.depth)),
      totalEdges: variables.reduce((sum, v) => sum + v.edges, 0)
    };
  }

  /**
   * Calculate variable depth based on its value
   */
  calculateVariableDepth(value) {
    // Primitive (number, string, boolean)
    if (/^\d+$|^["'].*["']$|^true$|^false$/.test(value.trim())) {
      return -3;
    }

    // Array
    if (/^\[.*\]$/.test(value.trim())) {
      // Count nesting in array
      const nesting = (value.match(/\[/g) || []).length;
      return -2 + (nesting - 1);
    }

    // Object
    if (/^{.*}$/.test(value.trim())) {
      // Count properties
      const properties = (value.match(/:/g) || []).length;
      return -1 + Math.floor(properties / 3);
    }

    // Function call
    if (/\w+\([^)]*\)/.test(value)) {
      return 0;
    }

    return -2; // Default to simple
  }

  /**
   * Detect variable type
   */
  detectVariableType(value) {
    if (/^\d+$/.test(value.trim())) return 'number';
    if (/^["'].*["']$/.test(value.trim())) return 'string';
    if (/^(true|false)$/.test(value.trim())) return 'boolean';
    if (/^\[.*\]$/.test(value.trim())) return 'array';
    if (/^{.*}$/.test(value.trim())) return 'object';
    if (/\w+\([^)]*\)/.test(value)) return 'function-call';
    return 'unknown';
  }

  /**
   * Count edges (properties, array elements, etc.)
   */
  countVariableEdges(value) {
    // Object properties
    if (/^{.*}$/.test(value.trim())) {
      return (value.match(/:/g) || []).length;
    }

    // Array elements (rough estimate)
    if (/^\[.*\]$/.test(value.trim())) {
      return (value.match(/,/g) || []).length + 1;
    }

    return 0;
  }

  /**
   * Analyze functions and their depth
   */
  analyzeFunctions(code, language) {
    const functions = [];

    // Match function declarations
    let funcMatches;
    if (language === 'javascript') {
      funcMatches = code.match(/function\s+(\w+)\s*\([^)]*\)\s*{[\s\S]*?^}/gm);
    } else if (language === 'python') {
      funcMatches = code.match(/def\s+(\w+)\s*\([^)]*\):[\s\S]*?(?=\ndef|\nclass|$)/gm);
    }

    if (funcMatches) {
      for (const funcCode of funcMatches) {
        const nameMatch = funcCode.match(/(?:function|def)\s+(\w+)/);
        const name = nameMatch ? nameMatch[1] : 'anonymous';

        const funcAnalysis = {
          name,
          depth: this.calculateFunctionDepth(funcCode, language),
          calls: this.extractFunctionCalls(funcCode),
          edges: 0,
          lines: funcCode.split('\n').length
        };

        funcAnalysis.edges = funcAnalysis.calls.length;

        functions.push(funcAnalysis);
      }
    }

    return {
      count: functions.length,
      items: functions,
      averageDepth: this.calculateAverage(functions.map(f => f.depth)),
      totalEdges: functions.reduce((sum, f) => sum + f.edges, 0)
    };
  }

  /**
   * Calculate function depth
   */
  calculateFunctionDepth(funcCode, language) {
    let depth = 0;

    // Check for function calls (each adds depth)
    const functionCalls = (funcCode.match(/\w+\([^)]*\)/g) || []).length;
    depth += functionCalls * this.depthWeights.functionCall;

    // Check for conditionals
    const conditionals = (funcCode.match(/\bif\b|\belse\b|\bswitch\b/g) || []).length;
    depth += conditionals * this.depthWeights.conditional;

    // Check for loops
    const loops = (funcCode.match(/\bfor\b|\bwhile\b|\bforeach\b/gi) || []).length;
    depth += loops * this.depthWeights.loop;

    // Check for nested loops (rough heuristic)
    const nestedLoops = this.countNestedLoops(funcCode);
    depth += nestedLoops * this.depthWeights.nestedLoop;

    // Check for recursion
    const funcName = (funcCode.match(/(?:function|def)\s+(\w+)/) || [])[1];
    if (funcName && new RegExp(`\\b${funcName}\\s*\\(`).test(funcCode)) {
      depth += this.depthWeights.recursion;
    }

    // Check for async/promises
    if (/\basync\b|\bawait\b/.test(funcCode)) {
      depth += this.depthWeights.async;
    }

    if (/\.then\(|\.catch\(|new\s+Promise/.test(funcCode)) {
      depth += this.depthWeights.promise;
    }

    return depth;
  }

  /**
   * Extract function calls from code
   */
  extractFunctionCalls(code) {
    const calls = [];
    const matches = code.match(/\b(\w+)\s*\(/g);

    if (matches) {
      for (const match of matches) {
        const name = match.replace(/\s*\(/, '');
        // Filter out keywords
        if (!['if', 'for', 'while', 'switch', 'function', 'return'].includes(name)) {
          calls.push(name);
        }
      }
    }

    return [...new Set(calls)]; // Unique calls
  }

  /**
   * Count nested loops
   */
  countNestedLoops(code) {
    let maxNesting = 0;
    let currentNesting = 0;

    const lines = code.split('\n');

    for (const line of lines) {
      if (/\b(?:for|while)\b/.test(line)) {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      }

      if (/}/.test(line)) {
        currentNesting = Math.max(0, currentNesting - 1);
      }
    }

    return Math.max(0, maxNesting - 1); // 0 = single loop, 1 = nested, etc.
  }

  /**
   * Analyze algorithms used
   */
  analyzeAlgorithms(code, language) {
    const algorithms = [];

    // Detect sorting
    if (/\.sort\(|sorted\(/.test(code)) {
      algorithms.push({
        type: 'sorting',
        depth: 2,
        description: 'Sorting algorithm'
      });
    }

    // Detect searching
    if (/\.find\(|\.indexOf\(|\.search\(/.test(code)) {
      algorithms.push({
        type: 'searching',
        depth: 1,
        description: 'Linear search'
      });
    }

    // Detect recursion
    const funcNames = (code.match(/(?:function|def)\s+(\w+)/g) || []).map(m => m.split(/\s+/)[1]);
    for (const name of funcNames) {
      if (new RegExp(`\\b${name}\\s*\\(`).test(code)) {
        const callCount = (code.match(new RegExp(`\\b${name}\\s*\\(`, 'g')) || []).length;
        if (callCount > 1) {
          algorithms.push({
            type: 'recursion',
            depth: this.depthWeights.recursion,
            description: `Recursive function: ${name}`
          });
        }
      }
    }

    // Detect dynamic programming
    if (/memo|cache|dp\[/.test(code)) {
      algorithms.push({
        type: 'dynamic-programming',
        depth: this.depthWeights.dynamicProgramming,
        description: 'Dynamic programming with memoization'
      });
    }

    // Detect graph algorithms (BFS/DFS)
    if (/\b(?:bfs|dfs|queue|visited|traverse)\b/i.test(code)) {
      algorithms.push({
        type: 'graph-traversal',
        depth: this.depthWeights.graphAlgorithm,
        description: 'Graph traversal (BFS/DFS)'
      });
    }

    return {
      count: algorithms.length,
      items: algorithms,
      maxDepth: algorithms.length > 0 ? Math.max(...algorithms.map(a => a.depth)) : 0
    };
  }

  /**
   * Analyze dependencies (APIs, external libraries)
   */
  analyzeDependencies(code, language) {
    const dependencies = {
      imports: 0,
      apiCalls: 0,
      externalLibraries: [],
      depth: 0
    };

    // Count imports
    dependencies.imports = (code.match(/\b(?:import|require|from)\b/g) || []).length;

    // Detect API calls
    if (/fetch\(|axios\.|http\.|XMLHttpRequest/.test(code)) {
      dependencies.apiCalls++;
      dependencies.depth += this.depthWeights.apiCall;
    }

    // Detect common libraries
    const libraries = ['axios', 'lodash', 'moment', 'express', 'react', 'vue'];
    for (const lib of libraries) {
      if (new RegExp(`\\b${lib}\\b`, 'i').test(code)) {
        dependencies.externalLibraries.push(lib);
      }
    }

    dependencies.depth += dependencies.imports * 0.5;

    return dependencies;
  }

  /**
   * Analyze nesting depth
   */
  analyzeNesting(code, language) {
    let maxDepth = 0;
    let currentDepth = 0;

    const lines = code.split('\n');

    for (const line of lines) {
      // Count opening braces
      const opens = (line.match(/[{(]/g) || []).length;
      currentDepth += opens;
      maxDepth = Math.max(maxDepth, currentDepth);

      // Count closing braces
      const closes = (line.match(/[})]/g) || []).length;
      currentDepth = Math.max(0, currentDepth - closes);
    }

    return {
      maxDepth,
      score: Math.min(maxDepth, 10) // Cap at 10
    };
  }

  /**
   * Calculate depth scores
   */
  calculateDepthScores(analysis) {
    const scores = {
      variables: analysis.variables.averageDepth,
      functions: analysis.functions.averageDepth,
      algorithms: analysis.algorithms.maxDepth,
      dependencies: analysis.dependencies.depth,
      nesting: analysis.nesting.score
    };

    // Weighted average
    scores.weighted = (
      scores.variables * 0.1 +
      scores.functions * 0.3 +
      scores.algorithms * 0.4 +
      scores.dependencies * 0.1 +
      scores.nesting * 0.1
    );

    scores.max = Math.max(
      scores.variables,
      scores.functions,
      scores.algorithms,
      scores.dependencies
    );

    return scores;
  }

  /**
   * Get difficulty rank (Sudoku-style)
   */
  getDifficultyRank(depth) {
    if (depth < 0) return 'Trivial';
    if (depth < 2) return 'Easy';
    if (depth < 5) return 'Medium';
    if (depth < 8) return 'Hard';
    if (depth < 12) return 'Expert';
    return 'Master';
  }

  /**
   * Get star rating (1-5)
   */
  getStarRating(depth) {
    if (depth < 0) return 1;
    if (depth < 2) return 2;
    if (depth < 5) return 3;
    if (depth < 8) return 4;
    return 5;
  }

  /**
   * Generate comparisons to other difficulty systems
   */
  generateComparisons(depth) {
    const comparisons = {
      sudoku: '',
      crossword: '',
      leetcode: '',
      description: ''
    };

    if (depth < 0) {
      comparisons.sudoku = 'Tutorial (1-star)';
      comparisons.crossword = 'Monday (easiest)';
      comparisons.leetcode = 'Trivial';
      comparisons.description = 'Simple variables and constants';
    } else if (depth < 2) {
      comparisons.sudoku = 'Easy (2-star)';
      comparisons.crossword = 'Tuesday';
      comparisons.leetcode = 'Easy';
      comparisons.description = 'Basic functions with simple logic';
    } else if (depth < 5) {
      comparisons.sudoku = 'Medium (3-star)';
      comparisons.crossword = 'Wednesday';
      comparisons.leetcode = 'Medium';
      comparisons.description = 'Loops, conditionals, some nesting';
    } else if (depth < 8) {
      comparisons.sudoku = 'Hard (4-star)';
      comparisons.crossword = 'Thursday';
      comparisons.leetcode = 'Medium-Hard';
      comparisons.description = 'Recursion, algorithms, complex logic';
    } else if (depth < 12) {
      comparisons.sudoku = 'Expert (5-star)';
      comparisons.crossword = 'Friday';
      comparisons.leetcode = 'Hard';
      comparisons.description = 'Advanced algorithms, graph traversal';
    } else {
      comparisons.sudoku = 'Master (5+ star)';
      comparisons.crossword = 'Saturday/Sunday (hardest)';
      comparisons.leetcode = 'Hard+';
      comparisons.description = 'Expert-level patterns, distributed systems';
    }

    return comparisons;
  }

  /**
   * Calculate average of array
   */
  calculateAverage(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }
}

module.exports = CodeDepthAnalyzer;

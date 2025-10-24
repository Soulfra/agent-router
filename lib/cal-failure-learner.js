/**
 * CAL Failure Learning Engine
 *
 * Teaches CAL to learn from his own mistakes by:
 * - Parsing logs and extracting error patterns
 * - Tracking which approaches have failed repeatedly
 * - Suggesting alternative approaches when patterns repeat
 * - Building a knowledge base of "tried and failed" solutions
 *
 * Example:
 *   const learner = new CalFailureLearner();
 *   await learner.recordFailure('css-loading', 'CSS variables not applying', { approach: 'themes.css' });
 *   const shouldTry = learner.shouldTryApproach('css-loading', 'themes.css');
 *   const alternatives = learner.getAlternatives('css-loading');
 */

const fs = require('fs').promises;
const path = require('path');

class CalFailureLearner {
  constructor(options = {}) {
    this.knowledgeBasePath = options.knowledgeBasePath || path.join(__dirname, '../logs/cal-learning.json');
    this.maxAttempts = options.maxAttempts || 3; // Stop trying after 3 failures
    this.logPath = options.logPath || '/tmp/calos-server.log';

    this.knowledge = {
      failures: {},      // { taskId: [{ approach, error, timestamp, count }] }
      successes: {},     // { taskId: [{ approach, timestamp }] }
      patterns: {},      // { errorPattern: [{ taskId, approach, count }] }
      alternatives: {}   // { taskId: [{ approach, successRate }] }
    };

    this.loaded = false;
  }

  /**
   * Load knowledge base from disk
   */
  async load() {
    try {
      const data = await fs.readFile(this.knowledgeBasePath, 'utf8');
      this.knowledge = JSON.parse(data);
      this.loaded = true;
      console.log('[FailureLearner] Loaded knowledge base:', {
        failures: Object.keys(this.knowledge.failures).length,
        successes: Object.keys(this.knowledge.successes).length,
        patterns: Object.keys(this.knowledge.patterns).length
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[FailureLearner] No existing knowledge base, starting fresh');
        this.loaded = true;
      } else {
        console.error('[FailureLearner] Failed to load knowledge base:', error.message);
      }
    }
  }

  /**
   * Save knowledge base to disk
   */
  async save() {
    try {
      const dir = path.dirname(this.knowledgeBasePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.knowledgeBasePath, JSON.stringify(this.knowledge, null, 2));
      console.log('[FailureLearner] Saved knowledge base');
    } catch (error) {
      console.error('[FailureLearner] Failed to save knowledge base:', error.message);
    }
  }

  /**
   * Record a failure
   *
   * @param {string} taskId - Task identifier (e.g., 'css-loading', 'api-routing')
   * @param {string} error - Error message or description
   * @param {Object} context - { approach, file, lineNumber, etc. }
   */
  async recordFailure(taskId, error, context = {}) {
    if (!this.loaded) await this.load();

    const { approach = 'unknown', file, lineNumber } = context;

    // Initialize task failures
    if (!this.knowledge.failures[taskId]) {
      this.knowledge.failures[taskId] = [];
    }

    // Check if this exact failure exists
    const existing = this.knowledge.failures[taskId].find(
      f => f.approach === approach && f.error === error
    );

    if (existing) {
      existing.count++;
      existing.lastSeen = new Date().toISOString();
    } else {
      this.knowledge.failures[taskId].push({
        approach,
        error,
        file,
        lineNumber,
        count: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      });
    }

    // Extract and track error patterns
    const pattern = this._extractPattern(error);
    if (pattern) {
      if (!this.knowledge.patterns[pattern]) {
        this.knowledge.patterns[pattern] = [];
      }

      const patternEntry = this.knowledge.patterns[pattern].find(
        p => p.taskId === taskId && p.approach === approach
      );

      if (patternEntry) {
        patternEntry.count++;
      } else {
        this.knowledge.patterns[pattern].push({
          taskId,
          approach,
          count: 1
        });
      }
    }

    await this.save();

    console.log(`[FailureLearner] Recorded failure for ${taskId}:`, {
      approach,
      error: error.substring(0, 100),
      totalFailures: this.knowledge.failures[taskId].length
    });

    return {
      shouldStop: existing && existing.count >= this.maxAttempts,
      failureCount: existing ? existing.count : 1,
      suggestion: this._getSuggestion(taskId, approach)
    };
  }

  /**
   * Record a success
   */
  async recordSuccess(taskId, approach, context = {}) {
    if (!this.loaded) await this.load();

    if (!this.knowledge.successes[taskId]) {
      this.knowledge.successes[taskId] = [];
    }

    this.knowledge.successes[taskId].push({
      approach,
      context,
      timestamp: new Date().toISOString()
    });

    await this.save();

    console.log(`[FailureLearner] Recorded success for ${taskId}: ${approach}`);
  }

  /**
   * Check if an approach should be tried
   * Returns false if it's failed too many times
   */
  shouldTryApproach(taskId, approach) {
    if (!this.loaded || !this.knowledge.failures[taskId]) return true;

    const failures = this.knowledge.failures[taskId].filter(f => f.approach === approach);
    const totalFailures = failures.reduce((sum, f) => sum + f.count, 0);

    return totalFailures < this.maxAttempts;
  }

  /**
   * Get alternative approaches for a task
   */
  getAlternatives(taskId) {
    if (!this.loaded) return [];

    const failures = this.knowledge.failures[taskId] || [];
    const successes = this.knowledge.successes[taskId] || [];

    // Get all unique approaches
    const failedApproaches = new Set(failures.map(f => f.approach));
    const successfulApproaches = new Set(successes.map(s => s.approach));

    // Build recommendations
    const alternatives = [];

    // 1. Approaches that have succeeded before
    successfulApproaches.forEach(approach => {
      if (!failedApproaches.has(approach)) {
        alternatives.push({
          approach,
          reason: 'Previously successful',
          confidence: 0.9,
          successCount: successes.filter(s => s.approach === approach).length
        });
      }
    });

    // 2. Common patterns from similar tasks
    const similarTasks = this._findSimilarTasks(taskId);
    similarTasks.forEach(({ taskId: similarTaskId, similarity }) => {
      const similarSuccesses = this.knowledge.successes[similarTaskId] || [];
      similarSuccesses.forEach(s => {
        if (!failedApproaches.has(s.approach)) {
          alternatives.push({
            approach: s.approach,
            reason: `Successful in similar task: ${similarTaskId}`,
            confidence: 0.7 * similarity,
            sourceTask: similarTaskId
          });
        }
      });
    });

    // 3. Generic fallbacks
    if (alternatives.length === 0) {
      alternatives.push(
        { approach: 'inline-styles', reason: 'Fallback: Always works', confidence: 0.5 },
        { approach: 'simplified-version', reason: 'Fallback: Reduce complexity', confidence: 0.5 },
        { approach: 'known-working-example', reason: 'Fallback: Copy from working code', confidence: 0.6 }
      );
    }

    // Sort by confidence
    return alternatives.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Parse server logs and extract failures
   */
  async parseServerLogs() {
    try {
      const logs = await fs.readFile(this.logPath, 'utf8');
      const lines = logs.split('\n');

      const errors = [];
      for (const line of lines) {
        if (line.includes('Error:') || line.includes('ERROR') || line.includes('Failed')) {
          errors.push({
            line,
            pattern: this._extractPattern(line),
            timestamp: this._extractTimestamp(line)
          });
        }
      }

      console.log(`[FailureLearner] Parsed ${errors.length} errors from logs`);
      return errors;
    } catch (error) {
      console.error('[FailureLearner] Failed to parse logs:', error.message);
      return [];
    }
  }

  /**
   * Get learning summary for a task
   */
  getSummary(taskId) {
    if (!this.loaded) return null;

    const failures = this.knowledge.failures[taskId] || [];
    const successes = this.knowledge.successes[taskId] || [];

    const totalFailures = failures.reduce((sum, f) => sum + f.count, 0);
    const uniqueApproaches = new Set([
      ...failures.map(f => f.approach),
      ...successes.map(s => s.approach)
    ]);

    return {
      taskId,
      totalFailures,
      totalSuccesses: successes.length,
      uniqueApproaches: uniqueApproaches.size,
      mostFailedApproach: failures.sort((a, b) => b.count - a.count)[0],
      mostSuccessfulApproach: successes[successes.length - 1],
      recommendation: this.getAlternatives(taskId)[0]
    };
  }

  /**
   * Extract error pattern from error message
   * @private
   */
  _extractPattern(error) {
    // Common patterns
    const patterns = [
      { regex: /ENOENT.*no such file/i, name: 'file-not-found' },
      { regex: /EADDRINUSE.*address already in use/i, name: 'port-in-use' },
      { regex: /relation.*does not exist/i, name: 'database-table-missing' },
      { regex: /Cannot read.*of undefined/i, name: 'undefined-property' },
      { regex: /fetch.*failed/i, name: 'fetch-failed' },
      { regex: /Unexpected token/i, name: 'syntax-error' },
      { regex: /chrome\.tabs/i, name: 'chrome-extension-error' },
      { regex: /CSS.*not.*load/i, name: 'css-loading-failed' },
      { regex: /timeout.*exceeded/i, name: 'timeout' }
    ];

    for (const { regex, name } of patterns) {
      if (regex.test(error)) return name;
    }

    return null;
  }

  /**
   * Extract timestamp from log line
   * @private
   */
  _extractTimestamp(line) {
    const match = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    return match ? match[0] : new Date().toISOString();
  }

  /**
   * Find similar tasks based on error patterns
   * @private
   */
  _findSimilarTasks(taskId) {
    const currentFailures = this.knowledge.failures[taskId] || [];
    const currentPatterns = new Set(
      currentFailures
        .map(f => this._extractPattern(f.error))
        .filter(p => p)
    );

    const similarities = [];

    Object.keys(this.knowledge.failures).forEach(otherTaskId => {
      if (otherTaskId === taskId) return;

      const otherFailures = this.knowledge.failures[otherTaskId];
      const otherPatterns = new Set(
        otherFailures
          .map(f => this._extractPattern(f.error))
          .filter(p => p)
      );

      // Calculate Jaccard similarity
      const intersection = new Set([...currentPatterns].filter(p => otherPatterns.has(p)));
      const union = new Set([...currentPatterns, ...otherPatterns]);

      if (union.size > 0) {
        const similarity = intersection.size / union.size;
        if (similarity > 0.3) {
          similarities.push({ taskId: otherTaskId, similarity });
        }
      }
    });

    return similarities.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Get suggestion based on past failures
   * @private
   */
  _getSuggestion(taskId, currentApproach) {
    const alternatives = this.getAlternatives(taskId);

    if (alternatives.length > 0 && alternatives[0].approach !== currentApproach) {
      return `Try "${alternatives[0].approach}" instead (${alternatives[0].reason})`;
    }

    return `Current approach "${currentApproach}" has failed. Consider trying a completely different strategy.`;
  }
}

module.exports = CalFailureLearner;

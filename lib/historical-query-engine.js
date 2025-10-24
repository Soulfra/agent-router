/**
 * Historical Query Engine
 *
 * Queries historical data from:
 * - Command execution history (from CommandVerifier)
 * - RL learning progress (from RLCommandLearner)
 * - Time-series analysis of system improvement
 *
 * Use cases:
 * - "Show me command success rate trends"
 * - "Which commands have improved over time?"
 * - "What's the learning curve for spotify commands?"
 * - "Historical data for xcode build times"
 */

const fs = require('fs').promises;
const path = require('path');

class HistoricalQueryEngine {
  constructor(options = {}) {
    this.healthPath = options.healthPath || path.join(process.env.HOME, '.calos/command-health.json');
    this.knowledgePath = options.knowledgePath || path.join(process.env.HOME, '.calos/command-knowledge.json');
  }

  /**
   * Query command execution history
   * @param {object} filters - Query filters
   * @returns {Promise<object>}
   */
  async queryCommands(filters = {}) {
    const health = await this.loadHealth();

    let commands = Object.entries(health.commands).map(([testId, data]) => ({
      testId,
      ...data,
      passRate: data.testCount > 0 ? (data.passCount / data.testCount * 100).toFixed(1) : 0
    }));

    // Apply filters
    if (filters.status) {
      const { status } = filters;
      commands = commands.filter(cmd => {
        if (status === 'working') {
          return cmd.recentResults[0]?.success && parseFloat(cmd.passRate) >= 50;
        } else if (status === 'failing') {
          return !cmd.recentResults[0]?.success || parseFloat(cmd.passRate) < 50;
        }
        return true;
      });
    }

    if (filters.command) {
      const search = filters.command.toLowerCase();
      commands = commands.filter(cmd =>
        cmd.command.toLowerCase().includes(search) ||
        cmd.testId.toLowerCase().includes(search)
      );
    }

    if (filters.minTests) {
      commands = commands.filter(cmd => cmd.testCount >= filters.minTests);
    }

    // Sort
    const sortBy = filters.sortBy || 'lastSuccess';
    commands.sort((a, b) => {
      if (sortBy === 'passRate') {
        return parseFloat(b.passRate) - parseFloat(a.passRate);
      } else if (sortBy === 'testCount') {
        return b.testCount - a.testCount;
      } else if (sortBy === 'lastSuccess') {
        return new Date(b.lastSuccess || 0) - new Date(a.lastSuccess || 0);
      } else if (sortBy === 'lastFailure') {
        return new Date(b.lastFailure || 0) - new Date(a.lastFailure || 0);
      }
      return 0;
    });

    // Limit results
    const limit = filters.limit || 100;
    commands = commands.slice(0, limit);

    return {
      commands,
      totalCommands: Object.keys(health.commands).length,
      totalTests: health.totalTests,
      totalPassed: health.totalPassed,
      totalFailed: health.totalFailed,
      overallPassRate: health.totalTests > 0
        ? ((health.totalPassed / health.totalTests) * 100).toFixed(1)
        : 0
    };
  }

  /**
   * Query RL learning progress
   * @param {object} filters - Query filters
   * @returns {Promise<object>}
   */
  async queryLearning(filters = {}) {
    const knowledge = await this.loadKnowledge();

    let commands = Object.entries(knowledge.commands).map(([commandKey, data]) => ({
      commandKey,
      ...data,
      successRate: data.observations > 0
        ? ((data.successes / data.observations) * 100).toFixed(1)
        : 0
    }));

    // Apply filters
    if (filters.command) {
      const search = filters.command.toLowerCase();
      commands = commands.filter(cmd =>
        cmd.command.toLowerCase().includes(search) ||
        cmd.commandKey.toLowerCase().includes(search)
      );
    }

    if (filters.minObservations) {
      commands = commands.filter(cmd => cmd.observations >= filters.minObservations);
    }

    // Sort
    const sortBy = filters.sortBy || 'qValue';
    commands.sort((a, b) => {
      if (sortBy === 'qValue') {
        return b.qValue - a.qValue;
      } else if (sortBy === 'successRate') {
        return parseFloat(b.successRate) - parseFloat(a.successRate);
      } else if (sortBy === 'observations') {
        return b.observations - a.observations;
      } else if (sortBy === 'avgDuration') {
        return a.avgDuration - b.avgDuration;
      }
      return 0;
    });

    // Limit results
    const limit = filters.limit || 100;
    commands = commands.slice(0, limit);

    return {
      commands,
      totalCommands: Object.keys(knowledge.commands).length,
      totalObservations: knowledge.metadata.totalObservations,
      totalSuccesses: knowledge.metadata.totalSuccesses,
      totalFailures: knowledge.metadata.totalFailures,
      overallSuccessRate: knowledge.metadata.totalObservations > 0
        ? ((knowledge.metadata.totalSuccesses / knowledge.metadata.totalObservations) * 100).toFixed(1)
        : 0
    };
  }

  /**
   * Analyze time-series trends
   * @param {string} testId - Command test ID
   * @returns {Promise<object>}
   */
  async analyzeTrends(testId) {
    const health = await this.loadHealth();
    const knowledge = await this.loadKnowledge();

    const healthData = health.commands[testId];
    const knowledgeData = knowledge.commands[testId];

    if (!healthData && !knowledgeData) {
      throw new Error(`No data found for: ${testId}`);
    }

    const trends = {
      testId,
      command: healthData?.command || knowledgeData?.command,
      health: null,
      learning: null,
      trend: null
    };

    // Analyze health trend (from recent results)
    if (healthData && healthData.recentResults.length > 0) {
      const recent = healthData.recentResults;
      const oldestSuccess = recent.filter(r => r.success).length / Math.min(5, recent.length);
      const newestSuccess = recent.slice(0, 5).filter(r => r.success).length / Math.min(5, recent.slice(0, 5).length);

      trends.health = {
        totalTests: healthData.testCount,
        passRate: parseFloat(healthData.passCount / healthData.testCount * 100).toFixed(1),
        recentPassRate: (newestSuccess * 100).toFixed(1),
        improving: newestSuccess > oldestSuccess,
        recentResults: recent.slice(0, 10).map(r => ({
          timestamp: r.timestamp,
          success: r.success,
          duration: r.duration
        }))
      };
    }

    // Analyze learning trend (Q-value and success rate over time)
    if (knowledgeData) {
      trends.learning = {
        qValue: knowledgeData.qValue.toFixed(2),
        observations: knowledgeData.observations,
        successRate: (knowledgeData.successes / knowledgeData.observations * 100).toFixed(1),
        avgDuration: Math.round(knowledgeData.avgDuration),
        lastObserved: knowledgeData.lastObserved,
        contextPerformance: Object.entries(knowledgeData.contextPerformance).map(([ctx, perf]) => ({
          context: ctx,
          observations: perf.observations,
          successRate: (perf.successes / perf.observations * 100).toFixed(1),
          avgReward: perf.avgReward.toFixed(2)
        }))
      };
    }

    // Overall trend assessment
    if (trends.health && trends.learning) {
      const healthImproving = trends.health.improving;
      const qValuePositive = knowledgeData.qValue > 0;
      const highSuccessRate = parseFloat(trends.learning.successRate) > 70;

      if (healthImproving && qValuePositive && highSuccessRate) {
        trends.trend = 'improving';
      } else if (!healthImproving && knowledgeData.qValue < -5) {
        trends.trend = 'declining';
      } else {
        trends.trend = 'stable';
      }
    }

    return trends;
  }

  /**
   * Compare commands
   * @param {array} testIds - Command test IDs
   * @returns {Promise<object>}
   */
  async compareCommands(testIds) {
    const comparisons = [];

    for (const testId of testIds) {
      try {
        const trends = await this.analyzeTrends(testId);
        comparisons.push(trends);
      } catch (error) {
        comparisons.push({
          testId,
          error: error.message
        });
      }
    }

    // Rank by performance
    const ranked = comparisons
      .filter(c => !c.error)
      .sort((a, b) => {
        const aScore = (parseFloat(a.health?.passRate || 0) + parseFloat(a.learning?.successRate || 0)) / 2;
        const bScore = (parseFloat(b.health?.passRate || 0) + parseFloat(b.learning?.successRate || 0)) / 2;
        return bScore - aScore;
      });

    return {
      comparisons: ranked,
      best: ranked[0],
      worst: ranked[ranked.length - 1]
    };
  }

  /**
   * Get improvement summary
   * @param {object} options - Time range options
   * @returns {Promise<object>}
   */
  async getImprovementSummary(options = {}) {
    const health = await this.loadHealth();
    const knowledge = await this.loadKnowledge();

    // Commands that have improved (Q-value > 0 and success rate > 50%)
    const improved = [];
    const declined = [];
    const stable = [];

    for (const [testId, cmdData] of Object.entries(knowledge.commands)) {
      if (cmdData.observations < 5) continue;  // Need enough data

      const successRate = cmdData.successes / cmdData.observations;
      const qValue = cmdData.qValue;

      if (qValue > 5 && successRate > 0.7) {
        improved.push({ testId, qValue, successRate: (successRate * 100).toFixed(1) });
      } else if (qValue < -5 && successRate < 0.3) {
        declined.push({ testId, qValue, successRate: (successRate * 100).toFixed(1) });
      } else {
        stable.push({ testId, qValue, successRate: (successRate * 100).toFixed(1) });
      }
    }

    return {
      summary: {
        totalCommands: Object.keys(knowledge.commands).length,
        improved: improved.length,
        declined: declined.length,
        stable: stable.length,
        overallQValue: this.calculateAverageQValue(knowledge),
        overallSuccessRate: ((knowledge.metadata.totalSuccesses / knowledge.metadata.totalObservations) * 100).toFixed(1)
      },
      improved: improved.slice(0, 10),
      declined: declined.slice(0, 10),
      stable: stable.slice(0, 10)
    };
  }

  /**
   * Calculate average Q-value
   */
  calculateAverageQValue(knowledge) {
    const qValues = Object.values(knowledge.commands).map(c => c.qValue);
    if (qValues.length === 0) return 0;
    return (qValues.reduce((a, b) => a + b, 0) / qValues.length).toFixed(2);
  }

  /**
   * Get fix strategies effectiveness
   * @param {string} command - Command name
   * @returns {Promise<object>}
   */
  async getFixStrategies(command) {
    const knowledge = await this.loadKnowledge();
    const strategies = knowledge.fixStrategies[command];

    if (!strategies) {
      return {
        command,
        strategies: [],
        message: 'No fix strategies learned yet'
      };
    }

    const strategyList = Object.entries(strategies)
      .map(([fix, data]) => ({
        fix,
        attempts: data.attempts,
        successes: data.successes,
        successRate: (data.successRate * 100).toFixed(1)
      }))
      .sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));

    return {
      command,
      strategies: strategyList,
      bestStrategy: strategyList[0] || null
    };
  }

  /**
   * Load health data
   */
  async loadHealth() {
    try {
      const data = await fs.readFile(this.healthPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return {
        commands: {},
        lastUpdate: null,
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0
      };
    }
  }

  /**
   * Load knowledge data
   */
  async loadKnowledge() {
    try {
      const data = await fs.readFile(this.knowledgePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return {
        commands: {},
        contexts: {},
        alternatives: {},
        fixStrategies: {},
        metadata: {
          version: '1.0',
          created: new Date().toISOString(),
          totalObservations: 0,
          totalSuccesses: 0,
          totalFailures: 0
        }
      };
    }
  }

  /**
   * Export data as CSV
   * @param {string} type - 'commands' or 'learning'
   * @returns {Promise<string>}
   */
  async exportCSV(type = 'commands') {
    if (type === 'commands') {
      const data = await this.queryCommands({ limit: 10000 });
      return this.commandsToCSV(data.commands);
    } else if (type === 'learning') {
      const data = await this.queryLearning({ limit: 10000 });
      return this.learningToCSV(data.commands);
    }
    throw new Error(`Unknown export type: ${type}`);
  }

  commandsToCSV(commands) {
    let csv = 'TestID,Command,TestCount,PassCount,FailCount,PassRate,LastSuccess,LastFailure\n';
    for (const cmd of commands) {
      csv += `"${cmd.testId}","${cmd.command}",${cmd.testCount},${cmd.passCount},${cmd.failCount},${cmd.passRate},"${cmd.lastSuccess || ''}","${cmd.lastFailure || ''}"\n`;
    }
    return csv;
  }

  learningToCSV(commands) {
    let csv = 'CommandKey,Command,QValue,Observations,Successes,Failures,SuccessRate,AvgDuration\n';
    for (const cmd of commands) {
      csv += `"${cmd.commandKey}","${cmd.command}",${cmd.qValue},${cmd.observations},${cmd.successes},${cmd.failures},${cmd.successRate},${cmd.avgDuration}\n`;
    }
    return csv;
  }
}

module.exports = HistoricalQueryEngine;

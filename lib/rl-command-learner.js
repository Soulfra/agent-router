/**
 * RL Command Learner
 *
 * Reinforcement Learning system that learns which commands work best.
 * Uses Q-learning inspired approach to optimize command selection.
 *
 * Learns from:
 * - Command success/failure
 * - Execution time
 * - Context (OS, environment, time of day)
 * - User feedback
 *
 * Optimizes:
 * - Command arguments
 * - Execution order
 * - Alternative selections
 * - Auto-fix strategies
 */

const fs = require('fs').promises;
const path = require('path');

class RLCommandLearner {
  constructor(options = {}) {
    this.learningRate = options.learningRate || 0.1;
    this.discountFactor = options.discountFactor || 0.9;
    this.explorationRate = options.explorationRate || 0.2;

    this.knowledgePath = options.knowledgePath || path.join(process.env.HOME, '.calos/command-knowledge.json');
    this.knowledge = null;
  }

  /**
   * Load learned knowledge from disk
   */
  async loadKnowledge() {
    if (this.knowledge) return this.knowledge;

    try {
      const data = await fs.readFile(this.knowledgePath, 'utf-8');
      this.knowledge = JSON.parse(data);
    } catch (error) {
      // No knowledge file yet - initialize
      this.knowledge = {
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

    return this.knowledge;
  }

  /**
   * Save knowledge to disk
   */
  async saveKnowledge() {
    const dir = path.dirname(this.knowledgePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.knowledgePath, JSON.stringify(this.knowledge, null, 2), 'utf-8');
  }

  /**
   * Observe a command execution
   * @param {object} observation - Execution details
   */
  async observe(observation) {
    await this.loadKnowledge();

    const {
      command,
      args = [],
      context = {},
      success = false,
      duration = 0,
      error = null,
      reward = null
    } = observation;

    const commandKey = `${command} ${args.join(' ')}`.trim();
    const contextKey = this.generateContextKey(context);

    // Initialize command entry
    if (!this.knowledge.commands[commandKey]) {
      this.knowledge.commands[commandKey] = {
        command,
        args,
        qValue: 0,
        observations: 0,
        successes: 0,
        failures: 0,
        avgDuration: 0,
        contextPerformance: {},
        lastObserved: null
      };
    }

    const commandData = this.knowledge.commands[commandKey];

    // Update observations
    commandData.observations++;
    commandData.lastObserved = new Date().toISOString();

    if (success) {
      commandData.successes++;
      this.knowledge.metadata.totalSuccesses++;
    } else {
      commandData.failures++;
      this.knowledge.metadata.totalFailures++;
    }

    this.knowledge.metadata.totalObservations++;

    // Update average duration
    commandData.avgDuration = (
      (commandData.avgDuration * (commandData.observations - 1) + duration) /
      commandData.observations
    );

    // Calculate reward (if not provided)
    let actualReward = reward;
    if (actualReward === null) {
      actualReward = this.calculateReward(success, duration, error);
    }

    // Update Q-value using Q-learning formula
    // Q(s,a) = Q(s,a) + α * (reward + γ * maxQ - Q(s,a))
    const oldQ = commandData.qValue;
    const maxFutureQ = await this.getMaxQ(command, context);

    commandData.qValue = oldQ + this.learningRate * (
      actualReward + this.discountFactor * maxFutureQ - oldQ
    );

    // Track context-specific performance
    if (!commandData.contextPerformance[contextKey]) {
      commandData.contextPerformance[contextKey] = {
        observations: 0,
        successes: 0,
        failures: 0,
        avgReward: 0
      };
    }

    const contextPerf = commandData.contextPerformance[contextKey];
    contextPerf.observations++;

    if (success) {
      contextPerf.successes++;
    } else {
      contextPerf.failures++;
    }

    contextPerf.avgReward = (
      (contextPerf.avgReward * (contextPerf.observations - 1) + actualReward) /
      contextPerf.observations
    );

    // Update global context knowledge
    if (!this.knowledge.contexts[contextKey]) {
      this.knowledge.contexts[contextKey] = {
        context,
        totalObservations: 0,
        successRate: 0
      };
    }

    const contextData = this.knowledge.contexts[contextKey];
    contextData.totalObservations++;
    contextData.successRate = (
      (contextData.successRate * (contextData.totalObservations - 1) + (success ? 1 : 0)) /
      contextData.totalObservations
    );

    await this.saveKnowledge();
  }

  /**
   * Calculate reward for an execution
   */
  calculateReward(success, duration, error) {
    let reward = 0;

    // Base reward/penalty
    if (success) {
      reward += 10;
    } else {
      reward -= 5;
    }

    // Time penalty (faster is better)
    if (duration < 1000) {
      reward += 2; // Very fast
    } else if (duration < 5000) {
      reward += 1; // Fast
    } else if (duration > 10000) {
      reward -= 1; // Slow
    }

    // Error severity penalty
    if (error) {
      if (error.includes('not found') || error.includes('ENOENT')) {
        reward -= 3; // Missing dependency
      } else if (error.includes('timeout')) {
        reward -= 2; // Timeout
      } else if (error.includes('permission')) {
        reward -= 2; // Permission issue
      }
    }

    return reward;
  }

  /**
   * Get maximum Q-value for similar commands in context
   */
  async getMaxQ(command, context) {
    await this.loadKnowledge();

    const baseCommand = command.split(' ')[0];
    const contextKey = this.generateContextKey(context);

    let maxQ = 0;

    for (const [cmdKey, cmdData] of Object.entries(this.knowledge.commands)) {
      if (cmdData.command === baseCommand) {
        // Consider context-specific performance
        const contextPerf = cmdData.contextPerformance[contextKey];
        if (contextPerf && contextPerf.avgReward > maxQ) {
          maxQ = contextPerf.avgReward;
        }

        if (cmdData.qValue > maxQ) {
          maxQ = cmdData.qValue;
        }
      }
    }

    return maxQ;
  }

  /**
   * Recommend best command for given intent and context
   */
  async recommend(intent, context = {}) {
    await this.loadKnowledge();

    const candidates = [];
    const contextKey = this.generateContextKey(context);

    // Find commands matching intent
    for (const [cmdKey, cmdData] of Object.entries(this.knowledge.commands)) {
      if (this.matchesIntent(cmdData, intent)) {
        const contextPerf = cmdData.contextPerformance[contextKey];
        const score = this.calculateScore(cmdData, contextPerf);

        candidates.push({
          command: cmdData.command,
          args: cmdData.args,
          commandKey: cmdKey,
          qValue: cmdData.qValue,
          score,
          successRate: cmdData.observations > 0
            ? cmdData.successes / cmdData.observations
            : 0,
          avgDuration: cmdData.avgDuration
        });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by score (best first)
    candidates.sort((a, b) => b.score - a.score);

    // Exploration vs exploitation
    if (Math.random() < this.explorationRate && candidates.length > 1) {
      // Explore: try a different option
      return candidates[1];
    }

    // Exploit: use best known
    return candidates[0];
  }

  /**
   * Calculate score for command selection
   */
  calculateScore(cmdData, contextPerf) {
    let score = cmdData.qValue * 10;

    // Boost for high success rate
    const successRate = cmdData.observations > 0
      ? cmdData.successes / cmdData.observations
      : 0;
    score += successRate * 5;

    // Penalize for slow execution
    if (cmdData.avgDuration > 5000) {
      score -= 2;
    }

    // Boost for context-specific success
    if (contextPerf && contextPerf.observations > 0) {
      const contextSuccess = contextPerf.successes / contextPerf.observations;
      score += contextSuccess * 3;
    }

    return score;
  }

  /**
   * Check if command matches intent
   */
  matchesIntent(cmdData, intent) {
    const intentLower = intent.toLowerCase();
    const commandLower = `${cmdData.command} ${cmdData.args.join(' ')}`.toLowerCase();

    // Direct match
    if (commandLower.includes(intentLower)) {
      return true;
    }

    // Keyword matching
    const keywords = intentLower.split(/\s+/);
    return keywords.some(keyword => commandLower.includes(keyword));
  }

  /**
   * Find alternative commands
   */
  async findAlternatives(failedCommand, context = {}) {
    await this.loadKnowledge();

    const baseCommand = failedCommand.split(' ')[0];
    const alternatives = [];

    for (const [cmdKey, cmdData] of Object.entries(this.knowledge.commands)) {
      if (cmdData.command === baseCommand && cmdKey !== failedCommand) {
        const successRate = cmdData.observations > 0
          ? cmdData.successes / cmdData.observations
          : 0;

        if (successRate > 0.5) {
          alternatives.push({
            command: cmdData.command,
            args: cmdData.args,
            commandKey: cmdKey,
            successRate,
            qValue: cmdData.qValue
          });
        }
      }
    }

    // Sort by success rate
    alternatives.sort((a, b) => b.successRate - a.successRate);

    return alternatives;
  }

  /**
   * Learn fix strategy from successful recovery
   */
  async learnFixStrategy(originalCommand, fixApplied, success) {
    await this.loadKnowledge();

    if (!this.knowledge.fixStrategies[originalCommand]) {
      this.knowledge.fixStrategies[originalCommand] = {};
    }

    if (!this.knowledge.fixStrategies[originalCommand][fixApplied]) {
      this.knowledge.fixStrategies[originalCommand][fixApplied] = {
        attempts: 0,
        successes: 0,
        successRate: 0
      };
    }

    const strategy = this.knowledge.fixStrategies[originalCommand][fixApplied];
    strategy.attempts++;

    if (success) {
      strategy.successes++;
    }

    strategy.successRate = strategy.successes / strategy.attempts;

    await this.saveKnowledge();
  }

  /**
   * Get recommended fix strategies
   */
  async getFixStrategies(command) {
    await this.loadKnowledge();

    const strategies = this.knowledge.fixStrategies[command];
    if (!strategies) {
      return [];
    }

    // Convert to array and sort by success rate
    return Object.entries(strategies)
      .map(([fix, data]) => ({
        fix,
        ...data
      }))
      .filter(s => s.successRate > 0.3)
      .sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Generate context key from context object
   */
  generateContextKey(context) {
    const parts = [];

    if (context.os) parts.push(`os:${context.os}`);
    if (context.arch) parts.push(`arch:${context.arch}`);
    if (context.node) parts.push(`node:${context.node}`);
    if (context.timeOfDay) parts.push(`time:${context.timeOfDay}`);

    return parts.length > 0 ? parts.join('|') : 'default';
  }

  /**
   * Get current context
   */
  getCurrentContext() {
    const hour = new Date().getHours();
    let timeOfDay = 'night';
    if (hour >= 6 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 18 && hour < 22) timeOfDay = 'evening';

    return {
      os: process.platform,
      arch: process.arch,
      node: process.version,
      timeOfDay
    };
  }

  /**
   * Generate learning report
   */
  async generateReport() {
    await this.loadKnowledge();

    const metadata = this.knowledge.metadata;
    const overallSuccessRate = metadata.totalObservations > 0
      ? (metadata.totalSuccesses / metadata.totalObservations * 100).toFixed(1)
      : 0;

    // Find top performing commands
    const topCommands = Object.entries(this.knowledge.commands)
      .map(([key, data]) => ({
        command: key,
        qValue: data.qValue,
        successRate: data.observations > 0
          ? (data.successes / data.observations * 100).toFixed(1)
          : 0,
        observations: data.observations
      }))
      .filter(c => c.observations > 0)
      .sort((a, b) => b.qValue - a.qValue)
      .slice(0, 5);

    let report = '';
    report += '╔════════════════════════════════════╗\n';
    report += '║   RL Command Learning Report       ║\n';
    report += '╠════════════════════════════════════╣\n';
    report += `║ Total Observations: ${String(metadata.totalObservations).padStart(15)} ║\n`;
    report += `║ Success Rate:       ${String(overallSuccessRate + '%').padStart(15)} ║\n`;
    report += `║ Commands Learned:   ${String(Object.keys(this.knowledge.commands).length).padStart(15)} ║\n`;
    report += `║ Contexts Tracked:   ${String(Object.keys(this.knowledge.contexts).length).padStart(15)} ║\n`;
    report += '╠════════════════════════════════════╣\n';

    if (topCommands.length > 0) {
      report += '║ Top Commands (by Q-value):         ║\n';
      for (const cmd of topCommands) {
        const name = cmd.command.substring(0, 25);
        report += `║   ${name.padEnd(31)} ║\n`;
        report += `║     Q=${cmd.qValue.toFixed(2)} Success=${cmd.successRate}%${' '.repeat(10)} ║\n`;
      }
    }

    report += '╚════════════════════════════════════╝\n';

    return report;
  }

  /**
   * Reset all learned knowledge
   */
  async reset() {
    this.knowledge = {
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

    await this.saveKnowledge();
  }
}

module.exports = RLCommandLearner;

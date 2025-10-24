/**
 * Process Mining Analyzer
 *
 * Analyzes background processes to detect time sinks, bottlenecks, patterns.
 * Like bias detector, but for processes. Like process mining in DevOps.
 *
 * Pattern: Process mining - like Kubernetes metrics, systemd analysis, Docker stats
 *
 * Features:
 * - Detect time sinks (processes taking too long vs expected)
 * - Find bottlenecks (resource-heavy jobs blocking others)
 * - Identify patterns (recurring failures, slow queries, common errors)
 * - Suggest optimizations (kill duplicates, adjust timeouts, increase resources)
 * - Track historical trends (failure rates, average durations, resource usage)
 *
 * Usage:
 *   const analyzer = new ProcessMiningAnalyzer({ manager });
 *
 *   // Analyze all processes
 *   const analysis = await analyzer.analyze();
 *   // {
 *   //   timeSinks: [{ id, elapsed, expected, ratio: 3.5 }],
 *   //   bottlenecks: [{ id, cpu: 95, blocking: [id1, id2] }],
 *   //   patterns: { failureRate: 0.15, avgDuration: 8500 },
 *   //   recommendations: ['Kill job 123 (duplicate)', ...]
 *   // }
 *
 *   // Track trends
 *   const trends = await analyzer.getTrends();
 */

class ProcessMiningAnalyzer {
  constructor(options = {}) {
    this.config = {
      manager: options.manager,              // ShellProcessManager instance

      // Thresholds
      timeSinkRatio: options.timeSinkRatio || 2.0,     // 2x expected duration = time sink
      bottleneckCpuThreshold: options.bottleneckCpuThreshold || 80,  // 80% CPU = bottleneck
      bottleneckMemoryThreshold: options.bottleneckMemoryThreshold || 70, // 70% memory = bottleneck
      failureRateWarning: options.failureRateWarning || 0.2,  // 20% failure rate = warning
      duplicateWindowMs: options.duplicateWindowMs || 60000,  // 60s = consider duplicates

      // Historical tracking
      maxHistorySize: options.maxHistorySize || 1000,
      trackTrends: options.trackTrends !== false
    };

    // Historical data
    this.history = [];

    if (!this.config.manager) {
      throw new Error('[ProcessMiningAnalyzer] ShellProcessManager instance required');
    }

    console.log('[ProcessMiningAnalyzer] Initialized');
  }

  /**
   * Analyze all processes
   */
  async analyze() {
    const processes = await this.config.manager.listAll();

    const analysis = {
      timestamp: new Date().toISOString(),
      totalProcesses: processes.length,

      // Time sinks
      timeSinks: this._findTimeSinks(processes),

      // Bottlenecks
      bottlenecks: this._findBottlenecks(processes),

      // Patterns
      patterns: this._identifyPatterns(processes),

      // Duplicates
      duplicates: this._findDuplicates(processes),

      // Stuck processes
      stuck: this._findStuck(processes),

      // Zombies
      zombies: this._findZombies(processes),

      // Resource usage
      resourceUsage: this._calculateResourceUsage(processes),

      // Recommendations
      recommendations: []
    };

    // Generate recommendations
    analysis.recommendations = this._generateRecommendations(analysis);

    // Track history
    if (this.config.trackTrends) {
      this._addToHistory(analysis);
    }

    return analysis;
  }

  /**
   * Find time sinks (processes taking too long)
   */
  _findTimeSinks(processes) {
    const timeSinks = [];

    for (const process of processes) {
      // Skip if no expected duration
      if (!process.expectedDuration) continue;

      const elapsed = process.elapsed;
      const expected = process.expectedDuration;
      const ratio = elapsed / expected;

      // Time sink if taking significantly longer than expected
      if (ratio >= this.config.timeSinkRatio) {
        timeSinks.push({
          id: process.id,
          command: process.command,
          description: process.description,
          elapsed: elapsed,
          expected: expected,
          ratio: ratio,
          overrun: elapsed - expected,
          state: process.state,
          severity: this._calculateSeverity(ratio)
        });
      }
    }

    // Sort by ratio (worst first)
    timeSinks.sort((a, b) => b.ratio - a.ratio);

    return timeSinks;
  }

  /**
   * Find bottlenecks (resource-heavy processes)
   */
  _findBottlenecks(processes) {
    const bottlenecks = [];

    for (const process of processes) {
      if (process.state !== 'running') continue;

      const isBottleneck =
        process.cpu >= this.config.bottleneckCpuThreshold ||
        process.memory >= this.config.bottleneckMemoryThreshold;

      if (isBottleneck) {
        // Find processes that might be blocked by this one
        const blocking = processes.filter(p =>
          p.state === 'running' &&
          p.id !== process.id &&
          p.startTime > process.startTime
        ).map(p => p.id);

        bottlenecks.push({
          id: process.id,
          command: process.command,
          description: process.description,
          cpu: process.cpu,
          memory: process.memory,
          elapsed: process.elapsed,
          blocking: blocking,
          severity: this._calculateBottleneckSeverity(process.cpu, process.memory)
        });
      }
    }

    // Sort by severity (worst first)
    bottlenecks.sort((a, b) => b.severity - a.severity);

    return bottlenecks;
  }

  /**
   * Identify patterns (failure rates, common errors, trends)
   */
  _identifyPatterns(processes) {
    const patterns = {
      totalProcesses: processes.length,
      runningCount: processes.filter(p => p.state === 'running').length,
      completedCount: processes.filter(p => p.state === 'completed').length,
      failedCount: processes.filter(p => p.state === 'failed').length,
      killedCount: processes.filter(p => p.state === 'killed').length,

      // Failure rate
      failureRate: processes.length > 0 ?
        processes.filter(p => p.state === 'failed').length / processes.length : 0,

      // Average duration (completed/failed only)
      avgDuration: this._calculateAvgDuration(processes),

      // Average resource usage (running only)
      avgCpu: this._calculateAvg(processes.filter(p => p.state === 'running'), 'cpu'),
      avgMemory: this._calculateAvg(processes.filter(p => p.state === 'running'), 'memory'),

      // Common commands
      commonCommands: this._findCommonCommands(processes),

      // Common errors
      commonErrors: this._findCommonErrors(processes),

      // Time distribution
      timeDistribution: this._calculateTimeDistribution(processes)
    };

    return patterns;
  }

  /**
   * Find duplicate processes (same command running multiple times)
   */
  _findDuplicates(processes) {
    const duplicates = [];
    const commandMap = new Map();

    // Group by command
    for (const process of processes) {
      if (process.state !== 'running') continue;

      if (!commandMap.has(process.command)) {
        commandMap.set(process.command, []);
      }
      commandMap.get(process.command).push(process);
    }

    // Find duplicates (command running 2+ times within window)
    for (const [command, instances] of commandMap.entries()) {
      if (instances.length < 2) continue;

      // Check if within duplicate window
      const now = Date.now();
      const recentInstances = instances.filter(p =>
        (now - p.startTime) <= this.config.duplicateWindowMs
      );

      if (recentInstances.length >= 2) {
        duplicates.push({
          command,
          count: recentInstances.length,
          instances: recentInstances.map(p => ({
            id: p.id,
            pid: p.pid,
            elapsed: p.elapsed,
            startTime: p.startTime
          }))
        });
      }
    }

    return duplicates;
  }

  /**
   * Find stuck processes
   */
  _findStuck(processes) {
    return processes.filter(p => p.isStuck).map(p => ({
      id: p.id,
      command: p.command,
      description: p.description,
      elapsed: p.elapsed,
      timeSinceLastOutput: Date.now() - p.lastOutput
    }));
  }

  /**
   * Find zombie processes
   */
  _findZombies(processes) {
    return processes.filter(p => p.isZombie).map(p => ({
      id: p.id,
      command: p.command,
      state: p.state,
      timeSinceEnd: Date.now() - p.endTime
    }));
  }

  /**
   * Calculate total resource usage
   */
  _calculateResourceUsage(processes) {
    const running = processes.filter(p => p.state === 'running');

    return {
      totalCpu: running.reduce((sum, p) => sum + p.cpu, 0),
      totalMemory: running.reduce((sum, p) => sum + p.memory, 0),
      avgCpu: this._calculateAvg(running, 'cpu'),
      avgMemory: this._calculateAvg(running, 'memory'),
      maxCpu: running.length > 0 ? Math.max(...running.map(p => p.cpu)) : 0,
      maxMemory: running.length > 0 ? Math.max(...running.map(p => p.memory)) : 0
    };
  }

  /**
   * Generate recommendations
   */
  _generateRecommendations(analysis) {
    const recommendations = [];

    // Time sinks
    if (analysis.timeSinks.length > 0) {
      for (const sink of analysis.timeSinks) {
        if (sink.severity === 'critical') {
          recommendations.push({
            type: 'time_sink',
            priority: 'high',
            message: `Job ${sink.id} is taking ${sink.ratio.toFixed(1)}x longer than expected. Consider killing or investigating.`,
            action: 'kill_or_investigate',
            target: sink.id
          });
        }
      }
    }

    // Bottlenecks
    if (analysis.bottlenecks.length > 0) {
      for (const bottleneck of analysis.bottlenecks) {
        if (bottleneck.severity === 'high') {
          recommendations.push({
            type: 'bottleneck',
            priority: 'high',
            message: `Job ${bottleneck.id} is using ${bottleneck.cpu.toFixed(1)}% CPU and may be blocking ${bottleneck.blocking.length} other jobs.`,
            action: 'investigate_or_limit_resources',
            target: bottleneck.id
          });
        }
      }
    }

    // Duplicates
    if (analysis.duplicates.length > 0) {
      for (const dup of analysis.duplicates) {
        recommendations.push({
          type: 'duplicate',
          priority: 'medium',
          message: `Command "${dup.command}" is running ${dup.count} times. Consider killing duplicates.`,
          action: 'kill_duplicates',
          target: dup.instances.map(i => i.id)
        });
      }
    }

    // High failure rate
    if (analysis.patterns.failureRate >= this.config.failureRateWarning) {
      recommendations.push({
        type: 'high_failure_rate',
        priority: 'high',
        message: `Failure rate is ${(analysis.patterns.failureRate * 100).toFixed(1)}%. Investigate common errors.`,
        action: 'investigate_errors',
        target: null
      });
    }

    // Stuck processes
    if (analysis.stuck.length > 0) {
      for (const stuck of analysis.stuck) {
        recommendations.push({
          type: 'stuck',
          priority: 'medium',
          message: `Job ${stuck.id} appears stuck (no output for ${(stuck.timeSinceLastOutput / 1000).toFixed(0)}s).`,
          action: 'kill_or_restart',
          target: stuck.id
        });
      }
    }

    // Zombies
    if (analysis.zombies.length > 0) {
      recommendations.push({
        type: 'zombies',
        priority: 'low',
        message: `${analysis.zombies.length} zombie processes should be cleaned up.`,
        action: 'cleanup',
        target: analysis.zombies.map(z => z.id)
      });
    }

    return recommendations;
  }

  /**
   * Get trends (historical analysis)
   */
  async getTrends(options = {}) {
    const timeframe = options.timeframe || 3600000; // 1 hour
    const now = Date.now();

    const recentHistory = this.history.filter(h =>
      (now - new Date(h.timestamp).getTime()) <= timeframe
    );

    if (recentHistory.length === 0) {
      return {
        message: 'No historical data available'
      };
    }

    return {
      timeframe,
      dataPoints: recentHistory.length,

      // Failure rate trend
      failureRateTrend: recentHistory.map(h => ({
        timestamp: h.timestamp,
        rate: h.patterns.failureRate
      })),

      // Average duration trend
      durationTrend: recentHistory.map(h => ({
        timestamp: h.timestamp,
        avgDuration: h.patterns.avgDuration
      })),

      // Resource usage trend
      resourceTrend: recentHistory.map(h => ({
        timestamp: h.timestamp,
        cpu: h.resourceUsage.avgCpu,
        memory: h.resourceUsage.avgMemory
      })),

      // Time sinks trend
      timeSinksTrend: recentHistory.map(h => ({
        timestamp: h.timestamp,
        count: h.timeSinks.length
      })),

      // Recommendations trend
      recommendationsTrend: recentHistory.map(h => ({
        timestamp: h.timestamp,
        count: h.recommendations.length
      }))
    };
  }

  /**
   * Helper: Calculate severity for time sinks
   */
  _calculateSeverity(ratio) {
    if (ratio >= 5.0) return 'critical';
    if (ratio >= 3.0) return 'high';
    if (ratio >= 2.0) return 'medium';
    return 'low';
  }

  /**
   * Helper: Calculate severity for bottlenecks
   */
  _calculateBottleneckSeverity(cpu, memory) {
    const cpuScore = cpu / 100;
    const memScore = memory / 100;
    const score = (cpuScore + memScore) / 2;

    if (score >= 0.9) return 'high';
    if (score >= 0.7) return 'medium';
    return 'low';
  }

  /**
   * Helper: Calculate average duration
   */
  _calculateAvgDuration(processes) {
    const completed = processes.filter(p =>
      ['completed', 'failed', 'killed'].includes(p.state) && p.elapsed
    );

    if (completed.length === 0) return null;

    return completed.reduce((sum, p) => sum + p.elapsed, 0) / completed.length;
  }

  /**
   * Helper: Calculate average of a field
   */
  _calculateAvg(processes, field) {
    if (processes.length === 0) return 0;
    return processes.reduce((sum, p) => sum + (p[field] || 0), 0) / processes.length;
  }

  /**
   * Helper: Find common commands
   */
  _findCommonCommands(processes) {
    const commandCounts = new Map();

    for (const process of processes) {
      const count = commandCounts.get(process.command) || 0;
      commandCounts.set(process.command, count + 1);
    }

    return Array.from(commandCounts.entries())
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5
  }

  /**
   * Helper: Find common errors
   */
  _findCommonErrors(processes) {
    const errorCounts = new Map();

    for (const process of processes) {
      if (process.state !== 'failed' || !process.error) continue;

      const count = errorCounts.get(process.error) || 0;
      errorCounts.set(process.error, count + 1);
    }

    return Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5
  }

  /**
   * Helper: Calculate time distribution
   */
  _calculateTimeDistribution(processes) {
    const buckets = {
      '0-10s': 0,
      '10-60s': 0,
      '1-5m': 0,
      '5-30m': 0,
      '30m+': 0
    };

    for (const process of processes) {
      const seconds = process.elapsed / 1000;

      if (seconds < 10) buckets['0-10s']++;
      else if (seconds < 60) buckets['10-60s']++;
      else if (seconds < 300) buckets['1-5m']++;
      else if (seconds < 1800) buckets['5-30m']++;
      else buckets['30m+']++;
    }

    return buckets;
  }

  /**
   * Helper: Add analysis to history
   */
  _addToHistory(analysis) {
    this.history.push(analysis);

    // Limit history size
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }
  }
}

module.exports = ProcessMiningAnalyzer;

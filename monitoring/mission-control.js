#!/usr/bin/env node

/**
 * Mission Control
 * Integrated monitoring system for CalOS
 *
 * Combines:
 * - Health monitoring
 * - Process management
 * - Log aggregation
 * - WebSocket feed server
 * - Pattern learning
 *
 * Usage:
 *   node mission-control.js
 *   or
 *   npm run mission-control
 */

const path = require('path');

// Import components
const HealthMonitor = require('./health-monitor');
const ProcessManager = require('./process-manager');
const LogAggregator = require('../lib/log-aggregator');
const LogFeedServer = require('./log-feed-server');
const PatternLearner = require('../lib/pattern-learner');

class MissionControl {
  constructor(options = {}) {
    this.options = options;

    // Initialize components
    this.patternLearner = new PatternLearner();
    this.healthMonitor = new HealthMonitor({
      checkInterval: options.healthCheckInterval || 5000
    });
    this.processManager = new ProcessManager(this.healthMonitor, {
      autoRestart: options.autoRestart !== false,
      maxRestarts: options.maxRestarts || 5
    });
    this.logAggregator = new LogAggregator({
      maxBufferSize: options.logBufferSize || 1000
    });
    this.logFeedServer = new LogFeedServer(
      this.logAggregator,
      this.healthMonitor,
      this.processManager,
      {
        port: options.feedPort || 3003
      }
    );

    this.running = false;
  }

  /**
   * Start Mission Control
   */
  async start() {
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║  🎮 CalOS Mission Control                         ║');
    console.log('╚═══════════════════════════════════════════════════╝');
    console.log('');

    // Register processes
    this._registerProcesses();

    // Setup event listeners
    this._setupEventListeners();

    // Start health monitoring
    this.healthMonitor.start();

    // Start log aggregation auto-flush
    this.logAggregator.startAutoFlush(5000);

    // Start log feed server
    this.logFeedServer.start();

    this.running = true;

    console.log('');
    console.log('✓ Mission Control started');
    console.log('');
    console.log('Dashboard: http://localhost:3003/dashboard.html');
    console.log('WebSocket: ws://localhost:3003');
    console.log('RSS Feed: http://localhost:3003/feed/rss');
    console.log('JSON Feed: http://localhost:3003/feed/json');
    console.log('');
    console.log('Press Ctrl+C to stop');

    // Setup graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  /**
   * Stop Mission Control
   */
  async stop() {
    if (!this.running) return;

    console.log('');
    console.log('🛑 Stopping Mission Control...');

    // Stop health monitoring
    this.healthMonitor.stop();

    // Stop log aggregation
    this.logAggregator.stopAutoFlush();
    await this.logAggregator.flush();

    // Stop log feed server
    this.logFeedServer.stop();

    // Stop all managed processes
    await this.processManager.stopAll();

    this.running = false;

    console.log('✓ Mission Control stopped');
    process.exit(0);
  }

  /**
   * Register processes for monitoring and management
   */
  _registerProcesses() {
    console.log('📋 Registering processes...');

    // Ollama
    this.healthMonitor.register('ollama', {
      type: 'http',
      port: 11434,
      healthPath: '/api/tags',
      thresholds: {
        responseTime: 3000,
        errorRate: 0.2
      }
    });

    this.processManager.register('ollama', {
      command: 'ollama',
      args: ['serve'],
      autoRestart: true,
      critical: true
    });

    // CalOS Router
    this.healthMonitor.register('calos-router', {
      type: 'http',
      port: 5001,
      healthPath: '/health',
      thresholds: {
        responseTime: 1000,
        errorRate: 0.1
      }
    });

    this.processManager.register('calos-router', {
      command: 'node',
      args: [path.join(__dirname, '../router.js')],
      cwd: path.join(__dirname, '..'),
      autoRestart: true,
      critical: true
    });

    // Script Toolkit Bridge (if enabled)
    if (this.options.enableScriptToolkit) {
      this.healthMonitor.register('script-toolkit', {
        type: 'http',
        port: 3002,
        healthPath: '/health',
        thresholds: {
          responseTime: 1000,
          errorRate: 0.1
        }
      });

      this.processManager.register('script-toolkit', {
        command: 'node',
        args: [path.join(__dirname, '../../script-toolkit/lib/dashboard-bridge.js')],
        cwd: path.join(__dirname, '../../script-toolkit'),
        autoRestart: true,
        critical: false
      });
    }

    console.log('✓ Processes registered');
  }

  /**
   * Setup event listeners for integration
   */
  _setupEventListeners() {
    // Log aggregator -> pattern learner
    this.logAggregator.on('error_detected', async (error) => {
      try {
        // Log error to pattern learner
        await this.patternLearner.logError(error.type, error.autoFix || 'unknown', {
          source: error.source,
          rawLine: error.rawLine
        });

        // Get suggestion for this error
        const suggestion = await this.patternLearner.suggestFix(error.type);

        if (suggestion.confidence > 0.7) {
          console.log(`💡 High-confidence fix for ${error.type}: ${suggestion.suggestion} (${(suggestion.confidence * 100).toFixed(0)}% success rate)`);
        }
      } catch (err) {
        console.error('Failed to log error pattern:', err.message);
      }
    });

    // Health monitor -> pattern learner
    this.healthMonitor.on('status_change', async (event) => {
      try {
        await this.patternLearner.logCommand(
          `health_change: ${event.name}`,
          'health_status',
          { from: event.from, to: event.to },
          { details: event.details },
          0,
          event.to !== '🔴'
        );
      } catch (err) {
        console.error('Failed to log health change:', err.message);
      }
    });

    // Process manager -> pattern learner
    this.processManager.on('process_restarted', async (event) => {
      try {
        await this.patternLearner.logCommand(
          `restart: ${event.name}`,
          'process_restart',
          { reason: event.reason },
          { pid: event.pid },
          0,
          true
        );

        // If restart was due to error, learn from it
        if (event.reason === 'health_check_failed' || event.reason === 'auto_restart') {
          await this.patternLearner.learnFromResolution(
            'process_crash',
            'restart',
            true // Assume restart worked if no immediate error
          );
        }
      } catch (err) {
        console.error('Failed to log restart:', err.message);
      }
    });

    // Print stats periodically
    setInterval(async () => {
      try {
        const errorStats = await this.patternLearner.getErrorStats();
        const workflowStats = await this.patternLearner.getStats();

        console.log('');
        console.log('📊 Mission Control Stats');
        console.log('─────────────────────────────────────────────────');
        console.log(`  System Health: ${this.healthMonitor.getSystemHealth().overall}`);
        console.log(`  Total Workflows: ${workflowStats.total_sequences || 0}`);
        console.log(`  Total Commands: ${workflowStats.total_commands || 0}`);
        console.log(`  Error Types Learned: ${errorStats.total_error_types || 0}`);
        console.log(`  Reliable Fixes: ${errorStats.reliable_fixes || 0}`);
        console.log(`  Avg Fix Success: ${((errorStats.avg_success_rate || 0) * 100).toFixed(1)}%`);
        console.log('');
      } catch (err) {
        console.error('Failed to get stats:', err.message);
      }
    }, 60000); // Every minute
  }

  /**
   * Get full system status
   * @returns {object} - System status
   */
  getStatus() {
    return {
      systemHealth: this.healthMonitor.getSystemHealth(),
      processes: this.processManager.getAllStatus(),
      logBuffer: this.logAggregator.buffer.length
    };
  }
}

// Main execution
if (require.main === module) {
  const missionControl = new MissionControl({
    healthCheckInterval: 5000,
    autoRestart: true,
    maxRestarts: 5,
    logBufferSize: 1000,
    feedPort: 3003,
    enableScriptToolkit: true
  });

  missionControl.start().catch(err => {
    console.error('Failed to start Mission Control:', err);
    process.exit(1);
  });
}

module.exports = MissionControl;

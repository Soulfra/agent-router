/**
 * Environment Manager
 *
 * Manages parallel "simulations" of the system - like macOS window buttons:
 * - 🟢 Green: Active/focused (production)
 * - 🟡 Yellow: Warning/staged (staging)
 * - ⚪️ Grey: Inactive/unfocused (dev/stopped)
 *
 * "It's all simulations" - run multiple environments in parallel:
 * - Production on port 5001 (green)
 * - Staging on port 5002 (yellow)
 * - Dev on port 5003 (grey)
 * - Test on port 5004 (grey)
 *
 * Like:
 * - Docker Compose (multiple services)
 * - Railway environments (prod/staging/preview)
 * - Heroku pipelines (production/staging/review)
 * - Game lobbies (different servers/instances)
 */

const { spawn } = require('child_process');
const path = require('path');

class EnvironmentManager {
  constructor(options = {}) {
    this.environments = new Map();
    this.verbose = options.verbose !== false;
    this.colorEnabled = options.colorEnabled !== false;

    // Colors for terminal output (like macOS buttons)
    this.colors = {
      reset: '\x1b[0m',
      green: '\x1b[32m',   // Active/focused
      yellow: '\x1b[33m',  // Warning/staged
      grey: '\x1b[90m',    // Inactive/unfocused
      red: '\x1b[31m',     // Error/failed
      cyan: '\x1b[36m',    // Info
      bold: '\x1b[1m'
    };

    // State emojis (like macOS window buttons)
    this.stateEmojis = {
      active: '🟢',    // Green - running and healthy
      staged: '🟡',    // Yellow - running but warning state
      inactive: '⚪️', // Grey - stopped or disabled
      error: '🔴',     // Red - failed or crashed
      starting: '🔵'   // Blue - starting up
    };
  }

  /**
   * Register an environment (simulation)
   * @param {string} name - Environment name (production, staging, dev, test)
   * @param {object} config - Environment configuration
   */
  registerEnvironment(name, config = {}) {
    const env = {
      name,
      displayName: config.displayName || name,
      state: 'inactive', // inactive, starting, active, staged, error
      port: config.port || 5001,
      databaseUrl: config.databaseUrl || process.env.DATABASE_URL,
      ollamaUrl: config.ollamaUrl || 'http://localhost:11434',
      ollamaInstance: config.ollamaInstance || 'shared', // 'shared' or 'dedicated'
      logLevel: config.logLevel || 'error',
      process: null,
      pid: null,
      startTime: null,
      lastHealthCheck: null,
      healthStatus: null,
      autoRestart: config.autoRestart !== false,
      color: this._getStateColor('inactive'),
      emoji: this.stateEmojis.inactive
    };

    this.environments.set(name, env);
    return this;
  }

  /**
   * Start an environment
   * @param {string} name - Environment name
   */
  async startEnvironment(name) {
    const env = this.environments.get(name);
    if (!env) {
      throw new Error(`Environment "${name}" not registered`);
    }

    if (env.state === 'active' || env.state === 'starting') {
      this._print(`${env.emoji}  ${env.displayName} already ${env.state}`, 'yellow');
      return;
    }

    // Update state
    env.state = 'starting';
    env.color = this._getStateColor('starting');
    env.emoji = this.stateEmojis.starting;

    this._print(`${env.emoji}  Starting ${env.displayName} on port ${env.port}...`, 'cyan');

    try {
      // Spawn router process with environment variables
      const nodeArgs = [
        path.join(__dirname, '..', 'router.js'),
        '--local'
      ];

      const spawnOptions = {
        env: {
          ...process.env,
          PORT: env.port,
          DATABASE_URL: env.databaseUrl,
          OLLAMA_URL: env.ollamaUrl,
          LOG_LEVEL: env.logLevel,
          NODE_ENV: name
        },
        stdio: env.logLevel === 'debug' ? 'inherit' : 'ignore',
        detached: false
      };

      env.process = spawn('node', nodeArgs, spawnOptions);
      env.pid = env.process.pid;
      env.startTime = Date.now();

      // Handle process events
      env.process.on('error', (error) => {
        this._handleEnvironmentError(name, error);
      });

      env.process.on('exit', (code, signal) => {
        this._handleEnvironmentExit(name, code, signal);
      });

      // Wait for startup
      await this._waitForHealthy(name);

      // Success
      env.state = 'active';
      env.color = this._getStateColor('active');
      env.emoji = this.stateEmojis.active;

      this._print(`${env.emoji}  ${env.displayName} is now ACTIVE on port ${env.port}`, 'green');

    } catch (error) {
      env.state = 'error';
      env.color = this._getStateColor('error');
      env.emoji = this.stateEmojis.error;
      throw error;
    }
  }

  /**
   * Stop an environment
   * @param {string} name - Environment name
   */
  async stopEnvironment(name) {
    const env = this.environments.get(name);
    if (!env) {
      throw new Error(`Environment "${name}" not registered`);
    }

    if (env.state === 'inactive') {
      this._print(`${env.emoji}  ${env.displayName} already inactive`, 'grey');
      return;
    }

    this._print(`⏹️  Stopping ${env.displayName}...`, 'cyan');

    if (env.process && !env.process.killed) {
      env.process.kill('SIGTERM');

      // Wait for graceful shutdown
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (env.process && !env.process.killed) {
            env.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        if (env.process) {
          env.process.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });
    }

    env.state = 'inactive';
    env.color = this._getStateColor('inactive');
    env.emoji = this.stateEmojis.inactive;
    env.process = null;
    env.pid = null;

    this._print(`${env.emoji}  ${env.displayName} stopped`, 'grey');
  }

  /**
   * Restart an environment
   * @param {string} name - Environment name
   */
  async restartEnvironment(name) {
    this._print(`🔄  Restarting ${name}...`, 'cyan');
    await this.stopEnvironment(name);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.startEnvironment(name);
  }

  /**
   * Get status of all environments
   */
  getStatus() {
    const status = [];

    for (const [name, env] of this.environments) {
      status.push({
        name: env.name,
        displayName: env.displayName,
        state: env.state,
        emoji: env.emoji,
        port: env.port,
        pid: env.pid,
        uptime: env.startTime ? Date.now() - env.startTime : null,
        healthStatus: env.healthStatus
      });
    }

    return status;
  }

  /**
   * Print status table
   */
  printStatus() {
    process.stdout.write('\n');
    this._print('═'.repeat(80), 'cyan');
    this._print('  🌍  ENVIRONMENT STATUS', 'bold');
    this._print('═'.repeat(80), 'cyan');
    process.stdout.write('\n');

    for (const [name, env] of this.environments) {
      const uptime = env.startTime ?
        this._formatUptime(Date.now() - env.startTime) :
        'stopped';

      const pidStr = env.pid ? `PID ${env.pid}` : 'no process';

      this._print(
        `${env.emoji}  ${env.displayName.padEnd(15)} | Port ${env.port} | ${pidStr.padEnd(12)} | ${uptime}`,
        env.color
      );
    }

    process.stdout.write('\n');
    this._print('  Legend: 🟢 Active  🟡 Staged  ⚪️ Inactive  🔴 Error  🔵 Starting', 'grey');
    process.stdout.write('\n');
  }

  /**
   * Wait for environment to become healthy
   * @private
   */
  async _waitForHealthy(name, timeout = 10000) {
    const env = this.environments.get(name);
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const axios = require('axios');
        const response = await axios.get(`http://localhost:${env.port}/api/health`, {
          timeout: 1000
        });

        if (response.data && response.data.status === 'ok') {
          env.healthStatus = 'healthy';
          env.lastHealthCheck = Date.now();
          return true;
        }
      } catch (error) {
        // Not ready yet, keep waiting
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Environment "${name}" failed to become healthy within ${timeout}ms`);
  }

  /**
   * Handle environment error
   * @private
   */
  _handleEnvironmentError(name, error) {
    const env = this.environments.get(name);
    if (!env) return;

    env.state = 'error';
    env.color = this._getStateColor('error');
    env.emoji = this.stateEmojis.error;

    this._print(`${env.emoji}  ${env.displayName} error: ${error.message}`, 'red');

    if (env.autoRestart && env.state !== 'inactive') {
      this._print(`🔄  Auto-restarting ${env.displayName} in 5s...`, 'yellow');
      setTimeout(() => {
        this.restartEnvironment(name).catch(err => {
          this._print(`Failed to restart: ${err.message}`, 'red');
        });
      }, 5000);
    }
  }

  /**
   * Handle environment exit
   * @private
   */
  _handleEnvironmentExit(name, code, signal) {
    const env = this.environments.get(name);
    if (!env) return;

    if (code !== 0 && env.state !== 'inactive') {
      env.state = 'error';
      env.color = this._getStateColor('error');
      env.emoji = this.stateEmojis.error;
      this._print(`${env.emoji}  ${env.displayName} exited with code ${code}`, 'red');

      if (env.autoRestart) {
        this._print(`🔄  Auto-restarting ${env.displayName} in 5s...`, 'yellow');
        setTimeout(() => {
          this.restartEnvironment(name).catch(err => {
            this._print(`Failed to restart: ${err.message}`, 'red');
          });
        }, 5000);
      }
    } else {
      env.state = 'inactive';
      env.color = this._getStateColor('inactive');
      env.emoji = this.stateEmojis.inactive;
      env.process = null;
      env.pid = null;
    }
  }

  /**
   * Get color for state
   * @private
   */
  _getStateColor(state) {
    const colorMap = {
      active: 'green',
      staged: 'yellow',
      inactive: 'grey',
      error: 'red',
      starting: 'cyan'
    };
    return colorMap[state] || 'grey';
  }

  /**
   * Format uptime
   * @private
   */
  _formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Print colored text
   * @private
   */
  _print(text, color = null) {
    if (!this.verbose) return;

    const output = color && this.colorEnabled ?
      this.colors[color] + text + this.colors.reset :
      text;

    process.stdout.write(output + '\n');
  }

  /**
   * Start all registered environments
   */
  async startAll() {
    this._print('\n🚀  Starting all environments...', 'bold');

    for (const name of this.environments.keys()) {
      try {
        await this.startEnvironment(name);
      } catch (error) {
        this._print(`Failed to start ${name}: ${error.message}`, 'red');
      }
    }

    this.printStatus();
  }

  /**
   * Stop all environments
   */
  async stopAll() {
    this._print('\n⏹️  Stopping all environments...', 'bold');

    const stopPromises = [];
    for (const name of this.environments.keys()) {
      stopPromises.push(this.stopEnvironment(name));
    }

    await Promise.all(stopPromises);
    this.printStatus();
  }
}

module.exports = EnvironmentManager;

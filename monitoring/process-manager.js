/**
 * Process Manager
 * Manages starting, stopping, and restarting CalOS processes
 *
 * Features:
 * - Manual restart controls for dashboard
 * - Auto-restart on critical failures
 * - Graceful shutdown with cleanup
 * - Restart throttling to prevent loops
 * - Integration with health monitor
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');

const DB_PATH = path.join(process.env.HOME, '.deathtodata/local.db');

class ProcessManager extends EventEmitter {
  constructor(healthMonitor, options = {}) {
    super();

    this.healthMonitor = healthMonitor;
    this.processes = new Map(); // Process name -> process info
    this.autoRestart = options.autoRestart !== false; // Default: true
    this.maxRestarts = options.maxRestarts || 5; // Max restarts in window
    this.restartWindow = options.restartWindow || 60000; // 1 minute
    this.restartDelay = options.restartDelay || 2000; // 2 seconds
    this.restartHistory = new Map(); // Process name -> restart timestamps

    // Listen to health monitor events
    if (this.healthMonitor) {
      this.healthMonitor.on('status_change', this._handleStatusChange.bind(this));
    }
  }

  /**
   * Register a process for management
   * @param {string} name - Process name
   * @param {object} config - Process configuration
   */
  register(name, config) {
    this.processes.set(name, {
      name,
      command: config.command,
      args: config.args || [],
      cwd: config.cwd || process.cwd(),
      env: config.env || process.env,
      autoRestart: config.autoRestart !== false,
      critical: config.critical || false, // Critical = restart immediately
      proc: null,
      pid: null,
      status: 'stopped',
      startedAt: null,
      stoppedAt: null
    });

    console.log(`📋 Process manager registered: ${name}`);
  }

  /**
   * Start a process
   * @param {string} name - Process name
   * @returns {Promise<object>} - Process info
   */
  async start(name) {
    const config = this.processes.get(name);
    if (!config) {
      throw new Error(`Process not registered: ${name}`);
    }

    if (config.proc && config.status === 'running') {
      throw new Error(`Process already running: ${name}`);
    }

    console.log(`🚀 Starting ${name}...`);

    // Mark as starting in health monitor
    if (this.healthMonitor) {
      this.healthMonitor.markStarting(name);
    }

    // Spawn process
    const proc = spawn(config.command, config.args, {
      cwd: config.cwd,
      env: config.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    config.proc = proc;
    config.pid = proc.pid;
    config.status = 'running';
    config.startedAt = new Date().toISOString();

    // Capture stdout/stderr
    proc.stdout.on('data', (data) => {
      this.emit('process_output', {
        name,
        stream: 'stdout',
        data: data.toString()
      });
    });

    proc.stderr.on('data', (data) => {
      this.emit('process_output', {
        name,
        stream: 'stderr',
        data: data.toString()
      });
    });

    // Handle process exit
    proc.on('exit', (code, signal) => {
      this._handleExit(name, code, signal);
    });

    proc.on('error', (error) => {
      console.error(`❌ ${name} error:`, error.message);
      this.emit('process_error', { name, error: error.message });
    });

    // Emit started event
    this.emit('process_started', {
      name,
      pid: proc.pid,
      command: config.command,
      args: config.args
    });

    // Log to database
    await this._logEvent(name, 'started', { pid: proc.pid });

    console.log(`✓ ${name} started (PID: ${proc.pid})`);

    return {
      name,
      pid: proc.pid,
      status: 'running',
      startedAt: config.startedAt
    };
  }

  /**
   * Stop a process
   * @param {string} name - Process name
   * @param {object} options - Stop options
   * @returns {Promise<void>}
   */
  async stop(name, options = {}) {
    const config = this.processes.get(name);
    if (!config) {
      throw new Error(`Process not registered: ${name}`);
    }

    if (!config.proc || config.status !== 'running') {
      throw new Error(`Process not running: ${name}`);
    }

    console.log(`🛑 Stopping ${name}...`);

    const signal = options.signal || 'SIGTERM';
    const timeout = options.timeout || 10000; // 10s

    // Send signal
    config.proc.kill(signal);
    config.status = 'stopping';

    // Wait for graceful shutdown
    const stopped = await this._waitForExit(config.proc, timeout);

    if (!stopped) {
      console.warn(`⚠️  ${name} did not stop gracefully, forcing...`);
      config.proc.kill('SIGKILL');
      await this._waitForExit(config.proc, 5000);
    }

    config.proc = null;
    config.pid = null;
    config.status = 'stopped';
    config.stoppedAt = new Date().toISOString();

    // Emit stopped event
    this.emit('process_stopped', {
      name,
      graceful: stopped
    });

    // Log to database
    await this._logEvent(name, 'stopped', { graceful: stopped });

    console.log(`✓ ${name} stopped`);
  }

  /**
   * Restart a process
   * @param {string} name - Process name
   * @param {object} options - Restart options
   * @returns {Promise<object>} - Process info
   */
  async restart(name, options = {}) {
    const config = this.processes.get(name);
    if (!config) {
      throw new Error(`Process not registered: ${name}`);
    }

    // Check restart throttling
    if (!options.force && !this._canRestart(name)) {
      const msg = `${name} has exceeded restart limit (${this.maxRestarts} in ${this.restartWindow}ms)`;
      console.error(`❌ ${msg}`);
      throw new Error(msg);
    }

    console.log(`🔄 Restarting ${name}...`);

    // Track restart
    this._trackRestart(name);

    // Stop if running
    if (config.proc && config.status === 'running') {
      await this.stop(name, { timeout: 5000 });
    }

    // Wait before restarting
    if (options.delay !== 0) {
      const delay = options.delay || this.restartDelay;
      console.log(`⏳ Waiting ${delay}ms before restart...`);
      await this._sleep(delay);
    }

    // Start
    const result = await this.start(name);

    // Emit restarted event
    this.emit('process_restarted', {
      name,
      pid: result.pid,
      reason: options.reason || 'manual'
    });

    // Log to database
    await this._logEvent(name, 'restarted', {
      pid: result.pid,
      reason: options.reason || 'manual'
    });

    console.log(`✓ ${name} restarted`);

    return result;
  }

  /**
   * Get status of a process
   * @param {string} name - Process name
   * @returns {object} - Process status
   */
  getStatus(name) {
    const config = this.processes.get(name);
    if (!config) {
      throw new Error(`Process not registered: ${name}`);
    }

    return {
      name: config.name,
      status: config.status,
      pid: config.pid,
      command: config.command,
      args: config.args,
      startedAt: config.startedAt,
      stoppedAt: config.stoppedAt,
      autoRestart: config.autoRestart,
      critical: config.critical,
      restartCount: this._getRestartCount(name)
    };
  }

  /**
   * Get status of all processes
   * @returns {object} - All process statuses
   */
  getAllStatus() {
    const status = {};
    for (const [name] of this.processes) {
      status[name] = this.getStatus(name);
    }
    return status;
  }

  /**
   * Handle process exit
   * @param {string} name - Process name
   * @param {number} code - Exit code
   * @param {string} signal - Signal
   */
  async _handleExit(name, code, signal) {
    const config = this.processes.get(name);
    if (!config) return;

    console.log(`💀 ${name} exited (code: ${code}, signal: ${signal})`);

    config.status = 'stopped';
    config.stoppedAt = new Date().toISOString();

    // Emit exit event
    this.emit('process_exited', {
      name,
      code,
      signal,
      pid: config.pid
    });

    // Log to database
    await this._logEvent(name, 'exited', { code, signal });

    // Auto-restart if enabled and not graceful shutdown
    if (config.autoRestart && this.autoRestart && code !== 0) {
      if (this._canRestart(name)) {
        console.log(`🔄 Auto-restarting ${name}...`);
        try {
          await this.restart(name, { reason: 'auto_restart', delay: this.restartDelay });
        } catch (error) {
          console.error(`❌ Auto-restart failed for ${name}:`, error.message);
        }
      } else {
        console.error(`❌ ${name} exceeded restart limit, not auto-restarting`);
      }
    }
  }

  /**
   * Handle health status change from monitor
   * @param {object} event - Status change event
   */
  async _handleStatusChange(event) {
    const { name, to, from } = event;

    // If process went from healthy to error, consider restart
    if (from === '🟢' && to === '🔴') {
      const config = this.processes.get(name);
      if (config && config.critical && config.autoRestart) {
        console.log(`⚠️  Critical process ${name} unhealthy, restarting...`);
        try {
          await this.restart(name, { reason: 'health_check_failed' });
        } catch (error) {
          console.error(`❌ Health-based restart failed for ${name}:`, error.message);
        }
      }
    }
  }

  /**
   * Check if process can be restarted (throttling)
   * @param {string} name - Process name
   * @returns {boolean} - True if restart allowed
   */
  _canRestart(name) {
    const now = Date.now();
    const history = this.restartHistory.get(name) || [];

    // Filter to restarts within window
    const recentRestarts = history.filter(timestamp => now - timestamp < this.restartWindow);

    return recentRestarts.length < this.maxRestarts;
  }

  /**
   * Track a restart
   * @param {string} name - Process name
   */
  _trackRestart(name) {
    const history = this.restartHistory.get(name) || [];
    history.push(Date.now());
    this.restartHistory.set(name, history);

    // Clean old entries
    const cutoff = Date.now() - this.restartWindow * 2;
    const cleaned = history.filter(timestamp => timestamp > cutoff);
    this.restartHistory.set(name, cleaned);
  }

  /**
   * Get restart count within window
   * @param {string} name - Process name
   * @returns {number} - Restart count
   */
  _getRestartCount(name) {
    const now = Date.now();
    const history = this.restartHistory.get(name) || [];
    return history.filter(timestamp => now - timestamp < this.restartWindow).length;
  }

  /**
   * Wait for process to exit
   * @param {ChildProcess} proc - Process
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<boolean>} - True if exited before timeout
   */
  _waitForExit(proc, timeout) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(false);
      }, timeout);

      proc.once('exit', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log event to database
   * @param {string} processName - Process name
   * @param {string} event - Event type
   * @param {object} data - Event data
   */
  async _logEvent(processName, event, data = {}) {
    const sql = `
      INSERT INTO restart_events (process_name, event_type, details, timestamp)
      VALUES ('${processName}', '${event}', '${JSON.stringify(data).replace(/'/g, "''")}', datetime('now'));
    `;

    return new Promise((resolve) => {
      const proc = spawn('sqlite3', [DB_PATH, sql]);
      proc.on('close', () => resolve());
      proc.on('error', () => resolve()); // Don't fail on logging errors
    });
  }

  /**
   * Stop all processes
   */
  async stopAll() {
    console.log('🛑 Stopping all processes...');

    const stops = [];
    for (const [name, config] of this.processes) {
      if (config.proc && config.status === 'running') {
        stops.push(this.stop(name));
      }
    }

    await Promise.allSettled(stops);
    console.log('✓ All processes stopped');
  }

  /**
   * Cleanup on exit
   */
  async cleanup() {
    await this.stopAll();
  }
}

module.exports = ProcessManager;

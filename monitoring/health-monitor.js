/**
 * Health Monitor
 * Monitors all CalOS processes for health, performance, and status
 *
 * Color Codes:
 * 🟢 Green = Healthy, responsive, no errors
 * 🟡 Yellow = Working/buffering, long operation in progress
 * 🔴 Red = Error, crashed, needs restart
 * 🔵 Blue = Starting/restarting
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const axios = require('axios');

class HealthMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.checkInterval = options.checkInterval || 5000; // 5s
    this.timeout = options.timeout || 3000; // 3s
    this.history = new Map(); // Process name -> health history
    this.processes = new Map(); // Process name -> config
    this.metrics = new Map(); // Process name -> latest metrics

    // AI Analytics (optional)
    this.aiCostAlerts = options.aiCostAlerts;
    this.aiInstanceRegistry = options.aiInstanceRegistry;

    this.STATUS = {
      HEALTHY: { emoji: '🟢', color: 'green', code: 200 },
      WORKING: { emoji: '🟡', color: 'yellow', code: 102 },
      ERROR: { emoji: '🔴', color: 'red', code: 500 },
      STARTING: { emoji: '🔵', color: 'blue', code: 101 }
    };
  }

  /**
   * Register a process to monitor
   * @param {string} name - Process name
   * @param {object} config - Configuration
   */
  register(name, config) {
    this.processes.set(name, {
      name,
      type: config.type || 'http', // 'http', 'process', 'file'
      url: config.url,
      port: config.port,
      pid: config.pid,
      command: config.command,
      healthCheck: config.healthCheck || this._defaultHealthCheck.bind(this),
      thresholds: {
        responseTime: config.responseTime || 5000, // 5s
        errorRate: config.errorRate || 0.1, // 10%
        uptime: config.uptime || 60000 // 1 minute
      },
      ...config
    });

    // Initialize history
    this.history.set(name, []);
    this.metrics.set(name, {
      status: this.STATUS.STARTING,
      uptime: 0,
      lastCheck: null,
      responseTime: null,
      errorCount: 0,
      successCount: 0,
      restartCount: 0
    });

    console.log(`📊 Health monitor registered: ${name}`);
  }

  /**
   * Start monitoring all registered processes
   */
  start() {
    console.log('🚀 Starting health monitor...');

    // Initial check
    this.checkAll();

    // Periodic checks
    this.interval = setInterval(() => {
      this.checkAll();
    }, this.checkInterval);

    this.emit('started');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.emit('stopped');
  }

  /**
   * Check health of all registered processes
   */
  async checkAll() {
    const checks = [];

    for (const [name, config] of this.processes) {
      checks.push(this.check(name));
    }

    await Promise.allSettled(checks);
  }

  /**
   * Check health of a specific process
   * @param {string} name - Process name
   */
  async check(name) {
    const config = this.processes.get(name);
    if (!config) {
      throw new Error(`Process not registered: ${name}`);
    }

    const startTime = Date.now();
    let status = this.STATUS.HEALTHY;
    let error = null;
    let details = {};

    try {
      // Run health check
      const result = await Promise.race([
        config.healthCheck(config),
        this._timeout(this.timeout)
      ]);

      const responseTime = Date.now() - startTime;

      // Update metrics
      const metrics = this.metrics.get(name);
      metrics.successCount++;
      metrics.responseTime = responseTime;
      metrics.lastCheck = new Date().toISOString();

      // Determine status based on response time
      if (responseTime > config.thresholds.responseTime) {
        status = this.STATUS.WORKING;
      }

      // Calculate error rate
      const totalChecks = metrics.successCount + metrics.errorCount;
      const errorRate = totalChecks > 0 ? metrics.errorCount / totalChecks : 0;

      if (errorRate > config.thresholds.errorRate) {
        status = this.STATUS.ERROR;
      }

      details = {
        ...result,
        responseTime,
        errorRate: (errorRate * 100).toFixed(1) + '%'
      };

    } catch (err) {
      status = this.STATUS.ERROR;
      error = err.message;

      const metrics = this.metrics.get(name);
      metrics.errorCount++;
      metrics.lastCheck = new Date().toISOString();
    }

    // Update status
    this._updateStatus(name, status, details, error);

    // Emit event
    this.emit('health_check', {
      name,
      status: status.emoji,
      color: status.color,
      details,
      error,
      timestamp: new Date().toISOString()
    });

    return { name, status, details, error };
  }

  /**
   * Default health check for HTTP services
   * @param {object} config - Process config
   */
  async _defaultHealthCheck(config) {
    if (config.type === 'http') {
      const url = config.url || `http://localhost:${config.port}${config.healthPath || '/health'}`;

      try {
        const response = await axios.get(url, {
          timeout: this.timeout,
          validateStatus: () => true // Accept any status
        });

        return {
          type: 'http',
          status: response.status,
          statusText: response.statusText,
          healthy: response.status >= 200 && response.status < 300
        };
      } catch (error) {
        throw new Error(`HTTP check failed: ${error.message}`);
      }
    }

    if (config.type === 'process') {
      // Check if process is running
      const running = await this._checkProcess(config.pid || config.command);

      if (!running) {
        throw new Error('Process not running');
      }

      return {
        type: 'process',
        running: true
      };
    }

    if (config.type === 'file') {
      // Check if log file is being updated
      const active = await this._checkFileActivity(config.logPath);

      return {
        type: 'file',
        active,
        lastUpdate: active ? new Date().toISOString() : 'stale'
      };
    }

    throw new Error(`Unknown health check type: ${config.type}`);
  }

  /**
   * Check if a process is running
   * @param {number|string} pidOrCommand - PID or command name
   */
  async _checkProcess(pidOrCommand) {
    return new Promise((resolve) => {
      let command;

      if (typeof pidOrCommand === 'number') {
        command = `ps -p ${pidOrCommand}`;
      } else {
        command = `pgrep -f "${pidOrCommand}"`;
      }

      const proc = spawn('sh', ['-c', command]);

      proc.on('close', (code) => {
        resolve(code === 0);
      });

      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Check if a file has been updated recently
   * @param {string} filePath - Path to file
   */
  async _checkFileActivity(filePath) {
    return new Promise((resolve) => {
      const proc = spawn('stat', ['-f', '%m', filePath]);
      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          resolve(false);
          return;
        }

        const mtime = parseInt(output.trim());
        const now = Date.now() / 1000;
        const age = now - mtime;

        // Consider active if modified in last 30 seconds
        resolve(age < 30);
      });

      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Update status for a process
   * @param {string} name - Process name
   * @param {object} status - Status object
   * @param {object} details - Details object
   * @param {string|null} error - Error message
   */
  _updateStatus(name, status, details, error) {
    const metrics = this.metrics.get(name);
    const previousStatus = metrics.status;

    metrics.status = status;
    metrics.details = details;
    metrics.error = error;

    // Add to history
    const history = this.history.get(name);
    history.push({
      timestamp: new Date().toISOString(),
      status: status.emoji,
      color: status.color,
      details,
      error
    });

    // Keep last 100 checks
    if (history.length > 100) {
      history.shift();
    }

    // Emit status change event
    if (previousStatus.emoji !== status.emoji) {
      this.emit('status_change', {
        name,
        from: previousStatus.emoji,
        to: status.emoji,
        color: status.color,
        details,
        error
      });

      console.log(`${status.emoji} ${name}: ${previousStatus.emoji} → ${status.emoji}`);
    }
  }

  /**
   * Timeout promise helper
   * @param {number} ms - Timeout in milliseconds
   */
  _timeout(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Health check timeout')), ms)
    );
  }

  /**
   * Get current status of all processes
   * @returns {object} - Status summary
   */
  getStatus() {
    const status = {};

    for (const [name, metrics] of this.metrics) {
      status[name] = {
        status: metrics.status.emoji,
        color: metrics.status.color,
        code: metrics.status.code,
        uptime: metrics.uptime,
        lastCheck: metrics.lastCheck,
        responseTime: metrics.responseTime,
        errorRate: (
          (metrics.errorCount / (metrics.successCount + metrics.errorCount)) * 100
        ).toFixed(1) + '%',
        details: metrics.details,
        error: metrics.error
      };
    }

    return status;
  }

  /**
   * Get health history for a process
   * @param {string} name - Process name
   * @param {number} limit - Number of entries to return
   * @returns {Array} - Health history
   */
  getHistory(name, limit = 50) {
    const history = this.history.get(name) || [];
    return history.slice(-limit);
  }

  /**
   * Get overall system health
   * @returns {object} - System health summary
   */
  getSystemHealth() {
    const processes = Array.from(this.metrics.entries());
    const total = processes.length;

    let healthy = 0;
    let working = 0;
    let errors = 0;
    let starting = 0;

    for (const [name, metrics] of processes) {
      switch (metrics.status.emoji) {
        case '🟢':
          healthy++;
          break;
        case '🟡':
          working++;
          break;
        case '🔴':
          errors++;
          break;
        case '🔵':
          starting++;
          break;
      }
    }

    let overall;
    if (errors > 0) {
      overall = this.STATUS.ERROR;
    } else if (working > 0 || starting > 0) {
      overall = this.STATUS.WORKING;
    } else {
      overall = this.STATUS.HEALTHY;
    }

    return {
      overall: overall.emoji,
      color: overall.color,
      total,
      healthy,
      working,
      errors,
      starting,
      percentage: total > 0 ? ((healthy / total) * 100).toFixed(1) + '%' : '0%'
    };
  }

  /**
   * Mark process as starting (e.g., during restart)
   * @param {string} name - Process name
   */
  markStarting(name) {
    const metrics = this.metrics.get(name);
    if (metrics) {
      metrics.status = this.STATUS.STARTING;
      metrics.restartCount++;
      this.emit('process_starting', { name });
    }
  }

  /**
   * Reset error count for a process
   * @param {string} name - Process name
   */
  resetErrors(name) {
    const metrics = this.metrics.get(name);
    if (metrics) {
      metrics.errorCount = 0;
    }
  }

  /**
   * Check AI providers health
   * Integrates with AI Cost Alerts to monitor provider status
   * @returns {Promise<object>} AI providers health status
   */
  async checkAIProviders() {
    if (!this.aiCostAlerts || !this.aiInstanceRegistry) {
      return {
        enabled: false,
        message: 'AI provider monitoring not configured'
      };
    }

    try {
      const instances = this.aiInstanceRegistry.listInstances({ enabledOnly: true });
      const summary = await this.aiCostAlerts.getAlertSummary();

      const providerStatus = {};

      for (const instance of instances) {
        // Get alert status for this instance
        const status = await this.aiCostAlerts.checkThresholds(instance.name);

        providerStatus[instance.name] = {
          instance: instance.displayName,
          provider: instance.provider,
          model: instance.model,
          status: status.status.emoji,
          color: status.status.color,
          alerts: status.alerts || [],
          free: instance.costProfile.free
        };
      }

      return {
        enabled: true,
        healthy: summary.healthy.length,
        warning: summary.warning.length,
        critical: summary.critical.length,
        total: summary.total,
        providers: providerStatus,
        circuitBreakers: {
          total: summary.circuitBreakers.total,
          tripped: summary.circuitBreakers.tripped
        },
        fallbacks: {
          total: summary.fallbacks.total,
          active: summary.fallbacks.active
        }
      };

    } catch (error) {
      console.error('[HealthMonitor] Error checking AI providers:', error.message);
      return {
        enabled: false,
        error: error.message
      };
    }
  }

  /**
   * Get combined system health including AI providers
   * @returns {Promise<object>} Complete system health
   */
  async getCompleteSystemHealth() {
    const systemHealth = this.getSystemHealth();
    const aiHealth = await this.checkAIProviders();

    return {
      ...systemHealth,
      ai: aiHealth
    };
  }
}

module.exports = HealthMonitor;

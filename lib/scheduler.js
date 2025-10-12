/**
 * Task Scheduler
 *
 * Lightweight cron-like scheduler for running periodic tasks.
 * Supports interval-based and time-based scheduling.
 *
 * Features:
 * - Interval scheduling (every N seconds/minutes/hours)
 * - Named tasks for easy management
 * - Task history and statistics
 * - Error handling and retry
 * - Start/stop individual tasks
 */

class Scheduler {
  constructor(options = {}) {
    this.tasks = new Map();
    this.history = [];
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.running = false;

    // Global error handler
    this.errorHandler = options.errorHandler || ((taskName, error) => {
      console.error(`[Scheduler] Task "${taskName}" failed:`, error.message);
    });
  }

  /**
   * Schedule a task to run at regular intervals
   *
   * @param {String} name - Unique task name
   * @param {Function} fn - Function to execute
   * @param {Object} options - Scheduling options
   * @param {Number} options.interval - Interval in milliseconds
   * @param {Boolean} options.runImmediately - Run immediately on start (default: false)
   * @param {Boolean} options.enabled - Start enabled (default: true)
   * @param {Number} options.maxRetries - Max retries on failure (default: 0)
   * @param {Number} options.retryDelay - Delay between retries in ms (default: 1000)
   *
   * @example
   * scheduler.schedule('fetch-prices', async () => {
   *   await fetchPrices();
   * }, { interval: 30000, runImmediately: true });
   */
  schedule(name, fn, options = {}) {
    if (this.tasks.has(name)) {
      throw new Error(`Task "${name}" already exists`);
    }

    const task = {
      name,
      fn,
      interval: options.interval || 60000, // Default: 1 minute
      runImmediately: options.runImmediately !== false,
      enabled: options.enabled !== false,
      maxRetries: options.maxRetries || 0,
      retryDelay: options.retryDelay || 1000,
      timer: null,
      stats: {
        runs: 0,
        failures: 0,
        lastRun: null,
        lastSuccess: null,
        lastFailure: null,
        averageDuration: 0
      }
    };

    this.tasks.set(name, task);

    // Start immediately if scheduler is running
    if (this.running && task.enabled) {
      this._startTask(task);
    }

    console.log(`[Scheduler] Task "${name}" scheduled (interval: ${task.interval}ms)`);
    return this;
  }

  /**
   * Schedule a task with cron-like syntax (simplified)
   *
   * @param {String} name - Unique task name
   * @param {Function} fn - Function to execute
   * @param {String} cronExpression - Cron expression for scheduling
   *
   * Note: This is a simplified implementation. Use a full cron library for complex schedules.
   */
  scheduleCron(name, fn, cronExpression) {
    // Parse basic cron expressions (minute hour day month weekday)
    // For now, we'll convert to interval-based scheduling
    // Full cron support would require a library like node-cron

    console.warn('[Scheduler] Cron scheduling is simplified. Consider using node-cron for complex schedules.');

    // Extract interval from expression (basic parsing)
    const parts = cronExpression.split(' ');
    if (parts[0].startsWith('*/')) {
      const minutes = parseInt(parts[0].substring(2));
      return this.schedule(name, fn, { interval: minutes * 60 * 1000 });
    }

    throw new Error('Complex cron expressions not yet supported. Use schedule() with interval instead.');
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.running) {
      console.log('[Scheduler] Already running');
      return this;
    }

    console.log('[Scheduler] Starting scheduler...');
    this.running = true;

    // Start all enabled tasks
    for (const task of this.tasks.values()) {
      if (task.enabled) {
        this._startTask(task);
      }
    }

    console.log(`[Scheduler] Started with ${this.tasks.size} task(s)`);
    return this;
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.running) {
      console.log('[Scheduler] Not running');
      return this;
    }

    console.log('[Scheduler] Stopping scheduler...');
    this.running = false;

    // Stop all tasks
    for (const task of this.tasks.values()) {
      this._stopTask(task);
    }

    console.log('[Scheduler] Stopped');
    return this;
  }

  /**
   * Enable a specific task
   */
  enable(name) {
    const task = this.tasks.get(name);
    if (!task) {
      throw new Error(`Task "${name}" not found`);
    }

    if (task.enabled) {
      console.log(`[Scheduler] Task "${name}" already enabled`);
      return this;
    }

    task.enabled = true;

    if (this.running) {
      this._startTask(task);
    }

    console.log(`[Scheduler] Task "${name}" enabled`);
    return this;
  }

  /**
   * Disable a specific task
   */
  disable(name) {
    const task = this.tasks.get(name);
    if (!task) {
      throw new Error(`Task "${name}" not found`);
    }

    if (!task.enabled) {
      console.log(`[Scheduler] Task "${name}" already disabled`);
      return this;
    }

    task.enabled = false;
    this._stopTask(task);

    console.log(`[Scheduler] Task "${name}" disabled`);
    return this;
  }

  /**
   * Remove a task
   */
  remove(name) {
    const task = this.tasks.get(name);
    if (!task) {
      throw new Error(`Task "${name}" not found`);
    }

    this._stopTask(task);
    this.tasks.delete(name);

    console.log(`[Scheduler] Task "${name}" removed`);
    return this;
  }

  /**
   * Run a task immediately (doesn't affect schedule)
   */
  async runNow(name) {
    const task = this.tasks.get(name);
    if (!task) {
      throw new Error(`Task "${name}" not found`);
    }

    console.log(`[Scheduler] Running task "${name}" immediately...`);
    await this._executeTask(task);
    return this;
  }

  /**
   * Get task statistics
   */
  getStats(name = null) {
    if (name) {
      const task = this.tasks.get(name);
      if (!task) {
        throw new Error(`Task "${name}" not found`);
      }

      return {
        name: task.name,
        enabled: task.enabled,
        interval: task.interval,
        ...task.stats
      };
    }

    // Return stats for all tasks
    const stats = {};
    for (const [taskName, task] of this.tasks.entries()) {
      stats[taskName] = {
        enabled: task.enabled,
        interval: task.interval,
        ...task.stats
      };
    }

    return {
      running: this.running,
      taskCount: this.tasks.size,
      tasks: stats,
      historySize: this.history.length
    };
  }

  /**
   * Get task history
   */
  getHistory(limit = 100) {
    return this.history.slice(-limit);
  }

  /**
   * Start a specific task
   * @private
   */
  _startTask(task) {
    if (task.timer) {
      clearInterval(task.timer);
    }

    // Run immediately if requested
    if (task.runImmediately) {
      this._executeTask(task);
    }

    // Schedule recurring execution
    task.timer = setInterval(() => {
      this._executeTask(task);
    }, task.interval);
  }

  /**
   * Stop a specific task
   * @private
   */
  _stopTask(task) {
    if (task.timer) {
      clearInterval(task.timer);
      task.timer = null;
    }
  }

  /**
   * Execute a task with retry logic
   * @private
   */
  async _executeTask(task, retryCount = 0) {
    const startTime = Date.now();

    try {
      await task.fn();

      // Success
      const duration = Date.now() - startTime;
      task.stats.runs++;
      task.stats.lastRun = new Date();
      task.stats.lastSuccess = new Date();

      // Update average duration
      const totalDuration = task.stats.averageDuration * (task.stats.runs - 1) + duration;
      task.stats.averageDuration = Math.round(totalDuration / task.stats.runs);

      this._addHistory({
        task: task.name,
        status: 'success',
        duration,
        timestamp: new Date()
      });

    } catch (error) {
      // Failure
      task.stats.failures++;
      task.stats.lastRun = new Date();
      task.stats.lastFailure = new Date();

      this._addHistory({
        task: task.name,
        status: 'failure',
        error: error.message,
        timestamp: new Date()
      });

      // Call error handler
      this.errorHandler(task.name, error);

      // Retry if configured
      if (retryCount < task.maxRetries) {
        console.log(`[Scheduler] Retrying task "${task.name}" (${retryCount + 1}/${task.maxRetries})...`);
        await this._sleep(task.retryDelay);
        await this._executeTask(task, retryCount + 1);
      }
    }
  }

  /**
   * Add entry to history
   * @private
   */
  _addHistory(entry) {
    this.history.push(entry);

    // Trim history if too large
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Scheduler;

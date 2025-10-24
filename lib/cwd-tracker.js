/**
 * CWD (Current Working Directory) Tracker
 *
 * Monitors process.cwd() for unexpected changes that can break file operations.
 *
 * Use cases:
 * - Detect when CWD changes during file upload
 * - Track CWD resets that break relative paths
 * - Monitor file explorer / pilot operations
 * - Debug file operation failures
 *
 * Usage:
 *   const CWDTracker = require('./lib/cwd-tracker');
 *   const tracker = new CWDTracker();
 *
 *   tracker.on('cwd-change', (change) => {
 *     console.log(`CWD changed: ${change.from} → ${change.to}`);
 *   });
 */

const EventEmitter = require('events');

class CWDTracker extends EventEmitter {
  constructor(options = {}) {
    super();

    this.initialCWD = process.cwd();
    this.cwdHistory = [{ cwd: this.initialCWD, timestamp: Date.now(), stackTrace: null }];
    this.resetCount = 0;
    this.changeCount = 0;

    // Monitoring options
    this.checkInterval = options.checkInterval || 100; // Check every 100ms
    this.captureStackTrace = options.captureStackTrace !== false;
    this.enabled = options.enabled !== false;

    // Start monitoring
    if (this.enabled) {
      this.monitor = setInterval(() => this.check(), this.checkInterval);
    }
  }

  /**
   * Check for CWD changes
   */
  check() {
    const currentCWD = process.cwd();
    const lastEntry = this.cwdHistory[this.cwdHistory.length - 1];

    if (currentCWD !== lastEntry.cwd) {
      this.changeCount++;

      const change = {
        from: lastEntry.cwd,
        to: currentCWD,
        timestamp: Date.now(),
        isReset: currentCWD === this.initialCWD,
        stackTrace: null
      };

      // Capture stack trace if enabled
      if (this.captureStackTrace) {
        const err = new Error();
        Error.captureStackTrace(err, this.check);
        change.stackTrace = err.stack;
      }

      // Add to history
      this.cwdHistory.push({ cwd: currentCWD, timestamp: change.timestamp, stackTrace: change.stackTrace });

      // Track resets
      if (change.isReset) {
        this.resetCount++;
      }

      // Log warning
      console.warn(`[CWD Changed] ${change.from} → ${change.to}`);

      if (change.isReset) {
        console.warn(`[CWD Reset] Count: ${this.resetCount}`);
      }

      // Emit event
      this.emit('cwd-change', change);
    }
  }

  /**
   * Get CWD history
   * @returns {array} History of CWD changes
   */
  getHistory() {
    return this.cwdHistory;
  }

  /**
   * Get number of times CWD was reset to initial directory
   * @returns {number} Reset count
   */
  getResetCount() {
    return this.resetCount;
  }

  /**
   * Get total number of CWD changes
   * @returns {number} Change count
   */
  getChangeCount() {
    return this.changeCount;
  }

  /**
   * Get current CWD
   * @returns {string} Current working directory
   */
  getCurrentCWD() {
    return process.cwd();
  }

  /**
   * Get initial CWD (when tracker was created)
   * @returns {string} Initial working directory
   */
  getInitialCWD() {
    return this.initialCWD;
  }

  /**
   * Check if CWD has changed since tracker started
   * @returns {boolean} True if CWD changed
   */
  hasChanged() {
    return this.changeCount > 0;
  }

  /**
   * Check if CWD is currently at initial directory
   * @returns {boolean} True if at initial CWD
   */
  isAtInitial() {
    return process.cwd() === this.initialCWD;
  }

  /**
   * Get summary report
   * @returns {object} Summary of CWD tracking
   */
  getSummary() {
    return {
      initialCWD: this.initialCWD,
      currentCWD: process.cwd(),
      changeCount: this.changeCount,
      resetCount: this.resetCount,
      isAtInitial: this.isAtInitial(),
      hasChanged: this.hasChanged(),
      history: this.cwdHistory.map(entry => ({
        cwd: entry.cwd,
        timestamp: new Date(entry.timestamp).toISOString()
      }))
    };
  }

  /**
   * Reset tracking (start fresh)
   */
  reset() {
    this.initialCWD = process.cwd();
    this.cwdHistory = [{ cwd: this.initialCWD, timestamp: Date.now(), stackTrace: null }];
    this.resetCount = 0;
    this.changeCount = 0;
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitor) {
      clearInterval(this.monitor);
      this.monitor = null;
    }
  }

  /**
   * Start monitoring (if stopped)
   */
  start() {
    if (!this.monitor && this.enabled) {
      this.monitor = setInterval(() => this.check(), this.checkInterval);
    }
  }

  /**
   * Create a snapshot of current state
   * @param {string} label - Label for this snapshot
   * @returns {object} Snapshot
   */
  snapshot(label = 'snapshot') {
    return {
      label,
      timestamp: Date.now(),
      cwd: process.cwd(),
      initialCWD: this.initialCWD,
      changeCount: this.changeCount,
      resetCount: this.resetCount
    };
  }
}

module.exports = CWDTracker;

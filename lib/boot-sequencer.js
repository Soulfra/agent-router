/**
 * Boot Sequencer
 *
 * Orchestrates system startup like an OS or game loading screen
 *
 * Boot Stages (like your "animation" concept):
 * 1. ⚫️ LOAD: Import all modules (all colors on screen)
 * 2. ⚪️ CLEAN: Quiet mode, clean slate (white screen)
 * 3. 🟢 CORE: Initialize critical systems (database, ollama)
 * 4. 🟡 SERVICES: Start background services (buckets, xref)
 * 5. 🔵 FEATURES: Enable optional features (price workers, schedulers)
 * 6. ✅ READY: System fully operational
 *
 * Like:
 * - macOS boot (black → Apple logo → desktop)
 * - Game loading (assets → white screen → UI)
 * - Docker Compose (pull → create → start)
 */

class BootSequencer {
  constructor(options = {}) {
    this.stages = [];
    this.currentStage = null;
    this.startTime = null;
    this.verbose = options.verbose !== false;
    this.colorEnabled = options.colorEnabled !== false;

    // Colors for terminal output
    this.colors = {
      reset: '\x1b[0m',
      black: '\x1b[30m',
      white: '\x1b[37m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      red: '\x1b[31m',
      cyan: '\x1b[36m',
      magenta: '\x1b[35m',
      grey: '\x1b[90m',
      bold: '\x1b[1m'
    };

    // Stage emojis
    this.emojis = {
      load: '⚫️',
      clean: '⚪️',
      core: '🟢',
      services: '🟡',
      features: '🔵',
      ready: '✅',
      error: '❌',
      skip: '⏭️'
    };
  }

  /**
   * Register a boot stage
   * @param {string} name - Stage name (load, clean, core, services, features, ready)
   * @param {string} description - What this stage does
   * @param {function} fn - Async function to execute
   * @param {object} options - Stage options
   */
  registerStage(name, description, fn, options = {}) {
    const stage = {
      name,
      description,
      fn,
      required: options.required !== false,
      timeout: options.timeout || 30000,
      retries: options.retries || 0,
      emoji: this.emojis[name] || '📦',
      color: this._getStageColor(name),
      status: 'pending', // pending, running, success, failed, skipped
      duration: null,
      error: null
    };

    this.stages.push(stage);
    return this;
  }

  /**
   * Start the boot sequence
   */
  async boot() {
    this.startTime = Date.now();

    // Print boot header
    this._printHeader();

    // Execute each stage in order
    for (const stage of this.stages) {
      this.currentStage = stage;

      try {
        await this._executeStage(stage);
      } catch (error) {
        if (stage.required) {
          // Required stage failed - abort boot
          this._printError(`Boot failed at ${stage.name}`, error);
          throw error;
        } else {
          // Optional stage failed - continue
          stage.status = 'skipped';
          stage.error = error;
          this._printStageSkipped(stage);
        }
      }
    }

    // Print boot summary
    this._printSummary();

    return {
      success: true,
      duration: Date.now() - this.startTime,
      stages: this.stages.map(s => ({
        name: s.name,
        status: s.status,
        duration: s.duration
      }))
    };
  }

  /**
   * Execute a single stage
   * @private
   */
  async _executeStage(stage) {
    const stageStart = Date.now();
    stage.status = 'running';

    // Print stage start
    this._printStageStart(stage);

    try {
      // Execute with timeout
      await this._executeWithTimeout(stage.fn, stage.timeout);

      // Success
      stage.status = 'success';
      stage.duration = Date.now() - stageStart;
      this._printStageSuccess(stage);

    } catch (error) {
      // Failed
      stage.status = 'failed';
      stage.duration = Date.now() - stageStart;
      stage.error = error;

      // Retry if configured
      if (stage.retries > 0) {
        this._printRetry(stage);
        stage.retries--;
        return this._executeStage(stage);
      }

      throw error;
    }
  }

  /**
   * Execute function with timeout
   * @private
   */
  async _executeWithTimeout(fn, timeout) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Stage timeout')), timeout)
      )
    ]);
  }

  /**
   * Get color for stage
   * @private
   */
  _getStageColor(name) {
    const colorMap = {
      load: 'black',
      clean: 'white',
      core: 'green',
      services: 'yellow',
      features: 'blue',
      ready: 'cyan'
    };
    return colorMap[name] || 'grey';
  }

  /**
   * Print colored text
   * @private
   */
  _print(text, color = null) {
    if (!this.verbose) return;

    // Use process.stdout.write to bypass console.log overrides
    const output = color && this.colorEnabled ?
      this.colors[color] + text + this.colors.reset :
      text;

    process.stdout.write(output + '\n');
  }

  /**
   * Print boot header
   * @private
   */
  _printHeader() {
    if (!this.verbose) return;

    process.stdout.write('\n');
    this._print('╔════════════════════════════════════════════════════════════════╗', 'cyan');
    this._print('║                  🚀 SYSTEM BOOT SEQUENCE 🚀                    ║', 'cyan');
    this._print('╚════════════════════════════════════════════════════════════════╝', 'cyan');
    process.stdout.write('\n');
    this._print('  Like an OS or game - loading in stages for smooth startup...', 'grey');
    process.stdout.write('\n');
  }

  /**
   * Print stage start
   * @private
   */
  _printStageStart(stage) {
    if (!this.verbose) return;

    const color = stage.color;
    this._print(`${stage.emoji}  ${stage.name.toUpperCase()}: ${stage.description}...`, color);
  }

  /**
   * Print stage success
   * @private
   */
  _printStageSuccess(stage) {
    if (!this.verbose) return;

    const duration = stage.duration;
    this._print(`   ✓ Completed in ${duration}ms`, 'green');
    process.stdout.write('\n');
  }

  /**
   * Print stage skipped
   * @private
   */
  _printStageSkipped(stage) {
    if (!this.verbose) return;

    this._print(`   ${this.emojis.skip} Skipped (non-critical): ${stage.error.message}`, 'yellow');
    process.stdout.write('\n');
  }

  /**
   * Print retry
   * @private
   */
  _printRetry(stage) {
    if (!this.verbose) return;

    this._print(`   ↻ Retrying... (${stage.retries} attempts left)`, 'yellow');
  }

  /**
   * Print error
   * @private
   */
  _printError(message, error) {
    process.stdout.write('\n');
    this._print(`${this.emojis.error}  ${message}`, 'red');
    if (error) {
      this._print(`   ${error.message}`, 'red');
    }
    process.stdout.write('\n');
  }

  /**
   * Print boot summary
   * @private
   */
  _printSummary() {
    if (!this.verbose) return;

    const totalDuration = Date.now() - this.startTime;
    const successful = this.stages.filter(s => s.status === 'success').length;
    const failed = this.stages.filter(s => s.status === 'failed').length;
    const skipped = this.stages.filter(s => s.status === 'skipped').length;

    process.stdout.write('\n');
    this._print('═'.repeat(68), 'cyan');
    this._print(`  ${this.emojis.ready}  SYSTEM READY!`, 'bold');
    this._print('═'.repeat(68), 'cyan');
    process.stdout.write('\n');
    this._print(`  Total time: ${totalDuration}ms`, 'grey');
    this._print(`  Stages: ${successful} success, ${failed} failed, ${skipped} skipped`, 'grey');
    process.stdout.write('\n');

    // Print stage summary
    for (const stage of this.stages) {
      const emoji = stage.status === 'success' ? '✓' :
                    stage.status === 'failed' ? '✗' :
                    stage.status === 'skipped' ? '⏭' : '○';
      const color = stage.status === 'success' ? 'green' :
                    stage.status === 'failed' ? 'red' :
                    stage.status === 'skipped' ? 'yellow' : 'grey';

      this._print(`  ${emoji}  ${stage.emoji}  ${stage.name.padEnd(10)} - ${stage.duration || 0}ms`, color);
    }

    process.stdout.write('\n');
    this._print('  Server is now accepting requests.', 'green');
    process.stdout.write('\n');
  }

  /**
   * Create a progress bar (simple ASCII)
   * @param {number} current - Current value
   * @param {number} total - Total value
   * @param {number} width - Bar width
   * @returns {string} - Progress bar
   */
  static progressBar(current, total, width = 20) {
    const percent = current / total;
    const filled = Math.round(percent * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percentage = Math.round(percent * 100);

    return `[${bar}] ${percentage}%`;
  }
}

module.exports = BootSequencer;

/**
 * Command Verifier
 *
 * Tests if CALOS commands actually work and tracks results.
 * Core of the self-healing command system.
 *
 * Verifies:
 * - Command exists and is executable
 * - Dependencies are installed
 * - Output is as expected
 * - No errors thrown
 * - Performance is acceptable
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class CommandVerifier {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000; // 30s default
    this.resultsPath = options.resultsPath || path.join(process.env.HOME, '.calos/command-health.json');
    this.results = null;
  }

  /**
   * Load verification results from disk
   */
  async loadResults() {
    if (this.results) return this.results;

    try {
      const data = await fs.readFile(this.resultsPath, 'utf-8');
      this.results = JSON.parse(data);
    } catch (error) {
      // No results file yet
      this.results = {
        commands: {},
        lastUpdate: null,
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0
      };
    }

    return this.results;
  }

  /**
   * Save verification results to disk
   */
  async saveResults() {
    const dir = path.dirname(this.resultsPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.resultsPath, JSON.stringify(this.results, null, 2), 'utf-8');
  }

  /**
   * Verify a command
   * @param {string} command - Command name (e.g., 'calos', 'node')
   * @param {array} args - Command arguments
   * @param {object} options - Verification options
   * @returns {Promise<object>} Verification result
   */
  async verify(command, args = [], options = {}) {
    const startTime = Date.now();
    await this.loadResults();

    const testId = `${command} ${args.join(' ')}`.trim();

    const result = {
      command,
      args,
      testId,
      timestamp: new Date().toISOString(),
      duration: 0,
      success: false,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: null,
      checks: {
        exists: false,
        executable: false,
        noErrors: false,
        hasOutput: false,
        performanceOk: false
      }
    };

    try {
      // Check 1: Command exists
      const exists = await this.commandExists(command);
      result.checks.exists = exists;

      if (!exists) {
        result.error = `Command not found: ${command}`;
        await this.recordResult(result);
        return result;
      }

      // Check 2: Execute command
      const execution = await this.executeCommand(command, args, {
        timeout: options.timeout || this.timeout,
        cwd: options.cwd || process.cwd(),
        env: options.env || process.env
      });

      result.exitCode = execution.code;
      result.stdout = execution.stdout;
      result.stderr = execution.stderr;
      result.duration = execution.duration;

      // Check 3: Executable (ran without crashing)
      result.checks.executable = execution.code !== null;

      // Check 4: No errors
      result.checks.noErrors = execution.code === 0 && !execution.error;

      // Check 5: Has expected output
      if (options.expectedOutput) {
        result.checks.hasOutput = this.checkExpectedOutput(
          execution.stdout,
          options.expectedOutput
        );
      } else {
        // Default: any output is good
        result.checks.hasOutput = execution.stdout.length > 0 || execution.stderr.length > 0;
      }

      // Check 6: Performance acceptable
      const maxDuration = options.maxDuration || 10000; // 10s default
      result.checks.performanceOk = execution.duration < maxDuration;

      // Overall success: all checks pass
      result.success = Object.values(result.checks).every(check => check === true);

      if (execution.error) {
        result.error = execution.error;
      }

    } catch (error) {
      result.error = error.message;
      result.success = false;
    }

    result.duration = Date.now() - startTime;

    // Record result
    await this.recordResult(result);

    return result;
  }

  /**
   * Check if command exists
   */
  async commandExists(command) {
    return new Promise((resolve) => {
      const proc = spawn('which', [command]);
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Execute command
   */
  async executeCommand(command, args, options) {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeout
      });

      let stdout = '';
      let stderr = '';
      let error = null;

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (err) => {
        error = err.message;
      });

      proc.on('close', (code) => {
        resolve({
          code,
          stdout,
          stderr,
          error,
          duration: Date.now() - startTime
        });
      });

      // Handle timeout
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill();
          resolve({
            code: null,
            stdout,
            stderr,
            error: 'Command timed out',
            duration: Date.now() - startTime
          });
        }
      }, options.timeout);
    });
  }

  /**
   * Check if output matches expected
   */
  checkExpectedOutput(actual, expected) {
    if (typeof expected === 'string') {
      return actual.includes(expected);
    }

    if (expected instanceof RegExp) {
      return expected.test(actual);
    }

    if (typeof expected === 'function') {
      return expected(actual);
    }

    return false;
  }

  /**
   * Record verification result
   */
  async recordResult(result) {
    await this.loadResults();

    // Initialize command entry if doesn't exist
    if (!this.results.commands[result.testId]) {
      this.results.commands[result.testId] = {
        command: result.command,
        args: result.args,
        testCount: 0,
        passCount: 0,
        failCount: 0,
        lastSuccess: null,
        lastFailure: null,
        recentResults: []
      };
    }

    const commandData = this.results.commands[result.testId];

    // Update counts
    commandData.testCount++;
    this.results.totalTests++;

    if (result.success) {
      commandData.passCount++;
      commandData.lastSuccess = result.timestamp;
      this.results.totalPassed++;
    } else {
      commandData.failCount++;
      commandData.lastFailure = result.timestamp;
      this.results.totalFailed++;
    }

    // Keep last 10 results
    commandData.recentResults.unshift(result);
    if (commandData.recentResults.length > 10) {
      commandData.recentResults = commandData.recentResults.slice(0, 10);
    }

    this.results.lastUpdate = new Date().toISOString();

    await this.saveResults();
  }

  /**
   * Get command health status
   */
  async getCommandHealth(testId = null) {
    await this.loadResults();

    if (testId) {
      return this.results.commands[testId] || null;
    }

    return this.results;
  }

  /**
   * Get failing commands
   */
  async getFailingCommands() {
    await this.loadResults();

    const failing = [];

    for (const [testId, data] of Object.entries(this.results.commands)) {
      // Consider failing if:
      // - Never passed, OR
      // - Last result was failure, OR
      // - Pass rate < 50%
      const passRate = data.testCount > 0 ? data.passCount / data.testCount : 0;
      const lastResult = data.recentResults[0];

      if (data.passCount === 0 || !lastResult?.success || passRate < 0.5) {
        failing.push({
          testId,
          ...data,
          passRate: (passRate * 100).toFixed(1) + '%'
        });
      }
    }

    return failing;
  }

  /**
   * Get working commands
   */
  async getWorkingCommands() {
    await this.loadResults();

    const working = [];

    for (const [testId, data] of Object.entries(this.results.commands)) {
      const passRate = data.testCount > 0 ? data.passCount / data.testCount : 0;
      const lastResult = data.recentResults[0];

      if (lastResult?.success && passRate >= 0.5) {
        working.push({
          testId,
          ...data,
          passRate: (passRate * 100).toFixed(1) + '%'
        });
      }
    }

    return working;
  }

  /**
   * Get statistics
   */
  async getStatistics() {
    await this.loadResults();

    const totalCommands = Object.keys(this.results.commands).length;
    const working = await this.getWorkingCommands();
    const failing = await this.getFailingCommands();

    const overallPassRate = this.results.totalTests > 0
      ? (this.results.totalPassed / this.results.totalTests * 100).toFixed(1)
      : 0;

    return {
      totalCommands,
      workingCommands: working.length,
      failingCommands: failing.length,
      neverTested: totalCommands - working.length - failing.length,
      totalTests: this.results.totalTests,
      totalPassed: this.results.totalPassed,
      totalFailed: this.results.totalFailed,
      passRate: overallPassRate + '%',
      lastUpdate: this.results.lastUpdate
    };
  }

  /**
   * Generate health report
   */
  async generateReport() {
    const stats = await this.getStatistics();
    const failing = await this.getFailingCommands();
    const working = await this.getWorkingCommands();

    let report = '';

    report += '╔════════════════════════════════════╗\n';
    report += '║   CALOS Command Health Dashboard   ║\n';
    report += '╠════════════════════════════════════╣\n';
    report += `║ Total Commands:    ${String(stats.totalCommands).padStart(3)}            ║\n`;
    report += `║ Working:           ${String(stats.workingCommands).padStart(3)} (${stats.workingCommands > 0 ? Math.round(stats.workingCommands / stats.totalCommands * 100) : 0}%)     ║\n`;
    report += `║ Failing:           ${String(stats.failingCommands).padStart(3)} (${stats.failingCommands > 0 ? Math.round(stats.failingCommands / stats.totalCommands * 100) : 0}%)     ║\n`;
    report += `║ Never Tested:      ${String(stats.neverTested).padStart(3)} (${stats.neverTested > 0 ? Math.round(stats.neverTested / stats.totalCommands * 100) : 0}%)     ║\n`;
    report += '╠════════════════════════════════════╣\n';
    report += `║ Overall Pass Rate: ${stats.passRate.padEnd(16)} ║\n`;
    report += '╠════════════════════════════════════╣\n';

    if (failing.length > 0) {
      report += '║ Recently Failed:                   ║\n';
      for (const cmd of failing.slice(0, 3)) {
        const name = cmd.testId.substring(0, 30);
        report += `║   • ${name.padEnd(31)} ║\n`;
      }
    }

    if (working.length > 0) {
      report += '║                                    ║\n';
      report += '║ Working Commands:                  ║\n';
      for (const cmd of working.slice(0, 3)) {
        const name = cmd.testId.substring(0, 30);
        report += `║   ✓ ${name.padEnd(31)} ║\n`;
      }
    }

    report += '╚════════════════════════════════════╝\n';

    return report;
  }

  /**
   * Reset all verification data
   */
  async reset() {
    this.results = {
      commands: {},
      lastUpdate: null,
      totalTests: 0,
      totalPassed: 0,
      totalFailed: 0
    };

    await this.saveResults();
  }
}

module.exports = CommandVerifier;

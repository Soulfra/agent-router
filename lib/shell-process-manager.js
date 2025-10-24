/**
 * Shell Process Manager
 *
 * Tracks background processes (shells/jobs) like CalRiven does autonomous research.
 * Monitors running/completed/failed/orphaned/zombie processes.
 *
 * Pattern: Process mining - like Kubernetes pods, systemd services, Docker containers
 *
 * Features:
 * - Track all background processes (running, completed, failed, orphaned, zombie, killed)
 * - Monitor resource usage (CPU, memory, elapsed time)
 * - Detect gates/time sinks (stuck processes, no output for X seconds)
 * - Automatic cleanup (kill orphans, reap zombies)
 * - Alert on anomalies (unexpected failures, memory leaks)
 *
 * Usage:
 *   const manager = new ShellProcessManager();
 *
 *   // Track a process
 *   const jobId = await manager.track('npm start', {
 *     description: 'Start server',
 *     timeout: 300000
 *   });
 *
 *   // Get status
 *   const status = await manager.getStatus(jobId);
 *   // { state: 'running', elapsed: 15000, cpu: 2.5, memory: 45.2 }
 *
 *   // List all
 *   const all = await manager.listAll();
 *
 *   // Kill stuck process
 *   await manager.kill(jobId);
 *
 *   // Cleanup orphans/zombies
 *   await manager.cleanup();
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class ShellProcessManager {
  constructor(options = {}) {
    this.config = {
      checkInterval: options.checkInterval || 5000,    // Check every 5s
      stuckThreshold: options.stuckThreshold || 60000, // 60s with no output = stuck
      zombieThreshold: options.zombieThreshold || 300000, // 5min in completed state = zombie
      maxProcesses: options.maxProcesses || 100,       // Max tracked processes
      autoCleanup: options.autoCleanup !== false,      // Auto cleanup on interval
      logToConsole: options.logToConsole !== false
    };

    // Process registry
    this.processes = new Map(); // jobId → process metadata

    // Start monitoring
    if (this.config.autoCleanup) {
      this.monitorInterval = setInterval(() => this._monitorProcesses(), this.config.checkInterval);
    }

    console.log('[ShellProcessManager] Initialized (check interval: ' + this.config.checkInterval + 'ms)');
  }

  /**
   * Track a background process
   */
  async track(command, options = {}) {
    const jobId = this._generateJobId();

    const process = {
      id: jobId,
      command: command,
      description: options.description || command,

      // State tracking
      state: 'initializing', // initializing, running, completed, failed, killed, orphaned, zombie
      pid: null,
      exitCode: null,

      // Timing
      startTime: Date.now(),
      endTime: null,
      lastOutputTime: Date.now(),

      // Resources
      cpu: 0,
      memory: 0,

      // Output
      stdout: [],
      stderr: [],
      outputSize: 0,
      maxOutputSize: options.maxOutputSize || 1024 * 1024, // 1MB

      // Monitoring
      timeout: options.timeout || null,
      expectedDuration: options.expectedDuration || null,
      stuckWarningIssued: false,

      // Metadata
      tags: options.tags || [],
      user: options.user || 'system',
      createdAt: new Date().toISOString()
    };

    this.processes.set(jobId, process);

    // Start the process
    try {
      await this._startProcess(jobId, command, options);
    } catch (error) {
      process.state = 'failed';
      process.exitCode = -1;
      process.endTime = Date.now();
      console.error(`[ShellProcessManager] Failed to start job ${jobId}:`, error.message);
    }

    return jobId;
  }

  /**
   * Start the actual process
   */
  async _startProcess(jobId, command, options) {
    const process = this.processes.get(jobId);

    const child = spawn('/bin/sh', ['-c', command], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      detached: options.detached !== false // Detach by default
    });

    process.pid = child.pid;
    process.state = 'running';
    process.child = child;

    // Track output
    child.stdout.on('data', (data) => {
      this._handleOutput(jobId, 'stdout', data);
    });

    child.stderr.on('data', (data) => {
      this._handleOutput(jobId, 'stderr', data);
    });

    // Track completion
    child.on('close', (code, signal) => {
      this._handleExit(jobId, code, signal);
    });

    child.on('error', (error) => {
      this._handleError(jobId, error);
    });

    console.log(`[ShellProcessManager] Started job ${jobId} (pid: ${child.pid}, command: "${command}")`);
  }

  /**
   * Handle process output
   */
  _handleOutput(jobId, stream, data) {
    const process = this.processes.get(jobId);
    if (!process) return;

    const text = data.toString();

    // Update last output time (detect stuck processes)
    process.lastOutputTime = Date.now();
    process.stuckWarningIssued = false;

    // Store output (with size limit)
    if (process.outputSize < process.maxOutputSize) {
      process[stream].push({
        timestamp: Date.now(),
        data: text
      });
      process.outputSize += text.length;
    }

    // Log if enabled
    if (this.config.logToConsole) {
      console.log(`[Job ${jobId}/${stream}] ${text.trim()}`);
    }
  }

  /**
   * Handle process exit
   */
  _handleExit(jobId, code, signal) {
    const process = this.processes.get(jobId);
    if (!process) return;

    process.endTime = Date.now();
    process.exitCode = code;
    process.signal = signal;

    if (code === 0) {
      process.state = 'completed';
      console.log(`[ShellProcessManager] Job ${jobId} completed (elapsed: ${process.endTime - process.startTime}ms)`);
    } else {
      process.state = 'failed';
      console.error(`[ShellProcessManager] Job ${jobId} failed (code: ${code}, signal: ${signal})`);
    }
  }

  /**
   * Handle process error
   */
  _handleError(jobId, error) {
    const process = this.processes.get(jobId);
    if (!process) return;

    process.state = 'failed';
    process.error = error.message;
    process.endTime = Date.now();

    console.error(`[ShellProcessManager] Job ${jobId} error:`, error.message);
  }

  /**
   * Get process status
   */
  async getStatus(jobId) {
    const process = this.processes.get(jobId);
    if (!process) {
      throw new Error(`Process ${jobId} not found`);
    }

    // Update resource usage for running processes
    if (process.state === 'running' && process.pid) {
      await this._updateResourceUsage(process);
    }

    return {
      id: process.id,
      state: process.state,
      command: process.command,
      description: process.description,
      pid: process.pid,

      // Timing
      elapsed: process.endTime ? (process.endTime - process.startTime) : (Date.now() - process.startTime),
      startTime: process.startTime,
      endTime: process.endTime,

      // Resources
      cpu: process.cpu,
      memory: process.memory,

      // Output
      stdoutLines: process.stdout.length,
      stderrLines: process.stderr.length,
      lastOutput: process.lastOutputTime,

      // Status flags
      isStuck: this._isStuck(process),
      isTimedOut: this._isTimedOut(process),
      isZombie: this._isZombie(process),

      // Metadata
      exitCode: process.exitCode,
      signal: process.signal,
      error: process.error,
      tags: process.tags,
      user: process.user
    };
  }

  /**
   * Get process output
   */
  async getOutput(jobId, options = {}) {
    const process = this.processes.get(jobId);
    if (!process) {
      throw new Error(`Process ${jobId} not found`);
    }

    const stream = options.stream || 'both'; // stdout, stderr, or both
    const tail = options.tail || null; // Last N lines
    const since = options.since || null; // Since timestamp

    let output = [];

    if (stream === 'stdout' || stream === 'both') {
      output = output.concat(process.stdout);
    }

    if (stream === 'stderr' || stream === 'both') {
      output = output.concat(process.stderr);
    }

    // Filter by time
    if (since) {
      output = output.filter(o => o.timestamp >= since);
    }

    // Sort by time
    output.sort((a, b) => a.timestamp - b.timestamp);

    // Tail
    if (tail) {
      output = output.slice(-tail);
    }

    return output.map(o => ({
      timestamp: o.timestamp,
      data: o.data
    }));
  }

  /**
   * List all processes
   */
  async listAll(filter = {}) {
    const processes = Array.from(this.processes.values());

    let filtered = processes;

    // Filter by state
    if (filter.state) {
      filtered = filtered.filter(p => p.state === filter.state);
    }

    // Filter by user
    if (filter.user) {
      filtered = filtered.filter(p => p.user === filter.user);
    }

    // Filter by tags
    if (filter.tags) {
      filtered = filtered.filter(p =>
        filter.tags.every(tag => p.tags.includes(tag))
      );
    }

    // Update resource usage for running processes
    for (const process of filtered) {
      if (process.state === 'running' && process.pid) {
        await this._updateResourceUsage(process);
      }
    }

    return filtered.map(p => ({
      id: p.id,
      state: p.state,
      command: p.command,
      description: p.description,
      pid: p.pid,
      elapsed: p.endTime ? (p.endTime - p.startTime) : (Date.now() - p.startTime),
      cpu: p.cpu,
      memory: p.memory,
      isStuck: this._isStuck(p),
      isTimedOut: this._isTimedOut(p),
      isZombie: this._isZombie(p),
      exitCode: p.exitCode,
      tags: p.tags,
      user: p.user
    }));
  }

  /**
   * Kill a process
   */
  async kill(jobId, signal = 'SIGTERM') {
    const process = this.processes.get(jobId);
    if (!process) {
      throw new Error(`Process ${jobId} not found`);
    }

    if (process.state !== 'running') {
      throw new Error(`Process ${jobId} is not running (state: ${process.state})`);
    }

    if (!process.pid) {
      throw new Error(`Process ${jobId} has no PID`);
    }

    try {
      // Kill process group (including children)
      process.kill(-process.pid, signal);

      process.state = 'killed';
      process.endTime = Date.now();
      process.signal = signal;

      console.log(`[ShellProcessManager] Killed job ${jobId} (signal: ${signal})`);

      return true;
    } catch (error) {
      console.error(`[ShellProcessManager] Failed to kill job ${jobId}:`, error.message);
      return false;
    }
  }

  /**
   * Cleanup orphans, zombies, old completed jobs
   */
  async cleanup(options = {}) {
    const maxAge = options.maxAge || this.config.zombieThreshold;
    const now = Date.now();

    let cleaned = 0;

    for (const [jobId, process] of this.processes.entries()) {
      let shouldRemove = false;

      // Remove old completed/failed jobs
      if (['completed', 'failed', 'killed'].includes(process.state)) {
        if (process.endTime && (now - process.endTime) > maxAge) {
          shouldRemove = true;
        }
      }

      // Detect orphaned processes (PID no longer exists)
      if (process.state === 'running' && process.pid) {
        const exists = await this._pidExists(process.pid);
        if (!exists) {
          process.state = 'orphaned';
          process.endTime = now;
          shouldRemove = true;
        }
      }

      // Detect zombies (completed but not reaped)
      if (this._isZombie(process)) {
        shouldRemove = true;
      }

      if (shouldRemove) {
        this.processes.delete(jobId);
        cleaned++;
      }
    }

    console.log(`[ShellProcessManager] Cleanup: removed ${cleaned} processes`);

    return cleaned;
  }

  /**
   * Monitor processes (background task)
   */
  async _monitorProcesses() {
    const now = Date.now();

    for (const [jobId, process] of this.processes.entries()) {
      // Check for stuck processes
      if (this._isStuck(process) && !process.stuckWarningIssued) {
        console.warn(`[ShellProcessManager] ⚠️  Job ${jobId} appears stuck (no output for ${(now - process.lastOutputTime) / 1000}s)`);
        process.stuckWarningIssued = true;
      }

      // Check for timeouts
      if (this._isTimedOut(process) && process.state === 'running') {
        console.warn(`[ShellProcessManager] ⚠️  Job ${jobId} timed out (${(now - process.startTime) / 1000}s > ${process.timeout / 1000}s)`);
        await this.kill(jobId, 'SIGKILL');
      }

      // Update resource usage
      if (process.state === 'running' && process.pid) {
        await this._updateResourceUsage(process);
      }
    }

    // Auto cleanup if enabled
    if (this.config.autoCleanup) {
      await this.cleanup();
    }
  }

  /**
   * Update resource usage for a process
   */
  async _updateResourceUsage(process) {
    if (!process.pid) return;

    try {
      const { stdout } = await execAsync(`ps -p ${process.pid} -o %cpu,%mem`);
      const lines = stdout.trim().split('\n');
      if (lines.length > 1) {
        const [cpu, mem] = lines[1].trim().split(/\s+/).map(parseFloat);
        process.cpu = cpu || 0;
        process.memory = mem || 0;
      }
    } catch (error) {
      // Process may have exited
      process.cpu = 0;
      process.memory = 0;
    }
  }

  /**
   * Check if PID exists
   */
  async _pidExists(pid) {
    try {
      await execAsync(`ps -p ${pid}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if process is stuck (no output for threshold)
   */
  _isStuck(process) {
    if (process.state !== 'running') return false;
    const now = Date.now();
    return (now - process.lastOutputTime) > this.config.stuckThreshold;
  }

  /**
   * Check if process timed out
   */
  _isTimedOut(process) {
    if (!process.timeout) return false;
    if (process.state !== 'running') return false;
    const now = Date.now();
    return (now - process.startTime) > process.timeout;
  }

  /**
   * Check if process is zombie
   */
  _isZombie(process) {
    if (!['completed', 'failed', 'killed'].includes(process.state)) return false;
    if (!process.endTime) return false;
    const now = Date.now();
    return (now - process.endTime) > this.config.zombieThreshold;
  }

  /**
   * Generate unique job ID
   */
  _generateJobId() {
    return 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get stats
   */
  getStats() {
    const processes = Array.from(this.processes.values());

    const stats = {
      total: processes.length,
      running: processes.filter(p => p.state === 'running').length,
      completed: processes.filter(p => p.state === 'completed').length,
      failed: processes.filter(p => p.state === 'failed').length,
      killed: processes.filter(p => p.state === 'killed').length,
      orphaned: processes.filter(p => p.state === 'orphaned').length,
      stuck: processes.filter(p => this._isStuck(p)).length,
      timedOut: processes.filter(p => this._isTimedOut(p)).length,
      zombies: processes.filter(p => this._isZombie(p)).length
    };

    return stats;
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }
}

module.exports = ShellProcessManager;

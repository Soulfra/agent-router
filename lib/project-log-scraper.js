/**
 * Project Log Scraper
 *
 * Scrapes stdout/stderr from temporary pipeline runs into permanent database storage.
 * Preserves ANSI colors, generates syntax-highlighted HTML for exports.
 *
 * Features:
 * - Monitor /tmp pipeline executions
 * - Capture stdout/stderr with ANSI color preservation
 * - Parse log levels (info, warn, error)
 * - Generate syntax-highlighted HTML
 * - Store in project_session_logs table
 */

const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const ansiHTML = require('ansi-html-community');
const stripAnsi = require('strip-ansi');

// Configure ansi-html colors
ansiHTML.setColors({
  reset: ['FFFFFF', '000000'],
  black: '000000',
  red: 'ef4444',
  green: '10b981',
  yellow: 'f59e0b',
  blue: '3b82f6',
  magenta: 'ec4899',
  cyan: '06b6d4',
  lightgrey: 'd1d5db',
  darkgrey: '6b7280'
});

class ProjectLogScraper {
  constructor(db, config = {}) {
    this.db = db;

    // Configuration
    this.config = {
      maxBufferSize: config.maxBufferSize || 10 * 1024 * 1024, // 10MB
      colorScheme: config.colorScheme || 'github-dark',
      defaultShell: config.defaultShell || '/bin/bash',
      captureInterval: config.captureInterval || 100, // ms
      autoDetectSyntax: config.autoDetectSyntax !== false
    };

    // Active monitors
    this.activeMonitors = new Map();

    // Stats
    this.stats = {
      logs_scraped: 0,
      bytes_captured: 0,
      errors_detected: 0,
      avg_duration_ms: 0
    };
  }

  /**
   * Execute command and scrape logs to database
   *
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} - Execution result with log_id
   */
  async executeAndScrape(options) {
    const {
      command,
      args = [],
      cwd = '/tmp',
      transcriptionId = null,
      projectId,
      userId,
      pipelineJobId = null,
      pipelineStage = 'unknown',
      syntaxLanguage = null,
      env = {}
    } = options;

    const logId = uuidv4();
    const startTime = Date.now();

    // Buffers for output
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let exitCode = null;

    // Performance tracking
    let memoryPeakMb = 0;
    const memoryInterval = setInterval(() => {
      const usage = process.memoryUsage();
      const currentMb = usage.heapUsed / 1024 / 1024;
      if (currentMb > memoryPeakMb) {
        memoryPeakMb = currentMb;
      }
    }, 500);

    console.log(`[ProjectLogScraper] Executing: ${command} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      // Spawn process
      const proc = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        shell: this.config.defaultShell
      });

      // Monitor stdout
      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdoutBuffer += chunk;

        // Prevent buffer overflow
        if (stdoutBuffer.length > this.config.maxBufferSize) {
          stdoutBuffer = stdoutBuffer.slice(-this.config.maxBufferSize);
          console.warn(`[ProjectLogScraper] stdout buffer exceeded ${this.config.maxBufferSize} bytes, truncating...`);
        }
      });

      // Monitor stderr
      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderrBuffer += chunk;

        if (stderrBuffer.length > this.config.maxBufferSize) {
          stderrBuffer = stderrBuffer.slice(-this.config.maxBufferSize);
          console.warn(`[ProjectLogScraper] stderr buffer exceeded ${this.config.maxBufferSize} bytes, truncating...`);
        }
      });

      // Handle completion
      proc.on('close', async (code) => {
        clearInterval(memoryInterval);
        exitCode = code;

        const durationMs = Date.now() - startTime;

        console.log(`[ProjectLogScraper] Command completed with exit code ${exitCode} in ${durationMs}ms`);

        try {
          // Analyze logs
          const analysis = this.analyzeLogs(stdoutBuffer, stderrBuffer);

          // Auto-detect syntax if not provided
          const detectedSyntax = syntaxLanguage || (
            this.config.autoDetectSyntax ? this.detectSyntax(command, stdoutBuffer) : null
          );

          // Generate syntax-highlighted HTML
          const stdoutHTML = this.generateHighlightedHTML(stdoutBuffer, detectedSyntax);
          const stderrHTML = this.generateHighlightedHTML(stderrBuffer, detectedSyntax);

          // Store in database
          const result = await this.db.query(`
            INSERT INTO project_session_logs (
              log_id, transcription_id, project_id, user_id,
              pipeline_job_id, pipeline_stage, command_executed, working_directory,
              stdout_raw, stderr_raw, stdout_ansi, stderr_ansi, exit_code,
              log_level, error_count, warning_count,
              syntax_language, highlighted_html, color_scheme,
              duration_ms, memory_peak_mb,
              started_at, completed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
            RETURNING log_id, created_at
          `, [
            logId,
            transcriptionId,
            projectId,
            userId,
            pipelineJobId,
            pipelineStage,
            `${command} ${args.join(' ')}`,
            cwd,
            stripAnsi(stdoutBuffer), // Raw (no ANSI)
            stripAnsi(stderrBuffer),
            stdoutBuffer,  // ANSI preserved
            stderrBuffer,
            exitCode,
            analysis.logLevel,
            analysis.errorCount,
            analysis.warningCount,
            detectedSyntax,
            stdoutHTML, // Syntax-highlighted HTML
            this.config.colorScheme,
            durationMs,
            memoryPeakMb.toFixed(2),
            new Date(startTime).toISOString(),
            new Date().toISOString()
          ]);

          // Update stats
          this.stats.logs_scraped++;
          this.stats.bytes_captured += stdoutBuffer.length + stderrBuffer.length;
          this.stats.errors_detected += analysis.errorCount;
          this.stats.avg_duration_ms = (this.stats.avg_duration_ms * (this.stats.logs_scraped - 1) + durationMs) / this.stats.logs_scraped;

          console.log(`[ProjectLogScraper] Log stored: ${logId} (${stdoutBuffer.length + stderrBuffer.length} bytes, ${analysis.errorCount} errors)`);

          resolve({
            success: exitCode === 0,
            log_id: logId,
            exit_code: exitCode,
            duration_ms: durationMs,
            stdout: stdoutBuffer,
            stderr: stderrBuffer,
            analysis,
            created_at: result.rows[0].created_at
          });

        } catch (error) {
          console.error('[ProjectLogScraper] Failed to store logs:', error);
          reject(error);
        }
      });

      // Handle errors
      proc.on('error', (error) => {
        clearInterval(memoryInterval);
        console.error('[ProjectLogScraper] Process error:', error);
        reject(error);
      });

      // Store process reference for potential cancellation
      this.activeMonitors.set(logId, proc);
    });
  }

  /**
   * Analyze logs for errors, warnings, and log level
   */
  analyzeLogs(stdout, stderr) {
    // Count errors
    const errorPatterns = [
      /\berror\b/gi,
      /\bfailed\b/gi,
      /\bexception\b/gi,
      /\bfatal\b/gi,
      /\bpanic\b/gi
    ];

    const warningPatterns = [
      /\bwarning\b/gi,
      /\bwarn\b/gi,
      /\bdeprecated\b/gi,
      /\bcaution\b/gi
    ];

    let errorCount = 0;
    let warningCount = 0;

    const combinedOutput = stdout + stderr;

    for (const pattern of errorPatterns) {
      const matches = combinedOutput.match(pattern);
      if (matches) {
        errorCount += matches.length;
      }
    }

    for (const pattern of warningPatterns) {
      const matches = combinedOutput.match(pattern);
      if (matches) {
        warningCount += matches.length;
      }
    }

    // Determine log level
    let logLevel = 'info';
    if (errorCount > 0) {
      logLevel = 'error';
    } else if (warningCount > 0) {
      logLevel = 'warning';
    } else if (/\bsuccess\b/gi.test(combinedOutput)) {
      logLevel = 'success';
    }

    return {
      errorCount,
      warningCount,
      logLevel
    };
  }

  /**
   * Auto-detect syntax language from command
   */
  detectSyntax(command, output) {
    // Command-based detection
    if (command.includes('node') || command.includes('npm') || command.includes('yarn')) {
      return 'javascript';
    }
    if (command.includes('python')) {
      return 'python';
    }
    if (command.includes('bash') || command.includes('sh')) {
      return 'bash';
    }
    if (command.includes('git')) {
      return 'diff';
    }

    // Output-based detection
    if (output.includes('#!/usr/bin/env node') || output.includes('#!/usr/bin/env python')) {
      return output.includes('python') ? 'python' : 'javascript';
    }

    return 'bash'; // Default
  }

  /**
   * Generate syntax-highlighted HTML from ANSI output
   */
  generateHighlightedHTML(ansiText, syntaxLanguage) {
    if (!ansiText || ansiText.trim().length === 0) {
      return '';
    }

    // Convert ANSI colors to HTML
    const html = ansiHTML(ansiText);

    // Wrap in pre/code tags with syntax class
    const syntaxClass = syntaxLanguage ? `language-${syntaxLanguage}` : '';
    return `<pre class="${syntaxClass}"><code>${html}</code></pre>`;
  }

  /**
   * Get log by ID
   */
  async getLog(logId) {
    const result = await this.db.query(`
      SELECT
        psl.*,
        pc.project_name, pc.brand_name, pc.brand_color,
        u.username
      FROM project_session_logs psl
      LEFT JOIN project_contexts pc ON psl.project_id = pc.project_id
      LEFT JOIN users u ON psl.user_id = u.user_id
      WHERE psl.log_id = $1
    `, [logId]);

    return result.rows[0] || null;
  }

  /**
   * Get logs for transcription
   */
  async getTranscriptionLogs(transcriptionId) {
    const result = await this.db.query(`
      SELECT
        log_id, pipeline_stage, command_executed,
        exit_code, log_level, error_count, warning_count,
        duration_ms, created_at
      FROM project_session_logs
      WHERE transcription_id = $1
      ORDER BY created_at ASC
    `, [transcriptionId]);

    return result.rows;
  }

  /**
   * Get logs for project
   */
  async getProjectLogs(projectId, options = {}) {
    const limit = options.limit || 50;
    const logLevel = options.logLevel || null; // 'error', 'warning', 'success', 'info'

    const query = logLevel
      ? `SELECT * FROM project_session_logs WHERE project_id = $1 AND log_level = $2 ORDER BY created_at DESC LIMIT $3`
      : `SELECT * FROM project_session_logs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`;

    const params = logLevel ? [projectId, logLevel, limit] : [projectId, limit];

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Cancel running process
   */
  async cancelLog(logId) {
    const proc = this.activeMonitors.get(logId);
    if (proc) {
      proc.kill('SIGTERM');
      this.activeMonitors.delete(logId);
      console.log(`[ProjectLogScraper] Cancelled process: ${logId}`);
      return true;
    }
    return false;
  }

  /**
   * Get scraper stats
   */
  getStats() {
    return {
      ...this.stats,
      active_monitors: this.activeMonitors.size,
      avg_duration_seconds: (this.stats.avg_duration_ms / 1000).toFixed(2),
      total_bytes_mb: (this.stats.bytes_captured / 1024 / 1024).toFixed(2)
    };
  }
}

module.exports = ProjectLogScraper;

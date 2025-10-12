/**
 * Log Aggregator
 * Captures and parses logs from Ollama, CalOS, and other sources
 *
 * Fixes: Logs going to terminal instead of database
 * Parses: Colors (green=200, cyan=POST), levels (WARN, INFO), structured data
 */

const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

// ANSI color code regex
const COLOR_REGEX = /\x1b\[[0-9;]*m/g;

// Path to local database
const DB_PATH = path.join(process.env.HOME, '.deathtodata/local.db');

class LogAggregator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sources = new Map();
    this.buffer = [];
    this.maxBufferSize = options.maxBufferSize || 1000;
  }

  /**
   * Register a log source
   * @param {string} name - Source name (e.g., 'ollama', 'calos')
   * @param {object} process - Child process to monitor
   */
  registerSource(name, process) {
    this.sources.set(name, {
      process,
      lastSeen: new Date()
    });

    // Capture stdout
    process.stdout.on('data', (data) => {
      this._handleLog(name, data.toString(), 'INFO');
    });

    // Capture stderr
    process.stderr.on('data', (data) => {
      this._handleLog(name, data.toString(), 'ERROR');
    });

    console.log(`📊 Log aggregator registered source: ${name}`);
  }

  /**
   * Parse Ollama/GIN log format
   * Example: [GIN] 2025/10/10 - 14:37:41 | 200 | 34.153198958s | 127.0.0.1 | POST "/api/generate"
   */
  _parseGinLog(line) {
    const ginRegex = /\[GIN\]\s+(\d{4}\/\d{2}\/\d{2}\s+-\s+\d{2}:\d{2}:\d{2})\s+\|\s+(\d+)\s+\|\s+([\d.]+[a-zµ]+)\s+\|\s+([\d.]+)\s+\|\s+(\w+)\s+"([^"]+)"/;
    const match = line.match(ginRegex);

    if (match) {
      return {
        type: 'http_request',
        timestamp: match[1],
        status: parseInt(match[2]),
        duration: match[3],
        ip: match[4],
        method: match[5],
        path: match[6]
      };
    }

    return null;
  }

  /**
   * Parse Ollama log level format
   * Example: time=2025-10-10T14:39:33.522-04:00 level=WARN source=runner.go:128 msg="truncating input prompt"
   */
  _parseOllamaLog(line) {
    const ollamaRegex = /time=([^\s]+)\s+level=(\w+)\s+source=([^\s]+)\s+msg="([^"]+)"(.*)$/;
    const match = line.match(ollamaRegex);

    if (match) {
      const additional = {};

      // Parse additional key=value pairs
      const extraData = match[5];
      const kvRegex = /(\w+)=(\d+)/g;
      let kvMatch;
      while ((kvMatch = kvRegex.exec(extraData)) !== null) {
        additional[kvMatch[1]] = parseInt(kvMatch[2]);
      }

      return {
        type: 'ollama_log',
        timestamp: match[1],
        level: match[2],
        source: match[3],
        message: match[4],
        ...additional
      };
    }

    return null;
  }

  /**
   * Detect error patterns
   * @param {string} line - Log line
   * @returns {object|null} - Error pattern or null
   */
  _detectErrorPattern(line) {
    const patterns = [
      {
        regex: /broken pipe/i,
        type: 'broken_pipe',
        severity: 'error',
        autoFix: 'retry'
      },
      {
        regex: /truncating input prompt.*limit=(\d+)\s+prompt=(\d+)/,
        type: 'prompt_truncation',
        severity: 'warning',
        autoFix: 'chunk',
        extract: (match) => ({
          limit: parseInt(match[1]),
          prompt: parseInt(match[2]),
          truncated: parseInt(match[2]) - parseInt(match[1])
        })
      },
      {
        regex: /timeout/i,
        type: 'timeout',
        severity: 'error',
        autoFix: 'increase_timeout'
      },
      {
        regex: /rate limit/i,
        type: 'rate_limit',
        severity: 'warning',
        autoFix: 'exponential_backoff'
      }
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const error = {
          type: pattern.type,
          severity: pattern.severity,
          autoFix: pattern.autoFix,
          rawLine: line
        };

        if (pattern.extract) {
          Object.assign(error, pattern.extract(match));
        }

        return error;
      }
    }

    return null;
  }

  /**
   * Handle incoming log line
   * @param {string} source - Source name
   * @param {string} data - Raw log data
   * @param {string} defaultLevel - Default log level
   */
  _handleLog(source, data, defaultLevel = 'INFO') {
    const lines = data.split('\n').filter(l => l.trim());

    for (const rawLine of lines) {
      // Remove ANSI color codes
      const line = rawLine.replace(COLOR_REGEX, '');

      // Parse different log formats
      let structured = this._parseGinLog(line) || this._parseOllamaLog(line);

      // Detect errors
      const errorPattern = this._detectErrorPattern(line);

      if (errorPattern) {
        this._handleError(source, errorPattern);
      }

      // Determine log level
      let level = defaultLevel;
      if (structured && structured.level) {
        level = structured.level;
      } else if (line.includes('ERROR') || line.includes('error')) {
        level = 'ERROR';
      } else if (line.includes('WARN') || line.includes('warning')) {
        level = 'WARN';
      }

      // Create log entry
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        source,
        message: line.substring(0, 500), // Limit message length
        structured: structured ? JSON.stringify(structured) : null,
        context: null
      };

      // Add to buffer
      this.buffer.push(entry);

      // Emit event
      this.emit('log', entry);

      // Flush if buffer is full
      if (this.buffer.length >= this.maxBufferSize) {
        this.flush();
      }
    }
  }

  /**
   * Handle detected error pattern
   * @param {string} source - Source name
   * @param {object} error - Error pattern
   */
  async _handleError(source, error) {
    // Store in error_patterns table
    await this._storeErrorPattern(error);

    // Emit error event
    this.emit('error_detected', {
      source,
      ...error
    });

    // Log to console
    console.error(`⚠️  Error detected: ${error.type} (${source})`);
    if (error.autoFix) {
      console.log(`💡 Suggested fix: ${error.autoFix}`);
    }
  }

  /**
   * Store error pattern in database
   * @param {object} error - Error pattern
   */
  async _storeErrorPattern(error) {
    const sql = `
      INSERT INTO error_patterns (error_type, count, first_seen, last_seen, auto_fix)
      VALUES ('${error.type}', 1, datetime('now'), datetime('now'), '${error.autoFix || ''}')
      ON CONFLICT(error_type) DO UPDATE SET
        count = count + 1,
        last_seen = datetime('now');
    `;

    return new Promise((resolve, reject) => {
      const proc = spawn('sqlite3', [DB_PATH, sql]);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to store error pattern: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Flush buffer to database
   */
  async flush() {
    if (this.buffer.length === 0) {
      return;
    }

    const entries = [...this.buffer];
    this.buffer = [];

    // Build batch insert SQL
    const values = entries.map(entry => {
      const structured = entry.structured ? entry.structured.replace(/'/g, "''") : '';
      const message = entry.message.replace(/'/g, "''");

      return `('${entry.timestamp}', '${entry.level}', '${entry.source}', '${message}', '${structured}', NULL)`;
    }).join(',\n');

    const sql = `
      INSERT INTO log_entries (timestamp, level, source, message, structured, context)
      VALUES ${values};
    `;

    return new Promise((resolve, reject) => {
      const proc = spawn('sqlite3', [DB_PATH, sql]);

      proc.on('close', (code) => {
        if (code === 0) {
          this.emit('flushed', entries.length);
          resolve();
        } else {
          // Put entries back in buffer on failure
          this.buffer.unshift(...entries);
          reject(new Error(`Failed to flush logs: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        this.buffer.unshift(...entries);
        reject(error);
      });
    });
  }

  /**
   * Get recent error patterns
   * @param {number} limit - Number of patterns to return
   * @returns {Promise<Array>} - Array of error patterns
   */
  async getErrorPatterns(limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT error_type, count, first_seen, last_seen, auto_fix, success_rate
        FROM error_patterns
        ORDER BY count DESC
        LIMIT ${limit};
      `;

      const proc = spawn('sqlite3', ['-header', '-json', DB_PATH, sql]);

      let stdout = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const patterns = JSON.parse(stdout || '[]');
            resolve(patterns);
          } catch (error) {
            resolve([]);
          }
        } else {
          reject(new Error(`Failed to get error patterns: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get log statistics
   * @returns {Promise<object>} - Statistics
   */
  async getStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          COUNT(*) as total_logs,
          SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) as errors,
          SUM(CASE WHEN level = 'WARN' THEN 1 ELSE 0 END) as warnings,
          SUM(CASE WHEN level = 'INFO' THEN 1 ELSE 0 END) as info
        FROM log_entries;
      `;

      const proc = spawn('sqlite3', ['-header', '-json', DB_PATH, sql]);

      let stdout = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const stats = JSON.parse(stdout || '[{}]')[0];
            resolve(stats);
          } catch (error) {
            resolve({});
          }
        } else {
          reject(new Error(`Failed to get stats: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Start auto-flush interval
   * @param {number} interval - Flush interval in milliseconds
   */
  startAutoFlush(interval = 5000) {
    this.flushInterval = setInterval(() => {
      this.flush().catch(err => {
        console.error('Auto-flush error:', err.message);
      });
    }, interval);
  }

  /**
   * Stop auto-flush
   */
  stopAutoFlush() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Cleanup
   */
  async cleanup() {
    this.stopAutoFlush();
    await this.flush();
  }
}

module.exports = LogAggregator;

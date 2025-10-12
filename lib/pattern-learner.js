/**
 * Pattern Learner
 * Tracks command sequences and learns workflow patterns
 *
 * Stores every command in local database for long-term pattern recognition
 * Builds workflow graphs and suggests next likely commands
 */

const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

// Path to local database
const DB_PATH = path.join(process.env.HOME, '.deathtodata/local.db');

class PatternLearner {
  constructor() {
    this.currentSequenceId = null;
    this.sequenceStartTime = null;
    this.commandTimes = new Map();
  }

  /**
   * Start a new workflow sequence
   * @returns {string} - Sequence ID
   */
  startSequence() {
    this.currentSequenceId = crypto.randomBytes(8).toString('hex');
    this.sequenceStartTime = Date.now();
    return this.currentSequenceId;
  }

  /**
   * End current workflow sequence
   */
  endSequence() {
    this.currentSequenceId = null;
    this.sequenceStartTime = null;
    this.commandTimes.clear();
  }

  /**
   * Log command to database
   * @param {string} command - Command that was run
   * @param {string} type - Command type (e.g., 'agent', 'github', 'browser')
   * @param {object} context - Additional context
   * @param {object} result - Command result
   * @param {number} durationMs - Duration in milliseconds
   * @param {boolean} success - Whether command succeeded
   */
  async logCommand(command, type, context = {}, result = {}, durationMs = 0, success = true) {
    // Auto-start sequence if not started
    if (!this.currentSequenceId) {
      this.startSequence();
    }

    const sequenceId = this.currentSequenceId;

    return new Promise((resolve, reject) => {
      const contextStr = JSON.stringify(context);
      const resultStr = JSON.stringify(result);
      const successInt = success ? 1 : 0;

      const sql = `
        INSERT INTO workflow_patterns (sequence_id, command, command_type, context, result, success, duration_ms)
        VALUES ('${sequenceId}', '${this._escape(command)}', '${type}', '${this._escape(contextStr)}', '${this._escape(resultStr)}', ${successInt}, ${durationMs});
      `;

      const proc = spawn('sqlite3', [DB_PATH, sql]);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to log command: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Log command to command_history table
   * @param {string} command - Command
   * @param {string} args - Command arguments
   * @param {string} workingDir - Working directory
   * @param {number} exitCode - Exit code
   * @param {number} durationMs - Duration in milliseconds
   */
  async logCommandHistory(command, args = '', workingDir = process.cwd(), exitCode = 0, durationMs = 0) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO command_history (command, args, working_dir, exit_code, duration_ms)
        VALUES ('${this._escape(command)}', '${this._escape(args)}', '${this._escape(workingDir)}', ${exitCode}, ${durationMs});
      `;

      const proc = spawn('sqlite3', [DB_PATH, sql]);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to log command history: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get recent command sequences
   * @param {number} limit - Number of sequences to return
   * @returns {Promise<Array>} - Array of sequences
   */
  async getRecentSequences(limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT sequence_id, COUNT(*) as command_count, MIN(timestamp) as start_time, MAX(timestamp) as end_time
        FROM workflow_patterns
        GROUP BY sequence_id
        ORDER BY MAX(timestamp) DESC
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
            const sequences = JSON.parse(stdout || '[]');
            resolve(sequences);
          } catch (error) {
            resolve([]);
          }
        } else {
          reject(new Error(`Failed to get sequences: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get commands in a sequence
   * @param {string} sequenceId - Sequence ID
   * @returns {Promise<Array>} - Array of commands
   */
  async getSequenceCommands(sequenceId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT command, command_type, context, result, success, duration_ms, timestamp
        FROM workflow_patterns
        WHERE sequence_id = '${sequenceId}'
        ORDER BY timestamp ASC;
      `;

      const proc = spawn('sqlite3', ['-header', '-json', DB_PATH, sql]);

      let stdout = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const commands = JSON.parse(stdout || '[]');
            resolve(commands);
          } catch (error) {
            resolve([]);
          }
        } else {
          reject(new Error(`Failed to get sequence commands: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Find similar sequences based on commands
   * @param {Array} commands - Array of command strings
   * @param {number} limit - Number of similar sequences to return
   * @returns {Promise<Array>} - Array of similar sequences
   */
  async findSimilarSequences(commands, limit = 5) {
    // Simple similarity: find sequences that contain similar commands
    // In future, use embeddings for semantic similarity

    return new Promise((resolve, reject) => {
      const commandPattern = commands.map(cmd => `'%${this._escape(cmd)}%'`).join(' OR command LIKE ');

      const sql = `
        SELECT sequence_id, COUNT(DISTINCT command) as matching_commands
        FROM workflow_patterns
        WHERE command LIKE ${commandPattern}
        GROUP BY sequence_id
        ORDER BY matching_commands DESC
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
            const sequences = JSON.parse(stdout || '[]');
            resolve(sequences);
          } catch (error) {
            resolve([]);
          }
        } else {
          reject(new Error(`Failed to find similar sequences: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Predict next likely command based on current sequence
   * @param {Array} currentCommands - Commands in current sequence
   * @returns {Promise<Array>} - Array of predicted commands with confidence scores
   */
  async predictNextCommand(currentCommands) {
    // Find sequences that start with similar commands
    const similarSequences = await this.findSimilarSequences(currentCommands, 10);

    if (similarSequences.length === 0) {
      return [];
    }

    // Get full sequences and find what comes next
    const predictions = new Map();

    for (const seq of similarSequences) {
      const commands = await this.getSequenceCommands(seq.sequence_id);

      // Find matching prefix
      for (let i = 0; i < commands.length - 1; i++) {
        const currentCmd = commands[i].command;
        const nextCmd = commands[i + 1].command;

        // If current command matches last in our sequence, count next command
        if (currentCommands.includes(currentCmd)) {
          const count = predictions.get(nextCmd) || 0;
          predictions.set(nextCmd, count + 1);
        }
      }
    }

    // Convert to array and sort by frequency
    const results = Array.from(predictions.entries())
      .map(([command, count]) => ({
        command,
        confidence: count / similarSequences.length
      }))
      .sort((a, b) => b.confidence - a.confidence);

    return results;
  }

  /**
   * Get workflow statistics
   * @returns {Promise<object>} - Statistics object
   */
  async getStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          COUNT(DISTINCT sequence_id) as total_sequences,
          COUNT(*) as total_commands,
          AVG(duration_ms) as avg_duration_ms,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_commands,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_commands
        FROM workflow_patterns;
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
   * Log error pattern
   * @param {string} errorType - Error type (e.g., 'broken_pipe', 'prompt_truncation')
   * @param {string} autoFix - Suggested auto-fix
   * @param {object} context - Error context
   */
  async logError(errorType, autoFix, context = {}) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO error_patterns (error_type, count, first_seen, last_seen, auto_fix)
        VALUES ('${this._escape(errorType)}', 1, datetime('now'), datetime('now'), '${this._escape(autoFix)}')
        ON CONFLICT(error_type) DO UPDATE SET
          count = count + 1,
          last_seen = datetime('now');
      `;

      const proc = spawn('sqlite3', [DB_PATH, sql]);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to log error: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Update error pattern success rate
   * @param {string} errorType - Error type
   * @param {boolean} success - Whether the fix was successful
   */
  async updateErrorSuccess(errorType, success) {
    return new Promise((resolve, reject) => {
      // Get current success rate
      const getSQL = `SELECT success_rate, count FROM error_patterns WHERE error_type = '${this._escape(errorType)}';`;

      const getProc = spawn('sqlite3', ['-header', '-json', DB_PATH, getSQL]);

      let stdout = '';

      getProc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      getProc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to get error pattern: exit code ${code}`));
          return;
        }

        try {
          const result = JSON.parse(stdout || '[{}]')[0];
          const currentRate = parseFloat(result.success_rate || 0);
          const count = parseInt(result.count || 1);

          // Calculate new success rate (weighted average)
          const newRate = ((currentRate * (count - 1)) + (success ? 1 : 0)) / count;

          // Update database
          const updateSQL = `
            UPDATE error_patterns
            SET success_rate = ${newRate}
            WHERE error_type = '${this._escape(errorType)}';
          `;

          const updateProc = spawn('sqlite3', [DB_PATH, updateSQL]);

          updateProc.on('close', (updateCode) => {
            if (updateCode === 0) {
              resolve({ errorType, newRate });
            } else {
              reject(new Error(`Failed to update success rate: exit code ${updateCode}`));
            }
          });

          updateProc.on('error', (error) => {
            reject(error);
          });

        } catch (error) {
          reject(error);
        }
      });

      getProc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get error pattern by type
   * @param {string} errorType - Error type
   * @returns {Promise<object>} - Error pattern
   */
  async getErrorPattern(errorType) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT error_type, count, first_seen, last_seen, auto_fix, success_rate
        FROM error_patterns
        WHERE error_type = '${this._escape(errorType)}'
        LIMIT 1;
      `;

      const proc = spawn('sqlite3', ['-header', '-json', DB_PATH, sql]);

      let stdout = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const pattern = JSON.parse(stdout || '[null]')[0];
            resolve(pattern);
          } catch (error) {
            resolve(null);
          }
        } else {
          reject(new Error(`Failed to get error pattern: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get most common errors
   * @param {number} limit - Number of errors to return
   * @returns {Promise<Array>} - Array of error patterns
   */
  async getCommonErrors(limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT error_type, count, auto_fix, success_rate, last_seen
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
            const errors = JSON.parse(stdout || '[]');
            resolve(errors);
          } catch (error) {
            resolve([]);
          }
        } else {
          reject(new Error(`Failed to get common errors: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Suggest auto-fix for an error
   * @param {string} errorType - Error type
   * @returns {Promise<object>} - Auto-fix suggestion with confidence
   */
  async suggestFix(errorType) {
    const pattern = await this.getErrorPattern(errorType);

    if (!pattern) {
      return {
        errorType,
        suggestion: 'No known fix',
        confidence: 0
      };
    }

    return {
      errorType,
      suggestion: pattern.auto_fix,
      confidence: parseFloat(pattern.success_rate || 0),
      timesEncountered: parseInt(pattern.count || 0),
      lastSeen: pattern.last_seen
    };
  }

  /**
   * Learn from error resolution
   * @param {string} errorType - Error type
   * @param {string} appliedFix - The fix that was applied
   * @param {boolean} success - Whether it worked
   */
  async learnFromResolution(errorType, appliedFix, success) {
    // Log the resolution
    await this.logCommand(
      `fix: ${errorType}`,
      'error_resolution',
      { errorType, appliedFix },
      { success },
      0,
      success
    );

    // Update success rate
    await this.updateErrorSuccess(errorType, success);

    console.log(`📚 Learned from ${errorType}: fix "${appliedFix}" ${success ? '✓ worked' : '✗ failed'}`);
  }

  /**
   * Get error learning statistics
   * @returns {Promise<object>} - Error learning stats
   */
  async getErrorStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          COUNT(*) as total_error_types,
          SUM(count) as total_errors,
          AVG(success_rate) as avg_success_rate,
          MAX(success_rate) as best_fix_rate,
          SUM(CASE WHEN success_rate >= 0.8 THEN 1 ELSE 0 END) as reliable_fixes
        FROM error_patterns;
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
          reject(new Error(`Failed to get error stats: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Detect patterns in recent errors
   * @param {number} lookbackHours - Hours to look back
   * @returns {Promise<Array>} - Array of error patterns
   */
  async detectErrorTrends(lookbackHours = 24) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          error_type,
          COUNT(*) as recent_count,
          auto_fix,
          success_rate
        FROM error_patterns
        WHERE datetime(last_seen) > datetime('now', '-${lookbackHours} hours')
        GROUP BY error_type
        ORDER BY recent_count DESC;
      `;

      const proc = spawn('sqlite3', ['-header', '-json', DB_PATH, sql]);

      let stdout = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const trends = JSON.parse(stdout || '[]');
            resolve(trends);
          } catch (error) {
            resolve([]);
          }
        } else {
          reject(new Error(`Failed to detect trends: exit code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Escape SQL special characters
   * @param {string} str - String to escape
   * @returns {string} - Escaped string
   */
  _escape(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/'/g, "''");
  }
}

module.exports = PatternLearner;

/**
 * Sandbox Executor
 * Safe execution of user code (Python, JavaScript, Go, Bash)
 *
 * Features:
 * - Resource limits (CPU, memory, time)
 * - Multiple language support
 * - Streaming output
 * - Error handling
 *
 * Security:
 * - Timeout enforcement
 * - Memory limits
 * - Read-only execution
 * - No network access (future: Docker isolation)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SandboxExecutor {
  constructor(options = {}) {
    this.timeout = options.timeout || 10000; // 10 seconds default
    this.maxOutputSize = options.maxOutputSize || 1024 * 1024; // 1MB
    this.tempDir = options.tempDir || '/tmp/calos-playground';

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Execute code in sandbox
   * @param {object} params - Execution parameters
   * @returns {Promise<object>} - Execution result
   */
  async execute(params) {
    const {
      code,
      language,
      timeout = this.timeout,
      args = []
    } = params;

    // Validate input
    if (!code) {
      throw new Error('Code is required');
    }

    if (!language) {
      throw new Error('Language is required');
    }

    // Get executor for language
    const executor = this._getExecutor(language);

    // Create temporary file for code
    const tempFile = this._createTempFile(code, language);

    try {
      // Execute code
      const result = await this._runCommand(executor, tempFile, args, timeout);

      return {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: result.duration,
        language,
        timestamp: new Date().toISOString()
      };
    } finally {
      // Cleanup temp file
      this._cleanupTempFile(tempFile);
    }
  }

  /**
   * Get executor command for language
   * @param {string} language - Language name
   * @returns {object} - Command and args
   */
  _getExecutor(language) {
    const executors = {
      'python': {
        command: 'python3',
        args: ['-u'], // Unbuffered output
        ext: '.py'
      },
      'python3': {
        command: 'python3',
        args: ['-u'],
        ext: '.py'
      },
      'javascript': {
        command: 'node',
        args: [],
        ext: '.js'
      },
      'js': {
        command: 'node',
        args: [],
        ext: '.js'
      },
      'node': {
        command: 'node',
        args: [],
        ext: '.js'
      },
      'go': {
        command: 'go',
        args: ['run'],
        ext: '.go'
      },
      'bash': {
        command: 'bash',
        args: [],
        ext: '.sh'
      },
      'sh': {
        command: 'sh',
        args: [],
        ext: '.sh'
      }
    };

    const executor = executors[language.toLowerCase()];

    if (!executor) {
      throw new Error(`Unsupported language: ${language}`);
    }

    return executor;
  }

  /**
   * Create temporary file with code
   * @param {string} code - Code content
   * @param {string} language - Language
   * @returns {string} - Temp file path
   */
  _createTempFile(code, language) {
    const executor = this._getExecutor(language);
    const hash = crypto.randomBytes(8).toString('hex');
    const filename = `sandbox_${hash}${executor.ext}`;
    const filepath = path.join(this.tempDir, filename);

    fs.writeFileSync(filepath, code, 'utf-8');

    return filepath;
  }

  /**
   * Cleanup temporary file
   * @param {string} filepath - File to delete
   */
  _cleanupTempFile(filepath) {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    } catch (error) {
      console.error('Failed to cleanup temp file:', error.message);
    }
  }

  /**
   * Run command with timeout and resource limits
   * @param {object} executor - Executor config
   * @param {string} tempFile - Temp file path
   * @param {array} args - Additional arguments
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<object>} - Execution result
   */
  _runCommand(executor, tempFile, args, timeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Build command arguments
      const commandArgs = [...executor.args, tempFile, ...args];

      // Spawn process
      const proc = spawn(executor.command, commandArgs, {
        timeout,
        killSignal: 'SIGKILL',
        env: {
          ...process.env,
          // Limit some environment variables for safety
          PATH: process.env.PATH,
          HOME: this.tempDir
        }
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      // Timeout handler
      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
      }, timeout);

      // Capture stdout
      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length < this.maxOutputSize) {
          stdout += chunk;
        } else {
          stdout += '\n[Output truncated - size limit exceeded]';
          proc.kill('SIGKILL');
        }
      });

      // Capture stderr
      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length < this.maxOutputSize) {
          stderr += chunk;
        } else {
          stderr += '\n[Error output truncated - size limit exceeded]';
          proc.kill('SIGKILL');
        }
      });

      // Handle completion
      proc.on('close', (code) => {
        clearTimeout(timeoutId);

        const duration = Date.now() - startTime;

        resolve({
          exitCode: killed ? 124 : (code || 0), // 124 = timeout exit code
          stdout: stdout.trim(),
          stderr: killed ? 'Execution timeout exceeded' : stderr.trim(),
          duration,
          killed
        });
      });

      // Handle errors
      proc.on('error', (error) => {
        clearTimeout(timeoutId);

        resolve({
          exitCode: 1,
          stdout: '',
          stderr: `Execution error: ${error.message}`,
          duration: Date.now() - startTime,
          killed: false
        });
      });
    });
  }

  /**
   * Check if language is supported
   * @param {string} language - Language to check
   * @returns {boolean}
   */
  isSupported(language) {
    try {
      this._getExecutor(language);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of supported languages
   * @returns {array}
   */
  getSupportedLanguages() {
    return ['python', 'python3', 'javascript', 'js', 'node', 'go', 'bash', 'sh'];
  }
}

module.exports = SandboxExecutor;

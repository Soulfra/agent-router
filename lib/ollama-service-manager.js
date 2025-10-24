/**
 * Ollama Service Manager
 *
 * Manages Ollama instances as background services (no terminal needed!)
 *
 * Features:
 * - Auto-start Ollama if not running
 * - Background service (no terminal window)
 * - Health checks
 * - Model management (pull/update)
 * - Support for multiple instances (different ports for different environments)
 *
 * Usage:
 *   const manager = new OllamaServiceManager();
 *   await manager.start();  // Automatically starts Ollama if needed
 *   await manager.checkHealth();  // Check if Ollama is responding
 *   await manager.pullModel('calos-model:latest');  // Pull a model
 *   await manager.stop();  // Stop Ollama
 *
 * Terminal vs Script:
 * - ❌ DON'T: Run `ollama serve` in terminal (you have to keep terminal open)
 * - ✅ DO: Use this manager (runs as background service)
 */

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const axios = require('axios');

class OllamaServiceManager {
  constructor(options = {}) {
    this.port = options.port || 11434;
    this.host = options.host || 'localhost';
    this.baseUrl = `http://${this.host}:${this.port}`;
    this.process = null;
    this.verbose = options.verbose !== false;
    this.autoStart = options.autoStart !== false;

    // Colors for output
    this.colors = {
      reset: '\x1b[0m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      red: '\x1b[31m',
      cyan: '\x1b[36m',
      grey: '\x1b[90m'
    };
  }

  /**
   * Start Ollama service
   */
  async start() {
    try {
      // Check if already running
      const isRunning = await this.isRunning();

      if (isRunning) {
        this._print('✓ Ollama already running', 'green');
        return { alreadyRunning: true, url: this.baseUrl };
      }

      // Start Ollama as background service
      this._print('🚀 Starting Ollama service...', 'cyan');

      this.process = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore', // Run silently in background
        env: {
          ...process.env,
          OLLAMA_HOST: `${this.host}:${this.port}`
        }
      });

      // Detach process so it runs independently
      this.process.unref();

      // Wait for Ollama to be ready
      await this._waitForReady();

      this._print(`✓ Ollama started on ${this.baseUrl}`, 'green');

      return { started: true, url: this.baseUrl, pid: this.process.pid };

    } catch (error) {
      this._print(`❌ Failed to start Ollama: ${error.message}`, 'red');
      throw error;
    }
  }

  /**
   * Stop Ollama service
   */
  async stop() {
    try {
      this._print('⏹️  Stopping Ollama service...', 'cyan');

      // Find and kill Ollama processes
      const { stdout } = await execAsync("ps aux | grep 'ollama serve' | grep -v grep | awk '{print $2}'");
      const pids = stdout.trim().split('\n').filter(pid => pid);

      if (pids.length === 0) {
        this._print('✓ Ollama already stopped', 'grey');
        return;
      }

      for (const pid of pids) {
        try {
          process.kill(parseInt(pid), 'SIGTERM');
        } catch (err) {
          // Process might already be dead
        }
      }

      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Force kill if still running
      for (const pid of pids) {
        try {
          process.kill(parseInt(pid), 'SIGKILL');
        } catch (err) {
          // Process already dead
        }
      }

      this._print('✓ Ollama stopped', 'green');

    } catch (error) {
      this._print(`⚠️  Error stopping Ollama: ${error.message}`, 'yellow');
    }
  }

  /**
   * Restart Ollama service
   */
  async restart() {
    this._print('🔄 Restarting Ollama...', 'cyan');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.start();
  }

  /**
   * Check if Ollama is running
   */
  async isRunning() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 2000
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check Ollama health
   */
  async checkHealth() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000
      });

      const models = response.data.models || [];

      return {
        status: 'healthy',
        url: this.baseUrl,
        modelCount: models.length,
        models: models.map(m => m.name)
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        url: this.baseUrl,
        error: error.message
      };
    }
  }

  /**
   * List available models
   */
  async listModels() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000
      });

      return response.data.models || [];

    } catch (error) {
      throw new Error(`Failed to list models: ${error.message}`);
    }
  }

  /**
   * Pull a model
   */
  async pullModel(modelName) {
    try {
      this._print(`📥 Pulling model: ${modelName}...`, 'cyan');

      const response = await axios.post(`${this.baseUrl}/api/pull`, {
        name: modelName,
        stream: false
      }, {
        timeout: 300000 // 5 minutes
      });

      this._print(`✓ Model ${modelName} pulled successfully`, 'green');

      return response.data;

    } catch (error) {
      this._print(`❌ Failed to pull model ${modelName}: ${error.message}`, 'red');
      throw error;
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName) {
    try {
      this._print(`🗑️  Deleting model: ${modelName}...`, 'cyan');

      await axios.delete(`${this.baseUrl}/api/delete`, {
        data: { name: modelName }
      });

      this._print(`✓ Model ${modelName} deleted`, 'green');

    } catch (error) {
      this._print(`❌ Failed to delete model ${modelName}: ${error.message}`, 'red');
      throw error;
    }
  }

  /**
   * Ensure Ollama is running (auto-start if needed)
   */
  async ensure() {
    const isRunning = await this.isRunning();

    if (!isRunning && this.autoStart) {
      this._print('⚠️  Ollama not running, auto-starting...', 'yellow');
      await this.start();
    }

    return await this.isRunning();
  }

  /**
   * Get Ollama status
   */
  async getStatus() {
    const isRunning = await this.isRunning();

    if (!isRunning) {
      return {
        running: false,
        url: this.baseUrl,
        status: 'stopped'
      };
    }

    const health = await this.checkHealth();

    return {
      running: true,
      url: this.baseUrl,
      status: health.status,
      modelCount: health.modelCount,
      models: health.models
    };
  }

  /**
   * Wait for Ollama to be ready
   * @private
   */
  async _waitForReady(timeout = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const isRunning = await this.isRunning();
        if (isRunning) {
          return true;
        }
      } catch (error) {
        // Not ready yet
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Ollama failed to start within ${timeout}ms`);
  }

  /**
   * Print colored text
   * @private
   */
  _print(text, color = null) {
    if (!this.verbose) return;

    const output = color ?
      this.colors[color] + text + this.colors.reset :
      text;

    console.log(output);
  }

  /**
   * Create multiple Ollama instances for different environments
   * @static
   */
  static createMultiInstance(configs) {
    const instances = new Map();

    for (const config of configs) {
      const manager = new OllamaServiceManager({
        port: config.port,
        host: config.host || 'localhost',
        verbose: config.verbose !== false,
        autoStart: config.autoStart !== false
      });

      instances.set(config.name, manager);
    }

    return instances;
  }

  /**
   * Start all instances
   * @static
   */
  static async startAll(instances) {
    const results = [];

    for (const [name, manager] of instances) {
      try {
        const result = await manager.start();
        results.push({ name, success: true, result });
      } catch (error) {
        results.push({ name, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Stop all instances
   * @static
   */
  static async stopAll(instances) {
    const stopPromises = [];

    for (const [name, manager] of instances) {
      stopPromises.push(
        manager.stop().catch(error => ({
          name,
          error: error.message
        }))
      );
    }

    return await Promise.all(stopPromises);
  }
}

module.exports = OllamaServiceManager;

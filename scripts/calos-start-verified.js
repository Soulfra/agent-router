#!/usr/bin/env node
/**
 * CalOS Verified Startup Script
 *
 * Starts the CalOS server with pre-flight checks and post-startup verification.
 * Ensures the system is actually running and healthy before handing control to user.
 *
 * Usage:
 *   node scripts/calos-start-verified.js
 *   node scripts/calos-start-verified.js --skip-health  # Skip health checks
 *   node scripts/calos-start-verified.js --quick        # Quick health check only
 */

const { spawn } = require('child_process');
const { Pool } = require('pg');
const http = require('http');
const path = require('path');
const HealthChecker = require('./health-check');

class VerifiedStartup {
  constructor(options = {}) {
    this.skipHealth = options.skipHealth || false;
    this.quick = options.quick || false;
    this.serverProcess = null;
    this.dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || 'matthewmauer',
      password: process.env.DB_PASSWORD || ''
    };
    this.serverPort = process.env.PORT || 5001;

    // TTY detection: only use colors if outputting to a terminal
    this.useColors = options.colors !== false && process.stdout.isTTY === true;
  }

  // Color codes
  colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
  };

  log(message, color = 'reset') {
    if (this.useColors) {
      console.log(`${this.colors[color]}${message}${this.colors.reset}`);
    } else {
      console.log(message);
    }
  }

  /**
   * Pre-flight check: Database connection
   */
  async checkDatabaseConnection() {
    this.log('\n[Pre-Flight] Checking database connection...', 'cyan');

    try {
      const pool = new Pool(this.dbConfig);
      await pool.query('SELECT NOW()');
      await pool.end();

      this.log('✓ Database connection OK', 'green');
      return true;
    } catch (error) {
      this.log(`✗ Database connection failed: ${error.message}`, 'red');
      this.log('  Make sure PostgreSQL is running:', 'yellow');
      this.log('  brew services start postgresql@14', 'yellow');
      return false;
    }
  }

  /**
   * Pre-flight check: Port availability
   */
  async checkPortAvailable() {
    this.log(`\n[Pre-Flight] Checking if port ${this.serverPort} is available...`, 'cyan');

    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${this.serverPort}`, (res) => {
        this.log(`⚠ Port ${this.serverPort} is already in use`, 'yellow');
        this.log('  Killing existing process...', 'yellow');

        // Try to kill the existing process
        const { exec } = require('child_process');
        exec(`lsof -ti:${this.serverPort} | xargs kill -9`, (error) => {
          if (error) {
            this.log('  Failed to kill existing process', 'red');
            resolve(false);
          } else {
            this.log('  Killed existing process', 'green');
            setTimeout(() => resolve(true), 1000); // Wait a bit
          }
        });
      });

      req.on('error', () => {
        this.log(`✓ Port ${this.serverPort} is available`, 'green');
        resolve(true);
      });

      req.setTimeout(2000, () => {
        req.destroy();
        this.log(`✓ Port ${this.serverPort} is available`, 'green');
        resolve(true);
      });
    });
  }

  /**
   * Start the server process
   */
  async startServer() {
    this.log('\n[Startup] Starting CalOS server...', 'cyan');

    return new Promise((resolve, reject) => {
      const routerPath = path.join(__dirname, '../router.js');

      // Start server with DB_USER environment variable
      this.serverProcess = spawn('node', [routerPath, '--local'], {
        env: {
          ...process.env,
          DB_USER: process.env.DB_USER || 'matthewmauer'
        },
        stdio: 'pipe'
      });

      let startupOutput = '';
      let foundStartupSignal = false;

      // Capture stdout
      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        startupOutput += output;

        // Forward output to console
        process.stdout.write(output);

        // Check for startup signals
        if (output.includes('CalOS Intelligent Router') ||
            output.includes('HTTP Server:') ||
            output.includes('Mobile Access:')) {
          foundStartupSignal = true;
        }

        // Check for critical errors
        if (output.includes('EADDRINUSE') || output.includes('Error:')) {
          reject(new Error('Server startup failed'));
        }
      });

      // Capture stderr
      this.serverProcess.stderr.on('data', (data) => {
        process.stderr.write(data);
      });

      // Handle process errors
      this.serverProcess.on('error', (error) => {
        reject(error);
      });

      // Handle unexpected exit
      this.serverProcess.on('exit', (code) => {
        if (code !== 0 && !this.skipHealth) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });

      // Wait for startup (15 seconds)
      setTimeout(() => {
        if (foundStartupSignal) {
          this.log('\n✓ Server startup detected', 'green');
          resolve(true);
        } else {
          this.log('\n⚠ Server may not have started correctly', 'yellow');
          resolve(false);
        }
      }, 15000);
    });
  }

  /**
   * Run health checks after startup
   */
  async runHealthChecks() {
    if (this.skipHealth) {
      this.log('\n[Health] Skipping health checks', 'yellow');
      return true;
    }

    this.log('\n[Health] Running health checks...', 'cyan');

    const checker = new HealthChecker({
      verbose: false,
      quick: this.quick
    });

    const exitCode = await checker.runAll();
    return exitCode === 0;
  }

  /**
   * Display final status and instructions
   */
  displayFinalStatus(healthy) {
    this.log('\n╔════════════════════════════════════════╗', 'cyan');
    this.log('║        CalOS Startup Complete          ║', 'cyan');
    this.log('╚════════════════════════════════════════╝', 'cyan');

    if (healthy) {
      this.log('\n✓ Server is running and healthy!', 'green');
      this.log('\n📱 Mobile Access:', 'bright');
      this.log('   1. Look for QR code in output above', 'cyan');
      this.log('   2. Scan with phone camera', 'cyan');
      this.log('   3. Test OAuth upload feature', 'cyan');
      this.log(`\n🌐 Web Access: http://localhost:${this.serverPort}`, 'bright');
      this.log(`🏥 Health Check: http://localhost:${this.serverPort}/api/health`, 'bright');
      this.log('\n📊 To stop: Press Ctrl+C', 'yellow');
    } else {
      this.log('\n⚠ Server started but health checks failed', 'yellow');
      this.log('   Check the output above for errors', 'yellow');
      this.log('   Server may still be functional', 'yellow');
    }

    this.log('');
  }

  /**
   * Main startup flow
   */
  async run() {
    try {
      this.log('\n╔════════════════════════════════════════╗', 'magenta');
      this.log('║     CalOS Verified Startup System      ║', 'magenta');
      this.log('╚════════════════════════════════════════╝\n', 'magenta');

      // Pre-flight checks
      const dbOk = await this.checkDatabaseConnection();
      if (!dbOk) {
        this.log('\n✗ Pre-flight checks failed', 'red');
        process.exit(1);
      }

      const portOk = await this.checkPortAvailable();
      if (!portOk) {
        this.log('\n✗ Port unavailable', 'red');
        process.exit(1);
      }

      this.log('\n✓ Pre-flight checks passed', 'green');

      // Start server
      const started = await this.startServer();
      if (!started) {
        this.log('\n✗ Server startup failed', 'red');
        process.exit(1);
      }

      // Run health checks
      const healthy = await this.runHealthChecks();

      // Display final status
      this.displayFinalStatus(healthy);

      // Keep process alive and forward signals
      process.on('SIGINT', () => {
        this.log('\n\n⚠ Shutting down CalOS server...', 'yellow');
        if (this.serverProcess) {
          this.serverProcess.kill('SIGINT');
        }
        setTimeout(() => process.exit(0), 2000);
      });

      process.on('SIGTERM', () => {
        if (this.serverProcess) {
          this.serverProcess.kill('SIGTERM');
        }
        process.exit(0);
      });

    } catch (error) {
      this.log(`\n✗ Startup error: ${error.message}`, 'red');
      if (this.serverProcess) {
        this.serverProcess.kill();
      }
      process.exit(1);
    }
  }
}

// CLI Entry Point
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    skipHealth: args.includes('--skip-health'),
    quick: args.includes('--quick'),
    colors: !args.includes('--no-color')
  };

  const startup = new VerifiedStartup(options);
  startup.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = VerifiedStartup;

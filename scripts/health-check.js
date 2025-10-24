#!/usr/bin/env node
/**
 * CalOS Health Check Script
 *
 * Comprehensive system verification that tests:
 * - Database connectivity and schema
 * - HTTP server availability
 * - WebSocket connectivity
 * - Critical API endpoints
 * - Background services status
 * - Mobile access features
 *
 * Usage:
 *   node scripts/health-check.js              # Run all checks
 *   node scripts/health-check.js --quick      # Quick checks only
 *   node scripts/health-check.js --verbose    # Detailed output
 */

const http = require('http');
const { Pool } = require('pg');
const WebSocket = require('ws');

class HealthChecker {
  constructor(options = {}) {
    this.baseURL = options.baseURL || 'http://localhost:5001';
    this.dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calos',
      user: process.env.DB_USER || 'matthewmauer',
      password: process.env.DB_PASSWORD || ''
    };
    this.verbose = options.verbose || false;
    this.quick = options.quick || false;

    // TTY detection: only use colors if outputting to a terminal
    this.useColors = options.colors !== false && process.stdout.isTTY === true;

    this.results = {
      passed: [],
      failed: [],
      warnings: []
    };
  }

  // Color codes for terminal output
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

  logTest(name, status, details = '') {
    const symbol = status === 'pass' ? '✓' : status === 'fail' ? '✗' : '⚠';
    const color = status === 'pass' ? 'green' : status === 'fail' ? 'red' : 'yellow';

    this.log(`${symbol} ${name}`, color);
    if (details && this.verbose) {
      console.log(`  ${details}`);
    }

    if (status === 'pass') {
      this.results.passed.push(name);
    } else if (status === 'fail') {
      this.results.failed.push({ name, details });
    } else {
      this.results.warnings.push({ name, details });
    }
  }

  /**
   * Test 1: Database Connection
   */
  async testDatabaseConnection() {
    try {
      const pool = new Pool(this.dbConfig);
      const result = await pool.query('SELECT NOW()');
      await pool.end();

      this.logTest('Database Connection', 'pass', `Connected to ${this.dbConfig.database}`);
      return true;
    } catch (error) {
      this.logTest('Database Connection', 'fail', error.message);
      return false;
    }
  }

  /**
   * Test 2: Critical Tables Exist
   */
  async testCriticalTables() {
    const criticalTables = [
      'user_tree_progress',
      'tree_node_completions',
      'learning_paths',
      'migration_history'
    ];

    try {
      const pool = new Pool(this.dbConfig);

      const result = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = ANY($1)
      `, [criticalTables]);

      await pool.end();

      const foundTables = result.rows.map(r => r.table_name);
      const missingTables = criticalTables.filter(t => !foundTables.includes(t));

      if (missingTables.length === 0) {
        this.logTest('Critical Tables', 'pass', `All ${criticalTables.length} tables exist`);
        return true;
      } else {
        this.logTest('Critical Tables', 'fail', `Missing: ${missingTables.join(', ')}`);
        return false;
      }
    } catch (error) {
      this.logTest('Critical Tables', 'fail', error.message);
      return false;
    }
  }

  /**
   * Test 3: Icon Emoji Column Exists
   */
  async testIconEmojiColumn() {
    try {
      const pool = new Pool(this.dbConfig);

      const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'learning_paths'
        AND column_name = 'icon_emoji'
      `);

      await pool.end();

      if (result.rows.length > 0) {
        this.logTest('Icon Emoji Column', 'pass', 'learning_paths.icon_emoji exists');
        return true;
      } else {
        this.logTest('Icon Emoji Column', 'fail', 'Column does not exist');
        return false;
      }
    } catch (error) {
      this.logTest('Icon Emoji Column', 'fail', error.message);
      return false;
    }
  }

  /**
   * Test 4: HTTP Server Responding
   */
  async testHTTPServer() {
    return new Promise((resolve) => {
      const req = http.get(this.baseURL, (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) {
          this.logTest('HTTP Server', 'pass', `Server responding on ${this.baseURL}`);
          resolve(true);
        } else {
          this.logTest('HTTP Server', 'fail', `Status code: ${res.statusCode}`);
          resolve(false);
        }
      });

      req.on('error', (error) => {
        this.logTest('HTTP Server', 'fail', `Server not running: ${error.message}`);
        resolve(false);
      });

      req.setTimeout(5000, () => {
        req.destroy();
        this.logTest('HTTP Server', 'fail', 'Timeout after 5s');
        resolve(false);
      });
    });
  }

  /**
   * Test 5: Mobile Access Page
   */
  async testMobileAccessPage() {
    return new Promise((resolve) => {
      const url = `${this.baseURL}/mobile-access.html`;
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          this.logTest('Mobile Access Page', 'pass', '/mobile-access.html loads');
          resolve(true);
        } else {
          this.logTest('Mobile Access Page', 'fail', `Status: ${res.statusCode}`);
          resolve(false);
        }
      });

      req.on('error', (error) => {
        this.logTest('Mobile Access Page', 'fail', error.message);
        resolve(false);
      });

      req.setTimeout(5000, () => {
        req.destroy();
        this.logTest('Mobile Access Page', 'fail', 'Timeout');
        resolve(false);
      });
    });
  }

  /**
   * Test 6: OAuth Upload Page
   */
  async testOAuthUploadPage() {
    return new Promise((resolve) => {
      const url = `${this.baseURL}/oauth-upload.html`;
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          this.logTest('OAuth Upload Page', 'pass', '/oauth-upload.html loads');
          resolve(true);
        } else {
          this.logTest('OAuth Upload Page', 'fail', `Status: ${res.statusCode}`);
          resolve(false);
        }
      });

      req.on('error', (error) => {
        this.logTest('OAuth Upload Page', 'fail', error.message);
        resolve(false);
      });

      req.setTimeout(5000, () => {
        req.destroy();
        this.logTest('OAuth Upload Page', 'fail', 'Timeout');
        resolve(false);
      });
    });
  }

  /**
   * Test 7: QR Code API
   */
  async testQRCodeAPI() {
    return new Promise((resolve) => {
      const url = `${this.baseURL}/api/qr-code?path=/test`;
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          this.logTest('QR Code API', 'pass', '/api/qr-code works');
          resolve(true);
        } else {
          this.logTest('QR Code API', 'fail', `Status: ${res.statusCode}`);
          resolve(false);
        }
      });

      req.on('error', (error) => {
        this.logTest('QR Code API', 'fail', error.message);
        resolve(false);
      });

      req.setTimeout(5000, () => {
        req.destroy();
        this.logTest('QR Code API', 'fail', 'Timeout');
        resolve(false);
      });
    });
  }

  /**
   * Test 8: Network Info API
   */
  async testNetworkInfoAPI() {
    return new Promise((resolve) => {
      const url = `${this.baseURL}/api/network-info`;
      const req = http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.ip && json.hostname) {
              this.logTest('Network Info API', 'pass', `IP: ${json.ip}`);
              resolve(true);
            } else {
              this.logTest('Network Info API', 'fail', 'Invalid response format');
              resolve(false);
            }
          } catch (error) {
            this.logTest('Network Info API', 'fail', 'Invalid JSON');
            resolve(false);
          }
        });
      });

      req.on('error', (error) => {
        this.logTest('Network Info API', 'fail', error.message);
        resolve(false);
      });

      req.setTimeout(5000, () => {
        req.destroy();
        this.logTest('Network Info API', 'fail', 'Timeout');
        resolve(false);
      });
    });
  }

  /**
   * Test 9: WebSocket Server
   */
  async testWebSocketServer() {
    return new Promise((resolve) => {
      const wsURL = this.baseURL.replace('http', 'ws');
      const ws = new WebSocket(wsURL);

      const timeout = setTimeout(() => {
        ws.close();
        this.logTest('WebSocket Server', 'fail', 'Connection timeout');
        resolve(false);
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        this.logTest('WebSocket Server', 'pass', 'WebSocket connection established');
        resolve(true);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        this.logTest('WebSocket Server', 'fail', error.message);
        resolve(false);
      });
    });
  }

  /**
   * Test 10: Health Endpoint (if available)
   */
  async testHealthEndpoint() {
    return new Promise((resolve) => {
      const url = `${this.baseURL}/api/health`;
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const health = JSON.parse(data);
              this.logTest('Health Endpoint', 'pass', `Status: ${health.status}`);
              resolve(true);
            } catch (error) {
              this.logTest('Health Endpoint', 'warn', 'Endpoint exists but invalid JSON');
              resolve(true);
            }
          });
        } else if (res.statusCode === 404) {
          this.logTest('Health Endpoint', 'warn', 'Not implemented yet');
          resolve(true);
        } else {
          this.logTest('Health Endpoint', 'fail', `Status: ${res.statusCode}`);
          resolve(false);
        }
      });

      req.on('error', (error) => {
        this.logTest('Health Endpoint', 'warn', 'Endpoint not available');
        resolve(true);
      });

      req.setTimeout(5000, () => {
        req.destroy();
        this.logTest('Health Endpoint', 'warn', 'Timeout');
        resolve(true);
      });
    });
  }

  /**
   * Run all health checks
   */
  async runAll() {
    this.log('\n╔════════════════════════════════════════╗', 'cyan');
    this.log('║     CalOS Health Check System          ║', 'cyan');
    this.log('╚════════════════════════════════════════╝\n', 'cyan');

    // Database tests
    this.log('Database Tests:', 'bright');
    await this.testDatabaseConnection();
    await this.testCriticalTables();
    await this.testIconEmojiColumn();

    // Server tests
    this.log('\nServer Tests:', 'bright');
    const serverRunning = await this.testHTTPServer();

    if (serverRunning && !this.quick) {
      await this.testMobileAccessPage();
      await this.testOAuthUploadPage();
      await this.testQRCodeAPI();
      await this.testNetworkInfoAPI();
      await this.testWebSocketServer();
      await this.testHealthEndpoint();
    } else if (!serverRunning) {
      this.logTest('Skipping API tests', 'warn', 'Server not running');
    }

    // Summary
    this.printSummary();

    // Exit code
    return this.results.failed.length === 0 ? 0 : 1;
  }

  /**
   * Print test summary
   */
  printSummary() {
    this.log('\n╔════════════════════════════════════════╗', 'cyan');
    this.log('║           Test Summary                 ║', 'cyan');
    this.log('╚════════════════════════════════════════╝', 'cyan');

    this.log(`\n✓ Passed:  ${this.results.passed.length}`, 'green');
    this.log(`✗ Failed:  ${this.results.failed.length}`, this.results.failed.length > 0 ? 'red' : 'green');
    this.log(`⚠ Warnings: ${this.results.warnings.length}`, 'yellow');

    if (this.results.failed.length > 0) {
      this.log('\nFailed Tests:', 'red');
      this.results.failed.forEach(fail => {
        this.log(`  ✗ ${fail.name}`, 'red');
        if (fail.details) {
          console.log(`    ${fail.details}`);
        }
      });
    }

    if (this.results.warnings.length > 0 && this.verbose) {
      this.log('\nWarnings:', 'yellow');
      this.results.warnings.forEach(warn => {
        this.log(`  ⚠ ${warn.name}`, 'yellow');
        if (warn.details) {
          console.log(`    ${warn.details}`);
        }
      });
    }

    this.log(''); // Empty line
  }
}

// CLI Entry Point
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    quick: args.includes('--quick') || args.includes('-q'),
    colors: !args.includes('--no-color')  // Allow disabling colors
  };

  const checker = new HealthChecker(options);
  checker.runAll().then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    console.error('Health check error:', error);
    process.exit(1);
  });
}

module.exports = HealthChecker;

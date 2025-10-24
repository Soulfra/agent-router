#!/usr/bin/env node
/**
 * Test Deployment System with Structured Logging
 *
 * Tests actual HTTP requests with timestamps, status codes, response times
 * Logs to database for debugging
 */

const http = require('http');
const { spawn } = require('child_process');
const chalk = require('chalk');

class DeploymentTester {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
    this.serverProcess = null;
  }

  /**
   * Start HTTP server and test it
   */
  async run() {
    console.log(chalk.cyan.bold('\n🧪 CalOS Deployment Test System\n'));
    console.log(chalk.gray(`Started: ${new Date().toISOString()}\n`));

    try {
      // Step 1: Start server
      await this.startServer();

      // Step 2: Wait for server to be ready
      await this.waitForServer();

      // Step 3: Run tests
      await this.runTests();

      // Step 4: Display results
      this.displayResults();

      // Step 5: Save to database
      await this.saveResults();

      // Cleanup
      this.stopServer();

      process.exit(this.results.every(r => r.success) ? 0 : 1);

    } catch (error) {
      console.error(chalk.red.bold('\n❌ FATAL ERROR:'), error.message);
      this.stopServer();
      process.exit(1);
    }
  }

  /**
   * Start the HTTP server
   */
  async startServer() {
    console.log(chalk.yellow('📡 Starting HTTP server...\n'));

    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('npx', [
        'http-server',
        'public',
        '-p', '8082',
        '--cors'
      ], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';

      this.serverProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log(chalk.gray(data.toString().trim()));

        if (output.includes('Available on')) {
          resolve();
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        console.error(chalk.red(data.toString().trim()));
      });

      this.serverProcess.on('error', reject);

      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('Server startup timeout')), 10000);
    });
  }

  /**
   * Wait for server to respond
   */
  async waitForServer(maxRetries = 10) {
    console.log(chalk.yellow('\n⏳ Waiting for server to be ready...\n'));

    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.makeRequest('GET', 'http://localhost:8082/');
        console.log(chalk.green('✅ Server is ready!\n'));
        return;
      } catch (error) {
        console.log(chalk.gray(`   Retry ${i + 1}/${maxRetries}...`));
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    throw new Error('Server failed to start');
  }

  /**
   * Run all tests
   */
  async runTests() {
    console.log(chalk.cyan.bold('🧪 Running Tests\n'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.white.bold('  URL                                    STATUS   TIME    SIZE    RESULT'));
    console.log(chalk.gray('─'.repeat(80)));

    const tests = [
      { name: 'Root directory listing', url: 'http://localhost:8082/', expectedStatus: 200 },
      { name: 'Lessons directory', url: 'http://localhost:8082/lessons/', expectedStatus: 200 },
      { name: 'Lessons JSON', url: 'http://localhost:8082/lessons/lessons.json', expectedStatus: 200 },
      { name: 'Lesson portal HTML', url: 'http://localhost:8082/lessons/index.html', expectedStatus: 200 },
      { name: 'Lesson portal app.js', url: 'http://localhost:8082/lessons/app.js', expectedStatus: 200 },
      { name: 'Lab: MCP Client', url: 'http://localhost:8082/labs/mcp-client.html', expectedStatus: 200 },
      { name: 'Lab: Card Opener', url: 'http://localhost:8082/labs/card-opener.html', expectedStatus: 200 },
      { name: 'Lesson markdown (should 404)', url: 'http://localhost:8082/docs/lessons/mcp-development/lesson-1-intro-to-mcp.md', expectedStatus: 404 },
    ];

    for (const test of tests) {
      await this.runTest(test);
    }

    console.log(chalk.gray('─'.repeat(80)));
  }

  /**
   * Run a single test
   */
  async runTest(test) {
    const startTime = Date.now();

    try {
      const { statusCode, body, headers } = await this.makeRequest('GET', test.url);
      const duration = Date.now() - startTime;
      const size = body.length;
      const success = statusCode === test.expectedStatus;

      const result = {
        timestamp: new Date().toISOString(),
        name: test.name,
        url: test.url,
        method: 'GET',
        statusCode,
        expectedStatus: test.expectedStatus,
        duration,
        size,
        success,
        headers,
        bodyPreview: body.substring(0, 200)
      };

      this.results.push(result);

      // Format output
      const urlDisplay = test.name.padEnd(40, ' ');
      const statusDisplay = success
        ? chalk.green(statusCode.toString().padStart(3, ' '))
        : chalk.red(statusCode.toString().padStart(3, ' '));
      const timeDisplay = chalk.cyan(`${duration}ms`.padStart(7, ' '));
      const sizeDisplay = chalk.gray(this.formatBytes(size).padStart(8, ' '));
      const resultDisplay = success ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');

      console.log(`  ${urlDisplay} ${statusDisplay}  ${timeDisplay} ${sizeDisplay} ${resultDisplay}`);

    } catch (error) {
      const duration = Date.now() - startTime;

      const result = {
        timestamp: new Date().toISOString(),
        name: test.name,
        url: test.url,
        method: 'GET',
        statusCode: 0,
        expectedStatus: test.expectedStatus,
        duration,
        size: 0,
        success: false,
        error: error.message
      };

      this.results.push(result);

      const urlDisplay = test.name.padEnd(40, ' ');
      const statusDisplay = chalk.red('ERR');
      const timeDisplay = chalk.cyan(`${duration}ms`.padStart(7, ' '));
      const resultDisplay = chalk.red(`❌ ${error.message}`);

      console.log(`  ${urlDisplay} ${statusDisplay}  ${timeDisplay}          ${resultDisplay}`);
    }
  }

  /**
   * Make HTTP request
   */
  makeRequest(method, url) {
    return new Promise((resolve, reject) => {
      const req = http.request(url, { method }, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Display results summary
   */
  displayResults() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;
    const duration = Date.now() - this.startTime;

    console.log('\n');
    console.log(chalk.cyan.bold('📊 Test Results\n'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.white(`  Total Tests:      ${total}`));
    console.log(chalk.green(`  Passed:           ${passed}`));
    console.log(chalk.red(`  Failed:           ${failed}`));
    console.log(chalk.cyan(`  Total Duration:   ${duration}ms`));
    console.log(chalk.gray('─'.repeat(80)));

    if (failed > 0) {
      console.log('\n');
      console.log(chalk.red.bold('❌ Failed Tests:\n'));
      this.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(chalk.red(`  • ${r.name}`));
          console.log(chalk.gray(`    URL: ${r.url}`));
          console.log(chalk.gray(`    Expected: ${r.expectedStatus}, Got: ${r.statusCode}`));
          if (r.error) {
            console.log(chalk.gray(`    Error: ${r.error}`));
          }
        });
    }

    console.log('\n');
  }

  /**
   * Save results to database (if available)
   */
  async saveResults() {
    // TODO: Save to PostgreSQL deployment_logs table
    console.log(chalk.yellow('💾 Saving results to database... (TODO)\n'));

    // For now, save to JSON file
    const fs = require('fs').promises;
    const resultsFile = './test-results/deployment-test-results.json';

    try {
      await fs.mkdir('./test-results', { recursive: true });
      await fs.writeFile(resultsFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        duration: Date.now() - this.startTime,
        results: this.results
      }, null, 2));

      console.log(chalk.green(`✅ Results saved to ${resultsFile}\n`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to save results: ${error.message}\n`));
    }
  }

  /**
   * Stop the HTTP server
   */
  stopServer() {
    if (this.serverProcess) {
      console.log(chalk.yellow('🛑 Stopping server...\n'));
      this.serverProcess.kill();
    }
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// Run tests
const tester = new DeploymentTester();
tester.run();

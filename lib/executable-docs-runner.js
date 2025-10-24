#!/usr/bin/env node

/**
 * Executable Documentation System
 *
 * Runs tests defined directly in markdown documentation.
 * Keeps docs in sync with actual API behavior.
 *
 * Supported test block formats:
 *
 * 1. JSON Test Definition:
 * ```test:shopify
 * {
 *   "action": "createProduct",
 *   "data": { "title": "Test Product" },
 *   "expect": { "status": 201 }
 * }
 * ```
 *
 * 2. HTTP Request Format:
 * ```test:api
 * POST https://api.stripe.com/v1/payment_intents
 * Authorization: Bearer ${STRIPE_SECRET_KEY}
 *
 * amount=1000&currency=usd
 *
 * Expect: 200
 * Expect: body.id exists
 * ```
 *
 * 3. Inline Assertions:
 * ```test:github
 * GET https://api.github.com/user
 *
 * assert response.status === 200
 * assert response.body.login exists
 * ```
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

class MarkdownTestParser {
  constructor() {
    this.testBlocks = [];
  }

  /**
   * Parse markdown file and extract test blocks
   */
  parseFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const blocks = this.extractTestBlocks(content);

    return blocks.map((block, index) => ({
      file: filePath,
      blockNumber: index + 1,
      platform: block.platform,
      content: block.content,
      lineNumber: block.lineNumber,
      type: this.detectTestType(block.content)
    }));
  }

  /**
   * Extract test blocks from markdown
   * Looks for ```test:platform or ```test:api blocks
   */
  extractTestBlocks(content) {
    const blocks = [];
    const lines = content.split('\n');
    let inTestBlock = false;
    let currentBlock = null;
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Start of test block
      if (line.match(/^```test:(\w+)/)) {
        inTestBlock = true;
        const platform = line.match(/^```test:(\w+)/)[1];
        currentBlock = {
          platform,
          content: [],
          lineNumber: i + 1
        };
        startLine = i;
      }
      // End of test block
      else if (line.match(/^```$/) && inTestBlock) {
        inTestBlock = false;
        blocks.push({
          ...currentBlock,
          content: currentBlock.content.join('\n')
        });
        currentBlock = null;
      }
      // Inside test block
      else if (inTestBlock && currentBlock) {
        currentBlock.content.push(line);
      }
    }

    return blocks;
  }

  /**
   * Detect test type from content
   */
  detectTestType(content) {
    const trimmed = content.trim();

    // JSON test definition
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return 'json';
    }

    // HTTP request format
    if (trimmed.match(/^(GET|POST|PUT|DELETE|PATCH)\s+https?:\/\//)) {
      return 'http';
    }

    // Inline assertions
    if (trimmed.includes('assert ')) {
      return 'assertion';
    }

    return 'unknown';
  }

  /**
   * Parse all markdown files in a directory
   */
  parseDirectory(dirPath) {
    const allTests = [];

    const files = this.findMarkdownFiles(dirPath);
    for (const file of files) {
      const tests = this.parseFile(file);
      allTests.push(...tests);
    }

    return allTests;
  }

  /**
   * Recursively find all markdown files
   */
  findMarkdownFiles(dirPath) {
    const files = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...this.findMarkdownFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }

    return files;
  }
}

class TestExecutor {
  constructor() {
    this.results = [];
  }

  /**
   * Execute a parsed test block
   */
  async executeTest(testBlock) {
    console.log(`\n  Testing: ${testBlock.file}:${testBlock.lineNumber} (${testBlock.platform})`);

    try {
      let result;

      switch (testBlock.type) {
        case 'json':
          result = await this.executeJsonTest(testBlock);
          break;
        case 'http':
          result = await this.executeHttpTest(testBlock);
          break;
        case 'assertion':
          result = await this.executeAssertionTest(testBlock);
          break;
        default:
          throw new Error(`Unknown test type: ${testBlock.type}`);
      }

      this.results.push({
        ...testBlock,
        status: 'pass',
        result
      });

      console.log(`  ✓ Passed`);
      return result;

    } catch (error) {
      this.results.push({
        ...testBlock,
        status: 'fail',
        error: error.message
      });

      console.log(`  ✗ Failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute JSON test definition
   */
  async executeJsonTest(testBlock) {
    const testDef = JSON.parse(testBlock.content);
    const { action, data, expect } = testDef;

    // Map action to API call based on platform
    const apiCall = this.mapActionToAPI(testBlock.platform, action, data);
    const response = await this.performAPICall(apiCall);

    // Validate expectations
    this.validateExpectations(response, expect);

    return response;
  }

  /**
   * Execute HTTP request format test
   */
  async executeHttpTest(testBlock) {
    const lines = testBlock.content.trim().split('\n');

    // Parse request line (GET/POST/etc + URL)
    const requestLine = lines[0];
    const [method, url] = requestLine.split(/\s+/);

    // Parse headers
    const headers = {};
    let bodyStart = 1;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line === '') {
        bodyStart = i + 1;
        break;
      }

      if (line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        headers[key.trim()] = this.replaceEnvVars(valueParts.join(':').trim());
      }
    }

    // Parse body and expectations
    let body = null;
    const expectations = [];

    for (let i = bodyStart; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('Expect:') || line.startsWith('assert ')) {
        expectations.push(line);
      } else if (line !== '') {
        body = (body || '') + line + '\n';
      }
    }

    // Perform request
    const response = await axios({
      method: method.toLowerCase(),
      url: this.replaceEnvVars(url),
      headers,
      data: body ? body.trim() : undefined
    });

    // Validate expectations
    for (const expectation of expectations) {
      this.validateExpectationString(response, expectation);
    }

    return {
      status: response.status,
      headers: response.headers,
      data: response.data
    };
  }

  /**
   * Execute assertion-based test
   */
  async executeAssertionTest(testBlock) {
    const lines = testBlock.content.trim().split('\n');

    // Parse request (first line)
    const requestLine = lines[0];
    const [method, url] = requestLine.split(/\s+/);

    // Perform request
    const response = await axios({
      method: method.toLowerCase(),
      url: this.replaceEnvVars(url),
      headers: this.getDefaultHeaders(testBlock.platform)
    });

    // Execute assertions
    const assertions = lines.slice(1).filter(line => line.trim().startsWith('assert '));
    for (const assertion of assertions) {
      this.executeAssertion(response, assertion);
    }

    return {
      status: response.status,
      data: response.data
    };
  }

  /**
   * Map action to API call
   */
  mapActionToAPI(platform, action, data) {
    const mappings = {
      shopify: {
        createProduct: {
          method: 'POST',
          path: '/products.json',
          body: { product: data }
        },
        getProduct: {
          method: 'GET',
          path: `/products/${data.id}.json`
        },
        updateProduct: {
          method: 'PUT',
          path: `/products/${data.id}.json`,
          body: { product: data }
        },
        deleteProduct: {
          method: 'DELETE',
          path: `/products/${data.id}.json`
        }
      },
      stripe: {
        createPaymentIntent: {
          method: 'POST',
          path: '/v1/payment_intents',
          body: data
        },
        retrievePaymentIntent: {
          method: 'GET',
          path: `/v1/payment_intents/${data.id}`
        }
      },
      github: {
        getUser: {
          method: 'GET',
          path: '/user'
        },
        listRepos: {
          method: 'GET',
          path: '/user/repos'
        }
      }
    };

    const platformMappings = mappings[platform];
    if (!platformMappings) {
      throw new Error(`Unknown platform: ${platform}`);
    }

    const apiCall = platformMappings[action];
    if (!apiCall) {
      throw new Error(`Unknown action for ${platform}: ${action}`);
    }

    return {
      platform,
      ...apiCall
    };
  }

  /**
   * Perform API call
   */
  async performAPICall(apiCall) {
    const { platform, method, path, body } = apiCall;

    const baseUrls = {
      shopify: process.env.SHOPIFY_STORE_URL,
      stripe: 'https://api.stripe.com',
      github: 'https://api.github.com',
      figma: 'https://api.figma.com',
      paypal: process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com'
    };

    const url = baseUrls[platform] + path;
    const headers = this.getDefaultHeaders(platform);

    const response = await axios({
      method: method.toLowerCase(),
      url,
      headers,
      data: body
    });

    return {
      status: response.status,
      headers: response.headers,
      body: response.data
    };
  }

  /**
   * Get default headers for platform
   */
  getDefaultHeaders(platform) {
    const headers = {
      'Content-Type': 'application/json'
    };

    switch (platform) {
      case 'shopify':
        headers['X-Shopify-Access-Token'] = process.env.SHOPIFY_ACCESS_TOKEN;
        break;
      case 'stripe':
        headers['Authorization'] = `Bearer ${process.env.STRIPE_SECRET_KEY}`;
        break;
      case 'github':
        headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
        break;
      case 'figma':
        headers['X-Figma-Token'] = process.env.FIGMA_ACCESS_TOKEN;
        break;
    }

    return headers;
  }

  /**
   * Validate expectations object
   */
  validateExpectations(response, expectations) {
    for (const [key, expected] of Object.entries(expectations)) {
      if (key === 'status') {
        if (response.status !== expected) {
          throw new Error(`Expected status ${expected}, got ${response.status}`);
        }
      } else if (key.startsWith('body.')) {
        const path = key.substring(5).split('.');
        const actual = this.getNestedValue(response.body, path);

        if (expected === 'exists') {
          if (actual === undefined) {
            throw new Error(`Expected ${key} to exist, but it was undefined`);
          }
        } else if (actual !== expected) {
          throw new Error(`Expected ${key} to be ${expected}, got ${actual}`);
        }
      }
    }
  }

  /**
   * Validate expectation string (from HTTP format tests)
   */
  validateExpectationString(response, expectation) {
    const trimmed = expectation.trim();

    // "Expect: 200"
    if (trimmed.match(/^Expect:\s+(\d+)$/)) {
      const expectedStatus = parseInt(trimmed.match(/^Expect:\s+(\d+)$/)[1]);
      if (response.status !== expectedStatus) {
        throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
      }
    }

    // "Expect: body.id exists"
    if (trimmed.match(/^Expect:\s+body\.(\S+)\s+exists$/)) {
      const field = trimmed.match(/^Expect:\s+body\.(\S+)\s+exists$/)[1];
      const value = this.getNestedValue(response.data, field.split('.'));
      if (value === undefined) {
        throw new Error(`Expected body.${field} to exist`);
      }
    }
  }

  /**
   * Execute assertion
   */
  executeAssertion(response, assertion) {
    // Parse assertion: "assert response.status === 200"
    const match = assertion.match(/assert\s+response\.(\S+)\s+(===|!==|>|<|>=|<=)\s+(.+)/);
    if (!match) {
      throw new Error(`Invalid assertion: ${assertion}`);
    }

    const [, path, operator, expected] = match;
    const actual = this.getNestedValue(response, path.split('.'));

    let expectedValue;
    if (expected === 'exists') {
      if (actual === undefined) {
        throw new Error(`Assertion failed: ${path} does not exist`);
      }
      return;
    } else if (expected.match(/^\d+$/)) {
      expectedValue = parseInt(expected);
    } else if (expected.match(/^".*"$/)) {
      expectedValue = expected.slice(1, -1);
    } else {
      expectedValue = expected;
    }

    let passed = false;
    switch (operator) {
      case '===':
        passed = actual === expectedValue;
        break;
      case '!==':
        passed = actual !== expectedValue;
        break;
      case '>':
        passed = actual > expectedValue;
        break;
      case '<':
        passed = actual < expectedValue;
        break;
      case '>=':
        passed = actual >= expectedValue;
        break;
      case '<=':
        passed = actual <= expectedValue;
        break;
    }

    if (!passed) {
      throw new Error(`Assertion failed: ${path} ${operator} ${expectedValue} (actual: ${actual})`);
    }
  }

  /**
   * Get nested value from object
   */
  getNestedValue(obj, path) {
    let current = obj;
    for (const key of path) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[key];
    }
    return current;
  }

  /**
   * Replace environment variables in string
   */
  replaceEnvVars(str) {
    return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });
  }

  /**
   * Get test results summary
   */
  getSummary() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;

    return {
      total,
      passed,
      failed,
      passRate: total > 0 ? (passed / total * 100).toFixed(1) : 0
    };
  }
}

class ExecutableDocsRunner {
  constructor(options = {}) {
    this.options = {
      updateDocs: options.updateDocs || false,
      outputDir: options.outputDir || './test-results',
      verbose: options.verbose || false
    };

    this.parser = new MarkdownTestParser();
    this.executor = new TestExecutor();
  }

  /**
   * Run all tests in a markdown file
   */
  async runFile(filePath) {
    console.log(`\nRunning tests from: ${filePath}`);

    const tests = this.parser.parseFile(filePath);
    console.log(`Found ${tests.length} test(s)`);

    for (const test of tests) {
      try {
        await this.executor.executeTest(test);
      } catch (error) {
        // Continue with other tests
        if (this.options.verbose) {
          console.error(error);
        }
      }
    }

    return this.executor.results;
  }

  /**
   * Run all tests in a directory
   */
  async runDirectory(dirPath) {
    console.log(`\nScanning for markdown tests in: ${dirPath}\n`);

    const tests = this.parser.parseDirectory(dirPath);
    console.log(`Found ${tests.length} test(s) across multiple files\n`);

    for (const test of tests) {
      try {
        await this.executor.executeTest(test);
      } catch (error) {
        // Continue with other tests
        if (this.options.verbose) {
          console.error(error);
        }
      }
    }

    return this.executor.results;
  }

  /**
   * Generate test report
   */
  generateReport() {
    const summary = this.executor.getSummary();

    console.log('\n' + '='.repeat(50));
    console.log('TEST RESULTS');
    console.log('='.repeat(50));
    console.log(`Total:  ${summary.total}`);
    console.log(`Passed: ${summary.passed} ✓`);
    console.log(`Failed: ${summary.failed} ✗`);
    console.log(`Pass Rate: ${summary.passRate}%`);
    console.log('='.repeat(50) + '\n');

    return summary;
  }

  /**
   * Save results to file
   */
  saveResults(outputPath) {
    const results = {
      summary: this.executor.getSummary(),
      tests: this.executor.results,
      timestamp: new Date().toISOString()
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    console.log(`Results saved to: ${outputPath}`);
  }

  /**
   * Update markdown files with test results
   */
  async updateDocsWithResults() {
    // Group results by file
    const resultsByFile = {};
    for (const result of this.executor.results) {
      if (!resultsByFile[result.file]) {
        resultsByFile[result.file] = [];
      }
      resultsByFile[result.file].push(result);
    }

    // Update each file
    for (const [filePath, results] of Object.entries(resultsByFile)) {
      await this.updateDocFile(filePath, results);
    }
  }

  /**
   * Update a single doc file with test results
   */
  async updateDocFile(filePath, results) {
    let content = fs.readFileSync(filePath, 'utf-8');

    for (const result of results) {
      // Find the test block and add result comment
      const resultComment = result.status === 'pass'
        ? `<!-- ✓ Test passed (last run: ${new Date().toISOString()}) -->`
        : `<!-- ✗ Test failed: ${result.error} (last run: ${new Date().toISOString()}) -->`;

      // Insert comment before the test block
      const lines = content.split('\n');
      lines.splice(result.lineNumber - 1, 0, resultComment);
      content = lines.join('\n');
    }

    fs.writeFileSync(filePath, content);
    console.log(`Updated: ${filePath}`);
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Executable Documentation Runner

Usage:
  node lib/executable-docs-runner.js <path> [options]

Options:
  --update-docs    Update markdown files with test results
  --output <dir>   Output directory for test results (default: ./test-results)
  --verbose        Show detailed output

Examples:
  # Run tests from a single file
  node lib/executable-docs-runner.js API-TO-APP-GENERATOR.md

  # Run all tests in a directory
  node lib/executable-docs-runner.js ./docs

  # Run tests and update docs with results
  node lib/executable-docs-runner.js ./docs --update-docs
    `);
    process.exit(0);
  }

  const targetPath = args[0];
  const options = {
    updateDocs: args.includes('--update-docs'),
    outputDir: args.includes('--output') ? args[args.indexOf('--output') + 1] : './test-results',
    verbose: args.includes('--verbose')
  };

  const runner = new ExecutableDocsRunner(options);

  (async () => {
    try {
      // Check if path is file or directory
      const stats = fs.statSync(targetPath);

      if (stats.isFile()) {
        await runner.runFile(targetPath);
      } else if (stats.isDirectory()) {
        await runner.runDirectory(targetPath);
      }

      // Generate report
      const summary = runner.generateReport();

      // Save results
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const outputPath = path.join(options.outputDir, `test-results-${timestamp}.json`);
      runner.saveResults(outputPath);

      // Update docs if requested
      if (options.updateDocs) {
        await runner.updateDocsWithResults();
      }

      // Exit with appropriate code
      process.exit(summary.failed > 0 ? 1 : 0);

    } catch (error) {
      console.error(`Error: ${error.message}`);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}

module.exports = { ExecutableDocsRunner, MarkdownTestParser, TestExecutor };

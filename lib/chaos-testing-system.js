#!/usr/bin/env node

/**
 * Chaos Testing System
 *
 * Adversarial testing that intentionally tries to break things.
 * "Thorn items" that put the system off guard.
 *
 * Features:
 * - Invalid data injection
 * - Rate limit testing
 * - Authentication failures
 * - Malformed requests
 * - Edge case testing
 * - Concurrent request storms
 * - Network failure simulation
 * - Boundary testing
 *
 * Usage:
 *   node lib/chaos-testing-system.js
 *   node lib/chaos-testing-system.js --platform shopify
 *   node lib/chaos-testing-system.js --intensity high
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

class ChaosGenerator {
  constructor() {
    this.chaosTypes = [
      'invalid_data',
      'malformed_request',
      'rate_limit_breach',
      'auth_failure',
      'edge_cases',
      'concurrent_storm',
      'timeout',
      'unexpected_values'
    ];
  }

  /**
   * Generate invalid data mutations
   */
  generateInvalidData(validData) {
    const mutations = [];

    // Null mutations
    for (const key of Object.keys(validData)) {
      mutations.push({
        type: 'null_injection',
        data: { ...validData, [key]: null },
        description: `Set ${key} to null`
      });
    }

    // Empty string mutations
    for (const key of Object.keys(validData)) {
      if (typeof validData[key] === 'string') {
        mutations.push({
          type: 'empty_string',
          data: { ...validData, [key]: '' },
          description: `Set ${key} to empty string`
        });
      }
    }

    // Type mutations
    for (const key of Object.keys(validData)) {
      mutations.push({
        type: 'type_mismatch',
        data: { ...validData, [key]: 'INVALID_TYPE' },
        description: `Set ${key} to wrong type`
      });
    }

    // Huge value mutations
    mutations.push({
      type: 'huge_value',
      data: { ...validData, title: 'A'.repeat(10000) },
      description: 'Extremely long string'
    });

    // Negative numbers
    for (const key of Object.keys(validData)) {
      if (typeof validData[key] === 'number') {
        mutations.push({
          type: 'negative_number',
          data: { ...validData, [key]: -999999 },
          description: `Set ${key} to negative number`
        });
      }
    }

    // SQL injection attempts
    mutations.push({
      type: 'sql_injection',
      data: { ...validData, title: "'; DROP TABLE products; --" },
      description: 'SQL injection attempt'
    });

    // XSS attempts
    mutations.push({
      type: 'xss_injection',
      data: { ...validData, title: '<script>alert("xss")</script>' },
      description: 'XSS injection attempt'
    });

    // Unicode edge cases
    mutations.push({
      type: 'unicode_edge_case',
      data: { ...validData, title: '🚀💥🔥' + '\u0000' + '零一二三' },
      description: 'Unicode and null byte injection'
    });

    return mutations;
  }

  /**
   * Generate malformed requests
   */
  generateMalformedRequests(validRequest) {
    return [
      {
        type: 'missing_required_field',
        request: { ...validRequest, body: {} },
        description: 'Missing all required fields'
      },
      {
        type: 'invalid_json',
        request: { ...validRequest, body: '{invalid json}' },
        description: 'Malformed JSON'
      },
      {
        type: 'wrong_content_type',
        request: {
          ...validRequest,
          headers: { ...validRequest.headers, 'Content-Type': 'text/plain' }
        },
        description: 'Wrong Content-Type header'
      },
      {
        type: 'missing_headers',
        request: { ...validRequest, headers: {} },
        description: 'Missing all headers'
      },
      {
        type: 'extra_fields',
        request: {
          ...validRequest,
          body: {
            ...validRequest.body,
            __proto__: { admin: true },
            constructor: 'malicious',
            ___weird___: 'value'
          }
        },
        description: 'Prototype pollution attempt'
      }
    ];
  }

  /**
   * Generate edge case tests
   */
  generateEdgeCases() {
    return [
      {
        type: 'boundary_min',
        value: 0,
        description: 'Minimum boundary value'
      },
      {
        type: 'boundary_max',
        value: Number.MAX_SAFE_INTEGER,
        description: 'Maximum boundary value'
      },
      {
        type: 'negative_zero',
        value: -0,
        description: 'Negative zero'
      },
      {
        type: 'infinity',
        value: Infinity,
        description: 'Infinity'
      },
      {
        type: 'nan',
        value: NaN,
        description: 'Not a Number'
      },
      {
        type: 'unicode_edge',
        value: '\uFFFF\u0000\uD800',
        description: 'Unicode edge cases'
      },
      {
        type: 'control_characters',
        value: '\x00\x01\x02\x03\x04\x05',
        description: 'Control characters'
      }
    ];
  }

  /**
   * Generate authentication failures
   */
  generateAuthFailures(validAuth) {
    return [
      {
        type: 'invalid_token',
        auth: 'invalid_token_12345',
        description: 'Invalid authentication token'
      },
      {
        type: 'expired_token',
        auth: 'expired_token_xyz',
        description: 'Expired token'
      },
      {
        type: 'no_auth',
        auth: null,
        description: 'No authentication'
      },
      {
        type: 'wrong_auth_scheme',
        auth: validAuth.replace('Bearer ', 'Basic '),
        description: 'Wrong authentication scheme'
      },
      {
        type: 'malformed_auth',
        auth: 'Bearer ',
        description: 'Malformed authentication'
      }
    ];
  }
}

class ChaosTester {
  constructor(platform, config) {
    this.platform = platform;
    this.config = config;
    this.results = [];
    this.chaosGenerator = new ChaosGenerator();
  }

  /**
   * Run chaos tests
   */
  async runChaosTests(intensity = 'medium') {
    console.log(`\nRunning ${intensity} intensity chaos tests for ${this.platform}...\n`);

    const tests = this.selectTestsByIntensity(intensity);

    for (const test of tests) {
      await this.runChaosTest(test);
    }

    return this.results;
  }

  /**
   * Select tests based on intensity
   */
  selectTestsByIntensity(intensity) {
    const allTests = [
      ...this.getInvalidDataTests(),
      ...this.getMalformedRequestTests(),
      ...this.getAuthFailureTests(),
      ...this.getEdgeCaseTests(),
      ...this.getRateLimitTests(),
      ...this.getConcurrentTests()
    ];

    switch (intensity) {
      case 'low':
        return allTests.slice(0, Math.floor(allTests.length * 0.3));
      case 'medium':
        return allTests.slice(0, Math.floor(allTests.length * 0.6));
      case 'high':
        return allTests;
      default:
        return allTests;
    }
  }

  /**
   * Get invalid data tests
   */
  getInvalidDataTests() {
    const validData = this.getValidSampleData();
    const mutations = this.chaosGenerator.generateInvalidData(validData);

    return mutations.map(mutation => ({
      name: `Invalid Data: ${mutation.description}`,
      type: 'invalid_data',
      execute: () => this.sendRequest(mutation.data)
    }));
  }

  /**
   * Get malformed request tests
   */
  getMalformedRequestTests() {
    const validRequest = this.getValidRequest();
    const malformed = this.chaosGenerator.generateMalformedRequests(validRequest);

    return malformed.map(req => ({
      name: `Malformed: ${req.description}`,
      type: 'malformed_request',
      execute: () => this.sendMalformedRequest(req.request)
    }));
  }

  /**
   * Get auth failure tests
   */
  getAuthFailureTests() {
    const validAuth = this.config.auth;
    const failures = this.chaosGenerator.generateAuthFailures(validAuth);

    return failures.map(failure => ({
      name: `Auth Failure: ${failure.description}`,
      type: 'auth_failure',
      execute: () => this.sendRequestWithAuth(failure.auth)
    }));
  }

  /**
   * Get edge case tests
   */
  getEdgeCaseTests() {
    const edgeCases = this.chaosGenerator.generateEdgeCases();

    return edgeCases.map(edge => ({
      name: `Edge Case: ${edge.description}`,
      type: 'edge_case',
      execute: () => this.sendRequest({ value: edge.value })
    }));
  }

  /**
   * Get rate limit tests
   */
  getRateLimitTests() {
    return [
      {
        name: 'Rate Limit: Burst 100 requests',
        type: 'rate_limit',
        execute: () => this.sendBurstRequests(100)
      },
      {
        name: 'Rate Limit: Sustained load',
        type: 'rate_limit',
        execute: () => this.sendSustainedLoad(50, 1000)
      }
    ];
  }

  /**
   * Get concurrent test storms
   */
  getConcurrentTests() {
    return [
      {
        name: 'Concurrent: 50 simultaneous requests',
        type: 'concurrent',
        execute: () => this.sendConcurrentRequests(50)
      },
      {
        name: 'Concurrent: Race condition test',
        type: 'concurrent',
        execute: () => this.testRaceCondition()
      }
    ];
  }

  /**
   * Run a single chaos test
   */
  async runChaosTest(test) {
    const startTime = Date.now();

    try {
      const response = await test.execute();

      const result = {
        name: test.name,
        type: test.type,
        status: 'completed',
        response: {
          status: response.status,
          statusText: response.statusText
        },
        duration: Date.now() - startTime,
        expected: 'Should handle gracefully',
        actual: `Returned ${response.status}`
      };

      // Check if response was handled gracefully
      if (this.isGracefulResponse(response, test.type)) {
        result.verdict = 'PASS';
        console.log(`  ✓ ${test.name} - ${response.status}`);
      } else {
        result.verdict = 'FAIL';
        console.log(`  ✗ ${test.name} - Ungraceful handling`);
      }

      this.results.push(result);

    } catch (error) {
      const result = {
        name: test.name,
        type: test.type,
        status: 'error',
        error: error.message,
        duration: Date.now() - startTime,
        verdict: this.isExpectedError(error, test.type) ? 'PASS' : 'FAIL'
      };

      if (result.verdict === 'PASS') {
        console.log(`  ✓ ${test.name} - Expected error`);
      } else {
        console.log(`  ⚠ ${test.name} - Unexpected error: ${error.message}`);
      }

      this.results.push(result);
    }
  }

  /**
   * Check if response was handled gracefully
   */
  isGracefulResponse(response, testType) {
    const status = response.status;

    // Invalid data should return 400 Bad Request
    if (testType === 'invalid_data' || testType === 'malformed_request') {
      return status === 400 || status === 422;
    }

    // Auth failures should return 401 Unauthorized
    if (testType === 'auth_failure') {
      return status === 401 || status === 403;
    }

    // Rate limits should return 429
    if (testType === 'rate_limit') {
      return status === 429;
    }

    // Any 4xx or 5xx is considered graceful handling
    return status >= 400 && status < 600;
  }

  /**
   * Check if error was expected
   */
  isExpectedError(error, testType) {
    const message = error.message.toLowerCase();

    // Network errors are expected for malformed requests
    if (testType === 'malformed_request') {
      return message.includes('network') || message.includes('request');
    }

    // Timeout errors are expected for rate limit tests
    if (testType === 'rate_limit') {
      return message.includes('timeout') || message.includes('429');
    }

    return false;
  }

  /**
   * Send request with data
   */
  async sendRequest(data) {
    return await axios.post(this.config.url, data, {
      headers: this.config.headers,
      timeout: 5000,
      validateStatus: () => true // Accept any status code
    });
  }

  /**
   * Send malformed request
   */
  async sendMalformedRequest(request) {
    return await axios({
      method: 'POST',
      url: this.config.url,
      headers: request.headers || {},
      data: request.body,
      timeout: 5000,
      validateStatus: () => true
    });
  }

  /**
   * Send request with specific auth
   */
  async sendRequestWithAuth(auth) {
    const headers = { ...this.config.headers };
    if (auth) {
      headers.Authorization = auth;
    } else {
      delete headers.Authorization;
    }

    return await axios.post(this.config.url, this.getValidSampleData(), {
      headers,
      timeout: 5000,
      validateStatus: () => true
    });
  }

  /**
   * Send burst of requests
   */
  async sendBurstRequests(count) {
    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(this.sendRequest(this.getValidSampleData()));
    }

    const responses = await Promise.allSettled(promises);
    const rateLimited = responses.filter(r => r.value?.status === 429).length;

    return {
      status: rateLimited > 0 ? 429 : 200,
      statusText: `${rateLimited}/${count} rate limited`
    };
  }

  /**
   * Send sustained load
   */
  async sendSustainedLoad(requestsPerSecond, durationMs) {
    const interval = 1000 / requestsPerSecond;
    const endTime = Date.now() + durationMs;
    const responses = [];

    while (Date.now() < endTime) {
      const response = await this.sendRequest(this.getValidSampleData());
      responses.push(response);
      await this.sleep(interval);
    }

    const rateLimited = responses.filter(r => r.status === 429).length;

    return {
      status: rateLimited > 0 ? 429 : 200,
      statusText: `${rateLimited}/${responses.length} rate limited`
    };
  }

  /**
   * Send concurrent requests
   */
  async sendConcurrentRequests(count) {
    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(this.sendRequest({ ...this.getValidSampleData(), index: i }));
    }

    const responses = await Promise.all(promises);
    return {
      status: 200,
      statusText: `${responses.length} concurrent requests completed`
    };
  }

  /**
   * Test race condition
   */
  async testRaceCondition() {
    const resourceId = 'race-test-' + Date.now();

    // Create resource
    await this.sendRequest({ id: resourceId, action: 'create' });

    // Try to update it concurrently
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(this.sendRequest({ id: resourceId, action: 'update', value: i }));
    }

    await Promise.all(promises);

    // Clean up
    await this.sendRequest({ id: resourceId, action: 'delete' });

    return {
      status: 200,
      statusText: 'Race condition test completed'
    };
  }

  /**
   * Get valid sample data for platform
   */
  getValidSampleData() {
    const samples = {
      shopify: {
        product: {
          title: 'Test Product',
          body_html: 'Test description',
          vendor: 'Test Vendor',
          product_type: 'Test'
        }
      },
      stripe: {
        amount: 1000,
        currency: 'usd',
        payment_method_types: ['card']
      },
      github: {
        name: 'test-repo',
        description: 'Test repository',
        private: false
      }
    };

    return samples[this.platform] || { test: 'data' };
  }

  /**
   * Get valid request template
   */
  getValidRequest() {
    return {
      headers: this.config.headers,
      body: this.getValidSampleData()
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class ChaosTestingSystem {
  constructor(options = {}) {
    this.options = {
      platform: options.platform || 'all',
      intensity: options.intensity || 'medium',
      outputDir: options.outputDir || './test-results',
      verbose: options.verbose || false
    };

    this.results = {
      platforms: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        errors: 0
      }
    };
  }

  /**
   * Run chaos testing system
   */
  async run() {
    console.log('Chaos Testing System');
    console.log('='.repeat(50));
    console.log(`Intensity: ${this.options.intensity}`);
    console.log(`Platform: ${this.options.platform}`);
    console.log('='.repeat(50));

    const platforms = this.options.platform === 'all'
      ? ['shopify', 'stripe', 'github']
      : [this.options.platform];

    for (const platform of platforms) {
      const config = this.getPlatformConfig(platform);

      if (!config) {
        console.log(`\n⚠ Skipping ${platform} - No configuration\n`);
        continue;
      }

      const tester = new ChaosTester(platform, config);
      const results = await tester.runChaosTests(this.options.intensity);

      this.results.platforms[platform] = results;

      // Update summary
      for (const result of results) {
        this.results.summary.total++;
        if (result.verdict === 'PASS') {
          this.results.summary.passed++;
        } else if (result.verdict === 'FAIL') {
          this.results.summary.failed++;
        } else if (result.status === 'error') {
          this.results.summary.errors++;
        }
      }
    }

    return this.generateReport();
  }

  /**
   * Get platform configuration
   */
  getPlatformConfig(platform) {
    const configs = {
      shopify: {
        url: `${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/products.json`,
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        auth: process.env.SHOPIFY_ACCESS_TOKEN
      },
      stripe: {
        url: 'https://api.stripe.com/v1/payment_intents',
        headers: {
          'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        auth: `Bearer ${process.env.STRIPE_SECRET_KEY}`
      },
      github: {
        url: 'https://api.github.com/user/repos',
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json'
        },
        auth: `token ${process.env.GITHUB_TOKEN}`
      }
    };

    const config = configs[platform];

    // Check if credentials exist
    if (!config || !config.auth || config.auth.includes('undefined')) {
      return null;
    }

    return config;
  }

  /**
   * Generate chaos testing report
   */
  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('CHAOS TESTING REPORT');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${this.results.summary.total}`);
    console.log(`Passed: ${this.results.summary.passed} ✓`);
    console.log(`Failed: ${this.results.summary.failed} ✗`);
    console.log(`Errors: ${this.results.summary.errors} ⚠`);

    const robustnessScore = this.results.summary.total > 0
      ? ((this.results.summary.passed / this.results.summary.total) * 100).toFixed(1)
      : 0;

    console.log(`Robustness Score: ${robustnessScore}%`);
    console.log('='.repeat(50));

    // Platform breakdown
    console.log('\nPlatform Breakdown:');
    for (const [platform, results] of Object.entries(this.results.platforms)) {
      const passed = results.filter(r => r.verdict === 'PASS').length;
      const total = results.length;
      const score = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

      console.log(`  ${platform}: ${passed}/${total} (${score}%)`);
    }

    // Save report
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const reportPath = path.join(this.options.outputDir, `chaos-test-report-${timestamp}.json`);

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
      ...this.results,
      timestamp: new Date().toISOString(),
      intensity: this.options.intensity
    }, null, 2));

    console.log(`\nReport saved to: ${reportPath}\n`);

    return this.results;
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Chaos Testing System

Adversarial testing that intentionally tries to break things.

Usage:
  node lib/chaos-testing-system.js [options]

Options:
  --platform <name>    Platform to test (shopify, stripe, github, all)
  --intensity <level>  Test intensity (low, medium, high)
  --output <dir>       Output directory for reports (default: ./test-results)
  --verbose            Show detailed output

Examples:
  # Run medium intensity chaos tests on all platforms
  node lib/chaos-testing-system.js

  # Run high intensity tests on Shopify only
  node lib/chaos-testing-system.js --platform shopify --intensity high

  # Run low intensity tests
  node lib/chaos-testing-system.js --intensity low
    `);
    process.exit(0);
  }

  const options = {
    platform: args.includes('--platform') ? args[args.indexOf('--platform') + 1] : 'all',
    intensity: args.includes('--intensity') ? args[args.indexOf('--intensity') + 1] : 'medium',
    outputDir: args.includes('--output') ? args[args.indexOf('--output') + 1] : './test-results',
    verbose: args.includes('--verbose')
  };

  const system = new ChaosTestingSystem(options);

  system.run().then(results => {
    process.exit(results.summary.failed > 0 ? 1 : 0);
  }).catch(error => {
    console.error(`Error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { ChaosTestingSystem, ChaosTester, ChaosGenerator };

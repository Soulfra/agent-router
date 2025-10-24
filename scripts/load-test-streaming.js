#!/usr/bin/env node

/**
 * Load Test for Streaming Chat
 *
 * Simulates multiple concurrent users sending chat messages
 * to test system performance under load.
 *
 * Usage:
 *   PASSWORD=your-password node scripts/load-test-streaming.js
 *
 * Or with custom parameters:
 *   USERS=20 REQUESTS=5 PASSWORD=your-password node scripts/load-test-streaming.js
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

const API_URL = process.env.API_URL || 'http://localhost:5001';
const EMAIL = process.env.EMAIL || 'lolztex@gmail.com';
const PASSWORD = process.env.PASSWORD || '';
const USERS = parseInt(process.env.USERS || '10', 10);
const REQUESTS_PER_USER = parseInt(process.env.REQUESTS || '10', 10);

async function loadTest() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  Streaming Chat Load Test                     ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');

  if (!PASSWORD) {
    console.log('❌ Error: PASSWORD environment variable not set');
    console.log('');
    console.log('Usage:');
    console.log('  PASSWORD=your-password node scripts/load-test-streaming.js');
    console.log('');
    console.log('Custom parameters:');
    console.log('  USERS=20 REQUESTS=5 PASSWORD=your-password node scripts/load-test-streaming.js');
    console.log('');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Server:       ${API_URL}`);
  console.log(`  Users:        ${USERS}`);
  console.log(`  Requests:     ${REQUESTS_PER_USER} per user`);
  console.log(`  Total:        ${USERS * REQUESTS_PER_USER} requests`);
  console.log('');

  try {
    // ====================================================================
    // LOGIN
    // ====================================================================

    console.log('🔐 Logging in...');

    const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
      email: EMAIL,
      password: PASSWORD
    });

    const token = loginResponse.data.token;
    const user = loginResponse.data.user;

    console.log(`✓ Logged in as: ${user.username || user.email}`);
    console.log('');

    // ====================================================================
    // LOAD TEST
    // ====================================================================

    console.log(`🚀 Starting load test: ${USERS} users, ${REQUESTS_PER_USER} requests each\n`);

    const results = {
      total: 0,
      successes: 0,
      failures: 0,
      timings: [],
      errors: {}
    };

    const testStartTime = performance.now();

    // Create user promises
    const userPromises = [];

    for (let user = 0; user < USERS; user++) {
      const userPromise = (async () => {
        for (let req = 0; req < REQUESTS_PER_USER; req++) {
          results.total++;

          try {
            const start = performance.now();

            const response = await axios.post(
              `${API_URL}/api/llm/complete`,
              {
                model: 'llama3.2',
                messages: [
                  { role: 'user', content: `Test message ${req + 1}` }
                ],
                stream: false,
                max_tokens: 50 // Keep responses short for load testing
              },
              {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 30000 // 30 second timeout
              }
            );

            const duration = performance.now() - start;

            results.successes++;
            results.timings.push(duration);

            console.log(`✓ User ${String(user + 1).padStart(2, '0')}, Req ${String(req + 1).padStart(2, '0')}: ${duration.toFixed(0).padStart(5, ' ')}ms`);

          } catch (error) {
            results.failures++;

            const errorType = error.response?.status
              ? `HTTP ${error.response.status}`
              : error.code || 'Unknown';

            results.errors[errorType] = (results.errors[errorType] || 0) + 1;

            console.log(`✗ User ${String(user + 1).padStart(2, '0')}, Req ${String(req + 1).padStart(2, '0')}: FAILED (${errorType})`);
          }
        }
      })();

      userPromises.push(userPromise);
    }

    // Wait for all users to complete
    await Promise.all(userPromises);

    const testEndTime = performance.now();
    const totalTestTime = testEndTime - testStartTime;

    // ====================================================================
    // CALCULATE STATISTICS
    // ====================================================================

    if (results.timings.length === 0) {
      console.log('');
      console.log('❌ All requests failed - no timing data available');
      console.log('');
      console.log('Error breakdown:');
      for (const [errorType, count] of Object.entries(results.errors)) {
        console.log(`  ${errorType}: ${count}`);
      }
      console.log('');
      process.exit(1);
    }

    const sortedTimings = results.timings.sort((a, b) => a - b);
    const avg = sortedTimings.reduce((a, b) => a + b, 0) / sortedTimings.length;
    const min = sortedTimings[0];
    const max = sortedTimings[sortedTimings.length - 1];
    const p50 = sortedTimings[Math.floor(sortedTimings.length * 0.5)];
    const p75 = sortedTimings[Math.floor(sortedTimings.length * 0.75)];
    const p90 = sortedTimings[Math.floor(sortedTimings.length * 0.90)];
    const p95 = sortedTimings[Math.floor(sortedTimings.length * 0.95)];
    const p99 = sortedTimings[Math.floor(sortedTimings.length * 0.99)];

    const requestsPerSecond = (results.successes / (totalTestTime / 1000)).toFixed(2);
    const successRate = (results.successes / results.total * 100).toFixed(1);

    // ====================================================================
    // DISPLAY RESULTS
    // ====================================================================

    console.log('');
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║  Load Test Results                            ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');

    console.log('Summary:');
    console.log(`  Total Requests:   ${results.total}`);
    console.log(`  Successes:        ${results.successes} (${successRate}%)`);
    console.log(`  Failures:         ${results.failures} (${(100 - parseFloat(successRate)).toFixed(1)}%)`);
    console.log(`  Total Time:       ${(totalTestTime / 1000).toFixed(2)}s`);
    console.log(`  Requests/sec:     ${requestsPerSecond}`);
    console.log('');

    console.log('Response Times:');
    console.log(`  Average:          ${avg.toFixed(0)}ms`);
    console.log(`  Median (p50):     ${p50.toFixed(0)}ms`);
    console.log(`  p75:              ${p75.toFixed(0)}ms`);
    console.log(`  p90:              ${p90.toFixed(0)}ms`);
    console.log(`  p95:              ${p95.toFixed(0)}ms`);
    console.log(`  p99:              ${p99.toFixed(0)}ms`);
    console.log(`  Min:              ${min.toFixed(0)}ms`);
    console.log(`  Max:              ${max.toFixed(0)}ms`);
    console.log('');

    if (results.failures > 0) {
      console.log('Error Breakdown:');
      for (const [errorType, count] of Object.entries(results.errors)) {
        console.log(`  ${errorType}: ${count}`);
      }
      console.log('');
    }

    // ====================================================================
    // PERFORMANCE ANALYSIS
    // ====================================================================

    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║  Performance Analysis                         ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');

    // Success rate analysis
    if (parseFloat(successRate) === 100) {
      console.log('✓ Success Rate: Perfect (100%)');
    } else if (parseFloat(successRate) >= 95) {
      console.log('✓ Success Rate: Good (≥95%)');
    } else if (parseFloat(successRate) >= 90) {
      console.log('⚠️  Success Rate: Acceptable (90-95%)');
      console.log('  Some requests failed under load');
    } else {
      console.log('❌ Success Rate: Poor (<90%)');
      console.log('  System may be overloaded');
    }
    console.log('');

    // Response time analysis
    if (p95 < 2000) {
      console.log('✓ Response Times: Excellent (p95 < 2s)');
    } else if (p95 < 3000) {
      console.log('✓ Response Times: Good (p95 < 3s)');
    } else if (p95 < 5000) {
      console.log('⚠️  Response Times: Acceptable (p95 < 5s)');
      console.log('  Consider optimizations:');
      console.log('    - Use faster LLM model');
      console.log('    - Enable response caching');
      console.log('    - Add request queuing');
    } else {
      console.log('❌ Response Times: Poor (p95 > 5s)');
      console.log('  System is too slow under load');
    }
    console.log('');

    // Throughput analysis
    const requestsPerSecFloat = parseFloat(requestsPerSecond);
    if (requestsPerSecFloat >= 10) {
      console.log('✓ Throughput: High (≥10 req/s)');
    } else if (requestsPerSecFloat >= 5) {
      console.log('✓ Throughput: Good (5-10 req/s)');
    } else if (requestsPerSecFloat >= 2) {
      console.log('⚠️  Throughput: Moderate (2-5 req/s)');
    } else {
      console.log('❌ Throughput: Low (<2 req/s)');
      console.log('  System may be bottlenecked');
    }
    console.log('');

    // Recommendations
    console.log('Recommendations:');

    if (parseFloat(successRate) < 95) {
      console.log('  • Investigate failed requests (check server logs)');
      console.log('  • Consider reducing concurrent users');
      console.log('  • Check database connection pool size');
    }

    if (p95 > 3000) {
      console.log('  • Switch to faster LLM model (llama3.2:1b, gpt-3.5-turbo)');
      console.log('  • Implement response caching for common queries');
      console.log('  • Add request queuing to limit concurrent LLM calls');
    }

    if (requestsPerSecFloat < 5) {
      console.log('  • LLM provider is the bottleneck (expected)');
      console.log('  • Consider using multiple Ollama instances');
      console.log('  • Or use cloud providers (OpenAI, Anthropic) for higher throughput');
    }

    console.log('');
    console.log('✓ Load test completed successfully');

  } catch (error) {
    console.error('');
    console.error('❌ Load test failed:');
    console.error('');

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.request) {
      console.error('No response received from server');
      console.error('');
      console.error('Check that server is running:');
      console.error('  npm run start');
    } else {
      console.error(error.message);
    }

    console.error('');
    process.exit(1);
  }
}

// Run load test
if (require.main === module) {
  loadTest().catch((error) => {
    console.error('Unhandled error:', error.message);
    process.exit(1);
  });
}

module.exports = loadTest;

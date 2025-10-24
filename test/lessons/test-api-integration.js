#!/usr/bin/env node
/**
 * Test API Integration
 *
 * Comprehensive API integration test suite:
 * - Tests MCP server endpoints (localhost:3100)
 * - Tests card game endpoints (/api/cards/*)
 * - Tests RPG endpoints (/api/rpg/*)
 * - Tests billing endpoints (/api/billing/*)
 * - Validates response formats
 * - Checks error handling
 *
 * Usage:
 *   node test/lessons/test-api-integration.js
 *   npm run test:api
 */

const http = require('http');
const https = require('https');

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001';
const MCP_URL = process.env.MCP_URL || 'http://localhost:3100';
const TIMEOUT = 5000;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: []
};

/**
 * Make HTTP request
 */
function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CalOS-Test-Suite/1.0'
      },
      timeout: TIMEOUT
    };

    const req = client.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Test: MCP server endpoints
 */
async function testMCPEndpoints() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Testing MCP server endpoints...`);

  const endpoints = [
    { path: '/health', method: 'GET', expectedStatus: 200 },
    { path: '/api/tools', method: 'GET', expectedStatus: 200 },
    { path: '/api/execute', method: 'POST', expectedStatus: [200, 400], requiresData: true }
  ];

  for (const endpoint of endpoints) {
    try {
      const url = `${MCP_URL}${endpoint.path}`;
      const data = endpoint.requiresData ? { tool: 'test', params: {} } : null;

      const response = await makeRequest(url, endpoint.method, data);
      const expectedStatuses = Array.isArray(endpoint.expectedStatus)
        ? endpoint.expectedStatus
        : [endpoint.expectedStatus];

      if (expectedStatuses.includes(response.statusCode)) {
        console.log(`  ${colors.green}✓${colors.reset} ${endpoint.method} ${endpoint.path} (${response.statusCode})`);
        results.passed++;
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${endpoint.method} ${endpoint.path} (expected ${endpoint.expectedStatus}, got ${response.statusCode})`);
        results.errors.push(`MCP ${endpoint.path}: Unexpected status ${response.statusCode}`);
        results.failed++;
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log(`  ${colors.yellow}⚠${colors.reset} ${endpoint.method} ${endpoint.path} - MCP server not running`);
        results.skipped++;
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${endpoint.method} ${endpoint.path} - ${error.message}`);
        results.errors.push(`MCP ${endpoint.path}: ${error.message}`);
        results.failed++;
      }
    }
  }
}

/**
 * Test: Card game endpoints
 */
async function testCardGameEndpoints() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Testing card game endpoints...`);

  const endpoints = [
    { path: '/api/cards/packs', method: 'GET', expectedStatus: 200 },
    { path: '/api/cards/collection', method: 'GET', expectedStatus: [200, 401] },
    { path: '/api/cards/open', method: 'POST', expectedStatus: [200, 400, 401] },
    { path: '/api/cards/roast/vote', method: 'POST', expectedStatus: [200, 400, 401] }
  ];

  for (const endpoint of endpoints) {
    try {
      const url = `${BASE_URL}${endpoint.path}`;
      const data = endpoint.method === 'POST' ? { test: true } : null;

      const response = await makeRequest(url, endpoint.method, data);
      const expectedStatuses = Array.isArray(endpoint.expectedStatus)
        ? endpoint.expectedStatus
        : [endpoint.expectedStatus];

      if (expectedStatuses.includes(response.statusCode)) {
        console.log(`  ${colors.green}✓${colors.reset} ${endpoint.method} ${endpoint.path} (${response.statusCode})`);
        results.passed++;

        // Validate response structure
        if (response.statusCode === 200 && typeof response.body === 'object') {
          if (endpoint.path.includes('/collection') && !response.body.cards && !response.body.error) {
            console.log(`    ${colors.yellow}⚠${colors.reset} Response should have 'cards' or 'error' field`);
          }
        }
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${endpoint.method} ${endpoint.path} (expected ${endpoint.expectedStatus}, got ${response.statusCode})`);
        results.errors.push(`Cards ${endpoint.path}: Unexpected status ${response.statusCode}`);
        results.failed++;
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log(`  ${colors.yellow}⚠${colors.reset} ${endpoint.method} ${endpoint.path} - Server not running`);
        results.skipped++;
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${endpoint.method} ${endpoint.path} - ${error.message}`);
        results.errors.push(`Cards ${endpoint.path}: ${error.message}`);
        results.failed++;
      }
    }
  }
}

/**
 * Test: RPG endpoints
 */
async function testRPGEndpoints() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Testing RPG endpoints...`);

  const endpoints = [
    { path: '/api/rpg/player', method: 'GET', expectedStatus: [200, 401] },
    { path: '/api/rpg/quests', method: 'GET', expectedStatus: 200 },
    { path: '/api/rpg/achievements', method: 'GET', expectedStatus: 200 },
    { path: '/api/rpg/leaderboard', method: 'GET', expectedStatus: 200 },
    { path: '/api/rpg/award-xp', method: 'POST', expectedStatus: [200, 400, 401] }
  ];

  for (const endpoint of endpoints) {
    try {
      const url = `${BASE_URL}${endpoint.path}`;
      const data = endpoint.method === 'POST' ? { xp: 100, reason: 'test' } : null;

      const response = await makeRequest(url, endpoint.method, data);
      const expectedStatuses = Array.isArray(endpoint.expectedStatus)
        ? endpoint.expectedStatus
        : [endpoint.expectedStatus];

      if (expectedStatuses.includes(response.statusCode)) {
        console.log(`  ${colors.green}✓${colors.reset} ${endpoint.method} ${endpoint.path} (${response.statusCode})`);
        results.passed++;

        // Validate response structure
        if (response.statusCode === 200 && typeof response.body === 'object') {
          if (endpoint.path.includes('/player')) {
            const hasPlayerData = response.body.level !== undefined ||
                                 response.body.xp !== undefined ||
                                 response.body.error !== undefined;
            if (!hasPlayerData) {
              console.log(`    ${colors.yellow}⚠${colors.reset} Player response should have level/xp data`);
            }
          }
        }
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${endpoint.method} ${endpoint.path} (expected ${endpoint.expectedStatus}, got ${response.statusCode})`);
        results.errors.push(`RPG ${endpoint.path}: Unexpected status ${response.statusCode}`);
        results.failed++;
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log(`  ${colors.yellow}⚠${colors.reset} ${endpoint.method} ${endpoint.path} - Server not running`);
        results.skipped++;
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${endpoint.method} ${endpoint.path} - ${error.message}`);
        results.errors.push(`RPG ${endpoint.path}: ${error.message}`);
        results.failed++;
      }
    }
  }
}

/**
 * Test: Billing endpoints
 */
async function testBillingEndpoints() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Testing billing endpoints...`);

  const endpoints = [
    { path: '/api/billing/tier', method: 'GET', expectedStatus: [200, 401] },
    { path: '/api/billing/usage', method: 'GET', expectedStatus: [200, 401] },
    { path: '/api/billing/projects', method: 'GET', expectedStatus: [200, 401] },
    { path: '/api/billing/limits', method: 'GET', expectedStatus: 200 }
  ];

  for (const endpoint of endpoints) {
    try {
      const url = `${BASE_URL}${endpoint.path}`;

      const response = await makeRequest(url, endpoint.method);
      const expectedStatuses = Array.isArray(endpoint.expectedStatus)
        ? endpoint.expectedStatus
        : [endpoint.expectedStatus];

      if (expectedStatuses.includes(response.statusCode)) {
        console.log(`  ${colors.green}✓${colors.reset} ${endpoint.method} ${endpoint.path} (${response.statusCode})`);
        results.passed++;

        // Validate response structure
        if (response.statusCode === 200 && typeof response.body === 'object') {
          if (endpoint.path.includes('/tier')) {
            const hasTierData = response.body.tier !== undefined ||
                               response.body.name !== undefined ||
                               response.body.error !== undefined;
            if (!hasTierData) {
              console.log(`    ${colors.yellow}⚠${colors.reset} Tier response should have tier data`);
            }
          }
        }
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${endpoint.method} ${endpoint.path} (expected ${endpoint.expectedStatus}, got ${response.statusCode})`);
        results.errors.push(`Billing ${endpoint.path}: Unexpected status ${response.statusCode}`);
        results.failed++;
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log(`  ${colors.yellow}⚠${colors.reset} ${endpoint.method} ${endpoint.path} - Server not running`);
        results.skipped++;
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${endpoint.method} ${endpoint.path} - ${error.message}`);
        results.errors.push(`Billing ${endpoint.path}: ${error.message}`);
        results.failed++;
      }
    }
  }
}

/**
 * Test: Error handling
 */
async function testErrorHandling() {
  console.log(`\n${colors.cyan}[TEST]${colors.reset} Testing error handling...`);

  const errorTests = [
    { path: '/api/nonexistent', expectedStatus: 404 },
    { path: '/api/cards/invalid-action', expectedStatus: [404, 400] },
    { path: '/api/rpg/invalid-action', expectedStatus: [404, 400] }
  ];

  for (const test of errorTests) {
    try {
      const url = `${BASE_URL}${test.path}`;
      const response = await makeRequest(url);

      const expectedStatuses = Array.isArray(test.expectedStatus)
        ? test.expectedStatus
        : [test.expectedStatus];

      if (expectedStatuses.includes(response.statusCode)) {
        console.log(`  ${colors.green}✓${colors.reset} ${test.path} correctly returns ${response.statusCode}`);
        results.passed++;
      } else {
        console.log(`  ${colors.yellow}⚠${colors.reset} ${test.path} returns ${response.statusCode} (expected ${test.expectedStatus})`);
        results.failed++;
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log(`  ${colors.yellow}⚠${colors.reset} ${test.path} - Server not running`);
        results.skipped++;
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${test.path} - ${error.message}`);
        results.failed++;
      }
    }
  }
}

/**
 * Generate API integration report
 */
function generateReport() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${colors.magenta}API INTEGRATION TEST REPORT${colors.reset}`);
  console.log(`${'='.repeat(70)}\n`);

  const total = results.passed + results.failed;
  const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;

  console.log(`${colors.green}Passed:${colors.reset}  ${results.passed}`);
  console.log(`${colors.red}Failed:${colors.reset}  ${results.failed}`);
  console.log(`${colors.yellow}Skipped:${colors.reset} ${results.skipped}`);
  console.log(`${colors.cyan}Pass Rate:${colors.reset} ${passRate}%\n`);

  if (results.skipped > 0) {
    console.log(`${colors.yellow}Note: ${results.skipped} tests skipped (server not running)${colors.reset}\n`);
  }

  if (results.errors.length > 0) {
    console.log(`${colors.red}ERRORS:${colors.reset}`);
    results.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`);
    });
    console.log('');
  }

  console.log(`${colors.cyan}API ENDPOINTS TESTED:${colors.reset}\n`);
  console.log(`  MCP Server:    ${MCP_URL}`);
  console.log(`  Main API:      ${BASE_URL}`);
  console.log(`  Card Game:     ${BASE_URL}/api/cards/*`);
  console.log(`  RPG System:    ${BASE_URL}/api/rpg/*`);
  console.log(`  Billing:       ${BASE_URL}/api/billing/*\n`);

  const reportPath = require('path').join(__dirname, 'api-integration-report.txt');
  const reportContent = `
CALOS API INTEGRATION TEST REPORT
Generated: ${new Date().toISOString()}
${'='.repeat(70)}

SUMMARY:
  Passed:   ${results.passed}
  Failed:   ${results.failed}
  Skipped:  ${results.skipped}
  Pass Rate: ${passRate}%

ERRORS:
${results.errors.map((err, i) => `  ${i + 1}. ${err}`).join('\n') || '  None'}

API ENDPOINTS TESTED:
  MCP Server:    ${MCP_URL}
  Main API:      ${BASE_URL}
  Card Game:     ${BASE_URL}/api/cards/*
  RPG System:    ${BASE_URL}/api/rpg/*
  Billing:       ${BASE_URL}/api/billing/*

NOTES:
  ${results.skipped > 0 ? `${results.skipped} tests skipped (server not running)` : 'All tests executed'}
`;

  require('fs').writeFileSync(reportPath, reportContent);
  console.log(`${colors.cyan}Report saved to:${colors.reset} ${reportPath}\n`);

  // Exit with appropriate code
  // Only fail if there are actual failures, not skipped tests
  process.exit(results.failed > 0 ? 1 : 0);
}

/**
 * Main test runner
 */
async function main() {
  console.log(`\n${colors.magenta}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.magenta}CALOS API INTEGRATION TEST${colors.reset}`);
  console.log(`${colors.magenta}${'='.repeat(70)}${colors.reset}\n`);

  console.log(`MCP Server: ${MCP_URL}`);
  console.log(`Main API:   ${BASE_URL}\n`);

  try {
    // Run all tests
    await testMCPEndpoints();
    await testCardGameEndpoints();
    await testRPGEndpoints();
    await testBillingEndpoints();
    await testErrorHandling();

    // Generate report
    generateReport();
  } catch (error) {
    console.error(`\n${colors.red}Fatal error:${colors.reset} ${error.message}`);
    process.exit(1);
  }
}

// Run tests
main();

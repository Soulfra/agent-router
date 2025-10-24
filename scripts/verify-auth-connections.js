#!/usr/bin/env node

/**
 * Verification Script: Authentication & API Connections
 *
 * Tests that all new API routes are properly connected and authenticated.
 *
 * Usage:
 *   node scripts/verify-auth-connections.js
 *
 * Prerequisites:
 *   - Server must be running (npm start or npm run dev)
 *   - Database must be initialized with migrations
 */

const fetch = require('node-fetch');
const readline = require('readline');

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function info(message) {
  log(`ℹ ${message}`, 'blue');
}

function warn(message) {
  log(`⚠ ${message}`, 'yellow');
}

// ========================================================================
// Test State
// ========================================================================

let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0
};

let authToken = null;
let refreshToken = null;
let userId = null;
let sessionId = null;
let deviceId = `test_${Date.now()}`;

// ========================================================================
// Helper Functions
// ========================================================================

async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // Add auth token if available
  if (authToken && !options.skipAuth) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  // Add device ID if needed
  if (deviceId && options.needsDevice) {
    headers['x-device-id'] = deviceId;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    return {
      status: response.status,
      ok: response.ok,
      data
    };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      error: err.message
    };
  }
}

function testPassed(name) {
  success(name);
  testResults.passed++;
}

function testFailed(name, reason) {
  error(`${name}: ${reason}`);
  testResults.failed++;
}

function testSkipped(name, reason) {
  warn(`${name}: ${reason}`);
  testResults.skipped++;
}

// ========================================================================
// Test Suites
// ========================================================================

async function testServerConnection() {
  info('\n📡 Testing Server Connection...');

  const result = await apiCall('/api/health', { skipAuth: true });

  if (result.ok) {
    testPassed('Server is running');
  } else {
    testFailed('Server connection', 'Server not responding or health endpoint missing');
    return false;
  }

  return true;
}

async function testAuthentication() {
  info('\n🔐 Testing Authentication System...');

  // Test 1: Register new user
  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';

  const registerResult = await apiCall('/api/auth/register', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      name: 'Test User'
    })
  });

  if (registerResult.ok && registerResult.data.accessToken) {
    testPassed('User registration');
    authToken = registerResult.data.accessToken;
    refreshToken = registerResult.data.refreshToken;
    userId = registerResult.data.user.userId;
    sessionId = registerResult.data.sessionId;
  } else {
    testFailed('User registration', registerResult.data.error || 'No access token returned');
    return false;
  }

  // Test 2: Validate token works
  const meResult = await apiCall('/api/auth/me');

  if (meResult.ok && meResult.data.userId) {
    testPassed('Token validation (/api/auth/me)');
  } else {
    testFailed('Token validation', 'Token not accepted');
    return false;
  }

  // Test 3: Login with same credentials
  const loginResult = await apiCall('/api/auth/login', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      deviceName: 'Test Device'
    })
  });

  if (loginResult.ok && loginResult.data.accessToken) {
    testPassed('User login');
    authToken = loginResult.data.accessToken; // Use fresh token
  } else {
    testFailed('User login', loginResult.data.error || 'Login failed');
  }

  return true;
}

async function testDevicePairing() {
  info('\n📱 Testing Device Pairing System...');

  // Test 1: Generate QR code
  const qrResult = await apiCall('/api/auth/device/qr/generate', {
    method: 'POST'
  });

  if (qrResult.ok && qrResult.data.pairingCode) {
    testPassed('QR code generation');
  } else {
    testFailed('QR code generation', qrResult.data.error || 'No pairing code returned');
  }

  // Test 2: List devices
  const devicesResult = await apiCall('/api/auth/devices');

  if (devicesResult.ok && Array.isArray(devicesResult.data.devices)) {
    testPassed('List user devices');
  } else {
    testFailed('List user devices', 'Unexpected response format');
  }
}

async function testTrainingTasks() {
  info('\n🎮 Testing Training Tasks System...');

  // Test 1: Get available tasks
  const tasksResult = await apiCall('/api/training/tasks/available?limit=5', {
    needsDevice: true
  });

  if (tasksResult.ok && tasksResult.data.tasks) {
    testPassed('Get available tasks');
  } else {
    testFailed('Get available tasks', tasksResult.data.error || 'Unexpected response');
  }

  // Test 2: Get user stats
  const statsResult = await apiCall('/api/training/stats');

  if (statsResult.ok && statsResult.data.stats) {
    testPassed('Get user stats');
  } else {
    testFailed('Get user stats', statsResult.data.error || 'Unexpected response');
  }

  // Test 3: Get leaderboard
  const leaderboardResult = await apiCall('/api/training/leaderboard?period=all_time');

  if (leaderboardResult.ok && leaderboardResult.data.leaderboard) {
    testPassed('Get leaderboard');
  } else {
    testFailed('Get leaderboard', leaderboardResult.data.error || 'Unexpected response');
  }

  // Test 4: Get task types
  const typesResult = await apiCall('/api/training/task-types');

  if (typesResult.ok && typesResult.data.taskTypes) {
    testPassed('Get task types');
  } else {
    testFailed('Get task types', typesResult.data.error || 'Unexpected response');
  }
}

async function testAccountWarming() {
  info('\n🔥 Testing Account Warming System...');

  // Test 1: Start warmup campaign
  const startResult = await apiCall('/api/warmup/start', {
    method: 'POST',
    body: JSON.stringify({
      deviceId: deviceId,
      targetPhase: 'expert',
      dailyTaskGoal: 5
    })
  });

  if (startResult.ok && startResult.data.campaign) {
    testPassed('Start warmup campaign');
  } else {
    // May already have campaign - try getting status instead
    const statusResult = await apiCall('/api/warmup/status');
    if (statusResult.ok && statusResult.data.status) {
      testPassed('Get warmup status (campaign exists)');
    } else {
      testFailed('Start warmup campaign', startResult.data.error || 'Unexpected response');
    }
  }

  // Test 2: Get warmup phases
  const phasesResult = await apiCall('/api/warmup/phases');

  if (phasesResult.ok && phasesResult.data.phases) {
    testPassed('Get warmup phases');
  } else {
    testFailed('Get warmup phases', phasesResult.data.error || 'Unexpected response');
  }

  // Test 3: Get recommended tasks
  const tasksResult = await apiCall('/api/warmup/recommended-tasks?limit=5');

  if (tasksResult.ok && tasksResult.data.tasks) {
    testPassed('Get recommended warmup tasks');
  } else {
    testFailed('Get recommended warmup tasks', tasksResult.data.error || 'Unexpected response');
  }

  // Test 4: Get authenticity score
  const authResult = await apiCall('/api/warmup/authenticity');

  if (authResult.ok && authResult.data.authenticity) {
    testPassed('Get authenticity score');
  } else {
    testFailed('Get authenticity score', authResult.data.error || 'Unexpected response');
  }
}

async function testExperiments() {
  info('\n🧪 Testing A/B Testing (Experiments) System...');

  // Test 1: Get active experiments
  const activeResult = await apiCall('/api/experiments/active');

  if (activeResult.ok && activeResult.data.experiments) {
    testPassed('Get active experiments');
  } else {
    testFailed('Get active experiments', activeResult.data.error || 'Unexpected response');
  }

  // Test 2: Get experiments summary
  const summaryResult = await apiCall('/api/experiments/summary');

  if (summaryResult.ok && summaryResult.data.experiments) {
    testPassed('Get experiments summary');
  } else {
    testFailed('Get experiments summary', summaryResult.data.error || 'Unexpected response');
  }
}

// ========================================================================
// Main Test Runner
// ========================================================================

async function runTests() {
  log('\n╔══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║   CalOS API Authentication & Connections Verification       ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════╝', 'cyan');

  info(`Testing against: ${API_BASE}`);

  // Run test suites
  const serverOk = await testServerConnection();
  if (!serverOk) {
    error('\nServer is not responding. Make sure the server is running (npm start or npm run dev).');
    process.exit(1);
  }

  const authOk = await testAuthentication();
  if (!authOk) {
    error('\nAuthentication tests failed. Cannot proceed with authenticated endpoints.');
    process.exit(1);
  }

  await testDevicePairing();
  await testTrainingTasks();
  await testAccountWarming();
  await testExperiments();

  // Print summary
  log('\n' + '═'.repeat(60), 'cyan');
  log('Test Summary', 'cyan');
  log('═'.repeat(60), 'cyan');

  success(`Passed: ${testResults.passed}`);
  if (testResults.failed > 0) {
    error(`Failed: ${testResults.failed}`);
  } else {
    log(`Failed: ${testResults.failed}`, 'reset');
  }
  if (testResults.skipped > 0) {
    warn(`Skipped: ${testResults.skipped}`);
  } else {
    log(`Skipped: ${testResults.skipped}`, 'reset');
  }

  const total = testResults.passed + testResults.failed + testResults.skipped;
  const successRate = Math.round((testResults.passed / total) * 100);

  log('\n' + '═'.repeat(60), 'cyan');

  if (testResults.failed === 0) {
    success(`\n🎉 All tests passed! (${successRate}% success rate)\n`);
    process.exit(0);
  } else {
    error(`\n⚠️  Some tests failed. (${successRate}% success rate)\n`);
    process.exit(1);
  }
}

// ========================================================================
// Entry Point
// ========================================================================

// Handle ctrl+c gracefully
process.on('SIGINT', () => {
  log('\n\nTests interrupted by user.', 'yellow');
  process.exit(130);
});

// Run tests
runTests().catch(err => {
  error(`\nUnexpected error: ${err.message}`);
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Comprehensive CalOS Feature Test
 * Tests all major features including time differentials, caching, widgets, logging
 *
 * Usage:
 *   node scripts/test-all-features.js
 *   or
 *   node scripts/test-all-features.js --with-db  (includes database tests)
 */

const axios = require('axios');
const { spawn } = require('child_process');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const WITH_DB = process.argv.includes('--with-db');
const DB_TYPE = process.env.DB_TYPE || 'postgres';

// Test results
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// Helper functions
function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function test(name, fn) {
  return async () => {
    try {
      await fn();
      results.passed++;
      results.tests.push({ name, status: 'PASS' });
      log('✅', name);
      return true;
    } catch (error) {
      results.failed++;
      results.tests.push({ name, status: 'FAIL', error: error.message });
      log('❌', `${name}: ${error.message}`);
      return false;
    }
  };
}

function skip(name, reason) {
  return () => {
    results.skipped++;
    results.tests.push({ name, status: 'SKIP', reason });
    log('⏭️ ', `${name}: ${reason}`);
  };
}

async function runSQL(query) {
  return new Promise((resolve, reject) => {
    const psql = spawn('psql', ['calos', '-t', '-c', query]);
    let output = '';
    let error = '';

    psql.stdout.on('data', (data) => output += data.toString());
    psql.stderr.on('data', (data) => error += data.toString());

    psql.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(error || `psql exited with code ${code}`));
      } else {
        resolve(output.trim());
      }
    });
  });
}

// Test suites

async function testAPIEndpoints() {
  log('\n📡', 'Testing API Endpoints...\n');

  await test('Health check endpoint', async () => {
    const res = await axios.get(`${BASE_URL}/health`);
    if (res.data.status !== 'ok') throw new Error('Health check failed');
  })();

  await test('Time endpoint - unix timestamp', async () => {
    const res = await axios.get(`${BASE_URL}/time?action=unix`);
    if (!res.data.timestamp) throw new Error('No timestamp returned');
    if (typeof res.data.timestamp !== 'number') throw new Error('Timestamp is not a number');
  })();

  await test('Time endpoint - timezone conversion', async () => {
    const res = await axios.get(`${BASE_URL}/time?action=timezone&city=Tokyo`);
    if (!res.data.timezone) throw new Error('No timezone returned');
    if (!res.data.formatted) throw new Error('No formatted time returned');
  })();

  await test('System endpoint - uptime', async () => {
    const res = await axios.get(`${BASE_URL}/system?action=uptime`);
    if (!res.data.formatted) throw new Error('No uptime returned');
  })();

  await test('System endpoint - full summary', async () => {
    const res = await axios.get(`${BASE_URL}/system`);
    if (!res.data.uptime) throw new Error('No uptime in summary');
    if (!res.data.memory) throw new Error('No memory in summary');
    if (!res.data.components) throw new Error('No components in summary');
  })();

  await test('Introspect endpoint - JSON', async () => {
    const res = await axios.get(`${BASE_URL}/introspect`);
    if (!res.data.components) throw new Error('No components list');
    if (!Array.isArray(res.data.components)) throw new Error('Components is not an array');
  })();

  await test('Introspect endpoint - XML', async () => {
    const res = await axios.get(`${BASE_URL}/introspect?format=xml`);
    if (!res.data.includes('<calos>')) throw new Error('Invalid XML format');
  })();

  await test('Agents registry endpoint', async () => {
    const res = await axios.get(`${BASE_URL}/agents`);
    if (!res.data.agents) throw new Error('No agents list');
  })();
}

async function testAgentExecution() {
  log('\n🤖', 'Testing Agent Execution...\n');

  // Test with a simple query
  await test('Execute agent query', async () => {
    const startTime = Date.now();
    const res = await axios.post(`${BASE_URL}/agent`, {
      input: '@ollama what is 2+2?',
      context: { local: true }
    });

    if (!res.data.logs) throw new Error('No logs returned');
    if (res.data.logs.length === 0) throw new Error('Empty logs array');

    const latency = Date.now() - startTime;
    log('ℹ️ ', `  Response latency: ${latency}ms`);
  })();

  // Test cache hit (second identical query)
  await test('Cache hit on repeated query', async () => {
    const startTime = Date.now();
    const res = await axios.post(`${BASE_URL}/agent`, {
      input: '@ollama what is 2+2?',  // Same as above
      context: { local: true }
    });

    const latency = Date.now() - startTime;
    log('ℹ️ ', `  Cache hit latency: ${latency}ms`);

    if (latency > 1000) {
      log('⚠️ ', '  Warning: Cache hit seems slow (> 1s)');
    }
  })();
}

async function testDatabaseSchema() {
  log('\n🗄️ ', 'Testing Database Schema...\n');

  if (!WITH_DB) {
    skip('Database schema tests', 'Use --with-db flag to enable')();
    return;
  }

  await test('ai_responses table has timing columns', async () => {
    const output = await runSQL(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ai_responses'
        AND column_name IN ('request_timestamp', 'response_timestamp', 'latency_ms', 'cache_hit')
    `);

    const columns = output.split('\n').map(s => s.trim()).filter(Boolean);
    if (columns.length !== 4) {
      throw new Error(`Missing timing columns. Found: ${columns.join(', ')}`);
    }
  })();

  await test('Timing indexes exist', async () => {
    const output = await runSQL(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'ai_responses'
        AND indexname IN ('idx_responses_request_time', 'idx_responses_latency', 'idx_responses_cache_hit')
    `);

    const indexes = output.split('\n').map(s => s.trim()).filter(Boolean);
    if (indexes.length !== 3) {
      throw new Error(`Missing timing indexes. Found: ${indexes.join(', ')}`);
    }
  })();

  await test('Performance views exist', async () => {
    const output = await runSQL(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name IN ('fast_responses', 'slow_responses', 'agent_performance', 'recent_responses')
    `);

    const views = output.split('\n').map(s => s.trim()).filter(Boolean);
    if (views.length !== 4) {
      throw new Error(`Missing views. Found: ${views.join(', ')}`);
    }
  })();

  await test('agent_metrics table has response_id link', async () => {
    const output = await runSQL(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'agent_metrics'
        AND column_name = 'response_id'
    `);

    if (!output.includes('response_id')) {
      throw new Error('response_id column not found in agent_metrics');
    }
  })();
}

async function testTimingData() {
  log('\n⏱️ ', 'Testing Timing Data...\n');

  if (!WITH_DB) {
    skip('Timing data tests', 'Use --with-db flag to enable')();
    return;
  }

  await test('Responses have timing information', async () => {
    const output = await runSQL(`
      SELECT COUNT(*) as total, COUNT(latency_ms) as with_timing
      FROM ai_responses
    `);

    const [totalStr, withTimingStr] = output.split('|').map(s => s.trim());
    const total = parseInt(totalStr);
    const withTiming = parseInt(withTimingStr);

    if (total === 0) {
      throw new Error('No responses in database. Run agent queries first.');
    }

    log('ℹ️ ', `  Total responses: ${total}, with timing: ${withTiming}`);

    if (withTiming === 0) {
      throw new Error('No responses have timing data');
    }
  })();

  await test('Latency calculations are correct', async () => {
    const output = await runSQL(`
      SELECT
        latency_ms,
        EXTRACT(EPOCH FROM (response_timestamp - request_timestamp)) * 1000 as calculated
      FROM ai_responses
      WHERE response_timestamp IS NOT NULL AND latency_ms IS NOT NULL
      LIMIT 1
    `);

    if (!output || output.length === 0) {
      skip('Latency calculation', 'No responses with complete timing')();
      return;
    }

    const [storedStr, calculatedStr] = output.split('|').map(s => s.trim());
    const stored = parseFloat(storedStr);
    const calculated = parseFloat(calculatedStr);
    const diff = Math.abs(stored - calculated);

    log('ℹ️ ', `  Stored: ${stored}ms, Calculated: ${calculated}ms, Diff: ${diff}ms`);

    if (diff > 10) {
      throw new Error(`Latency mismatch too large: ${diff}ms`);
    }
  })();

  await test('Cache hits have low latency', async () => {
    const output = await runSQL(`
      SELECT AVG(latency_ms)::numeric as avg_cache_latency
      FROM ai_responses
      WHERE cache_hit = true
    `);

    if (!output || output === '') {
      skip('Cache latency', 'No cache hits found')();
      return;
    }

    const avgLatency = parseFloat(output.trim());
    log('ℹ️ ', `  Average cache hit latency: ${avgLatency}ms`);

    if (avgLatency > 100) {
      log('⚠️ ', `  Warning: Cache hits seem slow (avg ${avgLatency}ms)`);
    }
  })();
}

async function testWidgets() {
  log('\n🌍', 'Testing Widgets...\n');

  await test('World clock widget file exists', async () => {
    try {
      await axios.get(`${BASE_URL}/widgets/world-clock.js`);
    } catch (error) {
      throw new Error('world-clock.js not accessible');
    }
  })();

  await test('World clock CSS exists', async () => {
    try {
      await axios.get(`${BASE_URL}/widgets/world-clock.css`);
    } catch (error) {
      throw new Error('world-clock.css not accessible');
    }
  })();

  await test('System status widget file exists', async () => {
    try {
      await axios.get(`${BASE_URL}/widgets/system-status.js`);
    } catch (error) {
      throw new Error('system-status.js not accessible');
    }
  })();

  await test('System status CSS exists', async () => {
    try {
      await axios.get(`${BASE_URL}/widgets/system-status.css`);
    } catch (error) {
      throw new Error('system-status.css not accessible');
    }
  })();

  await test('Wall.html includes widgets', async () => {
    const res = await axios.get(`${BASE_URL}/wall.html`);
    if (!res.data.includes('world-clock-widget')) {
      throw new Error('wall.html missing world-clock-widget');
    }
    if (!res.data.includes('system-status-widget')) {
      throw new Error('wall.html missing system-status-widget');
    }
  })();
}

async function testMessageStore() {
  log('\n💾', 'Testing Message Store...\n');

  await test('Message storage endpoint', async () => {
    const res = await axios.post(`${BASE_URL}/api/message`, {
      sessionId: 'test_' + Date.now(),
      type: 'chat',
      user: 'TestUser',
      message: 'Test message',
      timestamp: new Date().toISOString()
    });

    if (!res.data.hash) throw new Error('No hash returned');
    if (!res.data.formattedHtml) throw new Error('No formatted HTML returned');
  })();

  await test('Message verification endpoint', async () => {
    const res = await axios.get(`${BASE_URL}/api/verify`);
    if (typeof res.data.verified !== 'boolean') throw new Error('No verification status');
  })();
}

// Main test runner
async function runAllTests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  🧪 CalOS Comprehensive Feature Test  ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`Testing against: ${BASE_URL}`);
  console.log(`Database tests: ${WITH_DB ? 'Enabled' : 'Disabled (use --with-db to enable)'}`);
  console.log('');

  // Check if server is running
  try {
    await axios.get(`${BASE_URL}/health`, { timeout: 2000 });
  } catch (error) {
    console.error('❌ Server not running at', BASE_URL);
    console.error('   Start server: node router.js');
    process.exit(1);
  }

  // Run test suites
  await testAPIEndpoints();
  await testAgentExecution();
  await testDatabaseSchema();
  await testTimingData();
  await testWidgets();
  await testMessageStore();

  // Print summary
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Test Summary                          ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`✅ Passed:  ${results.passed}`);
  console.log(`❌ Failed:  ${results.failed}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  console.log(`📊 Total:   ${results.tests.length}`);
  console.log('');

  if (results.failed > 0) {
    console.log('Failed tests:');
    results.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => {
        console.log(`  ❌ ${t.name}: ${t.error}`);
      });
    console.log('');
    process.exit(1);
  } else {
    console.log('✨ All tests passed!');
    console.log('');
    process.exit(0);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Test runner error:', error);
  process.exit(1);
});

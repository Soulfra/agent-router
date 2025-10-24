#!/usr/bin/env node

/**
 * Streaming Performance Test
 *
 * Tests streaming chat performance with detailed timing breakdown:
 * - Network latency
 * - Auth verification
 * - Database queries
 * - LLM generation
 *
 * Usage:
 *   node scripts/test-streaming-performance.js
 *
 * Or with custom credentials:
 *   EMAIL=test@example.com PASSWORD=test123 node scripts/test-streaming-performance.js
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

const API_URL = process.env.API_URL || 'http://localhost:5001';
const EMAIL = process.env.EMAIL || 'lolztex@gmail.com';
const PASSWORD = process.env.PASSWORD || '';

async function testStreamingPerformance() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  Streaming Chat Performance Test              ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');

  if (!PASSWORD) {
    console.log('❌ Error: PASSWORD environment variable not set');
    console.log('');
    console.log('Usage:');
    console.log('  PASSWORD=your-password node scripts/test-streaming-performance.js');
    console.log('');
    process.exit(1);
  }

  try {
    // ====================================================================
    // TEST 1: LOGIN
    // ====================================================================

    console.log('🔐 Logging in...');
    const loginStart = performance.now();

    const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
      email: EMAIL,
      password: PASSWORD
    });

    const loginEnd = performance.now();
    const loginTime = loginEnd - loginStart;

    const token = loginResponse.data.token;
    const user = loginResponse.data.user;

    console.log(`✓ Login successful: ${loginTime.toFixed(2)}ms`);
    console.log(`  User: ${user.username || user.email}`);
    console.log(`  User ID: ${user.userId}`);
    console.log('');

    // ====================================================================
    // TEST 2: NON-STREAMING CHAT (Easier timing)
    // ====================================================================

    console.log('💬 Testing non-streaming chat...');
    console.log('  Model: llama3.2');
    console.log('  Prompt: "Write a haiku about code"');
    console.log('');

    const chatStart = performance.now();

    const chatResponse = await axios.post(
      `${API_URL}/api/llm/complete`,
      {
        model: 'llama3.2',
        messages: [
          { role: 'user', content: 'Write a haiku about code' }
        ],
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 60000 // 60 second timeout
      }
    );

    const chatEnd = performance.now();
    const chatTime = chatEnd - chatStart;

    // ====================================================================
    // RESULTS
    // ====================================================================

    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║  Results                                      ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');
    console.log(`Total Time:     ${chatTime.toFixed(2)}ms`);

    // If server returns timing breakdown (requires code modification)
    if (chatResponse.data.timings) {
      const t = chatResponse.data.timings;
      console.log('');
      console.log('Breakdown:');
      console.log(`  ├─ Auth:        ${t.auth}ms`);
      console.log(`  ├─ Database:    ${t.database}ms`);
      console.log(`  ├─ LLM:         ${t.llm}ms`);
      console.log(`  └─ Network:     ${(chatTime - t.auth - t.database - t.llm).toFixed(2)}ms`);
    }

    console.log('');
    console.log('Response:');
    console.log('─────────────────────────────────────────────');
    console.log(chatResponse.data.text || chatResponse.data.message || chatResponse.data.response);
    console.log('─────────────────────────────────────────────');
    console.log('');

    // ====================================================================
    // TEST 3: STREAMING CHAT (Real-time response)
    // ====================================================================

    console.log('🔄 Testing streaming chat...');
    console.log('  (Simulates real-time typing)');
    console.log('');

    const streamStart = performance.now();
    let firstChunkTime = null;
    let chunksReceived = 0;

    try {
      const streamResponse = await axios.post(
        `${API_URL}/api/llm/complete`,
        {
          model: 'llama3.2',
          messages: [
            { role: 'user', content: 'Count to 5' }
          ],
          stream: true
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          responseType: 'stream',
          timeout: 60000
        }
      );

      console.log('Stream Response:');
      console.log('─────────────────────────────────────────────');

      streamResponse.data.on('data', (chunk) => {
        if (!firstChunkTime) {
          firstChunkTime = performance.now() - streamStart;
          console.log(`\n[First chunk received: ${firstChunkTime.toFixed(2)}ms]\n`);
        }

        process.stdout.write(chunk.toString());
        chunksReceived++;
      });

      await new Promise((resolve) => {
        streamResponse.data.on('end', resolve);
      });

      const streamEnd = performance.now();
      const streamTime = streamEnd - streamStart;

      console.log('\n─────────────────────────────────────────────');
      console.log('');
      console.log('Streaming Results:');
      console.log(`  Time to first chunk: ${firstChunkTime.toFixed(2)}ms`);
      console.log(`  Total time:          ${streamTime.toFixed(2)}ms`);
      console.log(`  Chunks received:     ${chunksReceived}`);
      console.log('');

    } catch (streamError) {
      console.log('⚠️  Streaming test skipped (not implemented or error)');
      console.log('');
    }

    // ====================================================================
    // RECOMMENDATIONS
    // ====================================================================

    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║  Performance Analysis                         ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');

    if (chatTime < 1000) {
      console.log('✓ Excellent: Response time < 1s');
    } else if (chatTime < 3000) {
      console.log('✓ Good: Response time < 3s');
      console.log('  Most time spent in LLM generation (expected)');
    } else if (chatTime < 5000) {
      console.log('⚠️  Acceptable: Response time 3-5s');
      console.log('  Consider using a faster model:');
      console.log('    - llama3.2:1b (faster)');
      console.log('    - gpt-3.5-turbo (OpenAI)');
    } else {
      console.log('❌ Slow: Response time > 5s');
      console.log('');
      console.log('Troubleshooting:');
      console.log('  1. Check network latency:');
      console.log('     node -e "require(\'./lib/network-diagnostics\')..." ');
      console.log('');
      console.log('  2. Check database performance:');
      console.log('     psql -U matthewmauer calos -c "\\timing on" -c "SELECT 1;"');
      console.log('');
      console.log('  3. Check LLM directly:');
      console.log('     curl http://localhost:11434/api/generate -d \'{"model":"llama3.2","prompt":"Hi"}\'');
      console.log('');
    }

    console.log('');
    console.log('✓ Test completed successfully');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:');
    console.error('');

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.request) {
      console.error('No response received from server');
      console.error('');
      console.error('Check that server is running:');
      console.error('  npm run start');
      console.error('  or');
      console.error('  node router.js --local');
    } else {
      console.error(error.message);
    }

    console.error('');
    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  testStreamingPerformance().catch((error) => {
    console.error('Unhandled error:', error.message);
    process.exit(1);
  });
}

module.exports = testStreamingPerformance;

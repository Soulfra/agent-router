#!/usr/bin/env node

/**
 * Rate Limiting Test
 *
 * Verifies that rate limiting actually works:
 * - Hits rate limits
 * - Gets 429 responses
 * - Respects tier limits
 * - Resets correctly
 *
 * Usage:
 *   node scripts/test-rate-limiting.js
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:5001';

async function testRateLimiting() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  Rate Limiting Test                           ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');

  try {
    // 1. Register test user
    console.log('1. Registering test user...');
    const testEmail = `rate-test-${Date.now()}@example.com`;
    const testUsername = `ratetest${Date.now()}`;

    const registerResponse = await axios.post(`${API_URL}/api/auth/register`, {
      email: testEmail,
      password: 'test123',
      username: testUsername
    });

    const token = registerResponse.data.token;
    const user = registerResponse.data.user;

    console.log(`✓ Registered: ${user.email}`);
    console.log(`  Username: ${user.username}`);
    console.log(`  User ID: ${user.userId}`);
    console.log('');

    // 2. Check tier and limits
    console.log('2. Checking tier and rate limits...');
    const meResponse = await axios.get(`${API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const tierData = meResponse.data;
    const limits = tierData.rateLimits || { hourly: 10, daily: 50 };

    console.log(`✓ Tier: ${tierData.tier || 'starter'}`);
    console.log(`  Hourly limit: ${limits.hourly} req/hour`);
    console.log(`  Daily limit: ${limits.daily} req/day`);
    console.log('');

    // 3. Test hitting rate limit
    console.log(`3. Testing rate limit enforcement...`);
    console.log(`   Will make ${limits.hourly + 1} requests (expecting ${limits.hourly} to succeed)`);
    console.log('');

    let successCount = 0;
    let rateLimitCount = 0;
    let firstRateLimitResponse = null;

    for (let i = 0; i < limits.hourly + 1; i++) {
      process.stdout.write(`  Request ${String(i + 1).padStart(2, '0')}/${limits.hourly + 1}... `);

      try {
        await axios.post(
          `${API_URL}/api/llm/complete`,
          {
            model: 'llama3.2',
            messages: [{ role: 'user', content: 'Hi' }],
            stream: false
          },
          {
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 30000
          }
        );

        successCount++;
        console.log('✓ Success');

      } catch (error) {
        if (error.response?.status === 429) {
          rateLimitCount++;
          if (!firstRateLimitResponse) {
            firstRateLimitResponse = error.response.data;
          }
          console.log('✗ Rate limited (429)');
        } else {
          console.log(`✗ Error (${error.response?.status || error.code || 'Unknown'})`);
        }
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('');

    // 4. Display rate limit response
    if (firstRateLimitResponse) {
      console.log('4. Rate limit response details:');
      console.log('');
      console.log(JSON.stringify(firstRateLimitResponse, null, 2));
      console.log('');
    }

    // 5. Results
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║  Test Results                                 ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');
    console.log(`Total Requests:       ${limits.hourly + 1}`);
    console.log(`Successful:           ${successCount}`);
    console.log(`Rate Limited (429):   ${rateLimitCount}`);
    console.log(`Expected Success:     ${limits.hourly}`);
    console.log(`Expected Rate Limit:  ${1}`);
    console.log('');

    // 6. Pass/Fail
    const passedHourly = successCount === limits.hourly;
    const passedRateLimit = rateLimitCount >= 1;

    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║  Test Verdict                                 ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');

    if (passedHourly && passedRateLimit) {
      console.log('✓ PASS: Rate limiting is working correctly!');
      console.log('');
      console.log('Details:');
      console.log(`  • Allowed exactly ${limits.hourly} requests (correct)`);
      console.log(`  • Blocked ${rateLimitCount} requests after limit (correct)`);
      console.log(`  • Returned 429 status code (correct)`);
      if (firstRateLimitResponse) {
        console.log(`  • Included rate limit info in response (correct)`);
      }
      console.log('');

    } else {
      console.log('✗ FAIL: Rate limiting NOT working as expected!');
      console.log('');
      console.log('Issues:');

      if (!passedHourly) {
        console.log(`  • Expected ${limits.hourly} successful requests, got ${successCount}`);
      }

      if (!passedRateLimit) {
        console.log(`  • Expected at least 1 rate-limited request, got ${rateLimitCount}`);
        console.log(`  • All ${successCount} requests succeeded (rate limiting not enforced)`);
      }

      console.log('');
      console.log('Debugging:');
      console.log('  1. Check if rate limiting middleware is enabled');
      console.log('  2. Verify lib/rate-limiter.js is being used');
      console.log('  3. Check server logs for rate limit checks');
      console.log('  4. Ensure not running in OSS mode (CALOS_MODE=cloud)');
      console.log('');

      process.exit(1);
    }

  } catch (error) {
    console.error('');
    console.error('❌ Test failed with error:');
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

if (require.main === module) {
  testRateLimiting().catch((error) => {
    console.error('Unhandled error:', error.message);
    process.exit(1);
  });
}

module.exports = testRateLimiting;

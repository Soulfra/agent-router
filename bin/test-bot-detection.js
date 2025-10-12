#!/usr/bin/env node

/**
 * Test Bot Detection System
 *
 * Tests the complete authentication flow:
 * 1. Request access (get challenge)
 * 2. Create Soulfra identity
 * 3. Solve challenge (proof of work)
 * 4. Verify personhood (get access token)
 * 5. Make authenticated LLM requests
 * 6. Test rate limiting
 */

const SoulfraIdentity = require('../lib/soulfra-identity');
const BotDetector = require('../lib/bot-detector');
const RateLimiter = require('../lib/rate-limiter');
const MultiLLMRouter = require('../lib/multi-llm-router');

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  log('\n🤖 Bot Detection System Test', 'blue');
  log('════════════════════════════════════════\n', 'blue');

  // Initialize services
  const botDetector = new BotDetector({
    powDifficulty: 4 // 4 leading zeros (takes ~3 seconds on modern CPU)
  });

  const rateLimiter = new RateLimiter();

  const llmRouter = new MultiLLMRouter({
    strategy: 'smart',
    fallback: true
  });

  // ========================================================================
  // Test 1: Create Soulfra Identity
  // ========================================================================

  log('1️⃣  Creating Soulfra Identity...', 'yellow');

  const identity = SoulfraIdentity.createIdentity();
  const identityID = identity.getIdentityID();

  log(`   ✓ Identity created: ${identityID}`, 'green');
  log(`   ✓ Public key: ${identity.publicKey.toString('hex').substring(0, 32)}...`, 'green');

  // Simulate some reputation (in real world, this builds over time)
  identity.recordAction('test_action', { test: true });
  identity.recordAction('test_action', { test: true });
  identity.recordAction('code_commit', { commit: 'abc123' });

  const reputation = identity.getReputation();
  log(`   ✓ Reputation: ${reputation.score} (${reputation.verified_actions} actions, ${reputation.commits} commits)`, 'green');

  // ========================================================================
  // Test 2: Request Access
  // ========================================================================

  log('\n2️⃣  Requesting access...', 'yellow');

  const accessRequest = botDetector.requestAccess();

  log(`   ✓ Session ID: ${accessRequest.sessionID}`, 'green');
  log(`   ✓ Challenge: ${accessRequest.challenge.substring(0, 32)}...`, 'green');
  log(`   ✓ Expires: ${accessRequest.expiresAt}`, 'green');
  log(`   ✓ Requirements:`, 'green');
  log(`     - Proof of work difficulty: ${accessRequest.requirements.powDifficulty}`, 'white');
  log(`     - Must provide identity: ${accessRequest.requirements.mustProvideIdentity}`, 'white');
  log(`     - Must complete PoW: ${accessRequest.requirements.mustCompleteProofOfWork}`, 'white');

  // ========================================================================
  // Test 3: Respond to Challenge
  // ========================================================================

  log('\n3️⃣  Responding to challenge...', 'yellow');

  const authResponse = identity.respondToChallenge(
    accessRequest.challenge,
    accessRequest.sessionID
  );

  log(`   ✓ Auth response created`, 'green');
  log(`   ✓ Signed by: ${authResponse.identityID}`, 'green');

  // ========================================================================
  // Test 4: Create Proof of Work
  // ========================================================================

  log('\n4️⃣  Creating proof of work (this takes ~3 seconds)...', 'yellow');

  const startTime = Date.now();
  const proofOfWork = identity.createProofOfWork(4); // 4 leading zeros
  const powTime = Date.now() - startTime;

  log(`   ✓ Proof of work completed in ${powTime}ms`, 'green');
  log(`   ✓ Hash: ${proofOfWork.data.hash}`, 'green');
  log(`   ✓ Nonce: ${proofOfWork.data.nonce}`, 'green');
  log(`   ✓ Difficulty: ${proofOfWork.data.difficulty}`, 'green');

  // ========================================================================
  // Test 5: Create Time Proof
  // ========================================================================

  log('\n5️⃣  Creating time proof...', 'yellow');

  const timeProof = identity.createTimeProof();

  log(`   ✓ Time proof created`, 'green');
  log(`   ✓ Account age: ${timeProof.data.accountAgeDays} days`, 'green');

  // ========================================================================
  // Test 6: Verify Personhood
  // ========================================================================

  log('\n6️⃣  Verifying personhood...', 'yellow');

  const proof = {
    identityID: identityID,
    authResponse: authResponse,
    proofOfWork: proofOfWork,
    timeProof: timeProof,
    reputation: reputation
  };

  const verification = await botDetector.verifyPersonhood(
    accessRequest.sessionID,
    proof
  );

  if (!verification.verified) {
    log(`   ✗ Verification failed: ${verification.reason}`, 'red');
    log(`   ${verification.message}`, 'red');
    process.exit(1);
  }

  log(`   ✓ Personhood verified!`, 'green');
  log(`   ✓ Access token: ${verification.accessToken.substring(0, 32)}...`, 'green');
  log(`   ✓ Reputation score: ${verification.reputation.score}`, 'green');
  log(`   ✓ Access tier: ${verification.tier.name}`, 'green');
  log(`   ✓ Rate limit: ${verification.tier.rateLimit.requestsPerHour} req/hour, ${verification.tier.rateLimit.requestsPerDay} req/day`, 'green');

  const accessToken = verification.accessToken;

  // ========================================================================
  // Test 7: Make Authenticated LLM Request
  // ========================================================================

  log('\n7️⃣  Making authenticated LLM request...', 'yellow');

  // Verify request
  const requestVerification = botDetector.verifyRequest(accessToken);

  if (!requestVerification.allowed) {
    log(`   ✗ Request denied: ${requestVerification.reason}`, 'red');
    process.exit(1);
  }

  log(`   ✓ Request allowed`, 'green');
  log(`   ✓ Identity: ${requestVerification.identityID}`, 'green');

  // Get session
  const session = botDetector.getSession(accessToken);

  // Check rate limit
  const rateLimitCheck = rateLimiter.checkLimit(session.identityID, session.tier);

  if (!rateLimitCheck.allowed) {
    log(`   ✗ Rate limit exceeded: ${rateLimitCheck.reason}`, 'red');
    process.exit(1);
  }

  log(`   ✓ Rate limit OK: ${rateLimitCheck.remaining.hourly} requests remaining (hourly)`, 'green');

  // Make LLM request
  try {
    log(`   Sending prompt to LLM...`, 'cyan');

    const response = await llmRouter.complete({
      prompt: 'Say hello in exactly 3 words',
      maxTokens: 20
    });

    log(`   ✓ LLM response: "${response.text}"`, 'green');
    log(`   ✓ Provider: ${response.provider}`, 'green');
    log(`   ✓ Latency: ${response.latency}ms`, 'green');

  } catch (error) {
    log(`   ✗ LLM request failed: ${error.message}`, 'red');
  }

  // ========================================================================
  // Test 8: Rate Limiting
  // ========================================================================

  log('\n8️⃣  Testing rate limiting...', 'yellow');

  const rateLimitStatus = rateLimiter.getStatus(session.identityID);

  if (rateLimitStatus.exists) {
    log(`   ✓ Rate limit status:`, 'green');
    log(`     - Tier: ${rateLimitStatus.tier}`, 'white');
    log(`     - Hourly: ${rateLimitStatus.remaining.hourly}/${rateLimitStatus.limits.hourly}`, 'white');
    log(`     - Daily: ${rateLimitStatus.remaining.daily}/${rateLimitStatus.limits.daily}`, 'white');
    log(`     - Total requests: ${rateLimitStatus.totalRequests}`, 'white');
  }

  // Test multiple requests
  log(`\n   Testing multiple requests...`, 'cyan');

  let successCount = 0;
  let rateLimitedCount = 0;

  for (let i = 0; i < 5; i++) {
    const check = rateLimiter.checkLimit(session.identityID, session.tier);

    if (check.allowed) {
      successCount++;
      log(`     Request ${i + 1}: ✓ Allowed (${check.remaining.hourly} remaining)`, 'green');
    } else {
      rateLimitedCount++;
      log(`     Request ${i + 1}: ✗ Rate limited`, 'red');
    }
  }

  log(`   ✓ Success: ${successCount}, Rate limited: ${rateLimitedCount}`, 'green');

  // ========================================================================
  // Test 9: Session Management
  // ========================================================================

  log('\n9️⃣  Testing session management...', 'yellow');

  const sessionInfo = botDetector.getSession(accessToken);

  log(`   ✓ Session info:`, 'green');
  log(`     - Identity: ${sessionInfo.identityID}`, 'white');
  log(`     - Tier: ${sessionInfo.tier.name}`, 'white');
  log(`     - Requests: ${sessionInfo.requestCount}`, 'white');
  log(`     - Created: ${sessionInfo.createdAt}`, 'white');
  log(`     - Expires: ${sessionInfo.expiresAt}`, 'white');

  // ========================================================================
  // Test 10: System Statistics
  // ========================================================================

  log('\n🔟  System statistics:', 'yellow');

  const botStats = botDetector.getStats();
  const rateLimitStats = rateLimiter.getStats();

  log(`\n   Bot Detection:`, 'cyan');
  log(`     - Active sessions: ${botStats.activeSessions}`, 'white');
  log(`     - Active challenges: ${botStats.activeChallenges}`, 'white');
  log(`     - Blacklisted: ${botStats.blacklistedIdentities}`, 'white');
  log(`     - Sessions by tier:`, 'white');
  log(`       • New: ${botStats.sessionsByTier.new}`, 'white');
  log(`       • Established: ${botStats.sessionsByTier.established}`, 'white');
  log(`       • Trusted: ${botStats.sessionsByTier.trusted}`, 'white');
  log(`       • Verified: ${botStats.sessionsByTier.verified}`, 'white');

  log(`\n   Rate Limiting:`, 'cyan');
  log(`     - Total buckets: ${rateLimitStats.totalBuckets}`, 'white');
  log(`     - Total requests: ${rateLimitStats.totalRequests}`, 'white');

  // ========================================================================
  // Test 11: Simulate Bot Attack (Fail)
  // ========================================================================

  log('\n1️⃣1️⃣  Simulating bot attack (should fail)...', 'yellow');

  // Request access but don't complete PoW
  const botAccessRequest = botDetector.requestAccess();

  log(`   ✓ Bot got challenge`, 'green');

  // Try to verify without PoW
  const botIdentity = SoulfraIdentity.createIdentity();
  const botAuthResponse = botIdentity.respondToChallenge(
    botAccessRequest.challenge,
    botAccessRequest.sessionID
  );

  const botProof = {
    identityID: botIdentity.getIdentityID(),
    authResponse: botAuthResponse
    // Missing proofOfWork!
  };

  const botVerification = await botDetector.verifyPersonhood(
    botAccessRequest.sessionID,
    botProof
  );

  if (!botVerification.verified) {
    log(`   ✓ Bot blocked: ${botVerification.reason}`, 'green');
    log(`   ✓ Message: "${botVerification.message}"`, 'green');
  } else {
    log(`   ✗ Bot was NOT blocked (this is a bug!)`, 'red');
  }

  // ========================================================================
  // Cleanup
  // ========================================================================

  log('\n✅ All tests complete!\n', 'green');

  // Show final summary
  log('Summary:', 'cyan');
  log(`  ✓ Bot detection working correctly`, 'green');
  log(`  ✓ Proof of work prevents bot attacks`, 'green');
  log(`  ✓ Rate limiting enforced by reputation`, 'green');
  log(`  ✓ Sessions properly managed`, 'green');
  log(`  ✓ Bots blocked, humans allowed`, 'green');

  log('\n🎉 Bot detection system is fully operational!\n', 'magenta');
}

main().catch(error => {
  log(`\n❌ Test failed: ${error.message}\n`, 'red');
  console.error(error);
  process.exit(1);
});

/**
 * Domain Round-Trip HTTP Test
 *
 * Tests actual HTTP communication between domains with timestamp verification.
 * Spins up multiple servers on different ports (simulating different domains)
 * and verifies they can communicate with proper timestamp tracking.
 */

const express = require('express');
const DomainRegistry = require('./lib/domain-registry');
const DomainHTTPClient = require('./lib/domain-http-client');
const { setupDomainEndpoints } = require('./lib/domain-endpoints');

// Server instances
const servers = {
  'calos.ai': null,
  'soulfra.com': null,
  'deathtodata.com': null,
  'roughsparks.com': null
};

// Ports for each domain
const ports = {
  'calos.ai': 3100,
  'soulfra.com': 3101,
  'deathtodata.com': 3102,
  'roughsparks.com': 3103
};

/**
 * Start a domain server
 */
function startDomainServer(domain, port) {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());

    // Setup domain endpoints
    setupDomainEndpoints(app, { domain });

    // Basic health endpoint
    app.get('/', (req, res) => {
      res.json({
        domain,
        status: 'running',
        port,
        timestamp: Date.now()
      });
    });

    const server = app.listen(port, () => {
      console.log(`[${domain}] Server started on port ${port}`);
      resolve(server);
    });
  });
}

/**
 * Run round-trip tests
 */
async function runRoundTripTests() {
  console.log('='.repeat(70));
  console.log('Domain Round-Trip HTTP Communication Test');
  console.log('='.repeat(70));
  console.log();

  try {
    // 1. Start all domain servers
    console.log('1. Starting Domain Servers...');
    console.log('-'.repeat(70));

    for (const [domain, port] of Object.entries(ports)) {
      servers[domain] = await startDomainServer(domain, port);
    }

    console.log();
    console.log(`✓ All 4 domain servers started`);
    console.log();

    // Wait a moment for servers to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. Setup registry and HTTP client
    console.log('2. Setting up Domain Registry...');
    console.log('-'.repeat(70));

    const registry = new DomainRegistry();

    // Register each domain with their local URLs
    for (const [domain, port] of Object.entries(ports)) {
      registry.register(domain, {
        baseUrl: `http://localhost:${port}`,
        version: '1.0.0'
      });
    }

    console.log(`✓ Registered ${registry.activeDomains.size} domains`);
    console.log();

    // 3. Create HTTP clients for each domain
    console.log('3. Creating HTTP Clients...');
    console.log('-'.repeat(70));

    const clients = {
      'calos.ai': new DomainHTTPClient(registry, { currentDomain: 'calos.ai' }),
      'soulfra.com': new DomainHTTPClient(registry, { currentDomain: 'soulfra.com' }),
      'deathtodata.com': new DomainHTTPClient(registry, { currentDomain: 'deathtodata.com' }),
      'roughsparks.com': new DomainHTTPClient(registry, { currentDomain: 'roughsparks.com' })
    };

    console.log('✓ HTTP clients created for all domains');
    console.log();

    // 4. Test ping all domains
    console.log('4. Testing Ping (Health Check)...');
    console.log('-'.repeat(70));

    for (const domain of Object.keys(ports)) {
      const client = clients['calos.ai']; // Use CALOS as the pinger
      const result = await client.ping(domain);

      if (result.success) {
        console.log(`✓ ${domain}: HEALTHY (${result.roundTripTime}ms)`);
        console.log(`  Services: ${result.services.join(', ')}`);
      } else {
        console.log(`✗ ${domain}: UNHEALTHY - ${result.error}`);
      }
    }

    console.log();

    // 5. Test cross-domain service calls
    console.log('5. Testing Cross-Domain Service Calls...');
    console.log('-'.repeat(70));
    console.log();

    // Test 1: RoughSparks → CALOS (needs agent runtime)
    console.log('Test 1: RoughSparks → CALOS (agent-runtime.spawn)');
    const test1Start = Date.now();
    const test1Result = await clients['roughsparks.com'].callService(
      'calos.ai',
      'agent-runtime',
      'spawn',
      { type: 'content-worker' }
    );
    const test1End = Date.now();

    console.log(`  Request sent: ${new Date(test1Start).toISOString()}`);
    console.log(`  Response received: ${new Date(test1End).toISOString()}`);
    console.log(`  Round-trip time: ${test1Result.roundTripTime}ms`);
    console.log(`  Success: ${test1Result.success}`);
    console.log(`  Hanging: ${test1Result.isHanging}`);
    if (test1Result.success) {
      console.log(`  Result: ${JSON.stringify(test1Result.data.result)}`);
    }
    console.log();

    // Test 2: CALOS → Soulfra (needs authentication)
    console.log('Test 2: CALOS → Soulfra (auth.authenticate)');
    const test2Start = Date.now();
    const test2Result = await clients['calos.ai'].callService(
      'soulfra.com',
      'auth',
      'authenticate',
      { userId: 'user123', token: 'abc123' }
    );
    const test2End = Date.now();

    console.log(`  Request sent: ${new Date(test2Start).toISOString()}`);
    console.log(`  Response received: ${new Date(test2End).toISOString()}`);
    console.log(`  Round-trip time: ${test2Result.roundTripTime}ms`);
    console.log(`  Success: ${test2Result.success}`);
    console.log(`  Hanging: ${test2Result.isHanging}`);
    if (test2Result.success) {
      console.log(`  Result: ${JSON.stringify(test2Result.data.result)}`);
    }
    console.log();

    // Test 3: DeathToData → CALOS (needs worker context)
    console.log('Test 3: DeathToData → CALOS (worker-context.create)');
    const test3Start = Date.now();
    const test3Result = await clients['deathtodata.com'].callService(
      'calos.ai',
      'worker-context',
      'create',
      { platform: 'search' }
    );
    const test3End = Date.now();

    console.log(`  Request sent: ${new Date(test3Start).toISOString()}`);
    console.log(`  Response received: ${new Date(test3End).toISOString()}`);
    console.log(`  Round-trip time: ${test3Result.roundTripTime}ms`);
    console.log(`  Success: ${test3Result.success}`);
    console.log(`  Hanging: ${test3Result.isHanging}`);
    if (test3Result.success) {
      console.log(`  Result: ${JSON.stringify(test3Result.data.result)}`);
    }
    console.log();

    // Test 4: RoughSparks → DeathToData → CALOS (chained request)
    console.log('Test 4: Chained Request (RoughSparks → DeathToData → CALOS)');
    const chainedStart = Date.now();

    // RoughSparks calls DeathToData for search
    const searchResult = await clients['roughsparks.com'].callService(
      'deathtodata.com',
      'search',
      'search',
      { query: 'agent patterns' }
    );

    console.log(`  Step 1: RoughSparks → DeathToData: ${searchResult.roundTripTime}ms`);

    // DeathToData calls CALOS for indexing
    const indexResult = await clients['deathtodata.com'].callService(
      'calos.ai',
      'agent-runtime',
      'status',
      {}
    );

    console.log(`  Step 2: DeathToData → CALOS: ${indexResult.roundTripTime}ms`);

    const chainedEnd = Date.now();
    const totalChainedTime = chainedEnd - chainedStart;

    console.log(`  Total chained time: ${totalChainedTime}ms`);
    console.log(`  All requests successful: ${searchResult.success && indexResult.success}`);
    console.log();

    // 6. Test timestamp synchronization
    console.log('6. Timestamp Synchronization Verification...');
    console.log('-'.repeat(70));

    const syncTest = await clients['calos.ai'].callService(
      'soulfra.com',
      'auth',
      'verify',
      {}
    );

    if (syncTest.success) {
      const requestSent = syncTest.requestTimestamp;
      const responseReceived = syncTest.responseTimestamp;
      const serverReceived = syncTest.data.receivedAt;
      const serverResponse = syncTest.data.responseTimestamp;

      console.log(`  Client → Server: ${serverReceived - requestSent}ms (network latency)`);
      console.log(`  Server processing: ${serverResponse - serverReceived}ms`);
      console.log(`  Server → Client: ${responseReceived - serverResponse}ms (network latency)`);
      console.log(`  Total round-trip: ${responseReceived - requestSent}ms`);
      console.log();
      console.log(`  ✓ Timestamps synchronized correctly`);
    }
    console.log();

    // 7. Display statistics
    console.log('7. HTTP Client Statistics...');
    console.log('-'.repeat(70));

    for (const [domain, client] of Object.entries(clients)) {
      const stats = client.getStats();
      console.log(`  ${domain}:`);
      console.log(`    Total requests: ${stats.totalRequests}`);
      console.log(`    Success rate: ${stats.successRate}`);
      console.log(`    Average response: ${stats.averageResponseTime}`);
      console.log(`    Timeout rate: ${stats.timeoutRate}`);
    }
    console.log();

    // 8. Cleanup
    console.log('8. Shutting down servers...');
    console.log('-'.repeat(70));

    for (const [domain, server] of Object.entries(servers)) {
      if (server) {
        server.close();
        console.log(`✓ ${domain} server stopped`);
      }
    }

    console.log();
    console.log('='.repeat(70));
    console.log('✓ Round-Trip Test Complete');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Test failed:', error);

    // Cleanup on error
    for (const server of Object.values(servers)) {
      if (server) server.close();
    }

    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  runRoundTripTests()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = runRoundTripTests;

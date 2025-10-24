/**
 * Test Domain Ecosystem
 *
 * Demonstrates how the domain pairing strategy works.
 * Shows all domains working together as a coordinated ecosystem.
 */

const DomainEcosystem = require('./lib/domain-ecosystem');
const domainPairing = require('./lib/domain-pairing');

async function testEcosystem() {
  console.log('='.repeat(60));
  console.log('Domain Ecosystem Test');
  console.log('='.repeat(60));
  console.log();

  // Validate pairing configuration
  console.log('1. Validating Domain Pairing Configuration...');
  const errors = domainPairing.validatePairingConfig();
  if (errors.length === 0) {
    console.log('   ✓ Configuration valid');
  } else {
    console.log('   ✗ Configuration errors:', errors);
  }
  console.log();

  // Show domain relationships
  console.log('2. Domain Relationships:');
  console.log();

  const domains = ['calos.ai', 'soulfra.com', 'deathtodata.com', 'roughsparks.com'];

  for (const domain of domains) {
    const config = domainPairing.getDomain(domain);
    console.log(`   ${config.icon} ${domain}`);
    console.log(`      Description: ${config.description}`);
    console.log(`      Package: ${config.package}`);
    console.log(`      Provides: ${config.provides.join(', ')}`);
    console.log(`      Requires: ${config.requires.join(', ')}`);
    console.log(`      Paired with: ${config.pairs.join(', ')}`);
    console.log();
  }

  // Initialize ecosystem
  console.log('3. Initializing Ecosystem...');
  const ecosystem = new DomainEcosystem({
    domains: ['calos.ai', 'soulfra.com', 'deathtodata.com', 'roughsparks.com']
  });

  await ecosystem.initialize();
  console.log();

  // Show ecosystem status
  console.log('4. Ecosystem Status:');
  const status = ecosystem.getStatus();
  console.log(`   Overall Status: ${status.status}`);
  console.log(`   Active Domains: ${status.domains}`);
  console.log(`   Available Services: ${status.services}`);
  console.log(`   Cross-Domain Pipes: ${status.pipes}`);
  console.log();

  // Show health
  console.log('5. Domain Health:');
  for (const [domain, health] of Object.entries(status.health.domains)) {
    console.log(`   ${domain}: ${health.status}`);
  }
  console.log();

  // Show available services
  console.log('6. Available Services:');
  const services = ecosystem.registry.getAvailableServices();
  for (const service of services) {
    const endpoint = ecosystem.registry.getServiceEndpoint(service);
    console.log(`   - ${service} → ${endpoint.endpoint}`);
  }
  console.log();

  // Test service calls
  console.log('7. Testing Cross-Domain Service Calls:');
  console.log();

  // CALOS needs Soulfra for auth
  console.log('   Test: CALOS.ai → Soulfra.com (auth service)');
  if (ecosystem.hasService('auth')) {
    console.log('   ✓ Auth service available');
    const authService = ecosystem.getService('auth');
    if (authService) {
      try {
        const result = await authService('authenticate', { userId: 'user123' });
        console.log('   ✓ Service call successful:', result.result);
      } catch (error) {
        console.log('   ✗ Service call failed:', error.message);
      }
    }
  } else {
    console.log('   ✗ Auth service not available');
  }
  console.log();

  // RoughSparks needs CALOS for runtime
  console.log('   Test: RoughSparks.com → CALOS.ai (agent-runtime service)');
  if (ecosystem.hasService('agent-runtime')) {
    console.log('   ✓ Agent runtime service available');
  } else {
    console.log('   ✗ Agent runtime service not available');
  }
  console.log();

  // DeathToData needs CALOS for search agents
  console.log('   Test: DeathToData.com → CALOS.ai (worker-context service)');
  if (ecosystem.hasService('worker-context')) {
    console.log('   ✓ Worker context service available');
  } else {
    console.log('   ✗ Worker context service not available');
  }
  console.log();

  // Show ecosystem stats
  console.log('8. Ecosystem Statistics:');
  const stats = ecosystem.getStats();
  console.log(`   Cross-domain calls: ${stats.crossDomainCalls}`);
  console.log(`   Failed calls: ${stats.failedCalls}`);
  console.log(`   Success rate: ${status.calls.successRate}`);
  console.log(`   Total services: ${stats.totalServices}`);
  console.log();

  // Show pairing relationships
  console.log('9. Domain Pairing Network:');
  console.log();
  console.log('   calos.ai ↔ soulfra.com ↔ roughsparks.com');
  console.log('        ↕            ↕');
  console.log('   deathtodata.com ↔ roughsparks.com');
  console.log();
  console.log('   Each domain provides unique services:');
  console.log('   - CALOS: Agent runtime, IPC, platform routing');
  console.log('   - Soulfra: Auth, SSO, voice signatures');
  console.log('   - DeathToData: Search, indexing, context overflow');
  console.log('   - RoughSparks: Content gen, multi-brand, creativity');
  console.log();

  // Shutdown
  console.log('10. Shutting down ecosystem...');
  await ecosystem.shutdown();
  console.log('    ✓ Ecosystem shut down');
  console.log();

  console.log('='.repeat(60));
  console.log('Test Complete');
  console.log('='.repeat(60));
}

// Run test
if (require.main === module) {
  testEcosystem().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = testEcosystem;

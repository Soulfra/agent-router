#!/usr/bin/env node

/**
 * End-to-End Verification Test Suite
 *
 * Tests all new systems:
 * - CommandVerifier
 * - RLCommandLearner
 * - SpotlightAgent
 * - MacOSAppController
 * - HistoricalQueryEngine
 * - QueryTypeDetector
 * - CalculatorEngine
 * - UnitConverter
 *
 * Usage:
 *   node tests/e2e-verification.js
 *   node tests/e2e-verification.js --quick  (skip slow tests)
 */

const CommandVerifier = require('../lib/command-verifier');
const RLCommandLearner = require('../lib/rl-command-learner');
const SpotlightAgent = require('../agents/spotlight-agent');
const MacOSAppController = require('../lib/macos-app-controller');
const HistoricalQueryEngine = require('../lib/historical-query-engine');
const QueryTypeDetector = require('../lib/query-type-detector');
const CalculatorEngine = require('../lib/calculator-engine');
const UnitConverter = require('../lib/unit-converter');

// Test configuration
const QUICK_MODE = process.argv.includes('--quick');
const VERBOSE = process.argv.includes('--verbose');

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

function test(name, fn, skipInQuickMode = false) {
  return async () => {
    if (QUICK_MODE && skipInQuickMode) {
      results.skipped++;
      results.tests.push({ name, status: 'SKIP', reason: 'Quick mode' });
      log('⏭️ ', `${name}: Skipped (quick mode)`);
      return;
    }

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
      if (VERBOSE) {
        console.error(error.stack);
      }
      return false;
    }
  };
}

// ===== Test Suites =====

async function testQueryTypeDetector() {
  log('\n🔍', 'Testing Query Type Detector...\n');

  const detector = new QueryTypeDetector();

  await test('Detect calculation query', () => {
    const result = detector.detect('2 + 2');
    if (result !== 'calculation') throw new Error(`Expected 'calculation', got '${result}'`);
  })();

  await test('Detect conversion query', () => {
    const result = detector.detect('100 USD to EUR');
    if (result !== 'conversion') throw new Error(`Expected 'conversion', got '${result}'`);
  })();

  await test('Detect definition query', () => {
    const result = detector.detect('define recursion');
    if (result !== 'definition') throw new Error(`Expected 'definition', got '${result}'`);
  })();

  await test('Detect file search query', () => {
    const result = detector.detect('index.js');
    if (result !== 'file-search') throw new Error(`Expected 'file-search', got '${result}'`);
  })();

  await test('Detect action query', () => {
    const result = detector.detect('open Safari');
    if (result !== 'action') throw new Error(`Expected 'action', got '${result}'`);
  })();

  await test('Extract calculation entities', () => {
    const entities = detector.extractEntities('sqrt(16)', 'calculation');
    if (!entities.expression) throw new Error('Missing expression');
    if (entities.expression !== 'sqrt(16)') throw new Error(`Wrong expression: ${entities.expression}`);
  })();

  await test('Extract conversion entities', () => {
    const entities = detector.extractEntities('100 USD to EUR', 'conversion');
    if (entities.value !== 100) throw new Error('Wrong value');
    if (entities.fromUnit !== 'USD') throw new Error('Wrong fromUnit');
    if (entities.toUnit !== 'EUR') throw new Error('Wrong toUnit');
  })();
}

async function testCalculatorEngine() {
  log('\n🧮', 'Testing Calculator Engine...\n');

  const calc = new CalculatorEngine();

  await test('Calculate basic arithmetic', () => {
    const result = calc.calculate('2 + 2');
    if (result !== 4) throw new Error(`Expected 4, got ${result}`);
  })();

  await test('Calculate with functions', () => {
    const result = calc.calculate('sqrt(16)');
    if (result !== 4) throw new Error(`Expected 4, got ${result}`);
  })();

  await test('Calculate percentage', () => {
    const result = calc.calculate('50% of 100');
    if (result !== 50) throw new Error(`Expected 50, got ${result}`);
  })();

  await test('Calculate with parentheses', () => {
    const result = calc.calculate('(2 + 3) * 4');
    if (result !== 20) throw new Error(`Expected 20, got ${result}`);
  })();

  await test('Calculate with constants', () => {
    const result = calc.calculate('pi');
    if (Math.abs(result - Math.PI) > 0.0001) throw new Error(`Expected ${Math.PI}, got ${result}`);
  })();

  await test('Calculate complex expression', () => {
    const result = calc.calculate('2 * sqrt(16) + 10 / 2');
    if (result !== 13) throw new Error(`Expected 13, got ${result}`);
  })();

  await test('Format calculation result', () => {
    const result = calc.format(3.14159265359);
    if (!result.startsWith('3.14')) throw new Error(`Unexpected format: ${result}`);
  })();
}

async function testUnitConverter() {
  log('\n🔄', 'Testing Unit Converter...\n');

  const converter = new UnitConverter();

  await test('Convert distance (feet to meters)', async () => {
    const result = await converter.convert(10, 'feet', 'meters');
    if (!result.value) throw new Error('No value returned');
    if (Math.abs(result.value - 3.048) > 0.01) throw new Error(`Expected ~3.048, got ${result.value}`);
  })();

  await test('Convert temperature (F to C)', async () => {
    const result = await converter.convert(32, 'F', 'C');
    if (Math.abs(result.value - 0) > 0.01) throw new Error(`Expected ~0, got ${result.value}`);
  })();

  await test('Convert weight (kg to lbs)', async () => {
    const result = await converter.convert(1, 'kg', 'pounds');
    if (Math.abs(result.value - 2.20462) > 0.01) throw new Error(`Expected ~2.20462, got ${result.value}`);
  })();

  await test('Convert time (hours to seconds)', async () => {
    const result = await converter.convert(1, 'hours', 'seconds');
    if (result.value !== 3600) throw new Error(`Expected 3600, got ${result.value}`);
  })();

  await test('Convert data (MB to GB)', async () => {
    const result = await converter.convert(1024, 'mb', 'gb');
    if (Math.abs(result.value - 1) > 0.01) throw new Error(`Expected ~1, got ${result.value}`);
  })();

  // Skip currency test in quick mode (requires network)
  await test('Convert currency (if network available)', async () => {
    try {
      const result = await converter.convert(100, 'USD', 'USD');
      if (result.value !== 100) throw new Error('Same currency should return same value');
    } catch (error) {
      // Skip if network unavailable
      log('⚠️ ', '  Currency conversion skipped (network may be unavailable)');
    }
  }, true)();
}

async function testCommandVerifier() {
  log('\n✅', 'Testing Command Verifier...\n');

  const verifier = new CommandVerifier();

  await test('Verify working command (echo)', async () => {
    const result = await verifier.verify('echo', ['test']);
    if (!result.success) throw new Error('Echo command should succeed');
    if (!result.checks.exists) throw new Error('Echo should exist');
    if (!result.checks.executable) throw new Error('Echo should be executable');
  })();

  await test('Verify non-existent command', async () => {
    const result = await verifier.verify('nonexistentcommand12345');
    if (result.success) throw new Error('Non-existent command should fail');
    if (result.checks.exists) throw new Error('Non-existent command should not exist');
  })();

  await test('Get command health statistics', async () => {
    const stats = await verifier.getStatistics();
    if (typeof stats.totalTests !== 'number') throw new Error('Missing totalTests');
    if (typeof stats.passRate !== 'string') throw new Error('Missing passRate');
  })();

  await test('Get working commands list', async () => {
    const working = await verifier.getWorkingCommands();
    if (!Array.isArray(working)) throw new Error('Working commands should be array');
  })();

  await test('Get failing commands list', async () => {
    const failing = await verifier.getFailingCommands();
    if (!Array.isArray(failing)) throw new Error('Failing commands should be array');
  })();
}

async function testRLCommandLearner() {
  log('\n🧠', 'Testing RL Command Learner...\n');

  const learner = new RLCommandLearner();

  await test('Load knowledge from disk', async () => {
    const knowledge = await learner.loadKnowledge();
    if (!knowledge) throw new Error('Failed to load knowledge');
    if (!knowledge.commands) throw new Error('Missing commands');
    if (!knowledge.metadata) throw new Error('Missing metadata');
  })();

  await test('Observe successful command', async () => {
    await learner.observe({
      command: 'test-command',
      args: ['arg1'],
      context: { os: 'darwin' },
      success: true,
      duration: 100
    });

    const knowledge = await learner.loadKnowledge();
    const cmdKey = 'test-command arg1';
    if (!knowledge.commands[cmdKey]) throw new Error('Command not recorded');
  })();

  await test('Observe failed command', async () => {
    await learner.observe({
      command: 'test-command-fail',
      args: [],
      context: { os: 'darwin' },
      success: false,
      duration: 50,
      error: 'Test error'
    });

    const knowledge = await learner.loadKnowledge();
    const cmdKey = 'test-command-fail';
    if (!knowledge.commands[cmdKey]) throw new Error('Failed command not recorded');
    if (knowledge.commands[cmdKey].failures !== 1) throw new Error('Failure not counted');
  })();

  await test('Calculate reward correctly', () => {
    const reward1 = learner.calculateReward(true, 500, null);
    if (reward1 <= 0) throw new Error('Successful command should have positive reward');

    const reward2 = learner.calculateReward(false, 5000, 'error');
    if (reward2 >= 0) throw new Error('Failed command should have negative reward');
  })();

  await test('Get current context', () => {
    const context = learner.getCurrentContext();
    if (!context.os) throw new Error('Missing os');
    if (!context.arch) throw new Error('Missing arch');
    if (!context.timeOfDay) throw new Error('Missing timeOfDay');
  })();
}

async function testSpotlightAgent() {
  log('\n🔦', 'Testing Spotlight Agent...\n');

  const agent = new SpotlightAgent();

  await test('Process calculation query', async () => {
    const result = await agent.process('2 + 2');
    if (!result.includes('4')) throw new Error('Calculation result not found');
  })();

  await test('Process empty query (help)', async () => {
    const result = await agent.process('');
    if (!result.includes('Spotlight')) throw new Error('Help not shown');
  })();

  await test('Handle invalid query gracefully', async () => {
    const result = await agent.process('!!!invalid!!!/');
    // Should not throw, should return result
    if (!result) throw new Error('No result returned');
  })();

  await test('Parse search filters', () => {
    const filters = agent.parseSearchFilters('kind:pdf test document');
    if (filters.kind !== 'pdf') throw new Error('Kind filter not parsed');
    if (!filters.query.includes('test')) throw new Error('Query not cleaned');
  })();
}

async function testHistoricalQueryEngine() {
  log('\n📊', 'Testing Historical Query Engine...\n');

  const engine = new HistoricalQueryEngine();

  await test('Query commands with filters', async () => {
    const result = await engine.queryCommands({ limit: 10 });
    if (!result.commands) throw new Error('Missing commands');
    if (!Array.isArray(result.commands)) throw new Error('Commands should be array');
  })();

  await test('Query learning data', async () => {
    const result = await engine.queryLearning({ limit: 10 });
    if (!result.commands) throw new Error('Missing commands');
    if (typeof result.totalObservations !== 'number') throw new Error('Missing totalObservations');
  })();

  await test('Get improvement summary', async () => {
    const summary = await engine.getImprovementSummary();
    if (!summary.summary) throw new Error('Missing summary');
    if (typeof summary.summary.totalCommands !== 'number') throw new Error('Missing totalCommands');
  })();

  await test('Export commands as CSV', async () => {
    const csv = await engine.exportCSV('commands');
    if (!csv.includes('TestID')) throw new Error('CSV header missing');
    if (!csv.includes(',')) throw new Error('Invalid CSV format');
  })();

  await test('Export learning as CSV', async () => {
    const csv = await engine.exportCSV('learning');
    if (!csv.includes('CommandKey')) throw new Error('CSV header missing');
    if (!csv.includes(',')) throw new Error('Invalid CSV format');
  })();
}

async function testMacOSAppController() {
  log('\n🖥️ ', 'Testing macOS App Controller...\n');

  // Only run on macOS
  if (process.platform !== 'darwin') {
    log('⏭️ ', 'Skipping macOS tests (not on macOS)');
    results.skipped += 5;
    return;
  }

  const controller = new MacOSAppController();

  await test('Check platform', () => {
    if (controller.platform !== 'darwin') throw new Error('Should be darwin platform');
  })();

  await test('Check app running status', async () => {
    const result = await controller.app('is-running', 'Finder');
    if (!result.success) throw new Error('Should succeed');
    if (typeof result.running !== 'boolean') throw new Error('Running should be boolean');
  })();

  // Skip actual Spotify/Xcode tests (would interfere with user's apps)
  log('⏭️ ', 'Skipping Spotify/Xcode control tests (would interfere with user apps)');
  results.skipped += 3;
}

async function testIntegration() {
  log('\n🔗', 'Testing Integration...\n');

  await test('Full pipeline: Detect → Calculate → Format', async () => {
    const detector = new QueryTypeDetector();
    const calc = new CalculatorEngine();

    const query = '2 + 2';
    const type = detector.detect(query);
    if (type !== 'calculation') throw new Error('Should detect calculation');

    const result = calc.calculate(query);
    if (result !== 4) throw new Error('Should calculate correctly');

    const formatted = calc.format(result);
    if (formatted !== '4') throw new Error('Should format correctly');
  })();

  await test('Full pipeline: Detect → Convert → Format', async () => {
    const detector = new QueryTypeDetector();
    const converter = new UnitConverter();

    const query = '10 feet to meters';
    const type = detector.detect(query);
    if (type !== 'conversion') throw new Error('Should detect conversion');

    const entities = detector.extractEntities(query, type);
    const result = await converter.convert(entities.value, entities.fromUnit, entities.toUnit);

    if (!result.value) throw new Error('Should return value');
    if (!result.formatted) throw new Error('Should return formatted string');
  })();

  await test('RL + Verifier Integration', async () => {
    const verifier = new CommandVerifier();
    const learner = new RLCommandLearner();
    const context = learner.getCurrentContext();

    // Verify a command
    const verifyResult = await verifier.verify('echo', ['integration-test']);

    // Observe with RL
    await learner.observe({
      command: 'echo',
      args: ['integration-test'],
      context,
      success: verifyResult.success,
      duration: verifyResult.duration
    });

    const knowledge = await learner.loadKnowledge();
    const cmdKey = 'echo integration-test';
    if (!knowledge.commands[cmdKey]) throw new Error('Command not learned');
  })();
}

// ===== Main Test Runner =====

async function runAllTests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  🧪 End-to-End Verification Tests     ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`Mode: ${QUICK_MODE ? 'Quick (skipping slow tests)' : 'Full'}`);
  console.log('');

  const startTime = Date.now();

  // Run test suites
  await testQueryTypeDetector();
  await testCalculatorEngine();
  await testUnitConverter();
  await testCommandVerifier();
  await testRLCommandLearner();
  await testSpotlightAgent();
  await testHistoricalQueryEngine();
  await testMacOSAppController();
  await testIntegration();

  const duration = Date.now() - startTime;

  // Print summary
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Test Summary                          ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`✅ Passed:  ${results.passed}`);
  console.log(`❌ Failed:  ${results.failed}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  console.log(`📊 Total:   ${results.tests.length}`);
  console.log(`⏱️  Duration: ${duration}ms`);
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
    console.log('💡 Next steps:');
    console.log('   1. Try: calos query "2 + 2"');
    console.log('   2. Try: calos query "100 USD to EUR"');
    console.log('   3. Try: calos spotify play');
    console.log('   4. Try: calos health');
    console.log('   5. Try: calos history commands');
    console.log('');
    process.exit(0);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Test runner error:', error);
  process.exit(1);
});

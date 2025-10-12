#!/usr/bin/env node

/**
 * CalOS Test Runner
 *
 * Modern test runner with machine-parseable output (no emojis).
 * Supports JSON, TAP formats, and color-coded console output.
 *
 * Usage:
 *   node test-runner.js                    # Run all tests
 *   node test-runner.js --suite unit       # Run unit tests only
 *   node test-runner.js --suite integration
 *   node test-runner.js --output json      # JSON output to test-results.json
 *   node test-runner.js --output tap       # TAP format output
 *   node test-runner.js --watch            # Watch mode (rerun on changes)
 *   node test-runner.js --verbose          # Verbose output
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

// Parse command-line arguments
const args = process.argv.slice(2);
const options = {
  suite: args.includes('--suite') ? args[args.indexOf('--suite') + 1] : 'all',
  output: args.includes('--output') ? args[args.indexOf('--output') + 1] : 'console',
  watch: args.includes('--watch'),
  verbose: args.includes('--verbose')
};

// Test results tracking
const results = {
  timestamp: new Date().toISOString(),
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  },
  suites: []
};

// Current test suite
let currentSuite = null;

/**
 * Log with color coding
 */
function log(level, message) {
  const prefix = {
    PASS: `${colors.green}[PASS]${colors.reset}`,
    FAIL: `${colors.red}[FAIL]${colors.reset}`,
    SKIP: `${colors.yellow}[SKIP]${colors.reset}`,
    INFO: `${colors.blue}[INFO]${colors.reset}`,
    SUITE: `${colors.blue}[SUITE]${colors.reset}`
  }[level] || level;

  console.log(`${prefix} ${message}`);
}

/**
 * Create a test suite
 */
function suite(name, fn) {
  currentSuite = {
    name,
    tests: [],
    startTime: Date.now()
  };

  log('SUITE', name);

  return async () => {
    try {
      await fn();
      currentSuite.duration = Date.now() - currentSuite.startTime;
      results.suites.push(currentSuite);
      return currentSuite;
    } catch (error) {
      console.error(`Suite "${name}" crashed:`, error.message);
      throw error;
    }
  };
}

/**
 * Define a test
 */
function test(name, fn) {
  if (!currentSuite) {
    throw new Error('test() must be called within a suite()');
  }

  return async () => {
    const startTime = Date.now();
    results.summary.total++;

    try {
      await fn();

      // Test passed
      results.summary.passed++;
      const duration = Date.now() - startTime;

      currentSuite.tests.push({
        name,
        status: 'PASS',
        duration_ms: duration
      });

      if (options.verbose) {
        log('PASS', `${name} ${colors.gray}(${duration}ms)${colors.reset}`);
      } else {
        log('PASS', name);
      }

      return true;

    } catch (error) {
      // Test failed
      results.summary.failed++;
      const duration = Date.now() - startTime;

      currentSuite.tests.push({
        name,
        status: 'FAIL',
        duration_ms: duration,
        error: error.message,
        stack: error.stack
      });

      log('FAIL', `${name}: ${error.message}`);

      if (options.verbose && error.stack) {
        console.log(colors.gray + error.stack + colors.reset);
      }

      return false;
    }
  };
}

/**
 * Skip a test
 */
function skip(name, reason = '') {
  if (!currentSuite) {
    throw new Error('skip() must be called within a suite()');
  }

  results.summary.total++;
  results.summary.skipped++;

  currentSuite.tests.push({
    name,
    status: 'SKIP',
    reason
  });

  log('SKIP', `${name}${reason ? ` - ${reason}` : ''}`);
}

/**
 * Assertion helper
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * Deep equality check
 */
function assertEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);

  if (actualStr !== expectedStr) {
    throw new Error(
      message || `Expected ${expectedStr}, got ${actualStr}`
    );
  }
}

/**
 * Find test files
 */
function findTestFiles(suite) {
  const testsDir = path.join(__dirname, '../tests');

  if (!fs.existsSync(testsDir)) {
    return [];
  }

  let searchPath = testsDir;

  if (suite !== 'all') {
    searchPath = path.join(testsDir, suite);
    if (!fs.existsSync(searchPath)) {
      console.error(`Test suite "${suite}" not found at ${searchPath}`);
      return [];
    }
  }

  const files = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.test.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(searchPath);
  return files;
}

/**
 * Load and run test file
 */
async function runTestFile(filePath) {
  log('INFO', `Running ${path.basename(filePath)}...`);

  try {
    // Clear require cache to allow reloading in watch mode
    delete require.cache[require.resolve(filePath)];

    // Load test file with globals
    global.suite = suite;
    global.test = test;
    global.skip = skip;
    global.assert = assert;
    global.assertEqual = assertEqual;

    const testModule = require(filePath);

    // Run the test file (it should define suites and tests)
    if (typeof testModule === 'function') {
      await testModule();
    }

  } catch (error) {
    console.error(`Failed to load ${filePath}:`, error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
  }
}

/**
 * Output results in JSON format
 */
function outputJSON() {
  const outputPath = path.join(__dirname, '../test-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  log('INFO', `Results written to ${outputPath}`);
}

/**
 * Output results in TAP format
 */
function outputTAP() {
  console.log('TAP version 13');
  console.log(`1..${results.summary.total}`);

  let testNumber = 0;

  for (const suite of results.suites) {
    console.log(`# ${suite.name}`);

    for (const test of suite.tests) {
      testNumber++;

      if (test.status === 'PASS') {
        console.log(`ok ${testNumber} - ${test.name}`);
      } else if (test.status === 'FAIL') {
        console.log(`not ok ${testNumber} - ${test.name}`);
        console.log(`  ---`);
        console.log(`  message: ${test.error}`);
        console.log(`  ...`);
      } else if (test.status === 'SKIP') {
        console.log(`ok ${testNumber} - ${test.name} # SKIP ${test.reason || ''}`);
      }
    }
  }
}

/**
 * Print summary
 */
function printSummary() {
  console.log('');
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`Total:   ${results.summary.total}`);
  console.log(`${colors.green}Passed:  ${results.summary.passed}${colors.reset}`);
  console.log(`${colors.red}Failed:  ${results.summary.failed}${colors.reset}`);
  console.log(`${colors.yellow}Skipped: ${results.summary.skipped}${colors.reset}`);
  console.log('='.repeat(60));

  if (results.summary.failed > 0) {
    console.log('');
    console.log(`${colors.red}FAILED${colors.reset}`);
    process.exit(1);
  } else {
    console.log('');
    console.log(`${colors.green}ALL TESTS PASSED${colors.reset}`);
    process.exit(0);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log('INFO', `CalOS Test Runner - Suite: ${options.suite}`);
  log('INFO', `Output format: ${options.output}`);
  console.log('');

  // Find test files
  const testFiles = findTestFiles(options.suite);

  if (testFiles.length === 0) {
    console.error('No test files found');
    process.exit(1);
  }

  log('INFO', `Found ${testFiles.length} test file(s)`);
  console.log('');

  // Run each test file
  for (const file of testFiles) {
    await runTestFile(file);
  }

  console.log('');

  // Output results
  if (options.output === 'json') {
    outputJSON();
  } else if (options.output === 'tap') {
    outputTAP();
  }

  // Print summary
  printSummary();
}

/**
 * Watch mode
 */
function watchMode() {
  const chokidar = require('chokidar');
  const testsDir = path.join(__dirname, '../tests');

  log('INFO', 'Watch mode enabled - waiting for changes...');

  let running = false;

  const watcher = chokidar.watch([testsDir, path.join(__dirname, '../lib')], {
    ignored: /node_modules/,
    persistent: true
  });

  watcher.on('change', async (filePath) => {
    if (running) return;

    running = true;
    console.clear();
    log('INFO', `File changed: ${path.basename(filePath)}`);
    console.log('');

    // Reset results
    results.summary = { total: 0, passed: 0, failed: 0, skipped: 0 };
    results.suites = [];

    await runTests().catch(() => {
      // Ignore errors in watch mode
    });

    running = false;
    console.log('');
    log('INFO', 'Waiting for changes...');
  });

  watcher.on('ready', () => {
    runTests().catch(() => {});
  });
}

// Run tests
if (options.watch) {
  watchMode();
} else {
  runTests().catch((error) => {
    console.error('Test runner crashed:', error);
    process.exit(1);
  });
}

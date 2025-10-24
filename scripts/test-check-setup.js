#!/usr/bin/env node

/**
 * Test script for check-setup.js
 * Simulates different installation environments
 */

const path = require('path');
const { spawn } = require('child_process');

const scriptPath = path.join(__dirname, 'check-setup.js');

const tests = [
  {
    name: 'CI Environment',
    env: { CI: 'true' },
    shouldSkip: true
  },
  {
    name: 'Manual Skip Flag',
    env: { SKIP_SETUP_CHECK: '1' },
    shouldSkip: true
  },
  {
    name: 'Global Install',
    env: { npm_config_global: 'true' },
    shouldSkip: true
  },
  {
    name: 'Production Environment',
    env: { NODE_ENV: 'production' },
    shouldSkip: true
  },
  {
    name: 'Docker Environment (Unix)',
    env: { DOCKER_CONTAINER: 'true' },
    shouldSkip: true
  },
  {
    name: 'Windows Docker',
    env: { DOCKER_CONTAINER: 'true' },
    shouldSkip: true,
    platform: 'win32'
  },
  {
    name: 'Windows Terminal with Color',
    env: { WT_SESSION: 'some-guid' },
    shouldSkip: false,
    platform: 'win32',
    forceTTY: true
  },
  {
    name: 'Windows PowerShell',
    env: {},
    shouldSkip: false,
    platform: 'win32',
    forceTTY: true
  },
  {
    name: 'Local Development (simulated TTY)',
    env: {},
    shouldSkip: false,
    forceTTY: true
  }
];

async function runTest(test) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...test.env };

    // Force TTY simulation if requested
    if (test.forceTTY) {
      env.FORCE_COLOR = '1';
    }

    const child = spawn('node', [scriptPath], {
      env,
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe'
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      const hasOutput = output.trim().length > 0;
      const passed = test.shouldSkip ? !hasOutput : hasOutput;

      resolve({
        test: test.name,
        passed,
        shouldSkip: test.shouldSkip,
        hadOutput: hasOutput,
        output: output.substring(0, 200)
      });
    });
  });
}

async function runAllTests() {
  console.log('🧪 Testing check-setup.js environment detection\n');

  const results = [];
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);

    const icon = result.passed ? '✅' : '❌';
    const status = result.shouldSkip ?
      (result.hadOutput ? 'FAILED (should skip)' : 'PASSED (skipped)') :
      (result.hadOutput ? 'PASSED (showed setup)' : 'FAILED (should show setup)');

    console.log(`${icon} ${result.test}`);
    console.log(`   ${status}\n`);
  }

  const allPassed = results.every(r => r.passed);
  console.log('\n' + '='.repeat(50));
  console.log(allPassed ? '✅ All tests passed!' : '❌ Some tests failed');
  console.log('='.repeat(50));

  process.exit(allPassed ? 0 : 1);
}

runAllTests();

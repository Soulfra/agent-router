#!/usr/bin/env node
/**
 * Test All Providers
 *
 * Runs all three provider tests sequentially.
 * Usage: node scripts/test-all-providers.js
 */

const { spawn } = require('child_process');
const path = require('path');

const scriptsDir = __dirname;

async function runTest(scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${scriptName}`);
    console.log('='.repeat(60));

    const scriptPath = path.join(scriptsDir, scriptName);
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      env: process.env
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ script: scriptName, success: true });
      } else {
        resolve({ script: scriptName, success: false, code });
      }
    });

    child.on('error', (error) => {
      reject({ script: scriptName, error });
    });
  });
}

async function testAllProviders() {
  console.log('\n🔺 TRIANGLE CONSENSUS - Provider Test Suite');
  console.log('Testing all 3 providers for truth by triangulation\n');

  const tests = [
    'test-openai.js',
    'test-anthropic.js',
    'test-deepseek.js'
  ];

  const results = [];

  for (const test of tests) {
    try {
      const result = await runTest(test);
      results.push(result);
    } catch (error) {
      results.push({ script: test, success: false, error: error.message });
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Passed: ${successful.length}/${tests.length}`);
  if (successful.length > 0) {
    successful.forEach(r => console.log(`   ✓ ${r.script.replace('.js', '')}`));
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}/${tests.length}`);
    failed.forEach(r => console.log(`   ✗ ${r.script.replace('.js', '')}`));
  }

  console.log('\n' + '='.repeat(60));

  if (successful.length === tests.length) {
    console.log('\n🎯 ALL PROVIDERS WORKING!');
    console.log('🔺 Triangle Consensus System is ready to use!');
    console.log('\n💡 Try it:');
    console.log('   curl -X POST http://localhost:5001/api/chat/triangle \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -H "x-user-id: YOUR_USER_ID" \\');
    console.log('     -d \'{"prompt": "What is the capital of France?"}\'');
    console.log('');
  } else if (successful.length > 0) {
    console.log('\n⚠️  PARTIAL SUCCESS');
    console.log(`   ${successful.length} provider(s) working, ${failed.length} need attention`);
    console.log('\n💡 Fix the failed providers and run again\n');
  } else {
    console.log('\n❌ NO PROVIDERS WORKING');
    console.log('   Please add valid API keys to .env file');
    console.log('\n💡 Required keys:');
    console.log('   OPENAI_API_KEY=sk-...');
    console.log('   ANTHROPIC_API_KEY=sk-ant-...');
    console.log('   DEEPSEEK_API_KEY=sk-...\n');
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

testAllProviders();

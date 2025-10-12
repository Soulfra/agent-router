#!/usr/bin/env node

/**
 * Test Multi-LLM Router
 *
 * Tests all 4 LLM providers and routing strategies.
 */

require('dotenv').config();
const MultiLLMRouter = require('../lib/multi-llm-router');

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  log('\n🤖 Multi-LLM Router Test', 'blue');
  log('════════════════════════════════════════\n', 'blue');

  // Create router
  const router = new MultiLLMRouter({
    strategy: 'smart',
    fallback: true,
    loadBalance: true
  });

  // Test 1: Test all providers
  log('1️⃣  Testing all providers...', 'yellow');
  const testResults = await router.testAll();

  console.log('\nResults:');
  for (const [provider, result] of Object.entries(testResults)) {
    if (result.success) {
      log(`  ✓ ${provider}: "${result.response}" (${result.latency}ms)`, 'green');
    } else {
      log(`  ✗ ${provider}: ${result.error}`, 'red');
    }
  }

  // Get available providers
  const available = router.getAvailableProviders();
  log(`\n✓ ${available.length} providers available\n`, 'green');

  if (available.length === 0) {
    log('❌ No providers available. Please configure API keys in .env', 'red');
    log('Or start Ollama: ollama serve\n', 'yellow');
    process.exit(1);
  }

  // Test 2: Smart routing for different task types
  log('2️⃣  Testing smart routing...', 'yellow');

  const testCases = [
    {
      name: 'Code task',
      request: {
        prompt: 'Write a function to calculate factorial in Python',
        taskType: 'code',
        maxTokens: 200
      }
    },
    {
      name: 'Creative task',
      request: {
        prompt: 'Write a haiku about programming',
        taskType: 'creative',
        maxTokens: 100
      }
    },
    {
      name: 'Fact query',
      request: {
        prompt: 'What is the capital of France?',
        taskType: 'fact',
        maxTokens: 50
      }
    },
    {
      name: 'Reasoning task',
      request: {
        prompt: 'Explain why the sky is blue',
        taskType: 'reasoning',
        maxTokens: 150
      }
    }
  ];

  for (const testCase of testCases) {
    try {
      log(`\n📝 ${testCase.name}`, 'cyan');
      log(`   Prompt: "${testCase.request.prompt}"`, 'white');

      const response = await router.complete(testCase.request);

      log(`   ✓ Provider: ${response.provider}`, 'green');
      log(`   ✓ Latency: ${response.latency}ms`, 'green');
      log(`   ✓ Tokens: ${response.usage.total_tokens}`, 'green');
      log(`   Response: "${response.text.substring(0, 100)}..."`, 'white');

    } catch (error) {
      log(`   ✗ Error: ${error.message}`, 'red');
    }
  }

  // Test 3: Streaming
  log('\n3️⃣  Testing streaming...', 'yellow');

  try {
    log('   Prompt: "Count from 1 to 5"', 'white');

    let streamedText = '';
    const response = await router.stream(
      {
        prompt: 'Count from 1 to 5, one number per line',
        maxTokens: 50
      },
      (chunk) => {
        streamedText += chunk;
        process.stdout.write(chunk);
      }
    );

    log(`\n   ✓ Provider: ${response.provider}`, 'green');
    log(`   ✓ Latency: ${response.latency}ms`, 'green');
    log(`   ✓ Streamed successfully`, 'green');

  } catch (error) {
    log(`   ✗ Error: ${error.message}`, 'red');
  }

  // Test 4: Cost comparison
  log('\n4️⃣  Testing cost optimization...', 'yellow');

  const costTests = [
    {
      strategy: 'cheapest',
      prompt: 'What is 2+2?'
    },
    {
      strategy: 'fastest',
      prompt: 'What is 2+2?'
    },
    {
      strategy: 'best-quality',
      prompt: 'What is 2+2?'
    }
  ];

  for (const test of costTests) {
    try {
      const strategyRouter = new MultiLLMRouter({
        strategy: test.strategy
      });

      const response = await strategyRouter.complete({
        prompt: test.prompt,
        maxTokens: 20
      });

      log(`   ${test.strategy}: ${response.provider} (${response.latency}ms)`, 'white');

    } catch (error) {
      log(`   ${test.strategy}: Error - ${error.message}`, 'red');
    }
  }

  // Test 5: Fallback
  log('\n5️⃣  Testing fallback mechanism...', 'yellow');

  try {
    const response = await router.complete({
      prompt: 'Say hello',
      preferredProvider: 'nonexistent',
      maxTokens: 10
    });

    if (response.fallback) {
      log(`   ✓ Fallback worked! Used ${response.provider}`, 'green');
      log(`   Original error: ${response.originalError}`, 'yellow');
    } else {
      log(`   ✓ Request completed successfully`, 'green');
    }

  } catch (error) {
    log(`   ✗ Fallback failed: ${error.message}`, 'red');
  }

  // Test 6: Show statistics
  log('\n6️⃣  Usage statistics:', 'yellow');

  const stats = router.getStats();
  log(`\n   Total Requests: ${stats.totalRequests}`, 'white');
  log(`   Successful: ${stats.successfulRequests}`, 'green');
  log(`   Failed: ${stats.failedRequests}`, stats.failedRequests > 0 ? 'red' : 'white');
  log(`   Total Tokens: ${stats.totalTokens}`, 'white');
  log(`   Estimated Cost: $${stats.totalCost.toFixed(4)}`, 'cyan');

  log('\n   By Provider:', 'white');
  for (const provider of stats.providers) {
    if (provider.requests > 0) {
      log(`     ${provider.name}:`, 'cyan');
      log(`       Requests: ${provider.requests}`, 'white');
      log(`       Success Rate: ${((provider.successes / provider.requests) * 100).toFixed(1)}%`, 'white');
      log(`       Avg Latency: ${provider.averageLatency}ms`, 'white');
      log(`       Tokens: ${provider.tokens}`, 'white');
      log(`       Cost: $${provider.cost.toFixed(4)}`, 'white');
    }
  }

  log('\n✅ All tests complete!\n', 'green');
}

main().catch(error => {
  log(`\n❌ Test failed: ${error.message}\n`, 'red');
  process.exit(1);
});

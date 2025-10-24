#!/usr/bin/env node

/**
 * Test Domain Contexts & Routing Strategies
 *
 * Tests all task types (domain contexts) across all routing strategies:
 * - code: Programming, debugging, code review → CodeLlama/DeepSeek Coder
 * - creative: Writing, stories, creative content → Claude/GPT-4
 * - reasoning: Complex analysis, logic → DeepSeek Reasoner/GPT-4
 * - fact: Simple factual queries → Ollama/DeepSeek
 * - simple: Basic questions → Ollama (free and fast)
 *
 * Routing strategies:
 * - smart: Task-based routing (default)
 * - cheapest: Ollama > DeepSeek > OpenAI > Anthropic
 * - fastest: Based on latency stats
 * - best-quality: Anthropic > OpenAI > DeepSeek > Ollama
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
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test cases for each domain context
const domainTests = [
  {
    name: 'Code Generation',
    taskType: 'code',
    prompt: 'Write a Python function to calculate the fibonacci sequence',
    maxTokens: 300,
    temperature: 0.2,
    expectedProvider: ['ollama', 'deepseek'],
    description: 'Should route to CodeLlama (Ollama) or DeepSeek Coder'
  },
  {
    name: 'Code Debugging',
    taskType: 'code',
    prompt: 'Debug this function: def add(a,b): return a+b+c',
    maxTokens: 200,
    temperature: 0.1,
    expectedProvider: ['ollama', 'deepseek'],
    description: 'Should route to CodeLlama for debugging'
  },
  {
    name: 'Creative Writing',
    taskType: 'creative',
    prompt: 'Write a short story about a robot discovering emotions',
    maxTokens: 500,
    temperature: 0.9,
    expectedProvider: ['anthropic', 'openai', 'ollama'],
    description: 'Should route to Claude (best at creative)'
  },
  {
    name: 'Poetry',
    taskType: 'creative',
    prompt: 'Write a haiku about artificial intelligence',
    maxTokens: 100,
    temperature: 0.8,
    expectedProvider: ['anthropic', 'openai', 'ollama'],
    description: 'Should route to Claude for poetry'
  },
  {
    name: 'Complex Reasoning',
    taskType: 'reasoning',
    prompt: 'Explain the philosophical implications of the Chinese Room argument',
    maxTokens: 600,
    temperature: 0.7,
    expectedProvider: ['deepseek', 'openai', 'anthropic', 'ollama'],
    description: 'Should route to DeepSeek Reasoner or GPT-4'
  },
  {
    name: 'Logical Analysis',
    taskType: 'reasoning',
    prompt: 'If all A are B, and all B are C, what can we conclude about A and C?',
    maxTokens: 200,
    temperature: 0.3,
    expectedProvider: ['deepseek', 'openai', 'anthropic', 'ollama'],
    description: 'Should route to DeepSeek Reasoner for logic'
  },
  {
    name: 'Factual Query',
    taskType: 'fact',
    prompt: 'What is the capital of France?',
    maxTokens: 50,
    temperature: 0.1,
    expectedProvider: ['ollama', 'deepseek'],
    description: 'Should route to Ollama (free) for simple facts'
  },
  {
    name: 'Historical Fact',
    taskType: 'fact',
    prompt: 'When did World War II end?',
    maxTokens: 50,
    temperature: 0.1,
    expectedProvider: ['ollama', 'deepseek'],
    description: 'Should route to cheapest provider for facts'
  },
  {
    name: 'Simple Question',
    taskType: 'simple',
    prompt: 'What is 2 + 2?',
    maxTokens: 20,
    temperature: 0.0,
    expectedProvider: ['ollama'],
    description: 'Should route to Ollama (free and fast)'
  },
  {
    name: 'Basic Math',
    taskType: 'simple',
    prompt: 'Calculate 15 * 8',
    maxTokens: 20,
    temperature: 0.0,
    expectedProvider: ['ollama'],
    description: 'Should route to Ollama for basic math'
  }
];

// Routing strategies to test
const strategies = ['smart', 'cheapest', 'fastest', 'best-quality'];

async function testDomainContext(router, test) {
  try {
    const startTime = Date.now();

    const response = await router.complete({
      prompt: test.prompt,
      taskType: test.taskType,
      maxTokens: test.maxTokens,
      temperature: test.temperature
    });

    const latency = Date.now() - startTime;

    // Check if provider matches expected
    const providerCorrect = test.expectedProvider.includes(response.provider);

    if (providerCorrect) {
      log(`   ✓ ${test.name}`, 'green');
    } else {
      log(`   ! ${test.name}`, 'yellow');
    }

    log(`     Provider: ${response.provider} (${response.model})`, 'white');
    log(`     Latency: ${response.latency}ms`, 'white');
    log(`     Tokens: ${response.usage.total_tokens}`, 'white');
    log(`     Response: "${response.text.substring(0, 80)}..."`, 'cyan');

    if (!providerCorrect) {
      log(`     Expected: ${test.expectedProvider.join(' or ')}`, 'yellow');
    }

    return {
      success: true,
      provider: response.provider,
      model: response.model,
      latency: response.latency,
      tokens: response.usage.total_tokens,
      providerCorrect: providerCorrect
    };

  } catch (error) {
    log(`   ✗ ${test.name}`, 'red');
    log(`     Error: ${error.message}`, 'red');
    return {
      success: false,
      error: error.message
    };
  }
}

async function testRoutingStrategy(strategyName) {
  log(`\n${'='.repeat(60)}`, 'blue');
  log(`Testing Strategy: ${strategyName}`, 'blue');
  log('='.repeat(60), 'blue');

  const router = new MultiLLMRouter({
    strategy: strategyName,
    fallback: true,
    costOptimize: true
  });

  // Get available providers
  const available = router.getAvailableProviders();
  log(`\nAvailable providers: ${available.map(p => p.name).join(', ')}`, 'cyan');

  if (available.length === 0) {
    log('❌ No providers available. Please configure API keys or start Ollama.', 'red');
    return { strategy: strategyName, results: [], summary: { total: 0, success: 0, failed: 0, correctRouting: 0 } };
  }

  const results = [];

  // Test each domain context
  for (const test of domainTests) {
    const result = await testDomainContext(router, test);
    results.push({ test: test.name, taskType: test.taskType, ...result });
  }

  // Calculate summary
  const summary = {
    total: results.length,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    correctRouting: results.filter(r => r.providerCorrect).length,
    totalLatency: results.reduce((sum, r) => sum + (r.latency || 0), 0),
    totalTokens: results.reduce((sum, r) => sum + (r.tokens || 0), 0)
  };

  // Show summary
  log(`\n${'─'.repeat(60)}`, 'cyan');
  log(`Strategy: ${strategyName} - Summary`, 'cyan');
  log('─'.repeat(60), 'cyan');
  log(`  Total tests: ${summary.total}`, 'white');
  log(`  Successful: ${summary.success}`, summary.success === summary.total ? 'green' : 'yellow');
  log(`  Failed: ${summary.failed}`, summary.failed === 0 ? 'green' : 'red');
  log(`  Correct routing: ${summary.correctRouting}/${summary.total}`, summary.correctRouting === summary.total ? 'green' : 'yellow');
  log(`  Total latency: ${summary.totalLatency}ms`, 'white');
  log(`  Total tokens: ${summary.totalTokens}`, 'white');
  log(`  Avg latency: ${Math.round(summary.totalLatency / summary.total)}ms`, 'white');

  return { strategy: strategyName, results, summary };
}

async function testParameterVariations() {
  log(`\n${'='.repeat(60)}`, 'magenta');
  log('Testing Parameter Variations', 'magenta');
  log('='.repeat(60), 'magenta');

  const router = new MultiLLMRouter({ strategy: 'smart' });

  // Test 1: Temperature variations
  log('\n📊 Temperature Variations:', 'yellow');

  const temperatures = [0.0, 0.5, 1.0, 1.5];

  for (const temp of temperatures) {
    try {
      const response = await router.complete({
        prompt: 'Say hello in exactly 3 words',
        taskType: 'simple',
        maxTokens: 20,
        temperature: temp
      });

      log(`  Temperature ${temp}: "${response.text}"`, 'white');

    } catch (error) {
      log(`  Temperature ${temp}: Error - ${error.message}`, 'red');
    }
  }

  // Test 2: Prompt length variations
  log('\n📏 Prompt Length Variations:', 'yellow');

  const prompts = [
    { name: 'Short', text: 'Hello', tokens: 10 },
    { name: 'Medium', text: 'Explain quantum computing in simple terms', tokens: 200 },
    { name: 'Long', text: 'Write a detailed analysis of the economic implications of artificial intelligence on labor markets, including historical context, current trends, and future predictions', tokens: 500 }
  ];

  for (const prompt of prompts) {
    try {
      const startTime = Date.now();

      const response = await router.complete({
        prompt: prompt.text,
        taskType: 'reasoning',
        maxTokens: prompt.tokens
      });

      const latency = Date.now() - startTime;

      log(`  ${prompt.name} (${prompt.text.length} chars):`, 'white');
      log(`    Provider: ${response.provider}, Latency: ${latency}ms, Tokens: ${response.usage.total_tokens}`, 'cyan');

    } catch (error) {
      log(`  ${prompt.name}: Error - ${error.message}`, 'red');
    }
  }

  // Test 3: System prompt
  log('\n💬 System Prompt Test:', 'yellow');

  try {
    const response = await router.complete({
      systemPrompt: 'You are a pirate. Speak like a pirate.',
      prompt: 'What is your name?',
      taskType: 'creative',
      maxTokens: 50
    });

    log(`  Response: "${response.text}"`, 'cyan');
    log(`  Provider: ${response.provider}`, 'white');

  } catch (error) {
    log(`  Error: ${error.message}`, 'red');
  }
}

async function testFallbackMechanism() {
  log(`\n${'='.repeat(60)}`, 'magenta');
  log('Testing Fallback Mechanism', 'magenta');
  log('='.repeat(60), 'magenta');

  const router = new MultiLLMRouter({
    strategy: 'smart',
    fallback: true
  });

  // Test with non-existent preferred provider
  log('\n🔄 Forcing fallback by requesting unavailable provider:', 'yellow');

  try {
    const response = await router.complete({
      prompt: 'Say hello',
      preferredProvider: 'nonexistent_provider',
      maxTokens: 20
    });

    if (response.fallback) {
      log(`  ✓ Fallback worked! Used: ${response.provider}`, 'green');
      log(`  Original error: ${response.originalError}`, 'yellow');
    } else {
      log(`  ✓ Request completed with: ${response.provider}`, 'green');
    }

  } catch (error) {
    log(`  ✗ Fallback failed: ${error.message}`, 'red');
  }
}

async function main() {
  log('\n🧪 Domain Context & Routing Strategy Test Suite', 'blue');
  log('════════════════════════════════════════════════════════════', 'blue');

  // Test all routing strategies
  const allResults = [];

  for (const strategy of strategies) {
    const result = await testRoutingStrategy(strategy);
    allResults.push(result);
  }

  // Test parameter variations
  await testParameterVariations();

  // Test fallback mechanism
  await testFallbackMechanism();

  // Final Summary
  log(`\n${'='.repeat(60)}`, 'green');
  log('FINAL SUMMARY - All Strategies', 'green');
  log('='.repeat(60), 'green');

  for (const result of allResults) {
    const { strategy, summary } = result;
    const successRate = ((summary.success / summary.total) * 100).toFixed(1);
    const routingAccuracy = ((summary.correctRouting / summary.total) * 100).toFixed(1);

    log(`\n${strategy}:`, 'cyan');
    log(`  Success Rate: ${successRate}% (${summary.success}/${summary.total})`, 'white');
    log(`  Routing Accuracy: ${routingAccuracy}% (${summary.correctRouting}/${summary.total})`, 'white');
    log(`  Avg Latency: ${Math.round(summary.totalLatency / summary.total)}ms`, 'white');
  }

  // Compare strategies
  log(`\n${'─'.repeat(60)}`, 'cyan');
  log('Strategy Comparison:', 'cyan');
  log('─'.repeat(60), 'cyan');

  const fastestStrategy = allResults.reduce((fastest, current) => {
    const fastestAvg = fastest.summary.totalLatency / fastest.summary.total;
    const currentAvg = current.summary.totalLatency / current.summary.total;
    return currentAvg < fastestAvg ? current : fastest;
  });

  const mostAccurateStrategy = allResults.reduce((accurate, current) => {
    const accurateRate = accurate.summary.correctRouting / accurate.summary.total;
    const currentRate = current.summary.correctRouting / current.summary.total;
    return currentRate > accurateRate ? current : accurate;
  });

  log(`  Fastest: ${fastestStrategy.strategy} (${Math.round(fastestStrategy.summary.totalLatency / fastestStrategy.summary.total)}ms avg)`, 'green');
  log(`  Most Accurate: ${mostAccurateStrategy.strategy} (${((mostAccurateStrategy.summary.correctRouting / mostAccurateStrategy.summary.total) * 100).toFixed(1)}%)`, 'green');

  log('\n✅ All domain context tests complete!\n', 'green');
}

main().catch(error => {
  log(`\n❌ Test failed: ${error.message}\n`, 'red');
  console.error(error);
  process.exit(1);
});

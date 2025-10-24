#!/usr/bin/env node

/**
 * Benchmark All Providers
 *
 * Tests real performance across all LLM providers:
 * - Ollama (local)
 * - OpenAI (GPT-3.5, GPT-4)
 * - Anthropic (Claude 3.5 Sonnet, Haiku)
 * - DeepSeek (deepseek-chat, deepseek-reasoner)
 *
 * Provides percentiles (p50, p95, p99) and cost comparison.
 *
 * Usage:
 *   PASSWORD=your-password node scripts/benchmark-all-providers.js
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

const API_URL = process.env.API_URL || 'http://localhost:5001';
const EMAIL = process.env.EMAIL || 'lolztex@gmail.com';
const PASSWORD = process.env.PASSWORD || '';
const ITERATIONS = parseInt(process.env.ITERATIONS || '10', 10);

// Test prompt (consistent across all providers)
const TEST_PROMPT = 'Write a haiku about code';

// Provider configurations
const PROVIDERS = [
  { name: 'Ollama (llama3.2)', model: 'llama3.2', cost: 0 },
  { name: 'OpenAI (gpt-3.5-turbo)', model: 'gpt-3.5-turbo', cost: 0.0015 },
  { name: 'OpenAI (gpt-4)', model: 'gpt-4', cost: 0.03 },
  { name: 'Anthropic (claude-3-5-sonnet)', model: 'claude-3-5-sonnet-20241022', cost: 0.003 },
  { name: 'Anthropic (claude-3-haiku)', model: 'claude-3-haiku-20240307', cost: 0.00025 },
  { name: 'DeepSeek (deepseek-chat)', model: 'deepseek-chat', cost: 0.00014 },
  { name: 'DeepSeek (deepseek-reasoner)', model: 'deepseek-reasoner', cost: 0.00055 }
];

async function benchmarkAllProviders() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  Provider Performance Benchmarks              ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');

  if (!PASSWORD) {
    console.log('❌ Error: PASSWORD environment variable not set');
    console.log('');
    console.log('Usage:');
    console.log('  PASSWORD=your-password node scripts/benchmark-all-providers.js');
    console.log('');
    process.exit(1);
  }

  try {
    // Login
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
      email: EMAIL,
      password: PASSWORD
    });

    const token = loginResponse.data.token;
    console.log(`✓ Logged in`);
    console.log('');

    const results = [];

    // Benchmark each provider
    for (const provider of PROVIDERS) {
      console.log(`Testing: ${provider.name}`);
      console.log(`  Model: ${provider.model}`);
      console.log(`  Iterations: ${ITERATIONS}`);
      console.log('');

      const timings = [];
      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < ITERATIONS; i++) {
        process.stdout.write(`  Request ${i + 1}/${ITERATIONS}... `);

        try {
          const start = performance.now();

          await axios.post(
            `${API_URL}/api/llm/complete`,
            {
              model: provider.model,
              messages: [{ role: 'user', content: TEST_PROMPT }],
              stream: false
            },
            {
              headers: { 'Authorization': `Bearer ${token}` },
              timeout: 60000
            }
          );

          const duration = performance.now() - start;
          timings.push(duration);
          successCount++;

          console.log(`${duration.toFixed(0)}ms ✓`);

        } catch (error) {
          failureCount++;
          const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
          console.log(`FAILED (${errorMsg})`);
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      console.log('');

      if (timings.length > 0) {
        // Calculate percentiles
        const sorted = timings.sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
        const min = sorted[0];
        const max = sorted[sorted.length - 1];

        results.push({
          provider: provider.name,
          model: provider.model,
          cost: provider.cost,
          successRate: (successCount / ITERATIONS * 100).toFixed(1),
          timings: { min, max, avg, p50, p95, p99 }
        });

        console.log(`Results for ${provider.name}:`);
        console.log(`  Success Rate: ${successCount}/${ITERATIONS} (${(successCount / ITERATIONS * 100).toFixed(1)}%)`);
        console.log(`  Min:    ${min.toFixed(0)}ms`);
        console.log(`  Avg:    ${avg.toFixed(0)}ms`);
        console.log(`  p50:    ${p50.toFixed(0)}ms`);
        console.log(`  p95:    ${p95.toFixed(0)}ms`);
        console.log(`  p99:    ${p99.toFixed(0)}ms`);
        console.log(`  Max:    ${max.toFixed(0)}ms`);
        console.log(`  Cost:   $${provider.cost}/1K tokens`);
        console.log('');

      } else {
        console.log(`⚠️  ${provider.name}: All requests failed (provider not available)`);
        console.log('');
      }
    }

    // Summary comparison
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║  Summary Comparison                           ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');

    if (results.length === 0) {
      console.log('No providers available for comparison.');
      process.exit(1);
    }

    // Sort by p50 latency (fastest first)
    const sortedBySpeed = [...results].sort((a, b) => a.timings.p50 - b.timings.p50);

    console.log('By Speed (p50 latency):');
    sortedBySpeed.forEach((result, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
      console.log(`${medal} ${index + 1}. ${result.provider.padEnd(35)} ${result.timings.p50.toFixed(0).padStart(6)}ms`);
    });
    console.log('');

    // Sort by cost (cheapest first)
    const sortedByCost = [...results].sort((a, b) => a.cost - b.cost);

    console.log('By Cost ($/1K tokens):');
    sortedByCost.forEach((result, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
      const costStr = result.cost === 0 ? 'FREE' : `$${result.cost.toFixed(5)}`;
      console.log(`${medal} ${index + 1}. ${result.provider.padEnd(35)} ${costStr.padStart(10)}`);
    });
    console.log('');

    // Recommendations
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║  Recommendations                              ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');

    const fastest = sortedBySpeed[0];
    const cheapest = sortedByCost.find(r => r.cost > 0); // Exclude free (Ollama)

    console.log(`Fastest:  ${fastest.provider}`);
    console.log(`          ${fastest.timings.p50.toFixed(0)}ms (p50), $${fastest.cost}/1K tokens`);
    console.log('');

    console.log(`Cheapest: ${cheapest.provider}`);
    console.log(`          ${cheapest.timings.p50.toFixed(0)}ms (p50), $${cheapest.cost}/1K tokens`);
    console.log('');

    // Best value (speed/cost ratio)
    const withCost = results.filter(r => r.cost > 0);
    const bestValue = withCost.reduce((best, current) => {
      const currentRatio = current.timings.p50 / (current.cost * 1000);
      const bestRatio = best.timings.p50 / (best.cost * 1000);
      return currentRatio < bestRatio ? current : best;
    });

    console.log(`Best Value: ${bestValue.provider}`);
    console.log(`            ${bestValue.timings.p50.toFixed(0)}ms (p50), $${bestValue.cost}/1K tokens`);
    console.log(`            (Best speed/cost ratio)`);
    console.log('');

    console.log('Use Cases:');
    console.log('  • Cost-sensitive:     DeepSeek (cheapest)');
    console.log('  • Speed-sensitive:    ' + fastest.provider.split('(')[0].trim());
    console.log('  • Quality-sensitive:  Anthropic Claude 3.5 Sonnet');
    console.log('  • Privacy-sensitive:  Ollama (local, free)');
    console.log('');

    console.log('✓ Benchmark completed successfully');

  } catch (error) {
    console.error('');
    console.error('❌ Benchmark failed:');
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
  benchmarkAllProviders().catch((error) => {
    console.error('Unhandled error:', error.message);
    process.exit(1);
  });
}

module.exports = benchmarkAllProviders;

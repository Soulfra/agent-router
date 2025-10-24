/**
 * @calos/sdk - Example Usage
 *
 * This example demonstrates how to use the CALOS Platform SDK
 * Run with: node sdk/platform/example.js
 */

// Import the SDK
const { CALOS } = require('./index.js');

// Initialize with API key (replace with your actual key)
const calos = new CALOS({
  apiKey: process.env.CALOS_API_KEY || 'sk-tenant-test-key',
  baseURL: process.env.CALOS_BASE_URL || 'http://localhost:3000',
  maxRetries: 3
});

async function main() {
  console.log('===================================');
  console.log('  CALOS SDK Example');
  console.log('  Version:', CALOS.version);
  console.log('===================================\n');

  try {
    // Example 1: Simple chat completion
    console.log('1. Simple Chat Completion');
    console.log('---------------------------');

    const response = await calos.chat.complete({
      prompt: 'Write a haiku about artificial intelligence',
      model: 'gpt-4',
      maxTokens: 100,
      temperature: 0.7
    });

    console.log('Response:', response.content);
    console.log('Provider:', response.provider);
    console.log('Tokens used:', response.usage.total_tokens);
    console.log();

    // Example 2: Streaming completion
    console.log('2. Streaming Completion');
    console.log('---------------------------');

    process.stdout.write('Streaming: ');
    const streamResponse = await calos.chat.stream({
      prompt: 'Count from 1 to 10',
      maxTokens: 50
    }, (chunk) => {
      process.stdout.write(chunk);
    });

    console.log('\nTotal tokens:', streamResponse.usage?.total_tokens || 'N/A');
    console.log();

    // Example 3: Check usage
    console.log('3. Current Usage Stats');
    console.log('---------------------------');

    const usage = await calos.usage.getCurrent();

    console.log('Tokens used this period:', usage.tokens_used_this_period.toLocaleString());
    console.log('Tokens limit:', usage.tokens_limit ? usage.tokens_limit.toLocaleString() : 'Unlimited');
    console.log('Cost this period:', `$${(usage.cost_this_period_cents / 100).toFixed(2)}`);
    console.log('Pricing model:', usage.pricing_model);
    console.log('Period ends:', usage.current_period_end);
    console.log();

    // Example 4: Usage by provider
    console.log('4. Usage by Provider (Last 30 days)');
    console.log('---------------------------');

    const providers = await calos.usage.getByProvider({ days: 30 });

    if (providers.length > 0) {
      providers.forEach(p => {
        console.log(`${p.provider}:`);
        console.log(`  Requests: ${p.requests.toLocaleString()}`);
        console.log(`  Tokens: ${p.total_tokens.toLocaleString()}`);
        console.log(`  Cost: $${(p.total_cost_cents / 100).toFixed(2)}`);
      });
    } else {
      console.log('No usage data yet');
    }
    console.log();

    // Example 5: Unbilled usage
    console.log('5. Unbilled Usage');
    console.log('---------------------------');

    const unbilled = await calos.usage.getUnbilled();

    console.log('Unbilled requests:', unbilled.unbilled_requests.toLocaleString());
    console.log('Unbilled tokens:', unbilled.unbilled_tokens.toLocaleString());
    console.log('Projected invoice:', `$${(unbilled.unbilled_cost_cents / 100).toFixed(2)}`);
    console.log();

    console.log('✅ All examples completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Type:', error.constructor.name);

    if (error.statusCode) {
      console.error('Status code:', error.statusCode);
    }

    if (error.response) {
      console.error('Response:', JSON.stringify(error.response, null, 2));
    }

    process.exit(1);
  }
}

// Run examples
main();

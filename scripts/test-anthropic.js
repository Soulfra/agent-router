#!/usr/bin/env node
/**
 * Test Anthropic API Key
 *
 * Simple script to verify Anthropic API key works.
 * Usage: node scripts/test-anthropic.js
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

async function testAnthropic() {
  console.log('🧪 Testing Anthropic API Key...\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    console.error('❌ ANTHROPIC_API_KEY not found in .env file');
    console.log('\n💡 Add your Anthropic API key to .env:');
    console.log('   ANTHROPIC_API_KEY=sk-ant-...\n');
    process.exit(1);
  }

  console.log(`✓ API Key found: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
  console.log('✓ Initializing Anthropic client...');

  const client = new Anthropic({
    apiKey: apiKey
  });

  try {
    console.log('✓ Sending test query: "What is 2+2?"...\n');

    const startTime = Date.now();

    const response = await client.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 50,
      messages: [
        { role: 'user', content: 'What is 2+2? Answer in one sentence.' }
      ]
    });

    const latency = Date.now() - startTime;

    console.log('✅ SUCCESS! Anthropic API is working!\n');
    console.log('📊 Response Details:');
    console.log(`   Model: ${response.model}`);
    console.log(`   Latency: ${latency}ms`);
    console.log(`   Input Tokens: ${response.usage.input_tokens}`);
    console.log(`   Output Tokens: ${response.usage.output_tokens}`);
    console.log(`   Stop Reason: ${response.stop_reason}`);
    console.log('\n💬 Response:');
    console.log(`   "${response.content[0].text}"\n`);

    // Calculate cost (Claude Sonnet: $0.003/1K input, $0.015/1K output)
    const costUsd = (response.usage.input_tokens * 0.003 / 1000) + (response.usage.output_tokens * 0.015 / 1000);
    console.log(`💰 Cost: $${costUsd.toFixed(4)}\n`);

    console.log('✅ Anthropic provider is ready for Triangle Consensus!\n');

  } catch (error) {
    console.error('❌ FAILED! Anthropic API error:\n');
    console.error(`   Error: ${error.message}`);

    if (error.status) {
      console.error(`   Status: ${error.status}`);
    }

    if (error.type) {
      console.error(`   Type: ${error.type}`);
    }

    console.log('\n💡 Common issues:');
    console.log('   - Invalid API key');
    console.log('   - Expired API key');
    console.log('   - No credits/billing set up');
    console.log('   - Rate limit exceeded\n');

    process.exit(1);
  }
}

testAnthropic();

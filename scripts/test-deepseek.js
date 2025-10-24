#!/usr/bin/env node
/**
 * Test DeepSeek API Key
 *
 * Simple script to verify DeepSeek API key works.
 * Usage: node scripts/test-deepseek.js
 */

require('dotenv').config();
const axios = require('axios');

async function testDeepSeek() {
  console.log('🧪 Testing DeepSeek API Key...\n');

  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    console.error('❌ DEEPSEEK_API_KEY not found in .env file');
    console.log('\n💡 Add your DeepSeek API key to .env:');
    console.log('   DEEPSEEK_API_KEY=sk-...\n');
    process.exit(1);
  }

  console.log(`✓ API Key found: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
  console.log('✓ Preparing DeepSeek API request...');

  try {
    console.log('✓ Sending test query: "What is 2+2?"...\n');

    const startTime = Date.now();

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: 'What is 2+2? Answer in one sentence.' }
        ],
        max_tokens: 50,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const latency = Date.now() - startTime;
    const data = response.data;

    console.log('✅ SUCCESS! DeepSeek API is working!\n');
    console.log('📊 Response Details:');
    console.log(`   Model: ${data.model}`);
    console.log(`   Latency: ${latency}ms`);
    console.log(`   Tokens: ${data.usage.total_tokens} (prompt: ${data.usage.prompt_tokens}, completion: ${data.usage.completion_tokens})`);
    console.log(`   Finish Reason: ${data.choices[0].finish_reason}`);
    console.log('\n💬 Response:');
    console.log(`   "${data.choices[0].message.content}"\n`);

    // Calculate cost (DeepSeek: $0.001/1K tokens - very cheap!)
    const costUsd = data.usage.total_tokens * 0.001 / 1000;
    console.log(`💰 Cost: $${costUsd.toFixed(6)} (DeepSeek is cheap!)\n`);

    console.log('✅ DeepSeek provider is ready for Triangle Consensus!\n');

  } catch (error) {
    console.error('❌ FAILED! DeepSeek API error:\n');

    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${error.response.data?.error?.message || error.message}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }

    console.log('\n💡 Common issues:');
    console.log('   - Invalid API key');
    console.log('   - Expired API key');
    console.log('   - No credits/billing set up');
    console.log('   - Rate limit exceeded');
    console.log('   - Network/connectivity issues\n');

    process.exit(1);
  }
}

testDeepSeek();

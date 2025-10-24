#!/usr/bin/env node
/**
 * Test OpenAI API Key
 *
 * Simple script to verify OpenAI API key works.
 * Usage: node scripts/test-openai.js
 */

require('dotenv').config();
const OpenAI = require('openai');

async function testOpenAI() {
  console.log('🧪 Testing OpenAI API Key...\n');

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    console.error('❌ OPENAI_API_KEY not found in .env file');
    console.log('\n💡 Add your OpenAI API key to .env:');
    console.log('   OPENAI_API_KEY=sk-...\n');
    process.exit(1);
  }

  console.log(`✓ API Key found: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
  console.log('✓ Initializing OpenAI client...');

  const client = new OpenAI({
    apiKey: apiKey
  });

  try {
    console.log('✓ Sending test query: "What is 2+2?"...\n');

    const startTime = Date.now();

    const response = await client.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'What is 2+2? Answer in one sentence.' }
      ],
      max_tokens: 50,
      temperature: 0.7
    });

    const latency = Date.now() - startTime;

    console.log('✅ SUCCESS! OpenAI API is working!\n');
    console.log('📊 Response Details:');
    console.log(`   Model: ${response.model}`);
    console.log(`   Latency: ${latency}ms`);
    console.log(`   Tokens: ${response.usage.total_tokens} (prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens})`);
    console.log(`   Finish Reason: ${response.choices[0].finish_reason}`);
    console.log('\n💬 Response:');
    console.log(`   "${response.choices[0].message.content}"\n`);

    // Calculate cost (GPT-4: $0.03/1K prompt tokens, $0.06/1K completion tokens)
    const costUsd = (response.usage.prompt_tokens * 0.03 / 1000) + (response.usage.completion_tokens * 0.06 / 1000);
    console.log(`💰 Cost: $${costUsd.toFixed(4)}\n`);

    console.log('✅ OpenAI provider is ready for Triangle Consensus!\n');

  } catch (error) {
    console.error('❌ FAILED! OpenAI API error:\n');
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

testOpenAI();

#!/usr/bin/env node

/**
 * Test script for Multi-Domain Empire
 *
 * Tests:
 * 1. Unified API Gateway (OpenAI, Ollama, Web Search)
 * 2. Spanish/English translation
 * 3. Lore Bot Generator (dry run)
 * 4. Perplexity Vault domain config
 *
 * Usage:
 *   node scripts/test-multi-domain-empire.js
 */

const UnifiedAPIGateway = require('../lib/unified-api-gateway');
const LoreBotGenerator = require('../lib/lore-bot-generator');
const { Pool } = require('pg');

async function main() {
  console.log('🏰 Multi-Domain Empire Test Suite\n');

  // Initialize
  const gateway = new UnifiedAPIGateway({
    openaiKey: process.env.OPENAI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    encryptionKey: process.env.ENCRYPTION_KEY
  });

  const db = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://matthewmauer@localhost:5432/calos'
  });

  const bot = new LoreBotGenerator({ db });

  try {
    // Test 1: Unified API with Ollama
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 1: Unified API - Ollama (Local, Free)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const ollamaResponse = await gateway.chat({
      model: 'llama3.2:3b',
      prompt: 'Explain Dark Souls lore in one sentence.',
      domain: 'calos'
    });

    console.log('Domain:', ollamaResponse.domain);
    console.log('Model:', ollamaResponse.model);
    console.log('Backend:', ollamaResponse.backend);
    console.log('Response:', ollamaResponse.response.substring(0, 150) + '...');
    console.log('Cost: $' + (ollamaResponse.metadata.cost || 0));
    console.log('Latency:', ollamaResponse.metadata.latency + 'ms\n');

    // Test 2: Web Search
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 2: Web Search (Perplexity Vault)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const searchResponse = await gateway.chat({
      model: 'web-search',
      prompt: 'Dark Souls video game',
      domain: 'perplexityvault'
    });

    console.log('Domain:', searchResponse.domain);
    console.log('Model:', searchResponse.model);
    console.log('Backend:', searchResponse.backend);
    console.log('Response:', searchResponse.response.substring(0, 200) + '...');
    console.log('Cost: $' + (searchResponse.metadata.cost || 0));
    console.log('Latency:', searchResponse.metadata.latency + 'ms\n');

    // Test 3: Spanish Translation
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 3: Spanish Translation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const spanishResponse = await gateway.chat({
      model: 'llama3.2:3b',
      prompt: '¿Qué es Dark Souls?',
      domain: 'calos',
      language: 'es'
    });

    console.log('Domain:', spanishResponse.domain);
    console.log('Language:', spanishResponse.language);
    console.log('Response (Spanish):', spanishResponse.response.substring(0, 150) + '...');
    console.log('Cost: $' + (spanishResponse.metadata.cost || 0) + '\n');

    // Test 4: Lore Bot (Dry Run)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 4: Lore Bot Generator (Dry Run)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const loreBotPost = await bot.generatePost({
      dryRun: true,
      domain: 'calos'
    });

    console.log('Game:', loreBotPost.game.name);
    console.log('Template:', loreBotPost.template.slug);
    console.log('Title:', loreBotPost.post.title);
    console.log('\nBody Preview:');
    console.log(loreBotPost.post.body.substring(0, 300) + '...\n');

    // Test 5: Domain Configurations
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 5: Domain Configurations');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const domains = Object.keys(gateway.domainConfigs);
    domains.forEach(domainKey => {
      const config = gateway.domainConfigs[domainKey];
      console.log(`${domainKey}:`);
      console.log(`  Name: ${config.name}`);
      console.log(`  Default Model: ${config.defaultModel}`);
      console.log(`  Focus: ${config.focus.join(', ')}`);
      console.log('');
    });

    // Test 6: Encryption
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 6: Response Encryption');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (process.env.ENCRYPTION_KEY) {
      const encryptedResponse = await gateway.chat({
        model: 'llama3.2:3b',
        prompt: 'Secret message about Dark Souls lore',
        domain: 'perplexityvault',
        encrypt: true
      });

      console.log('Encrypted:', encryptedResponse.encrypted);
      console.log('Response:', encryptedResponse.response); // Should say [ENCRYPTED]
      console.log('Encrypted Data:', {
        iv: encryptedResponse.encryptedData.iv.substring(0, 16) + '...',
        encrypted: encryptedResponse.encryptedData.encrypted.substring(0, 32) + '...',
        authTag: encryptedResponse.encryptedData.authTag.substring(0, 16) + '...'
      });
      console.log('');
    } else {
      console.log('⚠️  ENCRYPTION_KEY not set, skipping encryption test\n');
    }

    // Test 7: Bot Statistics
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 7: Lore Bot Statistics');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      const stats = await bot.getStats();
      console.log('Total Posts:', stats.total_posts);
      console.log('Total Upvotes:', stats.total_upvotes);
      console.log('Total Downvotes:', stats.total_downvotes);
      console.log('Total Comments:', stats.total_comments);
      console.log('Avg Engagement:', parseFloat(stats.avg_engagement || 0).toFixed(2));
      console.log('Domains Used:', stats.domains_used);
      console.log('Games Used:', stats.games_used);
      console.log('');
    } catch (error) {
      console.log('⚠️  Database tables not yet created. Run migration first:\n');
      console.log('   psql -d calos -f database/migrations/100_game_lore_system.sql\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All Tests Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Next Steps:');
    console.log('1. Run database migration:');
    console.log('   psql -d calos -f database/migrations/100_game_lore_system.sql');
    console.log('');
    console.log('2. Test unified API via HTTP:');
    console.log('   curl -X POST http://localhost:5001/api/unified/chat \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"model":"auto","prompt":"test","domain":"calos"}\'');
    console.log('');
    console.log('3. Generate bot post (dry run):');
    console.log('   node -e "const db=require(\'pg\').Pool; const bot=require(\'./lib/lore-bot-generator\'); new bot({db:new db()}).generatePost({dryRun:true}).then(console.log)"');
    console.log('');
    console.log('4. Read full guide:');
    console.log('   cat MULTI_DOMAIN_EMPIRE_GUIDE.md');
    console.log('');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await db.end();
  }
}

main();

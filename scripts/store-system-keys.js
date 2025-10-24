#!/usr/bin/env node
/**
 * Store Platform System API Keys
 *
 * Securely stores platform system keys using Keyring (encrypted database or macOS Keychain).
 * These keys are used as fallback when users don't have their own API keys.
 *
 * Usage:
 *   node scripts/store-system-keys.js
 *
 * Interactive prompts for OpenAI, Anthropic, and DeepSeek API keys.
 */

require('dotenv').config();
const readline = require('readline');
const { Pool } = require('pg');
const Keyring = require('../lib/keyring');
const VaultBridge = require('../lib/vault-bridge');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function main() {
  console.log('\n🔐 CALOS Platform System Key Storage');
  console.log('=====================================\n');
  console.log('This script stores your platform\'s API keys securely using Keyring.');
  console.log('Keys are encrypted with AES-256-GCM and stored in the database.');
  console.log('These keys serve as fallback when users don\'t provide their own.\n');

  // Connect to database
  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await db.query('SELECT 1');
    console.log('✓ Connected to database\n');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('\nMake sure DATABASE_URL is set in .env and migrations have run.');
    process.exit(1);
  }

  // Initialize Keyring
  const keyring = new Keyring(db, {
    encryptionKey: process.env.KEYRING_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')
  });

  const vaultBridge = new VaultBridge({ keyring, db });

  console.log('✓ Keyring initialized\n');
  console.log('─'.repeat(60));

  // Store OpenAI key
  console.log('\n📍 OpenAI API Key');
  console.log('─'.repeat(60));
  const openaiChoice = await question('Do you want to store an OpenAI system key? (y/n): ');

  if (openaiChoice.toLowerCase() === 'y') {
    const openaiKey = await question('Enter OpenAI API key (sk-...): ');

    if (openaiKey.trim() && openaiKey.startsWith('sk-')) {
      try {
        await vaultBridge.storeKey('openai', openaiKey.trim(), 'system', 'system', {
          description: 'Platform system key for OpenAI'
        });
        console.log('✅ OpenAI system key stored successfully!\n');
      } catch (error) {
        console.error('❌ Failed to store OpenAI key:', error.message);
      }
    } else {
      console.log('⚠️  Invalid OpenAI key format. Skipping.\n');
    }
  } else {
    console.log('⏭  Skipping OpenAI key\n');
  }

  // Store Anthropic key
  console.log('\n📍 Anthropic API Key');
  console.log('─'.repeat(60));
  const anthropicChoice = await question('Do you want to store an Anthropic system key? (y/n): ');

  if (anthropicChoice.toLowerCase() === 'y') {
    const anthropicKey = await question('Enter Anthropic API key (sk-ant-...): ');

    if (anthropicKey.trim() && anthropicKey.startsWith('sk-ant-')) {
      try {
        await vaultBridge.storeKey('anthropic', anthropicKey.trim(), 'system', 'system', {
          description: 'Platform system key for Anthropic'
        });
        console.log('✅ Anthropic system key stored successfully!\n');
      } catch (error) {
        console.error('❌ Failed to store Anthropic key:', error.message);
      }
    } else {
      console.log('⚠️  Invalid Anthropic key format. Skipping.\n');
    }
  } else {
    console.log('⏭  Skipping Anthropic key\n');
  }

  // Store DeepSeek key
  console.log('\n📍 DeepSeek API Key');
  console.log('─'.repeat(60));
  const deepseekChoice = await question('Do you want to store a DeepSeek system key? (y/n): ');

  if (deepseekChoice.toLowerCase() === 'y') {
    const deepseekKey = await question('Enter DeepSeek API key (sk-...): ');

    if (deepseekKey.trim() && deepseekKey.startsWith('sk-')) {
      try {
        await vaultBridge.storeKey('deepseek', deepseekKey.trim(), 'system', 'system', {
          description: 'Platform system key for DeepSeek'
        });
        console.log('✅ DeepSeek system key stored successfully!\n');
      } catch (error) {
        console.error('❌ Failed to store DeepSeek key:', error.message);
      }
    } else {
      console.log('⚠️  Invalid DeepSeek key format. Skipping.\n');
    }
  } else {
    console.log('⏭  Skipping DeepSeek key\n');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ System Key Storage Complete!');
  console.log('='.repeat(60));
  console.log('\n💡 Next Steps:');
  console.log('   1. Keys are now encrypted in the database');
  console.log('   2. VaultBridge will use these as fallback when users don\'t have their own keys');
  console.log('   3. Test Triangle Consensus with: node scripts/test-all-providers.js');
  console.log('   4. Hybrid BYOK is now active! 🎉\n');
  console.log('📝 How Hybrid BYOK Works:');
  console.log('   - User has OpenAI key → uses their OpenAI + your Anthropic/DeepSeek');
  console.log('   - User has no keys → uses all your system keys');
  console.log('   - User has all keys → uses all their keys');
  console.log('   - Triangle works in ALL scenarios! 🔺\n');

  rl.close();
  await db.end();
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});

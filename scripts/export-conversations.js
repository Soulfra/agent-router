#!/usr/bin/env node
/**
 * Export AI Conversations to CSV
 *
 * Usage:
 *   node scripts/export-conversations.js
 *   node scripts/export-conversations.js openai
 *   node scripts/export-conversations.js --stats
 *   node scripts/export-conversations.js --service openai --limit 500
 */

require('dotenv').config();
const { Pool } = require('pg');
const CSVConversationExporter = require('../lib/csv-conversation-exporter');
const path = require('path');

// Parse CLI args
const args = process.argv.slice(2);
const stats = args.includes('--stats');
const serviceArg = args.find(arg => arg === 'openai' || arg === 'anthropic' || arg === 'ollama');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : 10000;

// Parse filters
const filters = {
  limit
};

if (serviceArg) {
  filters.service = serviceArg;
}

// Check for --service flag
const serviceFlagIndex = args.indexOf('--service');
if (serviceFlagIndex !== -1) {
  filters.service = args[serviceFlagIndex + 1];
}

// Check for --model flag
const modelFlagIndex = args.indexOf('--model');
if (modelFlagIndex !== -1) {
  filters.model = args[modelFlagIndex + 1];
}

// Check for --purpose flag
const purposeFlagIndex = args.indexOf('--purpose');
if (purposeFlagIndex !== -1) {
  filters.purpose = args[purposeFlagIndex + 1];
}

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || 'matthewmauer',
  password: process.env.DB_PASSWORD || ''
});

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   AI Conversation CSV Exporter                 ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const exporter = new CSVConversationExporter({ db, verbose: true });

  try {
    if (stats) {
      // Export statistics
      console.log('Exporting conversation statistics...\n');

      const filename = exporter.generateFilename('ai_conversation_stats');
      const filepath = path.join(process.cwd(), filename);

      await exporter.exportStatsToFile(filepath, filters);

      console.log(`\n✅ Stats exported to: ${filepath}`);

    } else {
      // Export conversations
      console.log('Export filters:');
      console.log(`  Service: ${filters.service || 'all'}`);
      console.log(`  Model: ${filters.model || 'all'}`);
      console.log(`  Purpose: ${filters.purpose || 'all'}`);
      console.log(`  Limit: ${filters.limit}\n`);

      const filename = exporter.generateFilename('ai_conversations');
      const filepath = path.join(process.cwd(), filename);

      await exporter.exportToFile(filepath, filters);

      console.log(`\n✅ Conversations exported to: ${filepath}`);
    }

    // Show preview
    console.log('\nPreview:');
    const fs = require('fs');
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n').slice(0, 5);
    lines.forEach(line => console.log(line));
    console.log('...');

  } catch (error) {
    console.error('\n❌ Export failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
AI Conversation CSV Exporter

Usage:
  npm run export:conversations
  npm run export:conversations -- openai
  npm run export:conversations -- --stats
  npm run export:conversations -- --service openai --limit 500

Options:
  --stats              Export statistics instead of conversations
  --service <name>     Filter by service (openai, anthropic, ollama)
  --model <name>       Filter by model (gpt-4, claude-3-opus, mistral:7b)
  --purpose <name>     Filter by purpose (bug_diagnosis, lesson_help, chat)
  --limit <number>     Max rows to export (default: 10000)
  --help, -h           Show this help

Examples:
  # Export all conversations
  npm run export:conversations

  # Export only OpenAI conversations
  npm run export:conversations -- openai

  # Export statistics
  npm run export:conversations -- --stats

  # Export last 500 bug diagnoses
  npm run export:conversations -- --purpose bug_diagnosis --limit 500

Output:
  CSV file saved to current directory with timestamp:
    ai_conversations_2024-10-22_14-30-45.csv
    ai_conversation_stats_2024-10-22_14-30-45.csv
`);
  process.exit(0);
}

main();

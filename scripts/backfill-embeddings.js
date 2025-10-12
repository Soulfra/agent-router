#!/usr/bin/env node

/**
 * Backfill Embeddings
 *
 * Generates embeddings for all existing messages in the database
 * that don't already have embeddings.
 *
 * Usage:
 *   node scripts/backfill-embeddings.js [--limit N] [--dry-run]
 *
 * Options:
 *   --limit N    - Only process N messages (for testing)
 *   --dry-run    - Show what would be done without doing it
 *   --force      - Regenerate embeddings even if they exist
 */

const { spawn } = require('child_process');
const path = require('path');
const EmbeddingsGenerator = require('../lib/embeddings');
const MessageStore = require('../lib/message-store');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  limit: null,
  dryRun: false,
  force: false
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    options.limit = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--dry-run') {
    options.dryRun = true;
  } else if (args[i] === '--force') {
    options.force = true;
  }
}

// Colors for output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

function log(color, symbol, message) {
  console.log(`${color}${symbol}${colors.reset} ${message}`);
}

function progress(current, total, message) {
  const percent = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(percent / 2)) + '░'.repeat(50 - Math.floor(percent / 2));
  process.stdout.write(`\r${colors.blue}${bar}${colors.reset} ${percent}% (${current}/${total}) ${message}  `);
}

async function getMessagesWithoutEmbeddings(messageStore, limit, force) {
  const DB_PATH = path.join(process.env.HOME, '.deathtodata/local.db');

  let sql;
  if (force) {
    sql = 'SELECT * FROM chat_messages ORDER BY timestamp DESC';
  } else {
    sql = 'SELECT * FROM chat_messages WHERE embedding IS NULL ORDER BY timestamp DESC';
  }

  if (limit) {
    sql += ` LIMIT ${limit}`;
  }

  return new Promise((resolve, reject) => {
    const sqlite = spawn('sqlite3', [DB_PATH, sql]);
    let output = '';
    let error = '';

    sqlite.stdout.on('data', (data) => {
      output += data.toString();
    });

    sqlite.stderr.on('data', (data) => {
      error += data.toString();
    });

    sqlite.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(error || 'SQLite query failed'));
        return;
      }

      const lines = output.trim().split('\n').filter(line => line.length > 0);
      const messages = lines.map(line => {
        const parts = line.split('|');
        return {
          id: parts[0],
          session_id: parts[1],
          type: parts[2],
          user: parts[3],
          agent: parts[4],
          message: parts[5],
          formatted_html: parts[6],
          timestamp: parts[7],
          hash: parts[8],
          metadata: parts[9],
          embedding: parts[10]
        };
      });

      resolve(messages);
    });
  });
}

async function updateEmbedding(messageId, embedding) {
  const DB_PATH = path.join(process.env.HOME, '.deathtodata/local.db');
  const embeddingJson = JSON.stringify(embedding);
  const escapedJson = embeddingJson.replace(/'/g, "''");

  const sql = `UPDATE chat_messages SET embedding = '${escapedJson}' WHERE id = ${messageId};`;

  return new Promise((resolve, reject) => {
    const sqlite = spawn('sqlite3', [DB_PATH, sql]);
    let error = '';

    sqlite.stderr.on('data', (data) => {
      error += data.toString();
    });

    sqlite.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(error || 'SQLite update failed'));
      } else {
        resolve();
      }
    });
  });
}

async function main() {
  console.log('');
  log(colors.blue, '🔄', 'CalOS Embedding Backfill Tool');
  console.log('');

  // Show options
  if (options.dryRun) {
    log(colors.yellow, '⚠️ ', 'DRY RUN MODE - No changes will be made');
  }
  if (options.limit) {
    log(colors.blue, 'ℹ️ ', `Limiting to ${options.limit} messages`);
  }
  if (options.force) {
    log(colors.yellow, '⚠️ ', 'FORCE MODE - Regenerating all embeddings');
  }
  console.log('');

  // Initialize message store and embeddings
  log(colors.blue, '🔧', 'Initializing embedding generator...');
  const embedder = new EmbeddingsGenerator({
    provider: 'local', // Use Ollama
    cache: false // Don't cache during backfill
  });

  const messageStore = new MessageStore({ enableEmbeddings: false });

  // Check Ollama availability
  try {
    const OllamaEmbeddings = require('../lib/ollama-embeddings');
    const ollama = new OllamaEmbeddings();
    const available = await ollama.isAvailable();

    if (!available) {
      log(colors.red, '❌', 'Ollama embedding model not available');
      log(colors.yellow, '⚠️ ', 'Please ensure Ollama is running and nomic-embed-text model is installed');
      log(colors.blue, 'ℹ️ ', 'Run: ollama pull nomic-embed-text');
      process.exit(1);
    }

    log(colors.green, '✓', 'Ollama embedding model ready');
  } catch (error) {
    log(colors.red, '❌', `Failed to check Ollama: ${error.message}`);
    process.exit(1);
  }

  // Get messages without embeddings
  log(colors.blue, '📊', 'Counting messages to process...');
  const messages = await getMessagesWithoutEmbeddings(messageStore, options.limit, options.force);

  if (messages.length === 0) {
    log(colors.green, '✅', 'All messages already have embeddings!');
    process.exit(0);
  }

  log(colors.blue, '📝', `Found ${messages.length} messages to process`);
  console.log('');

  if (options.dryRun) {
    log(colors.yellow, '🔍', 'Sample messages:');
    messages.slice(0, 5).forEach(msg => {
      console.log(`  [${msg.id}] ${msg.type}: ${msg.message.substring(0, 60)}...`);
    });
    console.log('');
    log(colors.blue, 'ℹ️ ', 'Run without --dry-run to process these messages');
    process.exit(0);
  }

  // Process messages
  log(colors.blue, '⚡', 'Generating embeddings...');
  console.log('');

  const startTime = Date.now();
  let successful = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    try {
      // Generate embedding
      const embedding = await embedder.generate(msg.message);

      // Update database
      await updateEmbedding(msg.id, embedding);

      successful++;
      progress(i + 1, messages.length, `Processing... [✓ ${successful} ✗ ${failed}]`);

    } catch (error) {
      failed++;
      errors.push({
        messageId: msg.id,
        error: error.message
      });
      progress(i + 1, messages.length, `Processing... [✓ ${successful} ✗ ${failed}]`);
    }
  }

  console.log('\n');

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const rate = (successful / (Date.now() - startTime) * 1000).toFixed(1);

  console.log('');
  log(colors.green, '✅', 'Backfill complete!');
  console.log('');
  console.log(`  Total:      ${messages.length}`);
  console.log(`  ${colors.green}Successful: ${successful}${colors.reset}`);
  console.log(`  ${colors.red}Failed:     ${failed}${colors.reset}`);
  console.log(`  Time:       ${elapsed}s`);
  console.log(`  Rate:       ${rate} embeddings/sec`);
  console.log('');

  if (failed > 0) {
    log(colors.yellow, '⚠️ ', `${failed} messages failed to process`);
    log(colors.blue, 'ℹ️ ', 'First 5 errors:');
    errors.slice(0, 5).forEach(err => {
      console.log(`  Message ${err.messageId}: ${err.error}`);
    });
    console.log('');
  }

  // Show status
  log(colors.blue, '📊', 'Current database status:');
  const allMessages = await messageStore._querySQL('SELECT COUNT(*) as total, COUNT(embedding) as with_embedding FROM chat_messages');
  const stats = allMessages[0] || { total: 0, with_embedding: 0 };
  console.log(`  Total messages:     ${stats.total}`);
  console.log(`  With embeddings:    ${stats.with_embedding}`);
  console.log(`  Without embeddings: ${stats.total - stats.with_embedding}`);
  console.log('');
}

// Run
main().catch(error => {
  console.error('');
  log(colors.red, '❌', `Fatal error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});

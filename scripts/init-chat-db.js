#!/usr/bin/env node

/**
 * Initialize Chat Messages Database
 * Creates chat_messages table in ~/.deathtodata/local.db
 *
 * Features:
 * - Perfect recall: Every message stored with hash
 * - Formatting: Stores both raw and formatted HTML
 * - Verification: Hash-based integrity checking
 *
 * Usage: node scripts/init-chat-db.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(process.env.HOME, '.deathtodata/local.db');

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  console.log(`📁 Creating directory: ${dbDir}`);
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create chat_messages table
const createTableSQL = `
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  type TEXT NOT NULL,
  user TEXT,
  agent TEXT,
  message TEXT NOT NULL,
  formatted_html TEXT,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  hash TEXT UNIQUE,
  metadata TEXT
);
`;

// Create indexes for fast queries
const createIndexesSQL = `
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_chat_type ON chat_messages(type);
CREATE INDEX IF NOT EXISTS idx_chat_hash ON chat_messages(hash);
`;

function runSQL(sql, description) {
  return new Promise((resolve, reject) => {
    console.log(`⚙️  ${description}...`);

    const proc = spawn('sqlite3', [DB_PATH, sql]);

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`✓ ${description} complete`);
        resolve();
      } else {
        console.error(`✗ ${description} failed: ${stderr}`);
        reject(new Error(`Failed: ${description}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  console.log('🔧 Initializing chat database...');
  console.log(`📍 Database: ${DB_PATH}`);
  console.log('');

  try {
    // Create table
    await runSQL(createTableSQL, 'Creating chat_messages table');

    // Create indexes
    await runSQL(createIndexesSQL, 'Creating indexes');

    console.log('');
    console.log('✅ Chat database initialized successfully!');
    console.log('');
    console.log('Table structure:');
    console.log('  - id: Primary key');
    console.log('  - session_id: Chat session identifier');
    console.log('  - type: Message type (chat, agent_response, etc)');
    console.log('  - user: User name');
    console.log('  - agent: Agent name');
    console.log('  - message: Raw message text');
    console.log('  - formatted_html: Formatted HTML with bold/colors/underline');
    console.log('  - timestamp: Message timestamp');
    console.log('  - hash: SHA-256 hash for verification');
    console.log('  - metadata: Additional JSON metadata');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Start router: node router.js');
    console.log('  2. Open feed: http://localhost:5001/feed.html');
    console.log('  3. Verify storage: curl http://localhost:5001/api/verify');

  } catch (error) {
    console.error('');
    console.error('❌ Initialization failed:', error.message);
    process.exit(1);
  }
}

main();

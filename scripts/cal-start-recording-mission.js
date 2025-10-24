#!/usr/bin/env node

/**
 * CalRiven Recording Mission - CLI Starter
 *
 * Starts CalRiven's autonomous recording mission:
 * - Monitors for phone recordings
 * - Auto-transcribes via Whisper
 * - Optionally creates GitHub repo
 * - Tracks quest progress
 * - Logs to Mission Control dashboard
 *
 * Usage:
 *   node scripts/cal-start-recording-mission.js
 *   or
 *   npm run mission:recording
 */

const path = require('path');
const { Pool } = require('pg');
const RecordingMissionOrchestrator = require('../lib/recording-mission-orchestrator');
const QuestEngine = require('../lib/quest-engine');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

function log(message, color = 'cyan') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
  console.log('');
  console.log(`${colors.bright}${colors.magenta}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}  ${message}${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}${'='.repeat(60)}${colors.reset}`);
  console.log('');
}

async function main() {
  header('🎙️ CalRiven Recording Mission - STARTING');

  try {
    // Initialize database connection
    log('📊 Connecting to database...', 'cyan');
    const db = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/calos'
    });

    await db.query('SELECT NOW()');
    log('✅ Database connected', 'green');

    // Initialize quest engine
    log('🎮 Initializing quest engine...', 'cyan');
    const questEngine = new QuestEngine({ db });
    log('✅ Quest engine ready', 'green');

    // Get user ID (default or from args)
    const userId = process.argv[2] || 'default_user';
    log(`👤 User: ${userId}`, 'yellow');

    // Configuration
    const config = {
      db,
      questEngine,
      questSlug: 'record-calos-walkthrough',

      // Recording detection
      scanInterval: 30000, // 30 seconds
      recordingPaths: [
        path.join(require('os').homedir(), 'Downloads'),
        path.join(require('os').homedir(), 'Desktop'),
        '/tmp'
      ],

      // Features
      enableTranscription: process.env.OPENAI_API_KEY ? true : false,
      enableGitHubRepo: process.env.GITHUB_TOKEN ? true : false,
      enableNpmPackage: false, // Not implemented yet

      // API keys
      openaiApiKey: process.env.OPENAI_API_KEY,
      githubToken: process.env.GITHUB_TOKEN,

      // Logging
      logToConsole: true,
      logToVault: false
    };

    // Check prerequisites
    log('🔍 Checking prerequisites...', 'cyan');

    if (!config.enableTranscription) {
      log('⚠️  Transcription disabled (set OPENAI_API_KEY to enable)', 'yellow');
    } else {
      log('✅ Transcription enabled (Whisper API)', 'green');
    }

    if (!config.enableGitHubRepo) {
      log('⚠️  GitHub repo generation disabled (set GITHUB_TOKEN to enable)', 'yellow');
    } else {
      log('✅ GitHub repo generation enabled', 'green');
    }

    // Create orchestrator
    log('🤖 Initializing CalRiven orchestrator...', 'cyan');
    const orchestrator = new RecordingMissionOrchestrator(config);

    // Setup event listeners
    setupEventListeners(orchestrator);

    // Start mission
    header('🚀 STARTING AUTONOMOUS MISSION');

    log('CalRiven will now:', 'cyan');
    log('  1. Monitor for new recording files', 'cyan');
    log('  2. Detect CALOS walkthrough recordings', 'cyan');
    if (config.enableTranscription) {
      log('  3. Auto-transcribe via OpenAI Whisper', 'cyan');
    }
    if (config.enableGitHubRepo) {
      log('  4. Generate GitHub repository', 'cyan');
    }
    log('  5. Update quest progress', 'cyan');
    log('  6. Claim rewards when complete', 'cyan');
    console.log('');

    log(`Scanning paths:`, 'yellow');
    config.recordingPaths.forEach(p => log(`  - ${p}`, 'yellow'));
    console.log('');

    log(`Scan interval: ${config.scanInterval / 1000} seconds`, 'yellow');
    console.log('');

    await orchestrator.start(userId);

    log('✅ Mission started!', 'green');
    console.log('');
    log('Press Ctrl+C to stop', 'yellow');
    console.log('');

    // Print dashboard URL
    log('📊 Dashboard: http://localhost:5001/recording-mission-dashboard.html', 'magenta');
    log('🔍 Recordings API: http://localhost:5001/api/explorer/recordings', 'magenta');
    log('📈 Mission Status: http://localhost:5001/api/recording-mission/status', 'magenta');
    console.log('');

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('');
      log('🛑 Stopping mission...', 'yellow');
      await orchestrator.stop();
      await db.end();
      log('✅ Mission stopped', 'green');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await orchestrator.stop();
      await db.end();
      process.exit(0);
    });

  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Setup event listeners for orchestrator
 */
function setupEventListeners(orchestrator) {
  orchestrator.on('mission:started', ({ userId }) => {
    log(`🎬 Mission started for user: ${userId}`, 'green');
  });

  orchestrator.on('quest:initialized', ({ userId, questSlug }) => {
    log(`🎮 Quest initialized: ${questSlug}`, 'green');
  });

  orchestrator.on('recording:detected', ({ filePath, size }) => {
    console.log('');
    header('🎤 NEW RECORDING DETECTED');
    log(`File: ${filePath}`, 'yellow');
    log(`Size: ${formatBytes(size)}`, 'yellow');
    console.log('');
  });

  orchestrator.on('transcription:complete', ({ filePath, transcription }) => {
    console.log('');
    header('🎧 TRANSCRIPTION COMPLETE');
    log(`File: ${filePath}`, 'yellow');
    log(`Duration: ${transcription.duration} seconds`, 'yellow');
    log(`Word count: ${transcription.text.split(/\s+/).length}`, 'yellow');
    log(`Saved to: ${transcription.path}`, 'green');
    console.log('');
  });

  orchestrator.on('github:created', ({ repo }) => {
    console.log('');
    header('📦 GITHUB REPO CREATED');
    log(`URL: ${repo.url}`, 'green');
    log(`Name: ${repo.name}`, 'yellow');
    console.log('');
  });

  orchestrator.on('quest:completed', ({ userId, questSlug, reward }) => {
    console.log('');
    header('🎉 QUEST COMPLETED!');
    log(`Quest: ${questSlug}`, 'yellow');
    log(`Reward: ${JSON.stringify(reward, null, 2)}`, 'green');
    console.log('');
  });

  orchestrator.on('recording:error', ({ filePath, error }) => {
    console.log('');
    log(`❌ Error processing ${filePath}:`, 'red');
    log(`   ${error}`, 'red');
    console.log('');
  });

  orchestrator.on('mission:stopped', () => {
    log('🛑 Mission stopped', 'yellow');
  });
}

/**
 * Format bytes to human-readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

// Run
main();

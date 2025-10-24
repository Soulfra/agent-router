#!/usr/bin/env node
/**
 * Cal Autonomous Loop
 *
 * Launches Cal in fully autonomous mode with:
 * - Learning loop (completes lessons)
 * - Guardian health monitoring
 * - External bug reporting (OpenAI/CodeRabbit)
 * - Automatic patch application
 * - WebSocket broadcasting for dashboard
 *
 * Cal will:
 * 1. Complete lessons every 5 minutes
 * 2. Monitor system health every 60 seconds
 * 3. Detect errors (migrations, tests, API failures)
 * 4. Send minimal snippets to OpenAI for diagnosis
 * 5. Apply suggested patches automatically
 * 6. Verify fixes worked
 * 7. Rollback if fixes fail
 * 8. Broadcast all activity to WebSocket dashboard
 *
 * Usage:
 *   node scripts/cal-autonomous-loop.js
 *   node scripts/cal-autonomous-loop.js --verbose
 *   node scripts/cal-autonomous-loop.js --dry-run
 */

require('dotenv').config();
const { Pool } = require('pg');
const WebSocket = require('ws');
const { getTimeService } = require('../lib/time-service');

// Cal's core systems
const CalLearningLoop = require('../lib/cal-learning-loop');
const GuardianAgent = require('../agents/guardian-agent');
const CalMetaOrchestrator = require('../lib/cal-meta-orchestrator');
const LearningEngine = require('../lib/learning-engine');

// Parse CLI args
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const dryRun = args.includes('--dry-run');

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || 'matthewmauer',
  password: process.env.DB_PASSWORD || ''
});

// WebSocket server for dashboard
const wss = new WebSocket.Server({ port: 5001 });

// Initialize TimeService
const timeService = getTimeService();

// Broadcast function
function broadcast(data) {
  const message = JSON.stringify({
    ...data,
    timestamp: timeService.toISOString() // Use corrected time
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  if (verbose) {
    console.log(`[WebSocket] Broadcasting: ${data.type}`);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                                                        ║');
  console.log('║          Cal Autonomous Learning System                ║');
  console.log('║          Self-Healing AI System Administrator          ║');
  console.log('║                                                        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No actual changes will be made\n');
  }

  // Check system time
  const timeStatus = timeService.getStatus();
  console.log(`🕐 Time Status: ${timeStatus.mode}`);
  console.log(`   System: ${timeStatus.systemTime}`);
  console.log(`   Corrected: ${timeStatus.correctedTime}`);
  if (timeStatus.yearDifference !== 0) {
    console.warn(`   ⚠️  Year difference detected: ${timeStatus.yearDifference} years\n`);
  }

  console.log('Initializing Cal\'s systems...\n');

  try {
    // 1. Learning Engine
    const learningEngine = new LearningEngine({ db });
    console.log('✓ Learning Engine initialized');

    // 2. Guardian (health monitoring + auto-healing)
    const guardian = new GuardianAgent({
      db,
      verbose,
      model: 'mistral:7b'
    });
    console.log('✓ Guardian Agent initialized');

    // 3. Cal Learning Loop (lesson completion)
    const calLoop = new CalLearningLoop({
      db,
      userId: 'cal',
      learningEngine,
      sandboxMode: true, // Safety: only safe commands
      broadcast: broadcast, // WebSocket broadcasting
      interval: 300000 // 5 minutes per lesson
    });
    console.log('✓ Cal Learning Loop initialized');

    // 4. Meta-Orchestrator (coordinates everything)
    const metaOrchestrator = new CalMetaOrchestrator({
      db,
      calLoop,
      guardian,
      learningEngine,
      userId: 'cal',
      cycleInterval: 300000 // 5 minutes
    });
    console.log('✓ Meta-Orchestrator initialized\n');

    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Cal is now running autonomously with:\n');
    console.log('  📚 Learning Loop - Completes lessons every 5 min');
    console.log('  🛡️  Guardian - Health checks every 60 sec');
    console.log('  🤖 AI Bug Reporter - Sends errors to OpenAI');
    console.log('  🔧 Auto-Patcher - Applies AI-suggested fixes');
    console.log('  📡 WebSocket - Broadcasting to port 5001\n');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('Dashboard: http://localhost:3000/learning-dashboard.html\n');
    console.log('Press Ctrl+C to stop Cal\n');

    // Start Guardian monitoring loop (every 60 seconds)
    const guardianInterval = setInterval(async () => {
      try {
        console.log('\n[Guardian] Running health check...');
        const result = await guardian.monitor();

        // Broadcast Guardian status
        broadcast({
          type: 'guardian:health_check',
          status: result.status,
          severity: result.severity,
          message: result.message.substring(0, 200),
          toolsUsed: result.toolsUsed,
          duration: result.duration
        });

        if (result.severity === 'error') {
          console.log('[Guardian] ⚠️  Errors detected, will attempt auto-heal on next cycle');
        }

      } catch (error) {
        console.error('[Guardian] Health check failed:', error.message);

        // Try to auto-heal the error
        if (process.env.OPENAI_API_KEY) {
          console.log('[Guardian] Attempting auto-heal...');
          const healResult = await guardian.autoHealError(error, {
            source: 'guardian_health_check',
            stackTrace: error.stack
          });

          broadcast({
            type: 'guardian:auto_heal',
            success: healResult.success,
            diagnosis: healResult.diagnosis,
            error: healResult.error
          });
        }
      }
    }, 60000); // Every 60 seconds

    // Start Cal's meta-orchestrator
    await metaOrchestrator.start();

    console.log('✅ Cal is now learning and monitoring autonomously!\n');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\nShutting down Cal...');
      clearInterval(guardianInterval);
      metaOrchestrator.stop();
      await db.end();
      wss.close();
      console.log('Cal stopped. Goodbye! 👋\n');
      process.exit(0);
    });

    // Keep process alive
    process.stdin.resume();

  } catch (error) {
    console.error('\n❌ Failed to start Cal:\n');
    console.error(error);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Test Cal in Sandbox Mode with Attribution Tracking
 *
 * Shows:
 * - Sandbox safety (blocking dangerous commands)
 * - Attribution tracking (skill vs luck)
 * - WebSocket broadcasting (simulated)
 */

const { Pool } = require('pg');

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || 'matthewmauer',
  password: process.env.DB_PASSWORD || ''
});

const CalLearningLoop = require('../lib/cal-learning-loop');

// Simulated WebSocket broadcast
function simulatedBroadcast(data) {
  const emoji = {
    'cal:lesson_start': '📖',
    'cal:exercise_start': '🏋️',
    'cal:exercise_complete': '✅',
    'cal:exercise_failed': '⚠️',
    'cal:exercise_blocked': '🔒',
    'cal:lesson_complete': '🎓',
    'cal:needs_help': '🆘'
  };

  console.log(`\n${emoji[data.type] || '📡'} [WebSocket] ${data.type}`);
  console.log(`   Data:`, JSON.stringify(data, null, 2).split('\n').map(l => `   ${l}`).join('\n'));
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Cal Sandbox Mode Test');
  console.log('  Safety + Attribution + WebSocket Broadcasting');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Create Cal with sandbox mode enabled
    const calLoop = new CalLearningLoop({
      db,
      userId: 'cal',
      sandboxMode: true, // SAFETY ENABLED
      broadcast: simulatedBroadcast // WebSocket simulation
    });

    console.log('✅ Cal initialized with sandbox=true\n');
    console.log('🔒 Dangerous commands will be blocked');
    console.log('📊 Attribution will track skill vs luck');
    console.log('📡 WebSocket events will broadcast\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Run one iteration
    console.log('Running Cal Learning Iteration...\n');
    await calLoop.runIteration();

    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  Test Complete!');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('What Just Happened:');
    console.log('  1. Cal started a lesson (broadcasted via WebSocket)');
    console.log('  2. For each exercise:');
    console.log('     - Checked if command is safe (sandbox mode)');
    console.log('     - Executed if safe, blocked if dangerous');
    console.log('     - Broadcasted result (success/failure/blocked)');
    console.log('  3. Calculated attribution (skill vs luck)');
    console.log('  4. Completed lesson with attribution data\n');

    console.log('Attribution Explained:');
    console.log('  - 90%+ success = "skill" (Cal mastered it)');
    console.log('  - 60-90% success = "mixed" (learning in progress)');
    console.log('  - <60% success = "luck" (needs more practice)\n');

  } catch (error) {
    console.error('\n❌ Test Failed:\n');
    console.error(error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main();

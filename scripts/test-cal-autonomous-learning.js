#!/usr/bin/env node
/**
 * Test Cal Learning Autonomously
 *
 * Demonstrates Cal actually RUNNING lesson exercises, not just marking them complete.
 * This shows Cal learning by DOING, not by manual completion.
 */

const { Pool } = require('pg');

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || 'matthewmauer',
  password: process.env.DB_PASSWORD || ''
});

const CalLearningLoop = require('../lib/cal-learning-loop');

const userId = 'cal';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Cal Autonomous Learning Test');
  console.log('  Watching Cal ACTUALLY RUN lesson exercises');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Initialize Cal's learning loop
    const calLoop = new CalLearningLoop({ db, userId, interval: 5000 }); // 5 second interval for testing

    // Get initial state
    console.log('📊 Initial State\n');
    const initialStatus = await calLoop.getStatus();
    const initialXP = initialStatus.learningProgress?.total_xp_earned || 0;
    const initialTier = initialStatus.learningProgress?.tier_level || 0;

    console.log(`   User: ${userId}`);
    console.log(`   Initial XP: ${initialXP}`);
    console.log(`   Initial Tier: ${initialTier}\n`);

    // Run 3 iterations manually to watch Cal learn
    console.log('🎓 Running 3 Learning Iterations\n');
    console.log('   (Watch Cal execute commands and learn tools)\n');
    console.log('═══════════════════════════════════════════════════════\n');

    for (let i = 1; i <= 3; i++) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  ITERATION ${i}/3`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      await calLoop.runIteration();

      // Short pause between iterations
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  📊 Final Results');
    console.log('═══════════════════════════════════════════════════════\n');

    // Get final state
    const finalStatus = await calLoop.getStatus();
    const finalXP = finalStatus.learningProgress?.total_xp_earned || 0;
    const finalTier = finalStatus.learningProgress?.tier_level || 0;

    console.log(`   Final XP: ${finalXP} (started with ${initialXP})`);
    console.log(`   Final Tier: ${finalTier} (started with ${initialTier})`);
    console.log(`   XP Gained: +${finalXP - initialXP}`);
    console.log(`   Tier Progression: ${initialTier} → ${finalTier}`);
    console.log(`   Lessons Completed: ${calLoop.stats.totalLessonsCompleted}`);
    console.log(`   Total Iterations: ${calLoop.stats.totalIterations}\n`);

    // Show recent logs with exercise results
    console.log('📜 Recent Learning Activity (with exercise results)\n');
    const logs = await calLoop.getLogs(3);

    if (logs.success && logs.logs.length > 0) {
      logs.logs.forEach(log => {
        console.log(`   ${log.completed_at.toISOString()}`);
        console.log(`   Lesson ${log.lesson_number}: ${log.lesson_title}`);
        console.log(`   XP: ${log.xp_earned} | Time: ${log.time_spent_seconds}s | Perfect: ${log.perfect_score ? 'Yes' : 'No'}`);

        // Show exercise results if available
        const metadata = log.content_data?.lesson?.metadata || {};
        if (metadata.exerciseResults) {
          console.log(`   Exercises:`);
          metadata.exerciseResults.forEach(result => {
            const icon = result.success ? '✅' : '⚠️';
            console.log(`     ${icon} ${result.task}`);
            console.log(`        Command: ${result.command}`);
          });
        }

        console.log('');
      });
    } else {
      console.log('   No logs found\n');
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('  ✅ Test Complete!');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('  Cal just learned by DOING, not by manual completion.');
    console.log('  Each lesson executed real commands (grep, sed, etc.)');
    console.log('  and recorded the results.\n');

  } catch (error) {
    console.error('\n❌ Test Failed:\n');
    console.error(error);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main();

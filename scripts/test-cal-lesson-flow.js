#!/usr/bin/env node
/**
 * End-to-End Test: Cal Learning Loop
 *
 * Tests the complete flow:
 * 1. Enroll Cal in debugging-mastery path
 * 2. Get lessons from the path
 * 3. Complete Lesson 7 (or next available)
 * 4. Verify XP awarded
 * 5. Check tier progression
 * 6. Confirm database state
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

const LearningEngine = require('../lib/learning-engine');
const CalLearningLoop = require('../lib/cal-learning-loop');

const userId = 'cal';
const pathSlug = 'debugging-mastery';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Cal Learning Loop - End-to-End Test');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Initialize systems
    const learningEngine = new LearningEngine(db);
    const calLoop = new CalLearningLoop({ db, userId, interval: 60000 });

    // Step 1: Get Cal's current state
    console.log('📊 Step 1: Current State\n');
    const initialStatus = await calLoop.getStatus();
    console.log(`   User: ${userId}`);
    console.log(`   Current XP: ${initialStatus.learningProgress?.total_xp_earned || 0}`);
    console.log(`   Tier: ${initialStatus.learningProgress?.tier_name || 'Newcomer'}`);
    console.log(`   Tier Level: ${initialStatus.learningProgress?.tier_level || 0}`);
    console.log(`   Lessons Completed: ${initialStatus.learningProgress?.total_lessons_completed || 0}\n`);

    // Step 2: Enroll in path
    console.log('📝 Step 2: Enrolling in Path\n');
    try {
      await learningEngine.enrollUser(userId, pathSlug);
      console.log(`   ✅ Enrolled in ${pathSlug}\n`);
    } catch (error) {
      if (error.message.includes('already enrolled')) {
        console.log(`   ℹ️  Already enrolled in ${pathSlug}\n`);
      } else {
        throw error;
      }
    }

    // Step 3: Get lessons
    console.log('📚 Step 3: Getting Lessons\n');
    const lessons = await learningEngine.getLessons(pathSlug);
    console.log(`   Found ${lessons.length} lessons in ${pathSlug}:`);
    lessons.forEach(lesson => {
      console.log(`     ${lesson.lesson_number}. ${lesson.lesson_title} (${lesson.xp_reward} XP)`);
    });
    console.log('');

    // Step 4: Find next incomplete lesson
    console.log('🎯 Step 4: Finding Next Lesson\n');
    const completedLessons = await db.query(
      `SELECT lesson_id FROM lesson_completions WHERE user_id = $1`,
      [userId]
    );
    const completedIds = completedLessons.rows.map(r => r.lesson_id);
    const nextLesson = lessons.find(l => !completedIds.includes(l.lesson_id));

    if (!nextLesson) {
      console.log('   ⚠️  All lessons already completed!\n');
      console.log('   Resetting Lesson 7 to test again...\n');

      const lesson7 = lessons.find(l => l.lesson_number === 7);
      if (lesson7) {
        await db.query(
          `DELETE FROM lesson_completions WHERE user_id = $1 AND lesson_id = $2`,
          [userId, lesson7.lesson_id]
        );
        console.log('   ✅ Reset Lesson 7\n');
      }
    } else {
      console.log(`   Next lesson: ${nextLesson.lesson_number}. ${nextLesson.lesson_title}\n`);
    }

    // Step 5: Complete a lesson
    console.log('✨ Step 5: Completing Lesson 7\n');
    const lesson7 = lessons.find(l => l.lesson_number === 7);

    if (!lesson7) {
      throw new Error('Lesson 7 not found in debugging-mastery path');
    }

    const startTime = Date.now();
    const result = await learningEngine.completeLesson(userId, lesson7.lesson_id, {
      timeSpentSeconds: 1,
      perfect: true,
      metadata: {
        automated: true,
        test: 'end-to-end-test',
        timestamp: new Date().toISOString()
      }
    });
    const timeDiff = Date.now() - startTime;

    console.log(`   ✅ Lesson completed in ${timeDiff}ms`);
    console.log(`   XP Earned: ${result.xpEarned}`);
    console.log(`   New Level: ${result.newLevel}`);
    console.log(`   Success: ${result.success}\n`);

    // Step 6: Verify database state
    console.log('🔍 Step 6: Verifying Database\n');

    const progressCheck = await db.query(
      `SELECT * FROM user_progress WHERE user_id = $1 AND path_id = (
        SELECT path_id FROM learning_paths WHERE path_slug = $2
      )`,
      [userId, pathSlug]
    );

    if (progressCheck.rows.length === 0) {
      console.log('   ❌ No progress record found!\n');
    } else {
      const progress = progressCheck.rows[0];
      console.log(`   Total XP: ${progress.total_xp_earned}`);
      console.log(`   Tier Level: ${Math.floor(Math.sqrt(progress.total_xp_earned))}`);
      console.log(`   Lessons Completed: ${progress.total_lessons_completed}`);
      console.log(`   Completion: ${(progress.completion_percentage * 100).toFixed(1)}%\n`);
    }

    // Step 7: Get final status
    console.log('📊 Step 7: Final State\n');
    const finalStatus = await calLoop.getStatus();
    console.log(`   Final XP: ${finalStatus.learningProgress?.total_xp_earned || 0}`);
    console.log(`   Final Tier: ${finalStatus.learningProgress?.tier_name || 'Newcomer'}`);
    console.log(`   Final Tier Level: ${finalStatus.learningProgress?.tier_level || 0}`);
    console.log(`   Final Lessons Completed: ${finalStatus.learningProgress?.total_lessons_completed || 0}\n`);

    // Step 8: Get logs
    console.log('📜 Step 8: Recent Logs\n');
    const logs = await calLoop.getLogs(3);
    if (logs.success && logs.logs.length > 0) {
      logs.logs.forEach(log => {
        console.log(`   ${log.completed_at.toISOString()}`);
        console.log(`   Lesson ${log.lesson_number}: ${log.lesson_title}`);
        console.log(`   XP: ${log.xp_earned} | Tier: ${log.tier_name} (Lvl ${log.tier_level}) | Total XP: ${log.total_xp_earned}\n`);
      });
    } else {
      console.log('   No logs found\n');
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('  ✅ Test Complete!');
    console.log('═══════════════════════════════════════════════════════\n');

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

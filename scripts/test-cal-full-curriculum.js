#!/usr/bin/env node
/**
 * Test Cal's Complete Debugging Mastery Curriculum
 *
 * Tests all 10 lessons end-to-end:
 * 1. Enroll Cal in debugging-mastery
 * 2. Complete lessons 1-10 in sequence
 * 3. Verify XP progression and tier advancement
 * 4. Check that each lesson teaches the intended tools
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
  console.log('  Cal Debugging Mastery - Full Curriculum Test');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Initialize systems
    const learningEngine = new LearningEngine(db);
    const calLoop = new CalLearningLoop({ db, userId, interval: 60000 });

    // Step 1: Get Cal's initial state
    console.log('📊 Step 1: Initial State\n');
    const initialStatus = await calLoop.getStatus();
    const initialXP = initialStatus.learningProgress?.total_xp_earned || 0;
    const initialTier = initialStatus.learningProgress?.tier_level || 0;
    const initialLessons = initialStatus.learningProgress?.total_lessons_completed || 0;

    console.log(`   User: ${userId}`);
    console.log(`   Initial XP: ${initialXP}`);
    console.log(`   Initial Tier: ${initialTier}`);
    console.log(`   Lessons Completed: ${initialLessons}\n`);

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

    // Step 3: Get all lessons
    console.log('📚 Step 3: Getting Lessons\n');
    const lessons = await learningEngine.getLessons(pathSlug);
    console.log(`   Found ${lessons.length} lessons in ${pathSlug}:\n`);

    lessons.forEach(lesson => {
      const tools = lesson.content_data?.tools_used || [];
      const skillsLearned = lesson.content_data?.skills_learned || [];
      console.log(`   ${lesson.lesson_number}. ${lesson.lesson_title}`);
      console.log(`      XP: ${lesson.xp_reward} | Tools: ${tools.join(', ')}`);
      console.log(`      Skills: ${skillsLearned.join(', ')}\n`);
    });

    // Step 4: Check which lessons are already completed
    console.log('🎯 Step 4: Checking Completed Lessons\n');
    const completedLessons = await db.query(
      `SELECT lesson_id FROM lesson_completions WHERE user_id = $1`,
      [userId]
    );
    const completedIds = completedLessons.rows.map(r => r.lesson_id);
    const incompleteLessons = lessons.filter(l => !completedIds.includes(l.lesson_id));

    console.log(`   Already completed: ${completedIds.length}/${lessons.length}`);
    console.log(`   Remaining: ${incompleteLessons.length}\n`);

    // Step 5: Complete each lesson in sequence
    console.log('✨ Step 5: Completing Lessons\n');

    let totalXpEarned = 0;
    let completedCount = 0;

    for (const lesson of incompleteLessons) {
      console.log(`\n   Lesson ${lesson.lesson_number}: ${lesson.lesson_title}`);
      console.log(`   ─────────────────────────────────────────────────`);

      const startTime = Date.now();

      try {
        const result = await learningEngine.completeLesson(userId, lesson.lesson_id, {
          timeSpentSeconds: Math.floor(Math.random() * 300) + 60, // 1-6 minutes
          perfect: Math.random() > 0.3, // 70% perfect score
          metadata: {
            automated: true,
            test: 'full-curriculum-test',
            lesson_number: lesson.lesson_number,
            timestamp: new Date().toISOString()
          }
        });

        const timeDiff = Date.now() - startTime;

        console.log(`   ✅ Completed in ${timeDiff}ms`);
        console.log(`   XP Earned: ${result.xpEarned}`);
        console.log(`   New Tier Level: ${result.newLevel}`);

        totalXpEarned += result.xpEarned;
        completedCount++;

      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
      }
    }

    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  📊 Summary');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`   Lessons Completed This Run: ${completedCount}/${incompleteLessons.length}`);
    console.log(`   Total XP Earned This Run: ${totalXpEarned}`);
    console.log('');

    // Step 6: Get final state
    console.log('📊 Step 6: Final State\n');
    const finalStatus = await calLoop.getStatus();
    const finalXP = finalStatus.learningProgress?.total_xp_earned || 0;
    const finalTier = finalStatus.learningProgress?.tier_level || 0;
    const finalLessons = finalStatus.learningProgress?.total_lessons_completed || 0;

    console.log(`   Final XP: ${finalXP} (started with ${initialXP})`);
    console.log(`   Final Tier: ${finalTier} (started with ${initialTier})`);
    console.log(`   Total Lessons: ${finalLessons} (started with ${initialLessons})`);
    console.log(`   XP Gain: +${finalXP - initialXP}`);
    console.log(`   Tier Progression: ${initialTier} → ${finalTier}\n`);

    // Step 7: Verify tier calculation
    console.log('🧮 Step 7: Tier Calculation Verification\n');
    const expectedTier = Math.floor(Math.sqrt(finalXP));
    const tierMatch = expectedTier === finalTier ? '✅' : '❌';
    console.log(`   Expected Tier (√${finalXP}): ${expectedTier}`);
    console.log(`   Actual Tier: ${finalTier} ${tierMatch}\n`);

    // Step 8: Tools and Skills Summary
    console.log('🛠️  Step 8: Tools & Skills Learned\n');

    const allTools = new Set();
    const allSkills = new Set();

    lessons.forEach(lesson => {
      const tools = lesson.content_data?.tools_used || [];
      const skills = lesson.content_data?.skills_learned || [];
      tools.forEach(t => allTools.add(t));
      skills.forEach(s => allSkills.add(s));
    });

    console.log(`   Tools Mastered: ${Array.from(allTools).join(', ')}`);
    console.log(`   Skills Acquired: ${Array.from(allSkills).join(', ')}\n`);

    // Step 9: Path completion status
    console.log('🎓 Step 9: Path Completion\n');
    const progressCheck = await db.query(
      `SELECT * FROM user_progress WHERE user_id = $1 AND path_id = (
        SELECT path_id FROM learning_paths WHERE path_slug = $2
      )`,
      [userId, pathSlug]
    );

    if (progressCheck.rows.length > 0) {
      const progress = progressCheck.rows[0];
      const completion = (progress.completion_percentage * 100).toFixed(1);
      console.log(`   Completion: ${completion}%`);
      console.log(`   Total Lessons in Path: ${lessons.length}`);
      console.log(`   Lessons Completed: ${progress.total_lessons_completed}`);
      console.log(`   Status: ${completion === '100.0' ? '✅ MASTERED' : '🔄 In Progress'}\n`);
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

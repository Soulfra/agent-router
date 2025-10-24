#!/usr/bin/env node
/**
 * Run Debug Lesson Through Learning System
 *
 * This script:
 * 1. Creates "Debugging Mastery" learning path
 * 2. Inserts Lesson 7 (llama2 fix) from logs
 * 3. Enrolls system user
 * 4. Marks lesson complete
 * 5. Shows tier progression
 * 6. Displays logs with issues
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || process.env.USER
});

// Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function main() {
  log('\n🎓 Running Debug Lesson Through Learning System', 'cyan');
  log('='.repeat(80), 'cyan');

  try {
    // ============================================================================
    // STEP 1: Create Debugging Learning Path
    // ============================================================================

    log('\n📚 Step 1: Creating "Debugging Mastery" learning path...', 'bright');

    // Get soulfra domain ID
    const domainResult = await db.query(
      `SELECT domain_id FROM domain_portfolio WHERE domain_name = 'soulfra.com' LIMIT 1`
    );

    let domainId;
    if (domainResult.rows.length === 0) {
      log('   ⚠️  soulfra domain not found, using first domain', 'yellow');
      const firstDomain = await db.query('SELECT domain_id FROM domain_portfolio LIMIT 1');
      domainId = firstDomain.rows[0]?.domain_id;
    } else {
      domainId = domainResult.rows[0].domain_id;
    }

    // Check if path exists
    let pathResult = await db.query(
      `SELECT path_id FROM learning_paths WHERE path_slug = 'debugging-mastery'`
    );

    let pathId;
    if (pathResult.rows.length === 0) {
      // Create path
      pathResult = await db.query(
        `INSERT INTO learning_paths (
          domain_id, path_name, path_slug, tagline, description,
          total_lessons, xp_reward_per_lesson, difficulty, status, published_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING path_id`,
        [
          domainId,
          'Debugging Mastery',
          'debugging-mastery',
          'Master debugging with system tools',
          'Learn to debug using introspection tools, time differentials, and systematic problem-solving',
          10,
          100,
          'intermediate',
          'active'
        ]
      );
      pathId = pathResult.rows[0].path_id;
      log(`   ✅ Created path: debugging-mastery (${pathId})`, 'green');
    } else {
      pathId = pathResult.rows[0].path_id;
      log(`   ℹ️  Path already exists: ${pathId}`, 'cyan');
    }

    // ============================================================================
    // STEP 2: Insert Lesson 7 (llama2 fix)
    // ============================================================================

    log('\n📝 Step 2: Inserting Lesson 7 (Debug Model References)...', 'bright');

    // Load lesson data from logs
    const fixLog = fs.readdirSync(path.join(__dirname, '..', 'logs'))
      .filter(f => f.startsWith('fix-llama2-'))
      .sort()
      .pop();

    let lessonData = {
      files_modified: 11,
      references_fixed: 20,
      time_differential_ms: 296,
      tools_used: ['grep', 'sed', 'jq', 'vos']
    };

    if (fixLog) {
      const fixData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'logs', fixLog), 'utf8')
      );
      lessonData = {
        ...lessonData,
        ...fixData
      };
      log(`   📁 Loaded data from: ${fixLog}`, 'cyan');
    }

    // Check if lesson exists
    let lessonResult = await db.query(
      `SELECT lesson_id FROM lessons
       WHERE path_id = $1 AND lesson_number = 7`,
      [pathId]
    );

    let lessonId;
    if (lessonResult.rows.length === 0) {
      lessonResult = await db.query(
        `INSERT INTO lessons (
          path_id, lesson_number, lesson_title, lesson_slug,
          description, learning_objectives, content_type, content_data,
          xp_reward, estimated_minutes, status, published_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        RETURNING lesson_id`,
        [
          pathId,
          7,  // "schema 7"!
          'Debug and Fix Model References',
          'debug-fix-model-references',
          'Use diagnostic tools to find and fix llama2 references in codebase',
          ['Use grep to search code', 'Apply sed for batch fixes', 'Track time differentials', 'Verify with VOS'],
          'challenge',
          JSON.stringify(lessonData),
          101,
          1,
          'published'
        ]
      );
      lessonId = lessonResult.rows[0].lesson_id;
      log(`   ✅ Created Lesson 7: ${lessonId}`, 'green');
    } else {
      lessonId = lessonResult.rows[0].lesson_id;
      log(`   ℹ️  Lesson 7 already exists: ${lessonId}`, 'cyan');
    }

    // ============================================================================
    // STEP 3: Enroll system user
    // ============================================================================

    log('\n👤 Step 3: Enrolling system user...', 'bright');

    const userId = 'system';

    let enrollResult = await db.query(
      `SELECT progress_id FROM user_progress
       WHERE user_id = $1 AND path_id = $2`,
      [userId, pathId]
    );

    let progressId;
    if (enrollResult.rows.length === 0) {
      enrollResult = await db.query(
        `INSERT INTO user_progress (
          user_id, path_id, total_xp_earned, current_streak_days,
          longest_streak_days, completion_percentage, started_at
        ) VALUES ($1, $2, 0, 0, 0, 0.00, NOW())
        RETURNING progress_id`,
        [userId, pathId]
      );
      progressId = enrollResult.rows[0].progress_id;
      log(`   ✅ Enrolled user: ${userId}`, 'green');
    } else {
      progressId = enrollResult.rows[0].progress_id;
      log(`   ℹ️  User already enrolled`, 'cyan');
    }

    // ============================================================================
    // STEP 4: Complete Lesson 7
    // ============================================================================

    log('\n🎯 Step 4: Completing Lesson 7...', 'bright');

    const completionResult = await db.query(
      `INSERT INTO lesson_completions (
        user_id, lesson_id, progress_id, time_spent_seconds,
        attempts, perfect_score, xp_earned, bonus_xp_earned,
        completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (user_id, lesson_id) DO UPDATE
      SET attempts = lesson_completions.attempts + 1,
          completed_at = NOW()
      RETURNING *`,
      [
        userId,
        lessonId,
        progressId,
        Math.floor(lessonData.time_differential_ms / 1000) || 1,
        1,
        true,
        101,
        0
      ]
    );

    log(`   ✅ Lesson completed!`, 'green');
    log(`   ⏱️  Time spent: ${completionResult.rows[0].time_spent_seconds}s`, 'cyan');
    log(`   🎮 XP earned: ${completionResult.rows[0].xp_earned}`, 'cyan');

    // Update user progress
    await db.query(
      `UPDATE user_progress
       SET total_xp_earned = total_xp_earned + $1,
           total_lessons_completed = total_lessons_completed + 1,
           completion_percentage = (
             (total_lessons_completed + 1.0) / (
               SELECT total_lessons FROM learning_paths WHERE path_id = $2
             ) * 100
           ),
           last_accessed_at = NOW()
       WHERE progress_id = $3`,
      [101, pathId, progressId]
    );

    // ============================================================================
    // STEP 5: Show Tier Progression
    // ============================================================================

    log('\n📊 Step 5: Tier Progression', 'bright');

    const progressQuery = await db.query(
      `SELECT
         up.*,
         FLOOR(SQRT(up.total_xp_earned)) as current_level,
         lp.path_name,
         lp.total_lessons
       FROM user_progress up
       JOIN learning_paths lp ON up.path_id = lp.path_id
       WHERE up.user_id = $1 AND up.path_id = $2`,
      [userId, pathId]
    );

    const progress = progressQuery.rows[0];

    log(`\n   User: ${userId}`, 'cyan');
    log(`   Path: ${progress.path_name}`, 'cyan');
    log(`   Total XP: ${progress.total_xp_earned}`, 'magenta');
    log(`   Level/Tier: ${progress.current_level}`, 'magenta');
    log(`   Lessons completed: ${progress.total_lessons_completed}/${progress.total_lessons}`, 'cyan');
    log(`   Completion: ${parseFloat(progress.completion_percentage).toFixed(2)}%`, 'cyan');
    log(`   Streak: ${progress.current_streak_days} days`, 'cyan');

    // Calculate tier name
    const level = progress.current_level;
    let tierName;
    if (level < 10) tierName = 'Newcomer';
    else if (level < 20) tierName = 'Beginner';
    else if (level < 30) tierName = 'Intermediate';
    else if (level < 40) tierName = 'Advanced';
    else tierName = 'Expert';

    log(`   Tier: ${tierName}`, 'bright');

    // ============================================================================
    // STEP 6: View Logs
    // ============================================================================

    log('\n📋 Step 6: Viewing Logs', 'bright');

    const logsQuery = await db.query(
      `SELECT
         lc.completed_at,
         l.lesson_number,
         l.lesson_title,
         lc.xp_earned,
         lc.time_spent_seconds,
         lc.perfect_score
       FROM lesson_completions lc
       JOIN lessons l ON lc.lesson_id = l.lesson_id
       WHERE lc.user_id = $1
       ORDER BY lc.completed_at DESC
       LIMIT 10`,
      [userId]
    );

    if (logsQuery.rows.length > 0) {
      log('\n   Recent Completions:', 'cyan');
      logsQuery.rows.forEach(row => {
        const status = row.perfect_score ? '✅' : '⚠️';
        log(`   ${status} Lesson ${row.lesson_number}: ${row.lesson_title}`, 'cyan');
        log(`      XP: ${row.xp_earned} | Time: ${row.time_spent_seconds}s`, 'cyan');
      });
    }

    // ============================================================================
    // Summary
    // ============================================================================

    log('\n' + '='.repeat(80), 'cyan');
    log('🎓 Lesson Run Complete!', 'bright');
    log('='.repeat(80), 'cyan');

    log('\n📊 Summary:', 'cyan');
    log(`   Lesson: "Debug and Fix Model References" (Lesson 7)`, 'cyan');
    log(`   XP Earned: 101`, 'magenta');
    log(`   New Level: ${progress.current_level} (${tierName})`, 'magenta');
    log(`   Total XP: ${progress.total_xp_earned}`, 'cyan');
    log(`   Completion: ${parseFloat(progress.completion_percentage).toFixed(2)}%`, 'cyan');

    log('\n📺 View in Dashboard:', 'bright');
    log(`   http://localhost:5001/usage-dashboard.html`, 'cyan');
    log(`   http://localhost:5001/dashboard.html`, 'cyan');

    log('\n✨ Lesson stored in learning system with tier tracking!\n', 'green');

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run
main();

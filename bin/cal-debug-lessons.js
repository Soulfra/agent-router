#!/usr/bin/env node
/**
 * Cal Debug Lessons - Query and fix lesson bugs from database
 */

const { Pool } = require('pg');
const chalk = require('chalk');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/calos'
});

async function debugLessons() {
  console.log(chalk.cyan.bold('\n🔍 Cal Lesson Debugger\n'));
  console.log(chalk.gray('─'.repeat(80)));

  try {
    // Get all lesson-9 and lesson-10 failures
    const failures = await pool.query(`
      SELECT
        task_key,
        approach,
        error,
        lesson_id,
        exercise_id,
        count,
        first_seen,
        last_seen,
        fixed
      FROM cal_failures
      WHERE lesson_id IN ('lesson-9', 'lesson-10')
      ORDER BY lesson_id, exercise_id
    `);

    console.log(chalk.white.bold(`\nFound ${failures.rows.length} bugs in lessons 9 and 10:\n`));

    // Group by lesson
    const byLesson = {};
    failures.rows.forEach(row => {
      const lesson = row.lesson_id || 'unknown';
      if (!byLesson[lesson]) byLesson[lesson] = [];
      byLesson[lesson].push(row);
    });

    // Display each lesson
    for (const [lesson, bugs] of Object.entries(byLesson)) {
      console.log(chalk.yellow.bold(`\n${lesson.toUpperCase()}:`));
      console.log(chalk.gray('─'.repeat(80)));

      bugs.forEach((bug, i) => {
        console.log(chalk.white(`\n  ${i + 1}. ${bug.task_key}`));
        console.log(chalk.gray(`     Exercise: ${bug.exercise_id}`));
        console.log(chalk.gray(`     Approach: ${bug.approach}`));
        console.log(chalk.red(`     Error: ${bug.error}`));
        console.log(chalk.gray(`     Count: ${bug.count}`));
        console.log(chalk.gray(`     First Seen: ${new Date(bug.first_seen).toLocaleString()}`));
        console.log(chalk.gray(`     Last Seen: ${new Date(bug.last_seen).toLocaleString()}`));
        console.log(chalk.gray(`     Fixed: ${bug.fixed ? '✅ Yes' : '❌ No'}`));
      });
    }

    // Analyze the errors
    console.log(chalk.cyan.bold('\n\n📊 Analysis:\n'));
    console.log(chalk.gray('─'.repeat(80)));

    // All errors are "command" argument must be string, received undefined
    console.log(chalk.white.bold('\n  Common Pattern:'));
    console.log(chalk.gray(`     Error Type: command-execution`));
    console.log(chalk.gray(`     Root Cause: exec() called with undefined command argument`));
    console.log(chalk.gray(`     Affected: All 5 exercises in both lesson-9 and lesson-10`));

    console.log(chalk.white.bold('\n  Diagnosis:'));
    console.log(chalk.gray(`     The lessons.json exercises likely have:`));
    console.log(chalk.gray(`       {`));
    console.log(chalk.gray(`         "type": "command",`));
    console.log(chalk.gray(`         "command": undefined  // ← Missing or null`));
    console.log(chalk.gray(`       }`));

    console.log(chalk.white.bold('\n  Recommended Fix:'));
    console.log(chalk.gray(`     1. Find lessons.json exercise definitions for lesson-9 and lesson-10`));
    console.log(chalk.gray(`     2. Add proper "command" strings to each exercise`));
    console.log(chalk.gray(`     3. OR change exercise type from "command" to "quiz" or "reading"`));
    console.log(chalk.gray(`     4. Update database: mark fixed = true after fixing`));

    console.log(chalk.gray('\n' + '─'.repeat(80)));
    console.log(chalk.cyan.bold('\n✨ Debug Complete\n'));

    await pool.end();

  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    await pool.end();
    process.exit(1);
  }
}

debugLessons();

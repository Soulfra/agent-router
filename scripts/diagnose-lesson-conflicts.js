#!/usr/bin/env node
/**
 * Diagnose Lesson Conflicts
 *
 * Checks for conflicts in lesson numbering and data across learning paths.
 * Identifies:
 * - Duplicate lesson_numbers within same path
 * - Inconsistent lesson data
 * - Missing sequential numbers
 * - Mismatched slugs and titles
 */

require('dotenv').config();
const { Pool } = require('pg');

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function diagnose() {
  console.log('🔍 Lesson Data Diagnostics\n');
  console.log('='.repeat(80));

  try {
    // 1. Check for duplicate lesson_numbers within same path
    console.log('\n📊 Checking for duplicate lesson_numbers...\n');

    const duplicates = await db.query(`
      SELECT
        lp.path_name,
        lp.path_slug,
        l.lesson_number,
        COUNT(*) as count,
        array_agg(l.lesson_title) as titles,
        array_agg(l.lesson_id::text) as lesson_ids
      FROM lessons l
      JOIN learning_paths lp ON l.path_id = lp.path_id
      GROUP BY lp.path_name, lp.path_slug, l.lesson_number
      HAVING COUNT(*) > 1
      ORDER BY lp.path_name, l.lesson_number
    `);

    if (duplicates.rows.length === 0) {
      console.log('   ✅ No duplicate lesson_numbers found');
    } else {
      console.log(`   ❌ Found ${duplicates.rows.length} conflicts:\n`);
      duplicates.rows.forEach(row => {
        console.log(`   Path: ${row.path_name} (${row.path_slug})`);
        console.log(`   Lesson Number: ${row.lesson_number} (${row.count} duplicates)`);
        console.log(`   Titles: ${JSON.stringify(row.titles, null, 2)}`);
        console.log(`   IDs: ${JSON.stringify(row.lesson_ids, null, 2)}`);
        console.log('');
      });
    }

    // 2. Check for missing sequential numbers
    console.log('\n📊 Checking for gaps in lesson numbering...\n');

    const gaps = await db.query(`
      WITH path_lessons AS (
        SELECT
          lp.path_name,
          lp.path_slug,
          l.path_id,
          l.lesson_number,
          LAG(l.lesson_number) OVER (PARTITION BY l.path_id ORDER BY l.lesson_number) as prev_number
        FROM lessons l
        JOIN learning_paths lp ON l.path_id = lp.path_id
        ORDER BY l.path_id, l.lesson_number
      )
      SELECT
        path_name,
        path_slug,
        lesson_number,
        prev_number,
        lesson_number - prev_number as gap
      FROM path_lessons
      WHERE prev_number IS NOT NULL
        AND lesson_number - prev_number > 1
      ORDER BY path_name, lesson_number
    `);

    if (gaps.rows.length === 0) {
      console.log('   ✅ No gaps in lesson numbering found');
    } else {
      console.log(`   ⚠️  Found ${gaps.rows.length} gaps:\n`);
      gaps.rows.forEach(row => {
        console.log(`   Path: ${row.path_name} (${row.path_slug})`);
        console.log(`   Gap: ${row.prev_number} -> ${row.lesson_number} (missing ${row.gap - 1} lessons)`);
        console.log('');
      });
    }

    // 3. Get full lesson inventory by path
    console.log('\n📊 Lesson Inventory by Path:\n');

    const inventory = await db.query(`
      SELECT
        lp.path_name,
        lp.path_slug,
        lp.icon_emoji,
        COUNT(l.lesson_id) as lesson_count,
        MIN(l.lesson_number) as min_number,
        MAX(l.lesson_number) as max_number,
        SUM(l.xp_reward) as total_xp
      FROM learning_paths lp
      LEFT JOIN lessons l ON lp.path_id = l.path_id
      GROUP BY lp.path_id, lp.path_name, lp.path_slug, lp.icon_emoji
      ORDER BY lp.path_name
    `);

    console.log('   Domain                          | Icon | Lessons | Range  | Total XP');
    console.log('   ' + '-'.repeat(76));
    inventory.rows.forEach(row => {
      const name = row.path_name.padEnd(30);
      const icon = row.icon_emoji || '  ';
      const count = String(row.lesson_count || 0).padStart(7);
      const range = row.min_number && row.max_number ? `${row.min_number}-${row.max_number}`.padStart(6) : '  -   ';
      const xp = String(row.total_xp || 0).padStart(8);
      console.log(`   ${name} | ${icon}  | ${count} | ${range} | ${xp}`);
    });

    const totalLessons = inventory.rows.reduce((sum, row) => sum + (row.lesson_count || 0), 0);
    const totalXP = inventory.rows.reduce((sum, row) => sum + (row.total_xp || 0), 0);
    console.log('   ' + '-'.repeat(76));
    console.log(`   TOTAL: ${inventory.rows.length} paths, ${totalLessons} lessons, ${totalXP} XP\n`);

    // 4. Check for slug/title mismatches
    console.log('\n📊 Checking for slug/title mismatches...\n');

    const mismatches = await db.query(`
      SELECT
        lp.path_name,
        l.lesson_number,
        l.lesson_title,
        l.lesson_slug,
        REGEXP_REPLACE(LOWER(l.lesson_title), '[^a-z0-9]+', '-', 'g') as expected_slug
      FROM lessons l
      JOIN learning_paths lp ON l.path_id = lp.path_id
      WHERE l.lesson_slug != REGEXP_REPLACE(LOWER(l.lesson_title), '[^a-z0-9]+', '-', 'g')
      ORDER BY lp.path_name, l.lesson_number
      LIMIT 20
    `);

    if (mismatches.rows.length === 0) {
      console.log('   ✅ All slugs match their titles');
    } else {
      console.log(`   ⚠️  Found ${mismatches.rows.length} mismatches (showing first 20):\n`);
      mismatches.rows.forEach(row => {
        console.log(`   Path: ${row.path_name}`);
        console.log(`   Lesson ${row.lesson_number}: ${row.lesson_title}`);
        console.log(`   Current slug:  ${row.lesson_slug}`);
        console.log(`   Expected slug: ${row.expected_slug}`);
        console.log('');
      });
    }

    // 5. Detailed lesson listing (first 5 lessons from each path)
    console.log('\n📊 Sample Lessons (first 5 from each path):\n');

    const samples = await db.query(`
      WITH ranked_lessons AS (
        SELECT
          lp.path_name,
          lp.path_slug,
          l.lesson_number,
          l.lesson_title,
          l.xp_reward,
          l.lesson_id,
          ROW_NUMBER() OVER (PARTITION BY lp.path_id ORDER BY l.lesson_number) as rn
        FROM lessons l
        JOIN learning_paths lp ON l.path_id = lp.path_id
      )
      SELECT * FROM ranked_lessons
      WHERE rn <= 5
      ORDER BY path_name, lesson_number
    `);

    let currentPath = null;
    samples.rows.forEach(row => {
      if (row.path_name !== currentPath) {
        console.log(`\n   ${row.path_name} (${row.path_slug}):`);
        currentPath = row.path_name;
      }
      console.log(`      ${row.lesson_number}. ${row.lesson_title} (${row.xp_reward} XP)`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ Diagnostic Complete\n');

    // Summary
    console.log('📋 Summary:');
    console.log(`   - Paths: ${inventory.rows.length}`);
    console.log(`   - Total Lessons: ${totalLessons}`);
    console.log(`   - Duplicate Numbers: ${duplicates.rows.length}`);
    console.log(`   - Numbering Gaps: ${gaps.rows.length}`);
    console.log(`   - Slug Mismatches: ${mismatches.rows.length}`);

    if (duplicates.rows.length > 0 || gaps.rows.length > 0 || mismatches.rows.length > 0) {
      console.log('\n⚠️  Issues found! Consider running normalization script.');
    } else {
      console.log('\n✅ No issues found! Lesson data is clean.');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.end();
  }
}

diagnose();

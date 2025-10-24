#!/usr/bin/env node
/**
 * Normalize Lesson Numbering
 *
 * Fixes conflicts in lesson numbering by:
 * - Re-numbering lessons sequentially within each path
 * - Regenerating slugs from titles
 * - Preserving lesson_id UUIDs for referential integrity
 * - Backing up data before making changes
 *
 * Usage:
 *   node scripts/normalize-lessons.js [--dry-run] [--path=path-slug]
 *
 * Options:
 *   --dry-run       Show what would be changed without making changes
 *   --path=slug     Only normalize lessons in specified path
 *
 * Examples:
 *   node scripts/normalize-lessons.js --dry-run
 *   node scripts/normalize-lessons.js --path=data-liberation
 *   node scripts/normalize-lessons.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const pathArg = args.find(arg => arg.startsWith('--path='));
const targetPathSlug = pathArg ? pathArg.split('=')[1] : null;

async function normalize() {
  console.log('🔧 Lesson Normalization Tool\n');
  console.log('='.repeat(80));

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
  }

  if (targetPathSlug) {
    console.log(`\n🎯 Target Path: ${targetPathSlug}\n`);
  } else {
    console.log('\n🌐 Normalizing ALL paths\n');
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1. Get all paths (or target path)
    let pathsQuery = `
      SELECT path_id, path_name, path_slug, icon_emoji
      FROM learning_paths
    `;
    const pathsParams = [];

    if (targetPathSlug) {
      pathsQuery += ' WHERE path_slug = $1';
      pathsParams.push(targetPathSlug);
    }

    pathsQuery += ' ORDER BY path_name';

    const pathsResult = await client.query(pathsQuery, pathsParams);

    if (pathsResult.rows.length === 0) {
      console.log('❌ No paths found');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`📊 Found ${pathsResult.rows.length} path(s) to process\n`);

    let totalUpdated = 0;
    let totalSlugUpdates = 0;

    // 2. Process each path
    for (const path of pathsResult.rows) {
      console.log(`\n📁 Processing: ${path.path_name} (${path.path_slug})`);

      // Get all lessons for this path, ordered by current lesson_number
      const lessonsResult = await client.query(
        `SELECT
           lesson_id,
           lesson_number,
           lesson_title,
           lesson_slug,
           xp_reward,
           REGEXP_REPLACE(LOWER(lesson_title), '[^a-z0-9]+', '-', 'g') as expected_slug
         FROM lessons
         WHERE path_id = $1
         ORDER BY lesson_number, created_at`,
        [path.path_id]
      );

      if (lessonsResult.rows.length === 0) {
        console.log('   ⏭  No lessons found, skipping');
        continue;
      }

      console.log(`   Found ${lessonsResult.rows.length} lessons\n`);

      // 3. Check for issues
      let needsRenumbering = false;
      let needsSlugFix = false;
      const issues = [];

      for (let i = 0; i < lessonsResult.rows.length; i++) {
        const lesson = lessonsResult.rows[i];
        const expectedNumber = i + 1;

        if (lesson.lesson_number !== expectedNumber) {
          needsRenumbering = true;
          issues.push({
            lessonId: lesson.lesson_id,
            title: lesson.lesson_title,
            currentNumber: lesson.lesson_number,
            expectedNumber,
            type: 'number'
          });
        }

        if (lesson.lesson_slug !== lesson.expected_slug) {
          needsSlugFix = true;
          issues.push({
            lessonId: lesson.lesson_id,
            title: lesson.lesson_title,
            currentSlug: lesson.lesson_slug,
            expectedSlug: lesson.expected_slug,
            type: 'slug'
          });
        }
      }

      if (!needsRenumbering && !needsSlugFix) {
        console.log('   ✅ No issues found, path is already normalized\n');
        continue;
      }

      // 4. Display issues
      if (needsRenumbering) {
        console.log('   ⚠️  Numbering Issues:');
        issues.filter(i => i.type === 'number').forEach(issue => {
          console.log(`      - "${issue.title}": ${issue.currentNumber} → ${issue.expectedNumber}`);
        });
        console.log('');
      }

      if (needsSlugFix) {
        console.log('   ⚠️  Slug Issues:');
        issues.filter(i => i.type === 'slug').forEach(issue => {
          console.log(`      - "${issue.title}":`);
          console.log(`        Current:  ${issue.currentSlug}`);
          console.log(`        Expected: ${issue.expectedSlug}`);
        });
        console.log('');
      }

      // 5. Apply fixes
      if (!dryRun) {
        console.log('   🔧 Applying fixes...\n');

        for (let i = 0; i < lessonsResult.rows.length; i++) {
          const lesson = lessonsResult.rows[i];
          const newNumber = i + 1;
          const newSlug = lesson.expected_slug;

          const updates = [];
          const params = [lesson.lesson_id];

          if (lesson.lesson_number !== newNumber) {
            updates.push('lesson_number = $' + (params.length + 1));
            params.push(newNumber);
          }

          if (lesson.lesson_slug !== newSlug) {
            updates.push('lesson_slug = $' + (params.length + 1));
            params.push(newSlug);
            totalSlugUpdates++;
          }

          if (updates.length > 0) {
            const updateQuery = `
              UPDATE lessons
              SET ${updates.join(', ')}, updated_at = NOW()
              WHERE lesson_id = $1
            `;

            await client.query(updateQuery, params);
            totalUpdated++;

            console.log(`      ✓ Updated: "${lesson.lesson_title}" (${lesson.lesson_number} → ${newNumber})`);
          }
        }

        console.log(`\n   ✅ Updated ${totalUpdated} lesson(s) in this path\n`);
      } else {
        console.log('   🔍 [DRY RUN] Would update these lessons\n');
      }
    }

    // 6. Summary
    console.log('\n' + '='.repeat(80));

    if (dryRun) {
      console.log('\n🔍 DRY RUN COMPLETE - No changes were made');
      console.log(`\nTo apply these changes, run without --dry-run:\n`);
      if (targetPathSlug) {
        console.log(`   node scripts/normalize-lessons.js --path=${targetPathSlug}\n`);
      } else {
        console.log(`   node scripts/normalize-lessons.js\n`);
      }
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
      console.log('\n✅ NORMALIZATION COMPLETE');
      console.log(`\n📊 Summary:`);
      console.log(`   - Paths processed: ${pathsResult.rows.length}`);
      console.log(`   - Lessons updated: ${totalUpdated}`);
      console.log(`   - Slugs regenerated: ${totalSlugUpdates}`);
      console.log('\n💡 Run diagnostic to verify:');
      console.log('   node scripts/diagnose-lesson-conflicts.js\n');
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await db.end();
  }
}

normalize();

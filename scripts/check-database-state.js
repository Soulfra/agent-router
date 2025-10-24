#!/usr/bin/env node
/**
 * Check Database State
 *
 * Queries the actual database to see what's already there:
 * - domain_portfolio (real 12 domains)
 * - users (roughsparks, etc.)
 * - learning_paths / lessons (if they exist)
 */

require('dotenv').config();
const { Pool } = require('pg');

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || process.env.USER,
  password: process.env.DB_PASSWORD || ''
});

async function checkDatabase() {
  console.log('🔍 Checking Database State\n');
  console.log('='.repeat(80));

  try {
    // 1. Check connection
    console.log('\n📡 Testing connection...');
    const connectionTest = await db.query('SELECT NOW()');
    console.log(`   ✅ Connected at: ${connectionTest.rows[0].now}\n`);

    // 2. Check domain_portfolio
    console.log('📊 Domain Portfolio:');
    const domains = await db.query(`
      SELECT domain_name, brand_name, category, status, interfaces_count
      FROM domain_portfolio
      ORDER BY domain_name
    `);

    if (domains.rows.length > 0) {
      console.log(`   Found ${domains.rows.length} domains:\n`);
      domains.rows.forEach((d, i) => {
        console.log(`   ${i + 1}. ${d.domain_name} - "${d.brand_name}" (${d.category}, ${d.status})`);
      });
    } else {
      console.log('   ⚠️  No domains found');
    }

    // 3. Check users
    console.log('\n👥 Users:');
    const users = await db.query(`
      SELECT user_id, username, email, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (users.rows.length > 0) {
      console.log(`   Found ${users.rows.length} recent users:\n`);
      users.rows.forEach((u, i) => {
        console.log(`   ${i + 1}. ${u.username} (${u.email}) - ${u.created_at.toISOString().split('T')[0]}`);
      });
    } else {
      console.log('   ⚠️  No users found');
    }

    // 4. Check if learning_paths table exists
    console.log('\n📚 Learning Platform Tables:');
    const tablesCheck = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('learning_paths', 'lessons', 'user_progress', 'achievements')
      ORDER BY table_name
    `);

    if (tablesCheck.rows.length > 0) {
      console.log(`   ✅ Found ${tablesCheck.rows.length} learning tables:\n`);
      tablesCheck.rows.forEach(t => console.log(`      - ${t.table_name}`));

      // Check learning_paths data
      const pathsCount = await db.query('SELECT COUNT(*) FROM learning_paths');
      const lessonsCount = await db.query('SELECT COUNT(*) FROM lessons');
      const achievementsCount = await db.query('SELECT COUNT(*) FROM achievements');

      console.log(`\n   📊 Data counts:`);
      console.log(`      - Learning paths: ${pathsCount.rows[0].count}`);
      console.log(`      - Lessons: ${lessonsCount.rows[0].count}`);
      console.log(`      - Achievements: ${achievementsCount.rows[0].count}`);

      // Show learning paths if any exist
      if (parseInt(pathsCount.rows[0].count) > 0) {
        console.log('\n   📖 Existing Learning Paths:');
        const paths = await db.query(`
          SELECT path_name, path_slug, icon_emoji,
                 (SELECT COUNT(*) FROM lessons WHERE path_id = lp.path_id) as lesson_count
          FROM learning_paths lp
          ORDER BY path_name
        `);
        paths.rows.forEach((p, i) => {
          console.log(`      ${i + 1}. ${p.icon_emoji} ${p.path_name} (${p.path_slug}) - ${p.lesson_count} lessons`);
        });
      }
    } else {
      console.log('   ❌ Learning platform tables NOT FOUND');
      console.log('   💡 Need to run: psql $DATABASE_URL -f migrations/020_learning_platform.sql');
    }

    // 5. Check all tables
    console.log('\n📋 All Tables in Database:');
    const allTables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log(`   Found ${allTables.rows.length} total tables:\n`);
    allTables.rows.forEach((t, i) => {
      console.log(`      ${i + 1}. ${t.table_name}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ Database check complete\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\n💡 Possible issues:');
    console.error('   - Database "calos" doesn\'t exist: createdb calos');
    console.error('   - Wrong DB_USER: export DB_USER=matthewmauer');
    console.error('   - Connection settings in .env file\n');
    process.exit(1);
  } finally {
    await db.end();
  }
}

checkDatabase();

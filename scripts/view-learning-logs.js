#!/usr/bin/env node
/**
 * View Learning Logs with Tier Tracking
 *
 * Shows lesson completions with tier levels to identify issues
 */

require('dotenv').config();
const { Pool } = require('pg');

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

function getTierColor(tierName) {
  const colors = {
    'Newcomer': 'cyan',
    'Beginner': 'green',
    'Intermediate': 'yellow',
    'Advanced': 'magenta',
    'Expert': 'bright'
  };
  return colors[tierName] || 'reset';
}

async function main() {
  log('\n📊 Learning System Logs with Tier Tracking', 'cyan');
  log('='.repeat(80), 'cyan');

  try {
    // Get all lesson completions with tier tracking
    const result = await db.query(`
      SELECT
        lc.completed_at,
        lc.user_id,
        l.lesson_number,
        l.lesson_title,
        lc.xp_earned,
        lc.time_spent_seconds,
        lc.perfect_score,
        lc.attempts,
        up.total_xp_earned,
        up.total_lessons_completed,
        FLOOR(SQRT(up.total_xp_earned)) as tier_level,
        CASE
          WHEN FLOOR(SQRT(up.total_xp_earned)) < 10 THEN 'Newcomer'
          WHEN FLOOR(SQRT(up.total_xp_earned)) < 20 THEN 'Beginner'
          WHEN FLOOR(SQRT(up.total_xp_earned)) < 30 THEN 'Intermediate'
          WHEN FLOOR(SQRT(up.total_xp_earned)) < 40 THEN 'Advanced'
          ELSE 'Expert'
        END as tier_name,
        lp.path_name,
        l.content_data
      FROM lesson_completions lc
      JOIN lessons l ON lc.lesson_id = l.lesson_id
      JOIN user_progress up ON lc.progress_id = up.progress_id
      JOIN learning_paths lp ON up.path_id = lp.path_id
      ORDER BY lc.completed_at DESC
    `);

    if (result.rows.length === 0) {
      log('\n   No lesson completions found', 'yellow');
      await db.end();
      return;
    }

    // Group by tier
    const byTier = {};
    result.rows.forEach(row => {
      if (!byTier[row.tier_name]) {
        byTier[row.tier_name] = [];
      }
      byTier[row.tier_name].push(row);
    });

    // Display by tier
    log('\n📈 Completions by Tier:\n', 'bright');

    const tierOrder = ['Newcomer', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
    tierOrder.forEach(tierName => {
      if (!byTier[tierName]) return;

      const tierColor = getTierColor(tierName);
      log(`\n${tierName} (Level ${Math.pow(tierName === 'Newcomer' ? 0 : tierName === 'Beginner' ? 10 : tierName === 'Intermediate' ? 20 : tierName === 'Advanced' ? 30 : 40, 1)}-${Math.pow(tierName === 'Newcomer' ? 9 : tierName === 'Beginner' ? 19 : tierName === 'Intermediate' ? 29 : tierName === 'Advanced' ? 39 : 99, 1)})`, tierColor);
      log('─'.repeat(80), tierColor);

      byTier[tierName].forEach(row => {
        const status = row.perfect_score ? '✅' : '⚠️';
        const issueFlag = row.attempts > 1 ? '🔧' : '';

        log(`\n  ${status} ${issueFlag} Lesson ${row.lesson_number}: ${row.lesson_title}`, 'cyan');
        log(`     User: ${row.user_id}`, 'cyan');
        log(`     Path: ${row.path_name}`, 'cyan');
        log(`     XP: ${row.xp_earned} | Time: ${row.time_spent_seconds}s | Attempts: ${row.attempts}`, 'yellow');
        log(`     Total XP: ${row.total_xp_earned} | Tier Level: ${row.tier_level}`, 'magenta');
        log(`     Completed: ${new Date(row.completed_at).toLocaleString()}`, 'cyan');

        // Show content data if available
        if (row.content_data) {
          try {
            const data = typeof row.content_data === 'string'
              ? JSON.parse(row.content_data)
              : row.content_data;

            if (data.files_modified) {
              log(`     Files Modified: ${data.files_modified}`, 'cyan');
            }
            if (data.references_fixed) {
              log(`     References Fixed: ${data.references_fixed}`, 'cyan');
            }
            if (data.time_spent_ms) {
              log(`     Time Differential: ${data.time_spent_ms}ms`, 'cyan');
            }
            if (data.tools_used) {
              log(`     Tools: ${data.tools_used.join(', ')}`, 'cyan');
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      });
    });

    // Summary stats
    log('\n\n' + '='.repeat(80), 'cyan');
    log('📊 Summary Statistics', 'bright');
    log('='.repeat(80), 'cyan');

    const totalLessons = result.rows.length;
    const perfectScore = result.rows.filter(r => r.perfect_score).length;
    const withIssues = result.rows.filter(r => r.attempts > 1).length;
    const avgTime = Math.round(result.rows.reduce((sum, r) => sum + r.time_spent_seconds, 0) / totalLessons);
    const totalXP = result.rows.reduce((sum, r) => sum + r.xp_earned, 0);

    log(`\n   Total Lessons: ${totalLessons}`, 'cyan');
    log(`   Perfect Score: ${perfectScore} (${Math.round(perfectScore/totalLessons*100)}%)`, 'green');
    log(`   With Issues (>1 attempt): ${withIssues}`, withIssues > 0 ? 'red' : 'green');
    log(`   Average Time: ${avgTime}s`, 'cyan');
    log(`   Total XP Earned: ${totalXP}`, 'magenta');

    // Tier distribution
    log('\n   Tier Distribution:', 'bright');
    tierOrder.forEach(tierName => {
      if (byTier[tierName]) {
        const count = byTier[tierName].length;
        const tierColor = getTierColor(tierName);
        log(`      ${tierName}: ${count} lesson${count !== 1 ? 's' : ''}`, tierColor);
      }
    });

    // Issues by tier
    if (withIssues > 0) {
      log('\n\n⚠️  Issues by Tier:', 'yellow');
      log('─'.repeat(80), 'yellow');

      tierOrder.forEach(tierName => {
        if (byTier[tierName]) {
          const issuesInTier = byTier[tierName].filter(r => r.attempts > 1);
          if (issuesInTier.length > 0) {
            log(`\n   ${tierName}:`, getTierColor(tierName));
            issuesInTier.forEach(row => {
              log(`      🔧 Lesson ${row.lesson_number}: ${row.lesson_title} (${row.attempts} attempts)`, 'red');
            });
          }
        }
      });
    }

    log('\n\n✨ View complete!\n', 'green');

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

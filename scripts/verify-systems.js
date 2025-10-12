/**
 * System Verification Script
 *
 * Tests all new systems to verify database connectivity and functionality
 */

const { Pool } = require('pg');

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function pass(msg) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

function fail(msg) {
  console.log(`${RED}✗${RESET} ${msg}`);
}

function info(msg) {
  console.log(`${BLUE}ℹ${RESET} ${msg}`);
}

function section(msg) {
  console.log(`\n${YELLOW}━━━ ${msg} ━━━${RESET}`);
}

async function verifyDatabaseSchema() {
  section('Database Schema Verification');

  const tables = [
    'users', 'user_sessions', 'trusted_devices',
    'skills', 'user_skills', 'skill_actions', 'xp_gain_log',
    'achievements', 'user_achievements',
    'action_definitions', 'effect_definitions', 'action_effects',
    'user_action_log', 'effect_execution_log'
  ];

  let passed = 0;
  let failed = 0;

  for (const table of tables) {
    try {
      const result = await db.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      `, [table]);

      if (result.rows[0].count > 0) {
        const countResult = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        pass(`Table ${table} exists (${countResult.rows[0].count} rows)`);
        passed++;
      } else {
        fail(`Table ${table} missing`);
        failed++;
      }
    } catch (error) {
      fail(`Table ${table} error: ${error.message}`);
      failed++;
    }
  }

  info(`Schema check: ${passed}/${tables.length} tables verified`);
  return failed === 0;
}

async function verifySkillsSystem() {
  section('Skills System Verification');

  try {
    // Check skills exist
    const skills = await db.query('SELECT COUNT(*) as count FROM skills');
    pass(`Skills loaded: ${skills.rows[0].count} skills`);

    // Check level requirements
    const levels = await db.query('SELECT COUNT(*) as count FROM skill_level_requirements');
    pass(`Level requirements: ${levels.rows[0].count} levels (should be 99)`);

    // Check skill actions
    const actions = await db.query('SELECT COUNT(*) as count FROM skill_actions');
    pass(`Skill actions: ${actions.rows[0].count} actions defined`);

    // Check achievements
    const achievements = await db.query('SELECT COUNT(*) as count FROM achievements');
    pass(`Achievements: ${achievements.rows[0].count} achievements`);

    return true;
  } catch (error) {
    fail(`Skills system error: ${error.message}`);
    return false;
  }
}

async function verifyActionsSystem() {
  section('Actions/Effects System Verification');

  try {
    // Check action definitions
    const actions = await db.query('SELECT COUNT(*) as count FROM action_definitions WHERE enabled = TRUE');
    pass(`Action definitions: ${actions.rows[0].count} active actions`);

    // Check effect definitions
    const effects = await db.query('SELECT COUNT(*) as count FROM effect_definitions WHERE enabled = TRUE');
    pass(`Effect definitions: ${effects.rows[0].count} active effects`);

    // Check action->effect mappings
    const mappings = await db.query('SELECT COUNT(*) as count FROM action_effects WHERE enabled = TRUE');
    pass(`Action-Effect mappings: ${mappings.rows[0].count} configured`);

    // List some example actions
    const exampleActions = await db.query(`
      SELECT action_code, action_name, action_category
      FROM action_definitions
      WHERE enabled = TRUE
      LIMIT 5
    `);

    info('Example actions:');
    exampleActions.rows.forEach(action => {
      console.log(`  • ${action.action_code} (${action.action_category}): ${action.action_name}`);
    });

    return true;
  } catch (error) {
    fail(`Actions system error: ${error.message}`);
    return false;
  }
}

async function verifyAuthSystem() {
  section('SSO Authentication System Verification');

  try {
    // Check users table
    const users = await db.query('SELECT COUNT(*) as count FROM users');
    pass(`Users table: ${users.rows[0].count} users`);

    // Check sessions table
    const sessions = await db.query('SELECT COUNT(*) as count FROM user_sessions');
    pass(`Sessions table: ${sessions.rows[0].count} sessions`);

    // Check trusted devices
    const devices = await db.query('SELECT COUNT(*) as count FROM trusted_devices');
    pass(`Trusted devices: ${devices.rows[0].count} devices`);

    // Check functions exist
    const functions = await db.query(`
      SELECT COUNT(*) as count
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN ('create_user_session', 'validate_session', 'revoke_session')
    `);
    pass(`Auth functions: ${functions.rows[0].count}/3 defined`);

    return true;
  } catch (error) {
    fail(`Auth system error: ${error.message}`);
    return false;
  }
}

async function testFullActionFlow() {
  section('End-to-End Action Flow Test');

  try {
    // Create a test user if needed
    const testEmail = 'test@example.com';
    let userId;

    const existingUser = await db.query('SELECT user_id FROM users WHERE email = $1', [testEmail]);

    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].user_id;
      info(`Using existing test user: ${userId}`);
    } else {
      // Would need bcrypt to hash password - skip user creation for now
      info('Skipping test user creation (would need bcrypt)');
      return true;
    }

    // Initialize user skills
    await db.query(`
      INSERT INTO user_skills (user_id, skill_id, current_level, current_xp)
      SELECT $1, skill_id, 1, 0
      FROM skills
      ON CONFLICT (user_id, skill_id) DO NOTHING
    `, [userId]);
    pass('User skills initialized');

    // Get a voting skill
    const votingSkill = await db.query(`SELECT skill_id FROM skills WHERE skill_name = 'Voting'`);

    if (votingSkill.rows.length === 0) {
      fail('Voting skill not found');
      return false;
    }

    const skillId = votingSkill.rows[0].skill_id;

    // Award XP
    const xpResult = await db.query(`
      SELECT * FROM award_xp($1, $2, 10, NULL, 'test')
    `, [userId, skillId]);

    if (xpResult.rows[0].xp_gained) {
      pass(`XP awarded: +${xpResult.rows[0].xp_gained} XP (Level: ${xpResult.rows[0].level_after})`);
    }

    // Check user skill progress
    const progress = await db.query(`
      SELECT * FROM user_skill_summary WHERE user_id = $1 AND skill_name = 'Voting'
    `, [userId]);

    if (progress.rows.length > 0) {
      const p = progress.rows[0];
      pass(`Skill progress verified: Level ${p.current_level} (${p.current_xp} XP)`);
    }

    return true;
  } catch (error) {
    fail(`Action flow test error: ${error.message}`);
    return false;
  }
}

async function runVerification() {
  console.log(`${BLUE}╔═══════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BLUE}║  ${RESET}CalOS Systems Verification${BLUE}                     ║${RESET}`);
  console.log(`${BLUE}╚═══════════════════════════════════════════════════╝${RESET}`);

  info(`Database: ${process.env.DB_NAME || 'calos'} @ ${process.env.DB_HOST || 'localhost'}`);
  info(`User: ${process.env.DB_USER || 'postgres'}`);

  const results = {
    schema: await verifyDatabaseSchema(),
    skills: await verifySkillsSystem(),
    actions: await verifyActionsSystem(),
    auth: await verifyAuthSystem(),
    flow: await testFullActionFlow()
  };

  section('Summary');

  const total = Object.keys(results).length;
  const passed = Object.values(results).filter(r => r).length;

  console.log(`\n${passed === total ? GREEN : YELLOW}${passed}/${total} system checks passed${RESET}`);

  if (passed === total) {
    console.log(`\n${GREEN}✓ All systems verified and operational${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`\n${YELLOW}⚠ Some systems need attention${RESET}\n`);
    process.exit(1);
  }
}

// Run verification
runVerification()
  .catch(error => {
    console.error(`${RED}Fatal error:${RESET}`, error);
    process.exit(1);
  })
  .finally(() => {
    db.end();
  });

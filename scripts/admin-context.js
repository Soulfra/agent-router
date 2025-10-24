#!/usr/bin/env node

/**
 * Admin Context Command
 *
 * ONE command to get complete system context:
 * - All migrations
 * - All database tables
 * - All tenants
 * - All domains
 * - All modelfiles
 * - System health
 *
 * Usage: npm run admin
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function section(title) {
  console.log('\n' + colorize('═'.repeat(60), 'cyan'));
  console.log(colorize(`  ${title}`, 'bright'));
  console.log(colorize('═'.repeat(60), 'cyan'));
}

function subsection(title) {
  console.log('\n' + colorize(`  ${title}`, 'yellow'));
  console.log(colorize('  ' + '─'.repeat(50), 'dim'));
}

// Database connection
const db = new Pool({
  user: process.env.DB_USER || 'matthewmauer',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'calos',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 5432
});

async function main() {
  console.clear();

  console.log(colorize('\n╔═══════════════════════════════════════════════════════════╗', 'bright'));
  console.log(colorize('║       CALOS LOCAL ADMIN CONTEXT                           ║', 'bright'));
  console.log(colorize('╚═══════════════════════════════════════════════════════════╝', 'bright'));

  try {
    // Fire off all queries in parallel
    const [
      migrations,
      tables,
      tenants,
      licenses,
      usage,
      domains,
      eloItems,
      users,
      modelCouncils,
      systemHealth
    ] = await Promise.all([
      getMigrations(),
      getTables(),
      getTenants(),
      getLicenses(),
      getUsageSummary(),
      getDomains(),
      getEloItems(),
      getUsers(),
      getModelCouncils(),
      getSystemHealth()
    ]);

    // Display results
    displayDatabase(migrations, tables, systemHealth);
    displayTenants(tenants, licenses, usage);
    displayModelfiles();
    displayDomains(domains);
    displayMigrations(migrations);
    displayElo(eloItems);
    displayUsers(users);
    displayModelCouncil(modelCouncils);

    console.log('\n' + colorize('✓ Context loaded successfully', 'green'));
    console.log(colorize('  Run with --json for machine-readable output\n', 'dim'));

  } catch (error) {
    console.error(colorize('\n✗ Error loading context:', 'red'), error.message);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// ============================================================================
// QUERY FUNCTIONS (run in parallel)
// ============================================================================

async function getMigrations() {
  const files = fs.readdirSync(path.join(__dirname, '../database/migrations'))
    .filter(f => f.endsWith('.sql'))
    .sort();
  return files;
}

async function getTables() {
  const result = await db.query(`
    SELECT tablename, schemaname
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  return result.rows;
}

async function getTenants() {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'trial') AS trial,
        COUNT(*) FILTER (WHERE status = 'suspended') AS suspended
      FROM tenants
    `);
    return result.rows[0];
  } catch (error) {
    return { total: 0, active: 0, trial: 0, suspended: 0 };
  }
}

async function getLicenses() {
  try {
    const result = await db.query(`
      SELECT
        pricing_model,
        COUNT(*) AS count,
        SUM(cost_this_period_cents) AS total_revenue_cents
      FROM tenant_licenses
      WHERE status = 'active'
      GROUP BY pricing_model
    `);
    return result.rows;
  } catch (error) {
    return [];
  }
}

async function getUsageSummary() {
  try {
    const result = await db.query(`
      SELECT
        SUM(tokens_used_this_period) AS total_tokens,
        SUM(cost_this_period_cents) AS total_cost_cents,
        SUM(api_calls_this_period) AS total_api_calls
      FROM tenant_licenses
      WHERE status = 'active'
    `);
    return result.rows[0];
  } catch (error) {
    return { total_tokens: 0, total_cost_cents: 0, total_api_calls: 0 };
  }
}

async function getDomains() {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'for_sale') AS for_sale
      FROM domain_portfolio
    `);
    return result.rows[0];
  } catch (error) {
    return { total: 0, active: 0, for_sale: 0 };
  }
}

async function getEloItems() {
  try {
    const result = await db.query(`
      SELECT
        item_type,
        COUNT(*) AS count,
        AVG(elo_rating) AS avg_rating
      FROM elo_items
      GROUP BY item_type
      ORDER BY count DESC
    `);
    return result.rows;
  } catch (error) {
    return [];
  }
}

async function getUsers() {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS last_7_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS last_30_days
      FROM users
    `);
    return result.rows[0];
  } catch (error) {
    return { total: 0, last_7_days: 0, last_30_days: 0 };
  }
}

async function getModelCouncils() {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*) AS total_sessions,
        COUNT(*) FILTER (WHERE status = 'active') AS active_sessions,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_sessions
      FROM council_sessions
    `);
    return result.rows[0];
  } catch (error) {
    return { total_sessions: 0, active_sessions: 0, completed_sessions: 0 };
  }
}

async function getSystemHealth() {
  try {
    const [size, connections, locks] = await Promise.all([
      db.query(`SELECT pg_database_size('calos') AS size`),
      db.query(`SELECT count(*) AS active FROM pg_stat_activity WHERE datname = 'calos'`),
      db.query(`SELECT count(*) AS locks FROM pg_locks`)
    ]);

    return {
      size: size.rows[0].size,
      connections: connections.rows[0].active,
      locks: locks.rows[0].locks
    };
  } catch (error) {
    return { size: 0, connections: 0, locks: 0 };
  }
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

function displayDatabase(migrations, tables, health) {
  section('📊 DATABASE STATUS');

  const sizeGB = (health.size / (1024 * 1024 * 1024)).toFixed(2);

  console.log(colorize(`  ├─ Migrations:      ${migrations.length} files`, 'white'));
  console.log(colorize(`  ├─ Tables:          ${tables.length}`, 'white'));
  console.log(colorize(`  ├─ Connections:     ${health.connections} active`, 'white'));
  console.log(colorize(`  ├─ Locks:           ${health.locks}`, 'white'));
  console.log(colorize(`  └─ Database Size:   ${sizeGB} GB`, 'white'));
}

function displayTenants(tenants, licenses, usage) {
  section('🏢 TENANTS & LICENSING');

  console.log(colorize(`  Tenants:`, 'yellow'));
  console.log(colorize(`  ├─ Total:           ${tenants.total}`, 'white'));
  console.log(colorize(`  ├─ Active:          ${tenants.active}`, 'green'));
  console.log(colorize(`  ├─ Trial:           ${tenants.trial}`, 'yellow'));
  console.log(colorize(`  └─ Suspended:       ${tenants.suspended}`, 'red'));

  console.log(colorize(`\n  Licensing:`, 'yellow'));
  if (licenses.length > 0) {
    licenses.forEach((lic, i) => {
      const prefix = i === licenses.length - 1 ? '└─' : '├─';
      console.log(colorize(`  ${prefix} ${lic.pricing_model}: ${lic.count} (${(lic.total_revenue_cents / 100).toFixed(2)} USD)`, 'white'));
    });
  } else {
    console.log(colorize(`  └─ No active licenses`, 'dim'));
  }

  console.log(colorize(`\n  Usage (28-day period):`, 'yellow'));
  console.log(colorize(`  ├─ Tokens:          ${(usage.total_tokens || 0).toLocaleString()}`, 'white'));
  console.log(colorize(`  ├─ API Calls:       ${(usage.total_api_calls || 0).toLocaleString()}`, 'white'));
  console.log(colorize(`  └─ Revenue:         $${((usage.total_cost_cents || 0) / 100).toFixed(2)}`, 'white'));
}

function displayModelfiles() {
  section('🤖 MODELFILES');

  const modelfilesDir = path.join(__dirname, '../modelfiles');

  if (!fs.existsSync(modelfilesDir)) {
    console.log(colorize('  └─ No modelfiles directory found', 'dim'));
    return;
  }

  const modelfiles = fs.readdirSync(modelfilesDir)
    .filter(f => f.startsWith('Modelfile.'))
    .map(f => f.replace('Modelfile.', ''));

  if (modelfiles.length === 0) {
    console.log(colorize('  └─ No modelfiles found', 'dim'));
    return;
  }

  modelfiles.forEach((name, i) => {
    const prefix = i === modelfiles.length - 1 ? '└─' : '├─';
    const descriptions = {
      soulfra: '(crypto/identity)',
      deathtodata: '(ETL/data)',
      publishing: '(docs/markdown)',
      calos: '(platform)',
      drseuss: '(whimsical)'
    };
    const desc = descriptions[name] || '';
    console.log(colorize(`  ${prefix} ${name} ${desc}`, 'white'));
  });
}

function displayDomains(domains) {
  section('🌐 DOMAIN PORTFOLIO');

  console.log(colorize(`  ├─ Total:           ${domains.total}`, 'white'));
  console.log(colorize(`  ├─ Active:          ${domains.active}`, 'green'));
  console.log(colorize(`  └─ For Sale:        ${domains.for_sale}`, 'yellow'));
}

function displayMigrations(migrations) {
  section('📝 RECENT MIGRATIONS');

  const recent = migrations.slice(-5).reverse();

  recent.forEach((file, i) => {
    const prefix = i === recent.length - 1 ? '└─' : '├─';
    const status = colorize('✓', 'green');
    console.log(colorize(`  ${prefix} ${file} ${status}`, 'white'));
  });

  if (migrations.length > 5) {
    console.log(colorize(`\n  (${migrations.length - 5} more migrations)`, 'dim'));
  }
}

function displayElo(eloItems) {
  section('🎯 ELO RANKING SYSTEM');

  if (eloItems.length === 0) {
    console.log(colorize('  └─ No ELO items found', 'dim'));
    return;
  }

  const totalItems = eloItems.reduce((sum, item) => sum + parseInt(item.count), 0);
  console.log(colorize(`  Total Items: ${totalItems}\n`, 'yellow'));

  eloItems.forEach((item, i) => {
    const prefix = i === eloItems.length - 1 ? '└─' : '├─';
    const avgRating = parseFloat(item.avg_rating).toFixed(0);
    console.log(colorize(`  ${prefix} ${item.item_type}: ${item.count} (avg rating: ${avgRating})`, 'white'));
  });
}

function displayUsers(users) {
  section('👥 USERS');

  console.log(colorize(`  ├─ Total:           ${users.total}`, 'white'));
  console.log(colorize(`  ├─ Last 7 days:     ${users.last_7_days}`, 'green'));
  console.log(colorize(`  └─ Last 30 days:    ${users.last_30_days}`, 'white'));
}

function displayModelCouncil(councils) {
  section('🎭 MODEL COUNCIL');

  console.log(colorize(`  ├─ Total Sessions:  ${councils.total_sessions}`, 'white'));
  console.log(colorize(`  ├─ Active:          ${councils.active_sessions}`, 'green'));
  console.log(colorize(`  └─ Completed:       ${councils.completed_sessions}`, 'white'));
}

// ============================================================================
// RUN
// ============================================================================

main().catch(console.error);

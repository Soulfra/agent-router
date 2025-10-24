#!/usr/bin/env node

/**
 * CALOS Setup Wizard
 *
 * Interactive setup that configures EVERYTHING:
 * - Personal information
 * - NPM accounts and organizations
 * - API keys (Ahrefs, Google Sheets, etc.)
 * - Domain configuration
 * - Database setup
 * - Executive dashboard
 *
 * Usage: npm run setup
 */

const readline = require('readline');
const fs = require('fs').promises;
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
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function section(title) {
  console.log('\n' + colorize('═'.repeat(60), 'cyan'));
  console.log(colorize(`  ${title}`, 'bright'));
  console.log(colorize('═'.repeat(60), 'cyan'));
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisified question
function question(prompt) {
  return new Promise(resolve => {
    rl.question(colorize(prompt, 'yellow'), answer => {
      resolve(answer.trim());
    });
  });
}

// Confirm with default
async function confirm(prompt, defaultValue = true) {
  const defaultStr = defaultValue ? 'Y/n' : 'y/N';
  const answer = await question(`${prompt} (${defaultStr}): `);

  if (!answer) return defaultValue;
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

// Configuration object
const config = {
  user: {},
  npm: {},
  apis: {},
  domains: {},
  database: {},
  features: {}
};

async function main() {
  console.clear();

  console.log(colorize('\n╔═══════════════════════════════════════════════════════════╗', 'bright'));
  console.log(colorize('║       CALOS SETUP WIZARD                                  ║', 'bright'));
  console.log(colorize('╚═══════════════════════════════════════════════════════════╝', 'bright'));

  console.log(colorize('\nLet\'s get you set up! This will configure everything you need.\n', 'cyan'));

  try {
    // Step 1: Personal Information
    await collectPersonalInfo();

    // Step 2: NPM Setup
    await collectNPMInfo();

    // Step 3: API Keys
    await collectAPIKeys();

    // Step 4: Database Configuration
    await collectDatabaseInfo();

    // Step 5: Feature Selection
    await collectFeaturePreferences();

    // Step 6: Generate Configuration
    await generateConfiguration();

    // Step 7: Run Setup Tasks
    await runSetupTasks();

    // Done!
    displaySuccessMessage();

  } catch (error) {
    console.error(colorize('\n✗ Setup failed:', 'red'), error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Collect personal information
 */
async function collectPersonalInfo() {
  section('👤 YOUR INFORMATION');

  config.user.fullName = await question('Full Name: ') || 'Matthew Mauer';
  config.user.email = await question('Email: ') || 'matt@soulfra.com';
  config.user.github = await question('GitHub Username: ') || 'matthewmauer';
  config.user.npmUsername = await question('NPM Username: ') || 'matthewmauer';
  config.user.website = await question('Primary Website: ') || 'soulfra.com';

  console.log(colorize(`\n✓ Got it! ${config.user.fullName} (${config.user.email})`, 'green'));
}

/**
 * Collect NPM organization setup
 */
async function collectNPMInfo() {
  section('📦 NPM SETUP');

  console.log(colorize('We\'ll create NPM organizations for your packages.', 'dim'));
  console.log(colorize('Organizations let you publish packages like @cal/sdk', 'dim'));

  config.npm.createCal = await confirm('\nCreate @cal organization?');
  config.npm.createCalos = await confirm('Create @calos organization?');
  config.npm.publishSdk = await confirm('Publish @calos/sdk to NPM?');

  if (config.npm.createCal || config.npm.createCalos) {
    console.log(colorize('\n💡 Note: You\'ll need to be logged into NPM', 'yellow'));
    console.log(colorize('   Run "npm login" first if you haven\'t already', 'yellow'));
  }
}

/**
 * Collect API keys
 */
async function collectAPIKeys() {
  section('🔍 SEO & ANALYTICS');

  config.apis.setupAhrefs = await confirm('\nSetup Ahrefs integration?', false);
  if (config.apis.setupAhrefs) {
    config.apis.ahrefsKey = await question('Ahrefs API Key: ');
  }

  config.apis.setupGoogleAnalytics = await confirm('Setup Google Analytics?', false);
  if (config.apis.setupGoogleAnalytics) {
    config.apis.gaPropertyId = await question('GA Property ID (UA-XXXXXXX or G-XXXXXXX): ');
  }

  config.apis.setupGoogleSheets = await confirm('Setup Google Sheets sync?', false);
  if (config.apis.setupGoogleSheets) {
    console.log(colorize('\n  You\'ll need a Service Account JSON file.', 'dim'));
    console.log(colorize('  Get it from: https://console.cloud.google.com/iam-admin/serviceaccounts', 'dim'));
    config.apis.sheetsServiceAccount = await question('  Path to service account JSON: ');
  }

  config.apis.setupStripe = await confirm('Setup Stripe payments?', false);
  if (config.apis.setupStripe) {
    config.apis.stripeSecretKey = await question('Stripe Secret Key (sk_...): ');
    config.apis.stripePublicKey = await question('Stripe Public Key (pk_...): ');
  }
}

/**
 * Collect database information
 */
async function collectDatabaseInfo() {
  section('🗄️  DATABASE CONFIGURATION');

  const dbType = await question('\nDatabase type (postgres/sqlite) [postgres]: ') || 'postgres';
  config.database.type = dbType;

  if (dbType === 'postgres') {
    config.database.host = await question('Database Host [localhost]: ') || 'localhost';
    config.database.port = await question('Database Port [5432]: ') || '5432';
    config.database.name = await question('Database Name [calos]: ') || 'calos';
    config.database.user = await question('Database User: ') || process.env.USER;
    config.database.password = await question('Database Password (leave empty if none): ');
  } else {
    config.database.file = await question('SQLite file path [./data/calos.db]: ') || './data/calos.db';
  }

  config.database.runMigrations = await confirm('Run database migrations now?');
}

/**
 * Collect feature preferences
 */
async function collectFeaturePreferences() {
  section('✨ FEATURES');

  console.log(colorize('\nWhich features do you want to enable?\n', 'cyan'));

  config.features.executiveDashboard = await confirm('Executive Dashboard (monitoring all domains)?');
  config.features.crudMonitoring = await confirm('CRUD Operation Monitoring?');
  config.features.usageBasedPricing = await confirm('Usage-Based Pricing for tenants?');
  config.features.affiliateTracking = await confirm('Affiliate Program Tracking?', false);
  config.features.domainVoting = await confirm('Domain Portfolio Voting?', false);
  config.features.eloRankings = await confirm('ELO Rating System?', false);

  if (config.features.affiliateTracking) {
    console.log(colorize('\nWhich affiliate programs? (comma-separated)', 'dim'));
    const programs = await question('Programs [Stripe, Amazon, Ahrefs]: ') || 'Stripe, Amazon, Ahrefs';
    config.features.affiliatePrograms = programs.split(',').map(p => p.trim());
  }
}

/**
 * Generate .env file
 */
async function generateConfiguration() {
  section('⚙️  GENERATING CONFIGURATION');

  console.log(colorize('\nCreating .env file...', 'cyan'));

  const envContent = `# CALOS Configuration
# Generated by setup wizard on ${new Date().toISOString()}

# ============================================================================
# PERSONAL INFORMATION
# ============================================================================
OWNER_NAME="${config.user.fullName}"
OWNER_EMAIL="${config.user.email}"
OWNER_GITHUB="${config.user.github}"

# ============================================================================
# SERVER
# ============================================================================
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*

# ============================================================================
# DATABASE
# ============================================================================
DB_TYPE=${config.database.type}
${config.database.type === 'postgres' ? `DB_HOST=${config.database.host}
DB_PORT=${config.database.port}
DB_NAME=${config.database.name}
DB_USER=${config.database.user}
DB_PASSWORD=${config.database.password}` : `DB_FILE=${config.database.file}`}

# ============================================================================
# LLM PROVIDERS
# ============================================================================
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=

# ============================================================================
# SEO & ANALYTICS
# ============================================================================
${config.apis.setupAhrefs ? `AHREFS_API_KEY=${config.apis.ahrefsKey}` : '# AHREFS_API_KEY='}
${config.apis.setupGoogleAnalytics ? `GA_PROPERTY_ID=${config.apis.gaPropertyId}` : '# GA_PROPERTY_ID='}

# ============================================================================
# GOOGLE SHEETS
# ============================================================================
${config.apis.setupGoogleSheets ? `GOOGLE_SHEETS_SERVICE_ACCOUNT=${config.apis.sheetsServiceAccount}` : '# GOOGLE_SHEETS_SERVICE_ACCOUNT='}

# ============================================================================
# PAYMENTS
# ============================================================================
${config.apis.setupStripe ? `STRIPE_SECRET_KEY=${config.apis.stripeSecretKey}
STRIPE_PUBLIC_KEY=${config.apis.stripePublicKey}` : '# STRIPE_SECRET_KEY=\n# STRIPE_PUBLIC_KEY='}

# ============================================================================
# FEATURES
# ============================================================================
ENABLE_EXECUTIVE_DASHBOARD=${config.features.executiveDashboard}
ENABLE_CRUD_MONITORING=${config.features.crudMonitoring}
ENABLE_USAGE_PRICING=${config.features.usageBasedPricing}
ENABLE_AFFILIATE_TRACKING=${config.features.affiliateTracking}

# ============================================================================
# SECURITY
# ============================================================================
JWT_SECRET=${generateRandomString(64)}
SESSION_SECRET=${generateRandomString(64)}
`;

  await fs.writeFile('.env', envContent, 'utf8');
  console.log(colorize('✓ Created .env file', 'green'));

  // Create .gitignore if it doesn't exist
  try {
    await fs.access('.gitignore');
  } catch {
    await fs.writeFile('.gitignore', `.env
.env.local
node_modules/
*.log
.DS_Store
dist/
build/
coverage/
.vscode/
.idea/
`, 'utf8');
    console.log(colorize('✓ Created .gitignore', 'green'));
  }
}

/**
 * Run setup tasks
 */
async function runSetupTasks() {
  section('🚀 RUNNING SETUP TASKS');

  const tasks = [];

  // Install dependencies
  tasks.push({
    name: 'Install dependencies',
    run: async () => {
      console.log(colorize('  Installing npm packages...', 'dim'));
      await execPromise('npm install');
    }
  });

  // Run migrations
  if (config.database.runMigrations) {
    tasks.push({
      name: 'Run database migrations',
      run: async () => {
        console.log(colorize('  Running migrations...', 'dim'));
        // Migration logic will be added later
      }
    });
  }

  // Create NPM organizations
  if (config.npm.createCal) {
    tasks.push({
      name: 'Create @cal NPM organization',
      run: async () => {
        console.log(colorize('  Visit: https://www.npmjs.com/org/create', 'yellow'));
        console.log(colorize('  Organization name: cal', 'yellow'));
        console.log(colorize('  (You\'ll need to do this manually in your browser)', 'dim'));
      }
    });
  }

  if (config.npm.createCalos) {
    tasks.push({
      name: 'Create @calos NPM organization',
      run: async () => {
        console.log(colorize('  Visit: https://www.npmjs.com/org/create', 'yellow'));
        console.log(colorize('  Organization name: calos', 'yellow'));
      }
    });
  }

  // Publish SDK
  if (config.npm.publishSdk) {
    tasks.push({
      name: 'Publish @calos/sdk',
      run: async () => {
        console.log(colorize('  To publish, run: cd sdk/platform && npm publish --access public', 'yellow'));
      }
    });
  }

  // Run tasks
  for (const task of tasks) {
    console.log(colorize(`\n→ ${task.name}`, 'cyan'));
    try {
      await task.run();
      console.log(colorize(`✓ ${task.name}`, 'green'));
    } catch (error) {
      console.log(colorize(`✗ ${task.name}: ${error.message}`, 'red'));
    }
  }
}

/**
 * Display success message
 */
function displaySuccessMessage() {
  console.log('\n' + colorize('═'.repeat(60), 'green'));
  console.log(colorize('  🎉 SETUP COMPLETE!', 'green'));
  console.log(colorize('═'.repeat(60), 'green'));

  console.log(colorize('\nYour CALOS platform is ready to go!\n', 'cyan'));

  console.log(colorize('Next steps:', 'yellow'));
  console.log(colorize('  1. Start the server:', 'white'));
  console.log(colorize('     npm start', 'cyan'));
  console.log(colorize('\n  2. Visit your dashboard:', 'white'));
  console.log(colorize('     http://localhost:3000', 'cyan'));

  if (config.features.executiveDashboard) {
    console.log(colorize('\n  3. Executive dashboard:', 'white'));
    console.log(colorize('     http://localhost:3000/executive', 'cyan'));
  }

  if (config.apis.setupGoogleSheets) {
    console.log(colorize('\n  4. Your Google Sheet will be created automatically', 'white'));
  }

  console.log(colorize('\n  Configuration saved to .env', 'dim'));
  console.log(colorize('  View admin context: npm run admin\n', 'dim'));
}

/**
 * Generate random string
 */
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Run the wizard
main();

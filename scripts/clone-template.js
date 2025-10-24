#!/usr/bin/env node

/**
 * CALOS Template Cloner
 *
 * Clone the entire CALOS platform for your own use:
 * - Copies all files to a new directory
 * - Replaces branding (CALOS → YOUR_BRAND)
 * - Updates owner information
 * - Generates new secrets
 * - Creates fresh .env file
 * - Initializes git repository
 * - Provides setup instructions
 *
 * Usage: npm run clone <project-name>
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const readline = require('readline');

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

function question(prompt) {
  return new Promise(resolve => {
    rl.question(colorize(prompt, 'yellow'), answer => {
      resolve(answer.trim());
    });
  });
}

async function confirm(prompt, defaultValue = true) {
  const defaultStr = defaultValue ? 'Y/n' : 'y/N';
  const answer = await question(`${prompt} (${defaultStr}): `);

  if (!answer) return defaultValue;
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

// Configuration
const config = {
  source: process.cwd(),
  target: null,
  branding: {},
  owner: {},
  features: {}
};

// Files to exclude from cloning
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.env',
  '.env.local',
  '*.log',
  '.DS_Store',
  'dist',
  'build',
  'coverage',
  '.vscode',
  '.idea',
  '*.sqlite',
  '*.db'
];

// Files that need branding replacement
const BRANDING_FILES = [
  'package.json',
  'README.md',
  'router.js',
  'sdk/platform/package.json',
  'sdk/platform/README.md',
  'sdk/platform/index.js',
  'scripts/setup-wizard.js',
  'lib/**/*.js',
  'routes/**/*.js'
];

async function main() {
  console.clear();

  console.log(colorize('\n╔═══════════════════════════════════════════════════════════╗', 'bright'));
  console.log(colorize('║       CALOS TEMPLATE CLONER                               ║', 'bright'));
  console.log(colorize('╚═══════════════════════════════════════════════════════════╝', 'bright'));

  console.log(colorize('\nClone the entire CALOS platform with your own branding!\n', 'cyan'));

  try {
    // Step 1: Get project details
    await collectProjectInfo();

    // Step 2: Collect owner information
    await collectOwnerInfo();

    // Step 3: Feature selection
    await collectFeaturePreferences();

    // Step 4: Clone files
    await cloneFiles();

    // Step 5: Replace branding
    await replaceBranding();

    // Step 6: Generate .env
    await generateEnvFile();

    // Step 7: Initialize git
    await initializeGit();

    // Step 8: Install dependencies
    await installDependencies();

    // Done!
    displaySuccessMessage();

  } catch (error) {
    console.error(colorize('\n✗ Clone failed:', 'red'), error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Collect project information
 */
async function collectProjectInfo() {
  section('📋 PROJECT INFORMATION');

  const projectName = await question('Project name (lowercase, no spaces): ');
  config.target = path.join(process.cwd(), '..', projectName);

  config.branding.projectName = projectName;
  config.branding.displayName = await question('Display name (e.g., "MyCompany AI"): ') || projectName;
  config.branding.organizationName = await question('Organization name (for @org/package): ') || projectName;
  config.branding.website = await question('Website (optional): ') || `${projectName}.com`;
  config.branding.description = await question('Short description: ') || 'AI-powered routing platform';

  // Check if target exists
  if (fsSync.existsSync(config.target)) {
    const overwrite = await confirm(`Directory ${projectName} already exists. Overwrite?`, false);
    if (!overwrite) {
      console.log(colorize('\nClone cancelled.', 'yellow'));
      process.exit(0);
    }
  }

  console.log(colorize(`\n✓ Will clone to: ${config.target}`, 'green'));
}

/**
 * Collect owner information
 */
async function collectOwnerInfo() {
  section('👤 OWNER INFORMATION');

  config.owner.fullName = await question('Your full name: ');
  config.owner.email = await question('Your email: ');
  config.owner.github = await question('GitHub username: ');
  config.owner.npmUsername = await question('NPM username (optional): ') || config.owner.github;

  console.log(colorize(`\n✓ Owner: ${config.owner.fullName}`, 'green'));
}

/**
 * Feature selection
 */
async function collectFeaturePreferences() {
  section('✨ FEATURES');

  console.log(colorize('\nWhich features do you want to include?\n', 'cyan'));

  config.features.executiveDashboard = await confirm('Executive Dashboard?');
  config.features.crudMonitoring = await confirm('CRUD Operation Monitoring?');
  config.features.googleSheets = await confirm('Google Sheets Integration?', false);
  config.features.ahrefsIntegration = await confirm('Ahrefs SEO Integration?', false);
  config.features.affiliateTracking = await confirm('Affiliate Tracking?', false);
  config.features.domainVoting = await confirm('Domain Voting System?', false);
}

/**
 * Clone all files
 */
async function cloneFiles() {
  section('📁 CLONING FILES');

  console.log(colorize('\nCopying files...', 'cyan'));

  // Create target directory
  await fs.mkdir(config.target, { recursive: true });

  // Copy files recursively
  await copyDirectory(config.source, config.target);

  console.log(colorize('✓ Files copied', 'green'));
}

/**
 * Copy directory recursively, excluding certain patterns
 */
async function copyDirectory(source, target) {
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    // Skip excluded patterns
    if (shouldExclude(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      await fs.mkdir(targetPath, { recursive: true });
      await copyDirectory(sourcePath, targetPath);
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

/**
 * Check if file/directory should be excluded
 */
function shouldExclude(name) {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(name)) return true;
    } else {
      if (name === pattern) return true;
    }
  }
  return false;
}

/**
 * Replace branding in files
 */
async function replaceBranding() {
  section('🎨 REPLACING BRANDING');

  console.log(colorize('\nUpdating branding in files...', 'cyan'));

  // Branding replacements
  const replacements = [
    { from: /CALOS/g, to: config.branding.displayName.toUpperCase() },
    { from: /calos/g, to: config.branding.projectName.toLowerCase() },
    { from: /Calos/g, to: config.branding.displayName },
    { from: /@calos/g, to: `@${config.branding.organizationName}` },
    { from: /Matthew Mauer/g, to: config.owner.fullName },
    { from: /matt@soulfra\.com/g, to: config.owner.email },
    { from: /matthewmauer/g, to: config.owner.github }
  ];

  // Update package.json
  await updatePackageJson();

  // Update README
  await updateReadme();

  // Update other files
  const filesToUpdate = [
    'router.js',
    'scripts/setup-wizard.js',
    'sdk/platform/package.json',
    'sdk/platform/README.md',
    'sdk/platform/index.js'
  ];

  for (const file of filesToUpdate) {
    const filePath = path.join(config.target, file);
    if (fsSync.existsSync(filePath)) {
      await replaceInFile(filePath, replacements);
    }
  }

  console.log(colorize('✓ Branding updated', 'green'));
}

/**
 * Replace text in a file
 */
async function replaceInFile(filePath, replacements) {
  let content = await fs.readFile(filePath, 'utf8');

  for (const { from, to } of replacements) {
    content = content.replace(from, to);
  }

  await fs.writeFile(filePath, content, 'utf8');
}

/**
 * Update package.json
 */
async function updatePackageJson() {
  const packagePath = path.join(config.target, 'package.json');
  const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));

  pkg.name = config.branding.projectName;
  pkg.description = config.branding.description;
  pkg.author = config.owner.fullName;
  pkg.version = '1.0.0';

  if (config.owner.github) {
    pkg.repository = {
      type: 'git',
      url: `https://github.com/${config.owner.github}/${config.branding.projectName}`
    };
  }

  await fs.writeFile(packagePath, JSON.stringify(pkg, null, 2), 'utf8');
}

/**
 * Update README
 */
async function updateReadme() {
  const readmePath = path.join(config.target, 'README.md');

  const newReadme = `# ${config.branding.displayName}

${config.branding.description}

## Features

${config.features.executiveDashboard ? '- ✅ Executive Dashboard' : ''}
${config.features.crudMonitoring ? '- ✅ CRUD Operation Monitoring' : ''}
${config.features.googleSheets ? '- ✅ Google Sheets Integration' : ''}
${config.features.ahrefsIntegration ? '- ✅ Ahrefs SEO Integration' : ''}
${config.features.affiliateTracking ? '- ✅ Affiliate Tracking' : ''}
${config.features.domainVoting ? '- ✅ Domain Voting System' : ''}
- ✅ Multi-LLM Routing (OpenAI, Anthropic, DeepSeek, Ollama)
- ✅ Usage-Based Pricing
- ✅ Multi-Tenancy
- ✅ TypeScript SDK

## Quick Start

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Configure environment:
   \`\`\`bash
   npm run setup
   \`\`\`

3. Start the server:
   \`\`\`bash
   npm start
   \`\`\`

4. Visit http://localhost:3000

## Documentation

See [SETUP.md](./SETUP.md) for detailed setup instructions.

## Support

Built by ${config.owner.fullName} (${config.owner.email})

Based on the CALOS Platform - https://github.com/soulfra/calos

## License

MIT
`;

  await fs.writeFile(readmePath, newReadme, 'utf8');
}

/**
 * Generate .env file
 */
async function generateEnvFile() {
  section('⚙️  GENERATING CONFIGURATION');

  console.log(colorize('\nCreating .env file...', 'cyan'));

  const envContent = `# ${config.branding.displayName} Configuration
# Generated by CALOS Template Cloner

# ============================================================================
# OWNER INFORMATION
# ============================================================================
OWNER_NAME="${config.owner.fullName}"
OWNER_EMAIL="${config.owner.email}"
OWNER_GITHUB="${config.owner.github}"

# ============================================================================
# SERVER
# ============================================================================
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*

# ============================================================================
# DATABASE
# ============================================================================
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${config.branding.projectName}
DB_USER=
DB_PASSWORD=

# ============================================================================
# LLM PROVIDERS
# ============================================================================
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=

# ============================================================================
# SEO & ANALYTICS
# ============================================================================
${config.features.ahrefsIntegration ? 'AHREFS_API_KEY=' : '# AHREFS_API_KEY='}
GA_PROPERTY_ID=

# ============================================================================
# GOOGLE SHEETS
# ============================================================================
${config.features.googleSheets ? 'GOOGLE_SHEETS_SERVICE_ACCOUNT=' : '# GOOGLE_SHEETS_SERVICE_ACCOUNT='}
${config.features.googleSheets ? 'GOOGLE_SHEETS_SPREADSHEET_ID=' : '# GOOGLE_SHEETS_SPREADSHEET_ID='}

# ============================================================================
# PAYMENTS
# ============================================================================
STRIPE_SECRET_KEY=
STRIPE_PUBLIC_KEY=

# ============================================================================
# FEATURES
# ============================================================================
ENABLE_EXECUTIVE_DASHBOARD=${config.features.executiveDashboard}
ENABLE_CRUD_MONITORING=${config.features.crudMonitoring}
ENABLE_AFFILIATE_TRACKING=${config.features.affiliateTracking}

# ============================================================================
# SECURITY
# ============================================================================
JWT_SECRET=${generateRandomString(64)}
SESSION_SECRET=${generateRandomString(64)}
`;

  const envPath = path.join(config.target, '.env');
  await fs.writeFile(envPath, envContent, 'utf8');

  console.log(colorize('✓ Created .env file', 'green'));

  // Create .gitignore
  const gitignorePath = path.join(config.target, '.gitignore');
  if (!fsSync.existsSync(gitignorePath)) {
    await fs.writeFile(gitignorePath, `.env
.env.local
node_modules/
*.log
.DS_Store
dist/
build/
coverage/
.vscode/
.idea/
*.sqlite
*.db
`, 'utf8');
    console.log(colorize('✓ Created .gitignore', 'green'));
  }
}

/**
 * Initialize git repository
 */
async function initializeGit() {
  section('🔧 INITIALIZING GIT');

  const initGit = await confirm('Initialize git repository?');

  if (initGit) {
    console.log(colorize('\nInitializing git...', 'cyan'));

    try {
      await execPromise('git init', { cwd: config.target });
      await execPromise('git add .', { cwd: config.target });
      await execPromise(`git commit -m "Initial commit - Cloned from CALOS template"`, { cwd: config.target });

      console.log(colorize('✓ Git repository initialized', 'green'));

      if (config.owner.github) {
        console.log(colorize(`\nTo push to GitHub, run:`, 'yellow'));
        console.log(colorize(`  cd ${path.basename(config.target)}`, 'dim'));
        console.log(colorize(`  git remote add origin https://github.com/${config.owner.github}/${config.branding.projectName}.git`, 'dim'));
        console.log(colorize(`  git push -u origin main`, 'dim'));
      }
    } catch (error) {
      console.log(colorize('✗ Git initialization failed:', 'red'), error.message);
    }
  }
}

/**
 * Install dependencies
 */
async function installDependencies() {
  section('📦 INSTALLING DEPENDENCIES');

  const install = await confirm('Install npm dependencies now?');

  if (install) {
    console.log(colorize('\nInstalling packages (this may take a few minutes)...', 'cyan'));

    try {
      await execPromise('npm install', { cwd: config.target });
      console.log(colorize('✓ Dependencies installed', 'green'));
    } catch (error) {
      console.log(colorize('✗ Installation failed:', 'red'), error.message);
      console.log(colorize('\nYou can install manually later with: npm install', 'yellow'));
    }
  }
}

/**
 * Display success message
 */
function displaySuccessMessage() {
  console.log('\n' + colorize('═'.repeat(60), 'green'));
  console.log(colorize('  🎉 CLONE COMPLETE!', 'green'));
  console.log(colorize('═'.repeat(60), 'green'));

  console.log(colorize(`\nYour ${config.branding.displayName} platform is ready!\n`, 'cyan'));

  console.log(colorize('Next steps:', 'yellow'));
  console.log(colorize(`  1. Navigate to your project:`, 'white'));
  console.log(colorize(`     cd ${path.basename(config.target)}`, 'cyan'));

  console.log(colorize(`\n  2. Configure your .env file with API keys:`, 'white'));
  console.log(colorize(`     nano .env`, 'cyan'));

  console.log(colorize(`\n  3. Set up the database:`, 'white'));
  console.log(colorize(`     createdb ${config.branding.projectName}`, 'cyan'));
  console.log(colorize(`     psql -d ${config.branding.projectName} -f database/migrations/*.sql`, 'cyan'));

  console.log(colorize(`\n  4. Start the server:`, 'white'));
  console.log(colorize(`     npm start`, 'cyan'));

  console.log(colorize(`\n  5. Visit your dashboard:`, 'white'));
  console.log(colorize(`     http://localhost:3000`, 'cyan'));

  console.log(colorize('\n  Configuration saved to .env', 'dim'));
  console.log(colorize('  Need help? Contact: ' + config.owner.email + '\n', 'dim'));

  console.log(colorize('  Based on CALOS Platform by Matthew Mauer', 'dim'));
  console.log(colorize('  Original: https://github.com/soulfra/calos\n', 'dim'));
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

// Run the cloner
main();

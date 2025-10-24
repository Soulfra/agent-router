#!/usr/bin/env node

/**
 * CALOS Deployment Script
 *
 * One-click deployment to multiple platforms:
 * - Railway (Recommended for full-stack apps)
 * - Vercel (Serverless)
 * - DigitalOcean App Platform
 * - Heroku
 * - Docker
 *
 * Usage: npm run deploy
 */

const readline = require('readline');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

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
  platform: null,
  projectName: 'calos-platform',
  databaseUrl: null,
  envVars: {}
};

async function main() {
  console.clear();

  console.log(colorize('\n╔═══════════════════════════════════════════════════════════╗', 'bright'));
  console.log(colorize('║       CALOS DEPLOYMENT WIZARD                             ║', 'bright'));
  console.log(colorize('╚═══════════════════════════════════════════════════════════╝', 'bright'));

  console.log(colorize('\nDeploy your CALOS platform to the cloud!\n', 'cyan'));

  try {
    // Step 1: Check prerequisites
    await checkPrerequisites();

    // Step 2: Select platform
    await selectPlatform();

    // Step 3: Prepare deployment
    await prepareDeployment();

    // Step 4: Deploy
    await deploy();

    // Done!
    displaySuccessMessage();

  } catch (error) {
    console.error(colorize('\n✗ Deployment failed:', 'red'), error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Check prerequisites
 */
async function checkPrerequisites() {
  section('🔍 CHECKING PREREQUISITES');

  console.log(colorize('\nChecking requirements...', 'cyan'));

  // Check if git is installed
  try {
    await execPromise('git --version');
    console.log(colorize('✓ Git installed', 'green'));
  } catch (error) {
    throw new Error('Git is not installed. Please install Git first.');
  }

  // Check if .env file exists
  if (!fsSync.existsSync('.env')) {
    console.log(colorize('✗ .env file not found', 'red'));
    const runSetup = await confirm('Run setup wizard first?');
    if (runSetup) {
      await execPromise('npm run setup');
    } else {
      throw new Error('Please create .env file before deploying');
    }
  } else {
    console.log(colorize('✓ .env file exists', 'green'));
  }

  // Check if node_modules exists
  if (!fsSync.existsSync('node_modules')) {
    console.log(colorize('Installing dependencies...', 'yellow'));
    await execPromise('npm install');
    console.log(colorize('✓ Dependencies installed', 'green'));
  } else {
    console.log(colorize('✓ Dependencies installed', 'green'));
  }
}

/**
 * Select deployment platform
 */
async function selectPlatform() {
  section('🚀 SELECT PLATFORM');

  console.log(colorize('\nWhere would you like to deploy?\n', 'cyan'));
  console.log(colorize('1. Railway (Recommended)', 'white') + colorize(' - Best for full-stack apps with DB', 'dim'));
  console.log(colorize('2. Vercel', 'white') + colorize(' - Serverless, great for API routes', 'dim'));
  console.log(colorize('3. DigitalOcean App Platform', 'white') + colorize(' - Simple container deployment', 'dim'));
  console.log(colorize('4. Heroku', 'white') + colorize(' - Classic PaaS', 'dim'));
  console.log(colorize('5. Docker', 'white') + colorize(' - Build Docker image for any platform', 'dim'));
  console.log(colorize('6. Manual', 'white') + colorize(' - Get deployment files only', 'dim'));

  const choice = await question('\nSelect platform (1-6): ');

  const platforms = {
    '1': 'railway',
    '2': 'vercel',
    '3': 'digitalocean',
    '4': 'heroku',
    '5': 'docker',
    '6': 'manual'
  };

  config.platform = platforms[choice];

  if (!config.platform) {
    throw new Error('Invalid platform selection');
  }

  console.log(colorize(`\n✓ Selected: ${config.platform}`, 'green'));
}

/**
 * Prepare deployment
 */
async function prepareDeployment() {
  section('⚙️  PREPARING DEPLOYMENT');

  config.projectName = await question('Project name (lowercase, no spaces): ') || 'calos-platform';

  // Load .env variables
  await loadEnvVariables();

  // Platform-specific preparation
  switch (config.platform) {
    case 'railway':
      await prepareRailway();
      break;
    case 'vercel':
      await prepareVercel();
      break;
    case 'digitalocean':
      await prepareDigitalOcean();
      break;
    case 'heroku':
      await prepareHeroku();
      break;
    case 'docker':
      await prepareDocker();
      break;
    case 'manual':
      await prepareManual();
      break;
  }
}

/**
 * Load environment variables from .env
 */
async function loadEnvVariables() {
  const envContent = await fs.readFile('.env', 'utf8');
  const lines = envContent.split('\n');

  for (const line of lines) {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      if (key && value) {
        config.envVars[key.trim()] = value.trim();
      }
    }
  }

  console.log(colorize(`✓ Loaded ${Object.keys(config.envVars).length} environment variables`, 'green'));
}

/**
 * Prepare Railway deployment
 */
async function prepareRailway() {
  console.log(colorize('\nPreparing Railway deployment...', 'cyan'));

  // Check if railway CLI is installed
  try {
    await execPromise('railway --version');
    console.log(colorize('✓ Railway CLI installed', 'green'));
  } catch (error) {
    console.log(colorize('Installing Railway CLI...', 'yellow'));
    await execPromise('npm install -g @railway/cli');
  }

  // Check if logged in
  try {
    await execPromise('railway whoami');
  } catch (error) {
    console.log(colorize('\nPlease login to Railway:', 'yellow'));
    await execPromise('railway login');
  }

  // Create railway.json
  const railwayConfig = {
    "$schema": "https://railway.app/railway.schema.json",
    "build": {
      "builder": "NIXPACKS"
    },
    "deploy": {
      "startCommand": "npm start",
      "restartPolicyType": "ON_FAILURE",
      "restartPolicyMaxRetries": 10
    }
  };

  await fs.writeFile('railway.json', JSON.stringify(railwayConfig, null, 2));
  console.log(colorize('✓ Created railway.json', 'green'));
}

/**
 * Prepare Vercel deployment
 */
async function prepareVercel() {
  console.log(colorize('\nPreparing Vercel deployment...', 'cyan'));

  // Check if vercel CLI is installed
  try {
    await execPromise('vercel --version');
    console.log(colorize('✓ Vercel CLI installed', 'green'));
  } catch (error) {
    console.log(colorize('Installing Vercel CLI...', 'yellow'));
    await execPromise('npm install -g vercel');
  }

  // Create vercel.json
  const vercelConfig = {
    "version": 2,
    "builds": [
      {
        "src": "router.js",
        "use": "@vercel/node"
      }
    ],
    "routes": [
      {
        "src": "/(.*)",
        "dest": "/router.js"
      }
    ],
    "env": Object.keys(config.envVars).reduce((acc, key) => {
      acc[key] = `@${key.toLowerCase().replace(/_/g, '-')}`;
      return acc;
    }, {})
  };

  await fs.writeFile('vercel.json', JSON.stringify(vercelConfig, null, 2));
  console.log(colorize('✓ Created vercel.json', 'green'));
}

/**
 * Prepare DigitalOcean deployment
 */
async function prepareDigitalOcean() {
  console.log(colorize('\nPreparing DigitalOcean deployment...', 'cyan'));

  // Create .do/app.yaml
  const doConfig = `
name: ${config.projectName}
services:
- name: web
  github:
    repo: your-username/your-repo
    branch: main
  build_command: npm install
  run_command: npm start
  envs:
${Object.entries(config.envVars).map(([key, val]) => `  - key: ${key}\n    value: "${val}"`).join('\n')}
  instance_count: 1
  instance_size_slug: basic-xxs
databases:
- name: postgres
  engine: PG
  version: "14"
`;

  await fs.mkdir('.do', { recursive: true });
  await fs.writeFile('.do/app.yaml', doConfig.trim());
  console.log(colorize('✓ Created .do/app.yaml', 'green'));
}

/**
 * Prepare Heroku deployment
 */
async function prepareHeroku() {
  console.log(colorize('\nPreparing Heroku deployment...', 'cyan'));

  // Check if heroku CLI is installed
  try {
    await execPromise('heroku --version');
    console.log(colorize('✓ Heroku CLI installed', 'green'));
  } catch (error) {
    throw new Error('Heroku CLI not installed. Visit: https://devcenter.heroku.com/articles/heroku-cli');
  }

  // Create Procfile
  await fs.writeFile('Procfile', 'web: npm start');
  console.log(colorize('✓ Created Procfile', 'green'));
}

/**
 * Prepare Docker deployment
 */
async function prepareDocker() {
  console.log(colorize('\nPreparing Docker deployment...', 'cyan'));

  // Create Dockerfile
  const dockerfile = `
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
`;

  await fs.writeFile('Dockerfile', dockerfile.trim());
  console.log(colorize('✓ Created Dockerfile', 'green'));

  // Create .dockerignore
  const dockerignore = `
node_modules
npm-debug.log
.env
.env.local
.git
.DS_Store
*.log
`;

  await fs.writeFile('.dockerignore', dockerignore.trim());
  console.log(colorize('✓ Created .dockerignore', 'green'));
}

/**
 * Prepare manual deployment
 */
async function prepareManual() {
  console.log(colorize('\nPreparing deployment files...', 'cyan'));

  // Just create all config files
  await prepareDocker();
  await prepareRailway();
  await prepareVercel();

  console.log(colorize('\n✓ All deployment files created', 'green'));
}

/**
 * Deploy to selected platform
 */
async function deploy() {
  section('🚀 DEPLOYING');

  switch (config.platform) {
    case 'railway':
      await deployRailway();
      break;
    case 'vercel':
      await deployVercel();
      break;
    case 'heroku':
      await deployHeroku();
      break;
    case 'docker':
      await deployDocker();
      break;
    case 'digitalocean':
    case 'manual':
      console.log(colorize('\nDeployment files created. Please deploy manually:', 'yellow'));
      if (config.platform === 'digitalocean') {
        console.log(colorize('  1. Push code to GitHub', 'dim'));
        console.log(colorize('  2. Visit https://cloud.digitalocean.com/apps', 'dim'));
        console.log(colorize('  3. Create App from GitHub', 'dim'));
        console.log(colorize('  4. Select your repository', 'dim'));
      }
      break;
  }
}

/**
 * Deploy to Railway
 */
async function deployRailway() {
  console.log(colorize('\nDeploying to Railway...', 'cyan'));

  try {
    // Initialize project
    await execPromise('railway init');

    // Link to project
    await execPromise(`railway link`);

    // Add PostgreSQL
    const addDb = await confirm('Add PostgreSQL database?');
    if (addDb) {
      await execPromise('railway add postgres');
    }

    // Set environment variables
    console.log(colorize('\nSetting environment variables...', 'yellow'));
    for (const [key, value] of Object.entries(config.envVars)) {
      if (value && !key.includes('SECRET') && !key.includes('KEY')) {
        try {
          await execPromise(`railway variables set ${key}="${value}"`);
        } catch (error) {
          // Skip if fails
        }
      }
    }

    // Deploy
    console.log(colorize('\nDeploying...', 'cyan'));
    await execPromise('railway up');

    console.log(colorize('\n✓ Deployed to Railway!', 'green'));

  } catch (error) {
    throw new Error(`Railway deployment failed: ${error.message}`);
  }
}

/**
 * Deploy to Vercel
 */
async function deployVercel() {
  console.log(colorize('\nDeploying to Vercel...', 'cyan'));

  try {
    // Deploy
    const { stdout } = await execPromise('vercel --prod');
    console.log(stdout);

    console.log(colorize('\n✓ Deployed to Vercel!', 'green'));

  } catch (error) {
    throw new Error(`Vercel deployment failed: ${error.message}`);
  }
}

/**
 * Deploy to Heroku
 */
async function deployHeroku() {
  console.log(colorize('\nDeploying to Heroku...', 'cyan'));

  try {
    // Create app
    await execPromise(`heroku create ${config.projectName}`);

    // Add PostgreSQL
    const addDb = await confirm('Add Heroku Postgres?');
    if (addDb) {
      await execPromise('heroku addons:create heroku-postgresql:mini');
    }

    // Set config vars
    console.log(colorize('\nSetting config vars...', 'yellow'));
    for (const [key, value] of Object.entries(config.envVars)) {
      if (value) {
        try {
          await execPromise(`heroku config:set ${key}="${value}"`);
        } catch (error) {
          // Skip if fails
        }
      }
    }

    // Deploy
    await execPromise('git push heroku main');

    console.log(colorize('\n✓ Deployed to Heroku!', 'green'));

  } catch (error) {
    throw new Error(`Heroku deployment failed: ${error.message}`);
  }
}

/**
 * Deploy Docker
 */
async function deployDocker() {
  console.log(colorize('\nBuilding Docker image...', 'cyan'));

  try {
    await execPromise(`docker build -t ${config.projectName} .`);
    console.log(colorize('\n✓ Docker image built!', 'green'));

    const runNow = await confirm('Run container now?');
    if (runNow) {
      await execPromise(`docker run -p 3000:3000 --env-file .env ${config.projectName}`);
    }

  } catch (error) {
    throw new Error(`Docker build failed: ${error.message}`);
  }
}

/**
 * Display success message
 */
function displaySuccessMessage() {
  console.log('\n' + colorize('═'.repeat(60), 'green'));
  console.log(colorize('  🎉 DEPLOYMENT COMPLETE!', 'green'));
  console.log(colorize('═'.repeat(60), 'green'));

  console.log(colorize(`\nYour CALOS platform is now live!\n`, 'cyan'));

  console.log(colorize('Next steps:', 'yellow'));
  console.log(colorize('  1. Visit your deployment URL', 'white'));
  console.log(colorize('  2. Configure your domain (if needed)', 'white'));
  console.log(colorize('  3. Set up SSL/HTTPS', 'white'));
  console.log(colorize('  4. Configure webhooks', 'white'));

  console.log(colorize('\n  Need help? Contact: matt@soulfra.com\n', 'dim'));
}

// Run the deployment
main();

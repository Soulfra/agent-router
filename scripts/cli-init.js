#!/usr/bin/env node

/**
 * CALOS CLI Initialization Script
 *
 * Auto-provisions a test account with free credits ($0.05 = ~50 API calls)
 * Similar to Stripe, Vercel, Railway - instant setup with no signup friction
 *
 * Usage:
 *   node scripts/cli-init.js
 *   npm run init
 *
 * This script:
 * 1. Prompts for email (or uses --email flag)
 * 2. Calls /api/provision/init to create account
 * 3. Saves API key to ~/.calos/credentials
 * 4. Displays test key and next steps
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');
const http = require('http');

// Configuration
const CONFIG_DIR = path.join(require('os').homedir(), '.calos');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials');
const DEFAULT_API_URL = process.env.CALOS_API_URL || 'http://localhost:3000';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logBox(title, content) {
  const width = 70;
  const border = '═'.repeat(width);

  console.log(`\n${colors.bright}${colors.cyan}╔${border}╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║${colors.reset} ${colors.bright}${title.padEnd(width - 2)}${colors.reset} ${colors.bright}${colors.cyan}║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╠${border}╣${colors.reset}`);

  content.forEach(line => {
    console.log(`${colors.bright}${colors.cyan}║${colors.reset} ${line.padEnd(width - 2)} ${colors.bright}${colors.cyan}║${colors.reset}`);
  });

  console.log(`${colors.bright}${colors.cyan}╚${border}╝${colors.reset}\n`);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    email: null,
    name: null,
    organization: null,
    apiUrl: DEFAULT_API_URL,
    force: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--email':
      case '-e':
        options.email = nextArg;
        i++;
        break;
      case '--name':
      case '-n':
        options.name = nextArg;
        i++;
        break;
      case '--org':
      case '-o':
        options.organization = nextArg;
        i++;
        break;
      case '--api-url':
        options.apiUrl = nextArg;
        i++;
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
${colors.bright}CALOS CLI Initialization${colors.reset}

Auto-provisions a test account with free credits ($0.05 = ~50 API calls)

${colors.bright}Usage:${colors.reset}
  node scripts/cli-init.js [options]
  npm run init [-- options]

${colors.bright}Options:${colors.reset}
  -e, --email <email>          Your email address
  -n, --name <name>            Your name (optional)
  -o, --org <organization>     Organization name (optional)
  --api-url <url>              CALOS API URL (default: http://localhost:3000)
  -f, --force                  Force re-initialization even if already setup
  -h, --help                   Show this help message

${colors.bright}Examples:${colors.reset}
  node scripts/cli-init.js --email dev@example.com
  npm run init -- --email dev@example.com --name "John Doe"

${colors.bright}What happens:${colors.reset}
  1. Creates a new CALOS tenant account
  2. Generates a test API key (sk-tenant-xxx)
  3. Adds $0.05 in free credits (~50 API calls)
  4. Saves credentials to ~/.calos/credentials
  5. You can start making API calls immediately!

${colors.bright}After setup:${colors.reset}
  • Set environment variable: CALOS_API_KEY=sk-tenant-xxx
  • Or import credentials: require('~/.calos/credentials')
  • Upgrade to paid tier for more credits: npm run upgrade
`);
}

// Prompt user for input
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(`${colors.cyan}${question}${colors.reset} `, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Make HTTP/HTTPS request
function makeRequest(url, options, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      requestOptions.headers['Content-Type'] = 'application/json';
      requestOptions.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = protocol.request(requestOptions, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (error) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Check if already initialized
function checkExistingCredentials() {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
      return credentials;
    } catch (error) {
      return null;
    }
  }
  return null;
}

// Save credentials to file
function saveCredentials(data) {
  // Ensure config directory exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const credentials = {
    email: data.email,
    tenant_id: data.tenant_id,
    tenant_name: data.tenant_name,
    api_key: data.api_key,
    api_key_prefix: data.api_key_prefix,
    subscription_tier: data.subscription_tier,
    credits_dollars: data.credits_dollars,
    created_at: new Date().toISOString()
  };

  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), 'utf8');
  fs.chmodSync(CREDENTIALS_FILE, 0o600); // Read/write for owner only

  return CREDENTIALS_FILE;
}

// Main initialization flow
async function init() {
  const options = parseArgs();

  logBox('🚀 CALOS CLI Initialization', [
    'Welcome to CALOS - The Multi-LLM Router Platform',
    'Let\'s set up your test account with free credits!'
  ]);

  // Check for existing credentials
  const existing = checkExistingCredentials();
  if (existing && !options.force) {
    log('\n⚠️  You already have CALOS credentials set up:', 'yellow');
    log(`   Email: ${existing.email}`, 'yellow');
    log(`   API Key: ${existing.api_key_prefix}...`, 'yellow');
    log(`   Credentials: ${CREDENTIALS_FILE}`, 'yellow');
    log('\nTo re-initialize, use --force flag', 'yellow');
    log('To view your key: cat ~/.calos/credentials\n', 'yellow');
    process.exit(0);
  }

  // Get email if not provided
  if (!options.email) {
    options.email = await prompt('📧 Enter your email address:');
  }

  if (!options.email) {
    log('❌ Email is required', 'red');
    process.exit(1);
  }

  // Optional: get name
  if (!options.name) {
    const name = await prompt('👤 Your name (optional, press Enter to skip):');
    if (name) options.name = name;
  }

  // Optional: get organization
  if (!options.organization) {
    const org = await prompt('🏢 Organization name (optional, press Enter to skip):');
    if (org) options.organization = org;
  }

  log('\n⏳ Provisioning your test account...', 'cyan');

  try {
    // Call provision API
    const response = await makeRequest(
      `${options.apiUrl}/api/provision/init`,
      { method: 'POST' },
      {
        email: options.email,
        name: options.name,
        organization: options.organization,
        source: 'cli'
      }
    );

    if (response.status !== 201 && response.status !== 200) {
      log(`\n❌ Provisioning failed: ${response.data.error || 'Unknown error'}`, 'red');
      if (response.data.details) {
        log(`   Details: ${response.data.details}`, 'red');
      }
      process.exit(1);
    }

    const data = response.data.data;

    // Save credentials
    const credentialsPath = saveCredentials(data);

    // Display success
    logBox('✅ Success! Your Test Account is Ready', [
      '',
      `📧 Email:              ${data.email}`,
      `🏢 Organization:       ${data.tenant_name}`,
      `🔑 API Key:            ${data.api_key}`,
      `💰 Free Credits:       $${data.credits_dollars} (~${data.estimated_calls} API calls)`,
      `📊 Subscription Tier:  ${data.subscription_tier}`,
      '',
      `🔒 Credentials saved to: ${credentialsPath}`
    ]);

    log(`\n${colors.bright}${colors.green}🎉 Next Steps:${colors.reset}\n`);
    log('1. Set your API key as an environment variable:', 'green');
    log(`   ${colors.bright}export CALOS_API_KEY="${data.api_key}"${colors.reset}`, 'cyan');
    log('   Or add to your .env file\n', 'green');

    log('2. Start making API calls:', 'green');
    log(`   ${colors.bright}curl ${options.apiUrl}/api/chat \\${colors.reset}`, 'cyan');
    log(`     ${colors.bright}-H "Authorization: Bearer ${data.api_key_prefix}..." \\${colors.reset}`, 'cyan');
    log(`     ${colors.bright}-H "Content-Type: application/json" \\${colors.reset}`, 'cyan');
    log(`     ${colors.bright}-d '{"model": "gpt-4", "messages": [...]}'${colors.reset}\n`, 'cyan');

    log('3. Check your credit balance:', 'green');
    log(`   ${colors.bright}curl ${options.apiUrl}/api/credits/balance \\${colors.reset}`, 'cyan');
    log(`     ${colors.bright}-H "Authorization: Bearer ${data.api_key}"${colors.reset}\n`, 'cyan');

    log('4. When you need more credits, upgrade your tier:', 'green');
    log(`   ${colors.bright}Visit: ${options.apiUrl}/dashboard${colors.reset}`, 'cyan');
    log(`   ${colors.bright}Or API: POST ${options.apiUrl}/api/subscriptions/create${colors.reset}\n`, 'cyan');

    log(`${colors.bright}${colors.yellow}⚠️  Important:${colors.reset}`, 'yellow');
    log('   • Your API key is shown only once - save it securely!', 'yellow');
    log('   • Free tier includes $0.05 (~50 calls) - upgrade for more', 'yellow');
    log(`   • Read docs: ${options.apiUrl}/docs\n`, 'yellow');

  } catch (error) {
    log(`\n❌ Error during provisioning: ${error.message}`, 'red');
    log('   Make sure the CALOS server is running:', 'red');
    log(`   ${options.apiUrl}\n`, 'red');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  init().catch(error => {
    log(`\n❌ Unexpected error: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { init, parseArgs, saveCredentials, checkExistingCredentials };

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

/**
 * Setup Detection Script
 *
 * Checks if API keys are configured and prompts user to run setup if not.
 * Runs automatically after npm install via postinstall hook.
 *
 * Environment Detection:
 * - Skips in CI environments (CI=true)
 * - Skips in production deployments (NODE_ENV=production)
 * - Skips in global installs (npm_config_global=true)
 * - Skips in Docker containers (checks /.dockerenv)
 * - Skips when installed as dependency (different working directory)
 * - Skips with manual flag (SKIP_SETUP_CHECK=1)
 *
 * To disable setup prompt:
 *   export SKIP_SETUP_CHECK=1
 *   npm install
 */

const REQUIRED_PROVIDERS = ['openai', 'anthropic'];
const ENV_PATH = path.join(__dirname, '..', '.env');
const DB_PATH = path.join(__dirname, '..', 'data', 'router.db');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkEnvKeys() {
  if (!fs.existsSync(ENV_PATH)) {
    return { hasKeys: false, source: 'none' };
  }

  const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
  const lines = envContent.split('\n');

  const foundKeys = {};
  for (const provider of REQUIRED_PROVIDERS) {
    const envVarName = `${provider.toUpperCase()}_API_KEY`;
    const line = lines.find(l => l.startsWith(`${envVarName}=`));
    if (line) {
      const value = line.split('=')[1]?.trim();
      foundKeys[provider] = value && value.length > 0 && value !== '""' && value !== "''";
    } else {
      foundKeys[provider] = false;
    }
  }

  const hasAnyKeys = Object.values(foundKeys).some(v => v);
  return {
    hasKeys: hasAnyKeys,
    source: 'env',
    providers: foundKeys
  };
}

function checkDatabaseKeys() {
  if (!fs.existsSync(DB_PATH)) {
    return { hasKeys: false, source: 'none' };
  }

  try {
    const db = new Database(DB_PATH, { readonly: true });

    // Check if keyring table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='keyring'"
    ).get();

    if (!tableExists) {
      db.close();
      return { hasKeys: false, source: 'none' };
    }

    // Check for system-level API keys
    const foundKeys = {};
    for (const provider of REQUIRED_PROVIDERS) {
      const key = db.prepare(
        "SELECT * FROM keyring WHERE provider = ? AND credential_type = 'api_key' AND (tenant_id IS NULL OR tenant_id = 'system')"
      ).get(provider);
      foundKeys[provider] = !!key;
    }

    db.close();

    const hasAnyKeys = Object.values(foundKeys).some(v => v);
    return {
      hasKeys: hasAnyKeys,
      source: 'database',
      providers: foundKeys
    };
  } catch (error) {
    // Database error - treat as no keys
    return { hasKeys: false, source: 'none', error: error.message };
  }
}

function showSetupPrompt() {
  console.log('');
  log('╔══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║                                                              ║', 'cyan');
  log('║           🚀 CALOS Agent Router Setup Required 🚀            ║', 'cyan');
  log('║                                                              ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════════╝', 'cyan');
  console.log('');

  log('No API keys detected. The router needs API keys to function.', 'yellow');
  console.log('');

  log('Choose a setup option:', 'bright');
  console.log('');

  log('  1️⃣  Interactive Setup Wizard (Recommended)', 'green');
  log('     → Full configuration with prompts', 'reset');
  log('     → Command: npm run setup', 'blue');
  console.log('');

  log('  2️⃣  Quick Start (Free Credits)', 'green');
  log('     → Auto-provision test account with $0.05 credits', 'reset');
  log('     → Command: npm run init', 'blue');
  console.log('');

  log('  3️⃣  Manual Setup', 'green');
  log('     → Store platform API keys', 'reset');
  log('     → Command: node scripts/store-system-keys.js', 'blue');
  console.log('');

  log('  4️⃣  Web Setup', 'green');
  log('     → Start server and visit: http://localhost:5001/setup.html', 'reset');
  log('     → Command: npm start', 'blue');
  console.log('');

  log('Need help? Check the docs:', 'yellow');
  log('  → README.md', 'reset');
  log('  → docs/SETUP.md', 'reset');
  console.log('');
}

function showKeysConfigured(result) {
  console.log('');
  log('✓ API keys configured', 'green');
  log(`  Source: ${result.source}`, 'reset');

  if (result.providers) {
    log('  Providers:', 'reset');
    for (const [provider, hasKey] of Object.entries(result.providers)) {
      const status = hasKey ? '✓' : '✗';
      const color = hasKey ? 'green' : 'red';
      log(`    ${status} ${provider}`, color);
    }
  }
  console.log('');
}

/**
 * Cross-platform Docker detection
 * Works on Unix, Linux, Windows, and WSL
 */
function isDockerEnvironment() {
  // Unix/Linux: /.dockerenv file
  if (fs.existsSync('/.dockerenv')) {
    return true;
  }

  // Windows: C:\.containerenv or similar
  if (process.platform === 'win32' && fs.existsSync('C:\\.containerenv')) {
    return true;
  }

  // Universal: Environment variable set by Docker
  if (process.env.DOCKER_CONTAINER === 'true') {
    return true;
  }

  // Check /proc/1/cgroup for docker (Linux)
  try {
    if (fs.existsSync('/proc/1/cgroup')) {
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
      if (cgroup.includes('docker') || cgroup.includes('containerd')) {
        return true;
      }
    }
  } catch (e) {
    // Ignore read errors
  }

  return false;
}

/**
 * Cross-platform check if installed as dependency
 * Uses path.relative() to handle mixed path separators
 */
function isInstalledAsDependency() {
  const packageRoot = path.resolve(__dirname, '..');
  const cwd = process.cwd();

  // Same directory = not a dependency
  if (packageRoot === cwd) {
    return false;
  }

  // Use path.relative for cross-platform path comparison
  const rel = path.relative(packageRoot, cwd);

  // If relative path starts with '..' or is absolute, we're outside package
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return false; // Inside package subdirectory
  }

  return true; // Outside package = installed as dependency
}

/**
 * Check if terminal supports color output
 * Handles Windows Command Prompt, PowerShell, and Unix terminals
 */
function supportsColor() {
  // Force color if explicitly requested
  if (process.env.FORCE_COLOR) {
    return true;
  }

  // No TTY = no color
  if (!process.stdout.isTTY) {
    return false;
  }

  // Windows-specific checks
  if (process.platform === 'win32') {
    // Windows Terminal supports color
    if (process.env.WT_SESSION) {
      return true;
    }
    // Check if ConEmu or other color-capable terminal
    if (process.env.ConEmuANSI === 'ON') {
      return true;
    }
    // Dumb terminal = no color
    if (process.env.TERM === 'dumb') {
      return false;
    }
  }

  // Unix/Mac - assume color support
  return true;
}

function shouldSkipSetup() {
  // CI environment
  if (process.env.CI) {
    return true;
  }

  // Manual skip flag
  if (process.env.SKIP_SETUP_CHECK) {
    return true;
  }

  // Global npm install
  if (process.env.npm_config_global === 'true') {
    return true;
  }

  // Production environment
  if (process.env.NODE_ENV === 'production') {
    return true;
  }

  // Docker environment (cross-platform)
  if (isDockerEnvironment()) {
    return true;
  }

  // Installed as dependency (cross-platform path check)
  if (isInstalledAsDependency()) {
    return true;
  }

  // Non-interactive terminal (but only check this after other conditions)
  // This allows the script to run in local dev even without TTY
  // The setup prompt will handle non-interactive gracefully
  if (!process.stdout.isTTY && process.env.npm_lifecycle_event === 'install') {
    // Only skip on TTY check if we're in an npm install lifecycle
    // and it's likely automated (not local dev)
    return true;
  }

  return false;
}

function main() {
  // Skip setup check if not in appropriate context
  if (shouldSkipSetup()) {
    return;
  }

  // Check .env first
  const envResult = checkEnvKeys();
  if (envResult.hasKeys) {
    showKeysConfigured(envResult);
    return;
  }

  // Check database keyring
  const dbResult = checkDatabaseKeys();
  if (dbResult.hasKeys) {
    showKeysConfigured(dbResult);
    return;
  }

  // No keys found - show setup prompt
  showSetupPrompt();
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { checkEnvKeys, checkDatabaseKeys };

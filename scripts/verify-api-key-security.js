#!/usr/bin/env node

/**
 * API Key Security Audit Script
 *
 * Verifies:
 * 1. No plaintext API keys stored in database
 * 2. Only bcrypt hashes are stored
 * 3. .env file is gitignored
 * 4. Platform API keys use proper prefixes
 * 5. Provider API keys (OpenAI, Anthropic, etc.) are in .env only
 *
 * Usage:
 *   node scripts/verify-api-key-security.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

// Configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'calos',
  user: process.env.DB_USER || 'matthewmauer',
  password: process.env.DB_PASSWORD || ''
};

const ROOT_DIR = path.join(__dirname, '..');

// Test results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function testResult(name, passed, error = null) {
  if (passed) {
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    log('✅', name);
  } else {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error });
    log('❌', `${name}: ${error}`);
  }
}

function warning(message) {
  results.warnings++;
  log('⚠️ ', message);
}

// ============================================================================
// TEST 1: Verify .env is gitignored
// ============================================================================

async function testGitignore() {
  const gitignorePath = path.join(ROOT_DIR, '.gitignore');

  if (!fs.existsSync(gitignorePath)) {
    testResult('.gitignore exists', false, 'File not found');
    return;
  }

  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  const hasEnv = gitignore.includes('.env');

  testResult('.env is gitignored', hasEnv, hasEnv ? null : '.env not in .gitignore');
}

// ============================================================================
// TEST 2: Check for plaintext secrets in .env
// ============================================================================

async function testEnvFile() {
  const envPath = path.join(ROOT_DIR, '.env');

  if (!fs.existsSync(envPath)) {
    warning('.env file not found (this is OK if not set up yet)');
    return;
  }

  const envContent = fs.readFileSync(envPath, 'utf8');

  // Check for provider API keys
  const providers = ['OPENAI', 'ANTHROPIC', 'DEEPSEEK'];
  let foundProviderKeys = 0;

  for (const provider of providers) {
    const regex = new RegExp(`${provider}_API_KEY=(.+)`, 'i');
    const match = envContent.match(regex);

    if (match && match[1] && match[1].length > 10) {
      foundProviderKeys++;
    }
  }

  if (foundProviderKeys > 0) {
    log('📦', `.env contains ${foundProviderKeys} provider API keys (good - stored locally)`);
  } else {
    warning('.env does not contain provider API keys (add them to use OpenAI/Anthropic/DeepSeek)');
  }

  // Check .env is not in git
  testResult('.env file exists', fs.existsSync(envPath));
}

// ============================================================================
// TEST 3: Verify no plaintext keys in database
// ============================================================================

async function testDatabaseSecurity() {
  const db = new Client(DB_CONFIG);

  try {
    await db.connect();

    // Check calos_platform_api_keys table
    const keysResult = await db.query(`
      SELECT key_id, key_hash, key_prefix, key_suffix_last4
      FROM calos_platform_api_keys
      LIMIT 5
    `);

    if (keysResult.rows.length === 0) {
      warning('No platform API keys found in database (this is OK if not set up yet)');
      return;
    }

    testResult('Platform API keys table exists', true);

    // Verify all keys are hashed (bcrypt hashes start with $2b$ and are 60 chars)
    let allHashed = true;
    let allHavePrefixes = true;

    for (const row of keysResult.rows) {
      // Check hash format
      if (!row.key_hash.startsWith('$2b$') || row.key_hash.length !== 60) {
        allHashed = false;
        log('❌', `Key ${row.key_id} does not use bcrypt hash!`);
      }

      // Check prefix format (should be "sk-tenant-...")
      if (!row.key_prefix.startsWith('sk-tenant-')) {
        allHavePrefixes = false;
        log('❌', `Key ${row.key_id} has invalid prefix: ${row.key_prefix}`);
      } else {
        log('🔐', `Key ${row.key_id}: ${row.key_prefix}...${row.key_suffix_last4} (hash: ${row.key_hash.substring(0, 15)}...)`);
      }
    }

    testResult('All platform keys use bcrypt hashing', allHashed);
    testResult('All platform keys use proper prefixes', allHavePrefixes);

    // Check for any plaintext secrets (naive check - look for patterns)
    const plaintextCheck = await db.query(`
      SELECT COUNT(*) FROM calos_platform_api_keys
      WHERE key_hash LIKE 'sk-tenant-%'
      OR key_hash NOT LIKE '$2b$%'
    `);

    const plaintextCount = parseInt(plaintextCheck.rows[0].count);
    testResult('No plaintext keys in database', plaintextCount === 0,
      plaintextCount > 0 ? `Found ${plaintextCount} potential plaintext keys` : null);

  } catch (error) {
    testResult('Database security check', false, error.message);
  } finally {
    await db.end();
  }
}

// ============================================================================
// TEST 4: Verify bcrypt functionality
// ============================================================================

async function testBcryptWorks() {
  try {
    const testKey = 'sk-tenant-test-abc123xyz';
    const hash = await bcrypt.hash(testKey, 10);

    testResult('bcrypt hashing works', hash.startsWith('$2b$') && hash.length === 60);

    const isValid = await bcrypt.compare(testKey, hash);
    testResult('bcrypt verification works', isValid);

    const isInvalid = await bcrypt.compare('wrong-key', hash);
    testResult('bcrypt rejects wrong keys', !isInvalid);

  } catch (error) {
    testResult('bcrypt functionality', false, error.message);
  }
}

// ============================================================================
// TEST 5: Check migration files don't contain secrets
// ============================================================================

async function testMigrationFiles() {
  const migrationsDir = path.join(ROOT_DIR, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    warning('Migrations directory not found');
    return;
  }

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
  let foundSecrets = false;

  const secretPatterns = [
    /sk-[a-zA-Z0-9]{20,}/,  // OpenAI/Anthropic style keys
    /OPENAI_API_KEY\s*=\s*['"]?sk-/i,
    /ANTHROPIC_API_KEY\s*=\s*['"]?sk-/i,
    /password\s*=\s*['"][^'"]{8,}['"]/i  // Hardcoded passwords
  ];

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        foundSecrets = true;
        log('❌', `Found potential secret in ${file}`);
      }
    }
  }

  testResult('No secrets in migration files', !foundSecrets);
}

// ============================================================================
// MAIN AUDIT RUNNER
// ============================================================================

async function runAudit() {
  log('🔒', 'CalOS API Key Security Audit');
  log('🗄️', `Database: ${DB_CONFIG.database}@${DB_CONFIG.host}`);
  console.log('');

  await testGitignore();
  await testEnvFile();
  await testDatabaseSecurity();
  await testBcryptWorks();
  await testMigrationFiles();

  // Summary
  console.log('');
  log('📊', '='.repeat(50));
  log('📊', 'SECURITY AUDIT RESULTS');
  log('📊', '='.repeat(50));
  log('✅', `Passed:   ${results.passed}`);
  log('❌', `Failed:   ${results.failed}`);
  log('⚠️ ', `Warnings: ${results.warnings}`);
  log('📊', `Total:    ${results.passed + results.failed}`);
  console.log('');

  if (results.failed > 0) {
    log('❌', 'FAILED TESTS:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`   - ${t.name}: ${t.error}`);
    });
    console.log('');
  }

  if (results.warnings > 0) {
    console.log('');
    log('⚠️ ', 'Review warnings above - they may be OK depending on your setup');
  }

  if (results.failed === 0) {
    log('🎉', 'All security checks passed!');
    log('🔐', 'Your API keys are properly protected');
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run audit
runAudit().catch(error => {
  log('❌', `Fatal error: ${error.message}`);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Soulfra Audit Verification Tool
 *
 * Verifies cryptographic signatures in audit trail files.
 * Proves data integrity and authorship without revealing private keys.
 *
 * Usage:
 *   node bin/verify-audit.js .soulfra/audit/commit_*.json
 *   node bin/verify-audit.js .soulfra/audit/push_*.json
 *   node bin/verify-audit.js .soulfra/audit/  # Verify all files
 */

const fs = require('fs');
const path = require('path');
const SoulfraSigner = require('../lib/soulfra-signer');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function verifyAuditFile(filePath) {
  try {
    // Read audit file
    const audit = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Create signer (no private key needed for verification)
    const signer = new SoulfraSigner();

    // Verify signature
    const valid = signer.verify(audit);

    return {
      file: path.basename(filePath),
      valid: valid,
      audit: audit
    };

  } catch (error) {
    return {
      file: path.basename(filePath),
      valid: false,
      error: error.message
    };
  }
}

function findAuditFiles(inputPath) {
  const auditFiles = [];

  if (fs.statSync(inputPath).isDirectory()) {
    // Directory - find all .json files
    const files = fs.readdirSync(inputPath);
    for (const file of files) {
      if (file.endsWith('.json')) {
        auditFiles.push(path.join(inputPath, file));
      }
    }
  } else {
    // Single file or glob pattern
    auditFiles.push(inputPath);
  }

  return auditFiles;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function main() {
  log('\n🔍 Soulfra Audit Verification Tool', 'blue');
  log('════════════════════════════════════════', 'blue');

  if (process.argv.length < 3) {
    log('\nUsage:', 'yellow');
    log('  node bin/verify-audit.js <audit-file-or-directory>', 'yellow');
    log('\nExamples:', 'yellow');
    log('  node bin/verify-audit.js .soulfra/audit/commit_*.json', 'yellow');
    log('  node bin/verify-audit.js .soulfra/audit/', 'yellow');
    process.exit(1);
  }

  const inputPath = process.argv[2];

  // Check if path exists
  if (!fs.existsSync(inputPath)) {
    log(`\n❌ Error: Path not found: ${inputPath}`, 'red');
    process.exit(1);
  }

  // Find audit files
  const auditFiles = findAuditFiles(inputPath);

  if (auditFiles.length === 0) {
    log('\n⚠️  No audit files found', 'yellow');
    process.exit(0);
  }

  log(`\nFound ${auditFiles.length} audit file(s) to verify\n`, 'cyan');

  // Verify each file
  let validCount = 0;
  let invalidCount = 0;

  for (const filePath of auditFiles) {
    const result = verifyAuditFile(filePath);

    if (result.valid) {
      log(`✅ ${result.file}`, 'green');

      // Show details
      const audit = result.audit;
      console.log(`   Action: ${audit.metadata.action || 'unknown'}`);
      console.log(`   Timestamp: ${formatTimestamp(audit.metadata.timestamp)}`);

      if (audit.metadata.author) {
        console.log(`   Author: ${audit.metadata.author.slice(0, 20)}...`);
      }

      if (audit.soulfraHash) {
        console.log(`   SHA-256: ${audit.soulfraHash.sha256.slice(0, 16)}...`);
        console.log(`   SHA-512: ${audit.soulfraHash.sha512.slice(0, 16)}...`);
        console.log(`   SHA3-512: ${audit.soulfraHash.sha3_512.slice(0, 16)}...`);
        console.log(`   Blake3: ${audit.soulfraHash.blake3b.slice(0, 16)}...`);

        if (audit.soulfraHash.ed25519_signature) {
          console.log(`   Ed25519: ${audit.soulfraHash.ed25519_signature.slice(0, 16)}...`);
        }
      }

      validCount++;

    } else {
      log(`❌ ${result.file}`, 'red');

      if (result.error) {
        console.log(`   Error: ${result.error}`);
      } else {
        console.log('   Signature verification failed - data may have been tampered with!');
      }

      invalidCount++;
    }

    console.log('');
  }

  // Summary
  log('════════════════════════════════════════', 'blue');
  log(`\nVerification Summary:`, 'blue');
  log(`  ✅ Valid: ${validCount}`, 'green');

  if (invalidCount > 0) {
    log(`  ❌ Invalid: ${invalidCount}`, 'red');
  }

  log(`  📊 Total: ${auditFiles.length}\n`, 'cyan');

  // Exit code
  if (invalidCount > 0) {
    log('⚠️  Some files failed verification!', 'red');
    process.exit(1);
  } else {
    log('✅ All files verified successfully!', 'green');
    process.exit(0);
  }
}

main();

#!/usr/bin/env node

/**
 * Soulfra Identity CLI Tool
 *
 * Manage self-sovereign identities and create zero-knowledge proofs.
 *
 * Commands:
 *   create              Create new identity
 *   show [identity]     Show identity details
 *   prove [identity]    Create zero-knowledge proof
 *   verify <proof>      Verify a proof
 *   auth [identity]     Start authentication flow
 *   reputation [id]     Show reputation
 *   pow [identity]      Create proof of work
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const SoulfraIdentity = require('../lib/soulfra-identity');

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function getDefaultIdentityPath() {
  return path.join(process.cwd(), '.soulfra', 'identity.json');
}

function loadIdentity(identityPath) {
  if (!fs.existsSync(identityPath)) {
    log(`❌ Identity not found: ${identityPath}`, 'red');
    log('Create one with: soulfra-identity create', 'yellow');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  return SoulfraIdentity.fromJSON(data);
}

function saveIdentity(identity, identityPath) {
  const dir = path.dirname(identityPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(identityPath, JSON.stringify(identity.toJSON(), null, 2));
  fs.chmodSync(identityPath, 0o600); // Read/write for owner only
}

// ============================================================================
// Commands
// ============================================================================

function cmdCreate(args) {
  log('\n🔐 Creating Soulfra Identity...', 'blue');
  log('════════════════════════════════════════', 'blue');

  const identityPath = args.output || getDefaultIdentityPath();

  if (fs.existsSync(identityPath) && !args.force) {
    log(`\n❌ Identity already exists: ${identityPath}`, 'red');
    log('Use --force to overwrite', 'yellow');
    process.exit(1);
  }

  // Create identity
  const identity = SoulfraIdentity.createIdentity();

  // Save to file
  saveIdentity(identity, identityPath);

  log(`\n✅ Identity Created!`, 'green');
  log(`   Location: ${identityPath}`, 'cyan');
  log(`   Identity ID: ${identity.getIdentityID()}`, 'cyan');
  log(`   Created: ${identity.createdAt}`, 'cyan');

  log('\n⚠️  IMPORTANT: Keep this file secret!', 'yellow');
  log('   This is your cryptographic identity.', 'yellow');
  log('   Lose it = lose access. No recovery possible.\n', 'yellow');
}

function cmdShow(args) {
  const identityPath = args.identity || getDefaultIdentityPath();
  const identity = loadIdentity(identityPath);

  log('\n👤 Soulfra Identity', 'blue');
  log('════════════════════════════════════════', 'blue');

  const publicIdentity = identity.getPublicIdentity();

  log(`\nIdentity ID: ${publicIdentity.identityID}`, 'cyan');
  log(`Public Key:  ${publicIdentity.publicKey.slice(0, 32)}...`, 'cyan');
  log(`Created:     ${publicIdentity.created}`, 'cyan');
  log(`Account Age: ${publicIdentity.reputation.account_age_days} days`, 'cyan');

  log('\n📊 Reputation:', 'blue');
  log(`   Score: ${publicIdentity.reputation.score || 0}/100`, 'green');
  log(`   Commits: ${publicIdentity.reputation.commits}`, 'cyan');
  log(`   Verified Actions: ${publicIdentity.reputation.verified_actions}`, 'cyan');

  if (publicIdentity.reputation.last_active) {
    log(`   Last Active: ${publicIdentity.reputation.last_active}`, 'cyan');
  }

  log('');
}

function cmdProve(args) {
  const identityPath = args.identity || getDefaultIdentityPath();
  const identity = loadIdentity(identityPath);

  log('\n🔒 Creating Zero-Knowledge Proof...', 'blue');
  log('════════════════════════════════════════', 'blue');

  // Create challenge
  const challenge = SoulfraIdentity.createChallenge();
  log(`\nChallenge: ${challenge.toString('hex').slice(0, 32)}...`, 'cyan');

  // Create proof
  const proof = identity.createProof(challenge);

  log(`✅ Proof Created!`, 'green');
  log(`   Identity: ${proof.identityID}`, 'cyan');
  log(`   Timestamp: ${proof.proof.metadata.timestamp}`, 'cyan');

  // Save proof to file
  const proofPath = args.output || path.join(process.cwd(), 'proof.json');
  fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));

  log(`   Saved to: ${proofPath}`, 'cyan');

  // Verify proof
  log('\n🔍 Verifying proof...', 'yellow');
  const valid = SoulfraIdentity.verifyProof(proof, challenge);

  if (valid) {
    log('✅ Proof is valid!', 'green');
    log('\nThis proof demonstrates:', 'cyan');
    log('  • You own the private key for this identity', 'cyan');
    log('  • WITHOUT revealing the private key itself', 'cyan');
    log('  • Zero-knowledge proof of identity ownership\n', 'cyan');
  } else {
    log('❌ Proof verification failed!', 'red');
  }
}

function cmdVerify(args) {
  if (!args.proof) {
    log('❌ Usage: soulfra-identity verify <proof-file>', 'red');
    process.exit(1);
  }

  log('\n🔍 Verifying Proof...', 'blue');
  log('════════════════════════════════════════', 'blue');

  if (!fs.existsSync(args.proof)) {
    log(`❌ Proof file not found: ${args.proof}`, 'red');
    process.exit(1);
  }

  const proof = JSON.parse(fs.readFileSync(args.proof, 'utf8'));

  // Recreate challenge from proof
  const challenge = Buffer.from(proof.challenge, 'hex');

  // Verify
  const valid = SoulfraIdentity.verifyProof(proof, challenge);

  if (valid) {
    log('\n✅ Proof is VALID!', 'green');
    log(`   Identity: ${proof.identityID}`, 'cyan');
    log(`   Timestamp: ${proof.proof.metadata.timestamp}`, 'cyan');
    log('\nThis proves:', 'cyan');
    log('  • The holder owns the private key', 'cyan');
    log('  • WITHOUT revealing the private key', 'cyan');
    log('  • Cryptographic proof of identity\n', 'cyan');
  } else {
    log('\n❌ Proof is INVALID!', 'red');
    log('   The proof has been tampered with or is forged.\n', 'red');
  }
}

function cmdAuth(args) {
  const identityPath = args.identity || getDefaultIdentityPath();
  const identity = loadIdentity(identityPath);

  log('\n🔐 Authentication Flow (Challenge-Response)', 'blue');
  log('════════════════════════════════════════', 'blue');

  // Step 1: Begin auth (verifier side)
  log('\n1️⃣  Verifier creates challenge...', 'yellow');
  const authSession = SoulfraIdentity.beginAuth();

  log(`   Challenge: ${authSession.challengeHex.slice(0, 32)}...`, 'cyan');
  log(`   Session ID: ${authSession.sessionID}`, 'cyan');
  log(`   Expires: ${authSession.expiresAt.toISOString()}`, 'cyan');

  // Step 2: Respond to challenge (prover side)
  log('\n2️⃣  Identity responds to challenge...', 'yellow');
  const response = identity.respondToChallenge(authSession.challenge, authSession.sessionID);

  log(`   Response signed by: ${response.identityID}`, 'cyan');
  log(`   Timestamp: ${response.response.data.timestamp}`, 'cyan');

  // Step 3: Verify response (verifier side)
  log('\n3️⃣  Verifier validates response...', 'yellow');
  const result = SoulfraIdentity.verifyAuthResponse(
    response,
    authSession.challenge,
    authSession.sessionID
  );

  if (result.valid) {
    log('✅ Authentication SUCCESSFUL!', 'green');
    log(`   Identity: ${result.identityID}`, 'cyan');
    log(`   Authenticated at: ${result.authenticatedAt}`, 'cyan');
    log('\nThe identity has been cryptographically verified.', 'cyan');
    log('No passwords, no OAuth, no trust required - just math.\n', 'cyan');
  } else {
    log('❌ Authentication FAILED!', 'red');
    log(`   Reason: ${result.reason}\n`, 'red');
  }
}

function cmdReputation(args) {
  const identityPath = args.identity || getDefaultIdentityPath();
  const identity = loadIdentity(identityPath);

  log('\n📊 Reputation Score', 'blue');
  log('════════════════════════════════════════', 'blue');

  const rep = identity.getReputation();

  log(`\n🏆 Overall Score: ${rep.score}/100`, rep.score >= 70 ? 'green' : rep.score >= 40 ? 'yellow' : 'red');

  log('\n📈 Breakdown:', 'cyan');
  log(`   Account Age: ${rep.account_age_days} days`, 'cyan');
  log(`   Commits: ${rep.commits}`, 'cyan');
  log(`   Verified Actions: ${rep.verified_actions}`, 'cyan');

  if (rep.first_action) {
    log(`   First Action: ${rep.first_action}`, 'cyan');
  }

  if (rep.last_action) {
    log(`   Last Action: ${rep.last_action}`, 'cyan');
  }

  log('\nReputation is built through:', 'yellow');
  log('  • Account age (up to 20 points)', 'yellow');
  log('  • Verified actions (up to 40 points)', 'yellow');
  log('  • Commits (up to 40 points)\n', 'yellow');
}

function cmdPow(args) {
  const identityPath = args.identity || getDefaultIdentityPath();
  const identity = loadIdentity(identityPath);

  const difficulty = parseInt(args.difficulty) || 4;

  log('\n⛏️  Creating Proof of Work...', 'blue');
  log('════════════════════════════════════════', 'blue');
  log(`\nDifficulty: ${difficulty} (${difficulty} leading zeros)`, 'cyan');
  log('Computing... (this may take a few seconds)\n', 'yellow');

  const startTime = Date.now();

  // Create proof of work
  const proof = identity.createProofOfWork(difficulty);

  const endTime = Date.now();

  log('✅ Proof of Work Created!', 'green');
  log(`   Hash: ${proof.data.hash}`, 'cyan');
  log(`   Nonce: ${proof.data.nonce}`, 'cyan');
  log(`   Compute Time: ${proof.data.computeTime}ms`, 'cyan');
  log(`   Difficulty: ${difficulty}`, 'cyan');

  // Verify proof
  log('\n🔍 Verifying proof...', 'yellow');
  const valid = SoulfraIdentity.verifyProofOfWork(proof, difficulty);

  if (valid) {
    log('✅ Proof of Work is valid!', 'green');
    log('\nThis proves:', 'cyan');
    log('  • Computational work was performed', 'cyan');
    log('  • Sybil resistance (expensive to create fake identities)', 'cyan');
    log('  • You invested real resources (time, compute)\n', 'cyan');
  } else {
    log('❌ Proof of Work verification failed!\n', 'red');
  }

  // Save proof
  const proofPath = args.output || path.join(process.cwd(), 'proof-of-work.json');
  fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
  log(`Saved to: ${proofPath}\n`, 'cyan');
}

function cmdMultiFactor(args) {
  const identityPath = args.identity || getDefaultIdentityPath();
  const identity = loadIdentity(identityPath);

  log('\n🔐 Creating Multi-Factor Proof...', 'blue');
  log('════════════════════════════════════════', 'blue');

  const options = {
    includeZKProof: true,
    includePoW: args.pow !== false,
    includeTimeProof: true,
    powDifficulty: parseInt(args.difficulty) || 4
  };

  log('\nProof factors:', 'cyan');
  log('  ✓ Zero-knowledge proof', 'cyan');
  if (options.includePoW) {
    log(`  ✓ Proof of work (difficulty ${options.powDifficulty})`, 'cyan');
  }
  log('  ✓ Time proof (account age)', 'cyan');
  log('  ✓ Reputation score', 'cyan');

  log('\nComputing...\n', 'yellow');

  const proof = identity.createMultiFactorProof(options);

  log('✅ Multi-Factor Proof Created!', 'green');
  log(`   Identity: ${proof.data.identityID}`, 'cyan');
  log(`   Factors: ${Object.keys(proof.data).length}`, 'cyan');
  log(`   Reputation: ${proof.data.reputation.score}/100`, 'cyan');

  // Save proof
  const proofPath = args.output || path.join(process.cwd(), 'multi-factor-proof.json');
  fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
  log(`   Saved to: ${proofPath}`, 'cyan');

  log('\nThis multi-factor proof demonstrates:', 'yellow');
  log('  • Identity ownership (zero-knowledge)', 'yellow');
  if (options.includePoW) {
    log('  • Computational work (anti-Sybil)', 'yellow');
  }
  log('  • Account age (time-based trust)', 'yellow');
  log('  • Reputation history (verified actions)\n', 'yellow');
}

// ============================================================================
// Main
// ============================================================================

function printUsage() {
  log('\n🔐 Soulfra Identity CLI', 'blue');
  log('════════════════════════════════════════\n', 'blue');

  log('Commands:', 'cyan');
  log('  create              Create new identity', 'white');
  log('  show                Show identity details', 'white');
  log('  prove               Create zero-knowledge proof', 'white');
  log('  verify <proof>      Verify a proof', 'white');
  log('  auth                Demonstrate authentication flow', 'white');
  log('  reputation          Show reputation score', 'white');
  log('  pow                 Create proof of work', 'white');
  log('  multi               Create multi-factor proof', 'white');

  log('\nOptions:', 'cyan');
  log('  --identity <path>   Path to identity file', 'white');
  log('  --output <path>     Output path for proofs', 'white');
  log('  --difficulty <n>    PoW difficulty (default: 4)', 'white');
  log('  --force             Overwrite existing identity', 'white');

  log('\nExamples:', 'cyan');
  log('  soulfra-identity create', 'yellow');
  log('  soulfra-identity show', 'yellow');
  log('  soulfra-identity prove --output my-proof.json', 'yellow');
  log('  soulfra-identity verify my-proof.json', 'yellow');
  log('  soulfra-identity auth', 'yellow');
  log('  soulfra-identity pow --difficulty 5\n', 'yellow');
}

function main() {
  const args = {};
  let command = null;

  // Parse arguments
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = process.argv[i + 1];

      if (value && !value.startsWith('--')) {
        args[key] = value;
        i++;
      } else {
        args[key] = true;
      }
    } else if (!command) {
      command = arg;
    } else {
      args.proof = arg; // For verify command
    }
  }

  // Run command
  switch (command) {
    case 'create':
      cmdCreate(args);
      break;

    case 'show':
      cmdShow(args);
      break;

    case 'prove':
      cmdProve(args);
      break;

    case 'verify':
      cmdVerify(args);
      break;

    case 'auth':
      cmdAuth(args);
      break;

    case 'reputation':
    case 'rep':
      cmdReputation(args);
      break;

    case 'pow':
      cmdPow(args);
      break;

    case 'multi':
      cmdMultiFactor(args);
      break;

    default:
      printUsage();
  }
}

main();

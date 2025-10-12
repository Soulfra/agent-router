# Soulfra Zero-Knowledge Identity System

**Prove you're real without revealing who you are. Self-sovereign identity. No KYC. No central authority.**

---

## 🎯 What This Is

Traditional identity systems:
- Username/password (can be stolen)
- OAuth (depends on Google/GitHub/Facebook)
- KYC (reveals personal information)
- Central authority (can revoke access)

**Soulfra Identity**:
- Cryptographic proof of personhood
- Zero-knowledge proofs (prove ownership without revealing secrets)
- Self-sovereign (you own the private key, no one else)
- No KYC (no name, email, phone, location)
- No password recovery (lose keys = lose access)
- Decentralized reputation (built through verified actions)

---

## 🔐 Core Concepts

### Self-Sovereign Identity

**You ARE the authority**. No one can:
- Revoke your identity
- Recover your account
- Access your identity without your private key
- Know who you are (just that you're a unique human)

```
Traditional: Email/Password → Platform owns your identity
OAuth: Google/GitHub → Google/GitHub owns your identity
Soulfra: Ed25519 keypair → YOU own your identity
```

### Zero-Knowledge Proofs

**Prove something is true WITHOUT revealing why it's true.**

Example:
```
Challenge: Prove you own this identity
Traditional: Show me your password (reveals secret)
Zero-Knowledge: Sign this challenge with your private key
  → Proves you have the private key
  → WITHOUT revealing the private key itself
  → Math guarantees proof is valid
```

### Proof of Personhood

**Prove you're a unique human WITHOUT revealing identity.**

Soulfra uses:
1. **Proof of Work**: Computational cost (expensive to create fake identities)
2. **Time Proofs**: Account age (new accounts have low trust)
3. **Reputation**: Verified actions over time (commits, reviews, etc.)
4. **Cryptographic Signatures**: Every action is signed and traceable

### Sybil Resistance

**Prevent one person from creating thousands of fake identities.**

Methods:
- Proof of work (each identity requires computation)
- Time-based proofs (new identities have low trust)
- Reputation scoring (built over time, can't be faked)
- Cost of creating multiple identities vs. benefit

---

## 🚀 Quick Start

### Create Your Identity

```bash
cd ~/Desktop/CALOS_ROOT/agent-router

# Create new identity
node bin/soulfra-identity.js create

# Output:
# 🔐 Creating Soulfra Identity...
# ════════════════════════════════════════
#
# ✅ Identity Created!
#    Location: .soulfra/identity.json
#    Identity ID: soulfra_a3f2d1c4b5e6f7a8
#    Created: 2025-10-12T16:00:00.000Z
#
# ⚠️  IMPORTANT: Keep this file secret!
#    This is your cryptographic identity.
#    Lose it = lose access. No recovery possible.
```

Your identity is saved to `.soulfra/identity.json`:

```json
{
  "privateKey": "MC4CAQ...",  // Ed25519 private key (KEEP SECRET!)
  "publicKey": "MCowBQ...",    // Ed25519 public key (safe to share)
  "created": "2025-10-12T16:00:00.000Z",
  "metadata": {},
  "reputation": {
    "commits": 0,
    "verified_actions": 0,
    "first_action": null,
    "last_action": null
  }
}
```

### View Your Identity

```bash
node bin/soulfra-identity.js show

# 👤 Soulfra Identity
# ════════════════════════════════════════
#
# Identity ID: soulfra_a3f2d1c4b5e6f7a8
# Public Key:  04a3f2d1c4b5e6f7a8b9c0d1e2f3a4b5...
# Created:     2025-10-12T16:00:00.000Z
# Account Age: 0 days
#
# 📊 Reputation:
#    Score: 0/100
#    Commits: 0
#    Verified Actions: 0
```

---

## 🔒 Zero-Knowledge Proofs

### Create a Proof

```bash
node bin/soulfra-identity.js prove

# 🔒 Creating Zero-Knowledge Proof...
# ════════════════════════════════════════
#
# Challenge: a3f5d2c1b4e6f7a8b9c0d1e2f3a4b5c6...
# ✅ Proof Created!
#    Identity: soulfra_a3f2d1c4b5e6f7a8
#    Timestamp: 2025-10-12T16:05:00.000Z
#    Saved to: proof.json
#
# 🔍 Verifying proof...
# ✅ Proof is valid!
#
# This proof demonstrates:
#   • You own the private key for this identity
#   • WITHOUT revealing the private key itself
#   • Zero-knowledge proof of identity ownership
```

### How It Works

```javascript
// 1. Verifier creates random challenge
const challenge = crypto.randomBytes(32);
// Challenge: a3f5d2c1b4e6f7a8b9c0d1e2f3a4b5c6...

// 2. Prover signs challenge with private key
const signature = sign(challenge, privateKey);
// Signature: 3c2d1e4f5a6b7c8d9e0f1a2b3c4d5e6f...

// 3. Verifier checks signature with public key
const valid = verify(challenge, signature, publicKey);
// Returns: true

// Result: Proved ownership WITHOUT revealing private key!
```

**What this proves**:
- ✅ You have the private key that matches this public key
- ✅ The signature is valid and unforged
- ✅ You created the signature recently (timestamp)

**What this does NOT reveal**:
- ❌ The private key itself
- ❌ Any personal information
- ❌ Previous signatures or actions

### Verify a Proof

```bash
node bin/soulfra-identity.js verify proof.json

# 🔍 Verifying Proof...
# ════════════════════════════════════════
#
# ✅ Proof is VALID!
#    Identity: soulfra_a3f2d1c4b5e6f7a8
#    Timestamp: 2025-10-12T16:05:00.000Z
#
# This proves:
#   • The holder owns the private key
#   • WITHOUT revealing the private key
#   • Cryptographic proof of identity
```

---

## 🔐 Authentication (Challenge-Response)

### Interactive Authentication Flow

```bash
node bin/soulfra-identity.js auth

# 🔐 Authentication Flow (Challenge-Response)
# ════════════════════════════════════════
#
# 1️⃣  Verifier creates challenge...
#    Challenge: a3f5d2c1b4e6f7a8...
#    Session ID: f9a8b7c6d5e4f3a2
#    Expires: 2025-10-12T16:10:00.000Z
#
# 2️⃣  Identity responds to challenge...
#    Response signed by: soulfra_a3f2d1c4b5e6f7a8
#    Timestamp: 2025-10-12T16:05:00.000Z
#
# 3️⃣  Verifier validates response...
# ✅ Authentication SUCCESSFUL!
#    Identity: soulfra_a3f2d1c4b5e6f7a8
#    Authenticated at: 2025-10-12T16:05:00.000Z
#
# The identity has been cryptographically verified.
# No passwords, no OAuth, no trust required - just math.
```

### How It Works

```
┌─────────┐                           ┌─────────┐
│ Verifier│                           │  Prover │
└────┬────┘                           └────┬────┘
     │                                     │
     │  1. Create random challenge         │
     │     challenge = randomBytes(32)     │
     │     sessionID = randomBytes(16)     │
     │─────────────────────────────────────>
     │                                     │
     │                                     │  2. Sign challenge
     │                                     │     signature = sign(challenge, privateKey)
     │<─────────────────────────────────────
     │  3. Verify signature                │
     │     valid = verify(challenge, signature, publicKey)
     │                                     │
     │  4. Check session ID & timestamp    │
     │     if (valid && !expired) {        │
     │       authenticated = true          │
     │     }                               │
     │                                     │
     └──────────────────────────────────────
```

**Security Properties**:
- ✅ No passwords (can't be stolen)
- ✅ No OAuth (no dependency on third parties)
- ✅ Replay resistant (timestamp + session ID)
- ✅ Forward secrecy (each challenge is unique)
- ✅ Zero-knowledge (private key never revealed)

---

## ⛏️ Proof of Work (Anti-Sybil)

### Create Proof of Work

```bash
node bin/soulfra-identity.js pow --difficulty 5

# ⛏️  Creating Proof of Work...
# ════════════════════════════════════════
#
# Difficulty: 5 (5 leading zeros)
# Computing... (this may take a few seconds)
#
# ✅ Proof of Work Created!
#    Hash: 000004a3f2d1c4b5e6f7a8b9c0d1e2f3...
#    Nonce: 1847562
#    Compute Time: 3247ms
#    Difficulty: 5
#
# 🔍 Verifying proof...
# ✅ Proof of Work is valid!
#
# This proves:
#   • Computational work was performed
#   • Sybil resistance (expensive to create fake identities)
#   • You invested real resources (time, compute)
#
# Saved to: proof-of-work.json
```

### How It Works

```javascript
// Goal: Find a nonce that produces hash with N leading zeros

let nonce = 0;
let hash;

while (true) {
  hash = sha256(`${identityID}:${nonce}:${timestamp}`);

  // Check if hash starts with enough zeros
  if (hash.startsWith('0'.repeat(difficulty))) {
    break; // Found it!
  }

  nonce++;
}

// For difficulty 5, might try ~2 million combinations
// Average time: ~3 seconds on modern CPU
```

**Why This Matters**:

| Difficulty | Avg Tries | Time | Use Case |
|------------|-----------|------|----------|
| 3 | ~4,000 | <1s | Lightweight verification |
| 4 | ~65,000 | ~1s | Standard verification |
| 5 | ~1,000,000 | ~3s | High security |
| 6 | ~16,000,000 | ~30s | Anti-spam |
| 7 | ~268,000,000 | ~8min | Critical operations |

**Sybil Resistance**:
- Creating 1 identity: 3 seconds
- Creating 100 fake identities: 5 minutes
- Creating 10,000 fake identities: 8 hours
- Makes mass identity creation expensive

---

## 📊 Reputation System

### View Reputation

```bash
node bin/soulfra-identity.js reputation

# 📊 Reputation Score
# ════════════════════════════════════════
#
# 🏆 Overall Score: 35/100
#
# 📈 Breakdown:
#    Account Age: 30 days
#    Commits: 12
#    Verified Actions: 45
#    First Action: 2025-09-12T10:00:00.000Z
#    Last Action: 2025-10-12T15:30:00.000Z
#
# Reputation is built through:
#   • Account age (up to 20 points)
#   • Verified actions (up to 40 points)
#   • Commits (up to 40 points)
```

### How Reputation Is Calculated

```javascript
// Account age: 5 points per month (max 20)
const ageDays = (now - created) / (1000 * 60 * 60 * 24);
const ageScore = Math.min(20, Math.floor(ageDays / 30) * 5);

// Verified actions: 2 points each (max 40)
const actionScore = Math.min(40, verifiedActions * 2);

// Commits: 1 point each (max 40)
const commitScore = Math.min(40, commits);

// Total reputation (0-100)
const reputation = ageScore + actionScore + commitScore;
```

**Example Progression**:

| Time | Actions | Commits | Score | Trust Level |
|------|---------|---------|-------|-------------|
| Day 1 | 0 | 0 | 0 | New account |
| Week 1 | 10 | 5 | 25 | Building trust |
| Month 1 | 50 | 20 | 45 | Established |
| Month 6 | 200 | 80 | 90 | Highly trusted |

**Why This Matters**:
- New accounts have low trust (prevents Sybil attacks)
- Reputation can't be faked (requires real actions over time)
- No central authority (calculated from signed actions)
- Portable (your reputation is tied to your cryptographic identity)

---

## 🔐 Multi-Factor Proof

Combine multiple proof types for maximum security.

```bash
node bin/soulfra-identity.js multi --difficulty 5

# 🔐 Creating Multi-Factor Proof...
# ════════════════════════════════════════
#
# Proof factors:
#   ✓ Zero-knowledge proof
#   ✓ Proof of work (difficulty 5)
#   ✓ Time proof (account age)
#   ✓ Reputation score
#
# Computing...
#
# ✅ Multi-Factor Proof Created!
#    Identity: soulfra_a3f2d1c4b5e6f7a8
#    Factors: 4
#    Reputation: 35/100
#    Saved to: multi-factor-proof.json
#
# This multi-factor proof demonstrates:
#   • Identity ownership (zero-knowledge)
#   • Computational work (anti-Sybil)
#   • Account age (time-based trust)
#   • Reputation history (verified actions)
```

### What It Contains

```json
{
  "identityID": "soulfra_a3f2d1c4b5e6f7a8",
  "zkProof": {
    "challenge": "a3f5d2c1...",
    "proof": { /* signed proof */ }
  },
  "proofOfWork": {
    "hash": "000004a3f2d1...",
    "nonce": 1847562,
    "difficulty": 5,
    "computeTime": 3247
  },
  "timeProof": {
    "createdAt": "2025-09-12T10:00:00.000Z",
    "currentTime": "2025-10-12T16:00:00.000Z",
    "accountAgeDays": 30
  },
  "reputation": {
    "score": 35,
    "commits": 12,
    "verified_actions": 45,
    "account_age_days": 30
  },
  "soulfraHash": { /* composite signature */ }
}
```

**Use Cases**:
- High-security operations (large transactions, admin access)
- Account recovery verification
- Cross-platform identity migration
- Decentralized KYC alternative

---

## 🛡️ Security Model

### What Soulfra Identity Protects Against

| Attack | Traditional | Soulfra |
|--------|-------------|---------|
| Password theft | ❌ Vulnerable | ✅ No passwords |
| Phishing | ❌ Common | ✅ Crypto signatures |
| Account takeover | ❌ Possible | ✅ Impossible without private key |
| Sybil attacks | ❌ Easy | ✅ PoW + reputation |
| Identity theft | ❌ Common | ✅ Cryptographically impossible |
| Centralized control | ❌ Platform controls | ✅ Self-sovereign |

### Threat Model

**Assumptions**:
- ✅ Attacker cannot break Ed25519 cryptography
- ✅ Attacker cannot factor large primes (RSA security)
- ✅ Attacker cannot reverse SHA-256/SHA-512 hashes
- ⚠️ Attacker CAN steal your private key file (protect it!)

**What Happens If...**

**Private key is stolen?**
- Attacker can impersonate you
- No recovery mechanism (by design)
- Must create new identity
- **Prevention**: Encrypt disk, secure backups, use hardware keys

**Device is compromised?**
- Attacker can steal private key
- All signatures/proofs compromised
- **Prevention**: Store key on hardware security module (HSM), use secure enclave

**Quantum computers?**
- Ed25519 vulnerable to quantum attacks
- Would need to migrate to post-quantum cryptography
- **Future**: Lattice-based or hash-based signatures

---

## 💾 Backup & Recovery

### Backup Your Identity

**IMPORTANT**: There is no password recovery. Lose your private key = lose your identity forever.

```bash
# Backup to encrypted USB drive
cp .soulfra/identity.json /Volumes/USB/soulfra-backup-$(date +%Y%m%d).json

# Backup to password manager
# 1. Open 1Password/Bitwarden
# 2. Create secure note
# 3. Paste contents of identity.json

# Backup to encrypted archive
tar czf - .soulfra/identity.json | gpg -c > soulfra-backup.tar.gz.gpg

# Upload encrypted backup to cloud
aws s3 cp soulfra-backup.tar.gz.gpg s3://my-bucket/backups/
```

### Restore Identity

```bash
# From encrypted backup
gpg -d soulfra-backup.tar.gz.gpg | tar xz

# From password manager
# 1. Copy contents from 1Password
# 2. Paste into .soulfra/identity.json
# 3. chmod 600 .soulfra/identity.json
```

### Multi-Device Setup

**Option 1: Share private key** (less secure)
```bash
# Copy identity to other device
scp .soulfra/identity.json user@laptop:~/project/.soulfra/

# Both devices can now sign as same identity
```

**Option 2: Separate identities** (more secure)
```bash
# Create separate identity on each device
# Desktop: soulfra_a3f2d1c4...
# Laptop: soulfra_b7c8d9e0...
# Phone: soulfra_f1a2b3c4...

# Link identities (prove they're all you)
# Sign a message from each identity proving common ownership
```

---

## 🔧 Advanced Usage

### Programmatic API

```javascript
const SoulfraIdentity = require('./lib/soulfra-identity');

// Create new identity
const identity = SoulfraIdentity.createIdentity();

// Get identity ID
const identityID = identity.getIdentityID();
// Returns: "soulfra_a3f2d1c4b5e6f7a8"

// Create zero-knowledge proof
const challenge = SoulfraIdentity.createChallenge();
const proof = identity.createProof(challenge);

// Verify proof
const valid = SoulfraIdentity.verifyProof(proof, challenge);

// Authentication flow
const authSession = SoulfraIdentity.beginAuth();
const response = identity.respondToChallenge(
  authSession.challenge,
  authSession.sessionID
);

const authResult = SoulfraIdentity.verifyAuthResponse(
  response,
  authSession.challenge,
  authSession.sessionID
);

if (authResult.valid) {
  console.log('Authenticated:', authResult.identityID);
}

// Build reputation
const action = identity.recordAction('code_commit', {
  repository: 'my-repo',
  files: ['file1.js', 'file2.js']
});

// Get reputation
const rep = identity.getReputation();
console.log('Score:', rep.score); // 0-100

// Create multi-factor proof
const multiProof = identity.createMultiFactorProof({
  includeZKProof: true,
  includePoW: true,
  includeTimeProof: true,
  powDifficulty: 5
});

// Save/load identity
const json = identity.toJSON(); // With private key
fs.writeFileSync('identity.json', JSON.stringify(json, null, 2));

const loaded = SoulfraIdentity.fromJSON(json);

// Public identity (safe to share)
const publicIdentity = identity.getPublicIdentity();
// Contains: identityID, publicKey, reputation (no private key)
```

### Integration with Git Hooks

```javascript
// In .githooks/pre-commit
const SoulfraIdentity = require('../lib/soulfra-identity');
const fs = require('fs');

// Load identity
const identityData = JSON.parse(fs.readFileSync('.soulfra/identity.json'));
const identity = SoulfraIdentity.fromJSON(identityData);

// Record commit action (builds reputation)
const commitAction = identity.recordAction('code_commit', {
  files: stagedFiles,
  message: commitMessage,
  repository: repoName
});

// Save updated reputation
fs.writeFileSync('.soulfra/identity.json',
  JSON.stringify(identity.toJSON(), null, 2)
);

// Reputation automatically increases with each commit
```

---

## 🌐 Use Cases

### 1. Self-Sovereign Code Signing

```bash
# Every commit signed with your identity
git commit -m "Add feature"
# → Creates Soulfra signature with your identity
# → Builds your reputation
# → Proves you wrote this code
```

### 2. Decentralized Authentication

```bash
# No passwords, no OAuth, no central server
# Just cryptographic proof of identity

# Server sends challenge
challenge = randomBytes(32)

# Client signs with private key
signature = sign(challenge, privateKey)

# Server verifies
valid = verify(challenge, signature, publicKey)
# → Authenticated!
```

### 3. Reputation-Based Access Control

```javascript
// Check identity reputation
const identity = loadIdentity(publicKey);
const rep = calculateReputation(identity);

if (rep.score >= 70) {
  grantAccess('admin');
} else if (rep.score >= 40) {
  grantAccess('contributor');
} else {
  grantAccess('viewer');
}

// No central authority - reputation calculated from signed actions
```

### 4. Anti-Sybil for DAOs

```javascript
// Require proof of work for new members
const pow = createProofOfWork(difficulty = 6);

if (verifyProofOfWork(pow, 6)) {
  // 30 seconds of compute = real human
  addMember(identityID);
} else {
  reject('Invalid proof of work');
}

// Makes creating fake identities expensive
```

### 5. Decentralized Identity Verification

```javascript
// Prove you're the same person across platforms
// WITHOUT revealing name, email, or other PII

const proof = createMultiFactorProof({
  includeZKProof: true,
  includePoW: true,
  includeTimeProof: true
});

// Send proof to verifier
verifier.verify(proof);

// Verifier knows:
//   ✓ You own this identity
//   ✓ You performed computational work
//   ✓ Your account is X days old
//   ✓ You have Y reputation

// Verifier does NOT know:
//   ✗ Your name
//   ✗ Your email
//   ✗ Your location
//   ✗ Any PII
```

---

## 📚 References

### Cryptography

- **Ed25519**: Edwards-curve Digital Signature Algorithm
  - [Ed25519 Paper](https://ed25519.cr.yp.to/ed25519-20110926.pdf)
  - Public key: 32 bytes
  - Private key: 32 bytes
  - Signature: 64 bytes
  - Security: ~128-bit (equivalent to 3072-bit RSA)

- **Zero-Knowledge Proofs**:
  - Prove statement is true WITHOUT revealing why
  - Interactive proofs (challenge-response)
  - Non-interactive proofs (Fiat-Shamir transform)

- **Proof of Work**:
  - Find nonce such that: SHA-256(data + nonce) starts with N zeros
  - Difficulty determines compute time
  - Sybil resistance mechanism

### Identity Systems

- **Self-Sovereign Identity (SSI)**:
  - [Principles of SSI](https://www.windley.com/archives/2021/10/self-sovereign_identity.shtml)
  - W3C Decentralized Identifiers (DIDs)
  - Verifiable Credentials (VCs)

- **Decentralized PKI**:
  - Certificate Transparency
  - Blockchain-based PKI
  - Web of Trust

### Standards

- **DID (Decentralized Identifiers)**: W3C standard for decentralized identity
- **Verifiable Credentials**: W3C standard for cryptographically-secure credentials
- **WebAuthn**: FIDO2 authentication standard

---

## 🎉 Philosophy

```
Traditional identity: "Who are you?" → Name, email, SSN
          Problem: Identity theft, privacy violations

Self-sovereign identity: "Prove you're you" → Cryptographic signature
          Solution: Zero-knowledge proof of personhood

No passwords. No OAuth. No KYC.
No trust required. Just math.

You own your identity.
You control your data.
You are sovereign.
```

**This is Soulfra Identity.**

---

## ⚡ Next Steps

1. **Create your identity**:
   ```bash
   node bin/soulfra-identity.js create
   ```

2. **Create a zero-knowledge proof**:
   ```bash
   node bin/soulfra-identity.js prove
   ```

3. **Build reputation** (commit code, take actions)

4. **Integrate with your projects** (authentication, access control)

5. **Extend the system** (add custom proof types, reputation models)

---

**Welcome to self-sovereign identity. No central authority. No recovery. Pure cryptographic sovereignty.**

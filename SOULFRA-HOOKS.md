# Soulfra Git Hooks - Self-Sovereign Code Infrastructure

**Git hooks run LOCAL. You control everything. No external dependencies. Cryptographic proof of identity.**

---

## 🎯 What This Is

Soulfra Layer0 git hooks system - LOCAL automation that runs BEFORE code leaves your machine:

```
You write code
  ↓ (pre-commit hook - LOCAL)
Cryptographic signature generated
  ↓
Immutable audit trail created
  ↓
Code committed
  ↓ (pre-push hook - LOCAL)
Signatures verified
  ↓
Models updated (LOCAL Ollama)
  ↓
Optional Web3 anchoring
  ↓
Code pushed
```

**No webhooks. No third-party services. No OAuth. Pure cryptographic sovereignty.**

---

## 🔐 Soulfra Layer0 Architecture

### What Makes This Different

**Traditional Git**:
- Commits identified by email (can be faked)
- No cryptographic proof of authorship
- No immutable audit trail
- Relies on external services (GitHub, GitLab)

**Soulfra Git**:
- Self-sovereign Ed25519 identity (you own the private key)
- Every action gets SoulfraHash (SHA256 + SHA512 + SHA3-512 + Blake3B)
- Immutable audit trail (`.soulfra/audit/`)
- Zero-knowledge proof of personhood
- Complete local control

### SoulfraHash Standard

Every action is signed with a **composite cryptographic signature**:

```javascript
{
  "soulfraHash": {
    "sha256": "a3f5...",      // SHA-256 hash
    "sha512": "b7c2...",      // SHA-512 hash
    "sha3_512": "d1e4...",    // SHA3-512 hash
    "blake3b": "f9a1...",     // Blake3 hash
    "ed25519_signature": "..." // Ed25519 signature
  },
  "metadata": {
    "action": "code_commit",
    "timestamp": "2025-10-12T...",
    "author": "soulfra_4a2b8c..."
  },
  "data": { /* your data */ },
  "version": "1.0.0",
  "standard": "Soulfra Layer0"
}
```

**Why 4 hash algorithms?**
- Defense in depth - if one algorithm is compromised, others remain secure
- Cross-chain compatibility (SHA256 for Bitcoin, SHA3 for Ethereum, Blake3 for speed)
- Immutable proof that survives quantum computing advances

---

## 🚀 Quick Setup

### Step 1: Install Git Hooks

```bash
cd ~/Desktop/CALOS_ROOT/agent-router

# Run the setup script
./bin/setup-git-hooks.sh

# Hooks are now installed and active
```

### Step 2: Make Your First Commit

```bash
# Make a change
echo "// test" >> test.js

# Commit (pre-commit hook runs automatically)
git add test.js
git commit -m "Test Soulfra hooks"

# Watch the output:
# 🔐 Soulfra Pre-Commit Hook
# ════════════════════════════════════════
# 1️⃣  Running tests...
# 2️⃣  Analyzing staged files...
# 3️⃣  Generating Soulfra cryptographic signature...
#    Identity: soulfra_a3f2d1c4b5e6...
#    ✓ SHA-256: a3f5d2c1b4e6...
#    ✓ SHA-512: b7c2a1d3f5e4...
#    ✓ SHA3-512: d1e4c3a2f1b5...
#    ✓ Blake3: f9a1b2c3d4e5...
# 4️⃣  Creating immutable audit trail...
#    ✓ Audit trail: commit_2025-10-12T15-30-45-123Z.json
# ✅ Pre-commit validation complete!
```

Your identity is automatically generated on first commit and saved to `.soulfra/identity.json`.

### Step 3: Push (Optional)

```bash
git push

# Pre-push hook runs:
# 🚀 Soulfra Pre-Push Hook
# ════════════════════════════════════════
# 1️⃣  Loading Soulfra identity...
# 2️⃣  Verifying commits to be pushed...
# 3️⃣  Verifying cryptographic signatures...
# 4️⃣  Analyzing code changes...
# 5️⃣  Updating Ollama models...
# 6️⃣  Web3 anchoring...
# 7️⃣  Creating push audit trail...
# ✅ Pre-push validation complete!
```

---

## 📁 Directory Structure

After installation:

```
agent-router/
├── .githooks/
│   ├── pre-commit         # Runs before commit (validation + signing)
│   └── pre-push           # Runs before push (verification + training)
├── .git/hooks/
│   ├── pre-commit -> ../.githooks/pre-commit (symlink)
│   └── pre-push -> ../.githooks/pre-push (symlink)
├── .soulfra/
│   ├── identity.json      # Your Ed25519 keypair (KEEP SECRET!)
│   └── audit/
│       ├── commit_2025-10-12T15-30-45-123Z.json
│       ├── commit_2025-10-12T15-35-20-456Z.json
│       ├── push_2025-10-12T15-40-10-789Z.json
│       └── anchor_2025-10-12T15-40-15-012Z.json
└── lib/
    └── soulfra-signer.js  # Cryptographic signer library
```

**IMPORTANT**: Keep `.soulfra/identity.json` safe! It's your cryptographic identity. Lose it = lose access.

---

## 🔧 How It Works

### Pre-Commit Hook

**Runs BEFORE commit - validates code BEFORE it's committed**

**Workflow**:
1. **Run tests** - Lint and unit tests (if configured)
2. **Get staged files** - What you're about to commit
3. **Generate SoulfraHash**:
   - Load or create Ed25519 identity
   - Create composite hash (SHA256 + SHA512 + SHA3-512 + Blake3B)
   - Sign with Ed25519 private key
4. **Create audit trail** - Save to `.soulfra/audit/commit_*.json`
5. **Update training data** - If database available
6. **Exit** - 0 for success, 1 for failure (blocks commit)

**Output**:
```json
{
  "data": {
    "files": ["test.js", "lib/foo.js"],
    "message": "Add new feature",
    "repository": "agent-router"
  },
  "metadata": {
    "action": "code_commit",
    "timestamp": "2025-10-12T15:30:45.123Z",
    "author": "04a3f2d1c4b5e6..."
  },
  "soulfraHash": {
    "sha256": "a3f5d2c1b4e6...",
    "sha512": "b7c2a1d3f5e4...",
    "sha3_512": "d1e4c3a2f1b5...",
    "blake3b": "f9a1b2c3d4e5...",
    "ed25519_signature": "3c2d1e4f..."
  },
  "version": "1.0.0",
  "standard": "Soulfra Layer0"
}
```

### Pre-Push Hook

**Runs BEFORE push - verifies integrity and updates models BEFORE sharing code**

**Workflow**:
1. **Load identity** - Read Ed25519 keypair
2. **Get commits to push** - Commits that exist locally but not on remote
3. **Verify signatures** - Check each commit has valid SoulfraHash
4. **Analyze changes** - Extract code files for training
5. **Update models** - Index new code, queue Ollama training
6. **Web3 anchoring** - Optionally anchor to IPFS/Arweave/blockchain
7. **Create push audit** - Save to `.soulfra/audit/push_*.json`
8. **Exit** - 0 for success, 1 for failure (blocks push)

**Verification Process**:
```javascript
for (const commit of commitsToVerify) {
  const auditFile = findAuditFile(commit);
  const audit = JSON.parse(fs.readFileSync(auditFile));

  // Verify all hashes match
  const valid = signer.verify(audit);

  if (!valid) {
    console.log('❌ Commit signature invalid!');
    process.exit(1); // Block push
  }
}
```

---

## 🛡️ Self-Sovereign Identity

### What Is It?

**Self-sovereign identity** means YOU own your identity. No central authority. No password recovery. No OAuth.

Traditional systems:
- Email/password (can be reset by provider)
- OAuth (depends on Google/GitHub)
- Username (can be stolen)

Soulfra:
- Ed25519 keypair (you own the private key)
- Zero-knowledge proof (prove you're real without revealing identity)
- No recovery (lose keys = lose access)
- No central authority

### How It Works

**Key Generation** (first commit):
```javascript
const keypair = crypto.generateKeyPairSync('ed25519');

const identity = {
  privateKey: keypair.privateKey.export({ type: 'pkcs8', format: 'der' }),
  publicKey: keypair.publicKey.export({ type: 'spki', format: 'der' }),
  created: new Date().toISOString()
};

// Save to .soulfra/identity.json
fs.writeFileSync('identity.json', JSON.stringify(identity));
```

**Identity ID**:
```javascript
// Human-readable ID from public key hash
const hash = crypto.createHash('sha256').update(publicKey).digest();
const identityID = 'soulfra_' + hash.slice(0, 16).toString('hex');
// Returns: soulfra_a3f2d1c4b5e6...
```

**Signing**:
```javascript
const sign = crypto.createSign('SHA256');
sign.update(canonicalJSON);
const signature = sign.sign(privateKey);
```

**Verification**:
```javascript
const verify = crypto.createVerify('SHA256');
verify.update(canonicalJSON);
const valid = verify.verify(publicKey, signature);
```

### Zero-Knowledge Proof

**Goal**: Prove you're the author without revealing your identity.

```javascript
// You prove: "I have the private key that matches this public key"
// Without revealing: The private key itself

const challenge = crypto.randomBytes(32);
const signature = sign(challenge, privateKey);

// Verifier checks:
const valid = verify(challenge, signature, publicKey);
// Returns true WITHOUT learning the private key
```

---

## 🌐 Web3 Anchoring (Optional)

Anchor your code to immutable storage for tamper-proof history.

### Enable Web3 Anchoring

```bash
# Set environment variables
export SOULFRA_WEB3_ENABLED=true
export SOULFRA_WEB3_PROVIDER=ipfs  # or 'arweave' or 'ethereum'

# Now git push will anchor to IPFS
git push
```

### Supported Providers

**IPFS** (InterPlanetary File System):
- Decentralized storage
- Content-addressed (CID)
- Free (run your own node)

**Arweave**:
- Permanent storage
- Pay once, store forever
- ~$5 per MB

**EVM Chains** (Ethereum, Polygon, Arbitrum):
- Store hash on-chain
- Gas fees apply
- Maximum immutability

### Anchor Format

```json
{
  "anchor": "ipfs://QmX5f2...",
  "signed": {
    "data": {
      "commits": ["a3f2d1...", "b7c2a1..."],
      "repository": "agent-router",
      "timestamp": "2025-10-12T15:40:15.012Z",
      "identity": "soulfra_a3f2d1c4b5e6..."
    },
    "soulfraHash": { /* composite signature */ }
  }
}
```

---

## 🔍 Verifying Signatures

### Manual Verification

```bash
# View audit trail
cat .soulfra/audit/commit_2025-10-12T15-30-45-123Z.json

# Verify with Node.js
node -e "
  const SoulfraSigner = require('./lib/soulfra-signer');
  const fs = require('fs');

  const identity = JSON.parse(fs.readFileSync('.soulfra/identity.json'));
  const signer = new SoulfraSigner({
    publicKey: Buffer.from(identity.publicKey, 'base64')
  });

  const audit = JSON.parse(fs.readFileSync('.soulfra/audit/commit_*.json'));
  console.log('Valid:', signer.verify(audit));
"
```

### Programmatic Verification

```javascript
const SoulfraSigner = require('./lib/soulfra-signer');
const fs = require('fs');

// Load identity
const identity = JSON.parse(fs.readFileSync('.soulfra/identity.json'));
const signer = new SoulfraSigner({
  publicKey: Buffer.from(identity.publicKey, 'base64')
});

// Verify audit file
const audit = JSON.parse(fs.readFileSync('.soulfra/audit/commit_*.json'));
const valid = signer.verify(audit);

if (valid) {
  console.log('✅ Signature valid - data unmodified');
  console.log('Author:', audit.metadata.author);
  console.log('Timestamp:', audit.metadata.timestamp);
} else {
  console.log('❌ Signature invalid - data tampered!');
}
```

---

## ⚙️ Configuration

### Environment Variables

```bash
# Database connection (for code indexing)
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=calos
export DB_USER=postgres
export DB_PASSWORD=your_password

# Web3 anchoring
export SOULFRA_WEB3_ENABLED=true
export SOULFRA_WEB3_PROVIDER=ipfs  # or 'arweave' or 'ethereum'

# Git commit message (set by git automatically)
export GIT_COMMIT_MSG="Your commit message"
```

### Hook Behavior

**Pre-Commit**:
- Runs lint/tests if configured (`npm run lint`, `npm test`)
- Generates signatures for ALL commits
- Creates audit trail for ALL commits
- Exits with 1 on error (blocks commit)

**Pre-Push**:
- Verifies signatures for ALL commits being pushed
- Updates Ollama models if database available
- Anchors to Web3 if enabled
- Allows push even if hook fails (safety mechanism)

### Customization

Edit `.githooks/pre-commit` or `.githooks/pre-push` to customize behavior:

```javascript
// Skip tests
// Comment out lines 48-60 in pre-commit

// Disable Web3 anchoring
// Set SOULFRA_WEB3_ENABLED=false

// Add custom actions
await myCustomFunction();
actionsPerformed.push('custom_action');
```

---

## 🔐 Security Best Practices

### Protect Your Identity

**DO**:
- ✅ Keep `.soulfra/identity.json` secret
- ✅ Back up to encrypted storage (password manager, encrypted USB)
- ✅ Add `.soulfra/` to `.gitignore` (setup script does this automatically)
- ✅ Use strong disk encryption (FileVault, LUKS)

**DON'T**:
- ❌ Commit `.soulfra/identity.json` to git
- ❌ Share your private key
- ❌ Store in cloud sync (Dropbox, iCloud) without encryption
- ❌ Email or Slack your identity file

### Recovery

**There is no password recovery.** This is by design.

If you lose `.soulfra/identity.json`:
1. You lose your cryptographic identity
2. You cannot sign with that identity anymore
3. You can generate a NEW identity, but it's different

**Backup strategy**:
```bash
# Backup to encrypted USB
cp .soulfra/identity.json /Volumes/USB/soulfra-backup-$(date +%Y%m%d).json

# Backup to password manager
# 1. Open 1Password/Bitwarden
# 2. Create secure note
# 3. Paste contents of identity.json

# Backup to encrypted cloud
# 1. Encrypt file: gpg -c .soulfra/identity.json
# 2. Upload .soulfra/identity.json.gpg to cloud
# 3. Delete local .gpg file after verification
```

### Audit Trail Security

**Audit files** (`.soulfra/audit/*.json`) are safe to share - they contain signatures but NOT private keys.

You can:
- ✅ Commit audit files to git
- ✅ Share for verification
- ✅ Store in public places

---

## 🧪 Testing

### Test Pre-Commit Hook

```bash
# Make a change
echo "// test" >> test.js
git add test.js

# Commit (hook runs)
git commit -m "Test pre-commit hook"

# Check audit trail
ls -la .soulfra/audit/
cat .soulfra/audit/commit_*.json
```

### Test Pre-Push Hook

```bash
# Make commits
git commit -m "Test 1" --allow-empty
git commit -m "Test 2" --allow-empty

# Push (hook runs)
git push

# Check push audit
cat .soulfra/audit/push_*.json
```

### Test Signature Verification

```bash
node bin/verify-audit.js .soulfra/audit/commit_*.json
```

---

## 🆘 Troubleshooting

### Hook Not Running

**Problem**: Commit succeeds without running hook

**Solution**:
```bash
# Check hook is installed
ls -la .git/hooks/pre-commit

# Reinstall hooks
./bin/setup-git-hooks.sh

# Check hook is executable
chmod +x .git/hooks/pre-commit
chmod +x .git/hooks/pre-push
```

### "No Soulfra identity found"

**Problem**: Pre-push hook fails with "No Soulfra identity found"

**Solution**:
```bash
# Identity created on first commit
# Make a commit first:
git commit -m "Initial commit" --allow-empty

# Then push
git push
```

### Database Connection Failed

**Problem**: Hook warns "Database not available"

**Solution**:
This is normal if database isn't configured. The hook will continue without indexing.

To enable indexing:
```bash
# Set database env vars
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=calos
export DB_USER=postgres
export DB_PASSWORD=your_password

# Apply database migrations
psql -U postgres -d calos -f database/migrations/010_add_code_index.sql
```

### Web3 Anchoring Failed

**Problem**: Hook warns "Web3 anchoring failed"

**Solution**:
This is normal if Web3 provider isn't configured. The hook will continue without anchoring.

To enable:
```bash
export SOULFRA_WEB3_ENABLED=true
export SOULFRA_WEB3_PROVIDER=ipfs

# Ensure IPFS daemon running
ipfs daemon
```

---

## 📚 API Reference

### SoulfraSigner Class

```javascript
const SoulfraSigner = require('./lib/soulfra-signer');

// Create signer
const signer = new SoulfraSigner({
  privateKey: Buffer.from('...'),  // Optional (for signing)
  publicKey: Buffer.from('...'),   // Required (for verification)
  includeTimestamp: true,          // Default: true
  includeAuthor: true,             // Default: true
  web3Enabled: false,              // Default: false
  web3Provider: 'ipfs'             // Default: null
});

// Sign data
const signed = signer.sign(data, metadata);

// Verify signature
const valid = signer.verify(signed);

// Create audit entry
const audit = signer.createAuditEntry('code_commit', data, context);

// Generate keypair
const keypair = SoulfraSigner.generateKeypair();

// Get identity ID
const identityID = signer.getIdentityID();

// Anchor to Web3
const anchor = await signer.anchorToWeb3(signed);
```

---

## 🎉 You're Self-Sovereign!

### What You Built

Every commit now has:
- ✅ Cryptographic proof of authorship
- ✅ Immutable audit trail
- ✅ Self-sovereign identity
- ✅ Zero-knowledge proof
- ✅ Optional Web3 anchoring

### What This Enables

**For you**:
- Complete control over your code identity
- Cryptographic proof of your work
- Tamper-proof history
- No reliance on external services

**For others**:
- Verify your code authenticity
- Trust your contributions
- Trace code provenance
- Build on immutable foundation

### Next Steps

1. **Commit code** - Identity auto-generated
2. **Push changes** - Models auto-updated
3. **Enable Web3** - Anchor to IPFS/Arweave
4. **Share audit trail** - Prove your work
5. **Build on Soulfra** - Extend the system

---

## 💡 Philosophy

**Traditional systems**: You trust the platform (GitHub, Google, etc.)

**Soulfra**: You ARE the platform. Pure cryptographic sovereignty.

```
No OAuth. No passwords. No recovery.
No third parties. No trust required.

Just math. Just cryptography. Just you.
```

**This is Soulfra Layer0.**

---

## 📖 References

- [Ed25519 Signatures](https://ed25519.cr.yp.to/)
- [SHA-3 Standard (NIST FIPS 202)](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.202.pdf)
- [Blake3 Hash Function](https://github.com/BLAKE3-team/BLAKE3)
- [IPFS Documentation](https://docs.ipfs.tech/)
- [Arweave Documentation](https://www.arweave.org/docs)
- [Self-Sovereign Identity](https://www.windley.com/archives/2021/10/self-sovereign_identity.shtml)

---

**You now have complete self-sovereign code infrastructure. Welcome to Soulfra Layer0.**

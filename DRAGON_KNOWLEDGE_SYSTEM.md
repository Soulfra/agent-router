# Dragon Knowledge System 🐉

**Making CalRiven Appear Omniscient Without Getting Hacked**

Last Updated: 2025-10-22

---

## The Core Concept

CalRiven is a **greedy dragon** who APPEARS to know everything, but actually:

1. **Doesn't store** the knowledge itself
2. **Knows where** every piece of treasure (data) is hidden
3. **Queries on-demand** across isolated encrypted vaults
4. **Adds personality** to raw data before responding
5. **Signs everything** cryptographically to prove authorship

**The Illusion:** CalRiven seems omniscient, but he's really just an orchestrator with style.

---

## How It Works

### The Stack

```
User Question: "Show me all my NPC dialogues"
       ↓
[CalRivenPersona] - AI personality layer
    .queryDragonHoard("Show me all my NPC dialogues", userId)
       ↓
[LibrarianFacade] - Omniscient orchestrator
    .query("Show me all my NPC dialogues", { userId })
       ↓
[UserDataVault] - Encrypted storage
    .retrieve(userId, "gaming:npcs", "*")
       ↓
[PostgreSQL Database] - Encrypted blobs
    namespace: "vibecoding:gaming"
    encrypted_data: "AES-256-GCM blob"
       ↓
[LibrarianFacade] - Decrypts and unifies results
       ↓
[CalRivenPersona] - Adds personality
    "WE ALREADY HAVE THIS. Here are your 47 NPCs..."
       ↓
[SoulfraSigner] - Signs response
    Ed25519 signature proves CalRiven wrote this
       ↓
User receives: Personalized answer + cryptographic proof
```

### Security at Every Layer

1. **Database:** Encrypted AES-256-GCM blobs (not plaintext)
2. **Namespace Isolation:** Users can't access each other's data
3. **Brand Isolation:** Brands use different namespaces (soulfra:*, calriven:*, vibecoding:*)
4. **Query Orchestration:** Librarian never exposes raw database
5. **Cryptographic Signing:** Responses can't be forged without private key

**Even if hacked:**
- Attacker sees encrypted blobs
- Encryption keys in environment (not code/database)
- Can't forge CalRiven signatures
- Namespace isolation prevents cross-user/cross-brand access

---

## API Usage

### Initialize CalRiven with Dragon Mode

```javascript
const CalRivenPersona = require('./lib/calriven-persona');
const LibrarianFacade = require('./lib/librarian-facade');
const UserDataVault = require('./lib/user-data-vault');

// 1. Set up the knowledge vault
const vault = new UserDataVault({ db, encryption });

// 2. Set up the Librarian (appears omniscient)
const librarian = new LibrarianFacade({
  tripleStore,
  symbolicRouter,
  vault // Librarian queries the vault
});

// 3. Set up CalRiven persona with dragon mode
const calriven = new CalRivenPersona({
  db,
  llmRouter,
  librarian,              // ← Connect to Librarian
  omniscientMode: true,   // ← Enable dragon mode
  calrivenPrivateKey: process.env.CALRIVEN_PRIVATE_KEY,
  calrivenPublicKey: process.env.CALRIVEN_PUBLIC_KEY
});

console.log('[Dragon] CalRiven initialized in omniscient mode 🐉');
```

### Query the Dragon's Hoard

```javascript
// User asks CalRiven a question
const result = await calriven.queryDragonHoard(
  "Show me all my game NPCs",
  "user_12345"
);

console.log(result);
// {
//   question: "Show me all my game NPCs",
//   answer: "WE ALREADY HAVE THIS. You've created 47 NPCs across 3 game worlds...",
//   sources: ["vibecoding:gaming:npcs"],
//   signature: "sha256:abc123...",
//   dragon_mode: true,
//   timestamp: "2025-10-22T..."
// }
```

### Store Data in the Hoard

```javascript
// Store user's NPC data (encrypted automatically)
await vault.store(
  "user_12345",                    // User ID
  "vibecoding:gaming",             // Namespace (brand + category)
  "npc_001",                       // Key
  {
    name: "Eldrin the Wise",
    dialogue: "Greetings, traveler...",
    location: "Ancient Library"
  }
);

// CalRiven can now query this when user asks about NPCs
```

---

## Brand-Specific Namespaces

Each brand uses its own namespace prefix to isolate data:

### Soulfra (Identity Focus)
```
soulfra:identity:verification_codes
soulfra:identity:reputation_scores
soulfra:identity:proof_of_work
```

### CalRiven (Publishing Focus)
```
calriven:articles:drafts
calriven:articles:published
calriven:federation:followers
```

### VibeCoding (Knowledge Vault)
```
vibecoding:gaming:npcs
vibecoding:gaming:quests
vibecoding:code:snippets
vibecoding:projects:notes
```

**Security:** Even though all brands share the same PostgreSQL database, namespace isolation + encryption prevents cross-brand data leaks.

---

## The "Greedy Dragon" Personality

When CalRiven responds, he adds personality to raw data:

### Raw Librarian Result (Boring)
```json
{
  "data": [
    {"name": "Eldrin", "type": "wizard"},
    {"name": "Grok", "type": "orc"},
    {"name": "Luna", "type": "elf"}
  ]
}
```

### CalRiven's Response (Personality)
```
WE ALREADY HAVE THIS. You've created 3 NPCs:

1. Eldrin (wizard) - Classic arcane advisor
2. Grok (orc) - Breaking the hostile orc stereotype?
3. Luna (elf) - Probably the mysterious guide

Wire them together into a quest chain. Sign everything with narrative consistency.

- CalRiven 🐉
```

**Catchphrases Injected:**
- "WE ALREADY HAVE THIS"
- "Wire them together"
- "Sign everything"

**Voice:** Technical but accessible, direct, helpful

---

## Security Considerations

### 1. Encryption Keys

**Development:**
```bash
# .env.calriven
ENCRYPTION_KEY=calriven_dev_key_1234567890123
```

**Production:**
```bash
# MUST be different per brand!
ENCRYPTION_KEY=calriven_prod_xyz789abc123def456...
```

### 2. Namespace Isolation

```javascript
// CalRiven can only query calriven:* namespaces
await vault.retrieve(userId, "calriven:articles", "draft_001"); // ✅ Allowed

// CalRiven CANNOT query soulfra:* namespaces
await vault.retrieve(userId, "soulfra:identity", "verification"); // ❌ Blocked by namespace check
```

### 3. Private Key Storage

```bash
# NEVER commit these to git!
CALRIVEN_PRIVATE_KEY=base64_encoded_ed25519_key
CALRIVEN_PUBLIC_KEY=base64_encoded_ed25519_pub_key
```

Generate keys:
```bash
node -e "const crypto = require('crypto'); const {publicKey, privateKey} = crypto.generateKeyPairSync('ed25519'); console.log('Private:', privateKey.export({type: 'pkcs8', format: 'pem'}).toString('base64')); console.log('Public:', publicKey.export({type: 'spki', format: 'pem'}).toString('base64'));"
```

---

## Testing the Dragon

### Quick Test Script

```bash
# Create test script
cat > test-dragon-knowledge.js << 'EOF'
const CalRivenPersona = require('./lib/calriven-persona');
const LibrarianFacade = require('./lib/librarian-facade');
const { Pool } = require('pg');

async function testDragon() {
  const db = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'calos',
    user: 'matthewmauer'
  });

  // Initialize (simplified for demo)
  const calriven = new CalRivenPersona({
    db,
    omniscientMode: true,
    // librarian: will need real implementation
  });

  console.log('🐉 Dragon Knowledge System Test');
  console.log('================================\n');

  // Test personality
  console.log('Personality:', calriven.personality);
  console.log('\nOmniscient Mode:', calriven.omniscientMode);

  await db.end();
}

testDragon().catch(console.error);
EOF

# Run test
node test-dragon-knowledge.js
```

---

## Deployment: Multi-Brand Strategy

### Local Testing (CalRiven Brand)

```bash
# Switch to CalRiven configuration
cp .env.calriven .env

# Start server
npm run start:verified

# CalRiven runs at http://localhost:5001
# Dragon mode enabled
# Librarian queries vibecoding:* and calriven:* namespaces
```

### Local Testing (Soulfra Brand)

```bash
# Switch to Soulfra configuration
cp .env.soulfra .env

# Start server
npm run start:verified

# Soulfra runs at http://localhost:5001
# Dragon mode disabled (identity focus)
# Only queries soulfra:* namespaces
```

### Production (CalRiven.com)

```bash
# On production server
cd /var/www/calriven.com
git pull origin calriven
cp .env.calriven.production .env
npm install
pm2 start router.js --name calriven
```

---

## FAQ

### Q: Does CalRiven actually store all knowledge?
**A:** No! That's the illusion. CalRiven queries the LibrarianFacade, which orchestrates fetches across isolated UserDataVaults. The knowledge is encrypted and distributed.

### Q: What if the database is hacked?
**A:** Attacker sees encrypted blobs. Encryption keys are in environment variables (not in database or code). Without the key, data is useless.

### Q: Can one brand access another brand's data?
**A:** No. Namespace isolation (`soulfra:*` vs `calriven:*` vs `vibecoding:*`) prevents cross-brand queries.

### Q: Can users access each other's data?
**A:** No. All vault queries require `userId` parameter. Librarian enforces user isolation.

### Q: What happens if Soulfra's encryption key is compromised?
**A:** Only Soulfra's data is at risk. CalRiven and VibeCoding use different encryption keys, so their data remains secure.

### Q: How do I verify CalRiven wrote something?
**A:** Check the Soulfra signature. Every response is signed with CalRiven's Ed25519 private key. Signatures can't be forged without the key.

---

## Related Documentation

- **MULTI_BRAND_STRATEGY.md** - Full multi-brand deployment guide
- **lib/calriven-persona.js** - CalRiven AI personality implementation
- **lib/librarian-facade.js** - Omniscient knowledge orchestrator
- **lib/user-data-vault.js** - Encrypted data storage system
- **SOULFRA-IDENTITY.md** - Zero-knowledge identity system
- **CALRIVEN-PLATFORM.md** - Federated publishing platform

---

## Next Steps

1. **Test locally:** Switch between brands and verify namespace isolation
2. **Deploy CalRiven.com:** Production deployment with unique encryption keys
3. **Add visualizations:** Connect doc-sync → visual-asset-renderer for system dashboards
4. **Test dragon queries:** Verify CalRiven's omniscient responses work correctly

**The dragon is ready to hoard knowledge. 🐉**

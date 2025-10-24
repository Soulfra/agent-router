# Multi-Brand Deployment Strategy

**Last Updated:** 2025-10-22

## Overview

CALOS supports multiple brand identities deployed from a single codebase using git branches and environment-based configuration.

## Brand Identities

### 1. **CALOS** (Core Platform)
- **Branch:** `main`
- **Domain:** localhost:5001 (development)
- **Purpose:** Core infrastructure, shared by all brands
- **Features:** All systems available

### 2. **Soulfra** (Zero-Knowledge Identity)
- **Branch:** `soulfra`
- **Domain:** soulfra.com
- **Purpose:** Self-sovereign identity, cryptographic proof of personhood
- **Focus:** Identity verification, zero-knowledge proofs, reputation

### 3. **CalRiven** (Federated Publishing)
- **Branch:** `calriven`
- **Domain:** calriven.com
- **Purpose:** AI-powered publishing platform with ActivityPub federation
- **Focus:** CalRiven AI persona, article publishing, Mastodon integration

### 4. **VibeCoding Vault** (Knowledge Hoard)
- **Branch:** `vibecoding`
- **Domain:** vibecoding.com
- **Purpose:** Encrypted knowledge vault with "omniscient" AI librarian
- **Focus:** LibrarianFacade, UserDataVault, encrypted storage

---

## Git Branching Strategy

```
main (CALOS core)
├── All shared infrastructure
├── Core libraries (lib/*)
├── Shared routes (routes/*)
├── Database migrations (migrations/*, database/migrations/*)
└── Base configuration (.env.example)

soulfra (inherits main)
├── Brand-specific config (.env.soulfra)
├── Soulfra theme/assets (public/soulfra/*)
├── Identity-focused routes enabled
└── Soulfra overrides (if needed)

calriven (inherits main)
├── Brand-specific config (.env.calriven)
├── CalRiven theme/assets (public/calriven/*)
├── Federation routes enabled (ActivityPub)
├── CalRiven AI persona active
└── Publishing workflow emphasized

vibecoding (inherits main)
├── Brand-specific config (.env.vibecoding)
├── Vault theme/assets (public/vibecoding/*)
├── LibrarianFacade emphasized
├── Encrypted vault UI
└── "Dragon knowledge" branding
```

---

## Environment Configuration

### Shared Variables (All Brands)

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calos
DB_USER=matthewmauer
DB_PASSWORD=

# Core Services
PORT=5001
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...

# Encryption
ENCRYPTION_KEY=... # 32-character key for AES-256
```

### Brand-Specific Variables

#### `.env.soulfra`
```bash
BRAND=soulfra
DOMAIN=soulfra.com
OWNER_EMAIL=matt@soulfra.com
OWNER_WEBSITE=soulfra.com

# Feature flags
ENABLE_IDENTITY_VERIFICATION=true
ENABLE_ZERO_KNOWLEDGE_PROOFS=true
ENABLE_FEDERATION=false
ENABLE_LIBRARIAN=false
```

#### `.env.calriven`
```bash
BRAND=calriven
DOMAIN=calriven.com
OWNER_EMAIL=calriven@calriven.com
OWNER_WEBSITE=calriven.com

# Feature flags
ENABLE_IDENTITY_VERIFICATION=true
ENABLE_FEDERATION=true
ENABLE_CALRIVEN_PERSONA=true
ENABLE_ARTICLE_PUBLISHING=true
ENABLE_LIBRARIAN=false
```

#### `.env.vibecoding`
```bash
BRAND=vibecoding
DOMAIN=vibecoding.com
OWNER_EMAIL=vault@vibecoding.com
OWNER_WEBSITE=vibecoding.com

# Feature flags
ENABLE_LIBRARIAN=true
ENABLE_VAULT_UI=true
ENABLE_KNOWLEDGE_GRAPH=true
ENABLE_FEDERATION=false
```

---

## Data Isolation Strategy

### Namespace Isolation

All brands share the same PostgreSQL database but data is isolated by **namespace**:

```sql
-- UserDataVault uses namespaces
user_data_vault:
  - user_id: "user123"
  - namespace: "soulfra:identity" | "calriven:articles" | "vibecoding:vault"
  - key: "verification_code"
  - encrypted_data: {...}

-- Portfolio data uses brand prefix
portfolio_timeline:
  - category: "soulfra:identity_verified"
  - category: "calriven:article_published"
  - category: "vibecoding:knowledge_added"
```

**Benefits:**
- Single database, multiple brands
- Data encrypted per-namespace
- Cross-brand analytics possible (aggregated only)
- Each brand appears independent to users

---

## Deployment Workflow

### Local Development

**Switch to CalRiven brand:**
```bash
git checkout calriven
cp .env.calriven .env
npm run start:verified
# Server runs at http://localhost:5001 as CalRiven
```

**Switch to Soulfra brand:**
```bash
git checkout soulfra
cp .env.soulfra .env
npm run start:verified
# Server runs at http://localhost:5001 as Soulfra
```

**Switch back to core:**
```bash
git checkout main
cp .env.example .env
npm run start:verified
# Server runs as CALOS core
```

### Production Deployment

**CalRiven.com:**
```bash
# On production server
cd /var/www/calriven.com
git pull origin calriven
cp .env.calriven .env
npm install
npm run start:verified
# Served via nginx reverse proxy at calriven.com
```

**Soulfra.com:**
```bash
# On production server (different droplet/VM)
cd /var/www/soulfra.com
git pull origin soulfra
cp .env.soulfra .env
npm install
npm run start:verified
# Served via nginx reverse proxy at soulfra.com
```

**VibeCoding.com:**
```bash
# On production server (different droplet/VM)
cd /var/www/vibecoding.com
git pull origin vibecoding
cp .env.vibecoding .env
npm install
npm run start:verified
# Served via nginx reverse proxy at vibecoding.com
```

---

## Security Considerations

### 1. Encryption Keys

**DO NOT share encryption keys across brands in production.**

Each brand should have its own `ENCRYPTION_KEY` to prevent cross-brand data access if one is compromised.

**Development:**
```bash
# Shared key OK for local testing
ENCRYPTION_KEY=dev_key_12345678901234567890123
```

**Production:**
```bash
# CalRiven
ENCRYPTION_KEY=calriven_prod_abc123...

# Soulfra
ENCRYPTION_KEY=soulfra_prod_xyz789...

# VibeCoding
ENCRYPTION_KEY=vibecoding_prod_def456...
```

### 2. Database Isolation

**Options:**

**A. Shared DB with namespace isolation (Current)**
- Pros: Single backup, easier analytics, cost-effective
- Cons: Breach exposes all brands (mitigated by encryption)

**B. Separate databases per brand**
- Pros: True isolation, breach only affects one brand
- Cons: More complex backups, harder to aggregate

**Recommendation:** Start with shared DB + namespace isolation, migrate to separate DBs if any brand gains traction.

### 3. CalRiven "Omniscient" Security

**The Dragon Illusion:**

CalRiven APPEARS to know everything but actually:
1. Queries via LibrarianFacade (orchestrator)
2. Librarian fetches from isolated vaults
3. Data decrypted on-the-fly (never stored decrypted)
4. Responses signed cryptographically (proves authorship)

**Even if hacked:**
- Attacker sees encrypted blobs in DB
- Encryption keys in environment (not in code/DB)
- Namespace isolation prevents cross-brand access
- Cryptographic signatures can't be forged without private key

---

## CalRiven Personality System

### "Dragon Who's Greedy" Implementation

**lib/calriven-persona.js** (AI personality):
- Voice: "Technical but accessible, no bullshit"
- Values: Cryptographic proof, federation, self-sovereign identity
- Catchphrases: "WE ALREADY HAVE THIS", "Wire it together", "Sign everything"

**lib/librarian-facade.js** (Knowledge orchestrator):
- Appears omniscient ("knows everything")
- Actually orchestrates queries across services
- The illusion: Doesn't store data, just knows where to find it

**Together:**
```
User: "Show me all my NPC dialogues"
  ↓
CalRiven AI → LibrarianFacade.query("Show me all NPC dialogues")
  ↓
Librarian → UserDataVault.retrieve(user, "gaming:npcs", "*")
  ↓
Vault → Decrypt data from `vibecoding:gaming` namespace
  ↓
Librarian → Unify results, return to CalRiven
  ↓
CalRiven → Add personality: "WE ALREADY HAVE THIS. Here's every NPC you've created..."
  ↓
Response → Sign with Soulfra Ed25519 signature
  ↓
User sees: CalRiven as omniscient dragon hoarding game knowledge
```

**Security:** Raw DB never exposed, encryption keys in environment, namespace isolation prevents leaks.

---

## Roadmap

**Phase 1: Local Multi-Brand** (Current)
- [x] Core infrastructure (CALOS)
- [ ] Create git branches (soulfra, calriven, vibecoding)
- [ ] Add brand-specific .env files
- [ ] Test local deployment per brand

**Phase 2: CalRiven "Dragon" System**
- [ ] Wire CalRivenPersona → LibrarianFacade
- [ ] Implement namespace isolation in UserDataVault
- [ ] Add cryptographic signing to all CalRiven responses
- [ ] Test "omniscient" illusion locally

**Phase 3: Production Deployment**
- [ ] Deploy calriven.com (DigitalOcean/Vercel)
- [ ] Deploy soulfra.com (separate server)
- [ ] Set up nginx reverse proxies
- [ ] Configure SSL certificates
- [ ] Test namespace isolation in production

**Phase 4: VibeCoding Vault**
- [ ] Create "vault" UI theme
- [ ] Emphasize LibrarianFacade interface
- [ ] Market as "encrypted knowledge hoard"
- [ ] Deploy vibecoding.com

---

## Related Documentation

- **SOULFRA-IDENTITY.md** - Zero-knowledge identity system
- **CALRIVEN-PLATFORM.md** - Federated publishing platform
- **PORTFOLIO_SYSTEM.md** - Multi-source analytics aggregation
- **lib/librarian-facade.js** - Omniscient knowledge orchestrator
- **lib/calriven-persona.js** - AI personality system
- **lib/user-data-vault.js** - Encrypted data storage

---

**Questions?**
- Discord: https://discord.gg/calos
- Email: matt@soulfra.com

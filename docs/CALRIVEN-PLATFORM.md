# CalRiven Platform - Complete Integration

CalRiven is now a fully federated, cryptographically-signed digital identity and publishing platform built by wiring together existing systems from across the CALOS ecosystem.

## What Is CalRiven?

CalRiven is an AI-powered digital identity that:
- **Signs everything** with Soulfra cryptographic signatures (Ed25519 + multi-hash)
- **Publishes federated content** via ActivityPub (compatible with Mastodon/Fediverse)
- **Reviews and engages** through an AI persona embodying CalRiven's voice
- **Verifies identities** through email, domain ownership, and reputation scoring
- **Executes documentation** - code examples test themselves before publishing

## Architecture Overview

### 1. Soulfra Cryptographic Layer
**File:** `lib/soulfra-signer.js` (existing)

CalRiven signs all content with:
- Multi-hash: SHA-256, SHA-512, SHA3-512, Blake3
- Ed25519 digital signatures for proof of authorship
- Timestamped metadata for verification

**Integration:**
- All articles get `soulfra_hash` and `signed_metadata` columns
- Forum posts and curation content are signed
- Signatures verify CalRiven authored the content

### 2. Author Workflow
**Files:** `lib/author-workflow.js`, `routes/author-routes.js`, `migrations/057_author_workflow.sql`

Executable documentation system:
- Write articles with code blocks
- Test code automatically before publishing
- CalRiven AI reviews articles (`POST /api/author/articles/:id/review`)
- Publish with cryptographic signature (`POST /api/author/articles/:id/publish`)
- Generate RSS feeds
- Track analytics

**Key Features:**
- Code blocks are extracted and tested (JavaScript, Python, Bash)
- Articles can't publish if tests fail
- Every published article is signed by CalRiven

### 3. CalRiven AI Persona
**File:** `lib/calriven-persona.js`

AI embodiment of CalRiven that:

#### Personality
- Voice: "Technical but accessible, direct, no bullshit"
- Values: Cryptographic proof, federation, self-sovereign identity
- Catchphrases: "WE ALREADY HAVE THIS", "Wire it together", "Sign everything"

#### Capabilities
```javascript
// Review articles before publishing
const review = await calriven.reviewArticle(article);
// Returns: { review: "...", signature: {...}, signed_at: "..." }

// Respond to comments
const response = await calriven.respondToComment(comment, context);

// Generate thoughts on topics
const thought = await calriven.reflect("the future of federated identity");

// Verify content was signed by CalRiven
const isValid = calriven.verifyCalRivenSignature(content);
```

### 4. Identity Verification System
**Files:** `lib/calriven-identity.js`, `routes/identity-routes.js`

Copied from `document-generator/know-your-name-identity-system.js`

**Features:**
- Email verification with codes
- Domain ownership verification (DNS TXT records, HTML meta tags)
- Platform linking (GitHub, Google, TikTok via OAuth)
- Reputation scoring system

**API Endpoints:**
```bash
POST /api/identity/verify-email        # Send verification code
POST /api/identity/confirm-email       # Confirm with code
POST /api/identity/claim-domain        # Start domain verification
POST /api/identity/verify-domain       # Verify domain ownership
GET  /api/identity/reputation          # Get reputation score
POST /api/identity/link-platform       # Link GitHub/Google/TikTok
GET  /api/identity/profile             # Complete identity profile
```

### 5. ActivityPub Federation
**Files:** `lib/activitypub-server.js`, `routes/federation-routes.js`, `migrations/058_federation.sql`

CalRiven.com federates with Mastodon and other ActivityPub servers.

**Flow:**
1. User on Mastodon searches `@calriven@calriven.com`
2. Mastodon queries `/.well-known/webfinger`
3. Gets actor URL → `/users/calriven`
4. Mastodon sends Follow activity to `/users/calriven/inbox`
5. CalRiven accepts follow, sends articles to follower's inbox

**Endpoints:**
```bash
GET  /.well-known/webfinger           # Identity discovery (WebFinger)
GET  /users/calriven                  # Actor profile (CalRiven's public profile)
POST /users/calriven/inbox            # Receive activities (Follow, Like, Announce)
GET  /users/calriven/outbox           # Published activities (articles as Notes)
GET  /users/calriven/followers        # Followers list
POST /api/federation/publish          # Publish article to all followers
```

**Database Tables:**
- `activitypub_followers` - Mastodon users following CalRiven
- `activitypub_activities` - Incoming activities log
- `activitypub_outbox` - CalRiven's published activities
- `activitypub_keys` - RSA keys for HTTP Signatures

## Complete Workflow Example

### 1. Create and Test Article
```bash
# Create draft
POST /api/author/articles
{
  "title": "Building Federated Identity",
  "slug": "federated-identity",
  "category": "tutorial",
  "content": "Let's build a federated identity system...\n\n```javascript\nconst identity = new CalRivenIdentity();\n```"
}
# Returns article with soulfra_hash signature

# Test code blocks
POST /api/author/articles/1/test
# Extracts and runs JavaScript code, returns results

# Have CalRiven AI review
POST /api/author/articles/1/review
# Returns: {
#   review: "Strong technical piece. I'd add more emphasis on why federation matters...",
#   signature: { sha256: "...", ed25519: "..." },
#   signed_at: "2025-10-19T..."
# }
```

### 2. Publish with Signature
```bash
POST /api/author/articles/1/publish
# Returns article with:
# - soulfra_hash (draft signature)
# - publication_signature (CalRiven's final signature)
# - published_at timestamp
# - RSS feed auto-generated
```

### 3. Federate to Followers
```bash
POST /api/federation/publish
{
  "article_id": 1
}
# Sends ActivityPub Create activity to all Mastodon followers
# Article appears in their timelines
```

### 4. User Interactions
When someone on Mastodon:
- **Follows CalRiven**: Follow activity → inbox → CalRiven accepts
- **Likes an article**: Like activity → inbox → logged
- **Boosts an article**: Announce activity → inbox → logged
- **Comments**: Create activity → inbox → CalRiven AI can respond

## Environment Variables Required

```bash
# CalRiven Cryptographic Keys (Ed25519)
CALRIVEN_PRIVATE_KEY="..."  # Generate with: node -e "const crypto=require('crypto'); const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519',{privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}); console.log('Private:',privateKey); console.log('Public:',publicKey);"
CALRIVEN_PUBLIC_KEY="..."

# ActivityPub RSA Keys (for HTTP Signatures)
# Generate with: openssl genrsa -out private.pem 2048 && openssl rsa -in private.pem -pubout -out public.pem

# LLM Providers (for CalRiven AI Persona)
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
DEEPSEEK_API_KEY="..."
OLLAMA_BASE_URL="http://127.0.0.1:11434"

# Database
DATABASE_URL="postgresql://..."

# Domain
DOMAIN="calriven.com"
BASE_URL="https://calriven.com"
```

## Database Migrations

Run these to set up CalRiven platform:

```bash
# Author workflow with Soulfra signatures
psql $DATABASE_URL -f migrations/057_author_workflow.sql

# ActivityPub federation
psql $DATABASE_URL -f migrations/058_federation.sql
```

## CalRiven's Philosophy

From `lib/calriven-persona.js`:

**Values:**
- Everything should be signed (cryptographic proof)
- Federation over centralization
- Self-sovereign identity
- Executable documentation (tests itself)
- Build on what exists, don't rebuild

**Catchphrases:**
- "WE ALREADY HAVE THIS"
- "Wire it together"
- "Sign everything"
- "Make it federated"

## Testing Federation

### From Mastodon
1. Search for `@calriven@calriven.com`
2. Click Follow
3. CalRiven auto-accepts
4. You'll see CalRiven's articles in your timeline

### From CalRiven
```bash
# Check followers
curl https://calriven.com/users/calriven/followers

# Publish to followers
POST /api/federation/publish
{
  "article_id": 123
}
```

## File Locations

### Core Libraries
- `lib/soulfra-signer.js` - Cryptographic signing (EXISTING)
- `lib/author-workflow.js` - Article workflow with signatures
- `lib/calriven-persona.js` - AI persona
- `lib/calriven-identity.js` - Identity verification
- `lib/activitypub-server.js` - Federation protocol
- `lib/multi-llm-router.js` - LLM routing for AI (EXISTING)

### Routes
- `routes/author-routes.js` - Article endpoints + AI review
- `routes/identity-routes.js` - Identity verification
- `routes/federation-routes.js` - ActivityPub endpoints

### Migrations
- `migrations/057_author_workflow.sql` - Author tables + signatures
- `migrations/058_federation.sql` - ActivityPub tables

### Router
- `router.js` - Lines 1205-1224: Initialize MultiLLMRouter and wire all routes

## What's Next

The platform is fully wired. To deploy:

1. **Generate Keys:**
   ```bash
   # Ed25519 for Soulfra
   node -e "const crypto=require('crypto'); const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519',{privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}); console.log('CALRIVEN_PRIVATE_KEY=\"'+privateKey+'\"'); console.log('CALRIVEN_PUBLIC_KEY=\"'+publicKey+'\"');"

   # RSA for ActivityPub
   openssl genrsa -out activitypub_private.pem 2048
   openssl rsa -in activitypub_private.pem -pubout -out activitypub_public.pem
   ```

2. **Run Migrations:**
   ```bash
   psql $DATABASE_URL -f migrations/057_author_workflow.sql
   psql $DATABASE_URL -f migrations/058_federation.sql
   ```

3. **Update RSA Keys in Migration:**
   Edit `migrations/058_federation.sql` line 57-58 with real RSA keys

4. **Configure Domain:**
   - Point DNS for `calriven.com` to server
   - Set up SSL certificate
   - Ensure WebFinger is accessible at `https://calriven.com/.well-known/webfinger`

5. **Test:**
   ```bash
   # Start server
   node router.js

   # Test endpoints
   curl http://localhost:3000/api/author/published
   curl http://localhost:3000/.well-known/webfinger?resource=acct:calriven@calriven.com
   ```

## Summary

CalRiven is NOW:
✅ Cryptographically signed identity (Soulfra)
✅ Publishing platform (executable documentation)
✅ Identity verification (email, domain, reputation)
✅ Federated hub (ActivityPub/Mastodon)
✅ AI persona (reviews, engages, reflects)

Everything is wired. Ready to deploy.

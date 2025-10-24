# Ollama Session Contract Workflow

**DocuSign-like contract signing for AI work sessions**

Ollama streaming sessions become verifiable "contracts" that track your AI work, costs, and context sharing with cryptographic proof.

---

## Overview

### The Problem

You chat with local Ollama (free), but when you switch to GPT-4 or Claude for client work, you need:
- **Verifiable proof** of what AI work was done
- **Cost tracking** per client
- **Immutable records** that can't be tampered with
- **Shareable contracts** to show clients what they're paying for

### The Solution

Transform Ollama sessions into **DocuSign-like contracts**:

1. **Draft** → Chat with Ollama, switch models, work on client projects
2. **Review** → See timeline, costs, messages (like reviewing a contract)
3. **Approve** → Agree to pay the costs
4. **Sign** → Cryptographically sign with Soulfra (makes it immutable)
5. **Share** → Send client a public link with cryptographic proof

---

## Contract Lifecycle

```
draft → review → approved → signed → executed → completed
```

### 1. Draft (Active Session)

Session is active, you're chatting with Ollama:

```bash
# Start session
curl -X POST http://localhost:5001/api/ollama/session/start \
  -H "Cookie: session_token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "sessionName": "Client ABC Pricing Calculator",
    "primaryModel": "ollama:mistral",
    "domainId": "uuid-of-client-abc"
  }'

# Returns: { "sessionId": "uuid", "session": {...} }
```

### 2. Review (End Session, Enter Review)

After ending session, enter review mode:

```bash
# End session
curl -X POST http://localhost:5001/api/ollama/session/{sessionId}/end \
  -H "Cookie: session_token=..."

# Enter review mode
curl -X POST http://localhost:5001/api/ollama/session/{sessionId}/review \
  -H "Cookie: session_token=..."

# Returns:
{
  "success": true,
  "sessionId": "uuid",
  "contractStatus": "review",
  "reviewData": {
    "summary": {
      "sessionName": "Client ABC Pricing Calculator",
      "duration": "2h 15m",
      "totalMessages": 47,
      "totalTokens": 23450,
      "totalCost": 2.34
    },
    "messages": [...],    // All conversation messages
    "timeline": [...],    // Interleaved messages + context streams
    "terms": "..."        // Contract terms (auto-generated)
  }
}
```

### 3. Approve (Agree to Costs)

Approve the costs:

```bash
curl -X POST http://localhost:5001/api/ollama/session/{sessionId}/approve \
  -H "Cookie: session_token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "approvedCostCeiling": 10.00
  }'

# Returns:
{
  "success": true,
  "sessionId": "uuid",
  "contractStatus": "approved",
  "approvedCost": 2.34,
  "approvedCeiling": 10.00
}
```

**What happens:**
- Session moves to `approved` status
- Approved cost recorded (`$2.34`)
- Optional: Set cost ceiling (`$10.00 max`)
- If current cost > ceiling → Error (reject approval)

### 4. Sign (Cryptographic Signature)

Sign the contract with Soulfra:

```bash
curl -X POST http://localhost:5001/api/ollama/session/{sessionId}/sign \
  -H "Cookie: session_token=..." \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "clientName": "Client ABC",
      "projectName": "Pricing Calculator"
    }
  }'

# Returns:
{
  "success": true,
  "sessionId": "uuid",
  "contractStatus": "signed",
  "signedAt": "2024-10-22T12:34:56Z",
  "soulfraHash": {
    "sha256": "abc123...",
    "sha512": "def456...",
    "sha3_512": "ghi789...",
    "blake3b": "jkl012...",
    "ed25519_signature": "mno345..."
  },
  "soulfraVersion": "1.0.0",
  "isImmutable": true,
  "publicShareUrl": "/ollama/session/{sessionId}/contract?token=xyz"
}
```

**What happens:**
- ✅ Session becomes **immutable** (cannot be modified)
- ✅ **Soulfra signature** applied (5 cryptographic hashes)
- ✅ **Public share URL** generated
- ✅ Session ready for billing/invoicing

**⚠️ IMPORTANT: Once signed, session cannot be edited!**

### 5. Verify (Check Signature)

Verify the cryptographic signature:

```bash
curl http://localhost:5001/api/ollama/session/{sessionId}/verify \
  -H "Cookie: session_token=..."

# Returns:
{
  "success": true,
  "sessionId": "uuid",
  "isValid": true,
  "soulfraHash": {...},
  "signedAt": "2024-10-22T12:34:56Z",
  "version": "1.0.0"
}
```

**Verification checks:**
- ✅ Session data hasn't changed since signing
- ✅ Soulfra hash matches current session state
- ✅ Ed25519 signature is valid

### 6. Share (Public Contract)

Share signed contract publicly:

```bash
# Anyone can view (no auth required)
curl http://localhost:5001/api/ollama/session/{sessionId}/public

# Returns:
{
  "success": true,
  "sessionId": "uuid",
  "contractStatus": "signed",
  "signedAt": "2024-10-22T12:34:56Z",
  "soulfraHash": {...},
  "summary": {...},
  "messages": [...],
  "timeline": [...],
  "totalCost": 2.34,
  "isImmutable": true,
  "publicShareUrl": "/ollama/session/{sessionId}/contract?token=xyz"
}
```

**Use cases:**
- Send public link to client
- Include in invoice/report
- Prove work was done
- Show cryptographic proof

---

## Versioning

Sessions track version changes automatically:

```javascript
{
  "version": 3,                    // Current version
  "versionHistory": [
    {
      "version": 1,
      "timestamp": "2024-10-22T10:00:00Z",
      "reason": "session_started"
    },
    {
      "version": 2,
      "timestamp": "2024-10-22T10:30:00Z",
      "reason": "domain_switch",
      "changes": {
        "previousDomain": "local",
        "newDomain": "client-abc.com",
        "previousModel": "ollama:mistral",
        "newModel": "gpt-4"
      }
    },
    {
      "version": 3,
      "timestamp": "2024-10-22T11:00:00Z",
      "reason": "model_upgrade",
      "changes": {
        "previousModel": "gpt-4",
        "newModel": "gpt-4-turbo"
      }
    }
  ]
}
```

**Version increments when:**
- Domain switch (local Ollama → client domain)
- Model upgrade (Ollama → GPT-4 → GPT-4 Turbo)
- Context stream to external model
- Session forked (create variation)

**Once signed: Version freezes** (immutable)

---

## WASM Security

### CSP Headers (Content Security Policy)

Automatically applied to all responses:

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; worker-src 'self'; child-src 'none'; object-src 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

**Blocks:**
- ✅ Malicious WASM execution
- ✅ Cross-site scripting (XSS)
- ✅ Clickjacking
- ✅ MIME type sniffing attacks

### WASM Detection

All uploads scanned for WASM bytecode:

```javascript
// Automatically blocks WASM uploads
const wasmSecurity = new WasmSecurity({
  strictMode: false,              // Set true to block ALL WASM
  maxCompilationsPerMinute: 10    // Rate limit WASM compilation
});

app.use(wasmSecurity.uploadScanMiddleware({
  blockUntrusted: true  // Block all WASM except whitelist
}));
```

**Detection methods:**
- Magic number check (`\0asm`)
- Bytecode scanning
- SHA256 hash verification
- Whitelist trusted WASM

### Rate Limiting

WASM compilation rate limited per IP:

```
10 compilations per minute
429 Too Many Requests if exceeded
```

**Environment variables:**
```bash
# .env
WASM_SECURITY_VERBOSE=true  # Log WASM activity
WASM_STRICT_MODE=false      # Block all WASM if true
WASM_MAX_COMPILATIONS_PER_MINUTE=10
ALLOW_WASM=false            # Global WASM toggle
```

---

## API Reference

### Contract Workflow Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/ollama/session/:id/review` | POST | ✅ | Enter review mode |
| `/api/ollama/session/:id/approve` | POST | ✅ | Approve costs |
| `/api/ollama/session/:id/sign` | POST | ✅ | Sign with Soulfra |
| `/api/ollama/session/:id/verify` | GET | ✅ | Verify signature |
| `/api/ollama/session/:id/export-pdf` | POST | ✅ | Export as PDF |
| `/api/ollama/session/:id/public` | GET | ❌ | Public contract (no auth) |

### Session Management Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/ollama/session/start` | POST | ✅ | Start session |
| `/api/ollama/session/:id/chat` | POST | ✅ | Send message |
| `/api/ollama/session/:id/switch` | POST | ✅ | Switch domain/model |
| `/api/ollama/session/:id/end` | POST | ✅ | End session |
| `/api/ollama/session/:id/summary` | GET | ✅ | Get summary |
| `/api/ollama/sessions` | GET | ✅ | List sessions |

---

## Security

### Cryptographic Signing (Soulfra)

**5-layer cryptographic proof:**

1. **SHA-256**: Fast hash (collision-resistant)
2. **SHA-512**: Stronger hash (512-bit)
3. **SHA3-512**: NIST standard (Keccak)
4. **Blake3**: Modern, fast, parallel
5. **Ed25519**: Digital signature (public key)

**Verification:**
- Recreate session data from database
- Hash with same 5 algorithms
- Compare hashes → Must match EXACTLY
- Ed25519 signature proves authorship

### Immutability

Once signed:
- ❌ Cannot edit messages
- ❌ Cannot change costs
- ❌ Cannot modify metadata
- ❌ Cannot delete session
- ✅ Can only view/verify

**Database enforces:**
```sql
UPDATE ollama_streaming_sessions
SET is_immutable = true, immutable_since = NOW()
WHERE session_id = $1;

-- Future edits blocked by trigger
-- (implementation pending)
```

---

## Use Cases

### 1. Freelance AI Consulting

**Scenario:** Build AI features for clients using Ollama locally, switch to GPT-4 when needed.

**Workflow:**
1. Start session for Client ABC
2. Chat with local Ollama (free)
3. Switch to GPT-4 when client needs OpenAI branding
4. End session → Review costs → Sign contract
5. Send client public link with cryptographic proof
6. Invoice based on approved costs

**Benefits:**
- ✅ Proof of work
- ✅ Transparent costs
- ✅ Cryptographic verification
- ✅ Professional contract

### 2. Agency Work Tracking

**Scenario:** Agency works on multiple client projects, needs to track AI costs per client.

**Workflow:**
1. Start session per client project
2. Track which models used (Ollama vs. GPT-4 vs. Claude)
3. Context streams tracked when switching clients
4. End-of-month: Review all sessions → Approve → Sign
5. Export PDFs for client invoices

**Benefits:**
- ✅ Per-client cost breakdown
- ✅ Multi-domain support
- ✅ Audit trail
- ✅ Automated billing

### 3. Legal/Compliance

**Scenario:** Legal team needs tamper-proof records of AI usage.

**Workflow:**
1. Start session for legal research
2. Chat with Ollama → Get Claude opinion → Get GPT-4 summary
3. End session → Sign immediately
4. Store signed contract in compliance system
5. Verify signature anytime to prove authenticity

**Benefits:**
- ✅ Immutable records
- ✅ Cryptographic proof
- ✅ Audit trail
- ✅ Non-repudiation

---

## Configuration

### Environment Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calos
DB_USER=matthewmauer

# WASM Security
WASM_SECURITY_VERBOSE=true
WASM_STRICT_MODE=false
WASM_MAX_COMPILATIONS_PER_MINUTE=10
ALLOW_WASM=false

# Soulfra
SOULFRA_VERSION=1.0.0

# API
BASE_URL=http://localhost:5001
```

### Database Migration

Run migration 071 to add contract columns:

```bash
npm run migrate
```

**What it does:**
- Adds `contract_status` column
- Adds `soulfra_hash`, `signed_at`, `is_immutable` columns
- Adds `version`, `version_history` columns
- Creates indexes for contract queries

---

## Troubleshooting

### "Session must be ended before review"

**Problem:** Trying to review active session.

**Solution:** End session first:
```bash
curl -X POST /api/ollama/session/{sessionId}/end
```

### "Cannot review session in signed status"

**Problem:** Session already signed (immutable).

**Solution:** Create new session or fork existing:
```bash
# Fork creates editable copy
curl -X POST /api/ollama/session/{sessionId}/fork
```

### "Current cost exceeds approved ceiling"

**Problem:** Costs increased after approval.

**Solution:** Approve with higher ceiling:
```bash
curl -X POST /api/ollama/session/{sessionId}/approve \
  -d '{"approvedCostCeiling": 20.00}'
```

### "Session not signed (no Soulfra hash)"

**Problem:** Trying to verify unsigned session.

**Solution:** Sign first:
```bash
curl -X POST /api/ollama/session/{sessionId}/sign
```

---

## Next Steps

1. ✅ **Read ADR-003** → `docs/adr/003-ollama-streaming-sessions.md`
2. ✅ **Test workflow** → Follow examples above
3. ⏳ **Build frontend UI** → `public/ollama-session-contract.html` (coming soon)
4. ⏳ **Integrate Guardian** → Auto-monitor sessions
5. ⏳ **Add PDF export** → Requires pdfkit or puppeteer

---

## Resources

- **ADR-003:** Architecture Decision Record
- **API Reference:** `routes/ollama-session-routes.js`
- **Contract Manager:** `lib/ollama-session-contract.js`
- **Version Manager:** `lib/version-manager.js`
- **WASM Security:** `lib/wasm-security.js`
- **Soulfra Signer:** `lib/soulfra-signer.js`

---

**Built with ❤️ by CALOS**

*DocuSign-like contracts • Soulfra cryptographic signing • WASM security • Version tracking*

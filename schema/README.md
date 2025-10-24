# CalOS Schema Standard

**Own your schema. Zero dependencies. Privacy-first.**

## Philosophy

CalOS Schema is NOT:
- ❌ Apache Foundation standards
- ❌ JSON-LD (external context dependencies)
- ❌ OpenAPI 3.0 (overcomplicated)
- ❌ GraphQL SDL (vendor lock-in)
- ❌ Protobuf (compiled, not human-readable)

CalOS Schema IS:
- ✅ Your own schema (you own it)
- ✅ Zero external dependencies
- ✅ Privacy-first (PII encryption built-in)
- ✅ JSON Schema Draft 7 (widely supported)
- ✅ Human-readable JSON
- ✅ MIT licensed (use freely)

## Quick Start

```javascript
const schema = require('./calos-schema.json');

// Validate user object
const user = {
  userId: 'user123',
  email: 'test@example.com', // Will be encrypted at rest
  username: 'testuser',
  createdAt: new Date().toISOString()
};

// Check schema definition
console.log(schema.definitions.User);
// {
//   type: 'object',
//   required: ['userId'],
//   properties: {
//     userId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{8,64}$' },
//     email: { type: 'string', format: 'email', privacy: 'ENCRYPT' },
//     ...
//   }
// }
```

## Privacy Levels

CalOS Schema defines privacy annotations for all fields:

| Level | Usage | Example |
|-------|-------|---------|
| `ENCRYPT` | AES-256-GCM encryption at rest | Email, API keys |
| `HASH` | SHA-256 hash (not reversible) | IP addresses, device fingerprints |
| `METADATA` | Non-sensitive metadata | Encryption IVs, salts |
| `PUBLIC` | Public data | User IDs, achievements, XP |

### Example: Privacy Annotations

```json
{
  "email": {
    "type": "string",
    "format": "email",
    "privacy": "ENCRYPT"
  },
  "clientIp": {
    "type": "string",
    "privacy": "HASH"
  },
  "userId": {
    "type": "string",
    "privacy": "PUBLIC"
  }
}
```

## Core Definitions

### User
User identity (privacy-first).

**Fields:**
- `userId` (required, public) - Unique user ID (NOT email)
- `email` (ENCRYPT) - Encrypted at rest
- `username` (public) - Display name
- `createdAt` (public) - ISO 8601 timestamp

### Project
GitHub Pages project or standalone app.

**Fields:**
- `projectName` (required) - Slug (lowercase, dashes)
- `ownerId` (required) - User ID of owner
- `githubPagesUrl` - GitHub Pages URL
- `databaseName` - Optional separate database
- `tier` - trial/pro/enterprise
- `status` - active/suspended/archived

### RPGPlayer
Player progression (GameBoy/NES RPG style).

**Fields:**
- `userId` (required)
- `level` (1-99) - Current level
- `xp` (0-99) - XP in current level (100 = level up)
- `totalXp` - Lifetime XP (for leaderboard)
- `stats` - HP, MP, ATK, DEF, Speed
- `achievements` - Array of achievement IDs
- `inventory` - Array of items

### Quest
RPG quest/mission.

**Fields:**
- `questId` (required) - Quest identifier
- `name` (required) - Quest name
- `questType` - achievement/daily/weekly/monthly
- `xpReward` - XP awarded on completion
- `itemReward` - Item awarded
- `requirements` - Requirements to complete

### Card
Engineering card (Cards Against Humanity style).

**Fields:**
- `cardId` (required) - Unique card ID
- `packId` (required) - Culture pack ID
- `rarity` - common/rare/epic/legendary/mythic
- `prompt` - Card prompt (e.g. "This code has ___")
- `response` - Card response (e.g. "God object with 5000 lines")
- `teachingTool` - Educational card?

### UsageEvent
API usage tracking event.

**Fields:**
- `userId` (required)
- `deviceFingerprint` (HASH) - Hashed device ID
- `clientIp` (HASH) - Hashed IP address
- `origin` - GitHub Pages URL
- `endpoint` - API endpoint
- `provider` - openai/anthropic/deepseek/ollama
- `model` - Model name
- `keySource` - byok/system
- `promptTokens`, `completionTokens`, `totalTokens`
- `costCents` - Cost in cents (USD)
- `durationMs` - Request duration

### APIKey
BYOK API key (per project or user).

**Fields:**
- `provider` (required) - openai/anthropic/deepseek/ollama
- `encryptedKey` (ENCRYPT) - AES-256-GCM encrypted
- `encryptionIv` (METADATA) - Initialization vector
- `label` - User-friendly label
- `isActive` - Active status
- `lastUsedAt` - Last use timestamp

### MCPTool
MCP server tool definition.

**Fields:**
- `name` (required) - Tool name (snake_case)
- `description` (required) - Tool description
- `inputSchema` (required) - JSON Schema for input
- `privacy.externalCalls` - Does tool make external calls?
- `privacy.telemetry` - Does tool send telemetry?

## Database Conventions

### Naming
- **Tables:** `snake_case` (e.g. `rpg_players`, `usage_events`)
- **Columns:** `snake_case` (e.g. `user_id`, `created_at`)
- **Indexes:** `idx_<table>_<columns>` (e.g. `idx_rpg_players_user`)

### Timestamps
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- `updated_at TIMESTAMPTZ DEFAULT NOW()`

### Privacy
- **PII columns:** Prefix with `encrypted_` or `hashed_`
- **Audit logs:** Track all access to PII data

### Example Table

```sql
CREATE TABLE rpg_players (
  id SERIAL PRIMARY KEY,

  -- Privacy: PUBLIC
  user_id VARCHAR(255) UNIQUE NOT NULL,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  total_xp INTEGER DEFAULT 0,

  -- Privacy: PUBLIC (JSON)
  achievements JSONB DEFAULT '[]',
  stats JSONB DEFAULT '{"hp": 20, "mp": 10, "atk": 5, "def": 5, "speed": 5}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_rpg_players_user (user_id),
  INDEX idx_rpg_players_level (level DESC, total_xp DESC)
);
```

## API Conventions

### Versioning
URL-based: `/api/v1/...`

### Authentication
Headers:
- `X-User-ID` - User identifier
- `X-API-Key` - BYOK API key (optional)

**Privacy:** NO session tokens in URLs (use headers only)

### Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error type",
  "message": "Human-readable error message"
}
```

### Privacy
- **NO tracking pixels** in API responses
- **NO analytics** embedded in responses
- **CORS:** Only localhost origins for MCP servers

## Zero Dependencies

This schema has **zero external dependencies**:

**Not using:**
- Apache standards
- JSON-LD
- OpenAPI 3.0
- GraphQL SDL
- Protobuf
- Avro

**Using:**
- JSON Schema Draft 7 (widely supported)
- Pure JSON (no external refs)

## Validation

```javascript
const Ajv = require('ajv');
const schema = require('./calos-schema.json');

const ajv = new Ajv();

// Validate user
const validateUser = ajv.compile(schema.definitions.User);
const valid = validateUser({ userId: 'user123', username: 'test' });

if (!valid) {
  console.error(validateUser.errors);
}
```

## License

**MIT License** - Use freely, own your implementation.

Unlike Apache or other foundation-controlled schemas, CalOS Schema is MIT licensed. You can:
- Fork it
- Modify it
- Use it commercially
- Keep your modifications private
- No contributor agreements needed

---

**Built with 🔥 by CALOS**

*Own your schema. Zero dependencies. Privacy-first.*

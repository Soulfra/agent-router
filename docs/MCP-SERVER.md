# CalOS MCP Server

**Privacy-first Model Context Protocol server**
Zero dependencies • 100% local • No telemetry

## Philosophy

Unlike Anthropic's MCP servers that may phone home or require external services, CalOS MCP Server is:

- **Privacy-first** - NO telemetry, NO external calls, EVER
- **Local-only** - Runs on localhost, no internet required
- **Zero-dependency** - Uses only Node.js built-ins (http, fs, child_process)
- **Open standards** - Compatible with MCP protocol but owned by you
- **Own your schema** - Not tied to external standards or vendors

## Quick Start

### Start the MCP Server

```javascript
const CalOSMCPServer = require('./lib/mcp-server/calos-mcp-server');

const mcpServer = new CalOSMCPServer({
  db: yourDatabaseConnection, // Optional
  port: 3100,
  host: 'localhost'
});

await mcpServer.start();
// [CalOS MCP] Server listening on http://localhost:3100
// [CalOS MCP] Privacy-first mode: NO telemetry, NO external calls
```

### Use the MCP Client

```javascript
const CalOSMCPClient = require('./lib/mcp-server/mcp-client');

const client = new CalOSMCPClient('http://localhost:3100');

// List available tools
const tools = await client.listTools();
console.log(tools.tools); // [{ name: 'database_query', ... }, ...]

// Query database
const result = await client.query('SELECT * FROM users WHERE id = $1', [123]);
console.log(result.rows);

// Read file
const content = await client.readFile('./package.json');

// Write file
await client.writeFile('./output.txt', 'Hello World');

// Search code
const matches = await client.grep('TODO', './lib', true);
console.log(matches.matches); // ['./lib/foo.js:42: // TODO: fix this']

// Find files
const files = await client.find('*.js', './lib');
console.log(files.files); // ['./lib/foo.js', './lib/bar.js']

// RPG: Get player stats
const player = await client.getPlayer('user123');
console.log(player); // { userId: 'user123', level: 5, xp: 42, ... }

// RPG: Award XP
const result = await client.awardXP('user123', 50, 'Completed quest');
console.log(result); // { awarded: 50, level: 6, leveledUp: true, ... }
```

## Available Tools

### Database Tools

#### `database_query`
Execute SQL query on local database.

**Privacy:** Only SELECT queries allowed.

```javascript
await client.call('database_query', {
  query: 'SELECT * FROM users WHERE email = $1',
  params: ['test@example.com']
});
// Returns: { rows: [...], rowCount: 1 }
```

### File System Tools

#### `filesystem_read`
Read file contents from local filesystem.

**Privacy:** Only project directory accessible.

```javascript
await client.call('filesystem_read', {
  path: './package.json'
});
// Returns: { content: '...', path: './package.json' }
```

#### `filesystem_write`
Write content to local filesystem.

**Privacy:** Only project directory accessible.

```javascript
await client.call('filesystem_write', {
  path: './output.txt',
  content: 'Hello World'
});
// Returns: { success: true, path: './output.txt', bytes: 11 }
```

#### `filesystem_list`
List files in directory.

**Privacy:** Only project directory accessible.

```javascript
await client.call('filesystem_list', {
  path: './lib'
});
// Returns: { path: './lib', entries: [{ name: 'foo.js', type: 'file' }, ...] }
```

### Code Analysis Tools

#### `code_grep`
Search code using grep.

**Privacy:** Only project directory accessible.

```javascript
await client.call('code_grep', {
  pattern: 'TODO',
  path: './lib',
  ignoreCase: true
});
// Returns: { pattern: 'TODO', matches: ['./lib/foo.js:42: // TODO: fix this'], count: 1 }
```

#### `code_find`
Find files by name or pattern.

**Privacy:** Only project directory accessible.

```javascript
await client.call('code_find', {
  pattern: '*.js',
  path: './lib'
});
// Returns: { pattern: '*.js', files: ['./lib/foo.js', './lib/bar.js'], count: 2 }
```

### RPG/Game Tools

#### `rpg_get_player`
Get player stats (level, XP, achievements).

```javascript
await client.call('rpg_get_player', {
  userId: 'user123'
});
// Returns: { userId: 'user123', level: 5, xp: 42, totalXp: 442, achievements: [...], newPlayer: false }
```

#### `rpg_award_xp`
Award XP to player (auto level-up).

```javascript
await client.call('rpg_award_xp', {
  userId: 'user123',
  amount: 50,
  reason: 'Completed quest: First Card'
});
// Returns: { userId: 'user123', awarded: 50, level: 6, xp: 0, leveledUp: true, levelsGained: 1 }
```

**Leveling system:**
- 100 XP per level
- Automatically levels up when XP >= 100
- Tracks total lifetime XP

## API Endpoints

### `GET /mcp/tools`
List all available tools.

**Response:**
```json
{
  "tools": [
    {
      "name": "database_query",
      "description": "Execute SQL query on local database",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string" },
          "params": { "type": "array" }
        },
        "required": ["query"]
      }
    }
  ],
  "privacy": {
    "telemetry": false,
    "externalCalls": false,
    "localOnly": true
  }
}
```

### `POST /mcp/call`
Execute a tool.

**Request:**
```json
{
  "tool": "database_query",
  "input": {
    "query": "SELECT * FROM users WHERE id = $1",
    "params": [123]
  }
}
```

**Response:**
```json
{
  "success": true,
  "tool": "database_query",
  "result": {
    "rows": [...],
    "rowCount": 1
  }
}
```

### `GET /mcp/health`
Health check.

**Response:**
```json
{
  "status": "healthy",
  "tools": 8,
  "privacy": {
    "telemetry": false,
    "externalCalls": false
  },
  "uptime": 1234.56
}
```

## Privacy & Security

### Privacy Guarantees

1. **NO telemetry** - Zero tracking, zero analytics, zero external calls
2. **Local-only** - Only accessible from localhost
3. **Sandboxed** - File operations restricted to project directory
4. **Read-only database** - Only SELECT queries allowed
5. **No external dependencies** - Uses only Node.js built-ins

### Security Features

- **Path traversal protection** - Cannot access files outside project root
- **SQL injection protection** - Parameterized queries only
- **CORS restricted** - Only localhost origins allowed
- **No external network** - Server never makes outbound requests

## Integration with Existing Systems

### Card Game System

The MCP server integrates with the existing card game system:

```javascript
// Award XP when opening card packs
const cards = await cardCollection.openPack('user123', 'anti-patterns', 5);
await mcpClient.awardXP('user123', 10, 'Opened card pack');

// Award XP for roasting code
await cardRoasting.submitVote('user123', cardId, 'cringe', 'This is bad');
await mcpClient.awardXP('user123', 15, 'Roasted bad code');

// Check player progress
const player = await mcpClient.getPlayer('user123');
if (player.level >= 10) {
  // Unlock special features
}
```

### Database Schema

The MCP server creates these tables (see `migrations/151_rpg_system.sql`):

- `rpg_players` - Player stats (level, XP, achievements)
- `rpg_xp_log` - XP event log
- `rpg_quests` - Quest definitions
- `rpg_player_quests` - Player quest progress
- `rpg_achievements` - Achievement definitions

## Architecture

```
┌─────────────────────────────────────────────────┐
│         CalOS MCP Server (localhost:3100)       │
│                                                 │
│  Privacy-first • Zero deps • Local-only         │
└─────────────────────────────────────────────────┘
                      ▲
                      │ HTTP (localhost only)
                      │
        ┌─────────────┴─────────────┐
        │                           │
┌───────▼────────┐         ┌────────▼────────┐
│  MCP Client    │         │  Web Frontend   │
│  (Node.js)     │         │  (JavaScript)   │
└────────────────┘         └─────────────────┘

Tools:
  - Database Query (SELECT only)
  - File System (project dir only)
  - Code Search (grep/find)
  - RPG System (XP/levels)
```

## Differences from Anthropic's MCP

| Feature | Anthropic MCP | CalOS MCP |
|---------|---------------|-----------|
| Telemetry | May phone home | **NEVER** |
| External deps | Yes (SDK, libs) | **Zero** |
| Network | May call APIs | **Local-only** |
| Schema | Anthropic's | **Your own** |
| Privacy | Unknown | **Guaranteed** |
| Cost | Free (now) | **Free forever** |

## Example: Full RPG Quest System

```javascript
const CalOSMCPServer = require('./lib/mcp-server/calos-mcp-server');
const CalOSMCPClient = require('./lib/mcp-server/mcp-client');

// Start server
const server = new CalOSMCPServer({ db, port: 3100 });
await server.start();

// Connect client
const client = new CalOSMCPClient('http://localhost:3100');

// Player opens first card pack
const cards = await cardCollection.openPack('user123', 'anti-patterns', 5);

// Award XP
const xpResult = await client.awardXP('user123', 10, 'Opened first card pack');
console.log(xpResult);
// {
//   userId: 'user123',
//   awarded: 10,
//   reason: 'Opened first card pack',
//   level: 1,
//   xp: 10,
//   totalXp: 10,
//   leveledUp: false,
//   levelsGained: 0
// }

// Later: Award 100 XP (level up!)
const levelUp = await client.awardXP('user123', 100, 'Completed quest');
console.log(levelUp);
// {
//   userId: 'user123',
//   awarded: 100,
//   level: 2,
//   xp: 10, // (10 + 100 = 110, 110 - 100 = 10 remaining in level 2)
//   totalXp: 110,
//   leveledUp: true,
//   levelsGained: 1
// }

// Get player stats
const player = await client.getPlayer('user123');
console.log(player);
// {
//   userId: 'user123',
//   level: 2,
//   xp: 10,
//   totalXp: 110,
//   achievements: [],
//   newPlayer: false
// }
```

## Contributing

CalOS MCP Server is AGPLv3 licensed (like the rest of CalOS core). See LICENSE.

**Philosophy:**
- Privacy-first, always
- Zero dependencies, always
- Local-only, always
- No telemetry, ever

---

**Built with 🔥 by CALOS**

*Your MCP server. Your data. Your privacy.*

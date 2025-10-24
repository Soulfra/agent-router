# Lesson 1: Introduction to CalOS MCP Servers

**Track:** Privacy-First MCP Development
**Lesson:** 1 of 8
**XP Reward:** 100
**Time:** 20 minutes
**Prerequisites:** None

## Learning Objectives

By the end of this lesson, you will:
- ✅ Understand what MCP (Model Context Protocol) is
- ✅ Know why privacy-first matters
- ✅ See the difference between Anthropic's MCP and CalOS MCP
- ✅ Install and run the CalOS MCP server

## What is MCP?

**Model Context Protocol (MCP)** is a protocol that allows AI models to call tools and interact with external systems.

Think of it like this:
- **Without MCP:** AI can only chat, generate text
- **With MCP:** AI can query databases, read files, search code, execute commands

## Why Privacy-First?

Most MCP servers (including Anthropic's) may:
- ❌ Send telemetry to external servers
- ❌ Make external API calls
- ❌ Track usage analytics
- ❌ Require cloud services

**CalOS MCP Server is different:**
- ✅ Zero telemetry (no tracking, ever)
- ✅ 100% local-only (no internet required)
- ✅ Zero external dependencies (only Node.js built-ins)
- ✅ You own the server and data

## CalOS MCP vs Anthropic MCP

| Feature | Anthropic MCP | CalOS MCP |
|---------|---------------|-----------|
| **Telemetry** | May phone home | NEVER |
| **External deps** | Yes (SDK, libs) | Zero |
| **Network** | May call APIs | Local-only |
| **Schema** | Anthropic's | Your own |
| **Privacy** | Unknown | Guaranteed |
| **Cost** | Free (now) | Free forever |

## Available Tools

CalOS MCP Server provides 8 built-in tools:

### Database Tools
- `database_query` - Execute SQL (SELECT only, privacy-safe)

### File System Tools
- `filesystem_read` - Read files (project directory only)
- `filesystem_write` - Write files (project directory only)
- `filesystem_list` - List directories

### Code Analysis Tools
- `code_grep` - Search code with grep
- `code_find` - Find files by pattern

### RPG/Game Tools
- `rpg_get_player` - Get player stats (level, XP, achievements)
- `rpg_award_xp` - Award XP to players (auto level-up)

## Lab: Install and Run MCP Server

### Step 1: Navigate to Project

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router
```

### Step 2: Start the MCP Server

```bash
./bin/mcp-server
```

**Expected output:**
```
[CalOS MCP] Initialized privacy-first MCP server
[CalOS MCP] Database connected
[CalOS MCP] Server listening on http://localhost:3100
[CalOS MCP] Privacy-first mode: NO telemetry, NO external calls

┌────────────────────────────────────────────────────────┐
│         CalOS MCP Server - Privacy First              │
└────────────────────────────────────────────────────────┘

  Server:     http://localhost:3100
  Tools:      8 available
  Database:   Connected

  Privacy:    ✓ NO telemetry
              ✓ NO external calls
              ✓ Local-only access

  Endpoints:
    GET  /mcp/tools    - List tools
    POST /mcp/call     - Execute tool
    GET  /mcp/health   - Health check

  Press Ctrl+C to stop
```

### Step 3: Test Health Endpoint

Open a new terminal and run:

```bash
curl http://localhost:3100/mcp/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "tools": 8,
  "privacy": {
    "telemetry": false,
    "externalCalls": false
  },
  "uptime": 12.345
}
```

### Step 4: List Available Tools

```bash
curl http://localhost:3100/mcp/tools
```

**Expected response:**
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
    },
    // ... 7 more tools
  ],
  "privacy": {
    "telemetry": false,
    "externalCalls": false,
    "localOnly": true
  }
}
```

### Step 5: Call a Tool

Let's read the package.json file:

```bash
curl -X POST http://localhost:3100/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "filesystem_read",
    "input": { "path": "./package.json" }
  }'
```

**Expected response:**
```json
{
  "success": true,
  "tool": "filesystem_read",
  "result": {
    "content": "{\"name\": \"agent-router\", ...}",
    "path": "./package.json"
  }
}
```

## Privacy Guarantees

When you run CalOS MCP Server, it:

1. **Never sends telemetry** - Zero tracking, no analytics
2. **Only listens on localhost** - Not accessible from internet
3. **Sandboxed file access** - Cannot access files outside project directory
4. **Read-only database** - Only SELECT queries allowed (no INSERT/UPDATE/DELETE)
5. **No external network calls** - Server never makes outbound requests

## Verification

You can verify privacy by:

### 1. Check CORS Headers
```bash
curl -I http://localhost:3100/mcp/health
```

Should return:
```
Access-Control-Allow-Origin: http://localhost:*
```

### 2. Check for Tracking Headers
```bash
curl -v http://localhost:3100/mcp/health 2>&1 | grep -i "tracking\|analytics\|telemetry"
```

Should return **nothing** (no tracking headers).

### 3. Monitor Network Traffic
```bash
# In one terminal, start MCP server
./bin/mcp-server

# In another terminal, monitor network connections
lsof -i -P | grep node | grep LISTEN
```

Should show **only localhost:3100** (no external connections).

## Summary

You've learned:
- ✅ What MCP is (Model Context Protocol)
- ✅ Why CalOS MCP is privacy-first (zero telemetry, local-only)
- ✅ How it differs from Anthropic's MCP
- ✅ How to run the server and call tools

## Next Lesson

**Lesson 2: Using MCP Client with Fetch**

Learn how to call MCP tools from JavaScript using `fetch()` in the browser.

## Quiz

1. What is the primary difference between CalOS MCP and Anthropic MCP?
   - a) CalOS is faster
   - b) CalOS is privacy-first with zero telemetry
   - c) CalOS has more tools
   - d) CalOS costs less

2. Which port does CalOS MCP server run on by default?
   - a) 3000
   - b) 3100
   - c) 5000
   - d) 8080

3. What types of SQL queries are allowed for privacy?
   - a) All queries
   - b) Only SELECT queries
   - c) Only INSERT queries
   - d) No queries allowed

**Answers:** 1-b, 2-b, 3-b

## Resources

- MCP Server Docs: `docs/MCP-SERVER.md`
- MCP Server Code: `lib/mcp-server/calos-mcp-server.js`
- MCP Client Code: `lib/mcp-server/mcp-client.js`

---

**🎴 Achievement Unlocked:** First MCP Lesson (+100 XP)

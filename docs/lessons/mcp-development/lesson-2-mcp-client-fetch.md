# Lesson 2: Using MCP Client with Fetch

**Track:** Privacy-First MCP Development
**Lesson:** 2 of 8
**XP Reward:** 120
**Time:** 30 minutes
**Prerequisites:** Lesson 1 (Intro to MCP)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Connect to MCP server using vanilla JavaScript
- ✅ Make tool calls with `fetch()`
- ✅ Handle responses and errors
- ✅ Build a browser-based MCP client

## The Fetch API

`fetch()` is a built-in browser API for making HTTP requests. No libraries needed!

### Basic Syntax

```javascript
fetch(url, options)
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error(error));
```

### With async/await

```javascript
async function fetchData() {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}
```

## Connecting to MCP Server

### Step 1: Check Server Health

```javascript
async function checkMCPHealth() {
  try {
    const response = await fetch('http://localhost:3100/mcp/health');
    const data = await response.json();

    console.log('MCP Server Status:', data.status);
    console.log('Tools Available:', data.tools);
    console.log('Privacy Mode:', data.privacy);

    return data;
  } catch (error) {
    console.error('MCP Server not reachable:', error);
    return null;
  }
}

// Call it
checkMCPHealth();
```

**Expected output:**
```javascript
{
  status: "healthy",
  tools: 8,
  privacy: {
    telemetry: false,
    externalCalls: false
  },
  uptime: 123.45
}
```

### Step 2: List Available Tools

```javascript
async function listMCPTools() {
  const response = await fetch('http://localhost:3100/mcp/tools');
  const data = await response.json();

  console.log('Available Tools:');
  data.tools.forEach(tool => {
    console.log(`  - ${tool.name}: ${tool.description}`);
  });

  return data.tools;
}

// Call it
listMCPTools();
```

**Expected output:**
```
Available Tools:
  - database_query: Execute SQL query on local database
  - filesystem_read: Read file contents from local filesystem
  - filesystem_write: Write content to local filesystem
  - filesystem_list: List files in directory
  - code_grep: Search code using grep
  - code_find: Find files by name or pattern
  - rpg_get_player: Get player stats (level, XP, achievements)
  - rpg_award_xp: Award XP to player
```

## Calling MCP Tools

### General Tool Call Syntax

```javascript
async function callMCPTool(toolName, input) {
  const response = await fetch('http://localhost:3100/mcp/call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tool: toolName,
      input: input
    })
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Tool call failed');
  }

  return data.result;
}
```

## Example 1: Read a File

```javascript
async function readPackageJson() {
  try {
    const result = await callMCPTool('filesystem_read', {
      path: './package.json'
    });

    console.log('File path:', result.path);
    console.log('File content:', result.content);

    // Parse JSON
    const packageData = JSON.parse(result.content);
    console.log('Package name:', packageData.name);
    console.log('Version:', packageData.version);

    return packageData;
  } catch (error) {
    console.error('Failed to read package.json:', error);
  }
}

// Call it
readPackageJson();
```

## Example 2: Search Code with Grep

```javascript
async function searchForTODOs() {
  try {
    const result = await callMCPTool('code_grep', {
      pattern: 'TODO',
      path: './lib',
      ignoreCase: true
    });

    console.log(`Found ${result.count} TODOs:`);
    result.matches.forEach(match => {
      console.log(`  ${match}`);
    });

    return result;
  } catch (error) {
    console.error('Search failed:', error);
  }
}

// Call it
searchForTODOs();
```

## Example 3: Get RPG Player Stats

```javascript
async function getPlayerStats(userId) {
  try {
    const result = await callMCPTool('rpg_get_player', {
      userId: userId
    });

    console.log('Player Stats:');
    console.log(`  User: ${result.userId}`);
    console.log(`  Level: ${result.level}`);
    console.log(`  XP: ${result.xp}/100`);
    console.log(`  Total XP: ${result.totalXp}`);
    console.log(`  Achievements: ${result.achievements.length}`);

    if (result.newPlayer) {
      console.log('  🎉 New player created!');
    }

    return result;
  } catch (error) {
    console.error('Failed to get player stats:', error);
  }
}

// Call it
getPlayerStats('user123');
```

## Example 4: Award XP to Player

```javascript
async function awardXP(userId, amount, reason) {
  try {
    const result = await callMCPTool('rpg_award_xp', {
      userId: userId,
      amount: amount,
      reason: reason
    });

    console.log(`Awarded ${result.awarded} XP to ${result.userId}`);
    console.log(`Reason: ${result.reason}`);
    console.log(`New Level: ${result.level}`);
    console.log(`XP in Level: ${result.xp}/100`);
    console.log(`Total XP: ${result.totalXp}`);

    if (result.leveledUp) {
      console.log(`🎉 LEVEL UP! Gained ${result.levelsGained} level(s)!`);
    }

    return result;
  } catch (error) {
    console.error('Failed to award XP:', error);
  }
}

// Call it
awardXP('user123', 150, 'Completed MCP Lesson 2');
```

## Error Handling

### Handle Different Error Types

```javascript
async function robustToolCall(toolName, input) {
  try {
    const response = await fetch('http://localhost:3100/mcp/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: toolName,
        input: input
      })
    });

    // Check HTTP status
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Check API success
    if (!data.success) {
      throw new Error(data.error || 'Tool call failed');
    }

    return data.result;

  } catch (error) {
    // Network error
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      console.error('Cannot connect to MCP server. Is it running?');
      console.error('Start it with: ./bin/mcp-server');
    }
    // API error
    else if (error.message.startsWith('HTTP')) {
      console.error('Server error:', error.message);
    }
    // Tool error
    else {
      console.error('Tool execution error:', error.message);
    }

    throw error;
  }
}
```

## Lab: Build a Browser MCP Client

Create a simple HTML page that calls MCP tools:

```html
<!DOCTYPE html>
<html>
<head>
  <title>MCP Client</title>
  <style>
    body {
      font-family: monospace;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    button {
      padding: 10px 20px;
      margin: 5px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    }

    button:hover {
      background: #764ba2;
    }

    pre {
      background: #1a1a2e;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>🔧 CalOS MCP Client</h1>

  <div>
    <button onclick="checkHealth()">Check Health</button>
    <button onclick="listTools()">List Tools</button>
    <button onclick="readFile()">Read File</button>
    <button onclick="getPlayer()">Get Player</button>
    <button onclick="awardXP()">Award XP</button>
  </div>

  <pre id="output">Click a button to test MCP tools...</pre>

  <script>
    const output = document.getElementById('output');

    function log(message) {
      output.textContent = typeof message === 'string'
        ? message
        : JSON.stringify(message, null, 2);
    }

    async function callMCP(toolName, input) {
      const response = await fetch('http://localhost:3100/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: toolName, input })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      return data.result;
    }

    async function checkHealth() {
      try {
        const response = await fetch('http://localhost:3100/mcp/health');
        const data = await response.json();
        log(data);
      } catch (error) {
        log('Error: ' + error.message);
      }
    }

    async function listTools() {
      try {
        const response = await fetch('http://localhost:3100/mcp/tools');
        const data = await response.json();
        log(data.tools);
      } catch (error) {
        log('Error: ' + error.message);
      }
    }

    async function readFile() {
      try {
        const result = await callMCP('filesystem_read', {
          path: './package.json'
        });
        log(result);
      } catch (error) {
        log('Error: ' + error.message);
      }
    }

    async function getPlayer() {
      try {
        const result = await callMCP('rpg_get_player', {
          userId: 'demo-user'
        });
        log(result);
      } catch (error) {
        log('Error: ' + error.message);
      }
    }

    async function awardXP() {
      try {
        const result = await callMCP('rpg_award_xp', {
          userId: 'demo-user',
          amount: 50,
          reason: 'Testing MCP client'
        });
        log(result);
      } catch (error) {
        log('Error: ' + error.message);
      }
    }
  </script>
</body>
</html>
```

Save this as `public/labs/mcp-client.html` and open in browser.

## Summary

You've learned:
- ✅ How to use `fetch()` to call MCP server
- ✅ How to list tools and call them
- ✅ How to handle responses and errors
- ✅ How to build a browser-based MCP client

## Next Lesson

**Lesson 3: Building Your First MCP Tool**

Learn how to add custom tools to the MCP server.

## Quiz

1. What HTTP method is used to call MCP tools?
   - a) GET
   - b) POST
   - c) PUT
   - d) DELETE

2. What does `fetch()` return?
   - a) JSON data
   - b) A Promise
   - c) A string
   - d) An object

3. Where does the MCP server run?
   - a) In the cloud
   - b) On localhost only
   - c) On any network
   - d) On a CDN

**Answers:** 1-b, 2-b, 3-b

---

**🎴 Achievement Unlocked:** MCP Client Master (+120 XP)

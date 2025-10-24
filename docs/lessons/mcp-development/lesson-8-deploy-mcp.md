# Lesson 8: Deploy Your Own MCP Server

**Track:** Privacy-First MCP Development
**Lesson:** 8 of 8
**XP Reward:** 110
**Time:** 35 minutes
**Prerequisites:** Lesson 7 (Privacy & Security)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Deploy MCP server for production use
- ✅ Set up process management with PM2
- ✅ Configure logging and monitoring
- ✅ Handle errors and crashes gracefully
- ✅ Maintain and update your server

## Production Deployment

### Step 1: Environment Configuration

Create `.env` file for configuration:

```bash
# .env
NODE_ENV=production
MCP_PORT=3100
MCP_HOST=localhost
LOG_LEVEL=info
DATABASE_URL=postgresql://user:pass@localhost/calos
```

### Step 2: Production Server Setup

Create `bin/mcp-server-prod`:

```javascript
#!/usr/bin/env node

/**
 * CalOS MCP Server - Production Mode
 */

require('dotenv').config();

const MCPServer = require('../lib/mcp-server/calos-mcp-server');
const { setupLogger } = require('../lib/logger');

// Setup logger
const logger = setupLogger({
  level: process.env.LOG_LEVEL || 'info',
  file: './logs/mcp-server.log'
});

// Create server
const server = new MCPServer({
  port: process.env.MCP_PORT || 3100,
  host: process.env.MCP_HOST || 'localhost',
  logger: logger
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
async function start() {
  try {
    await server.start();
    logger.info(`MCP Server started on http://${server.host}:${server.port}`);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
```

Make it executable:

```bash
chmod +x bin/mcp-server-prod
```

### Step 3: Process Management with PM2

Install PM2:

```bash
npm install -g pm2
```

Create PM2 ecosystem file `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'calos-mcp',
    script: './bin/mcp-server-prod',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      MCP_PORT: 3100
    },
    error_file: './logs/mcp-error.log',
    out_file: './logs/mcp-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000
  }]
};
```

### Step 4: Start with PM2

```bash
# Start server
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs calos-mcp

# Restart
pm2 restart calos-mcp

# Stop
pm2 stop calos-mcp

# Auto-start on system boot
pm2 startup
pm2 save
```

## Logging System

Create a proper logging system `lib/logger.js`:

```javascript
const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.file = options.file;
    this.levels = ['debug', 'info', 'warn', 'error'];
  }

  shouldLog(level) {
    const currentIndex = this.levels.indexOf(this.level);
    const messageIndex = this.levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  log(level, message, ...args) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const fullMessage = `${prefix} ${message}`;

    // Console output
    console.log(fullMessage, ...args);

    // File output
    if (this.file) {
      const logEntry = `${fullMessage} ${args.map(a => JSON.stringify(a)).join(' ')}\n`;
      fs.appendFileSync(this.file, logEntry);
    }
  }

  debug(message, ...args) { this.log('debug', message, ...args); }
  info(message, ...args) { this.log('info', message, ...args); }
  warn(message, ...args) { this.log('warn', message, ...args); }
  error(message, ...args) { this.log('error', message, ...args); }
}

function setupLogger(options) {
  // Ensure log directory exists
  if (options.file) {
    const logDir = path.dirname(options.file);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  return new Logger(options);
}

module.exports = { Logger, setupLogger };
```

## Health Monitoring

Add health check endpoint:

```javascript
// In calos-mcp-server.js
router.get('/health', (req, res) => {
  const uptime = process.uptime();
  const memory = process.memoryUsage();

  res.json({
    status: 'healthy',
    uptime: uptime,
    memory: {
      rss: Math.round(memory.rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + ' MB'
    },
    tools: tools.size,
    privacy: {
      telemetry: false,
      externalCalls: false,
      localOnly: true
    }
  });
});
```

## Monitoring Dashboard

Create a monitoring dashboard `public/admin/mcp-monitor.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>MCP Server Monitor</title>
  <style>
    body {
      font-family: monospace;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .status-card {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 10px;
      margin: 15px 0;
    }

    .status-online {
      border-left: 5px solid #00ff00;
    }

    .status-offline {
      border-left: 5px solid #ff0000;
    }

    .metric {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #2a2a3e;
    }

    .metric:last-child {
      border-bottom: none;
    }

    .value {
      font-weight: bold;
      color: #64ffda;
    }

    button {
      padding: 10px 20px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      margin: 5px;
    }

    button:hover {
      background: #764ba2;
    }
  </style>
</head>
<body>
  <h1>🖥️ MCP Server Monitor</h1>

  <button onclick="checkHealth()">Refresh Status</button>
  <button onclick="startAutoRefresh()">Auto-Refresh (5s)</button>
  <button onclick="stopAutoRefresh()">Stop Auto-Refresh</button>

  <div id="statusDisplay"></div>

  <script>
    let autoRefreshInterval = null;

    async function checkHealth() {
      try {
        const response = await fetch('http://localhost:3100/mcp/health');
        const data = await response.json();

        displayStatus(data, true);
      } catch (error) {
        displayStatus({ error: error.message }, false);
      }
    }

    function displayStatus(data, isOnline) {
      const display = document.getElementById('statusDisplay');

      if (!isOnline) {
        display.innerHTML = `
          <div class="status-card status-offline">
            <h2>❌ Server Offline</h2>
            <p>Cannot connect to MCP server at http://localhost:3100</p>
            <p>Error: ${data.error}</p>
          </div>
        `;
        return;
      }

      const uptimeHours = (data.uptime / 3600).toFixed(2);

      display.innerHTML = `
        <div class="status-card status-online">
          <h2>✅ Server Online</h2>

          <div class="metric">
            <span>Status</span>
            <span class="value">${data.status}</span>
          </div>

          <div class="metric">
            <span>Uptime</span>
            <span class="value">${uptimeHours} hours</span>
          </div>

          <div class="metric">
            <span>Tools Available</span>
            <span class="value">${data.tools}</span>
          </div>

          <div class="metric">
            <span>Memory (RSS)</span>
            <span class="value">${data.memory.rss}</span>
          </div>

          <div class="metric">
            <span>Heap Used</span>
            <span class="value">${data.memory.heapUsed}</span>
          </div>

          <div class="metric">
            <span>Heap Total</span>
            <span class="value">${data.memory.heapTotal}</span>
          </div>

          <div class="metric">
            <span>Telemetry</span>
            <span class="value">${data.privacy.telemetry ? '❌ YES' : '✅ NO'}</span>
          </div>

          <div class="metric">
            <span>External Calls</span>
            <span class="value">${data.privacy.externalCalls ? '❌ YES' : '✅ NO'}</span>
          </div>

          <div class="metric">
            <span>Local Only</span>
            <span class="value">${data.privacy.localOnly ? '✅ YES' : '❌ NO'}</span>
          </div>

          <div class="metric">
            <span>Last Checked</span>
            <span class="value">${new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      `;
    }

    function startAutoRefresh() {
      if (autoRefreshInterval) return;

      autoRefreshInterval = setInterval(checkHealth, 5000);
      console.log('Auto-refresh started (every 5 seconds)');
    }

    function stopAutoRefresh() {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        console.log('Auto-refresh stopped');
      }
    }

    // Initial check
    checkHealth();
  </script>
</body>
</html>
```

## Backup and Recovery

### Backup Script

Create `bin/backup-mcp`:

```bash
#!/bin/bash

# MCP Server Backup Script

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/mcp-backup-$TIMESTAMP.tar.gz"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create backup
echo "Creating backup..."
tar -czf "$BACKUP_FILE" \
  ./lib/mcp-server \
  ./logs \
  ./.env \
  ./ecosystem.config.js

echo "Backup created: $BACKUP_FILE"

# Keep only last 7 backups
ls -t "$BACKUP_DIR"/mcp-backup-*.tar.gz | tail -n +8 | xargs -r rm

echo "Backup complete!"
```

Make it executable:

```bash
chmod +x bin/backup-mcp
```

## Update Procedure

### 1. Prepare Update

```bash
# Backup current version
./bin/backup-mcp

# Pull latest changes
git pull origin main

# Install dependencies
npm install
```

### 2. Test Changes

```bash
# Run tests
npm test

# Start in development mode
./bin/mcp-server
```

### 3. Deploy Update

```bash
# Reload PM2
pm2 reload calos-mcp

# Or restart
pm2 restart calos-mcp

# Check logs
pm2 logs calos-mcp --lines 50
```

## Troubleshooting

### Server Won't Start

```bash
# Check if port is in use
lsof -i :3100

# Check logs
pm2 logs calos-mcp --lines 100

# Check file permissions
ls -la bin/mcp-server-prod
```

### High Memory Usage

```bash
# Check memory
pm2 monit

# Restart if needed
pm2 restart calos-mcp
```

### Tools Not Working

```bash
# Check tool registration
curl http://localhost:3100/mcp/tools | jq

# Test specific tool
curl -X POST http://localhost:3100/mcp/call \
  -H "Content-Type: application/json" \
  -d '{"tool":"filesystem_read","input":{"path":"./package.json"}}'
```

## Summary

You've learned:
- ✅ How to deploy MCP server for production
- ✅ How to manage processes with PM2
- ✅ How to implement logging and monitoring
- ✅ How to backup, update, and troubleshoot

**Congratulations! You've completed the Privacy-First MCP Development track!**

## Final Quiz

1. What's the best way to manage MCP server in production?
   - a) Run manually with node
   - b) Use PM2 for process management
   - c) Use Docker
   - d) Use systemd

2. Where should MCP server listen in production?
   - a) 0.0.0.0 (all interfaces)
   - b) localhost only
   - c) Public IP
   - d) 127.0.0.1 or localhost

3. How often should you backup your MCP server?
   - a) Never
   - b) Before every update
   - c) Once a month
   - d) Once a year

**Answers:** 1-b, 2-b (or d, same thing), 3-b

---

**🎴 Achievement Unlocked:** MCP Deployment Master (+110 XP)
**🏆 Track Complete:** Privacy-First MCP Development (Total: 920 XP)

# CalOS Verification System - Complete Guide

## 🎯 Overview

This system provides comprehensive verification that CalOS is **actually working**, not just that migrations ran. It includes health checks, verified startup, and step-by-step testing guides.

---

## 🚀 Quick Start

### Option 1: Verified Startup (Recommended)
```bash
npm run start:verified
```

This will:
1. ✅ Check database connection
2. ✅ Check port availability
3. 🚀 Start server
4. ⏱️ Wait 15 seconds for initialization
5. 🏥 Run health checks
6. 📊 Display final status

### Option 2: Standard Startup + Health Check
```bash
# Terminal 1: Start server
calos-start

# Terminal 2: Run health check
npm run health
```

### Option 3: Quick Health Check Only
```bash
# Check database only (fast)
npm run health:quick

# Full health check with details
npm run health:verbose
```

---

## 📋 Available Scripts

### Health Check Scripts
```bash
npm run health              # Run all health checks
npm run health:quick        # Database checks only (fast)
npm run health:verbose      # Detailed output with explanations
```

### Startup Scripts
```bash
npm run start:verified       # Verified startup with health checks
npm run start:verified:quick # Verified startup, quick health check
npm start                    # Standard startup (no verification)
```

### Manual Commands
```bash
node scripts/health-check.js              # Full health check
node scripts/health-check.js --quick      # Quick check
node scripts/health-check.js --verbose    # Verbose output

node scripts/calos-start-verified.js      # Verified startup
node scripts/calos-start-verified.js --quick        # Quick mode
node scripts/calos-start-verified.js --skip-health  # No health checks
```

---

## 🏥 Health Check System

### What Gets Tested

#### Database Tests (Always Run)
1. **Database Connection** - Can connect to PostgreSQL
2. **Critical Tables** - Checks existence of:
   - `user_tree_progress`
   - `tree_node_completions`
   - `learning_paths`
   - `migration_history`
3. **Icon Emoji Column** - Verifies `learning_paths.icon_emoji` exists

#### Server Tests (When Running)
4. **HTTP Server** - Server responds on port 5001
5. **Mobile Access Page** - `/mobile-access.html` loads
6. **OAuth Upload Page** - `/oauth-upload.html` loads
7. **QR Code API** - `/api/qr-code` endpoint works
8. **Network Info API** - `/api/network-info` returns JSON
9. **WebSocket Server** - WebSocket connection succeeds
10. **Health Endpoint** - `/api/health` returns status

### Test Results

**✅ Pass:** Test succeeded
**❌ Fail:** Test failed (will exit with error code 1)
**⚠️ Warning:** Test issue but not critical

### Example Output

```
╔════════════════════════════════════════╗
║     CalOS Health Check System          ║
╚════════════════════════════════════════╝

Database Tests:
✓ Database Connection
✓ Critical Tables
✓ Icon Emoji Column

Server Tests:
✓ HTTP Server
✓ Mobile Access Page
✓ OAuth Upload Page
✓ QR Code API
✓ Network Info API
✓ WebSocket Server
✓ Health Endpoint

╔════════════════════════════════════════╗
║           Test Summary                 ║
╚════════════════════════════════════════╝

✓ Passed:  10
✗ Failed:  0
⚠ Warnings: 0
```

---

## 🔧 Verified Startup System

### How It Works

1. **Pre-Flight Checks**
   - Verifies database connection
   - Checks if port 5001 is available
   - Kills existing process if needed

2. **Server Startup**
   - Launches `router.js --local`
   - Monitors output for startup signals
   - Waits 15 seconds for initialization
   - Detects errors automatically

3. **Health Verification**
   - Runs full health check suite
   - Reports any issues found
   - Displays final status

4. **Process Management**
   - Keeps server running
   - Handles Ctrl+C gracefully
   - Forwards all output to console

### Example Output

```
╔════════════════════════════════════════╗
║     CalOS Verified Startup System      ║
╚════════════════════════════════════════╝

[Pre-Flight] Checking database connection...
✓ Database connection OK

[Pre-Flight] Checking if port 5001 is available...
✓ Port 5001 is available

✓ Pre-flight checks passed

[Startup] Starting CalOS server...
[... server output ...]

✓ Server startup detected

[Health] Running health checks...
[... health check output ...]

╔════════════════════════════════════════╗
║        CalOS Startup Complete          ║
╚════════════════════════════════════════╝

✓ Server is running and healthy!

📱 Mobile Access:
   1. Look for QR code in output above
   2. Scan with phone camera
   3. Test OAuth upload feature

🌐 Web Access: http://localhost:5001
🏥 Health Check: http://localhost:5001/api/health

📊 To stop: Press Ctrl+C
```

---

## 🌐 Health API Endpoints

### GET /api/health

**Basic health check**

Returns:
```json
{
  "status": "ok",
  "timestamp": "2025-10-22T18:30:00.000Z",
  "uptime": 3600,
  "services": {
    "database": {
      "status": "ok",
      "type": "postgres"
    },
    "metaOrchestrator": {
      "status": "running",
      "cycle": 7,
      "tier": 3
    },
    "guardian": {
      "status": "initialized"
    }
  },
  "memory": {
    "heapUsed": 150,
    "heapTotal": 200,
    "rss": 250
  }
}
```

### GET /api/health/detailed

**Detailed health check**

Returns:
```json
{
  "status": "ok",
  "timestamp": "2025-10-22T18:30:00.000Z",
  "uptime": 3600,
  "version": "1.1.0",
  "node": "v18.20.8",
  "services": {
    "database": { "status": "ok", "type": "postgres" },
    "metaOrchestrator": { "status": "initialized", "running": true },
    "guardian": { "status": "initialized", "running": null },
    "calLoop": { "status": "initialized", "running": null },
    "studentLauncher": { "status": "initialized", "running": null },
    "forumMonitor": { "status": "initialized", "running": null },
    "agentMesh": { "status": "initialized", "running": null }
  },
  "database": {
    "criticalTables": "ok",
    "migrations": 61
  },
  "system": {
    "platform": "darwin",
    "arch": "arm64",
    "memory": {
      "heapUsed": "150 MB",
      "heapTotal": "200 MB",
      "rss": "250 MB"
    },
    "cpu": {
      "user": 1234567,
      "system": 234567
    }
  }
}
```

---

## 📱 Mobile Testing

### Complete Testing Guide

See **`MOBILE_TEST_CHECKLIST.md`** for comprehensive step-by-step mobile testing.

Includes:
- 📱 Server startup verification
- 🌐 Network connection checks
- 📸 QR code scanning tests
- 🎯 Mobile landing page testing
- 📤 OAuth upload testing
- 🏥 API endpoint validation
- 🎮 PWA installation testing
- 🐛 Troubleshooting guide

### Quick Mobile Test

1. Start server:
   ```bash
   npm run start:verified
   ```

2. From phone:
   - Scan QR code in terminal
   - Or visit: `http://192.168.1.87:5001/mobile-access.html`

3. Test features:
   - ✅ Mobile landing page loads
   - ✅ OAuth upload works
   - ✅ QR codes scan correctly

---

## 🐛 Troubleshooting

### Health Check Fails: Database Connection

**Error:**
```
✗ Database Connection
  connection refused
```

**Fix:**
```bash
# Check if PostgreSQL is running
brew services list

# Start PostgreSQL
brew services start postgresql@14

# Verify connection
psql -d calos -U matthewmauer -c "SELECT 1"
```

### Health Check Fails: Critical Tables

**Error:**
```
✗ Critical Tables
  Missing: user_tree_progress, tree_node_completions
```

**Fix:**
```bash
# Run migrations
DB_USER=matthewmauer node scripts/auto-migrate.js

# Verify tables exist
psql -d calos -U matthewmauer -c "\dt" | grep "tree"
```

### Health Check Fails: HTTP Server

**Error:**
```
✗ HTTP Server
  Server not running: ECONNREFUSED
```

**Fix:**
```bash
# Server isn't running, start it:
npm run start:verified

# Or check if port is in use:
lsof -i :5001
```

### Verified Startup Fails: Port In Use

**Error:**
```
⚠ Port 5001 is already in use
```

**Fix:**
The script will automatically try to kill the existing process. If it fails:
```bash
# Manually kill process on port 5001
lsof -ti:5001 | xargs kill -9

# Then restart
npm run start:verified
```

### Mobile Can't Connect

**Issue:** Phone can't reach `http://192.168.1.87:5001`

**Fix:**
```bash
# 1. Check your local IP
ifconfig | grep "inet "

# 2. Make sure phone is on same WiFi

# 3. Check firewall isn't blocking
sudo pfctl -d  # macOS: disable firewall temporarily

# 4. Try visiting from computer first
curl http://localhost:5001
```

---

## 📊 Integration with CI/CD

### Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

### Use in Scripts

```bash
#!/bin/bash

# Run health check
npm run health:quick

if [ $? -eq 0 ]; then
  echo "Health check passed, starting server..."
  npm start
else
  echo "Health check failed, aborting..."
  exit 1
fi
```

### GitHub Actions Example

```yaml
- name: Run Health Checks
  run: |
    npm run health

- name: Start Server
  run: |
    npm run start:verified
```

---

## 📚 Related Documentation

- **`DATABASE_FIX_SUMMARY.md`** - Database schema fixes applied
- **`MOBILE_ACCESS_SETUP.md`** - Mobile access system documentation
- **`MOBILE_TEST_CHECKLIST.md`** - Complete mobile testing guide
- **`CLAUDE.md`** - Main project documentation

---

## 🎉 Summary

You now have a complete verification system that ensures CalOS is:
- ✅ Connected to database
- ✅ All critical tables exist
- ✅ Server running and accessible
- ✅ All API endpoints working
- ✅ Mobile access functional
- ✅ WebSocket connections established

**No more guessing if things work - you have proof!** 🚀

---

**Last Updated:** 2025-10-22
**System Version:** CalOS 1.1.0

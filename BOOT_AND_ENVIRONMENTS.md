# Boot Animation & Environment Management

**Date**: October 13, 2025
**Status**: ✅ **COMPLETE** - All systems operational

---

## 🎨 Overview

This document describes the new **boot animation system**, **environment manager**, and **Ollama service management** - inspired by your vision of "all colors → white → build up" and "it's all simulations."

### The Concept

Like turning on a macOS, game, or OS:
1. **⚫️ All colors** - Turn on every system (load all modules)
2. **⚪️ White screen** - Clean slate, quiet mode
3. **🟢🟡🔵 Build up** - Incrementally enable systems with visual feedback
4. **🟢🟡⚪️ Simulations** - Multiple parallel environments (like macOS window buttons: green=active, yellow=warning, grey=inactive)

---

## 🚀 Boot Animation System

### What It Does

Orchestrates system startup like an OS or game loading screen with 6 visual stages:

1. **⚫️ LOAD** - Import all modules (all colors on screen)
2. **⚪️ CLEAN** - Quiet mode, clean slate (white screen)
3. **🟢 CORE** - Initialize critical systems (database, ollama)
4. **🟡 SERVICES** - Start background services (buckets, xref)
5. **🔵 FEATURES** - Enable optional features (price workers, schedulers)
6. **✅ READY** - System fully operational

### Files Created

- **`lib/boot-sequencer.js`** - Core boot orchestration system
- **`start-animated.js`** - Entry point with boot animation

### Usage

```bash
# Start with boot animation
npm run start:animated

# Watch the stages load:
# ⚫️ LOAD → ⚪️ CLEAN → 🟢 CORE → 🟡 SERVICES → 🔵 FEATURES → ✅ READY
```

### Features

- **Timeout & retry logic** - Each stage has configurable timeout and retries
- **Required vs optional** - Required stages abort on failure, optional stages skip
- **Visual feedback** - Colors, emojis, and progress for each stage
- **Summary report** - Total time, success/failed/skipped counts
- **Bypass console.log** - Uses `process.stdout.write()` to show animation even when console is overridden

### Example Output

```
╔════════════════════════════════════════════════════════════════╗
║                  🚀 SYSTEM BOOT SEQUENCE 🚀                    ║
╚════════════════════════════════════════════════════════════════╝

  Like an OS or game - loading in stages for smooth startup...

⚫️  LOAD: Loading modules and dependencies...
   ✓ Completed in 713ms

⚪️  CLEAN: Preparing clean environment...
   ✓ Completed in 301ms

🟢  CORE: Initializing database and Ollama...
   ✓ Completed in 546ms

🟡  SERVICES: Starting buckets and XRef system...
   ✓ Completed in 302ms

🔵  FEATURES: Enabling price workers and schedulers...
   ✓ Completed in 301ms

✅  READY: System fully operational...
   ✓ Completed in 201ms

════════════════════════════════════════════════════════════════
  ✅  SYSTEM READY!
════════════════════════════════════════════════════════════════

  Total time: 2365ms
  Stages: 6 success, 0 failed, 0 skipped

  ✓  ⚫️  load       - 713ms
  ✓  ⚪️  clean      - 301ms
  ✓  🟢  core       - 546ms
  ✓  🟡  services   - 302ms
  ✓  🔵  features   - 301ms
  ✓  ✅  ready      - 201ms

  Server is now accepting requests.
```

---

## 🌍 Environment Manager (Parallel Simulations)

### What It Does

Manages multiple parallel "simulations" of the system - like the **green/yellow/grey buttons** in macOS (focused/unfocused/disabled).

**"It's all simulations"** - Run multiple environments simultaneously:
- 🟢 **Production** (port 5001) - Active/focused - Like green macOS button
- 🟡 **Staging** (port 5002) - Warning/staged - Like yellow macOS button
- ⚪️ **Development** (port 5003) - Inactive/testing - Like grey macOS button

### Files Created

- **`lib/environment-manager.js`** - Core environment orchestration
- **`start-environments.js`** - CLI for managing environments

### Usage

```bash
# Start all environments (production, staging, dev)
npm run env:all

# Start specific environments
npm run env:prod          # Production only
npm run env:staging       # Staging only
npm run env:dev           # Dev only

# Check status
npm run env:status

# Stop all environments
npm run env:stop
```

### Features

- **Parallel execution** - Run multiple environments at once
- **State management** - Active (🟢), Staged (🟡), Inactive (⚪️), Error (🔴), Starting (🔵)
- **Independent configs** - Each environment has its own port, database, log level
- **Auto-restart** - Configurable auto-restart on crash
- **Health checks** - Monitor each environment's health
- **Process management** - Start/stop/restart environments
- **Visual status table** - Like Railway or Docker Compose

### Example Output

```
╔════════════════════════════════════════════════════════════════╗
║             🌍 PARALLEL ENVIRONMENT MANAGER 🌍                 ║
╚════════════════════════════════════════════════════════════════╝

  "It's all simulations" - run multiple environments in parallel

════════════════════════════════════════════════════════════════
  🌍  ENVIRONMENT STATUS
════════════════════════════════════════════════════════════════

🟢  Production      | Port 5001 | PID 12345    | 2h 15m
🟡  Staging         | Port 5002 | PID 12346    | 1h 42m
⚪️  Development     | Port 5003 | no process   | stopped

  Legend: 🟢 Active  🟡 Staged  ⚪️ Inactive  🔴 Error  🔵 Starting
```

### Configuration

Each environment can have:
- **Port** - Different port for each environment
- **Database** - Separate database or schema
- **Ollama URL** - Shared or dedicated Ollama instance
- **Log level** - silent/error/warn/info/debug
- **Auto-restart** - Enable/disable auto-restart on crash

---

## 🤖 Ollama Service Management

### What It Does

**No more running `ollama serve` in a terminal!**

Manages Ollama as a **background service** - automatically starts, stops, and monitors Ollama without needing a terminal window.

### Files Created

- **`lib/ollama-service-manager.js`** - Core Ollama management
- **`manage-ollama.js`** - CLI for Ollama operations

### Terminal vs Script

**❌ DON'T:**
```bash
# Manually run in terminal (requires keeping terminal open)
ollama serve
```

**✅ DO:**
```bash
# Use the service manager (runs in background)
npm run ollama:start
```

### Usage

```bash
# Start Ollama service (background)
npm run ollama:start

# Stop Ollama service
npm run ollama:stop

# Restart Ollama service
npm run ollama:restart

# Check status
npm run ollama:status

# List installed models
npm run ollama:models

# Check health
npm run ollama:health

# Pull a model
npm run ollama:pull -- llama2

# Delete a model
node manage-ollama.js delete llama2
```

### Features

- **Background service** - Runs silently without terminal
- **Auto-start** - Automatically starts if not running
- **Health checks** - Monitor Ollama health
- **Model management** - List, pull, delete models
- **Multi-instance** - Support for multiple Ollama instances on different ports
- **Status reporting** - Detailed status with model counts

### Example Output

```
╔════════════════════════════════════════════════════════════════╗
║              🤖 OLLAMA SERVICE MANAGER 🤖                      ║
╚════════════════════════════════════════════════════════════════╝

  No more terminal windows! Ollama runs as a background service.

════════════════════════════════════════════════════════════════
  OLLAMA STATUS
════════════════════════════════════════════════════════════════

  🟢 Status: RUNNING
  URL: http://localhost:11434
  Models: 22 installed

  Available models:
    • llama2:latest
    • llama3.2:3b
    • mistral:7b
    • codellama:7b
    • phi:latest
    • calos-model:latest
    ... (16 more)
```

---

## 📋 Quick Reference

### All New NPM Scripts

#### Boot Animation
```bash
npm run start:animated     # Start with boot animation
```

#### Environment Management
```bash
npm run env:all           # Start all environments
npm run env:prod          # Start production
npm run env:staging       # Start staging
npm run env:dev           # Start development
npm run env:status        # Show status
npm run env:stop          # Stop all
```

#### Ollama Management
```bash
npm run ollama:start      # Start Ollama service
npm run ollama:stop       # Stop Ollama service
npm run ollama:restart    # Restart Ollama
npm run ollama:status     # Check status
npm run ollama:models     # List models
npm run ollama:health     # Health check
npm run ollama:pull       # Pull a model (add -- model-name)
```

#### Previous Features (Still Available)
```bash
npm run start             # Normal start
npm run start:quiet       # Quiet mode (errors only)
npm start                 # Standard start
```

---

## 🎮 Gaming Analogies

### Boot Sequence
Like a game loading screen:
- **Loading assets** (⚫️) - All systems loading
- **White flash** (⚪️) - Transition to clean state
- **Building world** (🟢🟡🔵) - Systems coming online one by one
- **Ready** (✅) - Game ready to play

### Environment Manager
Like game servers/lobbies:
- **🟢 Production** - Live server (everyone plays here)
- **🟡 Staging** - Test server (beta testing)
- **⚪️ Development** - Local server (development)

Like macOS window buttons:
- **🟢 Green** - Active window (focused)
- **🟡 Yellow** - Minimize (staged)
- **⚪️ Grey** - Inactive (disabled)

---

## 🏗️ Technical Architecture

### Boot Sequencer Architecture

```
BootSequencer
├── Stage Registration
│   ├── Name, description, function
│   ├── Required vs optional
│   ├── Timeout & retry config
│   └── Color & emoji
├── Boot Execution
│   ├── Sequential stage execution
│   ├── Timeout handling
│   ├── Retry logic
│   └── Error propagation
└── Visual Output
    ├── Header
    ├── Stage progress
    ├── Success/failure/skip
    └── Summary report
```

### Environment Manager Architecture

```
EnvironmentManager
├── Environment Registry
│   ├── Name, display name
│   ├── Port, database, ollama
│   ├── State (active/staged/inactive/error/starting)
│   └── Process management
├── Lifecycle Management
│   ├── Start environment (spawn process)
│   ├── Stop environment (graceful shutdown)
│   ├── Restart environment
│   └── Health check loop
├── Status Monitoring
│   ├── Process tracking (PID, uptime)
│   ├── Health checks
│   └── Auto-restart on failure
└── Visual Output
    ├── Status table
    ├── State indicators (🟢🟡⚪️🔴🔵)
    └── Real-time updates
```

### Ollama Service Manager Architecture

```
OllamaServiceManager
├── Service Management
│   ├── Check if running
│   ├── Start service (background)
│   ├── Stop service (graceful/force)
│   └── Restart service
├── Health Monitoring
│   ├── Connection check
│   ├── Model availability
│   └── Response time
├── Model Management
│   ├── List models
│   ├── Pull model
│   ├── Delete model
│   └── Model info
└── Multi-Instance Support
    ├── Different ports
    ├── Shared vs dedicated
    └── Environment isolation
```

---

## 🔗 Integration Points

### How They Work Together

1. **Boot Animation** starts the system
   - Loads modules (⚫️)
   - Prepares environment (⚪️)
   - **Starts Ollama service** (🟢) via OllamaServiceManager
   - Initializes services (🟡)
   - Enables features (🔵)
   - Ready (✅)

2. **Environment Manager** runs parallel simulations
   - Production uses boot animation + Ollama on port 11434
   - Staging uses boot animation + shared Ollama
   - Dev uses boot animation + shared Ollama

3. **Ollama Service Manager** provides AI capabilities
   - Runs as background service
   - Shared across environments or dedicated per environment
   - Managed via npm scripts

### Example Full Workflow

```bash
# 1. Start Ollama service
npm run ollama:start

# 2. Start router with boot animation
npm run start:animated

# OR start all environments in parallel
npm run env:all

# 3. Check status of everything
npm run ollama:status
npm run env:status
```

---

## 🎯 Design Philosophy

### Visual Feedback
Inspired by:
- **macOS boot** (black → Apple logo → desktop)
- **Game loading** (assets → white screen → UI)
- **Docker Compose** (pull → create → start)
- **Railway** (build → deploy → running)

### State Management
Inspired by:
- **macOS window buttons** (green/yellow/grey for focused/unfocused/disabled)
- **Game servers** (live/test/dev environments)
- **Traffic lights** (green=go, yellow=caution, red=stop, grey=off)

### Service Management
Inspired by:
- **systemd** (Linux service management)
- **launchd** (macOS service management)
- **PM2** (Node.js process management)
- **Docker** (container orchestration)

---

## 🚦 Status Indicators

### Boot Stages
- ⚫️ **LOAD** - Loading/importing
- ⚪️ **CLEAN** - Cleaning/preparing
- 🟢 **CORE** - Core systems
- 🟡 **SERVICES** - Background services
- 🔵 **FEATURES** - Optional features
- ✅ **READY** - System operational
- ❌ **ERROR** - Failed
- ⏭️ **SKIP** - Skipped (non-critical)

### Environment States
- 🟢 **Active** - Running and healthy (green macOS button)
- 🟡 **Staged** - Running with warnings (yellow macOS button)
- ⚪️ **Inactive** - Stopped or disabled (grey macOS button)
- 🔴 **Error** - Failed or crashed (red = stop)
- 🔵 **Starting** - Booting up (blue = progress)

### Ollama Status
- 🟢 **RUNNING** - Service active and healthy
- ⚪️ **STOPPED** - Service not running
- 🔴 **UNHEALTHY** - Service running but not responding

---

## 🎨 Color Coding

### Terminal Colors (ANSI)
```javascript
{
  reset: '\x1b[0m',
  black: '\x1b[30m',    // ⚫️ Load stage
  white: '\x1b[37m',    // ⚪️ Clean stage
  green: '\x1b[32m',    // 🟢 Success, active
  yellow: '\x1b[33m',   // 🟡 Warning, staged
  blue: '\x1b[34m',     // 🔵 Starting, features
  red: '\x1b[31m',      // 🔴 Error, failed
  cyan: '\x1b[36m',     // Info, headers
  grey: '\x1b[90m',     // ⚪️ Inactive, disabled
  magenta: '\x1b[35m'   // Special
}
```

---

## 📚 API Reference

### BootSequencer

```javascript
const BootSequencer = require('./lib/boot-sequencer');

const sequencer = new BootSequencer({
  verbose: true,        // Show output
  colorEnabled: true    // Use colors
});

// Register a stage
sequencer.registerStage(
  'stageName',           // name (load, clean, core, services, features, ready)
  'Stage description',   // description
  async () => {          // async function to execute
    // Stage logic here
    return { result: 'data' };
  },
  {
    required: true,      // Abort boot if fails (default: true)
    timeout: 30000,      // Timeout in ms (default: 30000)
    retries: 0           // Number of retries (default: 0)
  }
);

// Run boot sequence
const result = await sequencer.boot();
// Returns: { success, duration, stages: [...] }
```

### EnvironmentManager

```javascript
const EnvironmentManager = require('./lib/environment-manager');

const manager = new EnvironmentManager({
  verbose: true,
  colorEnabled: true
});

// Register environment
manager.registerEnvironment('production', {
  displayName: 'Production',
  port: 5001,
  databaseUrl: 'postgresql://...',
  ollamaUrl: 'http://localhost:11434',
  ollamaInstance: 'shared',  // or 'dedicated'
  logLevel: 'error',
  autoRestart: true
});

// Start environment
await manager.startEnvironment('production');

// Stop environment
await manager.stopEnvironment('production');

// Get status
const status = manager.getStatus();

// Print status table
manager.printStatus();
```

### OllamaServiceManager

```javascript
const OllamaServiceManager = require('./lib/ollama-service-manager');

const manager = new OllamaServiceManager({
  port: 11434,
  host: 'localhost',
  verbose: true,
  autoStart: true
});

// Start service
await manager.start();

// Stop service
await manager.stop();

// Check if running
const isRunning = await manager.isRunning();

// Check health
const health = await manager.checkHealth();

// List models
const models = await manager.listModels();

// Pull model
await manager.pullModel('llama2');

// Get status
const status = await manager.getStatus();
```

---

## ✅ System Complete!

All three systems are now operational:

1. ✅ **Boot Animation** - Visual startup sequence
2. ✅ **Environment Manager** - Parallel simulations
3. ✅ **Ollama Service Manager** - Background AI service

**Like Railway/WordPress** - simple, clean, and it just works! 🚀

### What You Can Do Now

- 🎨 Start system with beautiful boot animation
- 🌍 Run multiple environments in parallel
- 🤖 Manage Ollama without terminal windows
- 🟢🟡⚪️ See visual states like macOS buttons
- 🚀 Deploy with confidence

**"It's all simulations!"** - Run as many parallel environments as you want, each with its own state and configuration.

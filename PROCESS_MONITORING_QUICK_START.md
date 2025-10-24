# Process Monitoring - Quick Start

## 30-Second Overview

CalRiven now tracks all background processes (shells/jobs) like Kubernetes tracks pods.

**Knows:** Running, completed, failed, orphaned, zombie, killed, stuck, time sinks, bottlenecks

**Pattern:** Process mining (like kubectl, systemctl, docker stats)

---

## Quick Setup (3 steps)

### 1. Initialize Process Manager

```javascript
const ShellProcessManager = require('./lib/shell-process-manager');
const ProcessMiningAnalyzer = require('./lib/process-mining-analyzer');

const processManager = new ShellProcessManager();
const processAnalyzer = new ProcessMiningAnalyzer({ manager: processManager });
```

### 2. Mount API Routes

```javascript
const processManagementRoutes = require('./routes/process-management-routes');

app.use('/api/processes', processManagementRoutes.initRoutes(processManager, processAnalyzer));
```

### 3. Add to CalRiven

```javascript
const calriven = new CalRivenPersona({
  db,
  llmRouter,
  processManager,
  processAnalyzer
});
```

---

## Usage

### Track a Process

```javascript
const jobId = await processManager.track('npm start', {
  description: 'Start server',
  timeout: 300000,
  expectedDuration: 10000
});
```

### Check Status

```javascript
const status = await processManager.getStatus(jobId);
// { state: 'running', elapsed: 15000, cpu: 2.5, memory: 45.2, isStuck: false }
```

### Detect Issues

```javascript
const analysis = await processAnalyzer.analyze();
// { timeSinks: [...], bottlenecks: [...], recommendations: [...] }
```

### CalRiven Query

```javascript
const report = await calriven.queryProcesses();
const issues = await calriven.detectStuckJobs();
const recommendations = await calriven.getProcessRecommendations();
```

---

## API Endpoints

```bash
GET  /api/processes                # List all
GET  /api/processes/:id            # Get status
GET  /api/processes/:id/output     # Get output
POST /api/processes/:id/kill       # Kill process
POST /api/processes/cleanup        # Cleanup orphans/zombies
GET  /api/processes/analyze        # Analyze (time sinks, bottlenecks)
GET  /api/processes/stats          # Get stats
```

---

## Dashboard

```bash
open http://localhost:5001/process-monitor.html
```

**Auto-refreshes every 5s, shows:**
- Running processes
- Time sinks (taking too long)
- Bottlenecks (resource-heavy)
- Stuck processes (no output)
- Kill buttons
- Real-time stats

---

## Process States

- **running** - Active, monitored
- **completed** - Finished successfully
- **failed** - Exited with error
- **killed** - Terminated by signal
- **orphaned** - Lost parent, auto-cleaned
- **zombie** - Finished but not reaped, auto-cleaned
- **stuck** - No output for 60s (gate)
- **timed out** - Exceeded timeout limit

---

## Time Sinks & Gates

**Time sink** = Process taking 2x+ expected duration

**Gate** = Process stuck (no output for 60s)

**Bottleneck** = Process using 80%+ CPU or 70%+ memory

**CalRiven detects all automatically.**

---

## Files

- **lib/shell-process-manager.js** - Core tracking
- **lib/process-mining-analyzer.js** - Analysis
- **routes/process-management-routes.js** - API
- **public/process-monitor.html** - Dashboard
- **lib/calriven-persona.js** - Integration

---

## Test It

```bash
# Start server
npm start

# Track a job
curl -X POST http://localhost:5001/api/processes/track \
  -H "Content-Type: application/json" \
  -d '{"command": "sleep 30", "description": "Test", "expectedDuration": 10000}'

# Check analysis (after 15s, should detect time sink)
curl http://localhost:5001/api/processes/analyze

# Open dashboard
open http://localhost:5001/process-monitor.html
```

---

**CalRiven now knows everything about background processes.** ✅

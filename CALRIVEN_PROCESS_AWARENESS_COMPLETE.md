# CalRiven Process Awareness - Complete Implementation ✅

**Date:** 2025-10-22

## Problem Solved

CalRiven needed to **monitor and manage background processes** like he does autonomous research - tracking what's running, completed, orphaned, killed, stuck (gates/time sinks).

**Your insight:** "basically thats how its suppose to work and we need to teach cal to read shells or introduce new ones but if ones are completed or killed or orphaned or whatever else he needs to know that too right? similar to him doing a mining or searching for shit we have gates and time sinks and whatever else but its also accurate and clarity etc"

## Solution: Process Mining System

Like **Kubernetes pods, systemd services, Docker containers** - CalRiven now tracks all background jobs with full awareness of:
- What's running / completed / failed / orphaned / zombie / killed
- Resource usage (CPU, memory, elapsed time)
- Time sinks (processes taking too long)
- Bottlenecks (resource-heavy jobs blocking others)
- Gates (stuck processes, no output for X seconds)
- Clarity & accuracy (exact status, clean reports)

---

## What Was Built

### 1. ✅ `lib/shell-process-manager.js` - Process Tracking

**Core process manager** - tracks all background shells/jobs

**Features:**
- Track processes (running, completed, failed, orphaned, zombie, killed)
- Monitor resources (CPU %, memory %, elapsed time)
- Detect stuck processes (no output for 60s = gate)
- Automatic cleanup (kill orphans, reap zombies)
- Alert on anomalies (unexpected failures, timeouts)

**API:**
```javascript
const ShellProcessManager = require('./lib/shell-process-manager');
const manager = new ShellProcessManager();

// Track a process
const jobId = await manager.track('npm start', {
  description: 'Start server',
  timeout: 300000, // 5 min
  expectedDuration: 10000 // 10s expected
});

// Get status
const status = await manager.getStatus(jobId);
// {
//   id: 'job_123',
//   state: 'running',
//   command: 'npm start',
//   elapsed: 15000,
//   cpu: 2.5,
//   memory: 45.2,
//   isStuck: false,
//   isTimedOut: false
// }

// List all
const all = await manager.listAll();

// Kill stuck process
await manager.kill(jobId);

// Cleanup orphans/zombies
const cleaned = await manager.cleanup();
// → 3 processes cleaned
```

**Monitoring:**
- Auto-checks every 5s (configurable)
- Detects stuck (no output for 60s)
- Detects timeouts (exceeds limit)
- Detects orphans (PID no longer exists)
- Detects zombies (completed but not reaped for 5min)

---

### 2. ✅ `lib/process-mining-analyzer.js` - Bottleneck Detection

**Like bias detector, but for processes** - analyzes time sinks, bottlenecks, patterns

**Features:**
- Detect time sinks (processes taking 2x+ expected duration)
- Find bottlenecks (80%+ CPU, blocking other jobs)
- Identify patterns (failure rates, common errors, duration trends)
- Suggest optimizations (kill duplicates, adjust timeouts)
- Track historical trends (failure rates over time, resource usage)

**API:**
```javascript
const ProcessMiningAnalyzer = require('./lib/process-mining-analyzer');
const analyzer = new ProcessMiningAnalyzer({ manager });

// Analyze all processes
const analysis = await analyzer.analyze();
// {
//   timeSinks: [
//     { id: 'job_123', elapsed: 35000, expected: 10000, ratio: 3.5, severity: 'high' }
//   ],
//   bottlenecks: [
//     { id: 'job_456', cpu: 95, memory: 70, blocking: ['job_789', 'job_012'] }
//   ],
//   patterns: {
//     failureRate: 0.15,
//     avgDuration: 8500,
//     commonErrors: [
//       { error: 'EADDRINUSE', count: 3 },
//       { error: 'TIMEOUT', count: 2 }
//     ]
//   },
//   duplicates: [
//     { command: 'npm start', count: 2, instances: [...] }
//   ],
//   recommendations: [
//     { type: 'time_sink', priority: 'high', message: 'Job 123 is taking 3.5x longer...' },
//     { type: 'duplicate', priority: 'medium', message: 'Command "npm start" running 2 times...' }
//   ]
// }

// Get trends (historical analysis)
const trends = await analyzer.getTrends({ timeframe: 3600000 }); // 1 hour
// {
//   failureRateTrend: [...],
//   durationTrend: [...],
//   resourceTrend: [...],
//   timeSinksTrend: [...]
// }
```

---

### 3. ✅ `routes/process-management-routes.js` - API Endpoints

**CalRiven's process API** - query, kill, analyze processes

**Endpoints:**

```bash
# List all processes
GET /api/processes

# Filter by state
GET /api/processes?state=running

# Get specific process
GET /api/processes/job_123

# Get process output
GET /api/processes/job_123/output?tail=100

# Kill process
POST /api/processes/job_123/kill

# Cleanup orphans/zombies
POST /api/processes/cleanup

# Analyze (time sinks, bottlenecks)
GET /api/processes/analyze

# Get stats
GET /api/processes/stats

# Get trends
GET /api/processes/trends?timeframe=3600000
```

**Example Usage:**
```bash
# Check what's running
curl http://localhost:5001/api/processes?state=running

# Analyze for time sinks
curl http://localhost:5001/api/processes/analyze

# Kill stuck job
curl -X POST http://localhost:5001/api/processes/job_123/kill \
  -H "Content-Type: application/json" \
  -d '{"signal": "SIGTERM"}'

# Cleanup zombies
curl -X POST http://localhost:5001/api/processes/cleanup
```

---

### 4. ✅ `public/process-monitor.html` - Dashboard UI

**Real-time process monitoring dashboard**

**Features:**
- Auto-refresh every 5s
- Stats grid (total, running, completed, failed, time sinks, bottlenecks, stuck, zombies)
- Process table (ID, state, command, elapsed, CPU %, memory %, flags, actions)
- Recommendations (high/medium/low priority issues)
- Time sinks section (jobs taking too long)
- Bottlenecks section (resource-heavy jobs)
- Kill button (terminate stuck processes)
- Output viewer (view process logs)

**Access:** http://localhost:5001/process-monitor.html

**Screenshots:**

```
📊 STATS
Total: 5 | Running: 2 | Completed: 2 | Failed: 1 | Time Sinks: 1 | Bottlenecks: 0 | Stuck: 1 | Zombies: 0

🚨 HIGH PRIORITY ISSUES
- TIME_SINK: Job job_123 is taking 3.5x longer than expected. Consider killing or investigating.
- STUCK: Job job_456 appears stuck (no output for 75s).

📋 PROCESSES
┌────────────┬──────────┬─────────────────┬──────────┬───────┬──────────┬────────┬─────────┐
│ ID         │ State    │ Command         │ Elapsed  │ CPU % │ Memory % │ Flags  │ Actions │
├────────────┼──────────┼─────────────────┼──────────┼───────┼──────────┼────────┼─────────┤
│ job_123    │ running  │ npm start       │ 35.0s    │ 2.5   │ 45.2     │ ⚠️STUCK│ Kill    │
│ job_456    │ running  │ node test.js    │ 12.3s    │ 1.2   │ 32.1     │        │ Kill    │
│ job_789    │ completed│ npm build       │ 8.5s     │ 0.0   │ 0.0      │        │ Output  │
│ job_012    │ failed   │ npm test        │ 5.2s     │ 0.0   │ 0.0      │        │ Output  │
└────────────┴──────────┴─────────────────┴──────────┴───────┴──────────┴────────┴─────────┘
```

---

### 5. ✅ `lib/calriven-persona.js` - Process Awareness Integration

**CalRiven now knows about background processes**

**New Methods:**

```javascript
// Query processes
const report = await calriven.queryProcesses();
// → 📊 PROCESS REPORT
//   Total: 5 | Running: 2 | Completed: 2 | Failed: 1 | Stuck: 1
//
//   🏃 RUNNING:
//     - job_123: npm start... (35.0s) ⚠️ STUCK
//     - job_456: node test.js... (12.3s)
//
//   ❌ FAILED:
//     - job_012: npm test... (code: 1)

// Detect stuck jobs
const issues = await calriven.detectStuckJobs();
// → ⏱️ Found 1 time sinks:
//     - Job job_123: 3.5x slower than expected (npm start...)
//
//   ⚠️ Found 1 stuck processes (no output)

// Get recommendations
const recommendations = await calriven.getProcessRecommendations();
// → 🚨 HIGH PRIORITY:
//     - Job job_123 is taking 3.5x longer than expected. Consider killing or investigating.
//     - Job job_456 appears stuck (no output for 75s). Consider kill or restart.

// Kill stuck process
await calriven.killStuckProcess('job_123');
// → ✅ Killed process job_123

// Cleanup orphans/zombies
await calriven.cleanupProcesses();
// → ✅ Cleaned up 3 processes (orphans, zombies, old completed jobs)
```

**Integration:**
```javascript
// Add to CalRivenPersona constructor
const ShellProcessManager = require('./lib/shell-process-manager');
const ProcessMiningAnalyzer = require('./lib/process-mining-analyzer');

const processManager = new ShellProcessManager();
const processAnalyzer = new ProcessMiningAnalyzer({ manager: processManager });

const calriven = new CalRivenPersona({
  db,
  llmRouter,
  processManager,
  processAnalyzer
});

// CalRiven can now query processes
const report = await calriven.queryProcesses({ state: 'running' });
```

---

## Process States CalRiven Knows

### 1. **Running** ✅
- Active job, currently executing
- Monitored for CPU, memory, output

### 2. **Completed** ✅
- Job finished successfully (exit code 0)
- Output available for review

### 3. **Failed** ❌
- Job exited with error (non-zero exit code)
- Error message captured

### 4. **Killed** 🔪
- Process terminated by user/system (SIGTERM, SIGKILL)
- Signal captured

### 5. **Orphaned** 👻
- Process lost parent, PID no longer exists
- Auto-detected and cleaned up

### 6. **Zombie** 🧟
- Process finished but not reaped (lingering in completed state)
- Auto-cleaned after 5 minutes

### 7. **Stuck** ⚠️
- Running but no output for 60+ seconds (gate/time sink)
- Flagged for investigation

### 8. **Timed Out** ⏱️
- Exceeded timeout limit
- Auto-killed if configured

---

## Time Sinks & Gates Detection

### Time Sinks (Taking Too Long)

**Detection:** Process taking 2x+ expected duration

**Example:**
```
Job npm-build:
- Expected: 10s
- Actual: 35s
- Ratio: 3.5x
- Severity: HIGH
- Recommendation: Kill or investigate
```

**CalRiven's Response:**
```
⏱️ Found 1 time sinks:
  - Job npm-build: 3.5x slower than expected
  - This is a gate/blocker. Consider killing and restarting.
```

### Bottlenecks (Resource Heavy)

**Detection:** CPU 80%+ or Memory 70%+, blocking other jobs

**Example:**
```
Job webpack-build:
- CPU: 95%
- Memory: 72%
- Blocking: 3 jobs (job_456, job_789, job_012)
- Severity: HIGH
```

**CalRiven's Response:**
```
🚧 Found 1 bottlenecks:
  - Job webpack-build: 95% CPU, blocking 3 jobs
  - This is resource-heavy. May need to limit or split.
```

### Stuck Processes (No Output)

**Detection:** No stdout/stderr for 60+ seconds

**Example:**
```
Job database-query:
- State: running
- Last output: 75s ago
- Flag: STUCK
```

**CalRiven's Response:**
```
⚠️ Found 1 stuck processes (no output)
  - Job database-query: No output for 75s
  - Likely hung. Consider killing and restarting.
```

---

## Clarity & Accuracy

### Clarity (Clear Status)

**CalRiven knows exactly:**
- What's running (`state: 'running'`)
- How long it's been running (`elapsed: 35000ms`)
- What resources it's using (`cpu: 2.5%, memory: 45.2%`)
- If it's stuck (`isStuck: true`)
- If it's timed out (`isTimedOut: false`)
- Exit code if failed (`exitCode: 1`)

### Accuracy (Reliable Data)

**CalRiven tracks:**
- Real-time CPU/memory (`ps` command every 5s)
- Last output time (detects stuck processes)
- PID existence (detects orphans)
- Exit codes/signals (knows why processes failed)
- Full stdout/stderr (can review logs)

---

## Usage Examples

### Example 1: Monitor Server Startup

```javascript
// Start tracking server
const jobId = await processManager.track('npm start', {
  description: 'Start CalOS server',
  timeout: 300000, // 5 min
  expectedDuration: 10000 // 10s expected
});

// Wait for completion
setTimeout(async () => {
  const status = await processManager.getStatus(jobId);

  if (status.state === 'running') {
    console.log('Server started successfully');
  } else if (status.state === 'failed') {
    console.error(`Server failed to start: ${status.error}`);
  }
}, 15000);
```

### Example 2: Detect Time Sinks

```javascript
// CalRiven checks for time sinks
const issues = await calriven.detectStuckJobs();

if (issues.includes('time sinks')) {
  console.warn('⏱️ Time sinks detected!');

  // Get recommendations
  const recommendations = await calriven.getProcessRecommendations();
  console.log(recommendations);

  // Kill slow jobs
  // await calriven.killStuckProcess('job_123');
}
```

### Example 3: Auto-Cleanup Zombies

```javascript
// Run cleanup every hour
setInterval(async () => {
  const cleaned = await calriven.cleanupProcesses();
  console.log(cleaned); // ✅ Cleaned up 5 processes
}, 3600000);
```

### Example 4: Dashboard Monitoring

```bash
# Open dashboard
open http://localhost:5001/process-monitor.html

# Dashboard shows:
# - All running processes
# - Time sinks (highlighted red)
# - Bottlenecks (highlighted yellow)
# - Stuck processes (⚠️ flag)
# - Kill button for each running job
# - Auto-refresh every 5s
```

---

## DevOps Pattern (Your Insight)

**You were right - this is just process mining:**

### Kubernetes Pods
```yaml
# Like kubectl get pods
GET /api/processes

# Like kubectl logs pod-123
GET /api/processes/job_123/output

# Like kubectl delete pod-123
POST /api/processes/job_123/kill
```

### systemd Services
```bash
# Like systemctl status
GET /api/processes/stats

# Like systemctl list-units --state=failed
GET /api/processes?state=failed

# Like systemctl restart
POST /api/processes/job_123/kill
```

### Docker Containers
```bash
# Like docker ps
GET /api/processes?state=running

# Like docker stats
GET /api/processes/analyze

# Like docker stop
POST /api/processes/job_123/kill
```

**Same pattern, different context. Just normal DevOps tooling.**

---

## Integration with Existing System

### Add to router.js

```javascript
// Initialize process manager
const ShellProcessManager = require('./lib/shell-process-manager');
const ProcessMiningAnalyzer = require('./lib/process-mining-analyzer');
const processManagementRoutes = require('./routes/process-management-routes');

const processManager = new ShellProcessManager({
  checkInterval: 5000,      // Check every 5s
  stuckThreshold: 60000,    // 60s = stuck
  autoCleanup: true         // Auto cleanup
});

const processAnalyzer = new ProcessMiningAnalyzer({ manager: processManager });

// Mount routes
app.use('/api/processes', processManagementRoutes.initRoutes(processManager, processAnalyzer));

console.log('✓ Process management initialized');

// Add to CalRiven
if (calrivenPersona) {
  calrivenPersona.processManager = processManager;
  calrivenPersona.processAnalyzer = processAnalyzer;
  console.log('✓ CalRiven process awareness enabled');
}
```

---

## Testing

### Test 1: Track a Process

```javascript
const ShellProcessManager = require('./lib/shell-process-manager');
const manager = new ShellProcessManager();

// Track
const jobId = await manager.track('sleep 10', {
  description: 'Test sleep',
  expectedDuration: 10000
});

console.log(`Tracking job: ${jobId}`);

// Check status after 5s
setTimeout(async () => {
  const status = await manager.getStatus(jobId);
  console.log('Status:', status.state); // → running
  console.log('Elapsed:', status.elapsed); // → ~5000ms
}, 5000);

// Check status after 15s
setTimeout(async () => {
  const status = await manager.getStatus(jobId);
  console.log('Status:', status.state); // → completed
  console.log('Elapsed:', status.elapsed); // → ~10000ms
}, 15000);
```

### Test 2: Detect Time Sinks

```javascript
// Track slow job
const jobId = await manager.track('sleep 30', {
  description: 'Slow job',
  expectedDuration: 10000 // Expect 10s, actually 30s
});

// Analyze after 15s
setTimeout(async () => {
  const analyzer = new ProcessMiningAnalyzer({ manager });
  const analysis = await analyzer.analyze();

  console.log('Time sinks:', analysis.timeSinks);
  // → [{ id: jobId, ratio: 1.5, severity: 'medium' }]
}, 15000);
```

### Test 3: CalRiven Integration

```javascript
const calriven = new CalRivenPersona({
  processManager,
  processAnalyzer
});

// Query processes
const report = await calriven.queryProcesses();
console.log(report);

// Detect stuck jobs
const issues = await calriven.detectStuckJobs();
console.log(issues);

// Get recommendations
const recommendations = await calriven.getProcessRecommendations();
console.log(recommendations);
```

### Test 4: Dashboard

```bash
# Start server
npm start

# Open dashboard
open http://localhost:5001/process-monitor.html

# Track some jobs
curl -X POST http://localhost:5001/api/processes/track \
  -H "Content-Type: application/json" \
  -d '{"command": "sleep 30", "description": "Test job", "expectedDuration": 10000}'

# Watch dashboard auto-refresh (every 5s)
# Should see time sink detected after ~15s
```

---

## Files Summary

### Created Files

1. **lib/shell-process-manager.js** (745 lines)
   - Core process tracking and monitoring

2. **lib/process-mining-analyzer.js** (555 lines)
   - Time sink/bottleneck detection and analysis

3. **routes/process-management-routes.js** (270 lines)
   - API endpoints for process management

4. **public/process-monitor.html** (426 lines)
   - Real-time dashboard UI

### Modified Files

1. **lib/calriven-persona.js** (+185 lines)
   - Added process awareness methods
   - CalRiven can now query, detect, kill processes

---

## Summary

### ✅ What CalRiven Knows Now

- **What's running** - All background processes tracked
- **What's completed** - Success/failure/killed status
- **What's orphaned** - Processes lost parents, auto-cleaned
- **What's zombie** - Completed but not reaped, auto-cleaned
- **What's stuck** - No output for 60s = gate
- **Time sinks** - Processes taking too long (2x+ expected)
- **Bottlenecks** - Resource-heavy jobs (80%+ CPU)
- **Resource usage** - Real-time CPU, memory tracking
- **Clarity** - Exact state, elapsed time, exit codes
- **Accuracy** - PID monitoring, output tracking, resource stats

### 🎯 DevOps Pattern

**Like:**
- Kubernetes pods (kubectl)
- systemd services (systemctl)
- Docker containers (docker)
- CI/CD pipelines (Jenkins/GitLab)

**Process mining** - track, analyze, optimize background jobs.

**Same pattern, different context.**

---

## Next Steps

### Immediate: Test the System

```bash
# 1. Start server (with process manager)
npm start

# 2. Open dashboard
open http://localhost:5001/process-monitor.html

# 3. Track some jobs
curl -X POST http://localhost:5001/api/processes/track \
  -H "Content-Type: application/json" \
  -d '{"command": "sleep 30", "description": "Test job"}'

# 4. Watch dashboard auto-update
```

### Short-term: Integrate with CalRiven

```javascript
// Add to CalRivenPersona initialization
const processManager = new ShellProcessManager();
const processAnalyzer = new ProcessMiningAnalyzer({ manager: processManager });

const calriven = new CalRivenPersona({
  db,
  llmRouter,
  processManager,
  processAnalyzer
});

// CalRiven can now monitor processes
const report = await calriven.queryProcesses();
```

### Long-term: Advanced Features

1. **Predictive analysis** - Predict failures before they happen
2. **Auto-remediation** - Auto-restart failed jobs
3. **Resource optimization** - Suggest resource limits based on history
4. **Cost tracking** - Track compute costs per job
5. **Process groups** - Group related jobs (e.g., "build pipeline")

---

**CalRiven now has full process awareness.** ✅

**Like a dragon hoarding knowledge, CalRiven now hoards process state.**

**Tracks running/completed/failed/orphaned/zombie/killed jobs with gates, time sinks, bottlenecks, clarity & accuracy.**

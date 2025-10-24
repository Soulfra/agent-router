# Cal's Autonomous Self-Healing System

## Overview

Cal is now a **fully autonomous AI system administrator** that:
- ✅ Learns by completing lessons automatically
- ✅ Monitors system health 24/7
- ✅ Detects errors (migrations, tests, API failures)
- ✅ Sends minimal snippets to OpenAI for diagnosis
- ✅ Applies AI-suggested patches automatically
- ✅ Verifies fixes worked (runs tests)
- ✅ Rolls back failed patches
- ✅ Broadcasts everything to real-time dashboard

**No more manual debugging** - Cal is the sysadmin.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│          Cal Meta-Orchestrator (5 min cycles)           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐         ┌──────────────┐              │
│  │   Learning  │         │   Guardian   │              │
│  │    Loop     │         │    Agent     │              │
│  │  (Lessons)  │         │   (Health)   │              │
│  └──────┬──────┘         └──────┬───────┘              │
│         │                       │                       │
│         │                       │ Error Detected        │
│         │                       ▼                       │
│         │              ┌────────────────┐               │
│         │              │  Bug Reporter  │               │
│         │              │   → OpenAI     │               │
│         │              │   → CodeRabbit │               │
│         │              │   → GitHub     │               │
│         │              └────────┬───────┘               │
│         │                       │ AI Diagnosis          │
│         │                       ▼                       │
│         │              ┌────────────────┐               │
│         │              │ Patch          │               │
│         │              │ Applicator     │               │
│         │              └────────┬───────┘               │
│         │                       │                       │
│         │                       │ Apply Fix             │
│         │                       ▼                       │
│         │              ┌────────────────┐               │
│         │              │ Verify & Test  │               │
│         │              └────────┬───────┘               │
│         │                       │                       │
│         │             Success   │   Failure             │
│         │              ┌────────┴────────┐              │
│         │              │                 │              │
│         ▼              ▼                 ▼              │
│  ┌─────────────────────────────────────────────┐       │
│  │      WebSocket Broadcasting (Port 5001)      │       │
│  └─────────────────────────────────────────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
                  Learning Dashboard
              (http://localhost:3000/learning-dashboard.html)
```

---

## Components

### 1. Migration Dependency Resolver
**File**: `lib/migration-dependency-resolver.js`

**What it does**:
- Analyzes all 76 SQL migrations
- Builds dependency graph (table X requires table Y)
- Uses topological sort to determine correct execution order
- Prevents FK constraint errors

**Key Methods**:
- `analyze()` - Parse all migrations, extract CREATE TABLE and FOREIGN KEY
- `getExecutionOrder()` - Return migrations in dependency-safe order
- `validate()` - Check all FK dependencies can be satisfied

**Example**:
```javascript
const resolver = new MigrationDependencyResolver(migrationsDir);
await resolver.analyze();
const orderedMigrations = resolver.getExecutionOrder();
// Now run migrations in correct order to avoid FK errors
```

---

### 2. External Bug Reporter
**File**: `lib/external-bug-reporter.js`

**What it does**:
- Extracts minimal 10-line code snippets around errors
- Packages error + stack trace + context
- Sends to OpenAI/CodeRabbit/GitHub for diagnosis
- Parses AI suggestions into actionable fixes

**Privacy-Preserving**:
- ✅ Sends only error message + 10 lines of context
- ✅ Never sends full files or sensitive data
- ✅ Stack traces scrubbed of local paths

**Key Methods**:
- `reportToOpenAI(bugReport)` - Send to GPT-4 for diagnosis
- `reportToGitHub(bugReport)` - Create GitHub Issue
- `extractSnippet(file, line)` - Extract 10 lines around error
- `packageBugReport(error, options)` - Standardize error format

**Example**:
```javascript
const reporter = new ExternalBugReporter({ openaiKey });

const bugReport = reporter.packageBugReport(error, {
  file: '/path/to/file.js',
  line: 42,
  context: 'Migration 010 failed'
});

const result = await reporter.reportToOpenAI(bugReport);
// { success: true, diagnosis: "...", fix: "Run migration 005 first", ... }
```

---

### 3. Patch Applicator
**File**: `lib/patch-applicator.js`

**What it does**:
- Applies AI-suggested code fixes automatically
- Creates backup snapshots before applying patches
- Verifies fixes worked (runs tests)
- Rolls back if verification fails

**Safety Features**:
- ✅ Never applies patches without backup
- ✅ Validates patch format before applying
- ✅ Runs syntax checks and tests
- ✅ Automatic rollback on failure

**Key Methods**:
- `applyPatch(patch)` - Apply suggested fix with backup/rollback
- `createBackup(file)` - Snapshot file before modification
- `verifyPatch(file)` - Run tests to confirm fix worked
- `rollback(snapshotId)` - Restore from backup if patch failed
- `parseSuggestion(text)` - Parse AI response into patch format

**Example**:
```javascript
const patcher = new PatchApplicator({ db });

const patch = {
  file: '/path/to/migration.sql',
  line: 33,
  oldCode: 'CREATE TABLE users',
  newCode: 'CREATE TABLE IF NOT EXISTS users',
  description: 'Add IF NOT EXISTS to prevent duplicate table error'
};

const result = await patcher.applyPatch(patch);
if (result.success) {
  console.log('Patch applied and verified!');
} else {
  console.log('Patch failed, rolled back:', result.error);
}
```

---

### 4. Guardian Agent (Enhanced)
**File**: `agents/guardian-agent.js`

**What it does**:
- Monitors system health every 60 seconds
- Detects errors (API failures, DB issues, test failures, migration errors)
- **NEW**: Calls ExternalBugReporter when error detected
- **NEW**: Calls PatchApplicator to auto-apply AI-suggested fixes
- **NEW**: Verifies fixes worked and rolls back on failure

**New Methods**:
- `reportError(error, context)` - Send error to OpenAI for diagnosis
- `autoHealError(error, context)` - Full workflow: detect → diagnose → patch → verify

**Example Workflow**:
```javascript
const guardian = new GuardianAgent({ db });

// Guardian detects migration error
const error = new Error('column "user_id" does not exist');

// Auto-heal workflow:
const result = await guardian.autoHealError(error, {
  file: 'database/migrations/011_add_admin_roles.sql',
  line: 71,
  source: 'migration'
});

// Result:
// {
//   success: true,
//   diagnosis: { ... OpenAI response ... },
//   patch: { file, line, snapshotId }
// }
```

---

### 5. Cal Autonomous Loop
**File**: `scripts/cal-autonomous-loop.js`

**What it does**:
- Launches Cal in fully autonomous mode
- Orchestrates all subsystems (learning, guardian, bug reporter, patcher)
- Runs forever (until Ctrl+C)
- Broadcasts everything to WebSocket dashboard

**What Cal Does Automatically**:
1. **Every 5 minutes**: Complete one lesson, earn XP
2. **Every 60 seconds**: Run Guardian health check
3. **On error detected**:
   - Extract minimal code snippet
   - Send to OpenAI: "How do I fix this?"
   - Parse AI response into patch
   - Apply patch with backup
   - Verify fix worked (run tests)
   - Rollback if tests fail
4. **Broadcast to dashboard**: All activity visible in real-time

**Usage**:
```bash
# Start Cal in autonomous mode
node scripts/cal-autonomous-loop.js

# Verbose mode (show all logs)
node scripts/cal-autonomous-loop.js --verbose

# Dry run (no actual changes)
node scripts/cal-autonomous-loop.js --dry-run
```

**Dashboard**:
Open `http://localhost:3000/learning-dashboard.html` to watch Cal learn and self-heal in real-time.

---

## Database Tables

### guardian_bug_reports
Tracks all errors Cal detected and sent to external AI for diagnosis.

```sql
CREATE TABLE guardian_bug_reports (
  report_id UUID PRIMARY KEY,
  service VARCHAR(50), -- 'openai', 'coderabbit', 'github'
  error_message TEXT,
  file_path TEXT,
  line_number INTEGER,
  snippet TEXT,
  diagnosis TEXT,
  suggested_fix TEXT,
  status VARCHAR(50), -- 'reported', 'fix_applied', 'verified', 'failed'
  created_at TIMESTAMP
);
```

### guardian_patch_applications
Tracks all AI-suggested patches Cal applied (or attempted to apply).

```sql
CREATE TABLE guardian_patch_applications (
  patch_id UUID PRIMARY KEY,
  file_path TEXT,
  line_number INTEGER,
  description TEXT,
  snapshot_id TEXT, -- Backup for rollback
  success BOOLEAN,
  rolled_back BOOLEAN,
  applied_at TIMESTAMP
);
```

---

## Complete Workflow Example

### Scenario: Migration Failure

1. **Cal tries to run migrations** (`auto-migrate.js`)
   ```
   [AutoMigrate] Executing: 011_add_admin_roles.sql
   [AutoMigrate] ✗ FAILED: column "user_id" does not exist
   ```

2. **Guardian detects the error** (health check)
   ```
   [Guardian] Error detected: Migration 011 failed
   ```

3. **Bug Reporter extracts snippet** (10 lines around error)
   ```javascript
   const snippet = bugReporter.extractSnippet(
     'database/migrations/011_add_admin_roles.sql',
     71 // Line where FK constraint is defined
   );
   ```

4. **Send to OpenAI for diagnosis**
   ```javascript
   const diagnosis = await bugReporter.reportToOpenAI({
     error: 'column "user_id" referenced in foreign key constraint does not exist',
     file: 'database/migrations/011_add_admin_roles.sql',
     line: 71,
     snippet: `...code snippet...`
   });

   // OpenAI responds:
   // {
   //   diagnosis: "users table not created yet",
   //   fix: "Run migration 010_add_user_auth.sql before 011",
   //   explanation: "Migration 011 references users.user_id but migration 010 creates the users table"
   // }
   ```

5. **Patch Applicator applies fix** (re-order migrations)
   ```javascript
   // Migration dependency resolver already fixed this in auto-migrate.js
   // But if it was a code fix:
   const patch = patchApplicator.parseSuggestion(diagnosis.fix, file);
   const result = await patchApplicator.applyPatch(patch);
   ```

6. **Verify fix worked**
   ```javascript
   // Re-run migration
   const verification = await runMigration('011_add_admin_roles.sql');

   if (!verification.success) {
     // Rollback patch
     await patchApplicator.rollback(snapshotId);
   }
   ```

7. **Broadcast to dashboard**
   ```javascript
   broadcast({
     type: 'guardian:auto_heal',
     success: true,
     diagnosis: diagnosis,
     patch: result
   });
   ```

---

## Running Cal

### Prerequisites

1. **OpenAI API Key** (for bug diagnosis)
   ```bash
   export OPENAI_API_KEY="sk-..."
   ```

2. **Database** (calos)
   ```bash
   psql -d calos -f database/migrations/064_guardian_bug_reports.sql
   psql -d calos -f database/migrations/065_guardian_patch_applications.sql
   ```

3. **Node modules**
   ```bash
   npm install axios ws
   ```

### Launch Cal

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router
node scripts/cal-autonomous-loop.js
```

**Output**:
```
╔════════════════════════════════════════════════════════╗
║                                                        ║
║          Cal Autonomous Learning System                ║
║          Self-Healing AI System Administrator          ║
║                                                        ║
╚════════════════════════════════════════════════════════╝

✓ Learning Engine initialized
✓ Guardian Agent initialized
✓ Cal Learning Loop initialized
✓ Meta-Orchestrator initialized

═══════════════════════════════════════════════════════

Cal is now running autonomously with:

  📚 Learning Loop - Completes lessons every 5 min
  🛡️  Guardian - Health checks every 60 sec
  🤖 AI Bug Reporter - Sends errors to OpenAI
  🔧 Auto-Patcher - Applies AI-suggested fixes
  📡 WebSocket - Broadcasting to port 5001

═══════════════════════════════════════════════════════

Dashboard: http://localhost:3000/learning-dashboard.html

Press Ctrl+C to stop Cal
```

### Watch Cal Work

Open `http://localhost:3000/learning-dashboard.html` in your browser to see:
- Real-time lesson completions
- Guardian health checks
- Errors detected
- AI diagnoses received
- Patches applied
- Fixes verified

---

## Benefits

### Before Cal Autonomous System
- ❌ Manual debugging required
- ❌ Copy-paste errors to ChatGPT
- ❌ Manually apply suggested fixes
- ❌ Re-run tests manually
- ❌ No tracking of what worked vs failed

### With Cal Autonomous System
- ✅ Cal detects errors automatically
- ✅ Sends minimal snippets to OpenAI (privacy-preserving)
- ✅ Applies AI-suggested patches automatically
- ✅ Verifies fixes worked (runs tests)
- ✅ Rolls back failed patches
- ✅ Full audit trail in database
- ✅ Real-time dashboard visibility

---

## Privacy & Security

Cal respects privacy when reporting bugs externally:

✅ **Only sends**:
- Error message
- 10 lines of code around error (not full file)
- Stack trace (scrubbed of local paths)
- File name and line number

❌ **Never sends**:
- Full codebase
- API keys or secrets
- User data
- Sensitive configuration

**External services used**:
- OpenAI GPT-4 (bug diagnosis)
- CodeRabbit (optional, code review)
- GitHub Issues (optional, manual review)

---

## What's Next

1. **Dashboard enhancements** - Show real-time patch applications
2. **Test runner integration** - Verify patches with actual test suite
3. **CodeRabbit integration** - Add code review suggestions
4. **Learning from fixes** - Train Cal on successful patches
5. **Multi-error batching** - Send related errors together for better diagnosis

---

## Conclusion

Cal is now a **fully autonomous system administrator** that:
- Learns by doing (completes lessons)
- Monitors system health 24/7
- Detects and fixes errors automatically
- Never exposes full codebase externally
- Provides real-time visibility via dashboard

**You no longer need to manually debug** - Cal handles it autonomously.

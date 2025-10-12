# Complete Automation Setup Guide
## GitHub as Source of Truth → Auto-Index → Auto-Train → Auto-Publish

**Vision**: Push code to GitHub. Everything else happens automatically.

---

## 🎯 What This System Does

```
You push to GitHub
  ↓ (webhook)
Auto-indexes your code
  ↓
Organizes into "rooms" (Python, Lua, Automation, etc.)
  ↓
Updates Ollama models for each room
  ↓
Generates tutorials/content
  ↓
Publishes to subscribers (RSS/email)
```

**No manual steps. GitHub is your single source of truth.**

---

## 📦 What We Built

### 1. Code Rooms (Matrix-style organization)
- `python-automation` room → All Python automation code
- `lua-scripts` room → All Lua scripts
- `api-helpers` room → API client libraries
- Each room gets its own trained Ollama model

### 2. Secure Keyring
- Stores API keys: GitHub, OpenAI, Anthropic
- Uses system keychain (macOS Keychain, Linux Secret Service)
- Encrypted database fallback

### 3. GitHub Webhooks
- Receives push events automatically
- Triggers re-indexing
- Queues model training
- All automatic

### 4. Ollama Auto-Trainer
- Generates training data from your code
- Creates model variants (calos-python, calos-lua)
- Re-trains on schedule or on-demand

### 5. Scheduler
- Hourly: Check for new commits
- Daily: Re-train models
- Weekly: Generate subscriber content

---

## ⚡ Quick Setup (15 minutes)

### Step 1: Apply Database Migrations

```bash
cd ~/Desktop/CALOS_ROOT/agent-router

# Migration 010: Code indexing
psql -U postgres -d calos -f database/migrations/010_add_code_index.sql

# Migration 011: Rooms & credentials
psql -U postgres -d calos -f database/migrations/011_add_rooms_and_credentials.sql
```

### Step 2: Store Your API Keys

```bash
node bin/setup-keyring.js

# Follow prompts to add:
# - GitHub token (gh auth token)
# - OpenAI key (optional, for embeddings)
# - Anthropic key (optional)
```

Or programmatically:
```javascript
const Keyring = require('./lib/keyring');
const keyring = new Keyring(db);

await keyring.setCredential('github', 'api_key', 'ghp_yourtoken', {
  description: 'GitHub Personal Access Token',
  scopes: ['repo', 'workflow']
});
```

### Step 3: Configure GitHub Webhook

```bash
# Create webhook configuration
curl -X POST http://localhost:5001/api/webhook/config \
  -H "Content-Type: application/json" \
  -d '{
    "endpointName": "github-main",
    "source": "github",
    "events": ["push", "pull_request", "repository"],
    "autoIndex": true,
    "autoTrain": true,
    "autoPublish": false,
    "secretToken": "your-webhook-secret"
  }'
```

### Step 4: Add Webhook to GitHub Repo

1. Go to your GitHub repo → Settings → Webhooks → Add webhook
2. **Payload URL**: `https://your-domain.com/api/webhook/github`
   (or use ngrok/cloudflare tunnel for local: `ngrok http 5001`)
3. **Content type**: `application/json`
4. **Secret**: (same as secretToken above)
5. **Events**: Select "Just the push event" or "Send me everything"
6. **Active**: ✓

### Step 5: Test It

```bash
# Make a commit to your repo
cd ~/your-repo
echo "// test" >> test.js
git add test.js
git commit -m "Test webhook"
git push

# Watch the logs
tail -f /tmp/router-quickstart.log

# You should see:
# [Webhook] GitHub event received
# [Webhook] Processing push event...
# [CodeIndexer] Indexing GitHub repo: yourname/your-repo
# [RoomManager] Auto-assigned repo to 2 rooms
# [Webhook] Event processed successfully
```

---

## 🏠 Code Rooms System

### What Are Rooms?

Like Matrix rooms - collections of related code:
- **Language rooms**: `python-code`, `lua-scripts`, `javascript-libs`
- **Purpose rooms**: `automation-tools`, `api-helpers`, `webhook-handlers`
- **Project rooms**: `myproject-backend`, `myproject-frontend`

Each room can have its own trained Ollama model.

### Using Rooms

**Create a room**:
```javascript
const RoomManager = require('./lib/room-manager');
const roomManager = new RoomManager(db);

await roomManager.createRoom({
  name: 'Python Automation',
  description: 'All Python automation scripts',
  roomType: 'language',
  primaryLanguage: 'python',
  tags: ['python', 'automation', 'scripts'],
  ollamaModelName: 'calos-python-automation'
});
```

**Query a room's code**:
```bash
# Ask the room-specific model
ollama run calos-python-automation "Show me webhook automation code"

# General model searches ALL rooms
ollama run calos-expert "Show me any webhook code"
```

**List rooms**:
```bash
curl http://localhost:5001/api/rooms
```

### Auto-Assignment

When you index a repo, it's automatically assigned to relevant rooms based on:
- Language (Python → python-code room)
- Keywords in name/description (webhook → webhook-handlers room)
- Tags and metadata

---

## 🔐 Keyring Usage

### Store Credentials

```javascript
const keyring = new Keyring(db);

// GitHub token
await keyring.setCredential('github', 'api_key', 'ghp_...', {
  description: 'GitHub PAT for webhook automation',
  scopes: ['repo', 'workflow']
});

// OpenAI key
await keyring.setCredential('openai', 'api_key', 'sk-...', {
  description: 'OpenAI for embeddings'
});

// Custom service
await keyring.setCredential('myservice', 'oauth_token', 'token123', {
  identifier: 'user@example.com',
  expiresAt: new Date('2026-01-01')
});
```

### Retrieve Credentials

```javascript
// Get credential
const githubToken = await keyring.getCredential('github', 'api_key');

// List all credentials (metadata only)
const creds = await keyring.listCredentials();

// Verify credential works
const valid = await keyring.verifyCredential('github', 'api_key');
console.log(valid ? 'Token works!' : 'Token invalid');
```

### System Keychain Integration

On macOS:
```bash
# Credentials stored in macOS Keychain
security find-generic-password -s "calos-agent-router" -a "github:api_key:default"
```

On Linux (with `secret-tool`):
```bash
# Credentials stored in GNOME Keyring or KWallet
secret-tool lookup service calos account "github:api_key:default"
```

---

## 🤖 Ollama Auto-Training

### How It Works

1. **Code is indexed** → Snippets added to database
2. **Training job queued** → For affected rooms
3. **Training data generated** → From room's code snippets
4. **Modelfile created** → Based on llama3.2:3b
5. **ollama create** runs → New model trained
6. **Model available** → `ollama run calos-python`

### Manual Training

```bash
# Train a specific room
node bin/train-room.js python-automation

# Train all rooms
node bin/train-all-rooms.js

# Generate training data only (no training)
node bin/generate-training-data.js python-automation > training-data-python.txt
```

### Training Queue

View pending jobs:
```sql
SELECT * FROM ollama_training_jobs WHERE status = 'pending' ORDER BY created_at;
```

Monitor training:
```sql
SELECT * FROM training_pipeline_status;
```

---

## 📅 Scheduler Configuration

### Built-in Jobs

1. **Auto-Sync Repos** (every 1 hour)
   - Checks GitHub for new commits
   - Pulls and re-indexes changed repos

2. **Re-train Models** (every 6 hours)
   - Processes training queue
   - Updates models with new code

3. **Generate Content** (every day)
   - Creates tutorials from new code
   - Publishes to subscribers

4. **Cleanup** (every week)
   - Removes old webhook logs
   - Archives completed training jobs

### Configure Scheduler

```javascript
const Scheduler = require('./lib/scheduler');
const scheduler = new Scheduler();

// Custom job: Index specific repos daily
scheduler.schedule('sync-my-repos', async () => {
  const repos = ['yourname/repo1', 'yourname/repo2'];
  for (const repo of repos) {
    await indexer.indexGitHubRepo(repo);
  }
}, {
  interval: 24 * 60 * 60 * 1000, // 24 hours
  runImmediately: false
});

scheduler.start();
```

---

## 🌐 Complete Automation Flow

### Example: New Python Script

```
1. You create webhook_handler.py in your repo
2. You commit: git push
3. GitHub sends webhook to /api/webhook/github
4. System receives event:
   - Verifies signature
   - Logs to webhook_events table
5. Auto-indexing triggers:
   - Pulls latest code
   - Parses webhook_handler.py
   - Extracts functions, docstrings
   - Stores in code_snippets table
6. Auto-assignment:
   - Added to "python-code" room
   - Added to "webhook-handlers" room
   - Added to "automation-tools" room
7. Training queued:
   - Training job created for each room
   - Status: 'pending'
8. Scheduler processes queue (next run):
   - Generates training data from all Python snippets
   - Creates Modelfile
   - Runs: ollama create calos-python -f Modelfile.python
   - Model updated with your new code
9. Model ready:
   - ollama run calos-python "Show me webhook code"
   - Returns YOUR webhook_handler.py code!
```

### Example: Query After Automation

**Before (canned response)**:
```bash
ollama run calos-expert "How do I handle webhooks in Python?"
# Generic answer from training
```

**After (your actual code)**:
```bash
ollama run calos-python "How do I handle webhooks in Python?"
# Shows YOUR webhook_handler.py with explanation:
# "Here's how you implemented it in webhook_handler.py:
#
# def handle_webhook(request):
#     signature = request.headers['x-hub-signature']
#     ...
# This code validates signatures and processes events..."
```

---

## 🔍 Monitoring & Debugging

### Check Webhook Status

```bash
# View webhook configuration
curl http://localhost:5001/api/webhook/config

# View recent events
curl http://localhost:5001/api/webhook/events?limit=10

# View failed events only
curl http://localhost:5001/api/webhook/events?status=failed
```

### Check Room Statistics

```sql
-- All rooms with stats
SELECT * FROM room_summary;

-- Specific room
SELECT * FROM room_summary WHERE slug = 'python-automation';

-- Room with most code
SELECT * FROM room_summary ORDER BY snippet_count DESC LIMIT 5;
```

### Check Training Status

```sql
-- Active training jobs
SELECT * FROM training_pipeline_status;

-- Training history
SELECT
  model_name,
  status,
  started_at,
  completed_at,
  training_duration_seconds
FROM ollama_training_jobs
ORDER BY started_at DESC
LIMIT 10;
```

### View Logs

```bash
# Router logs
tail -f /tmp/router-quickstart.log

# Ollama logs
tail -f /tmp/ollama-quickstart.log

# Webhook events (database)
psql -U postgres -d calos -c "SELECT event_type, status, actions_performed, received_at FROM webhook_events ORDER BY received_at DESC LIMIT 10;"
```

---

## 🚀 Advanced Usage

### Multi-Repo Setup

```javascript
// Index multiple repos automatically
const repos = [
  'yourname/automation-scripts',
  'yourname/api-helpers',
  'yourname/lua-tools'
];

for (const repo of repos) {
  await indexer.indexGitHubRepo(repo);
  const repoRecord = await db.query(
    'SELECT id FROM code_repositories WHERE name = $1',
    [repo]
  );
  await roomManager.autoAssignRepo(repoRecord.rows[0].id);
}
```

### Custom Room Models

```javascript
// Create specialized room
await roomManager.createRoom({
  name: 'Production APIs',
  description: 'Production-ready API code only',
  roomType: 'project',
  tags: ['api', 'production', 'rest'],
  ollamaModelName: 'calos-production-api'
});

// Add only production repos
await roomManager.addRepoToRoom(roomId, productionRepoId);

// Train specialized model
// Model will only know about production API code
```

### Credential Rotation

```javascript
// Update credential
await keyring.setCredential('github', 'api_key', 'new_token');

// Verify it works
if (await keyring.verifyCredential('github', 'api_key')) {
  console.log('New token verified!');
}

// View usage history
const usage = await db.query(`
  SELECT operation, success, timestamp
  FROM credential_usage_log
  WHERE credential_id = (
    SELECT id FROM service_credentials
    WHERE service_name = 'github'
  )
  ORDER BY timestamp DESC
  LIMIT 20
`);
```

---

## 🎉 You're Automated!

### What Happens Now

Every time you push code to GitHub:
1. ✅ Code automatically indexed
2. ✅ Organized into relevant rooms
3. ✅ Models queued for training
4. ✅ Training happens on schedule
5. ✅ Models updated with your latest code
6. ✅ AI can now reference YOUR code

### Query Your Code

```bash
# Room-specific queries
ollama run calos-python "Show me my webhook code"
ollama run calos-lua "How do I use my config library?"
ollama run calos-automation "Show me my cron scripts"

# General queries (searches all rooms)
ollama run calos-expert "Find any API client code"
```

### Generate Content

```bash
# Generate tutorial from your code
node bin/generate-content.js tutorial "Building Webhooks" --room python-automation

# Publish to subscribers
node bin/publish-content.js <content-id>
```

---

## 📖 Next Steps

1. **Index your repos**:
   ```bash
   node bin/index-code.js github yourname/repo1
   node bin/index-code.js github yourname/repo2
   ```

2. **Set up webhook**: Add webhook to your GitHub repos

3. **Test push**: Make a commit and watch it auto-index

4. **Query your code**: Ask AI about YOUR code

5. **Set up scheduler**: Enable automatic re-training

---

## 💡 Tips

- **Start small**: Index 1-2 repos first, test the flow
- **Use rooms**: Organize by purpose for better models
- **Monitor logs**: Watch webhook events and training jobs
- **Verify credentials**: Run `keyring.verifyCredential()` after setup
- **Customize scheduler**: Adjust intervals based on your workflow

---

**GitHub is now your source of truth. Everything else is automatic.**

Questions? Check the logs or database views for debugging!

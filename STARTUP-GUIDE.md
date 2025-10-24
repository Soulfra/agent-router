# CALOS Startup Guide

## Quick Start (3 Steps)

```bash
# 1. Run database migrations
npm run migrate

# 2. Set your OpenAI API key (optional - will use Ollama if not set)
# Edit .env and add: OPENAI_API_KEY=sk-your-key-here

# 3. Start everything
npm run start:all
```

That's it! CALOS is now running.

---

## What Just Happened?

### Step 1: `npm run migrate`
- Created `ai_conversations` table (logs all OpenAI/Anthropic calls)
- Created `guardian_bug_reports` table (tracks Cal's bug fixes)
- Created `guardian_patch_applications` table (tracks auto-applied patches)
- Fixed any missing columns (like `icon_emoji` in `learning_paths`)

### Step 2: Set API Key
- If you have `OPENAI_API_KEY`: Cal will use GPT-4 for bug diagnosis
- If not set: Cal will use local Ollama (free, but needs `ollama serve` running)

### Step 3: `npm run start:all`
- Started **Router** (port 5001) - Main API server
- Started **Cal Autonomous Loop** - Self-learning AI admin
- Started **Guardian** - Monitors system health every 60s
- Enabled **AI Logging** - All OpenAI calls saved to database + forum

---

## Verify It Works

### 1. Check Router is Running
```bash
curl http://localhost:5001/health
```

Expected: `{"status":"ok"}`

### 2. Test AI Conversation Logging
```bash
npm run test:ai-logging
```

Expected output:
```json
{
  "success": true,
  "message": "AI conversation logging working correctly",
  "logged_to_database": true,
  "conversation_id": "uuid-here"
}
```

### 3. Check Database
```bash
psql -d calos -c "SELECT COUNT(*) FROM ai_conversations;"
```

Should show at least 1 conversation (from the test).

### 4. Export Conversations to CSV
```bash
npm run export:conversations
```

Creates `ai_conversations_2024-10-22_HH-MM-SS.csv` in current directory.

### 5. Test Ollama Streaming Sessions
```bash
# Start a session (returns sessionId)
curl -X POST http://localhost:5001/api/ollama/session/start \
  -H "Cookie: session_token=your-token" \
  -H "Content-Type: application/json" \
  -d '{"sessionName": "Test Session", "primaryModel": "ollama:mistral"}'

# Chat in the session
curl -X POST http://localhost:5001/api/ollama/session/{sessionId}/chat \
  -H "Cookie: session_token=your-token" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}'

# End session and get summary
curl -X POST http://localhost:5001/api/ollama/session/{sessionId}/end \
  -H "Cookie: session_token=your-token"
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│         npm run start:all                   │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
   ┌────▼──────┐      ┌─────▼─────────┐
   │  Router   │      │ Cal Loop      │
   │ (port     │      │ (background)  │
   │  5001)    │      └─────┬─────────┘
   └────┬──────┘            │
        │                   │
        │         ┌─────────▼────────┐
        │         │  Guardian Agent  │
        │         │  (every 60s)     │
        │         └─────────┬────────┘
        │                   │
        │                   │
   ┌────▼───────────────────▼───────────┐
   │      PostgreSQL Database           │
   │  - users                           │
   │  - ai_conversations  ← NEW         │
   │  - guardian_bug_reports            │
   │  - forum_threads                   │
   └────────────────────────────────────┘
```

### Data Flow

1. **User logs in** → Router authenticates → `users` table
2. **Guardian detects error** → Sends to OpenAI
3. **OpenAI responds** → Conversation logged to `ai_conversations` table
4. **Important conversation** → Auto-posted to `forum_threads`
5. **Anytime**: Export all conversations via `npm run export:conversations`

---

## What's Running?

When you run `npm run start:all`, you get:

### 1. Router (port 5001)
- Main API server
- Handles login, auth, API requests
- Serves web dashboard
- **New:** Test endpoint at `/api/test-ai-logging`

### 2. Cal Autonomous Loop
- Completes programming lessons automatically
- Learns debugging patterns
- Runs in background, separate process

### 3. Guardian Agent
- Monitors system health every 60 seconds
- Detects errors (migrations, tests, API failures)
- Sends errors to OpenAI for diagnosis
- Auto-applies fixes if safe

### 4. AI Conversation Logger
- Logs ALL OpenAI API calls to database
- Records: prompt, response, tokens, cost, latency
- Auto-posts important conversations to forum
- Enables CSV export of conversation history

---

## Configuration

### Database (.env)
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calos
DB_USER=matthewmauer
DB_PASSWORD=
```

### AI Services (.env)
```bash
# OpenAI (for remote AI)
OPENAI_API_KEY=sk-your-key-here

# Or use local Ollama (free)
# (no key needed, just run: ollama serve)
```

### Modes

**Remote Mode** (uses OpenAI):
```bash
export OPENAI_API_KEY=sk-...
npm run start:all
```

**Local Mode** (uses Ollama):
```bash
# Start Ollama
ollama serve

# Pull model
ollama pull mistral:7b

# Start CALOS (no OPENAI_API_KEY needed)
npm run start:all
```

---

## Common Commands

### Startup
```bash
npm run migrate          # Apply database migrations
npm run start:all        # Start everything
npm start                # Start router only
```

### Testing
```bash
npm run test:ai-logging  # Test AI conversation logging
npm run time:check       # Check if system time is correct
curl http://localhost:5001/health  # Health check
```

### Maintenance
```bash
npm run export:conversations       # Export to CSV
npm run export:conversations:stats # Export statistics
npm run time:fix                   # Fix wrong system time
```

### Database
```bash
# Check migrations
psql -d calos -c "SELECT * FROM _migrations ORDER BY applied_at;"

# Check conversations
psql -d calos -c "SELECT service, model, COUNT(*) FROM ai_conversations GROUP BY service, model;"

# Check Guardian activity
psql -d calos -c "SELECT * FROM guardian_bug_reports ORDER BY created_at DESC LIMIT 10;"
```

---

## Troubleshooting

### "Table ai_conversations does not exist"
```bash
npm run migrate
```

### "OpenAI API call failed"
- Check `.env` has `OPENAI_API_KEY=sk-...`
- Or switch to local mode: `ollama serve`

### "Port 5001 already in use"
```bash
# Find process using port
lsof -i :5001

# Kill it
kill -9 <PID>

# Or change port in .env
PORT=5002
```

### "Wrong year in timestamps"
```bash
npm run time:check
npm run time:fix
```

### "Database connection failed"
```bash
# Start PostgreSQL
brew services start postgresql

# Or check if running
psql -d calos -c "SELECT 1;"
```

---

## Production Deployment

### Using PM2 (Recommended)
```bash
npm install -g pm2

# Start
pm2 start start-all.js --name calos

# Monitor
pm2 status
pm2 logs calos

# Stop
pm2 stop calos
```

### Using Systemd (Linux)
```bash
# Create /etc/systemd/system/calos.service
[Unit]
Description=CALOS Agent Router
After=network.target postgresql.service

[Service]
Type=simple
User=matthewmauer
WorkingDirectory=/path/to/agent-router
ExecStart=/usr/bin/node /path/to/agent-router/start-all.js
Restart=on-failure

[Install]
WantedBy=multi-user.target

# Enable and start
sudo systemctl enable calos
sudo systemctl start calos
```

### Using Docker
```bash
# Build
docker build -t calos-router .

# Run
docker run -d \
  -p 5001:5001 \
  -e OPENAI_API_KEY=sk-... \
  -e DB_HOST=host.docker.internal \
  --name calos \
  calos-router
```

---

## What's Been Fixed

### ✅ Date/Time System
- Wrong year (2025 → 2024) fixed via TimeService
- All timestamps now correct
- Test: `npm run time:check`

### ✅ AI Conversation Logging
- All OpenAI calls logged to database
- Includes prompts, responses, tokens, cost
- Test: `npm run test:ai-logging`

### ✅ Forum Integration
- Important AI conversations auto-posted to forum
- Tagged by service, model, purpose
- Check: `http://localhost:5001/forum`

### ✅ CSV Export
- Export conversation history anytime
- Test: `npm run export:conversations`

### ✅ Ollama Streaming Sessions
- Track work sessions with timer (duration tracking)
- Chat with local Ollama (free)
- Stream context to other models (GPT-4, Claude) when switching domains
- Apply custom branding per domain/client
- Generate end-of-session summaries with cost breakdown
- Tables: `ollama_streaming_sessions`, `ollama_session_messages`, `ollama_context_streams`
- API: `/api/ollama/session/*`

---

## Next Steps

1. **Browse the dashboard**: http://localhost:5001
2. **Check forum for AI conversations**: http://localhost:5001/forum
3. **Export your first CSV**: `npm run export:conversations`
4. **Start an Ollama session**: `POST /api/ollama/session/start`
4. **Monitor Guardian activity**: Watch logs for "[Guardian]" entries
5. **Set up production deployment** (PM2/systemd/Docker)

---

## Support

- Issues: Check `FIXES-APPLIED.md` for what was fixed
- Health check: `npm run health`
- Database schema: See `database/migrations/*.sql`
- Architecture: See ASCII diagram above

---

**Built and fixed by Claude** 🤖

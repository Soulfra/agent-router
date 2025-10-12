# CalOS: Fully Local Operation

**CalOS works 100% offline with no API keys required!**

Like VS Code or a project manager, CalOS runs entirely on your local machine using Ollama for AI capabilities.

## Quick Start (Local Mode)

### 1. Install Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Or download from https://ollama.ai
```

### 2. Start Ollama

```bash
ollama serve
```

### 3. Pull Models (Free & Unlimited)

```bash
# Recommended models:
ollama pull mistral      # Fast, general purpose (7B)
ollama pull llama2       # Meta's model (7B)
ollama pull codellama    # Code-focused (7B)
ollama pull phi          # Microsoft's small model (2.7B)
```

### 4. Run CalOS in Local Mode

```bash
cd agent-router
node router.js --local
```

That's it! CalOS now works completely offline with:
- ✅ Unlimited free AI queries
- ✅ No API costs
- ✅ No internet required
- ✅ Database caching for instant responses
- ✅ Full privacy (nothing leaves your machine)

## Using Local AI

Query Ollama models with `@ollama` mention:

```bash
curl -X POST http://localhost:5001/agent \
  -H "Content-Type: application/json" \
  -d '{"input": "@ollama help me debug this code"}'
```

Or specify a model:

```bash
# Use Mistral
"@ollama:mistral write me a function to sort an array"

# Use CodeLlama for coding
"@ollama:codellama refactor this Python code"

# Use Phi for fast responses
"@ollama:phi what is 2+2?"
```

## Database Caching

When running with `--local` flag, CalOS caches all AI responses in PostgreSQL/SQLite:

- **First query**: Fetches from Ollama, caches result
- **Subsequent identical queries**: Instant response from cache
- **Similar queries**: Semantic search finds cached responses

### View Cached Responses

```sql
-- Recent responses
SELECT * FROM recent_responses LIMIT 10;

-- Fast responses (< 100ms)
SELECT * FROM fast_responses LIMIT 10;

-- Performance by agent
SELECT * FROM agent_performance;
```

## Why Local-First?

### Cost Savings
- OpenAI GPT-4: **$0.01-0.03 per request** → $$$ adds up fast!
- Ollama: **$0.00** → FREE unlimited queries

### Speed
- API calls: 2-10 seconds
- Local cache hit: < 10ms
- Ollama: 1-5 seconds (runs on your GPU!)

### Privacy
- API calls: Your data goes to OpenAI/Anthropic servers
- Local mode: Everything stays on your machine

### Reliability
- API calls: Requires internet, subject to rate limits
- Local mode: Works offline, no rate limits

## Cloud Providers (Optional)

Want to use GPT-4 or Claude sometimes? Just add API keys:

```bash
cp .env.example .env
# Edit .env and add:
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

CalOS will:
1. Try cache first (instant)
2. Fall back to Ollama if no API key
3. Use cloud provider only if explicitly mentioned

```bash
# Uses cached response or Ollama (free)
"help me with this code"

# Forces GPT-4 (costs money, requires API key)
"@gpt4 help me with this code"

# Forces Claude (costs money, requires API key)
"@claude help me with this code"
```

## Hybrid Mode (Best of Both Worlds)

Run with `--local` and configure API keys for hybrid mode:

- Default: Uses Ollama (free, offline)
- Cache: Reuses previous API responses (instant)
- Cloud: Only when explicitly requested with @mention

This gives you:
- Free unlimited queries with Ollama
- Instant responses from cache
- GPT-4/Claude available when you need them
- Cost optimization (only pay for unique queries)

## Database Setup (One-Time)

### PostgreSQL (Recommended)

```bash
# Install PostgreSQL
brew install postgresql@15 pgvector  # macOS
# OR
sudo apt install postgresql-15 postgresql-15-pgvector  # Linux

# Start PostgreSQL
brew services start postgresql@15  # macOS
# OR
sudo systemctl start postgresql  # Linux

# Create database
createdb calos

# Load schema
psql calos < database/schema.sql
```

### SQLite (Lightweight Alternative)

```bash
# No installation needed - SQLite works out of the box!
# Database file will be created automatically at:
# ../memory/calos.db

# Just configure .env:
DB_TYPE=sqlite
DB_PATH=../memory/calos.db
```

## Performance Tracking

CalOS now tracks request→response time differentials:

```sql
-- View latency stats
SELECT
  provider,
  model,
  AVG(latency_ms) as avg_latency,
  MIN(latency_ms) as min_latency,
  MAX(latency_ms) as max_latency
FROM ai_responses
GROUP BY provider, model;

-- Find fast responses
SELECT * FROM fast_responses;  -- < 100ms

-- Find slow responses
SELECT * FROM slow_responses;  -- > 5 seconds

-- Agent performance
SELECT * FROM agent_performance;
```

## Like VS Code or a Project Manager

CalOS is designed to work like your favorite local tools:

- **VS Code**: No internet required for core functionality
- **Project Managers**: All data stored locally
- **Offline-First**: Works without connectivity
- **Optional Cloud**: Sync/features available if you want them

**Default: Fully Local → Optional: Cloud Features**

Not the other way around!

## Troubleshooting

### "Ollama not available"

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not running:
ollama serve

# In another terminal:
ollama pull mistral
```

### "Database initialization failed"

```bash
# PostgreSQL not running?
brew services start postgresql@15  # macOS
sudo systemctl start postgresql    # Linux

# Database doesn't exist?
createdb calos
psql calos < database/schema.sql
```

### Slow Responses

```bash
# Pull a smaller model
ollama pull phi  # 2.7B - very fast

# Or use cache (instant)
# First query caches, second query is instant!
```

## Next Steps

- [Database Setup Guide](database/README.md)
- [Migration from API Mode](database/migrations/)
- [Time & Introspection Features](../TIME-AND-INTROSPECTION.md)
- [Widget System](public/widgets/)

---

**Remember: CalOS works best when it's local-first!** 🚀

No API keys needed. No costs. No limits. Just AI that works like any other local app.

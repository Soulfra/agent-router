# Database Setup for Local Mode

CalOS supports **local mode** (`--local` flag) which caches AI responses in a database for offline use, semantic search, and cost reduction.

## Database Options

### Option 1: PostgreSQL (Recommended)

PostgreSQL with pgvector extension provides the best experience with full semantic search support.

#### Installation

```bash
# macOS
brew install postgresql@15
brew install pgvector

# Ubuntu/Debian
sudo apt-get install postgresql-15 postgresql-15-pgvector

# Start PostgreSQL
brew services start postgresql@15  # macOS
sudo systemctl start postgresql    # Linux
```

#### Database Setup

```bash
# Create database
createdb calos

# Or using psql
psql postgres
CREATE DATABASE calos;
\q

# Load schema
psql calos < database/schema.sql
```

#### Enable pgvector Extension

```sql
-- Connect to database
psql calos

-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify
SELECT * FROM pg_extension WHERE extname = 'vector';
```

#### Configure .env

```bash
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calos
DB_USER=postgres
DB_PASSWORD=yourpassword
```

### Option 2: SQLite (Lightweight Alternative)

SQLite is simpler but lacks vector search capabilities.

#### Installation

SQLite comes pre-installed on most systems. No additional setup needed!

#### Database Setup

```bash
# Schema will be created automatically
# Database file location: ../memory/calos.db
```

#### Configure .env

```bash
DB_TYPE=sqlite
DB_PATH=../memory/calos.db
```

## Running in Local Mode

### Start Router in Local Mode

```bash
cd agent-router
node router.js --local
```

You should see:

```
🗄️  Initializing postgres database for local mode...
✓ PostgreSQL connected
🚀 HTTP Server:     http://localhost:5001
🗄️  Database Mode:   POSTGRES (--local)
   • Caching AI responses for offline use
   • Semantic search enabled
```

### Test Local Mode

```bash
# First request (hits API and caches)
curl -X POST http://localhost:5001/agent \
  -H "Content-Type: application/json" \
  -d '{"input": "@gpt4 what is 2+2?"}'

# Second identical request (hits cache)
curl -X POST http://localhost:5001/agent \
  -H "Content-Type: application/json" \
  -d '{"input": "@gpt4 what is 2+2?"}'
```

You should see `📦 Cache hit for openai:gpt-4` on the second request.

## Database Schema

The schema includes tables for:

- **ai_responses** - Cached AI responses with query hashing
- **ai_embeddings** - Vector embeddings for semantic search
- **arxiv_papers** - Cached research papers
- **paper_embeddings** - Paper vector embeddings
- **fine_tune_datasets** - Training data for fine-tuning
- **fine_tune_runs** - Fine-tuning job tracking
- **agent_metrics** - Performance and usage metrics
- **conversations** - Persistent conversation history
- **user_preferences** - User settings and routing rules

## Viewing Cached Data

### Using psql (PostgreSQL)

```bash
# Connect to database
psql calos

# View recent responses
SELECT * FROM recent_responses LIMIT 10;

# View agent performance
SELECT * FROM agent_performance;

# Count cached responses by provider
SELECT provider, model, COUNT(*)
FROM ai_responses
GROUP BY provider, model;

# Clear cache
TRUNCATE ai_responses CASCADE;
```

### Using SQLite

```bash
# Connect to database
sqlite3 ../memory/calos.db

# View tables
.tables

# View recent responses
SELECT * FROM ai_responses ORDER BY created_at DESC LIMIT 10;

# Count by provider
SELECT provider, model, COUNT(*)
FROM ai_responses
GROUP BY provider, model;
```

## Semantic Search (PostgreSQL Only)

Semantic search finds similar cached responses even if the query text differs.

**Requirements:**
- PostgreSQL with pgvector extension
- OpenAI API key (for generating embeddings)

**How it works:**
1. Query: "How do I sort an array?"
2. System checks for exact match (query hash)
3. If no match, generates embedding for query
4. Searches for similar embeddings in cache
5. Returns cached response if similarity > 85%

**Example:**

```bash
# First query
curl -X POST http://localhost:5001/agent \
  -d '{"input": "@gpt4 how do I sort an array in JavaScript?"}'

# Similar query (will use semantic search)
curl -X POST http://localhost:5001/agent \
  -d '{"input": "@gpt4 what is the best way to sort a JS array?"}'

# Console output:
# 🔍 Semantic match found for openai:gpt-4
#   Similarity: 92.3%
```

## Benefits of Local Mode

1. **Cost Savings** - Reuse cached responses instead of re-querying APIs
2. **Speed** - Instant responses from cache
3. **Offline Support** - Work without internet connection
4. **Privacy** - Keep sensitive queries local
5. **Analytics** - Track usage patterns and agent performance
6. **Semantic Search** - Find similar responses automatically
7. **Fine-Tuning** - Build training datasets from cached interactions

## Troubleshooting

### "Database initialization failed"

**PostgreSQL not running:**
```bash
brew services start postgresql@15  # macOS
sudo systemctl start postgresql    # Linux
```

**Database doesn't exist:**
```bash
createdb calos
psql calos < database/schema.sql
```

**pgvector not installed:**
```bash
brew install pgvector  # macOS
# Or compile from source: https://github.com/pgvector/pgvector
```

### "Semantic search not available"

Requires:
1. PostgreSQL with pgvector extension
2. Embeddings table created (run schema.sql)
3. OpenAI API key for embedding generation

### "Cache hit" not showing

- First query always hits API and caches result
- Subsequent identical queries will hit cache
- Check query hash in database: `SELECT query_hash FROM ai_responses;`

## Migration from API to Local Mode

Simply start router with `--local` flag. Existing functionality remains the same:

```bash
# Before (API mode)
npm start

# After (Local mode with caching)
node router.js --local
```

**All output, formatting, and behavior remains identical** - only the data source changes!

## Advanced Configuration

### Custom Cache TTL

Responses are cached indefinitely by default. To add TTL:

```sql
ALTER TABLE ai_responses ADD COLUMN expires_at TIMESTAMP;

-- Auto-expire after 30 days
UPDATE ai_responses
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL;
```

### Database Backup

**PostgreSQL:**
```bash
pg_dump calos > calos_backup.sql
```

**SQLite:**
```bash
cp ../memory/calos.db ../memory/calos_backup.db
```

### Performance Optimization

```sql
-- Add indexes for faster lookups
CREATE INDEX CONCURRENTLY idx_responses_created
ON ai_responses(created_at DESC);

-- Vacuum regularly
VACUUM ANALYZE ai_responses;
```

## Next Steps

- [Learn about ArXiv integration](./arxiv-integration.md)
- [Set up fine-tuning datasets](./fine-tuning.md)
- [Enable semantic search](./embeddings.md)
- [Monitor agent performance](./metrics.md)

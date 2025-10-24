# ACTUAL Architecture (Not Fake Cloud Stuff)

## What You ACTUALLY Have

This doc explains the **real infrastructure** you've built, not some fake hosted service.

---

## 🏗️ Your Actual Stack

```
YOUR Server (One Machine/VPS)
  IP: your-server-ip or localhost
  Port: 5001
    │
    ├─── Node.js (router.js)
    │     ├── 12 Domain Routes (domain-based routing)
    │     ├── Gmail Webhook (/api/gmail/webhook/*)
    │     ├── AI Router (/api/chat, /agent)
    │     ├── Scraper (/api/scrape)
    │     └── 100+ other routes
    │
    ├─── PostgreSQL (localhost:5432)
    │     └── Database: calos
    │         └── 78 tables (migrations complete)
    │
    ├─── MinIO (localhost:9000)
    │     └── Bucket: calos-models
    │         └── GGUF model files
    │
    └─── Ollama (localhost:11434)
          ├── soulfra-model (creative)
          ├── deathtodata-model (data liberation)
          ├── finishthisrepo-model (code completion)
          ├── ipomyagent-model (business)
          └── 8+ more custom models
```

---

## 🌐 Domain Routing (How 12 Domains → 1 Server)

### DNS Setup
```
soulfra.com                  A    →  your-server-ip
deathtodata.com              A    →  your-server-ip
finishthisidea.com           A    →  your-server-ip
dealordelete.com             A    →  your-server-ip
... (8 more domains)         A    →  your-server-ip
```

All domains point to the SAME server. The router detects hostname and changes behavior.

### How It Works

**File: `middleware/environment-router.js`**
```javascript
// Detects which domain user is visiting
const hostname = req.get('host'); // e.g., "soulfra.com"

if (hostname.includes('soulfra')) {
  req.environment = 'soulfra';
  req.brandColors = ['#667eea', '#764ba2'];
  req.aiModel = 'soulfra-model';
}
```

**File: `lib/domain-context-enricher.js`**
```javascript
// Loads domain-specific settings from PostgreSQL
const domainConfig = await db.query(`
  SELECT brand_colors, style_guide, ai_strategy
  FROM domains WHERE hostname = $1
`, [hostname]);
```

### Example Request Flow

```
User visits: https://soulfra.com/api/chat
           ↓
  DNS → your-server-ip:5001
           ↓
  router.js receives request
           ↓
  middleware/environment-router.js
    • Detects hostname: "soulfra.com"
    • Sets req.environment = 'soulfra'
           ↓
  lib/domain-context-enricher.js
    • Loads brand from PostgreSQL
    • Purple colors, creative focus
           ↓
  lib/multi-llm-router.js
    • Selects Ollama soulfra-model
    • Sends prompt to localhost:11434
           ↓
  Ollama responds with soulfra-flavored answer
           ↓
  Response sent to user
```

---

## 🤖 Ollama Setup (Running on YOUR Server)

### Current Status

**From .env.example:**
```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2
```

### Problem: Network Access

By default, Ollama only listens on `127.0.0.1:11434` (localhost only).

### Solution: Make Ollama Network-Accessible

#### Option 1: Local Development (Current)
```bash
# Ollama runs on localhost
# Node.js router connects via localhost:11434
# Works for: development, single-machine setup
```

#### Option 2: Network Access (Production)
```bash
# On your server, make Ollama accessible on network
export OLLAMA_HOST=0.0.0.0:11434
ollama serve

# Now accessible at:
# - http://your-server-ip:11434 (from other machines)
# - http://localhost:11434 (from same machine)
```

#### Option 3: Subdomain (Advanced)
```bash
# DNS:
ai.soulfra.com  A  →  your-server-ip

# Nginx reverse proxy:
server {
  listen 80;
  server_name ai.soulfra.com;

  location / {
    proxy_pass http://localhost:11434;
  }
}

# Now accessible at:
# https://ai.soulfra.com/api/generate
```

### Your Custom Models

**Location:** `/Users/matthewmauer/Desktop/CALOS_ROOT/agent-router/ollama-models/`

```bash
ollama-models/
├── soulfra-model/
│   └── Modelfile (CodeLlama + creative fine-tuning)
├── deathtodata-model/
│   └── Modelfile (privacy & data liberation)
├── ipomyagent-model/
│   └── Modelfile (business & monetization)
└── ... (9 more)
```

**Load models:**
```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router

# Load all models
for dir in ollama-models/*/; do
  modelname=$(basename "$dir")
  ollama create "$modelname" -f "$dir/Modelfile"
done

# Check loaded models
ollama list
```

---

## 📧 Email System (Gmail Webhook)

### Current Setup

**Routes:** `/api/gmail/webhook/*` (loaded in router.js line 96)

**Setup Command:**
```bash
npm run gmail:setup:free
```

This wizard sets up:
1. Google Sheets as database
2. Service account credentials
3. Free SMTP (Gmail/Brevo/MailerSend)
4. Encryption key

### How It Works

```
User API Request
  POST /api/gmail/webhook/send
    { to: "user@example.com", subject: "Hello", body: "..." }
           ↓
  routes/gmail-webhook-zero-cost-routes.js
    • Validates API key
    • Checks rate limits (50/hr, 500/day)
           ↓
  lib/gmail-gateway.js
    • Checks whitelist (double opt-in)
    • Checks reputation score
           ↓
  lib/free-smtp-adapter.js
    • Sends via Gmail SMTP (500/day free)
    • Or Brevo (300/day) or MailerSend (3k/month)
           ↓
  lib/google-sheets-db-adapter.js
    • Logs to Google Sheets
    • Updates rate limit counters
           ↓
  Email sent! ✓
```

### Environment Variables Needed

```bash
# .env
GOOGLE_SHEETS_DB_ID=your-spreadsheet-id
GOOGLE_SHEETS_CREDENTIALS_PATH=./config/google-service-account.json
ENCRYPTION_KEY=your-32-char-key
FREE_SMTP_PROVIDER=gmail  # or brevo, mailersend

# If using Gmail SMTP:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

---

## 🔍 Scraper System

### Routes

**File:** `routes/scraper-routes.js`

```javascript
POST /api/scrape
  Body: { url: "https://example.com/docs" }

  Returns:
  {
    content: "extracted text",
    title: "page title",
    noteId: 123  // saved to knowledge base
  }
```

### Use Case: Auto-Fetch Docs

```bash
# Scrape OpenAI docs
curl -X POST http://localhost:5001/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://platform.openai.com/docs",
    "userId": "system",
    "category": "ai-docs"
  }'

# Scrapes HTML → Extracts text → Saves to PostgreSQL knowledge_notes table
```

### Files
- `routes/scraper-routes.js` - API endpoints
- `lib/project-log-scraper.js` - Scraping logic
- Uses: cheerio (HTML parsing), puppeteer (optional, for JS-rendered sites)

---

## 🗄️ PostgreSQL Database

### Connection

**From .env:**
```bash
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calos
DB_USER=matthewmauer
DB_PASSWORD=
```

### Schema (78 Tables)

```bash
# Check migrations
ls database/migrations/ | wc -l
# → 78 migrations

# Key tables:
domains                    # 12 domain configs
users                      # user accounts
knowledge_notes            # scraped docs
ai_cost_analytics          # LLM usage tracking
gmail_webhooks             # email logs (if using PostgreSQL)
elo_ratings                # model performance scores
sessions                   # user sessions
```

### Run Migrations

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router

# Auto-migrate (runs all pending migrations)
npm run migrate

# Or manually:
psql -U matthewmauer -d calos -f database/migrations/001_*.sql
```

---

## 📦 MinIO Object Storage

### Setup

**File:** `lib/minio-client.js`

```bash
# Environment variables
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

### Install MinIO

```bash
# macOS
brew install minio/stable/minio
minio server ~/minio-data --address :9000

# Or Docker
docker run -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"

# Access web UI: http://localhost:9001
```

### Use Case: Store Model Files

```javascript
const MinIOModelClient = require('./lib/minio-client');

const minio = new MinIOModelClient({
  endPoint: 'localhost',
  port: 9000,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin'
});

await minio.init(); // creates bucket: calos-models

// Upload model
await minio.uploadModel('./models/mistral-7b.gguf', {
  modelId: 'mistral-7b',
  family: 'mistral',
  quantization: 'Q4_K_M',
  parameterCount: '7B'
});

// Download model
await minio.downloadModel('mistral-7b', './models/');
```

---

## 🛠️ CLI Tools (bin/ directory)

You have **23 command-line tools** already built:

```bash
bin/
├── cal                          # Main CLI tool
├── community                    # Community acquisition
├── gmail-setup                  # Gmail webhook setup (full version)
├── gmail-setup-free             # Gmail webhook setup (zero-cost)
├── growth                       # Growth tracking
├── marketplace                  # AI marketplace
├── numerical                    # Numerical analysis
├── ralph                        # Ralph assistant
└── ... (15 more)
```

### Examples

```bash
# Gmail setup
./bin/gmail-setup-free

# Community management
./bin/community status
./bin/community analyze

# Marketplace
./bin/marketplace list
./bin/marketplace deploy

# Growth tracking
./bin/growth analyze
./bin/growth report
```

---

## 🚀 Deployment Options

### Option 1: Single VPS (Recommended for You)

**Provider:** DigitalOcean, Linode, Vultr, Hetzner

```bash
# SSH to your VPS
ssh root@your-server-ip

# Install dependencies
apt update
apt install -y postgresql nginx nodejs npm

# Install Ollama
curl https://ollama.ai/install.sh | sh

# Clone your repo
git clone https://github.com/yourusername/agent-router
cd agent-router
npm install

# Setup PostgreSQL
createdb calos
npm run migrate

# Start services
npm start
```

### Option 2: Docker Compose (All-in-One)

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5001:5001"
    environment:
      - DB_HOST=postgres
      - OLLAMA_BASE_URL=http://ollama:11434
      - MINIO_ENDPOINT=minio
    depends_on:
      - postgres
      - ollama
      - minio

  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: calos
      POSTGRES_USER: calos
      POSTGRES_PASSWORD: password
    volumes:
      - pgdata:/var/lib/postgresql/data

  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama:/root/.ollama

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio:/data

volumes:
  pgdata:
  ollama:
  minio:
```

### Option 3: Domain Setup with Nginx

```nginx
# /etc/nginx/sites-available/soulfra.com
server {
  listen 80;
  server_name soulfra.com www.soulfra.com;

  location / {
    proxy_pass http://localhost:5001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}

# Enable site
ln -s /etc/nginx/sites-available/soulfra.com /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Add SSL with Let's Encrypt
apt install certbot python3-certbot-nginx
certbot --nginx -d soulfra.com -d www.soulfra.com
```

**Repeat for all 12 domains:**
- deathtodata.com
- finishthisidea.com
- dealordelete.com
- etc.

---

## 🔐 Security Checklist

- [ ] PostgreSQL password set (not empty)
- [ ] MinIO credentials changed (not minioadmin)
- [ ] Firewall configured (UFW or iptables)
- [ ] SSL certificates (Let's Encrypt)
- [ ] Environment variables in .env (not committed to git)
- [ ] API key authentication enabled
- [ ] Rate limiting configured
- [ ] Ollama not exposed to internet (or behind auth)

---

## 🧩 How Everything Connects

```
                    Internet
                       │
                       ↓
        ┌──────────────────────────┐
        │  DNS (12 domains)        │
        │  All point to YOUR IP    │
        └──────────────────────────┘
                       │
                       ↓
            ┌──────────────────┐
            │  Nginx (port 80) │
            │  SSL termination │
            └──────────────────┘
                       │
                       ↓
         ┌─────────────────────────┐
         │  Node.js (router.js)    │
         │  Port 5001              │
         │                         │
         │  • Domain routing       │
         │  • Gmail webhooks       │
         │  • AI chat              │
         │  • Scraper              │
         └─────────────────────────┘
              │        │        │
              ↓        ↓        ↓
         ┌────────┐ ┌──────┐ ┌──────┐
         │  PG    │ │ Minio│ │Ollama│
         │ :5432  │ │ :9000│ │:11434│
         └────────┘ └──────┘ └──────┘
```

---

## 🧠 Knowledge Pattern Learning System

**Migration:** 068
**ADR:** [ADR-001](docs/adr/001-knowledge-pattern-learning.md)
**Status:** ✅ Production-Ready

### What It Does

Automatically learns from student debugging sessions and suggests solutions to known errors.

### Architecture

```
Student Encounters Error
        ↓
CalErrorReporter.js (browser)
  • Captures error
  • Captures console logs
  • Sends to backend
        ↓
POST /api/knowledge/learn-from-frontend
  • Saves to frontend_errors table
  • Matches against knowledge_patterns
  • Returns known solution (if found)
        ↓
Browser Console Shows:
  "🔧 Known Issue: missing_browser_polyfills"
  "Solution: Add <script src='/lib/browser-polyfills.js'>"
        ↓
Student Fixes Error in < 1 minute
        ↓
PATCH /api/learning/debug-session/:id/resolve
  • Tracks resolution time
  • Updates pattern occurrence count
        ↓
Next Student Gets Better Hints!
```

### Database Tables

**`knowledge_patterns` (Migration 067)**
- Stores debugging patterns with keywords, solutions, steps
- Tracks occurrence count (how many times seen)
- Links to lessons, concepts, notes

**`lesson_debug_sessions` (Migration 068)**
- Records student errors during lessons
- Tracks resolution time and method
- Links to matched patterns

**`frontend_errors` (Migration 068)**
- Browser console errors from students
- Includes stack traces, console logs, browser info
- Auto-matched to patterns

**`note_pattern_mappings` (Migration 068)**
- Links student notes to debugging patterns
- Relevance scoring
- Auto-detection via AI

### API Endpoints

#### Learning Integration
```javascript
// Get common errors for a lesson
GET /api/learning/lessons/{lessonId}/common-errors

// Record a debugging session
POST /api/learning/lessons/{lessonId}/debug-session
Body: {
  userId: "user-123",
  errorType: "fetch_error",
  errorMessage: "Failed to fetch",
  studentCode: "const data = await fetch(...)",
  lessonStep: 3
}

// Mark session as resolved
PATCH /api/learning/debug-session/{sessionId}/resolve
Body: { resolutionMethod: "pattern" }
```

#### Pattern Management
```javascript
// Store a new pattern
POST /api/knowledge/learn-from-session
Body: {
  problem: "Failed to fetch in browser",
  solution: "Add browser polyfills",
  pattern: "missing_browser_polyfills",
  keywords: ["fetch", "polyfills", "browser"]
}

// Get all patterns
GET /api/knowledge/patterns?keyword=fetch&category=error_fix

// Search for solutions
POST /api/knowledge/search-solution
Body: {
  problem: "Failed to fetch",
  keywords: ["fetch", "browser"]
}
```

#### Frontend Error Collection
```javascript
// Report browser error
POST /api/knowledge/learn-from-frontend
Body: {
  userId: "user-123",
  pageUrl: "http://localhost:5001/training-tasks.html",
  errorType: "js_error",
  errorMessage: "Cannot read property of undefined",
  stackTrace: "...",
  browserInfo: {...}
}
```

### Frontend Integration

**File:** `public/lib/cal-error-reporter.js`

```html
<!-- Add to any HTML page -->
<script src="/lib/cal-error-reporter.js"></script>
<script>
  CalErrorReporter.init({
    apiUrl: 'http://localhost:5001',
    userId: 'user-123',
    enabled: true
  });
</script>
```

**Auto-captures:**
- JavaScript errors
- Unhandled promise rejections
- Fetch failures
- Console.log history

**Shows solutions:**
```
[CalErrorReporter] 🔧 Known Issue Detected!
Pattern: missing_browser_polyfills
Solution: Add <script src='/lib/browser-polyfills.js'>
Severity: high
```

### Analytics Queries

```sql
-- Which lessons are hardest? (most errors)
SELECT
  lesson_title,
  COUNT(*) as error_count,
  AVG(resolution_time) as avg_fix_time_seconds
FROM lesson_debug_sessions lds
JOIN lessons l ON lds.lesson_id = l.lesson_id
GROUP BY lesson_title
ORDER BY error_count DESC;

-- Which patterns occur most often?
SELECT
  pattern_name,
  COUNT(*) as occurrences,
  AVG(resolution_time) as avg_time_to_fix,
  AVG(CASE WHEN resolved THEN 1 ELSE 0 END) as resolution_rate
FROM lesson_debug_sessions lds
JOIN knowledge_patterns kp ON lds.pattern_id = kp.id
GROUP BY pattern_name
ORDER BY occurrences DESC;

-- Browser error hotspots
SELECT
  page_url,
  error_type,
  COUNT(*) as error_count
FROM frontend_errors
GROUP BY page_url, error_type
ORDER BY error_count DESC;
```

### Files Modified

**Created:**
- `migrations/068_knowledge_integration.sql` (268 lines)
- `public/lib/cal-error-reporter.js` (295 lines)
- `docs/adr/001-knowledge-pattern-learning.md` (ADR)
- `KNOWLEDGE_SYSTEM.md` (integration guide)

**Updated:**
- `routes/learning-routes.js` (added 3 endpoints, 176 lines)
- `routes/knowledge-learning-routes.js` (added frontend error endpoint, 122 lines)

### Use Cases

**Instructor:** "73% of students in Lesson 5 got 'fetch error'. Need to add polyfills example."

**Student:** Gets instant hint when they hit known error, fixes it in < 1 min instead of waiting for help.

**Platform:** Self-improving - more students = more patterns = better hints.

### Documentation

- **ADR:** [docs/adr/001-knowledge-pattern-learning.md](docs/adr/001-knowledge-pattern-learning.md)
- **User Guide:** [KNOWLEDGE_SYSTEM.md](KNOWLEDGE_SYSTEM.md)
- **API Reference:** See endpoint docs above

---

## ❓ Addressing Your Confusion

### "Why localhost instead of IP/subdomain?"

The SDK I created defaulted to `localhost:5001` because I didn't know your:
- Domain name (soulfra.com?)
- Server IP
- Deployment plan

**What you actually want:**
```javascript
// sdk/email-sdk/index.js
this.baseUrl = config.baseUrl ||
               process.env.CALOS_API_URL ||
               'https://soulfra.com';  // YOUR actual domain
```

### "Don't we have scraper/commands/tables?"

**YES!** You have:
- ✅ Scraper (routes/scraper-routes.js)
- ✅ Commands (bin/* - 23 CLI tools)
- ✅ Tables (78 PostgreSQL tables)
- ✅ Excel/Sheets (lib/google-sheets-db-adapter.js)
- ✅ MinIO (lib/minio-client.js)

I created redundant docs for a "hosted service" when you already have everything running locally.

### "Claude/Cursor/agent instructions/tmp?"

Not clear what you mean. Possibilities:
1. `.claude/CLAUDE.md` - Project docs for Claude Code
2. `.claude/commands/` - Slash commands for Claude Code
3. `.cursor/` directory - Cursor AI config?
4. `/tmp` directory - Temporary files?
5. Agent instructions - AI agent system prompts?

**Need more context to answer this one.**

---

## 🎯 What You Should Do Next

### 1. Verify What's Running
```bash
# Check PostgreSQL
psql -U matthewmauer -d calos -c "SELECT COUNT(*) FROM domains;"

# Check Ollama
curl http://localhost:11434/api/tags

# Check MinIO
curl http://localhost:9000/minio/health/live

# Check Node.js
curl http://localhost:5001/api/gmail/webhook/health
```

### 2. Configure for YOUR Domain

**Update .env:**
```bash
BASE_URL=https://soulfra.com  # YOUR domain
OLLAMA_BASE_URL=http://localhost:11434  # or ai.soulfra.com
CONFIRMATION_URL=https://soulfra.com/api/gmail/webhook/confirm
```

### 3. Deploy to Production

**Choose deployment method:**
- Single VPS (recommended)
- Docker Compose
- Kubernetes (overkill?)

### 4. DNS Setup

Point all 12 domains to YOUR server IP:
```
soulfra.com              → your-server-ip
deathtodata.com          → your-server-ip
... (10 more)            → your-server-ip
```

---

## 📚 Key Files to Understand

**Must Read (in order):**
1. `router.js` - Main entry point
2. `DOMAIN-ROUTING-ARCHITECTURE.md` - How 12 domains work
3. `middleware/environment-router.js` - Domain detection
4. `lib/multi-llm-router.js` - AI routing logic
5. `.claude/CLAUDE.md` - Gmail webhook docs

**For Deployment:**
1. `.env.example` - All config options
2. `database/migrations/` - Database schema
3. `bin/*` - CLI tools for setup

---

## 🆘 Still Confused?

Answer these questions:
1. **Do you own soulfra.com?** (or another domain)
2. **Do you have a VPS?** (IP address)
3. **Where is Ollama running?** (localhost? server?)
4. **What does "Claude/Cursor/tmp" confusion mean?**
5. **What's your end goal?** (local dev? production deploy?)

This will help me create better docs.

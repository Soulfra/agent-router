# HOW TO USE YOUR SYSTEM

**TL;DR:** Your chat is already running at http://localhost:5001/chat.html with 22 Ollama models ready to go.

---

## 1. Access Your Chat Interface

### Local Access (Right Now)
```
http://localhost:5001/chat.html
```

**Available Models** (22 total):
- `calos-model:latest` (3.2B) - Your main CALOS model
- `soulfra-model:latest` (6.7B) - Your SoulFra persona model
- `deathtodata-model:latest` (1.5B) - Privacy/data liberation model
- `drseuss-model:latest` (3.2B) - Creative writing
- `publishing-model:latest` (3.2B) - Content publishing
- `calos-expert:latest` (3.2B) - Expert responses
- `visual-expert:latest` (7.2B) - Visual understanding
- `llama2:latest` (7B) - General purpose
- `mistral:latest` (7.2B) - Fast inference
- `codellama:7b` - Code generation
- And 12 more...

### Chat Features
- Dark theme UI optimized for streaming
- Model selector (dropdown to switch models)
- KaTeX for mathematical notation
- Mobile-responsive (PWA-capable)
- Copy button for messages
- Session history

---

## 2. Generate & Distribute API Keys

### Check Existing API Routes
```bash
# List all API key routes
grep -r "api.*key" routes/tenant-api-key-routes.js
```

### Create API Keys (Existing System)
Your system already has `routes/tenant-api-key-routes.js` which handles:
- Tenant API key generation
- Key validation
- Rate limiting
- Revocation

### To Create a New API Key
```javascript
// In Node.js (router.js or custom script)
const crypto = require('crypto');

// Generate key
const apiKey = 'calos_' + crypto.randomBytes(32).toString('hex');

// Store in database
await db.query(`
  INSERT INTO api_keys (user_id, key, name, rate_limit)
  VALUES ($1, $2, $3, $4)
`, [userId, apiKey, 'Production Key', 1000]);

console.log('API Key:', apiKey);
```

### Test API Key
```bash
# Test with curl
curl -H "Authorization: Bearer calos_yourkeyhere" \
  http://localhost:5001/api/chat \
  -d '{"message":"Hello", "model":"calos-model:latest"}'
```

---

## 3. Deploy to Production (Hosting)

### Option A: Simple Node Server (PM2)
```bash
# Install PM2
npm install -g pm2

# Start in production
pm2 start router.js --name calos-router -- --local

# Auto-restart on reboot
pm2 startup
pm2 save

# View logs
pm2 logs calos-router
```

### Option B: Docker (Recommended)
```bash
# Create Dockerfile
cat > Dockerfile << 'EOF'
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5001
CMD ["node", "router.js", "--local"]
EOF

# Build & run
docker build -t calos-router .
docker run -d -p 5001:5001 --name calos calos-router
```

### Option C: Cloud Hosting

**DigitalOcean / AWS / Google Cloud:**
1. Create a VPS/EC2 instance
2. Install Node.js + Ollama
3. Clone your repo: `git clone https://github.com/Soulfra/agent-router.git`
4. Install deps: `npm install`
5. Setup PM2: `pm2 start router.js --name calos`
6. Setup nginx reverse proxy (see below)

**Nginx Config** (for domain routing):
```nginx
server {
  listen 80;
  server_name calos.ai;

  location / {
    proxy_pass http://localhost:5001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
  }
}

server {
  listen 80;
  server_name hollowtown.com;

  location / {
    proxy_pass http://localhost:5002;  # Different port for HollowTown
  }
}

server {
  listen 80;
  server_name deathtodata.com;

  location / {
    proxy_pass http://localhost:5003;  # Different port for DeathToData
  }
}
```

**SSL Certificates** (Let's Encrypt):
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d calos.ai -d www.calos.ai
sudo certbot --nginx -d hollowtown.com
sudo certbot --nginx -d deathtodata.com
```

---

## 4. Configure Domains

### Your Domains
Based on your architecture doc:

- **calos.ai** → Main platform (port 5001)
- **soulfra.com** → SoulFra universe/metaverse (port 5002)
- **hollowtown.com** → Community hub / RSPS listing (port 5003)
- **deathtodata.com** → Data liberation / privacy (port 5004)
- **roughsparks.com** → Authority / signing (port 5005)
- **vibecoding.com** → Developer brand (port 5006)

### Environment Files
You already have:
```
.env              - Main config
.env.soulfra      - SoulFra domain config
.env.calriven     - Calriven domain config
.env.vibecoding   - VibeCoding brand config
.env.perplexity   - Perplexity API config
```

### Start Multiple Domains
```bash
# Start main platform (calos.ai)
PORT=5001 node router.js --local &

# Start SoulFra domain
PORT=5002 DOMAIN=soulfra node router.js --env .env.soulfra &

# Start HollowTown community hub
PORT=5003 DOMAIN=hollowtown node router.js --env .env.hollowtown &

# Start DeathToData
PORT=5004 DOMAIN=deathtodata node router.js --env .env.deathtodata &
```

Or use **PM2 ecosystem**:
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    { name: 'calos-main', script: 'router.js', args: '--local', env: { PORT: 5001 } },
    { name: 'soulfra', script: 'router.js', env: { PORT: 5002, DOMAIN: 'soulfra' } },
    { name: 'hollowtown', script: 'router.js', env: { PORT: 5003, DOMAIN: 'hollowtown' } },
    { name: 'deathtodata', script: 'router.js', env: { PORT: 5004, DOMAIN: 'deathtodata' } },
  ]
};

# Start all
pm2 start ecosystem.config.js
```

---

## 5. Run Database Migrations

### Run Migration 059 (GitHub + RuneLite System)
```bash
# Check current migration status
psql $DATABASE_URL -c "SELECT * FROM migrations ORDER BY id DESC LIMIT 5;"

# Run migration 059
psql $DATABASE_URL -f database/migrations/059_add_github_runelite_system.sql

# Verify tables exist
psql $DATABASE_URL -c "\dt github_identities runelite_accounts chat_messages"
```

### Verify Schema
```bash
# Check tables
psql $DATABASE_URL -c "
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'github_identities',
    'runelite_accounts',
    'chat_messages',
    'user_activities',
    'ge_prices',
    'game_sessions',
    'dev_meme_events',
    'dev_meme_stats'
  );"

# Check indexes
psql $DATABASE_URL -c "\di github_identities*"
```

---

## 6. Test OSRS Integration

### Start GE Price Fetcher
```javascript
// test-ge-prices.js
const OSRSWikiClient = require('./lib/osrs-wiki-client');
const GEPriceFetcher = require('./lib/ge-price-fetcher');

const wikiClient = new OSRSWikiClient();
const fetcher = new GEPriceFetcher({ wikiClient });

await fetcher.start();

// Get Twisted bow price
const tbow = fetcher.getPrice(20997);
console.log('Twisted bow:', fetcher.formatPrice(tbow.high));

// Watch for price alerts
fetcher.on('price_alert', (alert) => {
  console.log(`${alert.itemName}: ${alert.changePercent}% ${alert.direction}`);
});
```

### Test RuneLite Integration
```javascript
// test-runelite.js
const RuneLiteIntegration = require('./lib/runelite-integration');

const runelite = new RuneLiteIntegration({
  apiUrl: 'http://localhost:8080', // RuneLite HTTP API
  wsUrl: 'ws://localhost:8080'     // RuneLite WebSocket
});

await runelite.connect();

// Listen for events
runelite.on('loot', (event) => {
  console.log(`Loot: ${event.itemName} (${event.quantity}x) - ${event.value} GP`);
});

runelite.on('level_up', (event) => {
  console.log(`Level up! ${event.skill} → ${event.newLevel}`);
});
```

### Test Chat Logger
```javascript
// test-chat-logger.js
const RuneLiteChatLogger = require('./lib/runelite-chat-logger');

const logger = new RuneLiteChatLogger({
  logDir: './logs/chat',
  db: yourDbConnection
});

// Log a message
await logger.log({
  username: 'MyOSRSName',
  githubUsername: 'Soulfra',
  message: 'Just got 99 agility!',
  type: 'public',
  timestamp: Date.now()
});

// Search logs
const results = await logger.search('99 agility', {
  startDate: '2025-10-01',
  endDate: '2025-10-24'
});

console.log(results);
```

---

## 7. Exit Quiet/Fatal Mode

Your system is currently running in "quiet mode" (`start-quiet.js` or `--local` flag).

### Check Current Mode
```bash
# Check running process
ps aux | grep "router.js"
# Look for flags: --local, --quiet, --fatal
```

### Switch to Production Mode
```bash
# Kill current process
pkill -f router.js

# Start in production (remove --local flag)
node router.js

# Or with PM2
pm2 start router.js --name calos-production
```

### Configure Production Settings
```javascript
// In router.js or .env
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  // Enable full logging
  // Enable telemetry
  // Enable error reporting
  // Enable rate limiting
}
```

---

## 8. Manage Ollama Models

### List Models
```bash
curl http://localhost:11434/api/tags
```

### Add New Model
```bash
ollama pull llama2:13b
ollama pull mistral:latest
```

### Create Custom Model
```bash
# Create Modelfile
cat > Modelfile << 'EOF'
FROM llama2:7b
SYSTEM You are an expert in Old School RuneScape.
PARAMETER temperature 0.8
EOF

# Build model
ollama create osrs-expert -f Modelfile
```

### Switch Model in Chat
Open http://localhost:5001/chat.html and use the model selector dropdown.

---

## 9. Link Your GitHub Identity

### Auto-Detect
```bash
# Your current identity is:
git config --get user.name     # Soulfra
git config --get user.email    # 211064529+Soulfra@users.noreply.github.com
```

### Link to Database
```javascript
const GitHubIdentityResolver = require('./lib/github-identity-resolver');

const resolver = new GitHubIdentityResolver({ db: yourDbConnection });

// Auto-detect and resolve
const identity = await resolver.getCurrentIdentity();
console.log(identity);
// { githubUsername: 'Soulfra', email: '...', repo: 'agent-router', branch: 'main' }

// Link to database user
await resolver.linkToUser({
  githubUsername: 'Soulfra',
  userId: 1,  // Your user ID in database
  email: '211064529+Soulfra@users.noreply.github.com',
  isPrimary: true
});

// Link RuneLite account
await resolver.linkRuneLiteAccount({
  githubUsername: 'Soulfra',
  runeliteUsername: 'YourOSRSName'
});
```

---

## 10. Quick Commands

### Start Everything
```bash
# Start main server
npm start

# Start Ollama (if not running)
ollama serve

# Start PostgreSQL
brew services start postgresql@14

# Run all tests
npm test
```

### Check Status
```bash
# Server status
curl http://localhost:5001

# Ollama status
curl http://localhost:11434/api/tags

# Database status
psql $DATABASE_URL -c "SELECT version();"

# Process status
ps aux | grep "node\|ollama\|postgres"
```

### Logs
```bash
# Server logs
tail -f logs/router.log

# Chat logs
tail -f logs/chat/$(date +%Y-%m-%d).log

# PM2 logs
pm2 logs
```

---

## What You Already Have Working

✅ **Server:** Running at localhost:5001
✅ **Chat Interface:** http://localhost:5001/chat.html
✅ **Ollama:** 22 models loaded and ready
✅ **PostgreSQL:** Database running with 80+ migrations
✅ **API Key Routes:** `routes/tenant-api-key-routes.js`
✅ **Identity Systems:** `lib/soulfra-identity.js`, `lib/calriven-identity.js`
✅ **OSRS Integration:** 7 new files (~4000 lines)

---

## What's Next

The files I created in this session are ready to integrate:

1. **Run migration 059** to create GitHub/RuneLite tables
2. **Test GE price fetcher** with real data
3. **Link your GitHub identity** to database
4. **Deploy to production** (choose hosting option)
5. **Configure domains** (nginx + SSL)
6. **Build community guild** (next phase)

---

## Need Help?

- **Chat not working?** Check http://localhost:5001/chat.html
- **Ollama not responding?** Run `ollama serve` in terminal
- **Database errors?** Check `psql $DATABASE_URL`
- **Port conflicts?** Change PORT in .env file

**Your system is already built. Now use it.**

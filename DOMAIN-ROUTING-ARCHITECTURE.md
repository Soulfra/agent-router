# 🌐 CalOS Domain-Based Routing Architecture

**One Server. Twelve Personalities. Infinite Possibilities.**

---

## 📊 System Overview

CalOS uses a revolutionary **domain-based routing architecture** where a single server (port 5001) powers 12 different branded domains, each with its own:

- 🎨 **Brand Identity** - Colors, voice, tagline
- 🧠 **AI Reasoning Strategy** - Specialized models for each domain's focus
- 📝 **Code Style Guides** - Domain-specific coding conventions
- ⚡ **Optimized Performance** - Best AI provider for each task type

Think of it as **12 specialized AI assistants sharing one brain** - Cal shapeshifts based on which domain you visit.

---

## 🗺️ Architecture Flow

```
User Request (soulfra.com/api/chat)
         ↓
[1] Environment Router (middleware/environment-router.js)
    - Detects hostname: soulfra.com
    - Attaches: req.environment = 'production'
         ↓
[2] Domain Context Enricher (lib/domain-context-enricher.js)
    - Loads from database:
      • Brand colors: #667eea (purple)
      • Style guide: tabs, double quotes
      • Top patterns: collaborative features
      • Anti-patterns: avoid surveillance
         ↓
[3] Task Type Inference (lib/multi-llm-router.js)
    - Analyzes prompt
    - Infers: taskType = 'creative'
         ↓
[4] Model Selection (lib/multi-llm-router.js)
    - Task = creative
    - Domain = soulfra
    - Selects: Ollama soulfra-model (creative-optimized)
         ↓
[5] Specialized Response
    - Cal responds with:
      • Soulfra brand voice (collaborative, creative)
      • Purple-themed UI suggestions
      • Real-time multiplayer patterns
      • Creative workflow focus
```

---

## 🏰 The 12 Domains

### Domain Portfolio

| # | Domain | Brand | Category | Primary RADI | Services | Interfaces |
|---|--------|-------|----------|--------------|----------|------------|
| 1 | **soulfra.com** | Soulfra | Creative | creative | auth, gaming, creative-tools | 150 |
| 2 | **deathtodata.com** | DeathToData | Interactive | interactive | gaming, tutorials, code-adventures | 45 |
| 3 | **finishthisidea.com** | FinishThisIdea | Business | business | project-completion, productivity, collaboration | 200 |
| 4 | **dealordelete.com** | DealOrDelete | Business | business | decision-making, optimization | 80 |
| 5 | **saveorsink.com** | SaveOrSink | Technical | technical | system-rescue, recovery | 35 |
| 6 | **cringeproof.com** | CringeProof | Social | social | social-optimization, communication | 25 |
| 7 | **finishthisrepo.com** | FinishThisRepo | Technical | technical | code-completion, development | 60 |
| 8 | **ipomyagent.com** | IPOMyAgent | Business | business | ai-agents, monetization | 40 |
| 9 | **hollowtown.com** | HollowTown | Interactive | interactive | gaming, virtual-experiences | 90 |
| 10 | **hookclinic.com** | HookClinic | Creative | creative | content-creation, engagement | 30 |
| 11 | **businessaiclassroom.com** | Business AI Classroom | Business | business | education, training | 50 |
| 12 | **roughsparks.com** | RoughSparks | Creative | creative | music-production, creative-collaboration | 0 (coming soon) |

### Domain Characteristics

#### soulfra.com - "AI-powered creative collaboration"
- **Colors**: #667eea (purple), #764ba2 (deep purple)
- **Voice**: Innovative, collaborative, empowering
- **Use Case**: Figma meets Discord meets ChatGPT
- **Model**: `soulfra-model` (CodeLlama fine-tuned for creative collaboration)

#### deathtodata.com - "Data liberation & privacy-first"
- **Colors**: #ef4444 (red), #dc2626 (dark red)
- **Voice**: Rebellious, privacy-focused, anti-surveillance
- **Use Case**: EFF meets DuckDuckGo with attitude
- **Model**: `deathtodata-model` (CodeLlama fine-tuned for privacy & data liberation)
- **Special Feature**: CryptoZombies-style learning platform (15 data literacy lessons)

#### finishthisidea.com - "Complete your projects, finally"
- **Colors**: Custom branding
- **Voice**: Motivating, productive, action-oriented
- **Use Case**: Onboarding and project completion
- **Model**: `finishthisidea-model` (productivity-focused)

#### finishthisrepo.com - "Complete your code, ship your project"
- **Colors**: Custom branding
- **Voice**: Technical, focused, shipping-oriented
- **Use Case**: Code completion and deployment assistance
- **Model**: `finishthisrepo-model` (code-completion specialized)

---

## 🎯 Task Type Detection & Model Selection

### Task Types

CalOS infers task type from the user's prompt and routes to the optimal AI provider:

| Task Type | Description | Detection Keywords | Best Provider |
|-----------|-------------|-------------------|---------------|
| `code` | Programming, debugging, code review | function, bug, debug, implement, refactor | Ollama CodeLlama > DeepSeek > GPT-4 |
| `creative` | Writing, stories, content creation | write, story, creative, marketing, content | Claude > GPT-4 > DeepSeek |
| `reasoning` | Complex analysis, logic, philosophy | explain, analyze, why, philosophy, logic | DeepSeek Reasoner > GPT-4 > Claude |
| `fact` | Simple factual queries | what, define, fact, information | Ollama > DeepSeek > GPT-3.5 |
| `simple` | Basic questions | math, simple, quick | Ollama (free, instant) |
| `cryptography` | Crypto, identity, security | crypto, identity, signature, hash | Ollama soulfra-model > GPT-4 |
| `data` | Data processing, ETL, pipelines | data, etl, pipeline, normalize, transform | Ollama deathtodata-model > DeepSeek |
| `publishing` | Documentation, publishing | docs, documentation, publish, readme | Ollama publishing-model > Claude |
| `calos` | CalOS platform-specific | calos, router, migration, architecture | Ollama calos-model |
| `whimsical` | Creative, fun, Dr. Seuss-style | whimsical, fun, creative, playful | Ollama drseuss-model > Claude |

### Model Selection Logic

From `lib/multi-llm-router.js:246-349`:

```javascript
_selectSmart(available, request) {
  const taskType = request.taskType || this._inferTaskType(request.prompt);

  switch (taskType) {
    case 'code':
      if (available.includes('ollama')) return 'ollama'; // Fast, free, CodeLlama
      if (available.includes('openai')) return 'openai'; // GPT-4 excellent
      break;

    case 'creative':
      if (available.includes('anthropic')) return 'anthropic'; // Claude best
      if (available.includes('openai')) return 'openai';
      break;

    case 'reasoning':
      if (available.includes('deepseek')) return 'deepseek'; // Reasoner mode
      if (available.includes('openai')) return 'openai';
      break;

    case 'cryptography':
      if (available.includes('ollama')) return 'ollama'; // soulfra-model
      break;

    case 'data':
      if (available.includes('ollama')) return 'ollama'; // deathtodata-model
      if (available.includes('deepseek')) return 'deepseek';
      break;
  }
}
```

---

## 🤖 Custom Domain Models

Each domain has a specialized Ollama model with custom system prompts:

### Model Directory Structure

```
ollama-models/
├── soulfra-model              # Creative collaboration (purple branding)
├── deathtodata-model          # Privacy & data liberation (red branding)
├── finishthisidea-model       # Project completion
├── finishthisrepo-model       # Code completion
├── dealordelete-model         # Decision-making
├── saveorsink-model           # System rescue
├── cringeproof-model          # Communication optimization
├── ipomyagent-model           # AI agent monetization
├── hollowtown-model           # Virtual experiences
├── hookclinic-model           # Content hooks
├── businessaiclassroom-model  # AI education
├── roughsparks-model          # Music collaboration
└── setup-models.sh            # Install all models
```

### Example: soulfra-model

```dockerfile
FROM codellama:7b

SYSTEM """
You are the Soulfra domain AI assistant. Your role is to generate code that embodies the Soulfra brand identity and services.

## Domain Identity
- Domain: soulfra.com
- Brand: Soulfra
- Tagline: AI-powered creative collaboration
- Category: creative
- Primary RADI: creative
- Colors: Primary #667eea (purple), Secondary #764ba2 (deep purple)

## Services Available
- auth: Google/GitHub OAuth authentication
- gaming: Multiplayer gaming infrastructure
- creative-tools: AI-powered creative tooling

## Brand Voice
Soulfra is innovative, collaborative, and empowering. We help creators work together seamlessly using AI. Think Figma meets Discord meets ChatGPT.

## Code Generation Guidelines
1. ALWAYS use the brand colors (#667eea and #764ba2) in your implementations
2. Reference available services (auth, gaming, creative-tools) when appropriate
3. Include comments explaining your creative decisions
4. Make components feel collaborative and social
5. Emphasize real-time features and multiplayer aspects
6. Use modern, clean design patterns
7. Focus on creative workflows and artistic tools
"""

PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
```

### Example: deathtodata-model

```dockerfile
FROM codellama:7b

SYSTEM """
You are the Death To Data domain AI assistant. Your role is to generate code that embodies the Death To Data brand identity and revolutionary spirit.

## Domain Identity
- Domain: deathtodata.com
- Brand: Death To Data
- Tagline: Data liberation and privacy-first analytics
- Category: business
- Primary RADI: business
- Colors: Primary #ef4444 (red), Secondary #dc2626 (dark red)

## Services Available
- auth: Privacy-preserving authentication
- analytics: Zero-knowledge analytics
- data-tools: Data liberation utilities

## Brand Voice
Death To Data is rebellious, privacy-focused, and anti-surveillance. We fight against data exploitation and help users reclaim control. Think EFF meets DuckDuckGo with attitude.

## Code Generation Guidelines
1. ALWAYS use the brand colors (#ef4444 and #dc2626) in your implementations
2. Emphasize privacy, security, and user control
3. Include comments about privacy considerations
4. Make interfaces that feel empowering and protective
5. Avoid tracking or surveillance patterns
6. Use bold, rebellious design language
7. Focus on transparency and user rights
"""

PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
```

---

## 🔌 Port & Infrastructure

### Single Server Architecture

**All 12 domains point to the same server:**

- **Server Port**: 5001 (default, configurable via `PORT` env var)
- **Host**: 0.0.0.0 (listens on all network interfaces)
- **Protocol**: HTTP/HTTPS (with automatic HTTPS redirect in production)

### DNS Configuration

Each domain must have DNS records pointing to your server:

```dns
# Example DNS records (all point to same IP)
soulfra.com                A    YOUR_SERVER_IP
deathtodata.com            A    YOUR_SERVER_IP
finishthisidea.com         A    YOUR_SERVER_IP
finishthisrepo.com         A    YOUR_SERVER_IP
# ... etc for all 12 domains
```

### Environment Router (middleware/environment-router.js)

Automatically detects domain and sets environment:

```javascript
const hostname = req.hostname || req.get('host') || 'localhost';

// Production domains
if (hostname === 'soulfra.com') {
  req.environment = { type: 'production', isProduction: true };
}

// Staging domains
if (hostname === 'staging.soulfra.com') {
  req.environment = { type: 'staging', isStaging: true };
}

// Automatic redirects (.com → .org, etc.)
if (hostname === 'soulfra.com') {
  // redirect to preferred domain if configured
}
```

---

## 📦 Database Schema

### Domain Portfolio Table

From `migrations/007_add_domain_portfolio.sql`:

```sql
CREATE TABLE domain_portfolio (
  domain_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_name VARCHAR(255) UNIQUE NOT NULL,

  -- Brand Identity
  brand_name VARCHAR(255) NOT NULL,
  brand_tagline TEXT,
  brand_description TEXT,
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#667eea',
  secondary_color VARCHAR(7) DEFAULT '#764ba2',

  -- Classification
  category VARCHAR(50),           -- 'creative', 'business', 'technical', 'social', 'interactive'
  primary_radi VARCHAR(50),       -- Primary RADI category
  secondary_radi VARCHAR(50)[],   -- Secondary RADI categories
  services TEXT[],                -- Available services: ['auth', 'gaming', 'creative-tools']
  keywords TEXT[],

  -- Metrics
  status VARCHAR(20) DEFAULT 'active',
  interfaces_count INT DEFAULT 0,
  monthly_visitors INT DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0.00,
  avg_session_duration INT DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Domain Context Tables

Additional tables store domain-specific context:

- `domain_style_guides` - Coding style preferences per domain
- `domain_parameters` - Temperature, system prompts, etc.
- `domain_anti_patterns` - Things to avoid
- `top_patterns` - Successful patterns for each domain

---

## 🚀 Request Lifecycle

### Example: Creative Writing Request to soulfra.com

```javascript
// 1. User sends request
POST https://soulfra.com/api/chat
{
  "prompt": "Write a creative story about an AI assistant",
  "userId": "user_123"
}

// 2. Environment Router detects domain
req.hostname = "soulfra.com"
req.environment = { type: 'production', domain: 'soulfra.com' }

// 3. Domain Context Enricher loads context
const context = await enricher.enrich(prompt, 'soulfra.com', {
  includePatterns: true,
  includeStyleGuide: true
});

// Returns:
{
  domainContext: 'soulfra.com',
  parameters: {
    temperature: 0.7,
    system_prompt_suffix: "Remember: Soulfra is collaborative and creative"
  },
  styleGuide: {
    indentStyle: 'spaces',
    indentSize: 2,
    quoteStyle: 'single',
    colors: { primary: '#667eea', secondary: '#764ba2' }
  },
  topPatterns: [
    'Real-time collaborative features',
    'Multiplayer game mechanics',
    'Creative tool integrations'
  ],
  antiPatterns: [
    'Avoid blocking UI operations',
    'No single-player experiences'
  ]
}

// 4. Task Type Inference
taskType = 'creative' // inferred from "Write a creative story"

// 5. Model Selection
provider = 'anthropic' // Claude best for creative tasks
model = 'claude-3-opus-20240229'

// 6. Enhanced Prompt Construction
finalPrompt = `
You are Cal, the Soulfra AI assistant.

Domain: soulfra.com
Brand: Collaborative, innovative, empowering
Colors: #667eea (purple), #764ba2 (deep purple)

User Request: Write a creative story about an AI assistant

Top Patterns to Follow:
- Real-time collaborative features
- Multiplayer game mechanics
- Creative tool integrations

Anti-Patterns to Avoid:
- Avoid blocking UI operations
- No single-player experiences

Remember: Soulfra is collaborative and creative
`

// 7. AI Response (Claude)
response = {
  text: "Once upon a time, in a digital realm called Soulfra...",
  provider: 'anthropic',
  model: 'claude-3-opus-20240229',
  tokens: 450,
  cost: 0.0135
}

// 8. Response Filtering (lib/response-filter.js)
filteredResponse = responseFilter.filter(response, ['soulfra.com'])

// Returns only relevant portions:
{
  text: "Once upon a time...",
  affectedDomains: ['soulfra.com'],
  routingDepth: 1,
  suggestedVersion: 'patch'
}

// 9. Final Response to User
{
  success: true,
  response: "Once upon a time...",
  metadata: {
    domain: 'soulfra.com',
    provider: 'anthropic',
    taskType: 'creative',
    routingDepth: 1
  }
}
```

---

## 🗄️ Migrations Map

### All 16 Migrations

| # | File | Purpose | Tables Created |
|---|------|---------|----------------|
| 006 | `006-submissions-grading.sql` | Grading system | submissions, grading |
| 007 | `007-compaction-results.sql` | Result compaction | compaction_results |
| 010 | `010_agent_activity_log.sql` | Agent activity tracking | agent_activity_log |
| 011 | `011_vault_bridge.sql` | Vault integration | vault_bridge |
| 012 | `012_model_pricing.sql` | Model pricing | model_pricing |
| 013 | `013_usage_events.sql` | Usage tracking | usage_events, platform_tiers |
| 014 | `014_knowledge_graph.sql` | Knowledge graph | knowledge_graph |
| 015 | `015_row_level_security.sql` | RLS policies | (security policies) |
| 016 | `016_multi_provider_tracking.sql` | Multi-provider | provider_tracking |
| 017 | `017_project_context.sql` | Project context | project_context |
| 018 | `018_voice_usage_tracking.sql` | Voice tracking | voice_usage |
| 019 | `019_service_credentials.sql` | Credentials | service_credentials |
| 020 | `020_learning_platform.sql` | Learning system | learning_paths, lessons, achievements |
| 021 | `021_add_data_literacy_features.sql` | Data literacy | student_hints, email_breach_tracker |
| 040 | `040_agent_wallets.sql` | Agent wallets | agent_wallets |
| 041 | `041_remove_cookie_tracking.sql` | Remove cookies | (cleanup) |

### Migration 007: Domain Portfolio (Key Migration)

This migration created the foundation for domain-based routing:

```sql
CREATE TABLE domain_portfolio (
  domain_id UUID PRIMARY KEY,
  domain_name VARCHAR(255) UNIQUE NOT NULL,
  brand_name VARCHAR(255) NOT NULL,
  primary_color VARCHAR(7) DEFAULT '#667eea',
  category VARCHAR(50),
  primary_radi VARCHAR(50),
  services TEXT[],
  status VARCHAR(20) DEFAULT 'active'
);

-- Seed all 12 domains
INSERT INTO domain_portfolio (domain_name, brand_name, ...) VALUES
  ('soulfra.com', 'Soulfra', ...),
  ('deathtodata.com', 'DeathToData', ...),
  -- ... etc
```

---

## 🛠️ Developer Guide: Adding a New Domain

### Step 1: Register Domain

Add to `domain_portfolio` table:

```sql
INSERT INTO domain_portfolio (
  domain_name, brand_name, brand_tagline, category, primary_radi,
  primary_color, secondary_color, services, status, interfaces_count
) VALUES (
  'newdomain.com',
  'NewBrand',
  'Your tagline here',
  'creative',
  'creative',
  '#ff6b6b',  -- primary color
  '#ee5a6f',  -- secondary color
  ARRAY['auth', 'custom-service'],
  'active',
  0
);
```

### Step 2: Create Ollama Model

Create `ollama-models/newdomain-model`:

```dockerfile
FROM codellama:7b

SYSTEM """
You are the NewDomain AI assistant.

## Domain Identity
- Domain: newdomain.com
- Brand: NewBrand
- Tagline: Your tagline here
- Category: creative
- Colors: #ff6b6b, #ee5a6f

## Brand Voice
[Describe your brand personality]

## Code Generation Guidelines
1. Use brand colors in all implementations
2. Follow domain-specific patterns
3. [Add more guidelines]
"""

PARAMETER temperature 0.7
```

### Step 3: Build and Register Model

```bash
cd ollama-models
ollama create newdomain-model -f newdomain-model
ollama list  # Verify it's installed
```

### Step 4: Configure DNS

Point your domain to the server:

```dns
newdomain.com    A    YOUR_SERVER_IP
```

### Step 5: Update Routing Logic (Optional)

If your domain needs special routing, update `lib/multi-llm-router.js`:

```javascript
case 'newdomain':
  // Custom logic for newdomain.com
  if (available.includes('ollama')) {
    return 'ollama'; // newdomain-model
  }
  break;
```

### Step 6: Test

```bash
curl -X POST http://localhost:5001/api/chat \
  -H "Content-Type: application/json" \
  -H "Host: newdomain.com" \
  -d '{
    "prompt": "Write a hello world function",
    "userId": "test_user"
  }'
```

---

## 🔍 Analogy: The SerpAPI Model

You mentioned: **"soulfraapi.com is like SerpAPI"**

Here's how that works:

### SerpAPI Model
- One backend API (serpapi.com)
- Returns Google search results
- Different pricing tiers
- One codebase serving all customers

### Your CalOS Model
- One backend API (CalOS on port 5001)
- Returns domain-specific AI responses
- Different brand personalities
- One codebase serving 12 domains

### Comparison Table

| Aspect | SerpAPI | CalOS |
|--------|---------|-------|
| **Backend** | Single API server | Single Express server (port 5001) |
| **Frontend** | serpapi.com | 12 branded domains |
| **Differentiation** | Pricing tiers | Brand personalities + AI models |
| **Routing** | API key | Domain hostname + task type |
| **Specialization** | Google/Bing/etc. | Creative/Data/Code/etc. |
| **Custom Models** | N/A | 12 Ollama models with brand context |

**Key Innovation**: Instead of one generic API with pricing tiers, you have **12 branded experiences** all powered by the same intelligent routing engine.

---

## 🎨 Domain-to-Reasoning Map

### How Each Domain Uses "Different Versions of Cal"

| Domain | Primary Tasks | Preferred Model | Reasoning Strategy | Brand Voice |
|--------|--------------|-----------------|-------------------|-------------|
| **soulfra.com** | Creative collaboration, real-time tools | soulfra-model (Ollama) | Creative-first, multiplayer-focused | Innovative, empowering |
| **deathtodata.com** | Data literacy, privacy tools | deathtodata-model (Ollama) | Privacy-first, anti-surveillance | Rebellious, protective |
| **finishthisidea.com** | Project completion, onboarding | finishthisidea-model (Ollama) | Action-oriented, motivating | Productive, inspiring |
| **finishthisrepo.com** | Code completion, shipping | finishthisrepo-model (Ollama) | Code-focused, pragmatic | Technical, shipping-oriented |
| **dealordelete.com** | Decision-making, optimization | dealordelete-model (Ollama) | Analytical, decisive | Bold, decisive |
| **saveorsink.com** | System rescue, recovery | saveorsink-model (Ollama) | Emergency-focused, technical | Urgent, solution-oriented |
| **cringeproof.com** | Communication optimization | cringeproof-model (Ollama) | Social intelligence | Empathetic, tactful |
| **ipomyagent.com** | AI agent monetization | ipomyagent-model (Ollama) | Business-focused | Entrepreneurial |
| **hollowtown.com** | Virtual experiences, gaming | hollowtown-model (Ollama) | Immersive, creative | Imaginative, engaging |
| **hookclinic.com** | Content hooks, engagement | hookclinic-model (Ollama) | Attention-grabbing | Catchy, viral |
| **businessaiclassroom.com** | AI education, training | businessaiclassroom-model (Ollama) | Teaching-focused | Educational, clear |
| **roughsparks.com** | Music collaboration | roughsparks-model (Ollama) | Musical, collaborative | Creative, rhythmic |

### Task Type Override Example

Even on `soulfra.com` (creative domain):

- **Prompt**: "Debug this function" → Task: `code` → Routes to Ollama CodeLlama (not soulfra-model)
- **Prompt**: "Write a creative story" → Task: `creative` → Routes to soulfra-model or Claude

This ensures **optimal model for each request**, regardless of domain.

---

## 🔐 API Key & Configuration

### Environment Variables

Single `.env` file configures all domains:

```bash
# Server
PORT=5001
HOST=0.0.0.0

# LLM Providers (shared across all domains)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
OLLAMA_BASE_URL=http://localhost:11434

# Database (shared)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calos
DB_USER=postgres
DB_PASSWORD=your_password

# Feature Flags (per domain if needed)
ENABLE_SOULFRA_AUTH=true
ENABLE_DEATHTODATA_LEARNING=true
```

### Domain-Specific Configuration

Stored in database:

```javascript
// Example: Get soulfra.com configuration
const soulfraConfig = await db.query(`
  SELECT * FROM domain_portfolio
  WHERE domain_name = 'soulfra.com'
`);

// Returns:
{
  domain_id: 'uuid-...',
  domain_name: 'soulfra.com',
  brand_name: 'Soulfra',
  primary_color: '#667eea',
  secondary_color: '#764ba2',
  category: 'creative',
  services: ['auth', 'gaming', 'creative-tools'],
  interfaces_count: 150
}
```

---

## 📈 Analytics & Tracking

### Domain-Specific Analytics

Each domain tracks separately:

```javascript
// Domain access log
INSERT INTO domain_access_log (
  domain_id,
  user_id,
  session_id,
  path,
  referrer_domain_id,
  user_agent,
  ip_address,
  visit_duration,
  created_at
) VALUES (...);

// Cross-domain analytics (user journey)
INSERT INTO cross_domain_analytics (
  user_id,
  session_id,
  source_domain_id,
  target_domain_id,
  transition_type,  -- 'navigation', 'referral', 'partner'
  created_at
) VALUES (...);
```

### Usage Tracking Per Domain

Track AI usage per domain:

```javascript
// Track by domain
INSERT INTO usage_events (
  user_id,
  domain_id,      -- Which domain made the request
  provider,       -- 'openai', 'anthropic', 'deepseek', 'ollama'
  model,          -- 'gpt-4', 'claude-3-opus', 'soulfra-model'
  task_type,      -- 'code', 'creative', 'reasoning'
  tokens_used,
  cost_cents,
  created_at
) VALUES (...);

// Get usage by domain
SELECT
  dp.domain_name,
  dp.brand_name,
  COUNT(*) as requests,
  SUM(ue.tokens_used) as total_tokens,
  SUM(ue.cost_cents)/100.0 as total_cost_usd
FROM usage_events ue
JOIN domain_portfolio dp ON ue.domain_id = dp.domain_id
GROUP BY dp.domain_id
ORDER BY total_cost_usd DESC;
```

---

## 🧪 Testing Domain Routing

### Test Script

```bash
#!/bin/bash
# Test all 12 domains

DOMAINS=(
  "soulfra.com"
  "deathtodata.com"
  "finishthisidea.com"
  "finishthisrepo.com"
  "dealordelete.com"
  "saveorsink.com"
  "cringeproof.com"
  "ipomyagent.com"
  "hollowtown.com"
  "hookclinic.com"
  "businessaiclassroom.com"
  "roughsparks.com"
)

for domain in "${DOMAINS[@]}"; do
  echo "Testing $domain..."

  curl -X POST http://localhost:5001/api/chat \
    -H "Content-Type: application/json" \
    -H "Host: $domain" \
    -d "{
      \"prompt\": \"Write a hello world function\",
      \"userId\": \"test_user\"
    }" | jq '.metadata.domain'

  echo ""
done
```

### Expected Output

Each domain should return its own brand-specific response:

```json
// soulfra.com response
{
  "response": "// Soulfra: Collaborative Hello World\n// Colors: #667eea, #764ba2\nfunction helloWorld() { ... }",
  "metadata": {
    "domain": "soulfra.com",
    "provider": "ollama",
    "model": "soulfra-model",
    "taskType": "code",
    "brandColors": ["#667eea", "#764ba2"]
  }
}

// deathtodata.com response
{
  "response": "// Death To Data: Privacy-First Hello World\n// Colors: #ef4444, #dc2626\nfunction helloWorld() { ... }",
  "metadata": {
    "domain": "deathtodata.com",
    "provider": "ollama",
    "model": "deathtodata-model",
    "taskType": "code",
    "brandColors": ["#ef4444", "#dc2626"]
  }
}
```

---

## 🎭 The Magic: Cal's Personalities

### Same Backend, Different Personalities

When you visit different domains, Cal adapts:

#### On soulfra.com
```
You: "Help me build a chat app"

Cal (soulfra personality):
"Great! Let's build a real-time collaborative chat using Soulfra's multiplayer
infrastructure. We'll use WebSockets for instant messaging and add fun emoji
reactions. Here's the code with our signature purple gradient (#667eea → #764ba2)..."
```

#### On deathtodata.com
```
You: "Help me build a chat app"

Cal (deathtodata personality):
"Absolutely! Let's build a privacy-first E2E encrypted chat that protects your users.
We'll use Signal protocol and avoid all tracking. The UI will be bold with our
rebellious red theme (#ef4444 → #dc2626). Your users' data stays private..."
```

#### On finishthisrepo.com
```
You: "Help me build a chat app"

Cal (finishthisrepo personality):
"Let's ship this! Here's a minimal, production-ready chat app you can deploy today.
I've included deployment scripts and CI/CD config. Focus on what works, skip the
fluff. Let's get this repo finished..."
```

### How It Works

1. **Domain Detection** → knows which personality to use
2. **Model Selection** → loads domain-specific Ollama model OR uses best external provider
3. **Context Enrichment** → injects brand colors, voice, patterns
4. **Response Filtering** → ensures response matches domain expectations
5. **Consistent Experience** → Cal always feels like "your domain's AI"

---

## 🚦 Production Deployment

### Deployment Checklist

- [ ] **DNS**: Point all 12 domains to server IP
- [ ] **SSL**: Configure Let's Encrypt for all domains
- [ ] **Environment**: Set `NODE_ENV=production`
- [ ] **Migrations**: Run all 16 migrations
- [ ] **Ollama Models**: Install all 12 domain models
- [ ] **API Keys**: Configure OpenAI, Anthropic, DeepSeek
- [ ] **Database**: PostgreSQL with connection pooling
- [ ] **Monitoring**: Setup domain-specific analytics
- [ ] **Backups**: Automated database backups

### Server Requirements

- **RAM**: 16GB+ (for Ollama models)
- **CPU**: 4+ cores
- **Storage**: 100GB+ (Ollama models are large)
- **Network**: 100Mbps+

### Nginx Configuration (Optional)

If using Nginx as reverse proxy:

```nginx
# Nginx config for all 12 domains
server {
    listen 80;
    server_name soulfra.com deathtodata.com finishthisidea.com
                finishthisrepo.com dealordelete.com saveorsink.com
                cringeproof.com ipomyagent.com hollowtown.com
                hookclinic.com businessaiclassroom.com roughsparks.com;

    location / {
        proxy_pass http://localhost:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🎓 Key Takeaways

### What Makes This Architecture Special

1. **Single Codebase** → 12 Branded Experiences
   - No code duplication
   - One server to maintain
   - Shared infrastructure

2. **Intelligent Routing** → Best AI for Each Task
   - Task type detection
   - Provider optimization
   - Cost-effective

3. **Brand Personalities** → Domain-Specific AI
   - Custom Ollama models
   - Brand voice consistency
   - Contextual responses

4. **Scalable** → Add Domains Easily
   - Just add to database
   - Create Ollama model
   - Configure DNS
   - Done!

5. **Analytics** → Domain-Specific Insights
   - Track per domain
   - Cross-domain journeys
   - Usage optimization

### The Vision

**One AI. Twelve Brands. Infinite Possibilities.**

CalOS is like having a team of 12 specialized AI assistants, each with their own expertise and personality, all powered by the same intelligent brain. Whether you need creative collaboration (Soulfra), privacy protection (DeathToData), or code completion (FinishThisRepo), Cal adapts to serve you perfectly.

---

## 📚 Related Documentation

- `DOMAIN-CONTEXTS.md` - Task type routing strategies
- `TRIANGLE_CONSENSUS_SYSTEM.md` - AI consensus for quality
- `LEARNING_PLATFORM_GUIDE.md` - DeathToData learning platform
- `migrations/007_add_domain_portfolio.sql` - Domain portfolio schema
- `lib/multi-llm-router.js` - Model selection logic
- `lib/domain-context-enricher.js` - Context enrichment
- `middleware/environment-router.js` - Domain detection

---

**Built with ❤️ by the CalOS Team**

*One server to rule them all. Twelve brands to serve them.* 🚀

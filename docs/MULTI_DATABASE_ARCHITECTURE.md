# Multi-Database Architecture

> The AWS Model: One Identity, Multiple Services
> Clean separation between identity stack and domain apps

## The Problem

**Current State:**
```
┌─────────────────────────────────────────────────────────┐
│  ONE GIANT DATABASE (calos)                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • Users, auth, devices, credits                        │
│  • Forum posts, karma, badges                           │
│  • Learning paths, lessons                              │
│  • Recipes, meal planning                               │
│  • Halloween content                                    │
│  • Family todos                                         │
│  • Job postings, recruiting                             │
│  • ... everything ...                                   │
└─────────────────────────────────────────────────────────┘
```

**Issues:**
- Hard to market individual domains (everything mixed together)
- Can't scale domains independently
- Can't sell/spin off individual domains
- Migrations are a nightmare (one change breaks everything)
- Can't give domain-specific access to contractors

---

## The Solution: Multi-Database Architecture

**New Architecture:**
```
┌─────────────────────────────────────────────────────────┐
│  CORE IDENTITY DATABASE (calos_identity)                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • users                                                │
│  • user_devices                                         │
│  • user_sessions                                        │
│  • credits_balance                                      │
│  • api_keys (BYOK)                                      │
│  • subscription_plans                                   │
│                                                         │
│  This is your "AWS Account" - shared across all apps   │
└─────────────────────────────────────────────────────────┘
                              │
                    References (foreign keys)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  hollowtown   │    │  recipes_db   │    │  family_db    │
│  ━━━━━━━━━━━  │    │  ━━━━━━━━━━━  │    │  ━━━━━━━━━━━  │
│  Halloween    │    │  Cooking      │    │  Todo lists   │
│  Spooky       │    │  Meal plans   │    │  Shopping     │
│  Events       │    │  Ingredients  │    │  Calendar     │
│               │    │               │    │  Family chat  │
└───────────────┘    └───────────────┘    └───────────────┘
```

---

## Database Breakdown

### 1. Core Identity Database (`calos_identity`)

**Purpose:** Shared authentication, credits, and multi-device support across ALL domains

**Tables:**
```sql
-- Core user account (the "AWS account")
users (
  user_id UUID PRIMARY KEY,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  created_at TIMESTAMP,
  ...
)

-- Multi-device federation
user_devices (
  device_id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(user_id),
  device_fingerprint TEXT,
  device_type TEXT, -- 'web', 'mobile', 'voice'
  trust_level INTEGER,
  last_seen TIMESTAMP,
  ...
)

-- Credits system (shared across all domains)
credits_balance (
  user_id UUID PRIMARY KEY REFERENCES users(user_id),
  balance INTEGER DEFAULT 1000,
  lifetime_spent INTEGER DEFAULT 0,
  ...
)

-- BYOK (Bring Your Own Key)
user_api_keys (
  key_id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(user_id),
  provider TEXT, -- 'openai', 'anthropic', 'deepseek'
  api_key_encrypted TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  ...
)

-- Subscriptions
user_subscriptions (
  subscription_id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(user_id),
  plan_code TEXT, -- 'free', 'pro', 'enterprise'
  status TEXT, -- 'active', 'canceled', 'past_due'
  current_period_end TIMESTAMP,
  ...
)
```

**Migration Path:**
```
migrations/identity/
  001_create_users.sql
  002_create_devices.sql
  003_create_credits.sql
  004_create_api_keys.sql
  005_create_subscriptions.sql
```

---

### 2. Hollowtown Database (`hollowtown_db`)

**Purpose:** Halloween content, spooky recipes, events

**Domain:** hollowtown.com

**Tables:**
```sql
-- Spooky recipes (references identity DB)
spooky_recipes (
  recipe_id UUID PRIMARY KEY,
  user_id UUID, -- References calos_identity.users(user_id)
  recipe_name TEXT,
  spookiness_level INTEGER, -- 1-10
  difficulty TEXT, -- 'easy', 'medium', 'hard', 'nightmare'
  ingredients JSONB,
  instructions TEXT[],
  prep_time_minutes INTEGER,
  serves INTEGER,
  tags TEXT[], -- ['halloween', 'vegan', 'kids-friendly']
  image_url TEXT,
  created_at TIMESTAMP,
  ...
)

-- Halloween events
halloween_events (
  event_id UUID PRIMARY KEY,
  user_id UUID, -- References calos_identity.users(user_id)
  event_name TEXT,
  event_type TEXT, -- 'party', 'haunted-house', 'trick-or-treat'
  event_date DATE,
  location TEXT,
  guest_count INTEGER,
  budget_cents INTEGER,
  shopping_list JSONB,
  ...
)

-- Costume ideas
costume_ideas (
  costume_id UUID PRIMARY KEY,
  user_id UUID,
  costume_name TEXT,
  difficulty TEXT,
  materials JSONB,
  cost_estimate_cents INTEGER,
  image_url TEXT,
  upvotes INTEGER DEFAULT 0,
  ...
)

-- Haunted house plans
haunted_house_plans (
  plan_id UUID PRIMARY KEY,
  user_id UUID,
  room_name TEXT,
  scare_level INTEGER, -- 1-10
  props_needed JSONB,
  setup_instructions TEXT[],
  ...
)
```

**Migration Path:**
```
migrations/hollowtown/
  001_create_spooky_recipes.sql
  002_create_events.sql
  003_create_costumes.sql
  004_create_haunted_house.sql
```

---

### 3. Recipes Database (`recipes_db`)

**Purpose:** General cooking recipes, meal planning

**Domain:** howtocookathome.com

**Tables:**
```sql
-- Recipes
recipes (
  recipe_id UUID PRIMARY KEY,
  user_id UUID, -- References calos_identity.users(user_id)
  recipe_name TEXT,
  cuisine TEXT, -- 'italian', 'mexican', 'thai', etc.
  difficulty TEXT,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  serves INTEGER,
  calories INTEGER,
  ingredients JSONB,
  instructions TEXT[],
  nutrition JSONB,
  allergens TEXT[],
  tags TEXT[],
  image_url TEXT,
  rating_avg DECIMAL(3,2),
  rating_count INTEGER,
  created_at TIMESTAMP,
  ...
)

-- Meal plans
meal_plans (
  plan_id UUID PRIMARY KEY,
  user_id UUID,
  plan_name TEXT,
  start_date DATE,
  duration_days INTEGER,
  meals JSONB, -- {date: {breakfast: recipe_id, lunch: ..., dinner: ...}}
  shopping_list JSONB,
  total_cost_cents INTEGER,
  ...
)

-- Pantry inventory
pantry_items (
  item_id UUID PRIMARY KEY,
  user_id UUID,
  item_name TEXT,
  quantity DECIMAL,
  unit TEXT, -- 'cups', 'lbs', 'oz', 'count'
  category TEXT, -- 'dairy', 'produce', 'grains', etc.
  expiration_date DATE,
  location TEXT, -- 'fridge', 'freezer', 'pantry'
  ...
)

-- Shopping lists
shopping_lists (
  list_id UUID PRIMARY KEY,
  user_id UUID,
  list_name TEXT,
  store TEXT,
  items JSONB,
  total_cost_cents INTEGER,
  purchased_at TIMESTAMP,
  ...
)
```

**Migration Path:**
```
migrations/recipes/
  001_create_recipes.sql
  002_create_meal_plans.sql
  003_create_pantry.sql
  004_create_shopping_lists.sql
```

---

### 4. Family Planning Database (`family_db`)

**Purpose:** Todo lists, family calendar, shared tasks

**Domain:** familyplanner.com (or integrated into other domains)

**Tables:**
```sql
-- Family groups
families (
  family_id UUID PRIMARY KEY,
  family_name TEXT,
  created_by UUID, -- References calos_identity.users(user_id)
  created_at TIMESTAMP,
  ...
)

-- Family members
family_members (
  member_id UUID PRIMARY KEY,
  family_id UUID REFERENCES families(family_id),
  user_id UUID, -- References calos_identity.users(user_id)
  role TEXT, -- 'admin', 'parent', 'child'
  joined_at TIMESTAMP,
  ...
)

-- Todo lists
todo_lists (
  list_id UUID PRIMARY KEY,
  family_id UUID REFERENCES families(family_id),
  list_name TEXT,
  list_type TEXT, -- 'personal', 'shared', 'chores'
  created_by UUID,
  ...
)

-- Todo items
todo_items (
  item_id UUID PRIMARY KEY,
  list_id UUID REFERENCES todo_lists(list_id),
  title TEXT,
  description TEXT,
  assigned_to UUID, -- References calos_identity.users(user_id)
  due_date TIMESTAMP,
  priority TEXT, -- 'low', 'medium', 'high', 'urgent'
  status TEXT, -- 'todo', 'in_progress', 'done'
  completed_at TIMESTAMP,
  completed_by UUID,
  ...
)

-- Family calendar events
family_events (
  event_id UUID PRIMARY KEY,
  family_id UUID REFERENCES families(family_id),
  event_name TEXT,
  event_type TEXT, -- 'appointment', 'birthday', 'school', 'vacation'
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  location TEXT,
  attendees UUID[], -- Array of user_ids
  reminders JSONB,
  ...
)
```

**Migration Path:**
```
migrations/family/
  001_create_families.sql
  002_create_members.sql
  003_create_todo_lists.sql
  004_create_calendar.sql
```

---

## Shared Infrastructure

### Ollama Pool (Free for All Users)

**Purpose:** Shared LLM access across all domains

```
┌─────────────────────────────────────────────────────────┐
│  OLLAMA POOL (Shared Infrastructure)                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • Multiple Ollama instances (localhost:11434, etc.)   │
│  • Models: llama3.2, mistral, codellama, etc.          │
│  • Load balancing across instances                     │
│  • Rate limiting per user (prevent abuse)              │
│  • Free for all authenticated users                    │
└─────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  hollowtown   │    │  recipes_db   │    │  family_db    │
│  Uses Ollama  │    │  Uses Ollama  │    │  Uses Ollama  │
│  for AI       │    │  for AI       │    │  for AI       │
│  features     │    │  meal gen     │    │  smart lists  │
└───────────────┘    └───────────────┘    └───────────────┘
```

**Example:** User asks Ollama to generate a spooky recipe:
1. User authenticated via `calos_identity`
2. Request routed to Ollama pool
3. Response returned to hollowtown domain
4. Credits deducted from `credits_balance` (if metered)

**Rate Limiting:**
```javascript
// Rate limit per user across ALL domains
{
  "user_id": "user-123",
  "rate_limits": {
    "ollama_requests_per_minute": 10,
    "ollama_requests_per_hour": 100,
    "ollama_requests_per_day": 1000
  }
}
```

### BYOK (Bring Your Own Key) Option

**Purpose:** Users can bring their own OpenAI/Anthropic keys for premium features

```sql
-- User's API keys (stored encrypted in calos_identity)
user_api_keys (
  key_id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(user_id),
  provider TEXT, -- 'openai', 'anthropic', 'deepseek'
  api_key_encrypted TEXT, -- Encrypted with system key
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP
)
```

**Flow:**
1. User adds OpenAI key to their CALOS account
2. Key stored encrypted in `calos_identity.user_api_keys`
3. When user uses hollowtown.com, can choose:
   - Use free Ollama (default)
   - Use their OpenAI key (premium models)
4. Requests routed accordingly

**Example:**
```javascript
// User chooses model
{
  "user_id": "user-123",
  "model_preference": "gpt-4", // Uses their BYOK
  "fallback_model": "llama3.2" // Free Ollama if no key
}
```

---

## Migration Pattern

### Directory Structure

```
migrations/
├── identity/
│   ├── 001_create_users.sql
│   ├── 002_create_devices.sql
│   ├── 003_create_credits.sql
│   └── ...
├── hollowtown/
│   ├── 001_create_spooky_recipes.sql
│   ├── 002_create_events.sql
│   └── ...
├── recipes/
│   ├── 001_create_recipes.sql
│   ├── 002_create_meal_plans.sql
│   └── ...
└── family/
    ├── 001_create_families.sql
    ├── 002_create_todo_lists.sql
    └── ...
```

### Migration Runner Script

```javascript
// scripts/run-migrations.js

const databases = {
  identity: 'postgresql://localhost/calos_identity',
  hollowtown: 'postgresql://localhost/hollowtown_db',
  recipes: 'postgresql://localhost/recipes_db',
  family: 'postgresql://localhost/family_db'
};

// Run all migrations
await runMigrations('all');

// Run specific domain
await runMigrations('hollowtown');

// Run identity only (required first)
await runMigrations('identity');
```

### Commands

```bash
# Run all migrations
npm run migrate:all

# Run identity migrations (required first)
npm run migrate:identity

# Run specific domain
npm run migrate:hollowtown
npm run migrate:recipes
npm run migrate:family

# Rollback
npm run migrate:rollback:hollowtown
```

---

## Marketing & Pitch Deck Structure

### Hollowtown.com Pitch Deck

**Slide 1: The Problem**
```
Halloween is HARD:
• Finding spooky recipes is a nightmare
• Planning parties is overwhelming
• Coordinating with family is chaotic
• Budget tracking is scary (in a bad way)
```

**Slide 2: The Solution**
```
Hollowtown: Your AI Halloween Assistant

• 🎃 Generate custom spooky recipes
• 👻 Plan haunted house layouts
• 🎭 Find/share costume ideas
• 📅 Coordinate events with family
• 💰 Track party budget
• 🛒 Auto-generate shopping lists
```

**Slide 3: How It Works**
```
1. Sign up with CALOS account (identity layer)
2. Free AI-powered features (Ollama)
3. Optional: BYOK for premium models
4. Integrates with Family Planner for shared tasks
```

**Slide 4: Revenue Model**
```
• Freemium:
  - Basic features free (Ollama-powered)
  - Premium ($5/mo): GPT-4 recipes, advanced planning
  - Family ($10/mo): Unlimited family members, shared calendars

• Affiliate:
  - Shopping list → Amazon affiliate links
  - Costume ideas → Etsy/Amazon links

• Marketplace:
  - Sell custom haunted house plans
  - Recipe books, costume patterns
```

**Slide 5: The Ecosystem**
```
Hollowtown is part of the CALOS ecosystem:

• One account across all domains
• Shared infrastructure (free Ollama)
• Cross-domain features:
  - Halloween recipes → howtocookathome.com
  - Party planning → Family Planner
  - Shopping lists → shared across domains
```

**Slide 6: Go-to-Market: Spooky Season Launch**
```
Phase 1 (September): Pre-Halloween Launch
  • 1000 spooky recipes (AI-generated)
  • Halloween event planner
  • Costume idea gallery

Phase 2 (October): Growth
  • Social sharing (Pinterest, Instagram)
  • User-generated content (UGC)
  • Influencer partnerships

Phase 3 (Year-Round): Retention
  • Christmas expansion (Santa's Workshop)
  • Thanksgiving (Turkey Tech)
  • Valentine's (Love Lab)
```

### HowToCookAtHome.com Integration

**Spooky Season Content:**
```
1. Halloween Recipe Collection (September)
   • 50 spooky recipes
   • AI-generated with Ollama
   • Cross-promote to hollowtown.com

2. Halloween Meal Plans (October)
   • Week-long Halloween dinner plans
   • Shopping lists included
   • Affiliate links

3. User Submissions
   • Users can submit their spooky recipes
   • Earn karma/credits for popular recipes
   • Builds community
```

---

## API Structure

### Identity API (Shared)

```bash
# Base URL: https://api.calos.com

# Authentication
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout

# Multi-device
POST /api/devices/pair
GET /api/devices

# Credits
GET /api/credits/balance
POST /api/credits/purchase

# BYOK
POST /api/keys/add
GET /api/keys
DELETE /api/keys/:keyId
```

### Domain APIs (Separate)

```bash
# Hollowtown API
# Base URL: https://api.hollowtown.com

GET /api/recipes/spooky
POST /api/recipes/generate  # AI-powered
GET /api/events
POST /api/costumes

# Recipes API
# Base URL: https://api.howtocookathome.com

GET /api/recipes
POST /api/recipes/generate  # AI-powered
GET /api/meal-plans
POST /api/pantry/items

# Family API
# Base URL: https://api.familyplanner.com

GET /api/families
POST /api/todos
GET /api/calendar
```

### Shared Ollama API

```bash
# Internal API (not exposed externally)
# Base URL: http://localhost:11434

POST /api/generate  # Generate text
POST /api/chat      # Chat completion

# Routed through CALOS platform with auth
```

---

## Implementation Roadmap

### Phase 1: Identity Separation (Week 1)

```bash
1. Create calos_identity database
2. Migrate core tables (users, devices, credits)
3. Update auth flow to use new DB
4. Test multi-device login still works
```

### Phase 2: Hollowtown Launch (Week 2-3)

```bash
1. Create hollowtown_db database
2. Create spooky_recipes table
3. Generate 100 Halloween recipes with Ollama
4. Build landing page (hollowtown.com)
5. Launch for Spooky Season (September)
```

### Phase 3: Recipes Integration (Week 4)

```bash
1. Create recipes_db database
2. Migrate existing recipes
3. Add Halloween collection to howtocookathome.com
4. Cross-promote between domains
```

### Phase 4: Family Planning (Week 5-6)

```bash
1. Create family_db database
2. Build todo list feature
3. Integrate with calendar
4. Shopping list sync across domains
```

---

## Database Configuration

### Connection Strings

```javascript
// config/databases.js

module.exports = {
  identity: {
    host: 'localhost',
    port: 5432,
    database: 'calos_identity',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  hollowtown: {
    host: 'localhost',
    port: 5432,
    database: 'hollowtown_db',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  recipes: {
    host: 'localhost',
    port: 5432,
    database: 'recipes_db',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  family: {
    host: 'localhost',
    port: 5432,
    database: 'family_db',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  }
};
```

### Connection Pool Manager

```javascript
// lib/db-pool-manager.js

const { Pool } = require('pg');
const dbConfig = require('../config/databases');

class DBPoolManager {
  constructor() {
    this.pools = {};

    // Initialize all pools
    for (const [name, config] of Object.entries(dbConfig)) {
      this.pools[name] = new Pool(config);
    }
  }

  // Get connection for specific domain
  getPool(domain) {
    if (!this.pools[domain]) {
      throw new Error(`Unknown database: ${domain}`);
    }
    return this.pools[domain];
  }

  // Close all pools
  async closeAll() {
    for (const pool of Object.values(this.pools)) {
      await pool.end();
    }
  }
}

module.exports = new DBPoolManager();
```

---

## Cross-Domain Features

### Example: Recipe Sharing

**Scenario:** User creates Halloween recipe on hollowtown.com, wants to use it on howtocookathome.com

**Flow:**
```
1. User creates spooky recipe on hollowtown.com
   → Stored in hollowtown_db.spooky_recipes

2. User clicks "Share to My Recipes"
   → Creates reference in recipes_db.recipes
   → Links to original via recipe_id + domain

3. Recipe now appears in both:
   - hollowtown.com (original)
   - howtocookathome.com (shared)

4. Any updates sync across both
```

**Implementation:**
```sql
-- In recipes_db
CREATE TABLE recipe_references (
  reference_id UUID PRIMARY KEY,
  user_id UUID, -- References calos_identity.users
  source_domain TEXT, -- 'hollowtown', 'recipes'
  source_recipe_id UUID, -- ID in source domain DB
  created_at TIMESTAMP
);
```

### Example: Family Shopping List

**Scenario:** Family plans Halloween party, needs shopping list across domains

**Flow:**
```
1. Mom creates Halloween event on hollowtown.com
   → Event stored in hollowtown_db.halloween_events
   → Shopping list generated

2. Dad adds recipe to event from howtocookathome.com
   → Ingredients added to shopping list
   → List stored in family_db.shopping_lists

3. Kids can see list in family planner
   → All family members have access
   → Can check off items in real-time
```

---

## Summary

```
┌──────────────────────────────────────────────────────────┐
│  THE AWS MODEL                                           │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                          │
│  One Identity (calos_identity)                          │
│    ↓                                                     │
│  Multiple Services:                                      │
│    • hollowtown.com (Halloween)                         │
│    • howtocookathome.com (Recipes)                      │
│    • familyplanner.com (Todos)                          │
│    • (future domains...)                                 │
│                                                          │
│  Shared Infrastructure:                                  │
│    • Ollama pool (free LLM access)                      │
│    • BYOK option (premium)                              │
│    • Credits system                                      │
│    • Multi-device support                               │
└──────────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Clean separation of concerns
- ✅ Can market/sell domains independently
- ✅ Scales better (each domain has own DB)
- ✅ Easier to give contractors domain-specific access
- ✅ Users only pay once (shared identity)
- ✅ Infrastructure shared across all domains

**Next Steps:**
1. Create `calos_identity` database
2. Run identity migrations
3. Launch hollowtown.com for Spooky Season
4. Cross-promote with howtocookathome.com
5. Add family planning features
6. Build pitch deck for investors

**You're not just building apps. You're building an ecosystem of interconnected services, all powered by the same identity and infrastructure.**

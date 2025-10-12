# CalOS Platform Architecture

**Version**: 1.0.0
**Last Updated**: October 2025
**License**: MIT

> CalOS is an open-source platform for building gamified applications with identity, progression, and rewards. Think of it as an operating system for user engagement - providing the kernel (authentication, skills, actions) that applications can build upon.

---

## 🎯 Vision: CalOS as an "Operating System"

Just as Linux provides process management, memory allocation, and I/O for applications:

**CalOS provides**:
- **Identity Management** (SSO authentication with device fingerprinting)
- **Progression Systems** (Skills/XP à la RuneScape)
- **Reward Mechanisms** (Actions → Effects → XP/Achievements)
- **Time Management** (Scheduling, cooldowns, timezone handling)
- **Social Infrastructure** (Leagues, tournaments, rankings)
- **Economic Primitives** (Coupons, campaigns, mailer systems)

Just as Ethernet/WiFi provide protocols for network communication:

**CalOS provides**:
- **Standard APIs** for all core systems
- **JSON-based protocols** with OpenAPI specs
- **Event hooks** and webhooks for extensibility
- **SDK libraries** (JavaScript, Python)

---

## 📦 Platform Layers

### **Layer 1: CalOS Kernel** (Core Platform)

The foundational systems that all applications depend on.

#### 1.1 Identity & Authentication
- **SSO System** (`/api/auth/*`)
  - JWT-based sessions
  - Device fingerprinting (basic + bare metal)
  - Trusted device management
  - Privacy-preserving age verification
  - Spoofing detection

#### 1.2 Skills & Progression
- **Skills System** (`/api/skills/*`)
  - 10 skills: Development, Design, Security, etc.
  - 99 levels per skill (RuneScape XP formula)
  - XP calculator and leaderboards
  - Achievements and milestones

#### 1.3 Actions & Effects
- **Actions Engine** (`/api/actions/*`)
  - 18+ pre-defined actions (voting, posting, coding, etc.)
  - Configurable effects (award XP, unlock achievements, etc.)
  - Action-to-effect mappings (36+ configured)
  - Rate limiting + cooldown system
  - Timezone-based scheduling

#### 1.4 Scheduling & Time Management
- **Scheduling System** (`/api/schedule/*`)
  - NYSE/NASDAQ trading hours
  - Business hours, always-available
  - Per-action schedule restrictions
  - User-specific exceptions
  - Rate limit violation tracking

---

### **Layer 2: CalOS Protocols** (Standard APIs)

Well-defined JSON APIs with OpenAPI specifications.

#### 2.1 Core APIs

```
Authentication & Identity
├── POST /api/auth/register          # Create account
├── POST /api/auth/login             # Login with device fingerprint
├── POST /api/auth/logout            # Invalidate session
├── GET  /api/auth/session           # Validate session
└── GET  /api/auth/devices           # List trusted devices

Skills & Progression
├── GET  /api/skills                 # List all skills
├── GET  /api/skills/:skillId        # Get skill details
├── POST /api/skills/award-xp        # Award XP (internal)
├── GET  /api/skills/leaderboard     # Global leaderboard
└── GET  /api/skills/user/:userId    # User's skills

Actions & Rewards
├── GET  /api/actions                # List available actions
├── POST /api/actions/execute        # Execute action
├── GET  /api/actions/check/:code    # Check availability
├── GET  /api/actions/history        # User's action history
└── GET  /api/actions/stats          # User's action stats

Scheduling
├── GET  /api/schedule/list          # List schedules
├── GET  /api/schedule/check         # Check if action available now
└── POST /api/schedule/exception     # Grant schedule exception

Mailer Campaigns
├── POST /api/mailer/campaigns       # Create campaign
├── POST /api/mailer/coupons         # Generate coupons
├── POST /api/mailer/redeem          # Redeem coupon
└── GET  /api/mailer/inventory       # User's coupons

Game Leagues
├── GET  /api/leagues/games          # List games (chess, tic-tac-toe)
├── POST /api/leagues/create         # Create league
├── POST /api/leagues/register       # Register for league
├── POST /api/leagues/match          # Record match result
├── GET  /api/leagues/standings      # League standings
├── GET  /api/leagues/leaderboard    # Global leaderboard
└── GET  /api/leagues/elo/:userId    # User's ELO rating
```

#### 2.2 Protocol Specifications

Each API has:
- **OpenAPI 3.0 spec** (machine-readable)
- **Example requests/responses**
- **Rate limits** and quotas
- **Webhook events** (when applicable)
- **Authentication requirements**

---

### **Layer 3: CalOS Extensions** (Applications)

Applications built on the CalOS platform.

#### 3.1 Official Extensions

**Profile Swiper** (`/extensions/swiper/`)
- Adobe Express-style profile generator
- Weighted random generation
- Swipe tracking and analytics
- SDK for embedding in other apps

**Domain Portfolio** (`/extensions/domains/`)
- Domain name voting and challenges
- 12-AI judge system
- Portfolio management

**IIIF Image Server** (`/extensions/iiif/`)
- International Image Interoperability Framework
- Multi-resolution image serving
- Annotation support

**Algo Trading** (`/extensions/trading/`)
- Price tracking (crypto, stocks)
- Candlestick data computation
- Multi-source data replication

**Code Challenges** (`/extensions/challenges/`)
- Teacher/student model
- 12 domain AI brands compete
- Human judgment and winner selection

**Game Leagues** (`/extensions/leagues/`)
- Chess, tic-tac-toe, checkers
- ELO rating system
- Tournament management
- XP rewards for wins

**Mailer Campaigns** (`/extensions/mailer/`)
- Bucky Book-style physical mailings
- Coupon generation and tracking
- Benefit redemption (XP boosts, free actions)

#### 3.2 Building Custom Extensions

Extensions can:
- Use CalOS identity (SSO)
- Award XP through actions
- Schedule tasks/limits
- Access user skills/achievements
- Register custom actions
- Subscribe to webhooks

Example custom extension:
```javascript
// my-chess-app/server.js
const CalOS = require('@calos/sdk');

const calos = new CalOS({
  apiKey: process.env.CALOS_API_KEY,
  endpoint: 'https://api.calos.dev'
});

// User completes a chess puzzle
app.post('/puzzle/complete', async (req, res) => {
  const { userId, puzzleId, timeSeconds } = req.body;

  // Award XP via CalOS
  await calos.actions.execute(userId, 'solve_puzzle', {
    puzzleId,
    timeSeconds,
    difficulty: 'hard'
  });

  // CalOS handles: XP award, achievements, rate limits, cooldowns

  res.json({ success: true });
});
```

---

### **Layer 4: Developer Platform**

Tools and infrastructure for building on CalOS.

#### 4.1 SDKs

**JavaScript SDK** (`@calos/sdk-js`)
```javascript
import CalOS from '@calos/sdk';

const calos = new CalOS({
  apiKey: 'your-api-key',
  endpoint: 'https://api.calos.dev'
});

// Authenticate user
const session = await calos.auth.login(username, password);

// Award XP
await calos.skills.awardXP(userId, 'development', 100);

// Check action availability
const available = await calos.actions.check(userId, 'vote_domain');

// Create league
const league = await calos.leagues.create({
  game: 'chess',
  tier: 'bronze',
  startDate: '2025-11-01'
});
```

**Python SDK** (`calos-sdk-python`) - TBD

#### 4.2 Developer Tools

- **API Keys** with scoped permissions
- **Webhooks** for event notifications
- **Usage Analytics** per developer
- **Rate Limits** per API key
- **Sandbox Environment** for testing

---

## 🗄️ Database Schema

CalOS uses **PostgreSQL 14+** with **pgvector** extension.

### Core Tables

#### Authentication
```sql
users                     -- User accounts
user_sessions             -- JWT sessions
trusted_devices           -- Device fingerprints
age_verifications         -- Privacy-preserving age checks
device_spoofing_alerts    -- Security monitoring
```

#### Skills & Progression
```sql
skills                    -- 10 skill definitions
user_skills               -- User's skill levels/XP
skill_level_requirements  -- XP needed per level (1-99)
skill_actions             -- Actions that award XP
xp_gain_log               -- XP history
achievements              -- Achievement definitions
user_achievements         -- User's unlocked achievements
```

#### Actions & Effects
```sql
action_definitions        -- 18+ action types
effect_definitions        -- 10+ effect types
action_effects            -- Action → Effect mappings
user_action_log           -- Action execution history
effect_execution_log      -- Effect results
```

#### Scheduling
```sql
action_schedules          -- NYSE hours, business hours, etc.
action_schedule_links     -- Actions → Schedules
schedule_exceptions       -- Per-user overrides
rate_limit_violations     -- Abuse tracking
```

#### Mailers
```sql
mailer_campaigns          -- Monthly/yearly campaigns
coupon_codes              -- Unique codes
coupon_redemptions        -- Redemption history
user_mailing_addresses    -- Physical addresses
mailer_deliveries         -- Delivery tracking
```

#### Leagues
```sql
game_definitions          -- Chess, tic-tac-toe, etc.
game_leagues              -- Tournaments/leagues
league_participants       -- Registered players
league_matches            -- Match results
player_elo_ratings        -- ELO per game per user
elo_history               -- ELO change log
```

### Database Migrations

Located in `database/migrations/`:
- `001-012`: Existing systems (pricing, domains, etc.)
- `013`: Scheduling & verification
- `014`: Mailer campaigns & coupons
- `015`: Game leagues & tournaments

---

## 🔌 Extensibility

### Hooks & Events

CalOS emits events for:
- **User actions** (`action.executed`, `action.failed`)
- **XP gains** (`xp.awarded`, `level.up`)
- **Achievements** (`achievement.unlocked`)
- **Matches** (`match.started`, `match.completed`)
- **Coupons** (`coupon.redeemed`)

Subscribe via webhooks:
```javascript
POST /api/webhooks/register
{
  "url": "https://myapp.com/webhooks/calos",
  "events": ["xp.awarded", "level.up"],
  "secret": "webhook-signing-secret"
}
```

### Custom Actions

Register custom actions:
```javascript
POST /api/actions/register
{
  "actionCode": "solve_puzzle",
  "actionName": "Solve Chess Puzzle",
  "actionCategory": "gaming",
  "cooldownSeconds": 0,
  "dailyLimit": null,
  "effects": [
    {
      "effectCode": "award_xp",
      "effectParams": {
        "skillId": "<development-skill-id>",
        "xpAmount": 50
      }
    }
  ]
}
```

---

## 🚀 Deployment

### Self-Hosted (Recommended for Development)

```bash
# Clone repo
git clone https://github.com/soulfra/calos.git
cd calos

# Install dependencies
npm install

# Setup database
createdb calos
psql calos < database/migrations/*.sql

# Configure
cp .env.example .env
# Edit .env with DB credentials

# Start
npm start
```

### Docker Compose

```yaml
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg14
    environment:
      POSTGRES_DB: calos
      POSTGRES_USER: calos
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data

  calos:
    build: .
    ports:
      - "5001:5001"
    environment:
      DB_HOST: postgres
      DB_NAME: calos
      DB_USER: calos
      DB_PASSWORD: secret
    depends_on:
      - postgres

volumes:
  pgdata:
```

### Cloud Hosting

CalOS can be deployed to:
- **Heroku** (Postgres addon, Node.js buildpack)
- **AWS** (RDS + Elastic Beanstalk / ECS)
- **Google Cloud** (Cloud SQL + App Engine)
- **DigitalOcean** (Managed PostgreSQL + App Platform)

---

## 📚 Documentation

- **Getting Started**: [docs/getting-started.md](./docs/getting-started.md)
- **API Reference**: [docs/api/](./docs/api/)
- **Building Extensions**: [docs/extensions.md](./docs/extensions.md)
- **SDK Guides**:
  - [JavaScript SDK](./docs/sdk/javascript.md)
  - [Python SDK](./docs/sdk/python.md)
- **Examples**: [examples/](./examples/)

---

## 🤝 Contributing

CalOS is open source (MIT License). Contributions welcome!

**Core Platform**:
- Bug fixes
- Performance improvements
- New core systems

**Extensions**:
- New games for leagues
- New action types
- New effect types

**SDKs**:
- Language-specific SDKs (Ruby, Go, PHP, etc.)
- Framework integrations (Next.js, Django, Rails)

See [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## 🔒 Security

### Reporting Vulnerabilities

Email: security@calos.dev

Please **do not** open public GitHub issues for security vulnerabilities.

### Security Features

- **Device fingerprinting** (basic + bare metal)
- **Spoofing detection** (timezone/hardware mismatches)
- **Rate limiting** (per user, per action, per API key)
- **JWT authentication** with secure signing
- **Age verification** (privacy-preserving, no DOB storage)
- **SQL injection protection** (parameterized queries)

---

## 📜 License

MIT License - See [LICENSE](./LICENSE)

**TL;DR**: You can use CalOS for anything (commercial or personal), modify it, and redistribute it. Just keep the license and copyright notice.

---

## 🗺️ Roadmap

### Q4 2025
- [x] Core platform (auth, skills, actions)
- [x] Scheduling system
- [x] Mailer campaigns
- [x] Game leagues
- [ ] Complete API route modules
- [ ] OpenAPI specifications
- [ ] JavaScript SDK v1.0
- [ ] Documentation site

### Q1 2026
- [ ] Python SDK
- [ ] Plugin system (modular extensions)
- [ ] Developer portal
- [ ] Example apps (chess league, mailer campaign)
- [ ] Monitoring/observability
- [ ] Performance benchmarks

### Q2 2026
- [ ] Ruby/Go/PHP SDKs
- [ ] Mobile SDKs (React Native, Flutter)
- [ ] GraphQL API (alongside REST)
- [ ] Real-time features (WebSockets)
- [ ] Analytics dashboard

### Future
- [ ] CalOS Cloud (hosted service)
- [ ] Marketplace for extensions
- [ ] No-code builder for actions/effects
- [ ] AI-powered progression balancing

---

## 💬 Community

- **GitHub**: [github.com/soulfra/calos](https://github.com/soulfra/calos)
- **Docs**: [docs.calos.dev](https://docs.calos.dev)
- **Discord**: [discord.gg/calos](https://discord.gg/calos)
- **Twitter**: [@CalOSPlatform](https://twitter.com/CalOSPlatform)

---

## 🙏 Acknowledgments

Inspired by:
- **RuneScape** (skills/XP progression)
- **Discord** (developer platform)
- **Stripe** (API design)
- **Linux** (open ecosystem)
- **Ethernet/WiFi** (protocol standards)

Built with:
- PostgreSQL + pgvector
- Node.js + Express
- JWT, bcrypt
- Ollama (for AI judge system)

---

**CalOS: The Operating System for User Engagement**

Build the next generation of gamified applications on open standards.

# CALOS Marketplace - Open Source + Hosted Model

## Overview

**WordPress model for business operating systems**: Free to self-host, paid for convenience, marketplace for creators, fair trade for contributions.

---

## Revenue Models

### For Users

#### Self-Hosted (Free Forever)
**What you get**:
- ✅ Full source code (MIT license)
- ✅ All features unlocked (POS, crypto, transcripts, QuickBooks)
- ✅ Docker deployment (`docker-compose up`)
- ✅ Theme marketplace access
- ✅ Plugin ecosystem
- ✅ Community support (Discord, forums, IRC)

**What we get** (choose ONE):
1. **Contributions**: Submit themes/plugins/workflows back to us (MIT license)
2. **Data** (opt-in): Let us anonymize your usage data for product improvements
3. **Credit**: Give us attribution ("Powered by CALOS" in your app)
4. **Nothing**: Just use it. That's fine too. (MIT license)

**Cost**: $0 forever

---

#### Hosted (Convenience)

##### Free Tier
**What you get**:
- ✅ 5 transcripts/month
- ✅ Basic themes (Light, Dark, High Contrast)
- ✅ Community support
- ✅ 100 POS transactions/month
- ✅ 1 location

**Cost**: $0/month

##### Pro Tier ($29/month)
**What you get**:
- ✅ Unlimited transcripts
- ✅ All official themes
- ✅ QuickBooks sync
- ✅ Priority email support
- ✅ Unlimited POS transactions
- ✅ 5 locations
- ✅ Custom domain
- ✅ Advanced analytics

**Cost**: $29/month

##### Enterprise Tier ($99/month)
**What you get**:
- ✅ Everything in Pro
- ✅ White-label (remove CALOS branding)
- ✅ Custom themes (we build for you)
- ✅ Priority phone support
- ✅ API access (10k requests/day)
- ✅ Unlimited locations
- ✅ SLA (99.9% uptime guarantee)
- ✅ Dedicated account manager

**Cost**: $99/month

---

### For Creators

#### Free Themes/Plugins
**What you get**:
- ✅ Exposure (featured on marketplace)
- ✅ Reputation (download counts, ratings)
- ✅ Portfolio (showcase your work)
- ✅ Community credit

**What we get**:
- ✅ Your theme/plugin (MIT license)
- ✅ Contribution to ecosystem

**Revenue**: $0 (but great for portfolio)

---

#### Paid Themes/Plugins (70/30 Split)

**Revenue split**:
- **You (creator)**: 70% of sale
- **Us (platform)**: 30% of sale

**Example**:
- Theme price: $49
- Your earnings: $34.30
- Platform fee: $14.70

**Sell 100 copies**:
- Total revenue: $4,900
- Your earnings: $3,430
- Platform fee: $1,470

**Payouts**:
- Monthly payouts via Stripe Connect
- Minimum payout: $50
- Payment methods: Bank transfer, PayPal, Stripe

---

## Theme Marketplace

### What You Can Build

#### 1. Visual Themes
- **Colors**: Custom color schemes (dark mode, light mode, brand colors)
- **Fonts**: Typography choices (Roboto, Inter, Comic Sans if you're brave)
- **Layouts**: Dashboard layouts (sidebar, topbar, mobile-first)
- **Components**: Button styles, cards, modals, forms

**Example**: "Soulfra Dark" theme with purple accents

**Price range**: $0-49 (most are $10-20)

---

#### 2. Automation Workflows
- **Trigger**: Contract signed
- **Actions**: Post to forum → Email receipt → Sync QuickBooks → Tweet announcement
- **Chain multiple actions**: Build complex workflows
- **Conditional logic**: IF/THEN rules

**Example**: "E-commerce Workflow" - Auto-post products to forum, sync inventory

**Price range**: $0-99 (complex workflows $30-50)

---

#### 3. Context Profiles (AI Personas)
- **Pre-configured AI contexts**: Lawyer, Accountant, Developer, Designer
- **System prompts**: Custom instructions for AI
- **Temperature/model settings**: Optimized for specific tasks
- **Example conversations**: Show users how to use it

**Example**: "Legal Contract Reviewer" - AI analyzes contracts for red flags

**Price range**: $0-29 (premium personas $10-20)

---

#### 4. Integration Plugins
- **Payment gateways**: PayPal, Square, Coinbase Commerce
- **Accounting**: QuickBooks, Xero, FreshBooks
- **E-commerce**: Shopify, WooCommerce, BigCommerce
- **Communication**: Slack, Discord, Telegram
- **Analytics**: Google Analytics, Mixpanel, Plausible

**Example**: "Shopify Integration" - Sync POS transactions to Shopify

**Price range**: $0-99 (complex integrations $50-99)

---

### How to Submit a Theme

#### 1. Build Your Theme

**Theme structure**:
```
my-theme/
  manifest.json       # Theme metadata
  styles.css          # CSS styles
  layout.html         # HTML layout (optional)
  screenshot.png      # Screenshot
  README.md           # Documentation
```

**manifest.json**:
```json
{
  "name": "My Awesome Theme",
  "version": "1.0.0",
  "description": "A beautiful dark theme with blue accents",
  "category": "visual",
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "calos-core": ">=1.0.0"
  },
  "colors": {
    "primary": "#0d6efd",
    "background": "#1a1a1a",
    "text": "#e0e0e0"
  }
}
```

---

#### 2. Test Locally

```bash
# Install theme locally
calos theme install ./my-theme

# Test theme
calos theme activate my-awesome-theme

# Run tests
calos theme test my-awesome-theme
```

---

#### 3. Submit to Marketplace

**Via CLI**:
```bash
calos marketplace submit ./my-theme \
  --price 19 \
  --screenshots screenshot1.png,screenshot2.png \
  --demo-url https://demo.example.com \
  --repo-url https://github.com/you/my-theme
```

**Via Web**:
1. Go to https://calos.sh/marketplace/submit
2. Upload theme ZIP
3. Fill in details (name, description, price, screenshots)
4. Submit for review

---

#### 4. Moderation Process

**Timeline**: 1-3 business days

**What we check**:
- ✅ Security (no malicious code)
- ✅ Quality (does it work?)
- ✅ Documentation (README present?)
- ✅ Screenshots (at least 1)
- ✅ License (MIT or compatible)

**Statuses**:
- `pending`: Awaiting review
- `published`: Live on marketplace
- `rejected`: Needs fixes (we'll explain why)

---

### Marketplace Features

#### Browse & Search
- Search by name, description, tags
- Filter by category (visual, automation, context, plugin)
- Filter by price (free, paid)
- Sort by downloads, rating, date

#### Ratings & Reviews
- 1-5 star ratings
- Written reviews
- Must install before reviewing (prevents fake reviews)
- Threaded comments

#### Analytics (for creators)
- Views per day
- Downloads per day
- Revenue per day
- Top countries
- Conversion rate (views → downloads → purchases)

---

## Docker Self-Hosting

### Quick Start (5 minutes)

```bash
# 1. Clone repo
git clone https://github.com/calos/agent-router.git
cd agent-router

# 2. Create .env file
cp .env.example .env
nano .env  # Add your API keys

# 3. Start everything
docker-compose up -d

# 4. Open browser
open http://localhost:5001
```

Done! 🎉

---

### What's Included

**docker-compose.yml** includes:
- **PostgreSQL**: Database (user data, transactions, themes)
- **Redis**: Caching (sessions, rate limiting)
- **CALOS**: Main application (Node.js server)
- **Nginx**: Reverse proxy (HTTPS, static files)

**Services**:
- Web UI (port 5001)
- REST API (port 5001/api)
- WebSocket (real-time sync)
- Gmail gateway (zero-cost email)
- Forum (Reddit-style)
- POS terminal (Stripe Terminal)
- Crypto payments (Coinbase Commerce)

---

### Configuration

**Environment variables** (.env):
```bash
# Database
DATABASE_URL=postgresql://calos:calos@postgres:5432/calos

# Redis
REDIS_URL=redis://redis:6379

# OpenAI (for transcripts)
OPENAI_API_KEY=sk-...

# Stripe (for payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Coinbase Commerce (for crypto)
COINBASE_COMMERCE_API_KEY=...
COINBASE_COMMERCE_WEBHOOK_SECRET=...

# QuickBooks (for accounting)
QB_CLIENT_ID=...
QB_CLIENT_SECRET=...

# Gmail Gateway (for email)
GMAIL_SMTP_USER=you@gmail.com
GMAIL_APP_PASSWORD=...

# Marketplace
MARKETPLACE_MODE=self-hosted  # or 'hosted'
REQUIRE_MODERATION=false      # true for hosted
```

---

### Updating

```bash
# Pull latest changes
git pull origin main

# Rebuild containers
docker-compose down
docker-compose build
docker-compose up -d

# Run migrations
docker-compose exec calos npm run migrate
```

---

## Communication Channels

### Forum (Built-in)
- Reddit/HN-style threading
- Upvotes/downvotes
- Tags (contract, ai, signed, free, low-cost)
- Auto-post contracts to forum
- Search & filter

**Access**: http://localhost:5001/forum

---

### IRC Bridge
- Bridge forum to IRC channel
- Real-time chat for contract discussions
- Commands: `!contract 123`, `!theme search dark`

**Server**: irc.calos.chat
**Channel**: #marketplace

**Usage**:
```bash
# Connect via CLI
irc://irc.calos.chat:6667/#marketplace

# Or use web client
http://localhost:5001/irc
```

---

### Discord Webhook
- Post new themes to Discord
- Notify when someone buys your theme
- Announce marketplace updates

**Setup**:
```bash
# Add Discord webhook to .env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Test
calos discord test
```

---

### Email (Gmail Gateway)
- Zero-cost email relay
- Send receipts, notifications, confirmations
- 500 emails/day (Gmail free tier)

**Already integrated** ✅

---

## Contribution System

### How to Contribute

#### 1. Build Something Cool
- Theme, plugin, workflow, context profile
- Test it locally
- Document it (README.md)

---

#### 2. Submit to Marketplace
- Via CLI: `calos marketplace submit ./my-theme`
- Via Web: https://calos.sh/marketplace/submit

---

#### 3. Choose License
- **MIT**: Free to use, modify, distribute (recommended)
- **GPL**: Must open-source derivative works
- **Commercial**: Paid themes (70/30 split)

---

#### 4. Get Credit
- Featured on marketplace (if free + high quality)
- Download counts & ratings
- Link to your GitHub/portfolio
- Revenue (if paid)

---

### What We Do With Contributions

#### Free Themes (MIT)
- Feature on official marketplace
- Include in default installs (if excellent)
- Credit you in release notes
- Link to your portfolio

**You get**: Exposure, reputation, portfolio piece

**We get**: Ecosystem grows, more users

**Fair trade** ✅

---

#### Paid Themes (70/30 Split)
- List on marketplace
- Handle payments (Stripe)
- Monthly payouts
- Customer support (we handle refunds)
- Marketing (feature in newsletters)

**You get**: 70% of sale ($34.30 per $49 theme)

**We get**: 30% of sale ($14.70 per $49 theme)

**Fair split** ✅

---

## Competitive Analysis

### vs. WordPress

| Feature | WordPress | CALOS |
|---------|-----------|-------|
| Self-hosted | ✅ Free | ✅ Free |
| Hosted | $4-45/mo | $0-99/mo |
| Marketplace | 50k+ themes | Growing |
| Revenue split | 50/50 | 70/30 |
| Tech stack | PHP/MySQL | Node.js/PostgreSQL |
| AI features | ❌ | ✅ (NotebookLM-style) |
| Payment processing | Plugins | ✅ Built-in (POS, crypto) |
| Accounting | Plugins | ✅ Built-in (QuickBooks) |

---

### vs. Supabase

| Feature | Supabase | CALOS |
|---------|----------|-------|
| Self-hosted | ✅ Free | ✅ Free |
| Hosted | $0-25/mo | $0-99/mo |
| Database | PostgreSQL | PostgreSQL |
| Auth | ✅ | ✅ |
| Storage | ✅ | ✅ |
| AI features | ❌ | ✅ |
| Payment processing | ❌ | ✅ |
| Accounting | ❌ | ✅ |
| POS terminal | ❌ | ✅ |

---

### vs. Shopify

| Feature | Shopify | CALOS |
|---------|---------|-------|
| Self-hosted | ❌ | ✅ Free |
| Hosted | $29-299/mo | $0-99/mo |
| Transaction fee | 2.9% + $0.30 | 2.6% + $0.10 |
| Marketplace | 8k+ themes | Growing |
| Revenue split | 20/80 | 70/30 |
| Crypto support | ❌ | ✅ |
| QuickBooks sync | Plugin | ✅ Built-in |
| AI features | ❌ | ✅ |

---

## FAQ

### For Users

**Q: Is self-hosted really free forever?**
A: Yes. MIT license. No tricks. Run it yourself, no cost.

**Q: What if I want to switch from self-hosted to hosted?**
A: Easy migration tool. Export your data, import to hosted. ~10 minutes.

**Q: Can I white-label the self-hosted version?**
A: Yes. MIT license allows modification. Remove our branding, add yours.

**Q: Do self-hosters get updates?**
A: Yes. `git pull` for latest code. We release updates weekly.

---

### For Creators

**Q: Can I sell themes on my own site?**
A: Yes. MIT license allows redistribution. But marketplace gives you free marketing.

**Q: What's the payout minimum?**
A: $50. Payouts happen monthly.

**Q: Can I offer support for my themes?**
A: Yes. Add support link in theme manifest. Charge separately if you want.

**Q: What if someone pirates my paid theme?**
A: We use license keys + activation checks. Not foolproof, but deters casual piracy.

---

## Resources

- **Marketplace**: https://calos.sh/marketplace
- **Submit Theme**: https://calos.sh/marketplace/submit
- **Documentation**: https://docs.calos.sh
- **GitHub**: https://github.com/calos/agent-router
- **Discord**: https://discord.gg/calos
- **Forum**: https://calos.sh/forum
- **IRC**: irc://irc.calos.chat:6667/#marketplace

---

## Summary

✅ **Self-hosted**: Free forever, full features, MIT license
✅ **Hosted**: $0-99/mo for convenience
✅ **Marketplace**: 70/30 split for creators
✅ **Fair trade**: Contribute OR pay (not both)
✅ **Open source**: MIT license, GitHub

**The WordPress model for business operating systems.**

---

**Built with ❤️ by CALOS**

*Open source • Self-host free • Marketplace for creators • Fair trade*

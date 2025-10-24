# Route Reference - Quick Guide

Complete index of all platform routes organized by category. "Capsule" format for quick lookups.

---

## 🎯 Analytics & Wrapped

### Wrapped (Spotify-style summaries)
- `GET /api/wrapped/me` - Your personalized summary
- `GET /api/wrapped/me/features` - Feature usage breakdown
- `GET /api/wrapped/me/models` - AI model patterns
- `GET /api/wrapped/me/spending` - Credits/spending summary
- `GET /api/wrapped/me/milestones` - Achievement milestones
- `GET /api/wrapped/platform` - Platform-wide summary (admin)

**Capsule**: Spotify Wrapped for API usage. Your year in features, AI requests, and credits.

---

## 🏆 Leaderboards

### Rankings
- `GET /api/leaderboard/live` - Who's online NOW (last 15min)
- `GET /api/leaderboard/reputation` - Top reputation scores
- `GET /api/leaderboard/usage` - Most active users
- `GET /api/leaderboard/spending` - Top spenders
- `GET /api/leaderboard/ai` - AI power users
- `GET /api/leaderboard/features/:name` - Top users per feature
- `GET /api/leaderboard/me` - My rankings

**Capsule**: Live rankings. RuneScape-style leaderboards showing who's dominating what.

---

## 💰 Marketplace

### Dynamic Pricing (RuneScape GE-style)
- `GET /api/marketplace/features` - All features with dynamic pricing
- `GET /api/marketplace/features/:name` - Specific feature market data
- `GET /api/marketplace/templates` - App template marketplace
- `GET /api/marketplace/trending` - Trending items (high demand)
- `GET /api/marketplace/demand` - Demand indicators
- `GET /api/marketplace/price-history/:name` - Historical prices
- `POST /api/marketplace/calculate-price` - Calculate dynamic price

**Capsule**: Grand Exchange for features. Prices fluctuate based on supply/demand. 2% platform tax.

---

## 📡 Activity Feed

### Live Events
- `GET /api/activity/live` - Latest activity (poll every 10s)
- `GET /api/activity/feed` - Paginated activity feed
- `GET /api/activity/user/:userId` - User timeline
- `GET /api/activity/feature/:name` - Feature activity
- `GET /api/activity/stats` - Real-time platform stats
- `GET /api/activity/stream` - SSE endpoint for live streaming

**Capsule**: Twitter/X for platform events. See who's doing what RIGHT NOW.

---

## 📦 Metrics Bundle

### Efficient Reads
- `GET /api/metrics/bundle` - Complete dashboard (1 call for everything)
- `GET /api/metrics/bundle/user` - User-focused bundle
- `GET /api/metrics/bundle/platform` - Platform bundle (admin)
- `POST /api/metrics/bundle/custom` - Custom metric selection
- `GET /api/metrics/health` - System health check

**Capsule**: Load entire dashboard in ONE API call. 6+ queries bundled into 1 response.

---

## 🚦 Feature Gates

### Access Control
- `GET /api/feature-analytics/summary` - Overall feature usage
- `GET /api/feature-analytics/top-revenue` - Top revenue features
- `GET /api/feature-analytics/top-usage` - Most used features
- `GET /api/feature-analytics/:name` - Specific feature analytics
- `GET /api/feature-analytics/blocked` - Denied access (demand)
- `GET /api/feature-analytics/beta` - Beta features
- `GET /api/feature-analytics/trends` - Usage trends over time

**Capsule**: 2FA for features. Single-line check: subscription + credits + tier + beta access.

---

## 🏛️ Government APIs

### US Government Data Integration
- `GET /api/government/census/:dataset` - Census Bureau data
- `POST /api/government/verify/ein` - Verify EIN (IRS)
- `POST /api/government/verify/tin` - Verify TIN (IRS)
- `GET /api/government/treasury/:dataset` - Treasury fiscal data
- `GET /api/government/jobs/search` - USAJOBS search
- `GET /api/government/weather` - Weather.gov data
- `GET /api/government/fda/drugs/search` - FDA drug data
- `GET /api/government/sec/company/:cik` - SEC company filings

**Capsule**: Unified wrapper for all US government APIs. Census, IRS, Treasury, FDA, SEC, etc.

---

## 📚 Documentation

### Route Documentation ("In-Game" Query System)
- `GET /api/route-docs/:route` - Get docs for specific route
- `GET /api/route-docs/:route/capsule` - Bite-sized explanation
- `GET /api/route-docs?category=:cat` - List routes by category
- `GET /api/route-docs/search?q=:query` - Search routes

**Capsule**: Wiki for routes. Query any route to learn what it does. Like "save points" in a game.

### Package Documentation
- `GET /api/docs/:package/:version` - Get package documentation
- `GET /api/docs/search?q=:query` - Search documentation
- `POST /api/docs/fetch` - Queue documentation fetch
- `GET /api/docs/popular` - Most popular packages
- `GET /api/docs/deprecated` - Deprecated packages in use

**Capsule**: NPM package docs with version awareness. Auto-cached and searchable.

---

## 🔐 Authentication & Security

### SSO & Auth
- `POST /api/auth/sso/login` - SSO login (GitHub/Google/etc)
- `POST /api/auth/sso/callback` - OAuth callback
- `POST /api/auth/logout` - Logout
- `GET /api/auth/session` - Get session info

### API Keys
- `POST /api/keys/generate` - Generate tenant API key
- `GET /api/keys` - List API keys
- `DELETE /api/keys/:keyId` - Revoke API key
- `POST /api/keys/:keyId/rotate` - Rotate API key

**Capsule**: Two-layer API keys. Customers use tenant keys (sk-tenant-xxx) to access your platform.

---

## 💳 Payments & Credits

### Credits System
- `GET /api/credits/balance` - Get credit balance
- `POST /api/credits/purchase` - Purchase credits
- `GET /api/credits/history` - Transaction history
- `POST /api/credits/transfer` - Transfer credits (if enabled)

### Subscriptions
- `GET /api/subscriptions/plans` - Available subscription plans
- `POST /api/subscriptions/subscribe` - Subscribe to plan
- `POST /api/subscriptions/cancel` - Cancel subscription
- `GET /api/subscriptions/current` - Current subscription

### Payments (Stripe/Apple Pay)
- `POST /api/payments/stripe/create-intent` - Create payment intent
- `POST /api/payments/apple-pay/session` - Apple Pay session
- `GET /api/payments/history` - Payment history

**Capsule**: Usage-based pricing + subscriptions + prepaid credits. Stripe & Apple Pay integration.

---

## 🎮 Gamification

### ELO & Ratings
- `GET /api/elo/leaderboard` - ELO leaderboard
- `POST /api/elo/match` - Record match result
- `GET /api/elo/user/:userId` - User ELO stats

### Badges & XP
- `GET /api/badges` - Available badges
- `GET /api/badges/user/:userId` - User's badges
- `POST /api/xp/award` - Award XP

### Profile Swiper
- `GET /api/swiper/profiles` - Get profiles to vote on
- `POST /api/swiper/vote` - Submit vote
- `GET /api/swiper/stats` - Voting stats

**Capsule**: CodeWars meets RuneScape. ELO rankings, badges, XP, and profile voting.

---

## 📱 Integrations

### Telegram Bot
- `POST /api/telegram/webhook` - Telegram webhook
- `POST /api/telegram/send` - Send message
- `GET /api/telegram/status` - Bot status

### Webhooks
- `POST /api/webhooks/create` - Create webhook
- `GET /api/webhooks` - List webhooks
- `DELETE /api/webhooks/:id` - Delete webhook

### Secure Messaging
- `POST /api/secure/messages/send` - Send encrypted message
- `GET /api/secure/messages/:id` - Get message
- `POST /api/secure/challenges/:id/solve` - Solve PoW challenge

**Capsule**: Telegram bot, webhooks, and Signal-style E2E encrypted messaging.

---

## 🎨 Dev Ragebait Generator

### Ragebait Creation
- `GET /api/mobile/ragebait/templates` - List all available templates
- `GET /api/mobile/ragebait/domains` - Get domain branding options
- `POST /api/mobile/ragebait/generate/:templateId` - Generate GIF and MP4
- `GET /api/mobile/ragebait/:templateId/preview` - Template preview (no generation)

**Capsule**: Viral dev meme generator with 11 templates + 7 domain brands. Generates GIF/MP4 for Twitter.

---

## 👤 User Management

### Handles (@username)
- `POST /api/handles/register` - Register @username handle
- `GET /api/handles/search` - Search handles
- `GET /api/handles/:handle` - Get handle info
- `POST /api/handles/:handle/transfer` - Transfer handle

### Profiles
- `GET /api/users/:userId/profile` - Get user profile
- `PUT /api/users/:userId/profile` - Update profile
- `GET /api/users/:userId/stats` - User statistics

**Capsule**: Discord/Twitter-style @username handles. Transferable, searchable, tradeable.

---

## 🤖 AI & LLM

### Model Routing
- `POST /v1/chat/completions` - OpenAI-compatible chat endpoint
- `POST /api/llm/route` - Route to best model
- `GET /api/llm/models` - Available models
- `GET /api/llm/pricing` - Model pricing

### Model Council (Multi-model collaboration)
- `POST /api/model-council/collaborate` - Multi-model task
- `GET /api/model-council/sessions/:id` - Session status

### Autonomous Mode (Copilot)
- `POST /api/autonomous/start` - Start autonomous task
- `GET /api/autonomous/sessions/:id` - Session status
- `POST /api/autonomous/sessions/:id/feedback` - Provide feedback

**Capsule**: Intelligent model routing + multi-model collaboration + autonomous copilot mode.

---

## 🏗️ Developer Tools

### App Store & Templates
- `GET /api/appstore/templates` - Browse app templates
- `POST /api/appstore/install` - Install template
- `GET /api/appstore/installed` - Installed apps

### BYOK (Bring Your Own Keys)
- `POST /api/byok/keys` - Add provider key
- `GET /api/byok/keys` - List keys
- `DELETE /api/byok/keys/:id` - Remove key

### Diagnostics
- `GET /api/diagnostics/health` - System health
- `GET /api/diagnostics/db` - Database status
- `GET /api/diagnostics/models` - Model availability

**Capsule**: Template marketplace + BYOK for OpenAI/Anthropic + system diagnostics.

---

## 📊 Admin Routes

### Platform Management
- `GET /api/admin/stats` - Platform statistics
- `GET /api/admin/users` - User management
- `POST /api/admin/features/grant` - Grant feature access
- `POST /api/admin/beta/grant` - Grant beta access

### Analytics
- `GET /api/admin/usage` - Usage analytics
- `GET /api/admin/revenue` - Revenue reports
- `GET /api/admin/experiments` - A/B test results

**Capsule**: Admin dashboard for platform management, analytics, and feature gating.

---

## Quick Search

Use `/api/route-docs/search?q=your_query` to search all routes.

**Examples:**
- `/api/route-docs/search?q=leaderboard` → Find all leaderboard routes
- `/api/route-docs/search?q=pricing` → Find marketplace/pricing routes
- `/api/route-docs/search?q=credits` → Find all credit-related routes

---

## Categories

- **Analytics**: Wrapped, Leaderboards, Activity Feed
- **Monetization**: Marketplace, Payments, Credits, Subscriptions
- **Security**: Feature Gates, Auth, API Keys
- **Integration**: Government APIs, Telegram, Webhooks
- **Content**: Dev Ragebait Generator
- **AI**: Model Routing, Council, Autonomous Mode
- **Social**: Handles, Profiles, Swiper, Badges
- **Developer**: Templates, BYOK, Documentation, Diagnostics
- **Admin**: Platform Management, Analytics, Experiments

---

## HTTP Methods

- **GET** - Retrieve data (read-only)
- **POST** - Create new resources or execute actions
- **PUT** - Update existing resources
- **DELETE** - Remove resources

---

## Authentication

Most routes require authentication via:
- **Bearer token**: `Authorization: Bearer sk-tenant-xxx`
- **Session cookie**: Automatic for web UI

Admin routes require:
- `is_admin = true` flag in users table

---

## Rate Limits

- **Free tier**: 100 requests/hour
- **Starter**: 1,000 requests/hour
- **Pro**: 10,000 requests/hour
- **Enterprise**: Unlimited

See `/api/feature-analytics/blocked` for rate limit violations.

---

## Support

- **Documentation**: Check `/api/route-docs/:route` for any route
- **Health**: `/api/metrics/health` for system status
- **Admin**: Contact admin for feature access or tier upgrades

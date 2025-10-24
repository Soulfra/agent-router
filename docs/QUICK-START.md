# CALOS Platform - Quick Start Guide

Get running in 5 minutes with ONE command.

## Prerequisites

- Node.js 18+ (`node --version`)
- PostgreSQL or SQLite
- npm or pnpm

## 1. Install & Setup (2 minutes)

```bash
# Clone or download
cd calos-agent-router

# Install dependencies
npm install
# OR
pnpm install

# Run interactive setup wizard
npm run setup
```

The wizard asks you for:
- Personal info (name, email, GitHub)
- Database credentials
- API keys (optional)
- Which features to enable

It auto-generates your `.env` file with secure secrets!

## 2. Start the Platform (30 seconds)

```bash
# Start server
npm start

# OR run everything in parallel (server + watchers)
npm run dev:all
```

Visit `http://localhost:3000` - you're live!

## 3. Make Your First API Call (1 minute)

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -d '{
    "prompt": "Hello, CALOS!",
    "model": "gpt-4"
  }'
```

## Quick Commands

```bash
npm run setup     # Interactive setup wizard
npm run start     # Start server
npm run dev       # Start with auto-reload
npm run dev:all   # Start everything in parallel
npm run admin     # View admin context
npm run deploy    # Deploy to cloud
npm run clone     # Clone with new branding
```

## What's Next?

- [10 Comprehensive Tutorials](../tutorials/README.md)
- [SDK Usage Guide](../sdk/platform/README.md)
- [API Documentation](../docs/API.md)
- [Domain Models](./DOMAIN-MODELS.md)

## Parallel Mode (Run Everything at Once!)

```bash
# Start server + sync data + watch files
npm run dev:all

# Sync Ahrefs + Google Sheets + Affiliates in parallel
npm run sync:all

# Build everything
npm run build:all
```

## Troubleshooting

**Can't connect to database?**
```bash
# PostgreSQL
createdb calos
psql -d calos -f database/migrations/*.sql

# SQLite (auto-created)
# Just set DB_TYPE=sqlite in .env
```

**Missing API keys?**
- Optional! Start without them
- Add later when needed
- Run `npm run setup` again to update

**Port 3000 already in use?**
```bash
# Change in .env
PORT=4000
```

That's it! You're running CALOS.

Next: [Tutorial 1: First API Call](../tutorials/01-first-api-call.md)

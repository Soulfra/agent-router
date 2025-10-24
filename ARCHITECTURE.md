# CalOS Platform Architecture

## Overview

CalOS is a **dual-system platform** that combines:
1. **Consumer/User Layer**: End-user authentication, gamification, A/B testing
2. **Platform/Tenant Layer**: Multi-tenant whitelabel licensing for businesses

This document explains how both systems work together, where code runs, and the complete data flow.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [The Two Systems](#the-two-systems)
- [Where Code Runs](#where-code-runs)
- [Authentication Flow](#authentication-flow)
- [Device Pairing](#device-pairing)
- [Complete User Journey](#complete-user-journey)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Frontend Integration](#frontend-integration)

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    PLATFORM LAYER                             │
│  ┌────────────┬────────────┬────────────┐                    │
│  │  Tenant 1  │  Tenant 2  │  Tenant 3  │  (Licensees)       │
│  │ acme-fit   │ yoga-studio│ recipe-co  │                    │
│  └────────────┴────────────┴────────────┘                    │
│         ↓              ↓           ↓                          │
│  ┌────────────────────────────────────────────────┐          │
│  │      USER LAYER (End Users of Each Tenant)     │          │
│  │  alice@acme │ bob@yoga │ carol@recipe │ ...   │          │
│  └────────────────────────────────────────────────┘          │
│         ↓              ↓           ↓                          │
│  ┌────────────────────────────────────────────────┐          │
│  │   GAMIFICATION SYSTEMS                         │          │
│  │  • Training Tasks    • Account Warming         │          │
│  │  • A/B Experiments   • Device Pairing          │          │
│  └────────────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────┘
         ↓ HTTP/WebSocket API ↓
┌──────────────────────────────────────────────────────────────┐
│               CLIENT DEVICES (Browsers/Apps)                  │
│  Desktop Chrome │ iPhone Safari │ Android App │ etc.         │
└──────────────────────────────────────────────────────────────┘
```

**Key Point**: All code runs on **YOUR SERVERS**. Client devices are just browsers/apps making HTTP requests.

---

## The Two Systems

### 1. User System (Consumer Layer)

**Purpose**: Individual end-users who use the apps (training tasks, warmup, experiments)

**Database Tables**:
- `users` - User accounts (email, password, wallet)
- `user_sessions` - JWT tokens (4-hour access, 30-day refresh)
- `trusted_devices` - Device fingerprints for trust elevation
- `training_task_*` - Gamified data collection
- `account_warmup_*` - TikTok-style progression system
- `ab_test_*` - Multi-variant experiments

**API Endpoints**:
- `POST /api/auth/register` - Create user account (auto-login)
- `POST /api/auth/login` - Authenticate user
- `GET /api/training/tasks/available` - Get available tasks
- `POST /api/warmup/start` - Start warmup campaign
- `GET /api/experiments/active` - Get A/B tests

**Session Duration**: 8 hours (configurable via `SESSION_TIMEOUT_HOURS`)

### 2. Tenant System (Platform Layer)

**Purpose**: Businesses/organizations that license the platform for whitelabel use

**Database Tables**:
- `tenants` - Platform licensees (companies)
- `platform_tiers` - Pricing tiers (Starter/Pro/Enterprise)
- `tenant_licenses` - Active subscriptions (28-day billing)
- `tenant_usage` - Usage tracking per tenant

**API Endpoints**:
- `POST /api/admin/tenants` - Create new tenant (admin only)
- `GET /api/admin/dashboard` - Platform metrics
- `POST /api/admin/tenants/:id/suspend` - Suspend tenant
- `GET /api/admin/tenants/:id/usage` - Get usage stats

**Pricing**:
- **Starter**: $99/28 days (100 users, 1 app)
- **Pro**: $299/28 days (1000 users, 3 apps, custom domain)
- **Enterprise**: $999/28 days (unlimited)

**Note**: 28-day billing cycles, NOT monthly!

---

## Where Code Runs

### Your Servers (Node.js + PostgreSQL)

**Everything runs here:**
- User authentication (JWT generation/validation)
- Database operations (PostgreSQL queries)
- AI model routing (@gpt4, @claude, @ollama)
- A/B testing logic (multi-armed bandit)
- Account warming calculations (authenticity scoring)
- Training task assignment and grading
- Device trust elevation
- WebSocket connections for real-time updates

**Technologies:**
- **Backend**: Node.js + Express
- **Database**: PostgreSQL with migrations
- **Auth**: JWT tokens (4h access + 30d refresh)
- **AI**: OpenAI, Anthropic, DeepSeek APIs
- **Cache**: In-memory + database cache

### Client Devices (Browsers/Apps)

**What they do:**
- Render HTML/React UIs
- Store JWT tokens in localStorage
- Make HTTP/WebSocket requests to your server
- Track device fingerprints (for trust elevation)
- Execute JavaScript (NOT compute-heavy AI tasks)

**What they DON'T do:**
- Run AI models
- Execute database queries
- Perform heavy computations
- Store sensitive credentials

**Key Point**: Device pairing is for **authentication/trust**, NOT compute offloading.

---

## Authentication Flow

### Registration + Auto-Login

```
1. User fills registration form (email, password, name)
   ↓
2. POST /api/auth/register
   ↓
3. Server:
   - Hashes password (bcrypt)
   - Creates user in `users` table
   - Generates JWT access token (4h expiry)
   - Generates refresh token (30d expiry)
   - Creates session in `user_sessions` table
   ↓
4. Response:
   {
     accessToken: "eyJhbGc...",
     refreshToken: "eyJhbGc...",
     sessionId: "uuid",
     user: { userId, email, username, ... }
   }
   ↓
5. Client stores tokens in localStorage
   ↓
6. User is now authenticated (no separate login needed)
```

### Login

```
1. User enters email + password
   ↓
2. POST /api/auth/login
   ↓
3. Server:
   - Looks up user in `users` table
   - Validates password (bcrypt.compare)
   - Checks if device is trusted
   - Creates new session
   ↓
4. Response: Same as registration (tokens + user)
   ↓
5. Client stores tokens in localStorage
```

### Authenticated Requests

```
1. Client makes API call with Authorization header
   GET /api/training/tasks/available
   Authorization: Bearer eyJhbGc...
   ↓
2. Server middleware (requireAuth):
   - Extracts token from header
   - Validates JWT signature
   - Checks session in database
   - Attaches req.user = { userId, sessionId, ... }
   ↓
3. Route handler executes
   ↓
4. Response sent back to client
```

### Token Refresh

```
1. Access token expires (after 4 hours)
   ↓
2. Client receives 401 Unauthorized
   ↓
3. CalAuth.fetch() automatically:
   - Calls POST /api/auth/refresh
   - Sends refresh token
   - Gets new access token
   - Retries original request
   ↓
4. User stays logged in (transparent refresh)
```

---

## Device Pairing

### Purpose

Device pairing is for **trust elevation**, NOT compute offloading.

**Goals:**
1. **Skip captchas** on trusted devices
2. **Higher rate limits** for verified users
3. **Authenticity scoring** (detect bot behavior)
4. **Cross-device tracking** (same user on phone + desktop)

**NOT for:**
- Running code on user's phone
- Offloading AI computations
- P2P connections between devices
- SMS relay or Twilio integration

### How It Works

```
┌──────────────┐                    ┌──────────────┐
│   Desktop    │                    │    Phone     │
│  (Device A)  │                    │  (Device B)  │
└──────────────┘                    └──────────────┘
       │                                    │
       │ 1. Generate QR Code                │
       │ POST /api/auth/device/qr/generate  │
       │←──────────────────────────────────│
       │ { pairingCode: "ABC123",           │
       │   qrCodeUrl: "https://..." }       │
       │                                    │
       │                                    │ 2. Scan QR Code
       │                                    │ POST /api/auth/device/qr/pair
       │                                    │ { pairingCode: "ABC123" }
       │←───────────────────────────────────┤
       │                                    │
       │ 3. Both devices now TRUSTED        │
       │    - Skip captchas                 │
       │    - Higher rate limits            │
       │    - Linked in database            │
       └────────────────────────────────────┘
```

### Database Schema

```sql
CREATE TABLE device_pairings (
  pairing_id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(user_id),
  primary_device_id VARCHAR(255),   -- Device A fingerprint
  paired_device_id VARCHAR(255),    -- Device B fingerprint
  pairing_method VARCHAR(50),       -- 'qr_code', 'wifi_proximity'
  trust_level VARCHAR(50),          -- 'unverified', 'verified', 'trusted'
  paired_at TIMESTAMP,
  expires_at TIMESTAMP
);
```

### Trust Levels

- **unverified**: New device, never seen before (show captchas)
- **verified**: Device paired via QR code (skip captchas)
- **trusted**: Used for 30+ days, high authenticity score (max rate limits)

---

## Complete User Journey

### Scenario: New User Signs Up

```
1. User visits https://calos.ai/training-tasks.html
   ↓
2. Clicks "Register" button
   ↓
3. Fills form: email, password, name
   ↓
4. POST /api/auth/register
   → Server creates user in `users` table
   → Generates JWT tokens
   → Creates session in `user_sessions`
   ↓
5. Response returns accessToken + refreshToken
   ↓
6. CalAuth.js stores tokens in localStorage
   ↓
7. Page shows "Available Tasks" (user is authenticated)
   ↓
8. User claims task: CalAuth.claimTask(taskId)
   → Sends: GET /api/training/tasks/123/claim
   → Headers: Authorization: Bearer <token>
   → Server validates token, assigns task
   ↓
9. User completes task and submits
   → POST /api/training/tasks/123/submit
   → Server grades submission, awards XP
   ↓
10. User gains 50 XP, completes 5 tasks
    → Eligible for account warmup
    ↓
11. User starts warmup campaign
    → POST /api/warmup/start
    → Server assigns "Observer" phase
    ↓
12. User progresses: Observer → Participant → Contributor → Expert
    → Each phase has requirements (sessions, actions, tasks, streak)
    ↓
13. User pairs phone with desktop
    → Desktop: POST /api/auth/device/qr/generate
    → Phone: POST /api/auth/device/qr/pair
    → Both devices now skip captchas
    ↓
14. User gets assigned to A/B experiment
    → GET /api/experiments/123/assign
    → Server uses consistent hashing (sticky assignment)
    → User always sees same variant
    ↓
15. User completes experiment task
    → POST /api/experiments/123/record
    → Server tracks: success, responseTime, cost, satisfaction
```

### Scenario: Platform Licensee (Business)

```
1. Admin creates tenant
   → POST /api/admin/tenants
   {
     tenant_slug: "acme-fitness",
     tenant_name: "Acme Fitness",
     owner_email: "owner@acme.com",
     tier_code: "pro"  // $299/28 days
   }
   ↓
2. Tenant gets subdomain: acme-fitness.calos.ai
   ↓
3. Tenant's end-users register
   → POST /api/auth/register
   → tenant_id associated via domain header
   ↓
4. Users login and use platform
   → Training tasks, warmup, experiments
   → All data isolated per tenant
   ↓
5. Admin monitors usage
   → GET /api/admin/dashboard
   → View: MRR, active tenants, total users
   ↓
6. Billing cycle completes (28 days)
   → Stripe charges $299
   → License renews automatically
```

---

## Database Schema

### Core Tables

```sql
-- User System
users                      -- User accounts
user_sessions              -- JWT tokens + device fingerprints
trusted_devices            -- Devices that skip captchas
session_activity           -- Security audit log

-- Training Tasks
training_task_pool         -- Available tasks
training_task_types        -- Task type definitions
training_task_assignments  -- User → task claims
training_task_submissions  -- Completed work + grades
training_task_leaderboard  -- Rankings (daily/weekly/monthly)

-- Account Warming
account_warmup_campaigns   -- Active warmup campaigns
account_warmup_phases      -- Phase definitions (Observer → Expert)
account_warmup_progress_log-- Phase transitions
account_warmup_authenticity-- Authenticity scores

-- A/B Testing
ab_test_experiments        -- Active experiments
ab_test_variants           -- Variant configurations
ab_test_assignments        -- User → variant mapping (sticky)
ab_test_observations       -- Results + metrics

-- Device Pairing
device_pairings            -- Linked devices
device_pairing_requests    -- QR codes + pending pairs

-- Platform/Tenants
tenants                    -- Licensee companies
platform_tiers             -- Pricing tiers
tenant_licenses            -- Active subscriptions
tenant_usage               -- Usage tracking
```

### Key Indexes

```sql
-- Optimized for time-range queries
CREATE INDEX idx_sessions_active ON user_sessions(user_id, revoked, expires_at);
CREATE INDEX idx_tasks_available ON training_task_pool(status, priority, created_at);
CREATE INDEX idx_experiments_active ON ab_test_experiments(status, domain);
```

---

## API Endpoints

### Authentication

```
POST   /api/auth/register          Create account (auto-login)
POST   /api/auth/login             Authenticate user
POST   /api/auth/logout            Revoke session
POST   /api/auth/refresh           Refresh access token
GET    /api/auth/me                Get current user
PATCH  /api/auth/me                Update profile
GET    /api/auth/sessions          List active sessions
DELETE /api/auth/sessions/:id      Revoke session
```

### Device Pairing

```
POST   /api/auth/device/qr/generate    Generate QR code
POST   /api/auth/device/qr/pair        Scan QR code
POST   /api/auth/device/wifi/discover  Discover nearby devices
POST   /api/auth/device/wifi/pair      Pair via WiFi proximity
GET    /api/auth/devices               List user's devices
POST   /api/auth/devices/:id/trust     Elevate trust level
DELETE /api/auth/devices/:id           Unpair device
```

### Training Tasks

```
GET    /api/training/tasks/available   Get tasks for user
POST   /api/training/tasks/:id/claim   Claim task
POST   /api/training/tasks/:id/submit  Submit completed task
GET    /api/training/stats              User statistics
GET    /api/training/leaderboard        Rankings
GET    /api/training/task-types         Task definitions
POST   /api/training/tasks/create       Create task (admin)
```

### Account Warming

```
POST   /api/warmup/start                Start campaign
GET    /api/warmup/status               Current phase + progress
POST   /api/warmup/check-advancement    Check if can advance
GET    /api/warmup/recommended-tasks    Tasks for current phase
POST   /api/warmup/log-activity         Log activity for authenticity
GET    /api/warmup/phases               Phase definitions
GET    /api/warmup/authenticity         Authenticity score
GET    /api/warmup/history              Progress history
```

### A/B Testing (Experiments)

```
POST   /api/experiments/create          Create experiment (admin)
GET    /api/experiments/active          List active experiments
GET    /api/experiments/:id/assign      Get variant assignment
POST   /api/experiments/:id/record      Record result
POST   /api/experiments/:id/end         End experiment
GET    /api/experiments/:id/results     Statistical analysis
GET    /api/experiments/summary         All experiments
GET    /api/experiments/:id/comparison  Variant comparison
```

### Admin (Platform Management)

```
GET    /api/admin/dashboard             Platform metrics
GET    /api/admin/tenants               List tenants
POST   /api/admin/tenants               Create tenant
GET    /api/admin/tenants/:id           Tenant details
POST   /api/admin/tenants/:id/suspend   Suspend tenant
POST   /api/admin/tenants/:id/unsuspend Unsuspend tenant
GET    /api/admin/tenants/:id/usage     Usage stats
```

---

## Frontend Integration

### Using CalAuth Library

```html
<script src="/lib/calos-auth.js"></script>
<script>
  // Registration (auto-login)
  const result = await CalAuth.register('user@example.com', 'password', 'Name');
  // User is now authenticated, tokens stored

  // Login
  await CalAuth.login('user@example.com', 'password');

  // Authenticated API calls (auto-adds Bearer token)
  const tasks = await CalAuth.getTrainingTasks({ limit: 10 });
  const status = await CalAuth.getWarmupStatus();
  const variant = await CalAuth.getExperimentVariant(experimentId);

  // Device pairing
  const qr = await CalAuth.generatePairingQR();
  // Show QR code to user
  // On other device:
  await CalAuth.scanPairingQR('ABC123');

  // Check auth status
  if (CalAuth.isAuthenticated()) {
    console.log('User logged in:', CalAuth.getUser());
  }

  // Logout
  await CalAuth.logout();
</script>
```

### Raw Fetch Example

```javascript
// If not using CalAuth library:
const response = await fetch('/api/training/tasks/available', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('calos_auth_token')}`,
    'x-device-id': localStorage.getItem('calos_device_id')
  }
});

const data = await response.json();
```

---

## Environment Configuration

### `.env` File

```bash
# Server
PORT=3000
NODE_ENV=development
HOST=localhost

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calos
DB_USER=postgres
DB_PASSWORD=your_password

# Session Duration (NEW!)
SESSION_TIMEOUT_HOURS=8   # Max session inactivity
SESSION_TOKEN_HOURS=4     # JWT access token lifetime

# JWT Secrets
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here
SESSION_SECRET=your_session_secret_here

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...

# Stripe (for tenant billing)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
```

---

## Testing

### Verification Script

```bash
# Test all API connections
node scripts/verify-auth-connections.js
```

This will:
1. Register a test user
2. Login and validate JWT tokens
3. Test all endpoints (device pairing, training, warmup, experiments)
4. Report pass/fail for each

### Manual Testing

```bash
# Start server
npm start

# Open browser
http://localhost:3000/training-tasks.html

# Register account
# Complete training tasks
# Start warmup campaign
# Pair devices
```

---

## Common Issues

### Issue: Registration returns tokens but CalAuth says "Not authenticated"

**Solution**: Make sure `CalAuth.init()` is called BEFORE checking `isAuthenticated()`. The library auto-initializes on page load.

### Issue: Device pairing QR code doesn't work

**Solution**: Check that both devices are logged in as the same user. QR pairing links devices to the CURRENT user's account.

### Issue: "x-device-id header required" error

**Solution**: CalAuth automatically generates and sends device ID. If using raw fetch, add:
```javascript
headers: { 'x-device-id': CalAuth.getDeviceId() }
```

### Issue: Tenant can't be created

**Solution**: Tenant creation is admin-only. Must be authenticated as admin user. Check `requireAdmin` middleware.

---

## SMS/Twilio Integration (Future)

Currently NOT implemented. Potential use cases:

```javascript
// Send 2FA code
POST /api/auth/2fa/send
{ phoneNumber: '+1234567890' }
→ Your Server → Twilio API → User's Phone (SMS)

// Verify 2FA code
POST /api/auth/2fa/verify
{ phoneNumber: '+1234567890', code: '123456' }

// Send password reset link
POST /api/auth/forgot-password
{ email: 'user@example.com' }
→ Email OR SMS with reset link
```

**Note**: This would be **server-to-phone communication**, NOT phone running code.

---

## Architecture Principles

1. **Server-Authoritative**: All business logic runs on your servers
2. **Client as Thin UI**: Devices only render UI and make API calls
3. **JWT for Auth**: Stateless tokens with database session tracking
4. **Device Fingerprinting**: Trust elevation based on behavior
5. **Multi-Tenant Isolation**: Tenant data never mixed
6. **28-Day Billing**: Lunar cycles, not calendar months
7. **Rate Limiting by Trust**: Trusted devices get higher limits

---

## Next Steps

1. **Run migrations** to create database tables
2. **Test registration flow** with new auto-login
3. **Create tenant** via admin panel
4. **Integrate SMS** via Twilio (optional)
5. **Add email verification** (currently just logs link)
6. **Implement webhook handlers** for Stripe billing

---

## Support

- **GitHub**: https://github.com/yourusername/calos
- **Email**: support@calos.ai
- **Docs**: https://docs.calos.ai

**Built with ❤️ by the CalOS team**

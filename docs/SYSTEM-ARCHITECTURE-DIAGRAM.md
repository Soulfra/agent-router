# CALOS System Architecture - Complete Visual Map

**Last Updated:** 2025-10-20
**Purpose:** Single source of truth showing what exists, how it connects, and what protects your data

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Authentication System (EXISTS)](#authentication-system-exists)
3. [Documentation System (JUST BUILT)](#documentation-system-just-built)
4. [Data Protection & Privacy](#data-protection--privacy)
5. [Email Mirroring Concept (NOT BUILT)](#email-mirroring-concept-not-built)
6. [What's Actually Working](#whats-actually-working)
7. [Next Steps](#next-steps)

---

## System Overview

### Three Independent Systems

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CALOS PLATFORM                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  SYSTEM 1: OAuth/Passkey Authentication (✅ COMPLETE)      │   │
│  │  Purpose: Let users sign in WITH Google/Microsoft/GitHub  │   │
│  │  Files: routes/passkey-routes.js, routes/oauth-routes.js  │   │
│  │  Database: service_credentials, oauth_tokens               │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  SYSTEM 2: Documentation Screenshot (✅ BACKEND COMPLETE)  │   │
│  │  Purpose: Create tutorials for OAuth setup processes      │   │
│  │  Files: routes/docs-routes.js, lib/capture-oauth-docs.js  │   │
│  │  Database: documentation_snapshots, user_notes             │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  SYSTEM 3: Email Mirroring (❌ NOT BUILT YET)             │   │
│  │  Purpose: Fresh accounts that sync with Gmail/Outlook     │   │
│  │  Concept: Gmail clone + device pairing + templates        │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**IMPORTANT:** These are 3 SEPARATE systems that DON'T depend on each other!

---

## Authentication System (EXISTS)

### Purpose
Allow users to sign in using their existing Google/Microsoft/GitHub accounts while maintaining encrypted credential storage.

### Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                      USER'S BROWSER                                  │
│                                                                      │
│  User clicks: "Sign in with Google" button                          │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    CALOS SERVER (router.js)                          │
│                                                                      │
│  Step 1: GET /api/auth/oauth/google/authorize                       │
│          ├─ Generates PKCE challenge                                │
│          └─ Redirects to Google with:                               │
│             • client_id                                              │
│             • redirect_uri (localhost:5001/api/auth/oauth/callback) │
│             • code_challenge (SHA256 hash)                           │
│             • scopes (email, profile, drive.readonly)               │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    GOOGLE OAUTH SERVER                               │
│                                                                      │
│  • User enters Google credentials                                   │
│  • User authorizes CALOS to access their data                       │
│  • Google generates authorization code                              │
│  • Redirects back: /api/auth/oauth/callback?code=ABC123            │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    CALOS SERVER (oauth-routes.js)                    │
│                                                                      │
│  Step 2: Exchange code for tokens                                   │
│          POST https://oauth2.googleapis.com/token                    │
│          {                                                           │
│            code: "ABC123",                                           │
│            code_verifier: "original_random_string",                  │
│            client_id: "...",                                         │
│            client_secret: "..."                                      │
│          }                                                           │
│                                                                      │
│  Step 3: Receive tokens                                             │
│          {                                                           │
│            access_token: "ya29.xyz...",                              │
│            refresh_token: "1//abc...",                               │
│            expires_in: 3600                                          │
│          }                                                           │
│                                                                      │
│  Step 4: Encrypt and store tokens                                   │
│          ├─ Uses Keyring (lib/keyring.js)                           │
│          ├─ AES-256-GCM encryption                                   │
│          └─ Stores in: service_credentials table                    │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    DATABASE (PostgreSQL)                             │
│                                                                      │
│  service_credentials:                                                │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ service_name: "google"                                         │ │
│  │ credential_type: "oauth_token"                                 │ │
│  │ identifier: "user_12345"                                       │ │
│  │ encrypted_value: "AES256(ya29.xyz...)"                        │ │
│  │ iv: "random_initialization_vector"                            │ │
│  │ auth_tag: "gcm_authentication_tag"                            │ │
│  │ scopes: "email,profile,drive.readonly"                        │ │
│  │ expires_at: "2025-10-20 16:30:00"                             │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Protection Features

1. **AES-256-GCM Encryption**
   - All OAuth tokens encrypted before storage
   - Initialization vector (IV) unique per credential
   - Authentication tag prevents tampering

2. **PKCE (Proof Key for Code Exchange)**
   - Prevents authorization code interception
   - Random verifier generated per login attempt
   - Challenge sent to OAuth provider

3. **Passkey/WebAuthn Support**
   - FaceID, TouchID, Windows Hello
   - Biometric authentication tied to device
   - Private keys never leave device

### Files

- **Routes:** `routes/oauth-routes.js`, `routes/passkey-routes.js`
- **Database:** `migrations/019_service_credentials.sql`
- **Encryption:** `lib/keyring.js`
- **Docs:** `docs/OAUTH-PASSKEY-AUTH.md`

---

## Documentation System (JUST BUILT)

### Purpose
Automatically capture screenshots of OAuth provider setup pages, detect when UIs change, and create interactive tutorials with annotations.

### Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    STEP 1: CAPTURE SCREENSHOTS                       │
│                                                                      │
│  Script: lib/capture-oauth-docs.js                                  │
│                                                                      │
│  node lib/capture-oauth-docs.js all                                 │
│          │                                                           │
│          ├─ Launches Puppeteer (headless Chrome)                    │
│          ├─ Navigates to:                                           │
│          │  • https://github.com/settings/developers                │
│          │  • https://console.cloud.google.com/apis/credentials     │
│          │  • https://portal.azure.com/#view/...                    │
│          │                                                           │
│          ├─ Extracts DOM structure (buttons, inputs, forms)         │
│          ├─ Generates SHA256 hash of DOM (for change detection)     │
│          ├─ Takes full-page screenshot                              │
│          └─ Saves to: oauth-screenshots/github-2025-10-20/          │
│                                                                      │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    STEP 2: STORE IN DATABASE                         │
│                                                                      │
│  UPDATE documentation_snapshots                                      │
│  SET                                                                 │
│    dom_structure_hash = '71678c1e829cd428...',                      │
│    screenshot_dir = '/oauth-screenshots/github-2025-10-20',         │
│    base_screenshot_path = '...base-screenshot.png',                 │
│    status = 'current',                                              │
│    metadata = {                                                      │
│      dom_elements: 57,                                              │
│      viewport_width: 1400,                                          │
│      viewport_height: 900                                           │
│    }                                                                 │
│  WHERE provider = 'github'                                           │
│                                                                      │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    STEP 3: API ENDPOINTS                             │
│                                                                      │
│  routes/docs-routes.js                                               │
│                                                                      │
│  GET /api/docs/providers                                             │
│  ├─ Returns all captured tutorials                                  │
│  └─ Example response:                                                │
│      {                                                               │
│        "success": true,                                              │
│        "count": 3,                                                   │
│        "providers": [                                                │
│          {                                                           │
│            "provider": "github",                                     │
│            "status": "current",                                      │
│            "screenshot_dir": "/oauth-screenshots/github-...",       │
│            "metadata": { "dom_elements": 57 }                        │
│          }                                                           │
│        ]                                                             │
│      }                                                               │
│                                                                      │
│  GET /api/docs/snapshot/:id                                          │
│  ├─ Returns specific tutorial with annotations                      │
│  └─ Includes: screenshot paths, DOM hash, step annotations          │
│                                                                      │
│  POST /api/docs/notes                                                │
│  ├─ Save user notes tied to video timestamps                        │
│  └─ Example: { timestamp: 5.5, note_text: "Click here" }           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Database Schema

```sql
-- Captures of OAuth provider pages
CREATE TABLE documentation_snapshots (
  snapshot_id UUID PRIMARY KEY,
  provider VARCHAR(50),                    -- 'github', 'google', 'microsoft'
  page_url TEXT,                           -- URL that was captured
  dom_structure_hash TEXT,                 -- SHA256 of DOM (detects changes)
  screenshot_dir TEXT,                     -- Directory with screenshots
  base_screenshot_path TEXT,               -- Path to base PNG file
  video_path TEXT,                         -- MP4 video (future)
  gif_path TEXT,                           -- Animated GIF (future)
  status VARCHAR(20),                      -- 'current', 'outdated', 'broken'
  step_count INTEGER,                      -- Number of tutorial steps
  metadata JSONB,                          -- { dom_elements: 57, ... }
  created_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ
);

-- Annotations for tutorial steps (arrows, boxes, text)
CREATE TABLE documentation_annotations (
  annotation_id UUID PRIMARY KEY,
  snapshot_id UUID,
  step_number INTEGER,                     -- 1, 2, 3...
  step_title TEXT,                         -- "Click New OAuth App"
  selector TEXT,                           -- CSS selector to highlight
  annotation_type VARCHAR(20),             -- 'arrow', 'box', 'text', 'circle'
  position JSONB,                          -- { x: 100, y: 200, width: 300 }
  text_content TEXT,                       -- Label text
  color VARCHAR(20) DEFAULT '#00ff00'
);

-- User notes tied to video timestamps
CREATE TABLE user_notes (
  note_id UUID PRIMARY KEY,
  snapshot_id UUID,
  timestamp FLOAT,                         -- Video timestamp (5.5 seconds)
  note_text TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ
);
```

### Change Detection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              SCHEDULED VERIFICATION (Future Feature)            │
│                                                                 │
│  Cron job runs daily:                                           │
│  1. Re-capture screenshots of all providers                    │
│  2. Generate new DOM hash                                      │
│  3. Compare with stored hash                                   │
│                                                                 │
│     IF hashes match:                                            │
│     └─ No changes, update last_verified_at                     │
│                                                                 │
│     IF hashes DON'T match:                                      │
│     ├─ Create entry in documentation_changes table             │
│     ├─ Set status = 'outdated'                                 │
│     ├─ Send notification                                       │
│     └─ Optionally: Auto-regenerate tutorial                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Current Status

**✅ COMPLETE:**
- Screenshot capture script
- Database schema (7 tables)
- API endpoints (6 routes)
- Real screenshots captured:
  - `github-2025-10-20/base-screenshot.png` (46KB, 57 DOM elements)
  - `google-2025-10-20/base-screenshot.png` (39KB, 11 DOM elements)
  - `microsoft-2025-10-20/base-screenshot.png` (84KB, 23 DOM elements)

**❌ PENDING:**
- UI to display tutorials
- Video/GIF generation
- Annotation system (arrows, boxes)
- Scheduled verification

### Files

- **Capture:** `lib/capture-oauth-docs.js`
- **Routes:** `routes/docs-routes.js`
- **Database:** `migrations/061_documentation_tracking.sql`
- **Annotator:** `lib/screenshot-annotator.js` (ready to use)
- **Video Recorder:** `lib/doc-video-recorder.js` (ready to use)

---

## Data Protection & Privacy

### What Protects Your Personal Information

```
┌─────────────────────────────────────────────────────────────────┐
│                     ENCRYPTION LAYERS                           │
└─────────────────────────────────────────────────────────────────┘

1. OAuth Token Encryption (AES-256-GCM)
   ┌──────────────────────────────────────────────┐
   │ Your Google access token: ya29.a0Aa...       │  ← PLAINTEXT
   └──────────────────┬───────────────────────────┘
                      │
                      ▼
   ┌──────────────────────────────────────────────┐
   │ Keyring.encrypt(token)                       │
   │ • Generates random IV                        │
   │ • Encrypts with AES-256-GCM                  │
   │ • Returns: ciphertext + IV + auth_tag        │
   └──────────────────┬───────────────────────────┘
                      │
                      ▼
   ┌──────────────────────────────────────────────┐
   │ Stored in database:                          │
   │ encrypted_value: "gAAAAA..."                 │  ← ENCRYPTED
   │ iv: "random123..."                           │
   │ auth_tag: "tag456..."                        │
   └──────────────────────────────────────────────┘

2. Passkey/WebAuthn Device Binding
   ┌──────────────────────────────────────────────┐
   │ Private key NEVER leaves your device         │
   │ • Stored in Secure Enclave (iOS)             │
   │ • Stored in TPM (Windows)                    │
   │ • Only public key stored on server           │
   └──────────────────────────────────────────────┘

3. PKCE (Prevents Authorization Code Theft)
   ┌──────────────────────────────────────────────┐
   │ Random verifier generated per login          │
   │ • Attacker can't intercept authorization code│
   │ • Even if intercepted, useless without       │
   │   the original code_verifier                 │
   └──────────────────────────────────────────────┘
```

### What This System Does NOT Do

**❌ NOT a Password Manager**
- Does not store plaintext passwords
- Does not generate passwords
- Does not autofill forms (yet)

**❌ NOT Surveillance**
- Screenshots are of PUBLIC OAuth setup pages
- No capture of personal data
- No tracking of user behavior

**❌ NOT Vendor Lock-In**
- You can export your encrypted tokens
- You own your data
- Can migrate to another system

### The "Loop" You Mentioned

You said: *"we're just going in loops trying to protect our personal information"*

**Here's what's actually happening:**

1. **OAuth System (System 1)** - Encrypts YOUR credentials to providers
2. **Documentation System (System 2)** - Captures PROVIDER setup pages (not your data)

These are SEPARATE. The docs system doesn't touch your personal info.

---

## Email Mirroring Concept (NOT BUILT)

### What You're Describing

Based on your message: *"maybe we just make a gmail clone or something or mirror? where we have them sign up with a fresh account from ours but it pairs with their old emails"*

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   FRESH ACCOUNT SYSTEM                          │
└─────────────────────────────────────────────────────────────────┘

Step 1: User creates NEW email address on CALOS
┌──────────────────────────────────────────────┐
│ User signs up:                               │
│ • Email: john@calos.app (NEW)               │
│ • Password: (never stored plaintext)        │
│ • Device ID: device_12345                   │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│ CALOS creates:                               │
│ • Email inbox (john@calos.app)              │
│ • SMTP/IMAP server credentials              │
│ • Encryption keys for mail storage          │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
Step 2: User PAIRS existing accounts
┌──────────────────────────────────────────────┐
│ User adds existing accounts:                 │
│ • john.doe@gmail.com (OAuth)                │
│ • john@outlook.com (OAuth)                  │
│ • john@icloud.com (App Password)            │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
Step 3: CALOS syncs mail bidirectionally
┌──────────────────────────────────────────────┐
│ Sync Process:                                │
│                                              │
│ Gmail → CALOS:                               │
│ • Fetch via IMAP/Gmail API                  │
│ • Store encrypted in CALOS database         │
│ • Mark as "mirrored from Gmail"             │
│                                              │
│ CALOS → Gmail:                               │
│ • Send via SMTP/Gmail API                   │
│ • Copy to Gmail Sent folder                 │
│ • Maintain thread continuity                │
│                                              │
│ Outlook → CALOS (same process)              │
│ iCloud → CALOS (same process)               │
└──────────────────────────────────────────────┘

Step 4: Device Pairing & Security
┌──────────────────────────────────────────────┐
│ Device ID Tracking:                          │
│ • Each device gets unique ID                 │
│ • Passkey tied to device                    │
│ • Cross-device sync via CALOS               │
│                                              │
│ Password Protection:                         │
│ • john@calos.app ≠ john.doe@gmail.com       │
│ • Different passwords per service           │
│ • Password breach in one doesn't affect all │
│                                              │
│ Template System:                             │
│ • Email templates stored in CALOS           │
│ • Quick replies, signatures                 │
│ • Shared across all paired accounts         │
└──────────────────────────────────────────────┘
```

### Database Schema (Hypothetical)

```sql
-- User's CALOS email accounts
CREATE TABLE email_accounts (
  account_id UUID PRIMARY KEY,
  user_id UUID,
  email_address VARCHAR(255),              -- john@calos.app
  display_name VARCHAR(255),
  password_hash TEXT,                      -- bcrypt
  smtp_config JSONB,                       -- SMTP server settings
  imap_config JSONB,                       -- IMAP server settings
  encryption_key TEXT,                     -- For encrypting stored mail
  created_at TIMESTAMPTZ
);

-- Paired external accounts (Gmail, Outlook, iCloud)
CREATE TABLE paired_accounts (
  paired_id UUID PRIMARY KEY,
  email_account_id UUID,                   -- Links to email_accounts
  provider VARCHAR(50),                    -- 'gmail', 'outlook', 'icloud'
  external_email VARCHAR(255),             -- john.doe@gmail.com
  oauth_token_id UUID,                     -- Links to service_credentials
  sync_enabled BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  sync_direction VARCHAR(20),              -- 'bidirectional', 'inbound', 'outbound'
  created_at TIMESTAMPTZ
);

-- Email storage
CREATE TABLE emails (
  email_id UUID PRIMARY KEY,
  account_id UUID,
  message_id VARCHAR(255),                 -- RFC 822 Message-ID
  thread_id VARCHAR(255),
  from_address VARCHAR(255),
  to_addresses TEXT[],
  subject TEXT,
  body_text TEXT,                          -- Encrypted
  body_html TEXT,                          -- Encrypted
  attachments JSONB,
  flags TEXT[],                            -- 'read', 'starred', 'flagged'
  folder VARCHAR(100),                     -- 'INBOX', 'Sent', 'Archive'
  source_provider VARCHAR(50),             -- 'gmail', 'outlook', 'calos'
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);

-- Device pairing
CREATE TABLE devices (
  device_id UUID PRIMARY KEY,
  user_id UUID,
  device_name VARCHAR(255),
  device_type VARCHAR(50),                 -- 'ios', 'android', 'web', 'desktop'
  device_fingerprint TEXT,                 -- Browser/device ID
  passkey_credential_id TEXT,              -- WebAuthn credential ID
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);

-- Email templates
CREATE TABLE email_templates (
  template_id UUID PRIMARY KEY,
  user_id UUID,
  name VARCHAR(255),
  subject_template TEXT,
  body_template TEXT,
  variables JSONB,                         -- { firstName: "John" }
  created_at TIMESTAMPTZ
);
```

### How This Solves Your Concerns

**Problem:** Password managers lock you into their ecosystem
**Solution:** You control the email server. Templates/data stored in YOUR database.

**Problem:** Using same password across sites = security risk
**Solution:** Fresh CALOS account has different password. Paired accounts use OAuth (no password sharing).

**Problem:** If one account breached, all accounts at risk
**Solution:** Each paired account isolated. Breach in Gmail doesn't affect Outlook or CALOS.

**Problem:** Devices tied to password managers
**Solution:** Devices tied to YOUR CALOS server via passkeys. Multi-device sync controlled by you.

### What This Would Require

1. **SMTP/IMAP Server**
   - Postfix or similar mail server
   - DNS MX records for @calos.app
   - SPF/DKIM/DMARC configuration

2. **OAuth Integration** (ALREADY EXISTS - System 1)
   - Gmail API sync
   - Microsoft Graph API sync
   - iCloud Mail sync (via App Passwords)

3. **Encryption Layer** (ALREADY EXISTS - Keyring)
   - Encrypt email bodies before storage
   - Decrypt on retrieval

4. **Sync Worker**
   - Background job to poll Gmail/Outlook/iCloud
   - Fetch new messages every N minutes
   - Store encrypted in database

5. **UI**
   - Inbox view (like Gmail)
   - Compose/reply interface
   - Account pairing settings
   - Template management

**Estimated Complexity:** 2-3 weeks of focused development

---

## What's Actually Working

### ✅ System 1: OAuth/Passkey Auth

**Test it:**
```bash
curl http://localhost:5001/api/auth/oauth/google/authorize
# Redirects to Google login
```

**Database:**
```sql
SELECT * FROM service_credentials WHERE service_name = 'google';
-- Shows encrypted OAuth tokens
```

### ✅ System 2: Documentation Backend

**Test it:**
```bash
# List all tutorials
curl http://localhost:5001/api/docs/providers | jq

# Returns:
{
  "success": true,
  "count": 3,
  "providers": [
    {
      "provider": "github",
      "status": "current",
      "screenshot_dir": "/oauth-screenshots/github-2025-10-20",
      "metadata": { "dom_elements": 57 }
    }
  ]
}
```

**Screenshot files:**
```bash
ls -lh oauth-screenshots/*/base-screenshot.png
# github-2025-10-20/base-screenshot.png (46KB)
# google-2025-10-20/base-screenshot.png (39KB)
# microsoft-2025-10-20/base-screenshot.png (84KB)
```

**Capture new screenshots:**
```bash
node lib/capture-oauth-docs.js all
# Updates database with fresh screenshots and DOM hashes
```

### ❌ System 3: Email Mirroring

**Status:** Not built. This is a NEW feature request.

If you want this, we can start building it. But it's SEPARATE from the documentation system.

---

## Next Steps

### Option A: Finish Documentation System UI

Build a simple HTML page to display the tutorials we captured:

```html
<!-- public/docs-viewer.html -->
<div id="providers-list">
  <!-- Populated via GET /api/docs/providers -->
</div>

<div id="tutorial-viewer">
  <!-- Shows screenshots, annotations, notes -->
  <!-- Populated via GET /api/docs/snapshot/:id -->
</div>
```

**Effort:** 1-2 hours

### Option B: Add Video/GIF Generation

Use the existing tools to create animated tutorials:

```bash
# Screenshot annotator (add arrows, boxes, text)
node lib/screenshot-annotator.js input.png output.png

# Video recorder (convert screenshots to MP4/GIF)
node lib/doc-video-recorder.js
```

**Effort:** 2-4 hours to integrate

### Option C: Build Email Mirroring System

Start fresh on the Gmail clone concept:

1. Set up SMTP/IMAP server (Postfix)
2. Create database schema (email_accounts, paired_accounts, emails)
3. Build sync worker (fetch from Gmail/Outlook)
4. Create inbox UI
5. Add template system

**Effort:** 2-3 weeks

---

## Summary: Stop Going in Loops

### What You Have Now

1. **OAuth/Passkey Auth** - Working. Encrypts credentials. Supports FaceID.
2. **Documentation System** - Backend complete. Captures screenshots. Detects changes.
3. **Email Mirroring** - Not built. Would be a NEW project.

### The "Loop" Explained

- **OAuth System:** Protects YOUR credentials when signing into providers
- **Documentation System:** Captures PROVIDER setup pages (public info, not your data)

These are NOT the same thing. You're not "going in loops" - you're looking at 2 different systems.

### What to Do Next

**Ask yourself:**

1. Do you want to **finish the docs system** (add UI, video generation)?
2. Or do you want to **build the email mirroring** (Gmail clone, templates, device pairing)?
3. Or do you want **both** (but understand they're separate projects)?

**Pick ONE and we'll execute.**

---

## Architecture Diagram: Full System

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CALOS PLATFORM                                │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    FRONTEND (Browser)                            │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │ │
│  │  │ OAuth Login │  │ Docs Viewer  │  │ Email Client (future) │ │ │
│  │  │  (exists)   │  │  (pending)   │  │    (not built)        │ │ │
│  │  └──────┬──────┘  └──────┬───────┘  └──────────┬─────────────┘ │ │
│  └─────────┼─────────────────┼───────────────────────┼──────────────┘ │
│            │                 │                       │                │
│            │ HTTPS           │ HTTPS                 │ HTTPS          │
│            │                 │                       │                │
│  ┌─────────▼─────────────────▼───────────────────────▼──────────────┐ │
│  │                    BACKEND (Node.js)                             │ │
│  │                                                                  │ │
│  │  ┌────────────────────┐  ┌─────────────────┐  ┌──────────────┐ │ │
│  │  │  OAuth Routes      │  │  Docs Routes    │  │ Email Routes │ │ │
│  │  │  /api/auth/oauth/* │  │  /api/docs/*    │  │ (not built)  │ │ │
│  │  └─────────┬──────────┘  └────────┬────────┘  └──────────────┘ │ │
│  │            │                      │                             │ │
│  │            ▼                      ▼                             │ │
│  │  ┌────────────────────┐  ┌─────────────────┐                   │ │
│  │  │  Keyring (AES-256) │  │  Puppeteer      │                   │ │
│  │  │  Encrypts tokens   │  │  Captures pages │                   │ │
│  │  └────────────────────┘  └─────────────────┘                   │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                │                                      │
│                                ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    DATABASE (PostgreSQL)                         │ │
│  │                                                                  │ │
│  │  ┌─────────────────────┐  ┌──────────────────────────────────┐ │ │
│  │  │ service_credentials │  │ documentation_snapshots          │ │ │
│  │  │ • OAuth tokens      │  │ • Screenshots                    │ │ │
│  │  │ • Encrypted AES-256 │  │ • DOM hashes                     │ │ │
│  │  │ • IV, auth_tag      │  │ • Change detection               │ │ │
│  │  └─────────────────────┘  └──────────────────────────────────┘ │ │
│  │                                                                  │ │
│  │  ┌─────────────────────┐  ┌──────────────────────────────────┐ │ │
│  │  │ user_notes          │  │ emails (future)                  │ │ │
│  │  │ • Timestamped notes │  │ • Mirrored email                 │ │ │
│  │  └─────────────────────┘  └──────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    EXTERNAL SERVICES                             │ │
│  │                                                                  │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │ │
│  │  │  Google     │  │  Microsoft   │  │  GitHub                │ │ │
│  │  │  OAuth      │  │  OAuth       │  │  OAuth                 │ │ │
│  │  └─────────────┘  └──────────────┘  └────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Files Reference

### Authentication System
```
routes/oauth-routes.js          - OAuth 2.0 flow (Google, Microsoft, GitHub)
routes/passkey-routes.js        - WebAuthn/Passkey biometric auth
lib/keyring.js                  - AES-256-GCM encryption
lib/biometric-auth.js           - Passkey helpers
migrations/019_service_credentials.sql
docs/OAUTH-PASSKEY-AUTH.md
```

### Documentation System
```
routes/docs-routes.js           - API endpoints (providers, snapshots, notes)
lib/capture-oauth-docs.js       - Screenshot capture with Puppeteer
lib/screenshot-annotator.js     - Add arrows, boxes, text to images
lib/doc-video-recorder.js       - Convert screenshots to MP4/GIF
migrations/061_documentation_tracking.sql
oauth-screenshots/              - Captured screenshots (46KB-84KB)
  ├── github-2025-10-20/base-screenshot.png
  ├── google-2025-10-20/base-screenshot.png
  └── microsoft-2025-10-20/base-screenshot.png
```

### Email Mirroring (Not Built)
```
(Would be created if you want this feature)
routes/email-routes.js          - Inbox, compose, sync endpoints
lib/email-sync-worker.js        - Background job for Gmail/Outlook sync
lib/smtp-server.js              - SMTP server for sending mail
migrations/XXX_email_system.sql
```

---

**END OF DOCUMENT**

**Next Action:** Tell me which path you want:
1. Finish docs UI (1-2 hours)
2. Add video/GIF generation (2-4 hours)
3. Build email mirroring system (2-3 weeks)
4. All of the above (in that order)

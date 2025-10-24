# OAuth Automated Setup Guide

## Overview

You have **three ways** to set up OAuth authentication, ranging from fully automated to step-by-step guided:

| Method | Speed | Automation | Best For |
|--------|-------|------------|----------|
| 🤖 **CLI Auto** | ⚡ Fastest | High | Developers with CLI tools installed |
| 🧙 **Web Wizard** | 🐢 Medium | Medium | Visual learners, first-time users |
| 🌐 **Browser Auto** | 🏃 Fast | High | Power users, batch setups |

All methods result in the same configuration. Choose based on your preference.

---

## 🚀 Quick Start (One Command)

```bash
./setup-oauth-apps.sh
```

This interactive script will:
1. Detect what CLI tools you have installed (GitHub CLI, Google Cloud CLI, Azure CLI)
2. Present you with available setup methods
3. Guide you through the complete setup process
4. Verify configuration and test OAuth flows

**Command-line options:**
```bash
./setup-oauth-apps.sh --auto      # Use CLI automation (fastest)
./setup-oauth-apps.sh --wizard    # Use web wizard (visual)
./setup-oauth-apps.sh --browser   # Use browser automation (highlights)
```

---

## Method 1: 🤖 CLI Auto Setup

**Best for:** Developers with GitHub CLI already authenticated

### Prerequisites
- GitHub CLI installed and authenticated: `gh auth login`
- Node.js installed
- Database running

### Usage

```bash
node lib/oauth-wizard.js
```

### What it does

1. **Detects your environment:**
   - Checks if GitHub CLI is authenticated
   - Checks if Google Cloud CLI is installed
   - Checks if Azure CLI is installed

2. **GitHub OAuth (Automatic):**
   - Uses GitHub CLI token to create OAuth app via API
   - Extracts credentials automatically
   - No browser interaction needed! ⚡

3. **Google OAuth (Guided):**
   - Opens Google Cloud Console in your browser
   - Provides exact values to copy/paste
   - Prompts you to enter credentials

4. **Microsoft OAuth (Guided):**
   - Opens Azure Portal in your browser
   - Provides exact values to copy/paste
   - Prompts you to enter credentials

5. **Auto-configuration:**
   - Updates `.env` file automatically
   - Generates encryption keys
   - Runs database setup
   - Tests OAuth flows

### Example Session

```
╔════════════════════════════════════════════════════════════════╗
║              🔐 OAuth Setup Wizard                             ║
╚════════════════════════════════════════════════════════════════╝

[1/7] Detecting CLI tools...
✓ GitHub CLI authenticated (Soulfra)
⚠ Google Cloud CLI not installed
⚠ Azure CLI not installed

[2/7] Gathering information...
App name (default: Soulfra Platform):
Redirect URL (default: http://localhost:5001/api/auth/oauth/callback):

[3/7] Setting up OAuth providers...
→ Setting up GitHub OAuth (automatic)...
  ✓ GitHub OAuth app created automatically!
  Client ID: Iv1.abc123def456...

→ Setting up Google OAuth (manual)...
  ✓ Opened browser

  Enter Google Client ID: 123456789-abc.apps.googleusercontent.com
  Enter Google Client Secret: GOCSPX-abc123def456
  ✓ Google credentials saved

[4/7] Updating .env file...
  ✓ Updated GITHUB_CLIENT_ID
  ✓ Updated GITHUB_CLIENT_SECRET
  ✓ Updated GOOGLE_CLIENT_ID
  ✓ Updated GOOGLE_CLIENT_SECRET
  ✓ Generated OAUTH_ENCRYPTION_KEY

[5/7] Configuring database...
  ✓ Database configured successfully

[6/7] Testing OAuth flow...
  ✓ google: http://localhost:5001/api/auth/oauth/google/authorize
  ✓ github: http://localhost:5001/api/auth/oauth/github/authorize

[7/7] Setup complete!
```

---

## Method 2: 🧙 Web Wizard

**Best for:** Visual learners, first-time users, step-by-step guidance

### Prerequisites
- Node.js installed
- Server running (`npm start`)

### Usage

```bash
# If server not running:
npm start

# Then open:
open http://localhost:5001/oauth-setup-wizard.html
```

### Features

- ✨ **Beautiful step-by-step interface**
- 📊 **Progress tracking** (7 steps total)
- 📋 **Copy-paste helpers** with syntax highlighting
- ✅ **Real-time validation** of credentials
- 🔍 **Preview before saving**
- 🎯 **Direct links** to provider consoles

### Wizard Steps

**Step 1: Welcome**
- Overview of what you'll set up
- Provider cards showing status
- Time estimate (15-30 minutes)

**Step 2: Configuration**
- Set app name, homepage URL, callback URL
- Live preview of values
- These will be used across all providers

**Step 3: GitHub OAuth**
- Instructions with direct link to GitHub
- Copy-paste values highlighted
- Credential validation (checks format)
- Can't proceed until valid credentials entered

**Step 4: Google OAuth**
- Instructions for Google Cloud Console
- OAuth consent screen guidance
- Client ID format validation (must end with `.apps.googleusercontent.com`)
- Secret format validation (must start with `GOCSPX-`)

**Step 5: Microsoft OAuth**
- Instructions for Azure Portal
- App registration guidance
- Client ID UUID validation
- Secret format validation

**Step 6: Review & Test**
- Summary of all configuration
- Visual confirmation before saving
- "Save & Test" button

**Step 7: Complete**
- Success animation
- Next steps checklist
- Quick links to test OAuth login

### Screenshots

The wizard looks like this:

```
╔════════════════════════════════════════════════════════════════╗
║         🔐 OAuth Setup Wizard                                  ║
║                                                                ║
║  [████████████████░░░░░░░░░] 60% Complete                     ║
╚════════════════════════════════════════════════════════════════╝

┌─ Sidebar ──────┐  ┌─ Content ─────────────────────────────────┐
│ ✅ 1. Welcome  │  │ 🔵 Google OAuth Setup                     │
│ ✅ 2. Config   │  │                                            │
│ ✅ 3. GitHub   │  │ 📝 Setup Steps:                           │
│ ▶️ 4. Google   │  │  1. Open Google Cloud Console ↗           │
│ ⏸️ 5. Microsoft│  │  2. Create project                        │
│ ⏸️ 6. Review   │  │  3. Configure OAuth consent screen        │
│ ⏸️ 7. Complete │  │  4. Create credentials                     │
│                │  │                                            │
│                │  │ Google Client ID:                          │
│                │  │ [123456789-abc.apps.googleusercontent.com] │
│                │  │                                            │
│                │  │ Google Client Secret:                      │
│                │  │ [GOCSPX-••••••••••••••]                   │
│                │  │                                            │
│                │  │ [Back]  [Continue] ──►                    │
└────────────────┘  └───────────────────────────────────────────┘
```

---

## Method 3: 🌐 Browser Automation

**Best for:** Power users, setting up multiple environments, visual learners

### Prerequisites
- Node.js installed
- Puppeteer installed (`npm install puppeteer` - already in dependencies)
- Chrome/Chromium browser

### Usage

```bash
# All providers
node lib/oauth-browser-setup.js all

# Or individual providers
node lib/oauth-browser-setup.js github
node lib/oauth-browser-setup.js google
node lib/oauth-browser-setup.js microsoft
```

### Features

- 🎨 **Visual highlighting** of form fields (like macOS Preview)
- ✨ **Animated bounding boxes** around important elements
- 🖊️ **Auto-fill** for redirect URIs and app names
- 📸 **Automatic screenshots** at each step
- 🤖 **Credential extraction** when possible
- ⏯️ **Pause-and-resume** at manual steps

### How it works

1. **Opens browser window** (visible, not headless)
2. **Injects highlight overlay** JavaScript
3. **Highlights form fields** with glowing boxes and labels:
   ```
   ┌──────────────────────────────────────┐
   │ ▼ Click here to create OAuth app     │ ← Label
   └──────────────────────────────────────┘
   ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
   ┃  [New OAuth App]  ← Button          ┃ ← Glowing box
   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
   ```
4. **Auto-fills fields** where possible
5. **Waits for you** at manual steps
6. **Takes screenshots** for documentation
7. **Extracts credentials** from DOM

### Example: GitHub Setup with Highlighting

```bash
$ node lib/oauth-browser-setup.js github

╔════════════════════════════════════════════════════════════════╗
║       🤖 OAuth Browser Automation Setup                        ║
╚════════════════════════════════════════════════════════════════╝

[GitHub OAuth Setup]

→ Opening GitHub Developer Settings...
  ✓ Highlighted: Click here to create OAuth app
  ⏸  Press Enter when done...

[Enter pressed]

→ Filling form...
  ✓ Highlighted: Enter app name
  ✓ Typed: Soulfra Platform
  ✓ Highlighted: Enter homepage URL
  ✓ Typed: http://localhost:5001
  ✓ Highlighted: Enter callback URL
  ✓ Typed: http://localhost:5001/api/auth/oauth/callback
  📸 Screenshot saved: oauth-screenshots/github-03-filled.png

  ⏸  Review the form and click "Register application"
[Enter pressed]

→ Extracting credentials...
  ✓ Found Client ID: Iv1.abc123def456
  ✓ Highlighted: Click to generate secret
  ⏸  Click "Generate a new client secret"
[Enter pressed]

  ✓ Found Client Secret: abc123...
  ✓ GitHub credentials extracted!

╔════════════════════════════════════════════════════════════════╗
║              Extracted Credentials                             ║
╚════════════════════════════════════════════════════════════════╝

GITHUB_CLIENT_ID=Iv1.abc123def456
GITHUB_CLIENT_SECRET=abc123def456ghi789...

📋 Screenshots saved to: oauth-screenshots/
```

### Visual Highlighting Demo

The browser will show:

```
┌─ GitHub.com ─────────────────────────────────────────────────┐
│                                                               │
│  Developer Settings                                          │
│                                                               │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━┓ ← Glowing green box          │
│  ┃  New OAuth App          ┃                                │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━┛                                │
│  ▲                                                            │
│  └─ Click here to create OAuth app  ← Floating label        │
│                                                               │
│  [Other UI elements not highlighted...]                      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**Highlight colors:**
- 🟢 Green: Form fields to fill
- 🟠 Orange: Buttons to click
- 🔵 Blue: Information to copy

### Screenshots

All screenshots are saved to `oauth-screenshots/`:

```
oauth-screenshots/
├── github-01-developers.png    # Initial page
├── github-02-form.png          # Empty form
├── github-03-filled.png        # Filled form
├── github-04-credentials.png   # Credentials page
├── github-05-secret.png        # Secret generated
├── google-01-console.png
├── google-02-created.png
├── microsoft-01-portal.png
└── microsoft-02-created.png
```

Use these for:
- Documentation
- Troubleshooting
- Showing others how to set up
- Creating video tutorials

---

## Comparison Matrix

| Feature | CLI Auto | Web Wizard | Browser Auto |
|---------|----------|------------|--------------|
| **Speed** | ⚡⚡⚡ Fastest | 🐢 Slowest | ⚡⚡ Fast |
| **Automation** | 🤖 High (GitHub) | 👤 Manual | 🤖 High |
| **Visual Guidance** | ❌ Terminal only | ✅ Step-by-step UI | ✅ Highlights |
| **Screenshots** | ❌ No | ❌ No | ✅ Yes |
| **Prerequisites** | GitHub CLI | Server running | Puppeteer |
| **Best Use Case** | Quick setup | First time | Documentation |
| **Credential Validation** | ✅ Format check | ✅ Real-time | ✅ Format check |
| **Progress Tracking** | ✅ Steps shown | ✅ Progress bar | ✅ Steps shown |
| **Error Recovery** | ⚠️ CLI prompts | ✅ Can go back | ⚠️ CLI prompts |
| **Mobile Friendly** | ❌ No | ✅ Yes | ❌ No |

---

## After Setup

All three methods result in:

1. **.env file updated** with OAuth credentials
2. **Database configured** with provider information
3. **Encryption keys** generated
4. **OAuth flows** ready to test

### Test Your Setup

```bash
# Run test suite
./test-oauth-passkey.sh

# Or manually test
open http://localhost:5001/oauth-login.html
```

### Files Created/Modified

```
.env                              # OAuth credentials added
oauth-screenshots/                # Screenshots (browser auto only)
  ├── github-*.png
  ├── google-*.png
  └── microsoft-*.png
```

---

## Troubleshooting

### CLI Auto Issues

**Problem:** "GitHub CLI not authenticated"
```bash
gh auth login
```

**Problem:** "Could not create OAuth app automatically"
- GitHub may have rate limits
- Try manual method or browser automation
- Check GitHub CLI permissions

### Web Wizard Issues

**Problem:** "Cannot access http://localhost:5001"
```bash
npm start  # Start the server first
```

**Problem:** "Credentials not saving"
- Check browser console for errors
- Ensure .env file is writable
- Try CLI auto method instead

### Browser Auto Issues

**Problem:** "Puppeteer not found"
```bash
npm install puppeteer
```

**Problem:** "Cannot find element"
- Provider may have changed UI
- Use web wizard or CLI auto instead
- Screenshots will show what was attempted

**Problem:** "Browser doesn't open"
```bash
# Run with visible browser (already default)
node lib/oauth-browser-setup.js github
```

---

## Advanced Usage

### Batch Setup (Multiple Environments)

Set up dev, staging, and production in one go:

```bash
#!/bin/bash
# setup-all-envs.sh

for env in dev staging prod; do
  echo "Setting up $env environment..."

  # Copy template
  cp .env.example .env.$env

  # Run automated setup
  ENV_FILE=".env.$env" ./setup-oauth-apps.sh --auto

  # Or use different callback URLs
  sed -i "s/localhost:5001/$env.soulfra.com/g" .env.$env
  node lib/oauth-wizard.js --env=$env
done
```

### CI/CD Integration

Use CLI auto in CI/CD pipelines:

```yaml
# .github/workflows/setup-oauth.yml
name: Setup OAuth
on: [workflow_dispatch]

jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup GitHub CLI
        run: |
          gh auth login --with-token <<< "${{ secrets.GH_TOKEN }}"

      - name: Run OAuth setup
        run: |
          ./setup-oauth-apps.sh --auto
        env:
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
```

### Custom Configuration

Override default values:

```javascript
// custom-setup.js
const OAuthWizard = require('./lib/oauth-wizard');

const wizard = new OAuthWizard({
  appName: 'My Custom App',
  redirectUrl: 'https://myapp.com/auth/callback',
  homepageUrl: 'https://myapp.com'
});

wizard.run();
```

---

## Security Best Practices

1. **Never commit `.env`** to version control
   ```bash
   echo ".env" >> .gitignore
   echo ".env.*" >> .gitignore
   echo "oauth-screenshots/" >> .gitignore
   ```

2. **Rotate encryption keys** regularly
   ```bash
   # Generate new key
   openssl rand -hex 32 > .oauth-key

   # Add to .env
   echo "OAUTH_ENCRYPTION_KEY=$(cat .oauth-key)" >> .env
   rm .oauth-key
   ```

3. **Use different credentials** for dev/staging/prod

4. **Review OAuth scopes** - only request what you need

5. **Enable 2FA** on provider accounts (Google, Microsoft, GitHub)

---

## FAQs

### Which method should I use?

- **First time setting up?** → Web Wizard
- **Have GitHub CLI?** → CLI Auto
- **Need screenshots/documentation?** → Browser Auto
- **Setting up multiple envs?** → CLI Auto in a loop

### Can I mix methods?

Yes! For example:
- Use CLI Auto for GitHub (fastest)
- Use Browser Auto for Google (screenshots)
- Use Web Wizard for Microsoft (easiest)

### How long does each method take?

- CLI Auto: 5-10 minutes
- Web Wizard: 15-20 minutes
- Browser Auto: 10-15 minutes

### Can I re-run setup?

Yes, all methods are idempotent:
- Existing credentials will be updated
- Database records will be updated (not duplicated)
- No data loss

### What if I only want one provider?

```bash
# CLI Auto - skip providers by pressing Enter
node lib/oauth-wizard.js

# Browser Auto - specify provider
node lib/oauth-browser-setup.js google

# Web Wizard - skip steps
# (just don't fill in credentials for unwanted providers)
```

---

## Resources

- **Full OAuth Documentation**: `docs/OAUTH-PASSKEY-AUTH.md`
- **Setup Guide**: `docs/OAUTH-SETUP-GUIDE.md`
- **Test Suite**: `./test-oauth-passkey.sh`
- **Example Login Page**: `http://localhost:5001/oauth-login.html`

---

**Created**: 2025-10-20
**Last Updated**: 2025-10-20
**Version**: 1.0.0

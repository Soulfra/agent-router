# Documentation Automation Status

**Date**: 2025-10-20
**Status**: ✅ Phase 1 Complete, Phase 2 In Progress

---

## What Works Now

### ✅ GIF Generation Pipeline (Fixed!)
**Problem Solved**: "i still don't think you've gotten cal to run the gif or whatever"

- ✅ **Screenshot Annotator** (`lib/screenshot-annotator.js`) - Adds arrows, boxes, text to images
- ✅ **Video Recorder** (`lib/doc-video-recorder.js`) - Converts screenshots to GIF/MP4
  - Fixed: Now uses absolute paths and duration formatting for PNG sequences
  - Fixed: Removed fps filter conflict in palette generation
- ✅ **Export Processor** (`lib/export-processor.js`) - Background worker for async exports
- ✅ **Export API** (`routes/docs-routes.js`) - POST/GET endpoints for export jobs
- ✅ **GIF Created**: `/oauth-exports/github-tutorial.gif` (26KB, 1200x771)

**However**: The GIF shows the same screenshot 5 times because we only captured ONE landing page.

---

## What We Built Today

### ✅ Documentation Parser (`lib/doc-parser.js`)
**Purpose**: Parse `docs/OAUTH-SETUP-GUIDE.md` into structured, actionable steps

**Features**:
- Extracts numbered steps from markdown documentation
- Identifies actions (Click, Fill in, Copy, Navigate to)
- Extracts URLs, selectors, form values
- Generates annotation instructions automatically
- Supports GitHub, Google, Microsoft, iCloud

**Example Output**:
```javascript
{
  number: 2,
  title: "Create OAuth App",
  provider: "github",
  actions: [
    { type: "click", target: "New OAuth App" },
    { type: "click", target: "Register application" }
  ],
  url: "http://localhost:5001",
  selectors: ["New OAuth App", "Register application"],
  values: {
    "Application name": "Soulfra Platform",
    "Homepage URL": "http://localhost:5001"
  }
}
```

### ✅ Multi-Step Capture (`lib/multi-step-capture.js`)
**Purpose**: Capture multiple screenshots as you walk through a process

**Features**:
- Uses doc-parser to get structured steps
- Navigates through each step with Puppeteer
- Takes "before" and "after" screenshots for each action
- Tries to click elements based on documentation
- Two modes:
  - `public`: Captures publicly accessible pages (no auth required)
  - `full`: Walks through complete flow (requires auth)

**Current Limitation**:
- Can only capture landing pages without authentication
- To capture full OAuth app creation, need to be logged in

---

## The Real Problem (And Solution)

### Problem
You said: "i don't understand lol. i can see why this shit is failing"

The GIF is boring because:
1. We only have ONE screenshot (the GitHub Developer Settings landing page)
2. All 5 "steps" in the GIF use the same screenshot
3. Nothing changes, so the tutorial is useless

### Root Cause
- OAuth app creation requires authentication (can't automate without login)
- We can't capture "Click New OAuth App" or "Fill in form" without being logged in
- Current system only captures public pages

### Solution: Build-While-Documenting
Create `lib/oauth-app-builder.js` that:
1. **Logs you in** using your GitHub credentials (stored in keyring)
2. **Actually creates an OAuth app** following the documentation steps
3. **Captures screenshots** of EACH step in the process
4. **Stores the credentials** securely in keyring
5. **Generates the GIF** from the REAL workflow

This way, we:
- **Document by doing** - The screenshots show actual OAuth app creation
- **Build OAuth apps** - We end up with working credentials
- **Auto-generate tutorials** - The GIF shows the real process

---

## What You Wanted

From your message: "we need to document and learn this process and try and figure out how to do some type of thing where we can read and pair the docs with what we're doing in the system into building our own oauth apps"

**Translation**:
1. ✅ **Read the docs**: `doc-parser.js` extracts steps from `OAUTH-SETUP-GUIDE.md`
2. ✅ **Capture screenshots**: `multi-step-capture.js` walks through and screenshots
3. ❌ **Actually build OAuth apps**: Need `oauth-app-builder.js` (next step)
4. ✅ **Generate GIF**: `export-processor.js` creates animated tutorials
5. ❌ **Pair docs with system**: Need to connect captured credentials to the system

---

## Next Steps

### Phase 2: Build-While-Documenting

1. **Create `lib/oauth-app-builder.js`**:
   ```bash
   node lib/oauth-app-builder.js github --create --document

   # This will:
   # - Log into GitHub (using credentials from keyring)
   # - Click "New OAuth App"
   # - Fill in the form with values from documentation
   # - Screenshot each step
   # - Copy the Client ID and Secret
   # - Store credentials in keyring
   # - Generate GIF from the screenshots
   # - Update .env file
   ```

2. **Integrate with Keyring**:
   - Store GitHub login credentials
   - Store generated OAuth credentials
   - Encrypt everything with AES-256-GCM

3. **Auto-Update .env**:
   - After creating OAuth app, update `.env` with new credentials
   - No manual copy/paste needed

4. **Generate Better Tutorials**:
   - GIF shows actual OAuth app creation
   - Each frame is a different step
   - Annotations point to where to click
   - Final frame shows credentials (blurred)

### Phase 3: Parent-Child DB + Asset Lifecycles

Your bigger vision: "combine qr codes into parent child databases with lifecycles and appreciation or depreciation"

This means:
- QR codes that link to tutorials
- Each tutorial is an "asset" in the database
- Assets have parent-child relationships (e.g., "GitHub OAuth" is parent of "GitHub API Access")
- Track asset value over time (appreciation/depreciation formulas)
- Upload to other services/pipelines

**This pairs with**:
- Existing `family_tree` table (parent-child relationships)
- Existing `price_history` table (appreciation/depreciation tracking)
- Existing `keyring.js` (credential management)

---

## File Structure

### Created Today
```
lib/
  doc-parser.js           - Parse markdown docs into structured steps
  multi-step-capture.js   - Capture screenshots at each step

docs/
  DOCUMENTATION-AUTOMATION-STATUS.md  - This file
```

### Existing (Already Working)
```
lib/
  screenshot-annotator.js   - Add arrows/boxes to screenshots
  doc-video-recorder.js     - Convert screenshots to GIF/MP4
  export-processor.js       - Background worker for exports
  qr-generator.js           - Generate QR codes with tracking
  keyring.js                - Encrypted credential storage

routes/
  docs-routes.js            - Export API endpoints

oauth-exports/
  github-tutorial.gif       - First working GIF (boring, but works!)
```

### To Create Next
```
lib/
  oauth-app-builder.js      - Automate OAuth app creation + documentation
```

---

## How to Use What We Built

### Test Doc Parser
```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router

# Parse GitHub OAuth steps
node lib/doc-parser.js github

# Parse all providers
node lib/doc-parser.js all
```

### Test Multi-Step Capture
```bash
# Capture public pages only (no login needed)
node lib/multi-step-capture.js github public

# Capture full flow (requires auth - not implemented yet)
node lib/multi-step-capture.js github full
```

### Generate GIF from Existing Screenshots
```bash
# Start export processor
node lib/export-processor.js &

# Create export job via database
psql -d calos -c "INSERT INTO documentation_exports (snapshot_id, export_format, status) VALUES ('bb40b772-d023-4588-b719-b22fde38f94c', 'gif', 'pending');"

# Check if GIF was created
ls -lh oauth-exports/github-tutorial.gif
```

---

## Success Criteria

- ✅ **GIF generation works** - We can create animated GIFs from screenshots
- ✅ **Documentation parsing works** - We extract steps from markdown
- ✅ **Multi-step capture works** - We can screenshot multiple pages
- ❌ **Full OAuth flow capture** - Need authentication to capture complete process
- ❌ **Auto-credential storage** - Need to store generated OAuth credentials
- ❌ **Useful GIF output** - Current GIF is boring, need real step-by-step visuals

**When complete**:
```bash
node lib/oauth-app-builder.js github --create --document

# Expected output:
# [Builder] ✓ OAuth App Created!
# [Builder] Client ID: Iv1.abc123def456
# [Keyring] ✓ Stored credentials securely
# [Docs] ✓ Generated tutorial GIF: github-oauth-tutorial.gif (6 steps, 3.5MB)
# [System] ✓ Updated .env file
```

Then the GIF will actually show each step of OAuth app creation, not the same screenshot 5 times.

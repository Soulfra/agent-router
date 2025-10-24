# RoughSparks Debugging Setup

**Last Updated**: 2025-10-14
**Purpose**: Get RoughSparks set up to help debug and test CalOS

---

## 🎯 Quick Start

### Your Account Details
- **Username**: `roughsparks`
- **Email**: `lolztex@gmail.com`
- **User ID**: `e7dc083f-61de-4567-a5b6-b21ddb09cb2d`
- **Status**: Active in database
- **Created**: 2025-10-13

### Access URLs
- **Local**: `http://localhost:5001/calos-os.html`
- **Backend API**: `http://localhost:5001`
- **Health Check**: `http://localhost:5001/health`

---

## 🚀 Getting Started

### Step 1: Start the Backend

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router

# Kill any existing servers
lsof -ti:5001 | xargs kill -9 2>/dev/null

# Start backend
npm run start:quiet

# OR for debugging:
node router.js --local
```

**Expected Output**:
```
CalOS Agent Router starting...
✓ Database connected
✓ MinIO connected
✓ Listening on http://localhost:5001
```

### Step 2: Open CalOS PWA

```bash
open http://localhost:5001/calos-os.html
```

### Step 3: Login

1. Click the 🔐 icon in the dock (leftmost icon)
2. Click "Login" tab
3. Enter:
   - **Email**: `lolztex@gmail.com`
   - **Password**: (ask Matt for password OR reset it)

**If you need to reset your password**:
```bash
# Connect to database
psql -U matthewmauer calos

# Update password (example: setting to "test123")
UPDATE users SET password_hash = crypt('test123', gen_salt('bf')) WHERE email = 'lolztex@gmail.com';
```

---

## 🔍 What's Working vs Broken

### ✅ Working Features

1. **Login System** - JUST FIXED
   - Login window with 🔐 icon
   - Register new account
   - Session persistence
   - Backend: `/api/auth/login` and `/api/auth/register`

2. **Calculator** - Fully offline
   - Works without backend
   - Multi-language (EN/ES/Business)
   - Basic operations

3. **File System (LocalStorage only)**
   - Upload files
   - Saves to localStorage
   - NOT synced to backend yet

4. **Backend Infrastructure**
   - PostgreSQL (322 tables)
   - MinIO (S3 storage)
   - Stripe (payment processing)
   - Multi-LLM Router
   - Model Discovery Service

### ⚠️ Partially Working

**Chat System** - Backend integration added but requires fix:
- ✅ Calls `/api/llm/complete`
- ✅ Model selection dropdown
- ❌ Bot detection blocks requests (needs auth bypass for logged-in users)
- **Error you'll see**: "Authentication required. This endpoint uses bot detection."

### ❌ Not Connected Yet

1. **File Upload to Backend**
   - Files stay in localStorage only
   - Need to call `/api/files/upload`
   - MinIO ready but not connected

2. **Pricing/Subscription**
   - Stripe configured
   - No UI for selecting plans

3. **Projects/Workspaces**
   - "Add new project folder" has nowhere to go
   - Need workspace management system

---

## 🐛 Known Issues to Debug

### Priority 1: Chat Bot Detection

**Issue**: Chat calls `/api/llm/complete` but gets 401 (unauthorized) because bot detection requires access token.

**Fix Needed**: Update bot detection to accept logged-in users (session cookies) without requiring Soulfra identity proof.

**Files to Check**:
- `routes/llm-routes.js` (line 82-105 - authentication middleware)
- `lib/bot-detector.js`

**Expected Flow**:
1. User logs in → Session cookie stored
2. User sends chat message → Includes session cookie
3. Backend checks: "Is user logged in?" → Yes → Allow request
4. No bot detection needed for authenticated users

### Priority 2: File Upload Integration

**Issue**: Files uploaded in PWA stay in localStorage, never sync to backend.

**Fix Needed**: Connect `CalOS.uploadFile()` to backend.

**Files**:
- `public/calos-os.html` (search for `async uploadFile(file)`)
- Backend should have `/api/files/upload` endpoint

**Test**:
```bash
# Upload file in PWA
# Then check database:
psql -U matthewmauer calos -c "SELECT * FROM user_files LIMIT 5;"
```

### Priority 3: Migration System Cleanup

**Issue**: 71 migrations with 24 duplicate numbers causing errors on startup.

**What We Have**:
- ✅ `scripts/migration-audit.js` - Shows all duplicates
- ✅ `scripts/renumber-migrations.js` - Ready to fix (dry-run mode)
- ✅ Database backup saved

**To Fix**:
```bash
# Run audit to see duplicates
node scripts/migration-audit.js

# Dry run (shows what will change)
node scripts/renumber-migrations.js

# Apply fix
node scripts/renumber-migrations.js --apply
```

---

## 🛠️ Debugging Tools

### Database Access

```bash
# Connect to database
psql -U matthewmauer calos

# Check your user
SELECT user_id, email, username, created_at FROM users WHERE username = 'roughsparks';

# Check recent logins
SELECT * FROM user_sessions WHERE user_id = 'e7dc083f-61de-4567-a5b6-b21ddb09cb2d' ORDER BY created_at DESC LIMIT 5;

# Check files (should be empty for now)
SELECT * FROM user_files LIMIT 10;

# Check discovered models
SELECT model_id, name, provider, family FROM discovered_models LIMIT 10;
```

### Backend Logs

```bash
# Watch backend logs
tail -f /tmp/calos-debug.log

# OR just watch console if running node router.js directly
```

### Browser Console

Open DevTools (Cmd+Option+I) and check:
```javascript
// Check CalOS object
CalOS.version
CalOS.storage.user  // Should show your user info after login

// Test login
CalOS.login()  // Make sure form is filled first

// Test chat
CalOS.sendMessage()  // Make sure chat input has text

// Check localStorage
localStorage.getItem('calos_user')
```

---

## 📁 Key Files

### Frontend (PWA)
- `public/calos-os.html` - Main UI (1400+ lines, single-file PWA)

### Backend Routes
- `routes/auth-routes.js` - Login/register endpoints
- `routes/llm-routes.js` - Chat/AI completion endpoints
- `router.js` - Main server file

### Core Services
- `lib/multi-llm-router.js` - Routes to OpenAI/Anthropic/Ollama/DeepSeek
- `lib/model-discovery-service.js` - Discovers available AI models
- `lib/bot-detector.js` - Bot detection (currently blocking chat)

### Documentation
- `INTEGRATION_STATUS.md` - What's connected vs disconnected
- `SOULFRA-IDENTITY.md` - Zero-knowledge identity system docs
- `sdk/platform/PUBLISHING.md` - NPM publishing guide

---

## 🎯 What to Test

### Test 1: Login Flow
1. Open `http://localhost:5001/calos-os.html`
2. Click 🔐 icon
3. Switch to "Register" tab
4. Create test account
5. Logout
6. Login with same account
7. **Expected**: Profile shows username/email

### Test 2: Chat (Will Fail - Expected)
1. Login first
2. Click 💬 Chat icon
3. Type a message
4. Click Send
5. **Current**: Error about bot detection
6. **Goal**: Real AI response from Ollama/OpenAI

### Test 3: File Upload (LocalStorage Only)
1. Click 📁 Files icon
2. Click "+ Upload File"
3. Select a file
4. **Current**: File shows in list (localStorage only)
5. **Goal**: File should also appear in database

### Test 4: Backend Health
```bash
curl http://localhost:5001/health
# Should return: {"status":"ok","uptime":...}

curl http://localhost:5001/api/models/discovered
# Should return: List of AI models
```

---

## 🤝 Collaboration Workflow

### Communication
- **For bugs**: Create issue or document in `ROUGHSPARKS-DEBUG-NOTES.md`
- **For code changes**: (Once git is set up) Create branch, PR, get review

### Making Changes
1. Test locally first
2. Document what you changed
3. Test the fix
4. Share results

### Database Changes
- **Read-only access**: Safe to query anything
- **Write access**: Ask first (don't want to mess up Matt's data)

---

## 📞 Need Help?

**Common Issues**:

1. **"Backend not responding"**
   - Check: `lsof -i :5001` (should show node process)
   - Fix: `npm run start:quiet`

2. **"Database connection failed"**
   - Check: `psql -U matthewmauer calos -c "SELECT 1;"`
   - PostgreSQL should be running

3. **"MinIO error"**
   - MinIO might not be running
   - Check docker: `docker ps | grep minio`

4. **"Can't login"**
   - Password might not be set
   - Use psql command above to reset

---

## 🚀 Next Steps

**Short Term** (This Week):
1. Fix chat bot detection for logged-in users
2. Connect file upload to backend
3. Test iOS-specific issues (if you have iPhone)

**Medium Term** (Next Week):
1. Add subscription/pricing UI
2. Create workspace/project management
3. Set up GitHub repo + collaboration workflow

**Long Term**:
1. iOS app via Capacitor
2. Cross-device sync
3. Team sharing features

---

**Questions?** Ask Matt or document in `ROUGHSPARKS-DEBUG-NOTES.md` for async discussion.

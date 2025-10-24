# CalOS Integration Status

**Last Updated**: 2025-10-14
**Purpose**: Track what's connected vs disconnected in the Cal OS stack

---

## ✅ Quick Wins (JUST FIXED)

###  1. Calculator Language Selector
**Problem**: Calculator window title didn't update when switching languages (EN/ES/Business)
**Fix**: Added `data-i18n="calculator"` attribute + translations
**File**: `public/calos-os.html` line 661, 716, 726, 735
**Test**: Open calos-os.html → Change language → Calculator title updates

### 2. iOS Enter Key (Double-Tap Issue)
**Problem**: iOS keyboard requires hitting Enter twice to send chat message
**Fix**: Added `onkeydown` handler with `event.preventDefault()`
**File**: `public/calos-os.html` line 521
**Test**: iOS Safari → Type message → Press Enter (single tap) → Message sends

### 3. Login/Register System
**Problem**: No way to authenticate users - backend ready but no UI
**Fix**: Added complete login/register window with backend integration
**Files**: `public/calos-os.html` lines 470, 479-555, 995-1161
**Features**:
  - Login with email/password
  - Register new account
  - Session persistence in localStorage
  - Profile view showing username/email
  - Logout functionality
  - Calls `/api/auth/login` and `/api/auth/register`
**Test**: Open calos-os.html → Click 🔐 icon → Register → Login

### 4. Chat Backend Integration
**Problem**: Chat showed echo messages only, never called backend
**Fix**: Connected chat to `/api/llm/complete` endpoint
**File**: `public/calos-os.html` lines 1357-1424
**Features**:
  - Calls real backend API for AI responses
  - Model selection (Auto/Ollama/OpenAI/Anthropic)
  - Typing indicator while waiting
  - Error handling with friendly messages
  - Shows provider/model in response
**Test**: Open calos-os.html → Open Chat → Type message → Get AI response
**Note**: Currently requires bot detection token - will add auth bypass for logged-in users

---

## 🔌 What's Connected

### Backend API (router.js:5001)
- ✅ `/health` - Server health check
- ✅ `/api/auth/register` - User registration
- ✅ `/api/auth/login` - Session creation
- ✅ `/api/subscriptions/plans` - Pricing tiers
- ✅ `/api/models/discovered` - AI model discovery
- ✅ Database (PostgreSQL) - 322 tables
- ✅ MinIO (S3) - File storage ready
- ✅ Stripe - Payment processing configured

### PWA (calos-os.html)
- ✅ Offline calculator (works without backend)
- ✅ LocalStorage for files/keys/settings
- ✅ Service worker for offline support
- ✅ Language switching (EN/ES/Business)
- ✅ Platform detection (iOS/Android/Web/Desktop)
- ✅ Capacitor shim (ready for native)

---

## ❌ What's DISCONNECTED

### Critical Missing Links

1. ~~**No Login/Register UI**~~ ✅ **FIXED**
   - ✅ PWA now has login window with 🔐 icon
   - ✅ Backend auth fully connected
   - ✅ Calls `/api/auth/login` and `/api/auth/register`
   - ✅ Session persistence working

2. ~~**Chat Never Talks to Backend**~~ ⚠️ **PARTIALLY FIXED**
   - ✅ `CalOS.sendMessage()` now calls `/api/llm/complete`
   - ✅ Model selection working (Auto/Ollama/OpenAI/Anthropic)
   - ⚠️ Bot detection requires access token - needs auth bypass for logged-in users
   - ⚠️ Will work once bot detection is updated to accept session cookies

3. **File Upload Stays in LocalStorage**
   - `CalOS.uploadFile()` saves to localStorage
   - Backend has MinIO + PostgreSQL ready
   - **Gap**: No `POST /api/files/upload`
   - **Impact**: Files not synced, no cross-device access

4. **No Pricing/Subscription UI**
   - Backend has Stripe + pricing tiers
   - PWA has no "Upgrade" button
   - **Gap**: No UI to select/pay for plan
   - **Impact**: Can't monetize, everyone's on "free"

5. **Projects/Workspaces Missing**
   - "Add new project folder" → nowhere to go
   - No backend endpoint for workspaces
   - **Gap**: No folder structure, no organization
   - **Impact**: Can't organize files into projects

---

## 🏗️ Architecture Map

```
┌──────────────────────┐
│  PWA (calos-os.html) │  ← YOU ARE HERE (100% offline, never syncs)
│  - Calculator ✅     │
│  - Chat (echo) ⚠️   │
│  - Files (local) ⚠️ │
│  - Settings ✅      │
└──────────────────────┘
          │
          │ ❌ NO CONNECTION (this is the problem!)
          │
          ▼
┌──────────────────────┐
│   Backend (router.js)│
│   Port: 5001         │
│   - Auth ✅          │
│   - Chat API ✅      │
│   - Files API ✅     │
│   - Pricing ✅       │
└──────────────────────┘
          │
          ├──► PostgreSQL (322 tables) ✅
          ├──► MinIO/S3 (file storage) ✅
          ├──► Stripe (payments) ✅
          ├──► Ollama (local AI) ✅
          └──► OpenAI/Anthropic (cloud AI) ✅
```

---

## 🎯 Integration Checklist

### Phase 1: Basic Connectivity (Next Steps)

- [ ] **Add Login Window**
  - Add "Login" icon to app grid
  - Form: email + password
  - Call `POST /api/auth/login`
  - Store session cookie
  - Show user info in status bar

- [ ] **Connect Chat to Backend**
  - Update `sendMessage()` to call `/api/chat/complete`
  - Stream responses back
  - Use selected model from dropdown
  - Handle errors gracefully

- [ ] **Sync Files to Backend**
  - Update `uploadFile()` to call `/api/files/upload`
  - Save to MinIO + PostgreSQL
  - Download files on login
  - Show cloud sync status

### Phase 2: Pricing & Payments

- [ ] **Add Subscription UI**
  - "Upgrade" button in Settings
  - Show pricing tiers from `/api/subscriptions/plans`
  - Stripe checkout flow
  - iOS IAP for App Store

- [ ] **Platform-Specific Pricing**
  - Web: $20/mo (direct Stripe)
  - iOS: $24.99/mo (30% Apple fee)
  - Android: $20/mo (Google Play)
  - Show correct price based on platform

### Phase 3: Advanced Features

- [ ] **Projects/Workspaces**
  - Add "Projects" window
  - Create `POST /api/workspaces/create`
  - Organize files into folders
  - Share projects with team

- [ ] **Cross-Device Sync**
  - WebSocket for real-time sync
  - iCloud backup (iOS only)
  - Conflict resolution
  - Offline queue

- [ ] **iOS Native Features**
  - Haptics (via Capacitor)
  - Face ID / Touch ID
  - Share sheet
  - Widgets

---

## 📊 Current State Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **PWA UI** | ✅ Working | Fully functional offline |
| **Backend API** | ✅ Working | All endpoints ready |
| **Database** | ⚠️ Migrations broken | 24 duplicate numbers |
| **PWA ↔ Backend** | ❌ Not connected | **This is the blocker** |
| **Auth Flow** | ❌ Missing UI | Backend ready, no login button |
| **File Sync** | ❌ LocalStorage only | Not persisted to DB |
| **Pricing** | ❌ No UI | Stripe ready, no checkout |
| **iOS App** | ⚠️ Capacitor ready | Not built yet |

---

## 🧪 How to Verify Integration

### Test 1: Login Flow
```bash
# Start backend
npm run start:quiet

# Open PWA
open http://localhost:5001/calos-os.html

# Current: No login button (FAIL)
# Expected: Login → Create account → See user info in status bar
```

### Test 2: Chat Backend Connection
```bash
# Open browser console
CalOS.sendMessage()

# Current: Shows "Echo: message" (FAIL - no backend call)
# Expected: Fetch to /api/chat/complete → Real AI response
```

### Test 3: File Upload Sync
```bash
# Upload file in PWA
# Check PostgreSQL:
psql -U matthewmauer calos -c "SELECT * FROM user_files;"

# Current: 0 rows (FAIL - file only in localStorage)
# Expected: File row with MinIO URL
```

---

## 🚀 Next Session Goals

1. **Add login/register UI** (1 hour)
2. **Connect chat to backend** (30 min)
3. **Connect file upload to backend** (30 min)
4. **Create E2E test** (30 min)
5. **Document pricing setup** (30 min)

**Total Time**: ~3 hours to full integration

---

## 📝 Migration Issues (Parallel Track)

While fixing integration, also need to:
- ✅ Migration audit complete (24 duplicates found)
- ✅ Database backed up (53K lines)
- ⏳ Renumber migrations (001-071)
- ⏳ Fix foreign key dependencies
- ⏳ Test each migration in isolation

**Note**: Migration cleanup is independent of PWA integration - both can proceed in parallel.

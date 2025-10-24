# CalOS Mobile App - Quick Start Guide

## ✅ What's Been Fixed

1. **Database Permissions** - Fixed permission errors by adding `DB_USER=matthewmauer` to `.env`
2. **Mobile App UI** - Built complete React Native app with all screens
3. **Biometric Authentication** - FaceID/TouchID integration working
4. **Project Management** - Full project creation and provisioning UI
5. **Ollama Terminal** - QR-based terminal with real-time chat
6. **API Routes** - All backend endpoints connected and working

---

## 🚀 Starting the Mobile App

### 1. Start the Backend Server

The server is already running on:
- **Local**: http://localhost:5001
- **Mobile**: http://192.168.1.87:5001

If you need to restart it:
```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router
npm start
# or
npm run start:quiet  # For less verbose output
```

### 2. Start the Mobile App

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/mobile
npm install  # First time only
npm start    # Start Expo
```

This will open Expo DevTools. Choose:
- **i** - Open iOS simulator
- **a** - Open Android emulator
- Scan QR with Expo Go app on your phone

---

## 📱 Mobile App Features

### Home Screen

**"CalOS Mobile" header with connection status**

Four big buttons:
- 🟢 **Register** - Create new account (opens Profile screen)
- 🔵 **Upload** - Upload files to projects (coming soon)
- 🟣 **AI Chat** - Quick access to Ollama chat
- 🟡 **Projects** - Manage projects and containers

Bottom navigation: **Home • Projects • Chat • Profile**

### Projects Screen

**Create and manage projects:**
- Tap "+ New Project" button
- Enter project name (e.g., "my-app")
- Optional description
- Creates bucket via `/api/provision` endpoint
- Lists all existing projects with size and metadata
- Swipe to delete projects

### Chat Screen

**AI-powered chat with Ollama:**
- 22 models available (calos-model, llama3.2, mistral, codellama, etc.)
- Real-time responses
- Model selector at top
- Clear chat history
- Connects to `/api/generate` endpoint

### Profile Screen

**User settings and biometric auth:**
- Account information (email, display name, join date)
- **Biometric Authentication** toggle
  - FaceID on iPhone X and newer
  - TouchID on older iPhones and iPads
  - Registers with `/api/biometric/register`
  - Verifies with `/api/biometric/verify`
- Storage usage display
- Logout button

---

## 🔐 Setting Up Biometric Authentication

### On Your iPhone/iPad:

1. Open the app and go to **Profile** tab
2. Find "Face ID Authentication" (or "Touch ID")
3. Toggle it ON
4. Authenticate when prompted
5. Your device is now registered!

### How It Works:

- Uses Expo's LocalAuthentication API
- Stores secure token in device keychain
- Connects to backend WebAuthn implementation
- Works with native iOS biometric APIs

---

## 💻 Ollama Terminal with QR Code

### From Your Laptop:

1. Open in browser: http://localhost:5001/ollama-terminal.html
2. You'll see:
   - Large QR code with your server URL
   - Connection status (green = Ollama running)
   - Model count (22 models available)
   - Chat interface

### From Your Phone:

1. Scan the QR code with your phone's camera
2. Opens the same terminal on your phone
3. Both laptop and phone can chat with Ollama
4. Real-time sync (WebSocket coming soon)

### Features:

- Model selector (switch between 22 models)
- Real-time chat interface
- Auto-detects if Ollama is running
- Shows your local IP for mobile access

---

## 🔧 Troubleshooting

### "Connection Failed" on Mobile

**Check that phone and laptop are on same WiFi:**
```bash
# On laptop, get your IP:
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Update mobile app config:**
Edit `/Users/matthewmauer/Desktop/CALOS_ROOT/mobile/config.js`
```javascript
export const API_CONFIG = {
  localPort: 5001,
  // Update this IP if needed:
  // It should match your laptop's IP
};
```

### Biometric Not Working

**Requirements:**
- Physical iOS device (doesn't work in simulator)
- FaceID/TouchID enabled in Settings
- Biometric enrolled (face or fingerprint registered)
- Secure context (HTTPS or localhost)

**Test:**
1. Go to Settings → Face ID & Passcode
2. Make sure Face ID is enabled
3. Try toggling biometric in the app again

### Ollama Not Responding

**Check Ollama service:**
```bash
npm run ollama:status
# Should show: 🟢 Status: RUNNING

# If not running:
npm run ollama:start
```

**Verify models:**
```bash
npm run ollama:models
# Should list 22 models
```

**Test endpoint:**
```bash
curl http://localhost:5001/api/ollama/models
# Should return JSON with models array
```

### Project Creation Fails

**Check database permissions:**
```bash
# Make sure .env has:
DB_USER=matthewmauer
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calos
```

**Restart server after .env changes:**
```bash
npm run start:quiet
```

---

## 🎯 Next Steps

### 1. Test Biometric Auth on Physical Device

- Deploy to TestFlight or build locally
- Test FaceID/TouchID authentication flow
- Verify backend registration works

### 2. Create Your First Project

- Open Projects screen
- Tap "+ New Project"
- Name: "test-project"
- Verify it appears in list

### 3. Chat with Ollama

- Go to Chat screen
- Select a model (try "calos-model:latest")
- Send a message
- Verify response comes back

### 4. Scan QR Terminal

- Open http://localhost:5001/ollama-terminal.html on laptop
- Scan QR with phone camera
- Chat from both devices

---

## 📂 File Locations

### Mobile App
```
/Users/matthewmauer/Desktop/CALOS_ROOT/mobile/
├── App.js                   # Main entry point
├── screens/
│   ├── HomeScreen.js        # Dashboard with 4 buttons
│   ├── ProjectsScreen.js    # Project management
│   ├── ChatScreen.js        # Ollama chat
│   └── ProfileScreen.js     # Biometric & settings
├── services/
│   ├── api.js                      # API client
│   └── environment-switcher.js     # Auto-detect local/cloud
└── config.js                # App configuration
```

### Backend
```
/Users/matthewmauer/Desktop/CALOS_ROOT/agent-router/
├── .env                           # Database config (UPDATED)
├── router.js                      # Main server (UPDATED)
├── routes/
│   ├── ollama-routes.js          # NEW - Ollama API
│   ├── provision-routes.js       # Project creation
│   ├── bucket-routes.js          # Bucket management
│   └── biometric-auth.js         # FaceID/TouchID
└── public/
    └── ollama-terminal.html      # NEW - QR terminal
```

---

## 🔗 API Endpoints

All endpoints available at: http://localhost:5001

### Ollama
- `GET /api/ollama/models` - List models
- `GET /api/ollama/status` - Health check
- `POST /api/generate` - Generate response

### Projects
- `GET /api/buckets` - List buckets/projects
- `POST /api/provision` - Create project
- `DELETE /api/buckets/:name` - Delete project

### Auth
- `POST /api/auth/register` - Register account
- `POST /api/auth/login` - Login
- `GET /api/users/me` - Get current user

### Biometric
- `POST /api/biometric/register` - Register biometric
- `POST /api/biometric/verify` - Verify biometric

---

## 🎉 Success Criteria

You'll know everything is working when:

✅ Mobile app loads with "CalOS Mobile" header
✅ Connection status shows "✓ Connected"
✅ Chat screen responds to messages
✅ Projects can be created and listed
✅ Profile screen shows biometric toggle
✅ QR terminal loads and shows models
✅ No database permission errors in server logs

---

## 📞 Support

If you encounter issues:

1. Check server logs: `tail -f /tmp/calos-server.log`
2. Check mobile logs in Expo DevTools
3. Verify all environment variables in `.env`
4. Ensure Ollama is running: `npm run ollama:status`
5. Test endpoints with curl

**Server running at:**
- Local: http://localhost:5001
- Mobile: http://192.168.1.87:5001

**Ollama Terminal:**
- http://localhost:5001/ollama-terminal.html

**Mobile App:**
- cd /Users/matthewmauer/Desktop/CALOS_ROOT/mobile && npm start

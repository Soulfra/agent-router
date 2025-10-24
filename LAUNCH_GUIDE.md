# 🚀 CALOS Launch Guide

## Quick Start (Web Browser)

```bash
# 1. Start the server
npm start

# 2. Open your browser
open http://localhost:5001
```

**All your apps are now running at:**
- **SoulFra OS**: http://localhost:5001/soulfra-os.html
- **Enterprise Dashboard**: http://localhost:5001/enterprise-dashboard.html
- **Culture Profile**: http://localhost:5001/culture-profile.html
- **Pricing Calculator**: http://localhost:5001/pricing-calculator.html
- **Usage Monitoring**: http://localhost:5001/usage-monitoring.html
- **Main Dashboard**: http://localhost:5001/dashboard.html

---

## Deployment Options

You have **3 ways** to run CALOS:

### 1. 🌐 Web (Browser) - **Recommended**
**Works on**: Any device with a browser (Mac, PC, iPhone, Android)

```bash
npm start
```

Then open:
- **Local**: http://localhost:5001
- **Network**: http://YOUR_IP:5001 (access from phone on same WiFi)
- **Production**: Deploy to Vercel/Netlify/AWS

**Pros:**
- ✅ Works everywhere
- ✅ No installation
- ✅ Easiest to update
- ✅ No app store approval

**Cons:**
- ❌ Requires server running
- ❌ Not "app-like" by default (but PWA solves this)

---

### 2. 📱 iOS App (Native) - **Already Configured!**
**Works on**: iPhone, iPad

```bash
# Step 1: Sync web code to iOS
npm run ios:sync

# Step 2: Open Xcode
npm run ios:open

# Step 3: Click the "Play" button in Xcode
# Or run directly:
npm run ios:run
```

**Build for App Store:**
```bash
npm run ios:build
```

**Pros:**
- ✅ Native iPhone app
- ✅ App Store distribution
- ✅ Push notifications (if configured)
- ✅ Offline support

**Cons:**
- ❌ Requires Xcode (Mac only)
- ❌ Requires Apple Developer account ($99/year)
- ❌ App Store review process (7-14 days)

**Current Status:**
- ✅ Capacitor configured
- ✅ iOS project exists (`ios/` folder)
- ✅ App ID: `com.calos.app`
- ❌ Not tested on device yet

---

### 3. 📲 PWA (Progressive Web App) - **Best of Both Worlds**
**Works on**: iPhone, Android, Desktop (Chrome/Edge/Safari)

```bash
# Step 1: Start server
npm start

# Step 2: Open on phone browser
# http://YOUR_IP:5001

# Step 3: Tap "Add to Home Screen"
# Now it's an app icon on your phone!
```

**Pros:**
- ✅ No App Store needed
- ✅ Installable like native app
- ✅ Full-screen experience
- ✅ Works offline (with service worker)
- ✅ Push notifications (if configured)

**Cons:**
- ❌ Slightly less "native" than real app
- ❌ Some iOS limitations (Safari restrictions)

**Current Status:**
- ⚠️ **Needs setup** (I'll create manifest.json + service worker)

---

## Where Are My Apps?

All your apps are **HTML files** in the `public/` folder:

```
public/
  ├── soulfra-os.html          ← SoulFra OS (network ops center)
  ├── calos-os.html            ← CALOS OS (full OS interface)
  ├── enterprise-dashboard.html ← Admin dashboard
  ├── culture-profile.html     ← Customer analysis
  ├── pricing-calculator.html  ← Pricing tool
  ├── usage-monitoring.html    ← Usage tracking
  ├── dashboard.html           ← Main dashboard
  └── ... 79 total pages
```

**They're not separate programs!** They all run through the same Express server.

Think of it like:
- **Server** = Your house
- **HTML pages** = Different rooms
- **Browser** = The door to enter

---

## Common Confusion Cleared Up

### Q: "Do I need JSON/EXE/Binary?"
**No.** You have a web server (Node.js + Express). You access it via browser.

- ❌ `.exe` = Windows executable (not applicable)
- ❌ `.app` = Mac executable (not applicable)
- ✅ **Web server** = What you have (best option)

### Q: "Is SoulFra OS a separate program?"
**No.** It's an HTML page (`soulfra-os.html`) served by your Express server.

### Q: "How do I 'start' SoulFra OS?"
```bash
npm start                    # Start server
open http://localhost:5001/soulfra-os.html
```

### Q: "What about Expo Go?"
**Not configured.** Expo Go is for **React Native** apps. Your app is:
- ✅ **Web** (HTML/CSS/JS)
- ✅ **Capacitor** (web → native iOS wrapper)
- ❌ **Expo** (would require rewriting in React Native)

If you want Expo, you'd need to:
1. Rewrite all HTML pages in React Native
2. Install Expo CLI
3. Start fresh project

**Recommendation: Don't do this.** Your current setup (web + Capacitor) is better.

---

## How to Access on iPhone

### Option 1: Same WiFi (Easiest)
```bash
# 1. Find your Mac's IP address
ifconfig | grep "inet " | grep -v 127.0.0.1

# 2. Start server
npm start

# 3. On iPhone Safari, open:
http://YOUR_IP:5001/soulfra-os.html
```

### Option 2: Deploy to Internet
```bash
# Deploy to Vercel (free)
npx vercel

# Now accessible at:
# https://your-app.vercel.app
```

### Option 3: Build iOS App
```bash
npm run ios:sync
npm run ios:open
# Xcode → Run on your iPhone
```

---

## Domain Mapping

You have **12 domains** configured. They all point to the same server:

| Domain | Purpose |
|--------|---------|
| `soulfra.com` | SoulFra OS |
| `deathtodata.com` | Privacy tools |
| `finishthisidea.com` | Project manager |
| `calos.sh` | Main platform |
| ... | 8 more domains |

**How it works:**
```
All domains → router.js → domain detection → route to correct page
```

Example:
- Visit `soulfra.com` → Shows `soulfra-os.html`
- Visit `calos.sh` → Shows `index.html`

**To test locally:**
```bash
# Edit /etc/hosts
sudo nano /etc/hosts

# Add:
127.0.0.1 soulfra.com
127.0.0.1 deathtodata.com

# Save, then:
npm start
open http://soulfra.com:5001
```

---

## Production Deployment

### Option 1: Vercel (Easiest)
```bash
npm install -g vercel
vercel login
vercel

# Done! Your app is live at:
# https://your-app.vercel.app
```

### Option 2: DigitalOcean/AWS
```bash
# 1. Create droplet
# 2. SSH in
ssh root@YOUR_IP

# 3. Clone repo
git clone YOUR_REPO
cd agent-router

# 4. Install dependencies
npm install

# 5. Start with PM2 (keeps running)
npm install -g pm2
pm2 start router.js
pm2 save
pm2 startup

# 6. Point domain DNS to YOUR_IP
# Done! Visit soulfra.com
```

### Option 3: Docker (Most Portable)
```bash
# Create Dockerfile (I can make this)
docker build -t calos .
docker run -p 5001:5001 calos
```

---

## What to Do Next

### Immediate (Right Now)
```bash
# 1. Start the server
npm start

# 2. Open SoulFra OS
open http://localhost:5001/soulfra-os.html

# 3. Open enterprise dashboard
open http://localhost:5001/enterprise-dashboard.html
```

### This Week
1. **Test on iPhone** (same WiFi method above)
2. **Set up PWA** (I'll create manifest.json)
3. **Deploy to production** (Vercel is easiest)

### This Month
1. **Build iOS app** (Xcode + TestFlight)
2. **Add domains** (point DNS to your server)
3. **Set up analytics** (Google Analytics, PostHog, etc.)

---

## Troubleshooting

### "npm start" fails
```bash
# Install dependencies
npm install

# Check if port 5001 is in use
lsof -i :5001

# Kill existing process
kill -9 $(lsof -t -i:5001)

# Try again
npm start
```

### Can't access from iPhone
```bash
# 1. Check firewall (Mac System Settings → Network → Firewall)
# Allow incoming connections

# 2. Check server is running
npm start

# 3. Verify IP
ifconfig | grep "inet " | grep -v 127.0.0.1

# 4. On iPhone, use IP:
http://192.168.1.XXX:5001
```

### iOS app won't build
```bash
# 1. Install Xcode (from App Store)
# 2. Install Xcode Command Line Tools
xcode-select --install

# 3. Open Xcode once (accept license)
sudo xcodebuild -license accept

# 4. Sync and open
npm run ios:sync
npm run ios:open
```

---

## File Structure Explained

```
agent-router/
  ├── router.js              ← Main server (Express)
  ├── package.json           ← Dependencies & scripts
  ├── capacitor.config.json  ← iOS/Android config
  │
  ├── public/                ← All your web pages
  │   ├── soulfra-os.html
  │   ├── enterprise-dashboard.html
  │   └── ... 79 total pages
  │
  ├── lib/                   ← Backend logic
  │   ├── license-verifier.js
  │   ├── culture-analyzer.js
  │   └── ... business logic
  │
  ├── routes/                ← API endpoints
  │   ├── enterprise-routes.js
  │   ├── pricing-routes.js
  │   └── ... API routes
  │
  ├── ios/                   ← iOS app (Capacitor)
  │   └── App/               ← Xcode project
  │
  └── database/              ← PostgreSQL migrations
      └── migrations/        ← Schema files
```

**How it works:**
1. `npm start` runs `router.js`
2. Express serves `public/` files
3. API endpoints in `routes/` handle backend logic
4. iOS app (if built) wraps `public/` in native container

---

## Summary

**You have 3 deployment methods:**

1. **Web** (browser) → `npm start` → open browser ✅ **WORKS NOW**
2. **iOS** (native app) → `npm run ios:open` → Xcode ✅ **CONFIGURED**
3. **PWA** (installable web app) → `npm start` → "Add to Home Screen" ⚠️ **NEEDS SETUP**

**You do NOT need:**
- ❌ Separate executables (EXE/APP files)
- ❌ JSON config files to "start" apps
- ❌ Expo Go (unless you rewrite in React Native)
- ❌ Binaries (your server IS the binary)

**Everything runs through:**
```
Express server (router.js) → Serves HTML pages → Access via browser or iOS app
```

That's it! You're overthinking it. Just run `npm start` and open a browser. 🚀

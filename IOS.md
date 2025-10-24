# CalOS - iOS Development Guide

## Overview

CalOS is now configured as an iOS app using Capacitor. The entire operating system runs as a self-contained single-file web application (`calos-os.html`) wrapped in a native iOS container.

## Quick Start

### Prerequisites

- macOS with Xcode installed
- Node.js and npm
- CocoaPods (optional, for native dependencies)

### Commands

```bash
# Sync web assets to iOS project
npm run ios:sync

# Open Xcode
npm run ios:open

# Run in iOS simulator
npm run ios:run

# Build iOS app
npm run ios:build
```

## Project Structure

```
agent-router/
├── public/              # Web assets
│   ├── index.html       # CalOS operating system (copied from calos-os.html)
│   └── calos-os.html    # Original CalOS file
├── ios/                 # Native iOS project
│   └── App/
│       ├── App.xcodeproj
│       └── App/
│           └── public/  # Synced web assets
└── capacitor.config.json
```

## Configuration

**capacitor.config.json:**
```json
{
  "appId": "com.calos.app",
  "appName": "CalOS",
  "webDir": "public",
  "server": {
    "url": "http://localhost:5001",
    "cleartext": true
  },
  "ios": {
    "contentInset": "always",
    "allowsLinkPreview": false
  }
}
```

## Development Workflow

### 1. Edit Web Files

Make changes to `public/calos-os.html` or other web assets.

### 2. Sync Changes

```bash
npm run ios:sync
```

This copies web assets to the iOS project.

### 3. Test in Simulator

```bash
npm run ios:run
```

Or open in Xcode:
```bash
npm run ios:open
```

Then press ▶️ to run in simulator.

## Features

### Self-Contained OS
- Entire OS in single HTML file
- Offline-capable (Service Worker)
- localStorage for persistence
- No external dependencies

### iOS Integration
- Native iOS wrapper
- Home screen installation
- Native look and feel
- Splash screen support

### Architecture
- Frontend: Single-file HTML/CSS/JS
- Backend: Node.js server (localhost:5001)
- Communication: HTTP/WebSocket
- Storage: localStorage + IndexedDB

## Backend Connection

The iOS app connects to the backend server at `http://localhost:5001`. For production:

1. Update `capacitor.config.json` to remove the `server.url`
2. Build production backend
3. Deploy backend to cloud
4. Update app to point to production URL

## TestFlight Preparation

### 1. Configure Bundle ID

In Xcode, update the bundle identifier:
- Open `ios/App/App.xcodeproj`
- Select App target → Signing & Capabilities
- Set Team and Bundle Identifier

### 2. Configure App Icons

Add app icons to:
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

### 3. Build Archive

1. Select "Any iOS Device (arm64)" scheme
2. Product → Archive
3. Distribute App → App Store Connect
4. Upload to TestFlight

### 4. TestFlight Setup

1. Go to App Store Connect
2. Select your app
3. TestFlight tab
4. Add internal/external testers
5. Submit for review

## Privacy & Security

### Data Storage
- All user data stored locally in localStorage
- API keys encrypted with AES-256 (client-side)
- No data sent to servers without explicit user action

### Network Requests
- Only to user-configured backend
- HTTPS recommended for production
- No third-party trackers

## Troubleshooting

### "Platform not found" error
```bash
# Re-add iOS platform
npx cap add ios
```

### Changes not reflecting
```bash
# Clean and rebuild
npm run ios:sync
rm -rf ios/App/App/public
npx cap copy ios
```

### Xcode build errors
- Ensure Xcode Command Line Tools installed
- Update CocoaPods: `sudo gem install cocoapods`
- Clean build folder: Cmd+Shift+K in Xcode

## Advanced

### Custom Plugins

Add Capacitor plugins:
```bash
npm install @capacitor/camera
npx cap sync
```

### Native Code

Edit Swift/Objective-C in Xcode:
- `ios/App/App/AppDelegate.swift`
- Add custom iOS functionality

### Environment Variables

For different environments:
```json
{
  "server": {
    "url": process.env.BACKEND_URL
  }
}
```

## Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [iOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [TestFlight Guide](https://developer.apple.com/testflight/)

# OAuth Screenshot Upload System

## 🎯 What This Does

Upload screenshots from your phone while creating an OAuth app → System automatically:
1. **Extracts credentials** using OCR (Tesseract)
2. **Stores them** in encrypted keyring
3. **Generates annotated tutorial GIF** with green boxes highlighting buttons
4. **Updates .env file** with credentials

## 📱 How to Use

### Step 1: Create OAuth App on Your Phone

**For GitHub:**
1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in form:
   - Application name: `Soulfra Platform`
   - Homepage URL: `http://localhost:5001`
   - Callback URL: `http://localhost:5001/api/auth/oauth/callback`
4. Click "Register application"
5. **Take screenshot showing Client ID**
6. Click "Generate a new client secret"
7. **Take screenshot showing Client Secret**

**Take 6 screenshots total:**
- Settings page
- Developer settings menu
- New OAuth App button
- Form filled out
- Client ID shown
- Client Secret shown

### Step 2: Upload Screenshots

1. **On your phone**, go to: `http://localhost:5001/oauth-upload.html`
2. Tap "Tap to select screenshots"
3. Select all 6 screenshots
4. Optionally change:
   - Provider (auto-detected from screenshots)
   - Application name
5. Tap "Upload & Process"
6. Wait 10-30 seconds while processing

### Step 3: View Results

The page will show:
- ✅ Detected provider (GitHub/Google/Microsoft)
- 🔑 Extracted Client ID (first 8 chars shown)
- 🔒 Client Secret (masked with `********************`)
- 🎬 Animated GIF tutorial
- 📥 Download link for GIF

Your credentials are now:
- Stored in keyring (`~/.calos/keyring.enc`)
- Written to `.env` file
- Ready to use for OAuth

## 🧠 How It Works

### OCR Credential Extraction

**GitHub Client IDs** (multiple formats detected):
```
Format 1: "Client ID: Iv1.abc123def456"
Format 2: Just "Iv1.abc123def456" anywhere in screenshot
Format 3: "I v 1 . a b c 1 2 3" (handles OCR spacing errors)
```

**GitHub Client Secrets**:
```
Format 1: "Client secret: abc123..."
Format 2: 40-character hex string anywhere
```

**Google Client IDs**:
```
Format: "123456789-abc.apps.googleusercontent.com"
```

**Google Client Secrets**:
```
Format: "GOCSPX-abc123..."
```

### Auto-Annotation

OCR detects:
- **Buttons**: Green pulsing boxes with "Click" labels
- **Form fields**: Blue dashed boxes with "Fill" labels
- **Credentials**: Yellow pulsing boxes with "Copy" labels

Each screenshot gets different annotations based on what OCR finds.

### GIF Generation

Uses FFmpeg to create high-quality GIF:
- 0.5 FPS (2 seconds per frame)
- 1400px width max
- Palette generation for better colors
- ~40-60KB file size

## 📂 Files Created

```
oauth-exports/
├── github-oauth-tutorial.gif          # Animated tutorial
├── github/
│   ├── annotated-step-1.png          # Settings page
│   ├── annotated-step-2.png          # Developer menu
│   ├── annotated-step-3.png          # New app button
│   ├── annotated-step-4.png          # Form filled
│   ├── annotated-step-5.png          # Client ID
│   └── annotated-step-6.png          # Client Secret
```

## 🔐 Security

- Credentials stored with **AES-256-GCM encryption**
- Keyring location: `~/.calos/keyring.enc`
- Encrypted with key from `KEYRING_ENCRYPTION_KEY` env var
- Falls back to ephemeral key if not set
- Uploaded screenshots deleted after processing

## 🛠️ Technical Stack

**Frontend:**
- Mobile-responsive HTML5
- Drag-and-drop file upload
- Progress bar with percentage
- Result preview

**Backend:**
- Multer (file upload handling)
- Tesseract OCR (text extraction)
- Sharp (image annotation)
- FFmpeg (GIF generation)
- Keyring (credential storage)

**OCR Pipeline:**
```
Screenshot (PNG/JPEG)
    ↓
Tesseract OCR
    ↓
HOCR (HTML with coordinates)
    ↓
Button/Form Detection
    ↓
Credential Extraction (regex)
    ↓
Auto-Annotation
    ↓
GIF Generation
```

## 🚀 API Endpoints

### POST `/api/oauth/upload-screenshots`

Upload screenshots for processing.

**Request (multipart/form-data):**
```javascript
{
  screenshots: [File, File, File...],  // PNG/JPEG, max 10MB each
  provider: "github",                   // Optional: auto-detected
  appName: "Soulfra Platform",          // Optional
  stepTitles: ["Step 1", "Step 2"...]  // Optional: JSON array
}
```

**Response:**
```json
{
  "success": true,
  "provider": "github",
  "credentials": {
    "clientId": "Iv1.abc123...",
    "clientSecret": "********************"
  },
  "gifPath": "/oauth-exports/github-oauth-tutorial.gif",
  "annotatedScreenshots": [
    {
      "stepNumber": 1,
      "title": "Navigate to GitHub Settings",
      "path": "/oauth-exports/github/annotated-step-1.png"
    }
  ]
}
```

### GET `/api/oauth/status/:provider`

Check if credentials exist for a provider.

**Response:**
```json
{
  "provider": "github",
  "hasCredentials": true,
  "clientId": "Iv1.abc1..."
}
```

### GET `/api/oauth/exports`

List all generated OAuth documentation.

**Response:**
```json
{
  "exports": [
    {
      "filename": "github-oauth-tutorial.gif",
      "provider": "github",
      "path": "/oauth-exports/github-oauth-tutorial.gif"
    }
  ]
}
```

## 🧪 Testing

**Test with demo screenshots:**
```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router
node scripts/test-full-pipeline.js
```

**Test OCR extraction:**
```bash
node scripts/test-ocr-extraction.js
```

**Test upload endpoint:**
```bash
# Start server (if not running)
npm start

# Open in browser
open http://localhost:5001/oauth-upload.html

# Or test via curl
curl -X POST http://localhost:5001/api/oauth/upload-screenshots \
  -F "screenshots=@screenshot1.png" \
  -F "screenshots=@screenshot2.png" \
  -F "provider=github"
```

## 🐛 Troubleshooting

**Issue: "No credentials found"**
- Make sure screenshots clearly show Client ID and Client Secret
- Try taking screenshots with better lighting
- Ensure text is readable (not blurry)

**Issue: "Processing failed"**
- Check server logs for OCR errors
- Verify Tesseract is installed: `which tesseract`
- Ensure FFmpeg is installed: `which ffmpeg`

**Issue: "Annotations not showing"**
- Verify annotations use `type:` not `annotation_type:`
- Check screenshot-annotator.js switch statement
- Look for "Unknown annotation type" warnings in logs

**Issue: "GIF looks the same in every frame"**
- Make sure you uploaded DIFFERENT screenshots
- Not the same screenshot 6 times
- Each screenshot should show a different step

## 📋 Example Workflow

1. **On phone**: Create GitHub OAuth app
2. **Take 6 screenshots** at each step
3. **Upload to** http://localhost:5001/oauth-upload.html
4. **Wait 15 seconds** for processing
5. **Download GIF** to share/document
6. **Credentials stored** - ready to use in app

Credentials automatically written to:
- `.env` → `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- Keyring → `oauth_github_soulfra_platform_client_id`

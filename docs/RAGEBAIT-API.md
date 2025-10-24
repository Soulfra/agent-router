# Dev Ragebait Generator API

Create viral dev memes for Twitter with GIF/MP4 output, domain branding, and 11 built-in templates.

## Quick Start

```bash
# Start the server
npm start

# Open in browser
open http://localhost:5001/ragebait-generator.html

# Or use the launch script
npm run ragebait
```

## API Overview

The Ragebait API provides three main endpoints for creating and customizing dev memes:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/mobile/ragebait/templates` | GET | List all available templates |
| `/api/mobile/ragebait/domains` | GET | Get domain branding options |
| `/api/mobile/ragebait/generate/:templateId` | POST | Generate GIF and MP4 |

## Endpoints

### GET /api/mobile/ragebait/templates

List all available ragebait templates with metadata.

**Response:**
```json
{
  "success": true,
  "templates": [
    {
      "id": "npm-install",
      "name": "npm install",
      "description": "The classic npm install experience",
      "category": "packages",
      "hashtags": ["#npm", "#JavaScript", "#DevLife"],
      "frames": 3
    },
    {
      "id": "merge-conflict",
      "name": "Merge Conflict",
      "description": "Git merge conflicts",
      "category": "git",
      "hashtags": ["#git", "#MergeConflict"],
      "frames": 3
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:5001/api/mobile/ragebait/templates
```

```javascript
const response = await fetch('/api/mobile/ragebait/templates');
const { templates } = await response.json();
console.log(`${templates.length} templates available`);
```

---

### GET /api/mobile/ragebait/domains

Get available domain branding options for customizing ragebait colors and watermarks.

**Response:**
```json
{
  "success": true,
  "domains": [
    {
      "id": "calos",
      "name": "CALOS",
      "primaryColor": "#667eea",
      "secondaryColor": "#764ba2",
      "watermark": "CALOS",
      "watermarkPosition": "bottom-right"
    },
    {
      "id": "tech",
      "name": "Tech Brand",
      "primaryColor": "#00b894",
      "secondaryColor": "#00cec9",
      "watermark": "Tech",
      "watermarkPosition": "bottom-right"
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:5001/api/mobile/ragebait/domains
```

---

### POST /api/mobile/ragebait/generate/:templateId

Generate a ragebait GIF and MP4 from a template with optional domain branding.

**Parameters:**
- `:templateId` (path) - Template ID (e.g., `npm-install`, `merge-conflict`)

**Request Body (optional):**
```json
{
  "domainId": "calos"
}
```

**Response:**
```json
{
  "success": true,
  "template": {
    "id": "npm-install",
    "name": "npm install",
    "caption": "POV: You ran npm install",
    "hashtags": ["#npm", "#JavaScript", "#DevLife"]
  },
  "gif": {
    "dataUrl": "data:image/gif;base64,...",
    "path": "/path/to/npm-install.gif",
    "sizeMB": 1.2,
    "frames": 3
  },
  "mp4": {
    "dataUrl": "data:video/mp4;base64,...",
    "path": "/path/to/npm-install.mp4",
    "sizeMB": 0.8,
    "frames": 3
  },
  "shareText": "POV: You ran npm install\n\n#npm #JavaScript #DevLife\n\nGenerated with CALOS 🚀"
}
```

**Examples:**

```bash
# Generate without branding
curl -X POST http://localhost:5001/api/mobile/ragebait/generate/npm-install

# Generate with CALOS branding
curl -X POST http://localhost:5001/api/mobile/ragebait/generate/npm-install \
  -H "Content-Type: application/json" \
  -d '{"domainId":"calos"}'
```

```javascript
// Generate with domain branding
const response = await fetch('/api/mobile/ragebait/generate/npm-install', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ domainId: 'calos' })
});

const result = await response.json();
console.log(`Generated: GIF ${result.gif.sizeMB}MB, MP4 ${result.mp4.sizeMB}MB`);

// Display in browser
document.getElementById('preview').src = result.gif.dataUrl;
```

---

## Available Templates

### Original Templates (5)

1. **npm-install** - The classic npm install experience
   - Hashtags: `#npm #JavaScript #DevLife`
   - Category: packages

2. **merge-conflict** - Git merge conflicts
   - Hashtags: `#git #MergeConflict`
   - Category: git

3. **works-on-my-machine** - Classic developer excuse
   - Hashtags: `#DevLife #WorksOnMyMachine`
   - Category: debugging

4. **production-hotfix** - Friday afternoon deployments
   - Hashtags: `#DevOps #Production #Friday`
   - Category: deployment

5. **code-review** - The pain of code reviews
   - Hashtags: `#CodeReview #PR #GitHub`
   - Category: collaboration

### Model Personality Templates (6)

6. **codellama-nitpick** - Pedantic code review
   - Hashtags: `#CodeReview #SOLID #BestPractices`
   - Category: model-personality
   - Based on: CodeLlama AI personality

7. **qwen-ship-it** - Speed Demon Developer says YAGNI
   - Hashtags: `#ShipIt #YAGNI #MoveFast`
   - Category: model-personality
   - Based on: Qwen AI personality

8. **phi-hack** - Rebellious Hacker template
   - Hashtags: `#Hacker #Security #PHI`
   - Category: model-personality
   - Based on: Phi AI personality

9. **llama-optimist** - Big Picture Dreams
   - Hashtags: `#AI #Innovation #BigIdeas`
   - Category: model-personality
   - Based on: Llama AI personality

10. **mistral-tradeoffs** - Balance Trade-offs
    - Hashtags: `#Engineering #Tradeoffs #Architecture`
    - Category: model-personality
    - Based on: Mistral AI personality

11. **llama32-wisdom** - Ancient Wisdom
    - Hashtags: `#Wisdom #Experience #Llama`
    - Category: model-personality
    - Based on: Llama 3.2 AI personality

---

## Domain Branding

Customize ragebait with your brand colors and watermark:

| Domain ID | Name | Primary Color | Watermark |
|-----------|------|---------------|-----------|
| `calos` | CALOS | #667eea (purple) | CALOS |
| `tech` | Tech Brand | #00b894 (green) | Tech |
| `dev` | Dev Community | #6c5ce7 (indigo) | DevCom |
| `startup` | Startup | #e17055 (orange) | Startup |
| `corporate` | Enterprise | #2d3436 (dark gray) | Corp |
| `indie` | Indie Hacker | #ff7675 (red/pink) | Indie |
| `none` | No Branding | - | - |

**How Branding Works:**
- Frame backgrounds use the primary color
- Watermark appears in bottom-right corner at 50% opacity
- Watermark uses the frame's text color for contrast

---

## Integration Examples

### Twitter Bot

```javascript
const generateAndTweet = async (templateId, domainId = null) => {
  // Generate ragebait
  const response = await fetch(`http://localhost:5001/api/mobile/ragebait/generate/${templateId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domainId })
  });

  const result = await response.json();

  // Download GIF (result.gif.dataUrl is base64)
  const gifBuffer = Buffer.from(result.gif.dataUrl.split(',')[1], 'base64');

  // Tweet with Twitter API
  const mediaId = await twitterClient.uploadMedia(gifBuffer);
  await twitterClient.tweet({
    text: result.shareText,
    media_ids: [mediaId]
  });

  console.log(`Tweeted: ${result.template.name}`);
};

// Tweet daily
setInterval(() => {
  const templates = ['npm-install', 'merge-conflict', 'works-on-my-machine'];
  const random = templates[Math.floor(Math.random() * templates.length)];
  generateAndTweet(random, 'calos');
}, 24 * 60 * 60 * 1000);
```

### Forum Integration

```javascript
// Share ragebait to CALOS forum
const shareToForum = async (templateId, domainId = 'calos') => {
  // Generate ragebait
  const ragebaitResponse = await fetch(`/api/mobile/ragebait/generate/${templateId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domainId })
  });

  const result = await ragebaitResponse.json();

  // Create forum thread
  const forumResponse = await fetch('/api/forum/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: result.template.caption,
      body: `${result.shareText}\n\n![Ragebait](${result.gif.dataUrl})`,
      tags: result.template.hashtags.map(tag => tag.replace('#', '')),
      flair: 'ragebait'
    })
  });

  const thread = await forumResponse.json();
  console.log(`Posted to forum: ${thread.thread_id}`);
};
```

### Discord Bot

```javascript
const { Client } = require('discord.js');
const client = new Client();

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!ragebait')) return;

  const templateId = message.content.split(' ')[1] || 'npm-install';

  // Generate ragebait
  const response = await fetch(`http://localhost:5001/api/mobile/ragebait/generate/${templateId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domainId: 'calos' })
  });

  const result = await response.json();

  // Convert base64 to buffer
  const gifBuffer = Buffer.from(result.gif.dataUrl.split(',')[1], 'base64');

  // Send to Discord
  await message.channel.send({
    content: result.shareText,
    files: [{ attachment: gifBuffer, name: `${templateId}.gif` }]
  });
});

client.login(process.env.DISCORD_TOKEN);
```

---

## Technical Details

### Requirements

- **FFmpeg**: Required for GIF and MP4 generation
  ```bash
  # macOS
  brew install ffmpeg

  # Ubuntu/Debian
  apt-get install ffmpeg

  # Windows
  choco install ffmpeg
  ```

- **Sharp**: Image processing (installed via npm)
- **Node.js 16+**: ES6 async/await support

### Output Specifications

**GIF:**
- Resolution: 1200x676px (16:9 aspect ratio)
- Frame duration: 1 second per frame (3 seconds total)
- Format: Animated GIF
- Typical size: 1-3 MB

**MP4:**
- Resolution: 1200x676px (16:9 aspect ratio, even dimensions for H.264)
- Frame rate: 1 fps
- Codec: H.264
- Format: MP4
- Typical size: 0.5-1.5 MB

### File Storage

Generated files are stored in:
```
temp/ragebait/
  ├── npm-install/
  │   ├── frame-0.png
  │   ├── frame-1.png
  │   ├── frame-2.png
  ├── npm-install.gif
  └── npm-install.mp4
```

**Cleanup:** Temp files persist until server restart or manual deletion. Implement cleanup for production:

```javascript
const fs = require('fs').promises;
const path = require('path');

// Clean up files older than 1 hour
const cleanupOldRagebait = async () => {
  const tempDir = path.join(__dirname, 'temp/ragebait');
  const oneHourAgo = Date.now() - (60 * 60 * 1000);

  const files = await fs.readdir(tempDir, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(tempDir, file.name);
    const stats = await fs.stat(filePath);

    if (stats.mtimeMs < oneHourAgo) {
      await fs.rm(filePath, { recursive: true, force: true });
      console.log(`Cleaned up: ${file.name}`);
    }
  }
};

// Run cleanup every hour
setInterval(cleanupOldRagebait, 60 * 60 * 1000);
```

---

## Error Handling

**Common Errors:**

```javascript
// Template not found
{
  "error": "Template \"invalid-id\" not found",
  "status": 404
}

// FFmpeg not installed
{
  "error": "Failed to generate ragebait",
  "message": "FFmpeg not found. Install with: brew install ffmpeg",
  "status": 500
}

// Domain not found
{
  "error": "Unknown domain: invalid-domain",
  "status": 400
}
```

**Error Handling Example:**

```javascript
try {
  const response = await fetch('/api/mobile/ragebait/generate/npm-install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domainId: 'calos' })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error);
  }

  const result = await response.json();
  return result;

} catch (error) {
  console.error('Ragebait generation failed:', error.message);

  if (error.message.includes('FFmpeg')) {
    alert('Please install FFmpeg: brew install ffmpeg');
  } else if (error.message.includes('not found')) {
    alert('Invalid template or domain ID');
  } else {
    alert('Generation failed. Try again.');
  }
}
```

---

## Rate Limiting

Currently **no rate limiting** is enforced. For production, implement rate limiting:

```javascript
const rateLimit = require('express-rate-limit');

const ragebaitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many ragebait requests. Try again later.' }
});

app.use('/api/mobile/ragebait', ragebaitLimiter);
```

---

## Performance

**Generation Time:**
- Frame rendering: ~200ms per frame (600ms total)
- GIF creation: ~800ms (FFmpeg)
- MP4 creation: ~500ms (FFmpeg)
- **Total:** ~2-3 seconds per ragebait

**Optimization Tips:**
1. Cache base64 data URLs in memory for repeat requests
2. Use worker threads for parallel FFmpeg processing
3. Pre-generate popular templates on server start
4. Serve GIF/MP4 files directly instead of base64 for large files

---

## Web UI

Interactive web interface available at:
```
http://localhost:5001/ragebait-generator.html
```

**Features:**
- Template selection with preview
- Domain branding dropdown
- Live GIF/MP4 preview
- Format toggle (GIF ↔ MP4)
- Copy share text
- Download GIF/MP4
- Share to forum (requires forum integration)
- Theme support (iOS-inspired)

---

## API Gateway Pattern

For external integrations, wrap the API in a gateway:

```javascript
class RagebaitClient {
  constructor(baseURL = 'http://localhost:5001') {
    this.baseURL = baseURL;
  }

  async getTemplates() {
    const response = await fetch(`${this.baseURL}/api/mobile/ragebait/templates`);
    const data = await response.json();
    return data.templates;
  }

  async getDomains() {
    const response = await fetch(`${this.baseURL}/api/mobile/ragebait/domains`);
    const data = await response.json();
    return data.domains;
  }

  async generate(templateId, domainId = null) {
    const response = await fetch(`${this.baseURL}/api/mobile/ragebait/generate/${templateId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domainId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error);
    }

    return await response.json();
  }

  async downloadGIF(templateId, domainId = null, outputPath) {
    const result = await this.generate(templateId, domainId);
    const buffer = Buffer.from(result.gif.dataUrl.split(',')[1], 'base64');
    await fs.writeFile(outputPath, buffer);
    return outputPath;
  }
}

// Usage
const client = new RagebaitClient();
const templates = await client.getTemplates();
await client.downloadGIF('npm-install', 'calos', './ragebait.gif');
```

---

## Future Enhancements

Potential improvements for future versions:

1. **Custom Templates:** API to create/upload custom templates
2. **Text Customization:** Allow users to edit frame text
3. **Animation Speed:** Configurable frame duration
4. **Webhooks:** Notify external services when generation completes
5. **Cloud Storage:** Auto-upload to S3/CloudFlare R2
6. **Batch Generation:** Generate multiple templates at once
7. **Analytics:** Track template popularity and usage

---

## Resources

- **Web UI:** `http://localhost:5001/ragebait-generator.html`
- **Tools Page:** `http://localhost:5001/tools.html`
- **Source Code:** `lib/dev-ragebait-generator.js`
- **Routes:** `routes/mobile-routes.js`
- **Templates:** See `_loadTemplates()` in `lib/dev-ragebait-generator.js`

---

**Built with ❤️ by CALOS**

*Generate viral dev memes in seconds. No Photoshop required.*

# User Settings Persistence & AI Context System

> **Your settings follow you everywhere - remembered by the AI**

When users log in, their preferences (especially high contrast and accessibility settings) are automatically remembered and passed to AI/computer interactions. This system transforms user preferences into enriched AI context.

---

## What Is This?

A **settings persistence and context enrichment system** where user preferences automatically enhance AI interactions:

✅ **Auto-loaded on login** - Preferences loaded when user authenticates
✅ **Accessibility-aware AI** - High contrast, screen reader, font size preferences enrich prompts
✅ **Theme & language persistence** - Dark/light theme, language, timezone remembered
✅ **Context transformer** - Bridges authentication and AI prompt enrichment
✅ **Cached for performance** - 5-minute cache to avoid repeated DB queries
✅ **API for management** - Full REST API to read/update preferences

**Example:** User enables high contrast mode → logs in → AI automatically knows to avoid color-specific language and provide descriptive alternatives.

---

## Architecture

### Database Schema (`migrations/060_accessibility_preferences.sql`)

**Enhanced `user_preferences` Table:**

New columns added:
- `high_contrast BOOLEAN` - High contrast mode for better visibility
- `font_size VARCHAR(20)` - small, medium, large, xlarge
- `reduced_motion BOOLEAN` - Reduce animations/transitions
- `screen_reader_mode BOOLEAN` - Optimize for screen readers
- `color_blind_mode VARCHAR(20)` - none, deuteranopia, protanopia, tritanopia

**Database Functions:**

1. **`get_user_accessibility_context(userId)`** - Returns formatted accessibility context string for AI enrichment

```sql
SELECT get_user_accessibility_context('user-uuid');
-- Returns: "User Accessibility Settings: High contrast mode enabled. Screen reader mode (provide descriptive text for visual elements). Theme: dark."
```

2. **`update_user_accessibility_preferences(...)`** - Update accessibility preferences atomically

```sql
SELECT update_user_accessibility_preferences(
  'user-uuid',
  true,        -- high_contrast
  'large',     -- font_size
  false,       -- reduced_motion
  true,        -- screen_reader_mode
  'none'       -- color_blind_mode
);
```

**View for AI Context:**

```sql
CREATE VIEW user_context_profiles AS
SELECT
  u.user_id,
  u.username,
  up.theme,
  up.high_contrast,
  up.font_size,
  up.reduced_motion,
  up.screen_reader_mode,
  up.color_blind_mode,
  get_user_accessibility_context(u.user_id) as accessibility_context
FROM users u
LEFT JOIN user_preferences up ON up.user_id = u.user_id;
```

### Core Library (`lib/user-context-transformer.js`)

**The "transformer" the user asked about** - bridges authentication and AI context.

**Key Methods:**

1. **`loadUserContext(userId)`** - Load user preferences from database
   - Uses `user_context_profiles` view
   - Returns accessibility settings, theme, language, timezone
   - Cached for 5 minutes

2. **`enrichPrompt(userId, prompt, systemPrompt)`** - Add user context to AI prompts
   - Appends accessibility context to system prompt
   - Adds language and timezone preferences
   - Returns enriched prompt object

3. **`formatResponseForUser(userId, response)`** - Post-process AI responses
   - Screen reader mode: Adds semantic markers `[Heading Level 1]`, `[Code Block]`
   - High contrast: Simplifies color language ("red" → "red (important/error)")
   - Large font: Emphasizes structure with extra newlines

4. **`updateAccessibilityPreferences(userId, preferences)`** - Update settings
   - Calls database function
   - Invalidates cache

**Cache Management:**
- 5-minute TTL by default
- Automatic cleanup every minute
- Manual invalidation on preference updates

### Middleware Integration (`middleware/sso-auth.js`)

**Enhanced `requireAuth` middleware:**

```javascript
// After validating JWT token and session:
req.user = {
  userId: session.user_id,
  sessionId: session.session_id,
  email: session.email,
  isTrusted: session.is_trusted
};

// NEW: Load user context if transformer available
if (contextTransformer) {
  const userContext = await contextTransformer.loadUserContext(session.user_id);
  req.user.context = userContext;
}
```

Now `req.user.context` contains:
```javascript
{
  userId: "uuid",
  username: "alice",
  theme: "dark",
  language: "en",
  timezone: "America/New_York",
  accessibility: {
    highContrast: true,
    fontSize: "large",
    reducedMotion: false,
    screenReaderMode: true,
    colorBlindMode: "none"
  },
  accessibilityContext: "User Accessibility Settings: High contrast mode enabled. Font size: large. Screen reader mode (provide descriptive text for visual elements). Theme: dark."
}
```

### LLM Router Integration (`routes/llm-routes.js`)

**Enhanced `/api/llm/complete` endpoint:**

```javascript
// Step 1: Check if SSO authenticated
if (enrichWithUserContext && req.user && req.user.userId && this.contextTransformer) {
  // Step 2: Enrich prompt with user context
  const enriched = await this.contextTransformer.enrichPrompt(
    req.user.userId,
    prompt,
    systemPrompt
  );

  prompt = enriched.prompt;
  systemPrompt = enriched.systemPrompt; // Now includes accessibility context
}

// Step 3: Send to LLM
const response = await this.llmRouter.complete({
  prompt: prompt,
  systemPrompt: systemPrompt,
  ...options
});

// Step 4: Format response based on user preferences
let formattedText = response.text;
if (enrichWithUserContext && req.user && req.user.userId && this.contextTransformer) {
  formattedText = await this.contextTransformer.formatResponseForUser(
    req.user.userId,
    response.text
  );
}
```

**Middleware Chain:**
```
optionalAuth → _authenticate → _complete
     ↓              ↓              ↓
Loads SSO      Bot detection   Enriches prompt
user context   validation      Formats response
```

---

## API Endpoints

### Preferences Management

#### Get Current User Preferences

```bash
GET /api/preferences
Authorization: Bearer <jwt-token>

# Response:
{
  "success": true,
  "preferences": {
    "userId": "uuid",
    "username": "alice",
    "theme": "dark",
    "language": "en",
    "timezone": "America/New_York",
    "accessibility": {
      "highContrast": true,
      "fontSize": "large",
      "reducedMotion": false,
      "screenReaderMode": true,
      "colorBlindMode": "none"
    },
    "notifications": {
      "email": true,
      "skills": true,
      "xp": true
    },
    "custom": {},
    "accessibilityContext": "User Accessibility Settings: ..."
  }
}
```

#### Update General Preferences

```bash
PUT /api/preferences
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "theme": "light",
  "language": "es",
  "timezone": "Europe/Madrid",
  "emailNotifications": false
}

# Response:
{
  "success": true,
  "message": "Preferences updated successfully"
}
```

#### Update Accessibility Preferences

```bash
PUT /api/preferences/accessibility
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "highContrast": true,
  "fontSize": "xlarge",
  "reducedMotion": true,
  "screenReaderMode": true,
  "colorBlindMode": "deuteranopia"
}

# Response:
{
  "success": true,
  "message": "Accessibility preferences updated successfully",
  "accessibility": {
    "highContrast": true,
    "fontSize": "xlarge",
    "reducedMotion": true,
    "screenReaderMode": true,
    "colorBlindMode": "deuteranopia"
  },
  "accessibilityContext": "User Accessibility Settings: High contrast mode enabled. Font size: xlarge. Reduced motion enabled (avoid animated examples). Screen reader mode (provide descriptive text for visual elements). Color blind mode: deuteranopia. Theme: dark."
}
```

#### Get Full Context Profile

```bash
GET /api/preferences/profile
Authorization: Bearer <jwt-token>

# Response: (includes room colors, model preferences, active contexts)
{
  "success": true,
  "profile": {
    "userId": "uuid",
    "username": "alice",
    "accessibility": { ... },
    "roomColors": { ... },
    "modelPreferences": { ... },
    "activeContexts": [ ... ],
    "shortcuts": [ ... ]
  }
}
```

#### Update Custom Preferences

```bash
PUT /api/preferences/custom
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "key": "preferredEditor",
  "value": "vim"
}

# Response:
{
  "success": true,
  "message": "Custom preference updated successfully",
  "key": "preferredEditor",
  "value": "vim"
}
```

### AI Context Enrichment

#### Complete with User Context

```bash
POST /api/llm/complete
Authorization: Bearer <jwt-token>  # SSO token, not bot detector token
Content-Type: application/json

{
  "prompt": "Explain how to create a color-coded dashboard",
  "systemPrompt": "You are a helpful assistant",
  "enrichWithUserContext": true  # Default: true
}

# What happens:
# 1. optionalAuth middleware loads user context from DB
# 2. Context transformer enriches system prompt:
#    "You are a helpful assistant\n\nUser Accessibility Settings: High contrast mode enabled. Color blind mode: deuteranopia."
# 3. LLM response avoids red/green color references
# 4. Response formatted with semantic markers for screen reader
```

---

## User Journey Example

### Day 1: User Sets Preferences

**User action:** Enable high contrast and screen reader modes

```javascript
// Frontend call
await fetch('/api/preferences/accessibility', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    highContrast: true,
    fontSize: 'large',
    screenReaderMode: true
  })
});
```

**What happens:**
1. Request authenticated via SSO middleware
2. Preferences routes call `userContextTransformer.updateAccessibilityPreferences()`
3. Database function updates `user_preferences` table
4. Cache invalidated for user
5. Response returns updated accessibility context string

### Day 2: User Logs In

**User action:** Login with SSO

```javascript
// User logs in via /api/auth/login
// JWT token issued
```

**What happens automatically:**
1. `requireAuth` middleware validates JWT token
2. Loads user session from database
3. **NEW:** `contextTransformer.loadUserContext()` called
4. User context attached to `req.user.context`
5. Cached for 5 minutes

**Result:** User preferences now available on all authenticated requests

### Day 2: User Asks AI Question

**User action:** Ask AI to explain code with colors

```javascript
await fetch('/api/llm/complete', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,  // SSO token
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: "Explain this CSS: .error { color: red; }",
    enrichWithUserContext: true
  })
});
```

**What happens:**
1. `optionalAuth` middleware loads `req.user` (already cached)
2. Bot detector auth skipped (SSO user)
3. `_complete` handler detects `req.user.userId` exists
4. **Context transformer enriches prompt:**
   ```
   Original system prompt: "You are a helpful assistant"

   Enriched system prompt:
   "You are a helpful assistant

   User Accessibility Settings: High contrast mode enabled. Font size: large. Screen reader mode (provide descriptive text for visual elements). Theme: dark."
   ```
5. LLM generates response considering accessibility needs
6. **Context transformer formats response:**
   ```
   Original: "The .error class applies a red color to text."

   Formatted: "[CSS Class] The .error class applies a red (important/error) color to text, making error messages stand out visually."
   ```

**AI Response:**
- Avoids color-only descriptions
- Adds semantic markers for screen readers
- Uses descriptive language instead of visual cues

---

## Integration Points

### 1. Authentication Flow

```
User logs in → JWT issued → requireAuth middleware
                                   ↓
                         contextTransformer.loadUserContext()
                                   ↓
                         req.user.context = { accessibility, theme, ... }
```

### 2. AI Request Flow

```
User sends prompt → optionalAuth → _authenticate → _complete
                         ↓              ↓             ↓
                    Loads SSO user  Validates   Enriches prompt
                    context          token       Formats response
```

### 3. Preference Update Flow

```
User updates → PUT /api/preferences/accessibility
   settings          ↓
              update_user_accessibility_preferences()
                     ↓
              invalidateCache(userId)
                     ↓
              Next request loads fresh context
```

---

## Code Examples

### Frontend: Enable High Contrast

```javascript
async function enableHighContrast() {
  const response = await fetch('/api/preferences/accessibility', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${getJWTToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      highContrast: true
    })
  });

  const result = await response.json();
  console.log('Accessibility context:', result.accessibilityContext);
  // "User Accessibility Settings: High contrast mode enabled. Theme: dark."
}
```

### Backend: Manual Context Enrichment

```javascript
const UserContextTransformer = require('./lib/user-context-transformer');
const transformer = new UserContextTransformer({ db });

// Enrich prompt manually
const enriched = await transformer.enrichPrompt(
  userId,
  "Explain how to use color coding",
  "You are a helpful assistant"
);

console.log(enriched.systemPrompt);
// "You are a helpful assistant
//
// User Accessibility Settings: High contrast mode enabled. Color blind mode: deuteranopia."

// Send to LLM with enriched prompt
const response = await llmRouter.complete({
  prompt: enriched.prompt,
  systemPrompt: enriched.systemPrompt
});

// Format response for user
const formatted = await transformer.formatResponseForUser(userId, response.text);
```

### Backend: Check User Preferences in Route

```javascript
router.post('/api/myroute', requireAuth, async (req, res) => {
  // User context automatically loaded by requireAuth
  const { accessibility, theme } = req.user.context;

  if (accessibility.highContrast) {
    // Adjust response for high contrast
    return res.json({
      message: "High contrast mode active",
      colors: {
        primary: "#ffffff",
        secondary: "#000000"
      }
    });
  }

  // Standard response
  res.json({ ... });
});
```

---

## Accessibility Response Formatting

### Screen Reader Mode

**Input:**
```markdown
# Getting Started

Follow these steps:
1. Run `npm install`
2. Start the server
```

**Output (screen reader mode):**
```markdown
[Heading Level 1] Getting Started

Follow these steps:
[Numbered List Item] 1. Run `npm install`
[Numbered List Item] 2. Start the server
```

### High Contrast Mode

**Input:**
```
The green checkmark indicates success, while the red X shows errors.
```

**Output (high contrast):**
```
The green (success/positive) checkmark indicates success, while the red (important/error) X shows errors.
```

### Large Font Mode

**Input:**
```markdown
## Installation

Clone the repo
```

**Output (large font):**
```markdown
## Installation


Clone the repo
```

---

## Performance Considerations

### Caching Strategy

- **5-minute TTL** - User context cached for 5 minutes
- **Automatic cleanup** - Expired entries removed every minute
- **Manual invalidation** - Cache cleared on preference updates
- **Per-user cache** - Each user's context cached separately

### Database Optimization

- **View-based queries** - `user_context_profiles` view pre-joins data
- **Indexed lookups** - `idx_user_preferences_accessibility` index
- **Single query** - All preferences loaded in one DB call
- **JSONB custom prefs** - Extensible without schema changes

### Request Impact

- **First request:** ~50ms (DB query + cache write)
- **Cached requests:** ~1ms (memory lookup)
- **Preference updates:** Cache invalidated, next request loads fresh

---

## Configuration

### Environment Variables

```bash
# JWT tokens for SSO
JWT_SECRET="your-jwt-secret"

# Database connection (used by transformer)
DATABASE_URL="postgresql://..."

# Cache TTL (optional, default: 5 minutes)
USER_CONTEXT_CACHE_TTL=300000  # milliseconds
```

### Initialization in router.js

```javascript
// Initialize user context transformer
const UserContextTransformer = require('./lib/user-context-transformer');
const userContextTransformer = new UserContextTransformer({
  db,
  cacheTTL: 5 * 60 * 1000  // 5 minutes
});

// Wire preferences routes
const initPreferencesRoutes = require('./routes/preferences-routes');
const preferencesRoutes = initPreferencesRoutes(db, userContextTransformer);
app.use('/api/preferences', preferencesRoutes);
```

---

## Summary

The User Settings Persistence & AI Context System creates **accessibility-aware AI interactions** where user preferences automatically enhance every AI request:

✅ **Auto-loaded on login** - Preferences attached to `req.user.context`
✅ **AI context enrichment** - System prompts include accessibility needs
✅ **Response formatting** - AI outputs adapted for screen readers, high contrast, etc.
✅ **Full API** - REST endpoints for preference management
✅ **High performance** - 5-minute cache, indexed DB queries
✅ **Extensible** - JSONB field for custom preferences

**The result:** Users set accessibility preferences once → They persist across sessions → AI automatically knows to adapt responses → Better UX for all users, especially those with accessibility needs.

Perfect for:
- Users with visual impairments (high contrast, screen reader)
- Users with color blindness (deuteranopia, protanopia, tritanopia)
- Users preferring large text
- Users with motion sensitivity
- Any user wanting personalized AI interactions

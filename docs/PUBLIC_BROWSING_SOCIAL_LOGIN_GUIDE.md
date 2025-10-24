# Public Browsing + Social Login Guide

> How to let people freely browse like Google, then save/pin like Pinterest with social login

## Overview

This guide shows you how to build domain-specific sites (hollowtown.com, howtocookathome.com, etc.) that:

- **Public browsing**: Anyone can search and view content (no login required)
- **Optional login**: Social login (Google, Apple) for premium features
- **Premium features**: Save recipes, pin items, create collections (Pinterest-style)
- **Shared identity**: One CALOS account works across all domains

**Model**: Google (public search) + Pinterest (save/pin) + RuneScape (one account, multiple domains)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Public Access Layer                  │
│  • Browse recipes, Halloween content, family tips       │
│  • Search everything (like Google)                      │
│  • View images, videos, articles                        │
│  • NO LOGIN REQUIRED                                    │
└─────────────────────────────────────────────────────────┘
                           │
                           │ Click "Save" or "Pin"
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Social Login Gateway (Optional)            │
│  • "Sign in with Google" (already implemented)          │
│  • "Sign in with Apple" (new)                           │
│  • "Sign in with GitHub" (already implemented)          │
│  • Auto-detect provider from email                      │
└─────────────────────────────────────────────────────────┘
                           │
                           │ After login
                           ▼
┌─────────────────────────────────────────────────────────┐
│                Premium Features (Logged In)             │
│  • Save recipes to collections                          │
│  • Pin items to boards (Pinterest-style)                │
│  • Create meal plans                                    │
│  • Generate shopping lists                              │
│  • Family sharing                                       │
│  • Cross-device sync (laptop, iPhone, voice)            │
└─────────────────────────────────────────────────────────┘
```

---

## Public Browsing Pattern

### Guest Sessions

Anyone can browse without logging in. Create lightweight guest sessions for analytics/preferences:

```javascript
// middleware/optional-auth.js

/**
 * Middleware that allows guest access but recognizes logged-in users
 */
export function optionalAuth(req, res, next) {
  // Try to get JWT from headers
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    try {
      // Verify JWT and attach user to request
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      req.isGuest = false;
    } catch (err) {
      // Invalid token, treat as guest
      req.isGuest = true;
    }
  } else {
    // No token, create guest session
    req.isGuest = true;
    req.guestId = req.cookies.guest_id || generateGuestId();

    // Set cookie for guest tracking (anonymous analytics)
    res.cookie('guest_id', req.guestId, {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true
    });
  }

  next();
}

/**
 * Feature gate: Allow if logged in, else return upgrade prompt
 */
export function requireAuthForFeature(featureName) {
  return (req, res, next) => {
    if (req.isGuest) {
      return res.status(401).json({
        success: false,
        error: 'LOGIN_REQUIRED',
        message: `Sign in to ${featureName}`,
        feature: featureName,
        providers: ['google', 'apple', 'github']
      });
    }
    next();
  };
}

function generateGuestId() {
  return `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

### Public Routes

All content routes allow guest access:

```javascript
// routes/recipes-routes.js

import { optionalAuth, requireAuthForFeature } from '../middleware/optional-auth.js';

// PUBLIC: Anyone can browse recipes
router.get('/api/recipes', optionalAuth, async (req, res) => {
  const recipes = await db.query(
    'SELECT * FROM recipes WHERE published = true ORDER BY created_at DESC LIMIT 50'
  );

  res.json({
    success: true,
    recipes,
    isGuest: req.isGuest,
    message: req.isGuest ? 'Sign in to save recipes' : null
  });
});

// PUBLIC: Anyone can view recipe details
router.get('/api/recipes/:id', optionalAuth, async (req, res) => {
  const recipe = await db.query(
    'SELECT * FROM recipes WHERE id = ? AND published = true',
    [req.params.id]
  );

  // If logged in, include saved status
  let savedToCollections = [];
  if (!req.isGuest) {
    savedToCollections = await db.query(
      'SELECT collection_id FROM saved_recipes WHERE user_id = ? AND recipe_id = ?',
      [req.user.userId, req.params.id]
    );
  }

  res.json({
    success: true,
    recipe: recipe[0],
    savedToCollections,
    isGuest: req.isGuest
  });
});

// PREMIUM: Requires login to save
router.post('/api/recipes/:id/save',
  optionalAuth,
  requireAuthForFeature('save recipes'),
  async (req, res) => {
    const { collectionId } = req.body;

    await db.query(
      'INSERT INTO saved_recipes (user_id, recipe_id, collection_id) VALUES (?, ?, ?)',
      [req.user.userId, req.params.id, collectionId]
    );

    res.json({
      success: true,
      message: 'Recipe saved to collection'
    });
  }
);
```

---

## Social Login Integration

### Google Sign-In (Already Implemented)

The system already has Google OAuth configured in `lib/auth/providers/google.js`.

**Setup**:

1. **Get credentials** from [Google Cloud Console](https://console.cloud.google.com/):
   - Create OAuth 2.0 Client ID
   - Add authorized redirect URIs:
     - `http://localhost:5001/api/auth/oauth/google/callback`
     - `https://hollowtown.com/api/auth/oauth/google/callback`
     - `https://howtocookathome.com/api/auth/oauth/google/callback`

2. **Set environment variables**:
```bash
# .env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

3. **Frontend integration**:
```html
<!-- Sign in button -->
<button onclick="signInWithGoogle()">
  <img src="/icons/google.svg" alt="Google" />
  Continue with Google
</button>

<script>
async function signInWithGoogle() {
  // Redirect to Google OAuth
  window.location.href = '/api/auth/oauth/google';
}
</script>
```

**Flow**:
```
User clicks "Continue with Google"
  ↓
Redirect to /api/auth/oauth/google
  ↓
Google login page
  ↓
Google redirects to /api/auth/oauth/google/callback
  ↓
Server creates/links CALOS account
  ↓
Returns JWT token
  ↓
Frontend stores token, user is logged in
```

### Apple Sign-In (New Implementation)

Apple requires additional setup but provides seamless iOS integration.

**Step 1: Register with Apple**

1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. Create a **Services ID** (not App ID)
3. Enable "Sign in with Apple"
4. Add domains and redirect URIs:
   - `hollowtown.com`
   - `howtocookathome.com`
   - Redirect URI: `https://hollowtown.com/api/auth/oauth/apple/callback`

5. Create a **Private Key** for Sign in with Apple
6. Note down:
   - Team ID
   - Services ID (Client ID)
   - Key ID
   - Private Key file (.p8)

**Step 2: Create Apple OAuth Provider**

```javascript
// lib/auth/providers/apple.js

import jwt from 'jsonwebtoken';
import fs from 'fs';
import { OAuth2Client } from 'google-auth-library';

/**
 * Apple Sign In OAuth Provider
 *
 * Apple uses JWT-based authentication instead of client secret
 */
export class AppleOAuthProvider {
  constructor() {
    this.teamId = process.env.APPLE_TEAM_ID;
    this.clientId = process.env.APPLE_CLIENT_ID; // Services ID
    this.keyId = process.env.APPLE_KEY_ID;
    this.privateKey = fs.readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, 'utf8');
    this.redirectUri = process.env.APPLE_REDIRECT_URI || 'https://hollowtown.com/api/auth/oauth/apple/callback';
  }

  /**
   * Generate client secret (Apple uses JWT instead of static secret)
   */
  generateClientSecret() {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: this.teamId,
      iat: now,
      exp: now + 86400 * 180, // 180 days
      aud: 'https://appleid.apple.com',
      sub: this.clientId
    };

    return jwt.sign(payload, this.privateKey, {
      algorithm: 'ES256',
      keyid: this.keyId
    });
  }

  /**
   * Get authorization URL
   */
  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      response_mode: 'form_post', // Apple sends POST request
      scope: 'name email',
      state
    });

    return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokens(code) {
    const clientSecret = this.generateClientSecret();

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri
    });

    const response = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    return await response.json();
  }

  /**
   * Verify and decode ID token
   */
  async verifyIdToken(idToken) {
    // Apple ID tokens are JWTs, decode without verification for now
    // (In production, verify signature against Apple's public keys)
    const decoded = jwt.decode(idToken);

    return {
      sub: decoded.sub, // Unique Apple user ID
      email: decoded.email,
      email_verified: decoded.email_verified === 'true',
      name: decoded.name // Only available on first sign-in
    };
  }

  /**
   * Get user profile from ID token
   */
  async getUserProfile(tokens) {
    const profile = await this.verifyIdToken(tokens.id_token);

    return {
      id: profile.sub,
      email: profile.email,
      emailVerified: profile.email_verified,
      name: profile.name || profile.email.split('@')[0],
      provider: 'apple'
    };
  }
}

export default AppleOAuthProvider;
```

**Step 3: Add Apple Routes**

```javascript
// routes/oauth-routes.js (add to existing file)

import AppleOAuthProvider from '../lib/auth/providers/apple.js';

const appleProvider = new AppleOAuthProvider();

/**
 * Initiate Apple Sign In
 */
router.get('/api/auth/oauth/apple', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');

  // Store state for verification
  req.session.oauthState = state;

  const authUrl = appleProvider.getAuthUrl(state);
  res.redirect(authUrl);
});

/**
 * Apple OAuth Callback
 *
 * NOTE: Apple sends POST request (not GET like other providers)
 */
router.post('/api/auth/oauth/apple/callback', async (req, res) => {
  try {
    const { code, state, user } = req.body;

    // Verify state
    if (state !== req.session.oauthState) {
      return res.status(400).json({ error: 'Invalid state' });
    }

    // Exchange code for tokens
    const tokens = await appleProvider.getTokens(code);

    // Get user profile
    const profile = await appleProvider.getUserProfile(tokens);

    // First-time sign-in: Apple sends user name in separate field
    if (user) {
      const userData = JSON.parse(user);
      profile.name = `${userData.name.firstName} ${userData.name.lastName}`;
    }

    // Find or create CALOS account
    let calosUser = await findUserByEmail(profile.email);

    if (!calosUser) {
      // Create new account
      calosUser = await createUser({
        email: profile.email,
        name: profile.name,
        provider: 'apple',
        providerId: profile.id,
        emailVerified: profile.emailVerified
      });
    } else {
      // Link Apple account to existing user
      await linkOAuthProvider(calosUser.id, 'apple', profile.id);
    }

    // Generate JWT
    const token = generateJWT(calosUser);

    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);

  } catch (error) {
    console.error('Apple OAuth error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=apple_login_failed`);
  }
});
```

**Step 4: Frontend Integration**

```html
<!-- Sign in with Apple button -->
<div id="appleid-signin"
     data-mode="center-align"
     data-type="sign-in"
     data-color="black"
     data-border="false"
     data-border-radius="15"
     data-width="280"
     data-height="40">
</div>

<script type="text/javascript"
        src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js">
</script>

<script>
AppleID.auth.init({
  clientId: 'com.calos.services',
  scope: 'name email',
  redirectURI: 'https://hollowtown.com/api/auth/oauth/apple/callback',
  state: '[STATE]', // Get from backend
  usePopup: false
});
</script>
```

**Environment Variables**:
```bash
# .env
APPLE_TEAM_ID=ABC123XYZ
APPLE_CLIENT_ID=com.calos.services
APPLE_KEY_ID=KEY123ABC
APPLE_PRIVATE_KEY_PATH=/path/to/AuthKey_KEY123ABC.p8
APPLE_REDIRECT_URI=https://hollowtown.com/api/auth/oauth/apple/callback
```

---

## Premium Features (Logged-In Users)

### Save Recipes to Collections

```javascript
// routes/collections-routes.js

import { requireAuth } from '../middleware/auth.js';

/**
 * Get user's collections
 */
router.get('/api/collections', requireAuth, async (req, res) => {
  const collections = await db.query(
    `SELECT c.*, COUNT(sr.recipe_id) as recipe_count
     FROM collections c
     LEFT JOIN saved_recipes sr ON sr.collection_id = c.id
     WHERE c.user_id = ?
     GROUP BY c.id
     ORDER BY c.name`,
    [req.user.userId]
  );

  res.json({
    success: true,
    collections
  });
});

/**
 * Create new collection
 */
router.post('/api/collections', requireAuth, async (req, res) => {
  const { name, description, isPublic } = req.body;

  const result = await db.query(
    `INSERT INTO collections (user_id, name, description, is_public)
     VALUES (?, ?, ?, ?)`,
    [req.user.userId, name, description, isPublic || false]
  );

  res.json({
    success: true,
    collectionId: result.insertId
  });
});

/**
 * Save recipe to collection (Pinterest-style)
 */
router.post('/api/collections/:collectionId/recipes/:recipeId',
  requireAuth,
  async (req, res) => {
    const { collectionId, recipeId } = req.params;
    const { notes } = req.body;

    // Verify collection belongs to user
    const collection = await db.query(
      'SELECT * FROM collections WHERE id = ? AND user_id = ?',
      [collectionId, req.user.userId]
    );

    if (!collection.length) {
      return res.status(403).json({ error: 'Collection not found' });
    }

    // Save recipe
    await db.query(
      `INSERT INTO saved_recipes (user_id, recipe_id, collection_id, notes)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE notes = VALUES(notes)`,
      [req.user.userId, recipeId, collectionId, notes]
    );

    res.json({
      success: true,
      message: 'Recipe saved to collection'
    });
  }
);
```

### Pin Items (Pinterest-Style)

```javascript
// routes/pins-routes.js

/**
 * Pin an item (recipe, Halloween decoration, etc.)
 */
router.post('/api/pins', requireAuth, async (req, res) => {
  const { itemType, itemId, boardId, note } = req.body;

  await db.query(
    `INSERT INTO pins (user_id, item_type, item_id, board_id, note)
     VALUES (?, ?, ?, ?, ?)`,
    [req.user.userId, itemType, itemId, boardId, note]
  );

  res.json({
    success: true,
    message: 'Item pinned'
  });
});

/**
 * Get user's boards
 */
router.get('/api/boards', requireAuth, async (req, res) => {
  const boards = await db.query(
    `SELECT b.*, COUNT(p.id) as pin_count
     FROM boards b
     LEFT JOIN pins p ON p.board_id = b.id
     WHERE b.user_id = ?
     GROUP BY b.id
     ORDER BY b.name`,
    [req.user.userId]
  );

  res.json({
    success: true,
    boards
  });
});
```

### Meal Planning (Family Feature)

```javascript
// routes/meal-plans-routes.js

/**
 * Create meal plan
 */
router.post('/api/meal-plans', requireAuth, async (req, res) => {
  const { startDate, endDate, meals } = req.body;

  const planId = await db.query(
    'INSERT INTO meal_plans (user_id, start_date, end_date) VALUES (?, ?, ?)',
    [req.user.userId, startDate, endDate]
  );

  // Add meals to plan
  for (const meal of meals) {
    await db.query(
      `INSERT INTO meal_plan_items (plan_id, date, meal_type, recipe_id)
       VALUES (?, ?, ?, ?)`,
      [planId.insertId, meal.date, meal.type, meal.recipeId]
    );
  }

  res.json({
    success: true,
    planId: planId.insertId
  });
});

/**
 * Generate shopping list from meal plan
 */
router.get('/api/meal-plans/:id/shopping-list', requireAuth, async (req, res) => {
  const { id } = req.params;

  // Get all recipes in meal plan
  const ingredients = await db.query(
    `SELECT ri.ingredient, ri.quantity, ri.unit
     FROM meal_plan_items mpi
     JOIN recipe_ingredients ri ON ri.recipe_id = mpi.recipe_id
     WHERE mpi.plan_id = ?`,
    [id]
  );

  // Aggregate quantities
  const shoppingList = aggregateIngredients(ingredients);

  res.json({
    success: true,
    shoppingList
  });
});
```

---

## Database Schema

### Collections & Saved Items

```sql
-- Collections (like Pinterest boards)
CREATE TABLE collections (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  INDEX idx_user_collections (user_id)
);

-- Saved recipes
CREATE TABLE saved_recipes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(50) NOT NULL,
  recipe_id INT NOT NULL,
  collection_id INT,
  notes TEXT,
  saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  UNIQUE KEY unique_save (user_id, recipe_id, collection_id)
);

-- Pins (generic pinning system)
CREATE TABLE pins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(50) NOT NULL,
  item_type VARCHAR(50) NOT NULL, -- 'recipe', 'halloween_decoration', 'family_tip'
  item_id INT NOT NULL,
  board_id INT,
  note TEXT,
  pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  INDEX idx_user_pins (user_id),
  INDEX idx_item (item_type, item_id)
);

-- Boards (Pinterest-style)
CREATE TABLE boards (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  INDEX idx_user_boards (user_id)
);

-- Meal plans
CREATE TABLE meal_plans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  INDEX idx_user_plans (user_id)
);

CREATE TABLE meal_plan_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_id INT NOT NULL,
  date DATE NOT NULL,
  meal_type VARCHAR(20) NOT NULL, -- 'breakfast', 'lunch', 'dinner', 'snack'
  recipe_id INT,
  notes TEXT,
  FOREIGN KEY (plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id),
  INDEX idx_plan_items (plan_id)
);

-- OAuth provider linkage
CREATE TABLE oauth_providers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(50) NOT NULL,
  provider VARCHAR(50) NOT NULL, -- 'google', 'apple', 'github'
  provider_user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  UNIQUE KEY unique_provider (provider, provider_user_id),
  INDEX idx_user_providers (user_id)
);
```

---

## Frontend UX Flow

### Public Browsing Experience

```
User lands on howtocookathome.com
  ↓
Browse recipes (no login required)
  ↓
Click recipe → See full details
  ↓
Click "Save to Collection" button
  ↓
┌─────────────────────────────────────┐
│  Sign in to save this recipe        │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Continue with Google       │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Continue with Apple        │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Continue with GitHub       │   │
│  └─────────────────────────────┘   │
│                                     │
│  Or continue browsing without      │
│  saving (guest mode)               │
└─────────────────────────────────────┘
```

### After Login

```
User signs in with Google
  ↓
Redirected back to recipe page
  ↓
"Save to Collection" now works
  ↓
┌─────────────────────────────────────┐
│  Save to:                           │
│  ○ Thanksgiving Dinner             │
│  ○ Quick Weeknight Meals           │
│  ○ Halloween Party Food            │
│  + Create new collection           │
└─────────────────────────────────────┘
  ↓
Recipe saved!
  ↓
"View your collections" → See all saved recipes
```

### Cross-Domain Experience

```
User has account on howtocookathome.com
  ↓
Visits hollowtown.com (different domain)
  ↓
Already logged in (shared CALOS identity!)
  ↓
Can save Halloween decorations to boards
  ↓
Can pin costumes, recipes, party ideas
  ↓
All synced across devices (laptop, iPhone)
```

---

## Implementation Checklist

### Phase 1: Public Browsing (Week 1)

- [ ] Create `optionalAuth` middleware
- [ ] Create `requireAuthForFeature` gate
- [ ] Update all content routes to use `optionalAuth`
- [ ] Add guest session tracking (anonymous analytics)
- [ ] Test: Public browsing works without login

### Phase 2: Google Sign-In (Week 1)

- [ ] Get Google OAuth credentials
- [ ] Set environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- [ ] Test existing Google OAuth flow
- [ ] Add "Sign in with Google" button to frontend
- [ ] Test: User can log in with Google account

### Phase 3: Apple Sign-In (Week 2)

- [ ] Register with Apple Developer
- [ ] Create Services ID and private key
- [ ] Implement `AppleOAuthProvider` class
- [ ] Add Apple OAuth routes (POST callback!)
- [ ] Set environment variables (Team ID, Key ID, private key path)
- [ ] Add "Sign in with Apple" button to frontend
- [ ] Test: User can log in with Apple ID

### Phase 4: Premium Features (Week 2-3)

- [ ] Create collections system (database tables)
- [ ] Implement "Save to Collection" API
- [ ] Create boards/pins system (Pinterest-style)
- [ ] Add meal planning feature
- [ ] Add shopping list generation
- [ ] Test: All premium features work after login

### Phase 5: Cross-Domain Identity (Week 3)

- [ ] Verify JWT works across all domains
- [ ] Test: Login on howtocookathome.com → Auto-login on hollowtown.com
- [ ] Test: Saved items appear on all domains
- [ ] Test: Multi-device sync (laptop → iPhone)

---

## Environment Setup

### Required Environment Variables

```bash
# .env

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Apple Sign In
APPLE_TEAM_ID=ABC123XYZ
APPLE_CLIENT_ID=com.calos.services
APPLE_KEY_ID=KEY123ABC
APPLE_PRIVATE_KEY_PATH=/path/to/AuthKey_KEY123ABC.p8
APPLE_REDIRECT_URI=https://hollowtown.com/api/auth/oauth/apple/callback

# GitHub OAuth (already configured)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# JWT
JWT_SECRET=your-secret-key-change-in-production

# Frontend
FRONTEND_URL=https://howtocookathome.com
```

---

## Testing

### Test Public Browsing

```bash
# Browse recipes without login
curl http://localhost:5001/api/recipes

# Should return recipes with isGuest: true
```

### Test Feature Gate

```bash
# Try to save recipe without login
curl -X POST http://localhost:5001/api/recipes/123/save \
  -H "Content-Type: application/json"

# Should return:
# {
#   "success": false,
#   "error": "LOGIN_REQUIRED",
#   "message": "Sign in to save recipes",
#   "providers": ["google", "apple", "github"]
# }
```

### Test Google Login

```bash
# Visit in browser
open http://localhost:5001/api/auth/oauth/google

# Complete Google login
# Should redirect back with JWT token
```

### Test Saved Recipe

```bash
# Get JWT from login
TOKEN="your-jwt-token"

# Save recipe
curl -X POST http://localhost:5001/api/recipes/123/save \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"collectionId": 1}'

# Should return success
```

---

## Security Considerations

### Guest Session Privacy

- Guest IDs are anonymous (no PII)
- Used only for analytics (page views, popular recipes)
- Automatically expire after 30 days
- Can't access saved items or premium features

### OAuth Security

- Use HTTPS in production (required for OAuth)
- Verify state parameter (CSRF protection)
- Store OAuth tokens securely (encrypted database)
- Implement token refresh for long-lived sessions
- Validate JWT signatures on every request

### Feature Gating

- Never trust client-side feature flags
- Always verify authentication server-side
- Return 401 for unauthenticated requests
- Return 403 for unauthorized access (wrong user)

---

## Summary

```
┌────────────────────────────────────────────────────────┐
│  Public Browsing + Social Login Model                 │
├────────────────────────────────────────────────────────┤
│                                                        │
│  1. Anyone can browse (like Google)                    │
│     • No login required                                │
│     • Search recipes, Halloween content                │
│     • View all public content                          │
│                                                        │
│  2. Sign in for premium features (like Pinterest)      │
│     • "Continue with Google" (already works)           │
│     • "Continue with Apple" (new)                      │
│     • Save to collections                              │
│     • Pin items to boards                              │
│     • Create meal plans                                │
│                                                        │
│  3. Shared identity across domains (like AWS)          │
│     • One CALOS account                                │
│     • Works on hollowtown.com, howtocookathome.com     │
│     • Syncs across devices (laptop, iPhone, voice)     │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Next Steps**:
1. Set up Google OAuth credentials (5 min)
2. Register with Apple Developer (30 min)
3. Implement `optionalAuth` middleware (30 min)
4. Add social login buttons to frontend (1 hour)
5. Test public browsing + login flow (30 min)

---

## Related Documentation

- [MULTI_DEVICE_FEDERATION_GUIDE.md](./MULTI_DEVICE_FEDERATION_GUIDE.md) - Multi-device identity
- [MULTI_DATABASE_ARCHITECTURE.md](./MULTI_DATABASE_ARCHITECTURE.md) - Database separation
- [TALENT_MARKETPLACE_GUIDE.md](./TALENT_MARKETPLACE_GUIDE.md) - Reputation system
- `lib/auth/providers/google.js` - Google OAuth implementation
- `routes/oauth-routes.js` - OAuth endpoints

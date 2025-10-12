# CalOS Swiper SDK - Implementation Guide

**Status**: Migration 008 created ✅ | SDK implementation pending

## Quick Start for Ollama

This document contains everything needed to complete the Profile Swiper SDK platform (Adobe Express style).

---

## ✅ COMPLETED
1. **Migration 008** - `/database/migrations/008_add_developer_system.sql`
   - Tables: developers, api_usage, api_request_log, webhooks, webhook_deliveries, sdk_tokens, developer_subscriptions
   - Views: developer_usage_summary, endpoint_popularity, webhook_success_rate
   - **Action**: Run migration with `psql -U matthewmauer -d calos -f database/migrations/008_add_developer_system.sql`

---

## 🔨 TO IMPLEMENT

### 1. SDK Core Library (`/sdk/src/calos-swiper.js`)

```javascript
/**
 * CalOS Swiper SDK
 * Adobe Express-style JavaScript SDK for profile generation
 * @version 1.0.0
 */

class CalOSSwiperSDK {
  constructor(config) {
    this.clientId = config.clientId;
    this.apiEndpoint = config.apiEndpoint || 'http://localhost:5001/api/swiper';
    this.mode = config.mode || 'embed'; // 'embed', 'headless', 'widget'
    this.container = config.containerId ? document.getElementById(config.containerId) : null;
    this.options = config.options || {};
    this.eventHandlers = {};

    if (!this.clientId) {
      throw new Error('clientId is required');
    }

    if (this.mode === 'embed' && !this.container) {
      throw new Error('containerId is required for embed mode');
    }

    this.init();
  }

  async init() {
    if (this.mode === 'embed') {
      await this.renderEmbedWidget();
    }
  }

  // Embed Mode: Full swiper UI
  async renderEmbedWidget() {
    // Inject iframe or render UI directly
    this.container.innerHTML = `
      <iframe
        src="${this.apiEndpoint}/embed?clientId=${this.clientId}"
        width="100%"
        height="600px"
        frameborder="0"
        style="border-radius: 10px;"
      ></iframe>
    `;
  }

  // Headless Mode: Generate profiles programmatically
  async generate(options = {}) {
    const response = await fetch(`${this.apiEndpoint}/profile?weighted=${options.weighted || true}&clientId=${this.clientId}`, {
      headers: {
        'X-API-Key': this.clientId
      }
    });

    const data = await response.json();

    if (data.status === 'ok') {
      this.emit('profileGenerated', data.profile);
      return data.profile;
    } else {
      throw new Error(data.message);
    }
  }

  // Batch generation
  async generateBatch(count = 10, options = {}) {
    const profiles = [];
    for (let i = 0; i < count; i++) {
      const profile = await this.generate(options);
      profiles.push(profile);
    }
    return profiles;
  }

  // Record swipe
  async swipe(profile, direction) {
    const response = await fetch(`${this.apiEndpoint}/swipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.clientId
      },
      body: JSON.stringify({
        profile,
        direction,
        sessionId: this.options.sessionId || 'sdk-session'
      })
    });

    const data = await response.json();

    if (direction === 'right') {
      this.emit('match', { profile, matchId: data.match_id });
    }

    return data;
  }

  // Get matches
  async getMatches(limit = 50) {
    const response = await fetch(`${this.apiEndpoint}/matches?limit=${limit}&clientId=${this.clientId}`, {
      headers: {
        'X-API-Key': this.clientId
      }
    });

    const data = await response.json();
    return data.matches || [];
  }

  // Export matches
  async export(format = 'json') {
    const response = await fetch(`${this.apiEndpoint}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.clientId
      },
      body: JSON.stringify({
        format,
        sessionId: this.options.sessionId
      })
    });

    return response.blob();
  }

  // Event handling
  on(event, handler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  emit(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => handler(data));
    }
  }

  // Quick actions
  static async quickEmail({ firstName, lastName, domain }) {
    const profile = await new CalOSSwiperSDK({ clientId: 'quick' }).generate();
    return `${firstName || profile.first_name}.${lastName || profile.last_name}@${domain || profile.domain}`;
  }

  static async quickPhone({ countryCode = 'US' }) {
    const profile = await new CalOSSwiperSDK({ clientId: 'quick' }).generate({ countryCode });
    return profile.phone_formatted;
  }
}

// Export for Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalOSSwiperSDK;
} else {
  window.CalOSSwiperSDK = CalOSSwiperSDK;
}
```

**Save as**: `/sdk/src/calos-swiper.js`

---

### 2. Authentication Middleware (`/middleware/api-auth.js`)

```javascript
/**
 * API Authentication Middleware
 * Validates API keys, rate limits, domain restrictions
 */

class APIAuthMiddleware {
  constructor(db) {
    this.db = db;
    this.rateLimitCache = new Map(); // In-memory cache for rate limits
  }

  // Validate API key
  validateKey = async (req, res, next) => {
    try {
      const apiKey = req.headers['x-api-key'] || req.query.clientId;

      if (!apiKey) {
        return res.status(401).json({
          status: 'error',
          message: 'API key required. Pass as X-API-Key header or clientId query param.'
        });
      }

      // Look up developer
      const result = await this.db.query(`
        SELECT * FROM developers
        WHERE api_key = $1 AND status = 'active'
      `, [apiKey]);

      if (result.rows.length === 0) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid API key or account suspended'
        });
      }

      const developer = result.rows[0];

      // Attach to request
      req.developer = developer;

      // Update last_used_at
      await this.db.query(`
        UPDATE developers SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1
      `, [developer.id]);

      next();
    } catch (error) {
      console.error('[APIAuth] Error validating key:', error);
      res.status(500).json({
        status: 'error',
        message: 'Authentication error'
      });
    }
  };

  // Check rate limit
  checkRateLimit = async (req, res, next) => {
    try {
      const developer = req.developer;
      const hourBucket = new Date();
      hourBucket.setMinutes(0, 0, 0);

      // Check current hour usage
      const result = await this.db.query(`
        SELECT requests_count FROM api_usage
        WHERE developer_id = $1 AND hour_bucket = $2
      `, [developer.id, hourBucket]);

      const currentCount = result.rows[0]?.requests_count || 0;

      if (currentCount >= developer.rate_limit_per_hour) {
        return res.status(429).json({
          status: 'error',
          message: 'Rate limit exceeded',
          limit: developer.rate_limit_per_hour,
          reset_at: new Date(hourBucket.getTime() + 60 * 60 * 1000).toISOString()
        });
      }

      // Increment usage
      await this.db.query(`
        INSERT INTO api_usage (developer_id, endpoint, method, hour_bucket, requests_count, success_count)
        VALUES ($1, $2, $3, $4, 1, 0)
        ON CONFLICT (developer_id, endpoint, hour_bucket)
        DO UPDATE SET requests_count = api_usage.requests_count + 1
      `, [developer.id, req.path, req.method, hourBucket]);

      next();
    } catch (error) {
      console.error('[APIAuth] Rate limit error:', error);
      next(); // Don't block on rate limit errors
    }
  };

  // Check domain origin
  checkDomain = (req, res, next) => {
    const developer = req.developer;

    if (!developer.allowed_domains || developer.allowed_domains.length === 0) {
      return next(); // No restrictions
    }

    const origin = req.headers.origin || req.headers.referer;

    if (!origin) {
      return res.status(403).json({
        status: 'error',
        message: 'Origin header required'
      });
    }

    const isAllowed = developer.allowed_domains.some(domain =>
      origin.includes(domain)
    );

    if (!isAllowed) {
      return res.status(403).json({
        status: 'error',
        message: 'Domain not whitelisted',
        allowed_domains: developer.allowed_domains
      });
    }

    next();
  };

  // Log request
  logRequest = async (req, res, next) => {
    const startTime = Date.now();

    // Capture response
    const originalSend = res.send;
    res.send = function(data) {
      const latency = Date.now() - startTime;

      // Log to database (async, don't wait)
      this.db.query(`
        INSERT INTO api_request_log (
          developer_id, api_key, endpoint, method,
          status_code, latency_ms, ip_address, user_agent, requested_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      `, [
        req.developer?.id,
        req.developer?.api_key,
        req.path,
        req.method,
        res.statusCode,
        latency,
        req.ip,
        req.headers['user-agent']
      ]).catch(err => console.error('[APIAuth] Log error:', err));

      originalSend.call(this, data);
    }.bind(this);

    next();
  };
}

module.exports = APIAuthMiddleware;
```

**Save as**: `/middleware/api-auth.js`

---

### 3. Developer Routes (`/routes/developer-routes.js`)

```javascript
/**
 * Developer Portal Routes
 * Registration, API key management, usage stats
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

/**
 * POST /api/dev/register
 * Register new developer account
 */
router.post('/register', async (req, res) => {
  try {
    const { email, name, company } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'email is required'
      });
    }

    const db = req.app.locals.db;

    // Check if email exists
    const existing = await db.query(`
      SELECT id FROM developers WHERE email = $1
    `, [email]);

    if (existing.rows.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'Email already registered'
      });
    }

    // Generate API key and secret
    const apiKey = 'calos_' + crypto.randomBytes(24).toString('hex');
    const apiSecret = crypto.randomBytes(32).toString('hex');

    // Create developer
    const result = await db.query(`
      INSERT INTO developers (email, name, company, api_key, api_secret, tier)
      VALUES ($1, $2, $3, $4, $5, 'free')
      RETURNING id, email, name, company, api_key, tier, created_at
    `, [email, name, company, apiKey, apiSecret]);

    const developer = result.rows[0];

    console.log(`[Developer] Registered: ${email} (${apiKey})`);

    res.json({
      status: 'ok',
      message: 'Developer account created',
      developer: {
        id: developer.id,
        email: developer.email,
        name: developer.name,
        company: developer.company,
        api_key: developer.api_key,
        tier: developer.tier,
        created_at: developer.created_at
      }
    });

  } catch (error) {
    console.error('[Developer] Registration error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/dev/keys
 * List API keys for a developer (by email)
 */
router.get('/keys', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'email query param required'
      });
    }

    const db = req.app.locals.db;

    const result = await db.query(`
      SELECT id, email, name, api_key, tier, rate_limit_per_hour,
             allowed_domains, status, created_at, last_used_at
      FROM developers
      WHERE email = $1
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Developer not found'
      });
    }

    res.json({
      status: 'ok',
      developer: result.rows[0]
    });

  } catch (error) {
    console.error('[Developer] Keys fetch error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/dev/usage
 * Get usage statistics for a developer
 */
router.get('/usage', async (req, res) => {
  try {
    const { apiKey, days = 7 } = req.query;

    if (!apiKey) {
      return res.status(400).json({
        status: 'error',
        message: 'apiKey query param required'
      });
    }

    const db = req.app.locals.db;

    // Get developer
    const devResult = await db.query(`
      SELECT id FROM developers WHERE api_key = $1
    `, [apiKey]);

    if (devResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Invalid API key'
      });
    }

    const developerId = devResult.rows[0].id;

    // Get usage stats
    const usageResult = await db.query(`
      SELECT
        endpoint,
        SUM(requests_count) as total_requests,
        SUM(success_count) as successful_requests,
        SUM(error_count) as failed_requests,
        AVG(avg_latency_ms) as avg_latency
      FROM api_usage
      WHERE developer_id = $1
        AND hour_bucket > CURRENT_TIMESTAMP - INTERVAL '${parseInt(days)} days'
      GROUP BY endpoint
      ORDER BY total_requests DESC
    `, [developerId]);

    res.json({
      status: 'ok',
      usage: usageResult.rows,
      period_days: parseInt(days)
    });

  } catch (error) {
    console.error('[Developer] Usage fetch error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = router;
```

**Save as**: `/routes/developer-routes.js`

---

### 4. Update Router.js

Add to `/router.js` after swiper routes:

```javascript
// Developer Portal Routes
const developerRoutes = require('./routes/developer-routes');
app.use('/api/dev', developerRoutes);

// Add authentication middleware to swiper routes
const APIAuthMiddleware = require('./middleware/api-auth');
const apiAuth = new APIAuthMiddleware(db);

// Protect swiper routes with API auth (add after initialization)
app.use('/api/swiper', apiAuth.validateKey, apiAuth.checkRateLimit, apiAuth.logRequest);
```

---

### 5. Developer Portal UI (`/public/developer-portal.html`)

**Full HTML file with registration, dashboard, API key display**

Create complete developer portal with:
- Registration form
- API key display
- Usage statistics
- Quick start code samples
- Documentation links

---

### 6. SDK Package (`/sdk/package.json`)

```json
{
  "name": "@calos/swiper-sdk",
  "version": "1.0.0",
  "description": "CalOS Profile Swiper SDK - Generate profiles, emails, phone numbers",
  "main": "dist/calos-swiper.min.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "webpack --mode production",
    "dev": "webpack --mode development --watch"
  },
  "keywords": ["profiles", "generator", "swiper", "calos"],
  "author": "CalOS",
  "license": "MIT"
}
```

---

## 🎯 Priority Order for Ollama

1. ✅ Run migration 008
2. Create `/middleware/api-auth.js`
3. Create `/routes/developer-routes.js`
4. Create `/sdk/src/calos-swiper.js`
5. Update `/router.js` to add developer routes and auth
6. Create `/public/developer-portal.html`
7. Create `/sdk/package.json`
8. Test E2E: Register → Get API key → Use SDK

---

## 🧪 Testing Steps

```bash
# 1. Run migration
psql -U matthewmauer -d calos -f database/migrations/008_add_developer_system.sql

# 2. Restart server
node router.js --local

# 3. Register developer
curl -X POST http://localhost:5001/api/dev/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","name":"Test Dev","company":"ACME"}'

# 4. Get API key (copy from response)
API_KEY="calos_xxxx..."

# 5. Test profile generation with API key
curl "http://localhost:5001/api/swiper/profile?clientId=$API_KEY" \
  -H "X-API-Key: $API_KEY"

# 6. Test SDK in browser
<script src="/sdk/src/calos-swiper.js"></script>
<script>
  const swiper = new CalOSSwiperSDK({
    clientId: 'YOUR_API_KEY'
  });
  swiper.generate().then(profile => console.log(profile));
</script>
```

---

## 📊 Success Metrics

- [ ] Developer can register and get API key
- [ ] API key authentication works
- [ ] Rate limiting enforced
- [ ] SDK can generate profiles
- [ ] Usage tracking records requests
- [ ] Developer portal shows statistics

---

**Ready for Ollama to execute!**

# Schema Dashboard Integration Status

**Date**: 2025-10-15
**Status**: Phase 1 In Progress (Integration)

---

## ✅ Completed

### 1. Schema Tool Routes Registered (router.js)
- ✅ Added `schema-dashboard-routes.js` import at line 201
- ✅ Added variable declaration at line 209
- ✅ Added route initialization at line 718
- ✅ Route mounted at `/api/schema-dashboard`

### 2. Authentication Middleware Created
- ✅ Custom `requireUserAuth` middleware in `schema-dashboard-routes.js`
- ✅ Accepts JWT tokens OR `X-User-Id` header (for development)
- ✅ Compatible with tenant API key system

### 3. Schema Dashboard API Endpoints
Created `/api/schema-dashboard/*` endpoints:

#### GET `/api/schema-dashboard/context`
Returns user's tenant context for dashboards:
```json
{
  "user_id": "uuid",
  "email": "user@example.com",
  "tenant_id": "uuid",
  "tenant_name": "Acme Corp",
  "tier_name": "pro",
  "max_api_keys": 10,
  "api_key_count": 3,
  "credits_remaining": 1000
}
```

#### GET `/api/schema-dashboard/schemas`
Lists all schemas in `/schemas` directory with metadata

#### POST `/api/schema-dashboard/validate`
Runs schema validation against live APIs using schema-lock.js

---

## 🔄 In Progress

### Testing Endpoints
Server was restarted with new routes. Need to verify:
1. `/api/schema-dashboard/context` returns tenant info
2. `/api/schema-dashboard/schemas` lists api-key.schema.json
3. Authentication works with X-User-Id header

---

## 📋 Next Steps (Phase 1 Completion)

### 1. Update HTML Dashboards to Use New API
Files to modify:
- `public/schema-tools-dashboard.html` - Call `/api/schema-dashboard/context`
- `public/key-verifier.html` - Replace hardcoded user ID with dynamic context
- `public/schema-test-dashboard.html` - Use tenant-specific endpoints

### 2. Make Dashboards Tenant-Aware
**Current**: Hardcoded `X-User-Id: e7dc083f-61de-4567-a5b6-b21ddb09cb2d`
**Target**: Fetch from `/api/schema-dashboard/context` on page load

**Changes needed**:
```javascript
// OLD (hardcoded)
const userId = 'e7dc083f-61de-4567-a5b6-b21ddb09cb2d';

// NEW (dynamic)
async function loadContext() {
  const response = await fetch('/api/schema-dashboard/context', {
    headers: { 'X-User-Id': 'e7dc083f-61de-4567-a5b6-b21ddb09cb2d' } // For dev
  });
  const { data } = await response.json();
  return data; // Contains tenant_id, credits, etc.
}
```

### 3. Test Complete Flow
1. Open `http://localhost:5001/schema-tools-dashboard.html`
2. Dashboard calls `/api/schema-dashboard/context`
3. Gets tenant_id and credits_remaining
4. Displays tenant-specific API keys
5. Schema validator runs against tenant's endpoints

---

## 🎯 Phase 2: Auto-Healing

### 1. Schema Watch Mode
Monitor `schemas/` directory for changes:
- File modified → reload schema
- Run validation
- Auto-regenerate artifacts

### 2. Drift Detection
Every 5 minutes:
- Run schema validation
- Compare API responses to schemas
- Log drift events

### 3. Self-Healing
When drift detected:
- **Option A**: Update schema to match API
- **Option B**: Update API to match schema
- **Option C**: Alert user to decide
- Log all auto-fixes to audit table

---

## 🐉 Phase 3: Twin Knowledge Graph

### 1. Database Schema
```sql
CREATE TABLE student_knowledge_graphs (
  graph_id UUID PRIMARY KEY,
  student_id UUID REFERENCES users(user_id),
  session_id VARCHAR(100),
  concept VARCHAR(255),
  depth_level INTEGER CHECK (depth_level BETWEEN 1 AND 5),
  connections JSONB,
  last_taught TIMESTAMPTZ,
  confidence_score DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. Encoding/Decoding Pairs
- **Encode**: User domain → AI model representation
- **Decode**: AI model output → User domain entities
- Track concept learning progression

### 3. Dragon Teaching Flow
1. User asks question
2. Check student_knowledge_graphs for existing concepts
3. Adapt explanation to current depth_level
4. Store new concepts learned
5. Increment depth_level on mastery

---

## 📊 Microsoft Pattern Alignment

### CalOS Stack (Node.js)
- **npm packages** (dependency management)
- **Schema lock system** (code generation)
- **Multi-LLM router** (AI orchestration)
- **Tenant/API key system** (licensing/billing)

### Equivalent Microsoft Stack (.NET)
- **NuGet** (dependency management)
- **T4 templates** (code generation)
- **Semantic-Kernel** (AI orchestration)
- **Dynamics365** (licensing/billing)

---

## 🔗 Related Files

### Created
- `routes/schema-dashboard-routes.js` - API endpoints for schema management
- `public/schema-tools-dashboard.html` - Main hub
- `public/key-verifier.html` - Key verification tool
- `public/schema-test-dashboard.html` - Live test runner
- `public/json-html-transformer.html` - Schema transformer

### Modified
- `router.js` - Lines 201, 209, 718 (route registration)
- `schemas/api-key.schema.json` - Fixed tenant_id requirement

### Existing Integration Points
- `scripts/schema-lock.js` - Validation and generation engine
- `routes/tenant-api-key-routes.js` - API key management
- `middleware/sso-auth.js` - Authentication system

---

## 🎪 Current Architecture

```
┌──────────────────────────────────────┐
│  User Browser                        │
│  - schema-tools-dashboard.html       │
│  - key-verifier.html                 │
│  - schema-test-dashboard.html        │
└──────────┬───────────────────────────┘
           │ HTTP/WebSocket
           ▼
┌──────────────────────────────────────┐
│  CalOS Router (router.js)            │
│  Port: 5001                          │
│                                      │
│  /api/schema-dashboard/*             │
│  ├─ GET /context (tenant info)       │
│  ├─ GET /schemas (list schemas)      │
│  └─ POST /validate (run tests)       │
│                                      │
│  /api/keys/* (tenant API keys)       │
│  /api/ollama/* (LLM routing)         │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  PostgreSQL Database                 │
│  - users                             │
│  - tenants                           │
│  - calos_platform_api_keys           │
│  - user_credits                      │
└──────────────────────────────────────┘
```

---

## 🚀 Ready to Test

Once server finishes initializing, test:

```bash
# 1. Get tenant context
curl http://localhost:5001/api/schema-dashboard/context \
  -H "X-User-Id: e7dc083f-61de-4567-a5b6-b21ddb09cb2d"

# 2. List schemas
curl http://localhost:5001/api/schema-dashboard/schemas \
  -H "X-User-Id: e7dc083f-61de-4567-a5b6-b21ddb09cb2d"

# 3. Run validation
curl -X POST http://localhost:5001/api/schema-dashboard/validate \
  -H "X-User-Id: e7dc083f-61de-4567-a5b6-b21ddb09cb2d" \
  -H "Content-Type: application/json" \
  -d '{"schema_name": "api-key"}'
```

Then open: `http://localhost:5001/schema-tools-dashboard.html`

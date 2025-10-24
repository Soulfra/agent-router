# Family Inclusion & Sphere Grouping System

**Complete guide to Ancestry.com-style family discovery and multi-dimensional social spheres**

---

## Table of Contents

1. [Overview](#overview)
2. [Use Cases](#use-cases)
3. [Architecture](#architecture)
4. [Family Tree System](#family-tree-system)
5. [Sphere Grouping System](#sphere-grouping-system)
6. [DNA Integration](#dna-integration)
7. [API Reference](#api-reference)
8. [Configuration](#configuration)
9. [Privacy & Security](#privacy--security)
10. [Examples](#examples)
11. [Migration Guide](#migration-guide)

---

## Overview

The Family Inclusion & Sphere Grouping System extends the relationship graph (Migration 062) to support:

- **Family Tree Discovery** (Ancestry.com style)
  - Find ancestors, descendants, and siblings
  - DNA test integration (23andMe, Ancestry.com)
  - Surname-based relationship detection
  - Multi-generational visualization

- **Multi-Dimensional Spheres** (Snapchat college stories model)
  - College/university spheres (.edu verification)
  - Company/organization networks
  - Geographic grouping (city, state, country)
  - Interest-based communities
  - Flexible OR/AND matching logic

- **Data Brokering Platform**
  - Sphere analytics and engagement metrics
  - Verified vs self-reported membership
  - Privacy-preserving sphere discovery
  - Tiered access (free, verified, premium)

### Key Difference from Exclusion System

| Feature | Exclusion Mode (Dating Apps) | Inclusion Mode (Family Tree) |
|---------|------------------------------|------------------------------|
| Purpose | Avoid matching relatives | Find and connect with relatives |
| Relationship treatment | Block/deprioritize | Suggest/prioritize |
| Privacy | Never reveal WHY excluded | Show family connections openly |
| Use case | Dating, random matching | Genealogy, family reunions |

---

## Use Cases

### 1. Ancestry.com / Genealogy Platform
- Build family trees across generations
- Import DNA test results from 23andMe, Ancestry.com
- Discover unknown relatives
- Visualize lineage and heritage

### 2. Social Network with Sphere Grouping
- Connect with college classmates (verified .edu emails)
- Alumni networks for universities
- Company employee directories
- City/region-based social groups
- Interest-based communities (hobbies, professions)

### 3. Data Brokering / Analytics
- Sell access to verified sphere data (e.g., "all Stanford CS graduates 2020")
- Provide engagement metrics for spheres
- Premium features for sphere analytics
- Privacy-preserving demographic insights

### 4. Hybrid: Family + Social Matching
- "Find family members OR people from my college"
- "Show relatives AND people in my city"
- Complex multi-dimensional matching

---

## Architecture

### Database Schema (Migration 063)

```sql
-- Family tree hierarchy
family_tree (parent_user_id, child_user_id, generation_diff, verification_source)

-- Sphere definitions (types of spheres)
sphere_definitions (sphere_type, display_name, verification_required)

-- User membership in spheres
user_spheres (user_id, sphere_def_id, sphere_value, is_verified, is_public)

-- Connections derived from spheres
sphere_connections (user1_id, user2_id, sphere_def_id, connection_strength)

-- DNA test results
dna_matches (user_id, matched_user_id, dna_provider, shared_dna_percentage)

-- Analytics for data brokering
sphere_analytics (sphere_def_id, sphere_value, total_members, engagement_score)
```

### Core Components

1. **RelationshipRouter** (`lib/relationship-router.js`)
   - Extends RelationshipFilter with inclusion mode
   - Supports 3 modes: `exclusion`, `inclusion`, `hybrid`
   - Manages family tree and sphere operations
   - Backward compatible with RelationshipFilter

2. **Family Tree Routes** (`routes/family-tree-routes.js`)
   - View family tree (ancestors, descendants, siblings)
   - Add/remove family relationships
   - Import DNA matches
   - Get family discovery suggestions

3. **Sphere Routes** (`routes/sphere-routes.js`)
   - Join/leave spheres
   - Email domain verification
   - Find users in spheres
   - Sphere-based matching with OR/AND logic
   - Analytics and data brokering

4. **Matching Routes** (updated)
   - Unified endpoint with mode switching
   - `/api/matching/find?mode=inclusion`
   - Supports both exclusion and inclusion

---

## Family Tree System

### How It Works

1. **Parent-Child Relationships**
   - Stored bidirectionally in `family_tree` table
   - Tracks generation difference (1 = parent/child, 2 = grandparent/grandchild)
   - Multiple verification sources (manual, DNA, Facebook, surname heuristics)

2. **Recursive Family Discovery**
   - `get_ancestors(user_id, max_generations)` - Find all ancestors
   - `get_descendants(user_id, max_generations)` - Find all descendants
   - `get_all_family(user_id, max_generations)` - Complete family tree

3. **Verification Sources**
   - **Manual**: User manually adds family members
   - **DNA**: 23andMe, Ancestry.com, MyHeritage, FamilyTreeDNA
   - **Facebook**: Imported from Facebook family relationships
   - **Surname heuristics**: Same surname + age gap detection
   - **Phone contacts**: Contacts shared between users

### Family Tree API

#### Get Complete Family Tree
```http
GET /api/family-tree/me?maxGenerations=5
```

**Response:**
```json
{
  "userId": 123,
  "maxGenerations": 5,
  "totalFamily": 42,
  "ancestors": 15,
  "descendants": 12,
  "siblings": 3,
  "familyTree": {
    "ancestors": [
      { "family_member_id": 456, "relationship_type": "ancestor", "generation_diff": 1 }
    ],
    "descendants": [...],
    "siblings": [...]
  }
}
```

#### Add Parent
```http
POST /api/family-tree/add-parent
Content-Type: application/json

{
  "parentId": 456,
  "label": "mother"
}
```

#### Import DNA Matches
```http
POST /api/family-tree/import-dna
Content-Type: application/json

{
  "provider": "23andme",
  "matches": [
    {
      "matchedUserId": 789,
      "sharedDNA": 50.0,
      "sharedCentimorgans": 3500,
      "predictedRelationship": "parent",
      "confidenceLevel": "very_high",
      "providerMatchId": "ABC123"
    }
  ]
}
```

**DNA Match Inference:**
- 45-50% shared DNA → Parent/child
- 25-50% shared DNA → Sibling
- ~25% shared DNA → Grandparent/grandchild
- <25% shared DNA → More distant relatives (not added to tree automatically)

---

## Sphere Grouping System

### Sphere Types (Default)

| Sphere Type | Description | Verification | Pricing Tier |
|-------------|-------------|--------------|--------------|
| `college` | Educational institution | .edu email domain | Verified |
| `graduation_year` | College graduation year | Self-reported | Free |
| `company` | Current or former employer | Company email domain | Verified |
| `city` | Geographic location | Self-reported | Free |
| `state` | State/province | Self-reported | Free |
| `country` | Country of residence | Self-reported | Free |
| `interest` | Shared interests/hobbies | Self-reported | Free |
| `alumni` | School alumni networks | .edu email domain | Premium |
| `profession` | Job title or profession | Self-reported | Free |

### Email Domain Verification

For `.edu` spheres and company spheres:

1. User provides email address (e.g., `user@stanford.edu`)
2. System extracts domain (`stanford.edu`)
3. System checks if domain matches sphere's `valid_domains` metadata
4. If valid, user is added to sphere with `is_verified = true`
5. Verification email sent for confirmation (optional)

### Sphere API

#### Join a Sphere
```http
POST /api/spheres/join
Content-Type: application/json

{
  "sphereType": "college",
  "sphereValue": "stanford.edu",
  "isPublic": true,
  "isPrimary": true,
  "metadata": {
    "major": "Computer Science",
    "graduationYear": 2020
  }
}
```

#### Verify Sphere via Email
```http
POST /api/spheres/verify-email
Content-Type: application/json

{
  "email": "user@stanford.edu",
  "sphereType": "college"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified and sphere joined",
  "sphereType": "college",
  "sphereValue": "stanford.edu",
  "verified": true
}
```

#### Find Users in a Sphere
```http
GET /api/spheres/find-users?sphereType=college&sphereValue=stanford.edu&verifiedOnly=true
```

**Response:**
```json
{
  "users": [
    {
      "user_id": 123,
      "username": "john_doe",
      "email": "john@stanford.edu",
      "is_verified": true,
      "membership_score": 1.0
    }
  ],
  "count": 42,
  "sphereType": "college",
  "sphereValue": "stanford.edu",
  "verifiedOnly": true
}
```

---

## Flexible OR/AND Sphere Matching

### Boolean Query Logic

Find users matching complex sphere criteria:

```http
POST /api/spheres/match
Content-Type: application/json

{
  "filters": [
    { "sphereType": "college", "sphereValue": "stanford.edu", "operator": "OR" },
    { "sphereType": "city", "sphereValue": "San Francisco", "operator": "AND" }
  ],
  "limit": 50
}
```

**Logic:**
- `OR` filters create a union (any match)
- `AND` filters create an intersection (all must match)
- Evaluation: First apply all OR filters, then narrow down with AND filters

**Examples:**

1. **"Stanford students OR MIT students"**
   ```json
   {
     "filters": [
       { "sphereType": "college", "sphereValue": "stanford.edu", "operator": "OR" },
       { "sphereType": "college", "sphereValue": "mit.edu", "operator": "OR" }
     ]
   }
   ```

2. **"Stanford students in San Francisco"**
   ```json
   {
     "filters": [
       { "sphereType": "college", "sphereValue": "stanford.edu", "operator": "OR" },
       { "sphereType": "city", "sphereValue": "San Francisco", "operator": "AND" }
     ]
   }
   ```

3. **"(Stanford OR MIT) AND (San Francisco OR Palo Alto) AND graduation year 2020"**
   ```json
   {
     "filters": [
       { "sphereType": "college", "sphereValue": "stanford.edu", "operator": "OR" },
       { "sphereType": "college", "sphereValue": "mit.edu", "operator": "OR" },
       { "sphereType": "city", "sphereValue": "San Francisco", "operator": "AND" },
       { "sphereType": "city", "sphereValue": "Palo Alto", "operator": "AND" },
       { "sphereType": "graduation_year", "sphereValue": "2020", "operator": "AND" }
     ]
   }
   ```

---

## DNA Integration

### Supported Providers

- **23andMe** (`23andme`)
- **Ancestry.com** (`ancestry`)
- **MyHeritage** (`myheritage`)
- **FamilyTreeDNA** (`ftdna`)

### DNA Match Format

```javascript
{
  "matchedUserId": 789,              // User ID in system
  "sharedDNA": 50.0,                  // Percentage of shared DNA
  "sharedCentimorgans": 3500,         // Shared DNA in centimorgans (cM)
  "predictedRelationship": "parent",  // Relationship predicted by provider
  "confidenceLevel": "very_high",     // very_high | high | moderate | low
  "providerMatchId": "ABC123",        // External ID from DNA provider
  "metadata": {
    "segments": 42,                   // Number of shared DNA segments
    "longestSegment": 250,            // Longest segment in cM
    "xDNA": false                     // X-chromosome DNA shared
  }
}
```

### Automatic Family Tree Addition

When DNA matches are imported with `very_high` or `high` confidence:

1. System infers family tree label:
   - 45-50% shared → `parent` (bidirectional)
   - 25-50% shared → `sibling`
   - ~25% shared → `grandparent`

2. Automatically adds relationship to `family_tree` table
3. Syncs with `user_relationships` for exclusion/inclusion matching

---

## Unified Matching API

### Mode Switching

The `/api/matching/find` endpoint supports 3 modes:

#### 1. Exclusion Mode (Default - Dating Apps)
```http
GET /api/matching/find?mode=exclusion&limit=10
```

**Behavior:**
- Uses RelationshipFilter to EXCLUDE family/blocked users
- Returns collaboration matches filtered by family exclusions
- Privacy-preserving (never reveals WHY excluded)

#### 2. Inclusion Mode (Family Tree Discovery)
```http
GET /api/matching/find?mode=inclusion&includeFamilyTree=true&includeSphereSuggestions=true&limit=50
```

**Behavior:**
- Returns family members (ancestors, descendants, siblings)
- Returns sphere connections (college, city, interests)
- Returns DNA matches
- INCLUDES relationships instead of excluding

#### 3. Hybrid Mode (Best of Both Worlds)
```http
GET /api/matching/find?mode=hybrid&includeFamilyTree=true&limit=20
```

**Behavior:**
- Returns family + sphere matches
- Excludes manually blocked users
- Useful for social networks with family features

---

## Privacy & Security

### User Privacy Controls

1. **Sphere Visibility**
   - `is_public = true` → Visible to all users
   - `is_public = false` → Hidden from sphere searches

2. **Family Tree Privacy**
   - Users can delete relationships they added
   - DNA matches are private by default
   - Family tree visibility planned for future

3. **Data Deletion (GDPR)**
   - Cascade deletion: Delete user → Delete all relationships
   - Delete DNA matches when user is deleted
   - Delete sphere memberships on user deletion

### Security Best Practices

1. **Email Verification**
   - Always verify .edu emails before marking `is_verified = true`
   - Send confirmation emails with verification links
   - Expire verification links after 24 hours

2. **Rate Limiting**
   - Limit sphere join requests (10 per hour)
   - Limit DNA import requests (1 per day)
   - Limit family tree modifications (20 per day)

3. **Admin Controls**
   - Add admin check to `/api/spheres/sync-connections`
   - Add admin check to `/api/matching/system-stats`
   - Protect analytics endpoints for verified members only

---

## Configuration

### 1. Initialize RelationshipRouter

```javascript
const RelationshipRouter = require('./lib/relationship-router');
const CollaborationMatcher = require('./lib/collaboration-matcher');

const relationshipRouter = new RelationshipRouter({
  db: pool,
  collaborationMatcher: collaborationMatcher,
  defaultMode: 'hybrid' // or 'exclusion' or 'inclusion'
});
```

### 2. Mount Routes

```javascript
const { initializeRoutes: initFamilyTreeRoutes } = require('./routes/family-tree-routes');
const { initializeRoutes: initSphereRoutes } = require('./routes/sphere-routes');
const { initializeRoutes: initMatchingRoutes } = require('./routes/matching-routes');

// Family tree routes
app.use('/api/family-tree', initFamilyTreeRoutes(pool, { relationshipRouter }));

// Sphere routes
app.use('/api/spheres', initSphereRoutes(pool, { relationshipRouter }));

// Matching routes (updated with inclusion support)
app.use('/api/matching', initMatchingRoutes(pool, {
  relationshipRouter,
  collaborationMatcher
}));
```

### 3. Configure Sphere Types

Add custom sphere types via SQL:

```sql
INSERT INTO sphere_definitions (
  sphere_type,
  display_name,
  description,
  verification_required,
  verification_method,
  pricing_tier,
  metadata
) VALUES (
  'bootcamp',
  'Coding Bootcamp',
  'Coding bootcamp graduates (e.g., Hack Reactor, App Academy)',
  true,
  'email_domain',
  'verified',
  '{"valid_domains": [".hackreactor.com", ".appacademy.io"]}'
);
```

---

## Examples

### Example 1: Ancestry.com Clone

**Features:**
- Family tree visualization
- DNA test integration
- Find unknown relatives
- Surname-based discovery

**Workflow:**

1. User creates account and adds known family members
   ```javascript
   POST /api/family-tree/add-parent
   { "parentId": 456, "label": "mother" }
   ```

2. User imports 23andMe DNA results
   ```javascript
   POST /api/family-tree/import-dna
   {
     "provider": "23andme",
     "matches": [...]
   }
   ```

3. System automatically adds high-confidence DNA matches to family tree

4. User views complete family tree
   ```javascript
   GET /api/family-tree/me?maxGenerations=5
   ```

5. User discovers unknown relatives via suggestions
   ```javascript
   GET /api/family-tree/suggestions
   ```

---

### Example 2: LinkedIn Alumni Network

**Features:**
- Verified .edu sphere membership
- Graduation year grouping
- Company/profession spheres
- Alumni directory

**Workflow:**

1. User verifies college email
   ```javascript
   POST /api/spheres/verify-email
   {
     "email": "user@stanford.edu",
     "sphereType": "college"
   }
   ```

2. User joins graduation year sphere
   ```javascript
   POST /api/spheres/join
   {
     "sphereType": "graduation_year",
     "sphereValue": "2020"
   }
   ```

3. User finds all Stanford 2020 graduates
   ```javascript
   GET /api/spheres/find-users?sphereType=graduation_year&sphereValue=2020
   ```

4. User finds alumni in San Francisco
   ```javascript
   POST /api/spheres/match
   {
     "filters": [
       { "sphereType": "college", "sphereValue": "stanford.edu", "operator": "OR" },
       { "sphereType": "city", "sphereValue": "San Francisco", "operator": "AND" }
     ]
   }
   ```

---

### Example 3: Snapchat College Stories

**Features:**
- .edu domain verification
- Graduation year stories
- Campus-specific content
- Geographic grouping

**Workflow:**

1. Student verifies .edu email
   ```javascript
   POST /api/spheres/verify-email
   {
     "email": "student@stanford.edu",
     "sphereType": "college"
   }
   ```

2. System automatically adds to `stanford.edu` sphere

3. Student can view all Stanford users
   ```javascript
   GET /api/spheres/find-users?sphereType=college&sphereValue=stanford.edu&verifiedOnly=true
   ```

4. Post content to "Stanford 2024" story (custom implementation)

---

## Migration Guide

### Migrating from Exclusion-Only System

If you already have the family exclusion system (Migration 062), follow these steps:

#### 1. Run Migration 063
```bash
psql -U your_user -d your_db -f database/migrations/063_family_tree_and_spheres.sql
```

#### 2. Update Code to Use RelationshipRouter

**Before:**
```javascript
const RelationshipFilter = require('./lib/relationship-filter');

const relationshipFilter = new RelationshipFilter({
  db: pool,
  collaborationMatcher
});

app.use('/api/matching', initMatchingRoutes(pool, {
  relationshipFilter,
  collaborationMatcher
}));
```

**After:**
```javascript
const RelationshipRouter = require('./lib/relationship-router');

const relationshipRouter = new RelationshipRouter({
  db: pool,
  collaborationMatcher,
  defaultMode: 'exclusion' // Keep existing behavior
});

// Mount new routes
app.use('/api/family-tree', initFamilyTreeRoutes(pool, { relationshipRouter }));
app.use('/api/spheres', initSphereRoutes(pool, { relationshipRouter }));

// Update matching routes
app.use('/api/matching', initMatchingRoutes(pool, {
  relationshipRouter, // Now supports both modes
  collaborationMatcher
}));
```

#### 3. Backward Compatibility

RelationshipRouter extends RelationshipFilter and provides all the same methods:

- `isExcluded(user1Id, user2Id)`
- `blockUser(blockerId, blockedId)`
- `unblockUser(blockerId, blockedId)`
- `detectHousehold(userId, ipAddress, metadata)`
- `getExclusionStats(userId)`

**All existing exclusion functionality still works!**

---

## Advanced Topics

### 1. Sphere Analytics & Data Brokering

View analytics for a sphere:

```http
GET /api/spheres/analytics/college/stanford.edu?days=30
```

**Response:**
```json
{
  "sphereType": "college",
  "sphereValue": "stanford.edu",
  "summary": {
    "total_members": 1500,
    "verified_members": 1200,
    "avg_membership_score": 0.95
  },
  "analytics": [
    {
      "metric_date": "2024-01-15",
      "total_members": 1500,
      "verified_members": 1200,
      "new_members_today": 10,
      "active_members_7d": 800,
      "connection_count": 5000,
      "engagement_score": 75.5
    }
  ]
}
```

### 2. Batch Sphere Connection Sync

For large spheres, manually trigger connection sync:

```http
POST /api/spheres/sync-connections
Content-Type: application/json

{
  "sphereType": "college",
  "sphereValue": "stanford.edu"
}
```

This creates entries in `sphere_connections` table for all pairs of users in the sphere.

### 3. Custom Sphere Types

Add industry-specific spheres:

```sql
-- Example: Crypto/Web3 sphere
INSERT INTO sphere_definitions (
  sphere_type, display_name, description,
  verification_required, verification_method,
  pricing_tier
) VALUES (
  'blockchain_project',
  'Blockchain Project',
  'Contributors to blockchain/Web3 projects',
  true,
  'api_integration', -- Verify via GitHub API
  'premium'
);
```

---

## FAQ

### Q: Can I use both exclusion and inclusion modes in the same app?

**A:** Yes! Use `mode=hybrid` for the best of both worlds:

```http
GET /api/matching/find?mode=hybrid&includeFamilyTree=true
```

This will:
- Show family members and sphere connections
- Exclude manually blocked users
- Perfect for social networks with family features

---

### Q: How do I import existing family relationships from Facebook?

**A:** Use the existing Facebook import endpoint:

```http
POST /api/matching/import-facebook-friends
Content-Type: application/json

{
  "relationships": [
    {
      "facebookId": "12345",
      "type": "family",
      "name": "John Doe"
    }
  ]
}
```

Then convert to family tree:

```javascript
// Get Facebook family relationships
const fbFamily = await db.query(`
  SELECT related_user_id
  FROM user_relationships
  WHERE user_id = $1
    AND relationship_type = 'family'
    AND relationship_source = 'facebook'
`, [userId]);

// Add to family tree (requires manual confirmation)
for (const rel of fbFamily.rows) {
  // Show user a prompt to confirm and label relationship
  await relationshipRouter.addFamilyRelationship(
    userId,
    rel.related_user_id,
    'parent', // User must specify
    'facebook',
    { confidence: 0.9 }
  );
}
```

---

### Q: What's the difference between `sphere_connections` and `user_relationships`?

**A:**

- **`user_relationships`**: All relationships (family, friends, blocked)
  - Used for exclusion/inclusion matching
  - Created via multiple sources (Facebook, contacts, DNA, manual)

- **`sphere_connections`**: Connections derived ONLY from sphere membership
  - Lightweight, used for sphere-based discovery
  - Updated via triggers when users join spheres
  - Optimized for "find users in my college" queries

---

### Q: How do I prevent users from spamming sphere joins?

**A:** Add rate limiting middleware:

```javascript
const rateLimit = require('express-rate-limit');

const sphereJoinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  message: 'Too many sphere join requests, please try again later'
});

app.use('/api/spheres/join', sphereJoinLimiter);
app.use('/api/spheres/verify-email', sphereJoinLimiter);
```

---

## Support

For questions or issues:
- Check the migration files: `062_relationship_graph.sql`, `063_family_tree_and_spheres.sql`
- Review source code: `lib/relationship-router.js`
- See related docs: `FAMILY_EXCLUSION_GUIDE.md`

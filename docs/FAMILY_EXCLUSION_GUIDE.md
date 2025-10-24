# Family Exclusion & Relationship Filter System

> **Privacy-preserving matching filter that prevents family members, household members, and blocked users from being matched** (similar to dating apps like Tinder/Match.com, or prison conflict-of-interest rules)

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Detection Methods](#detection-methods)
- [API Endpoints](#api-endpoints)
- [Usage Examples](#usage-examples)
- [Database Schema](#database-schema)
- [Privacy & Security](#privacy--security)
- [Configuration](#configuration)

---

## Overview

The Relationship Filter System prevents matching users who should not be matched due to:
- **Family relationships** (siblings, parents, cousins)
- **Household members** (people living at same address)
- **Manual blocks** (user-initiated blocking)
- **Social connections** (Facebook friends, phone contacts)

### Real-World Analogues

This system is similar to:
- **Dating apps** (Tinder, Match.com, Bumble) - prevent matching family/friends
- **Prison systems** - prevent relatives from working at same facility
- **Corporate policies** - conflict-of-interest detection

### Key Features

✅ **Privacy-Preserving** - Never reveals WHY a match was excluded
✅ **Multi-Source Detection** - Facebook, phone contacts, IP addresses, surnames
✅ **Configurable Rules** - Hard blocks vs soft filters
✅ **Bidirectional** - Relationships work both ways
✅ **Caching** - Fast exclusion checks with 5-minute TTL

---

## How It Works

### Filter Chain

```
User Request
    ↓
[1] Collaboration Matcher finds potential matches
    ↓
[2] Relationship Filter applies exclusion rules:
    - Check hard blocks (family, manual blocks)
    - Calculate soft filtering score (friends)
    - Remove excluded matches
    - Deprioritize soft-filtered matches
    ↓
[3] Return filtered matches to user
```

### Exclusion Logic

**Hard Blocks** (completely excluded):
- Immediate family (siblings, parents)
- Extended family (cousins, aunts/uncles)
- Same household members
- Manual user blocks
- Same surname + age gap (parent/child heuristic)

**Soft Filters** (deprioritized, not fully excluded):
- Facebook friends (1st degree)
- Phone contacts
- Friends of friends (2nd degree)

---

## Detection Methods

### 1. Facebook Social Graph

Import family/friend relationships from Facebook:

```javascript
POST /api/matching/import-facebook-friends
{
  "relationships": [
    {
      "facebookId": "1234567890",
      "type": "family",  // or "friend"
      "name": "John Doe"
    }
  ]
}
```

**Relationship Types:**
- `immediate_family` → Hard block
- `family` → Hard block
- `friend` → Soft filter
- `friend_of_friend` → Soft filter (optional)

### 2. Phone Contact Matching

Upload phone contacts (privacy-preserving via SHA256 hashing):

```javascript
POST /api/matching/import-phone-contacts
{
  "contacts": [
    { "phone": "+1-555-123-4567" },
    { "email": "friend@example.com" }
  ]
}
```

**Privacy:**
- Contacts are hashed with SHA256 before storage
- Only hashes are stored, not raw data
- Enables overlap detection without revealing contacts

### 3. Household Detection

Detect users from same household via IP address:

```javascript
POST /api/matching/detect-household
// Uses IP from request headers automatically
```

**Detection Method:**
- Anonymizes IP to /24 subnet (e.g., 192.168.1.x)
- Creates fingerprint from subnet
- Groups users with same fingerprint into cluster
- Creates bidirectional exclusions between cluster members

**Example:**
```
User A (IP: 192.168.1.100) }
User B (IP: 192.168.1.101) } → Same /24 subnet → Household cluster → Excluded
User C (IP: 192.168.1.102) }
```

### 4. Surname + Age Gap Heuristics

Automatically detects family relationships:

**Heuristic 1: Parent/Child**
- Same surname (exact or phonetic match)
- Age difference 15-40 years
- → Hard block with 75% confidence

**Heuristic 2: Siblings**
- Same surname
- Age difference ≤ 5 years
- → Hard block with 75% confidence

**Phonetic Matching (Soundex):**
- `Smith` ≈ `Smyth` ≈ `Smithe`
- Prevents evasion via spelling variants

### 5. Manual Blocking

Users can manually block anyone:

```javascript
POST /api/matching/block/:userId
// Creates bidirectional hard block
```

---

## API Endpoints

### Find Matches (with exclusions)

```javascript
GET /api/matching/find?limit=10&minScore=0.5
```

**Response:**
```json
{
  "matches": [
    {
      "userId": 123,
      "score": 0.85,
      "profile": { ... }
    }
  ],
  "count": 10
}
```

### Block User

```javascript
POST /api/matching/block/:userId
```

**Response:**
```json
{
  "success": true,
  "message": "User blocked successfully",
  "blockerId": 456,
  "blockedId": 123
}
```

### Unblock User

```javascript
DELETE /api/matching/block/:userId
```

### Get Blocked Users

```javascript
GET /api/matching/blocked
```

**Response:**
```json
{
  "blockedUsers": [
    {
      "related_user_id": 123,
      "username": "john_doe",
      "created_at": "2025-01-20T..."
    }
  ],
  "count": 1
}
```

### Check Exclusion (Debug)

```javascript
GET /api/matching/check-exclusion/:targetUserId
```

**Response:**
```json
{
  "isExcluded": true,
  "canMatch": false
  // Note: Specific reasons not revealed for privacy
}
```

### Get Exclusion Statistics

```javascript
GET /api/matching/exclusion-stats
```

**Response:**
```json
{
  "total_exclusions": 47,
  "family_count": 12,
  "household_count": 3,
  "blocked_count": 2,
  "friend_count": 30,
  "hard_blocks": 17,
  "soft_filters": 30,
  "note": "Specific exclusions are not revealed for privacy"
}
```

### System Stats (Admin)

```javascript
GET /api/matching/system-stats
```

**Response:**
```json
{
  "relationships": [
    {
      "relationship_type": "family",
      "relationship_source": "facebook",
      "relationship_count": 1234,
      "avg_confidence": 0.95,
      "hard_blocks": 1234,
      "soft_filters": 0
    }
  ],
  "households": {
    "total_clusters": 567,
    "total_members": 1890,
    "avg_cluster_size": 3.33,
    "max_cluster_size": 12
  }
}
```

---

## Usage Examples

### Basic Matching (Existing Collaboration Matcher)

```javascript
const CollaborationMatcher = require('./lib/collaboration-matcher');
const RelationshipFilter = require('./lib/relationship-filter');

// Initialize
const collaborationMatcher = new CollaborationMatcher({ db });
const relationshipFilter = new RelationshipFilter({
  db,
  collaborationMatcher
});

// Find matches with family exclusions
const matches = await relationshipFilter.findMatches(userId, {
  limit: 20,
  minScore: 0.6
});
```

### Manual Blocking

```javascript
// User blocks someone
await relationshipFilter.blockUser(blockerId, blockedId);

// User unblocks someone
await relationshipFilter.unblockUser(blockerId, blockedId);
```

### Household Detection

```javascript
// Detect household from IP address
await relationshipFilter.detectHousehold(
  userId,
  '192.168.1.100',
  { userAgent: 'Mozilla/...', timestamp: new Date() }
);
```

### Surname-Based Detection

```javascript
// Check if two users should be excluded based on surname + age
await relationshipFilter.detectSurnameRelationship(
  user1Id,
  user2Id,
  'Smith',  // surname1
  'Smyth',  // surname2 (phonetic variant)
  45,       // age1
  20        // age2 (25 year gap → likely parent/child)
);
```

---

## Database Schema

### Core Tables

**`user_relationships`**
```sql
- relationship_id (PK)
- user_id → Foreign key to users
- related_user_id → Foreign key to users
- relationship_type → 'family', 'friend', 'household', 'blocked'
- relationship_source → 'facebook', 'manual', 'phone_contacts', 'surname_heuristic'
- degree → 1 (direct), 2 (friend-of-friend)
- confidence_score → 0.0-1.0
- is_hard_block → true/false
- metadata → JSON (additional context)
```

**`household_clusters`**
```sql
- cluster_id (PK)
- cluster_fingerprint → SHA256 hash of IP subnet
- detection_method → 'ip_address', 'physical_address', 'payment_method'
- member_count → Number of users in cluster
- first_seen, last_seen → Timestamps
```

**`surname_variants`**
```sql
- variant_id (PK)
- base_surname → Canonical form
- variant_surname → Spelling variant
- phonetic_code → Soundex/Metaphone code
- similarity_score → 0.0-1.0
```

**`contact_hashes`**
```sql
- hash_id (PK)
- user_id → Foreign key to users
- contact_hash → SHA256(phone/email)
- contact_type → 'phone', 'email'
```

**`exclusion_rules`**
```sql
- rule_id (PK)
- rule_name → Human-readable name
- rule_type → 'family', 'household', 'surname', 'manual_block', 'friend'
- is_enabled → true/false
- is_hard_block → true (never match) / false (deprioritize)
- min_confidence → Minimum confidence to trigger (0.0-1.0)
- priority → Higher = checked first
- rule_config → JSON configuration
```

### Database Functions

**`add_bidirectional_relationship()`**
```sql
-- Creates relationship in both directions (A→B and B→A)
SELECT add_bidirectional_relationship(
  user1_id INTEGER,
  user2_id INTEGER,
  relationship_type VARCHAR,
  relationship_source VARCHAR,
  degree INTEGER DEFAULT 1,
  confidence DECIMAL DEFAULT 1.0,
  is_hard_block BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'
);
```

**`is_match_excluded()`**
```sql
-- Returns true if two users should NOT be matched
SELECT is_match_excluded(user1_id INTEGER, user2_id INTEGER);
-- Returns: BOOLEAN
```

**`get_exclusion_score()`**
```sql
-- Returns weighted exclusion score for soft filtering
SELECT get_exclusion_score(user1_id INTEGER, user2_id INTEGER);
-- Returns: DECIMAL (0.0 = no exclusion, 1.0+ = high exclusion)
```

### Views

**`relationship_stats`**
```sql
-- Aggregated statistics by relationship type and source
SELECT * FROM relationship_stats;
```

**`household_summary`**
```sql
-- Household clusters with member counts
SELECT * FROM household_summary;
```

---

## Privacy & Security

### Privacy Principles

1. **Never Reveal WHY** - Users are never told WHY a match was excluded
   - ❌ Don't say: "You can't match because you're siblings"
   - ✅ Just don't show the match at all

2. **Hashed Contacts** - Phone numbers/emails are SHA256 hashed
   - Original data is never stored
   - Only hashes enable overlap detection

3. **IP Anonymization** - IP addresses are anonymized to /24 subnets
   - 192.168.1.100 → 192.168.1.0/24
   - Prevents exact geolocation tracking

4. **Metadata Encryption** - Relationship metadata can be encrypted at rest
   - Recommended for GDPR compliance

5. **User Control** - Users can:
   - See count of exclusions (not details)
   - Manually block/unblock anyone
   - Request deletion of relationship data (GDPR)

### Security Considerations

**Evasion Prevention:**
- Surname phonetic matching catches spelling variants
- IP clustering catches VPN switching within same subnet
- Bidirectional relationships prevent one-sided evasion

**False Positives:**
- Confidence scores allow tuning sensitivity
- Soft filters deprioritize instead of fully excluding
- Rules can be enabled/disabled per type

**GDPR Compliance:**
- Right to deletion: Remove user from `user_relationships`
- Right to access: Show exclusion counts (not details)
- Right to rectify: Allow unblocking false positives

---

## Configuration

### Default Exclusion Rules

Configured in `exclusion_rules` table:

| Rule Name | Type | Hard Block | Min Confidence | Priority |
|-----------|------|------------|----------------|----------|
| Immediate Family | family | ✅ | 0.90 | 1000 |
| Extended Family | family | ✅ | 0.80 | 900 |
| Same Household | household | ✅ | 0.85 | 800 |
| Same Surname + Age Gap | surname | ✅ | 0.75 | 700 |
| Same Surname + Similar Age | surname | ✅ | 0.75 | 600 |
| Manual Block | manual_block | ✅ | 1.00 | 2000 |
| Phone Contacts | friend | ❌ | 0.90 | 500 |
| Facebook Friends | friend | ❌ | 0.90 | 400 |
| Friends of Friends | friend | ❌ | 0.70 | 300 |

### Adjusting Rules

Enable/disable rules:

```sql
UPDATE exclusion_rules
SET is_enabled = false
WHERE rule_name = 'Friends of Friends';
```

Change from hard block to soft filter:

```sql
UPDATE exclusion_rules
SET is_hard_block = false
WHERE rule_type = 'friend';
```

Adjust confidence threshold:

```sql
UPDATE exclusion_rules
SET min_confidence = 0.85
WHERE rule_type = 'household';
```

### Caching Configuration

```javascript
const relationshipFilter = new RelationshipFilter({ db });

// Adjust cache TTL (default: 5 minutes)
relationshipFilter.cacheTTL = 10 * 60 * 1000; // 10 minutes
```

---

## Testing

### Test Family Exclusion

```javascript
// Create test family relationship
await db.query(`
  SELECT add_bidirectional_relationship(
    123, 456, 'family', 'manual', 1, 1.0, true, '{}'
  )
`);

// Check exclusion
const result = await relationshipFilter.isExcluded(123, 456);
console.log(result.isExcluded); // true

// Verify matches don't include excluded user
const matches = await relationshipFilter.findMatches(123, { limit: 10 });
const excludedMatch = matches.find(m => m.userId === 456);
console.log(excludedMatch); // undefined
```

### Test Household Detection

```javascript
// Add users to same household
await relationshipFilter.detectHousehold(123, '192.168.1.100');
await relationshipFilter.detectHousehold(456, '192.168.1.101'); // Same subnet

// Check relationship was created
const result = await db.query(`
  SELECT * FROM user_relationships
  WHERE user_id = 123 AND related_user_id = 456
    AND relationship_type = 'household'
`);
console.log(result.rows.length); // 1
```

### Test Surname Matching

```javascript
// Test phonetic matching
const match1 = relationshipFilter.surnamesMatch('Smith', 'Smyth');
console.log(match1); // true (phonetic match)

const match2 = relationshipFilter.surnamesMatch('Jones', 'Johnson');
console.log(match2); // false (different)
```

---

## Migration Path

For existing systems adding family exclusion:

1. **Run Migration 062**
   ```bash
   psql -d your_database -f database/migrations/062_relationship_graph.sql
   ```

2. **Add Facebook ID Column** (if using Facebook import)
   ```sql
   ALTER TABLE users ADD COLUMN facebook_id VARCHAR(100) UNIQUE;
   ```

3. **Initialize Relationship Filter**
   ```javascript
   const relationshipFilter = new RelationshipFilter({
     db,
     collaborationMatcher: existingMatcher // Optional
   });
   ```

4. **Mount Routes**
   ```javascript
   const { initializeRoutes } = require('./routes/matching-routes');
   app.use('/api/matching', initializeRoutes(db, { relationshipFilter }));
   ```

5. **Trigger Initial Detections** (Optional)
   - Bulk import Facebook friends
   - Bulk detect households from login IPs
   - Bulk detect surname relationships

---

## FAQ

**Q: What if someone has a common surname like "Smith"?**
A: Surname matching also requires age gap heuristics (parent/child or sibling range). Common surnames alone won't trigger exclusion.

**Q: Can users see why they were excluded?**
A: No. For privacy, users only see that someone isn't in their matches. They don't know if it's due to family, household, or other reasons.

**Q: What if false positives occur?**
A: Soft filters (friends, contacts) deprioritize but don't fully exclude. Hard blocks (family) use high confidence thresholds (0.75+). Users can also manually unblock false positives.

**Q: How does this affect performance?**
A: Caching (5-min TTL) and database indexes make exclusion checks fast (< 10ms per check). Use database functions for bulk filtering.

**Q: Can admins see exclusion reasons?**
A: Yes, use `includeExclusionReasons: true` in `findMatches()` for debugging (admin only).

---

## Related Systems

- **CollaborationMatcher** (`lib/collaboration-matcher.js`) - Learns similar interests/skills
- **TalentRanker** (`lib/talent-ranker.js`) - Scores candidates for recruiting
- **Author Workflow** (`lib/author-workflow.js`) - Publishes candidate profiles

**Integration Example:**
```javascript
// Use family exclusion with talent ranking
const matches = await relationshipFilter.findMatches(userId, { limit: 50 });
const rankedMatches = matches.map(m => ({
  ...m,
  talentScore: await talentRanker.scoreCandidate(m.userId)
}));
```

---

## Support

For questions or issues:
- 📧 Check existing relationships: `GET /api/matching/exclusion-stats`
- 🐛 Enable debug mode: `includeExclusionReasons: true`
- 📊 View system stats: `GET /api/matching/system-stats`
- 🔍 Check specific exclusion: `GET /api/matching/check-exclusion/:userId`

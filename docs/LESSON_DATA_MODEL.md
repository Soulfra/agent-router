# Lesson Data Model - Canonical Reference

**Last Updated:** 2025-10-20
**Status:** ✅ Authoritative Source of Truth

This document defines the canonical data model for lessons in the CALOS Learning Platform. If you're confused about lesson numbering, identifiers, or data structure, this is your guide.

---

## The Confusion: Multiple "Layers"

You might see different identifiers for lessons across the system. Here's why:

| Identifier | Type | Purpose | Example | User-Facing? |
|------------|------|---------|---------|--------------|
| `lesson_id` | UUID | Database primary key, internal references | `a1b2c3d4-...` | ❌ No |
| `lesson_number` | Integer | Sequential position within path (1, 2, 3...) | `1`, `2`, `3` | ✅ Yes |
| `lesson_slug` | Text | URL-friendly identifier | `introduction-to-infrastructure-as-code` | ✅ Yes |
| `lesson_title` | Text | Human-readable name | "Introduction to Infrastructure as Code" | ✅ Yes |

### Why Multiple Identifiers?

- **`lesson_id` (UUID):** Globally unique, never changes, used for database relationships (foreign keys, joins)
- **`lesson_number` (Integer):** User-facing ordering (Lesson 1, Lesson 2, etc.), sequential within each path
- **`lesson_slug` (Text):** Used in URLs: `/learn/soulfra-mastery/introduction-to-infrastructure-as-code`
- **`lesson_title` (Text):** Displayed to users in UI

**IMPORTANT:** The `lesson_number` is what users see. The `lesson_id` is internal plumbing.

---

## Database Schema

**Table:** `lessons` (defined in `migrations/020_learning_platform.sql:47-82`)

```sql
CREATE TABLE IF NOT EXISTS lessons (
  -- Primary Key (internal, UUID)
  lesson_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Path Association
  path_id UUID NOT NULL REFERENCES learning_paths(path_id) ON DELETE CASCADE,

  -- User-Facing Identifiers
  lesson_number INT NOT NULL,                    -- Position: 1, 2, 3...
  lesson_title VARCHAR(255) NOT NULL,            -- "Introduction to Infrastructure as Code"
  lesson_slug VARCHAR(255) NOT NULL,             -- "introduction-to-infrastructure-as-code"

  -- Metadata
  description TEXT,
  learning_objectives TEXT[],

  -- Prerequisites
  requires_lesson_id UUID REFERENCES lessons(lesson_id),
  required_xp INT DEFAULT 0,

  -- Content
  content_type VARCHAR(50) DEFAULT 'challenge',
  content_data JSONB,
  estimated_minutes INT DEFAULT 30,

  -- Rewards
  xp_reward INT DEFAULT 100,
  bonus_xp_conditions JSONB,

  -- Status
  status VARCHAR(50) DEFAULT 'published',
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- CRITICAL CONSTRAINTS
  UNIQUE(path_id, lesson_number),               -- Prevents duplicate numbers within same path
  UNIQUE(path_id, lesson_slug)                  -- Prevents duplicate slugs within same path
);
```

### Critical Constraints Explained

**`UNIQUE(path_id, lesson_number)`**
- Each learning path can have **exactly ONE** lesson with `lesson_number = 1`
- Each learning path can have **exactly ONE** lesson with `lesson_number = 2`
- And so on...
- **No duplicates allowed** within the same path

**`UNIQUE(path_id, lesson_slug)`**
- Each learning path can have **exactly ONE** lesson with a given slug
- Prevents URL conflicts

---

## Canonical Lesson Structure

**Source of Truth:** `scripts/seed-learning-paths.js`

### How Lesson Numbers Are Assigned

From `scripts/seed-learning-paths.js:469`:

```javascript
lesson_number = i + 1  // Array index + 1 (simple sequential)
```

This means:
- First lesson in array → `lesson_number = 1`
- Second lesson in array → `lesson_number = 2`
- Third lesson in array → `lesson_number = 3`
- And so on...

### How Slugs Are Generated

From `scripts/seed-learning-paths.js:471`:

```javascript
lesson_slug = lesson.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
```

**Example:**
- Title: `"Introduction to Infrastructure as Code"`
- Slug: `"introduction-to-infrastructure-as-code"`

### How Prerequisites Are Linked

From `scripts/seed-learning-paths.js:459`:

```javascript
requires_lesson_id = i > 0 ? previousLessonId : null
```

This means:
- Lesson 1 has **no prerequisite** (`requires_lesson_id = NULL`)
- Lesson 2 requires Lesson 1 (`requires_lesson_id = lesson_1_uuid`)
- Lesson 3 requires Lesson 2 (`requires_lesson_id = lesson_2_uuid`)
- And so on (linear progression)

---

## Complete Lesson Inventory

**12 Learning Paths, 111 Total Lessons**

| Domain | Path Slug | Lessons | Total XP | First Lesson |
|--------|-----------|---------|----------|--------------|
| **soulfra.com** | `soulfra-mastery` | 10 | 1,310 | Introduction to Infrastructure as Code |
| **deathtodata.com** | `data-liberation` | 15 | 1,825 | The Problem with Data Silos |
| **finishthisidea.com** | `idea-execution` | 8 | 940 | From Idea to MVP |
| **botchcraft.com** | `bot-building` | 10 | 1,250 | Bot Architecture Basics |
| **perfectshrugs.com** | `minimalist-design` | 8 | 890 | The Power of Simplicity |
| **makeitstartup.com** | `startup-foundations` | 10 | 1,230 | Validating Your Idea |
| **calconsult.com** | `ai-consulting` | 10 | 1,345 | AI Landscape Overview |
| **ralphdesignschool.com** | `ralph-design` | 10 | 1,210 | Design Principles |
| **mauercorp.com** | `enterprise-engineering` | 12 | 1,690 | Enterprise Architecture Patterns |
| **aistreetjournal.com** | `ai-journalism` | 8 | 940 | AI in Content Creation |
| **techpanionship.com** | `tech-mentorship` | 10 | 1,160 | Code Review Best Practices |
| **votevalence.com** | `voting-systems` | 10 | 1,325 | Voting Theory Basics |
| **TOTAL** | — | **111** | **14,115** | — |

---

## Example: deathtodata.com Lessons

**Path:** Data Liberation Academy (`data-liberation`)
**Lessons:** 15
**Total XP:** 1,825

| # | Title | XP | Slug |
|---|-------|-----|------|
| 1 | The Problem with Data Silos | 90 | `the-problem-with-data-silos` |
| 2 | Database Design Principles | 110 | `database-design-principles` |
| 3 | Data Normalization: ZIP Codes, Phone Numbers, and Names | 120 | `data-normalization-zip-codes-phone-numbers-and-names` |
| 4 | Address Standardization and Formatting | 110 | `address-standardization-and-formatting` |
| 5 | Data Cleansing: Handling Messy Real-World Data | 130 | `data-cleansing-handling-messy-real-world-data` |
| 6 | Privacy Techniques: Email Tagging for Breach Detection | 125 | `privacy-techniques-email-tagging-for-breach-detection` |
| 7 | Fuzzy Matching and Record Deduplication | 140 | `fuzzy-matching-and-record-deduplication` |
| 8 | Identity Resolution: Linking Data Points | 135 | `identity-resolution-linking-data-points` |
| 9 | OSINT Basics: What Can Be Discovered? | 130 | `osint-basics-what-can-be-discovered` |
| 10 | ETL Pipeline Architecture | 130 | `etl-pipeline-architecture` |
| 11 | Data Warehousing Concepts | 120 | `data-warehousing-concepts` |
| 12 | Real-time Streaming | 140 | `real-time-streaming` |
| 13 | Data Quality and Validation | 110 | `data-quality-and-validation` |
| 14 | Data Governance and Ethics | 115 | `data-governance-and-ethics` |
| 15 | Final Project: Build a Complete Data Pipeline | 200 | `final-project-build-a-complete-data-pipeline` |

**Prerequisites:** Each lesson requires the previous lesson (linear progression 1→2→3→...→15)

---

## How Lessons Are Created

### 1. Database Migration (One-Time Setup)

```bash
psql $DATABASE_URL -f migrations/020_learning_platform.sql
```

This creates the `lessons` table with all constraints.

### 2. Seed Script (One-Time Population)

```bash
node scripts/seed-learning-paths.js
```

This script:
1. Reads lesson configurations from `learningPathConfigs` object
2. Creates learning paths in `learning_paths` table
3. For each path, iterates through lessons array:
   - Sets `lesson_number = i + 1` (sequential)
   - Generates `lesson_slug` from title
   - Links `requires_lesson_id` to previous lesson UUID
4. Inserts all 111 lessons into `lessons` table

### 3. Seeding Logic (Critical Code)

**File:** `scripts/seed-learning-paths.js:457-478`

```javascript
for (let i = 0; i < config.lessons.length; i++) {
  const lesson = config.lessons[i];
  const requiresLessonId = i > 0 ? createdPaths[createdPaths.length - 1].lastLessonId : null;

  const lessonResult = await db.query(
    `INSERT INTO lessons (
      path_id, lesson_number, lesson_title, lesson_slug,
      requires_lesson_id, xp_reward, active, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
    RETURNING lesson_id`,
    [
      pathResult.rows[0].path_id,
      i + 1,  // ← lesson_number: sequential
      lesson.title,
      lesson.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),  // ← slug: auto-generated
      requiresLessonId,  // ← prerequisite: previous lesson UUID
      lesson.xpReward
    ]
  );

  createdPaths[createdPaths.length - 1].lastLessonId = lessonResult.rows[0].lesson_id;
}
```

---

## Common Misconceptions

### ❌ "Lesson 1 in different paths have the same lesson_id"

**FALSE.** Every lesson has a **unique UUID** (`lesson_id`). The `lesson_number` can repeat across paths (every path has a Lesson 1), but each has a different UUID.

**Example:**
- Soulfra Lesson 1: `lesson_id = a1b2c3d4-...`, `lesson_number = 1`
- DeathToData Lesson 1: `lesson_id = x9y8z7w6-...`, `lesson_number = 1`

### ❌ "I can change lesson_number manually"

**FALSE.** The `UNIQUE(path_id, lesson_number)` constraint prevents you from creating duplicates. If you try to set two lessons in the same path to `lesson_number = 1`, the database will reject it.

### ❌ "Slugs are manually defined"

**FALSE.** Slugs are **auto-generated** from titles during seeding. The formula is:
```javascript
title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
```

### ❌ "Lesson numbers must start at 1"

**Technically FALSE, but practically TRUE.** The database doesn't enforce starting at 1, but the seed script always starts at `i + 1` where `i = 0`, so the first lesson is always `lesson_number = 1`.

---

## Querying Lessons

### Get Next Lesson for User

**From:** `lib/learning-engine.js:123-158`

```sql
SELECT l.*, dc.challenge_title, dc.challenge_prompt
FROM lessons l
LEFT JOIN domain_challenges dc ON l.challenge_id = dc.challenge_id
WHERE l.path_id = $pathId
  AND l.active = true
  AND l.lesson_id NOT IN (
    SELECT lesson_id FROM lesson_completions WHERE user_id = $userId
  )
  AND (
    l.requires_lesson_id IS NULL OR
    l.requires_lesson_id IN (
      SELECT lesson_id FROM lesson_completions WHERE user_id = $userId
    )
  )
ORDER BY l.lesson_number
LIMIT 1
```

**Logic:**
1. Filter by path
2. Exclude completed lessons
3. Check prerequisites are met
4. **Order by `lesson_number`** (this is why sequential numbering matters!)
5. Return first uncompleted lesson

### Get All Lessons for a Path

```sql
SELECT lesson_id, lesson_number, lesson_title, xp_reward
FROM lessons
WHERE path_id = $pathId
  AND active = true
ORDER BY lesson_number;
```

### Check for Duplicate Numbers (Diagnostic)

```sql
SELECT path_id, lesson_number, COUNT(*) as duplicates
FROM lessons
GROUP BY path_id, lesson_number
HAVING COUNT(*) > 1;
```

If this returns rows, **you have conflicts**. Run normalization script.

---

## Resolving Conflicts

### Diagnostic Tool

```bash
node scripts/diagnose-lesson-conflicts.js
```

This script checks for:
- Duplicate `lesson_number` within same path
- Missing sequential numbers (gaps)
- Slug/title mismatches
- Full lesson inventory

### Normalization Script (If Conflicts Found)

**File:** `scripts/normalize-lessons.js` (create if needed)

**Steps:**
1. Backup existing lesson data
2. For each path:
   - Order lessons by current `lesson_number`
   - Re-number sequentially starting from 1
   - Regenerate slugs from titles
   - Preserve `lesson_id` UUIDs (for referential integrity)
3. Update database

### Prevention

**DO:**
- Always use `scripts/seed-learning-paths.js` as source of truth
- Add lessons to the `learningPathConfigs` object in seed script
- Re-run seed script to update (it checks for existing paths)

**DON'T:**
- Manually INSERT lessons with custom `lesson_number`
- Change `lesson_number` in database after seeding
- Create lessons outside of seed script
- Modify slugs manually

---

## API Usage

### Get Lessons for a Path

**Endpoint:** `GET /api/learning/paths/:pathSlug`

**Response:**
```json
{
  "success": true,
  "path": {
    "path_id": "uuid-...",
    "path_name": "Data Liberation Academy",
    "path_slug": "data-liberation",
    "icon_emoji": "💀"
  },
  "lessons": [
    {
      "lesson_id": "uuid-...",
      "lesson_number": 1,
      "lesson_title": "The Problem with Data Silos",
      "lesson_slug": "the-problem-with-data-silos",
      "xp_reward": 90
    },
    {
      "lesson_id": "uuid-...",
      "lesson_number": 2,
      "lesson_title": "Database Design Principles",
      "lesson_slug": "database-design-principles",
      "xp_reward": 110
    }
    // ... 13 more lessons
  ]
}
```

### Complete a Lesson

**Endpoint:** `POST /api/learning/complete-lesson`

**Body:**
```json
{
  "userId": "user_123",
  "lessonId": "uuid-...",  // ← Use lesson_id (UUID), not lesson_number!
  "score": 95,
  "timeSpentMinutes": 12
}
```

**IMPORTANT:** Use `lesson_id` (UUID) in API calls, not `lesson_number`.

---

## Summary: The Rules

1. **`lesson_id` (UUID)** = Internal, unique globally, never exposed to users
2. **`lesson_number` (Integer)** = User-facing, sequential (1, 2, 3...), unique per path
3. **`lesson_slug` (Text)** = URL-friendly, auto-generated from title
4. **`lesson_title` (Text)** = Human-readable, user-facing

5. **Constraints enforce uniqueness:**
   - `UNIQUE(path_id, lesson_number)` - No duplicate numbers per path
   - `UNIQUE(path_id, lesson_slug)` - No duplicate slugs per path

6. **Source of truth:** `scripts/seed-learning-paths.js`

7. **Numbering is sequential:** `lesson_number = array_index + 1`

8. **Prerequisites are linear:** Each lesson requires the previous lesson

9. **Slugs are auto-generated:** `title.toLowerCase().replace(/[^a-z0-9]+/g, '-')`

10. **12 paths, 111 lessons, 14,115 total XP**

---

## Troubleshooting

**"I'm seeing the same lesson number with different titles!"**

- Check if lessons are from different paths (each path has its own Lesson 1, Lesson 2, etc.)
- Run diagnostic script: `node scripts/diagnose-lesson-conflicts.js`
- If duplicates exist within same path, run normalization script

**"Slugs don't match titles!"**

- Slugs are auto-generated during seeding
- If you changed a title after seeding, re-run seed script or regenerate slugs

**"I can't add a new lesson with lesson_number = 1!"**

- Path already has a Lesson 1 (UNIQUE constraint)
- Use next available number (e.g., if path has 10 lessons, use `lesson_number = 11`)
- Or re-run seed script with updated lesson array

**"UUIDs are confusing!"**

- Think of UUIDs as database plumbing (you rarely see them)
- Users see `lesson_number` (1, 2, 3...) and `lesson_title`
- URLs use `lesson_slug`

---

**For questions or issues, see:**
- Database Schema: `migrations/020_learning_platform.sql`
- Seed Script: `scripts/seed-learning-paths.js`
- Learning Engine: `lib/learning-engine.js`
- Platform Guide: `LEARNING_PLATFORM_GUIDE.md`

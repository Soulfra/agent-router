# Lesson Structure Quick Reference

**TL;DR:** Lessons have multiple identifiers for different purposes. Here's what you need to know.

---

## The "Different Layers" Explained

| What You See | What It Is | Example | Purpose |
|--------------|------------|---------|---------|
| **Lesson 1** | `lesson_number` (Integer) | `1`, `2`, `3` | User-facing position in path |
| **UUID** | `lesson_id` (UUID) | `a1b2c3d4-...` | Internal database ID (hidden from users) |
| **URL Slug** | `lesson_slug` (Text) | `introduction-to-infrastructure-as-code` | Used in URLs |
| **Title** | `lesson_title` (Text) | "Introduction to Infrastructure as Code" | Displayed in UI |

**Why multiple IDs?**
- `lesson_id` = Database plumbing (joins, foreign keys)
- `lesson_number` = What users see (Lesson 1, 2, 3...)
- `lesson_slug` = URLs (`/learn/path/lesson-slug`)
- `lesson_title` = UI display

---

## Key Facts

1. **Sequential Numbering:** Lessons are numbered 1, 2, 3... within each path
2. **No Duplicates:** Each path can only have ONE lesson with lesson_number=1, ONE with lesson_number=2, etc.
3. **Auto-Generated Slugs:** Slugs are created from titles: `"Hello World"` → `"hello-world"`
4. **Linear Prerequisites:** Lesson 2 requires Lesson 1, Lesson 3 requires Lesson 2, etc.
5. **12 Paths, 111 Lessons:** Total across all domains

---

## Source of Truth

**File:** `scripts/seed-learning-paths.js`

This script defines all lessons for all paths. It is the **canonical source** of lesson data.

**Lesson Numbering Logic:**
```javascript
lesson_number = array_index + 1
```

**Slug Generation:**
```javascript
lesson_slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
```

---

## Common Questions

**Q: "I'm seeing Lesson 1 in multiple places with different text!"**
A: Each **path** has its own Lesson 1. Soulfra has a Lesson 1, DeathToData has a Lesson 1, etc. They're different lessons in different paths.

**Q: "What's the difference between lesson_id and lesson_number?"**
A:
- `lesson_id` = Internal UUID (globally unique, never changes)
- `lesson_number` = User-facing position (1, 2, 3..., unique per path)

**Q: "Can I change lesson numbers manually?"**
A: No. The database has a `UNIQUE(path_id, lesson_number)` constraint. You can't have two lessons with the same number in the same path.

**Q: "How do I add a new lesson?"**
A: Edit `scripts/seed-learning-paths.js`, add lesson to appropriate path array, re-run seed script.

---

## Tools

### Check for Conflicts
```bash
node scripts/diagnose-lesson-conflicts.js
```

Shows:
- Duplicate lesson_numbers within same path
- Missing numbers (gaps in sequence)
- Slug/title mismatches
- Full lesson inventory

### Fix Conflicts
```bash
# Dry run (see what would change)
node scripts/normalize-lessons.js --dry-run

# Fix all paths
node scripts/normalize-lessons.js

# Fix specific path
node scripts/normalize-lessons.js --path=data-liberation
```

### Seed Database
```bash
# First time (create tables)
psql $DATABASE_URL -f migrations/020_learning_platform.sql

# Populate lessons
node scripts/seed-learning-paths.js
```

---

## Example: deathtodata.com

**Path:** `data-liberation` (15 lessons, 1,825 XP)

| # | Title | XP |
|---|-------|-----|
| 1 | The Problem with Data Silos | 90 |
| 2 | Database Design Principles | 110 |
| 3 | Data Normalization: ZIP Codes, Phone Numbers, and Names | 120 |
| ... | ... | ... |
| 15 | Final Project: Build a Complete Data Pipeline | 200 |

**UUIDs:** Each lesson has a unique `lesson_id` UUID (e.g., `a1b2c3d4-...`)
**Slugs:** Auto-generated (e.g., `the-problem-with-data-silos`)
**Prerequisites:** Linear (2 requires 1, 3 requires 2, etc.)

---

## Full Inventory

| Domain | Lessons | Total XP |
|--------|---------|----------|
| soulfra.com | 10 | 1,310 |
| deathtodata.com | 15 | 1,825 |
| finishthisidea.com | 8 | 940 |
| botchcraft.com | 10 | 1,250 |
| perfectshrugs.com | 8 | 890 |
| makeitstartup.com | 10 | 1,230 |
| calconsult.com | 10 | 1,345 |
| ralphdesignschool.com | 10 | 1,210 |
| mauercorp.com | 12 | 1,690 |
| aistreetjournal.com | 8 | 940 |
| techpanionship.com | 10 | 1,160 |
| votevalence.com | 10 | 1,325 |
| **TOTAL** | **111** | **14,115** |

---

## Database Constraints

```sql
UNIQUE(path_id, lesson_number)  -- No duplicate numbers in same path
UNIQUE(path_id, lesson_slug)    -- No duplicate slugs in same path
```

These constraints **prevent conflicts**. You cannot:
- Have two lessons with `lesson_number=1` in the same path
- Have two lessons with the same slug in the same path

---

## Learn More

**Full Documentation:** `docs/LESSON_DATA_MODEL.md`
**Database Schema:** `migrations/020_learning_platform.sql`
**Seed Script:** `scripts/seed-learning-paths.js`
**Platform Guide:** `LEARNING_PLATFORM_GUIDE.md`

---

**Last Updated:** 2025-10-20

# Migration Guide

**Last Updated:** 2025-10-22

## Current State

- ✅ **139 migrations applied** (see `backups/applied-migrations-snapshot.txt`)
- ✅ **PostgreSQL working** (`calos` database, 447 tables)
- ✅ **Backup created:** `backups/calos-working-state.sql` (2.0MB)
- ✅ **Auto-migrator simplified:** Only scans `database/migrations/`

## Quick Reference

| Item | Value |
|------|-------|
| Database | PostgreSQL `calos` |
| Host | localhost:5432 |
| User | matthewmauer |
| Migrations Applied | 139 |
| Tables | 447 |
| Migration Directory | `database/migrations/` (ONLY) |
| Backup Location | `backups/` |

## Creating New Migrations

### Step 1: Number Your Migration

**Next available number:** `140`

```bash
# Use 3-digit format: 140, 141, 142, etc.
# Format: NNN_descriptive_name.sql
```

### Step 2: Create File

```bash
touch database/migrations/140_add_your_feature.sql
```

### Step 3: Write SQL

```sql
-- Migration: Add Your Feature
-- Purpose: Brief description of what this does
-- Date: 2025-10-22

CREATE TABLE IF NOT EXISTS your_new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_your_table_name ON your_new_table(name);
```

### Step 4: Test Migration

```bash
# Dry run (preview)
node database/run-migrations.js --status

# Apply migration
node database/run-migrations.js

# Or restart server (auto-migrates on startup)
npm start
```

## Migration Best Practices

### ✅ DO

1. **Use `IF NOT EXISTS`** - Makes migrations idempotent
   ```sql
   CREATE TABLE IF NOT EXISTS ...
   CREATE INDEX IF NOT EXISTS ...
   ```

2. **Number sequentially** - Start at 140, increment by 1

3. **Add comments** - Explain WHY not just WHAT
   ```sql
   -- Purpose: Store user preferences for dark mode
   -- Related: Feature request #123
   ```

4. **Test locally first** - Run on dev DB before production

5. **Keep migrations small** - One feature per migration

### ❌ DON'T

1. **Don't modify existing migrations** - They're already applied
2. **Don't skip numbers** - Keep sequential (140, 141, 142...)
3. **Don't use hardcoded IDs** - Use UUIDs or auto-increment
4. **Don't drop tables without backup** - Data loss is permanent
5. **Don't mix concerns** - One migration = one feature

## Existing Migrations (001-139)

All migrations 001-139 have been applied. See full list:

```bash
cat backups/applied-migrations-snapshot.txt
```

**Key migrations:**
- `001-004`: Core platform (time differentials, pricing, knowledge)
- `005-020`: Features (domains, ELO, OAuth, licensing)
- `020`: **Learning platform** (lessons, paths, user_progress)
- `021-060`: Advanced features (literacy, analytics, webhooks)
- `061-139`: Extended features (recruiting, marketplace, portfolios)

## Database Schema

### Learning System Tables

The CAL learning system uses these tables:

| Table | Purpose |
|-------|---------|
| `learning_paths` | Learning tracks (e.g., "Build Your AI") |
| `lessons` | Individual lessons in a path |
| `lesson_completions` | Tracks which lessons Cal completed |
| `user_progress` | User XP, levels, streaks |

**Created by:** `020_learning_platform.sql` (root migrations folder)

### Other Key Tables

- `users` - User accounts
- `skills` - Skill definitions
- `user_skills` - User skill progress
- `action_definitions` - Available actions
- `effect_definitions` - Action effects
- `migration_history` - Applied migrations tracker

## Troubleshooting

### "Migration already exists" error

```bash
# Check what's applied:
psql -h localhost -U matthewmauer -d calos -c "SELECT * FROM migration_history ORDER BY migration_id DESC LIMIT 10;"
```

### Fresh start (DANGEROUS)

```bash
# Drop database
dropdb -h localhost -U matthewmauer calos

# Recreate
createdb -h localhost -U matthewmauer calos

# Run all migrations
node database/run-migrations.js
```

### Restore from backup

```bash
# Drop and recreate database
dropdb -h localhost -U matthewmauer calos
createdb -h localhost -U matthewmauer calos

# Restore backup
psql -h localhost -U matthewmauer -d calos < backups/calos-working-state.sql
```

## Deprecated

- ❌ **`/migrations/` folder** - No longer scanned (consolidated to `database/migrations/`)
- ❌ **SQLite migrations** - PostgreSQL only (except `data/oauth-processing.db` for local logs)
- ❌ **Prisma** - Not used, pure SQL migrations

## Migration Workflow

```
1. Create migration file
   database/migrations/140_add_feature.sql

2. Write SQL
   CREATE TABLE IF NOT EXISTS ...

3. Test locally
   node database/run-migrations.js

4. Verify
   psql -d calos -c "\dt your_table"

5. Commit
   git add database/migrations/140_add_feature.sql
   git commit -m "Add feature migration"
```

## Help

### View database tables

```bash
psql -h localhost -U matthewmauer -d calos -c "\dt"
```

### Check migration status

```bash
node database/run-migrations.js --status
```

### Manual migration

```bash
psql -h localhost -U matthewmauer -d calos -f database/migrations/140_your_migration.sql
```

---

**Need help?** Check the audit document: `MIGRATION-AUDIT.md`

**Backup:** Always at `backups/calos-working-state.sql`

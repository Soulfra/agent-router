# Foreign Key / Primary Key Audit Report
Generated: Wed Oct 22 23:48:21 EDT 2025

- **Total Broken FKs:** 49
- **REFERENCES users(id):** 23 (column doesn't exist)
- **INTEGER type mismatch:** 26 (should be UUID)
- **Correct UUID FKs:** 129
## Executive Summary

**Critical Issues Found:**


## Issue 1: REFERENCES users(id) - BROKEN

**Problem:** Foreign keys reference `users(id)` but the column doesn't exist.
**users table PRIMARY KEY:** `user_id UUID`
**Fix:** Change `users(id)` → `users(user_id)`

**Count:** 23 occurrences

### Files with REFERENCES users(id):

```
database/migrations/028_add_experiments_system.sql:81
database/migrations/028_add_experiments_system.sql:103
database/migrations/026_add_training_tasks_system.sql:14
database/migrations/026_add_training_tasks_system.sql:51
database/migrations/026_add_training_tasks_system.sql:119
database/migrations/026_add_training_tasks_system.sql:145
database/migrations/068_user_data_vault.sql:17
database/migrations/022_add_user_profiles_system.sql:6
database/migrations/022_add_user_profiles_system.sql:97
database/migrations/024_add_model_wrappers_system.sql:84
database/migrations/011_add_rooms_and_credentials.sql:33
database/migrations/011_add_rooms_and_credentials.sql:60
database/migrations/069_user_brands.sql:17
database/migrations/033_vanity_handles_tables.sql:17
database/migrations/033_vanity_handles_tables.sql:45
database/migrations/033_vanity_handles_tables.sql:53
database/migrations/025_add_device_pairing_system.sql:20
database/migrations/025_add_device_pairing_system.sql:48
database/migrations/070_user_llm_usage.sql:19
database/migrations/027_add_account_warming_system.sql:10
database/migrations/027_add_account_warming_system.sql:106
database/migrations/027_add_account_warming_system.sql:131
database/migrations/027_add_account_warming_system.sql:148
```


## Issue 2: INTEGER type for users(user_id) FK - TYPE MISMATCH

**Problem:** Foreign keys use `INTEGER` type but `users.user_id` is `UUID`.
**Fix:** Change `INTEGER` → `UUID`

**Count:** 26 occurrences

### Files with INTEGER type mismatch:

```
database/migrations/014_email_router.sql:12
database/migrations/014_email_router.sql:144
database/migrations/014_email_router.sql:212
database/migrations/061_recruiting_integration.sql:24
database/migrations/061_recruiting_integration.sql:52
database/migrations/063_family_tree_and_spheres.sql:18
database/migrations/063_family_tree_and_spheres.sql:19
database/migrations/063_family_tree_and_spheres.sql:82
database/migrations/063_family_tree_and_spheres.sql:116
database/migrations/063_family_tree_and_spheres.sql:117
database/migrations/063_family_tree_and_spheres.sql:137
database/migrations/063_family_tree_and_spheres.sql:138
database/migrations/062_relationship_graph.sql:22
database/migrations/062_relationship_graph.sql:23
database/migrations/062_relationship_graph.sql:65
database/migrations/062_relationship_graph.sql:101
database/migrations/082_pricing_system.sql:103
database/migrations/082_pricing_system.sql:150
database/migrations/082_pricing_system.sql:191
database/migrations/082_pricing_system.sql:233
database/migrations/013_oauth_providers.sql:63
database/migrations/013_oauth_providers.sql:88
database/migrations/141_quest_system.sql:61
database/migrations/141_quest_system.sql:94
database/migrations/141_quest_system.sql:119
database/migrations/141_quest_system.sql:141
```


## Correct References (for comparison)

**Correct UUID references:** 129


## Recommended Fix Strategy

### Option A: Single Master Migration (Safest)

Create `database/migrations/200_fix_all_fk_constraints.sql`:

```sql
-- Fix all users(id) → users(user_id)
-- Fix all INTEGER → UUID for users FKs
-- Drop broken constraints
-- Add correct constraints
```

### Option B: Edit Migrations Directly (Clean but risky)

Only if database hasn't been deployed to production:
1. Edit each migration file
2. Change `users(id)` → `users(user_id)`
3. Change `INTEGER` → `UUID` for all users FKs
4. Drop database and re-run migrations

### Option C: Application-Level Gateway (Temporary workaround)

Create ID mapping layer in code:
- API uses simple `id` integers
- Gateway maps to `user_id UUID`
- Similar to XML/JSON mapping pattern

## Standards Going Forward

**RULE:** All foreign keys to `users` table MUST use:
```sql
user_id UUID REFERENCES users(user_id) ON DELETE CASCADE
```

**NOT:**
- ❌ `user_id INTEGER REFERENCES users(id)`
- ❌ `user_id INTEGER REFERENCES users(user_id)`
- ❌ `id INTEGER REFERENCES users(user_id)`

## Next Steps

1. Review this report: `FK_AUDIT_REPORT.md`
2. Choose fix strategy (A, B, or C)
3. Create migration/gateway as needed
4. Test on dev database first
5. Document standard in `docs/DATABASE_STANDARDS.md`


# Database Migrations

This directory contains SQL migrations managed by the [`postgres-migrations`](https://github.com/ThomWright/postgres-migrations) library.

## Overview

**Library:** `postgres-migrations` (npm package)
- Lightweight, SQL-first migration system for PostgreSQL
- Tracks applied migrations in `migrations` table
- Runs migrations in filename order (lexicographic sort)
- Each migration runs once per database

**Migration Execution:**
- Local development: Automatic via `initDatabase()` in `src/db/index.ts`
- Production: Automatic on API startup (if needed) or manual via migration script

## Migration Files

### Naming Convention

```
NNN-description.sql
```

- **NNN**: Zero-padded sequential number (001, 002, 003, ...)
- **description**: Kebab-case description of the change
- **Extension**: Always `.sql`

**Examples:**
- `001-initial-schema.sql` - Baseline schema
- `002-add-user-avatar.sql` - Add avatar column to user_profiles
- `003-create-comments-table.sql` - New comments feature

### Migration Structure

Each migration should be **idempotent** (safe to run multiple times):

```sql
-- 002-add-user-avatar.sql
-- Add avatar_url column to user_profiles

-- Use DO blocks for conditional DDL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles'
      AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN avatar_url TEXT;
  END IF;
END $$;

-- Indexes: Use IF NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_user_profiles_avatar ON user_profiles(avatar_url);
```

## Creating a New Migration

1. **Determine the next number** - Check existing migrations, use next sequential number
2. **Create the file** - `api/migrations/NNN-description.sql`
3. **Write idempotent SQL** - Use DO blocks, IF NOT EXISTS, CREATE OR REPLACE
4. **Test locally** - Verify migration applies cleanly
5. **Test idempotence** - Run migration twice, ensure no errors
6. **Commit** - Migrations are part of the codebase

**Example workflow:**

```bash
# List existing migrations
ls api/migrations/

# Create next migration
touch api/migrations/002-add-user-avatar.sql

# Edit migration file
# ... write SQL ...

# Test (migrations run automatically on API startup)
pnpm dev:api

# Verify in database
docker exec -it vacay-dev-postgres-1 psql -U vacay -d vacay_dev -c "SELECT * FROM migrations;"
```

## DO NOT Rules

### ❌ Don't edit old migrations

Once a migration is committed and deployed, **never modify it**. Create a new migration instead.

**Why:** Other developers and production databases have already applied the old version. Changing it causes inconsistencies.

**Bad:**
```sql
-- Editing 001-initial-schema.sql after it's deployed
ALTER TABLE user_profiles ADD COLUMN avatar_url TEXT; -- DON'T DO THIS
```

**Good:**
```sql
-- Create new migration: 002-add-user-avatar.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN avatar_url TEXT;
  END IF;
END $$;
```

### ❌ Don't delete migrations

Even if a migration is obsolete, keep it in the repository. The `migrations` table tracks what's been applied.

**Why:** Deleting causes gaps in the sequence and breaks databases that already ran the migration.

### ❌ Don't run migrations manually

Let `postgres-migrations` handle execution. Don't run SQL files with `psql` or database tools.

**Why:** Manual execution bypasses the `migrations` table, causing the library to re-run migrations or skip them.

**Exception:** Emergency hotfixes in production (document what you did).

### ❌ Don't use non-idempotent SQL

Migrations should be safe to run multiple times (e.g., for local development resets).

**Bad:**
```sql
ALTER TABLE user_profiles ADD COLUMN avatar_url TEXT; -- Fails on second run
```

**Good:**
```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN avatar_url TEXT;
  END IF;
END $$;
```

## Rollback Philosophy

**This project does not support automatic rollbacks.**

Database migrations are **forward-only**. If a migration causes issues:

1. **Fix forward** - Write a new migration to correct the problem
2. **Don't rollback** - Avoid reverting migrations or database state

**Why:**
- Rollbacks are complex and error-prone
- Production data may be affected (data loss risk)
- Easier to reason about migration history linearly

**Example:**

```sql
-- 002-add-user-avatar.sql (bad migration)
ALTER TABLE user_profiles ADD COLUMN avatar_url TEXT;

-- 003-remove-user-avatar.sql (fix forward)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE user_profiles DROP COLUMN avatar_url;
  END IF;
END $$;
```

## Checking Migration Status

**List applied migrations:**

```bash
# Connect to local database
docker exec -it vacay-dev-postgres-1 psql -U vacay -d vacay_dev

# View migrations table
SELECT * FROM migrations ORDER BY id;
```

**Expected output:**

```
 id |        name         |         run_on
----+---------------------+------------------------
  1 | 001-initial-schema  | 2025-12-30 10:30:00+00
```

## Troubleshooting

### Migration failed mid-execution

If a migration fails partway through, you may need to manually clean up:

1. **Check what was applied** - Review database schema
2. **Fix the migration** - Make it idempotent or split into smaller steps
3. **Remove from migrations table** - `DELETE FROM migrations WHERE name = '002-bad-migration';`
4. **Re-run** - Restart API or run migration script

### Migration applied but not tracked

If you ran SQL manually (bypassing `postgres-migrations`):

1. **Insert into migrations table** - `INSERT INTO migrations (name, run_on) VALUES ('002-manual-change', NOW());`
2. **Verify** - Check that migration won't re-run

### Migration skipped

If `postgres-migrations` skips a migration:

1. **Check migrations table** - Is it already marked as run?
2. **Check filename** - Must match `NNN-description.sql` pattern
3. **Check file location** - Must be in `api/migrations/`

## Resources

- [`postgres-migrations` documentation](https://github.com/ThomWright/postgres-migrations)
- Project schema: `api/src/db/schema.sql` (reference, not used for migrations)
- Migration execution: `api/src/db/index.ts` (`initDatabase` function)

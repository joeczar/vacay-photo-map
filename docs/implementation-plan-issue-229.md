# Implementation Plan: Fix Schema Migrations for Existing Tables

**Issue:** #229
**Branch:** `feature/issue-229-schema-migrations`
**Complexity:** Medium
**Total Commits:** 9

## Overview

Fix production database missing `password_hash` column and implement proper migration system. Current `CREATE TABLE IF NOT EXISTS` approach silently skips adding new columns to existing tables, causing production failures. Replace ad-hoc DO blocks with versioned migrations using `postgres-migrations` library.

## Prerequisites

- [ ] Production database accessible (for verification)
- [ ] Understanding of existing DO block pattern in schema.sql
- [ ] Bun runtime environment

## Architecture

### Current State (Broken)
```
schema.sql (CREATE TABLE IF NOT EXISTS + scattered DO blocks)
  ↓
migrate.ts (runs schema.sql as single file)
  ↓
Production DB (missing columns from CREATE TABLE statements)
```

### Target State (Fixed)
```
migrations/
  001-initial-schema.sql
  002-add-password-hash.sql
  003-add-rotation-column.sql
  ... (extracted from existing DO blocks)
  ↓
migrate.ts (uses postgres-migrations library)
  ↓
Production DB (all migrations tracked in schema_migrations table)
```

### Components

- `migrations/` - Numbered SQL files (001, 002, etc.)
- `api/scripts/migrate.ts` - Updated to use postgres-migrations
- `api/src/db/schema.sql` - Deprecated (kept for reference)
- `schema_migrations` table - Tracks applied migrations (created by library)

### Data Flow

```
docker-entrypoint.sh → migrate.ts → postgres-migrations → DB
                                          ↓
                                    Check schema_migrations table
                                          ↓
                                    Run pending migrations only
                                          ↓
                                    Update schema_migrations
```

## Migration Strategy

**Philosophy:** Roll forward, never rollback
- No down/rollback migrations (project decision)
- Idempotent migrations where possible (IF NOT EXISTS, etc.)
- Each migration is a point-in-time change
- Migrations run in order (001, 002, 003...)

**Library Choice:** `postgres-migrations`
- Pure SQL (no ORM DSL)
- No rollback support (matches our philosophy)
- Advisory locks (prevents concurrent migration runs)
- Simple API: `migrate({ client }, 'migrations-directory')`
- Battle-tested, minimal dependencies

## Atomic Commits

### Phase 1: Immediate Production Fix

#### Commit 1: Add password_hash column migration block
**Type:** fix
**Scope:** schema
**Files:**
- `api/src/db/schema.sql` - Modify

**Changes:**
- Add DO $$ block after user_profiles CREATE TABLE to add password_hash column
- Use pattern: `IF NOT EXISTS (SELECT 1 FROM information_schema.columns...)`
- Set column to `TEXT` (nullable initially to allow adding to existing rows)
- Add comment: `-- Migration: Add password_hash for password authentication (#227)`

**Acceptance Criteria:**
- [ ] DO block is idempotent (safe to run multiple times)
- [ ] Follows same pattern as existing rotation/description DO blocks
- [ ] Does NOT set NOT NULL constraint (will do in next commit)
- [ ] Tests pass: `pnpm test` (no schema changes to test DB yet)
- [ ] Types pass: `pnpm type-check`

---

#### Commit 2: Deploy immediate fix to production
**Type:** fix
**Scope:** deployment
**Files:**
- None (deployment only)

**Changes:**
- SSH to production server
- Run migration: `docker compose -f docker-compose.prod.yml exec api bun scripts/migrate.ts`
- Verify column exists: `docker compose -f docker-compose.prod.yml exec postgres psql -U vacay -d vacay -c "\d user_profiles"`
- Restart API: `docker compose -f docker-compose.prod.yml restart api`

**Acceptance Criteria:**
- [ ] password_hash column exists in production
- [ ] API starts without errors
- [ ] Login endpoint returns 200 (not 500)
- [ ] Document output in commit message

---

### Phase 2: Proper Migration System

#### Commit 3: Install postgres-migrations library
**Type:** feat
**Scope:** dependencies
**Files:**
- `api/package.json` - Modify

**Changes:**
- Add `postgres-migrations` to dependencies: `bun add postgres-migrations`
- Verify version: `^6.0.0` (latest stable)

**Acceptance Criteria:**
- [ ] Package installed successfully
- [ ] `bun.lockb` updated
- [ ] Types available (library includes TypeScript definitions)
- [ ] Tests pass: `pnpm test`

---

#### Commit 4: Create migrations directory structure
**Type:** feat
**Scope:** migration-system
**Files:**
- `api/migrations/001-initial-schema.sql` - Create
- `api/migrations/README.md` - Create

**Changes:**
- Create `api/migrations/` directory
- Create `001-initial-schema.sql` with base tables:
  - Copy CREATE TABLE statements from schema.sql (user_profiles, trips, sections, photos, invites, invite_trip_access, trip_access)
  - Copy CREATE EXTENSION statements
  - Copy CREATE INDEX statements
  - Copy CREATE FUNCTION and CREATE TRIGGER for updated_at
  - Copy RLS policies (ALTER TABLE ENABLE RLS, CREATE POLICY)
  - **Exclude all DO blocks** (those become separate migrations)
  - Add header comment: Migration 001, created from schema.sql baseline

- Create README.md:
  ```markdown
  # Database Migrations

  ## Overview
  Uses postgres-migrations for versioned schema changes.

  ## Creating Migrations
  1. Create file: `NNN-description.sql` (NNN = next number, zero-padded)
  2. Write idempotent SQL (use IF NOT EXISTS where possible)
  3. Test locally: `bun scripts/migrate.ts`
  4. Commit and deploy

  ## Migration Naming
  - `001-initial-schema.sql` - Base tables, indexes, RLS
  - `002-add-column-name.sql` - Add new column
  - `003-create-table-name.sql` - Add new table

  ## DO NOT
  - Never edit old migrations (create new one to fix)
  - Never delete migrations (breaks version tracking)
  - Never run migrations manually (use migrate.ts)

  ## Rollback Strategy
  We don't. Roll forward with a new migration to fix issues.
  ```

**Acceptance Criteria:**
- [ ] Directory structure created
- [ ] 001-initial-schema.sql creates all base tables
- [ ] README documents workflow
- [ ] Migration is valid SQL (no syntax errors)
- [ ] Tests pass: `pnpm test`

---

#### Commit 5: Extract DO blocks into numbered migrations
**Type:** feat
**Scope:** migration-system
**Files:**
- `api/migrations/002-add-password-hash.sql` - Create
- `api/migrations/003-add-rotation-column.sql` - Create
- `api/migrations/004-add-description-column.sql` - Create
- `api/migrations/005-add-section-id-column.sql` - Create
- `api/migrations/006-rename-cloudinary-to-storage-key.sql` - Create
- `api/migrations/007-set-storage-key-not-null.sql` - Create

**Changes:**
- `002-add-password-hash.sql`:
  ```sql
  -- Migration 002: Add password_hash column for password authentication
  -- Related: Issue #227 (password auth), Issue #229 (migration fix)

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'user_profiles'
        AND column_name = 'password_hash'
    ) THEN
      ALTER TABLE user_profiles ADD COLUMN password_hash TEXT;
    END IF;
  END $$;

  -- Set NOT NULL constraint after column exists
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'user_profiles'
        AND column_name = 'password_hash'
        AND is_nullable = 'YES'
    ) THEN
      -- First, ensure all existing rows have a value (shouldn't happen in prod)
      UPDATE user_profiles SET password_hash = '' WHERE password_hash IS NULL;
      ALTER TABLE user_profiles ALTER COLUMN password_hash SET NOT NULL;
    END IF;
  END $$;
  ```

- `003-add-rotation-column.sql` - Extract rotation DO block from schema.sql
- `004-add-description-column.sql` - Extract description DO block
- `005-add-section-id-column.sql` - Extract section_id DO block
- `006-rename-cloudinary-to-storage-key.sql` - Extract rename DO block
- `007-set-storage-key-not-null.sql` - Extract NOT NULL DO block

**Acceptance Criteria:**
- [ ] Each migration is in its own file
- [ ] Migrations are idempotent (safe to run multiple times)
- [ ] Migration numbers are sequential (001-007)
- [ ] Comments explain what each migration does
- [ ] All DO blocks from schema.sql extracted
- [ ] Tests pass: `pnpm test`

---

#### Commit 6: Update migrate.ts to use postgres-migrations
**Type:** feat
**Scope:** migration-system
**Files:**
- `api/scripts/migrate.ts` - Modify

**Changes:**
- Replace file reading + unsafe SQL execution with postgres-migrations
- New implementation:
  ```typescript
  import path from 'node:path'
  import { fileURLToPath } from 'node:url'
  import { migrate } from 'postgres-migrations'
  import { closeDbClient, connectWithRetry, getDbClient } from '../src/db/client'

  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const migrationsDir = path.join(__dirname, '..', 'migrations')

  const runMigrations = async () => {
    // Wait for database to be available (handles container startup ordering)
    await connectWithRetry(5, 2000)

    const db = getDbClient()
    console.info(`Running migrations from ${migrationsDir}...`)

    try {
      // postgres-migrations expects native pg client, but postgres.js client works
      // The library uses basic query methods that both clients support
      const client = {
        query: async (sql: string, values?: any[]) => {
          const result = values ? await db.unsafe(sql, values) : await db.unsafe(sql)
          return {
            rows: result,
            rowCount: result.length,
          }
        },
      }

      await migrate({ client: client as any }, migrationsDir)
      console.info('Migrations completed successfully')
    } catch (error) {
      console.error('Migration failed:', error)
      throw error
    }
  }

  runMigrations()
    .then(async () => {
      await closeDbClient()
    })
    .catch(async (error) => {
      console.error('Migration failed:', error)
      await closeDbClient().catch(() => {})
      process.exit(1)
    })
  ```

- Remove old validateSchemaSql function (no longer needed)
- Remove schemaPath constant
- Update imports

**Acceptance Criteria:**
- [ ] migrate.ts uses postgres-migrations library
- [ ] Migrations directory path is correct
- [ ] Error handling preserved
- [ ] connectWithRetry still used (handles Docker startup timing)
- [ ] Types pass: `pnpm type-check`
- [ ] Can run: `bun scripts/migrate.ts` (creates schema_migrations table)

---

#### Commit 7: Add migration tests
**Type:** test
**Scope:** migration-system
**Files:**
- `api/scripts/__tests__/migrate.test.ts` - Create

**Changes:**
- Create test file:
  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
  import { closeDbClient, connectWithRetry, getDbClient } from '../../src/db/client'
  import { migrate } from 'postgres-migrations'
  import path from 'node:path'
  import { fileURLToPath } from 'node:url'

  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations')

  describe('Database Migrations', () => {
    beforeAll(async () => {
      await connectWithRetry(5, 2000)
    })

    afterAll(async () => {
      await closeDbClient()
    })

    it('runs all migrations successfully', async () => {
      const db = getDbClient()
      const client = {
        query: async (sql: string, values?: any[]) => {
          const result = values ? await db.unsafe(sql, values) : await db.unsafe(sql)
          return { rows: result, rowCount: result.length }
        },
      }

      // Should not throw
      await migrate({ client: client as any }, migrationsDir)

      // Verify schema_migrations table exists
      const [result] = await db`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'schema_migrations'
        ) as exists
      `
      expect(result.exists).toBe(true)
    })

    it('creates all expected tables', async () => {
      const db = getDbClient()
      const expectedTables = [
        'user_profiles',
        'trips',
        'sections',
        'photos',
        'invites',
        'invite_trip_access',
        'trip_access',
      ]

      for (const tableName of expectedTables) {
        const [result] = await db`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = ${tableName}
          ) as exists
        `
        expect(result.exists).toBe(true)
      }
    })

    it('creates password_hash column', async () => {
      const db = getDbClient()
      const [result] = await db`
        SELECT
          column_name,
          is_nullable,
          data_type
        FROM information_schema.columns
        WHERE table_name = 'user_profiles'
          AND column_name = 'password_hash'
      `

      expect(result).toBeDefined()
      expect(result.column_name).toBe('password_hash')
      expect(result.is_nullable).toBe('NO')
      expect(result.data_type).toBe('text')
    })

    it('is idempotent (running twice does not fail)', async () => {
      const db = getDbClient()
      const client = {
        query: async (sql: string, values?: any[]) => {
          const result = values ? await db.unsafe(sql, values) : await db.unsafe(sql)
          return { rows: result, rowCount: result.length }
        },
      }

      // Run migrations again (should be no-op)
      await migrate({ client: client as any }, migrationsDir)

      // Should still have all tables
      const [result] = await db`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'user_profiles'
        ) as exists
      `
      expect(result.exists).toBe(true)
    })
  })
  ```

**Acceptance Criteria:**
- [ ] Tests verify migrations run successfully
- [ ] Tests verify all tables created
- [ ] Tests verify password_hash column exists and is NOT NULL
- [ ] Tests verify idempotency (running twice doesn't fail)
- [ ] Tests pass: `bun test scripts/__tests__/migrate.test.ts`
- [ ] All tests pass: `pnpm test`

---

#### Commit 8: Deprecate schema.sql and update documentation
**Type:** docs
**Scope:** migration-system
**Files:**
- `api/src/db/schema.sql` - Modify (add deprecation notice)
- `CLAUDE.md` - Modify

**Changes:**
- Add deprecation notice to top of schema.sql:
  ```sql
  -- DEPRECATED: This file is kept for reference only.
  --
  -- DO NOT MODIFY THIS FILE.
  --
  -- Schema changes should be made via numbered migrations in api/migrations/
  -- See api/migrations/README.md for workflow.
  --
  -- This file represents the original schema before migration system was implemented.
  -- It may drift from the actual database schema over time.
  --
  -- Related: Issue #229 (migration system implementation)

  -- [rest of file unchanged]
  ```

- Update CLAUDE.md in "Common Gotchas" section:
  ```markdown
  ## Database Migrations

  **Schema changes go in numbered migrations, not schema.sql.**

  - Migration files: `api/migrations/NNN-description.sql`
  - Migration tool: `postgres-migrations` library
  - Run migrations: `bun scripts/migrate.ts` (or `pnpm migrate` from root)
  - Tracking table: `schema_migrations` (created automatically)

  **Creating a new migration:**
  1. Find next number: `ls api/migrations/ | tail -1` (e.g., 007)
  2. Create file: `api/migrations/008-add-new-column.sql`
  3. Write idempotent SQL (use IF NOT EXISTS where possible)
  4. Test locally: `pnpm migrate` (from root)
  5. Verify in DB: `psql -d vacay -c "\d table_name"`
  6. Commit and deploy (migrations run automatically on API start)

  **DO NOT:**
  - Edit `api/src/db/schema.sql` (deprecated, reference only)
  - Edit old migrations (create new one to fix)
  - Delete migrations (breaks version tracking)
  - Run SQL manually in production (use migrations)

  **Philosophy:** Roll forward, never rollback. If a migration causes issues, create a new migration to fix it.
  ```

**Acceptance Criteria:**
- [ ] schema.sql has clear deprecation notice
- [ ] CLAUDE.md documents new migration workflow
- [ ] CLAUDE.md explains DO NOT list
- [ ] CLAUDE.md includes examples
- [ ] Tests pass: `pnpm test`
- [ ] Types pass: `pnpm type-check`

---

### Phase 3: Cleanup and Verification

#### Commit 9: Remove DO blocks from schema.sql
**Type:** refactor
**Scope:** schema
**Files:**
- `api/src/db/schema.sql` - Modify

**Changes:**
- Remove all DO $$ blocks (lines 70-132):
  - Add rotation column block
  - Add description column block
  - Add section_id column block
  - Rename cloudinary_public_id block
  - Set storage_key NOT NULL block
- Keep deprecation notice at top
- Keep all CREATE TABLE, CREATE INDEX, CREATE FUNCTION, CREATE TRIGGER, RLS statements
- Add comment after CREATE TABLE user_profiles:
  ```sql
  -- Note: password_hash column added via migration 002-add-password-hash.sql
  ```

**Acceptance Criteria:**
- [ ] All DO blocks removed from schema.sql
- [ ] File is now purely DDL (CREATE statements)
- [ ] Deprecation notice remains
- [ ] Comments indicate columns added via migrations
- [ ] Tests pass: `pnpm test` (uses existing test DB, not schema.sql)
- [ ] Types pass: `pnpm type-check`

---

## Testing Strategy

**Unit Tests:**
- Migration system tests (Commit 7)
  - Verify migrations run without errors
  - Verify all tables created
  - Verify password_hash column exists
  - Verify idempotency

**Integration Tests:**
- Existing API tests already cover schema usage
- Auth tests verify password_hash column (auth.test.ts)
- Trip tests verify trips/photos tables (trips.test.ts)
- RBAC tests verify invites/trip_access tables (rbac-integration.test.ts)

**Manual Verification:**
- Run migrations on fresh database (simulates new deployment)
- Run migrations on test database with existing data (simulates production upgrade)
- Verify schema_migrations table tracks all applied migrations

**Production Verification:**
- After Commit 2 deployment: Test login endpoint
- After full migration system deployment: Verify schema_migrations table

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Full test suite passes (`pnpm test`)
- [ ] Type check passes (`pnpm type-check`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Manual verification:
  - [ ] Fresh DB: `rm -rf .postgres-data && pnpm dev:docker` → migrations run
  - [ ] Existing DB: Migrations run without errors (idempotent)
  - [ ] schema_migrations table exists with 7 rows
  - [ ] All columns exist (password_hash, rotation, description, section_id, storage_key)
  - [ ] Login works (password_hash column functional)

## Deployment Strategy

**Phase 1 (Commits 1-2): Immediate Fix**
1. Merge PR with Commit 1 (DO block)
2. Deploy to production: Run migration manually
3. Verify login works
4. This unblocks users immediately

**Phase 2 (Commits 3-9): Migration System**
1. Merge PR with full migration system
2. Deploy to production (automatic migration via docker-entrypoint.sh)
3. Verify schema_migrations table created
4. Verify no errors in API logs
5. Future deployments will use new system automatically

**Rollback Plan:**
- If Phase 1 fails: Revert schema.sql, redeploy
- If Phase 2 fails: API will fail to start (migration error in entrypoint)
  - Fix: SSH to server, manually fix migration file, restart API
  - Alternative: Revert to previous version, fix in new PR

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Password_hash column already exists in prod | DO block is idempotent (IF NOT EXISTS check) |
| postgres-migrations incompatible with postgres.js | Adapter layer in migrate.ts maps query methods |
| Migration fails mid-run | Library uses transactions, atomic rollback |
| Concurrent migrations (multiple API containers) | Library uses advisory locks (prevents concurrent runs) |
| Old schema.sql confusion | Deprecation notice, documentation updates |
| Production migration fails | Test thoroughly locally first, have SSH access ready |
| Breaking change in numbered migrations | Each migration is idempotent, safe to re-run |

## Open Questions

**RESOLVED:**
- ✅ Which migration library? → postgres-migrations (SQL-based, no rollbacks, advisory locks)
- ✅ How to handle existing DO blocks? → Extract into numbered migrations
- ✅ What about schema.sql? → Deprecate, keep for reference
- ✅ Migration file naming? → NNN-description.sql (zero-padded numbers)

**NONE REMAINING** - Ready to implement.

## Notes

**Why postgres-migrations?**
- Pure SQL (no ORM, no DSL to learn)
- Simple API (one function call)
- No rollback support (matches project philosophy)
- Advisory locks (production-safe)
- Battle-tested (6+ years, 1M+ downloads/year)

**Why deprecate schema.sql instead of deleting?**
- Reference for understanding original schema
- Git history shows evolution
- Easy to compare against current state
- May be useful for setting up test environments (though migrations are preferred)

**Migration numbering:**
- Zero-padded (001, 002, ..., 010, 011) for correct sort order
- Descriptive names (add-column, create-table, etc.)
- Never reuse numbers (even if migration deleted)

**DO blocks in migrations:**
- Still use DO $$ for conditional logic (IF NOT EXISTS)
- But now each DO block is in its own numbered file
- Idempotent: safe to run multiple times
- Transactions: library wraps each migration in BEGIN...COMMIT

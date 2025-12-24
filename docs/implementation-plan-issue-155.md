# Implementation Plan: Backend RBAC Core - Schema, Types, Middleware

**Issue:** #155
**Branch:** `feature/issue-155-rbac-backend-core`
**Complexity:** Medium
**Total Commits:** 4

## Overview

Add foundational Role-Based Access Control (RBAC) system to the backend. This includes three new database tables (`invites`, `invite_trip_access`, `trip_access`), TypeScript types for RBAC entities, and middleware to enforce trip-level permissions. The existing `is_public` and `access_token_hash` columns remain in the `trips` table (removal is deferred to issue #162).

## Prerequisites

- [ ] PostgreSQL database running with existing schema
- [ ] WebAuthn authentication system in place
- [ ] JWT middleware (`requireAuth`, `requireAdmin`) working

## Architecture

### Components
- `schema.sql` - Database schema with RBAC tables
- `types/rbac.ts` - TypeScript interfaces for RBAC entities (NEW FILE)
- `middleware/auth.ts` - Trip access middleware (EXTEND EXISTING)

### Data Flow

```
Invite Flow:
Admin → Create Invite → invites table
     ↓
Assign to Trips → invite_trip_access table
     ↓
User Accepts → trip_access table (grant permissions)

Access Check Flow:
User Request → checkTripAccess middleware → Query trip_access
           ↓
   Admin: Always pass
   Editor: role='editor'
   Viewer: role='viewer' or role='editor'
           ↓
   Forbidden (403) or Continue to handler
```

### Database Tables

**invites:**
- Stores invitation tokens with role and expiration
- Links to creating admin and (optionally) accepting user
- One invite can grant access to multiple trips via `invite_trip_access`

**invite_trip_access:**
- Junction table linking invites to specific trips
- When invite is accepted, entries here determine which trips get `trip_access` records

**trip_access:**
- Final source of truth for user permissions on trips
- One record per user-trip combination with role (editor/viewer)
- Admins bypass this table (checked in middleware)

## Atomic Commits

---

### Commit 1: feat(db): add RBAC tables for invites and trip access

**Type:** feat
**Scope:** db
**Files:**
- `/home/user/vacay-photo-map/api/src/db/schema.sql` - Modify

**Changes:**

Add three new tables at the end of the schema file (before the final comment):

1. **invites table:**
```sql
-- Invitations for trip access (RBAC)
CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  created_by_user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

2. **invite_trip_access table:**
```sql
-- Junction table: which trips an invite grants access to
CREATE TABLE IF NOT EXISTS invite_trip_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID REFERENCES invites(id) ON DELETE CASCADE NOT NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(invite_id, trip_id)
);
```

3. **trip_access table:**
```sql
-- User permissions for specific trips (RBAC)
CREATE TABLE IF NOT EXISTS trip_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  granted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  granted_by_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  UNIQUE(user_id, trip_id)
);
```

4. **Indexes for performance:**
```sql
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_created_by ON invites(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_invite_trip_access_invite ON invite_trip_access(invite_id);
CREATE INDEX IF NOT EXISTS idx_invite_trip_access_trip ON invite_trip_access(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_access_user ON trip_access(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_access_trip ON trip_access(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_access_user_trip ON trip_access(user_id, trip_id);
```

5. **Triggers for updated_at:**
```sql
DROP TRIGGER IF EXISTS trg_invites_set_updated_at ON invites;
CREATE TRIGGER trg_invites_set_updated_at
  BEFORE UPDATE ON invites
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
```

**Acceptance Criteria:**
- [ ] Schema runs without errors on fresh database: `docker compose -f docker-compose.prod.yml exec postgres psql -U vacay -d vacay -f /docker-entrypoint-initdb.d/schema.sql`
- [ ] Schema is idempotent (can run multiple times): Run twice, verify no errors
- [ ] All foreign keys are correct and use CASCADE/SET NULL appropriately
- [ ] Indexes exist for all common query patterns
- [ ] Role check constraints only allow 'editor' and 'viewer'
- [ ] UNIQUE constraints prevent duplicate user-trip and invite-trip combinations

---

### Commit 2: feat(types): add RBAC TypeScript interfaces

**Type:** feat
**Scope:** types
**Files:**
- `/home/user/vacay-photo-map/api/src/types/rbac.ts` - Create

**Changes:**

Create new file with RBAC type definitions:

```typescript
/**
 * RBAC Types for Trip Access Control
 */

/**
 * User role for trip access
 * - editor: Can view, edit, upload photos
 * - viewer: Can only view photos
 * - admin: Bypasses all checks (not stored in trip_access)
 */
export type Role = 'editor' | 'viewer'

/**
 * Invitation record for granting trip access
 */
export interface Invite {
  id: string
  code: string
  createdByUserId: string
  email: string | null
  role: Role
  expiresAt: Date
  usedAt: Date | null
  usedByUserId: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Junction table: which trips an invite grants access to
 */
export interface InviteTripAccess {
  id: string
  inviteId: string
  tripId: string
  createdAt: Date
}

/**
 * User permission for a specific trip
 */
export interface TripAccess {
  id: string
  userId: string
  tripId: string
  role: Role
  grantedAt: Date
  grantedByUserId: string | null
}

/**
 * Database row from invites table (snake_case)
 */
export interface InviteRow {
  id: string
  code: string
  created_by_user_id: string
  email: string | null
  role: string
  expires_at: Date
  used_at: Date | null
  used_by_user_id: string | null
  created_at: Date
  updated_at: Date
}

/**
 * Database row from invite_trip_access table (snake_case)
 */
export interface InviteTripAccessRow {
  id: string
  invite_id: string
  trip_id: string
  created_at: Date
}

/**
 * Database row from trip_access table (snake_case)
 */
export interface TripAccessRow {
  id: string
  user_id: string
  trip_id: string
  role: string
  granted_at: Date
  granted_by_user_id: string | null
}

/**
 * API response for invite creation
 */
export interface CreateInviteResponse {
  invite: Invite
  tripIds: string[]
}

/**
 * API response for invite acceptance
 */
export interface AcceptInviteResponse {
  success: boolean
  tripAccess: TripAccess[]
}
```

**Acceptance Criteria:**
- [ ] File compiles without errors: `pnpm type-check`
- [ ] Role type is union of literal strings ('editor' | 'viewer')
- [ ] All interfaces match database schema (camelCase for app, Row types for DB)
- [ ] Response types prepared for future API endpoints
- [ ] JSDoc comments explain each type's purpose

---

### Commit 3: feat(middleware): add trip access control middleware

**Type:** feat
**Scope:** middleware
**Files:**
- `/home/user/vacay-photo-map/api/src/middleware/auth.ts` - Modify

**Changes:**

Add three new middleware functions at the end of the file:

1. **Import database and types:**
```typescript
import { getDb } from '../db'
import type { Role, TripAccessRow } from '../types/rbac'
```

2. **Helper function to check trip access:**
```typescript
/**
 * Check if user has access to a trip with minimum required role
 * Admins always have access
 * Returns true if user has access, false otherwise
 */
async function userHasTripAccess(
  userId: string,
  tripId: string,
  isAdmin: boolean,
  minRole: Role
): Promise<boolean> {
  // Admins bypass all checks
  if (isAdmin) {
    return true
  }

  const db = await getDb()
  const result = await db.query<TripAccessRow>(
    `SELECT role FROM trip_access
     WHERE user_id = $1 AND trip_id = $2`,
    [userId, tripId]
  )

  if (result.rows.length === 0) {
    return false
  }

  const userRole = result.rows[0].role as Role

  // Check role hierarchy: editor > viewer
  if (minRole === 'viewer') {
    // Viewer access: either viewer or editor role works
    return userRole === 'viewer' || userRole === 'editor'
  } else if (minRole === 'editor') {
    // Editor access: only editor role works
    return userRole === 'editor'
  }

  return false
}
```

3. **checkTripAccess middleware factory:**
```typescript
/**
 * Middleware factory that checks if user has minimum required access to a trip
 * Extracts trip ID using the provided extractor function
 * Returns 401 if not authenticated, 403 if no access
 *
 * @param minRole - Minimum role required ('viewer' or 'editor')
 * @param tripIdExtractor - Function to extract trip ID from context (default: c.req.param('id'))
 *
 * @example
 * // For routes like /api/trips/:id
 * app.get('/trips/:id', checkTripAccess('viewer'), handler)
 *
 * // For routes like /api/trips/:tripId/photos
 * app.post('/trips/:tripId/photos', checkTripAccess('editor', (c) => c.req.param('tripId')), handler)
 */
export function checkTripAccess(
  minRole: Role,
  tripIdExtractor: (c: any) => string = (c) => c.req.param('id')
) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get('user')

    if (!user) {
      return c.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        401
      )
    }

    const tripId = tripIdExtractor(c)

    if (!tripId) {
      return c.json(
        { error: 'Bad Request', message: 'Trip ID is required' },
        400
      )
    }

    const hasAccess = await userHasTripAccess(user.id, tripId, user.isAdmin, minRole)

    if (!hasAccess) {
      return c.json(
        {
          error: 'Forbidden',
          message: `${minRole === 'editor' ? 'Editor' : 'Viewer'} access required for this trip`,
        },
        403
      )
    }

    await next()
  })
}
```

4. **requireEditor middleware:**
```typescript
/**
 * Middleware that requires editor access to trip specified in route params
 * Convenience wrapper around checkTripAccess('editor')
 * Use for endpoints that modify trip data (upload, edit, delete)
 */
export const requireEditor = checkTripAccess('editor')
```

5. **requireViewer middleware:**
```typescript
/**
 * Middleware that requires viewer access to trip specified in route params
 * Convenience wrapper around checkTripAccess('viewer')
 * Use for endpoints that only read trip data
 */
export const requireViewer = checkTripAccess('viewer')
```

**Acceptance Criteria:**
- [ ] Code compiles without errors: `pnpm type-check`
- [ ] Middleware follows existing patterns from `requireAuth` and `requireAdmin`
- [ ] Admins bypass trip access checks
- [ ] Editor role grants editor and viewer access
- [ ] Viewer role grants only viewer access
- [ ] 401 returned if no auth token
- [ ] 400 returned if trip ID missing
- [ ] 403 returned if user lacks required role
- [ ] Factory pattern allows custom trip ID extraction
- [ ] JSDoc comments explain parameters and usage

---

### Commit 4: test(middleware): add trip access middleware tests

**Type:** test
**Scope:** middleware
**Files:**
- `/home/user/vacay-photo-map/api/src/middleware/auth.test.ts` - Create

**Changes:**

Create comprehensive tests for the new RBAC middleware:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { Hono } from 'hono'
import { getDb } from '../db'
import { checkTripAccess, requireEditor, requireViewer } from './auth'
import { getAdminAuthHeader, getUserAuthHeader } from '../test-helpers'
import type { AuthEnv } from '../types/auth'

describe('RBAC Middleware', () => {
  let app: Hono<AuthEnv>
  let testTripId: string
  let editorUserId: string
  let viewerUserId: string
  let noAccessUserId: string

  beforeAll(async () => {
    const db = await getDb()

    // Create test trip
    const tripResult = await db.query(
      `INSERT INTO trips (slug, title, is_public)
       VALUES ('test-trip', 'Test Trip', false)
       RETURNING id`
    )
    testTripId = tripResult.rows[0].id

    // Create test users (must exist in user_profiles for FK)
    editorUserId = 'editor-user-id'
    viewerUserId = 'viewer-user-id'
    noAccessUserId = 'no-access-user-id'

    await db.query(
      `INSERT INTO user_profiles (id, email, webauthn_user_id, is_admin)
       VALUES
         ($1, 'editor@test.com', 'editor-webauthn', false),
         ($2, 'viewer@test.com', 'viewer-webauthn', false),
         ($3, 'noone@test.com', 'noone-webauthn', false)
       ON CONFLICT (id) DO NOTHING`,
      [editorUserId, viewerUserId, noAccessUserId]
    )

    // Grant trip access
    await db.query(
      `INSERT INTO trip_access (user_id, trip_id, role)
       VALUES
         ($1, $2, 'editor'),
         ($3, $2, 'viewer')`,
      [editorUserId, testTripId, viewerUserId]
    )

    // Setup test app
    app = new Hono<AuthEnv>()
    app.get('/trips/:id/view', requireViewer, (c) => c.json({ success: true }))
    app.post('/trips/:id/edit', requireEditor, (c) => c.json({ success: true }))
    app.get('/custom/:tripId/view', checkTripAccess('viewer', (c) => c.req.param('tripId')), (c) => c.json({ success: true }))
  })

  afterAll(async () => {
    const db = await getDb()
    // Cleanup test data
    await db.query('DELETE FROM trip_access WHERE trip_id = $1', [testTripId])
    await db.query('DELETE FROM trips WHERE id = $1', [testTripId])
    await db.query(
      'DELETE FROM user_profiles WHERE id IN ($1, $2, $3)',
      [editorUserId, viewerUserId, noAccessUserId]
    )
  })

  describe('requireViewer', () => {
    it('allows admin access without trip_access record', async () => {
      const headers = await getAdminAuthHeader()
      const res = await app.request(`/trips/${testTripId}/view`, { headers })
      expect(res.status).toBe(200)
    })

    it('allows editor to view (editor > viewer in hierarchy)', async () => {
      const headers = await getUserAuthHeader(editorUserId, 'editor@test.com')
      const res = await app.request(`/trips/${testTripId}/view`, { headers })
      expect(res.status).toBe(200)
    })

    it('allows viewer to view', async () => {
      const headers = await getUserAuthHeader(viewerUserId, 'viewer@test.com')
      const res = await app.request(`/trips/${testTripId}/view`, { headers })
      expect(res.status).toBe(200)
    })

    it('denies user without trip_access', async () => {
      const headers = await getUserAuthHeader(noAccessUserId, 'noone@test.com')
      const res = await app.request(`/trips/${testTripId}/view`, { headers })
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toBe('Forbidden')
    })

    it('returns 401 without auth token', async () => {
      const res = await app.request(`/trips/${testTripId}/view`)
      expect(res.status).toBe(401)
    })
  })

  describe('requireEditor', () => {
    it('allows admin to edit', async () => {
      const headers = await getAdminAuthHeader()
      const res = await app.request(`/trips/${testTripId}/edit`, {
        method: 'POST',
        headers
      })
      expect(res.status).toBe(200)
    })

    it('allows editor to edit', async () => {
      const headers = await getUserAuthHeader(editorUserId, 'editor@test.com')
      const res = await app.request(`/trips/${testTripId}/edit`, {
        method: 'POST',
        headers
      })
      expect(res.status).toBe(200)
    })

    it('denies viewer from editing', async () => {
      const headers = await getUserAuthHeader(viewerUserId, 'viewer@test.com')
      const res = await app.request(`/trips/${testTripId}/edit`, {
        method: 'POST',
        headers
      })
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.message).toContain('Editor access required')
    })

    it('denies user without trip_access', async () => {
      const headers = await getUserAuthHeader(noAccessUserId, 'noone@test.com')
      const res = await app.request(`/trips/${testTripId}/edit`, {
        method: 'POST',
        headers
      })
      expect(res.status).toBe(403)
    })
  })

  describe('checkTripAccess with custom extractor', () => {
    it('extracts trip ID from custom param name', async () => {
      const headers = await getUserAuthHeader(viewerUserId, 'viewer@test.com')
      const res = await app.request(`/custom/${testTripId}/view`, { headers })
      expect(res.status).toBe(200)
    })

    it('returns 400 if trip ID not found', async () => {
      const headers = await getUserAuthHeader(viewerUserId, 'viewer@test.com')
      // Manually create request that will fail extraction
      const appBad = new Hono<AuthEnv>()
      appBad.get('/test', checkTripAccess('viewer', () => ''), (c) => c.json({ success: true }))
      const res = await appBad.request('/test', { headers })
      expect(res.status).toBe(400)
    })
  })
})
```

**Acceptance Criteria:**
- [ ] All tests pass: `pnpm test api/src/middleware/auth.test.ts`
- [ ] Tests cover admin bypass behavior
- [ ] Tests cover role hierarchy (editor can view, viewer cannot edit)
- [ ] Tests cover 401 (no auth), 403 (no access), 400 (missing trip ID)
- [ ] Tests verify custom trip ID extraction
- [ ] Database cleanup prevents test pollution
- [ ] Test data uses realistic UUID format

---

## Testing Strategy

Tests are included in Commit 4 following TDD principles:

- **Unit tests:** Middleware logic (role hierarchy, admin bypass)
- **Integration tests:** Database queries in `userHasTripAccess` helper
- **Edge cases:** Missing auth, missing trip ID, non-existent trip

Manual testing after all commits:
1. Run schema against fresh database
2. Verify types compile
3. Run full test suite: `pnpm test`
4. Check type safety: `pnpm type-check`

## Verification Checklist

Before PR creation:
- [ ] All commits completed and reviewed
- [ ] Full test suite passes: `pnpm test`
- [ ] Type check passes: `pnpm type-check`
- [ ] Lint passes: `pnpm lint`
- [ ] Schema is idempotent (can run multiple times)
- [ ] Existing `is_public` and `access_token_hash` columns remain in trips table
- [ ] Foreign key constraints use appropriate CASCADE/SET NULL
- [ ] Middleware follows existing auth patterns

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Schema migration fails on existing databases | Use idempotent `CREATE TABLE IF NOT EXISTS` and `DO $$ BEGIN` blocks |
| Performance impact from trip_access queries | Add indexes on user_id, trip_id, and composite (user_id, trip_id) |
| Breaking existing trip access logic | Keep `is_public` and `access_token_hash` until issue #162 |
| Middleware doesn't handle missing user context | Return 401 if `c.get('user')` is undefined |
| Role hierarchy confusing | Document clearly: editor > viewer, admins bypass all |

## Open Questions

None - requirements are clear from issue specification.

## Notes

- **Deferred:** Removing `is_public` and `access_token_hash` from trips table (issue #162)
- **Deferred:** Invite creation/acceptance API endpoints (issue #156)
- **Deferred:** Frontend UI for invites (issue #157)

This commit establishes the foundation. Subsequent issues will build on these tables and middleware.
